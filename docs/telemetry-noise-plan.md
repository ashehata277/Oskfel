# Telemetry Noise: Implementation Plan

Source: `Telemetry Noise Developer Guide.md` (Baton Phase 0, fix 4, 16 Oct 2026).
Decisions taken: branch from `origin/main` everywhere, all 15 backend repos including Gaffer, pre-release packages first then stable, plan first and branches after approval.

Branch name in every repo: `feature/telemetry-noise`. In CommonLibs a `feature/*` push auto-publishes `-alpha.{buildId}` packages, which is what the pre-release step relies on.

## 1. Findings from checking the guide against origin/main (fetched 16 Oct)

| # | Finding | Effect on the plan |
|---|---------|--------------------|
| 1 | CommonLibs main is already Logging 2.2.0, Messaging 2.1.9 (race fix, PR 11218), Data 2.3.0. | New versions: Logging 2.3.0 as in the guide; Messaging and Data need a bump above 2.1.9 and 2.3.0. Proposed Messaging 2.2.0 and Data 2.4.0 because log and telemetry output changes. Confirm. |
| 2 | Guide says Gateway is on Logging 2.2.0. Real: ActiveWork, Gaffer, Materials and Resources are on 2.2.0; Gateway is on 2.1.2-alpha.7162. The eleven on alpha are Attendance, Customer, Forecasting, FrameworkCache, Gateway, Handover, Inspections, Notification, Permissions, Project, SafetySuite. | Same count of eleven. Read the 2.1.2 to 2.2.0 change notes once, for all of them. |
| 3 | Service Bus processor is missing in Forecasting, FrameworkCache, Gaffer, Notification, SafetySuite (five). Health probe processor is missing in Forecasting and FrameworkCache. | Matches the guide. Forecasting and FrameworkCache gain both through `AddIntoworkTelemetry`. |
| 4 | GafferService is not in the guide's 13 services. | Included by your decision. Its main equals develop (15 Sep). |
| 5 | `Intowork.Common.Logging.csproj` has no `Microsoft.ApplicationInsights.AspNetCore`. `AddApplicationInsightsTelemetry()` and `AddApplicationInsightsTelemetryProcessor<T>()` live there. | Add the package reference alongside the `FrameworkReference`. Guide omits this. |
| 6 | `Serilog.Settings.Configuration` is probably already pulled in by `Serilog.AspNetCore` 9.0.0. | Check the restored graph. Add an explicit reference only if absent. |
| 7 | CommonLibs has no unit test project (only `Testbed` and `.github/skills/unit-test`). Guide says "existing tests pass". | Create `Intowork.Common.Logging.Tests` for the processors and level configuration. |
| 8 | Mongo code: the subscriptions are inside a commented `//#if DEBUG`, and the duration log is inside a live `#if DEBUG`. The guide's snippet stores the command JSON on every command. | Compute `ToJson()` only when Debug is enabled, so the saving is CPU and memory as well as telemetry volume. Guard against empty collection names (`getMore`, `endSessions`, `commit`) and trim the dependency name. |
| 9 | Service `main` branches lag `develop`: Forecasting main is 16 Jun, Customer and Notification 30 Sep, and develop carries the Messaging 2.1.9 bumps in most services. | Branching from main works but each PR needs a back-merge to develop. Conflicts are expected where the bump touched the same csproj lines. |
| 10 | Local `main` is behind origin by: CommonLibs 2, Attendance 5, FrameworkCache 10, Handover 5, Project 24. The other repos are level. | Fast-forward only, before branching. |
| 11 | Dependency names change from `find` to `find Collection`. Any saved KQL, workbook or alert keyed on the old names breaks. | Ask the owner of the workspace queries before production. |
| 12 | Extra `AddApplicationInsightsTelemetry` callers: `ActiveWorkService/DataMigrations/MultiDayItw/Program.cs` and `Inspections.API/Extensions/InspectionsHealthCheckExtensions.cs`. | Inspect before replacing. A migration console app should not get probe filtering. |
| 13 | ActiveWork helm already sets `HealthProbe-Type` on probes. NotificationService, SafetySuite and FrameworkCache (`helm/intoworkcache`) do not. Forecasting has two deployments (`deployment-api.yaml`, `deployment-service.yaml`). | Add the header in each template. Cover both Forecasting deployments, which the guide does not mention. |

## 2. Preparation (all repos, no code change)

1. `git fetch origin --prune` (done for the 16 backend repos).
2. For each of CommonLibs, Attendance, FrameworkCache, Handover and Project: switch from `feature/1.6.0/team-zone-headers` (clean) to `main`, `git pull --ff-only`. The other repos: same, no-op pull.
3. Create `feature/telemetry-noise` from `origin/main` in each repo.
4. Keep the `feature/1.6.0/team-zone-headers` checkouts untouched; return to them after this work.
5. Capture the step 1 baseline query for the production and Dev-WUK workspaces and store the result in `docs/`.

## 3. Phase A: CommonLibs (one branch, three packages)

Commits in this order so each can be reverted alone.

1. Logging, levels: `ConfigureBaseLogging(appName, IConfiguration configuration = null)`, Information floor, `Microsoft` and `System` at Warning, `Microsoft.Hosting.Lifetime` Information, `Microsoft.AspNetCore.Hosting.Diagnostics` Warning, `ReadFrom.Configuration` last. Pass `hostBuilderContext.Configuration` from `UseSerilogWithApplicationInsights`. Leave the Application Insights sink unrestricted.
2. Logging, telemetry: new `Telemetry/` folder with `HealthProbeTelemetryProcessor`, `ServiceBusTelemetryProcessor`, `CloudRoleNameInitializer`, and `AddIntoworkTelemetry(appName)`. Add `FrameworkReference Microsoft.AspNetCore.App` and the Application Insights ASP.NET Core package. Bump to 2.3.0.
3. Messaging: the two body lines (`EventBusServiceBus.cs` 368 and 382) become a structured Information line with type, message id and session id, plus Debug lines for the bodies. Version bump.
4. Data: `MongoProvider.cs` dependency name `"{command} {collection}"`, JSON only at Debug and only computed when Debug is enabled, remove the aggregate Information log and the `#if DEBUG` duration line. Version bump.
5. Tests: new test project covering the cases in the guide (header, path `/`, `/health`, `ServiceBusReceiver.Peek`, `ServiceBusSender.Send`, exception telemetry passes, admin client prefix) plus a configuration test that an env-var style override raises the level.

Exit criteria: solution builds, tests green, push triggers alpha packages for Logging, Messaging and Data. Record the three alpha versions.

## 4. Phase B: services against the alpha packages

Order: HandoverService first (also carries the reminder loop change), then the rest in parallel. Per service branch:

1. Point Logging, Messaging and Data at the alpha versions, in API, Background and Core csproj files.
2. Replace the three registration lines in API and Background `ServiceCollectionExtensions` with `services.AddIntoworkTelemetry(appName)`. Use the exact string passed to `SetupSerilogConfiguration`.
3. Delete `Config/HealthProbeTelemetryProcessor.cs` and `Config/ServiceBusTelemetryProcessor.cs` where present, and fix usings.
4. Helm probe header where missing (finding 13).
5. HandoverService only: remove the three lines in `ReminderService.cs` (57 to 63 region) and keep the "Tasks to process" line. Then search every Background host for per-iteration log lines (`IntegrationEventPublishService`, Inspections `NotificationService`).
6. Build, run the existing tests, run locally and check logs: no probe `Request starting` lines.

Repos: ActiveWorkService, AttendanceService, CustomerService, ForecastingService, FrameworkCache, GafferService, Gateway, HandoverService, InspectionsService, MaterialsService, NotificationService, PermissionsService, ProjectService, ResourcesService, SafetySuiteService.

Gateway extra: it runs Ocelot, so confirm the root path rule and `/health` rule do not hide real routed requests. Gateway also has the OcelotConfigValidator sibling repo; no change expected.

## 5. Phase C: release and measure

1. CommonLibs PR to main (PRs only, no manual merges). Approve the stable pack. Services then replace alpha versions with the stable ones in a follow-up commit on each branch.
2. Service PRs to main, back-merge PRs to develop. Deploy dev with the usual Helm command.
3. Dev check after 24 hours: AppTraces and AppDependencies at least halved, AppRequests down about 60 percent, cloud role name populated.
4. Staging, one day later; production, one day after staging. Seven days after production: AppTraces and AppDependencies each under 5 GB per week.
5. Rollback: `helm rollback`; each CommonLibs commit is independently revertable.

## 6. Risks and open items

- Alpha package versions in committed csproj files must not reach main. Add a pre-PR check.
- Existing dashboards keyed on Mongo dependency names (finding 11).
- Background threads have no `HttpContext`, so probe-caused telemetry is dropped only inside the request. Health check dependencies already run inside the request; verify the Mongo ping and Service Bus admin calls in dev.
- Messaging and Data jumps in services still on 2.1.2-alpha through 2.2.1-rc are larger than the guide implies. Review those change notes before the stable bump.
- Do not add Serilog sections to committed appsettings, do not restrict the sink to Warning, and do not enable sampling (the guide's three "what not to do" rules).

## 7. Open questions for you

1. Version numbers for Messaging and Data (proposal: 2.2.0 and 2.4.0).
2. Whether the DataMigrations console app and `InspectionsHealthCheckExtensions` should be left alone.
3. Who owns existing workspace queries and alerts that use Mongo dependency names?

## 8. Implementation notes (16 Oct)

Done on `feature/telemetry-noise` in all 16 repos; merged with develop on `feature/telemetry-noise-develop`, pushed, and 16 pull requests are open into develop.

- CommonLibs: three commits (Logging 2.3.0, Messaging 2.2.0 and Data 2.4.0, new `Intowork.Common.Logging.Tests` with 24 passing tests).
- Services: shared registration, local processor copies removed, Logging 2.3.0 and Data 2.4.0, helm probe headers on FrameworkCache, NotificationService, SafetySuite and both Forecasting deployments, reminder loop trimmed in HandoverService.
- Corrections to the guide found while implementing:
  1. `typeof(Program).Namespace` is empty for top-level `Program` classes, so the old `appName` was blank. Every Program.cs now uses `typeof(Program).Assembly.GetName().Name`, which also fills the `ApplicationName` log property and the cloud role name.
  2. Messaging was not bumped in the services. Services on `2.1.2-alpha.*` would need the `CancellationToken` signature migration of `IEventBus`; they keep their current Messaging until that migration happens. Body logging therefore stays at Information in those services until they adopt Messaging 2.2.0. ActiveWork (2.1.7), Attendance (2.1.8) and Project (2.1.7) could take it; left for the follow-up with the other three packages.
  3. Data 2.4.0 requires `MongoDB.Driver` 3.11.1, so ForecastingService, GafferService and InspectionsService.Customer.Core moved from 3.5.1.
  4. `IntegrationEventPublishService` and Inspections `NotificationService` already log only when there is work, so section 5 changed only the Handover reminder loop.
  5. Probes in the three charts use `/health`, which the path rule in the processor already covers; the headers are the explicit signal.
- Verification: all 15 solutions build against a scratch NuGet feed (the Azure feed returns 401 here, and the pinned alpha Messaging packages were rebuilt from CommonLibs history for the build only). HandoverService tests: 435 pass. The other suites were run in the background; results are in the hand-off message.
- Before pushing: CommonLibs must publish first, then each service csproj must point at the stable (or alpha) Logging 2.3.0 and Data 2.4.0 that exist on the feed.

## 9. Pull requests into develop (16 Oct)

CommonLibs 11284, ActiveWorkService 11273, AttendanceService 11274, CustomerService 11275, ForecastingService 11276, FrameworkCache 11285, GafferService 11286, Gateway 11277, HandoverService 11278, InspectionsService 11279, MaterialsService 11280, NotificationService 11287, PermissionsService 11281, ProjectService 11282, ResourcesService 11283, SafetySuiteService 11288. Earlier PRs 11257 to 11272 are abandoned.

Open items: release CommonLibs, then swap the alpha references (Logging 2.3.0-alpha.11444, Data 2.4.0-alpha.11445) in each service for the stable versions; repoint services to the new Logging alpha that contains the always-set cloud role name; one non-version conflict to review (ProjectService `JobsServiceCollectionExtensions.cs` usings).
