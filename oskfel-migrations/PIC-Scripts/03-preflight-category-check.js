// =============================================================================
// PRE-FLIGHT CHECK: find category names used in Sections / ActiveWork / Handovers
// that do not exist in Jobs:Items or Jobs:ItemCatalogueCategories.
// Run with: mongosh <connection-string> 03-preflight-category-check.js
// =============================================================================

// Step 1: collect all category names from Jobs:Items
var itemCategories = db["Jobs:Items"].distinct("category", {
  category: { $type: "string", $ne: "" },
});

// Step 2: collect all category names from Jobs:ItemCatalogueCategories
var catalogueCategories = db["Jobs:ItemCatalogueCategories"].distinct("name", {
  isDeleted: { $ne: true },
});

// Step 3: combine both into one unique list
var knownCategories = [];
itemCategories.forEach(function (c) {
  if (knownCategories.indexOf(c) === -1) knownCategories.push(c);
});
catalogueCategories.forEach(function (c) {
  if (knownCategories.indexOf(c) === -1) knownCategories.push(c);
});

print("Known category names (Items + CatalogueCategories): " + knownCategories.length);

// ---------------------------------------------------------------------------
// CHECK 1 — Jobs:Sections
// Find category strings in items[].pricedItem.category not in the known list
// ---------------------------------------------------------------------------

print("\n=== CHECK 1: Jobs:Sections — category names not in known list ===\n");

db["Jobs:Sections"].aggregate([
  { $unwind: "$items" },
  {
    $match: {
      "items.pricedItem.category": { $type: "string", $ne: "", $nin: knownCategories },
    },
  },
  {
    $group: {
      _id: { teamName: "$teamName", category: "$items.pricedItem.category" },
      count: { $sum: 1 },
    },
  },
  { $sort: { "_id.teamName": 1, "_id.category": 1 } },
]).forEach(function (r) {
  print('teamName="' + r._id.teamName + '"  category="' + r._id.category + '"  docs=' + r.count);
});

// ---------------------------------------------------------------------------
// CHECK 2 — ActiveWork:ActiveWorkRecords
// Find category strings in OperationalGroups[].Items[].PricedItem.Category not in the known list
// ---------------------------------------------------------------------------

print("\n=== CHECK 2: ActiveWork:ActiveWorkRecords — category names not in known list ===\n");

db["ActiveWork:ActiveWorkRecords"].aggregate([
  { $unwind: "$OperationalGroups" },
  { $unwind: "$OperationalGroups.Items" },
  {
    $match: {
      "OperationalGroups.Items.PricedItem.Category": { $type: "string", $ne: "", $nin: knownCategories },
    },
  },
  {
    $group: {
      _id: {
        teamName: { $ifNull: ["$TeamName", "$teamName", "masterteam"] },
        category: "$OperationalGroups.Items.PricedItem.Category",
      },
      count: { $sum: 1 },
    },
  },
  { $sort: { "_id.teamName": 1, "_id.category": 1 } },
]).forEach(function (r) {
  print('teamName="' + r._id.teamName + '"  category="' + r._id.category + '"  docs=' + r.count);
});

// ---------------------------------------------------------------------------
// CHECK 3 — Handovers:Handovers
// Find category strings in OperationalGroups[].Items[].PricedItem.Category not in the known list
// ---------------------------------------------------------------------------

print("\n=== CHECK 3: Handovers:Handovers — category names not in known list ===\n");

db["Handovers:Handovers"].aggregate([
  { $unwind: "$OperationalGroups" },
  { $unwind: "$OperationalGroups.Items" },
  {
    $match: {
      "OperationalGroups.Items.PricedItem.Category": { $type: "string", $ne: "", $nin: knownCategories },
    },
  },
  {
    $group: {
      _id: {
        teamName: { $ifNull: ["$TeamName", "$teamName", "masterteam"] },
        category: "$OperationalGroups.Items.PricedItem.Category",
      },
      count: { $sum: 1 },
    },
  },
  { $sort: { "_id.teamName": 1, "_id.category": 1 } },
]).forEach(function (r) {
  print('teamName="' + r._id.teamName + '"  category="' + r._id.category + '"  docs=' + r.count);
});
