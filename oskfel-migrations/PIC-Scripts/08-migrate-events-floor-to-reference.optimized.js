// =============================================================================
// MIGRATION SCRIPT (OPTIMIZED): Events — Floor strings → reference objects
// =============================================================================
// Optimizations vs. the original:
//   1. All phases aggregate distinct (teamName, floorString) combos via
//      $unwind + $group → one arrayFilters updateMany per combo instead of
//      reading + rewriting nested arrays per document.
//   2. Path variants (Data/data, OperationalGroups/operationalGroups, etc.) are
//      declared as pathSpecs. Specs with no matching documents produce zero ops.
//   3. Three passes per spec:
//        A — non-empty string floor → ref  (grouped updateMany per combo)
//        B — empty string floor → null     (single updateMany)
//        C — camelCase ref normalization   (pipeline updateMany, countDocuments-gated)
//   4. item-level Floor intentionally NOT migrated (only PricedItem.Floor).
//   5. Idempotency: { $type: 'string' } guards on all filters. Re-running safe.
//   6. BATCH_SIZE raised to 500 (was 50).
//
// Prerequisite indexes:
//   db['ActiveWork:Events'].createIndex({ 'Data.OperationalGroups.Items.PricedItem.Floor': 1 });
//   db['ActiveWork:Events'].createIndex({ TeamName: 1 });
//   db['Handovers:Events'].createIndex({ 'Data.OperationalGroups.Items.PricedItem.Floor': 1 });
//   db['Handovers:Events'].createIndex({ TeamName: 1 });
//   db['Jobs:Events'].createIndex({ 'Data.OperationalGroups.Items.PricedItem.Floor': 1 });
//   db['Jobs:Events'].createIndex({ TeamName: 1 });
//
// Run with : mongosh <connection-string> 08-migrate-events-floor-to-reference.optimized.js
// =============================================================================

const ACTIVE_WORK_EVENTS_COLLECTION = 'ActiveWork:Events';
const HANDOVERS_EVENTS_COLLECTION   = 'Handovers:Events';
const JOBS_EVENTS_COLLECTION        = 'Jobs:Events';
const FLOORS_COLLECTION             = 'Jobs:ItemFloors';
const BATCH_SIZE = 500;

const MISSING = { $in: [null] };

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
// CACHE  "floorName|teamName" → { _id, name }
// ---------------------------------------------------------------------------
const floorCache = {};
const migrationCounters = { floorsAutoCreated: 0 };

function firstDefined() {
  for (let i = 0; i < arguments.length; i++) {
    if (arguments[i] !== undefined && arguments[i] !== null) return arguments[i];
  }
  return null;
}

function resolveFloor(floorName, teamName) {
  if (!floorName || typeof floorName !== 'string') return null;
  const clean = floorName.trim();
  if (!clean) return null;

  const cacheKey = `${clean}|${teamName}`;
  if (cacheKey in floorCache) return floorCache[cacheKey];

  const coll = db.getCollection(FLOORS_COLLECTION);
  let doc = coll.findOne({ name: clean, teamName, isDeleted: { $ne: true } });
  if (!doc) doc = coll.findOne({ Name: clean, TeamName: teamName, IsDeleted: { $ne: true } });

  if (!doc) {
    const ins = coll.insertOne({
      name: clean, teamName, catalogue: null,
      isDeleted: false, createdDate: new Date(), creator: null,
    });
    doc = { _id: ins.insertedId, name: clean };
    migrationCounters.floorsAutoCreated++;
    info(`  Auto-created floor → _id=${ins.insertedId}  name="${clean}"  teamName="${teamName}"`);
  }

  const ref = {
    _id:  firstDefined(doc._id, doc.Id, doc.id),
    name: firstDefined(doc.name, doc.Name, clean),
  };
  floorCache[cacheKey] = ref;
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

  function push(op) { bulkOps.push(op); if (bulkOps.length >= BATCH_SIZE) flush(); }
  return { push, flush, stats };
}

// ===========================================================================
// PATH SPEC DEFINITIONS
//
// depth=2 : dataKey.root[].inner[].pi.floor
// depth=1 : dataKey.root[].pi.floor   (flat items under Data)
//
// floor key can be 'Floor' or 'floor' depending on the pricedItem casing.
// ===========================================================================
const OG_PATH_SPECS = [
  { dataKey: 'Data', depth: 2, root: 'OperationalGroups', inner: 'Items',  pi: 'PricedItem', floor: 'Floor' },
  { dataKey: 'Data', depth: 2, root: 'OperationalGroups', inner: 'Items',  pi: 'pricedItem', floor: 'floor' },
  { dataKey: 'Data', depth: 2, root: 'OperationalGroups', inner: 'Items',  pi: 'pricedItem', floor: 'Floor' },
  { dataKey: 'Data', depth: 2, root: 'operationalGroups', inner: 'items',  pi: 'PricedItem', floor: 'Floor' },
  { dataKey: 'Data', depth: 2, root: 'operationalGroups', inner: 'items',  pi: 'pricedItem', floor: 'floor' },
  { dataKey: 'data', depth: 2, root: 'OperationalGroups', inner: 'Items',  pi: 'PricedItem', floor: 'Floor' },
  { dataKey: 'data', depth: 2, root: 'OperationalGroups', inner: 'Items',  pi: 'pricedItem', floor: 'floor' },
  { dataKey: 'data', depth: 2, root: 'operationalGroups', inner: 'items',  pi: 'PricedItem', floor: 'Floor' },
  { dataKey: 'data', depth: 2, root: 'operationalGroups', inner: 'items',  pi: 'pricedItem', floor: 'floor' },
];

const JOBS_EVENTS_PATH_SPECS = [
  ...OG_PATH_SPECS,
  // sections[].items[]
  { dataKey: 'Data', depth: 2, root: 'sections',  inner: 'items',  pi: 'PricedItem', floor: 'Floor' },
  { dataKey: 'Data', depth: 2, root: 'sections',  inner: 'items',  pi: 'pricedItem', floor: 'floor' },
  { dataKey: 'data', depth: 2, root: 'sections',  inner: 'items',  pi: 'PricedItem', floor: 'Floor' },
  { dataKey: 'data', depth: 2, root: 'sections',  inner: 'items',  pi: 'pricedItem', floor: 'floor' },
  // Sections[].Items[] (PascalCase)
  { dataKey: 'Data', depth: 2, root: 'Sections',  inner: 'Items',  pi: 'PricedItem', floor: 'Floor' },
  { dataKey: 'data', depth: 2, root: 'Sections',  inner: 'Items',  pi: 'PricedItem', floor: 'Floor' },
  // Flat Items[] / items[] directly under Data
  { dataKey: 'Data', depth: 1, root: 'Items',  pi: 'PricedItem', floor: 'Floor' },
  { dataKey: 'Data', depth: 1, root: 'items',  pi: 'PricedItem', floor: 'Floor' },
  { dataKey: 'Data', depth: 1, root: 'items',  pi: 'pricedItem', floor: 'floor' },
  { dataKey: 'data', depth: 1, root: 'Items',  pi: 'PricedItem', floor: 'Floor' },
  { dataKey: 'data', depth: 1, root: 'items',  pi: 'PricedItem', floor: 'Floor' },
  { dataKey: 'data', depth: 1, root: 'items',  pi: 'pricedItem', floor: 'floor' },
];

// ===========================================================================
// GENERIC EVENT FLOOR MIGRATOR
// ===========================================================================
function migrateEventFloor(collectionName, pathSpecs, label) {
  const { push, flush, stats } = buildFlushBatch(collectionName);
  let notFound = 0;
  const autoCreatedBefore = migrationCounters.floorsAutoCreated;

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
    const { dataKey, depth, root, inner, pi, floor: floorField } = ps;

    // Full dot-path to the floor field (after unwind)
    const floorPath  = depth === 1
      ? `${dataKey}.${root}.${pi}.${floorField}`
      : `${dataKey}.${root}.${inner}.${pi}.${floorField}`;

    // Update path with arrayFilter placeholders
    const updatePath = depth === 1
      ? `${dataKey}.${root}.$[i].${pi}.${floorField}`
      : `${dataKey}.${root}.$[og].${inner}.$[i].${pi}.${floorField}`;

    // arrayFilter identifier keys
    const iFloor    = `i.${pi}.${floorField}`;
    const ogAnyFloor = depth === 2 ? `og.${inner}.${pi}.${floorField}` : null;

    const unwindStages = depth === 1
      ? [{ $unwind: `$${dataKey}.${root}` }]
      : [{ $unwind: `$${dataKey}.${root}` }, { $unwind: `$${dataKey}.${root}.${inner}` }];

    // ---- Pass A: non-empty string floor → ref --------------------------------
    const combos = db.getCollection(collectionName).aggregate([
      ...unwindStages,
      { $match: { [floorPath]: { $type: 'string', $ne: '' } } },
      { $group: { _id: {
        teamName: teamNameExpr,
        floor:    `$${floorPath}`,
      }}},
    ], { allowDiskUse: true });

    let specCombos = 0;
    combos.forEach((g) => {
      const { teamName, floor } = g._id;
      if (!teamName) {
        warn(`  ${label}: null teamName for floor="${floor}" path="${floorPath}" — skipped`);
        notFound++;
        return;
      }

      const ref = resolveFloor(floor, teamName);
      if (!ref) { notFound++; return; }
      const refValue = { _id: ref._id, Name: ref.name || ref.Name || '' };

      const docFilter = Object.assign(
        { [floorPath]: floor },
        teamNameFilter(teamName),
      );
      const arrayFilters = depth === 1
        ? [{ [iFloor]: floor }]
        : [{ [ogAnyFloor]: floor }, { [iFloor]: floor }];

      push({ updateMany: { filter: docFilter, update: { $set: { [updatePath]: refValue } }, arrayFilters } });
      specCombos++;
    });

    if (specCombos > 0) info(`  Path "${floorPath}": ${specCombos} combo(s) queued`);

    // ---- Pass B: empty string → null -----------------------------------------
    {
      const emptyArrayFilters = depth === 1
        ? [{ [iFloor]: '' }]
        : [{ [ogAnyFloor]: '' }, { [iFloor]: '' }];

      push({ updateMany: {
        filter:       { [floorPath]: '' },
        update:       { $set: { [updatePath]: null } },
        arrayFilters: emptyArrayFilters,
      }});
    }

    // ---- Pass C: camelCase ref { name } → PascalCase ref { Name } -----------
    // Only runs when at least one doc actually needs normalization.
    const camelNamePath  = `${floorPath}.name`;
    const pascalNamePath = `${floorPath}.Name`;

    const normCount = db.getCollection(collectionName).countDocuments({
      [camelNamePath]:  { $exists: true },
      [pascalNamePath]: { $exists: false },
    });
    if (normCount === 0) continue;

    info(`  Pass C (${floorPath}): ${normCount} doc(s) need camel→Pascal normalization`);

    function buildNormExpr(itemVar) {
      const piRef = `$$${itemVar}.${pi}.${floorField}`;
      return {
        $mergeObjects: [`$$${itemVar}`, {
          [pi]: { $mergeObjects: [`$$${itemVar}.${pi}`, {
            [floorField]: { $cond: {
              if: { $and: [
                { $eq:  [{ $type: piRef }, 'object'] },
                { $gt:  [`${piRef}._id`,  null] },
                { $gt:  [`${piRef}.name`, null] },
                { $not: { $gt: [`${piRef}.Name`, null] } },
              ]},
              then: { _id: `${piRef}._id`, Name: `${piRef}.name` },
              else: piRef,
            }},
          }]},
        }],
      };
    }

    let pipelineUpdate;
    if (depth === 1) {
      pipelineUpdate = [{ $set: {
        [`${dataKey}.${root}`]: {
          $map: { input: `$${dataKey}.${root}`, as: 'item', in: buildNormExpr('item') },
        },
      }}];
    } else {
      pipelineUpdate = [{ $set: {
        [`${dataKey}.${root}`]: {
          $map: { input: `$${dataKey}.${root}`, as: 'og', in: {
            $mergeObjects: ['$$og', {
              [inner]: {
                $map: { input: `$$og.${inner}`, as: 'item', in: buildNormExpr('item') },
              },
            }],
          }},
        },
      }}];
    }

    try {
      const r = db.getCollection(collectionName).updateMany(
        { [camelNamePath]: { $exists: true }, [pascalNamePath]: { $exists: false } },
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

  const autoCreated = migrationCounters.floorsAutoCreated - autoCreatedBefore;
  return { stats, notFound, autoCreated };
}

// ===========================================================================
// PHASE A — ActiveWork:Events
// ===========================================================================
function migrateActiveWorkEvents() {
  sep();
  info('PHASE A — MIGRATE ActiveWork:Events (PricedItem.Floor, arrayFilters)');
  sep();

  const { stats, notFound, autoCreated } = migrateEventFloor(
    ACTIVE_WORK_EVENTS_COLLECTION, OG_PATH_SPECS, 'ActiveWork:Events',
  );

  sep();
  info('Phase A complete:');
  info(`  Not found       : ${notFound}`);
  info(`  Auto-created    : ${autoCreated}`);
  info(`  Matched         : ${stats.matched}`);
  info(`  Modified        : ${stats.modified}`);
  info(`  Batches         : ${stats.batches}`);
  info(`  BulkErrors      : ${stats.bulkErrors}`);
  sep();
  return stats.bulkErrors + notFound;
}

// ===========================================================================
// PHASE B — Handovers:Events
// ===========================================================================
function migrateHandoverEvents() {
  sep();
  info('PHASE B — MIGRATE Handovers:Events (PricedItem.Floor, arrayFilters)');
  sep();

  const { stats, notFound, autoCreated } = migrateEventFloor(
    HANDOVERS_EVENTS_COLLECTION, OG_PATH_SPECS, 'Handovers:Events',
  );

  sep();
  info('Phase B complete:');
  info(`  Not found       : ${notFound}`);
  info(`  Auto-created    : ${autoCreated}`);
  info(`  Matched         : ${stats.matched}`);
  info(`  Modified        : ${stats.modified}`);
  info(`  Batches         : ${stats.batches}`);
  info(`  BulkErrors      : ${stats.bulkErrors}`);
  sep();
  return stats.bulkErrors + notFound;
}

// ===========================================================================
// PHASE C — Jobs:Events (defensive multi-path scan)
// ===========================================================================
function migrateJobsEvents() {
  sep();
  info('PHASE C — MIGRATE Jobs:Events (defensive multi-path scan, arrayFilters)');
  sep();

  const { stats, notFound, autoCreated } = migrateEventFloor(
    JOBS_EVENTS_COLLECTION, JOBS_EVENTS_PATH_SPECS, 'Jobs:Events',
  );

  sep();
  info('Phase C complete:');
  info(`  Not found       : ${notFound}`);
  info(`  Auto-created    : ${autoCreated}`);
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
  info('EVENTS FLOOR-TO-REFERENCE MIGRATION (OPTIMIZED) — START');
  info('Collections: ActiveWork:Events → Handovers:Events → Jobs:Events');
  info('NOTE: 02 & 05 should be run first (lookup collections + main-collection floor migration).');
  sep();

  const aIssues = migrateActiveWorkEvents();
  const bIssues = migrateHandoverEvents();
  const cIssues = migrateJobsEvents();

  sep();
  info('FINAL SUMMARY');
  info(`  Phase A (ActiveWork:Events) : ${aIssues} issue(s)`);
  info(`  Phase B (Handovers:Events)  : ${bIssues} issue(s)`);
  info(`  Phase C (Jobs:Events)       : ${cIssues} issue(s)`);
  info(`  Floors auto-created         : ${migrationCounters.floorsAutoCreated}`);
  sep();

  const total = aIssues + bIssues + cIssues;
  if (total > 0) warn(`Migration finished WITH ${total} issue(s). Review WARN/ERROR lines above.`);
  else           info('Migration finished SUCCESSFULLY with no errors.');
  sep();
}

const _scriptStart = new Date();
runMigration();
const _elapsed = ((new Date() - _scriptStart) / 1000).toFixed(2);
sep();
info(`SCRIPT  : 08-migrate-events-floor-to-reference.optimized.js`);
info(`ELAPSED : ${_elapsed}s`);
sep();
