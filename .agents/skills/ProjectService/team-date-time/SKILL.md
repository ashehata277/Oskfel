---
name: team-date-time
description: >
  How to handle dates, times and time zones in ProjectService. Use whenever reading or writing a date or time,
  computing "today", a day range, a deadline, a reminder time, a report or email timestamp, registering a recurring
  job, writing an event handler that touches dates, or writing a test for any of these. Also trigger on
  Intowork.Common.Time, IDateTimeProvider, DateTimeProvider, UseTeamAsync, TimeProvider, ScopedEventHandler,
  RunEachEventInItsOwnScope, ITeamCopyReader, TeamZones, TeamFormats, UtcWindow, DayRangeUtc, DaysRangeUtc,
  StartOfDayUtc, TeamTimeUnavailableException, TeamTimeHeaderMissingException,
  AddTeamTimeByTeamName, Intowork.TeamTimeZone, DateTime.Now, DateTime.Today, TimeZoneInfo, "time zone",
  "timezone", "UTC", "London" or "daylight saving".
---

# Team date and time (ProjectService)

This skill is the single reference for how `ProjectService` treats dates and times. The rule and the kit are shared by all Intowork services through the `Intowork.Common.Time` NuGet package; the section below lists how this repository uses it, followed by the full rules.

## This service

**Kit location:** the `Intowork.Common.Time` NuGet package (source and pipeline in
`CommonLibs/Intowork.Common.Time`), referenced by `Intowork.Core` and by the isolated `Intowork.Jobs.Customer.Core` module.
Each folder is its own namespace; import only the ones a file uses. Never copy kit code back into this repository;
change the package and bump its version.

| Namespace | Types |
|---|---|
| `Intowork.Common.Time.Clock` | `IDateTimeProvider`, `UtcWindow`, `DateTimeProvider` |
| `Intowork.Common.Time.Formats` | `TeamFormats` (team date and time formats, defaults, `a` → `tt`) |
| `Intowork.Common.Time.Zones` | `TeamZones`, `TeamTimeUnavailableException`, `TeamTimeHeaderMissingException` |
| `Intowork.Common.Time.Requests` | `IRequestInfo`, `HeaderRequestInfo`, `TeamHeaders`, `TeamTimeHeaderMissingFilter`, `UtcDateTimeJsonConverter`, `TeamHeadersForwardingHandler` |
| `Intowork.Common.Time.Teams` | `ITeamCopyReader`, `TeamTimeSettings` |
| `Intowork.Common.Time.Mongo` | `MongoDateParts` |
| `Intowork.Common.Time.Calendar` | `CalendarDays` (`WeekStart`, `AddBusinessDays`, `IsWeekend`) |
| `Intowork.Common.Time.DependencyInjection` | `AddTeamTimeByTeamName` |

Most application code needs only `using Intowork.Common.Time.Clock;`.

**One clock:** all application code injects `IDateTimeProvider`, and nothing else. It has exactly one implementation,
`DateTimeProvider`, which decides where the team zone comes from. `TimeProvider` is internal to the package;
`ClockUsageTests` fails the build if it appears in this repository's production code.

**Registration and team copy**

- Wiring: `AddTeamSettingsTime()` in `Intowork.Core/Extensions/ProjectTeamTimeServiceCollectionExtensions.cs` calls
  `AddTeamTimeByTeamName<TeamsRepoTeamCopyReader>()`; called from `Intowork.Jobs.API/Program.cs` and
  `Intowork.Jobs.BackgroundService/Program.cs`. The Background host ends its registration chain with
  `.RunEachEventInItsOwnScope()` (`Intowork.Jobs.BackgroundService/Events/Scoping/`), which must stay last so every
  handler registered before it runs in its own DI scope.
- Reader: `Intowork.Core/Repositories/TeamsRepoTeamCopyReader.cs` over `ITeamsRepo.GetTeamAsync`, returning the
  team's zone, date format and time format.
- Seeding: `Intowork.Jobs.API/Seed/DataSeeder.cs` creates the `default` team with a zone constant and the
  date/time formats, and `TeamsRepo.CreateTeam` takes a `timeZone` (formats default through `ApplyDefaults`).
  The master team is seeded with a zone and formats. Both seeder `TeamUpdated` events copy `TimeZone`,
  `DateFormat` and `TimeFormat`.

**Background and by-name work**

- Event handlers inject `IDateTimeProvider` like any other class. The Common.Messaging event bus resolves handlers
  from the root provider, so `RunEachEventInItsOwnScope()` replaces each handler registration with
  `ScopedEventHandler<TEvent, THandler>`, which opens a DI scope per message and builds the real handler inside it.
  It knows nothing about teams: a handler that needs the team zone sets it itself with `UseTeamAsync`.
- Hosted services and other singletons open a plain scope with `IServiceScopeFactory.CreateAsyncScope()` when they
  only need `UtcNow` (see `IntegrationEventPublisherService`, and the seed scope in `JobsStartupExtensions`).
- Many repository methods have `...ForTeamAsync` in their names (for example `ItemsRepo`, `QuotationsRepo`,
  `MaterialsRepo`); that is the team-name argument, not a clock lookup. Day and month windows are built from the
  injected clock, for example `TeamMonthWindow.Of(IDateTimeProvider clock, DateTime instant)` in
  `Intowork.Core/Extensions/TeamMonthWindow.cs`, and `FilterAndSortExtension` for date filters.

**Request routes**

- `FilterAndSortExtension.ApplyFilters(..., IDateTimeProvider clock)` (`Intowork.Core/Extensions/`) is where list-filter dates are
  converted for team time; new date filters go through it rather than reading `.Date` on a UTC value.

**Tests**

- `Intowork.Core.Tests/Time/TeamTimeRegistrationTests.cs` calls `AddTeamSettingsTime()` on a real container.
  `Intowork.Core.Tests/Time/TeamScopedClockTests.cs` covers `UseTeamAsync` (zone per scope, set once, failures).
  `Intowork.Jobs.BackgroundService.Tests/Events/ScopedEventHandlerTests.cs` checks each message gets its own clock,
  every handler is registered and wrapped, and that `Program.cs` wraps last.
  `Intowork.Architecture.Tests/Time/ClockUsageTests.cs` bans the static clock and `TimeProvider` in production code.
- Tests that only need the current instant pass `TestClocks.WithoutTeam` (in each test project's `Support/`), which is
  a `DateTimeProvider` with no team and no request: `UtcNow` works and any zone member throws.
  `Intowork.Core.Tests` also has `TestClocks.InZone(timeProvider, zone)` for a fixed-zone clock (a test `IRequestInfo` returning that zone).
  `Intowork.Core.Tests/Extensions/FilterAndSortExtensionDateTests.cs` covers the date filters.
- Other projects: `Intowork.Jobs.API.Tests`, `Intowork.Jobs.BackgroundService.Tests`, `Intowork.Jobs.Customer.Core.Tests`,
  `Intowork.Architecture.Tests`, `Intowork.Projects.Integration.Tests`.
- Building needs `Intowork.Common.Data` and `Intowork.Common.Time` (referenced by `Intowork.Core`) from the private feed; if it returns 401, pack `CommonLibs` into a scratch
  local feed rather than touching the real NuGet cache.

`global.json` in `ProjectService/` opts into Microsoft.Testing.Platform, so run tests from inside `ProjectService/` with `dotnet test --solution Intowork.Jobs.API.sln`.


## The rule in one paragraph

Every team in Intowork has exactly one IANA time zone (plus a date format and a time format). A request learns
its team's zone **only** from the `Intowork.TeamTimeZone` header that the Gateway injects. Background work
(event handlers, scheduled jobs, hosted services) has no request, so it looks the team up **by name** in this
service's own copy of the teams. If the zone cannot be found the code **fails**. There is no London fallback, no
UTC fallback, and no "device zone" anywhere. Everything stored and sent over the wire is UTC; the zone is only
used to decide which calendar day an instant belongs to and to turn a team wall-clock time back into UTC.

## The kit

The time kit is the `Intowork.Common.Time` package (namespaces `Intowork.Common.Time.*`, one per folder).
ProjectService is the first service on it and on the single-clock design (`DateTimeProvider`, `UseTeamAsync`,
`ScopedEventHandler`); the other services still carry their own `Time/` copy with `RequestDateTimeProvider`,
`TeamDateTimeProvider` and `ITeamClocks` until they move to the package. Do not add a second `IDateTimeProvider`
implementation or a second clock abstraction.

| Type | What it is |
|---|---|
| `TeamHeaders` | `TimeZone = "Intowork.TeamTimeZone"`, `DateFormat = "Intowork.TeamDateFormat"`, `TimeFormat = "Intowork.TeamTimeFormat"`, plus `TeamName`, `StaffMemberId` and the `Forwarded` list |
| `IRequestInfo` / `HeaderRequestInfo` | `TimeZone` and `Formats` of the current request. `TimeZone` throws `TeamTimeHeaderMissingException` when the header is missing or not a known zone; `Formats` falls back to the defaults. Both throw `TeamTimeUnavailableException` when read outside a request |
| `IDateTimeProvider` | The only clock application code injects. `UtcNow`, `TeamNow`, `TeamToday`, `Zone`, `Formats`, `ToTeamTime`, `ToUtc`, `DayOf`, `StartOfDayUtc`, `DayRangeUtc`, `DaysRangeUtc`, `FormatDate`, `FormatTime`, `FormatDateTime` |
| `DateTimeProvider` | The **only** `IDateTimeProvider`, registered scoped. Holds all the maths. `UtcNow` never needs a zone. **Lazy**: on the first zone member it decides where the zone comes from: the team set with `UseTeamAsync`, otherwise the request header (400 if missing), otherwise it throws `TeamTimeUnavailableException`. `UseTeamAsync(teamName, token)` looks the team up through `ITeamCopyReader` (resolved from the scope when called, so `TeamsRepo` can still inject the clock), validates the zone with `TeamZones.Find`, and throws `TeamTimeUnavailableException` for no name, an unknown team or an invalid zone. The team zone lives in a private field: set once, and only before any zone member is read. Constructor: `(TimeProvider, IRequestInfo, IServiceProvider)` |
| `ITeamCopyReader` | The service's one adapter to its own copy of the teams. Returns `TeamTimeSettings(TimeZone, DateFormat, TimeFormat)` or `null` |
| `TeamZones` | `TeamZones.Find(zoneId)` returns a cached `TimeZoneInfo?`. The only place a zone id is validated |
| `TeamFormats` | `TeamFormats(DateFormat, TimeFormat)`. `DefaultDateFormat = "dd/MM/yyyy"`, `DefaultTimeFormat = "HH:mm"` (used by `TeamTimeRules` when saving team settings), `Of(date, time)` applies the defaults, and formatting turns the team's `a` into .NET `tt`. Formats only, never a zone |
| `TeamHeadersForwardingHandler` | `DelegatingHandler` that copies the forwarded team headers onto an outgoing `HttpClient` call to another Intowork service |
| `MongoDateParts` | `$dateToString`, `$dateToParts`, `$dayOfWeek`, `$dayOfMonth`, `$month`, `$year` aggregation stages in the team zone |
| `CalendarDays` | `WeekStart(day)`, `AddBusinessDays(day, n)`, `IsWeekend(day)` on `DateOnly` |
| `TeamTimeHeaderMissingFilter` | MVC exception filter that turns `TeamTimeHeaderMissingException` into a 400 `ProblemDetails` titled "Team time zone required" |
| `TeamTimeUnavailableException` | Background lookup failed. `TeamTimeHeaderMissingException` derives from it |
| `UtcWindow` | `readonly record struct UtcWindow(DateTime From, DateTime To)`, a half-open `[From, To)` range |
| `UtcDateTimeJsonConverter` | Registered by `AddTeamTimeByTeamName` on MVC `JsonOptions`; reads and writes every `DateTime` as UTC |

## Requests

- The zone comes from `Intowork.TeamTimeZone` and nowhere else. Never read it from the body, query string, a
  team lookup, or a constant.
- A missing header, an empty header, or an id `TimeZoneInfo` does not know throws
  `TeamTimeHeaderMissingException`; `TeamTimeHeaderMissingFilter` turns it into **400**. Do not catch it in a
  controller or handler, and do not turn it into a default zone.
- Inject `IDateTimeProvider`. It is **lazy**, so a handler that only needs `UtcNow` works on a route that has no
  header. The 400 appears the first time the code touches `TeamNow`, `Zone`, `ToTeamTime`, `DayOf`,
  `StartOfDayUtc` or `DayRangeUtc`. Keep it lazy: never read `Zone` in a constructor "to be
  safe", or every route gains a hard header requirement.
- Dates sent to the front end stay UTC; it formats them. When the backend itself writes text with a date (reports,
  e-mails, exports), use `clock.FormatDate` / `FormatTime` / `FormatDateTime`, which use the team formats from the
  `Intowork.TeamDateFormat` / `Intowork.TeamTimeFormat` headers or from the team set with `UseTeamAsync`.
- Never use `DateTime.Now`, `DateTime.Today`, `DateTimeOffset.Now`, `TimeZoneInfo.Local` or a literal zone id such
  as `"Europe/London"` in production code. Inject `IDateTimeProvider`.

```csharp
public sealed class GetTodayHandler(IDateTimeProvider clock, IThingsRepo things)
{
    public Task<IReadOnlyList<Thing>> HandleAsync(string teamName, CancellationToken token)
    {
        var window = clock.DayRangeUtc(clock.DayOf(clock.UtcNow));
        return things.GetBetweenAsync(teamName, window.From, window.To, token);
    }
}
```

## Background work

Event handlers, hosted services and startup code have no `HttpContext`. They still inject `IDateTimeProvider`; the
team comes from the scope they run in.

**Event handlers** run in their own scope per message. A handler whose code path reads the zone (directly or
through a service or repository it calls) sets the team first, taking the team name from the event however that
event names it:

```csharp
public sealed class ThingHappenedHandler(IDateTimeProvider clock, IThingsRepo things)
    : IIntegrationEventHandler<ThingHappened>
{
    public async Task Handle(ThingHappened @event, CancellationToken token)
    {
        await clock.UseTeamAsync(@event.Teamname, token);
        await things.RecordDayAsync(@event.ThingId, clock.DayOf(@event.HappenedAt), token);
    }
}
```

- A handler that only needs `UtcNow` does not call `UseTeamAsync`.
- `UseTeamAsync` throws `TeamTimeUnavailableException` for no team name, an unknown team or a team without a valid
  zone. Let it propagate so the message is retried and eventually dead-lettered. Never catch it and carry on with a
  guessed zone.
- Call it once per message, before any zone member and **before** the handler commits its transaction or records the
  event as handled. Calling it again, or after a zone member was read, throws `InvalidOperationException`.
- A handler that forgets it fails loudly on the first zone read (no team, no request), never with a wrong zone.
  Reviews catch it with the checklist below.
- A handler must handle exactly one event type; `RunEachEventInItsOwnScope` refuses one that implements two.
- Today no ProjectService event handler reads a zone; every zone read is on API request paths.

**Singletons and hosted services** open a plain scope with `IServiceScopeFactory.CreateAsyncScope()` and resolve the
worker inside it; that scope has no team, so only `UtcNow` works. Never inject a repository or `IDateTimeProvider`
straight into a singleton: the clock is scoped. To work for one team, open a scope, resolve `IDateTimeProvider` from
it and call `UseTeamAsync` (one scope per team in a loop, catching `TeamTimeUnavailableException` per team).

## Registration

| Call | Use when |
|---|---|
| `services.AddTeamTimeByTeamName<TTeamCopyReader>()` | The one registration call. Registers `IHttpContextAccessor`, `TimeProvider.System`, `IRequestInfo` and the scoped `IDateTimeProvider` (`DateTimeProvider`), `TeamTimeHeaderMissingFilter` on MVC, `UtcDateTimeJsonConverter` on JSON, and `ITeamCopyReader` (transient) |
| `services.RunEachEventInItsOwnScope()` | Lives in `Intowork.Jobs.BackgroundService`, not the kit. Call it **last**; it wraps every `IIntegrationEventHandler<T>` registration added before it |

Registration uses `TryAdd` / `Replace`, so calling it twice is safe. The reader must stay a
thin mapping from the team document to `TeamTimeSettings`; it returns `null` for an unknown team and never
supplies a default zone.

Both `TeamCreated` and `TeamUpdated` events carry `TimeZone`, `DateFormat` and `TimeFormat`. A service that keeps a
team copy must copy all three fields in both handlers, otherwise the team lookup cannot resolve the team. The data
backfill is `oskfel-migrations/team-time/2026-10-12_backfill_team_time_defaults.js`.

## Day maths

All storage is UTC. A "day" is a team calendar day, which is not a 24-hour block of UTC.

| Need | Use |
|---|---|
| Which team day an instant falls on | `clock.DayOf(utc)` returns a `DateOnly` |
| Today in the team | `clock.TeamToday` |
| UTC instant at which a team day begins | `clock.StartOfDayUtc(day)` |
| Range for querying a team day | `clock.DayRangeUtc(day)` returns `UtcWindow(From, To)`; query `>= From && < To` |
| Instant to display or compare in team time | `clock.ToTeamTime(utc)` |
| A range of several days | `clock.DaysRangeUtc(first, last)` |
| Team wall-clock time to store | `clock.ToUtc(teamLocal)` |

`StartOfDayUtc` turns a team-local midnight into UTC and handles daylight-saving edges deterministically:

- **Gap** (clocks jump forward, the local time does not exist): the local time is moved forward in 30-minute
  steps until it is valid, so `01:30` on the spring-forward day becomes `02:00` local.
- **Overlap** (clocks fall back, the local time happens twice): the **first** occurrence (the earlier instant,
  with the larger offset) is chosen.
- Anything else converts normally.

Day length is 23, 24 or 25 hours on transition days. Never write `AddDays(1)` on a UTC instant to mean "the next team
day", never subtract `24h`, and never compare `.Date` of a UTC value with a team date. Add days to the `DateOnly`
and convert it with `StartOfDayUtc`.

Persist `DateTime` values with `DateTimeKind.Utc`. Do not store team-local times, offsets or strings that need the
zone to be understood.

## Tests

- **Registration tests**: `TeamTimeRegistrationTests` and `TeamScopedClockTests` build the real container with
  `ValidateScopes` and `ValidateOnBuild`. Keep them green when you touch registration or lifetimes.
- **A class under test that only needs the instant**: pass `TestClocks.WithoutTeam`.
- **A class under test that needs a team day**: pass `TeamClockSupport.At("Europe/London", "2026-03-29T23:30:00Z")`
  (`TestClocks.InZone` over `FixedTimeProvider`), or `TeamClockSupport.InLondon()`.
- **Request clock**: build a `HeaderRequestInfo` over a `DefaultHttpContext` with the header set and pass it to
  `new DateTimeProvider(TimeProvider.System, request, new ServiceCollection().BuildServiceProvider())`. For the failure case, assert that
  `Zone` (or another zone member) throws `TeamTimeHeaderMissingException`, and that `UtcNow` still works.
- **Event handlers end to end**: register the handler, call `RunEachEventInItsOwnScope()`, resolve it from the
  root provider the way the bus does, and cast it to `IIntegrationEventHandler<TEvent>` (see `ScopedEventHandlerTests`).
  Stub `ITeamsRepo` (or `ITeamCopyReader`); do not mock `IDateTimeProvider` with a made-up zone, because that hides
  the failure paths.
- Assert the throw when a **zone member is used**, not when the clock or scope is created.
- Cover the failure cases: team not found (`null` settings), team with a null or invalid zone, and no team name.
  Cover a DST gap and a DST overlap for any day-boundary code.
- Never write a test that expects a default zone for a missing one.


## Reviewer checklist

Check these on every change that touches an event handler or a zone member:

- The handler's path reads a zone member (`Zone`, `TeamNow`, `ToTeamTime`, `DayOf`, `StartOfDayUtc`, `DayRangeUtc`),
  directly or through a service or repository it calls → it calls `await clock.UseTeamAsync(team, token)` first.
- `UseTeamAsync` runs before any commit or "mark handled" step, once per message, with the team from the event,
  never a constant or a guessed team, and its exception is not caught.
- A handler that does not read the zone does not call `UseTeamAsync`.
- No team interface on events, no team-aware wrapper, no second clock implementation.

## Do

- Inject `IDateTimeProvider` everywhere: requests, event handlers, repositories, services.
- Open a scope from any singleton or hosted service before resolving scoped services.
- Use `TeamZones.Find` for every zone validation; use `DayRangeUtc` / `StartOfDayUtc` for day boundaries.
- Keep the clock lazy and resolve it only when the team-zone value is needed.
- Read the team zone before commit or mark-handled, and let `TeamTimeUnavailableException` propagate.
- Store UTC, send UTC, and let the front end convert for display.
- Add a test for the failure path of anything new that reads a zone.

## Don't

- Don't add a London, UTC or "default team" fallback, not even "just for tests" in production code.
- Don't call `TimeZoneInfo.FindSystemTimeZoneById` / `TryFindSystemTimeZoneById` yourself; use `TeamZones.Find`.
- Don't read `Intowork.TeamTimeZone` by hand from `HttpContext`; go through `IRequestInfo` / `IDateTimeProvider`.
- Don't send the team headers to outside services (images, Google). ProjectService calls no other Intowork service
  over HTTP; if it ever does, forward the team headers on that client only.
- Don't use `DateTime.Now`, `DateTime.Today`, `TimeZoneInfo.Local`, `DateTime.UtcNow` for team-day logic.
- Don't add a time-zone field to an event just to avoid the lookup; the event carries the team name.
- Don't catch `TeamTimeUnavailableException` in an event handler and mark the event handled.
- Don't inject `TimeProvider` outside the kit, and don't inject `IDateTimeProvider` (or a repository
  that uses it) into a singleton or hosted service; open a scope instead.
- Don't add a team interface to events or a team-aware wrapper; the handler sets its own team with `UseTeamAsync`.
- Don't add comments or a copy of the kit; change `Intowork.Common.Time` in CommonLibs instead.

## Mistakes this work already fixed

- A silent London fallback (`TimeZoneFallbackMeter`, `TeamZones` fallbacks, `LondonOnlyTeamCopyReader`,
  `TeamTimeDefaults.Zone`, `ITeamClocks.ForZoneId`): all removed. Do not bring them back under another name.
- Resolving the clock **after** `CommitTransactionAsync` or `AddHandledEventAsync`, so a retry was a no-op.
- Swallowing an exception in an event handler so a bad team never retried.
- A startup loop that stopped at the first team without a zone; it now catches per team.
- Reading `Zone` eagerly in a constructor or on a route that has no team-zone header.
- Two clocks for the same job: `TimeProvider` in 130 classes for the instant next to `IDateTimeProvider` for team
  time, `ITeamClocks` boilerplate in handlers, and two `IDateTimeProvider` implementations. Replaced by the single
  scoped `DateTimeProvider`.
- Treating a UTC `DateTime` as a team date (`utc.Date`, `AddDays(1)` on UTC).
- Zone-less teams in seed data and test fixtures. Seeders now give every team a zone and both `TeamCreated` and
  `TeamUpdated` copy `TimeZone`, `DateFormat` and `TimeFormat`.

