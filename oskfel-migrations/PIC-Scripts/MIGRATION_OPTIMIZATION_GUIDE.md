# MongoDB Migration Script — Comprehensive Guide

## Table of Contents
1. [Golden Rules](#1-golden-rules)
2. [Script Structure](#2-script-structure)
3. [Grouping Strategy](#3-grouping-strategy)
4. [arrayFilters Strategy](#4-arrayfilters-strategy)
5. [Idempotency](#5-idempotency)
6. [Casing Handling](#6-casing-handling)
7. [Lookup Caches](#7-lookup-caches)
8. [Path Specs Pattern](#8-path-specs-pattern)
9. [TeamName Scoping](#9-teamname-scoping)
10. [Collection-Specific Characteristics](#10-collection-specific-characteristics)
11. [Empty & Null Field Handling](#11-empty--null-field-handling)
12. [Auto-Creation of Missing Lookup Docs](#12-auto-creation-of-missing-lookup-docs)
13. [bulkWrite Configuration](#13-bulkwrite-configuration)
14. [Required Indexes](#14-required-indexes)
15. [Phase Ordering & Prerequisites](#15-phase-ordering--prerequisites)
16. [Restrictions](#16-restrictions)
17. [Full Pattern Reference](#17-full-pattern-reference)

---

## 1. Golden Rules

These rules apply to every migration script without exception.

### G1 — Never update one document at a time
The `find().forEach → updateOne per doc` pattern is the primary bottleneck. Always group documents by their target value first.

```js
// ✗ BAD — N round-trips for N documents
collection.find({ field: { $type: 'string' } }).forEach(doc => {
  bulkOps.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { field: ref } } } });
});

// ✓ GOOD — U round-trips for N documents (U = distinct values, U << N)
collection.aggregate([
  { $match: { field: { $type: 'string' } } },
  { $group: { _id: { teamName: '$teamName', field: '$field' } } }
]).forEach(g => {
  const ref = resolve(g._id.field, g._id.teamName);
  push({ updateMany: { filter: { teamName: g._id.teamName, field: g._id.field }, update: { $set: { field: ref } } } });
});
```

### G2 — Never rewrite a whole nested array to change one field
Use `arrayFilters` instead. One `updateMany` patches the target field across every matching document simultaneously.

```js
// ✗ BAD — loads + rewrites entire items array per document
section.items.map(item => ({ ...item, pricedItem: { ...item.pricedItem, category: ref } }));
push({ updateOne: { filter: { _id: section._id }, update: { $set: { items: newItems } } } });

// ✓ GOOD — patches only the target field across ALL containing docs in one op
push({ updateMany: {
  filter:       { 'items.pricedItem.category': categoryStr, teamName },
  update:       { $set: { 'items.$[i].pricedItem.category': ref } },
  arrayFilters: [{ 'i.pricedItem.category': categoryStr }],
}});
```

### G3 — Resolve lookups once per distinct group, not once per document
Call `resolveCategory / resolveFloor / toRef` exactly once per distinct `(teamName, value)` combination, not inside a document loop.

### G4 — All caches must be team-scoped
Every lookup cache key must include `teamName`. Two teams can share the same value name but point to different `_id`s.

```js
// ✗ BAD — first-wins, silently wrong for multi-tenant data
if (!cache[doc.name]) cache[doc.name] = doc._id;

// ✓ GOOD — team-scoped key
const key = `${doc.teamName}::${doc.name}`;
if (!cache[key]) cache[key] = doc._id;
```

### G5 — Use `ordered: false` on all bulkWrite calls
Allows MongoDB to continue the batch after a single failure. Count errors and report them rather than stopping the migration.

### G6 — Always add `allowDiskUse: true` to aggregations
`$unwind` on large collections with big embedded arrays can exceed the 100 MB in-memory aggregation limit.

### G7 — Every phase must be idempotent
Re-running the script must never corrupt already-migrated data. See [Section 5](#5-idempotency).

### G8 — Loop over each collection at most once per casing pass
Combining all resolution sub-cases (with catalogue, without catalogue, by name only) into a **single aggregation** reduces collection scans and simplifies the code. Branch inside the `forEach` based on which identifiers are present in `g._id`.

```js
// ✗ BAD — three separate aggregation passes over the same collection
const withCat    = db[col].aggregate([...unwind, { $match: { [`${catPath}._id`]: { $exists: true } } }, ...]);
const withPiId   = db[col].aggregate([...unwind, { $match: { [piIdPath]:         { $exists: true } } }, ...]);
const nameOnly   = db[col].aggregate([...unwind, { $match: { [teamKey]:          { $exists: true } } }, ...]);

// ✓ GOOD — one aggregation, branch in forEach
const allCombos = db[col].aggregate([
  ...unwindStages,
  { $match: { [teamKey]: { $exists: true }, [floorPath]: { $type: 'string', $ne: '' } } },
  { $group: { _id: {
    teamName:     `$${teamKey}`,
    floor:        `$${floorPath}`,
    catalogueId:  `$${catPath}._id`,   // null when absent
    pricedItemId: `$${piIdPath}`,      // null when absent
  }}},
], { allowDiskUse: true });

allCombos.forEach(g => {
  const { teamName, floor, catalogueId, pricedItemId } = g._id;
  let ref;
  if (catalogueId)   ref = resolveFloor(floor, teamName, { _id: catalogueId });
  else if (pricedItemId) ref = resolveFloor(floor, teamName, getPricedItemCatalogue(pricedItemId));
  else               ref = resolveFloorByName(floor, teamName);  // snapshot: no catalogue, no _id
  // ... build docFilter and arrayFilters based on which identifier is available
});
```

This rule applies even when the collection has no catalogue or pricedItemId at all — in that case the grouped fields are simply always null, the branching always falls through to the name-only path, and there is still only one scan.

---

## 2. Script Structure

Every optimized migration script follows this layout:

```
CONFIGURATION CONSTANTS
  └─ Collection names, BATCH_SIZE (500), lookup collection names

LOGGING HELPERS
  └─ info / warn / error / sep

CACHES
  └─ Team-scoped maps, separate caches per resolution strategy

LOOKUP / RESOLVE FUNCTIONS
  └─ buildLookupCaches()        — bulk-loads PIC collections at startup
  └─ resolveX(value, team)      — catalogue-aware, returns { _id, name } ref
  └─ resolveXByName(value, team) — name-only fallback for snapshot collections

BULK FLUSH HELPER
  └─ buildFlushBatch(collection) → { push, flush, stats }

PATH SPEC CONSTANTS  (Events scripts only)
  └─ OG_PATH_SPECS              — ActiveWork/Handover Events paths
  └─ JOBS_EVENTS_PATH_SPECS     — defensive multi-path scan for Jobs:Events

GENERIC MIGRATION FUNCTION
  └─ migrateXxx(collection, spec/pathSpecs) — contains all passes

PHASE FUNCTIONS (thin wrappers)
  └─ Phase 1 / 2 / 3 — call generic function, log stats, return error count

ENTRY POINT
  └─ runMigration() — calls phases in order, prints final summary
```

---

## 3. Grouping Strategy

### When to use it
Use grouping on **top-level collection fields** where the target value is a direct field on the document. Group by `(teamName, sourceValue)` → one `updateMany` per group.

### Steps
1. `$match` to exclude already-migrated docs (idempotency).
2. `$group` by `(teamName, sourceValue)`. Include any fields needed for resolution (e.g. `catalogue._id`, `catalogue.name`).
3. For each group: resolve the ref once, push one `updateMany`.

### Example — top-level string → ref (script 03, Phase 2)

```js
const combos = db['Jobs:Items'].aggregate([
  { $match: { category: { $type: 'string', $ne: '' } } },  // idempotency: skip objects
  { $group: { _id: {
    teamName:      { $ifNull: ['$teamName', 'masterteam'] },
    category:      '$category',
    catalogueId:   '$catalogue._id',
    catalogueName: '$catalogue.name',
  }}},
], { allowDiskUse: true });

combos.forEach(g => {
  const { teamName, category, catalogueId, catalogueName } = g._id;
  const catalogue = catalogueId ? { _id: catalogueId, name: catalogueName || '' } : null;
  const ref = resolveCategory(category, teamName, catalogue);
  if (!ref) return;

  const filter = { teamName, category };
  if (catalogueId) filter['catalogue._id'] = catalogueId;

  push({ updateMany: { filter, update: { $set: { category: ref } } } });
});
```

---

## 4. arrayFilters Strategy

### When to use it
Use `arrayFilters` for **nested array fields** — when the target field sits inside an embedded array. One `updateMany` with `arrayFilters` patches the field across every containing document simultaneously.

### Depth 1 — single nested array (e.g. `items[].pricedItem.category`)

```js
push({ updateMany: {
  filter:       { teamName, 'items.pricedItem.category': categoryStr },
  update:       { $set: { 'items.$[i].pricedItem.category': ref } },
  arrayFilters: [{ 'i.pricedItem.category': categoryStr }],
}});
```

### Depth 2 — two nested arrays (e.g. `OperationalGroups[].Items[].PricedItem.Floor`)

```js
push({ updateMany: {
  filter:       { TeamName: teamName, 'OperationalGroups.Items.PricedItem.Floor': floorStr },
  update:       { $set: { 'OperationalGroups.$[og].Items.$[i].PricedItem.Floor': ref } },
  arrayFilters: [
    { 'og.Items.PricedItem.Floor': floorStr },   // narrows which groups to iterate
    { 'i.PricedItem.Floor': floorStr },          // matches the specific item
  ],
}});
```

### Depth 3 — Events: `Data.OperationalGroups[].Items[].PricedItem.Floor`

```js
push({ updateMany: {
  filter: Object.assign(
    { 'Data.OperationalGroups.Items.PricedItem.Floor': floorStr },
    teamNameFilter(teamName),  // $or across all teamName field locations
  ),
  update:       { $set: { 'Data.OperationalGroups.$[og].Items.$[i].PricedItem.Floor': ref } },
  arrayFilters: [
    { 'og.Items.PricedItem.Floor': floorStr },
    { 'i.PricedItem.Floor': floorStr },
  ],
}});
```

### Rules for arrayFilters
- Every `$[identifier]` in the update path must have exactly one corresponding filter in `arrayFilters`.
- Filters are evaluated in order; the first narrows the outer array, the second narrows the inner.
- Standard MongoDB operators (`$or`, `$in`, `$exists`, `$type`, `$not`) are all valid inside arrayFilter clauses.
- **Indexes must exist on the doc-level filter paths.** Without them, every `updateMany` does a full collection scan.

---

## 5. Idempotency

Every phase must be safe to re-run. The guard depends on what the field looks like before and after migration.

### String → Object (category, floor)
A string field will never equal an object. Use the source type as the guard:

```js
// In aggregation $match (excludes already-migrated docs):
{ field: { $type: 'string', $ne: '' } }

// In arrayFilter (excludes already-migrated elements):
{ 'i.PricedItem.Category': categoryStr }  // exact string match — objects never equal a string
```

### Null / Missing → Object (parsed name fields: Floor, Type, Height, …)
Use `{ $in: [null] }` which matches both null and missing:

```js
const MISSING = { $in: [null] };

// In aggregation $match:
{ 'items.pricedItem.Floor': MISSING }

// In arrayFilter (all 6 fields must be missing):
{
  'i.PricedItem.Floor':      MISSING,
  'i.PricedItem.Type':       MISSING,
  'i.PricedItem.Height':     MISSING,
  'i.PricedItem.Length':     MISSING,
  'i.PricedItem.BoardSetup': MISSING,
  'i.PricedItem.Material':   MISSING,
}
```

### Upsert phases (seed collections)
Use `$setOnInsert` with `upsert: true`. Already-existing documents are matched but never modified:

```js
{
  updateOne: {
    filter: { name: combo.name, teamName: combo.teamName, 'catalogue._id': combo.catalogueId },
    update: { $setOnInsert: { name, teamName, catalogue, isDeleted: false, createdDate: now } },
    upsert: true,
  }
}
```

### Summary table

| Scenario | Migration filter | arrayFilter guard |
|---|---|---|
| String → ref | `{ field: { $type: 'string', $ne: '' } }` | `{ 'i.pi.field': exactStr }` |
| Empty string → null | `{ field: '' }` | `{ 'i.pi.field': '' }` |
| Null → object | `{ field: { $in: [null] } }` | `{ 'i.pi.field': { $in: [null] } }` |
| Seed / upsert | (none — `upsert: true` handles it) | n/a |
| Casing normalization | `{ 'field.name': { $exists: true }, 'field.Name': { $exists: false } }` | same |

---

## 6. Casing Handling

### The problem
Documents may use camelCase (`pricedItem`, `category`, `floor`) or PascalCase (`PricedItem`, `Category`, `Floor`) for the same logical field. Both must be handled without duplicating logic.

### Verify actual data before adding casing variants
**Do not add both casings speculatively.** Each casing spec drives its own aggregation pass over the collection. An unnecessary spec is a harmless no-op, but it wastes time on large collections. Check your actual documents first.

| Collection | Actual casing |
|---|---|
| `Jobs:Items` | camelCase: `teamName`, `category`, `catalogue` |
| `Jobs:Sections` | camelCase: `teamName`, `items`, `pricedItem`, `category`, `floor` |
| `ActiveWork:ActiveWorkRecords` | **PascalCase only**: `TeamName`, `OperationalGroups`, `Items`, `PricedItem`, `Category`, `Floor` |
| `Handovers:Handovers` | **PascalCase only**: `TeamName`, `OperationalGroups`, `Items`, `PricedItem`, `Category`, `Floor` |
| All `*:Events` collections | Use path-spec defensive scan — both casings may appear |

### Strategy: separate passes per casing variant (for static collections)

Define a `casings` array in the spec. Each entry describes one casing variant. Iterate over them — each produces its own aggregation + `updateMany`.

```js
// Jobs:Sections — camelCase only
const casingSpecs = [
  { root: 'items', pi: 'pricedItem', cat: 'category', catalogue: 'catalogue', refNameKey: 'name', teamKey: 'teamName' },
];

// ActiveWork / Handovers — PascalCase ONLY (camelCase variants do not exist)
const casingSpecs = [
  { root: 'OperationalGroups', inner: 'Items', pi: 'PricedItem', cat: 'Category', catalogue: 'Catalogue', refNameKey: 'Name', teamKey: 'TeamName' },
];
```

### The `teamKey` casing parameter

The document-level field that holds the team name differs by collection. Always include `teamKey` in the casing spec so the same generic function works for all collections:

```js
const { root, pi, cat, refNameKey, teamKey = 'teamName' } = cs;

// Used in:
//   aggregation $match  → { [teamKey]: { $exists: true, $ne: null } }
//   aggregation $group  → `$${teamKey}`
//   docFilter           → { [teamKey]: teamName, ... }
```

| Collection | `teamKey` value |
|---|---|
| `Jobs:Items`, `Jobs:Sections` | `'teamName'` |
| `ActiveWork:ActiveWorkRecords`, `Handovers:Handovers` | `'TeamName'` |
| Events collections | handled via `teamNameFilter($or)` — no single `teamKey` |

### Ref name key

The `refNameKey` controls whether the output ref uses `{ _id, name }` or `{ _id, Name }`:

| Collection | `refNameKey` | Output ref shape |
|---|---|---|
| `Jobs:Items` | `'name'` | `{ _id, name }` |
| `Jobs:Sections` | `'name'` | `{ _id, name }` |
| `ActiveWork:ActiveWorkRecords` | `'Name'` | `{ _id, Name }` |
| `Handovers:Handovers` | `'Name'` | `{ _id, Name }` |
| Any Events collection | `'Name'` | `{ _id, Name }` |

### Casing normalization pass

When a field already contains a ref but with the wrong name key (e.g. `{ _id, name }` where `{ _id, Name }` is expected), run a pipeline `updateMany` at the end of the phase. Gate it with `countDocuments` to skip entirely when unneeded:

```js
const normCount = db[col].countDocuments({
  [teamKey]:             { $exists: true, $ne: null },
  'path.to.floor.name':  { $exists: true },
  'path.to.floor.Name':  { $exists: false },
});
if (normCount > 0) {
  db[col].updateMany(
    { [teamKey]: { $exists: true }, 'path.to.floor.name': { $exists: true }, 'path.to.floor.Name': { $exists: false } },
    [{ $set: { items: { $map: { input: '$items', as: 'item', in: {
      $mergeObjects: ['$$item', { pricedItem: { $mergeObjects: ['$$item.pricedItem', {
        floor: { $cond: {
          if:   { $and: [
            { $eq: [{ $type: '$$item.pricedItem.floor' }, 'object'] },
            { $gt: ['$$item.pricedItem.floor.name', null] },
            { $not: { $gt: ['$$item.pricedItem.floor.Name', null] } },
          ]},
          then: { _id: '$$item.pricedItem.floor._id', Name: '$$item.pricedItem.floor.name' },
          else: '$$item.pricedItem.floor',
        }},
      }]}}],
    }}}]}]
  );
}
```

---

## 7. Lookup Caches

### buildLookupCaches — for PIC collections (script 04/07 pattern)
Used when there are fixed reference collections (ItemFloors, ItemTypes, etc.) that all phases share. Load them once at startup.

```js
const lookupCaches = {};

function buildLookupCaches() {
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
  }
}

function toRef(cacheKey, name, teamName) {
  if (!name) return null;
  const id = ((lookupCaches[cacheKey] || {})[teamName] || {})[name];
  if (!id) warn(`toRef(${cacheKey}): miss for "${name}" team="${teamName}" — new ObjectId`);
  return { _id: id || new ObjectId(), Name: name };
}
```

### resolveX — catalogue-aware (script 03/05 pattern)
Used when the lookup requires matching `catalogue._id` in addition to `name + teamName`. Auto-creates on miss.

```js
const categoryCache = {};  // "name|teamName|catalogueId" → { _id, name }

function resolveCategory(catName, teamName, catalogue) {
  const catId    = catalogue?._id?.toString() ?? '__none__';
  const cacheKey = `${catName}|${teamName}|${catId}`;
  if (cacheKey in categoryCache) return categoryCache[cacheKey];

  const filter = { name: catName, teamName, isDeleted: { $ne: true } };
  if (catalogue) filter['catalogue._id'] = catalogue._id;

  let doc = db.getCollection(CATEGORIES_COLLECTION).findOne(filter);
  if (!doc) {
    const ins = db.getCollection(CATEGORIES_COLLECTION).insertOne({
      name: catName, teamName, catalogue: catalogue || null,
      isDeleted: false, createdDate: new Date(), creator: null,
    });
    doc = { _id: ins.insertedId, name: catName };
  }

  const ref = { _id: doc._id, name: doc.name };
  categoryCache[cacheKey] = ref;
  return ref;
}
```

### resolveXByName — name-only fallback (for snapshot collections)
Used for `ActiveWork:ActiveWorkRecords` and `Handovers:Handovers` where `PricedItem` carries neither `catalogue` nor `_id`. Has its own cache. Does **not** auto-create — Phase 1 (seed) must have run first.

```js
const categoryByNameCache = {};  // "name|teamName" → { _id, name } | null

function resolveCategoryByName(catName, teamName) {
  if (!catName || typeof catName !== 'string') return null;
  const cacheKey = `${catName}|${teamName}`;
  if (cacheKey in categoryByNameCache) return categoryByNameCache[cacheKey];

  const doc = db.getCollection(CATEGORIES_COLLECTION).findOne(
    { name: catName, teamName, isDeleted: { $ne: true } }
  );
  if (!doc) {
    warn(`  Category not found → name="${catName}"  teamName="${teamName}" — was Phase 1 run?`);
    categoryByNameCache[cacheKey] = null;
    return null;
  }

  const ref = { _id: doc._id, name: doc.name };
  categoryByNameCache[cacheKey] = ref;
  return ref;
}
```

For **floors** the `resolveFloorByName` variant auto-creates on miss (floors may not yet exist in the lookup collection):

```js
const floorByNameCache = {};  // "name|teamName" → { _id, name }

function resolveFloorByName(floorName, teamName) {
  // ... same cache-check pattern ...
  let doc = col.findOne({ name: normalizedName, teamName, isDeleted: { $ne: true } });
  if (!doc) doc = col.findOne({ Name: normalizedName, TeamName: teamName, IsDeleted: { $ne: true } });
  if (!doc) {
    const ins = col.insertOne({ name: normalizedName, teamName, catalogue: null, isDeleted: false, createdDate: new Date(), creator: null });
    doc = { _id: ins.insertedId, name: normalizedName };
    migrationCounters.floorsAutoCreated++;
  }
  // ...
}
```

### Cache key rules

| Lookup type | Cache key components |
|---|---|
| PIC collections (floors, types…) | `teamName::name` |
| Category with catalogue | `name\|teamName\|catalogueId` |
| Category or floor without catalogue | `name\|teamName` |

### warmCacheForAlreadyMigrated (script 04 pattern)
When Phase 1's idempotency filter skips already-migrated docs, later phases still need their refs. After the main loop, scan the full collection to warm the cache from already-set fields:

```js
function warmCacheForAlreadyMigrated() {
  db.getCollection(ITEMS_COLLECTION)
    .find({ name: { $exists: true, $type: 'string', $ne: '' } }, { _id: 1, name: 1, teamName: 1, floor: 1, type: 1 /* ... */ })
    .batchSize(1000)
    .forEach((doc) => {
      if (parsedCache[doc._id.toString()]) return;
      parsedCache[doc._id.toString()] = {
        refs: { floor: doc.floor, type: doc.type /* ... */ },
        teamName: doc.teamName,
      };
    });
}
```

---

## 8. Path Specs Pattern

### Purpose
Avoids per-document casing detection inside loops. Declares all concrete nested paths upfront as an array of spec objects. Each spec drives its own aggregation + `updateMany` pass. Specs that find no documents produce zero ops.

### When to use it
- Always for Events collections (`*:Events`) — they may contain multiple casing variants
- Not needed for `ActiveWork:ActiveWorkRecords` / `Handovers:Handovers` — those are PascalCase only, use a single casing spec

### Spec shape

```js
// depth=1: collection.root[].pi.targetField
// depth=2: collection.root[].inner[].pi.targetField
// depth=3: collection.Data.root[].inner[].pi.targetField  (Events only)

const spec = {
  dataKey:    'Data',              // outermost wrapper key (Events only)
  depth:      2,
  root:       'OperationalGroups',
  inner:      'Items',
  pi:         'PricedItem',
  cat:        'Category',          // for category migration
  floor:      'Floor',             // for floor migration
  catalogue:  'Catalogue',         // for catalogue-aware lookups
  refNameKey: 'Name',
};
```

### OG_PATH_SPECS vs JOBS_EVENTS_PATH_SPECS

```js
const OG_PATH_SPECS = [
  { dataKey: 'Data', depth: 2, root: 'OperationalGroups', inner: 'Items',  pi: 'PricedItem', /* ... */ },
  { dataKey: 'Data', depth: 2, root: 'operationalGroups', inner: 'items',  pi: 'pricedItem', /* ... */ },
  { dataKey: 'data', depth: 2, root: 'OperationalGroups', inner: 'Items',  pi: 'PricedItem', /* ... */ },
  // ...
];

const JOBS_EVENTS_PATH_SPECS = [
  ...OG_PATH_SPECS,
  { dataKey: 'Data', depth: 2, root: 'sections',  inner: 'items',  pi: 'PricedItem', /* ... */ },
  { dataKey: 'Data', depth: 2, root: 'Sections',  inner: 'Items',  pi: 'PricedItem', /* ... */ },
  { dataKey: 'Data', depth: 1, root: 'Items',     pi: 'PricedItem', /* ... */ },
  { dataKey: 'Data', depth: 1, root: 'items',     pi: 'pricedItem', /* ... */ },
  // ...
];
```

---

## 9. TeamName Scoping

### 9.1 — camelCase collections (`Jobs:Items`, `Jobs:Sections`)
TeamName is stored as `teamName`. Use it directly in `$group` and `updateMany` filter.

```js
{ $group: { _id: { teamName: { $ifNull: ['$teamName', 'masterteam'] }, value: '$field' } } }
// filter:
{ teamName: g._id.teamName, field: g._id.value }
```

### 9.2 — PascalCase non-events collections (`ActiveWork:ActiveWorkRecords`, `Handovers:Handovers`)
TeamName is stored as `TeamName` (PascalCase). Use `teamKey: 'TeamName'` in the casing spec to parameterize this, and always reference via `[teamKey]` — never hard-code `teamName` for these collections.

```js
// In aggregation — use the casing spec's teamKey:
{ $group: { _id: { teamName: `$${teamKey}`, value: `$${fieldPath}` } } }

// In updateMany filter:
{ [teamKey]: g._id.teamName, [fieldPath]: g._id.value }
// e.g. { TeamName: 'framework', 'OperationalGroups.Items.PricedItem.Category': 'Stairwells' }
```

Common mistake: writing `{ teamName: ... }` in a filter for these collections. The field name `teamName` (lowercase) does not exist on these documents — zero docs will ever match.

### 9.3 — Events collections (`ActiveWork:Events`, `Handovers:Events`, `Jobs:Events`)
TeamName can appear at multiple locations. Use `$ifNull` in aggregation and `$or` in filter:

```js
const teamNameExpr = { $ifNull: [
  '$TeamName', '$teamName',
  '$Data.TeamName', '$Data.teamName',
  '$data.TeamName', '$data.teamName',
]};

function teamNameFilter(teamName) {
  return { $or: [
    { TeamName: teamName }, { teamName: teamName },
    { 'Data.TeamName': teamName },  { 'Data.teamName': teamName },
    { 'data.TeamName': teamName },  { 'data.teamName': teamName },
  ]};
}
```

### 9.4 — Masterteam exclusion
Skip masterteam documents — they are template/seed data. Push the exclusion into the aggregation `$match` so those documents are never loaded:

```js
const MASTERTEAM_REGEX = /^master[-\s]*team$/i;
{ [teamKey]: { $exists: true, $ne: null, $not: MASTERTEAM_REGEX } }
```

---

## 10. Collection-Specific Characteristics

This section documents structural facts about each collection that affect migration logic. Verify these against your actual data before writing a script.

### `Jobs:Items`
- Field casing: **camelCase** (`teamName`, `category`, `catalogue`)
- `catalogue._id` is always present on non-deleted items
- Use `resolveCategory(name, teamName, catalogue)` — catalogue-scoped lookup

### `Jobs:Sections`
- Field casing: **camelCase** (`teamName`, `items`, `pricedItem`, `category`, `floor`)
- `pricedItem._id` is present — can match by `_id` in arrayFilters
- `pricedItem.catalogue` is present — catalogue-scoped resolution works

### `ActiveWork:ActiveWorkRecords`
- Field casing: **PascalCase only** — `TeamName`, `OperationalGroups`, `Items`, `PricedItem`, `Category`, `Floor`
- **`PricedItem` is a denormalized snapshot**: it has **no `_id`** and **no `catalogue`** field
- Resolution must be by `(TeamName, name/category)` only — use `resolveCategoryByName` / `resolveFloorByName`
- Matching in arrayFilters must use the field value (e.g. exact `Category` string), never `PricedItem._id`
- For name-field migration (Floor, Type, etc.): group by `(TeamName, PricedItem.Name)` and match by name

### `Handovers:Handovers`
- Identical characteristics to `ActiveWork:ActiveWorkRecords` above
- Same casing, same snapshot structure, same resolution strategy

### `*:Events` collections
- Data is wrapped under a `Data` key: `doc.Data.OperationalGroups[].Items[].PricedItem`
- TeamName may be at `TeamName`, `Data.TeamName`, or `data.TeamName` — always use `$or` filter
- Use the path-specs defensive scan approach: declare all casing combos as specs, run each; empty-match specs are harmless no-ops

---

## 11. Empty & Null Field Handling

### Empty string → null
Handle as a dedicated `updateMany` per casing variant. No resolve step needed:

```js
// Depth 1:
push({ updateMany: {
  filter:       { [teamKey]: { $exists: true }, [floorPath]: '' },
  update:       { $set: { [updatePath]: null } },
  arrayFilters: [{ [iFloor]: '' }],
}});

// Depth 2:
push({ updateMany: {
  filter:       { [teamKey]: { $exists: true }, [floorPath]: '' },
  update:       { $set: { [updatePath]: null } },
  arrayFilters: [{ [ogAnyFloor]: '' }, { [iFloor]: '' }],
}});
```

### Already null / undefined → skip
`MISSING = { $in: [null] }` matches both. Use it as an idempotency guard. Do NOT write null → null (wastes write ops and clutters the oplog).

### Fields that must stay as plain strings
Some fields are intentionally NOT migrated (e.g. `item.Floor` at the item level stays a string; only `item.PricedItem.Floor` is migrated). Document this explicitly at the top of the script.

---

## 12. Auto-Creation of Missing Lookup Docs

When a `findOne` on a lookup collection returns nothing, auto-create the document so the migration always completes without broken references.

Rules:
1. Use `insertOne` inside the resolve function — the cache gate ensures it runs only once per unique key.
2. Track a `migrationCounters.xAutoCreated` counter and report it in the phase summary.
3. Always log with `_id`, `name`, `teamName`, and the cause.
4. Auto-created docs must have `isDeleted: false`, `createdDate: new Date()`, `creator: null`.
5. For **categories in nested collections** (`resolveCategoryByName`): do **not** auto-create — the seed phase (Phase 1) must have run first. Return `null` and warn instead.

```js
if (!doc) {
  const ins = coll.insertOne({
    name: cleanName, teamName,
    catalogue: catalogueRef || null,
    isDeleted: false, createdDate: new Date(), creator: null,
  });
  doc = { _id: ins.insertedId, name: cleanName };
  migrationCounters.floorsAutoCreated++;
  info(`  Auto-created → _id=${ins.insertedId}  name="${cleanName}"  teamName="${teamName}"`);
}
```

---

## 13. bulkWrite Configuration

### BATCH_SIZE
Set to **500**. Never use an unbounded buffer.

| Value | Use case |
|---|---|
| 100 | Conservative — very large documents or limited server memory |
| **500** | Default sweet spot |
| 1000 | Aggressive — small documents, high-throughput server |

### buildFlushBatch helper

```js
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
      info(`    DONE → matched: ${r.matchedCount}  modified: ${r.modifiedCount}`);
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
```

**Always call `flush()` after the loop ends.** Ops in the buffer that never reach `BATCH_SIZE` are silently dropped otherwise.

---

## 14. Required Indexes

`arrayFilters` and `updateMany` on nested paths require a supporting index. Without them, every `updateMany` does a full collection scan.

```js
// Script 03 — category migration
db['Jobs:Items'].createIndex({ teamName: 1, 'catalogue._id': 1, category: 1 });
db['Jobs:Sections'].createIndex({ teamName: 1, 'items.pricedItem.category': 1 });
// ActiveWork/Handovers: PascalCase only — no camelCase indexes needed
db['ActiveWork:ActiveWorkRecords'].createIndex({ TeamName: 1, 'OperationalGroups.Items.PricedItem.Category': 1 });
db['Handovers:Handovers'].createIndex({ TeamName: 1, 'OperationalGroups.Items.PricedItem.Category': 1 });

// Script 04 — name fields migration
db['Jobs:Items'].createIndex({ teamName: 1, name: 1 });
db['Jobs:Sections'].createIndex({ 'items.pricedItem._id': 1 });
// ActiveWork/Handovers: PricedItem has no _id — index by Name instead
db['ActiveWork:ActiveWorkRecords'].createIndex({ TeamName: 1, 'OperationalGroups.Items.PricedItem.Name': 1 });
db['Handovers:Handovers'].createIndex({ TeamName: 1, 'OperationalGroups.Items.PricedItem.Name': 1 });

// Script 05 — floor migration
db['Jobs:Sections'].createIndex({ teamName: 1, 'items.pricedItem.floor': 1 });
db['Jobs:Sections'].createIndex({ teamName: 1, 'items.pricedItem._id': 1 });
db['ActiveWork:ActiveWorkRecords'].createIndex({ TeamName: 1, 'OperationalGroups.Items.PricedItem.Floor': 1 });
db['Handovers:Handovers'].createIndex({ TeamName: 1, 'OperationalGroups.Items.PricedItem.Floor': 1 });

// Scripts 06–08 (Events)
db['ActiveWork:Events'].createIndex({ TeamName: 1, 'Data.OperationalGroups.Items.PricedItem.Category': 1 });
db['ActiveWork:Events'].createIndex({ TeamName: 1, 'Data.OperationalGroups.Items.PricedItem.Floor': 1 });
db['Handovers:Events'].createIndex({ TeamName: 1, 'Data.OperationalGroups.Items.PricedItem.Category': 1 });
db['Handovers:Events'].createIndex({ TeamName: 1, 'Data.OperationalGroups.Items.PricedItem.Floor': 1 });
db['Jobs:Events'].createIndex({ TeamName: 1, 'Data.OperationalGroups.Items.PricedItem.Category': 1 });
db['Jobs:Events'].createIndex({ TeamName: 1, 'Data.OperationalGroups.Items.PricedItem.Floor': 1 });
```

Drop migration-only indexes after completion to avoid ongoing write amplification.

---

## 15. Phase Ordering & Prerequisites

### Script dependency chain

```
02-migrate-pic-lookup-collections
    │
    ├──► 03-migrate-items-category-to-reference
    │        └──► 06-migrate-events-category-to-reference
    │
    ├──► 04-migrate-items-name-fields
    │        └──► 07-migrate-events-name-fields
    │
    └──► 05-migrate-sections-floor-to-reference
             └──► 08-migrate-events-floor-to-reference
```

### Within each script
Phases run in declaration order. Seed/cache phases complete before migration phases. Call `warmCacheForAlreadyMigrated()` after Phase 1 when re-running — Phase 1's idempotency filter skips already-migrated docs but later phases still need their refs.

---

## 16. Restrictions

| # | Restriction | Reason |
|---|---|---|
| SR1 | Phase ordering is mandatory | Later phases depend on cache state from earlier phases |
| SR2 | Prerequisite scripts must run first | Seed collections must exist before `findOne` lookups |
| SR3 | Indexes must exist before running | Without indexes, `updateMany` full-scans the collection |
| SR4 | `allowDiskUse: true` on all aggregations | `$unwind` can exceed 100 MB RAM limit on large collections |
| SR5 | BATCH_SIZE must be between 100 and 1000 | Below 100: too many round-trips. Above 1000: memory pressure |
| SR6 | Never skip the final `flush()` call | Buffered ops are silently dropped if loop ends before BATCH_SIZE |
| SR7 | Never use `ordered: true` | Stops the batch on first error, losing all remaining ops |
| SR8 | Do not add camelCase casings for ActiveWork/Handovers | Those collections are PascalCase only — camelCase specs match zero docs |
| SR9 | Never use `pricedItem._id` to match in ActiveWork/Handovers | PricedItem is a snapshot with no `_id` — use the field value instead |
| SR10 | Never use `teamName` (lowercase) as doc filter key for ActiveWork/Handovers | The field is `TeamName` — lowercase key matches zero docs |
| SR11 | `resolveCategoryByName` must not auto-create | Nested-collection categories must be seeded by Phase 1 (script 03) first |
| SR12 | `item.Floor` (top-level) must NOT be migrated | Only `PricedItem.Floor` is the target. `item.Floor` stays a plain string |
| SR13 | masterteam documents must be excluded | They are template data and must not receive tenant-specific refs |

---

## 17. Full Pattern Reference

### Pattern A — Top-level field, string → ref

```
WHEN: Target field is directly on the document (not nested in array)
KEY:  Group by (teamName, sourceValue[, catalogueId]) → updateMany per group
```

```js
const combos = db[col].aggregate([
  { $match: { field: { $type: 'string', $ne: '' } } },
  { $group: { _id: { teamName: { $ifNull: ['$teamName', 'masterteam'] }, value: '$field' } } },
], { allowDiskUse: true });

combos.forEach(g => {
  const ref = resolveX(g._id.value, g._id.teamName);
  if (!ref) return;
  push({ updateMany: {
    filter: { teamName: g._id.teamName, field: g._id.value },
    update: { $set: { field: ref } },
  }});
});
```

---

### Pattern B — Nested array (depth 1), string → ref, single collection pass

```
WHEN: Target field is inside items[].pricedItem  (e.g. Jobs:Sections)
KEY:  One aggregation groups by all resolution dimensions; forEach branches by what's available
```

```js
// Jobs:Sections has catalogue + pricedItemId; single pass covers both sub-cases
const combos = db[col].aggregate([
  { $unwind: '$items' },
  { $match: { teamName: { $exists: true }, 'items.pricedItem.category': { $type: 'string', $ne: '' } } },
  { $group: { _id: {
    teamName:     '$teamName',
    category:     '$items.pricedItem.category',
    catalogueId:  '$items.pricedItem.catalogue._id',   // null when absent
    pricedItemId: '$items.pricedItem._id',             // null when absent
  }}},
], { allowDiskUse: true });

combos.forEach(g => {
  const { teamName, category, catalogueId, pricedItemId } = g._id;
  let ref;
  if (catalogueId) {
    ref = resolveCategory(category, teamName, { _id: catalogueId });
  } else if (pricedItemId) {
    const catalogue = getItemCatalogue(pricedItemId);
    ref = resolveCategory(category, teamName, catalogue);
  } else {
    ref = resolveCategoryByName(category, teamName);
  }
  if (!ref) return;

  const docFilter = catalogueId
    ? { teamName, 'items.pricedItem.category': category, 'items.pricedItem.catalogue._id': catalogueId }
    : { teamName, 'items.pricedItem.category': category };

  const arrayFilter = catalogueId
    ? { 'i.pricedItem.category': category, 'i.pricedItem.catalogue._id': catalogueId }
    : { 'i.pricedItem.category': category };

  push({ updateMany: {
    filter:       docFilter,
    update:       { $set: { 'items.$[i].pricedItem.category': ref } },
    arrayFilters: [arrayFilter],
  }});
});
```

---

### Pattern C — Nested array (depth 2), single collection pass

```
WHEN: Target field is inside OperationalGroups[].Items[].PricedItem  (ActiveWork / Handovers)
KEY:  PascalCase only. PricedItem has no _id and no catalogue — always resolve by name.
      One aggregation per casing, one forEach, no sub-passes.
```

```js
const combos = db[col].aggregate([
  { $unwind: '$OperationalGroups' },
  { $unwind: '$OperationalGroups.Items' },
  { $match: {
    TeamName: { $exists: true, $ne: null },
    'OperationalGroups.Items.PricedItem.Category': { $type: 'string', $ne: '' },
  }},
  { $group: { _id: {
    teamName: '$TeamName',
    category: '$OperationalGroups.Items.PricedItem.Category',
  }}},
], { allowDiskUse: true });

combos.forEach(g => {
  const { teamName, category } = g._id;
  const ref = resolveCategoryByName(category, teamName);  // name-only, no catalogue
  if (!ref) return;

  push({ updateMany: {
    filter:       { TeamName: teamName, 'OperationalGroups.Items.PricedItem.Category': category },
    update:       { $set: { 'OperationalGroups.$[og].Items.$[i].PricedItem.Category': { _id: ref._id, Name: ref.name } } },
    arrayFilters: [
      { 'og.Items.PricedItem.Category': { $type: 'string' } },  // narrows outer array
      { 'i.PricedItem.Category': category },                    // matches specific item
    ],
  }});
});
```

---

### Pattern D — Events collection (depth 3 with Data wrapper), string → ref

```
WHEN: Target field is inside Data.OperationalGroups[].Items[].PricedItem
KEY:  teamNameFilter($or), path-spec loop, resolveXByName (no catalogue in events)
```

```js
const combos = db[col].aggregate([
  { $unwind: '$Data.OperationalGroups' },
  { $unwind: '$Data.OperationalGroups.Items' },
  { $match: { 'Data.OperationalGroups.Items.PricedItem.Floor': { $type: 'string', $ne: '' } } },
  { $group: { _id: {
    teamName: { $ifNull: ['$TeamName', '$teamName', '$Data.TeamName', '$Data.teamName'] },
    floor:    '$Data.OperationalGroups.Items.PricedItem.Floor',
  }}},
], { allowDiskUse: true });

combos.forEach(g => {
  const { teamName, floor } = g._id;
  const ref = resolveFloor(floor, teamName);  // no catalogue in events
  if (!ref) return;

  push({ updateMany: {
    filter: Object.assign(
      { 'Data.OperationalGroups.Items.PricedItem.Floor': floor },
      teamNameFilter(teamName),
    ),
    update:       { $set: { 'Data.OperationalGroups.$[og].Items.$[i].PricedItem.Floor': { _id: ref._id, Name: ref.name } } },
    arrayFilters: [
      { 'og.Items.PricedItem.Floor': floor },
      { 'i.PricedItem.Floor': floor },
    ],
  }});
});
```

---

### Pattern E — Multiple fields from parsed name (script 04/07 style)

```
WHEN: Six fields (Floor/Type/Height/Length/BoardSetup/Material) are parsed from PricedItem.Name
KEY:  Group by (teamName, title) → parse once → set all 6 in one $set
      For ActiveWork/Handovers: group by (TeamName, PricedItem.Name) — no _id on PricedItem
```

```js
// ActiveWork / Handovers variant (PricedItem has no _id — match by Name)
const combos = db[col].aggregate([
  { $unwind: '$OperationalGroups' },
  { $unwind: '$OperationalGroups.Items' },
  { $match: {
    TeamName: { $exists: true },
    'OperationalGroups.Items.PricedItem.Name': { $type: 'string', $ne: '' },
    $or: FIELD_KEYS_PASCAL.map(k => ({ [`OperationalGroups.Items.PricedItem.${k}`]: MISSING })),
  }},
  { $group: { _id: {
    teamName: '$TeamName',
    piName:   '$OperationalGroups.Items.PricedItem.Name',
  }}},
], { allowDiskUse: true });

combos.forEach(g => {
  const { teamName, piName } = g._id;
  const refs   = rawToRefs(parsedFields(piName), teamName);
  const setObj = {};
  const missingObj = {};

  for (const k of FIELD_KEYS_PASCAL) {
    setObj[`OperationalGroups.$[og].Items.$[i].PricedItem.${k}`] = pickRef(refs, k, true);
    missingObj[`i.PricedItem.${k}`] = MISSING;
  }

  push({ updateMany: {
    filter:       { TeamName: teamName, 'OperationalGroups.Items.PricedItem.Name': piName },
    update:       { $set: setObj },
    arrayFilters: [
      { 'og.Items.PricedItem.Name': piName },
      { 'i.PricedItem.Name': piName, ...missingObj },
    ],
  }});
});
```

---

*This guide reflects patterns extracted from scripts 03–08 of the Jobs/ActiveWork/Handovers migration suite, including corrections applied after inspecting actual document shapes in `ActiveWork:ActiveWorkRecords` and `Handovers:Handovers`.*
