// =============================================================================
// MIGRATION SCRIPT: PIC Lookup Collections
// =============================================================================
// Purpose  : Seed the 7 PIC lookup collections (Lift, Floor, Type, Height, Length,
//            BoardSetup, Material) for every catalogue x team combination.
// Source   : price-item-catalogue.generated-data.ts (unique values extracted)
// Target DB: Jobs database (same connection as Jobs:StockItemCatalogues)
// Run with : mongosh <connection-string> 02-migrate-pic-lookup-collections.js
// =============================================================================

// ---------------------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------------------
const TEAMS_COLLECTION      = 'Jobs:Teams';     // collection that holds team docs
const MASTER_TEAM_NAME      = 'masterteam';    // always included regardless
const CATALOGUES_COLLECTION = 'Jobs:StockItemCatalogues';

const TARGET_COLLECTIONS = {
  lifts:       'Jobs:ItemLifts',
  floors:      'Jobs:ItemFloors',
  types:       'Jobs:ItemTypes',
  heights:     'Jobs:ItemHeights',
  lengths:     'Jobs:ItemLengths',
  boardSetups: 'Jobs:ItemBoardSetups',
  materials:   'Jobs:ItemMaterials',
};

// ---------------------------------------------------------------------------
// SEED DATA  (sourced from price-item-catalogue.generated-data.ts)
// ---------------------------------------------------------------------------
const SEED_DATA = {
  lifts: [
    '1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th',
    '11th','12th','13th','14th','15th','16th','17th','18th','19th','20th',
    '21st','22nd','23rd','24th','25th','26th','27th','28th','29th','30th',
    '31st','32nd','33rd','34th','35th','36th','37th','38th','39th','40th',
    '41st','42nd','43rd','44th','45th','46th','47th','48th','49th','50th',
    'Interim',
  ],

  floors: [
    '1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th',
    '11th','12th','13th','14th','15th','16th','17th','18th','19th','20th',
    '21st','22nd','23rd','24th','25th','26th','27th','28th','29th','30th',
    '31st','32nd','33rd','34th','35th','36th','37th','38th','39th','40th',
    '41st','42nd','43rd','44th','45th','46th','47th','48th','49th','50th',
    'Basement','Lower Ground','Upper Ground','Ground',
    'Podium','Mezzanine','Roof','Parapet',
  ],

  types: [
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
  ],

  heights: [
    'Up to 1.8m',
    '1.8m to 2.4m',
  ],

  lengths: [
    '2.40m',
    '3.60m x 1.90m',
    '4.00m',
    'up to 8.00m',
  ],

  boardSetups: [
    '4+2',
    '4+2, with Floor Levels',
    'Fully, 4+2',
    '4+3',
    '4+3, with Floor Levels',
    'Fully, 4+3',
    '5+2',
    '5+2, with Floor Levels',
    'Fully, 5+2',
    '5+3',
    '5+3, with Floor Levels',
    'Fully, 5+3',
    'with Floor Levels',
    'Fully',
  ],

  materials: [
    'Steel',
    'Timber',
    'Fire Retardant Debris Netting',
    'Exterior Plywood',
    'Wire Mesh Plywood',
  ],
};

// ===========================================================================
// HELPERS
// ===========================================================================

function log(level, msg) {
  const ts = new Date().toISOString();
  print(`[${ts}] [${level.toUpperCase().padEnd(5)}] ${msg}`);
}
const info  = (m) => log('INFO',  m);
const warn  = (m) => log('WARN',  m);
const error = (m) => log('ERROR', m);
const debug = (m) => log('DEBUG', m);
const sep   = ()  => info('─'.repeat(72));

// ===========================================================================
// MAIN
// ===========================================================================

function runMigration() {
  sep();
  info('PIC LOOKUP COLLECTIONS MIGRATION — START');
  sep();

  // -------------------------------------------------------------------------
  // 1. Load catalogues
  // -------------------------------------------------------------------------
  info(`[STEP 1/5] Querying catalogues from → "${CATALOGUES_COLLECTION}"`);
  const catalogues = db.getCollection(CATALOGUES_COLLECTION)
    .find({ isDeleted: { $ne: true } })
    .toArray();

  if (catalogues.length === 0) {
    error(`No catalogues found in "${CATALOGUES_COLLECTION}". Aborting.`);
    return;
  }
  info(`           Found ${catalogues.length} catalogue(s):`);
  catalogues.forEach((c, i) => info(`             [${i + 1}] _id=${c._id}  name="${c.name}"`));
  sep();

  // -------------------------------------------------------------------------
  // 2. Load teams (exclude masterteam)
  // -------------------------------------------------------------------------
  info(`[STEP 2/5] Querying teams from → "${TEAMS_COLLECTION}"`);
  let dbTeams = [];
  try {
    dbTeams = db.getCollection(TEAMS_COLLECTION)
      .find({ isDeleted: { $ne: true } })
      .toArray();
  } catch (e) {
    warn(`           Could not query "${TEAMS_COLLECTION}": ${e.message}`);
  }

  // Derive distinct team name strings from _id — exclude master team
  // Team docs use _id as the team name. Master team has teamType "master team"
  // or _id "masterteam".
  const teamNames = new Set(
    dbTeams
      .filter(t => {
        const id = (t._id || '').toString().toLowerCase();
        const type = (t.teamType || t.TeamType || '').toString().toLowerCase();
        return id !== 'masterteam' && type !== 'master team';
      })
      .map(t => t._id.toString())
      .filter(Boolean)
  );

  if (teamNames.size === 0) {
    error('No teams found (excluding masterteam). Aborting.');
    return;
  }

  info(`           Total teams to process: ${teamNames.size} (masterteam excluded)`);
  [...teamNames].forEach((t, i) => info(`             [${i + 1}] "${t}"`));
  sep();

  // -------------------------------------------------------------------------
  // 3. Build collection → data mapping & clear existing data
  // -------------------------------------------------------------------------
  info('[STEP 3/5] Preparing collection → seed-data mapping & clearing ...');
  const collectionMap = [
    { key: 'lifts',       col: TARGET_COLLECTIONS.lifts,       data: SEED_DATA.lifts       },
    { key: 'floors',      col: TARGET_COLLECTIONS.floors,      data: SEED_DATA.floors      },
    { key: 'types',       col: TARGET_COLLECTIONS.types,       data: SEED_DATA.types       },
    { key: 'heights',     col: TARGET_COLLECTIONS.heights,     data: SEED_DATA.heights     },
    { key: 'lengths',     col: TARGET_COLLECTIONS.lengths,     data: SEED_DATA.lengths     },
    { key: 'boardSetups', col: TARGET_COLLECTIONS.boardSetups, data: SEED_DATA.boardSetups },
    { key: 'materials',   col: TARGET_COLLECTIONS.materials,   data: SEED_DATA.materials   },
  ];
  collectionMap.forEach(({ key, col, data }) =>
    info(`             ${col.padEnd(35)} → ${data.length} seed values`)
  );
  sep();

  // -------------------------------------------------------------------------
  // 3. Clear all target collections
  // -------------------------------------------------------------------------
  // ── Clear all target collections ──
  info('  Clearing all target collections before re-seeding ...');
  collectionMap.forEach(({ key, col }) => {
    try {
      const countBefore = db.getCollection(col).countDocuments({});
      const delResult = db.getCollection(col).deleteMany({});
      info(`             ${col.padEnd(35)} → removed ${delResult.deletedCount} of ${countBefore} doc(s)`);
    } catch (e) {
      warn(`             ${col.padEnd(35)} → collection does not exist or error: ${e.message}`);
    }
  });
  sep();

  // -------------------------------------------------------------------------
  // 4. Bulk insert — batched per team × catalogue across all collections
  //    Iteration order: team → catalogue → collection
  // -------------------------------------------------------------------------
  info('[STEP 4/5] Bulk-inserting documents (batched per team × catalogue) ...');
  sep();

  const globalStats  = { inserted: 0, errors: 0, batches: 0 };
  const teamList     = [...teamNames];
  const now          = new Date();

  teamList.forEach((teamName, teamIdx) => {
    sep();
    info(`  ╔══ TEAM [${teamIdx + 1}/${teamList.length}]: "${teamName}"`);
    sep();

    catalogues.forEach((catalogue, catIdx) => {
      const catRef = { _id: catalogue._id, name: catalogue.name };

      info(`  ║  ┌── CATALOGUE [${catIdx + 1}/${catalogues.length}]: "${catalogue.name}"  (_id: ${catalogue._id})`);
      info(`  ║  │   Team: "${teamName}"  →  processing ${collectionMap.length} collections as bulk batches`);

      const batchStats = { inserted: 0, errors: 0 };

      collectionMap.forEach(({ key, col, data }) => {
        info(`  ║  │   ├── Batch START  collection: "${col}"  values: ${data.length}`);

        // Build insert operations for this team × catalogue × collection
        const ops = data.map((value) => {
          return {
            name:        value,
            catalogue:   catRef,
            teamName:    teamName,
            isDeleted:   false,
            createdDate: now,
            creator:     null,
          };
        });

        info(`  ║  │   │   Executing insertMany with ${ops.length} documents ...`);

        try {
          const result = db.getCollection(col).insertMany(ops, { ordered: false });

          const inserted = result.insertedIds ? Object.keys(result.insertedIds).length : 0;

          batchStats.inserted += inserted;
          globalStats.inserted += inserted;
          globalStats.batches  += 1;

          info(`  ║  │   │   Batch DONE  → inserted: ${inserted}  errors: 0`);
        } catch (e) {
          const writeErrors = (e.writeErrors || []).length;
          const inserted    = e.result ? (e.result.nInserted || 0) : 0;

          batchStats.inserted  += inserted;
          batchStats.errors    += writeErrors || 1;
          globalStats.inserted += inserted;
          globalStats.errors   += writeErrors || 1;
          globalStats.batches  += 1;

          error(`  ║  │   │   Batch FAILED  → ${e.message}`);
          if (e.writeErrors && e.writeErrors.length > 0) {
            e.writeErrors.forEach((we) =>
              error(`  ║  │   │     WriteError [index ${we.index}]: ${we.errmsg}`)
            );
          }
        }

        info(`  ║  │   └── Batch END    collection: "${col}"`);
      });

      info(`  ║  │`);
      info(`  ║  └── CATALOGUE "${catalogue.name}" done.  inserted: ${batchStats.inserted}  errors: ${batchStats.errors}`);
      sep();
    });

    info(`  ╚══ TEAM "${teamName}" done.`);
    sep();
  });

  // -------------------------------------------------------------------------
  // 5. Summary
  // -------------------------------------------------------------------------
  sep();
  info('MIGRATION COMPLETE — SUMMARY');
  sep();
  info(`  Catalogues processed : ${catalogues.length}`);
  info(`  Teams processed      : ${teamNames.size}`);
  info(`  Collections seeded   : ${collectionMap.length}`);
  info(`  Bulk batches run     : ${globalStats.batches}`);
  info(`  Documents inserted   : ${globalStats.inserted}`);
  info(`  Errors               : ${globalStats.errors}`);
  sep();

  if (globalStats.errors > 0) {
    warn('Migration finished WITH errors. Review the ERROR lines above.');
  } else {
    info('Migration finished SUCCESSFULLY with no errors.');
  }
  sep();
}

const _scriptStart = new Date();
runMigration();
const _elapsed = ((new Date() - _scriptStart) / 1000).toFixed(2);
sep();
info(`SCRIPT  : 02-migrate-pic-lookup-collections.js`);
info(`ELAPSED : ${_elapsed}s`);
sep();
