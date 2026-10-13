---
name: team-date-time
description: >
  Workspace-wide guide to dates, times and time zones across every Intowork repo: the 13 backend services,
  the Gateway, and the Frontend, HandoverApp and InspectionsApp apps. Use whenever reading, writing, comparing,
  formatting or sending a date or time, computing "today" or a day range, writing an event handler, scheduled job
  or hosted service that touches dates, registering team time, or testing any of it. Also trigger on
  IDateTimeProvider, ITeamClocks, ITeamZoneResolver, TeamZones, UtcWindow, TeamTimeUnavailableException,
  AddTeamTime, AddTeamTimeByTeamName, Intowork.TeamTimeZone, asTeamDay, asTeamDate, teamNow, utcDate, TeamDateFormatter,
  DateTime.Now, "time zone", "UTC", "London" and "daylight saving".
---

# Team date and time (whole workspace)

This is the combination of the per-repo `team-date-time` skills. Each repo carries its own copy at
`<repo>/.claude/skills/team-date-time/SKILL.md` with the same rules plus detail for that repo; when you work inside
one repo, that copy is the more specific one.

## The flow end to end

1. The user's team has one IANA zone, a date format and a time format, stored on the team.
2. The **Gateway** puts them on every request as `Intowork.TeamTimeZone`, `Intowork.TeamDateFormat`,
   `Intowork.TeamTimeFormat`. If the team has no valid zone it sends an **empty** zone, never London or UTC.
3. A **backend service** reads the zone only from that header. Missing or invalid gives a 400 through
   `TeamTimeHeaderMissingFilter`. The request clock is lazy, so `UtcNow` works without the header.
4. **Background work** has no request, so it looks the team up by name with `ITeamClocks`; an unknown team or one with no
   zone throws `TeamTimeUnavailableException`.
5. Everything stored and sent is **UTC**. The **front end** converts to and from team time with the `shared/time` helpers,
   never the device zone.

## Which repo does what

| Repo | Role |
|---|---|
| Gateway | Supplies the headers from claims. Details in the Gateway section below |
| 13 backend services | Read the header (`AddTeamTime`) and/or look teams up by name (`AddTeamTimeByTeamName`) |
| Frontend, HandoverApp, InspectionsApp | `src/app/shared/time` kit: `TeamTimeService`, `asTeamDay`, `asTeamDate`, `isTeamFuture`, `TeamDateFormatter` |


# Part 1: Backend rules (all services)

## The rule in one paragraph

Every team in Intowork has exactly one IANA time zone (plus a date format and a time format). A request learns
its team's zone **only** from the `Intowork.TeamTimeZone` header that the Gateway injects. Background work
(event handlers, scheduled jobs, hosted services) has no request, so it looks the team up **by name** in this
service's own copy of the teams. If the zone cannot be found the code **fails**. There is no London fallback, no
UTC fallback, and no "device zone" anywhere. Everything stored and sent over the wire is UTC; the zone is only
used to decide which calendar day an instant belongs to and to turn a team wall-clock time back into UTC.

## The kit

The time kit lives in each service's own `Time` folder (namespace `Intowork.TeamTime`; the exact folder is listed per service in Part 2; HandoverService is the exception, with its own project and namespace). It is the same code in every Intowork
service; do not fork it per service, and do not add a second clock abstraction next to it.

| Type | What it is |
|---|---|
| `TeamHeaders` | Header names: `Intowork.TeamName`, `Intowork.StaffMemberId`, `Intowork.TeamTimeZone`, `Intowork.TeamDateFormat`, `Intowork.TeamTimeFormat`. `TeamHeaders.Forwarded` is the list passed on to downstream calls |
| `IRequestInfo` / `HeaderRequestInfo` | Reads the headers of the current request. `TimeZone` throws `TeamTimeHeaderMissingException` when the header is missing or not a known zone, and `TeamTimeUnavailableException` when read outside a request. `DateFormat` / `TimeFormat` fall back to `TeamTimeDefaults` |
| `IDateTimeProvider` | The clock you inject. `UtcNow`, `TeamNow`, `TeamToday`, `Zone`, `ToTeamTime`, `ToUtc`, `OffsetAt`, `DayOf`, `StartOfDayUtc`, `DayRangeUtc`, `ForZone` |
| `RequestDateTimeProvider` | Scoped `IDateTimeProvider` for requests. **Lazy**: the zone is read from the header only the first time a team-zone member is used |
| `TeamDateTimeProvider` | The same maths over a fixed `TimeZoneInfo`. This is what `ITeamClocks` hands out |
| `ITeamClocks` / `TeamClocks` | `ForTeamAsync(teamName, token)` returns an `IDateTimeProvider`; `WithFormatsForTeamAsync(teamName, token)` returns `TeamClockWithFormats(Clock, DateFormat, TimeFormat)` |
| `ITeamZoneResolver` / `TeamZoneResolver` | Looks the team up through `ITeamCopyReader` and validates the zone. `ZoneForAsync`, `TimeForAsync` |
| `ITeamCopyReader` | The service's one adapter to its own copy of the teams. Returns `TeamTimeSettings(TimeZone, DateFormat, TimeFormat)` or `null` |
| `TeamZones` | `TeamZones.Find(zoneId)` returns a cached `TimeZoneInfo?`. The only place a zone id is validated |
| `TeamTimeDefaults` | `DateFormat = "dd/MM/yyyy"`, `TimeFormat = "HH:mm"`. Formats only, never a zone |
| `TeamTimeHeaderMissingFilter` | MVC exception filter that turns `TeamTimeHeaderMissingException` into a 400 `ProblemDetails` titled "Team time zone required" |
| `TeamTimeUnavailableException` | Background lookup failed. `TeamTimeHeaderMissingException` derives from it |
| `UtcWindow` | `readonly record struct UtcWindow(DateTime From, DateTime To)`, a half-open `[From, To)` range |
| `UtcDateTimeJsonConverter` | Registered by `AddTeamTime()` on MVC `JsonOptions`; reads and writes every `DateTime` as UTC |
| `MongoDateParts` | `$dateToString`, `$dateToParts`, `$dayOfWeek`, `$dayOfMonth`, `$month`, `$year` stages that take the team `TimeZoneInfo`, converting Windows ids to IANA |
| `TeamHeadersForwardingHandler` | `DelegatingHandler` that copies the team headers onto an outgoing `HttpClient` call |

## Requests

- The zone comes from `Intowork.TeamTimeZone` and nowhere else. Never read it from the body, query string, a
  team lookup, or a constant.
- A missing header, an empty header, or an id `TimeZoneInfo` does not know throws
  `TeamTimeHeaderMissingException`; `TeamTimeHeaderMissingFilter` turns it into **400**. Do not catch it in a
  controller or handler, and do not turn it into a default zone.
- Inject `IDateTimeProvider`. It is **lazy**, so a handler that only needs `UtcNow` works on a route that has no
  header. The 400 appears the first time the code touches `TeamNow`, `TeamToday`, `Zone`, `ToTeamTime`, `ToUtc`,
  `OffsetAt`, `DayOf`, `StartOfDayUtc` or `DayRangeUtc`. Keep it lazy: never read `Zone` in a constructor "to be
  safe", or every route gains a hard header requirement.
- Date and time **formats** still default to `dd/MM/yyyy` and `HH:mm` when their headers are absent. Only the
  zone is strict.
- Never use `DateTime.Now`, `DateTime.Today`, `DateTimeOffset.Now`, `TimeZoneInfo.Local` or a literal zone id such
  as `"Europe/London"` in production code. Inject `IDateTimeProvider` or `TimeProvider`.

```csharp
public sealed class GetTodayHandler(IDateTimeProvider clock, IThingsRepo things)
{
    public Task<IReadOnlyList<Thing>> HandleAsync(string teamName, CancellationToken token)
    {
        var window = clock.DayRangeUtc(clock.TeamToday);
        return things.GetBetweenAsync(teamName, window.From, window.To, token);
    }
}
```

## Background work

Event handlers, Hangfire jobs, hosted services and startup code have no `HttpContext`, so there is no request
zone (reading it throws `TeamTimeUnavailableException`). Do not inject `IDateTimeProvider` into a Background host or anything it runs: its
`UtcNow` works, but any zone member throws there. Take the team name from the event, the job argument or the
document, and ask `ITeamClocks`:

```csharp
var clock = await teamClocks.ForTeamAsync(@event.TeamName, token);
var today = clock.TeamToday;

var (teamClock, dateFormat, timeFormat) = await teamClocks.WithFormatsForTeamAsync(@event.TeamName, token);
```

`ForTeamAsync` / `WithFormatsForTeamAsync` throw `TeamTimeUnavailableException` when:

- the team name is null or empty,
- the team is not in this service's copy of the teams,
- the team has no zone, or the stored zone id is not valid (`TeamZones.Find` returns `null`).

The exception is thrown when the clock is resolved, not later. An unknown or zone-less team is a data problem, and
the correct reaction is a loud failure:

- In an event handler, **let it propagate** (or rethrow) so the message is retried and eventually dead-lettered.
  Never `catch (Exception)` and carry on with a guessed zone, and never swallow it and mark the event handled.
- Resolve the clock **before** the handler commits its transaction or records the event as handled. Otherwise a
  retry sees the event as already done and the failure is silently lost.
- In a startup or scheduled-job loop over many teams, catch `TeamTimeUnavailableException` **per team**, log the
  team name and the exception message, and continue with the next team. One bad team must not stop the others.
- Never catch it and substitute `TimeZoneInfo.Utc` or London.

```csharp
foreach (var team in teams)
{
    try
    {
        var clock = await teamClocks.ForTeamAsync(team.TeamName, token);
        await RunForTeamAsync(team, clock, token);
    }
    catch (TeamTimeUnavailableException ex)
    {
        logger.LogError(ex, "Skipped team {TeamName}: {Reason}", team.TeamName, ex.Message);
    }
}
```

When a handler needs a zone for a team other than the one in the request (for example an event fan-out), use
`ForTeamAsync` with that team's name, or `clock.ForZone(zone)` when you already hold a validated `TimeZoneInfo`.

## Registration

| Call | Use when |
|---|---|
| `services.AddTeamTime()` | The service only reads the **request** zone. Registers `IHttpContextAccessor`, `TimeProvider.System`, `IRequestInfo`, a scoped `IDateTimeProvider`, `TeamHeadersForwardingHandler`, `TeamTimeHeaderMissingFilter` on MVC and `UtcDateTimeJsonConverter` on JSON. `ITeamClocks` is **not** registered, so injecting it fails at resolve time |
| `services.AddTeamTimeByTeamName<TTeamCopyReader>()` | The service keeps its own copy of the teams (synced by the `TeamCreated` / `TeamUpdated` handlers) and does background or by-name work. Calls `AddTeamTime()` and also registers `ITeamCopyReader`, `ITeamZoneResolver` and `ITeamClocks` as transient (hosted services need that) |

Registration uses `TryAdd` / `Replace`, so calling both, or calling one twice, is safe. The reader must stay a
thin mapping from the team document to `TeamTimeSettings`; it returns `null` for an unknown team and never
supplies a default zone.

Both `TeamCreated` and `TeamUpdated` events carry `TimeZone`, `DateFormat` and `TimeFormat`. A service that keeps a
team copy must copy all three fields in both handlers, otherwise `ITeamClocks` cannot resolve the team. The data
backfill is `oskfel-migrations/team-time/2026-10-12_backfill_team_time_defaults.js`.

## Day maths

All storage is UTC. A "day" is a team calendar day, which is not a 24-hour block of UTC.

| Need | Use |
|---|---|
| Which team day an instant falls on | `clock.DayOf(utc)` returns a `DateOnly` |
| Today in the team | `clock.TeamToday` |
| UTC instant at which a team day begins | `clock.StartOfDayUtc(day)` |
| Range for querying a team day | `clock.DayRangeUtc(day)` returns `UtcWindow(From, To)`; query `>= From && < To` |
| Team wall-clock time to store | `clock.ToUtc(teamLocal)` |
| Instant to display or compare in team time | `clock.ToTeamTime(utc)` |
| UTC offset at an instant | `clock.OffsetAt(utc)` |
| A range of several days | `StartOfDayUtc(first)` to `StartOfDayUtc(last.AddDays(1))` |

`ToUtc` handles daylight-saving edges deterministically:

- **Gap** (clocks jump forward, the local time does not exist): the local time is moved forward in 30-minute
  steps until it is valid, so `01:30` on the spring-forward day becomes `02:00` local.
- **Overlap** (clocks fall back, the local time happens twice): the **first** occurrence (the earlier instant,
  with the larger offset) is chosen.
- Anything else converts normally.

Day length is 23, 24 or 25 hours on transition days. Never write `AddDays(1)` on a UTC instant to mean "the next team
day", never subtract `24h`, and never compare `.Date` of a UTC value with a team date. Add days to the `DateOnly`
and convert it with `StartOfDayUtc`.

Persist `DateTime` values with `DateTimeKind.Utc`. Do not store team-local times, offsets or strings that need the
zone to be understood. If Mongo has to group or format by team day, use `MongoDateParts` with the team
`TimeZoneInfo` rather than doing the conversion in memory.

## Tests

- **Registration tests**: the service has a `TeamTimeRegistrationTests` / `TeamTimeWiringTests` class that builds the
  real container and asserts `IDateTimeProvider` (and `ITeamClocks` where `AddTeamTimeByTeamName` is used) resolve.
  Keep it green when you touch registration.
- **Request clock**: build a `HeaderRequestInfo` over a `DefaultHttpContext` with the header set, pass it to
  `new RequestDateTimeProvider(TimeProvider.System, request)`. For the failure case, assert that
  `TeamToday` (or another zone member) throws `TeamTimeHeaderMissingException`, and that `UtcNow` still works.
- **Background clock**: use a **real** `TeamClocks` over a **real** `TeamZoneResolver` and a stubbed
  `ITeamCopyReader`. Do not mock `ITeamClocks` or `IDateTimeProvider` with a made-up zone, because that hides the
  failure paths.
- **Fixed time**: a `TimeProvider` subclass whose `GetUtcNow()` returns a chosen instant.
- Assert the throw when a **zone member is used**, not when the clock is resolved, for the request clock (lazy);
  assert it when the clock is **resolved** for `ITeamClocks` (it fails in `ForTeamAsync`).
- Cover the failure cases: team not found (`null` settings), team with a null or invalid zone, and no team name.
  Cover a DST gap and a DST overlap for any day-boundary code.
- Never write a test that expects a default zone for a missing one.

```csharp
internal static class TeamClocksFor
{
    public static ITeamClocks Zone(TimeProvider time, TimeZoneInfo zone)
    {
        var teams = new Mock<ITeamCopyReader>();
        teams.Setup(t => t.SettingsOfAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TeamTimeSettings(zone.Id, "dd/MM/yyyy", "HH:mm"));
        return new TeamClocks(time, new TeamZoneResolver(teams.Object));
    }
}
```

## Do

- Inject `IDateTimeProvider` for request code and `ITeamClocks` for background code.
- Use `TeamZones.Find` for every zone validation; use `DayRangeUtc` / `StartOfDayUtc` for day boundaries.
- Keep the clock lazy and resolve it only when the team-zone value is needed.
- Resolve the team clock before commit or mark-handled, and rethrow `TeamTimeUnavailableException`.
- Catch `TeamTimeUnavailableException` per team in loops, log it, and move on.
- Store UTC, send UTC, and let the front end convert for display.
- Add a test for the failure path of anything new that reads a zone.

## Don't

- Don't add a London, UTC or "default team" fallback, not even "just for tests" in production code.
- Don't call `TimeZoneInfo.FindSystemTimeZoneById` / `TryFindSystemTimeZoneById` yourself; use `TeamZones.Find`.
- Don't read `Intowork.TeamTimeZone` by hand from `HttpContext`; go through `IRequestInfo` / `IDateTimeProvider`.
- Don't use `DateTime.Now`, `DateTime.Today`, `TimeZoneInfo.Local`, `DateTime.UtcNow` for team-day logic.
- Don't add a time-zone field to an event just to avoid the lookup; the event carries the team name.
- Don't catch `TeamTimeUnavailableException` in an event handler and mark the event handled.
- Don't call `ITeamClocks` in a request path that already has the request clock, unless the code really acts on
  another team.
- Don't add comments or a second copy of the kit.

## Mistakes this work already fixed

- A silent London fallback (`TimeZoneFallbackMeter`, `TeamZones` fallbacks, `LondonOnlyTeamCopyReader`,
  `TeamTimeDefaults.Zone`, `ITeamClocks.ForZoneId`): all removed. Do not bring them back under another name.
- Resolving the clock **after** `CommitTransactionAsync` or `AddHandledEventAsync`, so a retry was a no-op.
- Swallowing an exception in an event handler so a bad team never retried.
- A startup loop that stopped at the first team without a zone; it now catches per team.
- Reading `Zone` eagerly in a constructor or on a route that has no team-zone header.
- Treating a UTC `DateTime` as a team date (`utc.Date`, `AddDays(1)` on UTC).
- Zone-less teams in seed data and test fixtures. Seeders now give every team a zone and both `TeamCreated` and
  `TeamUpdated` copy `TimeZone`, `DateFormat` and `TimeFormat`.



# Part 2: Per-service details

## ActiveWorkService

**Kit location:** `ActiveWorkService/Intowork.ActiveWork.Core/Time` (namespace `Intowork.TeamTime`).

**Registration and team copy**

- Wiring: `AddActiveWorkTeamTime()` in `Intowork.ActiveWork.Core/Extensions/TeamTimeRegistrationExtensions.cs` calls
  `AddTeamTimeByTeamName<ActiveWorkTeamCopyReader>()`. It is called from `Intowork.ActiveWork.API/Program.cs` and
  `Intowork.ActiveWork.Background/Program.cs`.
- Reader: `Intowork.ActiveWork.Core/Services/ActiveWorkTeamCopyReader.cs` maps `ITeamsRepo.GetSingleAsync` to `TeamTimeSettings`.
- The team copy is kept in sync by `TeamCreatedHandler` and `TeamUpdatedHandler` in
  `Intowork.ActiveWork.Background/Events/IntegrationEventHandlers/`.

**Background and by-name work**

- `CreateWorkReadinessStateReportHandler` (`Background/Events/DomainEventHandlers/`) takes `ITeamClocks`.
- `ActiveWorkModelRebuildHandler2` and `StaffMemberEmailChangedHandler` take `ITeamZoneResolver` directly.
- `TomorrowStaffAssignmentReminderService` (`Background/Services/`) looks the team up with `ForTeamAsync`.
- `ActiveWorkBackgroundApplicationBuilderExtensions.RegisterTomorrowReminderJobsAsync` runs at startup. For each entry
  of `TomorrowReminderSchedules` (`BAT-0001` at `30 13 * * 1-5`, `MRSS` at `45 15 * * 1-5`) it resolves the zone with
  `ITeamZoneResolver.ZoneForAsync`, registers a Hangfire recurring job `tomorrow-staff-assignment-reminder-{teamName}`
  with `RecurringJobOptions { TimeZone = zone }`, and on `TeamTimeUnavailableException` logs an error and continues to
  the next team. Both teams must have a zone in this service's team copy, or their job is not registered.
- The jobs are registered at startup only; creating a team later does not register a job for it.

**Request routes**

- These routes need the `Intowork.TeamTimeZone` header and return 400 without it: `futureITW`, `range`, `incomplete`,
  `linkedItws`, and `StaffAssignment` `all` and `user`. Calls from outside the Gateway (scripts, Postman) must send it.

**Tests**

- `Intowork.ActiveWork.Core.Tests/TestTeamTime.cs` and `Intowork.ActiveWork.Background.Tests/TestTeamTime.cs`: `TestTeamTime.Resolver(zoneId, dateFormat, timeFormat)`
  builds a real `TeamZoneResolver` over a stub `ITeamCopyReader`; pass `null` as the zone id to simulate an unknown team.
- `Core.Tests/Time/TeamTimeRegistrationTests.cs`, `Core.Tests/Services/ActiveWorkTeamCopyReaderTests.cs`,
  `Background.Tests/Extensions/RecurringJobRegistrationTests.cs`, `Background.Tests/Services/TomorrowReminderTests.cs`,
  `Background.Tests/Events/IntegrationEventHandlers/TeamTimeSettingsHandlerTests.cs`.

`global.json` in `ActiveWorkService/` opts into Microsoft.Testing.Platform, so run tests from inside `ActiveWorkService/` with `dotnet test --solution Intowork.ActiveWork.API.sln`.

Cross-service rules and test commands are in `CLAUDE.md` in this folder.

## AttendanceService

**Kit location:** `AttendanceService/Intowork.Attendance.Core/Time` (namespace `Intowork.TeamTime`).

**Registration and team copy**

- Wiring: `AddAttendanceTeamTime()` in `Intowork.Attendance.Core/Utilities/AttendanceTeamTimeExtensions.cs` calls
  `AddTeamTimeByTeamName<TeamCopyReader>()`; called from `Intowork.Attendance.API/Program.cs` and
  `Intowork.Attendance.Background/Program.cs`.
- Reader: `Intowork.Attendance.Core/Utilities/TeamCopyReader.cs` over `ITeamsRepo.GetSingleAsync`.
- `TeamCreatedHandler` and `TeamUpdatedHandler` in `Background/Events/IntegrationEventHandlers/` keep the copy in sync.

**Background and by-name work**

- Integration handlers that take `ITeamClocks`: `StaffMemberAbsenceCreatedOrUpdatedHandler`, `StaffMemberAbsenceDeletedHandler`,
  `AttendanceUpdatedHandler`, `StaffMemberMetaUpdatedHandler` (all in `Background/Events/IntegrationEventHandlers/`).
  In `StaffMemberAbsenceDeletedHandler` the clock is resolved right after `StartTransaction`, before
  `AddHandledEventAsync` and `CommitTransactionAsync`; keep that order.
- `ActiveWorkStaffUpdatedHandler` rethrows instead of swallowing, so a failed message retries.
- `TeamUpdatedHandler` saves and commits the team change, then throws `TeamTimeUnavailableException` without
  recalculating wages when the update changes wage settings and the team has no usable zone.
- Core handlers `RebuildAttendanceRecordHandler`, `RecalculateWageRecordHandler`, `WageRecordApprovalHandler`,
  `DailyRateOverrideHandler` (`Core/CQRS/Handlers/`), `WageCalculaterHelper` (`Core/Utilities/Services/`) and
  `UserAttendanceRepo` use the team clock; `WageHelperLegacy` also uses the team zone.
- `ReminderService` (`Background/Services/`) resolves each team's clock in a loop, catches `TeamTimeUnavailableException`
  per team, logs a warning and skips that team's reminders.
- `ReminderJobScheduler` (`Background/Services/`) registers one morning/evening reminder job pair per zone; job
  names carry the zone, for example `Send morning/evening reminders (Europe/London)`, and old unsuffixed ids are removed.

**Request routes**

- The API has no authentication of its own; the Gateway supplies the headers. Anything that needs the team day on a
  request route uses the injected `IDateTimeProvider` and so needs the `Intowork.TeamTimeZone` header.

**Tests**

- `Intowork.Attendance.Core.Tests/Events/IntegrationEventHandlers/TeamClockBeforeCommitTests.cs` proves the clock is resolved
  before commit / mark-handled and that the exception propagates.
- `Core.Tests/Characterization/WageCalcSupport.cs`, `Core.Tests/Time/TeamZonesTests.cs`, `Core.Tests/Time/TeamCopyReaderTests.cs`,
  `Core.Tests/Reminders/ReminderServiceTests.cs`, `Core.Tests/Events/IntegrationEventHandlers/TeamTimeSettingsHandlerTests.cs`.
- This service's tests are xUnit v2; run them with plain `dotnet test`, as `CLAUDE.md` says.

Run tests from inside `AttendanceService/` with `dotnet test AttendanceService.sln`.

`CLAUDE.md` in this folder describes the service; where it talks about clocks or time zones and disagrees with this skill, this skill is right (its time-zone gotcha, never injecting `IDateTimeProvider` into the Background host, agrees with this skill).

## CustomerService

**Kit location:** `CustomerService/Intowork.Customers.Customer.Core/Time` (namespace `Intowork.TeamTime`).

**Registration and team copy**

- Wiring: `Intowork.Customers.API/Program.cs` calls `AddTeamTime()`. This service has **no** copy of the teams, so
  there is no `ITeamCopyReader` and `ITeamClocks` is not registered. Request time only.
- If background work by team name is ever needed here, add a reader and switch to `AddTeamTimeByTeamName<TReader>()`
  first; do not invent a zone.

**Background and by-name work**

- There is no background time work in this service.

**Request routes**

- Customer routes (`customers/*`) read the request zone and need the `Intowork.TeamTimeZone` header.
- `GET api/customers/team/{teamName}` returns `TeamTimeZone` on `CustomerResponse` **only** when `request.TeamName`
  equals the requesting team (`_requestInfo.TeamName`), using `MongoDateParts.ZoneId(...)`; for any other team the
  field is `null`, because this service cannot look another team up. See `CreateCustomerHandler` and
  `GetAllCustomersHandler` in `Intowork.Customers.API/Handlers/`. `AutoMapperConfig` ignores `TeamTimeZone` on mapping.

**Tests**

- `Intowork.Customers.API.Tests/Time/TeamTimeRegistrationTests.cs` and
  `Intowork.Customers.API.Tests/Handlers/QueryHandlers/CustomerTeamTimeZoneTests.cs` (zone only for the requesting team, else `null`).
- Other test projects: `Intowork.Customers.Customer.Core.Tests`, `Intowork.Customers.ArchitectureTests`,
  `Intowork.Customers.Integration.Tests`. `Intowork.Customers.Tests` is an old template project that is left alone.

Run tests from inside `CustomerService/` with `dotnet test Intowork.Customers.API.sln`.

## ForecastingService

**Kit location:** `ForecastingService/Intowork.Forecasting.Core/Time` (namespace `Intowork.TeamTime`).

**Registration and team copy**

- Wiring: `AddTeamTime()` in both `Intowork.Forecasting.API/Program.cs` and `Intowork.Forecasting.Background/Program.cs`.
  No team copy, no `ITeamClocks`. Request time only.

**Background and by-name work**

- There is no by-team-name time work. `Intowork.Forecasting.Background` registers `AddTeamTime()` so shared code that
  injects `IDateTimeProvider` still resolves, but it must not read a team-zone member outside a request.

**Request routes**

- Handlers inject `IDateTimeProvider` (for example `GetStaffAvailabilityForPeriodHandler` and
  `GetStaffAllocationForPeriodHandler` in `Intowork.Forecasting.API/CQRS/Handlers/`).
- `CalendarRangeExtensions.CalendarRangeUtc(this IDateTimeProvider clock, DateTime firstDay, DateTime lastDay)`
  (`Intowork.Forecasting.API/CQRS/`) is the helper that turns a team calendar range into a `UtcWindow`; reuse it.
- `StaffAllocations` routes need the `Intowork.TeamTimeZone` header.

**Tests**

- `Intowork.Forecasting.Tests` is the only test project. Add request-clock tests with `HeaderRequestInfo` +
  `RequestDateTimeProvider`; there is no `ITeamCopyReader` to stub.

Run tests from inside `ForecastingService/` with `dotnet test ForecastingService.sln`.

## GafferService

**Kit location:** `GafferService/Intowork.Gaffer.Core/Time` (namespace `Intowork.TeamTime`).

**Registration and team copy**

- Wiring: `Intowork.Gaffer.API/Program.cs` calls `AddTeamTime()`. No team copy; request time only.

**Background and by-name work**

- None. Gaffer tools run inside a request.

**Request routes**

- `GafferController` (`Intowork.Gaffer.API/Controllers/`) takes `IDateTimeProvider clock`.
- Tools in `Intowork.Gaffer.Core/Tools/Catalog/` (`MyJobBriefTool`, `MyHoursTool`, `MyCrewTool`) get the clock from the
  caller context as `ctx.TeamClock` and use `DayOf`, `ToTeamTime` and `ActiveWorkJoins.CallerDayRows(...)`; they never
  build their own zone. Keep new tools on `ctx.TeamClock`.
- `CallerContext.TeamClock` falls back to UTC in test setups only; do not copy that into production code.

**Tests**

- `Intowork.Gaffer.Tests/Time/TeamTimeRegistrationTests.cs`; the rest of the suite is in `Intowork.Gaffer.Tests`.
- Restoring this solution needs the private Azure feed; if it returns 401, a scratch copy with a locally packed
  `Intowork.Common.*` feed is the workaround.

Run tests from inside `GafferService/` with `dotnet test Intowork.Gaffer.sln`.

## HandoverService

**Kit location:** `HandoverService/Intowork.HandoverService.TeamTime` (namespace `Intowork.HandoverService.TeamTime`).
This service is the only one where the kit is its **own project**, `Intowork.HandoverService.TeamTime`, referenced by `Core` and `Customer.Core`. The architecture tests' allow-list includes it and both Dockerfiles copy it; if you add a project that needs the clock, reference this project instead of copying the files.

**Registration and team copy**

- Wiring: `AddHandoverTeamTime()` in `Intowork.HandoverService.Core/Extensions/HandoverTeamTimeExtensions.cs` calls
  `AddTeamTimeByTeamName<TeamCopyReader>()`. Called from `Intowork.HandoverService.API/Program.cs` and from
  `HandoverBackgroundServiceCollectionExtensions` in `Intowork.HandoverService.Background/Extensions/`.
- Reader: `Intowork.HandoverService.Core/Services/TeamCopyReader.cs` over `ITeamsRepo.GetSingleAsync`.
- `ITeamClocks` is registered transient on purpose, because hosted services resolve it.
- `TeamCreatedHandler` and `TeamUpdatedHandler` in `Background/Events/IntegrationEventHandlers/` keep the copy in sync.

**Background and by-name work**

- `ReportGeneratorService` (`Background/Services/`) calls `WithFormatsForTeamAsync(handover?.TeamName, token)` and passes the
  `TeamClockWithFormats` to `HandoverReportTemplateCompiler.Compile(reportData, template, team)`; the Handlebars helpers
  format with that team's zone, date format and time format. A handover with no team name or a team without a zone
  fails the report instead of rendering in a default zone.
- `HandoverReminderPlanner(ITeamClocks)` (`Core/Services/`) builds reminder times with `PlanAt(DateTime now, IDateTimeProvider clock)`.
- `CancelHandoverHandler` (`Core/CQRS/Handlers/Commands/`), `CustomerHandoverReader` (`Customer.Core/Services/`),
  `HandoversRepo` / `JobsRepo` (`Core/Data/Repositories/`) and `GetHandoversForTeamHandler` (`API/CQRS/Handlers/`)
  take the team clock; `ITeamDayRow` carries an `IDateTimeProvider`.

**Request routes**

- Request code uses `IDateTimeProvider`; background report code uses `ITeamClocks` as described above.

**Tests**

- `Intowork.HandoverService.Core.Tests/Builders/TeamClocksFor.cs`: `TeamClocksFor.Zone(TimeProvider time, TimeZoneInfo zone)` returns a real
  `TeamClocks` over a stubbed `ITeamCopyReader`; `FixedUtcTimeProvider(DateTime utcNow)` in the same file fixes the time.
- `Core.Tests/Time/RequestTeamTimeTests.cs` (header, lazy clock, 400 filter), `Core.Tests/Time/TeamTimeRegistrationTests.cs`,
  `Core.Tests/Events/IntegrationEventHandlers/TeamTimeSettingsHandlerTests.cs`, characterization tests under
  `Core.Tests/Characterization/`, and `Customer.Core.Tests/Handlers/CustomerHandoverTeamTimeTests.cs` (real `TeamClocks`, no fake).
- Also `Intowork.HandoverService.API.Tests`, `Background.Tests`, `Architecture.Tests`.

Run tests from inside `HandoverService/` with `dotnet test Intowork.HandoverService.sln`.

## InspectionsService

**Kit location:** `InspectionsService/Intowork.Inspections.Core/Time` (namespace `Intowork.TeamTime`).

**Registration and team copy**

- API: `AddTeamTime()` from `InspectionsServiceCollectionExtensions` (`Intowork.Inspections.API/Extensions/`), request time only.
- Background: `AddInspectionsBackgroundTeamTime(configuration)` in
  `Intowork.Inspections.Background/Extensions/InspectionsBackgroundServiceCollectionExtensions.cs` calls
  `AddTeamTimeByTeamName<TeamCopyReader>()`.
- Reader: `Intowork.Inspections.Core/Data/Repositories/TeamCopyReader.cs` over `ITeamsRepo.GetSingleAsync`.
- `TeamCreatedHandler` / `TeamUpdatedHandler` in `Background/Events/Handlers/` keep the copy in sync.

**Background and by-name work**

- `ReportGeneratorService` (`Background/Services/`) takes `ITeamZoneResolver` and formats the report with the team's
  resolved zone and formats; it must let `TeamTimeUnavailableException` propagate.

**Request routes**

- `GetInspectionsForTeamHandler` (`Intowork.Inspections.Core/CQRS/Handlers/Queries/`) takes `IDateTimeProvider` and converts a team
  wall-clock filter value with `clock.ToUtc(value)` when its `Kind` is `Unspecified`, otherwise `ToUniversalTime()`.
  The `...ForTeam...` in handler and repo names is the team-name argument, not `ITeamClocks`.
- Inspections transactions and totals routes need the `Intowork.TeamTimeZone` header.

**Tests**

- `Intowork.Inspections.Background.Tests/Time/TeamTimeWiringTests.cs`; other projects: `Core.Tests`, `API.Tests`,
  `Customer.Core.Tests`, `Architecture.Tests`.

Run tests from inside `InspectionsService/` with `dotnet test Intowork.Inspections.sln`.

## MaterialsService

**Kit location:** `MaterialsService/Intowork.MaterialsService.Core/Time` (namespace `Intowork.TeamTime`).

**Registration and team copy**

- Wiring: `AddMaterialsTeamTime()` in `Intowork.MaterialsService.Core/Extensions/MaterialsTeamTimeExtensions.cs` calls
  `AddTeamTimeByTeamName<TeamCopyReader>()`; called from `Intowork.MaterialsService.API/Program.cs`.
- Reader: `Intowork.MaterialsService.Core/Data/Repositories/TeamCopyReader.cs` over `ITeamsRepo.GetSingleAsync`.
- `TeamCreatedHandler` / `TeamUpdatedHandler` in `Core/Events/IntegrationHandlers/TeamHandlers/` keep the copy in sync
  (`TeamCreatedHandler` also seeds vehicle settings for the new team).

**Background and by-name work**

- `NotificationService` (`Core/Services/NotificationService.cs`) sends order and collection emails outside a request. Its
  `ClockForAsync(teamName, token)` opens a new DI scope and resolves `ITeamClocks.ForTeamAsync`; the clock is then passed
  into `HandlePlaceholders(emailContent, requestedFor, clock)`. A team with no zone fails the email instead of
  formatting it in a default zone.

**Request routes**

- These classes take `IDateTimeProvider`: `GetMaterialRequestsHandler`, `GetMaterialOrderRequestsHandler`,
  `GetMaterialCollectionRequestsHandler`, `GetMaterialRequestsSummaryHandler`, `GetVehiclesOverviewHandler`,
  `GetPaginatedVehiclesForTeamHandler`, `GetPaginatedStockReturnsHandler`, `GetNoticeSummaryHandler`,
  `CollectionAbandonmentHandler`, `DeliveryAbandonmentHandler`, `CreateFollowUpMCRHandler` and `ShortNoticeRule`.
  The `...ForTeam...` in handler and repo names is the team-name argument, not `ITeamClocks`.

**Tests**

- `Intowork.MaterialsService.Core.Tests/Time/TeamTimeRegistrationTests.cs` and
  `Core.Tests/Events/IntegrationHandlers/TeamHandlers/TeamTimeSettingsHandlerTests.cs`; also `API.Tests`.

Run tests from inside `MaterialsService/` with `dotnet test Intowork.Materials.sln`.

## NotificationService

**Kit location:** `NotificationService/Intowork.NotificationService.API/Time` (namespace `Intowork.TeamTime`).
Here the kit sits in the **API** project (there is no Core), `Intowork.NotificationService.API/Time`.

**Registration and team copy**

- Wiring: `AddNotificationTeamTime(configuration)` in `Intowork.NotificationService.API/Extensions/NotificationServiceCollectionExtensions.cs`
  calls `AddTeamTimeByTeamName<TeamCopyReader>()`.
- Reader: `Intowork.NotificationService.API/Repositories/TeamCopyReader.cs` over `ITeamsRepo.GetAsync`.
- `TeamCreatedHandler` / `TeamUpdatedHandler` in `API/Events/Handlers/` keep the copy in sync.

**Background and by-name work**

- SignalR has no request headers per message. `ConnectionTeamTime.OfAsync(HubCallerContext context, ITeamZoneResolver resolver)`
  (`API/Hubs/ConnectionTeamTime.cs`) reads the team name from the `extension_Team` claim, resolves
  `ResolvedTeamTime` through `TimeForAsync`, and caches it in `context.Items["TeamTime"]` for the connection.
  The connection does not resolve a zone on connect; it resolves lazily on first use.
- `ConnectionTeamTime.FormatDateTime` / `FormatDate` format a UTC value with the resolved zone and the team's formats.
  An unknown team or a team with no zone throws `TeamTimeUnavailableException`.

**Request routes**

- Only hub code needs a zone. Plain notification storage keeps UTC.

**Tests**

- `Intowork.NotificationService.API.Tests/Time/TeamTimeWiringTests.cs` and
  `API.Tests/Hubs/NotificationHubTeamZoneTests.cs` (hub does not need a zone on connect; resolves on first use).

Run tests from inside `NotificationService/` with `dotnet test Intowork.NotificationService.sln`.

## PermissionsService

**Kit location:** `PermissionsService/Intowork.Permissions.Core/Time` (namespace `Intowork.TeamTime`).

**Registration and team copy**

- Wiring: `Intowork.Permissions.API/Program.cs` calls `AddTeamTime()`. No team copy reader here; request time only.
- This service keeps no team time settings: `Core/Events/Handlers/TeamCreatedHandler.cs` does not copy a zone, so it can only
  ever use the request zone. Do not add by-name time work here without first adding a team copy and a reader.

**Background and by-name work**

- No by-team-name time work.

**Request routes**

- No production class outside the kit injects `IDateTimeProvider` today. New code that needs the team day injects it and stays lazy.

**Tests**

- `Intowork.Permissions.Core.Test/Time/TeamTimeRegistrationTests.cs`; test projects here are `Core.Test`,
  `Customer.Core.Test` and `ArchitectureTests` (note `Test`, not `Tests`).

`global.json` in `PermissionsService/` opts into Microsoft.Testing.Platform, so run tests from inside `PermissionsService/` with `dotnet test --solution Intowork.PermissionsService.sln`.

## ProjectService

**Kit location:** `ProjectService/Intowork.Core/Time` (namespace `Intowork.TeamTime`).

**Registration and team copy**

- Wiring: `AddTeamSettingsTime()` in `Intowork.Core/Extensions/ProjectTeamTimeServiceCollectionExtensions.cs` calls
  `AddTeamTimeByTeamName<TeamsRepoTeamCopyReader>()`; called from `Intowork.Jobs.API/Program.cs` and
  `Intowork.Jobs.BackgroundService/Program.cs`.
- Reader: `Intowork.Core/Repositories/TeamsRepoTeamCopyReader.cs` over `ITeamsRepo.GetTeamAsync`.
- Seeding: `Intowork.Jobs.API/Seed/DataSeeder.cs` creates the `default` team with a zone constant and the
  date/time formats, and `TeamsRepo.CreateTeam` takes a `timeZone` (formats default through `ApplyDefaults`).
  The master team is seeded with a zone and formats. Both seeder `TeamUpdated` events copy `TimeZone`,
  `DateFormat` and `TimeFormat`.

**Background and by-name work**

- Many repository methods have `...ForTeamAsync` in their names (for example `ItemsRepo`, `QuotationsRepo`,
  `MaterialsRepo`); that is the team-name argument, not `ITeamClocks`. Day and month windows are built from the
  injected clock, for example `TeamMonthWindow.Of(IDateTimeProvider clock, DateTime instant)` in
  `Intowork.Core/Extensions/TeamMonthWindow.cs`, and `FilterAndSortExtension` for date filters.

**Request routes**

- `FilterAndSortExtension.ApplyFilters(..., IDateTimeProvider clock)` (`Intowork.Core/Extensions/`) is where list-filter dates are
  converted for team time; new date filters go through it rather than reading `.Date` on a UTC value.

**Tests**

- `Intowork.Core.Tests/Time/TeamTimeRegistrationTests.cs` calls `AddTeamSettingsTime()` on a real container.
  `Intowork.Core.Tests/Extensions/FilterAndSortExtensionDateTests.cs` covers the date filters.
- Other projects: `Intowork.Jobs.API.Tests`, `Intowork.Jobs.BackgroundService.Tests`, `Intowork.Jobs.Customer.Core.Tests`,
  `Intowork.Architecture.Tests`, `Intowork.Projects.Integration.Tests`.
- Building needs `Intowork.Common.Data` from the private feed; if it returns 401, pack `CommonLibs` into a scratch
  local feed rather than touching the real NuGet cache.

`global.json` in `ProjectService/` opts into Microsoft.Testing.Platform, so run tests from inside `ProjectService/` with `dotnet test --solution Intowork.Jobs.API.sln`.

## ResourcesService

**Kit location:** `ResourcesService/Intowork.Resources.Core/Time` (namespace `Intowork.TeamTime`).

**Registration and team copy**

- API: `AddResourcesTeamTime(configuration)` in `Intowork.Resources.API/Extensions/ResourcesServiceCollectionExtensions.cs`.
- Background: `AddResourcesBackgroundTeamTime(configuration)` in
  `Intowork.Resources.Background/Extensions/ResourcesBackgroundServiceCollectionExtensions.cs`.
  Both call `AddTeamTimeByTeamName<TeamCopyReader>()`; both are called from the matching `Program.cs`.
- Reader: `Intowork.Resources.Core/Data/Repositories/TeamCopyReader.cs` over `ITeamsRepo.GetSingleAsync`.
- `TeamCreatedHandler` / `TeamUpdatedHandler` in `Background/Events/Domain/` keep the copy in sync.

**Background and by-name work**

- `ArchiveStaffMemberHandler`, `ActivateStaffMemberHandler`, `DeactivateStaffMemberHandler`, `RestoreStaffMemberHandler`,
  `QuickAddStaffMemberHandler` (`Core/CQRS/Handlers/`) and `HrService` (`Core/Services/`) take `ITeamClocks` and call
  `ForTeamAsync(teamName, token)` for the team the staff member belongs to.
- `HRJobScheduler` (`Core/ServiceWorkers/`): the startup loop reads all teams and calls `ScheduleTeamJob(team)` inside a
  per-team `try`/`catch (TeamTimeUnavailableException)`, logging `HR sync job not scheduled for team {TeamName}`
  and continuing. The yearly bank-holiday job runs in `HRJobScheduler.UkBankHolidayZone`; that is the one deliberate fixed zone,
  because the data source is the UK bank-holiday calendar, not a team. Do not copy that pattern for team work.
- `HRJobStartupService` runs the scheduler as a hosted service.

**Request routes**

- `GetStaffForTeamHandler`, `GetStaffOverviewHandler`, `GetFutureBankHolidaysHandler` and `ResourcesController`
  (`Intowork.Resources.API/`) take `IDateTimeProvider`; in `Intowork.Resources.Core`, `FilterAndSortExtension` and
  `StaffMemberRepo` take it as well.

**Tests**

- `Intowork.Resources.Core.Test/Support/TestClocks.cs`: `TestClocks.At(zoneId, utcNow)` builds a `TeamDateTimeProvider`;
  `TestClocks.ForTeam(teamName, zoneId, utcNow)` builds a real `TeamClocks` over a stubbed `ITeamCopyReader`;
  `FixedTimeProvider(DateTime utcNow)` fixes the time. Zone constants are `TestClocks.London` and `TestClocks.Toronto`.
- `Core.Test/Services/TeamClocksTests.cs`, `Core.Test/Services/HrServiceTeamDayTests.cs`,
  `Core.Test/CQRS/Handlers/ArchiveStaffMemberHandlerTests.cs`, `Background.Test/Events/TeamTimeRegistrationTests.cs`,
  `Background.Test/Events/TeamTimeSettingsHandlerTests.cs`.
- `Intowork.Resources.ArchitectureTests/HostHandlerDependencyTests.cs` checks what the host handlers may depend on.

`global.json` in `ResourcesService/` opts into Microsoft.Testing.Platform, so run tests from inside `ResourcesService/` with `dotnet test --solution Intowork.ResourcesApi.sln`.

## SafetySuiteService

**Kit location:** `SafetySuiteService/Intowork.SafetySuiteService.Core/Time` (namespace `Intowork.TeamTime`).

**Registration and team copy**

- Wiring: `Intowork.SafetySuiteService.API/Program.cs` calls `AddTeamTime()`. No team copy reader; request time only.

**Background and by-name work**

- None. `NearMissSettingsRepo.SeedForTeamAsync` seeds settings by team name and has no time logic.

**Request routes**

- `CreateNearMissCommandHandler` (`Core/Features/NearMisses/Handlers/`) takes `IDateTimeProvider`.
- NearMiss routes need the `Intowork.TeamTimeZone` header.

**Tests**

- `Intowork.SafetySuiteService.API.Tests/Time/TeamTimeRegistrationTests.cs`; also `Intowork.SafetySuiteService.Core.Tests`.

Run tests from inside `SafetySuiteService/` with `dotnet test Intowork.SafetySuiteService.sln`.

# Part 3: Gateway

The Gateway does not do date maths. Its job is to put **the caller's team zone and formats** on every
downstream request, truthfully, so that the services can apply the rule: the zone comes only from the
`Intowork.TeamTimeZone` header, and a service that does not get a valid one answers 400. This skill is what must
not break on the Gateway side.

## Gateway: The contract with the services

| Header sent downstream | Claim it is mapped from | Value |
|---|---|---|
| `Intowork.TeamTimeZone` | `intowork_team_time_zone` | The team's IANA zone id, or an **empty string** |
| `Intowork.TeamDateFormat` | `intowork_team_date_format` | The team's date format, default `dd/MM/yyyy` |
| `Intowork.TeamTimeFormat` | `intowork_team_time_format` | The team's time format, default `HH:mm` |

Services read these in `HeaderRequestInfo`: an empty or unknown zone throws `TeamTimeHeaderMissingException`, which
`TeamTimeHeaderMissingFilter` turns into a **400** titled "Team time zone required". Formats fall back to the same
two defaults in the service, so only the zone is strict.

**The Gateway sends an empty zone, never London and never UTC**, when it cannot give the real one. That is on
purpose: a guessed zone would shift every day boundary in every service without anybody noticing. An empty zone
makes the service refuse the request, which is visible and fixable.

## Gateway: Where it lives

| What | Path |
|---|---|
| Claim names, `All`, `DefaultValueOf` | `Intowork.Gateway/Time/TeamTimeClaims.cs` (`IntoworkGateway.TeamTime.TeamTimeClaims`) |
| `TeamTimeValues(TimeZone, DateFormat, TimeFormat)` and `WithoutZone` (`""`, `dd/MM/yyyy`, `HH:mm`) | `Intowork.Gateway/Time/TeamTimeValues.cs` (`Intowork.Gateway.Time`) |
| Turns a `Team` into `TeamTimeValues`; validates the zone; logs once per team | `Intowork.Gateway/Time/TeamTimeResolver.cs` |
| Fills / replaces the claims: `SetTeamTimeClaims`, `AddMissingHeaderClaims`, `HeaderMappedClaims`, `AddDummyPreflightValues` | `Intowork.Gateway/Auth/IntoworkAuthInjector.cs` |
| Claim to header mapping (`Claims[intowork_team_time_zone] > value` and the two siblings) | `Intowork.Gateway.Core/Data/Models/Ingress.cs` (`HeaderTransformation`), consumed by `Intowork.Gateway/Config/ConfigBuilder.cs` |
| Strips every client-supplied `Intowork.*` header | `Intowork.Gateway/Middleware/IntoworkHeaderStrippingMiddleware.cs` |
| Replaces team claims when the user picked another team (`X-Selected-Team`) | `Intowork.Gateway/Middleware/IntoworkTeamOverrideMiddleware.cs`, `docs/auth-flow.md` section 3b |
| Keeps the team copy (zone, formats) current | `Intowork.Gateway.Background/Events/Handlers/TeamCreatedHandler.cs`, `TeamUpdatedHandler.cs` |
| Tests | `Intowork.Gateway.Tests/Auth/IntoworkAuthInjectorTests.cs`, `HeaderTransformationContractTests.cs`; `Intowork.Gateway.Background.Tests/Events/Handlers/TeamTimeSettingsHandlerTests.cs` |

## Gateway: How a request gets its headers

1. The JWT is validated; the caller is either a team (staff) user or a customer user.
2. `IntoworkAuthInjector` loads the team settings with `ITeamsRepo.GetTeamSettingsAsync(teamName, ...)`. A failure
   to load is logged and treated as "no team settings".
3. `SetTeamTimeClaims` asks `TeamTimeResolver.For(team)` and **replaces** the three claims on the identity
   (`ReplaceClaim`, not `AddClaim`, because Ocelot's claim-to-header step takes the **first** claim of a type, so a
   token-supplied value would otherwise win).
4. `TeamTimeResolver` returns the stored zone only if `TimeZoneInfo.TryFindSystemTimeZoneById` accepts it. A null team,
   an empty zone and an unknown zone all give `TeamTimeValues.WithoutZone.TimeZone`, which is the empty string. Each
   case logs one warning per team (and per bad id), saying that services needing the zone will refuse the request.
   Formats use the team value or the default when blank.
5. Customer users have no team: `SetTeamTimeClaims(ci, null)` runs, so they get an empty zone and default formats.
6. When the user selected another team, the override path calls `SetTeamTimeClaims` with the **selected** team's
   settings, so the zone always matches the team the request acts in.
7. `AddMissingHeaderClaims` gives every claim in `HeaderMappedClaims` an empty placeholder (via
   `TeamTimeClaims.DefaultValueOf`) when the token lacks it. Ocelot **fails a route whose mapped claim is absent**, so a
   missing claim would be a 500 instead of a clean 400 downstream. `AddDummyPreflightValues` does the same for CORS
   preflight.
8. Ocelot maps the claims to the headers; the services see them.

Clients cannot choose their zone: `IntoworkHeaderStrippingMiddleware` deletes any incoming header that starts with
`Intowork.` before Ocelot runs (the test `AClientSentTeamTimeZoneHeaderIsStrippedBeforeTheTeamValueIsAdded` covers
`Intowork.TeamTimeZone`). The only client header that influences the team is `X-Selected-Team`, and it is validated
against the user's membership first.

## Gateway: Rules

- Keep sending an **empty** zone when the team has none or an invalid one. Never substitute London, UTC or any
  other value, in the resolver, the injector or the config.
- Validate zone ids with `TimeZoneInfo.TryFindSystemTimeZoneById` (as `TeamTimeResolver` does, cached). Do not
  invent a second validation.
- Date and time formats keep their defaults `dd/MM/yyyy` and `HH:mm`.
- Any new header-mapped claim needs all of: an entry in `Ingress.cs`, an entry in `HeaderMappedClaims`, a default in
  `TeamTimeClaims.DefaultValueOf` (or the equivalent), a placeholder in `AddDummyPreflightValues`, and a test.
- Replace claims, never add duplicates; the tests assert there is a single claim of each type.
- `TeamCreated` and `TeamUpdated` handlers must copy `TimeZone`, `DateFormat` and `TimeFormat` from the event onto the
  Gateway's team copy. If the copy lacks the zone the services will all answer 400 for that team.
- Do not log the caller's token or claims when logging time problems; log the team name and the zone id only.
- Do not do date maths, formatting or conversion in the Gateway.

## Gateway: Tests to keep green

- `IntoworkAuthInjectorTests`: the team-time claims are set by the injector, a placeholder is used for preflight, and
  there is a single claim of each type.
- `HeaderTransformationContractTests`: `Intowork.TeamTimeZone` maps from `intowork_team_time_zone`, the generated
  Ocelot config contains the header, and a client-sent `Intowork.TeamTimeZone` is stripped.
- `TeamTimeSettingsHandlerTests` (Background): `TeamCreated` and `TeamUpdated` copy zone and formats.

Run tests from inside `Gateway/`: `dotnet test IntoworkGateway.sln`.

## Gateway: Do

- Treat the Gateway as the only source of the header and keep it truthful.
- Add a test with an unknown zone id and a null team whenever you touch `TeamTimeResolver`.
- Make a missing zone loud downstream (empty header, 400), never quiet.

## Gateway: Don't

- Don't default to London or UTC, in code, config, helm values or tests.
- Don't forward a client-supplied `Intowork.*` header.
- Don't read the zone from the request body or query string.
- Don't use `AddClaim` where `ReplaceClaim` is needed.
- Don't add comments.

## Gateway: Mistakes this work already fixed

- The Gateway used to send London when the team had no zone, which hid zone-less teams and moved their day
  boundaries; it now sends an empty zone and logs a warning once per team.


# Part 4: Front-end apps (Frontend, HandoverApp, InspectionsApp)

The three apps share the same kit in `src/app/shared/time/`. The text below is the Frontend copy; the wiring that differs per app follows it.

## The rule

Every team has one IANA time zone, one date format and one time format. The app shows and builds **team time**,
whatever zone the device is in. The API speaks **UTC**. The device zone is never used for display, for "today", or
for conversion; `deviceZone()` in `time-core.ts` exists only so the date field can warn the user when their device
zone differs from the team's. The backend never guesses a zone either (it answers 400 when the Gateway cannot supply
one), so the app must not hide that by inventing one.

## Where it lives

All of it is in `Frontend/src/app/shared/time/` (import as `src/app/shared/time/...`).

| Folder / file | What it is |
|---|---|
| `core/time-core.ts`, `core/time-core.types.ts` | Pure functions, no Angular: `isValidZone`, `utcToTeamWallClock`, `resolveTeamWallClock`, `teamWallClockToUtc`, `toApiString`, `parseApiString`, `parseCalendarDay`, `formatCalendarDay`, `calendarDayParts`, `localDate`, `calendarDateToApiString`, `formatInZone`, `formatCalendarDayAs`, `formatWallClock`, `offsetMinutesAt`, `formatUtcOffset`, `deviceZone`, `isDeviceZoneDifferent`. Types: `ZoneId`, `CalendarDay` (`yyyy-MM-dd`), `Instant`, `WallClock`, `ResolvedWallClock` |
| `settings/team-time.service.ts` | `TeamTimeService` (root singleton): loads the team's settings, exposes `settings`, `settings$`, `zone`, `dateFormat`, `timeFormat`, `loaded$`, `toTeamDate`, `toUtcDate`, `teamNow`, `reload`, `refresh`, and the static `TeamTimeService.active` that the plain helper functions read |
| `settings/team-time-settings.ts` | `DATE_FORMATS`, `TIME_FORMATS`, `TEAM_TIME_DEFAULTS`, `normalizeTeamTimeSettings`, `patternForFormatName` (names such as `date`, `dateTime`, `time`, `weekdayDate`, `dateLong`, `monthYear`) |
| `settings/team-time-ready.guard.ts` | `teamTimeReadyGuard`: a route guard that waits for `loaded$` |
| `conversion/from-api.ts` | API to app: `teamDate`, `calendarDay`, `asTeamDate`, `asTeamDay`, `asLocalDateTime` |
| `conversion/to-api.ts` | App to API: `utcDate` |
| `conversion/team-time-conversion.ts` | `teamNow`, `teamIso`, `teamDayText`, `isTeamToday`, `isTeamTomorrow`, `isTeamDayBeforeToday`, `isTeamPast`, `isTeamFuture`, `activeTeamTime` |
| `display/team-date-formatter.service.ts` | `TeamDateFormatter`: `format(value, name)`, `formatDay(day, name)`, `pattern(name)` |
| `display/team-date.pipe.ts` | `teamDate` pipe (standalone, impure) |
| `display/date-time/`, `display/date-time-message/` | `<app-date-time [value] [kind] [format]>` and the message variant |
| `input/date-time-field/` | `<app-date-time-field>`, a `ControlValueAccessor` date / date-time picker that shows the device-zone warning |
| `input/team-format-date-adapter.ts` | `TeamFormatDateAdapter` (Material `DateAdapter`) and `TEAM_DATE_FORMATS` |
| `time-kit.module.ts` | `TimeKitModule`: exports the components and the pipe, and activates `TeamTimeService` |

**Wiring in this app**

- `src/app/app.config.ts` activates the service with `provideEnvironmentInitializer(() => inject(TeamTimeService).activate())` and provides `{ provide: DateAdapter, useClass: TeamFormatDateAdapter }` together with `TEAM_DATE_FORMATS`.
- `TeamTimeService` reloads whenever `TeamContextService.resolvedTeam$` changes (switching team), so settings always follow the selected team (`X-Selected-Team` is sent by `src/app/auth/team-header-interceptor.ts`).
- `teamTimeReadyGuard` is on the protected routes in `src/app/routes.ts` and `src/app/layout/layout-routes.ts`.
- Examples to copy: models that call `teamDate(...)` in constructors (`src/app/activework/project-report-models.ts`), request bodies that call `utcDate(...)` (`src/app/activework/activework.service.ts`, `handover.service.ts`), and `TeamDateFormatter` injected as `dateFormatter` in `activework.service.ts`.
- Older code still has `| date`, `toLocale*String` and `new Date()`; migrate it when you touch it. The principle in `CLAUDE.md` (one derivation, everywhere) applies: extend `shared/time`, do not write a second date helper.

## Concepts

- **UTC instant**: what the API sends and receives, an ISO string ending in `Z` or `+HH:mm` (`2026-07-06T13:30:00Z`).
- **Calendar day**: a date with no time and no zone, `yyyy-MM-dd` (`CalendarDay`). It is a label, not an instant. Never
  turn it into an instant by `new Date('2026-07-06')` (that is midnight UTC, which is the wrong day in many zones).
- **Team date**: a JS `Date` whose **local fields** (`getFullYear()`, `getHours()`, ...) read as the team's wall clock.
  `TeamTimeService.toTeamDate` builds it from an instant, and remembers the original instant in a `WeakMap` so
  `toUtcDate` can give back the exact instant if the date has not been edited (this keeps the repeated hour of a
  daylight-saving overlap intact). `copyTeamDate` and `asTeamDate(date)` keep that memory when you clone; `new Date(date)` does not.
- **Team settings**: loaded from the Gateway route `api/teamsettings` and normalised by `normalizeTeamTimeSettings`. The
  placeholder `TEAM_TIME_DEFAULTS` in `team-time-settings.ts` is only the starting value before the load finishes or when the
  call fails; do not use it as a data source, and do not copy its zone anywhere else.

## Receiving dates from the API

- `parseApiString(value)` accepts only a string that has `T` at index 10 and ends with `Z` or an offset like
  `+01:00`. Anything else returns `null`. So an API date-time **must be a UTC instant with a marker**; a bare
  `2026-07-06T13:30:00` is not accepted. `teamDate` leaves such a string untouched and logs a dev warning, and
  `asTeamDate` returns an invalid `Date`.
- `teamDate(value)`: for model constructors. A UTC string becomes a team `Date`; non-strings and unparseable strings are
  returned as they are. Typical use: `this.opDate = teamDate(data.opDate)`.
- `asTeamDate(value)`: for code that needs a `Date` for a `Date | string | number`. A `yyyy-MM-dd` becomes local midnight of
  that calendar day, an instant becomes a team date, a `Date` is copied with its memory, a number is a plain `Date`, and
  nothing/unknown is an invalid `Date` (`NaN`) with a dev warning.
- `asTeamDay(value)`: for **day-only** values. It accepts a `yyyy-MM-dd` or an instant and returns local midnight of the
  **calendar day**; for an instant string it takes the UTC calendar date (`calendarDay`), so only use it for values the
  API sends as a day (an instant at the start of the team day is not a day label).
- `asLocalDateTime(value)`: for `yyyy-MM-ddTHH:mm[:ss]` strings **without** a marker that mean team wall-clock time
  (no conversion; builds the local `Date` directly).
- `calendarDay(value)`: returns the `CalendarDay` string for a day string or an instant, or `null`.

## Sending dates to the API

- Dates the user picked are team dates. Convert them with `utcDate(value)` (`conversion/to-api.ts`) in the request body;
  it returns the exact UTC `Date` (HttpClient then serialises it with `toISOString()`).
- To build a string yourself use `teamIso(teamDate)` (throws `TypeError` on an invalid `Date`), or
  `calendarDateToApiString(day, zone)` to get the UTC instant at which a team calendar day starts.
- Day-only fields that the API stores as a day send the `yyyy-MM-dd` (`teamDayText(date)`), not an instant.
- A wall-clock time that falls in a daylight-saving gap is moved forward in 30-minute steps; one in an overlap picks the
  first occurrence. `resolveTeamWallClock(input, zone)` returns `status: 'valid' | 'gap' | 'ambiguous'` so a form can warn.
  The backend `ToUtc` does the same, so both sides agree.

## "Now", "today" and comparisons

- `teamNow()` is the current time as a team date. Never `new Date()` for "now" in app logic.
- `teamDayText(value)` returns the team calendar day (`yyyy-MM-dd`) of a `Date`, day string or instant, or `''`.
- `isTeamToday`, `isTeamTomorrow`, `isTeamDayBeforeToday` compare team calendar days. `isTeamPast` and `isTeamFuture`
  compare instants against `teamNow()` (they accept a `Date`, string or epoch number). Use these instead of comparing
  `getTime()` or `toDateString()` of device-zone dates.
- To move by days, do it on a team date or on the day string, not by adding 24 hours of milliseconds.

## Showing dates

- Template: `{{ value | teamDate }}` or `{{ value | teamDate:'dateTime' }}`; the format name comes from
  `patternForFormatName` (`date`, `dateTime`, `time`, `dateLong`, `weekdayDate`, `monthYear`, ...). A third argument is a
  per-value zone for the rare case a screen shows another zone. Import `TimeKitModule` (or `TeamDatePipe` in a standalone component).
- Component: `<app-date-time [value]="x" [kind]="'instant'|'calendar'" [format]="'date'">`; it re-renders when the team's
  settings change.
- Code: inject `TeamDateFormatter` (conventionally as `dateFormatter`) and call `dateFormatter.format(value, 'date')` or
  `formatDay(day, 'date')` for text in messages, toasts, exports and PDFs. `dateFormatter.pattern('date')` gives the
  pattern string for a mask or placeholder.
- Input: `<app-date-time-field>` with `mode` (`date` or `dateTime`) and `valueAs`. Angular Material datepickers use
  `TeamFormatDateAdapter`, so typed text follows the team's date format and "today" is the team's today.
- Always go through these. They read the team's zone and formats from `TeamTimeService`.

## Do

- Use `teamDate` / `asTeamDate` / `asTeamDay` for what you read, `utcDate` / `teamIso` for what you send.
- Keep day-only values as `yyyy-MM-dd` strings until you must make a `Date`.
- Use `teamNow()`, `isTeamToday`, `isTeamPast`, `isTeamFuture` for "now" logic.
- Use `TeamDateFormatter`, the `teamDate` pipe or `<app-date-time>` for display.
- Wait for the settings (`teamTimeReadyGuard`, or `TeamTimeService.loaded$`) before logic that needs the zone.
- Put a new date rule in `shared/time` once and call it everywhere.

## Don't

- Don't use the device zone: no `getTimezoneOffset()`, `Intl.DateTimeFormat().resolvedOptions().timeZone`,
  `toLocaleDateString()` / `toLocaleTimeString()` for team time, or `new Date()` / `Date.now()` as "now".
- Don't use Angular's `DatePipe` / `| date` or `formatDate` on API values; they use the browser zone.
- Don't call `new Date('yyyy-MM-dd')` or `new Date('yyyy-MM-ddTHH:mm:ss')` on API data.
- Don't send a team date to the API without `utcDate` / `teamIso`.
- Don't hard-code `Europe/London` (or any zone), or `dd/MM/yyyy`, in a component; read it from `TeamTimeService`.
- Don't clone a team date with `new Date(date)` when you will convert it back; use `asTeamDate(date)`.
- Don't add comments.
- When you touch a file that still uses a device-zone call, move that call to the helpers in the same change.

## Common mistakes this work already fixed

- A day-only API value shown a day early or late because it was parsed as UTC midnight in the device zone.
- "Today" and "overdue" computed from the device date, so a user in another zone saw the wrong day.
- Dates sent as local device times, so the saved instant was off by the zone difference (and by an hour around daylight-saving changes).
- A date picker that showed the device "today" and a fixed format instead of the team's.
- An API string without `Z` or an offset silently parsed in the device zone; the helpers now refuse it (dev warning).
- Editing a date that was in a daylight-saving overlap changed the instant by an hour; `TeamTimeService` now keeps the original UTC when the value is untouched.

## Tests

- Specs in `shared/time` are Karma/Jasmine (`ng test`); `input/date-time-field/field-value.spec.ts` is the example for pure functions.
- Test conversion code against at least two zones and a daylight-saving gap and overlap (`resolveTeamWallClock`). Build
  the settings object explicitly; do not rely on the machine's zone.


## Wiring in Frontend

- `src/app/app.config.ts` activates the service with `provideEnvironmentInitializer(() => inject(TeamTimeService).activate())` and provides `{ provide: DateAdapter, useClass: TeamFormatDateAdapter }` together with `TEAM_DATE_FORMATS`.
- `TeamTimeService` reloads whenever `TeamContextService.resolvedTeam$` changes (switching team), so settings always follow the selected team (`X-Selected-Team` is sent by `src/app/auth/team-header-interceptor.ts`).
- `teamTimeReadyGuard` is on the protected routes in `src/app/routes.ts` and `src/app/layout/layout-routes.ts`.
- Examples to copy: models that call `teamDate(...)` in constructors (`src/app/activework/project-report-models.ts`), request bodies that call `utcDate(...)` (`src/app/activework/activework.service.ts`, `handover.service.ts`), and `TeamDateFormatter` injected as `dateFormatter` in `activework.service.ts`.
- Older code still has `| date`, `toLocale*String` and `new Date()`; migrate it when you touch it. The principle in `CLAUDE.md` (one derivation, everywhere) applies: extend `shared/time`, do not write a second date helper.

## Wiring in HandoverApp

- `TeamTimeService` takes the team from `ExternalUserTokenService.user$` (`user.team`) instead of `TeamContextService`.
- `TimeKitModule` is imported by `src/app/handover/handover.module.ts`; that import is what activates `TeamTimeService`. A module that uses the helpers must be loaded after that, or `activeTeamTime()` returns `null` and (in dev mode) logs "TeamTimeService is not ready".
- `teamTimeReadyGuard` exists in `shared/time/settings/` but is not on any route yet; if a screen needs the zone at first render, add it to that route.
- Settings come from `getGatewayUrlForService('teamsettings')` in `src/app/shared/app-settings.service.ts`.
- Examples: `src/app/handover/handover.ts` (`teamDate(...)` in the model constructor), `handover.service.ts`, `attendance/attendance.service.ts`, `handover/signoff-info-step/signoff-info-step.component.ts`.

## Wiring in InspectionsApp

- `TeamTimeService` takes the team from `ExternalUserService.user$` (`user.team`) instead of `TeamContextService`.
- `TimeKitModule` is imported by `src/app/app.module.ts` and `src/app/shared/shared.module.ts`; that activates `TeamTimeService`.
- `teamTimeReadyGuard` exists in `shared/time/settings/` but is not on any route yet.
- Settings come from `getGatewayUrlForService('teamsettings')` in `src/app/shared/app-settings.service.ts`; `src/app/shared/team-settings.ts` and `team-settings.service.ts` are the app's older team-settings copy, not the time source.
- Inspection answers: date answers are converted with `utcDate(answer.dateAnswer)` and attachment capture times are sent with `teamIso(...)` in `src/app/inspection/hands-inspection/hands-inspection.service.ts`; `teamNow()` stamps `inspectionStart` and `raisedDate`. `src/app/inspection/steps/hands/date-entry/date-entry.component.ts` checks a date answer against the team's now.
