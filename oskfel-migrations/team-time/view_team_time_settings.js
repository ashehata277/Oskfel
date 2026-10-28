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

const onlyTeam = "";

const valueOf = (team, field) => {
  const pascal = field[0].toUpperCase() + field.slice(1);
  const value = team[field] ?? team[pascal];
  return value === undefined || value === null || value === "" ? "(empty)" : value;
};

const nameOf = (team) => team.teamName ?? team.TeamName ?? team._id;

const rows = [];

collections.forEach((collectionName) => {
  const filter = onlyTeam ? { _id: { $regex: `^${onlyTeam}$`, $options: "i" } } : {};
  const teams = db.getCollection(collectionName).find(filter).toArray();

  const zones = {};
  teams.forEach((team) => {
    const zone = valueOf(team, "timeZone");
    zones[zone] = (zones[zone] ?? 0) + 1;
    rows.push({
      collection: collectionName,
      team: String(nameOf(team)),
      timeZone: valueOf(team, "timeZone"),
      dateFormat: valueOf(team, "dateFormat"),
      timeFormat: valueOf(team, "timeFormat"),
    });
  });

  const summary = Object.entries(zones)
    .map(([zone, count]) => `${zone}: ${count}`)
    .join(", ");
  print(`${collectionName} (${teams.length} teams) -> ${summary || "no teams"}`);
  rows
    .filter((row) => row.collection === collectionName)
    .forEach((row) => print(`  ${row.team} | ${row.timeZone} | ${row.dateFormat} | ${row.timeFormat}`));
  print("");
});

print("");
print("Teams not on Europe/London:");
const notLondon = rows.filter((row) => row.timeZone !== "Europe/London");
if (notLondon.length === 0) {
  print("  none");
} else {
  notLondon.forEach((row) =>
    print(`  ${row.collection} | ${row.team} | ${row.timeZone} | ${row.dateFormat} | ${row.timeFormat}`),
  );
}

if (onlyTeam) {
  print("");
  print(`All collections for ${onlyTeam}:`);
  rows.forEach((row) =>
    print(`  ${row.collection} | ${row.timeZone} | ${row.dateFormat} | ${row.timeFormat}`),
  );
}
