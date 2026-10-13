// =============================================================================
// MIGRATION SCRIPT (OPTIMIZED): Jobs:Items — Populate parsed name fields
// =============================================================================
//
// WHAT THIS SCRIPT DOES
// ---------------------------------------------------------------------------
// Parses the free-text `name` field on every item and writes seven structured
// fields (lift, floor, type, height, length, boardSetup, material) back onto:
//
//   • Jobs:Items              — the canonical item documents
//   • Jobs:Sections           — nested pricedItem snapshots (camelCase + PascalCase)
//   • ActiveWork:ActiveWorkRecords — nested PricedItem snapshots (PascalCase)
//   • Handovers:Handovers     — nested PricedItem snapshots (PascalCase)
//
// PHASE 0a — CLEAR LOOKUP COLLECTIONS
//   Deletes all existing documents from the seven PIC lookup collections
//   (Jobs:ItemLifts, Jobs:ItemFloors, Jobs:ItemTypes, Jobs:ItemHeights,
//    Jobs:ItemLengths, Jobs:ItemBoardSetups, Jobs:ItemMaterials) so they can
//   be rebuilt cleanly.
//
// PHASE 0b — SEED LOOKUP COLLECTIONS
//   Aggregates every unique (teamName, catalogueId, parsedValue) combination
//   from Jobs:Items, then inserts one reference document per unique value into
//   each lookup collection. Only teams present in Jobs:Teams are seeded.
//   Each inserted document contains: { _id, teamName, name, catalogue,
//   isDeleted, createdDate, creator }.
//
// PHASE 1 — MIGRATE Jobs:Items
//   Groups items by (teamName, name) and fires one updateMany per group,
//   writing { lift, floor, type, height, length, boardSetup, material } as
//   ObjectId-reference objects onto each matched item document.
//   Documents where all seven fields are already set are skipped (idempotent).
//
// PHASE 2 — MIGRATE Jobs:Sections
//   For each unique pricedItem._id found in Jobs:Sections, fires an updateMany
//   with arrayFilters to patch the nested pricedItem/PricedItem snapshot in
//   place — both camelCase and PascalCase variants are handled.
//
// PHASE 3 — MIGRATE ActiveWork:ActiveWorkRecords
//   Aggregates distinct (TeamName, PricedItem.Name) pairs still missing any of
//   the seven fields, then fires one updateMany per pair using arrayFilters on
//   PricedItem.Name to update the nested PascalCase snapshot.
//
// PHASE 4 — MIGRATE Handovers:Handovers
//   Same strategy as Phase 3, applied to the Handovers collection.
//
// ---------------------------------------------------------------------------
// Optimizations vs. the original:
//   1. Phase 1 groups by (teamName, name) via aggregation → one updateMany per
//      unique pair instead of one updateOne per document.
//   2. Phases 2–4 iterate unique pricedItem._ids and use arrayFilters, so a
//      single updateMany can patch every containing document at once — no more
//      reading/rewriting entire nested arrays in JS.
//   3. PIC lookup cache is team-scoped (`${teamName}::${name}` key).
//   4. Idempotency: every phase filters out documents / array elements whose
//      target fields are already set. Re-running the script is safe — any
//      already-touched field is left alone.
//
// Prerequisite indexes (create once before running):
//   db['Jobs:Items'].createIndex({ teamName: 1, name: 1 });
//   db['Jobs:Sections'].createIndex({ 'items.pricedItem._id': 1 });
//   db['Jobs:Sections'].createIndex({ 'Items.PricedItem._id': 1 });
//   db['ActiveWork:ActiveWorkRecords'].createIndex({ 'operationalGroups.items.pricedItem._id': 1 });
//   db['ActiveWork:ActiveWorkRecords'].createIndex({ 'OperationalGroups.Items.PricedItem._id': 1 });
//   db['Handovers:Handovers'].createIndex({ 'operationalGroups.items.pricedItem._id': 1 });
//   db['Handovers:Handovers'].createIndex({ 'OperationalGroups.Items.PricedItem._id': 1 });
//
// Run with : mongosh <connection-string> 04-migrate-items-name-fields.optimized.js
// =============================================================================

// ---------------------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------------------
const ITEMS_COLLECTION       = 'Jobs:Items';
const SECTIONS_COLLECTION    = 'Jobs:Sections';
const ACTIVE_WORK_COLLECTION = 'ActiveWork:ActiveWorkRecords';
const HANDOVERS_COLLECTION   = 'Handovers:Handovers';
const BATCH_SIZE             = 100;

const LOOKUP_COLLECTIONS = {
  floors:      'Jobs:ItemFloors',
  types:       'Jobs:ItemTypes',
  heights:     'Jobs:ItemHeights',
  lengths:     'Jobs:ItemLengths',
  boardSetups: 'Jobs:ItemBoardSetups',
  materials:   'Jobs:ItemMaterials',
  lifts:       'Jobs:ItemLifts',
};

// "field missing OR null" — the idempotency sentinel used everywhere.
const MISSING = { $in: [null] };
const FIELD_KEYS_CAMEL  = ['floor','type','height','length','boardSetup','material','lift'];
const FIELD_KEYS_PASCAL = ['Floor','Type','Height','Length','BoardSetup','Material','Lift'];

// team-scoped: key = `${teamName}::${name}` → _id
const lookupCaches = {};

// Populated during Phase 1: key = itemId.toString() → { refs, teamName }
const parsedCache = {};

// ---------------------------------------------------------------------------
// CLEAR LOOKUP COLLECTIONS
// ---------------------------------------------------------------------------
function clearLookupCollections() {
  sep();
  info('PHASE 0a — CLEAR LOOKUP COLLECTIONS');
  sep();
  for (const [key, collectionName] of Object.entries(LOOKUP_COLLECTIONS)) {
    const result = db.getCollection(collectionName).deleteMany({});
    info(`  ${key} (${collectionName}): deleted ${result.deletedCount} document(s)`);
  }
  sep();
}

// ---------------------------------------------------------------------------
// SEED LOOKUP COLLECTIONS
// Aggregates unique (teamName, name) pairs from Jobs:Items, parses each name,
// and inserts one { teamName, name } document per unique (teamName, fieldValue)
// into the corresponding lookup collection.
// Only teams that exist in Jobs:Teams are seeded.
// ---------------------------------------------------------------------------
function seedLookupCollections() {
  sep();
  info('PHASE 0b — SEED LOOKUP COLLECTIONS from Jobs:Items × Jobs:Teams × Jobs:StockItemCatalogues');
  sep();

  // Load valid team IDs from Jobs:Teams (_id is the teamName key used everywhere)
  const validTeams = new Set();
  db.getCollection('Jobs:Teams').find({}, { _id: 1 }).forEach((doc) => {
    const teamName = String(doc._id);
    validTeams.add(teamName);
    info(`  Team loaded: "${teamName}"`);
  });
  info(`  Loaded ${validTeams.size} team(s) from Jobs:Teams`);

  // Load all catalogues from Jobs:StockItemCatalogues — id → { _id, name } ref
  const catalogueMap = {};
  db.getCollection('Jobs:StockItemCatalogues').find({}, { _id: 1, name: 1 }).forEach((doc) => {
    catalogueMap[doc._id.toString()] = { _id: doc._id, name: doc.name };
    info(`  Catalogue loaded: "${doc.name}" (${doc._id})`);
  });
  info(`  Loaded ${Object.keys(catalogueMap).length} catalogue(s) from Jobs:StockItemCatalogues`);

  // Accumulate unique (teamName, catalogueId, value) per field key
  const pending = {};
  for (const key of Object.keys(LOOKUP_COLLECTIONS)) pending[key] = new Map();

  const totalItems = db.getCollection(ITEMS_COLLECTION).countDocuments({
    name: { $exists: true, $type: 'string', $ne: '' },
  });
  info(`  Aggregating ${totalItems} item(s) from ${ITEMS_COLLECTION} — this may take a while...`);

  let groupsScanned = 0;
  let groupsSkipped = 0;
  const LOG_EVERY      = 500;
  const skippedTeams   = {};   // teamName → count of skipped groups

  db.getCollection(ITEMS_COLLECTION).aggregate([
    { $match: { name: { $exists: true, $type: 'string', $ne: '' } } },
    { $group: { _id: { teamName: '$teamName', name: '$name', catalogueId: '$catalogue._id' }, catalogue: { $first: '$catalogue' } } },
  ], { allowDiskUse: true }).forEach((g) => {
    groupsScanned++;
    const { teamName, name, catalogueId } = g._id;
    if (!validTeams.has(String(teamName || ''))) {
      groupsSkipped++;
      const key = String(teamName || '∅(null)');
      skippedTeams[key] = (skippedTeams[key] || 0) + 1;
      if (groupsScanned % LOG_EVERY === 0)
        info(`  ... ${groupsScanned} groups scanned, ${groupsSkipped} skipped (unknown team), pending: floors=${pending.floors.size} types=${pending.types.size} heights=${pending.heights.size} lengths=${pending.lengths.size} boardSetups=${pending.boardSetups.size} materials=${pending.materials.size} lifts=${pending.lifts.size}`);
      return;
    }

    const raw = parsedFields(name);
    const fieldMap = {
      floors:      raw.floor,
      types:       raw.type,
      heights:     raw.height,
      lengths:     raw.length,
      boardSetups: raw.boardSetup,
      materials:   raw.material,
      lifts:       raw.lift,
    };

    const catIdStr = catalogueId ? catalogueId.toString() : '∅';
    const catalogueRef = catalogueId ? (catalogueMap[catIdStr] || null) : null;
    for (const [fieldKey, value] of Object.entries(fieldMap)) {
      if (!value) continue;
      const k = `${teamName}::${catIdStr}::${value}`;
      if (!pending[fieldKey].has(k)) {
        pending[fieldKey].set(k, { teamName, name: value, catalogue: catalogueRef });
      }
    }

    if (groupsScanned % LOG_EVERY === 0)
      info(`  ... ${groupsScanned} groups scanned, ${groupsSkipped} skipped (unknown team), pending: floors=${pending.floors.size} types=${pending.types.size} heights=${pending.heights.size} lengths=${pending.lengths.size} boardSetups=${pending.boardSetups.size} materials=${pending.materials.size} lifts=${pending.lifts.size}`);
  });

  info(`  Aggregate complete: ${groupsScanned} distinct (teamName, name) group(s) scanned, ${groupsSkipped} skipped.`);
  info(`  Values accumulated — floors: ${pending.floors.size}  types: ${pending.types.size}  heights: ${pending.heights.size}  lengths: ${pending.lengths.size}  boardSetups: ${pending.boardSetups.size}  materials: ${pending.materials.size}  lifts: ${pending.lifts.size}`);

  if (groupsSkipped > 0) {
    info(`  Skipped teams breakdown (${Object.keys(skippedTeams).length} distinct team name(s) not found in Jobs:Teams):`);
    Object.entries(skippedTeams)
      .sort((a, b) => b[1] - a[1])   // most-skipped first
      .forEach(([team, count]) => info(`    "${team}": ${count} group(s) skipped`));
  }

  // Bulk-insert into each lookup collection
  const now = new Date();
  for (const [fieldKey, collectionName] of Object.entries(LOOKUP_COLLECTIONS)) {
    const docs = Array.from(pending[fieldKey].values()).map((d) => ({
      _id: new ObjectId(),
      teamName: d.teamName,
      name: d.name,
      catalogue: d.catalogue,
      isDeleted: false,
      createdDate: now,
      creator: null,
    }));
    if (docs.length === 0) {
      info(`  ${fieldKey} (${collectionName}): nothing to insert`);
      continue;
    }
    db.getCollection(collectionName).insertMany(docs, { ordered: false });
    info(`  ${fieldKey} (${collectionName}): inserted ${docs.length} document(s)`);
  }
  sep();
}

// ---------------------------------------------------------------------------
// PIC LOOKUP CACHES (team-scoped)
// ---------------------------------------------------------------------------
function cacheKey(teamName, name) {
  return `${teamName || '∅'}::${name}`;
}

function buildLookupCaches() {
  info('Building team-scoped PIC lookup caches...');
  for (const [key, collectionName] of Object.entries(LOOKUP_COLLECTIONS)) {
    const cache = {};
    db.getCollection(collectionName).find({}).forEach((doc) => {
      const k = cacheKey(doc.teamName, doc.name);
      if (!cache[k]) cache[k] = doc._id;
    });
    lookupCaches[key] = cache;
    info(`  ${key}: ${Object.keys(cache).length} entries loaded`);
  }
  sep();
}

function toRef(fieldKey, name, teamName) {
  if (!name) return null;
  if (!lookupCaches[fieldKey]) lookupCaches[fieldKey] = {};
  const cache = lookupCaches[fieldKey];
  const key   = cacheKey(teamName, name);
  let id = cache[key];

  if (!id) {
    // Parsed value has no lookup document yet — create it on demand so the ref
    // is valid when we write it back to the main collections.
    const collectionName = LOOKUP_COLLECTIONS[fieldKey];
    id = new ObjectId();
    db.getCollection(collectionName).insertOne({
      _id: id,
      teamName,
      name,
      catalogue:   null,
      isDeleted:   false,
      createdDate: new Date(),
      creator:     null,
    });
    info(`  toRef(${fieldKey}): inserted missing { teamName="${teamName}", name="${name}" } into ${collectionName}`);
    // Cache the new id so subsequent items with the same team+value reuse it.
    cache[key] = id;
  }

  return { _id: id, name };
}

// ---------------------------------------------------------------------------
// OPTIONS (unchanged — trimmed here for brevity; paste the originals back)
// ---------------------------------------------------------------------------
const TYPE_OPTIONS = [
  'Lift Access Scaffold','Access Scaffold','Floor Access Scaffold',
  'Lift Ladder Tower','Ladder Tower','Ladder Stage',
  'Access Up and Over Access',
  'Staircase Up to 1.8m in Height','Staircase','Intermediate Level Staircase',
  'Base Out Off Upper Level Slab Staircase','Access Staircase',
  'Staircase With Double Standards',
  '9 Board Wide Loading Bay','9 Board Wide Freestanding Loading Bay',
  '7 Board Wide Loading Bay',
  'Multi Access Loading Bay Up to 1.8m in Height',
  'Freestanding Multi Access Loading Bay Up to 1.8m in Height',
  'Skip Loading Bay','Multi Access Loading Skip Bay Up to 1.8m in Height',
  'Cantilevered Loading Bay','Bricklayers Adaption to Cantilevered Loading Bay',
  'Hoist Tower','Hoist Access Ramp','Freestanding Hoist Tower','Hoist Tie Adaption',
  'Steel Ladder Beams Built into Scaffold',
  'Steel Ladder Beams Built Added to Existing Scaffold',
  '450 Beams Built into Scaffold','450 Beams Built Added to Existing Scaffold',
  '780 Beams Built into Scaffold','780 Beams Built Added to Existing Scaffold',
  '1.3m HD Asterix Beams Built into Scaffold',
  '1.3m HD Asterix Beams Added to Existing Scaffold',
  'TG20 2 Bay Beamed Bridge (Single Beams)',
  'TG20 3 Bay Beamed Bridge (Single Beams)',
  'Designed Cantilevered Beamwork','Designed Beamed Bridge',
  'Beamwork Above Protruding Balcony',
  'Freestanding Double Handrail to Rake of External Gables',
  'Boarded Infill to Perimeter Openings','Boarded Infill to Opening Reveals',
  'Handrail for Roofer','and 4th Handrail for Roofer',
  'High Level Tied or Rakered Handrail',
  'Interim Bricklayers Adaption',
  'Intermediate Level Interim Bricklayers Adaption',
  'Interim Bricklayers Adaption (Before Gallows)',
  'Intermediate Level Interim Bricklayers Adaption (Before Gallows)',
  'Strike and Re-Erect Structural Lift for Bricklayer',
  'Strike and Re-Erect Structural Lift Following Bricklayer',
  'Reinstate Transoms to Floor Level from Interim Lift Below',
  'Reinstate Transoms to Floor Level from Floor Level Below',
  'Rainwater Pipe Adaption','Masonry Support Gallows Bracket Adaption',
  'Balcony Adaption',
  'Remove Inside Board, Retract Transoms & Install Handrail',
  'Scaffold Tie Adjustment','Scaffold Ringbolt Tie Adjustment',
  'Reinstate Perimeter Scaffold','Reinstate Forklift Loading Bay',
  'Canti-Deck Infill Revisit (Perimeter Scaffold)',
  'Canti-Deck Infill Revisit (Interim Bricklayers Adaption)',
  'Canti-Deck Infill Revisit (Gallows Bracket Bricklayers Adaption)',
  'Lift Birdcage','Birdcage',
  'Staircase Access Through Stair Void','Ladder Access Through Stair Void',
  'Stairwell','Sacrifical Joist Support',
  'Lift Pit Scaffold','Lift to Lift Shaft','Lift Shaft',
  'Lift to Internal Shaft','Internal Shaft',
  'Porch Scaffold','Bay Window Scaffold','Dormer Window Scaffold',
  '1 Storey Buttress Scaffold','2 Storey Buttress Scaffold',
  'Protective Fan Over Doorway (Houses)',
  'Single Boarded Protective Fan (Houses)',
  'Double Boarded Protective Fan (Houses)',
  'Protective Fan Over Doorway (Apartments)',
  'Single Boarded Protective Fan (Apartments)',
  'Double Boarded Protective Fan (Apartments)',
  'Double Board & Polythene Infill 4+2 Boards',
  'Double Board & Polythene Infill 5+2 Boards',
  'Double Board & Polythene Infill 4+3 Boards',
  'Double Board & Polythene Infill 5+3 Boards',
  'Boarded Access Ramp to Doorways',
  'Bin Chutes - Initial Install','Bin Chutes - Lift Extension',
  'Bin Chutes - Floor Extension',
  'Tube & Fitting Temporary Roof','Proprietary Temporary Roof',
  'Freestanding Propping of Floor',
  'Daywork Labour (On Site) Gang of 2','Daywork Labour (Call Out) Gang of 2',
  'Bespoke Item',
  'Timber Rack','Truss Rack Fixed to Scaffold','Freestanding Truss Rack',
  'Lintel Rack','Independent Sheeting Frame',
  'Sheeting for Proprietary Temporary Roof (Purchase Only)',
  'Scaff-Gap (or Similar) Fix Only','Scaff-Gap (or Similar) Supply & Fix',
  'Protective Hi-Vis Foam Sleeves',
  'Heras Fencing (Install Only)','Heras Fencing (Supply & Install)',
  'Mini Catch Fan (Safety Nets) (Install Only)',
  'Mini Catch Fan (Safety Nets) (Supply & Install)',
  'Mini Catch Fan (Safety Nets) (Strike & Move)',
  'Mini Catch Fan (Safety Nets) (Removal Only)',
  'Working Site Supervisor','Non Working Site Supervisor',
  'Visiting Manager','CPCS Banksman',
  'Manual Distribution of Material',
  '7 Day Scaffold Inspection','Site Safety Audit','Tie Testing',
  'Party Independent Scaffold Inspection','External Design Fees',
  'Transport for Labour (Company Vehicles)',
  'Transport for Labour (Public Transport)',
  'Transport for Labour (Private Mileage Allowance)',
  'Transport for Visiting Managers Transport',
  'Transport for Weekly Scaffolding Inspections',
  'Transport for Safety Audits','Transport for Tie Testing Visits',
  'Parking','Congestion Charges (Company Vehicles / Private Vehicles)',
  'Toll Charges','Site Based HSE Consumables',
  'Replacement of Stock (Based On % Of Stock Value)',
  'P&L Insurance (Based On % Of Labour Value)',
  'Management Charge',
  'Third Party Hoarding','Third Party Lighting','Third Party Scaffold Alarm',
  'Third Party Scaffold Pavement Licence',
  'Site Forklift','Site Hoist','Site Crane',
  'Shear Ties (Supply & Install)',
  'Beamwork Supporting Towers (Floor Extension)',
  'Reinstate Crane Loading Bay',
  'Freestanding Triple Handrail to Rake of External Gables',
  'Storey Scaffold','Storey Tower','Storage/Loading Tower',
  'Gable Lift Scaffold (2m Freestanding)','2 Storey Ladder Access',
];

const MATERIAL_OPTIONS = [
  'Steel','Timber','Fire Retardant Debris Netting',
  'Exterior Plywood','Wire Mesh Plywood',
];

// ---------------------------------------------------------------------------
// PARSER HELPERS (unchanged)
// ---------------------------------------------------------------------------
function normalize(value) {
  return value.toLowerCase()
    .replace(/\bup\s+to\b/g, 'upto')
    .replace(/[(),]/g, ' ')
    .replace(/\s*\+\s*/g, '+')
    .replace(/\s+/g, ' ')
    .trim();
}

function findBestMatch(normalizedTitle, options) {
  return [...options]
    .sort((a, b) => b.length - a.length)
    .find(option => normalizedTitle.includes(normalize(option))) || null;
}

function getItemTagsAndFilters(itemTitle, options) {
  const typeOptions     = options.typeOptions     || [];
  const materialOptions = options.materialOptions || [];
  const title           = (itemTitle || '').trim();
  const normalizedTitle = normalize(title);

  const result = { floor:null, type:null, height:null, length:null, boardSetup:null, material:null, lift:null };

  // Match type first so its span can be excluded from secondary floor/lift checks.
  // Without this, mid-string regex runs against the full title and picks up
  // keywords that are structurally part of the type name (e.g. "Interim Lift"
  // inside "Reinstate Transoms to Floor Level from Interim Lift Below").
  result.type = findBestMatch(normalizedTitle, typeOptions);

  // Strip matched type from the normalized title so floor/material searches are
  // type-aware. Stripping on the normalized level avoids mismatches caused by
  // normalize() transforming the title differently from the raw type string
  // (e.g. "Upto" in the title vs "Up to" in the type option).
  const normalizedTitleWithoutType = result.type
    ? normalizedTitle.replace(normalize(result.type), '').replace(/\s+/g, ' ').trim()
    : normalizedTitle;

  // Lift: mirrors script 01 pattern — ordinals and named floors before "Lift".
  // Runs on full title so "1st Lift Birdcage" captures lift before type strips "Lift Birdcage".
  const liftMatch = title.match(
    /(?<![\w-])(\d+(?:st|nd|rd|th)|Ground|Upper Ground|Lower Ground|Basement|Mezzanine|Roof|Podium|Parapet)\s+Lift(?![\w-])/i
  );
  if (liftMatch) result.lift = liftMatch[1].trim();

  // Floor: mirrors script 01 pattern — only "Floor" suffix, no Level/Slab/Interim.
  // Runs on normalizedTitleWithoutType so type-internal phrases cannot false-match.
  const floorMatch = normalizedTitleWithoutType.match(
    /(?<![\w-])(\d+(?:st|nd|rd|th)|Ground|Upper Ground|Lower Ground|Basement|Mezzanine|Roof|Podium|Parapet)\s+floor(?![\w-])/i
  );
  if (floorMatch) result.floor = floorMatch[1].trim();

  const heightMatch = title.match(
    /(Upto\s+\d+(?:\.\d+)?m|Up\s+to\s+\d+(?:\.\d+)?m|\d+(?:\.\d+)?m\s+to\s+\d+(?:\.\d+)?m)\s+in\s+Height/i
  );
  if (heightMatch) result.height = heightMatch[1].replace(/\bUpto\b/i, 'Up to').trim();

  const lengthMatch = title.match(/(up\s+to\s+\d+(?:\.\d+)?m|\d+(?:\.\d+)?m)\s+in\s+Length/i);
  if (lengthMatch) {
    result.length = lengthMatch[1].trim();
  } else {
    const dimensionMatch = title.match(/(\d+(?:\.\d+)?m\s*x\s*\d+(?:\.\d+)?m)/i);
    if (dimensionMatch) result.length = dimensionMatch[1].trim();
  }

  const boardParts = [];
  // FIX 3: Removed the broad /\b(\d+\+\d+)\b/ fallback — it matched any N+N
  // pattern anywhere in the name (e.g. inside type or dimension strings).
  // The primary regex (requiring "Boards" after) is sufficient.
  const boardMatch = title.match(/\b(\d+\+\d+)\s+Boards\b/i);
  if (boardMatch) boardParts.push(boardMatch[1]);
  if (!boardMatch && /Fully\s+Boarded/i.test(title))   boardParts.unshift('Fully');
  if (/with\s+Floor\s+Levels\s+Boarded/i.test(title)) boardParts.push('with Floor Levels');
  if (boardParts.length) result.boardSetup = boardParts.join(', ');

  result.material = findBestMatch(normalizedTitleWithoutType, materialOptions);

  return result;
}

function parsedFields(name) {
  return getItemTagsAndFilters(name, { typeOptions: TYPE_OPTIONS, materialOptions: MATERIAL_OPTIONS });
}

function rawToRefs(raw, teamName) {
  return {
    floor:      toRef('floors',      raw.floor,      teamName),
    type:       toRef('types',       raw.type,       teamName),
    height:     toRef('heights',     raw.height,     teamName),
    length:     toRef('lengths',     raw.length,     teamName),
    boardSetup: toRef('boardSetups', raw.boardSetup, teamName),
    material:   toRef('materials',   raw.material,   teamName),
    lift:       toRef('lifts',       raw.lift,       teamName),
  };
}

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof ObjectId) return value;
  try { return ObjectId(value.toString()); } catch (_e) { return null; }
}

// ---------------------------------------------------------------------------
// LOGGING
// ---------------------------------------------------------------------------
function log(level, msg) { print(`[${new Date().toISOString()}] [${level.toUpperCase().padEnd(5)}] ${msg}`); }
const info  = (m) => log('INFO',  m);
const warn  = (m) => log('WARN',  m);
const error = (m) => log('ERROR', m);
const sep   = ()  => info('─'.repeat(72));

// ---------------------------------------------------------------------------
// BULK FLUSH HELPER
// ---------------------------------------------------------------------------
function buildFlushBatch(collection) {
  let bulkOps = [];
  const stats = { matched: 0, modified: 0, bulkErrors: 0, batches: 0 };

  function flush() {
    if (bulkOps.length === 0) return;
    info(`  ► Flushing ${bulkOps.length} op(s) into "${collection}" ...`);
    try {
      const result = db.getCollection(collection).bulkWrite(bulkOps, { ordered: false });
      stats.matched  += result.matchedCount  || 0;
      stats.modified += result.modifiedCount || 0;
      stats.batches++;
      info(`    DONE → matched: ${result.matchedCount || 0}  modified: ${result.modifiedCount || 0}`);
    } catch (e) {
      error(`    FAILED → ${e.message}`);
      stats.bulkErrors++;
      stats.batches++;
    }
    bulkOps = [];
  }

  function push(op) {
    bulkOps.push(op);
    if (bulkOps.length >= BATCH_SIZE) flush();
  }
  return { push, flush, stats };
}


// ===========================================================================
// PHASE 1 — Jobs:Items
// Group by (teamName, name); one updateMany per group; filter guarantees
// idempotency (already-set docs are skipped).
// ===========================================================================
function migrateItems() {
  sep();
  info('PHASE 1 — MIGRATE Jobs:Items (grouped updateMany)');
  sep();

  const stats = { groups: 0, idsQueued: 0 };
  const { push, flush, stats: bulkStats } = buildFlushBatch(ITEMS_COLLECTION);

  const baseMatch = {
    name: { $exists: true, $type: 'string', $ne: '' },
    // Match docs where AT LEAST ONE of the 6 fields is still null — handles
    // partially-migrated items (e.g. floor set but type still null).
    $or: FIELD_KEYS_CAMEL.map(k => ({ [k]: MISSING })),
  };

  const cursor = db.getCollection(ITEMS_COLLECTION).aggregate([
    { $match: baseMatch },
    { $group: {
        _id: { teamName: '$teamName', name: '$name' },
        ids: { $push: '$_id' },
    }},
  ], { allowDiskUse: true });

  cursor.forEach((g) => {
    stats.groups++;
    const { teamName, name } = g._id;
    const parsed = parsedFields(name);
    const refs   = rawToRefs(parsed, teamName);

    info(`  "${name}" → lift=${parsed.lift||'-'} floor=${parsed.floor||'-'} type=${parsed.type||'-'} height=${parsed.height||'-'} length=${parsed.length||'-'} boardSetup=${parsed.boardSetup||'-'} material=${parsed.material||'-'}`);

    // Seed parsedCache for Phases 2–4 (keyed by itemId string → { refs, teamName, name })
    g.ids.forEach((id) => {
      parsedCache[id.toString()] = { refs, teamName, name };
      stats.idsQueued++;
    });

    // Only $set fields that were actually parsed — never overwrite an existing
    // value with null, and never touch a field the parser found nothing for.
    const setFields = {};
    for (const k of FIELD_KEYS_CAMEL) {
      if (refs[k] !== null) setFields[k] = refs[k];
    }
    if (Object.keys(setFields).length === 0) return;

    push({
      updateMany: {
        filter: {
          _id: { $in: g.ids },
          // Idempotent: only touch docs that still have at least one null field.
          $or: Object.keys(setFields).map(k => ({ [k]: MISSING })),
        },
        update: { $set: setFields },
      }
    });
  });

  flush();

  sep();
  info('Phase 1 complete:');
  info(`  Distinct groups  : ${stats.groups}`);
  info(`  Items queued     : ${stats.idsQueued}`);
  info(`  Matched          : ${bulkStats.matched}`);
  info(`  Modified         : ${bulkStats.modified}`);
  info(`  Batches          : ${bulkStats.batches}`);
  info(`  BulkErrors       : ${bulkStats.bulkErrors}`);
  sep();

  // Also warm the cache for items that were ALREADY migrated (phase 1 idempotent
  // match excluded them) — Phases 2–4 still need their parsed refs.
  warmCacheForAlreadyMigrated();

  return bulkStats.bulkErrors;
}

function warmCacheForAlreadyMigrated() {
  info('  Warming parsedCache for previously-migrated items...');
  let warmed = 0;
  // Only fetch items that already have at least one field set — avoids a full
  // collection scan. Un-migrated items not yet in parsedCache are irrelevant here.
  const alreadyMigratedFilter = {
    name: { $exists: true, $type: 'string', $ne: '' },
    $or: FIELD_KEYS_CAMEL.map(k => ({ [k]: { $exists: true, $ne: null } })),
  };
  db.getCollection(ITEMS_COLLECTION)
    .find(
      alreadyMigratedFilter,
      { _id: 1, name: 1, teamName: 1, floor: 1, type: 1, height: 1, length: 1, boardSetup: 1, material: 1, lift: 1 }
    )
    .batchSize(2000)
    .forEach((doc) => {
      const key = doc._id.toString();
      if (parsedCache[key]) return;
      // Derive refs directly from the doc (already migrated) to avoid re-parsing.
      const refs = {
        floor: doc.floor, type: doc.type, height: doc.height,
        length: doc.length, boardSetup: doc.boardSetup, material: doc.material, lift: doc.lift,
      };
      parsedCache[key] = { refs, teamName: doc.teamName, name: doc.name };
      warmed++;
    });
  info(`  parsedCache warmed with ${warmed} pre-existing entries.`);
}

// ===========================================================================
// NESTED-ARRAY PHASES (2–4) — arrayFilters strategy
//
// Phase 2 (Jobs:Sections): pricedItem has _id → match by pricedItem._id.
// Phases 3–4 (ActiveWork, Handovers): PricedItem is a snapshot with no _id,
//   PascalCase keys only, document-level TeamName — match by PricedItem.Name.
// ===========================================================================

// Phase 2 — Jobs:Sections: items[].pricedItem  (has _id, camel+pascal)
function migrateSections() {
  sep();
  info('PHASE 2 — MIGRATE Jobs:Sections (arrayFilters, idempotent)');
  sep();
  return updateNestedById(SECTIONS_COLLECTION, {
    camel:  { rootKey: 'items', piKey: 'pricedItem' },
    pascal: { rootKey: 'Items', piKey: 'PricedItem' },
    depth: 1,
  });
}

// Phase 3 — ActiveWork:ActiveWorkRecords: OperationalGroups[].Items[].PricedItem
// PricedItem carries no _id; matched by Name. PascalCase only.
function migrateActiveWork() {
  sep();
  info('PHASE 3 — MIGRATE ActiveWork:ActiveWorkRecords (arrayFilters, idempotent)');
  sep();
  return updateNestedByName(ACTIVE_WORK_COLLECTION, {
    rootKey:   'OperationalGroups',
    innerKey:  'Items',
    piKey:     'PricedItem',
    nameField: 'Name',
    teamKey:   'TeamName',
  });
}

// Phase 4 — Handovers:Handovers (same shape as Phase 3)
function migrateHandovers() {
  sep();
  info('PHASE 4 — MIGRATE Handovers:Handovers (arrayFilters, idempotent)');
  sep();
  return updateNestedByName(HANDOVERS_COLLECTION, {
    rootKey:   'OperationalGroups',
    innerKey:  'Items',
    piKey:     'PricedItem',
    nameField: 'Name',
    teamKey:   'TeamName',
  });
}

// ---------------------------------------------------------------------------
// updateNestedById — for collections where pricedItem has an _id (Jobs:Sections)
// ---------------------------------------------------------------------------
/**
 * Issues one updateMany per (pricedItemId, casing). Idempotent: arrayFilters
 * require the 6 target fields to be missing on the matched element.
 */
function updateNestedById(collection, spec) {
  const { push, flush, stats } = buildFlushBatch(collection);
  const summary = { uniquePids: 0, opsQueued: 0 };

  // Pre-fetch only the pricedItem._ids that actually exist in this collection.
  // Avoids issuing no-op updateMany calls for the vast majority of item IDs
  // that never appear in sections — typically reduces ops by 10-50×.
  info(`  Pre-fetching existing pricedItem._ids from "${collection}"...`);
  const existingPids = new Set();
  [
    `${spec.camel.rootKey}.${spec.camel.piKey}._id`,
    `${spec.pascal.rootKey}.${spec.pascal.piKey}._id`,
  ].forEach(path => {
    db.getCollection(collection).distinct(path).forEach(id => {
      if (id) existingPids.add(id.toString());
    });
  });
  info(`  Found ${existingPids.size} unique pricedItem._id(s) in "${collection}"`);

  for (const [pidStr, entry] of Object.entries(parsedCache)) {
    if (!existingPids.has(pidStr)) continue;  // skip items not referenced in this collection
    summary.uniquePids++;
    const pid = toObjectId(pidStr);
    if (!pid) continue;
    const { refs, teamName, name } = entry;
    info(`  "${name}" (_id=${pidStr})`);

    // Fire for both casings — empty-match no-ops are harmless.
    queueNestedOps(push, spec, spec.camel,  pid, teamName, refs, false, false);
    queueNestedOps(push, spec, spec.pascal, pid, teamName, refs, true,  true);
    summary.opsQueued += 2;
  }

  flush();

  sep();
  info(`${collection} complete:`);
  info(`  Unique pricedItem ids : ${summary.uniquePids}`);
  info(`  Ops queued            : ${summary.opsQueued}`);
  info(`  Matched               : ${stats.matched}`);
  info(`  Modified              : ${stats.modified}`);
  info(`  Batches               : ${stats.batches}`);
  info(`  BulkErrors            : ${stats.bulkErrors}`);
  sep();
  return stats.bulkErrors;
}

// ---------------------------------------------------------------------------
// updateNestedByName — for collections where PricedItem has no _id
//   (ActiveWork:ActiveWorkRecords, Handovers:Handovers)
// Aggregates distinct (TeamName, PricedItem.Name) combos, parses each name,
// and fires one updateMany per combo using arrayFilters on PricedItem.Name.
// Idempotency: arrayFilter also requires all 6 target fields to be missing.
// ---------------------------------------------------------------------------
function updateNestedByName(collection, spec) {
  const { rootKey, innerKey, piKey, nameField, teamKey } = spec;
  const { push, flush, stats } = buildFlushBatch(collection);

  const namePath   = `${rootKey}.${innerKey}.${piKey}.${nameField}`;
  const updateBase = `${rootKey}.$[og].${innerKey}.$[i].${piKey}`;
  const iName      = `i.${piKey}.${nameField}`;

  // setFields and anyNullClauses are built per-combo inside the forEach loop.

  // aggregate distinct (TeamName, PricedItem.Name) combos still needing migration
  const combos = db.getCollection(collection).aggregate([
    // Project only the fields used in this pipeline — sheds large unused fields
    // before the expensive double $unwind, dramatically reducing pipeline memory.
    { $project: { [teamKey]: 1, [rootKey]: 1 } },
    { $unwind: `$${rootKey}` },
    { $unwind: `$${rootKey}.${innerKey}` },
    { $match: {
      [namePath]: { $type: 'string', $ne: '' },
      // at least one of the 6 target fields is still missing → needs work
      $or: FIELD_KEYS_PASCAL.map(k => ({ [`${rootKey}.${innerKey}.${piKey}.${k}`]: MISSING })),
    }},
    { $group: {
      _id: {
        teamName: `$${teamKey}`,
        piName:   `$${namePath}`,
      },
    }},
  ], { allowDiskUse: true });

  let uniqueNames = 0;
  combos.forEach((g) => {
    uniqueNames++;
    const { teamName, piName } = g._id;
    info(`  "${piName}"`);
    const refs = rawToRefs(parsedFields(piName), teamName);

    const setFields      = {};
    const anyNullClauses = [];
    for (const k of FIELD_KEYS_PASCAL) {
      const ref = pickRef(refs, k, true);
      if (ref === null) continue;
      setFields[`${updateBase}.${k}`] = ref;
      anyNullClauses.push({ [`i.${piKey}.${k}`]: MISSING });
    }
    if (anyNullClauses.length === 0) return;

    push({
      updateMany: {
        filter: { [teamKey]: teamName, [namePath]: piName },
        update: { $set: setFields },
        arrayFilters: [
          { [`og.${innerKey}.${piKey}.${nameField}`]: piName },
          { [iName]: piName, $or: anyNullClauses },
        ],
      },
    });
  });

  flush();

  sep();
  info(`${collection} complete:`);
  info(`  Unique PricedItem names : ${uniqueNames}`);
  info(`  Matched                 : ${stats.matched}`);
  info(`  Modified                : ${stats.modified}`);
  info(`  Batches                 : ${stats.batches}`);
  info(`  BulkErrors              : ${stats.bulkErrors}`);
  sep();
  return stats.bulkErrors;
}

function queueNestedOps(push, spec, casing, pid, teamName, refs, usePascalFields, usePascalRefName) {
  const fieldKeys = usePascalFields ? FIELD_KEYS_PASCAL : FIELD_KEYS_CAMEL;
  const setObj    = {};
  const anyNullClauses = [];

  if (spec.depth === 1) {
    const { rootKey, piKey } = casing;
    for (const k of fieldKeys) {
      const ref = pickRef(refs, k, usePascalRefName);
      if (ref === null) continue;
      setObj[`${rootKey}.$[i].${piKey}.${k}`] = ref;
      anyNullClauses.push({ [`i.${piKey}.${k}`]: MISSING });
    }
    if (anyNullClauses.length === 0) return;

    const filter = { [`${rootKey}.${piKey}._id`]: pid };
    if (teamName !== undefined) filter.teamName = teamName;

    push({
      updateMany: {
        filter,
        update: { $set: setObj },
        arrayFilters: [{ [`i.${piKey}._id`]: pid, $or: anyNullClauses }],
      },
    });
  } else {
    const { rootKey, innerKey, piKey } = casing;
    for (const k of fieldKeys) {
      const ref = pickRef(refs, k, usePascalRefName);
      if (ref === null) continue;
      setObj[`${rootKey}.$[og].${innerKey}.$[i].${piKey}.${k}`] = ref;
      anyNullClauses.push({ [`i.${piKey}.${k}`]: MISSING });
    }
    if (anyNullClauses.length === 0) return;

    const filter = { [`${rootKey}.${innerKey}.${piKey}._id`]: pid };
    if (teamName !== undefined) filter.teamName = teamName;

    push({
      updateMany: {
        filter,
        update: { $set: setObj },
        arrayFilters: [
          { [`og.${innerKey}.${piKey}._id`]: pid },
          { [`i.${piKey}._id`]: pid, $or: anyNullClauses },
        ],
      },
    });
  }
}

function pickRef(refs, fieldKey, usePascalRefName) {
  // fieldKey may be either camel or pascal; refs uses camel keys.
  const camel = fieldKey.charAt(0).toLowerCase() + fieldKey.slice(1);
  const ref = refs[camel] || refs[fieldKey];
  if (!ref || typeof ref !== 'object') return ref;
  const id = ref._id || ref.Id || ref.id;
  const name = (ref.Name !== undefined) ? ref.Name : ref.name;
  if (id === undefined || name === undefined) return ref;
  return usePascalRefName ? { _id: id, Name: name } : { _id: id, name };
}

// ===========================================================================
// BOARDSETUP OVERRIDE PHASES — fix stale "Fully, X+Y" → "X+Y"
// Runs after the main phases; only rewrites items where the stored name
// differs from the newly-parsed value. Other fields are never touched.
// ===========================================================================

// Phase 1-BS: flat Jobs:Items documents
function migrateItemsBoardSetupOverride() {
  sep();
  info('PHASE 1-BS — Override stale boardSetup on Jobs:Items');
  sep();

  const { push, flush, stats } = buildFlushBatch(ITEMS_COLLECTION);
  let combosQueued = 0;

  db.getCollection(ITEMS_COLLECTION).aggregate([
    { $match: {
      name: { $exists: true, $type: 'string', $ne: '' },
      boardSetup: { $exists: true, $not: { $in: [null] } },
    }},
    { $group: { _id: { teamName: '$teamName', name: '$name' }, ids: { $push: '$_id' } } },
  ], { allowDiskUse: true }).forEach((g) => {
    const { teamName, name } = g._id;
    const parsed = parsedFields(name);
    if (!parsed.boardSetup) return;

    const ref = toRef('boardSetups', parsed.boardSetup, teamName);
    push({
      updateMany: {
        filter: { _id: { $in: g.ids }, 'boardSetup.name': { $ne: parsed.boardSetup } },
        update: { $set: { boardSetup: ref } },
      },
    });
    combosQueued++;
  });

  flush();
  sep();
  info('Phase 1-BS complete:');
  info(`  Combos queued : ${combosQueued}`);
  info(`  Matched       : ${stats.matched}`);
  info(`  Modified      : ${stats.modified}`);
  info(`  BulkErrors    : ${stats.bulkErrors}`);
  sep();
  return stats.bulkErrors;
}

// Phase 2-BS: nested pricedItem snapshots in Jobs:Sections (camel + pascal)
function overrideBoardSetupInSections() {
  sep();
  info('PHASE 2-BS — Override stale boardSetup in Jobs:Sections');
  sep();

  const { push, flush, stats } = buildFlushBatch(SECTIONS_COLLECTION);
  let combosQueued = 0;

  // Pre-fetch _ids that actually appear in this collection
  const existingPids = new Set();
  ['items.pricedItem._id', 'Items.PricedItem._id'].forEach(path => {
    db.getCollection(SECTIONS_COLLECTION).distinct(path).forEach(id => {
      if (id) existingPids.add(id.toString());
    });
  });

  for (const [pidStr, entry] of Object.entries(parsedCache)) {
    if (!existingPids.has(pidStr)) continue;
    const { teamName, name } = entry;
    const parsed = parsedFields(name);
    if (!parsed.boardSetup) continue;

    const pid   = toObjectId(pidStr);
    if (!pid) continue;

    const ref   = toRef('boardSetups', parsed.boardSetup, teamName);
    const refLC = { _id: ref._id, name: ref.name };
    const refPC = { _id: ref._id, Name: ref.name };

    // camelCase path
    push({ updateMany: {
      filter: { 'items.pricedItem._id': pid },
      update: { $set: { 'items.$[i].pricedItem.boardSetup': refLC } },
      arrayFilters: [{ 'i.pricedItem._id': pid, 'i.pricedItem.boardSetup.name': { $ne: parsed.boardSetup } }],
    }});

    // PascalCase path
    push({ updateMany: {
      filter: { 'Items.PricedItem._id': pid },
      update: { $set: { 'Items.$[i].PricedItem.BoardSetup': refPC } },
      arrayFilters: [{ 'i.PricedItem._id': pid, 'i.PricedItem.BoardSetup.Name': { $ne: parsed.boardSetup } }],
    }});

    combosQueued++;
  }

  flush();
  sep();
  info('Phase 2-BS complete:');
  info(`  Combos queued : ${combosQueued}`);
  info(`  Matched       : ${stats.matched}`);
  info(`  Modified      : ${stats.modified}`);
  info(`  BulkErrors    : ${stats.bulkErrors}`);
  sep();
  return stats.bulkErrors;
}

// Phases 3-BS / 4-BS: nested PricedItem snapshots matched by Name (no _id)
function updateNestedByNameBoardSetupOverride(collection, spec) {
  const { rootKey, innerKey, piKey, nameField, teamKey } = spec;
  const { push, flush, stats } = buildFlushBatch(collection);
  const namePath   = `${rootKey}.${innerKey}.${piKey}.${nameField}`;
  const updateBase = `${rootKey}.$[og].${innerKey}.$[i].${piKey}`;
  const iName      = `i.${piKey}.${nameField}`;

  const combos = db.getCollection(collection).aggregate([
    { $project: { [teamKey]: 1, [rootKey]: 1 } },
    { $unwind: `$${rootKey}` },
    { $unwind: `$${rootKey}.${innerKey}` },
    { $match: {
      [namePath]: { $type: 'string', $ne: '' },
      [`${rootKey}.${innerKey}.${piKey}.BoardSetup`]: { $exists: true, $not: { $in: [null] } },
    }},
    { $group: { _id: { teamName: `$${teamKey}`, piName: `$${namePath}` } } },
  ], { allowDiskUse: true });

  let uniqueNames = 0;
  combos.forEach((g) => {
    uniqueNames++;
    const { teamName, piName } = g._id;
    const parsed = parsedFields(piName);
    if (!parsed.boardSetup) return;

    const ref   = toRef('boardSetups', parsed.boardSetup, teamName);
    const bsRef = { _id: ref._id, Name: ref.name };

    push({
      updateMany: {
        filter: { [teamKey]: teamName, [namePath]: piName },
        update: { $set: { [`${updateBase}.BoardSetup`]: bsRef } },
        arrayFilters: [
          { [`og.${innerKey}.${piKey}.${nameField}`]: piName },
          { [iName]: piName, [`i.${piKey}.BoardSetup.Name`]: { $ne: parsed.boardSetup } },
        ],
      },
    });
  });

  flush();
  sep();
  info(`${collection} (BoardSetup override) complete:`);
  info(`  Unique names : ${uniqueNames}`);
  info(`  Matched      : ${stats.matched}`);
  info(`  Modified     : ${stats.modified}`);
  info(`  BulkErrors   : ${stats.bulkErrors}`);
  sep();
  return stats.bulkErrors;
}

// ===========================================================================
// ENTRY POINT
// ===========================================================================
function runMigration() {
  sep();
  info('PARSED NAME FIELDS MIGRATION (OPTIMIZED) — START');
  info('Collections: Jobs:Items → Jobs:Sections → ActiveWork → Handovers');
  sep();

  clearLookupCollections();
  seedLookupCollections();
  buildLookupCaches();

  const p1    = migrateItems();
  const p1bs  = migrateItemsBoardSetupOverride();
  const p2    = migrateSections();
  const p2bs  = overrideBoardSetupInSections();
  const p3    = migrateActiveWork();
  const p3bs  = updateNestedByNameBoardSetupOverride(ACTIVE_WORK_COLLECTION, {
    rootKey: 'OperationalGroups', innerKey: 'Items', piKey: 'PricedItem',
    nameField: 'Name', teamKey: 'TeamName',
  });
  const p4    = migrateHandovers();
  const p4bs  = updateNestedByNameBoardSetupOverride(HANDOVERS_COLLECTION, {
    rootKey: 'OperationalGroups', innerKey: 'Items', piKey: 'PricedItem',
    nameField: 'Name', teamKey: 'TeamName',
  });

  sep();
  info('FINAL SUMMARY');
  info(`  Phase 1 errors      : ${p1}`);
  info(`  Phase 1-BS errors   : ${p1bs}`);
  info(`  Phase 2 errors      : ${p2}`);
  info(`  Phase 2-BS errors   : ${p2bs}`);
  info(`  Phase 3 errors      : ${p3}`);
  info(`  Phase 3-BS errors   : ${p3bs}`);
  info(`  Phase 4 errors      : ${p4}`);
  info(`  Phase 4-BS errors   : ${p4bs}`);
  sep();

  const total = p1 + p1bs + p2 + p2bs + p3 + p3bs + p4 + p4bs;
  if (total > 0) warn(`Migration finished WITH ${total} bulk error(s).`);
  else           info('Migration finished SUCCESSFULLY with no errors.');
  sep();
}

const _scriptStart = new Date();
runMigration();
const _elapsed = ((new Date() - _scriptStart) / 1000).toFixed(2);
sep();
info(`SCRIPT  : 04-migrate-items-name-fields.optimized.js`);
info(`ELAPSED : ${_elapsed}s`);
sep();
