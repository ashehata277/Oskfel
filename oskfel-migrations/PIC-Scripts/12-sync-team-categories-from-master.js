var teamName = "ABS-0001";
var masterTeamName = "masterteam";

var teamCategoryNames = db
  .getCollection("Jobs:Items")
  .distinct("category.name", { teamName: teamName })
  .filter((n) => n != null && n !== "");

var teamCatalogueCategoryNames = db
  .getCollection("Jobs:ItemCatalogueCategories")
  .distinct("name", { teamName: teamName })
  .filter((n) => n != null && n !== "");

teamCatalogueCategoryNames.forEach((categoryName) => {
  if (teamCategoryNames.some((a) => a == categoryName)) return;

  var categoryOfMasterTeam = db
    .getCollection("Jobs:ItemCatalogueCategories")
    .findOne({
      teamName: masterTeamName,
      name: categoryName,
    });

  if (!categoryOfMasterTeam) {
    print("No master category found for name: " + categoryName);
    return;
  }

  categoryOfMasterTeam.teamName = teamName;
  categoryOfMasterTeam._id = new ObjectId();
  var newTeamCategory = categoryOfMasterTeam;
  db.getCollection("Jobs:ItemCatalogueCategories").insertOne(newTeamCategory);
});

db.getCollection("Jobs:Items")
  .find({
    teamName: teamName,
  })
  .forEach((item) => {
    if (!item.category || !item.category.name) {
      print("Skipping item with no category: " + item._id);
      return;
    }

    var newTeamCategory = db
      .getCollection("Jobs:ItemCatalogueCategories")
      .findOne({
        teamName: teamName,
        name: item.category.name,
      });

    if (!newTeamCategory) {
      print(
        "No team category for item " + item._id + " name=" + item.category.name,
      );
      return;
    }

    item.category._id = newTeamCategory._id;

    db.getCollection("Jobs:Items").replaceOne(
      {
        _id: item._id,
      },
      item,
    );
  });
