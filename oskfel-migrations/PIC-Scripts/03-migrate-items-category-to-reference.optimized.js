// =============================================================================
// MIGRATION SCRIPT (OPTIMIZED): Jobs:Items — Migrate category strings to refs
// =============================================================================
// Optimizations vs. the original:
//   1. Phase 2: aggregates distinct (teamName, catalogue._id, category) → one
//      updateMany per group instead of one updateOne per document.
//   2. Phases 3–5: aggregate distinct category combos per collection → issue
//      one updateMany with arrayFilters per combo instead of reading and
//      rewriting whole nested arrays per document.
//   3. Idempotency is built-in: every filter checks category is a string
//      (already-migrated objects never match). Re-running is always safe.
//   4. BATCH_SIZE raised to 500.
//
// Prerequisite indexes (create before running for best performance):
//   db['Jobs:Items'].createIndex({ teamName: 1, 'catalogue._id': 1, category: 1 });
//   db['Jobs:Sections'].createIndex({ teamName: 1, 'items.pricedItem.category': 1 });
//   db['Jobs:Sections'].createIndex({ teamName: 1, 'items.pricedItem._id': 1 });
//   db['ActiveWork:ActiveWorkRecords'].createIndex({ teamName: 1, 'operationalGroups.items.pricedItem.category': 1 });
//   db['ActiveWork:ActiveWorkRecords'].createIndex({ teamName: 1, 'OperationalGroups.Items.PricedItem.Category': 1 });
//   db['Handovers:Handovers'].createIndex({ teamName: 1, 'operationalGroups.items.pricedItem.category': 1 });
//   db['Handovers:Handovers'].createIndex({ teamName: 1, 'OperationalGroups.Items.PricedItem.Category': 1 });
//
// Run with : mongosh <connection-string> 03-migrate-items-category-to-reference.optimized.js
// =============================================================================

const ITEMS_COLLECTION = "Jobs:Items";
const SECTIONS_COLLECTION = "Jobs:Sections";
const CATEGORIES_COLLECTION = "Jobs:ItemCatalogueCategories";
const ACTIVE_WORK_COLLECTION = "ActiveWork:ActiveWorkRecords";
const HANDOVERS_COLLECTION = "Handovers:Handovers";
const BATCH_SIZE = 500;

// When true, Phases 3-5 will auto-create a catalogue-less category document if
// the category string is not found in Jobs:ItemCatalogueCategories.
// When false (default), missing categories are skipped and logged as warnings.
const AUTO_CREATE_MISSING_CATEGORIES = true;

// ---------------------------------------------------------------------------
// LOGGING
// ---------------------------------------------------------------------------
function log(level, msg) {
  const ts = new Date().toISOString();
  print(`[${ts}] [${level.toUpperCase().padEnd(5)}] ${msg}`);
}
const info = (m) => log("INFO", m);
const warn = (m) => log("WARN", m);
const error = (m) => log("ERROR", m);
const debug = (m) => log("DEBUG", m);
const sep = () => info("─".repeat(72));

// ---------------------------------------------------------------------------
// CACHES
// ---------------------------------------------------------------------------
// "catName|teamName|catalogueId" → { _id, name }
const categoryCache = {};

// "catName|teamName" → { _id, name } | null   (for nested collections — no catalogue)
const categoryByNameCache = {};

// pricedItemId.toString() → { catalogue } | null
const itemsCatalogueCache = {};

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof ObjectId) return value;
  try {
    return ObjectId(value.toString());
  } catch (_e) {
    return null;
  }
}

function resolveCategory(catName, teamName, catalogue) {
  if (!catName || typeof catName !== "string") return null;
  if (catalogue && !catalogue._id) catalogue = null;

  const catId = catalogue ? catalogue._id.toString() : "__none__";
  const cacheKey = `${catName}|${teamName}|${catId}`;
  if (cacheKey in categoryCache) return categoryCache[cacheKey];

  const filter = { name: catName, teamName, isDeleted: { $ne: true } };
  if (catalogue) filter["catalogue._id"] = catalogue._id;
  else
    warn(
      `  No catalogue for category lookup → name="${catName}"  teamName="${teamName}"`,
    );

  let doc = db.getCollection(CATEGORIES_COLLECTION).findOne(filter);
  if (!doc) {
    const catRef = catalogue
      ? { _id: catalogue._id, name: catalogue.name || "" }
      : null;
    const newDoc = {
      name: catName,
      teamName,
      catalogue: catRef,
      isDeleted: false,
      createdDate: new Date(),
      creator: null,
    };
    const insertResult = db
      .getCollection(CATEGORIES_COLLECTION)
      .insertOne(newDoc);
    info(
      `  Auto-created category → _id=${insertResult.insertedId}  name="${catName}"  team="${teamName}"  catId="${catId}"`,
    );
    doc = { _id: insertResult.insertedId, name: catName };
  }

  const ref = { _id: doc._id, name: doc.name };
  categoryCache[cacheKey] = ref;
  return ref;
}

// Used by Phases 3–5: these collections carry no catalogue on pricedItem,
// so look up solely by teamName + name.
// If autoCreate=false (default): missing category → warn + return null (skip).
// If autoCreate=true: missing category → insert a catalogue-less document and return ref.
function resolveCategoryByName(catName, teamName, autoCreate = false) {
  if (!catName || typeof catName !== "string") return null;
  const cacheKey = `${catName}|${teamName}`;
  if (cacheKey in categoryByNameCache) return categoryByNameCache[cacheKey];

  let doc = db
    .getCollection(CATEGORIES_COLLECTION)
    .findOne({ name: catName, teamName, isDeleted: { $ne: true } });

  if (!doc) {
    if (!autoCreate) {
      warn(
        `  Category not found → name="${catName}"  teamName="${teamName}" — was Phase 1 run?`,
      );
      categoryByNameCache[cacheKey] = null;
      return null;
    }

    const newDoc = {
      name: catName,
      teamName,
      catalogue: null,
      isDeleted: false,
      archived: true,
      createdDate: new Date(),
      creator: null,
    };
    const insertResult = db
      .getCollection(CATEGORIES_COLLECTION)
      .insertOne(newDoc);
    info(
      `  Auto-created category (no catalogue, archived=true) → _id=${insertResult.insertedId}  name="${catName}"  team="${teamName}"`,
    );
    doc = { _id: insertResult.insertedId, name: catName };
  }

  const ref = { _id: doc._id, name: doc.name };
  categoryByNameCache[cacheKey] = ref;
  return ref;
}

function getItemCatalogue(itemId) {
  if (!itemId) return null;
  const key = itemId.toString();
  if (key in itemsCatalogueCache) return itemsCatalogueCache[key];

  const oid = toObjectId(itemId);
  if (!oid) {
    warn(`  pricedItem._id is not a valid ObjectId → "${itemId}"`);
    itemsCatalogueCache[key] = null;
    return null;
  }

  const doc = db
    .getCollection(ITEMS_COLLECTION)
    .findOne({ _id: oid }, { catalogue: 1 });
  const cat = doc && doc.catalogue ? doc.catalogue : null;
  itemsCatalogueCache[key] = cat;
  if (!cat)
    warn(`  Jobs:Items doc not found or has no catalogue → itemId=${itemId}`);
  return cat;
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
      const result = db
        .getCollection(collection)
        .bulkWrite(bulkOps, { ordered: false });
      stats.matched += result.matchedCount || 0;
      stats.modified += result.modifiedCount || 0;
      stats.batches++;
      info(
        `    DONE → matched: ${result.matchedCount || 0}  modified: ${result.modifiedCount || 0}`,
      );
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
// PHASE 1 — Seed Jobs:ItemCatalogueCategories  (unchanged logic, bigger batch)
// ===========================================================================
function seedCategories() {
  sep();
  info("PHASE 1 — SEED Jobs:ItemCatalogueCategories");
  sep();

  info(
    `[1/1] Aggregating distinct (category, teamName, catalogue) from "${ITEMS_COLLECTION}" ...`,
  );
  const pipeline = [
    {
      $match: {
        category: { $type: "string", $ne: "" },
        isDeleted: { $ne: true },
        "catalogue._id": { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: {
          category: "$category",
          teamName: "$teamName",
          catalogueId: "$catalogue._id",
          catalogueName: "$catalogue.name",
        },
      },
    },
    {
      $project: {
        _id: 0,
        name: "$_id.category",
        teamName: "$_id.teamName",
        catalogueId: "$_id.catalogueId",
        catalogueName: "$_id.catalogueName",
      },
    },
  ];

  const combinations = db
    .getCollection(ITEMS_COLLECTION)
    .aggregate(pipeline, { allowDiskUse: true })
    .toArray();
  info(`  Found ${combinations.length} distinct combination(s).`);

  if (combinations.length === 0) {
    warn("  No category strings in Jobs:Items — Phase 1 skipped.");
    return 0;
  }

  const now = new Date();
  let inserted = 0,
    matched = 0,
    errors = 0;

  for (let i = 0; i < combinations.length; i += BATCH_SIZE) {
    const chunk = combinations.slice(i, i + BATCH_SIZE);
    const ops = chunk.map((combo) => {
      const catRef = combo.catalogueId
        ? { _id: combo.catalogueId, name: combo.catalogueName || "" }
        : null;
      const filterDoc = { name: combo.name, teamName: combo.teamName };
      if (catRef) filterDoc["catalogue._id"] = catRef._id;
      return {
        updateOne: {
          filter: filterDoc,
          update: {
            $setOnInsert: {
              name: combo.name,
              teamName: combo.teamName,
              catalogue: catRef,
              isDeleted: false,
              createdDate: now,
              creator: null,
            },
          },
          upsert: true,
        },
      };
    });

    info(
      `  ► Upserting batch of ${ops.length} doc(s) into "${CATEGORIES_COLLECTION}" ...`,
    );
    try {
      const result = db
        .getCollection(CATEGORIES_COLLECTION)
        .bulkWrite(ops, { ordered: false });
      inserted += result.upsertedCount || 0;
      matched += result.matchedCount || 0;
      info(
        `    DONE → upserted: ${result.upsertedCount || 0}  matched: ${result.matchedCount || 0}`,
      );
    } catch (e) {
      error(`    FAILED → ${e.message}`);
      errors++;
    }
  }

  sep();
  info(
    `Phase 1 complete — upserted: ${inserted}  already existed: ${matched}  errors: ${errors}`,
  );
  sep();
  return errors;
}

// ===========================================================================
// PHASE 2 — Migrate Jobs:Items  (grouped updateMany per distinct combo)
// ===========================================================================
function migrateItems() {
  sep();
  info("PHASE 2 — MIGRATE Jobs:Items category field (grouped updateMany)");
  sep();

  const combos = db
    .getCollection(ITEMS_COLLECTION)
    .aggregate(
      [
        { $match: { category: { $type: "string", $ne: "" } } },
        {
          $group: {
            _id: {
              teamName: { $ifNull: ["$teamName", "masterteam"] },
              category: "$category",
              catalogueId: "$catalogue._id",
              catalogueName: "$catalogue.name",
            },
          },
        },
      ],
      { allowDiskUse: true },
    )
    .toArray();

  info(`  Distinct (teamName, category, catalogueId) groups: ${combos.length}`);
  if (combos.length === 0) {
    info("  Nothing to migrate in Jobs:Items — Phase 2 skipped.");
    sep();
    return 0;
  }

  const { push, flush, stats } = buildFlushBatch(ITEMS_COLLECTION);
  let notFound = 0;

  for (const g of combos) {
    const { teamName, category, catalogueId, catalogueName } = g._id;
    const catalogue = catalogueId
      ? { _id: catalogueId, name: catalogueName || "" }
      : null;
    const ref = resolveCategory(category, teamName, catalogue);

    if (!ref) {
      notFound++;
      continue;
    }

    // Exact string match is the idempotency guard — objects never equal a string
    const filter = { teamName, category };
    if (catalogueId) filter["catalogue._id"] = catalogueId;

    push({ updateMany: { filter, update: { $set: { category: ref } } } });
  }

  flush();

  sep();
  info("Phase 2 complete:");
  info(`  Groups processed : ${combos.length}`);
  info(`  Not found        : ${notFound}`);
  info(`  Matched          : ${stats.matched}`);
  info(`  Modified         : ${stats.modified}`);
  info(`  Batches          : ${stats.batches}`);
  info(`  BulkErrors       : ${stats.bulkErrors}`);
  sep();
  return stats.bulkErrors + notFound;
}

// ===========================================================================
// SHARED — nested array updater for Phases 3–5
// Groups by (teamName, category string) only — these collections do not embed
// catalogue on pricedItem, so resolution is by name + teamName alone.
// ===========================================================================

/**
 * spec = {
 *   depth: 1 | 2,
 *   casings: [
 *     { root, inner?, pi, cat, refNameKey, teamKey? }
 *     // inner only for depth=2
 *     // refNameKey: 'name' | 'Name'
 *     // teamKey: document-level field that holds the team name (default: 'teamName')
 *   ]
 * }
 * These collections do not embed catalogue on pricedItem, so category
 * resolution is done by (teamName, category name) only — no catalogue filter.
 */
function migrateNestedCategory(collectionName, spec) {
  const { push, flush, stats } = buildFlushBatch(collectionName);
  let notFound = 0;

  for (const cs of spec.casings) {
    const { root, pi, cat, refNameKey, inner, teamKey = 'teamName' } = cs;
    const depth = spec.depth;

    // ---- build dot-path helpers ----
    const itemsPath = depth === 1 ? root : `${root}.${inner}`;
    const piPrefix  = `${itemsPath}.${pi}`;
    const catPath   = `${piPrefix}.${cat}`;  // e.g. items.pricedItem.category

    // update path with arrayFilters placeholders
    const updatePath = depth === 1
      ? `${root}.$[i].${pi}.${cat}`
      : `${root}.$[og].${inner}.$[i].${pi}.${cat}`;

    // arrayFilter keys
    const iCat     = `i.${pi}.${cat}`;
    const ogAnyStr = `og.${inner}.${pi}.${cat}`;  // narrows og iteration (depth=2)

    // unwind stages for aggregation
    const unwindStages = depth === 1
      ? [{ $unwind: `$${root}` }]
      : [{ $unwind: `$${root}` }, { $unwind: `$${root}.${inner}` }];

    // aggregate distinct (teamName, category) combos — catalogue not present in these collections
    const combos = db.getCollection(collectionName).aggregate([
      ...unwindStages,
      { $match: { [catPath]: { $type: 'string', $ne: '' } } },
      { $group: {
        _id: {
          teamName: { $ifNull: [`$${teamKey}`, '$teamName', '$TeamName', 'masterteam'] },
          category: `$${catPath}`,
        },
      }},
    ], { allowDiskUse: true });

    combos.forEach((g) => {
      const { teamName, category } = g._id;
      const ref = resolveCategoryByName(category, teamName, AUTO_CREATE_MISSING_CATEGORIES);
      if (!ref) { notFound++; return; }
      const refValue = { _id: ref._id, [refNameKey]: ref.name };

      // idempotency: [catPath]: category only matches string values; once replaced
      // with an object { _id, name } the filter will never match again.
      const docFilter = { [teamKey]: teamName, [catPath]: category };
      const arrayFilters = depth === 1
        ? [{ [iCat]: category }]
        : [{ [ogAnyStr]: { $type: 'string' } }, { [iCat]: category }];

      push({ updateMany: { filter: docFilter, update: { $set: { [updatePath]: refValue } }, arrayFilters } });
    });
  }

  flush();
  return { stats, notFound };
}

// ===========================================================================
// PHASE 3 — Jobs:Sections  (items[].pricedItem.category, camelCase only)
// ===========================================================================
function migrateSections() {
  sep();
  info("PHASE 3 — MIGRATE Jobs:Sections pricedItem.category (arrayFilters)");
  sep();

  const { stats, notFound } = migrateNestedCategory(SECTIONS_COLLECTION, {
    depth: 1,
    casings: [
      { root: "items", pi: "pricedItem", cat: "category", refNameKey: "name" },
    ],
  });

  sep();
  info("Phase 3 complete:");
  info(`  Not found    : ${notFound}`);
  info(`  Matched      : ${stats.matched}`);
  info(`  Modified     : ${stats.modified}`);
  info(`  Batches      : ${stats.batches}`);
  info(`  BulkErrors   : ${stats.bulkErrors}`);
  sep();
  return stats.bulkErrors + notFound;
}

// ===========================================================================
// PHASE 4 — ActiveWork:ActiveWorkRecords
//           OperationalGroups[].Items[].PricedItem.Category  (PascalCase only)
// ===========================================================================
function migrateActiveWork() {
  sep();
  info('PHASE 4 — MIGRATE ActiveWork:ActiveWorkRecords PricedItem.Category (arrayFilters)');
  sep();

  const { stats, notFound } = migrateNestedCategory(ACTIVE_WORK_COLLECTION, {
    depth: 2,
    casings: [
      {
        root: 'OperationalGroups',
        inner: 'Items',
        pi: 'PricedItem',
        cat: 'Category',
        refNameKey: 'Name',
        teamKey: 'TeamName',
      },
    ],
  });

  sep();
  info("Phase 4 complete:");
  info(`  Not found    : ${notFound}`);
  info(`  Matched      : ${stats.matched}`);
  info(`  Modified     : ${stats.modified}`);
  info(`  Batches      : ${stats.batches}`);
  info(`  BulkErrors   : ${stats.bulkErrors}`);
  sep();
  return stats.bulkErrors + notFound;
}

// ===========================================================================
// PHASE 5 — Handovers:Handovers (same shape as Phase 4, PascalCase only)
// ===========================================================================
function migrateHandovers() {
  sep();
  info('PHASE 5 — MIGRATE Handovers:Handovers PricedItem.Category (arrayFilters)');
  sep();

  const { stats, notFound } = migrateNestedCategory(HANDOVERS_COLLECTION, {
    depth: 2,
    casings: [
      {
        root: 'OperationalGroups',
        inner: 'Items',
        pi: 'PricedItem',
        cat: 'Category',
        refNameKey: 'Name',
        teamKey: 'TeamName',
      },
    ],
  });

  sep();
  info("Phase 5 complete:");
  info(`  Not found    : ${notFound}`);
  info(`  Matched      : ${stats.matched}`);
  info(`  Modified     : ${stats.modified}`);
  info(`  Batches      : ${stats.batches}`);
  info(`  BulkErrors   : ${stats.bulkErrors}`);
  sep();
  return stats.bulkErrors + notFound;
}

// ===========================================================================
// PHASE 6 — Backfill missing `archived` field on Jobs:ItemCatalogueCategories
// ===========================================================================
function backfillArchivedField() {
  sep();
  info("PHASE 6 — BACKFILL archived=false on Jobs:ItemCatalogueCategories");
  sep();

  info(`[1/1] Updating docs missing "archived" field in "${CATEGORIES_COLLECTION}" ...`);
  try {
    const result = db.getCollection(CATEGORIES_COLLECTION).updateMany(
      { archived: { $exists: false } },
      { $set: { archived: false } },
    );
    info(`  DONE → matched: ${result.matchedCount}  modified: ${result.modifiedCount}`);
    sep();
    info(`Phase 6 complete — backfilled: ${result.modifiedCount}`);
    sep();
    return 0;
  } catch (e) {
    error(`  FAILED → ${e.message}`);
    sep();
    return 1;
  }
}

// ===========================================================================
// ENTRY POINT
// ===========================================================================
function runMigration() {
  sep();
  info("ITEMS CATEGORY-TO-REFERENCE MIGRATION (OPTIMIZED) — START");
  sep();

  const p1 = seedCategories();
  const p2 = migrateItems();
  const p3 = migrateSections();
  const p4 = migrateActiveWork();
  const p5 = migrateHandovers();
  const p6 = backfillArchivedField();

  sep();
  info("FINAL SUMMARY");
  info(`  Phase 1 (seed  Jobs:ItemCatalogueCategories)    : ${p1} issue(s)`);
  info(`  Phase 2 (items Jobs:Items)                      : ${p2} issue(s)`);
  info(`  Phase 3 (items Jobs:Sections)                   : ${p3} issue(s)`);
  info(`  Phase 4 (items ActiveWork:ActiveWorkRecords)    : ${p4} issue(s)`);
  info(`  Phase 5 (items Handovers:Handovers)             : ${p5} issue(s)`);
  info(`  Phase 6 (backfill archived Jobs:ItemCatCats)    : ${p6} issue(s)`);
  sep();

  const total = p1 + p2 + p3 + p4 + p5 + p6;
  if (total > 0)
    warn(
      `Migration finished WITH ${total} issue(s). Review WARN/ERROR lines above.`,
    );
  else info("Migration finished SUCCESSFULLY with no errors.");
  sep();
}

const _scriptStart = new Date();
runMigration();
const _elapsed = ((new Date() - _scriptStart) / 1000).toFixed(2);
sep();
info(`SCRIPT  : 03-migrate-items-category-to-reference.optimized.js`);
info(`ELAPSED : ${_elapsed}s`);
sep();
