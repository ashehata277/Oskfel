# Team zone via request headers: changes in all pull requests

Branch `feature/1.6.0/team-zone-headers` in every repo. Dates stay UTC in storage and on the wire. The team's zone and formats travel in Gateway headers (`Intowork.TeamTimeZone`, `Intowork.TeamDateFormat`, `Intowork.TeamTimeFormat`) and are applied only where a person sees or picks a date.

Generated 2026-10-08 from the pushed branches. File counts compare each branch with its original base (`main`; `master` for OcelotConfigValidator), so they show this work only. Merge status is a dry-run merge into the current `develop`.

## Summary

| PR | Repo | Files | Added | Removed | Merge into develop | Tests |
|---|---|---:|---:|---:|---|---|
| 11009 | Gateway | 19 | +685 | -14 | **3 conflicting file(s)** | 64 contract/auth tests pass |
| 11010 | ProjectService | 116 | +2,737 | -243 | **14 conflicting file(s)** | 2,555 pass; 4/4 zones |
| 11011 | AttendanceService | 133 | +6,214 | -1,834 | clean | 46 + 524 pass; 4/4 zones |
| 11012 | ActiveWorkService | 86 | +2,577 | -300 | **2 conflicting file(s)** | 314 pass; 4/4 zones |
| 11013 | CustomerService | 35 | +821 | -88 | clean | 229 pass; 4/4 zones |
| 11014 | ForecastingService | 32 | +720 | -132 | clean | 11 pass; 4/4 zones |
| 11015 | FrameworkCache | 56 | +1,733 | -643 | clean | 275 pass; 4/4 zones |
| 11016 | GafferService | 50 | +1,114 | -57 | clean | not run here (restore 401) |
| 11017 | HandoverService | 61 | +2,132 | -563 | **5 conflicting file(s)** | 491 pass; 4/4 zones |
| 11018 | InspectionsService | 41 | +1,047 | -63 | **4 conflicting file(s)** | 50 pass; 4/4 zones |
| 11019 | MaterialsService | 78 | +1,697 | -262 | **1 conflicting file(s)** | 263 pass; 4/4 zones |
| 11020 | NotificationService | 38 | +1,000 | -2 | clean | 20 pass; 4/4 zones |
| 11021 | PermissionsService | 21 | +482 | -0 | clean | 169 pass; 4/4 zones |
| 11022 | ResourcesService | 62 | +1,719 | -232 | clean | 480 pass; 4/4 zones |
| 11023 | SafetySuiteService | 22 | +534 | -4 | clean | 52 pass; 4/4 zones |
| 11024 | Frontend | 488 | +12,594 | -5,360 | **12 conflicting file(s)** | tsc clean; 1,347 pass / 194 fail (unrelated providers); identical in London, Toronto, Auckland |
| 11025 | HandoverApp | 50 | +3,940 | -151 | clean | build ok; 31 default specs fail (missing providers); 2 specs do not compile (on main) |
| 11026 | InspectionsApp | 49 | +4,033 | -93 | clean | build ok; 250 pass |
| 11027 | OcelotConfigValidator | 1 | +2,024 | -506 | no `develop` branch; targets `master` | JSON checked: 506/506 blocks carry the headers |

All PRs are drafts except 11027. Targets: `develop`, except 11027 (`master`).

## Merge status against develop

`develop` is ahead of the base these branches were cut from, so these PRs need a rebase or merge of `develop` first where conflicts are listed.

**Gateway** (PR 11009):
- `Intowork.Gateway.Background/Events/Handlers/TeamCreatedHandler.cs`
- `Intowork.Gateway.Background/Events/Handlers/TeamUpdatedHandler.cs`
- `Intowork.Gateway.Background/Events/Integration/TeamUpdated.cs`

**ProjectService** (PR 11010):
- `Intowork.Core/Commands/UpdateTeamSettingsCommand.cs`
- `Intowork.Core/Events/Integration/TeamCreated.cs`
- `Intowork.Core/Events/Integration/TeamUpdated.cs`
- `Intowork.Core/Handlers/CommandHandlers/CreateTeamSettingsHandler.cs`
- `Intowork.Core/Handlers/CommandHandlers/EditTeamSettingsHandler.cs`
- `Intowork.Core/Handlers/CommandHandlers/UpdateTeamSettingsHandler.cs`
- `Intowork.Core/Models/Api/CreateTeamSettings.cs`
- `Intowork.Core/Models/Api/TeamModel.cs`
- `Intowork.Core/Models/Api/TeamSettings.cs`
- `Intowork.Core/Models/Data/Team.cs`
- `Intowork.Core/Repositories/ITeamsRepo.cs`
- `Intowork.Core/Repositories/TeamsRepo.cs`
- `Intowork.Core/Services/Documents/QuotationDocumentGenerator.cs`
- `Intowork.Jobs.API/Controllers/TeamSettingsController.cs`

**ActiveWorkService** (PR 11012):
- `Intowork.ActiveWork.Background/Events/IntegrationEventHandlers/StaffMemberEmailChangedHandler.cs`
- `Intowork.ActiveWork.Core/Intowork.ActiveWork.Core.csproj`

**HandoverService** (PR 11017):
- `Intowork.HandoverService.Background/Services/ReportGeneratorService.cs`
- `Intowork.HandoverService.Background/appsettings.json`
- `Intowork.HandoverService.Core.Tests/CQRS/Handlers/Commands/BatonHandoverHookTests.cs`
- `Intowork.HandoverService.Core/CQRS/Handlers/Commands/UpdateHandoverHandler.cs`
- `Intowork.HandoverService.Core/Intowork.HandoverService.Core.csproj`

**InspectionsService** (PR 11018):
- `Intowork.Inspections.API/Extensions/InspectionsServiceCollectionExtensions.cs`
- `Intowork.Inspections.Background.Tests/Intowork.Inspections.Background.Tests.csproj`
- `Intowork.Inspections.Background/Extensions/InspectionsBackgroundServiceCollectionExtensions.cs`
- `Intowork.Inspections.sln`

**MaterialsService** (PR 11019):
- `Intowork.MaterialsService.Core/Data/Repositories/Interfaces/IOrderRequestsRepo.cs`

**Frontend** (PR 11024):
- `src/app/jobs/projects-map/projects-map.component.ts`
- `src/app/quotations/shared/quotation-builder-preview/quotation-builder-preview.component.html`
- `src/app/resources/staff-detail/staff-detail.component.ts`
- `src/app/safety-suite/near-miss/near-miss-charts/near-miss-charts.component.ts`
- `src/app/safety-suite/near-miss/near-miss-form/near-miss-form.component.html`
- `src/app/safety-suite/near-miss/near-miss-form/near-miss-form.component.ts`
- `src/app/safety-suite/safety-overview/safety-overview.component.ts`
- `src/app/shared/pdf-document.service.ts`
- `src/app/shared/team-settings.ts`
- `src/app/teams-settings/create-team-settings/create-team-settings.component.ts`
- `src/app/teams-settings/edit-team-settings/edit-team-settings.component.ts`
- `src/app/wage/adjustmenttable-date-selector/adjustmenttable-date-selector.component.ts`

## Pull requests

### Gateway (PR 11009)

- Team read model stores `TimeZone`, `DateFormat`, `TimeFormat` from `TeamCreated` / `TeamUpdated`.
- `IntoworkAuthInjector` adds three claims (London defaults when empty, customer path, selected-team path).
- `Ingress.cs` maps them to `Intowork.TeamTimeZone`, `Intowork.TeamDateFormat`, `Intowork.TeamTimeFormat` on authenticated routes only.
- `TeamTimeResolver` returns London for a missing team and logs an unknown zone. No kill switch.

Files: 9 source, 3 kit, 5 test, 2 config and scripts. Tests: 64 contract/auth tests pass.

<details><summary>Source files</summary>

| File | + | - |
|---|---:|---:|
| `Intowork.Gateway/Auth/IntoworkAuthInjector.cs` | 23 | 3 |
| `Intowork.Gateway.Core/Data/Models/Ingress.cs` | 9 | 0 |
| `Intowork.Gateway.Core/Data/Repositories/TeamsRepo.cs` | 9 | 0 |
| `Intowork.Gateway.Background/Events/Handlers/TeamCreatedHandler.cs` | 4 | 1 |
| `Intowork.Gateway.Background/Events/Handlers/TeamUpdatedHandler.cs` | 4 | 1 |
| `Intowork.Gateway.Core/Data/Models/Team.cs` | 4 | 0 |
| `Intowork.Gateway.Background/Events/Integration/TeamCreated.cs` | 3 | 0 |
| `Intowork.Gateway.Background/Events/Integration/TeamUpdated.cs` | 3 | 0 |
| `Intowork.Gateway/Extensions/GatewayServiceCollectionExtensions.cs` | 2 | 0 |

</details>

<details><summary>Test files</summary>

- `Intowork.Gateway.Tests/Auth/HeaderTransformationContractTests.cs` (+196)
- `Intowork.Gateway.Tests/Auth/IntoworkAuthInjectorTests.cs` (+133)
- `Intowork.Gateway.Background.Tests/Events/Handlers/TeamTimeSettingsHandlerTests.cs` (+111)
- `Intowork.Gateway.Core.Tests/Data/Repositories/TeamsRepoTests.cs` (+60)
- `Intowork.Gateway.Tests/Middleware/IntoworkTeamOverrideMiddlewareTests.cs` (+4)

</details>

### ProjectService (PR 11010)

- Source of truth for the team's zone and formats; `SetTeamTimeZoneHandler` is the support-only once-only zone set.
- Create / Edit / UpdateTeamSettings handlers validate through `TeamTimeRules` and `TeamTimeSettingsValidator`; `TeamSettingsController` exposes the fields.
- `TeamsRepoTeamCopyReader` serves the zone; `TeamMonthWindow`, `GetOverHireHandler` use windows.
- `FilterAndSortExtension`: `IQueryable` and `IAggregateFluent` overloads both take the clock.

Files: 72 source, 24 kit, 13 test, 7 config and scripts. Tests: 2,555 pass; 4/4 zones.

<details><summary>Source files</summary>

| File | + | - |
|---|---:|---:|
| `Intowork.Core/Extensions/FilterAndSortExtension.cs` | 62 | 72 |
| `Intowork.Core/Handlers/CommandHandlers/SetTeamTimeZoneHandler.cs` | 126 | 0 |
| `Intowork.Core/Repositories/TeamsRepo.cs` | 53 | 2 |
| `Intowork.Core/Validation/TeamTimeSettingsValidator.cs` | 49 | 0 |
| `Intowork.Core/Validation/TeamTimeRules.cs` | 40 | 0 |
| `Intowork.Jobs.API/Controllers/TeamSettingsController.cs` | 32 | 2 |
| `Intowork.Core/Handlers/CommandHandlers/UpdateTeamSettingsHandler.cs` | 27 | 1 |
| `Intowork.Core/Handlers/CommandHandlers/EditTeamSettingsHandler.cs` | 25 | 1 |
| `Intowork.Core/Handlers/CommandHandlers/CreateTeamSettingsHandler.cs` | 21 | 1 |
| `Intowork.Core/Extensions/ProjectTeamTimeServiceCollectionExtensions.cs` | 19 | 0 |
| `Intowork.Core/Handlers/QueryHandlers/GetOverHireHandler.cs` | 12 | 6 |
| `Intowork.Core/Repositories/JobsRepo.cs` | 8 | 10 |
| `Intowork.Core/Extensions/TeamMonthWindow.cs` | 15 | 0 |
| `Intowork.Core/Repositories/TeamsRepoTeamCopyReader.cs` | 15 | 0 |
| `Intowork.Core/Commands/SetTeamTimeZoneCommand.cs` | 13 | 0 |
| `Intowork.Core/Handlers/CommandHandlers/UpdateExternalValuationTransactionHandler.cs` | 8 | 3 |
| `Intowork.Core/Services/Documents/QuotationDocumentGenerator.cs` | 7 | 4 |
| `Intowork.Core/Commands/UpdateTeamSettingsCommand.cs` | 8 | 1 |
| `Intowork.Core/Repositories/QuotationsRepo.cs` | 5 | 4 |
| `Intowork.Core/Settings/TeamZoneOverrideOptions.cs` | 9 | 0 |
| `Intowork.Core/Handlers/CommandHandlers/AddExternalValuationTransactionHandler.cs` | 6 | 2 |
| `Intowork.Core/Handlers/QueryHandlers/GetAllPrelimsIncomeTransactionsHandler.cs` | 5 | 2 |
| `Intowork.Core/Handlers/QueryHandlers/GetAllQuotationContainersHandler.cs` | 5 | 2 |
| `Intowork.Core/Handlers/QueryHandlers/GetAllTeamsSettingsHandler.cs` | 5 | 2 |
| `Intowork.Core/Handlers/QueryHandlers/GetExternalMoneyTransactionsHandler.cs` | 5 | 2 |
| `Intowork.Core/Handlers/QueryHandlers/GetExternalValuationTransactionsHandler.cs` | 5 | 2 |
| `Intowork.Core/Handlers/QueryHandlers/GetPaginatedQuotationFilesHandler.cs` | 5 | 2 |
| `Intowork.Core/Handlers/QueryHandlers/GetPaginatedQuotationsHandler.cs` | 5 | 2 |
| `Intowork.Core/Handlers/QueryHandlers/GetPrelimsCostTransactions/GetPrelimsCostTransactionsHandler.cs` | 5 | 2 |
| `Intowork.Core/Handlers/QueryHandlers/GetProjectFilesHandler.cs` | 5 | 2 |
| `Intowork.Core/Handlers/QueryHandlers/GetQuotationNotesQueryHandler.cs` | 5 | 2 |
| `Intowork.Core/Handlers/QueryHandlers/GetQuotationVersionsQueryHandler.cs` | 5 | 2 |
| `Intowork.Core/Handlers/QueryHandlers/GetQuotationsOverviewHandler.cs` | 5 | 2 |
| `Intowork.Core/Handlers/QueryHandlers/GetVariationTransactionsHandler.cs` | 5 | 2 |
| `Intowork.Core/Handlers/QueryHandlers/Rates/GetPaginatedCatalogueItemsHandler.cs` | 5 | 2 |
| `Intowork.Core/Handlers/QueryHandlers/Rates/GetPaginatedMaterialsForTeamHandler.cs` | 5 | 2 |
| `Intowork.Core/Handlers/QueryHandlers/Rates/GetPaginatedTeamItemsHandler.cs` | 5 | 2 |
| `Intowork.Core/Models/Api/SetTeamTimeZoneRequest.cs` | 7 | 0 |
| `Intowork.Core/Repositories/IJobsRepo.cs` | 4 | 3 |
| `Intowork.Core/Models/Data/Team.cs` | 6 | 0 |
| `Intowork.Core/Repositories/IQuotationsRepo.cs` | 4 | 2 |
| `Intowork.Jobs.BackgroundService/Program.cs` | 5 | 1 |
| `Intowork.Core/Repositories/ITeamsRepo.cs` | 4 | 1 |
| `Intowork.Core/Repositories/ItemsRepo.cs` | 3 | 2 |
| `Intowork.Core/Repositories/MaterialsRepo.cs` | 3 | 2 |
| `Intowork.Core/Repositories/PrelimsCostTransactionRepo.cs` | 3 | 2 |
| `Intowork.Core/Repositories/PrelimsIncomeTransactionRepo.cs` | 3 | 2 |
| `Intowork.Core/Repositories/ProjectFileRepo.cs` | 3 | 2 |
| `Intowork.Core/Repositories/QuotationContainersRepo.cs` | 3 | 2 |
| `Intowork.Core/Repositories/QuotationFileRepo.cs` | 3 | 2 |
| `Intowork.Core/Repositories/QuotationNotesRepo.cs` | 3 | 2 |
| `Intowork.Core/Repositories/QuotationVersionsRepo.cs` | 3 | 2 |
| `Intowork.Core/Repositories/StockItemRepo.cs` | 3 | 2 |
| `Intowork.Core/Handlers/CommandHandlers/AcquireBulkMoveRegistryHandler.cs` | 2 | 2 |
| `Intowork.Jobs.API/Program.cs` | 4 | 0 |
| `Intowork.Core/Events/Integration/TeamCreated.cs` | 3 | 0 |
| `Intowork.Core/Events/Integration/TeamUpdated.cs` | 3 | 0 |
| `Intowork.Core/Models/Api/CreateTeamSettings.cs` | 3 | 0 |
| `Intowork.Core/Models/Api/TeamModel.cs` | 3 | 0 |
| `Intowork.Core/Models/Api/TeamSettings.cs` | 3 | 0 |
| ... 12 more | | |

</details>

<details><summary>Test files</summary>

- `Intowork.Jobs.API.Tests/Controllers/TeamSettingsTimeContractTests.cs` (+156)
- `Intowork.Core.Tests/Extensions/FilterAndSortExtensionDateTests.cs` (+126)
- `Intowork.Core.Tests/Extensions/TeamMonthWindowTests.cs` (+51)
- `Intowork.Core.Tests/Services/Documents/QuotationDocumentGeneratorTests.cs` (+34)
- `Intowork.Core.Tests/Support/TeamClockSupport.cs` (+20)
- `Intowork.Jobs.API.Tests/Controllers/FixedTeamTimeOptions.cs` (+13)
- `Intowork.Core.Tests/Handlers/QueryHandlers/GetQuotationVersionsQueryHandlerTests.cs` (+12)
- `Intowork.Core.Tests/Handlers/CommandHandlers/CreateTeamSettingsHandlerTests.cs` (+3)
- `Intowork.Core.Tests/Handlers/CommandHandlers/EditTeamSettingsHandlerTests.cs` (+3)
- `Intowork.Core.Tests/Handlers/CommandHandlers/UpdateTeamSettingsHandlerGeofenceTests.cs` (+3)
- `Intowork.Core.Tests/Handlers/CommandHandlers/UpdateTeamSettingsHandlerHeadOfficeTests.cs` (+3)
- `Intowork.Core.Tests/Handlers/CommandHandlers/UpdateTeamSettingsHandlerTests.cs` (+3)
- `Intowork.Jobs.API.Tests/Controllers/TeamSettingsControllerTests.cs` (+2)

</details>

### AttendanceService (PR 11011)

- Master copy of the backend time kit, with `sync-time-kit.sh`, `check-time-kit.sh`, `check-time-gates.sh`, `test-tz-matrix.sh`.
- Clock-in/out, supervisor, smart clock and absent handlers use the team clock; `UserAttendanceRepo` and `EventsRepo` filter on UTC windows.
- Wage maths (`WageCalculatorExtension`, `WeekRecalculator`, `WageRecalculation`) and the shadow-compare tool (never run against a database).
- `ReminderJobScheduler` resolves each team's zone.

Files: 75 source, 18 kit, 28 test, 12 config and scripts. Tests: 46 + 524 pass; 4/4 zones.

<details><summary>Source files</summary>

| File | + | - |
|---|---:|---:|
| `Intowork.Attendance.Core/CQRS/Handlers/UserSmartClockHandler.cs` | 238 | 235 |
| `Intowork.Attendance.Core/CQRS/Handlers/SupervisorClockoutHandler.cs` | 203 | 212 |
| `Intowork.Attendance.Core/CQRS/Handlers/SupervisorClockInHandler.cs` | 201 | 210 |
| `Intowork.Attendance.Core/Data/Repositories/UserAttendanceRepo.cs` | 118 | 119 |
| `Intowork.Attendance.Core/Data/Repositories/EventsRepo.cs` | 101 | 99 |
| `Intowork.Attendance.Core/CQRS/Handlers/UserClockInHandler.cs` | 91 | 88 |
| `Intowork.Attendance.Core/CQRS/Handlers/UserClockOutHandler.cs` | 83 | 80 |
| `Intowork.Attendance.Core/Extensions/WageCalculatorExtension.cs` | 75 | 83 |
| `Intowork.Attendance.Core/CQRS/Handlers/SupervisorAbsentHandler.cs` | 71 | 68 |
| `Intowork.Attendance.Core/Data/Repositories/Interfaces/IEventsRepo.cs` | 65 | 64 |
| `Intowork.Attendance.Core/Data/Repositories/WageRecordsRepo.cs` | 42 | 64 |
| `Intowork.Attendance.Background/Services/ReminderJobScheduler.cs` | 80 | 0 |
| `Intowork.Attendance.Core/Data/Repositories/WageWeekSnapshotsRepo.cs` | 49 | 30 |
| `Intowork.Attendance.ShadowCompare/ShadowRun.cs` | 73 | 0 |
| `Intowork.Attendance.ShadowCompare/WeekRecalculator.cs` | 73 | 0 |
| `Intowork.Attendance.Core/Utilities/ClockInOutTimeCalculator.cs` | 30 | 42 |
| `Intowork.Attendance.Background/Services/ReminderService.cs` | 43 | 26 |
| `Intowork.Attendance.Core/Data/Repositories/Interfaces/IUserAttendanceRepo.cs` | 34 | 33 |
| `Intowork.Attendance.Core/CQRS/Handlers/RecalculateWageRecordHandler.cs` | 19 | 42 |
| `Intowork.Attendance.Core/Utilities/WageRecalculation.cs` | 51 | 0 |
| `Intowork.Attendance.Core/Data/WageHelper.cs` | 21 | 26 |
| `Intowork.Attendance.ShadowCompare/SnapshotDiffer.cs` | 45 | 0 |
| `Intowork.Attendance.Core/Data/Models/UserAttendanceRecord.cs` | 36 | 8 |
| `Intowork.Attendance.ShadowCompare/ShadowReport.cs` | 44 | 0 |
| `Intowork.Attendance.ShadowCompare/SnapshotBuilder.cs` | 44 | 0 |
| `Intowork.Attendance.Core/Utilities/Services/WageWeekDateCalculator.cs` | 9 | 34 |
| `Intowork.Attendance.Core/Utilities/Services/WageCalculaterHelper.cs` | 25 | 17 |
| `Intowork.Attendance.Core/Data/Repositories/WageRecordFilters.cs` | 37 | 0 |
| `Intowork.Attendance.API/CQRS/Handlers/GetRangedWagesPerDayHandler.cs` | 20 | 14 |
| `Intowork.Attendance.API/CQRS/Handlers/GetTeamWagesAttendanceForPeriodHandler.cs` | 17 | 16 |
| `Intowork.Attendance.API/CQRS/Handlers/GetUserWagesAttendanceForPeriodHandler.cs` | 17 | 16 |
| `Intowork.Attendance.ShadowCompare/AllowList.cs` | 32 | 0 |
| `Intowork.Attendance.Core/Utilities/TeamPeriodExtensions.cs` | 26 | 0 |
| `Intowork.Attendance.API/CQRS/Handlers/GetProjectWagesForPeriodHandler.cs` | 17 | 6 |
| `Intowork.Attendance.Core/Utilities/TeamClockFactory.cs` | 23 | 0 |
| `Intowork.Attendance.Background/Extensions/AttendanceBackgroundJobExtensions.cs` | 6 | 16 |
| `Intowork.Attendance.ShadowCompare/ShadowOptions.cs` | 19 | 0 |
| `Intowork.Attendance.Core/Utilities/AttendanceTeamTimeExtensions.cs` | 18 | 0 |
| `Intowork.Attendance.ShadowCompare/ReadOnlyRepositoryFactory.cs` | 18 | 0 |
| `Intowork.Attendance.Core/Data/Repositories/Interfaces/IWageRecordsRepo.cs` | 9 | 8 |
| `Intowork.Attendance.Core/CQRS/Handlers/DailyRateOverrideHandler.cs` | 11 | 5 |
| `Intowork.Attendance.Core/Utilities/TeamCopyReader.cs` | 16 | 0 |
| `Intowork.Attendance.ShadowCompare/Program.cs` | 16 | 0 |
| `Intowork.Attendance.API/CQRS/Handlers/GetWagesByProjectIdHandler.cs` | 10 | 5 |
| `Intowork.Attendance.ShadowCompare/WageSnapshot.cs` | 14 | 0 |
| `Intowork.Attendance.API/CQRS/Handlers/GetProjectTotalsHandler.cs` | 9 | 4 |
| `Intowork.Attendance.API/CQRS/Handlers/GetRangedWagesValuesHandler.cs` | 7 | 4 |
| `Intowork.Attendance.Core/Data/Repositories/Interfaces/IWageWeekSnapshotsRepo.cs` | 6 | 5 |
| `Intowork.Attendance.Core/Utilities/DefaultTeamClock.cs` | 11 | 0 |
| `Intowork.Attendance.Background/Events/IntegrationEventHandlers/TeamCreatedHandler.cs` | 8 | 1 |
| `Intowork.Attendance.Background/Events/IntegrationEventHandlers/TeamUpdatedHandler.cs` | 8 | 1 |
| `Intowork.Attendance.Core/CQRS/Handlers/WageRecordApprovalHandler.cs` | 6 | 3 |
| `Intowork.Attendance.Core/Data/Repositories/TeamsRepo.cs` | 9 | 0 |
| `Intowork.Attendance.Core/Utilities/Services/IWageWeekDateCalculator.cs` | 5 | 4 |
| `Intowork.Attendance.API/CQRS/Handlers/GetAttendanceRecordsForUsersQueryHandler.cs` | 6 | 2 |
| `Intowork.Attendance.Background/Events/IntegrationEventHandlers/StaffMemberAbsenceCreatedOrUpdatedHandler.cs` | 6 | 2 |
| `Intowork.Attendance.Background/Events/IntegrationEventHandlers/StaffMemberAbsenceDeletedHandler.cs` | 6 | 2 |
| `Intowork.Attendance.Background/Events/IntegrationEventHandlers/StaffMemberMetaUpdatedHandler.cs` | 6 | 2 |
| `Intowork.Attendance.Core/CQRS/Handlers/RebuildAttendanceRecordHandler.cs` | 6 | 2 |
| `Intowork.Attendance.Core/Data/Repositories/ResourceAllocationRepo.cs` | 3 | 4 |
| ... 15 more | | |

</details>

<details><summary>Test files</summary>

- `Intowork.Attendance.API.Tests/CQRS/WagesForPeriodHandlerTests.cs` (+288)
- `Intowork.Attendance.Core.Tests/Characterization/WagePeriodCharacterizationTests.cs` (+241)
- `Intowork.Attendance.Core.Tests/Characterization/UserAttendanceRecordCharacterizationTests.cs` (+226)
- `Intowork.Attendance.Core.Tests/ShadowCompare/ShadowCompareTests.cs` (+209)
- `Intowork.Attendance.Core.Tests/Characterization/WageCalculatorCharacterizationTests.cs` (+193)
- `Intowork.Attendance.Core.Tests/Characterization/WageCalculaterHelperCharacterizationTests.cs` (+190)
- `Intowork.Attendance.Core.Tests/Characterization/WageHelperCharacterizationTests.cs` (+177)
- `Intowork.Attendance.Core.Tests/Reminders/ReminderServiceTests.cs` (+150)
- `Intowork.Attendance.Core.Tests/Characterization/ClockInOutTimeCalculatorCharacterizationTests.cs` (+147)
- `Intowork.Attendance.Core.Tests/Reminders/ReminderJobSchedulerTests.cs` (+132)
- `Intowork.Attendance.Core.Tests/Characterization/WageWeekDateCalculatorCharacterizationTests.cs` (+98)
- `Intowork.Attendance.Core.Tests/Characterization/DayWindowCharacterizationTests.cs` (+93)
- `Intowork.Attendance.Core.Tests/Events/IntegrationEventHandlers/TeamTimeSettingsHandlerTests.cs` (+89)
- `Intowork.Attendance.Core.Tests/Characterization/RecalculateWageRecordHandlerWindowTests.cs` (+86)
- `Intowork.Attendance.Core.Tests/Characterization/WageRecordsRepoCharacterizationTests.cs` (+78)
- `Intowork.Attendance.Core.Tests/Characterization/WageCalcSupport.cs` (+76)
- `Intowork.Attendance.API.Tests/CQRS/GetAttendanceRecordsForUsersQueryHandlerTests.cs` (+66)
- `Intowork.Attendance.Core.Tests/Characterization/CapturedFilter.cs` (+66)
- `Intowork.Attendance.Core.Tests/Utilities/TeamPeriodExtensionsTests.cs` (+46)
- `Intowork.Attendance.Core.Tests/CQRS/Handlers/SupervisorClockoutHandlerTests.cs` (+23)
- `Intowork.Attendance.Core.Tests/CQRS/Handlers/SupervisorClockInHandlerTests.cs` (+21)
- `Intowork.Attendance.Core.Tests/TeamClockSupport.cs` (+16)
- `Intowork.Attendance.Core.Tests/CQRS/Handlers/UserSmartClockHandlerTests.cs` (+9)
- `Intowork.Attendance.Core.Tests/CQRS/Handlers/WageRecordApprovalHandlerTests.cs` (+7)
- `Intowork.Attendance.Core.Tests/Utilities/ClockInOutTimeCalculatorTests.cs` (+6)
- `Intowork.Attendance.Core.Tests/CQRS/Handlers/DailyRateOverrideHandlerTests.cs` (+3)
- `Intowork.Attendance.Core.Tests/TestAssemblySettings.cs` (+3)
- `Intowork.Attendance.Core.Tests/Intowork.Attendance.Core.Tests.csproj` (+1)

</details>

### ActiveWorkService (PR 11012)

- `TimeZoneProvider.London` removed; reminders, subject line and PDF use the team day, zone and formats.
- `ActiveWorkRepo`, `StaffAssignmentsRepo` filter on team-day windows; `ActiveWorkTeamCopyReader`.

Files: 41 source, 15 kit, 23 test, 7 config and scripts. Tests: 314 pass; 4/4 zones.

<details><summary>Source files</summary>

| File | + | - |
|---|---:|---:|
| `Intowork.ActiveWork.Core/Repositories/ActiveWorkRepo.cs` | 73 | 37 |
| `Intowork.ActiveWork.Background/Services/TomorrowStaffAssignmentReminderService.cs` | 36 | 35 |
| `Intowork.ActiveWork.Core/Repositories/StaffAssignmentsRepo.cs` | 38 | 17 |
| `Intowork.ActiveWork.Background/Services/ReportGeneratorService.cs` | 29 | 22 |
| `Intowork.ActiveWork.Core/Utilities/ActiveWorkDateUtilities/ActiveWorkDateUtilities.cs` | 19 | 22 |
| `Intowork.ActiveWork.Core/Models/Data/ActiveWorkRecord.cs` | 20 | 16 |
| `Intowork.ActiveWork.Background/Services/ActiveWorkNotificationService.cs` | 18 | 15 |
| `Intowork.ActiveWork.API/CQRS/Handlers/GetLinkedActiveWorkRecordsByActiveWorkHandler.cs` | 16 | 8 |
| `Intowork.ActiveWork.Core/Extensions/TeamTimeRegistrationExtensions.cs` | 18 | 0 |
| `Intowork.ActiveWork.Core/Services/ActiveWorkTeamCopyReader.cs` | 16 | 0 |
| `Intowork.ActiveWork.Background/Events/IntegrationEventHandlers/StaffMemberEmailChangedHandler.cs` | 11 | 3 |
| `Intowork.ActiveWork.Background/Extensions/ActiveWorkBackgroundApplicationBuilderExtensions.cs` | 6 | 7 |
| `Intowork.ActiveWork.Core/Utilities/TimeZoneProvider.cs` | 0 | 12 |
| `Intowork.ActiveWork.API/CQRS/DayWindowExtensions.cs` | 11 | 0 |
| `Intowork.ActiveWork.Background/Events/DomainEventHandlers/ActiveWorkModelRebuildHandler2.cs` | 8 | 3 |
| `Intowork.ActiveWork.Background/Events/DomainEventHandlers/CreateWorkReadinessStateReportHandler.cs` | 9 | 2 |
| `Intowork.ActiveWork.Core/Repositories/IActiveWorkRepo.cs` | 6 | 4 |
| `Intowork.ActiveWork.Core/CQRS/Handlers/AssignStaffHandler.cs` | 7 | 2 |
| `Intowork.ActiveWork.Core/CQRS/Handlers/MoveActiveWorkAssignmentHandler.cs` | 7 | 2 |
| `Intowork.ActiveWork.Core/Services/StaffAssignmentService.cs` | 5 | 4 |
| `Intowork.ActiveWork.Core/CQRS/Commands/MoveVehicleCommand.cs` | 5 | 3 |
| `Intowork.ActiveWork.API/CQRS/Handlers/GetAllForDateRangeHandler.cs` | 5 | 2 |
| `Intowork.ActiveWork.API/CQRS/Handlers/GetAllIncompleteActiveWorkHandler.cs` | 5 | 2 |
| `Intowork.ActiveWork.API/CQRS/Handlers/GetSpecificStaffAssignmentsForPeriodHandler.cs` | 5 | 2 |
| `Intowork.ActiveWork.API/CQRS/Handlers/GetStaffAssignmentsForPeriodHandler.cs` | 5 | 2 |
| `Intowork.ActiveWork.Core/Models/Data/Team.cs` | 7 | 0 |
| `Intowork.ActiveWork.Core/Repositories/IStaffAssignmentsRepo.cs` | 4 | 3 |
| `Intowork.ActiveWork.API/CQRS/Handlers/GetAllActiveWorkRecordsPaginatedHandler.cs` | 5 | 1 |
| `Intowork.ActiveWork.Core/CQRS/Commands/AddVehicleToAssignmentCommand.cs` | 4 | 2 |
| `Intowork.ActiveWork.Core/CQRS/Commands/RemoveVehicleFromAssignmentCommand.cs` | 4 | 2 |
| `Intowork.ActiveWork.Core/CQRS/Handlers/MoveActiveWorkHandler.cs` | 5 | 1 |
| `Intowork.ActiveWork.Background/Events/IntegrationEventHandlers/TeamCreatedHandler.cs` | 3 | 0 |
| `Intowork.ActiveWork.Background/Events/IntegrationEventHandlers/TeamUpdatedHandler.cs` | 3 | 0 |
| `Intowork.ActiveWork.Background/Events/IntegrationEvents/TeamCreated.cs` | 3 | 0 |
| `Intowork.ActiveWork.Background/Events/IntegrationEvents/TeamUpdated.cs` | 3 | 0 |
| `Intowork.ActiveWork.Core/Services/IStaffAssignmentService.cs` | 2 | 1 |
| `Intowork.ActiveWork.API/Controllers/StaffAssignmentController.cs` | 0 | 2 |
| `Intowork.ActiveWork.API/Program.cs` | 2 | 0 |
| `Intowork.ActiveWork.Background/Program.cs` | 2 | 0 |
| `Intowork.ActiveWork.Core/CQRS/Handlers/UpdateCommentaryHandler.cs` | 1 | 1 |
| `Intowork.ActiveWork.API/Controllers/ActiveWorkController.cs` | 0 | 1 |

</details>

<details><summary>Test files</summary>

- `Intowork.ActiveWork.Background.Tests/Services/TomorrowReminderTests.cs` (+210)
- `Intowork.ActiveWork.Core.Tests/Utilities/ActiveWorkDateUtilitiesTests.cs` (+141)
- `Intowork.ActiveWork.Core.Tests/Repositories/ActiveWorkRepoDayFilterTests.cs` (+125)
- `Intowork.ActiveWork.Background.Tests/Services/ReminderEmailTests.cs` (+117)
- `Intowork.ActiveWork.API.Tests/CQRS/DayWindowHandlerTests.cs` (+111)
- `Intowork.ActiveWork.Background.Tests/Events/StaffMemberEmailChangedTests.cs` (+109)
- `Intowork.ActiveWork.Background.Tests/Events/IntegrationEventHandlers/TeamTimeSettingsHandlerTests.cs` (+106)
- `Intowork.ActiveWork.Core.Tests/Repositories/ActiveWorkRepoFilterTests.cs` (+106)
- `Intowork.ActiveWork.API.Tests/Controllers/DateRangeControllerTests.cs` (+105)
- `Intowork.ActiveWork.Core.Tests/Repositories/StaffAssignmentsRepoFilterTests.cs` (+105)
- `Intowork.ActiveWork.API.Tests/CQRS/LinkedAndIncompleteDayWindowTests.cs` (+100)
- `Intowork.ActiveWork.Background.Tests/Services/ReportDateTextTests.cs` (+91)
- `Intowork.ActiveWork.Core.Tests/Services/ActiveWorkTeamCopyReaderTests.cs` (+85)
- `Intowork.ActiveWork.Core.Tests/Services/StaffAssignmentServiceTests.cs` (+68)
- `Intowork.ActiveWork.Core.Tests/Repositories/RepoFilterRender.cs` (+26)
- `Intowork.ActiveWork.Background.Tests/TestTeamTime.cs` (+20)
- `Intowork.ActiveWork.Core.Tests/TestTeamTime.cs` (+20)
- `Intowork.ActiveWork.Background.Tests/FixedTimeProvider.cs` (+11)
- `Intowork.ActiveWork.Core.Tests/FixedTimeProvider.cs` (+11)
- `Intowork.ActiveWork.Background.Tests/Models/ActiveWorkRecordContactsTests.cs` (+7)
- `Intowork.ActiveWork.Background.Tests/Models/ActiveWorkRecordDeltaTests.cs` (+5)
- `Intowork.ActiveWork.Core.Tests/Models/Data/ActiveWorkRecordTests.cs` (+4)
- `Intowork.ActiveWork.Background.Tests/Events/DomainEventHandlers/ActiveWorkModelRebuildHandler2Tests.cs` (+2)

</details>

### CustomerService (PR 11013)

- `FilterAndSortExtension` date filters use team-day windows; `BatonCustomerRepo` takes a clock.
- Get/Create customer handlers resolve the customer's team zone.

Files: 8 source, 16 kit, 6 test, 5 config and scripts. Tests: 229 pass; 4/4 zones.

<details><summary>Source files</summary>

| File | + | - |
|---|---:|---:|
| `Intowork.Customers.Customer.Core/Extensions/FilterAndSortExtension.cs` | 59 | 69 |
| `Intowork.Customers.API/Handlers/QueryHandlers/GetAllCustomersHandler.cs` | 8 | 2 |
| `Intowork.Customers.API/Handlers/QueryHandlers/GetCustomerByIdHandler.cs` | 7 | 2 |
| `Intowork.Customers.API/Handlers/CommandHandlers/CreateCustomerHandler.cs` | 7 | 1 |
| `Intowork.Customers.Customer.Core/Data/Repositories/BatonCustomerRepo.cs` | 6 | 2 |
| `Intowork.Customers.API/Config/AutoMapperConfig.cs` | 2 | 1 |
| `Intowork.Customers.API/Program.cs` | 2 | 0 |
| `Intowork.Customers.API/Models/Api/CustomerResponse.cs` | 1 | 0 |

</details>

<details><summary>Test files</summary>

- `Intowork.Customers.Customer.Core.Tests/Extensions/FilterAndSortExtensionDateTests.cs` (+126)
- `Intowork.Customers.API.Tests/Handlers/QueryHandlers/CustomerTeamTimeZoneTests.cs` (+103)
- `Intowork.Customers.Customer.Core.Tests/Extensions/FilterAndSortExtensionTests.cs` (+12)
- `Intowork.Customers.ArchitectureTests/ModuleSeam.cs` (+3)
- `Intowork.Customers.ArchitectureTests/BatonCustomerModuleIsolationTests.cs` (+2)
- `Intowork.Customers.Customer.Core.Tests/Data/Repositories/BatonCustomerRepoTests.cs` (+2)

</details>

### ForecastingService (PR 11014)

- `StaffAllocationRepo` takes a `UtcWindow`; `CalendarRangeExtensions` maps picked days.
- New `Intowork.Forecasting.Tests` project (11 tests): check Dockerfile and pipeline before merging.

Files: 7 source, 15 kit, 3 test, 7 config and scripts. Tests: 11 pass; 4/4 zones.

<details><summary>Source files</summary>

| File | + | - |
|---|---:|---:|
| `Intowork.Forecasting.API/CQRS/CalendarRangeExtensions.cs` | 11 | 0 |
| `Intowork.Forecasting.Core/Data/Repositories/StaffAllocationRepo.cs` | 6 | 2 |
| `Intowork.Forecasting.API/CQRS/Handlers/GetStaffAllocationForPeriodHandler.cs` | 5 | 2 |
| `Intowork.Forecasting.API/CQRS/Handlers/GetStaffAvailabilityForPeriodHandler.cs` | 5 | 2 |
| `Intowork.Forecasting.Core/Data/Repositories/IStaffAllocationRepo.cs` | 2 | 1 |
| `Intowork.Forecasting.API/Program.cs` | 2 | 0 |
| `Intowork.Forecasting.Background/Program.cs` | 2 | 0 |

</details>

<details><summary>Test files</summary>

- `Intowork.Forecasting.Tests/Repositories/StaffAllocationPeriodTests.cs` (+91)
- `Intowork.Forecasting.Tests/Intowork.Forecasting.Tests.csproj` (+29)
- `Intowork.Forecasting.Tests/Repositories/FilterRender.cs` (+26)

</details>

### FrameworkCache (PR 11015)

- Report.API: `ReportingCalendar` rebuilt on the kit; plant, labour daily, transport and monthly repos use team-day windows.
- Printed datetimes show team time; `ProjectServiceTeamCopyReader` reads the zone; `FilterAndSortExtension` simplified.
- Dead `WagesPipeline` Dublin stages removed.

Files: 24 source, 15 kit, 14 test, 3 config and scripts. Tests: 275 pass; 4/4 zones.

<details><summary>Source files</summary>

| File | + | - |
|---|---:|---:|
| `Intowork.Report.API/Helpers/WageCalculationStageBuilder.cs` | 0 | 160 |
| `Intowork.Report.API/BL/LabourDailyService.cs` | 69 | 66 |
| `Intowork.Report.API/Data/Repositories/CPPlantRepository.cs` | 73 | 52 |
| `Intowork.Report.API/Extensions/FilterAndSortExtension.cs` | 27 | 74 |
| `Intowork.Report.API/Helpers/WagesPipeline.cs` | 0 | 65 |
| `Intowork.Report.API/Helpers/ReportingCalendar.cs` | 28 | 35 |
| `Intowork.Report.API/BL/CPPlantReportService.cs` | 35 | 27 |
| `Intowork.Report.API/BL/LabourSummaryService.cs` | 25 | 22 |
| `Intowork.Report.API/Data/Repositories/CPLabourDailyRepository.cs` | 29 | 18 |
| `Intowork.Report.API/Data/API/CollectionRequestResponse.cs` | 2 | 30 |
| `Intowork.Report.API/Data/API/OrderRequestResponse.cs` | 2 | 30 |
| `Intowork.Report.API/Helpers/PickedDay.cs` | 27 | 0 |
| `Intowork.Report.API/Data/Repositories/CPTransportRepository.cs` | 16 | 9 |
| `Intowork.Report.API/Data/Repositories/ProjectServiceTeamCopyReader.cs` | 24 | 0 |
| `Intowork.Report.API/Helpers/TransportTimeText.cs` | 22 | 0 |
| `Intowork.Report.API/Data/Repositories/CPMonthlyReportRepository.cs` | 12 | 8 |
| `Intowork.Report.API/BL/CPStockReportService.cs` | 10 | 9 |
| `Intowork.Report.API/BL/CPTransportService.cs` | 15 | 3 |
| `Intowork.Report.API/Controllers/CPReportsController.cs` | 11 | 7 |
| `Intowork.Report.API/BL/CPPrelimReportService.cs` | 9 | 7 |
| `Intowork.Report.API/Extensions/ReportServiceCollectionExtensions.cs` | 11 | 0 |
| `Intowork.Report.API/BL/CPProjectCvrService.cs` | 6 | 3 |
| `Intowork.Report.API/Data/Models/ProjectService/Team.cs` | 3 | 0 |
| `Intowork.Report.API/Program.cs` | 1 | 0 |

</details>

<details><summary>Test files</summary>

- `Intowork.Report.API.Tests/PlantHireDayTests.cs` (+168)
- `Intowork.Report.API.Tests/TeamTodayDefaultTests.cs` (+162)
- `Intowork.Report.API.Tests/TeamDayFilterTests.cs` (+106)
- `Intowork.Report.API.Tests/CurrentLabourSummaryServiceTests.cs` (+74)
- `Intowork.Report.API.Tests/CurrentReportingCalendarTests.cs` (+73)
- `Intowork.Report.API.Tests/CurrentTimePipelineTests.cs` (+72)
- `Intowork.Report.API.Tests/PlantHandoverDaysTests.cs` (+64)
- `Intowork.Report.API.Tests/CurrentTransportTimeDifferenceTests.cs` (+62)
- `Intowork.Report.API.Tests/ReportingCalendarRegistrationTests.cs` (+40)
- `Intowork.Report.API.Tests/TestZones.cs` (+15)
- `Intowork.Report.API.Tests/ReportingCalendarTests.cs` (+13)
- `Intowork.Report.API.Tests/FixedTimeProvider.cs` (+11)
- `Intowork.Report.API.Tests/PlantHireItemSummaryTests.cs` (+7)
- `Intowork.Report.API.Tests/Intowork.Report.API.Tests.csproj` (+1)

</details>

### GafferService (PR 11016)

- `CallerContext` carries the caller's team clock; the AI tools answer for the team's today and week.
- MyHours prints team time; inspection days-since and site sign-in use the team day. Not built here (NuGet 401); verified earlier in a scratch copy.

Files: 26 source, 16 kit, 4 test, 4 config and scripts. Tests: not run here (restore 401).

<details><summary>Source files</summary>

| File | + | - |
|---|---:|---:|
| `Intowork.Gaffer.Core/Identity/CallerContext.cs` | 12 | 2 |
| `Intowork.Gaffer.Core/Store/ConversationStore.cs` | 9 | 4 |
| `Intowork.Gaffer.Core/Tools/ActiveWorkJoins.cs` | 5 | 4 |
| `Intowork.Gaffer.Core/Tools/Catalog/FleetComplianceTool.cs` | 5 | 3 |
| `Intowork.Gaffer.Core/Tools/Catalog/MyHoursTool.cs` | 4 | 4 |
| `Intowork.Gaffer.Core/Tools/Catalog/MyWeekSitesTool.cs` | 3 | 4 |
| `Intowork.Gaffer.Core/AskHandler.cs` | 4 | 2 |
| `Intowork.Gaffer.Core/Tools/Catalog/DayScheduleTool.cs` | 3 | 3 |
| `Intowork.Gaffer.Core/Tools/Catalog/MyBriefingTool.cs` | 3 | 3 |
| `Intowork.Gaffer.Core/Tools/Catalog/MyCrewTool.cs` | 3 | 3 |
| `Intowork.Gaffer.Core/Tools/Catalog/MyJobBriefTool.cs` | 3 | 3 |
| `Intowork.Gaffer.Core/Tools/Catalog/MyVehicleTool.cs` | 3 | 3 |
| `Intowork.Gaffer.API/Controllers/GafferController.cs` | 3 | 2 |
| `Intowork.Gaffer.Core/Llm/AnthropicLlmClient.cs` | 4 | 1 |
| `Intowork.Gaffer.API/Program.cs` | 3 | 1 |
| `Intowork.Gaffer.Core/Tools/Catalog/InspectionStatusTool.cs` | 2 | 2 |
| `Intowork.Gaffer.Core/Tools/Catalog/MyPastWorkTool.cs` | 2 | 2 |
| `Intowork.Gaffer.Core/Tools/Catalog/SiteSigninStatusTool.cs` | 2 | 2 |
| `Intowork.Gaffer.Core/Tools/Catalog/SiteLogisticsTool.cs` | 1 | 2 |
| `Intowork.Gaffer.Core/Tools/Catalog/TeamAbsencesTool.cs` | 1 | 2 |
| `Intowork.Gaffer.Core/Tools/ToolDates.cs` | 3 | 0 |
| `Intowork.Gaffer.Core/Tools/Catalog/CrewAllocationTool.cs` | 1 | 1 |
| `Intowork.Gaffer.Core/Tools/Catalog/MyAbsencesTool.cs` | 1 | 1 |
| `Intowork.Gaffer.Core/Tools/Catalog/OpsBriefingTool.cs` | 1 | 1 |
| `Intowork.Gaffer.Core/Tools/Catalog/StaffWhereaboutsTool.cs` | 1 | 1 |
| `Intowork.Gaffer.Core/Tools/Catalog/VehicleDowntimeTool.cs` | 1 | 1 |

</details>

<details><summary>Test files</summary>

- `Intowork.Gaffer.Tests/Tools/UtcDaySitesTests.cs` (+192)
- `Intowork.Gaffer.Tests/Tools/TeamClockTodayAndWeekTests.cs` (+178)
- `Intowork.Gaffer.Tests/Tools/CurrentTodayAndWeekTests.cs` (+112)
- `Intowork.Gaffer.Tests/Store/ConversationDayCountTests.cs` (+69)

</details>

### HandoverService (PR 11017)

- `HandoverReportTemplateCompiler`, reminders (`HandoverReminderPlanner`) and cancel window use the team zone and formats.
- `HandoversRepo` per-day totals group by team day; `CustomerHandoverReader` / `CustomerTeamTime` for customer reads.

Files: 29 source, 16 kit, 10 test, 6 config and scripts. Tests: 491 pass; 4/4 zones.

<details><summary>Source files</summary>

| File | + | - |
|---|---:|---:|
| `Intowork.HandoverService.Background/Services/ReportGeneratorService.cs` | 8 | 370 |
| `Intowork.HandoverService.Background/Services/HandoverReportTemplateCompiler.cs` | 363 | 0 |
| `Intowork.HandoverService.Core/Data/Models/HandoverNotification.cs` | 18 | 59 |
| `Intowork.HandoverService.Core/Services/HandoverReminderPlanner.cs` | 67 | 0 |
| `Intowork.HandoverService.Customer.Core/Services/CustomerHandoverReader.cs` | 33 | 17 |
| `Intowork.HandoverService.Customer.Core/Services/Paging/PagedQuery.cs` | 25 | 6 |
| `Intowork.HandoverService.Core/Services/TeamClockFactory.cs` | 26 | 0 |
| `Intowork.HandoverService.Core/Extensions/HandoverTeamTimeExtensions.cs` | 21 | 0 |
| `Intowork.HandoverService.Background/Services/HandoverReportAssignments.cs` | 18 | 0 |
| `Intowork.HandoverService.Customer.Core/Services/ICustomerTeamTime.cs` | 18 | 0 |
| `Intowork.HandoverService.Customer.Core/Models/Api/CustomerHandoverResponse.cs` | 14 | 3 |
| `Intowork.HandoverService.Core/Services/TeamCopyReader.cs` | 16 | 0 |
| `Intowork.HandoverService.API/Extensions/CustomerTeamTime.cs` | 15 | 0 |
| `Intowork.HandoverService.Background/Extensions/CustomerTeamTime.cs` | 15 | 0 |
| `Intowork.HandoverService.Core/CQRS/Handlers/Commands/CancelHandoverHandler.cs` | 12 | 2 |
| `Intowork.HandoverService.Core/Data/Repositories/HandoversRepo.cs` | 9 | 5 |
| `Intowork.HandoverService.Core/Data/Repositories/HandoverNotificationsRepo.cs` | 4 | 5 |
| `Intowork.HandoverService.Core/CQRS/Handlers/Commands/UpdateHandoverHandler.cs` | 6 | 2 |
| `Intowork.HandoverService.API/CQRS/Handlers/GetHandoversForProjectForPeriodHandler.cs` | 5 | 2 |
| `Intowork.HandoverService.Background/Extensions/HandoverBackgroundServiceCollectionExtensions.cs` | 4 | 0 |
| `Intowork.HandoverService.Background/Events/IntegrationEventHandlers/TeamCreatedHandler.cs` | 3 | 0 |
| `Intowork.HandoverService.Background/Events/IntegrationEventHandlers/TeamUpdatedHandler.cs` | 3 | 0 |
| `Intowork.HandoverService.Background/Events/IntegrationEvents/TeamCreated.cs` | 3 | 0 |
| `Intowork.HandoverService.Background/Events/IntegrationEvents/TeamUpdated.cs` | 3 | 0 |
| `Intowork.HandoverService.Core/Data/Models/Team.cs` | 3 | 0 |
| `Intowork.HandoverService.Core/Data/Repositories/IHandoversRepo.cs` | 2 | 1 |
| `Intowork.HandoverService.API/Extensions/HandoverServiceCollectionExtensions.cs` | 2 | 0 |
| `Intowork.HandoverService.API/Program.cs` | 2 | 0 |
| `Intowork.HandoverService.Core/Data/Repositories/IHandoverNotificationsRepo.cs` | 1 | 1 |

</details>

<details><summary>Test files</summary>

- `Intowork.HandoverService.Core.Tests/ServiceWorkers/ReminderServiceTests.cs` (+156)
- `Intowork.HandoverService.Customer.Core.Tests/Handlers/CustomerHandoverTeamTimeTests.cs` (+132)
- `Intowork.HandoverService.Core.Tests/Characterization/CancelHandoverApprovalWindowCharacterizationTests.cs` (+128)
- `Intowork.HandoverService.Background.Tests/Characterization/HandoverReportDateTextCharacterizationTests.cs` (+111)
- `Intowork.HandoverService.Core.Tests/Events/IntegrationEventHandlers/TeamTimeSettingsHandlerTests.cs` (+86)
- `Intowork.HandoverService.Core.Tests/Characterization/HandoverReminderScheduleCharacterizationTests.cs` (+69)
- `Intowork.HandoverService.Core.Tests/Data/Repositories/HandoversRepoDayTotalsTests.cs` (+63)
- `Intowork.HandoverService.Core.Tests/Characterization/HandoverNotificationRoundTripCharacterizationTests.cs` (+37)
- `Intowork.HandoverService.Core.Tests/Builders/FixedTeamClocks.cs` (+17)
- `Intowork.HandoverService.Core.Tests/CQRS/Handlers/Commands/BatonHandoverHookTests.cs` (+7)

</details>

### InspectionsService (PR 11018)

- PDF dates in team zone and formats; `InspectionsReportRepo` filters through the new `FilterDayWindow`.
- Team copy (`Team`, events, handlers) and `TeamCopyReader` registered in the background host.
- `InspectionsRepo` and `HsInspectionsRepo` still use the CommonLibs filter (UTC day); see Open items.

Files: 14 source, 16 kit, 5 test, 6 config and scripts. Tests: 50 pass; 4/4 zones.

<details><summary>Source files</summary>

| File | + | - |
|---|---:|---:|
| `Intowork.Inspections.Background/Services/ReportGeneratorService.cs` | 50 | 46 |
| `Intowork.Inspections.Core/Data/Repositories/InspectionsReportRepo.cs` | 12 | 11 |
| `Intowork.Inspections.Core/Data/Repositories/FilterDayWindow.cs` | 21 | 0 |
| `Intowork.Inspections.Core/Data/Repositories/TeamCopyReader.cs` | 13 | 0 |
| `Intowork.Inspections.Background/Extensions/InspectionsBackgroundServiceCollectionExtensions.cs` | 11 | 0 |
| `Intowork.Inspections.Core/CQRS/Handlers/Queries/GetInspectionsTotalsTransactionsHandler.cs` | 5 | 2 |
| `Intowork.Inspections.Core/CQRS/Handlers/Queries/GetInspectionsTransactionsHandler.cs` | 5 | 2 |
| `Intowork.Inspections.Core/Data/Repositories/Interfaces/IInspectionsReportRepo.cs` | 3 | 2 |
| `Intowork.Inspections.Background/Events/Handlers/TeamCreatedHandler.cs` | 3 | 0 |
| `Intowork.Inspections.Background/Events/Handlers/TeamUpdatedHandler.cs` | 3 | 0 |
| `Intowork.Inspections.Background/Events/Integration/TeamCreated.cs` | 3 | 0 |
| `Intowork.Inspections.Background/Events/Integration/TeamUpdated.cs` | 3 | 0 |
| `Intowork.Inspections.Core/Data/Models/Team.cs` | 3 | 0 |
| `Intowork.Inspections.API/Extensions/InspectionsServiceCollectionExtensions.cs` | 2 | 0 |

</details>

<details><summary>Test files</summary>

- `Intowork.Inspections.Background.Tests/Events/TeamEventHandlersTests.cs` (+102)
- `Intowork.Inspections.Background.Tests/Services/ReportGeneratorTeamZoneTests.cs` (+83)
- `Intowork.Inspections.Background.Tests/Services/ReportGeneratorDateTextTests.cs` (+79)
- `Intowork.Inspections.Background.Tests/Data/FilterDayWindowTests.cs` (+66)
- `Intowork.Inspections.Background.Tests/Intowork.Inspections.Background.Tests.csproj` (+28)

</details>

### MaterialsService (PR 11019)

- Short-notice rule, default request date (08:00 team time), vehicle and stock day filters use team days.
- `NotificationService` prints the email date in the team zone; abandonment and follow-up handlers use the team clock.
- Collection and order repos call the one-argument CommonLibs `ApplyFilters` for now.

Files: 43 source, 16 kit, 14 test, 5 config and scripts. Tests: 263 pass; 4/4 zones.

<details><summary>Source files</summary>

| File | + | - |
|---|---:|---:|
| `Intowork.MaterialsService.Core/Extensions/FilterAndSortExtension.cs` | 59 | 69 |
| `Intowork.MaterialsService.Core/Data/Repositories/MaterialRequestRepo.cs` | 11 | 35 |
| `Intowork.MaterialsService.Core/Extensions/ShortNoticeRule.cs` | 33 | 0 |
| `Intowork.MaterialsService.Core/Services/NotificationService.cs` | 19 | 7 |
| `Intowork.MaterialsService.Core/Data/Repositories/VehiclesRepo.cs` | 10 | 11 |
| `Intowork.MaterialsService.Core/Extensions/MaterialsTeamTimeExtensions.cs` | 17 | 0 |
| `Intowork.MaterialsService.Core/Data/Repositories/VehicleUnAvailabilityRepo.cs` | 8 | 7 |
| `Intowork.MaterialsService.Core/CQRS/Queries/Handlers/GetPaginatedVehiclesForTeamHandler.cs` | 9 | 4 |
| `Intowork.MaterialsService.Core/Data/Repositories/TeamCopyReader.cs` | 13 | 0 |
| `Intowork.MaterialsService.Core/Extensions/DefaultRequestDate.cs` | 9 | 0 |
| `Intowork.MaterialsService.Core/CQRS/Commands/Handlers/CollectionHandlers/CollectionAbandonmentHandler.cs` | 6 | 2 |
| `Intowork.MaterialsService.Core/CQRS/Commands/Handlers/CollectionHandlers/CreateFollowUpMCRHandler.cs` | 6 | 2 |
| `Intowork.MaterialsService.Core/CQRS/Commands/Handlers/OrderHandlers/DeliveryAbandonmentHandler.cs` | 6 | 2 |
| `Intowork.MaterialsService.Core/CQRS/Queries/Handlers/GetMaterialRequestsHandler.cs` | 5 | 2 |
| `Intowork.MaterialsService.Core/CQRS/Queries/Handlers/GetMaterialRequestsSummaryHandler.cs` | 5 | 2 |
| `Intowork.MaterialsService.Core/CQRS/Queries/Handlers/GetNoticeSummaryHandler.cs` | 5 | 2 |
| `Intowork.MaterialsService.Core/CQRS/Queries/Handlers/GetVehiclesOverviewHandler.cs` | 5 | 2 |
| `Intowork.MaterialsService.Core/CQRS/Queries/Handlers/StockHandlers/GetPaginatedStockReturnsHandler.cs` | 5 | 2 |
| `Intowork.MaterialsService.Core/Data/Repositories/Interfaces/IMaterialRequestRepo.cs` | 4 | 3 |
| `Intowork.MaterialsService.API/Controllers/CollectionRequestsController.cs` | 2 | 4 |
| `Intowork.MaterialsService.API/Controllers/OrderRequestsController.cs` | 2 | 4 |
| `Intowork.MaterialsService.API/Controllers/StockController.cs` | 2 | 4 |
| `Intowork.MaterialsService.Core/CQRS/Queries/Handlers/CollectionHandlers/GetMaterialCollectionRequestsHandler.cs` | 5 | 1 |
| `Intowork.MaterialsService.Core/CQRS/Queries/Handlers/GetVehiclesForTeamByCategoryHandler.cs` | 0 | 6 |
| `Intowork.MaterialsService.Core/CQRS/Queries/Handlers/GetVehiclesForTeamHandler.cs` | 0 | 6 |
| `Intowork.MaterialsService.Core/CQRS/Queries/Handlers/OrderHandlers/GetMaterialOrderRequestsHandler.cs` | 5 | 1 |
| `Intowork.MaterialsService.Core/Data/Models/OrderRequest.cs` | 2 | 4 |
| `Intowork.MaterialsService.Core/Data/Models/CollectionRequest.cs` | 2 | 3 |
| `Intowork.MaterialsService.Core/Data/Repositories/Interfaces/IVehicleUnAvailabilityRepo.cs` | 3 | 2 |
| `Intowork.MaterialsService.Core/Data/Repositories/Interfaces/IVehiclesRepo.cs` | 3 | 2 |
| `Intowork.MaterialsService.Core/Data/Repositories/StockRepo.cs` | 3 | 2 |
| `Intowork.MaterialsService.Core/Data/Models/Team.cs` | 3 | 0 |
| `Intowork.MaterialsService.Core/Data/Repositories/CollectionRequestsRepo.cs` | 2 | 1 |
| `Intowork.MaterialsService.Core/Data/Repositories/Interfaces/ICollectionRequestsRepo.cs` | 2 | 1 |
| `Intowork.MaterialsService.Core/Data/Repositories/Interfaces/IOrderRequestsRepo.cs` | 2 | 1 |
| `Intowork.MaterialsService.Core/Data/Repositories/Interfaces/IStockRepo.cs` | 2 | 1 |
| `Intowork.MaterialsService.Core/Data/Repositories/OrderRequestsRepo.cs` | 2 | 1 |
| `Intowork.MaterialsService.Core/Events/Integration/TeamEvents/TeamCreated.cs` | 3 | 0 |
| `Intowork.MaterialsService.Core/Events/Integration/TeamEvents/TeamUpdated.cs` | 3 | 0 |
| `Intowork.MaterialsService.Core/Events/IntegrationHandlers/TeamHandlers/TeamCreatedHandler.cs` | 3 | 0 |
| `Intowork.MaterialsService.Core/Events/IntegrationHandlers/TeamHandlers/TeamUpdatedHandler.cs` | 3 | 0 |
| `Intowork.MaterialsService.API/Program.cs` | 2 | 0 |
| `Intowork.MaterialsService.Core/Data/API/PaginatedVehicleResponse.cs` | 1 | 1 |

</details>

<details><summary>Test files</summary>

- `Intowork.MaterialsService.Core.Tests/Data/Repositories/VehiclesRepoDayFilterTests.cs` (+143)
- `Intowork.MaterialsService.Core.Tests/Extensions/FilterAndSortExtensionDateTests.cs` (+127)
- `Intowork.MaterialsService.API.Tests/Controllers/RangeControllersTests.cs` (+115)
- `Intowork.MaterialsService.Core.Tests/CQRS/Queries/Handlers/GetPaginatedVehiclesForTeamHandlerDayTests.cs` (+97)
- `Intowork.MaterialsService.Core.Tests/Data/Repositories/VehicleUnavailabilityRepoDayFilterTests.cs` (+96)
- `Intowork.MaterialsService.Core.Tests/Events/IntegrationHandlers/TeamHandlers/TeamTimeSettingsHandlerTests.cs` (+68)
- `Intowork.MaterialsService.Core.Tests/Extensions/ShortNoticeRuleTests.cs` (+68)
- `Intowork.MaterialsService.Core.Tests/Extensions/DefaultRequestDateTests.cs` (+40)
- `Intowork.MaterialsService.Core.Tests/CQRS/Queries/Handlers/GetVehiclesForTeamHandlerTests.cs` (+38)
- `Intowork.MaterialsService.Core.Tests/Support/VehicleBuilder.cs` (+35)
- `Intowork.MaterialsService.Core.Tests/Support/TeamClockSupport.cs` (+18)
- `Intowork.MaterialsService.Core.Tests/CQRS/Queries/Handlers/GetPaginatedVehiclesForTeamHandlerTests.cs` (+14)
- `Intowork.MaterialsService.Core.Tests/CQRS/Queries/Handlers/GetVehiclesOverviewHandlerTests.cs` (+6)
- `Intowork.MaterialsService.Core.Tests/Data/Repositories/VehicleUnavailabilityRepoTests.cs` (+3)

</details>

### NotificationService (PR 11020)

- Small team copy fed by `TeamCreated` / `TeamUpdated`; `ConnectionTeamTime` keeps the zone per SignalR connection; `NotificationHub` reads it.

Files: 14 source, 16 kit, 4 test, 4 config and scripts. Tests: 20 pass; 4/4 zones.

<details><summary>Source files</summary>

| File | + | - |
|---|---:|---:|
| `Intowork.NotificationService.API/Hubs/ConnectionTeamTime.cs` | 33 | 0 |
| `Intowork.NotificationService.API/Events/Handlers/TeamCreatedHandler.cs` | 30 | 0 |
| `Intowork.NotificationService.API/Events/Handlers/TeamUpdatedHandler.cs` | 30 | 0 |
| `Intowork.NotificationService.API/Repositories/TeamsRepo.cs` | 18 | 0 |
| `Intowork.NotificationService.API/Models/Team.cs` | 14 | 0 |
| `Intowork.NotificationService.API/Extensions/NotificationServiceCollectionExtensions.cs` | 13 | 0 |
| `Intowork.NotificationService.API/Repositories/TeamCopyReader.cs` | 12 | 0 |
| `Intowork.NotificationService.API/Events/TeamCreated.cs` | 11 | 0 |
| `Intowork.NotificationService.API/Events/TeamUpdated.cs` | 11 | 0 |
| `Intowork.NotificationService.API/Repositories/ITeamsRepo.cs` | 9 | 0 |
| `Intowork.NotificationService.API/Hubs/NotificationHub.cs` | 4 | 1 |
| `Intowork.NotificationService.API/Repositories/DbContext.cs` | 4 | 0 |
| `Intowork.NotificationService.API/Extensions/NotificationApplicationBuilderExtensions.cs` | 2 | 0 |
| `Intowork.NotificationService.API/Repositories/IDbContext.cs` | 1 | 0 |

</details>

<details><summary>Test files</summary>

- `Intowork.NotificationService.API.Tests/Hubs/NotificationHubTeamZoneTests.cs` (+133)
- `Intowork.NotificationService.API.Tests/Events/TeamEventHandlersTests.cs` (+93)
- `Intowork.NotificationService.API.Tests/Events/InAppNotificationPayloadTests.cs` (+47)
- `Intowork.NotificationService.API.Tests/Intowork.NotificationService.API.Tests.csproj` (+27)

</details>

### PermissionsService (PR 11021)

- Kit copy, scripts and registration tests only. No day logic in this service.

Files: 1 source, 16 kit, 0 test, 4 config and scripts. Tests: 169 pass; 4/4 zones.

<details><summary>Source files</summary>

| File | + | - |
|---|---:|---:|
| `Intowork.Permissions.API/Program.cs` | 2 | 0 |

</details>

### ResourcesService (PR 11022)

- `HRJobScheduler` registers team jobs in the team's zone; `StaffMemberRepo` day queries and month count use team-day windows.
- `ResourcesController` range conversion through the clock; bank holidays measured from the team day.
- `Resources.Customer.Core` filter extension not done (no kit copy there; decision needed).

Files: 24 source, 15 kit, 17 test, 6 config and scripts. Tests: 480 pass; 4/4 zones.

<details><summary>Source files</summary>

| File | + | - |
|---|---:|---:|
| `Intowork.Resources.Core/Extensions/FilterAndSortExtension.cs` | 60 | 70 |
| `Intowork.Resources.Core/ServiceWorkers/HRJobScheduler.cs` | 17 | 17 |
| `Intowork.Resources.Core/Data/Repositories/StaffMemberRepo.cs` | 12 | 15 |
| `Intowork.Resources.Core/Services/HrService.cs` | 19 | 5 |
| `Intowork.Resources.API/Controllers/ResourcesController.cs` | 7 | 9 |
| `Intowork.Resources.API/CQRS/Handlers/GetStaffOverviewHandler.cs` | 13 | 2 |
| `Intowork.Resources.Core/Data/Repositories/TeamCopyReader.cs` | 15 | 0 |
| `Intowork.Resources.Core/Services/TeamClockFactory.cs` | 13 | 0 |
| `Intowork.Resources.Core/Data/Repositories/IStaffMemberRepo.cs` | 6 | 5 |
| `Intowork.Resources.Core/Services/ITeamClockFactory.cs` | 11 | 0 |
| `Intowork.Resources.API/Extensions/ResourcesServiceCollectionExtensions.cs` | 10 | 0 |
| `Intowork.Resources.Background/Extensions/ResourcesBackgroundServiceCollectionExtensions.cs` | 10 | 0 |
| `Intowork.Resources.API/CQRS/Handlers/GetFutureBankHolidaysHandler.cs` | 5 | 2 |
| `Intowork.Resources.API/CQRS/Handlers/GetStaffForTeamHandler.cs` | 5 | 2 |
| `Intowork.Resources.Core/CQRS/Handlers/ArchiveStaffMemberHandler.cs` | 5 | 2 |
| `Intowork.Resources.Core/Data/Repositories/HrEmployeesRepo.cs` | 3 | 2 |
| `Intowork.Resources.Background/Events/Domain/TeamCreatedHandler.cs` | 3 | 0 |
| `Intowork.Resources.Background/Events/Domain/TeamUpdatedHandler.cs` | 3 | 0 |
| `Intowork.Resources.Core/Data/Models/Team.cs` | 3 | 0 |
| `Intowork.Resources.Core/Data/Repositories/IHrEmployeesRepo.cs` | 2 | 1 |
| `Intowork.Resources.Core/Events/Integration/TeamCreated.cs` | 3 | 0 |
| `Intowork.Resources.Core/Events/Integration/TeamUpdated.cs` | 3 | 0 |
| `Intowork.Resources.API/Program.cs` | 1 | 0 |
| `Intowork.Resources.Background/Program.cs` | 1 | 0 |

</details>

<details><summary>Test files</summary>

- `Intowork.Resources.Background.Test/Events/TeamTimeSettingsHandlerTests.cs` (+149)
- `Intowork.Resources.Core.Test/ServiceWorkers/HRJobSchedulerTests.cs` (+137)
- `Intowork.Resources.Core.Test/Extensions/FilterAndSortExtensionDateTests.cs` (+126)
- `Intowork.Resources.Core.Test/Data/Repositories/StaffMemberRepoTimeTests.cs` (+124)
- `Intowork.Resources.API.Test/Controllers/ResourcesControllerRangeCharacterizationTests.cs` (+108)
- `Intowork.Resources.Background.Test/Events/TeamTimeRegistrationTests.cs` (+78)
- `Intowork.Resources.Core.Test/Services/HrServiceTeamDayTests.cs` (+60)
- `Intowork.Resources.Core.Test/Services/TeamClockFactoryTests.cs` (+53)
- `Intowork.Resources.Core.Test/Data/Repositories/TeamCopyReaderTests.cs` (+42)
- `Intowork.Resources.API.Test/Handlers/GetStaffOverviewHandlerTests.cs` (+37)
- `Intowork.Resources.Core.Test/CQRS/Handlers/ArchiveStaffMemberHandlerTests.cs` (+27)
- `Intowork.Resources.API.Test/Support/TestClocks.cs` (+22)
- `Intowork.Resources.Core.Test/Support/TestClocks.cs` (+22)
- `Intowork.Resources.Core.Test/Data/Repositories/StaffMemberRepoTests.cs` (+6)
- `Intowork.Resources.Core.Test/Data/Repositories/HrEmployeesRepoTests.cs` (+3)
- `Intowork.Resources.API.Test/Controllers/ResourcesControllerTests.cs` (+1)
- `Intowork.Resources.Background.Test/Intowork.Resources.Background.Test.csproj` (+1)

</details>

### SafetySuiteService (PR 11023)

- Kit copy and scripts; `CreateNearMissCommandHandler` reads the incident time in the team zone.

Files: 2 source, 16 kit, 1 test, 3 config and scripts. Tests: 52 pass; 4/4 zones.

<details><summary>Source files</summary>

| File | + | - |
|---|---:|---:|
| `Intowork.SafetySuiteService.Core/Features/NearMisses/Handlers/CreateNearMissCommandHandler.cs` | 11 | 2 |
| `Intowork.SafetySuiteService.API/Program.cs` | 2 | 0 |

</details>

<details><summary>Test files</summary>

- `Intowork.SafetySuiteService.Core.Tests/Features/NearMisses/Handlers/CreateNearMissCommandHandlerTests.cs` (+44)

</details>

### Frontend (PR 11024)

- `src/app/shared/time` kit: `time-core`, `TeamTimeService`, `<app-date-time-field>`, `teamDate` / `calendarDate` pipes, `TeamZoneDateAdapter`.
- Screens converted from device-local date maths: attendance, resources, quotations, ActiveWork, calculator, SafetySuite, planners (`PlannerDays`), LDF, exports, validators, grid date columns.
- Grid date filters now go to the API as team-zone instants (`gridFilterToWire`).
- Team settings screen: zone picker on create (read-only afterwards), format choices.

Files: 412 source, 26 kit, 42 test, 8 config and scripts. Tests: tsc clean; 1,347 pass / 194 fail (unrelated providers); identical in London, Toronto, Auckland.

<details><summary>Source files</summary>

| File | + | - |
|---|---:|---:|
| `src/app/wage/wage.service.ts` | 122 | 158 |
| `src/app/wage-legacy-2/wage-legacy2.service.ts` | 112 | 163 |
| `src/app/resources/staff-calendar/staff-calendar.component.ts` | 107 | 155 |
| `src/app/helpers/planner-days.ts` | 230 | 0 |
| `src/app/attendance/attendance/attendance.component.ts` | 80 | 109 |
| `src/app/activework/team-business-days.ts` | 184 | 0 |
| `src/app/shared/team-day-field/team-day-field.component.ts` | 183 | 0 |
| `src/app/wage-legacy/wage-legacy.service.ts` | 93 | 87 |
| `src/app/attendance/attendance/user-attendance-row/user-attendance-row.component.ts` | 61 | 115 |
| `src/app/ldf/ldf/ldf.component.ts` | 80 | 95 |
| `src/app/wage/wage-team-days.ts` | 174 | 0 |
| `src/app/activework/edit-active-work-dialog/edit-active-work-dialog.component.ts` | 58 | 102 |
| `src/app/activework/create-active-work-dialog/create-active-work-dialog.component.ts` | 66 | 92 |
| `src/app/teams-settings/create-team-settings/create-team-settings.component.ts` | 93 | 65 |
| `src/app/shared/team-time-field/team-time-field.component.ts` | 140 | 0 |
| `src/app/resources/staff-detail/staff-detail.component.ts` | 82 | 55 |
| `src/app/attendance/attendance/controls-row/controls-row.component.ts` | 84 | 47 |
| `src/app/shared/team-clock/team-clock.service.ts` | 130 | 0 |
| `src/app/materials/edit-vehicle-dialog/edit-vehicle-dialog.component.html` | 54 | 75 |
| `src/app/calculator/secure-job/secure-job.component.html` | 48 | 77 |
| `src/app/activework/project-data-tab/project-data-tab.component.ts` | 35 | 86 |
| `src/app/materials/vehicle-calendar/vehicle-calendar.component.ts` | 60 | 60 |
| `src/app/resources/staff-attendance-calendar/staff-attendance-calendar.component.ts` | 65 | 50 |
| `src/app/activework/labour-summary.service.ts` | 19 | 94 |
| `src/app/mypage/my-home-new/my-home-new.component.ts` | 56 | 53 |
| `src/app/activework/external-cvr-summary.service.ts` | 22 | 85 |
| `src/app/mypage/myhome/myhome.component.ts` | 56 | 51 |
| `src/app/mypage/staff-member-myhome/staff-member-myhome.component.ts` | 56 | 51 |
| `src/app/pandl/pand-l-project/pand-l-project.component.scss` | 56 | 50 |
| `src/app/activework/edit-active-work-dialog/edit-active-work-dialog.component.html` | 45 | 58 |
| `src/app/activework/project-data-tab/external-valuation-transactions/add-edit-external-valuation/add-edit-external-valuation.component.ts` | 28 | 73 |
| `src/app/materials/vehicle-edit/vehicle-edit.component.ts` | 37 | 64 |
| `src/app/shared/export.service.ts` | 58 | 39 |
| `src/app/shared-pricing/payment-projection/payment-projection.component.ts` | 48 | 48 |
| `src/app/pricing/pricing-config/add-worker-group-dialog/add-worker-group-dialog.component.html` | 50 | 44 |
| `src/app/pandl/pand-l-project/pand-l-project.component.ts` | 59 | 31 |
| `src/app/calculator/job-information/job-information.component.html` | 39 | 50 |
| `src/app/resources/staff-wallchart/staff-wallchart.component.html` | 39 | 47 |
| `src/app/resources/staff-detail/staff-detail.component.html` | 34 | 44 |
| `src/app/materials/team-day-rules.ts` | 76 | 0 |
| `src/app/attendance/attendance.service.ts` | 50 | 23 |
| `src/app/materials/vehicle-edit/vehicle-edit.component.html` | 18 | 54 |
| `src/app/resources/workforce.ts` | 45 | 25 |
| `src/app/activework/create-active-work-dialog/create-active-work-dialog.component.html` | 28 | 41 |
| `src/app/helpers/team-day.ts` | 68 | 0 |
| `src/app/teams-settings/team-time-settings/team-time-settings.component.ts` | 68 | 0 |
| `src/app/materials/validators/vehicle.validators.ts` | 28 | 39 |
| `src/app/teams-settings/create-team-settings/create-team-settings.component.html` | 29 | 38 |
| `src/app/teams-settings/edit-team-settings/edit-team-settings.component.html` | 29 | 38 |
| `src/app/activework/project-month-ranges.ts` | 66 | 0 |
| `src/app/materials/vehicle-calendar/vehicle-calendar.component.html` | 29 | 37 |
| `src/app/weekly-resource-planner/services/weekly-resource-planner-api.service.ts` | 21 | 45 |
| `src/app/activework/activework.service.ts` | 32 | 33 |
| `src/app/calculator/gantt-chart/gantt-chart.component.ts` | 18 | 45 |
| `src/app/pandl/pand-l/pand-l.component.ts` | 41 | 22 |
| `src/app/quotations/quotation-detail/quotation-detail-information-tab/quotation-obtain-dialog/quotation-obtain-dialog.component.html` | 19 | 44 |
| `src/app/resources/dob-input/dob-input.component.ts` | 39 | 24 |
| `src/app/calculator/secure-job/secure-job.component.ts` | 33 | 28 |
| `src/app/quotations/quotation-detail/quotation-detail-information-tab/quotation-obtain-dialog/quotation-obtain-dialog.component.ts` | 34 | 25 |
| `src/app/activework/project-data-tab/external-valuation-transactions/add-edit-external-valuation/add-edit-external-valuation.component.html` | 22 | 36 |
| ... 352 more | | |

</details>

<details><summary>Test files</summary>

- `src/app/shared/team-day-field/team-day-field.time-zone.spec.ts` (+168)
- `src/app/attendance/attendance/user-attendance-row/user-attendance-row.time-zone.spec.ts` (+157)
- `src/app/materials/material-days.time-zone.spec.ts` (+117)
- `src/app/shared/team-time-field/team-time-field.time-zone.spec.ts` (+115)
- `src/app/teams-settings/create-team-settings/create-team-settings.time-zone.spec.ts` (+113)
- `src/app/shared/team-clock/team-clock.time-zone.spec.ts` (+109)
- `src/app/teams-settings/team-time-settings/team-time-settings.time-zone.spec.ts` (+96)
- `src/app/helpers/planner-days.time-zone.spec.ts` (+94)
- `src/app/attendance/attendance/attendance.component.time-zone.spec.ts` (+92)
- `src/app/teams-settings/edit-team-settings/edit-team-settings.time-zone.spec.ts` (+88)
- `src/app/daily-resource-planner/services/staff-pool.time-zone.spec.ts` (+78)
- `src/app/materials/team-day-rules.time-zone.spec.ts` (+75)
- `src/app/attendance/attendance/controls-row/controls-row.time-zone.spec.ts` (+71)
- `src/app/attendance/attendance.service.spec.ts` (+64)
- `src/app/resources/dob-input/dob-input.time-zone.spec.ts` (+55)
- `src/app/calculator/gantt-chart/gantt-assignment-start.time-zone.spec.ts` (+54)
- `src/app/resources/staff-detail/staff-detail-time-zone.time-zone.spec.ts` (+53)
- `src/app/baton-customers/baton-customers-list/baton-customers-list.time-zone.spec.ts` (+49)
- `src/app/ldf/ldf-pipes.time-zone.spec.ts` (+49)
- `src/app/shared/pipes/time-ago.time-zone.spec.ts` (+47)
- `src/app/shared/syncfusion-grid/grid-date-value.time-zone.spec.ts` (+45)
- `src/app/quotations/shared/days-to-due.time-zone.spec.ts` (+44)
- `src/app/resources/workforce-reports/report-filter-bar/report-filter-bar.time-zone.spec.ts` (+41)
- `src/app/helpers/team-day.spec.ts` (+40)
- `src/app/resources/staff-period.time-zone.spec.ts` (+40)
- `src/app/shared/export.service.time-zone.spec.ts` (+40)
- `src/app/shared/pdf-document.time-zone.spec.ts` (+38)
- `src/app/calculator/operational-group-tab/operational-group-schedule.time-zone.spec.ts` (+37)
- `src/app/helpers/custom-validators.time-zone.spec.ts` (+33)
- `src/app/attendance/supervisor-clock-in.spec.ts` (+32)
- `src/app/resources/workforce.time-zone.spec.ts` (+28)
- `src/app/attendance/attendance/user-attendance-row/user-attendance-row.component.spec.ts` (+27)
- `src/app/takeoff/quote-import-files.time-zone.spec.ts` (+24)
- `src/app/quotations/quotation-detail/quotation-detail-information-tab/quotation-obtain-dialog/quotation-obtain-dialog.component.spec.ts` (+17)
- `src/app/shared-pricing/section-overview/section-overview.component.spec.ts` (+13)
- `src/app/resources/worker-preflight.service.spec.ts` (+7)
- `src/app/wage/adjustmenttable-projectcell/adjustmenttable-projectcell.component.spec.ts` (+4)
- `tsconfig.time-kit.spec.json` (+4)
- `src/app/safety-suite/near-miss/near-miss-charts/near-miss-charts.component.spec.ts` (+3)
- `src/app/wage-legacy-2/adjustmenttable-clockincell-legacy2/adjustmenttable-clockincell-legacy2.component.spec.ts` (+3)

</details>

### HandoverApp (PR 11025)

- Time kit copy (Angular 16 module wrapper); sign-off delete window computed in the team zone (`isPastDeleteWindow`); attendance ranges use team-day ranges.

Files: 14 source, 27 kit, 2 test, 7 config and scripts. Tests: build ok; 31 default specs fail (missing providers); 2 specs do not compile (on main).

<details><summary>Source files</summary>

| File | + | - |
|---|---:|---:|
| `src/app/handover/handover.module.ts` | 115 | 113 |
| `src/app/attendance/attendance.service.ts` | 15 | 11 |
| `src/app/handover/signoff-info-step/signoff-info-step.component.ts` | 14 | 11 |
| `src/app/handover/handover/handover.component.ts` | 8 | 5 |
| `src/app/app.module.ts` | 9 | 1 |
| `karma.conf.js` | 6 | 0 |
| `src/app/handover/confirmation/confirmation.component.html` | 2 | 2 |
| `src/app/handover/linked-files-step/linked-file-details/linked-file-details.component.html` | 2 | 2 |
| `src/styles.scss` | 4 | 0 |
| `src/app/handover/handover.service.ts` | 2 | 1 |
| `src/app/handover/auto-signoff/auto-signoff.component.html` | 1 | 1 |
| `src/app/handover/linked-files-step/handover-files-grid/handover-files-grid.component.html` | 1 | 1 |
| `src/app/handover/media-step/media-detail/media-detail.component.html` | 1 | 1 |
| `src/app/handover/signoff-info-step/signoff-info-step.component.html` | 1 | 1 |

</details>

<details><summary>Test files</summary>

- `src/app/attendance/attendance.service.spec.ts` (+119)
- `tsconfig.time-kit.spec.json` (+8)

</details>

### InspectionsApp (PR 11026)

- Time kit copy (Angular 16 module wrapper); hands date-entry uses the control in date mode; `capturedDate` serialised with `toISOString()`.

Files: 13 source, 27 kit, 2 test, 7 config and scripts. Tests: build ok; 250 pass.

<details><summary>Source files</summary>

| File | + | - |
|---|---:|---:|
| `src/app/inspection/steps/hands/date-entry/date-entry.component.ts` | 78 | 34 |
| `src/app/inspection/steps/hands/date-entry/date-entry.component.scss` | 14 | 21 |
| `src/app/inspection/steps/hands/date-entry/date-entry.component.html` | 8 | 23 |
| `src/app/app.module.ts` | 9 | 1 |
| `karma.conf.js` | 6 | 0 |
| `src/app/testing/testing.module.ts` | 1 | 4 |
| `src/app/inspection/hands-inspection/hands-inspection.component.html` | 2 | 2 |
| `src/app/inspection/inspection.module.ts` | 2 | 2 |
| `src/app/inspection/weekly-inspection/weekly-inspection.component.html` | 2 | 2 |
| `src/app/inspection/hands-inspection/hands-inspection.service.ts` | 2 | 1 |
| `src/app/inspection/weekly-inspection/weekly-inspection.service.ts` | 2 | 1 |
| `src/app/shared/media/media-detail/media-detail.component.html` | 1 | 1 |
| `src/app/shared/shared.module.ts` | 2 | 0 |

</details>

<details><summary>Test files</summary>

- `src/app/inspection/steps/hands/date-entry/date-entry.component.spec.ts` (+264)
- `tsconfig.time-kit.spec.json` (+8)

</details>

### OcelotConfigValidator (PR 11027)

- `working.json`: the three `Intowork.Team*` header mappings added to all 506 `AddHeadersToRequest` blocks.

Files: 0 source, 0 kit, 0 test, 1 config and scripts. Tests: JSON checked: 506/506 blocks carry the headers.

## Behaviour changes to sign off

- Day filters: rows saved between 23:00Z and 00:00Z in London summer fall on the next team day.
- Materials: "tomorrow 08:00" is 08:00 team time, stored as 07:00Z in summer.
- Report.API printed times are team time (+1h in summer); the report "To" bound covers the picked day.
- Week key for the Sunday-start week of 2026-10-25 changes (clock change).
- Handover and Inspections reference keys and filters follow the team day.
- ActiveWork PDF prints team time and team formats.
- Every route in Ocelot now forwards the three team headers.

## Open items

- Rebase or merge `develop` into the conflicting branches above before review.
- GafferService has not been built or tested in this checkout (NuGet restore 401).
- CommonLibs: no change is made. Date filters sent as UTC instants keep working; Inspections `InspectionsRepo` / `HsInspectionsRepo` still use the UTC-day filter and need a decision.
- Attendance shadow-compare was not run against a database (S.5).
- Frontend: 194 unrelated spec failures and two specs on `main` that do not compile; no ESLint config.
- HandoverApp: no test covers the new sign-off delete window.
- Decisions: half-open range endpoints vs `to + 23:59:59`; `Resources.Customer.Core` kit; `Job.cs` `.Date` in event replay; Attendance `AddDays(7)` across DST and `CalcStdWage`; `LabourDailyCalculator.EmployeeMarkup`.
