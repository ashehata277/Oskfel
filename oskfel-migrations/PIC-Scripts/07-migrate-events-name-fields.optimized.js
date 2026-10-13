// =============================================================================
// MIGRATION SCRIPT (OPTIMIZED): Events — Populate parsed name fields
// =============================================================================
// Optimizations vs. the original:
//   1. All phases aggregate distinct (teamName, title) combos via
//      $unwind + $group → parse once per combo → one arrayFilters updateMany
//      that sets ALL SIX fields simultaneously, instead of reading + rewriting
//      nested arrays per document.
//   2. Path variants (Data/data, OperationalGroups/operationalGroups, etc.) are
//      declared as pathSpecs. Specs matching no documents produce zero ops.
//   3. Title is resolved from any of FullName / fullName / Name / name via
//      $ifNull in the aggregation and $or in the arrayFilter.
//   4. Idempotency: arrayFilter requires ALL six target fields to be null/missing
//      on the matched element. Re-running is safe — already-set items are skipped.
//   5. Name-casing normalization (camelCase ref → PascalCase) handled as a
//      separate pipeline updateMany pass per spec (Pass B).
//   6. BATCH_SIZE raised to 500.
//
// Prerequisite indexes:
//   db['ActiveWork:Events'].createIndex({ 'Data.OperationalGroups.Items.PricedItem.Floor': 1 });
//   db['ActiveWork:Events'].createIndex({ 'Data.OperationalGroups.Items.PricedItem.FullName': 1 });
//   db['Handovers:Events'].createIndex({ 'Data.OperationalGroups.Items.PricedItem.Floor': 1 });
//   db['Handovers:Events'].createIndex({ 'Data.OperationalGroups.Items.PricedItem.FullName': 1 });
//   db['Jobs:Events'].createIndex({ 'Data.OperationalGroups.Items.PricedItem.Floor': 1 });
//
// Run with : mongosh <connection-string> 07-migrate-events-name-fields.optimized.js
// =============================================================================

const ACTIVE_WORK_EVENTS_COLLECTION = 'ActiveWork:Events';
const HANDOVERS_EVENTS_COLLECTION   = 'Handovers:Events';
const JOBS_EVENTS_COLLECTION        = 'Jobs:Events';
const BATCH_SIZE = 500;

const LOOKUP_COLLECTIONS = {
  floors:      'Jobs:ItemFloors',
  types:       'Jobs:ItemTypes',
  heights:     'Jobs:ItemHeights',
  lengths:     'Jobs:ItemLengths',
  boardSetups: 'Jobs:ItemBoardSetups',
  materials:   'Jobs:ItemMaterials',
};

// Mapping from parsed output keys → PIC cache keys → PascalCase target field names
const FIELD_DEFS = [
  { parsedKey: 'floor',      cacheKey: 'floors',      pascalKey: 'Floor'      },
  { parsedKey: 'type',       cacheKey: 'types',        pascalKey: 'Type'       },
  { parsedKey: 'height',     cacheKey: 'heights',      pascalKey: 'Height'     },
  { parsedKey: 'length',     cacheKey: 'lengths',      pascalKey: 'Length'     },
  { parsedKey: 'boardSetup', cacheKey: 'boardSetups',  pascalKey: 'BoardSetup' },
  { parsedKey: 'material',   cacheKey: 'materials',    pascalKey: 'Material'   },
];

const MISSING = { $in: [null] };  // matches null AND missing fields

// Per-team caches: lookupCaches[cacheKey][teamName][name] = _id
const lookupCaches = {};

// ---------------------------------------------------------------------------
// LOGGING
// ---------------------------------------------------------------------------
function log(level, msg) {
  print(`[${new Date().toISOString()}] [${level.toUpperCase().padEnd(5)}] ${msg}`);
}
const info  = (m) => log('INFO',  m);
const warn  = (m) => log('WARN',  m);
const error = (m) => log('ERROR', m);
const sep   = ()  => info('─'.repeat(72));

// ---------------------------------------------------------------------------
// PIC LOOKUP CACHES (per team)
// ---------------------------------------------------------------------------
function buildLookupCaches() {
  info('Building PIC lookup caches (per team)...');
  for (const [key, collectionName] of Object.entries(LOOKUP_COLLECTIONS)) {
    const cache = {};
    db.getCollection(collectionName).find({}).forEach((doc) => {
      const team = doc.teamName || doc.TeamName;
      const name = doc.name     || doc.Name;
      if (!team || !name) return;
      if (!cache[team]) cache[team] = {};
      if (!cache[team][name]) cache[team][name] = doc._id;
    });
    lookupCaches[key] = cache;
    let entries = 0;
    for (const t of Object.keys(cache)) entries += Object.keys(cache[t]).length;
    info(`  ${key}: ${Object.keys(cache).length} team(s), ${entries} entries`);
  }
  sep();
}

function toRef(cacheKey, name, teamName) {
  if (!name) return null;
  const teamCache = (lookupCaches[cacheKey] || {})[teamName] || {};
  const id = teamCache[name];
  if (!id) warn(`  toRef(${cacheKey}): no entry for "${name}" team "${teamName}" — new ObjectId`);
  return { _id: id || new ObjectId(), Name: name };
}

// ---------------------------------------------------------------------------
// PARSER (verbatim from script 04/07)
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
const MATERIAL_OPTIONS = ['Steel','Timber','Fire Retardant Debris Netting','Exterior Plywood','Wire Mesh Plywood'];

function normalize(value) {
  return value.toLowerCase()
    .replace(/\bup\s+to\b/g, 'upto').replace(/[(),]/g, ' ')
    .replace(/\s*\+\s*/g, '+').replace(/\s+/g, ' ').trim();
}
function findBestMatch(normalizedTitle, options) {
  return [...options].sort((a, b) => b.length - a.length)
    .find(o => normalizedTitle.includes(normalize(o))) || null;
}
function parsedFields(name) {
  const title = (name || '').trim();
  const nt    = normalize(title);
  const result = { floor: null, type: null, height: null, length: null, boardSetup: null, material: null };

  const floorMatch = title.match(/^(?:\s*)(\d+(?:st|nd|rd|th)|Upper Ground|Lower Ground|Ground|Basement|Mezzanine|Roof|Podium|Parapet|Interim)(?:\s+(?:Floor|Lift|Level))?/i);
  if (floorMatch) result.floor = floorMatch[1].replace(/\s+(Floor|Lift|Level)$/i, '').trim();

  const heightMatch = title.match(/(Upto\s+\d+(?:\.\d+)?m|Up\s+to\s+\d+(?:\.\d+)?m|\d+(?:\.\d+)?m\s+to\s+\d+(?:\.\d+)?m)\s+in\s+Height/i);
  if (heightMatch) result.height = heightMatch[1].replace(/\bUpto\b/i, 'Up to').trim();

  const lengthMatch = title.match(/(up\s+to\s+\d+(?:\.\d+)?m|\d+(?:\.\d+)?m)\s+in\s+Length/i);
  if (lengthMatch) { result.length = lengthMatch[1].trim(); }
  else { const dm = title.match(/(\d+(?:\.\d+)?m\sx\s\d+(?:\.\d+)?m)/i); if (dm) result.length = dm[1].trim(); }

  const boardParts = [];
  const bm = title.match(/\b(\d+\+\d+)\s+Boards\b/i) || title.match(/\b(\d+\+\d+)\b/i);
  if (bm) boardParts.push(bm[1]);
  if (/Fully\s+Boarded/i.test(title) && !bm)          boardParts.unshift('Fully');
  if (/with\s+Floor\s+Levels\s+Boarded/i.test(title)) boardParts.push('with Floor Levels');
  if (boardParts.length) result.boardSetup = boardParts.join(', ');

  result.material = findBestMatch(nt, MATERIAL_OPTIONS);
  result.type     = findBestMatch(nt, TYPE_OPTIONS);
  return result;
}

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
      const r = db.getCollection(collection).bulkWrite(bulkOps, { ordered: false });
      stats.matched  += r.matchedCount  || 0;
      stats.modified += r.modifiedCount || 0;
      stats.batches++;
      info(`    DONE → matched: ${r.matchedCount || 0}  modified: ${r.modifiedCount || 0}`);
    } catch (e) {
      error(`    FAILED → ${e.message}`);
      stats.bulkErrors++;
      stats.batches++;
    }
    bulkOps = [];
  }

  function push(op) { bulkOps.push(op); if (bulkOps.length >= BATCH_SIZE) flush(); }
  return { push, flush, stats };
}

// ===========================================================================
// PATH SPEC DEFINITIONS
//
// depth=2 : dataKey.root[].inner[].pi.<fields>
// depth=1 : dataKey.root[].pi.<fields>   (flat items under Data)
// ===========================================================================
const OG_PATH_SPECS = [
  { dataKey: 'Data', depth: 2, root: 'OperationalGroups', inner: 'Items',  pi: 'PricedItem' },
  { dataKey: 'Data', depth: 2, root: 'OperationalGroups', inner: 'Items',  pi: 'pricedItem' },
  { dataKey: 'Data', depth: 2, root: 'operationalGroups', inner: 'items',  pi: 'PricedItem' },
  { dataKey: 'Data', depth: 2, root: 'operationalGroups', inner: 'items',  pi: 'pricedItem' },
  { dataKey: 'data', depth: 2, root: 'OperationalGroups', inner: 'Items',  pi: 'PricedItem' },
  { dataKey: 'data', depth: 2, root: 'OperationalGroups', inner: 'Items',  pi: 'pricedItem' },
  { dataKey: 'data', depth: 2, root: 'operationalGroups', inner: 'items',  pi: 'PricedItem' },
  { dataKey: 'data', depth: 2, root: 'operationalGroups', inner: 'items',  pi: 'pricedItem' },
];

const JOBS_EVENTS_PATH_SPECS = [
  ...OG_PATH_SPECS,
  // sections[].items[]
  { dataKey: 'Data', depth: 2, root: 'sections',  inner: 'items',  pi: 'PricedItem' },
  { dataKey: 'Data', depth: 2, root: 'sections',  inner: 'items',  pi: 'pricedItem' },
  { dataKey: 'data', depth: 2, root: 'sections',  inner: 'items',  pi: 'PricedItem' },
  { dataKey: 'data', depth: 2, root: 'sections',  inner: 'items',  pi: 'pricedItem' },
  // Sections[].Items[] (PascalCase)
  { dataKey: 'Data', depth: 2, root: 'Sections',  inner: 'Items',  pi: 'PricedItem' },
  { dataKey: 'data', depth: 2, root: 'Sections',  inner: 'Items',  pi: 'PricedItem' },
  // Flat items[] / Items[] directly under Data
  { dataKey: 'Data', depth: 1, root: 'Items',  pi: 'PricedItem' },
  { dataKey: 'Data', depth: 1, root: 'items',  pi: 'PricedItem' },
  { dataKey: 'Data', depth: 1, root: 'items',  pi: 'pricedItem' },
  { dataKey: 'data', depth: 1, root: 'Items',  pi: 'PricedItem' },
  { dataKey: 'data', depth: 1, root: 'items',  pi: 'PricedItem' },
  { dataKey: 'data', depth: 1, root: 'items',  pi: 'pricedItem' },
];

// ===========================================================================
// GENERIC EVENT NAME-FIELDS MIGRATOR
// ===========================================================================
function migrateEventNameFields(collectionName, pathSpecs, label) {
  const { push, flush, stats } = buildFlushBatch(collectionName);
  let skipped = 0;

  // teamName can live at multiple locations in an event doc
  const teamNameExpr = { $ifNull: [
    '$TeamName', '$teamName',
    '$Data.TeamName',  '$Data.teamName',
    '$data.TeamName',  '$data.teamName',
  ]};
  function teamNameFilter(teamName) {
    return { $or: [
      { TeamName: teamName }, { teamName: teamName },
      { 'Data.TeamName': teamName },  { 'Data.teamName': teamName },
      { 'data.TeamName': teamName },  { 'data.teamName': teamName },
    ]};
  }

  for (const ps of pathSpecs) {
    const { dataKey, depth, root, inner, pi } = ps;

    // Full dot-path to the PricedItem object (after unwind)
    const piPath = depth === 1
      ? `${dataKey}.${root}.${pi}`
      : `${dataKey}.${root}.${inner}.${pi}`;

    // Update path placeholders
    const updateBase = depth === 1
      ? `${dataKey}.${root}.$[i].${pi}`
      : `${dataKey}.${root}.$[og].${inner}.$[i].${pi}`;

    // arrayFilter key prefixes
    const iPi  = `i.${pi}`;
    const ogInnerFloor = depth === 2 ? `og.${inner}.${pi}.Floor` : null;

    const unwindStages = depth === 1
      ? [{ $unwind: `$${dataKey}.${root}` }]
      : [{ $unwind: `$${dataKey}.${root}` }, { $unwind: `$${dataKey}.${root}.${inner}` }];

    // Title is resolved from the first non-null among the four name keys
    const titleExpr = { $ifNull: [
      `$${piPath}.FullName`, `$${piPath}.fullName`,
      `$${piPath}.Name`,     `$${piPath}.name`, null,
    ]};

    // ---- Pass A: null/missing fields → parse title → set all 6 ----------------
    const combos = db.getCollection(collectionName).aggregate([
      ...unwindStages,
      { $match: {
        // at least one name key is a non-empty string
        $or: [
          { [`${piPath}.FullName`]: { $type: 'string', $ne: '' } },
          { [`${piPath}.fullName`]: { $type: 'string', $ne: '' } },
          { [`${piPath}.Name`]:     { $type: 'string', $ne: '' } },
          { [`${piPath}.name`]:     { $type: 'string', $ne: '' } },
        ],
        [`${piPath}.Floor`]: MISSING,  // idempotency sentinel — skip already-migrated items
      }},
      { $group: { _id: { teamName: teamNameExpr, title: titleExpr } } },
    ], { allowDiskUse: true });

    let specCombos = 0;
    combos.forEach((g) => {
      const { teamName, title } = g._id;
      if (!teamName || !title) { skipped++; return; }

      const parsed = parsedFields(title);

      // Build $set for all 6 fields and the idempotency arrayFilter object
      const setObj  = {};
      const iFilter = {
        $or: [
          { [`${iPi}.FullName`]: title }, { [`${iPi}.fullName`]: title },
          { [`${iPi}.Name`]:     title }, { [`${iPi}.name`]:     title },
        ],
      };
      for (const fd of FIELD_DEFS) {
        setObj[`${updateBase}.${fd.pascalKey}`]  = toRef(fd.cacheKey, parsed[fd.parsedKey], teamName);
        iFilter[`${iPi}.${fd.pascalKey}`]        = MISSING;
      }

      const docFilter = Object.assign(
        { [`${piPath}.Floor`]: MISSING },
        { [`${dataKey}.${root}`]: { $exists: true, $not: { $size: 0 } } },
        teamNameFilter(teamName),
      );

      const arrayFilters = depth === 1
        ? [iFilter]
        : [{ [`og.${inner}`]: { $exists: true }, [ogInnerFloor]: MISSING }, iFilter];

      push({ updateMany: { filter: docFilter, update: { $set: setObj }, arrayFilters } });
      specCombos++;
    });

    if (specCombos > 0) {
      info(`  Path "${piPath}": ${specCombos} combo(s) queued`);
    }

    // ---- Pass A-BS: BoardSetup override — re-set when parsed value differs --
    // Targets items where boardSetup (camelCase) OR BoardSetup (PascalCase) already
    // exists but holds a stale value (e.g. "Fully, 5+3" → should be "5+3").
    const bsCombos = db.getCollection(collectionName).aggregate([
      ...unwindStages,
      { $match: {
        $and: [
          { $or: [
            { [`${piPath}.FullName`]: { $type: 'string', $ne: '' } },
            { [`${piPath}.fullName`]: { $type: 'string', $ne: '' } },
            { [`${piPath}.Name`]:     { $type: 'string', $ne: '' } },
            { [`${piPath}.name`]:     { $type: 'string', $ne: '' } },
          ]},
          { $or: [
            { [`${piPath}.BoardSetup`]: { $exists: true, $not: { $in: [null] } } },
            { [`${piPath}.boardSetup`]: { $exists: true, $not: { $in: [null] } } },
          ]},
        ],
      }},
      { $group: { _id: { teamName: teamNameExpr, title: titleExpr } } },
    ], { allowDiskUse: true });

    let bsOverrideCombos = 0;
    bsCombos.forEach((g) => {
      const { teamName, title } = g._id;
      if (!teamName || !title) return;

      const parsed = parsedFields(title);
      if (!parsed.boardSetup) return;

      const bsRef   = toRef('boardSetups', parsed.boardSetup, teamName);
      const bsRefLC = { _id: bsRef._id, name: bsRef.Name }; // camelCase variant

      // Match items by title where the stored name (any casing) differs from new value
      const iFilter = {
        $and: [
          { $or: [
            { [`${iPi}.FullName`]: title }, { [`${iPi}.fullName`]: title },
            { [`${iPi}.Name`]:     title }, { [`${iPi}.name`]:     title },
          ]},
          { $or: [
            { [`${iPi}.BoardSetup.Name`]: { $ne: parsed.boardSetup } },
            { [`${iPi}.boardSetup.Name`]: { $ne: parsed.boardSetup } },
            { [`${iPi}.boardSetup.name`]: { $ne: parsed.boardSetup } },
          ]},
        ],
      };

      const docFilter = {
        [`${dataKey}.${root}`]: { $exists: true, $not: { $size: 0 } },
        $and: [
          teamNameFilter(teamName),
          { $or: [
            { [`${piPath}.BoardSetup`]: { $exists: true, $not: { $in: [null] } } },
            { [`${piPath}.boardSetup`]: { $exists: true, $not: { $in: [null] } } },
          ]},
        ],
      };

      const arrayFilters = depth === 1
        ? [iFilter]
        : [{ [`og.${inner}`]: { $exists: true } }, iFilter];

      push({ updateMany: {
        filter: docFilter,
        update: { $set: {
          [`${updateBase}.BoardSetup`]: bsRef,
          [`${updateBase}.boardSetup`]: bsRefLC,
        }},
        arrayFilters,
      }});
      bsOverrideCombos++;
    });

    if (bsOverrideCombos > 0) {
      info(`  Path "${piPath}" (BoardSetup override): ${bsOverrideCombos} combo(s) queued`);
    }

    // ---- Pass B: camelCase ref → PascalCase normalization -------------------
    // Handles the edge case where pricedItem.floor (camelCase) already has a ref
    // but pricedItem.Floor (PascalCase) is still missing.
    // Uses a pipeline updateMany with $map — rewrites the array for affected docs only.
    const camelFloorPath = depth === 1
      ? `${dataKey}.${root}.${pi}.floor._id`
      : `${dataKey}.${root}.${inner}.${pi}.floor._id`;
    const pascalFloorPath = depth === 1
      ? `${dataKey}.${root}.${pi}.Floor`
      : `${dataKey}.${root}.${inner}.${pi}.Floor`;

    const normCount = db.getCollection(collectionName).countDocuments({
      [`${camelFloorPath}`]:   { $exists: true },
      [`${pascalFloorPath}`]:  MISSING,
    });
    if (normCount === 0) continue;

    info(`  Pass B (${piPath}): ${normCount} doc(s) need camel→Pascal ref normalization`);

    function buildNormExpr(piVar) {
      // For each of the 6 fields: if camelCase ref exists but PascalCase missing → copy
      const mergeFields = {};
      for (const fd of FIELD_DEFS) {
        mergeFields[fd.pascalKey] = { $cond: {
          if: { $and: [
            { $eq: [{ $type: `$$${piVar}.${fd.parsedKey}` }, 'object'] },
            { $gt:  [`$$${piVar}.${fd.parsedKey}._id`, null] },
            { $not: { $gt: [`$$${piVar}.${fd.pascalKey}`, null] } },
          ]},
          then: {
            _id:  `$$${piVar}.${fd.parsedKey}._id`,
            Name: { $ifNull: [`$$${piVar}.${fd.parsedKey}.Name`, `$$${piVar}.${fd.parsedKey}.name`, ''] },
          },
          else: `$$${piVar}.${fd.pascalKey}`,
        }};
      }
      return { $mergeObjects: [`$$${piVar}`, mergeFields] };
    }

    let pipelineUpdate;
    if (depth === 1) {
      pipelineUpdate = [{ $set: {
        [`${dataKey}.${root}`]: {
          $map: { input: `$${dataKey}.${root}`, as: 'item', in: {
            $mergeObjects: ['$$item', { [pi]: buildNormExpr(`item.${pi}`) }],
          }},
        },
      }}];
    } else {
      pipelineUpdate = [{ $set: {
        [`${dataKey}.${root}`]: {
          $map: { input: `$${dataKey}.${root}`, as: 'og', in: {
            $mergeObjects: ['$$og', {
              [inner]: { $map: { input: `$$og.${inner}`, as: 'item', in: {
                $mergeObjects: ['$$item', { [pi]: buildNormExpr(`item.${pi}`) }],
              }}},
            }],
          }},
        },
      }}];
    }

    try {
      const r = db.getCollection(collectionName).updateMany(
        { [`${camelFloorPath}`]: { $exists: true }, [`${pascalFloorPath}`]: MISSING },
        pipelineUpdate,
      );
      stats.matched  += r.matchedCount  || 0;
      stats.modified += r.modifiedCount || 0;
      info(`    Normalization done → matched: ${r.matchedCount}  modified: ${r.modifiedCount}`);
    } catch (e) {
      error(`    Normalization FAILED → ${e.message}`);
      stats.bulkErrors++;
    }
  }

  flush();
  return { stats, skipped };
}

// ===========================================================================
// PHASE A — ActiveWork:Events
// ===========================================================================
function migrateActiveWorkEvents() {
  sep();
  info('PHASE A — MIGRATE ActiveWork:Events (parsed name fields, arrayFilters)');
  sep();

  const { stats, skipped } = migrateEventNameFields(
    ACTIVE_WORK_EVENTS_COLLECTION, OG_PATH_SPECS, 'ActiveWork:Events',
  );

  sep();
  info('Phase A complete:');
  info(`  Skipped (no title/team) : ${skipped}`);
  info(`  Matched                 : ${stats.matched}`);
  info(`  Modified                : ${stats.modified}`);
  info(`  Batches                 : ${stats.batches}`);
  info(`  BulkErrors              : ${stats.bulkErrors}`);
  sep();
  return stats.bulkErrors;
}

// ===========================================================================
// PHASE B — Handovers:Events
// ===========================================================================
function migrateHandoverEvents() {
  sep();
  info('PHASE B — MIGRATE Handovers:Events (parsed name fields, arrayFilters)');
  sep();

  const { stats, skipped } = migrateEventNameFields(
    HANDOVERS_EVENTS_COLLECTION, OG_PATH_SPECS, 'Handovers:Events',
  );

  sep();
  info('Phase B complete:');
  info(`  Skipped (no title/team) : ${skipped}`);
  info(`  Matched                 : ${stats.matched}`);
  info(`  Modified                : ${stats.modified}`);
  info(`  Batches                 : ${stats.batches}`);
  info(`  BulkErrors              : ${stats.bulkErrors}`);
  sep();
  return stats.bulkErrors;
}

// ===========================================================================
// PHASE C — Jobs:Events (defensive multi-path scan)
// ===========================================================================
function migrateJobsEvents() {
  sep();
  info('PHASE C — MIGRATE Jobs:Events (defensive multi-path scan, arrayFilters)');
  sep();

  const { stats, skipped } = migrateEventNameFields(
    JOBS_EVENTS_COLLECTION, JOBS_EVENTS_PATH_SPECS, 'Jobs:Events',
  );

  sep();
  info('Phase C complete:');
  info(`  Skipped (no title/team) : ${skipped}`);
  info(`  Matched                 : ${stats.matched}`);
  info(`  Modified                : ${stats.modified}`);
  info(`  Batches                 : ${stats.batches}`);
  info(`  BulkErrors              : ${stats.bulkErrors}`);
  sep();
  return stats.bulkErrors;
}

// ===========================================================================
// ENTRY POINT
// ===========================================================================
function runMigration() {
  sep();
  info('EVENTS PARSED NAME FIELDS MIGRATION (OPTIMIZED) — START');
  info('Collections: ActiveWork:Events → Handovers:Events → Jobs:Events');
  info('NOTE: 02-migrate-pic-lookup-collections.js must be run first.');
  sep();

  buildLookupCaches();

  const aIssues = migrateActiveWorkEvents();
  const bIssues = migrateHandoverEvents();
  const cIssues = migrateJobsEvents();

  sep();
  info('FINAL SUMMARY');
  info(`  Phase A (ActiveWork:Events) : ${aIssues} error(s)`);
  info(`  Phase B (Handovers:Events)  : ${bIssues} error(s)`);
  info(`  Phase C (Jobs:Events)       : ${cIssues} error(s)`);
  sep();

  const total = aIssues + bIssues + cIssues;
  if (total > 0) warn(`Migration finished WITH ${total} error(s). Review ERROR lines above.`);
  else           info('Migration finished SUCCESSFULLY with no errors.');
  sep();
}

const _scriptStart = new Date();
runMigration();
const _elapsed = ((new Date() - _scriptStart) / 1000).toFixed(2);
sep();
info(`SCRIPT  : 07-migrate-events-name-fields.optimized.js`);
info(`ELAPSED : ${_elapsed}s`);
sep();
