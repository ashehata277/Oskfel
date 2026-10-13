# Agent brief: time kit v2 migration (Angular apps)

Read first: `FRONTEND_TIME_KIT_V2.md` in this folder (rules and public surface).

## Where to work
- Frontend: `/Users/ahmedmohamedshehata/Oskfel/Frontend` (branch `feature/1.6.0/team-zone-headers`). HandoverApp and InspectionsApp: same parent folder, same branch name.
- Several agents edit the same Frontend checkout at once. Touch ONLY the files of your area (listed in your task). tsc errors outside your area are not yours: filter them out.
- Never edit `src/app/shared/time/**`, `scripts/**`, i18n files for existing keys. If the kit lacks something you need, do NOT work around it with zone code: list it under "kit gaps" in your report (what you need, which file, what the call site does). Adding new i18n keys for new UI text in your area is fine (en-GB and nb-NO).
- Do not commit, push, stash, reset, clean. Leave changes uncommitted.

## Standing rules (the user's)
- No comments in code you write or edit (no `//`, `/* */`, `/** */`, `<!-- -->`). Leave existing comments alone unless you delete the line they describe.
- Match surrounding style. New C# is not involved here.

## What "done" means for your files
`bash scripts/check-time-boundary.sh | grep "<your area path>"` prints nothing, and:
- No import of `TeamClockService`, `TeamTimeService`, `time-core`, `team-calendar`, `utc-range`, `team-clock/*` or any non-public symbol from `shared/time` (public: `TimeKitModule`, `TimeScope`, `TimeScopeHost`, `UtcWindow`, `DayRelation`, `PeriodChange`, `PeriodUnit`, `CalendarDay`, `Instant`, `DateTimeComponent`, `DateTimeFieldComponent`, `DateRangeFieldComponent`, `PeriodNavComponent`).
- No `Intl.DateTimeFormat`, `toLocaleDateString/TimeString/String` for dates, `getTimezoneOffset`, device-zone reads, `new Date()` used to decide a day, `date-fns` on zone-sensitive values, `| teamDate`, `| calendarDate`, `type="date|time|datetime-local"`, `matDatepicker`.
- Behaviour for a London team is unchanged (except documented day-boundary fixes).

## Patterns
1. Display in templates: `<app-date-time [value]="x" format="dateTime"></app-date-time>` (formats: `dateTime`, `dateTimeMedium`, `date`, `dateMedium`, `dateLong`, `dayMonth`, `monthYear`, `weekday`, `time`, or a pattern). Calendar days (`yyyy-MM-dd` strings, stored-as-team-midnight dates): add `kind="calendar"`. Where the text was part of a translate param or string concatenation, restructure the template so the component renders the date and the translation wraps it (use `<span translate>`-style split keys or render pieces side by side); add keys only if needed.
2. Input: `<app-date-time-field formControlName="x" mode="date|time|dateTime" [min] [max] [defaultTo]="'today'">`. It emits UTC wire strings. Ranges: `<app-date-range-field>` emits `UtcWindow {from,to}` (half-open). Week/month/day navigation with a window: `<app-period-nav unit="week" [weekStartsOn]="n" (periodChange)="...">`.
3. Logic in a component class or a plain helper that needs "today", day maths, windows, text:
   ```ts
   @Component({ ..., hostDirectives: [TimeScopeHost] })
   export class X { private readonly scope = inject(TimeScopeHost).scope }
   ```
   `scope` is a `TimeScope` (see `time-scope.ts`). Only strings, `Date` instants and opaque calendar-day strings cross the boundary; never pass a zone. Plain helper functions/services take a `TimeScope` (type-only import) or already-computed values (`UtcWindow`, wire strings) as parameters; they never inject a clock. `TeamTimeService`/`TeamClockService` must not appear outside the kit.
4. Pipes with zone logic: replace by a component property/method using `scope.relationOf(...)`, or by an input to a kit component.
5. Tests: keep specs compiling and meaningful. Specs that provided `TeamClockService` provide the kit testing helpers instead (`src/app/shared/time/time-testing.ts`: `kitTestProviders`, `FakeTeamTime`); host a `TimeScopeHost` by using the real component. Check with `npx tsc -p tsconfig.spec.json --noEmit` (filter to your area) and `npx tsc -p tsconfig.app.json --noEmit`.

## Report (final message, under 30 lines)
Files changed (count), gate hits before/after for your area, tsc app/spec result for your area, behaviour changes (day-boundary), kit gaps (precise), decisions you took. No code pasted.
