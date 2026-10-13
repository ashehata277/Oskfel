let processedTeams = 0;
let updatedTeams = 0;
let updatedWorkerGroups = 0;
let skippedTeams = 0;

db.getCollection("Jobs:Teams")
  .find({})
  .forEach((teamSettings) => {
    processedTeams++;

    if (!teamSettings?.wageSettings?.workerGroups) {
      skippedTeams++;

      print(
        `[SKIPPED] Team ${teamSettings?._id} - No wageSettings.workerGroups found`,
      );
      return;
    }

    let teamUpdated = false;

    teamSettings.wageSettings.workerGroups.forEach((workerGroup) => {
      // Do not override existing Yard configuration
      if (workerGroup?.isYard === true) {
        print(
          `[SKIPPED] Team ${teamSettings._id} - Worker group "${workerGroup.name}" is already marked as Yard`,
        );
        return;
      }

      if (workerGroup?.name === "Yard workers") {
        workerGroup.isYard = true;
        teamUpdated = true;
        updatedWorkerGroups++;

        print(
          `[UPDATED] Team ${teamSettings._id} - Worker group "${workerGroup.name}" marked as Yard`,
        );
      }
    });

    if (teamUpdated) {
      db.getCollection("Jobs:Teams").updateOne(
        { _id: teamSettings._id },
        {
          $set: {
            "wageSettings.workerGroups": teamSettings.wageSettings.workerGroups,
          },
        },
      );

      updatedTeams++;

      print(`[UPDATED TEAM] Team ${teamSettings._id} updated successfully`);
    }
  });

print("\n========== Migration Summary ==========");
print(`Processed teams       : ${processedTeams}`);
print(`Updated teams         : ${updatedTeams}`);
print(`Updated worker groups : ${updatedWorkerGroups}`);
print(`Skipped teams         : ${skippedTeams}`);
print("========================================");
