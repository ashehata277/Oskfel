const collections = [
  "Jobs:Teams",
  "ActiveWork:Teams",
  "Attendance:Teams",
  "Gateway:Teams",
  "Handovers:Teams",
  "Inspections:Teams",
  "Materials:Teams",
  "Notifications:Teams",
  "Resources:Teams",
];

const londonSettings = {
  timeZone: "Europe/London",
  dateFormat: "dd/MM/yyyy",
  timeFormat: "HH:mm",
};
const dryRun = false;

const usesPascalCase = (team) => {
  let upperCaseKeys = 0;
  let lowerCaseKeys = 0;
  Object.keys(team).forEach((key) => {
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

const fieldsFor = (team) => {
  const pascal = usesPascalCase(team);
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
    : "Setting every team to London time settings",
);

collections.forEach((collectionName) => {
  const collection = db.getCollection(collectionName);
  const firstTeam = collection.findOne({});

  if (!firstTeam) {
    print(`${collectionName}: no teams found`);
    return;
  }

  const fields = fieldsFor(firstTeam);
  const notLondon = {
    $or: Object.entries(fields).map(([field, value]) => ({
      [field]: { $ne: value },
    })),
  };
  const total = collection.countDocuments({});

  if (dryRun) {
    print(
      `${collectionName}: ${collection.countDocuments(notLondon)} of ${total} teams would change`,
    );
    Object.entries(fields).forEach(([field, value]) => {
      collection
        .aggregate([
          { $match: { [field]: { $ne: value } } },
          { $group: { _id: `$${field}`, teams: { $sum: 1 } } },
        ])
        .forEach((group) =>
          print(
            `    ${field} ${group._id ?? "(empty)"} -> ${value}: ${group.teams}`,
          ),
        );
    });
    return;
  }

  const result = collection.updateMany(notLondon, { $set: fields });

  print(
    `${collectionName}: ${result.modifiedCount} of ${total} teams updated (${Object.keys(fields).join(", ")})`,
  );
});
