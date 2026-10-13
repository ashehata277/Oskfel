// =============================================================================
// MIGRATION SCRIPT (OPTIMIZED): Events — Migrate Category strings to references
// =============================================================================
// Optimizations vs. the original:
//   1. All phases aggregate distinct (teamName, category string) combos via
//      $unwind + $group → one arrayFilters updateMany per combo instead of
//      reading + rewriting nested arrays per document.
//   2. Path variants (Data/data, OperationalGroups/operationalGroups, etc.) are
//      expressed as declarative pathSpecs. Each spec runs its own aggregation
//      pass; specs that match no documents produce zero ops (harmless no-ops).
//   3. Empty-string category → null handled as a dedicated updateMany per spec.
//   4. Idempotency: every filter/arrayFilter checks category is a { $type: 'string' }.
//      Already-migrated (object) fields never match. Re-running is safe.
//   5. BATCH_SIZE stays at 500 (already optimal in original).
//
// Prerequisite indexes:
//   db['ActiveWork:Events'].createIndex({ 'Data.OperationalGroups.Items.PricedItem.Category': 1 });
//   db['ActiveWork:Events'].createIndex({ TeamName: 1 });
//   db['Handovers:Events'].createIndex({ 'Data.OperationalGroups.Items.PricedItem.Category': 1 });
//   db['Handovers:Events'].createIndex({ TeamName: 1 });
//   db['Jobs:Events'].createIndex({ 'Data.OperationalGroups.Items.PricedItem.Category': 1 });
//   db['Jobs:Events'].createIndex({ TeamName: 1 });
//
// Run with : mongosh <connection-string> 06-migrate-events-category-to-reference.optimized.js
// =============================================================================

const ACTIVE_WORK_EVENTS_COLLECTION = 'ActiveWork:Events';
const HANDOVERS_EVENTS_COLLECTION   = 'Handovers:Events';
const JOBS_EVENTS_COLLECTION        = 'Jobs:Events';
const CATEGORIES_COLLECTION         = 'Jobs:ItemCatalogueCategories';
const BATCH_SIZE = 500;

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
// CACHE  "name|teamName" → { _id, name }
// ---------------------------------------------------------------------------
const categoryCache = {};
const migrationCounters = { categoriesAutoCreated: 0 };

function resolveCategoryByName(catName, teamName) {
  if (!catName || typeof catName !== 'string') return null;
  const cleanName = catName.trim();
  if (!cleanName) return null;

  const cacheKey = `${cleanName}|${teamName}`;
  if (cacheKey in categoryCache) return categoryCache[cacheKey];

  const coll = db.getCollection(CATEGORIES_COLLECTION);
  let doc = coll.findOne({ name: cleanName, teamName, isDeleted: { $ne: true } });

  if (!doc) {
    // Legacy PascalCase fallback
    doc = coll.findOne({ Name: cleanName, TeamName: teamName, IsDeleted: { $ne: true } });
  }

  if (!doc) {
    const ins = coll.insertOne({
      name: cleanName, teamName, catalogue: null,
      isDeleted: false, createdDate: new Date(), creator: null,
    });
    doc = { _id: ins.insertedId, name: cleanName };
    migrationCounters.categoriesAutoCreated++;
    info(`  Auto-created category → _id=${ins.insertedId}  name="${cleanName}"  teamName="${teamName}"`);
  }

  const ref = { _id: doc._id, name: doc.name || doc.Name || cleanName };
  categoryCache[cacheKey] = ref;
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
// PATH SPEC DEFINITIONS
//
// Each spec describes one concrete nested path to Category inside an event doc.
// Aggregation passes that find no documents produce zero ops — safe no-ops.
//
// Shape:
//   dataKey  : 'Data' | 'data'
//   depth    : 1 (dataKey.root[].pi.cat) | 2 (dataKey.root[].inner[].pi.cat)
//   root     : first array key under dataKey
//   inner    : second array key (depth=2 only)
//   pi       : pricedItem key
//   cat      : category key
// ===========================================================================

// Phases A & B — OperationalGroups path, all realistic casing combos
const OG_PATH_SPECS = [
  { dataKey: 'Data', depth: 2, root: 'OperationalGroups', inner: 'Items',  pi: 'PricedItem', cat: 'Category' },
  { dataKey: 'Data', depth: 2, root: 'OperationalGroups', inner: 'Items',  pi: 'pricedItem', cat: 'category' },
  { dataKey: 'Data', depth: 2, root: 'operationalGroups', inner: 'items',  pi: 'PricedItem', cat: 'Category' },
  { dataKey: 'Data', depth: 2, root: 'operationalGroups', inner: 'items',  pi: 'pricedItem', cat: 'category' },
  { dataKey: 'data', depth: 2, root: 'OperationalGroups', inner: 'Items',  pi: 'PricedItem', cat: 'Category' },
  { dataKey: 'data', depth: 2, root: 'OperationalGroups', inner: 'Items',  pi: 'pricedItem', cat: 'category' },
  { dataKey: 'data', depth: 2, root: 'operationalGroups', inner: 'items',  pi: 'PricedItem', cat: 'Category' },
  { dataKey: 'data', depth: 2, root: 'operationalGroups', inner: 'items',  pi: 'pricedItem', cat: 'category' },
];

// Phase C — all candidate paths including sections and flat items
const JOBS_EVENTS_PATH_SPECS = [
  // OperationalGroups (same as Phases A/B)
  ...OG_PATH_SPECS,
  // sections[].items[]
  { dataKey: 'Data', depth: 2, root: 'sections', inner: 'items', pi: 'PricedItem', cat: 'Category' },
  { dataKey: 'Data', depth: 2, root: 'sections', inner: 'items', pi: 'pricedItem', cat: 'category' },
  { dataKey: 'data', depth: 2, root: 'sections', inner: 'items', pi: 'PricedItem', cat: 'Category' },
  { dataKey: 'data', depth: 2, root: 'sections', inner: 'items', pi: 'pricedItem', cat: 'category' },
  // Sections[].Items[] (PascalCase)
  { dataKey: 'Data', depth: 2, root: 'Sections',  inner: 'Items',  pi: 'PricedItem', cat: 'Category' },
  { dataKey: 'data', depth: 2, root: 'Sections',  inner: 'Items',  pi: 'PricedItem', cat: 'Category' },
  // Flat items[] / Items[] directly under Data
  { dataKey: 'Data', depth: 1, root: 'Items',  pi: 'PricedItem', cat: 'Category' },
  { dataKey: 'Data', depth: 1, root: 'items',  pi: 'PricedItem', cat: 'Category' },
  { dataKey: 'Data', depth: 1, root: 'items',  pi: 'pricedItem', cat: 'category' },
  { dataKey: 'data', depth: 1, root: 'Items',  pi: 'PricedItem', cat: 'Category' },
  { dataKey: 'data', depth: 1, root: 'items',  pi: 'PricedItem', cat: 'Category' },
  { dataKey: 'data', depth: 1, root: 'items',  pi: 'pricedItem', cat: 'category' },
];

// ===========================================================================
// GENERIC EVENT COLLECTION MIGRATOR
// Iterates pathSpecs; for each, aggregates distinct (teamName, category) combos
// and issues one arrayFilters updateMany per combo.
// ===========================================================================
function migrateEventPaths(collectionName, pathSpecs, label) {
  const { push, flush, stats } = buildFlushBatch(collectionName);
  let notFound = 0;
  const autoCreatedBefore = migrationCounters.categoriesAutoCreated;

  // teamName lives at multiple possible locations on an event doc.
  // $ifNull resolves the first non-null across all candidate positions.
  const teamNameExpr = { $ifNull: [
    '$TeamName', '$teamName',
    '$Data.TeamName', '$Data.teamName',
    '$data.TeamName', '$data.teamName',
  ]};

  // teamName filter for updateMany: match docs where teamName at any position equals the value
  function teamNameFilter(teamName) {
    return { $or: [
      { TeamName: teamName },
      { teamName: teamName },
      { 'Data.TeamName': teamName },
      { 'Data.teamName': teamName },
      { 'data.TeamName': teamName },
      { 'data.teamName': teamName },
    ]};
  }

  for (const ps of pathSpecs) {
    const { dataKey, depth, root, inner, pi, cat } = ps;

    // Full dot-path to the category field
    const catPath    = depth === 1
      ? `${dataKey}.${root}.${pi}.${cat}`
      : `${dataKey}.${root}.${inner}.${pi}.${cat}`;

    // Update path with arrayFilter placeholders
    const updatePath = depth === 1
      ? `${dataKey}.${root}.$[i].${pi}.${cat}`
      : `${dataKey}.${root}.$[og].${inner}.$[i].${pi}.${cat}`;

    // arrayFilter identifier keys
    const iCat    = `i.${pi}.${cat}`;
    const ogInner = depth === 2 ? `og.${inner}.${pi}.${cat}` : null;

    const unwindStages = depth === 1
      ? [{ $unwind: `$${dataKey}.${root}` }]
      : [{ $unwind: `$${dataKey}.${root}` }, { $unwind: `$${dataKey}.${root}.${inner}` }];

    // ---- Pass A: non-empty string category → ref ---------------------------
    const combos = db.getCollection(collectionName).aggregate([
      ...unwindStages,
      { $match: { [catPath]: { $type: 'string', $ne: '' } } },
      { $group: { _id: {
        teamName: teamNameExpr,
        category: `$${catPath}`,
      }}},
    ], { allowDiskUse: true });

    let specCombos = 0;
    combos.forEach((g) => {
      const { teamName, category } = g._id;
      if (!teamName) {
        warn(`  ${label}: combo with null teamName for category="${category}" in path "${catPath}" — skipped`);
        notFound++;
        return;
      }

      const ref = resolveCategoryByName(category, teamName);
      if (!ref) { notFound++; return; }
      const refValue = { _id: ref._id, Name: ref.name || ref.Name || '' };

      const docFilter = Object.assign(
        { [catPath]: category },
        teamNameFilter(teamName),
      );

      const arrayFilters = depth === 1
        ? [{ [iCat]: category }]
        : [{ [ogInner]: category }, { [iCat]: category }];

      push({ updateMany: { filter: docFilter, update: { $set: { [updatePath]: refValue } }, arrayFilters } });
      specCombos++;
    });

    if (specCombos > 0) {
      info(`  Path "${catPath}": ${specCombos} combo(s) queued`);
    }

    // ---- Pass B: empty string category → null ------------------------------
    const emptyDocFilter = { [catPath]: '' };
    const emptyArrayFilters = depth === 1
      ? [{ [iCat]: '' }]
      : [{ [ogInner]: '' }, { [iCat]: '' }];

    push({ updateMany: {
      filter: emptyDocFilter,
      update: { $set: { [updatePath]: null } },
      arrayFilters: emptyArrayFilters,
    }});
  }

  flush();

  const autoCreated = migrationCounters.categoriesAutoCreated - autoCreatedBefore;
  return { stats, notFound, autoCreated };
}

// ===========================================================================
// PHASE A — ActiveWork:Events
// ===========================================================================
function migrateActiveWorkEvents() {
  sep();
  info('PHASE A — MIGRATE ActiveWork:Events (Data.OperationalGroups[].Items[].PricedItem.Category)');
  sep();

  const { stats, notFound, autoCreated } = migrateEventPaths(
    ACTIVE_WORK_EVENTS_COLLECTION,
    OG_PATH_SPECS,
    'ActiveWork:Events',
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
  info('PHASE B — MIGRATE Handovers:Events (Data.OperationalGroups[].Items[].PricedItem.Category)');
  sep();

  const { stats, notFound, autoCreated } = migrateEventPaths(
    HANDOVERS_EVENTS_COLLECTION,
    OG_PATH_SPECS,
    'Handovers:Events',
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
// All candidate paths under Data are probed. Specs with no matching documents
// return zero combos from the aggregation and produce no ops.
// ===========================================================================
function migrateJobsEvents() {
  sep();
  info('PHASE C — MIGRATE Jobs:Events (defensive multi-path scan)');
  sep();

  const { stats, notFound, autoCreated } = migrateEventPaths(
    JOBS_EVENTS_COLLECTION,
    JOBS_EVENTS_PATH_SPECS,
    'Jobs:Events',
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
  info('EVENTS CATEGORY-TO-REFERENCE MIGRATION (OPTIMIZED) — START');
  info('Collections: ActiveWork:Events → Handovers:Events → Jobs:Events');
  info('NOTE: 02 & 03 must be run first (lookup collections + ItemCatalogueCategories).');
  sep();

  const aIssues = migrateActiveWorkEvents();
  const bIssues = migrateHandoverEvents();
  const cIssues = migrateJobsEvents();

  sep();
  info('FINAL SUMMARY');
  info(`  Phase A (ActiveWork:Events) : ${aIssues} issue(s)`);
  info(`  Phase B (Handovers:Events)  : ${bIssues} issue(s)`);
  info(`  Phase C (Jobs:Events)       : ${cIssues} issue(s)`);
  info(`  Categories auto-created     : ${migrationCounters.categoriesAutoCreated}`);
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
info(`SCRIPT  : 06-migrate-events-category-to-reference.optimized.js`);
info(`ELAPSED : ${_elapsed}s`);
sep();
