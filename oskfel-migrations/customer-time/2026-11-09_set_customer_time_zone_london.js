const collections = ["Customers:BatonCustomers", "Gateway:BatonCustomers"];

const londonSettings = {
  timeZone: "Europe/London",
  dateFormat: "dd/MM/yyyy",
  timeFormat: "HH:mm",
};
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

const fieldsFor = (customer) => {
  const pascal = usesPascalCase(customer);
  return Object.fromEntries(
    Object.entries(londonSettings).map(([field, value]) => [
      pascal ? field[0].toUpperCase() + field.slice(1) : field,
      value,
    ]),
  );
};

print(
  dryRun
    ? "DRY RUN: nothing will be written"
    : "Setting every customer to London time settings",
);

collections.forEach((collectionName) => {
  const collection = db.getCollection(collectionName);
  const firstCustomer = collection.findOne({});

  if (!firstCustomer) {
    print(`${collectionName}: no customers found`);
    return;
  }

  const fields = fieldsFor(firstCustomer);
  const notLondon = {
    $or: Object.entries(fields).map(([field, value]) => ({
      [field]: { $ne: value },
    })),
  };
  const total = collection.countDocuments({});

  if (dryRun) {
    print(
      `${collectionName}: ${collection.countDocuments(notLondon)} of ${total} customers would change`,
    );
    Object.entries(fields).forEach(([field, value]) => {
      collection
        .aggregate([
          { $match: { [field]: { $ne: value } } },
          { $group: { _id: `$${field}`, customers: { $sum: 1 } } },
        ])
        .forEach((group) =>
          print(
            `    ${field} ${group._id ?? "(empty)"} -> ${value}: ${group.customers}`,
          ),
        );
    });
    return;
  }

  const result = collection.updateMany(notLondon, { $set: fields });

  print(
    `${collectionName}: ${result.modifiedCount} of ${total} customers updated (${Object.keys(fields).join(", ")})`,
  );
});
