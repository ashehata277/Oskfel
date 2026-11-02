# Team time: developer guide

Each team has a time zone, date format and time format. Show and calculate dates using the team's settings, even when the user's device is in another time zone.

The Gateway supplies the team settings to backend requests. Store and send date-times as UTC; convert them to team time when needed.

## Frontend applications

Use the helpers in `src/app/shared/time` in Frontend, HandoverApp and InspectionsApp. Wait for team settings to load before using them: use `teamTimeReadyGuard` on the route or `TeamTimeService.loaded$`. The guard is not yet on the HandoverApp and InspectionsApp routes.

| Task | Use |
| --- | --- |
| Read a date-time from the API | `teamDate(value)` in a model, or `asTeamDate(value)` when you need a `Date` |
| Send a selected date-time to the API | `utcDate(value)` in the request body, or `teamIso(value)` for a string |
| Read a day-only value | `asTeamDay(value)` |
| Send a day-only value | `dayToApi(value)` |
| Get the team's current time | `teamNow()` |
| Check today, past or future | `isTeamToday`, `isTeamPast`, `isTeamFuture` |
| Display a date | `teamDate` pipe, `<app-date-time>`, or `TeamDateFormatter` in code |
| Let a user select a date | `<app-date-time-field>` |

A **date-time** is a moment, such as a meeting at 14:30. A **day-only value** is a calendar date, such as a bank holiday. Use the matching helpers: `utcDate` and `dayToApi` have different purposes. Keep day-only values as `yyyy-MM-dd` strings until a `Date` is needed.

```typescript
const start = teamDate(response.start);
const request = { start: utcDate(selectedStart), holiday: dayToApi(selectedDay) };
```

```html
{{ start | teamDate:'dateTime' }}
```

API date-time strings must include `Z` or an offset, for example `2026-07-06T13:30:00Z`. Do not use the browser's time zone, Angular's `date` pipe, `new Date()` for team "now", or `new Date('yyyy-MM-dd')` for a day-only value.

## Backend applications

### In a request

Inject `IDateTimeProvider` as `clock`:

```csharp
var now = clock.UtcNow;
var today = clock.TeamToday;
var window = clock.DayRangeUtc(today);
```

Use `window.From` and `window.To` to find records for today: `date >= window.From && date < window.To`. The Gateway provides the team time zone automatically. If the zone is missing or invalid, team-time operations return a 400 response.

Use `clock.ToTeamTime(utc)` to convert UTC to team time, and `clock.ToUtc(teamLocal)` to convert team time to UTC.

### In a background job or event handler

Inject `ITeamClocks` and get the clock using the team name:

```csharp
var clock = await teamClocks.ForTeamAsync(teamName, cancellationToken);
var today = clock.TeamToday;
```

If the team or its time zone is unavailable, the lookup fails. Let event handlers fail so they can be retried. For a job that processes multiple teams, log the error and continue with the next team.

### Remember

- Store date-times in UTC.
- Use `DayRangeUtc` for a team day; do not assume every day is 24 hours.
- Do not use `DateTime.Now`, `DateTime.Today`, or a hard-coded time zone.
- Register `AddTeamTime()` for requests, or `AddTeamTimeByTeamName<TTeamCopyReader>()` when background work needs team clocks.

## Before finishing

Check that the screen or service uses the team's time zone and formats, that date-times and day-only values use the correct helpers, and that day queries use an exclusive end. Test date conversions with different time zones and daylight-saving transitions when changing conversion or day-boundary logic.

For more detail and service-specific setup, see the workspace [team date and time guide](../.agents/skills/team-date-time/SKILL.md) and the corresponding `team-date-time` skill in the application or service.
