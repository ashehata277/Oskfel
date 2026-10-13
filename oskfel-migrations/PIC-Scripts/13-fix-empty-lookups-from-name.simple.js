// =============================================================================
// FIX SCRIPT (SIMPLIFIED): Repair empty/malformed lookup refs on Jobs:Items
// =============================================================================
// Parses item names and fills in 7 broken lookup fields across all collections
// Only updates items where old and new values differ (skips unchanged items)
//
// Run: mongosh <connection-string> PIC-Scripts/13-fix-empty-lookups-from-name.simple.js
// =============================================================================

const ITEMS_COLLECTION = "Jobs:Items";
const BULK_SIZE = 1000;
const LOG_EVERY = 2000;
// ========== LOOKUP COLLECTIONS ==========
// 7 collections to populate with reference documents
// =========================================
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
// Store all existing lookups in RAM for fast access
// key = "teamName::value" → { _id, name }
// ====================================
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

const FLOOR_LEVEL_PATTERN =
  "\\d+(?:st|nd|rd|th)|Upper Ground|Lower Ground|Ground|Basement|Mezzanine|Roof|Podium|Parapet";

function normalizeFloorValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ========== STEP 1: Load all existing lookups into cache ==========
// This avoids per-document database queries during processing
// Dramatically speeds up 199k items processing
// ==================================================================
print("[STEP 1] Loading all lookups into memory caches...");

// Load floor lookups: teamName::value → { _id, name }
db.getCollection(LOOKUPS.floor)
  .find(
    { teamName: { $exists: true }, name: { $type: "string", $ne: "" } },
    { _id: 1, teamName: 1, name: 1, catalogue: 1 },
  )
  .forEach((doc) => {
    const normalizedFloorName = normalizeFloorValue(doc.name);
    const k = `${String(doc.teamName)}::${String(doc.catalogue && doc.catalogue._id ? doc.catalogue._id : "")}::${normalizedFloorName}`;
    lookupCache.floor[k] = { _id: doc._id, name: doc.name };
  });

// Load type, height, length, boardSetup, material, lift lookups (same pattern)
["type", "height", "length", "boardSetup", "material", "lift"].forEach(
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
  "[STEP 1] ✓ Loaded lookups: floor=" +
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

// ========== STEP 2: Load type and material options for parsing ==========
// These are used to match type/material values in item names
// Sort by length (longest first) so exact matches work correctly
// ========================================================================
print("[STEP 2] Loading type and material options for name parsing...");

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

// ========== STEP 3: Query for all items with broken lookups ==========
// A "broken" item has any of the 7 fields as null, missing, or empty
// =====================================================================
print("[STEP 3] Finding items with empty/broken lookup fields...");

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
print("[STEP 3] ✓ Found " + total + " items needing repair");

// ========== STEP 4: Main loop - process each broken item ==========
// For each item:
//   1. Parse the name to extract all 7 field values
//   2. Get or create lookup documents for parsed values
//   3. Compare old vs new values
//   4. Only update if values differ (skip if old === new)
//   5. Batch updates for performance
// ===================================================================
print("[STEP 4] Processing " + total + " items...");

let scanned = 0;
let updated = 0;
let skipped = 0;
let unchanged = 0;
let insertedLookups = 0;
let updateOps = [];

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

  // Extract LIFT: "1st Lift", "Ground Lift", "Basement Lift", etc.
  let parsedLift = null;
  const liftMatch = title.match(
    new RegExp(`(?<![\\w-])(${FLOOR_LEVEL_PATTERN})\\s+Lift(?![\\w-])`, "i"),
  );
  if (liftMatch) parsedLift = liftMatch[1].trim();

  // Extract TYPE: match against type options in database
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

  // Remove type from title before extracting other fields
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

  // Extract FLOOR: "2nd Floor", "Basement Floor"
  let parsedFloor = null;
  const floorMatch = titleWithoutType.match(
    new RegExp(`(?<![\\w-])(${FLOOR_LEVEL_PATTERN})\\s+floor(?![\\w-])`, "i"),
  );
  if (floorMatch) parsedFloor = normalizeFloorValue(floorMatch[1]);

  // Extract HEIGHT: "Up to 1.8m in Height", "1.8m to 2.5m in Height"
  let parsedHeight = null;
  const heightMatch = title.match(
    /(Upto\s+\d+(?:\.\d+)?m|Up\s+to\s+\d+(?:\.\d+)?m|\d+(?:\.\d+)?m\s+to\s+\d+(?:\.\d+)?m)\s+in\s+Height/i,
  );
  if (heightMatch)
    parsedHeight = heightMatch[1].replace(/\bUpto\b/i, "Up to").trim();

  // Extract LENGTH: "up to 5m in Length" or "3m x 4m"
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

  // Extract BOARDSETUP: "5+2 Boards" or "Fully Boarded"
  let parsedBoardSetup = null;
  const boardMatch = title.match(/\b(\d+\+\d+)\s+Boards\b/i);
  if (boardMatch) {
    parsedBoardSetup = boardMatch[1];
  } else if (/Fully\s+Boarded/i.test(title)) {
    parsedBoardSetup = "Fully";
  }

  // Extract MATERIAL: match against material options in database
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

  // ===== BUILD UPDATE DOCUMENT - ONLY INCLUDE FIELDS THAT DIFFER =====
  const updates = {};

  // ===== CHECK FLOOR FIELD =====
  if (parsedFloor) {
    // Check cache first, then database for existing lookup
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

    // If lookup doesn't exist, create it
    if (!floorLookup) {
      const newId = new ObjectId();
      const doc = {
        _id: newId,
        teamName: teamName,
        name: parsedFloor,
        catalogue: catalogue || null,
        isDeleted: false,
        createdDate: new Date(),
        creator: null,
      };
      db.getCollection(LOOKUPS.floor).insertOne(doc);
      lookupCache.floor[`${String(teamName)}::${catalogueId}::${parsedFloor}`] =
        {
          _id: newId,
          name: parsedFloor,
        };
      floorLookup = {
        _id: newId,
        name: parsedFloor,
      };
      insertedLookups++;
    }

    // Compare old vs new
    const oldId = item.floor && item.floor._id ? String(item.floor._id) : "";
    const newId = String(floorLookup._id);
    const oldName =
      item.floor && item.floor.name ? String(item.floor.name) : "";
    const newName = String(floorLookup.name);

    if (oldId !== newId || oldName !== newName) {
      updates.floor = floorLookup;
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
      const newId = new ObjectId();
      const doc = {
        _id: newId,
        teamName: teamName,
        name: parsedType,
        catalogue: catalogue || null,
        isDeleted: false,
        createdDate: new Date(),
        creator: null,
      };
      db.getCollection(LOOKUPS.type).insertOne(doc);
      lookupCache.type[`${String(teamName)}::${catalogueId}::${parsedType}`] = {
        _id: newId,
        name: parsedType,
      };
      typeLookup = {
        _id: newId,
        name: parsedType,
      };
      insertedLookups++;
    }

    const oldId = item.type && item.type._id ? String(item.type._id) : "";
    const newId = String(typeLookup._id);
    const oldName = item.type && item.type.name ? String(item.type.name) : "";
    const newName = String(typeLookup.name);

    if (oldId !== newId || oldName !== newName) {
      updates.type = typeLookup;
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
      const newId = new ObjectId();
      const doc = {
        _id: newId,
        teamName: teamName,
        name: parsedHeight,
        catalogue: catalogue || null,
        isDeleted: false,
        createdDate: new Date(),
        creator: null,
      };
      db.getCollection(LOOKUPS.height).insertOne(doc);
      lookupCache.height[
        `${String(teamName)}::${catalogueId}::${parsedHeight}`
      ] = {
        _id: newId,
        name: parsedHeight,
      };
      heightLookup = {
        _id: newId,
        name: parsedHeight,
      };
      insertedLookups++;
    }

    const oldId = item.height && item.height._id ? String(item.height._id) : "";
    const newId = String(heightLookup._id);
    const oldName =
      item.height && item.height.name ? String(item.height.name) : "";
    const newName = String(heightLookup.name);

    if (oldId !== newId || oldName !== newName) {
      updates.height = heightLookup;
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
      const newId = new ObjectId();
      const doc = {
        _id: newId,
        teamName: teamName,
        name: parsedLength,
        catalogue: catalogue || null,
        isDeleted: false,
        createdDate: new Date(),
        creator: null,
      };
      db.getCollection(LOOKUPS.length).insertOne(doc);
      lookupCache.length[
        `${String(teamName)}::${catalogueId}::${parsedLength}`
      ] = {
        _id: newId,
        name: parsedLength,
      };
      lengthLookup = {
        _id: newId,
        name: parsedLength,
      };
      insertedLookups++;
    }

    const oldId = item.length && item.length._id ? String(item.length._id) : "";
    const newId = String(lengthLookup._id);
    const oldName =
      item.length && item.length.name ? String(item.length.name) : "";
    const newName = String(lengthLookup.name);

    if (oldId !== newId || oldName !== newName) {
      updates.length = lengthLookup;
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
      const newId = new ObjectId();
      const doc = {
        _id: newId,
        teamName: teamName,
        name: parsedBoardSetup,
        catalogue: catalogue || null,
        isDeleted: false,
        createdDate: new Date(),
        creator: null,
      };
      db.getCollection(LOOKUPS.boardSetup).insertOne(doc);
      lookupCache.boardSetup[
        `${String(teamName)}::${catalogueId}::${parsedBoardSetup}`
      ] = {
        _id: newId,
        name: parsedBoardSetup,
      };
      boardLookup = {
        _id: newId,
        name: parsedBoardSetup,
      };
      insertedLookups++;
    }

    const oldId =
      item.boardSetup && item.boardSetup._id ? String(item.boardSetup._id) : "";
    const newId = String(boardLookup._id);
    const oldName =
      item.boardSetup && item.boardSetup.name
        ? String(item.boardSetup.name)
        : "";
    const newName = String(boardLookup.name);

    if (oldId !== newId || oldName !== newName) {
      updates.boardSetup = boardLookup;
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
      const newId = new ObjectId();
      const doc = {
        _id: newId,
        teamName: teamName,
        name: parsedMaterial,
        catalogue: catalogue || null,
        isDeleted: false,
        createdDate: new Date(),
        creator: null,
      };
      db.getCollection(LOOKUPS.material).insertOne(doc);
      lookupCache.material[
        `${String(teamName)}::${catalogueId}::${parsedMaterial}`
      ] = {
        _id: newId,
        name: parsedMaterial,
      };
      materialLookup = {
        _id: newId,
        name: parsedMaterial,
      };
      insertedLookups++;
    }

    const oldId =
      item.material && item.material._id ? String(item.material._id) : "";
    const newId = String(materialLookup._id);
    const oldName =
      item.material && item.material.name ? String(item.material.name) : "";
    const newName = String(materialLookup.name);

    if (oldId !== newId || oldName !== newName) {
      updates.material = materialLookup;
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
      const newId = new ObjectId();
      const doc = {
        _id: newId,
        teamName: teamName,
        name: parsedLift,
        catalogue: catalogue || null,
        isDeleted: false,
        createdDate: new Date(),
        creator: null,
      };
      db.getCollection(LOOKUPS.lift).insertOne(doc);
      lookupCache.lift[`${String(teamName)}::${catalogueId}::${parsedLift}`] = {
        _id: newId,
        name: parsedLift,
      };
      liftLookup = {
        _id: newId,
        name: parsedLift,
      };
      insertedLookups++;
    }

    const oldId = item.lift && item.lift._id ? String(item.lift._id) : "";
    const newId = String(liftLookup._id);
    const oldName = item.lift && item.lift.name ? String(item.lift.name) : "";
    const newName = String(liftLookup.name);

    if (oldId !== newId || oldName !== newName) {
      updates.lift = liftLookup;
    }
  }

  // Skip if nothing changed
  if (Object.keys(updates).length === 0) {
    unchanged++;
    return;
  }

  // Queue for batch update
  updateOps.push({
    updateOne: {
      filter: { _id: item._id },
      update: { $set: updates },
    },
  });

  // Flush batch when reaching size limit
  if (updateOps.length >= BULK_SIZE) {
    const result = db
      .getCollection(ITEMS_COLLECTION)
      .bulkWrite(updateOps, { ordered: false });
    updated += result.modifiedCount || 0;
    updateOps = [];
  }

  // Log progress
  if (scanned % LOG_EVERY === 0) {
    print(
      "[PROGRESS] Scanned=" +
        scanned +
        " Updated=" +
        updated +
        " Unchanged=" +
        unchanged +
        " Skipped=" +
        skipped +
        " Pending=" +
        updateOps.length,
    );
  }
});

// Flush remaining batch operations
if (updateOps.length > 0) {
  const result = db
    .getCollection(ITEMS_COLLECTION)
    .bulkWrite(updateOps, { ordered: false });
  updated += result.modifiedCount || 0;
}

print("[STEP 4] ✓ Processing complete");

// ========== FINAL SUMMARY ==========
print("================================================================");
print("[DONE] Empty/malformed lookup repair finished");
print("       Scanned items      : " + scanned);
print("       Updated items      : " + updated);
print("       Unchanged items    : " + unchanged);
print("       Skipped items      : " + skipped);
print("       Lookups inserted   : " + insertedLookups);
print("================================================================");
