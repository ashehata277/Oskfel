// Run with: mongosh <connection-string> 11-fix-boardsetup-casing-handover-events.js
// Goal: Ensure PricedItem.BoardSetup (PascalCase) is the only casing present.
//   - If both "BoardSetup" and "boardSetup" exist  → remove the wrong "boardSetup"
//   - If only "boardSetup" exists                  → rename it to "BoardSetup"

print('=== Fix BoardSetup casing in Handovers:Events ===');
print('Path: Data.OperationalGroups[].Items[].PricedItem');
print('');

// ---------------------------------------------------------------------------
// PASS 1: Both fields exist → unset the wrong lowercase "boardSetup"
// ---------------------------------------------------------------------------
print('Pass 1: Removing "boardSetup" where "BoardSetup" already exists...');

var pass1 = db.getCollection('Handovers:Events').updateMany(
  {
    'Data.OperationalGroups': {
      $elemMatch: {
        Items: {
          $elemMatch: {
            'PricedItem.boardSetup': { $exists: true },
            'PricedItem.BoardSetup': { $exists: true },
          },
        },
      },
    },
  },
  {
    $unset: {
      'Data.OperationalGroups.$[og].Items.$[i].PricedItem.boardSetup': '',
    },
  },
  {
    arrayFilters: [
      { 'og.Items': { $exists: true } },
      {
        'i.PricedItem.boardSetup': { $exists: true },
        'i.PricedItem.BoardSetup': { $exists: true },
      },
    ],
  }
);

print('  Matched : ' + pass1.matchedCount);
print('  Modified: ' + pass1.modifiedCount);
print('');

// ---------------------------------------------------------------------------
// PASS 2: Only wrong "boardSetup" exists → copy value to "BoardSetup", then unset
// ---------------------------------------------------------------------------
// MongoDB has no single $rename-equivalent that works inside nested array
// filters, so we do it as two sub-passes: $set then $unset.

print('Pass 2a: Copying "boardSetup" value into "BoardSetup" (only-wrong-casing docs)...');

var pass2a = db.getCollection('Handovers:Events').updateMany(
  {
    'Data.OperationalGroups': {
      $elemMatch: {
        Items: {
          $elemMatch: {
            'PricedItem.boardSetup': { $exists: true },
            'PricedItem.BoardSetup': { $exists: false },
          },
        },
      },
    },
  },
  [
    // Aggregation pipeline update — lets us reference sibling field values
    {
      $set: {
        'Data.OperationalGroups': {
          $map: {
            input: '$Data.OperationalGroups',
            as: 'og',
            in: {
              $mergeObjects: [
                '$$og',
                {
                  Items: {
                    $map: {
                      input: '$$og.Items',
                      as: 'item',
                      in: {
                        $mergeObjects: [
                          '$$item',
                          {
                            PricedItem: {
                              $cond: {
                                if: {
                                  $and: [
                                    { $eq: [{ $type: '$$item.PricedItem' }, 'object'] },
                                    { $gt: [{ $ifNull: ['$$item.PricedItem.boardSetup', null] }, null] },
                                    // boardSetup exists but BoardSetup does not
                                    {
                                      $not: {
                                        $gt: [
                                          {
                                            $ifNull: [
                                              { $getField: { field: 'BoardSetup', input: '$$item.PricedItem' } },
                                              null,
                                            ],
                                          },
                                          null,
                                        ],
                                      },
                                    },
                                  ],
                                },
                                then: {
                                  $mergeObjects: [
                                    '$$item.PricedItem',
                                    { BoardSetup: '$$item.PricedItem.boardSetup' },
                                  ],
                                },
                                else: '$$item.PricedItem',
                              },
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    },
  ]
);

print('  Matched : ' + pass2a.matchedCount);
print('  Modified: ' + pass2a.modifiedCount);
print('');

print('Pass 2b: Unsetting "boardSetup" after rename...');

var pass2b = db.getCollection('Handovers:Events').updateMany(
  {
    'Data.OperationalGroups': {
      $elemMatch: {
        Items: {
          $elemMatch: {
            'PricedItem.boardSetup': { $exists: true },
            'PricedItem.BoardSetup': { $exists: true },
          },
        },
      },
    },
  },
  {
    $unset: {
      'Data.OperationalGroups.$[og].Items.$[i].PricedItem.boardSetup': '',
    },
  },
  {
    arrayFilters: [
      { 'og.Items': { $exists: true } },
      {
        'i.PricedItem.boardSetup': { $exists: true },
        'i.PricedItem.BoardSetup': { $exists: true },
      },
    ],
  }
);

print('  Matched : ' + pass2b.matchedCount);
print('  Modified: ' + pass2b.modifiedCount);
print('');

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------
print('=== Verification counts (should both be 0) ===');
var remaining = db.getCollection('Handovers:Events').countDocuments({
  'Data.OperationalGroups.Items.PricedItem.boardSetup': { $exists: true },
});
print('Docs still containing wrong "boardSetup": ' + remaining);
