// Validate Handovers:Events — find items where PricedItem name fields are null
// but the same item in Jobs:Items has a value.
//
// Run with: mongosh <connection-string> validate-handover-events-null-names.js

const start = new Date();

print('Starting validation...');
print('');

let found = 0;

// Get all Handovers:Events documents that have at least one null name field
const events = db['Handovers:Events'].aggregate([
  { $unwind: '$Data.OperationalGroups' },
  { $unwind: '$Data.OperationalGroups.Items' },
  { $match: {
    'Data.OperationalGroups.Items.PricedItem._id': { $exists: true, $ne: null },
    $or: [
      { 'Data.OperationalGroups.Items.PricedItem.Floor':      null },
      { 'Data.OperationalGroups.Items.PricedItem.Type':       null },
      { 'Data.OperationalGroups.Items.PricedItem.Height':     null },
      { 'Data.OperationalGroups.Items.PricedItem.Length':     null },
      { 'Data.OperationalGroups.Items.PricedItem.BoardSetup': null },
      { 'Data.OperationalGroups.Items.PricedItem.Material':   null },
      { 'Data.OperationalGroups.Items.PricedItem.Lift':       null },
    ],
  }},
  { $project: {
    _id: 1,
    TeamName: 1,
    pricedItem: '$Data.OperationalGroups.Items.PricedItem',
  }},
], { allowDiskUse: true }).toArray();

print('Events with null name fields found: ' + events.length);
print('');

events.forEach(function(event) {
  const pi = event.pricedItem;

  // Look up the matching Jobs:Items document
  const jobItem = db['Jobs:Items'].findOne({ _id: pi._id });

  // Skip if no matching Jobs:Items found
  if (!jobItem) return;

  // Check which fields are null in the event but have a value in Jobs:Items
  const mismatches = [];

  if (pi.Floor      == null && jobItem.floor      != null) mismatches.push({ field: 'Floor',      jobValue: jobItem.floor });
  if (pi.Type       == null && jobItem.type       != null) mismatches.push({ field: 'Type',       jobValue: jobItem.type });
  if (pi.Height     == null && jobItem.height     != null) mismatches.push({ field: 'Height',     jobValue: jobItem.height });
  if (pi.Length     == null && jobItem.length     != null) mismatches.push({ field: 'Length',     jobValue: jobItem.length });
  if (pi.BoardSetup == null && jobItem.boardSetup != null) mismatches.push({ field: 'BoardSetup', jobValue: jobItem.boardSetup });
  if (pi.Material   == null && jobItem.material   != null) mismatches.push({ field: 'Material',   jobValue: jobItem.material });
  if (pi.Lift       == null && jobItem.lift       != null) mismatches.push({ field: 'Lift',       jobValue: jobItem.lift });

  // Skip if no mismatches
  if (mismatches.length === 0) return;

  found++;

  print('----------------------------------------');
  print('Event _id    : ' + event._id);
  print('TeamName     : ' + event.TeamName);
  print('PricedItem ID: ' + pi._id);
  print('Null fields in Handovers:Events that have a value in Jobs:Items:');

  mismatches.forEach(function(m) {
    print('  ' + m.field + ' -> Jobs:Items has: ' + JSON.stringify(m.jobValue));
  });
});

print('');
print('========================================');
print('Total affected items: ' + found);
print('Elapsed: ' + ((new Date() - start) / 1000).toFixed(2) + 's');
print('========================================');
