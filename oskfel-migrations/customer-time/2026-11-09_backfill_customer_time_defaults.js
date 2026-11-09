const collections = ["Customers:BatonCustomers", "Gateway:BatonCustomers"];

const defaultTimeZone = "Europe/London";
const defaultDateFormat = "dd/MM/yyyy";
const defaultTimeFormat = "HH:mm";
const dryRun = false;

const usesPascalCase = (customer) => {
  let upperCaseKeys = 0;
  let lowerCaseKeys = 0;
  Object.keys(customer).forEach((key) => {
    if (key === "_id") {
      return;
    }
    if (key[0] === key[0].toUpperCase()) {
      upperCaseKeys++;
    } else {
      lowerCaseKeys++;
    }
  });
  return upperCaseKeys > lowerCaseKeys;
};

print(
  dryRun
    ? "DRY RUN: nothing will be written"
    : "Backfilling empty customer time settings",
);

collections.forEach((collectionName) => {
  const collection = db.getCollection(collectionName);
  const firstCustomer = collection.findOne({});

  if (!firstCustomer) {
    print(`${collectionName}: no customers found`);
    return;
  }

  const pascal = usesPascalCase(firstCustomer);
  const name = (field) => (pascal ? field[0].toUpperCase() + field.slice(1) : field);

  const defaults = [
    [name("timeZone"), defaultTimeZone],
    [name("dateFormat"), defaultDateFormat],
    [name("timeFormat"), defaultTimeFormat],
  ];

  const counts = defaults.map(([field, value]) => {
    const missing = { [field]: { $in: [null, ""] } };
    if (dryRun) {
      return `${field} ${collection.countDocuments(missing)} would change`;
    }
    const result = collection.updateMany(missing, { $set: { [field]: value } });
    return `${field} ${result.modifiedCount}`;
  });

  print(`${collectionName}: ${counts.join(", ")}`);
});
