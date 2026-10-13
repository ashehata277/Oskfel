// =============================================================================
// MIGRATION SCRIPT: Jobs:Items — Set missing Code field to empty string
// =============================================================================
// Purpose  : Back-fills the `code` field on every PricedMaterialItem document
//            where it is absent (null / undefined / missing) by setting it to
//            an empty string "".
//            The script is idempotent: only documents where code does not
//            already exist as a string are touched. Re-running is safe.
//
// Target   : Jobs database
// Collection: Jobs:Items
//
// Run with : mongosh <connection-string> 09-migrate-items-code-to-empty-string.js
//   e.g.    mongosh "mongodb://localhost:27017/Jobs" 09-migrate-items-code-to-empty-string.js
// =============================================================================

// ---------------------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------------------
const COLLECTION = 'Jobs:Items';

// ---------------------------------------------------------------------------
// LOGGING
// ---------------------------------------------------------------------------
function log(level, msg) {
  const ts = new Date().toISOString();
  print(`[${ts}] [${level.toUpperCase().padEnd(5)}] ${msg}`);
}
const info  = (m) => log('INFO',  m);
const warn  = (m) => log('WARN',  m);
const error = (m) => log('ERROR', m);
const sep   = ()  => info('─'.repeat(72));

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
sep();
info(`Migration: set code = "" on all ${COLLECTION} docs where code is missing`);
sep();

const col = db.getCollection(COLLECTION);

// Count affected documents before updating
const affectedCount = col.countDocuments({ code: { $not: { $type: 'string' } } });
info(`Documents to update: ${affectedCount}`);

if (affectedCount === 0) {
  info('Nothing to do — all documents already have a string code. Exiting.');
} else {
  const result = col.updateMany(
    { code: { $not: { $type: 'string' } } },
    { $set: { code: '' } }
  );

  if (result.acknowledged) {
    info(`Matched : ${result.matchedCount}`);
    info(`Modified: ${result.modifiedCount}`);
  } else {
    error('Write was not acknowledged by the server!');
  }
}

sep();
info('Migration complete.');
sep();
