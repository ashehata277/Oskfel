# Frontend Time Kit Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared time kit whose components own all timezone logic, so `HandoverApp` and `InspectionsApp` consumers never touch zones.

**Architecture:** The master kit lives in `Frontend/src/app/shared/time/` and is copied byte-identically into the two apps by `scripts/sync-time-kit.sh`. The kit gains a display component, a headless tools component and a public barrel. The apps' consumers are migrated to them, and a gate script fails on any zone logic left outside the kit.

**Tech Stack:** Angular (see each `package.json`), Angular Material datepicker, `@ngx-translate`, Karma/Jasmine (`ng test`), bash gate scripts.

**Spec:** `datetime-timezone/team-zone-headers/FRONTEND_TIME_KIT_CONSOLIDATION_SPEC.md`

## Amendments to the spec (found while planning; user may veto)
- **A1 Two barrels.** `Frontend` has 101 files and 104 templates that use the kit's internals, and it is out of scope. So `index.ts` stays as it is (full API, used by `Frontend`) and a new `public-api.ts` exports components, directives and the two pure helpers in A3. `HandoverApp` and `InspectionsApp` may import only `shared/time/public-api`.
- **A2 One tools component for imperative cases.** Requirement 6 forbids services in consumers, but handover and attendance code needs imperative answers (same team day, team-day range, past N business days). A headless `<app-team-time-tools>` component, read via `@ViewChild`, provides them. App services receive plain wire strings and do no zone math.
- **A3 Zone-free helpers stay public.** `wireOf(instant: Date): string` and `nowWire(): string` only encode an instant (no zone), and app services use them for FormData and stamps. They are the only non-component exports.

## Global Constraints
- No comments in code you write or edit (no `//`, `/* */`, `<!-- -->`); leave existing comments alone.
- Match surrounding style and naming; standalone Angular components in the kit, as `date-time-field` is.
- Keep every existing kit spec and each app's specs. Do not delete spec files.
- London-team behaviour stays identical except where a task says otherwise. Characterize the current behaviour first (`Current_` prefix on the test name), then change.
- Never edit a kit file inside `HandoverApp` or `InspectionsApp`: edit the master in `Frontend`, then run the sync script.
- Do not commit until the user confirms the first commit. The repos' history uses "Remove spec files / Restore spec files / Remove time-kit.version" tip commits (`git log -5 --oneline`); do not imitate them without asking.
- Work on `feature/1.6.0/team-zone-headers` first. Merge into `feature/1.6.0/team-zone-headers-develop` only in Task 10.

## Review Focus
1. Team zone `Pacific/Auckland` with the device on UTC, around local midnight: the delete window and the attendance range must follow the team day (Tasks 4, 7).
2. Null, undefined, empty or garbage value passed to `<app-team-datetime>`: renders empty and does not throw (Task 3).
3. Cold start offline: team settings cached in localStorage are used when the `teamsettings` fetch fails (Task 1).
4. A different team signs in on the same device: cache is cleared, defaults apply, display updates without reload (Task 1).
5. A wire value the field cannot read stays invalid and is never silently replaced by "now" (Task 5).

---

### Task 0: Branches and baseline
**Files:** none changed.
- [ ] **Step 1:** In `Frontend`, `HandoverApp`, `InspectionsApp`: `git checkout feature/1.6.0/team-zone-headers` (status must be clean first).
- [ ] **Step 2:** Run `ng test --watch=false --browsers=ChromeHeadless` in `HandoverApp` and `InspectionsApp`, and `ng test --watch=false --browsers=ChromeHeadless --include='src/app/shared/time/**/*.spec.ts'` in `Frontend`. Expected: record the pass counts; any failure is pre-existing and goes in the final report.

### Task 1: Token-based TeamTimeService in the master
**Files:**
- Modify: `Frontend/src/app/shared/time/team-time.service.ts`, `team-time.service.spec.ts`, `time-kit-tokens.ts`
- Modify: `Frontend/src/app/app.config.ts` (provide the token)

**Interfaces:**
- Produces: `TEAM_TIME_SOURCE: InjectionToken<Observable<string | null>>` in `time-kit-tokens.ts`. It emits the signed-in team name (or `null`) and never emits before the user is known. `TEAM_TIME_CACHE_KEY` stays exported.
- Produces: `TeamTimeService` with the same public members as today (`settings`, `settings$`, `zone`, `dateFormat`, `timeFormat`, `refresh()`), no longer importing any auth service.

- [ ] **Step 1:** Write failing specs in `team-time.service.spec.ts`: `Current_uses_cached_settings_when_fetch_fails`, `clears_cache_and_applies_defaults_when_team_changes`, `fetches_settings_each_time_the_source_emits_a_new_team`, using a `Subject<string | null>` provided as `TEAM_TIME_SOURCE`.
- [ ] **Step 2:** Run them; expected FAIL (token does not exist).
- [ ] **Step 3:** Rewrite the service from `HandoverApp`'s version (it already has the cache and team-change clearing), replacing the user-service subscription with `inject(TEAM_TIME_SOURCE)`.
- [ ] **Step 4:** In `Frontend`'s `app.config.ts` provide `{ provide: TEAM_TIME_SOURCE, useFactory: () => inject(TeamContextService).resolvedTeam$.pipe(filter(t => t !== undefined)) }`.
- [ ] **Step 5:** Run the `Frontend` time specs and `Frontend`'s attendance specs; expected PASS. Note the behaviour change for `Frontend`: it now also caches settings.

### Task 2: Sync and check scripts, apps provide the token
**Files:**
- Create: `Frontend/scripts/sync-time-kit.sh`, `Frontend/scripts/check-time-kit.sh`
- Modify: `HandoverApp/scripts/check-time-kit.sh`, `InspectionsApp/scripts/check-time-kit.sh` (create the folder if missing), `HandoverApp/src/app/app.module.ts`, `InspectionsApp/src/app/app.module.ts`
- Master gains `time-kit.module.ts` (copy from `HandoverApp`, add the new components as later tasks produce them).

**Interfaces:**
- `sync-time-kit.sh` copies every file in the master `src/app/shared/time/` (specs and `time-fixtures.ts` included) to `../HandoverApp` and `../InspectionsApp`, deleting files in the target that the master lacks, and exits non-zero if a target repo has uncommitted changes in that folder unless `--force`.
- `check-time-kit.sh` computes a hash of all files in the folder (no version file) and compares it with the master's folder, found via `TIME_KIT_MASTER` (default `../Frontend`); prints the differing files and exits 1 on drift. It no longer excludes `team-time.service.ts` or `time-kit.module.ts`.
- Each app provides `TEAM_TIME_SOURCE`: Handover and Inspections from `user$` (`filter(user => !!user)`, `distinctUntilChanged` on `sub` and `team`, `map(user => user.team ?? null)`), using their existing `ExternalUserTokenService` / `ExternalUserService`.

- [ ] **Step 1:** Write `check-time-kit.sh` first and run it in `HandoverApp`; expected: reports drift in `team-time.service.ts`.
- [ ] **Step 2:** Write `sync-time-kit.sh`; run it; run `check-time-kit.sh` in both apps; expected exit 0.
- [ ] **Step 3:** Add the token providers in both `app.module.ts` files; remove the apps' separate `TimeKitModule` copies' differences (they now come from the sync).
- [ ] **Step 4:** `ng build` in both apps; expected success. Run both apps' specs; expected the Task 0 counts.

### Task 3: `<app-team-datetime>` display component
**Files:**
- Create: `Frontend/src/app/shared/time/team-datetime/team-datetime.component.ts` (+ `.spec.ts`)
- Modify: `team-time-settings.ts` (new format name `timeDate`: `${timeFormat} ${dateFormat}`), `time-kit.module.ts`, `public-api.ts` (create)

**Interfaces:**
- Produces: `TeamDatetimeKind = 'submitted' | 'confirmed' | 'reviewed' | 'captured' | 'created' | 'uploaded' | 'date' | 'autoSignoff'`.
- Produces: `TeamDatetimeComponent`, selector `app-team-datetime`, inputs `value: Instant | null | undefined`, `kind: TeamDatetimeKind`. Renders a text node, empty for null, undefined, empty or unparseable values. Mapping to existing format names: `submitted` → `timeDate`, `confirmed`/`reviewed`/`captured` → `dateTime`, `created` → `dateTimeMedium`, `uploaded`/`date` → `dateMedium`, `autoSignoff` → `dateTime` of the derived instant.
- `autoSignoff` moves `getAutoSignOff`/`getNextWorkingHour` from `auto-signoff.component.ts` into the kit as an internal function evaluated in the team zone (hours 7, 17 weekday, 13 Saturday, as in the current constants). The component updates when team settings change.
- `public-api.ts` exports: `TimeKitModule`, `TeamDatetimeComponent`, `TeamDatetimeKind`, `DateTimeFieldComponent`, `TeamTimeToolsComponent` (Task 4), `wireOf`, `nowWire`.

- [ ] **Step 1:** Write specs: `renders_dateTime_in_team_zone` (value `2025-03-30T00:30:00Z`, zone `Europe/London`, expected `30/03/2025 01:30`), `renders_empty_for_null_undefined_empty_and_garbage`, `rerenders_when_team_settings_change`, `Current_autoSignoff_matches_existing_london_result` (copy the cases from the auto-signoff spec if one exists, else pin 3 submitted times: weekday 09:00, weekday 16:30, Saturday 12:30), `autoSignoff_uses_team_zone_hours_not_device_hours` (team `Pacific/Auckland`).
- [ ] **Step 2:** Run; expected FAIL (component missing).
- [ ] **Step 3:** Implement the component with `OnPush`-safe subscription to `TeamTimeService.settings$`; reuse `formatInZone` and `patternForFormatName`. Implement `wireOf` and `nowWire` in `time-core.ts` over `toWire`.
- [ ] **Step 4:** Run; expected PASS. Run `ng build` for `Frontend`.

### Task 4: `<app-team-time-tools>` headless component
**Files:**
- Create: `Frontend/src/app/shared/time/team-time-tools/team-time-tools.component.ts` (+ spec)

**Interfaces:**
- Produces: selector `app-team-time-tools`, template-less, methods:
  - `sameDay(a: Instant, b: Instant): boolean`, true when both fall on the same team day.
  - `dayRangeWire(from: Instant, to: Instant): { from: string; to: string }`, from the start of the team day of `from` to one second before the end of the team day of `to` (what `attendance.service.rangeParams` computes today).
  - `isPastBusinessDays(since: Instant, days: number): boolean`, true when today's team day is after `since`'s team day plus `days` business days (what `isPastDeleteWindow` computes today with `days = 2`).
  - No other public methods.

- [ ] **Step 1:** Write specs: `Current_dayRangeWire_london` (pin the existing `rangeParams` output for 3 pairs), `dayRangeWire_follows_team_zone_not_device` (`Pacific/Auckland`, `TIME_KIT_NOW` fixed near device midnight), `sameDay_uses_team_day` (two instants 2 hours apart that straddle midnight in the team zone but not on UTC), `Current_isPastBusinessDays_london_weekend_cases` (review Friday, today Tuesday and Wednesday), `isPastBusinessDays_false_for_null_since`.
- [ ] **Step 2:** Run; expected FAIL.
- [ ] **Step 3:** Implement with `teamDayOf`, `teamDayRangeUtc`, `teamToday(zone, now())` and the business-day helper currently imported by `signoff-info-step` (move it into the kit, keep date-fns if the app already depends on it).
- [ ] **Step 4:** Run; expected PASS.

### Task 5: Day-only input and "not in the future" validation in `date-time-field`
**Files:**
- Modify: `Frontend/src/app/shared/time/date-time-field/date-time-field.component.ts`, `.html`, `.spec.ts`, `date-time-input.ts`, i18n files that `scripts/check-time-kit-i18n.mjs` checks (new key `time-kit.error-future` in every language file it lists, English and Norsk included)

**Interfaces:**
- Produces: input `maxDay: 'today' | null` (default `null`). When `'today'`, a day after today's team day gives `validate()` → `{ dateTimeInvalid: true }`, `errorKey = 'time-kit.error-future'` and `evaluation.status = 'invalid'`.

- [ ] **Step 1:** Write specs: `maxDay_today_rejects_tomorrow_in_team_zone`, `maxDay_today_accepts_today`, `unreadable_model_value_stays_invalid_and_is_not_replaced_by_now` (Review Focus 5).
- [ ] **Step 2:** Run; expected FAIL.
- [ ] **Step 3:** Implement `maxDay` in `evaluateFieldInput` input type and the component's `handleUserEdit`; add the i18n key.
- [ ] **Step 4:** Run; expected PASS; run `node scripts/check-time-kit-i18n.mjs` in `HandoverApp` after sync (Task 6).

### Task 6: Gate script and public-API enforcement; re-sync
**Files:**
- Create: `Frontend/scripts/check-time-boundary.sh` (copied to both apps by the sync script)
- Modify: `Frontend/scripts/sync-time-kit.sh` (also copies `check-time-boundary.sh`, `check-time-kit.sh`, `check-time-kit-i18n.mjs`), `HandoverApp/scripts/check-time-gates.sh`

**Interfaces:**
- `check-time-boundary.sh` greps tracked `src/**/*.ts` and `src/**/*.html`, excluding `src/app/shared/time/` and `*.spec.ts`, and fails (exit 1) on: imports from `shared/time/` other than `shared/time/public-api`; `Intl\.`; `toLocale`; `getTimezoneOffset`; `Date\.UTC`; `\| *teamDate`; `\| *calendarDate`; `TeamTimeService`. Prints each hit with file and line. The sync script also runs it in each target app and prints (does not fail on) the count, until Tasks 7 and 8 finish.

- [ ] **Step 1:** Write the script; run it in `HandoverApp` and `InspectionsApp`; expected: hits that match the leak lists in the spec (record counts).
- [ ] **Step 2:** Run `sync-time-kit.sh`; run both apps' `check-time-kit.sh`; expected exit 0; `ng build` both.

### Task 7: Migrate HandoverApp
**Files (all under `HandoverApp/src/app/`):**
- Modify templates: `handover/signoff-info-step/signoff-info-step.component.html:67`, `handover/linked-files-step/linked-file-details/linked-file-details.component.html:19,42`, `handover/linked-files-step/handover-files-grid/handover-files-grid.component.html:27`, `handover/confirmation/confirmation.component.html:13,29`, `handover/media-step/media-detail/media-detail.component.html:5`, `handover/auto-signoff/auto-signoff.component.html:4`
- Modify code: `handover/signoff-info-step/signoff-info-step.component.ts`, `attendance/attendance.service.ts`, `attendance/attendance.service.spec.ts`, `handover/handover/handover.component.ts`, `handover/auto-signoff/auto-signoff.component.ts`, `handover/confirmation/confirmation.component.ts`, `handover/media-step/media-step.component.ts`, `handover/gallery-view/gallery-view.component.ts`, `app.module.ts` (import only `public-api`)

**Interfaces:**
- Consumes: Task 3 and 4 APIs; `TeamDatetimeKind` mapping from Task 3.
- Produces: `AttendanceService.getForDateRange(from: string, to: string): Observable<UserAttendanceRecord[]>` (wire strings, no zone math in the service).

- [ ] **Step 1:** Update `attendance.service.spec.ts`: `getForDateRange_sends_the_given_wire_strings_unchanged`. Run; expected FAIL.
- [ ] **Step 2:** Change `getForDateRange` and delete `rangeParams`' zone math and the `TeamTimeService` injection. Run; expected PASS.
- [ ] **Step 3:** In each template above replace the pipe with `<app-team-datetime [value]=... kind=...>` using the Task 3 mapping (`reviewDate`→`reviewed`, `uploadedOn`→`uploaded`, `note.createdOn`→`created`, grid `dateTime` column→`date`, `confirmationDate`→`confirmed`, `capturedDate`→`captured`, auto sign-off→`kind="autoSignoff" [value]="submittedDate"`).
- [ ] **Step 4:** In `signoff-info-step.component`, add `<app-team-time-tools #tools>` to the template and `@ViewChild('tools')`; `isPastDeleteWindow` becomes `this.tools.isPastBusinessDays(reviewDate, 2)`. Remove the `TeamTimeService` injection and the `team-calendar`/`time-core` imports. Add/adjust its spec: `Current_blocks_delete_after_two_business_days_london`, `blocks_delete_by_team_day_for_auckland_team`.
- [ ] **Step 5:** In `handover.component`, add the tools component to its template; replace `isSameDay(new Date(parseJSON(...)), new Date(staffDay.date))` with `tools.sameDay(...)`; build `itwMinDate`/`itwMaxDate` as instants and pass `tools.dayRangeWire(min, max)` to `attendanceService.getForDateRange`. Leave `submittedDate = new Date()` and the instant-based sort as they are (they are zone-free). Remove the `TeamTimeService` injection.
- [ ] **Step 6:** `auto-signoff.component.ts`: delete `getAutoSignOff`, `getNextWorkingHour` and their constants (moved to the kit in Task 3); it only exposes `handover$`.
- [ ] **Step 7:** `confirmation.component.ts`, `media-step.component.ts`, `gallery-view.component.ts`: leave `new Date()` instants; if any serialises with `toWire`, use `wireOf` from `public-api`.
- [ ] **Step 8:** Run `check-time-boundary.sh` in `HandoverApp`; expected 0 hits. Run `ng build` and `ng test --watch=false --browsers=ChromeHeadless`; expected pass (Task 0 count plus new specs).

### Task 8: Migrate InspectionsApp
**Files (all under `InspectionsApp/src/app/`):**
- Modify templates: `shared/media/media-detail/media-detail.component.html:5`, `inspection/hands-inspection/hands-inspection.component.html:19,70`, `inspection/weekly-inspection/weekly-inspection.component.html:29,170`, `inspection/steps/hands/date-entry/date-entry.component.html`
- Modify code: `inspection/steps/hands/date-entry/date-entry.component.ts` and `.spec.ts`, `inspection/hands-inspection/hands-inspection.component.ts` (the `DateEntry` validity check at ~222), `inspection/hands-inspection/hands-inspection.service.ts`, `inspection/weekly-inspection/weekly-inspection.service.ts`, `shared/media/thumbs-and-capture/thumbs-and-capture.component.ts`, `shared/media/gallery/gallery.component.ts`, `app.module.ts`

**Interfaces:**
- Consumes: Task 3, 4 and 5 APIs.
- `date-entry` keeps `stepResult: EventEmitter<StepResult>`, `stepValid: EventEmitter<boolean>`, `dateAnswer` as an ISO instant, but is rebuilt on `<app-date-time-field mode="date" maxDay="today">` only.

- [ ] **Step 1:** Update `date-entry.component.spec.ts` first: `Current_emits_valid_and_result_for_a_past_london_day`, `emits_invalid_for_a_future_team_day`, `emits_nothing_for_a_cleared_field`. Run; expected FAIL on whichever case still depends on the day/month/year selects.
- [ ] **Step 2:** Rewrite `date-entry.component.html` to the single field (keep the prompt and error blocks); rewrite `.ts` so it listens to `ngModelChange`, emits `stepValid`/`stepResult` from the field value and `ngModel` validity, and drops `TeamTimeService`, `TIME_KIT_NOW`, `Date.UTC`, `toLocaleString`, the day/month/year arrays and `buildCalendarChoices`. Run; expected PASS.
- [ ] **Step 3:** In `hands-inspection.component.ts` replace the `new Date(a.dateAnswer)` / `d.getFullYear() > 2000` check by `parseWire`-free validation: the step is valid when `a.dateAnswer` is a non-empty string or `Date` (the field already validates the day). Add a spec: `date_entry_step_valid_when_answer_present`.
- [ ] **Step 4:** In the three `submitted-by-at`/`name-date` templates replace the `teamDate:'time'` + `teamDate:'date'` concatenation by `<app-team-datetime [value]="raisedDate" kind="submitted">` and pass its text through a template ref if the translation needs it as a parameter; if it cannot be a parameter, change the translation to use two spans (update the translation keys in every language file).
- [ ] **Step 5:** `media-detail.component.html`: `kind="captured"`. In both inspection services, `thumbs-and-capture`, `gallery`: keep `new Date()` instants; replace `toWire(...)` with `wireOf(...)` from `public-api`.
- [ ] **Step 6:** Run `check-time-boundary.sh`; expected 0 hits. `ng build`; `ng test --watch=false --browsers=ChromeHeadless`; expected pass.

### Task 9: Whole-app verification and gates in error mode
- [ ] **Step 1:** Run `scripts/check-time-kit.sh` and `scripts/check-time-boundary.sh` in both apps; expected exit 0.
- [ ] **Step 2:** Run both apps' specs under `TZ=UTC`, `TZ=Pacific/Auckland` and `TZ=America/Los_Angeles`; expected pass in all three (device zone must not affect results).
- [ ] **Step 3:** Start each app (`ng serve`) with the dev gateway if available and check, in the in-app browser, a handover screen and an inspection screen for: dates render in the team zone; the date-entry field accepts a past day and rejects a future day. If no backend is reachable, say so in the report.
- [ ] **Step 4:** Ask the user to confirm the first commit; commit in each of `Frontend`, `HandoverApp`, `InspectionsApp` on `team-zone-headers` (message `Consolidate time kit; move zone logic into kit components`, with the attribution line from the session).

### Task 10: Merge into the develop branches
- [ ] **Step 1:** In each repo: `git checkout feature/1.6.0/team-zone-headers-develop`, then `git merge feature/1.6.0/team-zone-headers`.
- [ ] **Step 2:** Resolve conflicts. For files under `shared/time/`, take the master's version (re-run `sync-time-kit.sh`) rather than hand-merging. For consumers, keep develop's functional changes and re-apply Task 7/8 edits. List conflicted files in the report.
- [ ] **Step 3:** After resolving, run `git merge --no-commit` style recheck: `git diff --check`, `git status` shows no `<<<<<<<` (`git grep -n '<<<<<<<'` empty), `check-time-kit.sh`, `check-time-boundary.sh`, `ng build`, `ng test --watch=false` in both apps. Then re-check conflicts against `origin/develop` (`git merge --no-commit --no-ff origin/develop`, inspect, `git merge --abort`) and report any.
- [ ] **Step 4:** Do not push. Report results and ask before pushing.
