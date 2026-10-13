// =============================================================================
// MIGRATION SCRIPT (OPTIMIZED): Floor strings → reference objects { _id, name }
// =============================================================================
// Optimizations vs. the original:
//   1. All phases discover distinct (teamName, floorString, catalogueId) combos
//      via $unwind + $group aggregation → one arrayFilters updateMany per combo
//      instead of reading + rewriting full nested arrays per document.
//   2. Two catalogue sub-paths per casing variant:
//        a) pricedItem HAS embedded catalogue → group by catalogueId
//        b) pricedItem LACKS catalogue → group by pricedItemId → lazy resolve
//   3. Empty-string floor → null handled in a single targeted updateMany.
//   4. Name-casing normalization (object with wrong name/Name key) handled in
//      a single pipeline updateMany at the end of each phase.
//   5. masterteam exclusion pushed into the $match so those docs are never
//      loaded at all.
//   6. BATCH_SIZE raised to 500.
//
// Idempotency:
//   All filters require pricedItem.floor to be a string (or '' for the null pass).
//   Once the field is an object ref, it never matches a string filter.
//   Re-running is always safe.
//
// Prerequisite indexes:
//   db['Jobs:Sections'].createIndex({ teamName: 1, 'items.pricedItem.floor': 1 });
//   db['Jobs:Sections'].createIndex({ teamName: 1, 'items.pricedItem._id': 1 });
//   db['ActiveWork:ActiveWorkRecords'].createIndex({ teamName: 1, 'operationalGroups.items.pricedItem.floor': 1 });
//   db['ActiveWork:ActiveWorkRecords'].createIndex({ teamName: 1, 'OperationalGroups.Items.PricedItem.Floor': 1 });
//   db['Handovers:Handovers'].createIndex({ teamName: 1, 'operationalGroups.items.pricedItem.floor': 1 });
//   db['Handovers:Handovers'].createIndex({ teamName: 1, 'OperationalGroups.Items.PricedItem.Floor': 1 });
//
// NOTE: item.floor (top-level, not inside pricedItem) is intentionally NOT
//       migrated — it stays as a plain string. Use script 09 for that field.
//
// Run with : mongosh <connection-string> 05-migrate-sections-floor-to-reference.optimized.js
// =============================================================================

const SECTIONS_COLLECTION    = 'Jobs:Sections';
const FLOORS_COLLECTION      = 'Jobs:ItemFloors';
const ITEMS_COLLECTION       = 'Jobs:Items';
const ACTIVE_WORK_COLLECTION = 'ActiveWork:ActiveWorkRecords';
const HANDOVERS_COLLECTION   = 'Handovers:Handovers';
const BATCH_SIZE = 500;

// Matches any masterteam variant: "masterteam", "master-team", "master team" (case-insensitive)
const MASTERTEAM_REGEX = /^master[-\s]*team$/i;

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
// HELPERS
// ---------------------------------------------------------------------------
function toObjectId(value) {
  if (!value) return null;
  if (value instanceof ObjectId) return value;
  try { return ObjectId(value.toString()); } catch (_e) { return null; }
}

function firstDefined() {
  for (let i = 0; i < arguments.length; i++) {
    if (arguments[i] !== undefined && arguments[i] !== null) return arguments[i];
  }
  return null;
}

function normalizeCatalogue(catalogue) {
  if (!catalogue || typeof catalogue !== 'object') return null;
  const rawId = firstDefined(catalogue._id, catalogue.Id, catalogue.id);
  if (!rawId) return null;
  return {
    _id:  toObjectId(rawId) || rawId,
    name: firstDefined(catalogue.name, catalogue.Name, '') || '',
  };
}

// ---------------------------------------------------------------------------
// CACHES
// ---------------------------------------------------------------------------
// pricedItemId.toString() → catalogue { _id, name } | null
const itemsCache = {};
// "floorName|teamName|catalogueId" → { _id, name } ref
const floorCache = {};
// "floorName|teamName" → { _id, name } ref  (ActiveWork/Handovers — no catalogue on PricedItem)
const floorByNameCache = {};
const migrationCounters = { floorsAutoCreated: 0 };

function getPricedItemCatalogue(pricedItemId) {
  if (!pricedItemId) return null;
  const key = pricedItemId.toString();
  if (key in itemsCache) return itemsCache[key];

  const oid = toObjectId(pricedItemId);
  if (!oid) {
    warn(`  pricedItem._id not a valid ObjectId → "${pricedItemId}"`);
    itemsCache[key] = null;
    return null;
  }
  const doc = db.getCollection(ITEMS_COLLECTION).findOne({ _id: oid }, { catalogue: 1, Catalogue: 1 });
  const cat = doc ? normalizeCatalogue(firstDefined(doc.catalogue, doc.Catalogue)) : null;
  itemsCache[key] = cat;
  if (!cat) warn(`  Jobs:Items doc not found or has no catalogue → pricedItemId=${pricedItemId}`);
  return cat;
}

function resolveFloor(floorName, teamName, catalogue) {
  if (!floorName || typeof floorName !== 'string') return null;
  const normalizedName = floorName.trim();
  if (!normalizedName) return null;
  const normalizedCatalogue = normalizeCatalogue(catalogue);

  const catId    = normalizedCatalogue ? normalizedCatalogue._id.toString() : '__none__';
  const cacheKey = `${normalizedName}|${teamName}|${catId}`;
  if (cacheKey in floorCache) return floorCache[cacheKey];

  const filter = { name: normalizedName, teamName, isDeleted: { $ne: true } };
  if (normalizedCatalogue) filter['catalogue._id'] = normalizedCatalogue._id;
  else warn(`  No catalogue for floor lookup → name="${normalizedName}"  teamName="${teamName}"`);

  const col = db.getCollection(FLOORS_COLLECTION);
  let doc = col.findOne(filter);

  if (!doc) {
    // Legacy PascalCase fallback
    const legacyFilter = { Name: normalizedName, TeamName: teamName, IsDeleted: { $ne: true } };
    if (normalizedCatalogue) legacyFilter['Catalogue._id'] = normalizedCatalogue._id;
    doc = col.findOne(legacyFilter);
  }

  if (!doc) {
    const newDoc = {
      name:        normalizedName,
      teamName:    teamName,
      catalogue:   normalizedCatalogue ? { _id: normalizedCatalogue._id, name: normalizedCatalogue.name } : null,
      isDeleted:   false,
      createdDate: new Date(),
      creator:     null,
    };
    const ins = col.insertOne(newDoc);
    doc = { _id: ins.insertedId, name: normalizedName };
    migrationCounters.floorsAutoCreated++;
    info(`  Auto-created floor → _id=${ins.insertedId}  name="${normalizedName}"  team="${teamName}"  catId="${catId}"`);
  }

  const ref = {
    _id:  firstDefined(doc._id, doc.Id, doc.id),
    name: firstDefined(doc.name, doc.Name, normalizedName),
  };
  floorCache[cacheKey] = ref;
  return ref;
}

// Used by ActiveWork/Handovers passes: PricedItem carries no catalogue and no _id,
// so resolve solely by (teamName, name). Auto-creates when absent.
function resolveFloorByName(floorName, teamName) {
  if (!floorName || typeof floorName !== 'string') return null;
  const normalizedName = floorName.trim();
  if (!normalizedName) return null;

  const cacheKey = `${normalizedName}|${teamName}`;
  if (cacheKey in floorByNameCache) return floorByNameCache[cacheKey];

  const col = db.getCollection(FLOORS_COLLECTION);
  let doc = col.findOne({ name: normalizedName, teamName, isDeleted: { $ne: true } });
  if (!doc) doc = col.findOne({ Name: normalizedName, TeamName: teamName, IsDeleted: { $ne: true } });

  if (!doc) {
    const ins = col.insertOne({
      name: normalizedName, teamName, catalogue: null,
      isDeleted: false, createdDate: new Date(), creator: null,
    });
    doc = { _id: ins.insertedId, name: normalizedName };
    migrationCounters.floorsAutoCreated++;
    info(`  Auto-created floor → _id=${ins.insertedId}  name="${normalizedName}"  team="${teamName}"`);
  }

  const ref = {
    _id:  firstDefined(doc._id, doc.Id, doc.id),
    name: firstDefined(doc.name, doc.Name, normalizedName),
  };
  floorByNameCache[cacheKey] = ref;
  return ref;
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

  function push(op) {
    bulkOps.push(op);
    if (bulkOps.length >= BATCH_SIZE) flush();
  }
  return { push, flush, stats };
}

// ===========================================================================
// GENERIC NESTED-FLOOR MIGRATOR
// Handles all three phases via a spec that describes the path structure.
//
// spec.depth    : 1 (items[] at root) | 2 (root[].inner[])
// spec.casings  : array of casing descriptors:
//   {
//     root       : e.g. 'items' | 'OperationalGroups'
//     inner      : e.g. 'Items'  (depth=2 only)
//     pi         : e.g. 'pricedItem' | 'PricedItem'
//     floor      : e.g. 'floor'  | 'Floor'
//     catalogue  : e.g. 'catalogue' | 'Catalogue'
//     refNameKey : 'name' | 'Name'
//     teamKey    : document-level field for team name (default: 'teamName').
//                  Set to 'TeamName' for ActiveWork/Handovers. When set, Pass D
//                  runs: group by (teamKey, floor) with no catalogue/id requirement.
//   }
// ===========================================================================
function migrateNestedFloor(collectionName, spec) {
  const { push, flush, stats } = buildFlushBatch(collectionName);
  let notFound = 0;
  let autoCreatedBefore = migrationCounters.floorsAutoCreated;

  // MongoDB regex filter for non-masterteam docs
  const teamFilter = {
    $exists: true, $ne: null,
    $not: MASTERTEAM_REGEX,
  };

  for (const cs of spec.casings) {
    const { root, inner, pi, floor: floorField, catalogue: catField, refNameKey, teamKey = 'teamName' } = cs;
    const depth = spec.depth;

    // ---- dot-path builders ----
    const teamNamePath = 'TeamName';   // fallback for $ifNull in Passes B/C
    const itemsPath    = depth === 1 ? root : `${root}.${inner}`;
    const piPath       = `${itemsPath}.${pi}`;
    const floorPath    = `${piPath}.${floorField}`;   // e.g. items.pricedItem.floor
    const catPath      = `${piPath}.${catField}`;     // e.g. items.pricedItem.catalogue
    const piIdPath     = `${piPath}._id`;

    // update path with arrayFilter placeholders
    const updatePath   = depth === 1
      ? `${root}.$[i].${pi}.${floorField}`
      : `${root}.$[og].${inner}.$[i].${pi}.${floorField}`;

    // arrayFilter identifiers
    const iFloor     = `i.${pi}.${floorField}`;
    const iCatId     = `i.${pi}.${catField}._id`;
    const iPiId      = `i.${pi}._id`;
    const ogAnyFloor = `og.${inner}.${pi}.${floorField}`;  // narrows og iteration

    const unwindStages = depth === 1
      ? [{ $unwind: `$${root}` }]
      : [{ $unwind: `$${root}` }, { $unwind: `$${root}.${inner}` }];

    // ---- Pass A: empty string floor → null --------------------------------
    // One single updateMany per casing variant — no resolve needed.
    {
      const docFilter = {
        [teamKey]: teamFilter,
        [floorPath]: '',
      };
      const arrayFilters = depth === 1
        ? [{ [iFloor]: '' }]
        : [{ [ogAnyFloor]: '' }, { [iFloor]: '' }];

      push({ updateMany: {
        filter: docFilter,
        update: { $set: { [updatePath]: null } },
        arrayFilters,
      }});
    }

    // ---- Pass B: non-empty string floor WITH embedded catalogue ------------
    const embCombos = db.getCollection(collectionName).aggregate([
      ...unwindStages,
      { $match: {
        teamName:               { $exists: true, $ne: null, $not: MASTERTEAM_REGEX },
        [floorPath]:            { $type: 'string', $ne: '' },
        [`${catPath}._id`]:     { $exists: true, $ne: null },
      }},
      { $group: { _id: {
        teamName:      { $ifNull: [`$teamName`, `$${teamNamePath}`, 'masterteam'] },
        floor:         `$${floorPath}`,
        catalogueId:   `$${catPath}._id`,
        catalogueName: `$${catPath}.name`,
      }}},
    ], { allowDiskUse: true });

    embCombos.forEach((g) => {
      const { teamName, floor, catalogueId, catalogueName } = g._id;
      const catalogue = { _id: catalogueId, name: catalogueName || '' };
      const ref = resolveFloor(floor, teamName, catalogue);
      if (!ref) { notFound++; return; }
      const refValue = { _id: ref._id, [refNameKey]: ref.name };

      const docFilter = {
        teamName,
        [floorPath]:        floor,
        [`${catPath}._id`]: catalogueId,
      };
      const arrayFilters = depth === 1
        ? [{ [iFloor]: floor, [iCatId]: catalogueId }]
        : [
            { [ogAnyFloor]: floor },
            { [iFloor]: floor, [iCatId]: catalogueId },
          ];

      push({ updateMany: { filter: docFilter, update: { $set: { [updatePath]: refValue } }, arrayFilters } });
    });

    // ---- Pass C: non-empty string floor WITHOUT embedded catalogue ---------
    // Group by pricedItemId to minimise getItemCatalogue calls.
    const noCatCombos = db.getCollection(collectionName).aggregate([
      ...unwindStages,
      { $match: {
        teamName:           { $exists: true, $ne: null, $not: MASTERTEAM_REGEX },
        [floorPath]:        { $type: 'string', $ne: '' },
        [`${catPath}._id`]: { $in: [null] },
        [piIdPath]:         { $exists: true, $ne: null },
      }},
      { $group: { _id: {
        teamName:     { $ifNull: [`$teamName`, `$${teamNamePath}`, 'masterteam'] },
        floor:        `$${floorPath}`,
        pricedItemId: `$${piIdPath}`,
      }}},
    ], { allowDiskUse: true });

    noCatCombos.forEach((g) => {
      const { teamName, floor, pricedItemId } = g._id;
      const catalogue = getPricedItemCatalogue(pricedItemId);
      const ref = resolveFloor(floor, teamName, catalogue);
      if (!ref) { notFound++; return; }
      const pid = toObjectId(pricedItemId);
      if (!pid) { notFound++; return; }
      const refValue = { _id: ref._id, [refNameKey]: ref.name };

      const docFilter = {
        teamName,
        [piIdPath]:  pid,
        [floorPath]: { $type: 'string', $ne: '' },
      };
      const arrayFilters = depth === 1
        ? [{ [iPiId]: pid, [iFloor]: { $type: 'string', $ne: '' } }]
        : [
            { [`og.${inner}.${pi}._id`]: pid },
            { [iPiId]: pid, [iFloor]: { $type: 'string', $ne: '' } },
          ];

      push({ updateMany: { filter: docFilter, update: { $set: { [updatePath]: refValue } }, arrayFilters } });
    });

    // ---- Pass D: non-empty string floor, no catalogue and no pricedItemId ---
    // Runs only for casings with a non-default teamKey (ActiveWork, Handovers).
    // PricedItem in those collections carries neither catalogue nor _id, so
    // Passes B and C produce zero combos. This pass covers all remaining floors.
    if (cs.teamKey) {
      const dCombos = db.getCollection(collectionName).aggregate([
        ...unwindStages,
        { $match: {
          [teamKey]:   { $exists: true, $ne: null },
          [floorPath]: { $type: 'string', $ne: '' },
        }},
        { $group: { _id: {
          teamName: `$${teamKey}`,
          floor:    `$${floorPath}`,
        }}},
      ], { allowDiskUse: true });

      dCombos.forEach((g) => {
        const { teamName, floor } = g._id;
        const ref = resolveFloorByName(floor, teamName);
        if (!ref) { notFound++; return; }
        const refValue = { _id: ref._id, [refNameKey]: ref.name };

        // idempotency: floor === string literal only matches un-migrated elements;
        // once written as an object { _id, Name } the filter never matches again.
        const docFilter = { [teamKey]: teamName, [floorPath]: floor };
        const arrayFilters = depth === 1
          ? [{ [iFloor]: floor }]
          : [{ [ogAnyFloor]: floor }, { [iFloor]: floor }];

        push({ updateMany: { filter: docFilter, update: { $set: { [updatePath]: refValue } }, arrayFilters } });
      });
    }
  }

  flush();

  // ---- Pass E: name-casing normalization (post-flush, pipeline update) ----
  // Handles the rare case where pricedItem.floor is already an object ref but
  // has the wrong casing for name/Name. Runs after the main bulk ops complete.
  for (const cs of spec.casings) {
    const { root, inner, pi, floor: floorField, refNameKey, teamKey = 'teamName' } = cs;
    const depth = spec.depth;
    const wrongNameKey = refNameKey === 'Name' ? 'name' : 'Name';

    const floorPath    = depth === 1
      ? `${root}.${pi}.${floorField}`
      : `${root}.${inner}.${pi}.${floorField}`;

    const docFilter = {
      [teamKey]: { $exists: true, $ne: null, $not: MASTERTEAM_REGEX },
      [`${floorPath}.${wrongNameKey}`]: { $exists: true },
      [`${floorPath}.${refNameKey}`]:   { $exists: false },
    };

    const countNeeding = db.getCollection(collectionName).countDocuments(docFilter);
    if (countNeeding === 0) continue;

    info(`  Pass E (${cs.root}/${floorField}): ${countNeeding} doc(s) need name-casing normalization`);

    // Pipeline update: $map over array to fix the name key on the floor object.
    // Rewrites the array, but only targets docs that actually need normalization.
    const buildMapExpr = (itemVar, piKey, floorKey) => ({
      $mergeObjects: [`$$${itemVar}`, {
        [piKey]: { $mergeObjects: [`$$${itemVar}.${piKey}`, {
          [floorKey]: { $cond: {
            if: { $and: [
              { $eq: [{ $type: `$$${itemVar}.${piKey}.${floorKey}` }, 'object'] },
              { $gt:  [`$$${itemVar}.${piKey}.${floorKey}.${wrongNameKey}`, null] },
              { $not: { $gt: [`$$${itemVar}.${piKey}.${floorKey}.${refNameKey}`, null] } },
            ]},
            then: { _id: `$$${itemVar}.${piKey}.${floorKey}._id`, [refNameKey]: `$$${itemVar}.${piKey}.${floorKey}.${wrongNameKey}` },
            else: `$$${itemVar}.${piKey}.${floorKey}`,
          }},
        }]},
      }],
    });

    let pipelineUpdate;
    if (depth === 1) {
      pipelineUpdate = [{ $set: {
        [root]: { $map: { input: `$${root}`, as: 'item', in: buildMapExpr('item', pi, floorField) } },
      }}];
    } else {
      pipelineUpdate = [{ $set: {
        [root]: { $map: { input: `$${root}`, as: 'og', in: {
          $mergeObjects: ['$$og', {
            [inner]: { $map: { input: `$$og.${inner}`, as: 'item', in: buildMapExpr('item', pi, floorField) } },
          }],
        }}},
      }}];
    }

    try {
      const r = db.getCollection(collectionName).updateMany(docFilter, pipelineUpdate);
      info(`    Normalization done → matched: ${r.matchedCount}  modified: ${r.modifiedCount}`);
      stats.matched  += r.matchedCount  || 0;
      stats.modified += r.modifiedCount || 0;
    } catch (e) {
      error(`    Normalization FAILED → ${e.message}`);
      stats.bulkErrors++;
    }
  }

  const floorsAutoCreated = migrationCounters.floorsAutoCreated - autoCreatedBefore;
  return { stats, notFound, floorsAutoCreated };
}

// ===========================================================================
// PHASE 1 — Jobs:Sections  (items[].pricedItem.floor, camelCase only)
// ===========================================================================
function migrateSections() {
  sep();
  info('PHASE 1 — MIGRATE Jobs:Sections (arrayFilters)');
  sep();

  const { stats, notFound, floorsAutoCreated } = migrateNestedFloor(SECTIONS_COLLECTION, {
    depth: 1,
    casings: [
      { root: 'items', pi: 'pricedItem', floor: 'floor', catalogue: 'catalogue', refNameKey: 'name' },
    ],
  });

  sep();
  info('Phase 1 complete:');
  info(`  Not found       : ${notFound}`);
  info(`  Auto-created    : ${floorsAutoCreated}`);
  info(`  Matched         : ${stats.matched}`);
  info(`  Modified        : ${stats.modified}`);
  info(`  Batches         : ${stats.batches}`);
  info(`  BulkErrors      : ${stats.bulkErrors}`);
  sep();
  return stats.bulkErrors + notFound;
}

// ===========================================================================
// PHASE 2 — ActiveWork:ActiveWorkRecords
//           OperationalGroups[].Items[].PricedItem.Floor  (PascalCase only)
// PricedItem carries no catalogue and no _id → handled by Pass D.
// ===========================================================================
function migrateActiveWork() {
  sep();
  info('PHASE 2 — MIGRATE ActiveWork:ActiveWorkRecords (arrayFilters)');
  sep();

  const { stats, notFound, floorsAutoCreated } = migrateNestedFloor(ACTIVE_WORK_COLLECTION, {
    depth: 2,
    casings: [
      { root: 'OperationalGroups', inner: 'Items', pi: 'PricedItem', floor: 'Floor', catalogue: 'Catalogue', refNameKey: 'Name', teamKey: 'TeamName' },
    ],
  });

  sep();
  info('Phase 2 complete:');
  info(`  Not found       : ${notFound}`);
  info(`  Auto-created    : ${floorsAutoCreated}`);
  info(`  Matched         : ${stats.matched}`);
  info(`  Modified        : ${stats.modified}`);
  info(`  Batches         : ${stats.batches}`);
  info(`  BulkErrors      : ${stats.bulkErrors}`);
  sep();
  return stats.bulkErrors + notFound;
}

// ===========================================================================
// PHASE 3 — Handovers:Handovers (same shape as Phase 2, PascalCase only)
// ===========================================================================
function migrateHandovers() {
  sep();
  info('PHASE 3 — MIGRATE Handovers:Handovers (arrayFilters)');
  sep();

  const { stats, notFound, floorsAutoCreated } = migrateNestedFloor(HANDOVERS_COLLECTION, {
    depth: 2,
    casings: [
      { root: 'OperationalGroups', inner: 'Items', pi: 'PricedItem', floor: 'Floor', catalogue: 'Catalogue', refNameKey: 'Name', teamKey: 'TeamName' },
    ],
  });

  sep();
  info('Phase 3 complete:');
  info(`  Not found       : ${notFound}`);
  info(`  Auto-created    : ${floorsAutoCreated}`);
  info(`  Matched         : ${stats.matched}`);
  info(`  Modified        : ${stats.modified}`);
  info(`  Batches         : ${stats.batches}`);
  info(`  BulkErrors      : ${stats.bulkErrors}`);
  sep();
  return stats.bulkErrors + notFound;
}

// ===========================================================================
// ENTRY POINT
// ===========================================================================
function runMigration() {
  sep();
  info('FLOOR-TO-REFERENCE MIGRATION (OPTIMIZED) — START');
  sep();

  const p1 = migrateSections();
  const p2 = migrateActiveWork();
  const p3 = migrateHandovers();

  sep();
  info('FINAL SUMMARY');
  info(`  Phase 1 (Jobs:Sections)                : ${p1} issue(s)`);
  info(`  Phase 2 (ActiveWork:ActiveWorkRecords) : ${p2} issue(s)`);
  info(`  Phase 3 (Handovers:Handovers)          : ${p3} issue(s)`);
  sep();

  const total = p1 + p2 + p3;
  if (total > 0) warn(`Migration finished WITH ${total} issue(s). Review WARN/ERROR lines above.`);
  else           info('Migration finished SUCCESSFULLY with no errors.');
  sep();
}

const _scriptStart = new Date();
runMigration();
const _elapsed = ((new Date() - _scriptStart) / 1000).toFixed(2);
sep();
info(`SCRIPT  : 05-migrate-sections-floor-to-reference.optimized.js`);
info(`ELAPSED : ${_elapsed}s`);
sep();
