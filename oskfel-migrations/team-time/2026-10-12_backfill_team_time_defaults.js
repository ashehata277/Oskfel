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

const defaultTimeZone = "Europe/London";
const defaultDateFormat = "dd/MM/yyyy";
const defaultTimeFormat = "HH:mm";

collections.forEach((collectionName) => {
  const collection = db.getCollection(collectionName);
  const firstTeam = collection.findOne({});

  if (!firstTeam) {
    print(`${collectionName}: no teams found`);
    return;
  }

  let upperCaseKeys = 0;
  let lowerCaseKeys = 0;
  Object.keys(firstTeam).forEach((key) => {
    if (key === "_id") {
      return;
    }
    if (key[0] === key[0].toUpperCase()) {
      upperCaseKeys++;
    } else {
      lowerCaseKeys++;
    }
  });

  let timeZoneField = "timeZone";
  let dateFormatField = "dateFormat";
  let timeFormatField = "timeFormat";

  if (upperCaseKeys > lowerCaseKeys) {
    timeZoneField = "TimeZone";
    dateFormatField = "DateFormat";
    timeFormatField = "TimeFormat";
  }

  const timeZoneResult = collection.updateMany(
    { [timeZoneField]: { $in: [null, ""] } },
    { $set: { [timeZoneField]: defaultTimeZone } },
  );

  const dateFormatResult = collection.updateMany(
    { [dateFormatField]: { $in: [null, ""] } },
    { $set: { [dateFormatField]: defaultDateFormat } },
  );

  const timeFormatResult = collection.updateMany(
    { [timeFormatField]: { $in: [null, ""] } },
    { $set: { [timeFormatField]: defaultTimeFormat } },
  );

  print(
    `${collectionName}: timeZone ${timeZoneResult.modifiedCount}, ` +
      `dateFormat ${dateFormatResult.modifiedCount}, ` +
      `timeFormat ${timeFormatResult.modifiedCount}`,
  );
});
