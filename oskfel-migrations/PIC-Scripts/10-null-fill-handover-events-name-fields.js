// Run with: mongosh <connection-string> 10-null-fill-handover-events-name-fields.js
// Naming confirmed from real document: Data.OperationalGroups[].Items[].PricedItem (all PascalCase)

print('Starting null-fill for Handovers:Events...');
print('Processing path: Data.OperationalGroups.Items.PricedItem');

var result = db.getCollection('Handovers:Events').updateMany(
  {
    'Data.OperationalGroups': {
      $elemMatch: {
        Items: {
          $elemMatch: {
            PricedItem: { $type: 'object' },
            $or: [
              { 'PricedItem.Floor':      { $exists: false } },
              { 'PricedItem.Type':       { $exists: false } },
              { 'PricedItem.Height':     { $exists: false } },
              { 'PricedItem.Length':     { $exists: false } },
              { 'PricedItem.BoardSetup': { $exists: false } },
              { 'PricedItem.Material':   { $exists: false } },
            ],
          },
        },
      },
    },
  },
  {
    $set: {
      'Data.OperationalGroups.$[og].Items.$[i].PricedItem.Floor':      null,
      'Data.OperationalGroups.$[og].Items.$[i].PricedItem.Type':       null,
      'Data.OperationalGroups.$[og].Items.$[i].PricedItem.Height':     null,
      'Data.OperationalGroups.$[og].Items.$[i].PricedItem.Length':     null,
      'Data.OperationalGroups.$[og].Items.$[i].PricedItem.BoardSetup': null,
      'Data.OperationalGroups.$[og].Items.$[i].PricedItem.Material':   null,
    },
  },
  {
    arrayFilters: [
      { 'og.Items': { $exists: true } },
      {
        'i.PricedItem': { $type: 'object' },
        $or: [
          { 'i.PricedItem.Floor':      { $exists: false } },
          { 'i.PricedItem.Type':       { $exists: false } },
          { 'i.PricedItem.Height':     { $exists: false } },
          { 'i.PricedItem.Length':     { $exists: false } },
          { 'i.PricedItem.BoardSetup': { $exists: false } },
          { 'i.PricedItem.Material':   { $exists: false } },
        ],
      },
    ],
  }
);

print('Done.');
print('Matched : ' + result.matchedCount);
print('Modified: ' + result.modifiedCount);
