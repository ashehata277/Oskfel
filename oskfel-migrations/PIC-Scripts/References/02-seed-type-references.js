// =============================================================================
// MIGRATION 02 — Seed Jobs:TypeReferences (per catalogue)
// -----------------------------------------------------------------------------
// Target : Jobs:TypeReferences    { _id, name, catalogue: { _id, name } }
// Source : Jobs:StockItemCatalogues
// Run    : mongosh <connection-string> 02-seed-type-references.js
// Notes  : Clears the collection on every run, then re-seeds one document
//          per value × catalogue combination.
// =============================================================================

const COLLECTION            = 'Jobs:TypeReferences';
const CATALOGUES_COLLECTION = 'Jobs:StockItemCatalogues';

const VALUES = [
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

const _scriptStart = new Date();
(function run() {
  const ts  = () => new Date().toISOString();
  const log = (lvl, msg) => print(`[${ts()}] [${lvl.padEnd(5)}] ${msg}`);
  const sep = () => log('INFO', '─'.repeat(72));

  sep();
  log('INFO', `SEED → "${COLLECTION}"`);
  sep();

  // 1. Load catalogues
  const catalogues = db.getCollection(CATALOGUES_COLLECTION)
    .find({ isDeleted: { $ne: true } })
    .toArray();

  if (catalogues.length === 0) {
    log('ERROR', `No catalogues found in "${CATALOGUES_COLLECTION}". Aborting.`);
    sep();
    return;
  }
  log('INFO', `  Found ${catalogues.length} catalogue(s).`);

  // 2. Clear the target collection
  const col         = db.getCollection(COLLECTION);
  const countBefore = col.countDocuments({});
  const delResult   = col.deleteMany({});
  log('INFO', `  Cleared ${delResult.deletedCount} of ${countBefore} existing document(s).`);

  // 3. Deduplicate seed values
  const desired = Array.from(new Set(
    VALUES.map(v => (v || '').toString().trim()).filter(v => v.length > 0)
  ));

  if (desired.length === 0) {
    log('WARN', 'No values provided; nothing to do.');
    sep();
    return;
  }

  // 4. Build and insert documents: one per value × catalogue
  const now      = new Date();
  let   inserted = 0;
  let   errors   = 0;

  for (const catalogue of catalogues) {
    const catRef = { _id: catalogue._id, name: catalogue.name };
    const docs   = desired.map(name => ({
      name:        name,
      catalogue:   catRef,
      isDeleted:   false,
      createdDate: now,
    }));

    try {
      const result = col.insertMany(docs, { ordered: false });
      const n = result.insertedIds ? Object.keys(result.insertedIds).length : docs.length;
      inserted += n;
      log('INFO', `  Catalogue "${catalogue.name}" → inserted ${n} document(s).`);
    } catch (e) {
      const n = e.result ? (e.result.nInserted || 0) : 0;
      inserted += n;
      errors   += (e.writeErrors || []).length || 1;
      log('ERROR', `  Catalogue "${catalogue.name}" → insertMany failed: ${e.message}  (inserted ${n} before failure)`);
      (e.writeErrors || []).forEach(we => log('ERROR', `    [index ${we.index}]: ${we.errmsg}`));
    }
  }

  sep();
  log('INFO', `  Total inserted : ${inserted}`);
  log('INFO', `  Total errors   : ${errors}`);
  sep();
})();

const _elapsed = ((new Date() - _scriptStart) / 1000).toFixed(2);
print(`[${new Date().toISOString()}] [INFO ] ${'─'.repeat(72)}`);
print(`[${new Date().toISOString()}] [INFO ]  SCRIPT  : 02-seed-type-references.js`);
print(`[${new Date().toISOString()}] [INFO ]  ELAPSED : ${_elapsed}s`);
print(`[${new Date().toISOString()}] [INFO ] ${'─'.repeat(72)}`);
print(`[${new Date().toISOString()}] [INFO ] ${'─'.repeat(72)}`);
