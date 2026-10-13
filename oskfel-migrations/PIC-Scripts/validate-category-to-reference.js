// =============================================================================
// VALIDATION SCRIPT: PIC migration completeness — all reference fields
// =============================================================================
// Checks every collection and path touched by:
//   03-migrate-items-category-to-reference.optimized.js    (category)
//   04-migrate-items-name-fields.optimized.js               (floor, type, height,
//                                                            length, boardSetup,
//                                                            material, lift)
//   05-migrate-sections-floor-to-reference.optimized.js    (pricedItem.floor)
//   06-migrate-events-category-to-reference.optimized.js   (category in events)
//   07-migrate-events-name-fields.optimized.js              (name fields in events)
//   08-migrate-events-floor-to-reference.optimized.js      (floor in events)
//
// A count of 0 → PASS (field is fully migrated to reference object).
// A non-zero count → FAIL (string values remain; re-run the relevant script).
// A count of -1  → ERROR (query itself threw; see ERROR lines above).
//
// Run with: mongosh <connection-string> validate-category-to-reference.js
// =============================================================================

const _start = new Date();
const ts    = () => new Date().toISOString();
const sep   = () => print(`[${ts()}] [INFO ] ${'─'.repeat(72)}`);
const info  = (m) => print(`[${ts()}] [INFO ] ${m}`);
const warn  = (m) => print(`[${ts()}] [WARN ] ${m}`);
const pass  = (m) => print(`[${ts()}] [PASS ] ${m}`);
const fail  = (m) => print(`[${ts()}] [FAIL ] ${m}`);
const error = (m) => print(`[${ts()}] [ERROR] ${m}`);

const results = {};

// -----------------------------------------------------------------------------
// CHECK 1 — Jobs:Items  ·  category + name fields (all top-level)
// -----------------------------------------------------------------------------
sep();
info('CHECK 1 — Jobs:Items  →  category, floor, type, height, length, boardSetup, material, lift');
try {
  const c1 = db['Jobs:Items'].countDocuments({ $or: [
    { category:   { $type: 'string' } },
    { floor:      { $type: 'string' } },
    { type:       { $type: 'string' } },
    { height:     { $type: 'string' } },
    { length:     { $type: 'string' } },
    { boardSetup: { $type: 'string' } },
    { material:   { $type: 'string' } },
    { lift:       { $type: 'string' } },
  ]});
  results['Jobs:Items'] = c1;
  if (c1 > 0) {
    fail(`${c1} document(s) still have a reference field as string`);
    try {
      const s1 = db['Jobs:Items'].findOne({ $or: [
        { category: { $type: 'string' } }, { floor: { $type: 'string' } },
        { type: { $type: 'string' } }, { height: { $type: 'string' } },
        { length: { $type: 'string' } }, { boardSetup: { $type: 'string' } },
        { material: { $type: 'string' } }, { lift: { $type: 'string' } },
      ]}, { _id: 1, teamName: 1, category: 1, floor: 1, material: 1, lift: 1 });
      warn(`  Sample → _id=${s1._id}  teamName=${s1.teamName}`);
    } catch (e) { error(`  Sample query failed → ${e.message}`); }
    try {
      info('  Details — per-field string counts grouped by teamName (top 10):');
      db['Jobs:Items'].aggregate([
        { $match: { $or: [
          { category: { $type: 'string' } }, { floor: { $type: 'string' } },
          { type: { $type: 'string' } }, { height: { $type: 'string' } },
          { length: { $type: 'string' } }, { boardSetup: { $type: 'string' } },
          { material: { $type: 'string' } }, { lift: { $type: 'string' } },
        ]}},
        { $group: {
          _id: '$teamName',
          category:   { $sum: { $cond: [{ $eq: [{ $type: '$category'   }, 'string'] }, 1, 0] } },
          floor:      { $sum: { $cond: [{ $eq: [{ $type: '$floor'      }, 'string'] }, 1, 0] } },
          type:       { $sum: { $cond: [{ $eq: [{ $type: '$type'       }, 'string'] }, 1, 0] } },
          height:     { $sum: { $cond: [{ $eq: [{ $type: '$height'     }, 'string'] }, 1, 0] } },
          length:     { $sum: { $cond: [{ $eq: [{ $type: '$length'     }, 'string'] }, 1, 0] } },
          boardSetup: { $sum: { $cond: [{ $eq: [{ $type: '$boardSetup' }, 'string'] }, 1, 0] } },
          material:   { $sum: { $cond: [{ $eq: [{ $type: '$material'   }, 'string'] }, 1, 0] } },
          lift:       { $sum: { $cond: [{ $eq: [{ $type: '$lift'       }, 'string'] }, 1, 0] } },
        }},
        { $sort: { _id: 1 } },
        { $limit: 10 },
      ]).forEach(r => warn(`    teamName=${r._id}  category=${r.category}  floor=${r.floor}  type=${r.type}  height=${r.height}  length=${r.length}  boardSetup=${r.boardSetup}  material=${r.material}  lift=${r.lift}`));
    } catch (e) { error(`  Details query failed → ${e.message}`); }
  } else {
    pass('no string reference field values remaining in Jobs:Items');
  }
} catch (e) {
  error(`CHECK 1 failed → ${e.message}`);
  results['Jobs:Items'] = -1;
}

// -----------------------------------------------------------------------------
// CHECK 2 — Jobs:Sections  ·  category + name fields (camelCase & PascalCase paths)
// -----------------------------------------------------------------------------
sep();
info('CHECK 2 — Jobs:Sections  →  items[].pricedItem.* (camelCase) + Items[].PricedItem.* (PascalCase)');
try {
  const c2 = db['Jobs:Sections'].countDocuments({ $or: [
    { 'items.pricedItem.category':   { $type: 'string' } },
    { 'items.pricedItem.floor':      { $type: 'string' } },
    { 'items.pricedItem.type':       { $type: 'string' } },
    { 'items.pricedItem.height':     { $type: 'string' } },
    { 'items.pricedItem.length':     { $type: 'string' } },
    { 'items.pricedItem.boardSetup': { $type: 'string' } },
    { 'items.pricedItem.material':   { $type: 'string' } },
    { 'items.pricedItem.lift':       { $type: 'string' } },
    { 'Items.PricedItem.Floor':      { $type: 'string' } },
    { 'Items.PricedItem.Type':       { $type: 'string' } },
    { 'Items.PricedItem.Height':     { $type: 'string' } },
    { 'Items.PricedItem.Length':     { $type: 'string' } },
    { 'Items.PricedItem.BoardSetup': { $type: 'string' } },
    { 'Items.PricedItem.Material':   { $type: 'string' } },
    { 'Items.PricedItem.Lift':       { $type: 'string' } },
  ]});
  results['Jobs:Sections'] = c2;
  if (c2 > 0) {
    fail(`${c2} document(s) still have a reference field as string`);
    try {
      const s2 = db['Jobs:Sections'].findOne({ $or: [
        { 'items.pricedItem.category': { $type: 'string' } },
        { 'items.pricedItem.floor':    { $type: 'string' } },
        { 'Items.PricedItem.Floor':    { $type: 'string' } },
      ]}, { _id: 1, teamName: 1 });
      warn(`  Sample → _id=${s2._id}  teamName=${s2.teamName}`);
    } catch (e) { error(`  Sample query failed → ${e.message}`); }
    try {
      info('  Details (camelCase path) — per-field string counts grouped by teamName (top 10):');
      db['Jobs:Sections'].aggregate([
        { $unwind: '$items' },
        { $match: { $or: [
          { 'items.pricedItem.category': { $type: 'string' } },
          { 'items.pricedItem.floor':    { $type: 'string' } },
          { 'items.pricedItem.type':     { $type: 'string' } },
          { 'items.pricedItem.height':   { $type: 'string' } },
          { 'items.pricedItem.length':   { $type: 'string' } },
          { 'items.pricedItem.boardSetup': { $type: 'string' } },
          { 'items.pricedItem.material': { $type: 'string' } },
          { 'items.pricedItem.lift':     { $type: 'string' } },
        ]}},
        { $group: {
          _id: '$teamName',
          category:   { $sum: { $cond: [{ $eq: [{ $type: '$items.pricedItem.category'   }, 'string'] }, 1, 0] } },
          floor:      { $sum: { $cond: [{ $eq: [{ $type: '$items.pricedItem.floor'      }, 'string'] }, 1, 0] } },
          type:       { $sum: { $cond: [{ $eq: [{ $type: '$items.pricedItem.type'       }, 'string'] }, 1, 0] } },
          height:     { $sum: { $cond: [{ $eq: [{ $type: '$items.pricedItem.height'     }, 'string'] }, 1, 0] } },
          length:     { $sum: { $cond: [{ $eq: [{ $type: '$items.pricedItem.length'     }, 'string'] }, 1, 0] } },
          boardSetup: { $sum: { $cond: [{ $eq: [{ $type: '$items.pricedItem.boardSetup' }, 'string'] }, 1, 0] } },
          material:   { $sum: { $cond: [{ $eq: [{ $type: '$items.pricedItem.material'   }, 'string'] }, 1, 0] } },
          lift:       { $sum: { $cond: [{ $eq: [{ $type: '$items.pricedItem.lift'       }, 'string'] }, 1, 0] } },
        }},
        { $sort: { _id: 1 } },
        { $limit: 10 },
      ], { allowDiskUse: true }).forEach(r => warn(`    teamName=${r._id}  category=${r.category}  floor=${r.floor}  type=${r.type}  height=${r.height}  length=${r.length}  boardSetup=${r.boardSetup}  material=${r.material}  lift=${r.lift}`));
    } catch (e) { error(`  Details (camelCase) query failed → ${e.message}`); }
    try {
      info('  Details (PascalCase path) — per-field string counts grouped by teamName (top 10):');
      db['Jobs:Sections'].aggregate([
        { $unwind: '$Items' },
        { $match: { $or: [
          { 'Items.PricedItem.Floor':      { $type: 'string' } },
          { 'Items.PricedItem.Type':       { $type: 'string' } },
          { 'Items.PricedItem.Height':     { $type: 'string' } },
          { 'Items.PricedItem.Length':     { $type: 'string' } },
          { 'Items.PricedItem.BoardSetup': { $type: 'string' } },
          { 'Items.PricedItem.Material':   { $type: 'string' } },
          { 'Items.PricedItem.Lift':       { $type: 'string' } },
        ]}},
        { $group: {
          _id: '$teamName',
          Floor:      { $sum: { $cond: [{ $eq: [{ $type: '$Items.PricedItem.Floor'      }, 'string'] }, 1, 0] } },
          Type:       { $sum: { $cond: [{ $eq: [{ $type: '$Items.PricedItem.Type'       }, 'string'] }, 1, 0] } },
          Height:     { $sum: { $cond: [{ $eq: [{ $type: '$Items.PricedItem.Height'     }, 'string'] }, 1, 0] } },
          Length:     { $sum: { $cond: [{ $eq: [{ $type: '$Items.PricedItem.Length'     }, 'string'] }, 1, 0] } },
          BoardSetup: { $sum: { $cond: [{ $eq: [{ $type: '$Items.PricedItem.BoardSetup' }, 'string'] }, 1, 0] } },
          Material:   { $sum: { $cond: [{ $eq: [{ $type: '$Items.PricedItem.Material'   }, 'string'] }, 1, 0] } },
          Lift:       { $sum: { $cond: [{ $eq: [{ $type: '$Items.PricedItem.Lift'       }, 'string'] }, 1, 0] } },
        }},
        { $sort: { _id: 1 } },
        { $limit: 10 },
      ], { allowDiskUse: true }).forEach(r => warn(`    teamName=${r._id}  Floor=${r.Floor}  Type=${r.Type}  Height=${r.Height}  Length=${r.Length}  BoardSetup=${r.BoardSetup}  Material=${r.Material}  Lift=${r.Lift}`));
    } catch (e) { error(`  Details (PascalCase) query failed → ${e.message}`); }
  } else {
    pass('no string reference field values remaining in Jobs:Sections');
  }
} catch (e) {
  error(`CHECK 2 failed → ${e.message}`);
  results['Jobs:Sections'] = -1;
}

// -----------------------------------------------------------------------------
// CHECK 3 — ActiveWork:ActiveWorkRecords  ·  category + name fields
// -----------------------------------------------------------------------------
sep();
info('CHECK 3 — ActiveWork:ActiveWorkRecords  →  OperationalGroups[].Items[].PricedItem.{Category,Floor,...,Lift}');
try {
  const c3 = db['ActiveWork:ActiveWorkRecords'].countDocuments({ $or: [
    { 'OperationalGroups.Items.PricedItem.Category':   { $type: 'string' } },
    { 'OperationalGroups.Items.PricedItem.Floor':      { $type: 'string' } },
    { 'OperationalGroups.Items.PricedItem.Type':       { $type: 'string' } },
    { 'OperationalGroups.Items.PricedItem.Height':     { $type: 'string' } },
    { 'OperationalGroups.Items.PricedItem.Length':     { $type: 'string' } },
    { 'OperationalGroups.Items.PricedItem.BoardSetup': { $type: 'string' } },
    { 'OperationalGroups.Items.PricedItem.Material':   { $type: 'string' } },
    { 'OperationalGroups.Items.PricedItem.Lift':       { $type: 'string' } },
  ]});
  results['ActiveWork:ActiveWorkRecords'] = c3;
  if (c3 > 0) {
    fail(`${c3} document(s) still have a reference field as string`);
    try {
      const s3 = db['ActiveWork:ActiveWorkRecords'].findOne({ $or: [
        { 'OperationalGroups.Items.PricedItem.Category': { $type: 'string' } },
        { 'OperationalGroups.Items.PricedItem.Floor':    { $type: 'string' } },
        { 'OperationalGroups.Items.PricedItem.Lift':     { $type: 'string' } },
      ]}, { _id: 1, TeamName: 1 });
      warn(`  Sample → _id=${s3._id}  TeamName=${s3.TeamName}`);
    } catch (e) { error(`  Sample query failed → ${e.message}`); }
    try {
      info('  Details — per-field string counts grouped by TeamName (top 10):');
      db['ActiveWork:ActiveWorkRecords'].aggregate([
        { $unwind: '$OperationalGroups' },
        { $unwind: '$OperationalGroups.Items' },
        { $match: { $or: [
          { 'OperationalGroups.Items.PricedItem.Category':   { $type: 'string' } },
          { 'OperationalGroups.Items.PricedItem.Floor':      { $type: 'string' } },
          { 'OperationalGroups.Items.PricedItem.Type':       { $type: 'string' } },
          { 'OperationalGroups.Items.PricedItem.Height':     { $type: 'string' } },
          { 'OperationalGroups.Items.PricedItem.Length':     { $type: 'string' } },
          { 'OperationalGroups.Items.PricedItem.BoardSetup': { $type: 'string' } },
          { 'OperationalGroups.Items.PricedItem.Material':   { $type: 'string' } },
          { 'OperationalGroups.Items.PricedItem.Lift':       { $type: 'string' } },
        ]}},
        { $group: {
          _id: '$TeamName',
          Category:   { $sum: { $cond: [{ $eq: [{ $type: '$OperationalGroups.Items.PricedItem.Category'   }, 'string'] }, 1, 0] } },
          Floor:      { $sum: { $cond: [{ $eq: [{ $type: '$OperationalGroups.Items.PricedItem.Floor'      }, 'string'] }, 1, 0] } },
          Type:       { $sum: { $cond: [{ $eq: [{ $type: '$OperationalGroups.Items.PricedItem.Type'       }, 'string'] }, 1, 0] } },
          Height:     { $sum: { $cond: [{ $eq: [{ $type: '$OperationalGroups.Items.PricedItem.Height'     }, 'string'] }, 1, 0] } },
          Length:     { $sum: { $cond: [{ $eq: [{ $type: '$OperationalGroups.Items.PricedItem.Length'     }, 'string'] }, 1, 0] } },
          BoardSetup: { $sum: { $cond: [{ $eq: [{ $type: '$OperationalGroups.Items.PricedItem.BoardSetup' }, 'string'] }, 1, 0] } },
          Material:   { $sum: { $cond: [{ $eq: [{ $type: '$OperationalGroups.Items.PricedItem.Material'   }, 'string'] }, 1, 0] } },
          Lift:       { $sum: { $cond: [{ $eq: [{ $type: '$OperationalGroups.Items.PricedItem.Lift'       }, 'string'] }, 1, 0] } },
        }},
        { $sort: { _id: 1 } },
        { $limit: 10 },
      ], { allowDiskUse: true }).forEach(r => warn(`    TeamName=${r._id}  Category=${r.Category}  Floor=${r.Floor}  Type=${r.Type}  Height=${r.Height}  Length=${r.Length}  BoardSetup=${r.BoardSetup}  Material=${r.Material}  Lift=${r.Lift}`));
    } catch (e) { error(`  Details query failed → ${e.message}`); }
  } else {
    pass('no string reference field values remaining in ActiveWork:ActiveWorkRecords');
  }
} catch (e) {
  error(`CHECK 3 failed → ${e.message}`);
  results['ActiveWork:ActiveWorkRecords'] = -1;
}

// -----------------------------------------------------------------------------
// CHECK 4 — Handovers:Handovers  ·  category + name fields
// -----------------------------------------------------------------------------
sep();
info('CHECK 4 — Handovers:Handovers  →  OperationalGroups[].Items[].PricedItem.{Category,Floor,...,Lift}');
try {
  const c4 = db['Handovers:Handovers'].countDocuments({ $or: [
    { 'OperationalGroups.Items.PricedItem.Category':   { $type: 'string' } },
    { 'OperationalGroups.Items.PricedItem.Floor':      { $type: 'string' } },
    { 'OperationalGroups.Items.PricedItem.Type':       { $type: 'string' } },
    { 'OperationalGroups.Items.PricedItem.Height':     { $type: 'string' } },
    { 'OperationalGroups.Items.PricedItem.Length':     { $type: 'string' } },
    { 'OperationalGroups.Items.PricedItem.BoardSetup': { $type: 'string' } },
    { 'OperationalGroups.Items.PricedItem.Material':   { $type: 'string' } },
    { 'OperationalGroups.Items.PricedItem.Lift':       { $type: 'string' } },
  ]});
  results['Handovers:Handovers'] = c4;
  if (c4 > 0) {
    fail(`${c4} document(s) still have a reference field as string`);
    try {
      const s4 = db['Handovers:Handovers'].findOne({ $or: [
        { 'OperationalGroups.Items.PricedItem.Category': { $type: 'string' } },
        { 'OperationalGroups.Items.PricedItem.Floor':    { $type: 'string' } },
        { 'OperationalGroups.Items.PricedItem.Lift':     { $type: 'string' } },
      ]}, { _id: 1, TeamName: 1 });
      warn(`  Sample → _id=${s4._id}  TeamName=${s4.TeamName}`);
    } catch (e) { error(`  Sample query failed → ${e.message}`); }
    try {
      info('  Details — per-field string counts grouped by TeamName (top 10):');
      db['Handovers:Handovers'].aggregate([
        { $unwind: '$OperationalGroups' },
        { $unwind: '$OperationalGroups.Items' },
        { $match: { $or: [
          { 'OperationalGroups.Items.PricedItem.Category':   { $type: 'string' } },
          { 'OperationalGroups.Items.PricedItem.Floor':      { $type: 'string' } },
          { 'OperationalGroups.Items.PricedItem.Type':       { $type: 'string' } },
          { 'OperationalGroups.Items.PricedItem.Height':     { $type: 'string' } },
          { 'OperationalGroups.Items.PricedItem.Length':     { $type: 'string' } },
          { 'OperationalGroups.Items.PricedItem.BoardSetup': { $type: 'string' } },
          { 'OperationalGroups.Items.PricedItem.Material':   { $type: 'string' } },
          { 'OperationalGroups.Items.PricedItem.Lift':       { $type: 'string' } },
        ]}},
        { $group: {
          _id: '$TeamName',
          Category:   { $sum: { $cond: [{ $eq: [{ $type: '$OperationalGroups.Items.PricedItem.Category'   }, 'string'] }, 1, 0] } },
          Floor:      { $sum: { $cond: [{ $eq: [{ $type: '$OperationalGroups.Items.PricedItem.Floor'      }, 'string'] }, 1, 0] } },
          Type:       { $sum: { $cond: [{ $eq: [{ $type: '$OperationalGroups.Items.PricedItem.Type'       }, 'string'] }, 1, 0] } },
          Height:     { $sum: { $cond: [{ $eq: [{ $type: '$OperationalGroups.Items.PricedItem.Height'     }, 'string'] }, 1, 0] } },
          Length:     { $sum: { $cond: [{ $eq: [{ $type: '$OperationalGroups.Items.PricedItem.Length'     }, 'string'] }, 1, 0] } },
          BoardSetup: { $sum: { $cond: [{ $eq: [{ $type: '$OperationalGroups.Items.PricedItem.BoardSetup' }, 'string'] }, 1, 0] } },
          Material:   { $sum: { $cond: [{ $eq: [{ $type: '$OperationalGroups.Items.PricedItem.Material'   }, 'string'] }, 1, 0] } },
          Lift:       { $sum: { $cond: [{ $eq: [{ $type: '$OperationalGroups.Items.PricedItem.Lift'       }, 'string'] }, 1, 0] } },
        }},
        { $sort: { _id: 1 } },
        { $limit: 10 },
      ], { allowDiskUse: true }).forEach(r => warn(`    TeamName=${r._id}  Category=${r.Category}  Floor=${r.Floor}  Type=${r.Type}  Height=${r.Height}  Length=${r.Length}  BoardSetup=${r.BoardSetup}  Material=${r.Material}  Lift=${r.Lift}`));
    } catch (e) { error(`  Details query failed → ${e.message}`); }
  } else {
    pass('no string reference field values remaining in Handovers:Handovers');
  }
} catch (e) {
  error(`CHECK 4 failed → ${e.message}`);
  results['Handovers:Handovers'] = -1;
}

// -----------------------------------------------------------------------------
// CHECK 5 — ActiveWork:Events  ·  category + name fields — all OG path variants
// -----------------------------------------------------------------------------
sep();
info('CHECK 5 — ActiveWork:Events  →  Data.*.*.PricedItem.{Category,Floor,...,Lift} (all casing variants)');
try {
  const c5 = db['ActiveWork:Events'].countDocuments({ $or: [
    // Category variants
    { 'Data.OperationalGroups.Items.PricedItem.Category': { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.category': { $type: 'string' } },
    { 'Data.operationalGroups.items.PricedItem.Category': { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.category': { $type: 'string' } },
    { 'data.OperationalGroups.Items.PricedItem.Category': { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.category': { $type: 'string' } },
    { 'data.operationalGroups.items.PricedItem.Category': { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.category': { $type: 'string' } },
    // Name fields — Data.OperationalGroups.Items.PricedItem.*
    { 'Data.OperationalGroups.Items.PricedItem.Floor':      { $type: 'string' } },
    { 'Data.OperationalGroups.Items.PricedItem.Type':       { $type: 'string' } },
    { 'Data.OperationalGroups.Items.PricedItem.Height':     { $type: 'string' } },
    { 'Data.OperationalGroups.Items.PricedItem.Length':     { $type: 'string' } },
    { 'Data.OperationalGroups.Items.PricedItem.BoardSetup': { $type: 'string' } },
    { 'Data.OperationalGroups.Items.PricedItem.Material':   { $type: 'string' } },
    { 'Data.OperationalGroups.Items.PricedItem.Lift':       { $type: 'string' } },
    // Name fields — Data.OperationalGroups.Items.pricedItem.*
    { 'Data.OperationalGroups.Items.pricedItem.Floor':      { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.floor':      { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.Type':       { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.type':       { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.Height':     { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.height':     { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.Length':     { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.length':     { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.BoardSetup': { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.boardSetup': { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.Material':   { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.material':   { $type: 'string' } },
    // Name fields — Data.operationalGroups.items.*
    { 'Data.operationalGroups.items.PricedItem.Floor':      { $type: 'string' } },
    { 'Data.operationalGroups.items.PricedItem.Type':       { $type: 'string' } },
    { 'Data.operationalGroups.items.PricedItem.Height':     { $type: 'string' } },
    { 'Data.operationalGroups.items.PricedItem.Length':     { $type: 'string' } },
    { 'Data.operationalGroups.items.PricedItem.BoardSetup': { $type: 'string' } },
    { 'Data.operationalGroups.items.PricedItem.Material':   { $type: 'string' } },
    { 'Data.operationalGroups.items.PricedItem.Lift':       { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.Floor':      { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.floor':      { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.Type':       { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.type':       { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.Height':     { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.height':     { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.Length':     { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.length':     { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.BoardSetup': { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.boardSetup': { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.Material':   { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.material':   { $type: 'string' } },
    // data.* variants (lowercase data)
    { 'data.OperationalGroups.Items.PricedItem.Floor':      { $type: 'string' } },
    { 'data.OperationalGroups.Items.PricedItem.Type':       { $type: 'string' } },
    { 'data.OperationalGroups.Items.PricedItem.Height':     { $type: 'string' } },
    { 'data.OperationalGroups.Items.PricedItem.Length':     { $type: 'string' } },
    { 'data.OperationalGroups.Items.PricedItem.BoardSetup': { $type: 'string' } },
    { 'data.OperationalGroups.Items.PricedItem.Material':   { $type: 'string' } },
    { 'data.OperationalGroups.Items.PricedItem.Lift':       { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.Floor':      { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.floor':      { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.Type':       { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.type':       { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.Height':     { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.height':     { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.Length':     { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.length':     { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.BoardSetup': { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.boardSetup': { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.Material':   { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.material':   { $type: 'string' } },
    { 'data.operationalGroups.items.PricedItem.Floor':      { $type: 'string' } },
    { 'data.operationalGroups.items.PricedItem.Type':       { $type: 'string' } },
    { 'data.operationalGroups.items.PricedItem.Height':     { $type: 'string' } },
    { 'data.operationalGroups.items.PricedItem.Length':     { $type: 'string' } },
    { 'data.operationalGroups.items.PricedItem.BoardSetup': { $type: 'string' } },
    { 'data.operationalGroups.items.PricedItem.Material':   { $type: 'string' } },
    { 'data.operationalGroups.items.PricedItem.Lift':       { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.Floor':      { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.floor':      { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.Type':       { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.type':       { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.Height':     { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.height':     { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.Length':     { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.length':     { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.BoardSetup': { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.boardSetup': { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.Material':   { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.material':   { $type: 'string' } },
  ]});
  results['ActiveWork:Events'] = c5;
  if (c5 > 0) {
    fail(`${c5} document(s) still have a reference field as string`);
    try {
      const s5 = db['ActiveWork:Events'].findOne({ $or: [
        { 'Data.OperationalGroups.Items.PricedItem.Category': { $type: 'string' } },
        { 'Data.OperationalGroups.Items.PricedItem.Floor':    { $type: 'string' } },
        { 'Data.OperationalGroups.Items.pricedItem.floor':    { $type: 'string' } },
        { 'Data.operationalGroups.items.PricedItem.Floor':    { $type: 'string' } },
      ]}, { _id: 1, TeamName: 1, teamName: 1 });
      warn(`  Sample → _id=${s5._id}  TeamName=${s5.TeamName || s5.teamName}`);
    } catch (e) { error(`  Sample query failed → ${e.message}`); }
    try {
      info('  Details — per-field string counts via primary path (Data.OperationalGroups.Items.PricedItem.*), grouped by TeamName (top 10):');
      db['ActiveWork:Events'].aggregate([
        { $unwind: '$Data.OperationalGroups' },
        { $unwind: '$Data.OperationalGroups.Items' },
        { $match: { $or: [
          { 'Data.OperationalGroups.Items.PricedItem.Category':   { $type: 'string' } },
          { 'Data.OperationalGroups.Items.PricedItem.Floor':      { $type: 'string' } },
          { 'Data.OperationalGroups.Items.PricedItem.Type':       { $type: 'string' } },
          { 'Data.OperationalGroups.Items.PricedItem.Height':     { $type: 'string' } },
          { 'Data.OperationalGroups.Items.PricedItem.Length':     { $type: 'string' } },
          { 'Data.OperationalGroups.Items.PricedItem.BoardSetup': { $type: 'string' } },
          { 'Data.OperationalGroups.Items.PricedItem.Material':   { $type: 'string' } },
          { 'Data.OperationalGroups.Items.PricedItem.Lift':       { $type: 'string' } },
        ]}},
        { $group: {
          _id: { $ifNull: ['$TeamName', '$teamName'] },
          Category:   { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.Category'   }, 'string'] }, 1, 0] } },
          Floor:      { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.Floor'      }, 'string'] }, 1, 0] } },
          Type:       { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.Type'       }, 'string'] }, 1, 0] } },
          Height:     { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.Height'     }, 'string'] }, 1, 0] } },
          Length:     { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.Length'     }, 'string'] }, 1, 0] } },
          BoardSetup: { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.BoardSetup' }, 'string'] }, 1, 0] } },
          Material:   { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.Material'   }, 'string'] }, 1, 0] } },
          Lift:       { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.Lift'       }, 'string'] }, 1, 0] } },
        }},
        { $sort: { _id: 1 } },
        { $limit: 10 },
      ], { allowDiskUse: true }).forEach(r => warn(`    TeamName=${r._id}  Category=${r.Category}  Floor=${r.Floor}  Type=${r.Type}  Height=${r.Height}  Length=${r.Length}  BoardSetup=${r.BoardSetup}  Material=${r.Material}  Lift=${r.Lift}`));
    } catch (e) { error(`  Details query failed → ${e.message}`); }
  } else {
    pass('no string reference field values remaining in ActiveWork:Events');
  }
} catch (e) {
  error(`CHECK 5 failed → ${e.message}`);
  results['ActiveWork:Events'] = -1;
}

// -----------------------------------------------------------------------------
// CHECK 6 — Handovers:Events  ·  category + name fields (canonical PascalCase path)
// -----------------------------------------------------------------------------
sep();
info('CHECK 6 — Handovers:Events  →  Data.OperationalGroups.Items.PricedItem.{Category,Floor,...,Lift}');
try {
  const c6 = db['Handovers:Events'].countDocuments({ $or: [
    { 'Data.OperationalGroups.Items.PricedItem.Category':   { $type: 'string' } },
    { 'Data.OperationalGroups.Items.PricedItem.Floor':      { $type: 'string' } },
    { 'Data.OperationalGroups.Items.PricedItem.Type':       { $type: 'string' } },
    { 'Data.OperationalGroups.Items.PricedItem.Height':     { $type: 'string' } },
    { 'Data.OperationalGroups.Items.PricedItem.Length':     { $type: 'string' } },
    { 'Data.OperationalGroups.Items.PricedItem.BoardSetup': { $type: 'string' } },
    { 'Data.OperationalGroups.Items.PricedItem.Material':   { $type: 'string' } },
    { 'Data.OperationalGroups.Items.PricedItem.Lift':       { $type: 'string' } },
  ]});
  results['Handovers:Events'] = c6;
  if (c6 > 0) {
    fail(`${c6} document(s) still have a reference field as string`);
    try {
      const s6 = db['Handovers:Events'].findOne({ $or: [
        { 'Data.OperationalGroups.Items.PricedItem.Category': { $type: 'string' } },
        { 'Data.OperationalGroups.Items.PricedItem.Floor':    { $type: 'string' } },
        { 'Data.OperationalGroups.Items.PricedItem.Lift':     { $type: 'string' } },
      ]}, { _id: 1, TeamName: 1 });
      warn(`  Sample → _id=${s6._id}  TeamName=${s6.TeamName}`);
    } catch (e) { error(`  Sample query failed → ${e.message}`); }
    try {
      info('  Details — per-field string counts grouped by TeamName (top 10):');
      db['Handovers:Events'].aggregate([
        { $unwind: '$Data.OperationalGroups' },
        { $unwind: '$Data.OperationalGroups.Items' },
        { $match: { $or: [
          { 'Data.OperationalGroups.Items.PricedItem.Category':   { $type: 'string' } },
          { 'Data.OperationalGroups.Items.PricedItem.Floor':      { $type: 'string' } },
          { 'Data.OperationalGroups.Items.PricedItem.Type':       { $type: 'string' } },
          { 'Data.OperationalGroups.Items.PricedItem.Height':     { $type: 'string' } },
          { 'Data.OperationalGroups.Items.PricedItem.Length':     { $type: 'string' } },
          { 'Data.OperationalGroups.Items.PricedItem.BoardSetup': { $type: 'string' } },
          { 'Data.OperationalGroups.Items.PricedItem.Material':   { $type: 'string' } },
          { 'Data.OperationalGroups.Items.PricedItem.Lift':       { $type: 'string' } },
        ]}},
        { $group: {
          _id: '$TeamName',
          Category:   { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.Category'   }, 'string'] }, 1, 0] } },
          Floor:      { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.Floor'      }, 'string'] }, 1, 0] } },
          Type:       { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.Type'       }, 'string'] }, 1, 0] } },
          Height:     { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.Height'     }, 'string'] }, 1, 0] } },
          Length:     { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.Length'     }, 'string'] }, 1, 0] } },
          BoardSetup: { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.BoardSetup' }, 'string'] }, 1, 0] } },
          Material:   { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.Material'   }, 'string'] }, 1, 0] } },
          Lift:       { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.Lift'       }, 'string'] }, 1, 0] } },
        }},
        { $sort: { _id: 1 } },
        { $limit: 10 },
      ], { allowDiskUse: true }).forEach(r => warn(`    TeamName=${r._id}  Category=${r.Category}  Floor=${r.Floor}  Type=${r.Type}  Height=${r.Height}  Length=${r.Length}  BoardSetup=${r.BoardSetup}  Material=${r.Material}  Lift=${r.Lift}`));
    } catch (e) { error(`  Details query failed → ${e.message}`); }
  } else {
    pass('no string reference field values remaining in Handovers:Events');
  }
} catch (e) {
  error(`CHECK 6 failed → ${e.message}`);
  results['Handovers:Events'] = -1;
}

// -----------------------------------------------------------------------------
// CHECK 7 — Jobs:Events  ·  category + name fields — all path variants
// -----------------------------------------------------------------------------
sep();
info('CHECK 7 — Jobs:Events  →  all reference fields — all path variants (OG + sections + flat items)');
try {
  const c7 = db['Jobs:Events'].countDocuments({ $or: [
    // Category — OG variants
    { 'Data.OperationalGroups.Items.PricedItem.Category': { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.category': { $type: 'string' } },
    { 'Data.operationalGroups.items.PricedItem.Category': { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.category': { $type: 'string' } },
    { 'data.OperationalGroups.Items.PricedItem.Category': { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.category': { $type: 'string' } },
    { 'data.operationalGroups.items.PricedItem.Category': { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.category': { $type: 'string' } },
    // Category — sections variants
    { 'Data.sections.items.PricedItem.Category':          { $type: 'string' } },
    { 'Data.sections.items.pricedItem.category':          { $type: 'string' } },
    { 'data.sections.items.PricedItem.Category':          { $type: 'string' } },
    { 'data.sections.items.pricedItem.category':          { $type: 'string' } },
    { 'Data.Sections.Items.PricedItem.Category':          { $type: 'string' } },
    { 'data.Sections.Items.PricedItem.Category':          { $type: 'string' } },
    // Category — flat items variants
    { 'Data.Items.PricedItem.Category':                   { $type: 'string' } },
    { 'Data.items.PricedItem.Category':                   { $type: 'string' } },
    { 'Data.items.pricedItem.category':                   { $type: 'string' } },
    { 'data.Items.PricedItem.Category':                   { $type: 'string' } },
    { 'data.items.PricedItem.Category':                   { $type: 'string' } },
    { 'data.items.pricedItem.category':                   { $type: 'string' } },
    // Name fields — Data.OperationalGroups.Items.PricedItem.*
    { 'Data.OperationalGroups.Items.PricedItem.Floor':      { $type: 'string' } },
    { 'Data.OperationalGroups.Items.PricedItem.Type':       { $type: 'string' } },
    { 'Data.OperationalGroups.Items.PricedItem.Height':     { $type: 'string' } },
    { 'Data.OperationalGroups.Items.PricedItem.Length':     { $type: 'string' } },
    { 'Data.OperationalGroups.Items.PricedItem.BoardSetup': { $type: 'string' } },
    { 'Data.OperationalGroups.Items.PricedItem.Material':   { $type: 'string' } },
    { 'Data.OperationalGroups.Items.PricedItem.Lift':       { $type: 'string' } },
    // Name fields — Data.OperationalGroups.Items.pricedItem.*
    { 'Data.OperationalGroups.Items.pricedItem.Floor':      { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.floor':      { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.Type':       { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.type':       { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.Height':     { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.height':     { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.Length':     { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.length':     { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.BoardSetup': { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.boardSetup': { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.Material':   { $type: 'string' } },
    { 'Data.OperationalGroups.Items.pricedItem.material':   { $type: 'string' } },
    // Name fields — Data.operationalGroups.items.*
    { 'Data.operationalGroups.items.PricedItem.Floor':      { $type: 'string' } },
    { 'Data.operationalGroups.items.PricedItem.Type':       { $type: 'string' } },
    { 'Data.operationalGroups.items.PricedItem.Height':     { $type: 'string' } },
    { 'Data.operationalGroups.items.PricedItem.Length':     { $type: 'string' } },
    { 'Data.operationalGroups.items.PricedItem.BoardSetup': { $type: 'string' } },
    { 'Data.operationalGroups.items.PricedItem.Material':   { $type: 'string' } },
    { 'Data.operationalGroups.items.PricedItem.Lift':       { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.Floor':      { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.floor':      { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.Type':       { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.type':       { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.Height':     { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.height':     { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.Length':     { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.length':     { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.BoardSetup': { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.boardSetup': { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.Material':   { $type: 'string' } },
    { 'Data.operationalGroups.items.pricedItem.material':   { $type: 'string' } },
    // data.* OG variants
    { 'data.OperationalGroups.Items.PricedItem.Floor':      { $type: 'string' } },
    { 'data.OperationalGroups.Items.PricedItem.Type':       { $type: 'string' } },
    { 'data.OperationalGroups.Items.PricedItem.Height':     { $type: 'string' } },
    { 'data.OperationalGroups.Items.PricedItem.Length':     { $type: 'string' } },
    { 'data.OperationalGroups.Items.PricedItem.BoardSetup': { $type: 'string' } },
    { 'data.OperationalGroups.Items.PricedItem.Material':   { $type: 'string' } },
    { 'data.OperationalGroups.Items.PricedItem.Lift':       { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.Floor':      { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.floor':      { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.Type':       { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.type':       { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.Height':     { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.height':     { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.Length':     { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.length':     { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.BoardSetup': { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.boardSetup': { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.Material':   { $type: 'string' } },
    { 'data.OperationalGroups.Items.pricedItem.material':   { $type: 'string' } },
    { 'data.operationalGroups.items.PricedItem.Floor':      { $type: 'string' } },
    { 'data.operationalGroups.items.PricedItem.Type':       { $type: 'string' } },
    { 'data.operationalGroups.items.PricedItem.Height':     { $type: 'string' } },
    { 'data.operationalGroups.items.PricedItem.Length':     { $type: 'string' } },
    { 'data.operationalGroups.items.PricedItem.BoardSetup': { $type: 'string' } },
    { 'data.operationalGroups.items.PricedItem.Material':   { $type: 'string' } },
    { 'data.operationalGroups.items.PricedItem.Lift':       { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.Floor':      { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.floor':      { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.Type':       { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.type':       { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.Height':     { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.height':     { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.Length':     { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.length':     { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.BoardSetup': { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.boardSetup': { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.Material':   { $type: 'string' } },
    { 'data.operationalGroups.items.pricedItem.material':   { $type: 'string' } },
    // sections variants
    { 'Data.sections.items.PricedItem.Floor':               { $type: 'string' } },
    { 'Data.sections.items.PricedItem.Type':                { $type: 'string' } },
    { 'Data.sections.items.PricedItem.Height':              { $type: 'string' } },
    { 'Data.sections.items.PricedItem.Length':              { $type: 'string' } },
    { 'Data.sections.items.PricedItem.BoardSetup':          { $type: 'string' } },
    { 'Data.sections.items.PricedItem.Material':            { $type: 'string' } },
    { 'Data.sections.items.pricedItem.Floor':               { $type: 'string' } },
    { 'Data.sections.items.pricedItem.floor':               { $type: 'string' } },
    { 'Data.sections.items.pricedItem.Type':                { $type: 'string' } },
    { 'Data.sections.items.pricedItem.type':                { $type: 'string' } },
    { 'Data.sections.items.pricedItem.Height':              { $type: 'string' } },
    { 'Data.sections.items.pricedItem.height':              { $type: 'string' } },
    { 'Data.sections.items.pricedItem.Length':              { $type: 'string' } },
    { 'Data.sections.items.pricedItem.length':              { $type: 'string' } },
    { 'Data.sections.items.pricedItem.BoardSetup':          { $type: 'string' } },
    { 'Data.sections.items.pricedItem.boardSetup':          { $type: 'string' } },
    { 'Data.sections.items.pricedItem.Material':            { $type: 'string' } },
    { 'Data.sections.items.pricedItem.material':            { $type: 'string' } },
    { 'data.sections.items.PricedItem.Floor':               { $type: 'string' } },
    { 'data.sections.items.PricedItem.Type':                { $type: 'string' } },
    { 'data.sections.items.PricedItem.Height':              { $type: 'string' } },
    { 'data.sections.items.PricedItem.Length':              { $type: 'string' } },
    { 'data.sections.items.PricedItem.BoardSetup':          { $type: 'string' } },
    { 'data.sections.items.PricedItem.Material':            { $type: 'string' } },
    { 'data.sections.items.pricedItem.Floor':               { $type: 'string' } },
    { 'data.sections.items.pricedItem.floor':               { $type: 'string' } },
    { 'data.sections.items.pricedItem.Type':                { $type: 'string' } },
    { 'data.sections.items.pricedItem.type':                { $type: 'string' } },
    { 'data.sections.items.pricedItem.Height':              { $type: 'string' } },
    { 'data.sections.items.pricedItem.height':              { $type: 'string' } },
    { 'data.sections.items.pricedItem.Length':              { $type: 'string' } },
    { 'data.sections.items.pricedItem.length':              { $type: 'string' } },
    { 'data.sections.items.pricedItem.BoardSetup':          { $type: 'string' } },
    { 'data.sections.items.pricedItem.boardSetup':          { $type: 'string' } },
    { 'data.sections.items.pricedItem.Material':            { $type: 'string' } },
    { 'data.sections.items.pricedItem.material':            { $type: 'string' } },
    { 'Data.Sections.Items.PricedItem.Floor':               { $type: 'string' } },
    { 'Data.Sections.Items.PricedItem.Type':                { $type: 'string' } },
    { 'Data.Sections.Items.PricedItem.Height':              { $type: 'string' } },
    { 'Data.Sections.Items.PricedItem.Length':              { $type: 'string' } },
    { 'Data.Sections.Items.PricedItem.BoardSetup':          { $type: 'string' } },
    { 'Data.Sections.Items.PricedItem.Material':            { $type: 'string' } },
    { 'data.Sections.Items.PricedItem.Floor':               { $type: 'string' } },
    { 'data.Sections.Items.PricedItem.Type':                { $type: 'string' } },
    { 'data.Sections.Items.PricedItem.Height':              { $type: 'string' } },
    { 'data.Sections.Items.PricedItem.Length':              { $type: 'string' } },
    { 'data.Sections.Items.PricedItem.BoardSetup':          { $type: 'string' } },
    { 'data.Sections.Items.PricedItem.Material':            { $type: 'string' } },
    // flat items variants
    { 'Data.Items.PricedItem.Floor':                        { $type: 'string' } },
    { 'Data.Items.PricedItem.Type':                         { $type: 'string' } },
    { 'Data.Items.PricedItem.Height':                       { $type: 'string' } },
    { 'Data.Items.PricedItem.Length':                       { $type: 'string' } },
    { 'Data.Items.PricedItem.BoardSetup':                   { $type: 'string' } },
    { 'Data.Items.PricedItem.Material':                     { $type: 'string' } },
    { 'Data.items.PricedItem.Floor':                        { $type: 'string' } },
    { 'Data.items.PricedItem.Type':                         { $type: 'string' } },
    { 'Data.items.PricedItem.Height':                       { $type: 'string' } },
    { 'Data.items.PricedItem.Length':                       { $type: 'string' } },
    { 'Data.items.PricedItem.BoardSetup':                   { $type: 'string' } },
    { 'Data.items.PricedItem.Material':                     { $type: 'string' } },
    { 'Data.items.pricedItem.Floor':                        { $type: 'string' } },
    { 'Data.items.pricedItem.floor':                        { $type: 'string' } },
    { 'Data.items.pricedItem.Type':                         { $type: 'string' } },
    { 'Data.items.pricedItem.type':                         { $type: 'string' } },
    { 'Data.items.pricedItem.Height':                       { $type: 'string' } },
    { 'Data.items.pricedItem.height':                       { $type: 'string' } },
    { 'Data.items.pricedItem.Length':                       { $type: 'string' } },
    { 'Data.items.pricedItem.length':                       { $type: 'string' } },
    { 'Data.items.pricedItem.BoardSetup':                   { $type: 'string' } },
    { 'Data.items.pricedItem.boardSetup':                   { $type: 'string' } },
    { 'Data.items.pricedItem.Material':                     { $type: 'string' } },
    { 'Data.items.pricedItem.material':                     { $type: 'string' } },
    { 'data.Items.PricedItem.Floor':                        { $type: 'string' } },
    { 'data.Items.PricedItem.Type':                         { $type: 'string' } },
    { 'data.Items.PricedItem.Height':                       { $type: 'string' } },
    { 'data.Items.PricedItem.Length':                       { $type: 'string' } },
    { 'data.Items.PricedItem.BoardSetup':                   { $type: 'string' } },
    { 'data.Items.PricedItem.Material':                     { $type: 'string' } },
    { 'data.items.PricedItem.Floor':                        { $type: 'string' } },
    { 'data.items.PricedItem.Type':                         { $type: 'string' } },
    { 'data.items.PricedItem.Height':                       { $type: 'string' } },
    { 'data.items.PricedItem.Length':                       { $type: 'string' } },
    { 'data.items.PricedItem.BoardSetup':                   { $type: 'string' } },
    { 'data.items.PricedItem.Material':                     { $type: 'string' } },
    { 'data.items.pricedItem.Floor':                        { $type: 'string' } },
    { 'data.items.pricedItem.floor':                        { $type: 'string' } },
    { 'data.items.pricedItem.Type':                         { $type: 'string' } },
    { 'data.items.pricedItem.type':                         { $type: 'string' } },
    { 'data.items.pricedItem.Height':                       { $type: 'string' } },
    { 'data.items.pricedItem.height':                       { $type: 'string' } },
    { 'data.items.pricedItem.Length':                       { $type: 'string' } },
    { 'data.items.pricedItem.length':                       { $type: 'string' } },
    { 'data.items.pricedItem.BoardSetup':                   { $type: 'string' } },
    { 'data.items.pricedItem.boardSetup':                   { $type: 'string' } },
    { 'data.items.pricedItem.Material':                     { $type: 'string' } },
    { 'data.items.pricedItem.material':                     { $type: 'string' } },
  ]});
  results['Jobs:Events'] = c7;
  if (c7 > 0) {
    fail(`${c7} document(s) still have a reference field as string`);
    try {
      const s7 = db['Jobs:Events'].findOne({ $or: [
        { 'Data.OperationalGroups.Items.PricedItem.Category': { $type: 'string' } },
        { 'Data.OperationalGroups.Items.PricedItem.Floor':    { $type: 'string' } },
        { 'Data.OperationalGroups.Items.pricedItem.floor':    { $type: 'string' } },
        { 'Data.sections.items.PricedItem.Floor':             { $type: 'string' } },
        { 'Data.Items.PricedItem.Floor':                      { $type: 'string' } },
      ]}, { _id: 1, TeamName: 1, teamName: 1 });
      warn(`  Sample → _id=${s7._id}  TeamName=${s7.TeamName || s7.teamName}`);
    } catch (e) { error(`  Sample query failed → ${e.message}`); }
    try {
      info('  Details — per-field string counts via primary OG path (Data.OperationalGroups.Items.PricedItem.*), grouped by TeamName (top 10):');
      db['Jobs:Events'].aggregate([
        { $unwind: '$Data.OperationalGroups' },
        { $unwind: '$Data.OperationalGroups.Items' },
        { $match: { $or: [
          { 'Data.OperationalGroups.Items.PricedItem.Category':   { $type: 'string' } },
          { 'Data.OperationalGroups.Items.PricedItem.Floor':      { $type: 'string' } },
          { 'Data.OperationalGroups.Items.PricedItem.Type':       { $type: 'string' } },
          { 'Data.OperationalGroups.Items.PricedItem.Height':     { $type: 'string' } },
          { 'Data.OperationalGroups.Items.PricedItem.Length':     { $type: 'string' } },
          { 'Data.OperationalGroups.Items.PricedItem.BoardSetup': { $type: 'string' } },
          { 'Data.OperationalGroups.Items.PricedItem.Material':   { $type: 'string' } },
          { 'Data.OperationalGroups.Items.PricedItem.Lift':       { $type: 'string' } },
        ]}},
        { $group: {
          _id: { $ifNull: ['$TeamName', '$teamName'] },
          Category:   { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.Category'   }, 'string'] }, 1, 0] } },
          Floor:      { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.Floor'      }, 'string'] }, 1, 0] } },
          Type:       { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.Type'       }, 'string'] }, 1, 0] } },
          Height:     { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.Height'     }, 'string'] }, 1, 0] } },
          Length:     { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.Length'     }, 'string'] }, 1, 0] } },
          BoardSetup: { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.BoardSetup' }, 'string'] }, 1, 0] } },
          Material:   { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.Material'   }, 'string'] }, 1, 0] } },
          Lift:       { $sum: { $cond: [{ $eq: [{ $type: '$Data.OperationalGroups.Items.PricedItem.Lift'       }, 'string'] }, 1, 0] } },
        }},
        { $sort: { _id: 1 } },
        { $limit: 10 },
      ], { allowDiskUse: true }).forEach(r => warn(`    TeamName=${r._id}  Category=${r.Category}  Floor=${r.Floor}  Type=${r.Type}  Height=${r.Height}  Length=${r.Length}  BoardSetup=${r.BoardSetup}  Material=${r.Material}  Lift=${r.Lift}`));
    } catch (e) { error(`  Details query failed → ${e.message}`); }
  } else {
    pass('no string reference field values remaining in Jobs:Events');
  }
} catch (e) {
  error(`CHECK 7 failed → ${e.message}`);
  results['Jobs:Events'] = -1;
}

// =============================================================================
// FINAL SUMMARY
// =============================================================================
sep();
info('FINAL SUMMARY');
sep();

let totalFails  = 0;
let totalErrors = 0;
for (const [label, count] of Object.entries(results)) {
  if (count === -1) {
    error(`[ERROR] ${label}: query failed — see ERROR lines above`);
    totalErrors++;
  } else if (count === 0) {
    pass(`${label}: 0 remaining`);
  } else {
    fail(`${label}: ${count} remaining`);
    totalFails++;
  }
}

sep();
if (totalErrors === 0 && totalFails === 0) {
  pass('All 7 checks passed — migration is complete across all collections and fields.');
} else {
  if (totalFails > 0) {
    warn(`${totalFails} check(s) failed — re-run the relevant migration script(s):`);
    warn('  Scripts 03–04: check 1  (Jobs:Items — category + name fields)');
    warn('  Scripts 03–05: check 2  (Jobs:Sections — category + name fields + floor)');
    warn('  Scripts 03–04: check 3  (ActiveWork:ActiveWorkRecords — category + name fields)');
    warn('  Scripts 03–04: check 4  (Handovers:Handovers — category + name fields)');
    warn('  Scripts 06–08: check 5  (ActiveWork:Events — category + name fields + floor)');
    warn('  Scripts 06–08: check 6  (Handovers:Events — category + name fields + floor)');
    warn('  Scripts 06–08: check 7  (Jobs:Events — category + name fields + floor)');
  }
  if (totalErrors > 0) {
    error(`${totalErrors} check(s) threw errors — review the ERROR lines above for details.`);
  }
}

sep();
const _elapsed = ((new Date() - _start) / 1000).toFixed(2);
info(`SCRIPT  : validate-category-to-reference.js`);
info(`ELAPSED : ${_elapsed}s`);
sep();
