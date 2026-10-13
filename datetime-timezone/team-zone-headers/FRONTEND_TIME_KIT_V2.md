# Frontend time kit v2: components own all zone work

Scope: Frontend, HandoverApp, InspectionsApp. Decision (user, strict option): feature code never sees a zone, `TeamClockService`, `Intl`, `Date` zone maths or the pipes.

## Rules (from the user)
1. Shared components and services live in one kit (`src/app/shared/time`), identical in the three apps.
2. Consumers do not decide; everything is controlled by the component (inputs say *what*, the component decides *how*).
3. Every date/time shown goes through the display component.
4. Conversion from the user's device zone to the team zone happens inside the input component.
5. No zone-related logic outside the kit components.
6. Services may exist, but only kit components consume them.

## Public surface (the only symbols feature code may import from `shared/time`)
| Symbol | Purpose | Replaces |
| --- | --- | --- |
| `TimeKitModule` (standalone `TIME_KIT_IMPORTS`) | one import for all kit components | pipe/field imports |
| `<app-date-time>` | display. `[value]` (UTC wire/Date or calendar day), `kind` (`instant`/`calendar`), `format` (named or pattern) | `teamDate`, `calendarDate` pipes |
| `<app-date-time-field>` | single value input. Emits UTC wire. Adds `[min]`, `[max]`, `[defaultTo]="'today'\|'now'"`, `[day]` | raw inputs, mat-datepicker |
| `<app-date-range-field>` | from/to days. Emits `{ from, to }` UTC window and `{ firstDay, lastDay }` | `clock.range`, `dayRange`, `startOfDay` for queries |
| `<app-period-nav>` | week / month / day navigator. Emits UTC window + day list (calendar-day strings) | wage/yard/planner week maths |
| `[appTimeScope]` host directive | headless; exposes `TimeScope` to the owning component through a template ref, for non-visual text (PDF, CSV, tooltips) and "is this row today/future/past" via `[appTimeMark]` | `clock.today`, `clock.now`, `clock.format` |
| Types: `UtcWindow`, `CalendarDay`, `Instant` | data shapes crossing the boundary | |

Everything else (`time-core`, `team-calendar`, `utc-range`, `TeamTimeService`, `TeamClockService`, `TeamZoneDateAdapter`, the pipes) becomes kit-internal: not exported from `index.ts`, not importable outside `shared/time` (checked by `scripts/check-time-boundary.sh`).

## Data crossing the boundary
Only UTC wire strings (`2026-03-29T00:00:00.000Z`), `UtcWindow { from, to }` (half-open), and calendar-day strings (`2026-03-29`, opaque, never parsed in feature code). No zone ids, offsets or `Date` arithmetic outside the kit.

## Migration order (base branch first, then merge into `-develop`)
0. Kit v2 core + boundary script (Frontend), copy to HandoverApp and InspectionsApp (script `scripts/sync-time-kit.sh`).
1. HandoverApp, InspectionsApp (6 files).
2. Frontend display (105 html files): pipes to `<app-date-time>`.
3. Frontend input: remaining `type=date/time`, `mat-datepicker`, date-fns/`new Date` handling in forms.
4. Frontend non-UI logic (about 50 helpers, services, pipes): move to `app-period-nav`/`app-date-range-field` outputs and `appTimeScope`.
5. Merge base into `-develop`, resolve conflicts, re-run the boundary gate and tests on both.
6. Turn the boundary gate to error mode; delete legacy `team-clock`, `team-time-field`, `team-time-ui`, `team-day-field`.

## Not changed
Backend contract, header names, UTC storage, kit tests (`time-core`, adapter) stay; they move behind the boundary.
