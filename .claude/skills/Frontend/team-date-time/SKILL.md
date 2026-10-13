---
name: team-date-time
description: >
  How to handle dates, times and time zones in the Baton app (Frontend). Use whenever showing, parsing, comparing, sending or
  picking a date or time, building "today" / "tomorrow" / "now", checking past or future, formatting a date in a
  template, adding a date picker, or reading a date from an API response. Also trigger on asTeamDay, asTeamDate,
  asLocalDateTime, teamDate, utcDate, teamNow, teamIso, teamDayText, isTeamToday, isTeamPast, isTeamFuture,
  TeamDateFormatter, dateFormatter, TeamTimeService, TeamDatePipe, app-date-time, app-date-time-field,
  TeamFormatDateAdapter, time-core, new Date(), toLocaleDateString, DatePipe, "time zone", "timezone", "UTC",
  "London", "device zone" and "daylight saving".
---

# Team date and time (the Baton app (Frontend))

This is the production Angular app (see `CLAUDE.md`: say "Baton app"). The time kit is shared with `HandoverApp` and `InspectionsApp`, so the three copies must behave the same; change one, then sync the others.

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
