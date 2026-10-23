# Repositories: UTC at the database, team zone in the consumer

## 1. Rules

| # | Rule |
|---|------|
| R1 | Any filter, sort or update that runs in MongoDB compares against UTC values only. |
| R2 | Any filter, grouping or comparison that runs in application code uses the team zone. |
| R3 | A repository never injects `IDateTimeProvider` (or `ITeamClocks`). Dates, windows and "now" arrive as method parameters. |
| R4 | The consumer (handler, query, controller, background job) decides whether a date is UTC or team time and converts before calling the repo. |
| R5 | Repository date parameters are `UtcWindow` or a UTC `DateTime`. No zone type reaches a repository. |

Decisions taken: callers convert filter dates; repos accept `UtcWindow` / UTC `DateTime` only; proof is tests plus an architecture test; delivery is two phases.

## 2. Findings that drive the plan

- ActiveWorkService already builds its date filters from `UtcWindow` (`DateRangeFilter`, `IncompleteFilter`, `LinkedItwsFilter`, `UserDateRangeFilter`, `FutureWorkPredicate`). All of them run in MongoDB.
- Paginated queries use the Mongo LINQ provider through `ApplyFilters`, `ApplySearch`, `ApplySorting` and `PaginateAsync`. They run in MongoDB.
- **Gap:** `CommonLibs/Intowork.Common.Data/Extensions/FilterAndSortExtension.cs` (`CreateDateComparison`, lines 226-301) reads UI date values with `DateTime.TryParse` and builds start-of-day / end-of-day bounds with no zone. This applies to every service that calls `ApplyFilters`.
- **Scale of R3:** about 100 repository-layer files reference the clock across 13 services. Usage inside them:
  - `UtcNow`: 92 uses. Stamping `CreatedOn`, outbox rows, incoming-event logs, `TeamsRepo`.
  - Team-aware calls: `DayOf` 13, `ToUtc` 5, `StartOfDayUtc` 5, `DayRangeUtc` 2, `Zone` 1. These are the real design work.
- Heaviest services: ProjectService (about 31 files), Attendance (14), Materials (13), Inspections (11), Handover (8), Resources (7).
- `ActiveWorkRepo.GetRehydratedByIdAsync` uses `_clock.Zone` for `ApplyEvents(events, zone)`. That is domain rehydration, not a database filter, and belongs in the handler.

## 3. Phase 1: guarantee R1 and R2 (no signature changes)

### 1.1 CommonLibs
1. Change `ApplyFilters` / `ApplySearch` so a date filter never uses `DateTime.TryParse` with the server zone. Options for the value it receives, in order of preference:
   - the caller passes a `UtcWindow` (or UTC `DateTime` already converted from the team day), or
   - the filter DTO carries ISO-8601 with an offset and the extension converts with `DateTimeStyles.AdjustToUniversal`.
2. Throw when a parsed date has `Kind == Unspecified`.
3. Unit tests for equal / not-equal / greater / less on date and date-time columns, including a team in a non-UTC zone across a DST change.

### 1.2 Audit per service
For each repository method that takes or builds a date:
- Classify it as database-side (R1) or in-memory (R2).
- Record the finding in the table in section 6.
- Fix anything that compares a team-local value against a stored UTC value, or the reverse.

In-memory spots already seen in ActiveWork: `GetDistinctActiveWorkIdsForDateAsync` (distinct), `GetDeletedDocumentCategoriesAsync` (selects category ids after the query). Neither is date logic, but record them.

### 1.3 Tests that prove R1
- For each date-taking repo method, one test that builds the filter and asserts it contains the UTC `From` / `To` the test passed in, and nothing else. ActiveWork already exposes `internal static` filter builders, so use `InternalsVisibleTo` and render with `filter.Render(...)`. Repeat that pattern in other services.
- A test with a team zone far from UTC (for example `Pacific/Auckland`) so a UTC/team mix-up changes the result.

### 1.4 Tests that prove R2
- For each in-memory date comparison, a test that fails if the team zone is replaced by UTC.

### 1.5 Exit criteria for Phase 1
- Audit table complete for all 13 services.
- Every database-side date filter has a UTC test.
- `ApplyFilters` date path fixed and released as a CommonLibs rc, then adopted by the services.
- Verified on dev for one non-UTC team.

## 4. Phase 2: remove the clock from repositories (R3 to R5)

Start only after Phase 1 exit criteria are met.

### 2.1 Signature rules
- Stamping repos (outbox, incoming events, teams, `MarkAssignmentCompleteAsync`): add a `DateTime utcNow` parameter, or take the value from the entity the handler already built.
- Window repos: keep `UtcWindow`.
- Day-of / start-of-day logic currently inside a repo: move to the consumer, which passes a `UtcWindow`.
- Repo helpers that return values the consumer then compares in team time: return UTC, convert in the consumer.

### 2.2 Order inside a service
1. Add the new overloads and move one consumer at a time.
2. Delete the old signature and the constructor parameter.
3. Fix tests (remove the clock mock from repo tests).
4. Add the architecture test (section 5).

### 2.3 Delivery
- One PR per service, branch `feature/1.6.0/team-zone-headers` (and `-develop`) pattern as for the other time-zone work.
- Order, smallest first, to learn the pattern: ForecastingService, NotificationService, CustomerService, FrameworkCache, PermissionsService, SafetySuiteService, ActiveWorkService, ResourcesService, HandoverService, InspectionsService, MaterialsService, AttendanceService, ProjectService.
- GafferService has no clock in a repository; confirm and skip.

## 5. Architecture test (per service)

Fails when any type in a namespace ending in `Repositories` (or in a `Data/Repositories` folder), or any class named `*Repo` / `*Repository`, references `IDateTimeProvider`, `ITeamClocks` or `TeamZones`. Put the shared helper in CommonLibs so each service adds one line.

## 6. Audit table (fill during Phase 1)

| Service | Repo files with clock | DB-side date filters | In-memory date logic | UtcNow stamps | Status |
|---|---|---|---|---|---|
| ActiveWork | 5 | UtcWindow filters (ok) | rehydrate zone | outbox, incoming, teams, staff assignments | |
| Attendance | 14 | | | | |
| Customer | 1 | | | | |
| Forecasting | 1 | | | | |
| Gaffer | 0 | | | | |
| Handover | 8 | | | | |
| Inspections | 11 | | | | |
| Materials | 13 | | | | |
| Notification | 1 | | | | |
| Permissions | 3 | | | | |
| Project | 31 | | | | |
| Resources | 7 | | | | |
| SafetySuite | 4 | | | | |
| FrameworkCache | 1 | | | | |

## 7. Risks

- The `ApplyFilters` change alters behaviour for every list screen that filters by date. Needs a front-end check (Frontend, HandoverApp, InspectionsApp send the values).
- Removing the constructor parameter breaks DI registrations and tests in one go per service; keep each PR to one service.
- ProjectService has the most files; consider splitting its PR by folder if review is heavy.
- `ObjectId.CreationTime` is used as a timestamp in ActiveWork; it is UTC and unaffected.

## 8. Open questions

- Does the UI send date filters as `dd/MM/yyyy` strings, ISO strings, or both? This decides option 1 or 2 in step 1.1.
- Should `UtcNow` stamping take a parameter or be read from the entity? Pick one convention before the first Phase 2 PR.
