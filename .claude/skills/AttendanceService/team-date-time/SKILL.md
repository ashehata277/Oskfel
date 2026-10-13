---
name: team-date-time
description: >
  How to handle dates, times and time zones in AttendanceService. Use whenever reading or writing a date or time,
  computing "today", a day range, a deadline, a reminder time, a report or email timestamp, registering a recurring
  job, writing an event handler that touches dates, or writing a test for any of these. Also trigger on
  IDateTimeProvider, ITeamClocks, ITeamZoneResolver, ITeamCopyReader, TeamZones, UtcWindow, DayRangeUtc,
  StartOfDayUtc, ToUtc, TeamTimeUnavailableException, TeamTimeHeaderMissingException, AddTeamTime,
  AddTeamTimeByTeamName, Intowork.TeamTimeZone, DateTime.Now, DateTime.Today, TimeZoneInfo, "time zone",
  "timezone", "UTC", "London" or "daylight saving".
---

# Team date and time (AttendanceService)

This skill is the single reference for how `AttendanceService` treats dates and times. The rule and the kit are shared by all Intowork services; the section below lists where they live in this repository, followed by the full rules.

## This service

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


## The rule in one paragraph

Every team in Intowork has exactly one IANA time zone (plus a date format and a time format). A request learns
its team's zone **only** from the `Intowork.TeamTimeZone` header that the Gateway injects. Background work
(event handlers, scheduled jobs, hosted services) has no request, so it looks the team up **by name** in this
service's own copy of the teams. If the zone cannot be found the code **fails**. There is no London fallback, no
UTC fallback, and no "device zone" anywhere. Everything stored and sent over the wire is UTC; the zone is only
used to decide which calendar day an instant belongs to and to turn a team wall-clock time back into UTC.

## The kit

The time kit in this service lives in `AttendanceService/Intowork.Attendance.Core/Time` (namespace `Intowork.TeamTime`). It is the same code in every Intowork
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

