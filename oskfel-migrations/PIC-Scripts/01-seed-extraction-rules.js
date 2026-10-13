// =============================================================================
// MIGRATION SCRIPT: Extraction Rules
// =============================================================================
// Purpose  : Seed the global item-title extraction rules into MongoDB.
//            Rules are GLOBAL (no TeamName) — same rules apply to all teams.
//            The script is idempotent: each rule is matched by its unique Key
//            and replaced/inserted unconditionally, preserving the _id when
//            the document already exists.
//
// Target   : Jobs database
// Collection: Jobs:ItemTagsExtractionRules
//
// Run with : mongosh <connection-string>/<db-name> 01-seed-extraction-rules.js
//   e.g.    mongosh "mongodb://localhost:27017/Jobs" seed-extraction-rules.js
// =============================================================================

// ---------------------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------------------
const COLLECTION = 'Jobs:ItemTagsExtractionRules';

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function log(level, msg) {
  const ts = new Date().toISOString();
  print(`[${ts}] [${level.toUpperCase().padEnd(5)}] ${msg}`);
}
const info  = (m) => log('INFO',  m);
const warn  = (m) => log('WARN',  m);
const sep   = ()  => info('─'.repeat(72));

// ---------------------------------------------------------------------------
// SEED DATA
// ---------------------------------------------------------------------------
const now = new Date();

const RULES = [
  // ─── lift ─────────────────────────────────────────────────────────────────
  {
    key:         'lift',
    label:       'Lift',
    matcherType: 'regex',
    sourceField: 'originalTitle',
    order:       5,
    dependsOn:   ['type'],
    consumeMatch: false,
    isActive:    true,
    patterns: [
      {
        // Matches "Ground Lift", "3rd Lift", etc. with word-boundary guards
        pattern:      String.raw`(?<![\w-])(\d+(?:st|nd|rd|th)|Ground|Upper Ground|Lower Ground|Basement|Mezzanine|Roof|Podium|Parapet)\s+Lift(?![\w-])`,
        flags:        'i',
        group:        1,
        transformKey: null,
      },
    ],
    optionsKey:  null,
    customKey:   null,
    metadata:    {},
    version:     1,
    createdAt:   now,
    updatedAt:   now,
  },

  // ─── floor ────────────────────────────────────────────────────────────────
  {
    key:         'floor',
    label:       'Floor',
    matcherType: 'regex',
    sourceField: 'originalTitle',
    order:       10,
    dependsOn:   ['type'],
    consumeMatch: false,
    isActive:    true,
    patterns: [
      {
        // Matches "Ground Floor", "3rd Floor", etc. with word-boundary guards
        pattern:      String.raw`(?<![\w-])(\d+(?:st|nd|rd|th)|Ground|Upper Ground|Lower Ground|Basement|Mezzanine|Roof|Podium|Parapet)\s+Floor(?![\w-])`,
        flags:        'i',
        group:        1,
        transformKey: null,
      },
    ],
    optionsKey:  null,
    customKey:   null,
    metadata:    {},
    version:     1,
    createdAt:   now,
    updatedAt:   now,
  },

  // ─── height ───────────────────────────────────────────────────────────────
  {
    key:         'height',
    label:       'Height',
    matcherType: 'regex',
    sourceField: 'originalTitle',
    order:       20,
    dependsOn:   [],
    consumeMatch: false,
    isActive:    true,
    patterns: [
      {
        // "Upto 6m in Height" | "Up to 3m in Height" | "3m to 5m in Height"
        pattern:      String.raw`(Upto\s+\d+(?:\.\d+)?m|Up\s+to\s+\d+(?:\.\d+)?m|\d+(?:\.\d+)?m\s+to\s+\d+(?:\.\d+)?m)\s+in\s+Height`,
        flags:        'i',
        group:        1,
        // Frontend transform key: replaces "Up to" with "Upto"
        transformKey: 'normalizeHeight',
      },
    ],
    optionsKey:  null,
    customKey:   null,
    metadata:    {},
    version:     1,
    createdAt:   now,
    updatedAt:   now,
  },

  // ─── length ───────────────────────────────────────────────────────────────
  {
    key:         'length',
    label:       'Length',
    matcherType: 'regex',
    sourceField: 'originalTitle',
    order:       30,
    dependsOn:   [],
    consumeMatch: false,
    isActive:    true,
    patterns: [
      {
        // "Up to 4m in Length" | "4m in Length"
        pattern:      String.raw`(up\s+to\s+\d+(?:\.\d+)?m|\d+(?:\.\d+)?m)\s+in\s+Length`,
        flags:        'i',
        group:        1,
        transformKey: null,
      },
      {
        // Dimension pattern: "2m x 3m"
        pattern:      String.raw`(\d+(?:\.\d+)?m\s*x\s*\d+(?:\.\d+)?m)`,
        flags:        'i',
        group:        1,
        // Frontend transform key: normalises spacing around "x"
        transformKey: 'normalizeDimension',
      },
    ],
    optionsKey:  null,
    customKey:   null,
    metadata:    {},
    version:     1,
    createdAt:   now,
    updatedAt:   now,
  },

  // ─── material ─────────────────────────────────────────────────────────────
  {
    key:         'material',
    label:       'Material',
    matcherType: 'option',
    sourceField: 'workingTitle',
    order:       40,
    dependsOn:   [],
    consumeMatch: true,
    isActive:    true,
    patterns:    null,
    // Frontend resolves this key against its loaded option collections
    optionsKey:  'materialOptions',
    customKey:   null,
    metadata:    {},
    version:     1,
    createdAt:   now,
    updatedAt:   now,
  },

  // ─── type ─────────────────────────────────────────────────────────────────
  {
    key:         'type',
    label:       'Type',
    matcherType: 'option',
    sourceField: 'workingTitle',
    order:       3,
    dependsOn:   [],
    consumeMatch: true,
    isActive:    true,
    patterns:    null,
    // Frontend resolves this key against its loaded option collections
    optionsKey:  'typeOptions',
    customKey:   null,
    metadata:    {},
    version:     1,
    createdAt:   now,
    updatedAt:   now,
  },

  // ─── boardSetup ───────────────────────────────────────────────────────────
  {
    key:         'boardSetup',
    label:       'Board Setup',
    matcherType: 'custom',
    sourceField: 'originalTitle',
    order:       60,
    dependsOn:   [],
    consumeMatch: false,
    isActive:    true,
    patterns:    null,
    optionsKey:  null,
    // Frontend maps this key to its built-in boardSetup handler
    customKey:   'boardSetup',
    metadata:    {},
    version:     1,
    createdAt:   now,
    updatedAt:   now,
  },
];

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
function runMigration() {
  sep();
  info('EXTRACTION RULES MIGRATION — START');
  sep();

  const col = db.getCollection(COLLECTION);

  const stats = { upserted: 0, matched: 0, errors: 0 };

  RULES.forEach((rule, idx) => {
    const label = `[${idx + 1}/${RULES.length}] key="${rule.key}"`;
    try {
      const result = col.replaceOne(
        { key: rule.key },   // filter — match by unique key
        rule,                // replacement document
        { upsert: true }     // insert if not found
      );

      if (result.upsertedCount > 0) {
        info(`  ${label}  → INSERTED`);
        stats.upserted++;
      } else {
        info(`  ${label}  → REPLACED (matched: ${result.matchedCount})`);
        stats.matched++;
      }
    } catch (e) {
      warn(`  ${label}  → ERROR: ${e.message}`);
      stats.errors++;
    }
  });

  sep();
  info(`DONE — inserted: ${stats.upserted}  replaced: ${stats.matched}  errors: ${stats.errors}`);
  sep();
}

const _scriptStart = new Date();
runMigration();
const _elapsed = ((new Date() - _scriptStart) / 1000).toFixed(2);
sep();
info(`SCRIPT  : 01-seed-extraction-rules.js`);
info(`ELAPSED : ${_elapsed}s`);
sep();
