---
name: team-date-time
description: >
  Handle team-zone dates, calendar days, date inputs, serialization, settings readiness and date-library adapters in Frontend. Use when implementing or reviewing date/time behavior in this app.
---

# Team date and time (the Baton app (Frontend))

This skill covers Frontend. The three apps share date-conversion semantics, but authentication/team sources, Angular initialization, settings validity/cache behavior and guards differ. Port common fixes deliberately; do not overwrite app-specific wiring.

## Verify the checkout first

Before relying on wiring or declaring a migration complete, run `git status --short --branch` and inspect the actual package references and source in the target checkout. The team-zone feature can be on a feature branch or another worktree while `main` still uses the old implementation. Use `git worktree list` and read the relevant branch with `git show` when needed; do not switch branches over unrelated changes. Rules below describe the team-zone implementation, not proof that every branch has it. Report the branch and scope searched with review findings.

**Wiring in this app**

- Angular 19, date-fns `^4.4.0`, `@date-fns/tz` `^1.5.0`.
- `src/app/app.config.ts` activates the service with `provideEnvironmentInitializer(() => inject(TeamTimeService).activate())`
  and registers `{ provide: DateAdapter, useClass: TeamFormatDateAdapter }` with `TEAM_DATE_FORMATS`, so every
  `mat-datepicker` in the app works in team time.
- `TeamTimeService` reloads whenever `TeamContextService.resolvedTeam$` changes (switching team), so settings always
  follow the selected team (`X-Selected-Team` is sent by `src/app/auth/team-header-interceptor.ts`). A `TeamDate`
  keeps the zone it was created in, so a screen must refetch its data after a team switch.
- `teamTimeReadyGuard` is on the protected routes in `src/app/routes.ts` and `src/app/layout/layout-routes.ts`.
- Syncfusion screens already converted: `materials/vehicle-calendar/`, `resources/staff-wallchart/`,
  `resources/staff-calendar/`, `calculator/gantt-chart/`.
- Inspect `scripts/check-dates-baseline.json` for the current `check:dates` baseline; a baseline entry is not proof a call is safe.
- Examples to copy: `teamDate(...)` in model constructors (`src/app/activework/project-report-models.ts`), `utcDate(...)`
  in request bodies (`src/app/activework/activework.service.ts`, `handover.service.ts`), `teamDateFrom` /
  `cloneTeamDate` (`src/app/activework/labour-summary.service.ts`), `asTeamDay` (`src/app/materials/vehicles.service.ts`),
  `TeamDateFormatter` injected as `dateFormatter` in `activework.service.ts`.
- The principle in the repository instructions (one derivation, everywhere) applies: extend `shared/time`, do not write a second date
  helper.

## The rule

Every team has one IANA time zone, one date format and one time format. The app shows and builds **team time**,
whatever zone the device is in. The API speaks **UTC**. The device zone is never used for display, for "today", or
for conversion; `deviceZone()` in `time-core.ts` exists only so the date field can warn the user when their device
zone differs from the team's. The backend never guesses a zone either (it answers 400 when the Gateway cannot supply
one), so the app must not hide that by inventing one.

## How a team date is held: `TZDate`

A team date is a `TeamDate` (`core/time-core.types.ts`), which is a `TZDate` from `@date-fns/tz` (date-fns v4): a
**subclass of `Date`** that carries the team zone.

- Its getters (`getHours()`, `getDate()`, `getDay()`…) answer in the **team** zone, on any device.
- Its value (`getTime()`) is the **real instant**. Nothing is shifted, so nothing has to be remembered: the old
  shifted `Date` and its `teamDateOrigins` WeakMap are gone, and `copyTeamDate` no longer exists.
- date-fns v4 functions (`addDays`, `startOfDay`, `isSameDay`, `format`…) keep the `TZDate` type, and a day added
  across a clock change stays a calendar day.
- `core/tz-date-iso.ts` (imported by `time-core.ts`) patches `TZDate.prototype.toISOString` / `toJSON` to emit UTC
  `…Z`, so what reaches the API is byte-for-byte what it was before. Do not remove that import.
- A **plain** `Date` is the danger: `new Date(teamDate)` keeps the instant but reads in the **device** zone, so it
  shows the wrong hour to anyone abroad. When a plain `Date` reaches `toUtcDate` or `asTeamDate`, its device-local
  fields are read as the team wall clock (the old meaning) and `warnPlainDate()` logs a dev warning naming the call
  site (once per site, at most 50).

## Where it lives

All of it is in `src/app/shared/time/` (import as `src/app/shared/time/...`).

| Folder / file | What it is |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `core/time-core.ts`, `core/time-core.types.ts` | Pure functions, no Angular: `isValidZone`, `resolveTeamClockTime`, `teamClockTimeToUtc`, `localDate(zone, y, m, d, …)`, `teamDateAt(instant, zone)`, `parseApiString`, `parseCalendarDay`, `formatCalendarDay`, `calendarDayParts`, `calendarDateToApiString`, `formatDateAs`, `formatInZone`, `formatCalendarDayAs`, `isoDayOf`, `offsetMinutesAt`, `formatUtcOffset`, `deviceZone`, `isDeviceZoneDifferent`, `zoneCity`, `toApiString`. Types: `TeamDate`, `ZoneId`, `CalendarDay` (`yyyy-MM-dd`), `Instant`, `ClockTime`, `ResolvedClockTime` |
| `core/tz-date-iso.ts` | Makes a `TZDate` serialise as UTC `Z` |
| `settings/team-time.service.ts` | `TeamTimeService` (root singleton): `settings`, `settings$`, `zone`, `dateFormat`, `timeFormat`, `loaded$`, `toTeamDate`, `toUtcDate`, `teamNow`, `reload`, `refresh`, static `active`; also `warnPlainDate` |
| `settings/team-time-settings.ts` | `DATE_FORMATS`, `TIME_FORMATS`, `TEAM_TIME_DEFAULTS`, `normalizeTeamTimeSettings`, `patternForFormatName` |
| `settings/team-time-ready.guard.ts` | `teamTimeReadyGuard`: a route guard that waits for `loaded$` |
| `conversion/from-api.ts` | API to app and building dates: `teamDate`, `calendarDay`, `asTeamDate`, `asTeamDay`, `asLocalDateTime`, `cloneTeamDate`, `teamDateFrom`, `toSyncfusionDate`, `withSyncfusionFields` |
| `conversion/to-api.ts` | App to API: `utcDate` for instants, `dayToApi` for UTC-midnight day contracts |
| `conversion/team-time-conversion.ts` | `teamNow`, `teamIso`, `teamDayText`, `isTeamToday`, `isTeamTomorrow`, `isTeamDayBeforeToday`, `isTeamPast`, `isTeamFuture`, `activeTeamTime`, `activeZone` |
| `display/team-date-formatter.service.ts` | `TeamDateFormatter`: `format(value, name)`, `formatDay(day, name)`, `pattern(name)` |
| `display/team-date.pipe.ts` | `teamDate` pipe (standalone, impure) |
| `display/to-syncfusion.pipe.ts` | `toSyncfusion` pipe: a team date as a device-zone device-time `Date`, for libraries that read the device zone |
| `display/date-time/`, `display/date-time-message/` | `<app-date-time [value] [kind] [format]>` and the message variant |
| `input/date-time-field/` | `<app-date-time-field>`, a `ControlValueAccessor` date / date-time picker that shows the device-zone warning |
| `input/team-format-date-adapter.ts` | `TeamFormatDateAdapter` (Material `DateAdapter` that creates `TZDate`s) and `TEAM_DATE_FORMATS` |
| `time-kit.module.ts` | `TimeKitModule`: exports the components and both pipes, and activates `TeamTimeService` |

## Pick the function by case

| I need to… | Use |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| read a UTC date-time in a model constructor | `teamDate(data.x)` |
| turn any `Date \ | string \ | number` into a team date | `asTeamDate(x)` |
| read a day-only value (`2026-07-06`) | keep the string, or `asTeamDay(x)` |
| read a zone-less clock-time string (`2026-07-06T13:30`) | `asLocalDateTime(x)` |
| show a date in a template | `{{ x \ | teamDate:'date' }}` or `<app-date-time>` |
| put a date inside a translated sentence | `<app-date-time-message key="…" [dates]="{ d: { value: x, format: 'date' } }">` |
| format a date in TypeScript (toast, export, PDF) | `dateFormatter.format(x, 'date')` |
| let the user pick a date or date-time | `<app-date-time-field>` with `valueAs` |
| send a date in a request body | `utcDate(x)` |
| build an ISO string myself | `teamIso(x)` |
| send a day-only value | `teamDayText(x)` or `dayToApi(x)` according to the API contract |
| get "now" | `teamNow()` |
| check today / tomorrow / past / future | `isTeamToday`, `isTeamTomorrow`, `isTeamDayBeforeToday`, `isTeamPast`, `isTeamFuture` |
| move by days or months | date-fns `addDays(x, n)` / `addMonths` on a team date |
| copy a date | `cloneTeamDate(x)` |
| build a date from parts | `teamDateFrom(year, monthIndex, day, h?, m?, s?, ms?)` |
| hand a date to a library that reads the device zone (Syncfusion) | `\ | toSyncfusion`, `withSyncfusionFields(items, 'StartTime', 'EndTime')`; read back with `asTeamDate` |

## Receiving dates from the API

- `parseApiString(value)` accepts only a string that has `T` at index 10 and ends with `Z` or an offset like
  `+01:00`. Anything else returns `null`. So an API date-time **must be a UTC instant with a marker**; a bare
  `2026-07-06T13:30:00` is not accepted. `teamDate` leaves such a string untouched and logs a dev warning, and
  `asTeamDate` returns an invalid `TeamDate`.
- `teamDate(value)`: for model constructors. A UTC string becomes a `TeamDate`; non-strings and unparseable strings are
  returned as they are. Typical use: `this.opDate = teamDate(data.opDate)`.
- `asTeamDate(value)`: always returns a `TeamDate`. A `yyyy-MM-dd` becomes team midnight of that day, an instant
  becomes a team date, a `TZDate` is copied, a plain `Date` is read as team wall clock (with the dev warning), a number
  is an instant, and nothing/unknown is an invalid `TeamDate` (`NaN`) with a dev warning.
- `asTeamDay(value)`: for **day-only** values. It accepts a `yyyy-MM-dd` or an instant and returns team midnight of
  the **calendar day**; for an instant string it takes the UTC calendar date (`calendarDay`), so only use it for values
  the API sends as a day.
- `asLocalDateTime(value)`: for `yyyy-MM-ddTHH:mm[:ss]` strings **without** a marker that mean team clock time.
- `calendarDay(value)`: returns the `CalendarDay` string for a day string or an instant, or `null`.

## Sending dates to the API

- Wrap dates in request bodies with `utcDate(value)` (`conversion/to-api.ts`). A `TZDate` returns its exact instant
  as a plain UTC `Date`; non-dates pass through, so it is safe on optional fields.
- To build a string yourself use `teamIso(teamDate)` (throws `TypeError` on an invalid `Date`), or
  `calendarDateToApiString(day, zone)` to get the UTC instant at which a team calendar day starts.
- Classify the endpoint contract before sending a day. Use `teamDayText(date)` for a `yyyy-MM-dd` contract. Existing vehicle/absence/availability APIs also encode days as UTC midnight: use `dayToApi(value)`, paired with `asTeamDay` on receipt. Never use `utcDate` for that encoding: team midnight can be the previous UTC day. `dayToApi` is not the team-day boundary for an instant filter.
- A clock time in a daylight-saving **gap** moves forward in **30-minute steps** (London 01:30 on the spring
  night → 02:00); one in an **overlap** takes the first occurrence. `resolveTeamClockTime(input, zone)` returns
  `status: 'normal' | 'skipped' | 'repeated'` so a form can warn. The backend `ToUtc` does the same. `localDate` goes
  through it on purpose: `TZDate.tz(zone, …)` on its own would move a gap by the gap length (→ 02:30) and disagree
  with the backend, so do not "simplify" `localDate` to it.

## "Now", "today" and comparisons

- `teamNow()` is the current time as a `TeamDate` (`TZDate.tz(zone)`). Never `new Date()` / `Date.now()` for "now" in
  app logic.
- `teamDayText(value)` returns the team calendar day (`yyyy-MM-dd`) of a `Date`, day string or instant, or `''`.
- `isTeamToday`, `isTeamTomorrow`, `isTeamDayBeforeToday` compare team calendar days. `isTeamPast` and `isTeamFuture`
  compare instants against `teamNow()` (they accept a `Date`, string or epoch number).
- Move by days with date-fns (`addDays`) or `setDate(getDate() + n)` on a team date — never by adding 24 hours of
  milliseconds (a clock-change day is 23 or 25 hours).

## Copying and building dates

- `cloneTeamDate(d)`: a `TZDate` stays a `TZDate`, a plain `Date` stays plain. Use it wherever you would have written
  `new Date(d)` or `new Date(d.getTime())`.
- `teamDateFrom(year, monthIndex, day = 1, …)`: same arguments as the `Date` constructor (month from 0, overflow works:
  `teamDateFrom(y, m + 1, 0)` is the last day of month `m`), returns a `TeamDate`.
- `new Date(<string or epoch number>)` is still allowed for a real instant, and is counted by `check:dates`.

## Showing dates

- Template: `{{ value | teamDate }}` or `{{ value | teamDate:'dateTime' }}`. Format names come from
  `patternForFormatName`: team-following `date`, `time`, `dateTime` (default), `dateTimeSeconds`, `timeSeconds`,
  `weekdayDate`, `weekdayDateTime`, `dateTimeMedium`; fixed `dateMedium`, `dateLong`, `dayMonth`, `weekdayDayMonth`,
  `monthYear`, `weekday`. Any other string is a raw pattern. A third argument supplies a per-value zone. In Frontend, instant strings, numbers and `TZDate`s use the effective zone; plain `Date`s use compatibility wall-clock fields. Verify the other apps before assuming this behavior has been ported. Import `TimeKitModule` (or `TeamDatePipe` in a standalone component).
- Component: `<app-date-time [value]="x" [kind]="'instant'|'calendar'" [format]="'date'">`; it re-renders when the
  team's settings change.
- Sentences with dates: `<app-date-time-message key="…" [params]="…" [dates]="…">` — never glue a formatted date into
  a sentence with `+`.
- Code: inject `TeamDateFormatter` (conventionally as `dateFormatter`) and call `dateFormatter.format(value, 'date')`
  or `formatDay(day, 'date')` for text in messages, toasts, exports and PDFs. `dateFormatter.pattern('date')` gives
  the pattern string for a mask or placeholder.

## Pickers and forms

- `<app-date-time-field>` with `mode` (`date` | `dateTime`), `valueAs`, `look` (`fill` | `outline` | `plain`), `min`,
  `max`, `required`, `clearable`, `readonly`:

  | `valueAs`        | The form control gets              | Use when the API field is |
  | ---------------- | ---------------------------------- | ------------------------- |
  | `date` (default) | a `TeamDate` — send with `utcDate` | a UTC instant             |
  | `day`            | `'2026-07-06'`                     | a day-only value          |
  | `localDateTime`  | `'2026-07-06T13:30'`               | a clock time with no zone |

- `TeamFormatDateAdapter` overrides `today`, `createDate`, `clone`, `addCalendarYears` / `Months` / `Days`,
  `toIso8601`, `parse` and `deserialize`, so every date Material creates is a `TeamDate` and "today" is the team's
  today — but only where it is registered as the `DateAdapter` (see **Wiring in this app**).
- When suppressing change side effects during programmatic form loading, use `{ emitEvent: false }`. Patch instant controls through `asTeamDate`, day controls through their calendar-day contract, and local-clock controls through `asLocalDateTime`; do not parse all three as instants.

## Libraries that read the device zone (Syncfusion and similar)

Syncfusion schedule, calendar and Gantt read dates in the device zone and create plain `Date`s, so they get
**device-time dates** (plain `Date`s whose device-local fields equal the team's clock):

- single bindings: `[selectedDate]="currentDate | toSyncfusion"`, `[value]="selectedDate | toSyncfusion"`
- data sources: `dataSource: withSyncfusionFields([...events], 'StartTime', 'EndTime')` — it converts the named fields
  **in place**, so clone the affected item objects if the originals are used elsewhere; copying only the array is insufficient
- coming back (click, drag, resize, navigate): `asTeamDate(value)`; the plain-`Date` dev warning is expected there

Any new component of this kind needs the same treatment; a `TeamDate` passed straight in shows device time.

## Do

- Use `teamDate` / `asTeamDate` / `asTeamDay` for what you read, `utcDate` / `teamIso` / `teamDayText` for what you send.
- Keep day-only values as `yyyy-MM-dd` strings until you must make a `Date`.
- Use `teamNow()` and the `isTeam*` helpers for "now" logic.
- Use `cloneTeamDate` / `teamDateFrom` for team dates. Epoch measurement, genuine UTC instants and library-boundary adapters have different semantics; do not mechanically replace every `new Date` or `Date.now`.
- Use `TeamDateFormatter`, the `teamDate` pipe or `<app-date-time>` for display.
- Verify settings readiness and validity before zone-dependent logic; see the settings section below.
- Put a new date rule in `shared/time` once and call it everywhere; then copy the change to the other two apps.

## Don't

- Don't use the device zone: no `getTimezoneOffset()`, `Intl.DateTimeFormat().resolvedOptions().timeZone`,
  `toLocaleDateString()` / `toLocaleTimeString()` for team time, or `new Date()` / `Date.now()` as "now".
- Don't use Angular's `DatePipe` / `| date` or `formatDate` on API values; they use the browser zone.
- Don't call `new Date('yyyy-MM-dd')` or `new Date('yyyy-MM-ddTHH:mm:ss')` on API data.
- Don't copy a team date with `new Date(date)` or build one with `new Date(y, m, d)`; use `cloneTeamDate` / `teamDateFrom`.
- Don't send a team date to the API without `utcDate` / `teamIso`.
- Don't pass a `TeamDate` straight into Syncfusion; use `toSyncfusion` / `withSyncfusionFields`.
- Don't hard-code `Europe/London` (or any zone), or `dd/MM/yyyy`, in a component; read it from `TeamTimeService`.
- Don't add comments.
- When you touch a file that still uses a device-zone call, move that call to the helpers in the same change.

Worked examples of each mistake, with the fix and where it still lives in the code: `mistakes.md` in this folder.

## Guard rails

- `npm run check:dates` (`scripts/check-dates.mjs`) counts `new Date(` per file outside `shared/time` and specs, and
  fails when a file has more than `scripts/check-dates-baseline.json` allows. Fix with `cloneTeamDate` / `teamDateFrom` /
  `asTeamDate`. After removing some, `node scripts/check-dates.mjs --update` lowers the baseline; raise it only for a
  genuine instant (`new Date(epochMs)`), and say why.
- The dev console warning `toUtcDate: a plain Date was read as team clock time. Use asTeamDate() at …` marks a
  plain `Date` that should be a `TeamDate`. Fix it, except for Syncfusion read-backs.
- Manual check: Chrome DevTools → More tools → Sensors → Location → Timezone ID `America/New_York` with a London team.
  The screen must show London time, the date field must show the zone badge, and saving an untouched record must send
  the instant it loaded.

## Tests

- Specs in `shared/time` are Karma/Jasmine (`ng test`). `conversion/tz-date.spec.ts` is the pattern: it activates a
  zone explicitly and covers London and New York, the autumn overlap, the spring gap, a picker round trip, a clone,
  the team day and serialisation. `input/date-time-field/field-value.spec.ts` covers the field's pure functions.
- `shared/time/team-time-reset.spec.ts` clears `TeamTimeService.active` before every spec, so one spec's zone cannot
  leak into the next; keep it.
- Test conversion code against at least two zones and a daylight-saving gap and overlap. Never rely on the machine's
  zone.

## Settings readiness, team switching and stale dates

- Treat loading completion and a valid team zone as separate conditions. In Frontend, `loaded$` can complete after a failed load, and `teamTimeReadyGuard` permits navigation after its three-second timeout. Check `hasTeamZone` / `hasTeamZone$` before zone-dependent actions; the defaults are placeholders, not confirmed team settings.
- HandoverApp and InspectionsApp currently have different settings loaders and guards; they do not expose Frontend's validity API. Their guards wait for `loaded$` and are not wired to routes in the reviewed checkout. Verify activation, authentication and settings-request ordering before adding a guard, including failure behavior; do not assume a copied guard solves readiness.
- Persisted settings must be associated with the resolved team. Never mark a new team ready from another team's or a legacy unscoped cache. Ignore stale responses after switching teams. Invalidate formatted audit text, exports and other derived caches when zone, date format or time format changes.
- A `TZDate` retains its creation zone. For an instant retained across a settings change, render/re-zone the same epoch in the current zone; do not reinterpret its wall-clock fields. Refetch team-owned data when changing teams.
- Frontend's current uncommitted fixes re-zone `TZDate` values in `renderDateText` and `toSyncfusionDate`. Inspect each app before claiming parity: HandoverApp and InspectionsApp still need comparison/porting of those paths. Plain `Date` values remain wall-clock compatibility inputs, not automatically UTC instants.
- A pure `toSyncfusion` pipe cannot re-run solely because settings changed while its input reference stayed the same. Rebuild affected grid bindings/data when settings change, or make reactivity explicit in the shared adapter.

## Review the full date surface

When reviewing a date/time change, trace receive → model → calculation → input → display → send. Include grid cell callbacks and exports, audit/history old/new values, filters and min/max bounds, read-only form answers, report/email/PDF output, month names and translated sentences. Check permission-gated and lazy-loaded screens too.

Use `<app-date-time-field mode="date" valueAs="day">` for calendar-day controls with the team's format and zone badge. Preserve labels/input IDs, validation, min/max and the API contract; a native `type="date"` is not equivalent UI. A day filter querying instants needs the team day's UTC boundaries, not `dayToApi` merely because its control returns a day.

For Syncfusion grids, use the shared cell/adapter helpers and the team's format; a fixed `dd/MM/yyyy HH:mm` misses both format settings and time-zone conversion. `withSyncfusionFields` mutates each item: clone the affected objects before calling it when originals are reused; `[...items]` alone copies only the array. Adapt device-wall-clock dates back with `asTeamDate` before serialization.

## Regression checks for settings changes

For relevant changes, cover an instant created before settings load, switching zones with the same retained instant, switching teams with cached settings, legacy unscoped caches, date/time-format-only changes, and failed/slow settings requests. Verify calendar labels stay unchanged while instants re-render in the selected zone. Test a device zone different from the team and UTC dates near midnight, plus DST gaps/overlaps and unchanged save round trips.

In Frontend, `stale-zone.spec.ts` covers the recent stale-zone/cache fixes when present. Run focused Karma/Jasmine specs with an available Chrome/Chromium binary (`CHROME_BIN` if needed), and the appropriate TypeScript check. Report an unrun browser suite explicitly; do not present type-checking as a passing runtime test.
