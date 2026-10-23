# Team time zone: changes handled after merging develop and main

Branches: `feature/1.6.0/team-zone-headers` (base) and `feature/1.6.0/team-zone-headers-develop` (-develop). PRs 11047–11061 go from -develop into `develop`.

## Merge order

1. `origin/develop` merged into every .NET -develop branch (conflicts resolved, tests green).
2. `origin/main` merged into the base branches. Only six repos had new main commits: ActiveWork, Attendance, FrameworkCache, Gateway, Handover, Project. The other nine had nothing missing.
3. Base merged into -develop for the same six repos.
4. Code that arrived from develop and main was audited for team-zone handling.

All six repos were pushed (base and -develop). Verification used locally built packages, not the published ones.

## Rules applied to the incoming code

- Database filters take UTC (`UtcWindow` or UTC `DateTime`); client-side logic uses the team zone.
- Repositories do not inject `IDateTimeProvider`; consumers pass the dates and "now".
- No static `DateTime.Now/UtcNow/Today` for team-day logic, no hard-coded zones.
- New classes use primary constructors and carry no comments.

## Develop merged into -develop

| Repo | What was handled |
|---|---|
| ActiveWork | `Core.csproj` was corrupted by the merge and rewritten (package versions Data 2.4.1, Messaging 2.2.1, Time 1.0.0). `AddVehicleToAssignmentHandler`, `MoveVehicleHandler`, `RemoveVehicleFromAssignmentHandler` now take `IActiveWorkRehydrator` because `GetRehydratedByIdAsync` is not on `IActiveWorkRepo`; their tests mock the rehydrator. `ActiveWorkController.GetForDateRnage` no longer widens `toDate` to 23:59:59, so instants are used as given (the matching develop test was removed). |
| Attendance | Conflicts resolved; the bulk loader and `GetEventsForAggregatesAsync` were kept on the team-zone signatures. |
| Gateway | `GatewayBackgroundEventBusExtensions` uses the `*Async` names with the HEAD subscription list (InvalidatePermissions, RevokeSession). Unused usings removed. Develop's CORS block (`AddIntoworkApiBasics(true, null, configureCors)`) was taken. |
| Handover | `CreateInternalBulkHandoverHandler` takes `(…, ISectionMilestoneService, IDateTimeProvider clock, IHandoverValuationService valuations)`; `ApproveHandoverHandler` takes `(…, valuations, reportService, clock)`; `*Async` bus extensions; Handlebars.Net added to the Background csproj. |
| Project | `TeamsRepo`/`ITeamsRepo` take develop's `UpdateTeamAsync` parameter order. `ValuationIsPastResolver` already existed in -develop, so no duplicate was added. |

## Main merged into base

| Repo | What was handled |
|---|---|
| ActiveWork | Auto-merged. 340 tests pass. |
| Gateway | Auto-merged. 91 `Gateway.Tests` pass. |
| FrameworkCache | `CPValuationReportService` used static `DateTime.UtcNow`; it now takes `ReportingCalendar` (`Today => _calendar.Today`). `CPReportsController` takes both `ReportingCalendar` and `ICPValuationReportService`. `TeamTodayDefaultTests` gained a `_valuation` mock. 338 tests pass. |
| Project | `UpdateTeamSettingsCommand` gained `timeZone, dateFormat, timeFormat, documentDefaults, mcdDeduction`, passed through `TeamSettingsController`. `UpdateQuotationVersionPricingParametersPartialHandler` passes `MCDDeduction` and uses `_clock.UtcNow`. The Add/Update/DeleteJobValuationReceipt handlers take `IDateTimeProvider` and use `_clock.UtcNow` instead of `DateTime.UtcNow`. London-hard-coded `UkCalendar` deleted and the 3-argument `Job.RegenerateValuationDates` overload removed; `UpdateJobMetadataHandler` and `UpdateJobValuationDatesHandler` take a clock and pass `_clock.TeamToday`. New `JobValuationIsPastResolver` (`source.Date <= clock.TeamToday`), registered and used in `AutoMapperConfig`. 2909 tests pass. |
| Handover | `ApproveHandoverHandler` takes `(…, IBatonHandoverPublisher, IHandoverValuationService valuations, IDateTimeProvider clock)` and uses `_clock.UtcNow`; `CreateInternalBulkHandoverHandler` takes valuations and a clock. Tests pass. |
| Attendance | 11 conflicts. `RebuildAttendanceRecordHandler` keeps main's incremental apply with `UserAttendanceRecord.FromEvents(events, _clock)` and `Clock = _clock`. `IEventsRepo`/`EventsRepo` gained `GetEventsForAggregatesAsync`. `UserAttendanceRecordLoader`, `SupervisorBulkClockInHandler`, `SupervisorBulkClockOutHandler`, `SupervisorBulkClockSupport` and the bulk-clock tests were carried over from -develop. `SupervisorClockInHandler`/`SupervisorClockoutHandler` use `SupervisorBulkClockSupport.LockExpiry(_clock)`, which fixed a `ClockUsageTests` failure. `IWageWeekSnapshotsRepo` keeps the `UtcWindow` signatures plus main's `GetByIdAsync` and `AddOrUpdateAsync`. 573 + 46 tests pass. |

## Base merged into -develop

| Repo | Result |
|---|---|
| ActiveWork | Merged (d7147b3). |
| FrameworkCache | Merged (14534a9). |
| Gateway | Merged (fd7e476). |
| Attendance | Merged (671a7c9). |
| Handover | Merged (7ff7a66). |
| Project | Merged (6de825db). -develop already had identical fixes (`ValuationIsPastResolver`, clock receipt handlers), so the duplicate base file was dropped and conflicts resolved to -develop. Duplicate auto-merge lines were reverted. 2913 tests pass. |

## Audit of incoming code

Searched the diff against `origin/develop` for `DateTime.Now/UtcNow/Today`, `TimeZoneInfo.Local`, `FindSystemTimeZoneById` and `"Europe/London"`, and ran the clock-usage and repository-injection architecture tests. Nothing needed fixing. Remaining London strings:

- Project seeders (`DataSeeder`, `DatabaseExtension`): seed data, not runtime logic.
- Resources `HRJobScheduler.UkBankHolidayZone`: schedules the UK bank-holiday import.
- FrameworkCache `Intowork.Report.API/Time/TeamZones.cs` and `TeamTimeDefaults.Zone`: develop's own London fallback, not changed.

## Open points

- Frontend, HandoverApp and InspectionsApp are not merged with main or develop. CommonLibs is not merged with main (its main already contains PR 11486).
- Gateway -develop has a leftover permissive `AddCors` block (commit 40b6b99) that overrides the configured CORS policy.
- No unit test exists for `JobValuationIsPastResolver`.
- ActiveWork: Baton day-view behaviour for a same-instant range changed.
- FrameworkCache `CPValuationRepository` treats valuation dates as UTC day boundaries, a possible team-day issue left unchanged.
