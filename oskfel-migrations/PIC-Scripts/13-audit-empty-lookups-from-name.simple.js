// =============================================================================
// AUDIT SCRIPT (SIMPLIFIED): Preview all changes before running the fix script
// =============================================================================
// Read-only script that:
// - Shows which items will be updated and what will change
// - Lists all new lookup documents that will be created
// - Displays old vs new field values for validation
// - No data is modified, only analyzed and reported
//
// Run: mongosh <connection-string> PIC-Scripts/13-audit-empty-lookups-from-name.simple.js
// =============================================================================

const ITEMS_COLLECTION = "Jobs:Items";

// ========== LOOKUP COLLECTIONS ==========
const LOOKUPS = {
  floor: "Jobs:ItemFloors",
  type: "Jobs:ItemTypes",
  height: "Jobs:ItemHeights",
  length: "Jobs:ItemLengths",
  boardSetup: "Jobs:ItemBoardSetups",
  material: "Jobs:ItemMaterials",
  lift: "Jobs:ItemLifts",
};

// ========== MEMORY CACHES ==========
const typePool = {};
const materialPool = {};
const lookupCache = {
  floor: {},
  type: {},
  height: {},
  length: {},
  boardSetup: {},
  material: {},
  lift: {},
};

// ========== STEP 1: Load all existing lookups into cache ==========
// Read-only caching for fast lookups during audit
// ==================================================================
print("[STEP 1] Loading lookups into memory caches...");

// Load all 7 lookup collections into cache
["floor", "type", "height", "length", "boardSetup", "material", "lift"].forEach(
  (key) => {
    db.getCollection(LOOKUPS[key])
      .find(
        { teamName: { $exists: true }, name: { $type: "string", $ne: "" } },
        { _id: 1, teamName: 1, name: 1, catalogue: 1 },
      )
      .forEach((doc) => {
        const k = `${String(doc.teamName)}::${String(doc.catalogue && doc.catalogue._id ? doc.catalogue._id : "")}::${doc.name}`;
        lookupCache[key][k] = { _id: doc._id, name: doc.name };
      });
  },
);

print(
  "[STEP 1] ✓ Lookups loaded: floor=" +
    Object.keys(lookupCache.floor).length +
    " type=" +
    Object.keys(lookupCache.type).length +
    " height=" +
    Object.keys(lookupCache.height).length +
    " length=" +
    Object.keys(lookupCache.length).length +
    " boardSetup=" +
    Object.keys(lookupCache.boardSetup).length +
    " material=" +
    Object.keys(lookupCache.material).length +
    " lift=" +
    Object.keys(lookupCache.lift).length,
);

// ========== STEP 2: Load type and material options ==========
// Used to match and extract field values from item names
// =========================================================
print("[STEP 2] Loading type and material options...");

db.getCollection(LOOKUPS.type)
  .find(
    { name: { $type: "string", $ne: "" } },
    { teamName: 1, name: 1, catalogue: 1 },
  )
  .forEach((doc) => {
    const key = `${String(doc.teamName || "")}::${String(doc.catalogue && doc.catalogue._id ? doc.catalogue._id : "")}`;
    if (!typePool[key]) typePool[key] = [];
    typePool[key].push(doc.name);
  });

db.getCollection(LOOKUPS.material)
  .find(
    { name: { $type: "string", $ne: "" } },
    { teamName: 1, name: 1, catalogue: 1 },
  )
  .forEach((doc) => {
    const key = `${String(doc.teamName || "")}::${String(doc.catalogue && doc.catalogue._id ? doc.catalogue._id : "")}`;
    if (!materialPool[key]) materialPool[key] = [];
    materialPool[key].push(doc.name);
  });

// Sort longest first so "Lift Access Scaffold" matches before "Lift"
for (const key of Object.keys(typePool))
  typePool[key].sort((a, b) => b.length - a.length);
for (const key of Object.keys(materialPool))
  materialPool[key].sort((a, b) => b.length - a.length);

print("[STEP 2] ✓ Options loaded: teams=" + Object.keys(typePool).length);
const badLookupQuery = {
  name: { $type: "string", $ne: "" },
  $or: [
    { floor: null },
    { floor: { $exists: false } },
    { "floor._id": { $exists: false } },
    { "floor.name": { $in: [null, ""] } },
    { type: null },
    { type: { $exists: false } },
    { "type._id": { $exists: false } },
    { "type.name": { $in: [null, ""] } },
    { height: null },
    { height: { $exists: false } },
    { "height._id": { $exists: false } },
    { "height.name": { $in: [null, ""] } },
    { length: null },
    { length: { $exists: false } },
    { "length._id": { $exists: false } },
    { "length.name": { $in: [null, ""] } },
    { boardSetup: null },
    { boardSetup: { $exists: false } },
    { "boardSetup._id": { $exists: false } },
    { "boardSetup.name": { $in: [null, ""] } },
    { material: null },
    { material: { $exists: false } },
    { "material._id": { $exists: false } },
    { "material.name": { $in: [null, ""] } },
    { lift: null },
    { lift: { $exists: false } },
    { "lift._id": { $exists: false } },
    { "lift.name": { $in: [null, ""] } },
  ],
};

const total = db.getCollection(ITEMS_COLLECTION).countDocuments(badLookupQuery);
print("[STEP 4] ✓ Found " + total + " items with broken lookups");

// ========== STEP 5: Main loop - analyze each item ==========
// Parse names and identify what will be created/updated
// Only log items where old !== new values (skip unchanged)
// ============================================================
print("[STEP 5] Analyzing items and tracking changes...");

let scanned = 0;
let toUpdate = 0;
let skipped = 0;
let unchanged = 0;
let newLookupsToInsert = [];
const changeLog = [];

const cursor = db
  .getCollection(ITEMS_COLLECTION)
  .find(badLookupQuery, {
    _id: 1,
    teamName: 1,
    name: 1,
    catalogue: 1,
    floor: 1,
    type: 1,
    height: 1,
    length: 1,
    boardSetup: 1,
    material: 1,
    lift: 1,
  })
  .batchSize(500);

cursor.forEach((item) => {
  scanned++;

  const title = String(item.name || "").trim();
  const teamName = item.teamName;
  const catalogue = item.catalogue;
  const catalogueId = catalogue && catalogue._id ? String(catalogue._id) : "";
  const optionKey = `${String(teamName)}::${catalogueId}`;

  // Skip items with no name or team
  if (!title || !teamName) {
    skipped++;
    return;
  }

  // ===== PARSE ITEM NAME TO EXTRACT ALL 7 FIELD VALUES =====
  // Normalize title for matching
  const normalized = title
    .toLowerCase()
    .replace(/\bup\s+to\b/g, "upto")
    .replace(/[(),]/g, " ")
    .replace(/\s*\+\s*/g, "+")
    .replace(/\s+/g, " ")
    .trim();

  // Extract LIFT
  let parsedLift = null;
  const liftMatch = title.match(
    /(?<![\w-])(\d+(?:st|nd|rd|th)|Ground|Upper Ground|Lower Ground|Basement|Mezzanine|Roof|Podium|Parapet)\s+Lift(?![\w-])/i,
  );
  if (liftMatch) parsedLift = liftMatch[1].trim();

  // Extract TYPE
  let parsedType = null;
  const types = typePool[optionKey] || [];
  for (const opt of types) {
    const optNormalized = opt
      .toLowerCase()
      .replace(/\bup\s+to\b/g, "upto")
      .replace(/[(),]/g, " ")
      .replace(/\s*\+\s*/g, "+")
      .replace(/\s+/g, " ")
      .trim();
    if (normalized.includes(optNormalized)) {
      parsedType = opt;
      break;
    }
  }

  // Remove type from title
  let titleWithoutType = normalized;
  if (parsedType) {
    const typeNormalized = parsedType
      .toLowerCase()
      .replace(/\bup\s+to\b/g, "upto")
      .replace(/[(),]/g, " ")
      .replace(/\s*\+\s*/g, "+")
      .replace(/\s+/g, " ")
      .trim();
    titleWithoutType = normalized
      .replace(typeNormalized, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Extract FLOOR
  let parsedFloor = null;
  const floorMatch = titleWithoutType.match(
    /(?<![\w-])(\d+(?:st|nd|rd|th)|Ground|Upper Ground|Lower Ground|Basement|Mezzanine|Roof|Podium|Parapet)\s+floor(?![\w-])/i,
  );
  if (floorMatch) parsedFloor = floorMatch[1].trim();

  // Extract HEIGHT
  let parsedHeight = null;
  const heightMatch = title.match(
    /(Upto\s+\d+(?:\.\d+)?m|Up\s+to\s+\d+(?:\.\d+)?m|\d+(?:\.\d+)?m\s+to\s+\d+(?:\.\d+)?m)\s+in\s+Height/i,
  );
  if (heightMatch)
    parsedHeight = heightMatch[1].replace(/\bUpto\b/i, "Up to").trim();

  // Extract LENGTH
  let parsedLength = null;
  const lengthMatch = title.match(
    /(up\s+to\s+\d+(?:\.\d+)?m|\d+(?:\.\d+)?m)\s+in\s+Length/i,
  );
  if (lengthMatch) {
    parsedLength = lengthMatch[1].trim();
  } else {
    const dimMatch = title.match(/(\d+(?:\.\d+)?m\s*x\s*\d+(?:\.\d+)?m)/i);
    if (dimMatch) parsedLength = dimMatch[1].trim();
  }

  // Extract BOARDSETUP
  let parsedBoardSetup = null;
  const boardMatch = title.match(/\b(\d+\+\d+)\s+Boards\b/i);
  if (boardMatch) {
    parsedBoardSetup = boardMatch[1];
  } else if (/Fully\s+Boarded/i.test(title)) {
    parsedBoardSetup = "Fully";
  }

  // Extract MATERIAL
  let parsedMaterial = null;
  const materials = materialPool[optionKey] || [];
  for (const opt of materials) {
    const matNormalized = opt
      .toLowerCase()
      .replace(/\bup\s+to\b/g, "upto")
      .replace(/[(),]/g, " ")
      .replace(/\s*\+\s*/g, "+")
      .replace(/\s+/g, " ")
      .trim();
    if (titleWithoutType.includes(matNormalized)) {
      parsedMaterial = opt;
      break;
    }
  }

  const itemChanges = {
    itemId:
      item._id && item._id.valueOf
        ? String(item._id.valueOf())
        : String(item._id).replace(/^ObjectId\("|"\)$/g, ""),
    itemName: title,
    teamName: teamName,
    updates: {},
  };

  // ===== CHECK FLOOR FIELD =====
  if (parsedFloor) {
    let floorLookup =
      lookupCache.floor[`${String(teamName)}::${catalogueId}::${parsedFloor}`];
    if (!floorLookup) {
      floorLookup = db.getCollection(LOOKUPS.floor).findOne({
        name: parsedFloor,
        teamName: teamName,
        ...(catalogue && catalogue._id
          ? { "catalogue._id": catalogue._id }
          : { catalogue: null }),
      });
      if (floorLookup) {
        lookupCache.floor[
          `${String(teamName)}::${catalogueId}::${parsedFloor}`
        ] = {
          _id: floorLookup._id,
          name: floorLookup.name,
        };
      }
    }

    if (!floorLookup) {
      newLookupsToInsert.push({
        collection: LOOKUPS.floor,
        name: parsedFloor,
        teamName: teamName,
        catalogueId: catalogueId,
        catalogueName:
          catalogue && catalogue.name ? String(catalogue.name) : "",
      });
      floorLookup = { _id: "(new)", name: parsedFloor };
      lookupCache.floor[`${String(teamName)}::${catalogueId}::${parsedFloor}`] =
        floorLookup;
    }

    const oldId = item.floor && item.floor._id ? String(item.floor._id) : "";
    const newId =
      floorLookup._id === "(new)" ? "(new)" : String(floorLookup._id);
    const oldName =
      item.floor && item.floor.name ? String(item.floor.name) : "";
    const newName = String(floorLookup.name);

    if (oldId !== newId || oldName !== newName) {
      itemChanges.updates.floor = {
        old:
          oldId && oldName
            ? `{ _id: ${oldId}, name: "${oldName}" }`
            : "(missing)",
        new:
          newId === "(new)"
            ? "(will insert)"
            : `{ _id: ${newId}, name: "${newName}" }`,
      };
    }
  }

  // ===== CHECK TYPE FIELD =====
  if (parsedType) {
    let typeLookup =
      lookupCache.type[`${String(teamName)}::${catalogueId}::${parsedType}`];
    if (!typeLookup) {
      typeLookup = db.getCollection(LOOKUPS.type).findOne({
        name: parsedType,
        teamName: teamName,
        ...(catalogue && catalogue._id
          ? { "catalogue._id": catalogue._id }
          : { catalogue: null }),
      });
      if (typeLookup) {
        lookupCache.type[`${String(teamName)}::${catalogueId}::${parsedType}`] =
          {
            _id: typeLookup._id,
            name: typeLookup.name,
          };
      }
    }

    if (!typeLookup) {
      newLookupsToInsert.push({
        collection: LOOKUPS.type,
        name: parsedType,
        teamName: teamName,
        catalogueId: catalogueId,
        catalogueName:
          catalogue && catalogue.name ? String(catalogue.name) : "",
      });
      typeLookup = { _id: "(new)", name: parsedType };
      lookupCache.type[`${String(teamName)}::${catalogueId}::${parsedType}`] =
        typeLookup;
    }

    const oldId = item.type && item.type._id ? String(item.type._id) : "";
    const newId = typeLookup._id === "(new)" ? "(new)" : String(typeLookup._id);
    const oldName = item.type && item.type.name ? String(item.type.name) : "";
    const newName = String(typeLookup.name);

    if (oldId !== newId || oldName !== newName) {
      itemChanges.updates.type = {
        old:
          oldId && oldName
            ? `{ _id: ${oldId}, name: "${oldName}" }`
            : "(missing)",
        new:
          newId === "(new)"
            ? "(will insert)"
            : `{ _id: ${newId}, name: "${newName}" }`,
      };
    }
  }

  // ===== CHECK HEIGHT FIELD =====
  if (parsedHeight) {
    let heightLookup =
      lookupCache.height[
        `${String(teamName)}::${catalogueId}::${parsedHeight}`
      ];
    if (!heightLookup) {
      heightLookup = db.getCollection(LOOKUPS.height).findOne({
        name: parsedHeight,
        teamName: teamName,
        ...(catalogue && catalogue._id
          ? { "catalogue._id": catalogue._id }
          : { catalogue: null }),
      });
      if (heightLookup) {
        lookupCache.height[
          `${String(teamName)}::${catalogueId}::${parsedHeight}`
        ] = {
          _id: heightLookup._id,
          name: heightLookup.name,
        };
      }
    }

    if (!heightLookup) {
      newLookupsToInsert.push({
        collection: LOOKUPS.height,
        name: parsedHeight,
        teamName: teamName,
        catalogueId: catalogueId,
        catalogueName:
          catalogue && catalogue.name ? String(catalogue.name) : "",
      });
      heightLookup = { _id: "(new)", name: parsedHeight };
      lookupCache.height[
        `${String(teamName)}::${catalogueId}::${parsedHeight}`
      ] = heightLookup;
    }

    const oldId = item.height && item.height._id ? String(item.height._id) : "";
    const newId =
      heightLookup._id === "(new)" ? "(new)" : String(heightLookup._id);
    const oldName =
      item.height && item.height.name ? String(item.height.name) : "";
    const newName = String(heightLookup.name);

    if (oldId !== newId || oldName !== newName) {
      itemChanges.updates.height = {
        old:
          oldId && oldName
            ? `{ _id: ${oldId}, name: "${oldName}" }`
            : "(missing)",
        new:
          newId === "(new)"
            ? "(will insert)"
            : `{ _id: ${newId}, name: "${newName}" }`,
      };
    }
  }

  // ===== CHECK LENGTH FIELD =====
  if (parsedLength) {
    let lengthLookup =
      lookupCache.length[
        `${String(teamName)}::${catalogueId}::${parsedLength}`
      ];
    if (!lengthLookup) {
      lengthLookup = db.getCollection(LOOKUPS.length).findOne({
        name: parsedLength,
        teamName: teamName,
        ...(catalogue && catalogue._id
          ? { "catalogue._id": catalogue._id }
          : { catalogue: null }),
      });
      if (lengthLookup) {
        lookupCache.length[
          `${String(teamName)}::${catalogueId}::${parsedLength}`
        ] = {
          _id: lengthLookup._id,
          name: lengthLookup.name,
        };
      }
    }

    if (!lengthLookup) {
      newLookupsToInsert.push({
        collection: LOOKUPS.length,
        name: parsedLength,
        teamName: teamName,
        catalogueId: catalogueId,
        catalogueName:
          catalogue && catalogue.name ? String(catalogue.name) : "",
      });
      lengthLookup = { _id: "(new)", name: parsedLength };
      lookupCache.length[
        `${String(teamName)}::${catalogueId}::${parsedLength}`
      ] = lengthLookup;
    }

    const oldId = item.length && item.length._id ? String(item.length._id) : "";
    const newId =
      lengthLookup._id === "(new)" ? "(new)" : String(lengthLookup._id);
    const oldName =
      item.length && item.length.name ? String(item.length.name) : "";
    const newName = String(lengthLookup.name);

    if (oldId !== newId || oldName !== newName) {
      itemChanges.updates.length = {
        old:
          oldId && oldName
            ? `{ _id: ${oldId}, name: "${oldName}" }`
            : "(missing)",
        new:
          newId === "(new)"
            ? "(will insert)"
            : `{ _id: ${newId}, name: "${newName}" }`,
      };
    }
  }

  // ===== CHECK BOARDSETUP FIELD =====
  if (parsedBoardSetup) {
    let boardLookup =
      lookupCache.boardSetup[
        `${String(teamName)}::${catalogueId}::${parsedBoardSetup}`
      ];
    if (!boardLookup) {
      boardLookup = db.getCollection(LOOKUPS.boardSetup).findOne({
        name: parsedBoardSetup,
        teamName: teamName,
        ...(catalogue && catalogue._id
          ? { "catalogue._id": catalogue._id }
          : { catalogue: null }),
      });
      if (boardLookup) {
        lookupCache.boardSetup[
          `${String(teamName)}::${catalogueId}::${parsedBoardSetup}`
        ] = {
          _id: boardLookup._id,
          name: boardLookup.name,
        };
      }
    }

    if (!boardLookup) {
      newLookupsToInsert.push({
        collection: LOOKUPS.boardSetup,
        name: parsedBoardSetup,
        teamName: teamName,
        catalogueId: catalogueId,
        catalogueName:
          catalogue && catalogue.name ? String(catalogue.name) : "",
      });
      boardLookup = { _id: "(new)", name: parsedBoardSetup };
      lookupCache.boardSetup[
        `${String(teamName)}::${catalogueId}::${parsedBoardSetup}`
      ] = boardLookup;
    }

    const oldId =
      item.boardSetup && item.boardSetup._id ? String(item.boardSetup._id) : "";
    const newId =
      boardLookup._id === "(new)" ? "(new)" : String(boardLookup._id);
    const oldName =
      item.boardSetup && item.boardSetup.name
        ? String(item.boardSetup.name)
        : "";
    const newName = String(boardLookup.name);

    if (oldId !== newId || oldName !== newName) {
      itemChanges.updates.boardSetup = {
        old:
          oldId && oldName
            ? `{ _id: ${oldId}, name: "${oldName}" }`
            : "(missing)",
        new:
          newId === "(new)"
            ? "(will insert)"
            : `{ _id: ${newId}, name: "${newName}" }`,
      };
    }
  }

  // ===== CHECK MATERIAL FIELD =====
  if (parsedMaterial) {
    let materialLookup =
      lookupCache.material[
        `${String(teamName)}::${catalogueId}::${parsedMaterial}`
      ];
    if (!materialLookup) {
      materialLookup = db.getCollection(LOOKUPS.material).findOne({
        name: parsedMaterial,
        teamName: teamName,
        ...(catalogue && catalogue._id
          ? { "catalogue._id": catalogue._id }
          : { catalogue: null }),
      });
      if (materialLookup) {
        lookupCache.material[
          `${String(teamName)}::${catalogueId}::${parsedMaterial}`
        ] = {
          _id: materialLookup._id,
          name: materialLookup.name,
        };
      }
    }

    if (!materialLookup) {
      newLookupsToInsert.push({
        collection: LOOKUPS.material,
        name: parsedMaterial,
        teamName: teamName,
        catalogueId: catalogueId,
        catalogueName:
          catalogue && catalogue.name ? String(catalogue.name) : "",
      });
      materialLookup = { _id: "(new)", name: parsedMaterial };
      lookupCache.material[
        `${String(teamName)}::${catalogueId}::${parsedMaterial}`
      ] = materialLookup;
    }

    const oldId =
      item.material && item.material._id ? String(item.material._id) : "";
    const newId =
      materialLookup._id === "(new)" ? "(new)" : String(materialLookup._id);
    const oldName =
      item.material && item.material.name ? String(item.material.name) : "";
    const newName = String(materialLookup.name);

    if (oldId !== newId || oldName !== newName) {
      itemChanges.updates.material = {
        old:
          oldId && oldName
            ? `{ _id: ${oldId}, name: "${oldName}" }`
            : "(missing)",
        new:
          newId === "(new)"
            ? "(will insert)"
            : `{ _id: ${newId}, name: "${newName}" }`,
      };
    }
  }

  // ===== CHECK LIFT FIELD =====
  if (parsedLift) {
    let liftLookup =
      lookupCache.lift[`${String(teamName)}::${catalogueId}::${parsedLift}`];
    if (!liftLookup) {
      liftLookup = db.getCollection(LOOKUPS.lift).findOne({
        name: parsedLift,
        teamName: teamName,
        ...(catalogue && catalogue._id
          ? { "catalogue._id": catalogue._id }
          : { catalogue: null }),
      });
      if (liftLookup) {
        lookupCache.lift[`${String(teamName)}::${catalogueId}::${parsedLift}`] =
          {
            _id: liftLookup._id,
            name: liftLookup.name,
          };
      }
    }

    if (!liftLookup) {
      newLookupsToInsert.push({
        collection: LOOKUPS.lift,
        name: parsedLift,
        teamName: teamName,
        catalogueId: catalogueId,
        catalogueName:
          catalogue && catalogue.name ? String(catalogue.name) : "",
      });
      liftLookup = { _id: "(new)", name: parsedLift };
      lookupCache.lift[`${String(teamName)}::${catalogueId}::${parsedLift}`] =
        liftLookup;
    }

    const oldId = item.lift && item.lift._id ? String(item.lift._id) : "";
    const newId = liftLookup._id === "(new)" ? "(new)" : String(liftLookup._id);
    const oldName = item.lift && item.lift.name ? String(item.lift.name) : "";
    const newName = String(liftLookup.name);

    if (oldId !== newId || oldName !== newName) {
      itemChanges.updates.lift = {
        old:
          oldId && oldName
            ? `{ _id: ${oldId}, name: "${oldName}" }`
            : "(missing)",
        new:
          newId === "(new)"
            ? "(will insert)"
            : `{ _id: ${newId}, name: "${newName}" }`,
      };
    }
  }

  // Skip if nothing changed
  if (Object.keys(itemChanges.updates).length === 0) {
    unchanged++;
    return;
  }

  toUpdate++;
  changeLog.push(itemChanges);

  if (scanned % 500 === 0) {
    print(
      "[PROGRESS] Scanned=" +
        scanned +
        " ToUpdate=" +
        toUpdate +
        " Unchanged=" +
        unchanged +
        " Skipped=" +
        skipped,
    );
  }
});

print("[STEP 5] ✓ Analysis complete");

// ========== FINAL REPORT ==========
print("================================================================");
print("[AUDIT] CHANGE REPORT - READ-ONLY PREVIEW");
print("================================================================");
print("Total items scanned      : " + scanned);
print("Items to update          : " + toUpdate);
print("Items unchanged          : " + unchanged);
print("Items skipped            : " + skipped);
print("Lookup docs to insert    : " + newLookupsToInsert.length);
print("================================================================");

// Report new lookups by collection
if (newLookupsToInsert.length > 0) {
  print("[AUDIT] NEW LOOKUP DOCUMENTS TO CREATE:");
  const byCollection = {};
  for (const lookup of newLookupsToInsert) {
    if (!byCollection[lookup.collection]) byCollection[lookup.collection] = [];
    byCollection[lookup.collection].push(lookup);
  }
  for (const [coll, entries] of Object.entries(byCollection)) {
    const uniqueMap = {};
    entries.forEach((entry) => {
      const key =
        String(entry.teamName) +
        "::" +
        String(entry.catalogueId || "") +
        "::" +
        String(entry.name);
      if (!uniqueMap[key]) uniqueMap[key] = entry;
    });
    const unique = Object.values(uniqueMap);

    print("  " + coll + ": " + unique.length + " unique value(s)");
    for (const entry of unique.slice(0, 5)) {
      print(
        '    - "' +
          entry.name +
          '" [team=' +
          entry.teamName +
          ", catalogue=" +
          (entry.catalogueName || "(null)") +
          "]",
      );
    }
    if (unique.length > 5) {
      print("    ... and " + (unique.length - 5) + " more");
    }
  }
  print("================================================================");
}

// Report detailed changes (first 20 items if > 20, otherwise all)
if (changeLog.length > 0) {
  const showCount = Math.min(changeLog.length, 20);
  print(
    "[AUDIT] ITEM CHANGES - DETAILED VIEW (first " +
      showCount +
      " of " +
      changeLog.length +
      "):",
  );
  for (let i = 0; i < showCount; i++) {
    const change = changeLog[i];
    print("");
    print(
      '  Item: "' +
        change.itemName +
        '" (ID: ' +
        change.itemId +
        ") [team: " +
        change.teamName +
        "]",
    );
    for (const [field, delta] of Object.entries(change.updates)) {
      print("    " + field + ":");
      print("      OLD: " + delta.old);
      print("      NEW: " + delta.new);
    }
  }
  if (changeLog.length > 20) {
    print("");
    print(
      "  ... and " + (changeLog.length - 20) + " more item(s) with changes",
    );
  }
  print("================================================================");
}

print("[DONE] Audit complete - no data was modified");
print("================================================================");
