# Frontend time kit consolidation (HandoverApp, InspectionsApp)

Date: 2026-10-08
Branches: `feature/1.6.0/team-zone-headers` (source), then merge into `feature/1.6.0/team-zone-headers-develop`.

## Goal
Consumers never touch time zones. They hand raw values to kit components; the components own display, input conversion (user zone to team zone) and all zone logic. Services may exist, but only kit components inject them.

## Requirements
1. One shared source of the time kit, not hand-edited copies.
2. Consumers do not choose formats or zones. Components decide.
3. Every displayed datetime goes through a kit component.
4. Conversion from the user's input to the team zone happens inside the input component.
5. No timezone logic outside the kit: no `TeamTimeService`, `teamDayOf`, `calendarDateToWire`, `calendarDayParts`, `addBusinessDays` on zone days, `Intl`, `toLocale*`, `getTimezoneOffset`, `Date.UTC`, or `new Date()` stamping in app code.
6. Services are consumed only from kit components.

## Out of scope
`Frontend` app consumers (attendance, staff, etc.) are not refactored in this pass. `Frontend` hosts the master kit only.

## Design

### 1. Sharing
- Master: `Frontend/src/app/shared/time/`.
- `scripts/sync-time-kit.sh` copies the master into `HandoverApp` and `InspectionsApp`; `scripts/check-time-kit.sh` fails on drift. Same files in all three repos, matching the backend convention.
- `TeamTimeService` is the only file that differs today (auth service injected, optional localStorage cache). Replace the auth dependency with a `TEAM_KEY$` injection token and make the cache part of the shared service. Each app's module provides only the token. After this the kit is byte-identical across repos.

### 2. Component API
- `<app-team-datetime [value] kind>`: display. `kind` is semantic (e.g. `submitted`, `created`, `captured`, `reviewed`, `uploaded`); the component maps it to a format from team settings. Optional `[addDays]` for derived values (auto sign-off). Replaces every `| teamDate:'...'` and `| calendarDate` use in templates.
- `app-date-time-field`: input (exists). Extended for day-only use so `date-entry` in InspectionsApp drops its own year/month/day and `Date.UTC` logic.
- `<app-team-stamp>`: emits the current instant as a wire value for captured, submitted and annotated timestamps, replacing `new Date()` in app code.
- Business rules needing team-day math (2-business-day sign-off window, attendance last-second-of-day range, ITW min/max dates) move into kit directives/components that take raw inputs and expose results.

### 3. Encapsulation
`index.ts` exports components and directives only. `time-core`, `team-calendar`, `TeamTimeService`, adapters and pipes stay internal. `check-time-kit.sh` also fails if app code outside `shared/time/` imports internals or uses the forbidden APIs from requirement 5.

### 4. Known consumer leaks to fix
- HandoverApp: `signoff-info-step.component.ts`, `attendance.service.ts`, `handover.component.ts` (ranges, min/max dates, submittedDate), `confirmation.component.ts`, `media-step.component.ts`, `gallery-view.component.ts`, `auto-signoff.component.ts`, and all `teamDate` template uses.
- InspectionsApp: `date-entry.component.ts`, `hands-inspection.*`, `weekly-inspection.*` (templates concatenating `time` + `date`), the two inspection services, `thumbs-and-capture`, `gallery`, `media-detail`.

### 5. Testing
Existing kit specs stay. Each moved rule gets a characterization spec for current London behaviour before the change, plus a non-London zone case. `ng build` and the full spec run must pass in both apps.

### 6. Order
1. `team-zone-headers`: restructure master in `Frontend`, add scripts, sync to both apps.
2. Replace consumer leaks per app, with tests.
3. Build and test each app.
4. Merge into `team-zone-headers-develop`, resolve conflicts, re-check for conflicts.

## Risks
- Moving business rules into kit components is the most invasive step; kept behaviour-identical via characterization tests.
- `Frontend`'s kit lacks `time-kit.module.ts`; the sync must reconcile this (module stays app-side or moves into the master).
