# Team time: backend guide

Use `Intowork.Common.Time` for team dates and times. Pick the meaning first:

| Term | Meaning | Example |
|---|---|---|
| UTC timestamp | The exact moment something happened. `Z` means UTC. | Check-in: `2026-07-06T12:30:00Z` |
| Calendar day | A date without a time. It stays the same date everywhere. | Leave day: `2026-07-06` |
| Team time | What the clock shows in the team's timezone. | London `13:30` in July = `12:30Z` |
| Timezone | Rules for the team's local time, including seasonal clock changes. | `Europe/London` |

**Main rule:** store timestamps in UTC, show them in team time, and keep day-only values as days.

Examples assume `clock` is an injected `IDateTimeProvider`. Repository and worker names are examples; use your service's real classes.

## 1. Enable team time in a service

Add the `Intowork.Common.Time` package from the workspace NuGet feed, then register it:

```csharp
using Intowork.Common.Time.DependencyInjection;

services.AddTeamTime();
```

Use the package version supported by your service. Changing CommonLibs alone does not update deployed services.

## 2. Use the clock during an HTTP request

Inject the clock and read it inside your methods:

```csharp
using Intowork.Common.Time.Clock;

public sealed class AttendanceDates(IDateTimeProvider clock)
{
    public DateTime CheckInTimestamp() => clock.UtcNow;
    public DateOnly ReportDay() => clock.TeamToday;
    public DateTime CurrentTeamClock() => clock.TeamNow;
}
```

`UtcNow` is for storage. `TeamToday` is for “today” rules. `TeamNow` is for the team's current clock time.

## 3. Let the Gateway select the team

The client selects a team. The Gateway checks access and supplies its timezone and formats.

Example request selection:

```http
GET /attendance
X-Selected-Team: team-a
```

The Gateway supplies `Intowork.TeamName`, `Intowork.TeamTimeZone`, `Intowork.TeamDateFormat`, and `Intowork.TeamTimeFormat`. It replaces client-supplied `Intowork.*` headers.

## 4. Provide settings for background work

For background jobs, tell the clock how to load a team's settings:

```csharp
using Intowork.Common.Time.DependencyInjection;
using Intowork.Common.Time.Teams;

services.AddTeamTimeByTeamName<TeamCopyReader>();

public sealed class TeamCopyReader(ITeamsRepo teams) : ITeamCopyReader
{
    public async Task<TeamTimeSettings?> SettingsOfAsync(string teamName, CancellationToken token)
    {
        var team = await teams.GetTeamAsync(teamName, token);
        return team is null
            ? null
            : new TeamTimeSettings(team.TimeZone, team.DateFormat, team.TimeFormat);
    }
}
```

Use your real repository. Return null for an unknown team. Keep all three settings updated from team-created/team-updated events. Never replace a missing zone with a guessed one.

## 5. Initialize a message or scheduled job

Create a new DI scope (a separate set of services) for each message/team. Select the team before running the job:

```csharp
using Intowork.Common.Time.Clock;
using Microsoft.Extensions.DependencyInjection;

await using var scope = scopeFactory.CreateAsyncScope();
var clock = scope.ServiceProvider.GetRequiredService<IDateTimeProvider>();
await clock.UseTeamAsync(message.TeamName, token);
var worker = scope.ServiceProvider.GetRequiredService<AttendanceWorker>();
await worker.RunAsync(token);
```

The worker must use the clock from this scope. Select the team once; use a new scope for another team. Save settings updates before running calculations that need them. UTC-only jobs do not need team lookup.

## 6. Find the team day of a timestamp

Use a stored UTC timestamp to find its team date or clock time:

```csharp
var day = clock.DayOf(checkInUtc);
var localClock = clock.ToTeamTime(checkInUtc);
```

For a London team, `2026-07-06T23:30:00Z` belongs to `2026-07-07`. Do not use `checkInUtc.Date` for that rule.

## 7. Convert an entered team clock time to UTC

Convert a time entered on the team's clock before storing it:

```csharp
var entered = new DateTime(2026, 7, 6, 13, 30, 0, DateTimeKind.Unspecified);
var appointmentUtc = clock.ToUtc(entered);
```

For London this becomes `2026-07-06T12:30:00Z`. Pass team-clock fields to `ToUtc` and UTC fields to `ToTeamTime`. Do not convert an already-UTC timestamp again.

## 8. Filter one report day

Get the start of the team day and the start of the next day. Include the start, exclude the end:

```csharp
var window = clock.DayRangeUtc(new DateOnly(2026, 7, 6));
var rows = query.Where(x => x.TimestampUtc >= window.From && x.TimestampUtc < window.To);
```

For London, July 6 starts at `July 5, 23:00Z` and ends just before `July 6, 23:00Z`. Use this for attendance, reports, audit searches, dashboards, and exports.

## 9. Filter a week, month, or custom date range

Pass the first and last days you want to include:

```csharp
var window = clock.DaysRangeUtc(new DateOnly(2026, 7, 1), new DateOnly(2026, 7, 31));
var rows = query.Where(x => x.TimestampUtc >= window.From && x.TimestampUtc < window.To);
```

This includes all of July. Check that the last day is not before the first. Use `< window.To`, not `<=`. Do not build day ends with `23:59:59` or add a fixed 24 hours.

## 10. Keep calendar-only values unchanged

Use `DateOnly` for leave days, birthdays, and expiry days:

```csharp
using Intowork.Common.Time.Calendar;

var leaveDay = new DateOnly(2026, 7, 6);
var nextDay = leaveDay.AddDays(1);
var weekStart = CalendarDays.WeekStart(leaveDay);
var dueDay = CalendarDays.AddBusinessDays(leaveDay, 2);
```

July 6 stays July 6 everywhere. Weeks start Monday by default. Business days skip weekends, not holidays. If an older API encodes a day as UTC midnight, keep its date fields unchanged.

## 11. Handle daylight-saving changes

A day can be 23 or 25 hours when clocks change. Let the shared clock calculate it:

```csharp
var shortDay = clock.DayRangeUtc(new DateOnly(2026, 3, 29));
var elapsedHours = (shortDay.To - shortDay.From).TotalHours;
```

For London:

- March 29, 2026 has 23 hours; October 25 has 25 hours.
- Missing `March 29, 01:30` moves forward in 30-minute steps to `02:00` (`01:00Z`).
- Repeated `October 25, 01:30` chooses the first occurrence (`00:30Z`).

When saving an unchanged record, keep its original UTC timestamp.

## 12. Format text for reports, email, PDF, and audit output

Pass a UTC timestamp to the clock's display methods:

```csharp
var createdText = clock.FormatDateTime(createdUtc);
var dayText = clock.FormatDate(createdUtc);
var timeText = clock.FormatTime(createdUtc);
```

These apply the team's timezone and formats. Rebuild saved/cached display text when settings change. Day-only history values must stay day-only. Use these methods for UTC input; `clock.Formats` expects already-local fields.

## 13. Forward team context to another HTTP service

Add the shared handler to your HTTP client:

```csharp
using Intowork.Common.Time.Requests;

services.AddHttpClient<IOtherServiceClient, OtherServiceClient>()
    .AddHttpMessageHandler<TeamHeadersForwardingHandler>();
```

This forwards the current HTTP request's team name, timezone, and formats if the outgoing headers are absent. It does not check team access or forward staff identity. Background jobs have no request to forward; `UseTeamAsync` alone does not add outgoing headers.

## 14. Group Mongo records by team day

Group timestamps using the team's timezone:

```csharp
using Intowork.Common.Time.Mongo;

var dayKey = MongoDateParts.DateToString("%Y-%m-%d", "$TimestampUtc", clock.Zone);
```

Use `dayKey` as the group key. Helpers also exist for year, month, day, and weekday. Mongo uses its own format tokens and weekday numbers.

## 15. Keep JSON timestamps explicit

Make each API field's meaning clear:

```json
{
  "checkInUtc": "2026-07-06T12:30:00Z",
  "leaveDay": "2026-07-06",
  "enteredTeamTime": "2026-07-06T13:30:00"
}
```

These are three different field types. MVC converts local `DateTime` values to UTC and marks unspecified values as UTC without shifting them; it does not guess team time. Minimal APIs, SignalR, messages, and custom serializers need separate setup.

## 16. Handle missing settings

UTC works without a team zone. Team dates require a valid zone:

```csharp
var timestamp = clock.UtcNow;
var teamDay = clock.TeamToday;
```

Without a valid zone, the second line fails. MVC returns HTTP 400 (“Team time zone required”). Background jobs must handle `TeamTimeUnavailableException` through their retry/failure flow. Resolve settings before saving results or marking a message handled.

## 17. Check a change

Use the service's existing tests with a fixed `TimeProvider` registered before team time, explicit team settings, and a scoped clock.

Example expected result: with London settings, `DayRangeUtc(2026-03-29)` starts at `2026-03-29T00:00Z` and ends at `2026-03-29T23:00Z`.

Also check another timezone, midnight, both clock changes, missing settings, separate teams, and loading/saving an unchanged timestamp. For reports, check results and displayed/exported dates together.

## Source reference

[Shared package guide](../CommonLibs/Intowork.Common.Time/DEVELOPER-GUIDE.md) · [Clock contract](../CommonLibs/Intowork.Common.Time/Clock/IDateTimeProvider.cs) · [Frontend guide](team-time-frontend-guide.md)

Existing endpoints may still need migration; this guide explains how new or updated code should work.
