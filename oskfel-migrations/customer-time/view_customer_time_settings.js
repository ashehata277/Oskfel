const collections = ["Customers:BatonCustomers", "Gateway:BatonCustomers"];

const onlyCustomer = "";

const valueOf = (customer, field) => {
  const pascal = field[0].toUpperCase() + field.slice(1);
  const value = customer[field] ?? customer[pascal];
  return value === undefined || value === null || value === "" ? "(empty)" : value;
};

const rows = [];

collections.forEach((collectionName) => {
  const filter = onlyCustomer ? { _id: { $regex: `^${onlyCustomer}$`, $options: "i" } } : {};
  const customers = db.getCollection(collectionName).find(filter).toArray();

  const zones = {};
  customers.forEach((customer) => {
    const zone = valueOf(customer, "timeZone");
    zones[zone] = (zones[zone] ?? 0) + 1;
    rows.push({
      collection: collectionName,
      customer: String(customer._id),
      timeZone: zone,
      dateFormat: valueOf(customer, "dateFormat"),
      timeFormat: valueOf(customer, "timeFormat"),
    });
  });

  const summary = Object.entries(zones)
    .map(([zone, count]) => `${zone}: ${count}`)
    .join(", ");
  print(`${collectionName} (${customers.length} customers) -> ${summary || "no customers"}`);
  rows
    .filter((row) => row.collection === collectionName)
    .forEach((row) => print(`  ${row.customer} | ${row.timeZone} | ${row.dateFormat} | ${row.timeFormat}`));
  print("");
});

print("");
print("Customers not on Europe/London:");
const notLondon = rows.filter((row) => row.timeZone !== "Europe/London");
if (notLondon.length === 0) {
  print("  none");
} else {
  notLondon.forEach((row) =>
    print(`  ${row.collection} | ${row.customer} | ${row.timeZone} | ${row.dateFormat} | ${row.timeFormat}`),
  );
}
