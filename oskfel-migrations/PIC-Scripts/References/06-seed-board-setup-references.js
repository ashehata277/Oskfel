// =============================================================================
// MIGRATION 06 — Seed Jobs:BoardSetupReferences (per catalogue)
// -----------------------------------------------------------------------------
// Target : Jobs:BoardSetupReferences   { _id, name, catalogue: { _id, name } }
// Source : Jobs:StockItemCatalogues
// Run    : mongosh <connection-string> 06-seed-board-setup-references.js
// Notes  : Clears the collection on every run, then re-seeds one document
//          per value × catalogue combination.
// =============================================================================

const COLLECTION            = 'Jobs:BoardSetupReferences';
const CATALOGUES_COLLECTION = 'Jobs:StockItemCatalogues';

const VALUES = [
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
print(`[${new Date().toISOString()}] [INFO ]  SCRIPT  : 06-seed-board-setup-references.js`);
print(`[${new Date().toISOString()}] [INFO ]  ELAPSED : ${_elapsed}s`);
print(`[${new Date().toISOString()}] [INFO ] ${'─'.repeat(72)}`);
