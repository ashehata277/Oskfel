---
name: weekly-resource-planner
description: >
  Architecture, service contracts, and business rules for the Weekly Resource Planner at
  src/app/weekly-resource-planner — the week-view sibling of the Daily Resource Planner /
  dispatch board. Shows a Monday–Sunday 7-column grid (Project -> ITW -> assignment row, one
  cell per day) instead of a single day, over the same ActiveWorkRecord/staff/vehicle-assignment
  domain. Use this skill whenever adding to or modifying the weekly board — the week grid, its
  staff/vehicle resource pool, week navigation, group-by modes, drag-drop or tap-to-assign staff
  and vehicles onto a day cell, the ITW detail panel, Weekly Ops chips/summary filters, or its
  SignalR live-refresh. Also trigger on "weekly resource planner", "week grid",
  "WeeklyResourcePlannerApiService", "WeeklyBoardService", "WeeklyGroupByBuilderService",
  "WeeklyAssignmentRow", "WeeklyCell", "WeeklyProjectNode", "staff pool" / "vehicle pool" in a
  weekly context, or "Weekly Ops filter". This module is signals-free, NgModule-based, and
  follows the dumb-component / all-logic-in-services pattern — same conventions as
  daily-resource-planner, but read the "Duplication vs daily-resource-planner" section below
  before touching a service: several services here are near-verbatim forks of the daily module's,
  not shared code.
---

# Weekly Resource Planner

The Weekly Resource Planner (`src/app/weekly-resource-planner`) is the week-view sibling of the
Daily Resource Planner. It shows a **Monday–Sunday week** as a 7-column grid of
`Project → ITW → assignment row`, one cell per day, with a left resource panel (staff + vehicles)
that drags or taps onto a day cell. Same underlying domain as the daily board — ActiveWorkRecords,
staff/vehicle assignment via `ActiveworkService` — laid out across a week instead of one day.

It routes at `/weekly-resource-planner` (`layout-routes.ts`), guarded by `MsalGuard` with
permission `intowork.ldf.write` (breadcrumb "Weekly Resource Planner"). As with the daily board,
the route data carries a `permissions` key but only `MsalGuard` is stacked in `canActivate` —
`permissionCanActivate` is not enforced here either. Match the surrounding route entries if you
change this.

Module-author notes already exist at `src/app/weekly-resource-planner/weekly-view.md` — a
detailed file-by-file reference. This skill summarizes the same ground for someone about to make a
change, plus the business rules and cross-module comparison the notes don't cover. Read
`weekly-view.md` for exhaustive per-file detail; treat this skill as the map plus the rules.

This is signals-free, `standalone: false` NgModule, dumb components, all logic in services,
`BehaviorSubject`/`ReplaySubject` streams recomputed via `combineLatest`. Do not introduce
Angular signals or standalone components here.

### Removed: the ported single-day board

The module used to also carry a `WeeklyResourcePlannerProjectViewComponent` (with a
`WorkTypeGroup` → `AssignmentRow` tree), a legend dialog, `DispatchGroupByBuilderService`, and
four confirm/detail dialogs — a single-day board ported wholesale from the Daily Resource Planner.
Nothing ever mounted its root, so the whole subtree was deleted, along with the page-component
handlers only it fed into (`onAssigneeClicked`, `onStaffMoved`, `onAssignmentRowClicked`,
`onVehicleRemoved`, `onRoleRemoved`, `onResetBoard`). The equivalents still live under
`daily-resource-planner/` if that board is ever needed again. One behavioural consequence
survives: removing a worker from the weekly board (`onWeekDetailRemoveStaff`) calls the API
service **directly, with no confirmation dialog** — the confirm step lived in the deleted
assignee-click flow.

## Architecture

### Module & DI

`WeeklyResourcePlannerModule` is a lazy NgModule declaring 20 components (17 board components + 3
dialogs — 9 of the 17 are `WeekGrid`'s own row-tier/toolbar/nav children, see "WeekGrid's internal
split" below) and providing **8 services**, all in the module's `providers` (`@Injectable()`, no
`providedIn: 'root'`) so each gets a fresh instance per route entry and resets cleanly on
navigation:

```
WeeklyResourcePlannerApiService, StaffPoolService, DispatchProjectViewService, VehiclePoolService,
WeeklyResourcePlannerNotificationService, WeeklyResourcePlannerStateService, WeeklyBoardService,
WeeklyGroupByBuilderService
```

It imports `ActiveworkModule` (reuses activework services for the actual mutations),
`DragDropModule`/`OverlayModule` (CDK, though drag detection is native HTML5 — see below), a broad
set of Material + `ng-bootstrap` modules, `SharedModule`, and declares the single child route
`{ path: '', component: WeeklyResourcePlannerShellComponent }`.

### Component map & data flow

```
WeeklyResourcePlannerShellComponent   route component, 29 lines
  ngOnInit (IN THIS ORDER): viewState.init() -> ldfApis.init() -> loadStaff() -> loadJobs()
  ngOnDestroy: ldfApis.destroy()
  └── WeeklyResourcePlannerComponent   PAGE ORCHESTRATOR (787 lines) — only component that mutates data
        │
        ├─ Toolbar            week nav, 6 filter menus, Weekly Ops chips, day-summary panel
        │                       ▲ dailyStatusSelected, createItw, openAudit, opsFilterSelected
        │
        ├─ ResourcePool       ▼ staffPool, vehiclePool, dailyStatusFilter, opsStaffIds, collapsed
        │     │                ▲ collapsedChange, selectionChange, vehicleSelectionChange
        │     ├─ StaffPool       ▼ staffPool, dailyStatusFilter, opsStaffIds, searchTerm
        │     │                  ▲ staffDragStart, staffClick, selectionChange
        │     └─ VehiclePool     ▼ vehiclePool, searchTerm
        │                        ▲ vehicleDragStart, selectionChange
        │
        ├─ WeekGrid           ▼ projects, days, dayOps, staffById, weekRangeLabel, dueTodayCount,
        │     │                  dragType, selectedStaffIds, selectedVehicleId, activeDayMetric,
        │     │                  opsFilter, dueTodayOnly (two-way)
        │     │                ▲ cellClicked, dayOpened, dayMetricClicked, staffDropped,
        │     │                  vehicleDropped, dueTodayOnlyChange
        │     │  (injects WeeklyBoardService + WeeklyGroupByBuilderService directly — owns its
        │     │   own search/weekend/yard/group-by/expand state, NOT bound down from the page)
        │
        └─ DetailPanel        ▼ selection (WeeklyDetailSelection {aw,row,cell}), staffById
                               ▲ closePanel, openItw, openDay, removeStaff, removeVehicle
```

`WeekGrid` builds its own group-by tree internally from `WeeklyBoardService`/
`WeeklyGroupByBuilderService` and only emits **cell-level** and **row-label** events straight to
the page — same as before. Internally, though, `WeekGrid` is no longer one template: it's split
into 9 child components (toolbar, nav, mobile-nav, header, and one per row tier — group/project/
itw/assignment — plus an empty-state), all declared in this module, all nested under
`components/weekly-resource-planner-week-grid/`. See "WeekGrid's internal split" below — that
split is **internal to `WeekGrid`**, so it changes nothing about `WeekGrid`'s own contract with
the page orchestrator (same inputs/outputs as always); it only matters once you're editing inside
the grid itself.

Dialogs are opened imperatively via `MatDialog` from the page component, not placed in a template.

Event → action mapping in the page orchestrator:

| Child event                             | Orchestrator does                                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `staffDropped` (`StaffDropEvent`)       | duplicate-assignment toasts (see Business Rule 9), then `ldfApis.assignStaffToAssignment`                               |
| `vehicleDropped` (`VehicleDropEvent`)   | `ldfApis.assignVehicleToAssignment`                                                                                     |
| `cellClicked` / `dayOpened`             | resolves the ITW/day into a `WeeklyDetailSelection` and opens the detail panel                                          |
| `dayMetricClicked`                      | sets `activeDayMetric` (bound down as the metric highlight; also narrows `dailyStatusFilter`)                           |
| `removeStaff` (detail panel)            | `onWeekDetailRemoveStaff` → `ldfApis.removeAssigneeFromAssignment` **directly, no confirm dialog**                      |
| `removeVehicle` (detail panel)          | `onWeekDetailRemoveVehicle` → `ldfApis.removeVehicleFromAssignment` **directly, no confirm dialog**                     |
| `openItw` (detail panel)                | `onWeekDetailOpenItw` → `onEditAssignment` → opens `EditActiveWorkDialogComponent`                                      |
| `addAssignment` context (from WeekGrid) | `onAddAssignment` → `CreateActiveWorkDialog` → (project known ? section dialog : project picker) → `createActiveWork()` |
| `opsFilterSelected` (toolbar)           | sets `activeOpsFilter`, recomputes `opsStaffIds` via `syncOpsStaffIds()`, bound down to both pool and grid              |
| `dueTodayOnlyChange` (two-way, grid)    | `onDueTodayOnlyChanged` → `ldfApis.setShowDueToday()`                                                                   |
| `assignmentsChanged$` (SignalR)         | `ldfApis.refresh()` when payload date matches the current dispatch date, or is `null`                                   |

**Drag mechanism:** same native-HTML5 convention as the daily board, not CDK, despite
`DragDropModule` being imported. The page component's `@HostListener('dragstart')` reads
`event.dataTransfer.types`: `text/ldf-vehicle` → vehicle, otherwise staff, setting `dragType`
(`'staff'`/`'vehicle'`/`'none'`) bound down into `WeekGrid`. The grid additionally reads
`text/ldf-multi-staff` (JSON array of staff ids, for the pool's multi-select drag) off
`DataTransfer` on drop — the daily board has no multi-staff drag equivalent. `dragover` also
drives an edge-of-viewport **auto-scroll**: `@HostListener('dragover')` on the page component
scrolls `scrollContainer` via `requestAnimationFrame` run **outside the Angular zone**
(`ngZone.runOutsideAngular`), 80px edge threshold, speed scaled by proximity.

Other page-orchestrator responsibilities not present on the daily board:

- **Date/URL sync** — reads `?date=` on init (`ActivatedRoute.snapshot.queryParamMap`), writes it
  back on every `dispatchDate$` change with `router.navigate([], { queryParams: { date }, 
queryParamsHandling: 'merge', replaceUrl: true })`, `skip(1)` so the initial value doesn't churn
  history.
- **Avatar colour merge** — combines `DispatchProjectViewService.staffMap$` with
  `StaffPoolService.staffPool$` so each detail-panel/toast chip's `avatarBg` is the pool's
  `primaryDailyColor(...).dotColor`.
- **Detail panel restore** — `syncDetailPanel()` re-resolves the open panel against every rebuilt
  week tree by `{rowId, date}` reference (not the live objects, which are replaced wholesale on
  every assign/remove) and closes the panel if that row/day no longer exists.
- **Header overlap** — `syncHeaderOverlap()` measures `.page-header` and writes a CSS custom
  property (`--wrp-header-overlap` per the page's SCSS) because the route strips the mat-card
  margin that hides the header gap everywhere else, and the header is responsive/hides on scroll.
  A `ResizeObserver` re-measures since the header grows after first paint (breadcrumb resolves
  async, web font swaps in). A zero-height rect means "hidden now", not "no header" — do not treat
  it as absence.
- **Week-number toggle** — toolbar-local `showWeekNumber` (defaults `true`) flips via
  `toggleWeekNumber()` and only changes `selectedDateLabel`'s formatting
  (`updateDateLabel()` appends `· Week N` from `ldfApis.isoWeek(weekStart)` when on); it does not
  touch `selectedDateTooltip`, which always shows `Week N` regardless of the toggle. Not
  persisted to `viewState` — resets to `true` on reload.
- Adds/removes `body.weekly-resource-planner-active` in `ngOnInit`/`ngOnDestroy` — see
  `src/styles.scss` (search `weekly-resource-planner-active`), which neutralises `.home__content`
  padding and `mat-card` margin and forces definite heights so the board's own scroll regions
  work; without it the board sizes to content and inner scrollbars never appear.

`WeekGrid` itself owns real presentation logic the daily board's `ProjectView` doesn't need to:
weekend/yard visibility toggles, free-text search across project/ITW/role/time/staff/vehicle,
per-day column focus/expand (widens a day and swaps 3 compact metrics for the full 9), and **two
independent row filters that must both pass** — the page toolbar's `opsFilter` and the grid's own
`activeSummaryFilter` — both evaluated through the single shared predicate
`WeeklyBoardService.matchesOpsFilter()`.

**Mobile layout** — `WeekGrid` self-detects narrow viewports via `ResizeObserver` on the grid
scroll container: `mobileMode` flips true at `gridClientWidth <= MOBILE_MAX_WIDTH` (640px), no
`@Input` involved. In mobile mode the 7-column desktop grid becomes a **single-day paging view**:
`gridTemplate`/`gridMinWidth` switch to `MOBILE_COL` widths (narrower label/total columns, one
day column sized to fill the remaining viewport via `mobileDayWidth`), `toggleFocusDay` is
disabled (`focusedDate` desktop expand-a-day feature doesn't apply), and horizontal scroll of
`gridScroll` itself becomes the day pager — `updateMobileDayFromScroll()` derives
`mobileFocusedDayIndex` from `scrollLeft`, and `stepMobileDay(±1)`/the `canStepDayLeft`/
`canStepDayRight` getters (reusing `canScrollGridLeft`/`canScrollGridRight`) drive a step-button
bar — the `MobileNav` child component, purely presentational (`day`/`canStepLeft`/`canStepRight`
inputs, one `step` output), rendered behind the same `*ngIf` as the desktop `Nav`. Entering mobile mode auto-collapses day figures (`dayFiguresCollapsed = true`) and
scrolls to today's column (`scrollToInitialMobileDay`, falling back to the first visible day);
leaving mobile mode clears `focusedDate`. Desktop keeps its own `panGrid(±1)` button-pan
(distance = 65% of viewport, `scrollTo({behavior:'smooth'})`) as a separate, non-paging mechanism
— don't conflate the two when touching horizontal navigation.

### WeekGrid's internal split

`WeekGrid` used to be one 858-line `.ts` / 632-line `.html`. It's now an orchestrator plus 9 dumb
child components, all under `components/weekly-resource-planner-week-grid/` (each child in its
own subfolder alongside the parent):

```
weekly-resource-planner-week-grid.component.{ts,html,scss}   orchestrator — filters, group-by,
                                                               expand state, focused/mobile day,
                                                               scroll sync, copiedRef
weekly-grid-row.utils.ts                        pure helpers: totalLabel, totalSupportingLabel,
                                                 workTypeIcon — shared by the row components
weekly-resource-planner-week-grid-toolbar/       search, group-by select, Due Today/Weekend/Yard
                                                  switches, summary-count filter chips
weekly-resource-planner-week-grid-nav/           fake top scrollbar + pan buttons
weekly-resource-planner-week-grid-mobile-nav/    mobile step-day bar
weekly-resource-planner-week-grid-header/        day columns + day-status/metrics panel
weekly-resource-planner-week-grid-group-row/     group-by header row
weekly-resource-planner-week-grid-project-row/   project tier
weekly-resource-planner-week-grid-itw-row/       ITW tier
weekly-resource-planner-week-grid-assignment-row/ bottom tier — owns drag/drop AND tap-to-assign
                                                   for its own cells (hoveredCellId is local to
                                                   this component, not lifted to the orchestrator)
weekly-resource-planner-week-grid-empty-state/   no-results state
```

The `*ngFor`/`*ngIf` loop structure (groups → projects → ITWs → rows, `isProjectExpanded`/
`isItwExpanded` gates) stays in the **orchestrator's** template, not pushed down into the row
components — each row component gets exactly one item as an `@Input` and emits events straight
back to the orchestrator. This is deliberate: it's what keeps `staffDropped`/`vehicleDropped`/
`cellClicked` landing directly on `WeekGrid` with no re-emitting relay through
project-row → itw-row, which is exactly the daily board's group/row-layer problem this module
was originally built flat to avoid (see the module-level note above). Follow the same shape for
any new row-tier component: parent owns the loop, child owns one item + emits flat.

**Styling is global for the row-tier classes, on purpose.** `WeeklyResourcePlannerWeekGridComponent`
runs under `ViewEncapsulation.None`, and `.wrp-grid-row`/`.wrp-hierarchy-cell`/`.wrp-summary-cell`/
`.wrp-day-header`/etc. all live in **its** `.scss` file, not in each row component's. Reason: those
classes are shared across group/project/itw/assignment-row/header, which are five separate
components each with their own (Emulated-by-default) style scope — a rule declared inside any one
of them would never reach the others. Under `None` there's no `_ngcontent` attribute at all, so the
rule is truly global and reaches every child regardless of which component's template rendered the
element (verified in the compiled bundle: `.wrp-grid-row` carries no `_ngcontent`/`_nghost`
attribute, unlike the scoped rules sitting next to it in the same chunk). Per CLAUDE.md's
`:host`-under-`None` gotcha, the old `:host { ... }` block became a tag selector
(`app-weekly-resource-planner-week-grid { ... }`) for the same reason. **Each of the 9 child
components' own `.scss` is either genuinely empty (`:host { display: contents; }` only — group-row,
project-row, itw-row, assignment-row, header) or owns classes nothing else references (toolbar,
nav, mobile-nav, empty-state).** If you add a class used by more than one row-tier component, it
goes in the orchestrator's global stylesheet, not a child's — adding it to a child's scoped
stylesheet will silently fail to style the other components that also render that class.

Each row-tier component's root element still carries `.wrp-grid-row` directly (not wrapped in an
extra layout box) — `:host { display: contents; }` on the child means the custom element tag
Angular inserts (`<app-weekly-resource-planner-week-grid-project-row>`) contributes no box of its
own, so it's invisible to both CSS Grid layout and sticky positioning. This is what made the split
safe in the first place: **every `.wrp-grid-row` is its own independent CSS grid**, sized off the
`--wrp-grid-template`/`--wrp-grid-min-width` custom properties set on the ancestor `.wrp-grid` div
— rows are stacked block-level siblings, not grid items of one shared parent grid, so nesting each
row inside a wrapper component needed no subgrid trick.

`Nav`'s scroll-track element is read directly by the orchestrator (`@ViewChild
(WeeklyResourcePlannerWeekGridNavComponent) gridNav`, then `gridNav.scrollTrackRef.nativeElement`)
because the horizontal-scroll-sync algorithm has to coordinate two sibling DOM nodes (the fake top
scrollbar and the real `gridScroll` grid) imperatively — that coordination stays in the
orchestrator; `Nav` itself holds no sync logic, just exposes the element and a `spacerWidthPx`
input for the spacer's width (previously set via direct DOM mutation, now a bound `@Input`).

### Services

| Service                                    | Injected as             | Role                                                                                                                                                                                                                                                               |
| ------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WeeklyResourcePlannerApiService`          | `ldfApis`               | Orchestrator. Wraps `ResourcesService`/`AttendanceService`/`HandoverService`/`JobService`/`ActiveworkService`/`CreateActiveworkService`, owns filter subjects, builds week maths, performs all mutations with optimistic UI + rollback.                            |
| `StaffPoolService`                         | —                       | Builds `StaffPoolItem[]` — dispatch state, daily statuses, ticket status, colours. **`buildPoolForDate()` is weekly-only** — returns instead of pushing, called once per day by `WeeklyBoardService` for the day-column counts.                                    |
| `WeeklyBoardService`                       | —                       | Builds the weekly grid model: `days$`, `projects$` (Project→ITW→row tree), `dayOps$` (per-day 9-metric counts), `staffById$`; also `aggregate()` and the shared `matchesOpsFilter()` predicate.                                                                    |
| `WeeklyGroupByBuilderService`              | —                       | Group-by for the weekly grid's 8 modes; re-nests rows back into project→ITW→rows per group so the template renders identically under every mode.                                                                                                                   |
| `DispatchProjectViewService`               | `projectViewService`    | Single-day view model (`projects$`, `staffMap$`, `dateLabel$`). Survives only for two consumers post single-day-board removal: the toolbar's day-summary columns (`projects$`) and the page's toast display names (`staffMap$`). `dateLabel$` now has no consumer. |
| `VehiclePoolService`                       | —                       | `buildVehiclePool(vehicles, allItws, date)` → `vehiclePool$`.                                                                                                                                                                                                      |
| `WeeklyResourcePlannerNotificationService` | `dispatchNotifications` | SignalR `activeworkassignmentschanged` → `assignmentsChanged$`.                                                                                                                                                                                                    |
| `WeeklyResourcePlannerStateService`        | `viewState`             | Persists the whole board view to team-scoped localStorage (`LocalStorageKeys.WeeklyResourcePlannerState`). Dispatch date deliberately excluded — it lives in the `date` query param, not here.                                                                     |

`WeeklyResourcePlannerApiService` does NOT call HTTP directly, same rule as the daily module — new
data needs go through the wrapped feature services, not a fresh `HttpClient` call.

### Data flow

```
ResourcesService / ActiveworkService / AttendanceService / HandoverService / JobService
        │
        ▼
WeeklyResourcePlannerApiService.init()      <- toolbar filter subjects, dispatchDate$
        │  dates$ : AwForDate[]  (7 entries, Mon-Sun, NOT a single day like the daily board)
        ├──────────────────────────────┬────────────────────────────┐
        ▼                              ▼                            ▼
StaffPoolService               WeeklyBoardService           DispatchProjectViewService
  staffPool$ (focused day)       days$ projects$              projects$ staffMap$
                                  dayOps$ staffById$
        │                              ▼                            │
        ▼                        WeekGrid + DetailPanel              ▼
 StaffPool / VehiclePool                                    Toolbar day-summary panel
 components                                                  + page's toast display names
```

Mutations run the other way: component `@Output` → `WeeklyResourcePlannerComponent` handler →
`WeeklyResourcePlannerApiService` mutation (optimistic `dates$` update, rollback on error) →
`ActiveworkService` HTTP → SignalR echo → `refresh()`.

`dates$` holds **seven** `AwForDate` entries (one per day of the focused week), unlike the daily
board's single entry. `WeeklyBoardService` and `StaffPoolService.buildPoolForDate()` both consume
all seven; the resource pool (`StaffPoolService.staffPool$`) still reflects only the **focused
day**, same as the daily board.

## Business Rules

### 1. Week navigation & load window

`setDispatchDate(date)` zeroes the time, flips `isLoading$`, calls `loadForDate` (loads AW/absence/
allocations/attendance for `getWeekRange(date)`), and pushes `dispatchDate$`. `getWeekRange` finds
the Monday of the week containing `date`, then pads a business day either side of the whole
Mon–Sun span (`addBusinessDays(mondayUtcStart, -1)` .. `addBusinessDays(sundayUtcEnd, +1)`) — same
padding idea as the daily board's `getDayRange`, just around the whole week. `refresh()` re-runs
`setDispatchDate(currentDispatchDate)`.

`setWeekStart(date)` is the week-navigation entry point: finds the target week's Monday, and
focuses **today** if today falls inside that week, otherwise the Monday — so `dates$` and the
staff pool stay anchored to a real day, never an arbitrary Monday, when possible. `navigateWeek(±1)`
moves the current week's Monday by ±7 days and calls `setWeekStart`; `navigateWeek(0)` jumps to the
week containing today.

### 2. Active staff filter

Same as daily: only `active === true && !archived` staff participate;
`StaffPoolService` additionally excludes Head-Office staff from the pool entirely.

### 3. Staff dispatch state (drag eligibility) — `StaffPoolService`

Identical resolution order and vocabulary to the daily module's `StaffPoolService`
(`freeAllDay`/`partDayFree`/`fullyAssigned`/`multiSite`/`conflict`/`unavailable`, `canDrag` per
state, `hasFreeGap()` against worker-group time settings defaulting 06:00–18:00 with a 30-minute
threshold, `IsConflict()` pairwise overlap). See the `daily-resource-planner` skill's Business
Rule 3 for the full branch list — this module's copy is functionally the same code (see
"Duplication" below), just built once per day via `buildPoolForDate()` instead of once for the
whole board.

### 4. Staff daily state (badges) — `StaffPoolService.resolveDailyStatus`

Same 10-status vocabulary and `primaryDailyColor()` priority order as daily (noShows > holiday >
authAbsense > clockedOut > clockedIn > multipleSites > multiItws > assignedToSite > allocated >
unallocated). `WeeklyBoardService.dayOps$` counts these per day for the 9 day-column metrics in
`WEEKLY_DAY_OPS_METRICS` (`types/weekly-resource-planner.types.ts`); `WEEKLY_COMPACT_DAY_OPS_KEYS`
(`unallocated`/`allocated`/`noShows`) are the three shown when a day column is collapsed, the rest
appear only when that day is focused/expanded.

### 5. Ticket status

Same `expired` (any qualification past expiry) / `expiring` (within 30 days) / `valid` / `unknown`
vocabulary as daily, hardcoded 30-day threshold. `WeeklyBoardService.hasTicketAlert()` uses the
same 30-day window independently for the week-grid's per-cell risk badges — a second, parallel
30-day literal (see "Duplication" below).

### 6. Week grid build — `WeeklyBoardService.buildProjects`/`buildItw`

Rows are keyed by an ITW's **start/finish-time signature**
(`` `${sda.startTime}|${sda.finishTime}` ``), not by day-assignment id — so a slot recurring across
the week (e.g. "08:00–16:00 every day") collapses into **one row with up to seven cells**, because
the backend has no cross-day assignment identity of its own. Two day-assignments on the same ITW
with the same start/finish signature on the same day would collide (kept: first wins,
`if (row.cellsByDate[dateKey]) continue`) — a data anomaly, not expected in practice.

`WeeklyCell.dayAssignmentId` = the `AWStaffAssignment.id` for that specific day — the mutation
target, exactly like the daily board's `dayAssignmentId`. `WeeklyAssignmentRow.awrId` = the AWR id.
Both are carried on every `StaffDropEvent`/`VehicleDropEvent` — never collapse them, same rule as
daily.

`buildCell` derives: `workReady` (`readinessState === Ready && staffIds.length > 0`), `locked`
(`aw.isComplete === true` — locked cells reject drops), and `risks` (`no-staff` if empty,
`not-ready` if `NotReady`, `handover` if `Incomplete`/`Rejected`, `ticket` count of staff with a
ticket alert). `isYard` = the job's `costCentre === true`, same predicate as daily's project view.

### 7. Group-by views — `WeeklyGroupByBuilderService`

Same 8 `WeeklyGroupBy`/`DispatchGroupBy` modes, labels, icons and sort order as the daily
`DispatchGroupByBuilderService` (Project, Allocation, Role, Work Type, Readiness, Handover,
Principal, Gang), each with an unknown/unspecified bucket sorted last. The difference is only the
**shape** it groups: it re-nests `WeeklyProjectNode → WeeklyItwNode → WeeklyAssignmentRow[]` inside
each group (not flat assignments), so the grid template renders identically under every mode.
`Gang` groups by the most-common `teamName` across everyone allocated to that row **during the
whole week**, not just one day. This file's own header comment explicitly names the daily builder
as what it must agree with — a rare case of the "second derivation, documented" escape hatch in
CLAUDE.md being used correctly.

### 8. Optimistic mutations — `WeeklyResourcePlannerApiService`

Same shape as daily: snapshot `dates$`, apply an `optimistic*` transform, restore the snapshot in
`catchError`. Covers `assignStaffToAssignment`, `removeAssigneeFromAssignment`,
`moveStaffBetweenAssignments`, `assignVehicleToAssignment`, `removeVehicleFromAssignment`,
`removeStaffManagementRoleFromAssignment`. **`moveStaffBetweenAssignments` and
`removeStaffManagementRoleFromAssignment` currently have no caller** — the weekly grid has no move
or role-removal affordance (the daily board's `AssignmentRow` had both; the weekly grid never grew
equivalents). Don't assume they're dead just because unused — they follow the same
snapshot/rollback contract and are one wiring-up away from working if a UI affordance is added.

The optimistic helpers rebuild `dates$` immutably (spread `afd`, `awrs`, `staffDayAssignments`),
keyed on `awrId` + `dayAssignmentId`, identical pattern to daily. Keep the snapshot/rollback and
immutable-update shape for any new mutation.

### 9. Duplicate-assignment guard

`StaffDropEvent.skippedStaffIds` carries workers already on the target cell. The page component's
`onStaffDropped` surfaces this exactly like daily: all-skipped → error toast "Already assigned";
some-skipped → warning "Some staff skipped"; otherwise proceeds with the remainder. The grid itself
computes the split (`emitStaffDrop`'s `newIds`/`skippedIds`) before emitting, so the event already
arrives pre-partitioned.

### 10. Handovers & completion

Same as daily: `addHandoversToAw` keeps only `state !== 'InProgress'` handovers, sorts
`compareDesc` by `submittedDate`, sets `lastHandoverDate`. `awCompletedOnDate` excludes an ITW from
a date once `isComplete` and `isAfter(date, lastHandoverDate)`. `markIncompleteOverdue` is the same
ported LDF `applyAWStatus()` fix, with the same caveat noted in its own comment: the board's
range-fetch records don't carry `includedOGs`, so completeness can only be read from
`percentComplete` here.

### 11. Live refresh via SignalR

`WeeklyResourcePlannerNotificationService` listens for `activeworkassignmentschanged`
(`LDF_DISPATCH_NOTIFICATION_METHODS`, same method name as daily — they share the underlying
domain event). The page subscribes to `assignmentsChanged$` and calls `ldfApis.refresh()` only when
the payload date is `null` (reload all) **or matches the currently viewed dispatch date** — unlike
the daily board, which reloads on any non-null date since it only ever shows one day.

### 12. Weekly Ops filter — must never disagree with the board's own summary counts

`WeeklyOpsFilterKey` (`activeAssignments`/`withLabour`/`empty`/`allocations`/`distinctStaff`/
`vehicles`/`risks`/`staffRoles`) drives two independent controls that must both pass for a row to
show: the toolbar's Weekly Ops chips (`opsFilter`, page-level, also narrows the staff pool via
`syncOpsStaffIds()`) and the grid's own summary-count clicks (`activeSummaryFilter`, grid-local).
Both are evaluated through the single `WeeklyBoardService.matchesOpsFilter(row, cells, filter)`
predicate — this is the weekly equivalent of the daily module's
"one derivation" principle done right: **add a new filter key here, not as a second predicate in
the component.**

## Duplication vs `daily-resource-planner` (read before touching a shared-sounding service)

CLAUDE.md's "one derivation, everywhere" rule is **not followed** for three of this module's
services — they are near-verbatim forks of the daily module's services, not shared/reused code,
and they have already begun to diverge:

- **`staff-pool.service.ts`** (weekly, 700 lines) vs `daily-resource-planner/services/
staff-pool.service.ts` (681 lines) — diffing the two shows the entire dispatch-state, daily-status,
  ticket-status and colour logic is byte-for-byte identical, differing only in the types import
  path and one addition: the weekly version splits `buildStaffPool()` into a thin wrapper around a
  new `buildPoolForDate()` so `WeeklyBoardService` can call it once per day without touching
  `staffPool$`. **Any future bugfix to dispatch-state or daily-status resolution has to be applied
  in both files by hand**, and nothing enforces that. The 30-day ticket-alert threshold is a
  literal in both copies (plus a _third_ copy in `WeeklyBoardService.hasTicketAlert` — see below).
- **`dispatch-project-view.service.ts`** (weekly) vs `daily-resource-planner/services/
dispatch-project-view.service.ts` — same story: identical logic, differing only in the injected
  API service type and the types import. The weekly copy is now used for far less (only
  `projects$` for the toolbar day-summary and `staffMap$` for toast names, since the single-day
  board that used the rest of it was deleted) — worth considering whether it's still pulling its
  weight as a full fork.
- **`vehicle-pool.service.ts`** (weekly) vs the daily equivalent — same pattern, identical body,
  different types import.
- **`WeeklyGroupByBuilderService`** vs daily's `DispatchGroupByBuilderService` is the one case
  documented correctly: its header comment explicitly says it mirrors the daily builder's keys/
  labels/sort order and names _why_ it can't just reuse it (different tree shape — rows nested
  under project/ITW here, flat assignments there). That's the CLAUDE.md-sanctioned escape hatch
  used as intended; the three services above are not — they have no such comment, and their shapes
  don't actually differ enough to justify separate files.
- **The 30-day ticket-alert threshold exists in three places**: `StaffPoolService` (both module
  copies) and `WeeklyBoardService.hasTicketAlert()`. All three are independent hardcoded literals.
  If it ever needs to become configurable (daily's own skill already flags this with a
  `//TODO: Go settings` marker), all three have to change together and nothing will catch a
  missed one.

If you're fixing a bug in dispatch-state, daily-status, ticket-status, or the single-day project
view and you only find it reported against one board, **check the other module's copy of the same
file** before considering the fix done.

## Known Rough Edges (be aware, don't copy)

- Removing a staff member or vehicle from the weekly detail panel skips the confirmation dialog
  the daily board has for the equivalent action — a side effect of deleting the ported single-day
  board's assignee-click flow, not a deliberate UX decision. Flag before assuming it's fine to
  extend.
- `moveStaffBetweenAssignments` and `removeStaffManagementRoleFromAssignment` on
  `WeeklyResourcePlannerApiService` have no UI caller at all in this module.
- `DispatchProjectViewService.dateLabel$` has no consumer post single-day-board removal.
- `dispatch-project-view.service.ts` carries two `⚠️ POTENTIAL ISSUE` comments ported from the
  daily file; per `weekly-view.md` one of them (ITWs with no day-assignment on the dispatch date)
  is now stale here — `awForDate()` upstream already excludes those, so the
  `dayAssignments.length === 0` branch is unreachable from this feed. Confirm before trusting that
  comment at face value on either module.
- See "Duplication vs daily-resource-planner" above — three services are unmanaged forks, not a
  known-acceptable divergence.

## Checklist for changes here

- [ ] New logic goes in a service, not a component; `WeekGrid`, pools, toolbar stay dumb renderers
      (though `WeekGrid` legitimately owns more local UI state — search/weekend/yard/group-by/
      expand — than the daily board's components do; that's presentation state, not derivation).
- [ ] No signals, no standalone components — `standalone: false`, BehaviorSubject + `combineLatest`.
- [ ] New service is provided in the module's `providers`, `@Injectable()` (not root).
- [ ] Data comes via the existing wrapped feature services through `WeeklyResourcePlannerApiService`,
      not a fresh `HttpClient` call.
- [ ] Any mutation is optimistic with snapshot rollback via `catchError`, updating `dates$`
      immutably (keyed on `awrId` + `dayAssignmentId`).
- [ ] Drop/click/detail events carry BOTH the AWR id (`row.awrId`) and the `dayAssignmentId`
      (`cell.dayAssignmentId`) — never collapse them.
- [ ] Staff eligibility respects `canDrag` on the dispatch state; active/non-archived/non-Head-Office
      filter honored.
- [ ] Before editing dispatch-state / daily-status / ticket-status / project-view logic, check
      whether the equivalent daily-resource-planner file needs the same fix (see "Duplication").
      If you're the one adding a genuine divergence, name what it must agree with in a comment,
      the way `WeeklyGroupByBuilderService` does — don't let it become a fourth silent fork.
- [ ] New group-by modes added in `WeeklyGroupByBuilderService` with an unknown bucket sorted last,
      keeping keys/labels/icons/sort order aligned with the daily builder's.
- [ ] New row/board filters go through `WeeklyBoardService.matchesOpsFilter()`, the single
      predicate the toolbar chips and the grid's own summary counts both use — don't add a second
      one in a component.
- [ ] Toasts follow the assign/remove success/error convention; duplicate-assignment skips
      surfaced (all-skipped error, some-skipped warning).
- [ ] Persisted view state: read once with `take(1)` on `viewState.state$` on init, write with
      `patch()`, reset on `cleared$`. Dispatch date is never persisted there — it's the `date`
      query param.
- [ ] Run `npx prettier --write` on anything you touch.

See the `daily-resource-planner` skill for the sibling single-day board this module diverged
from (and the service-level duplication called out above), plus `code-patterns`,
`grid-patterns`, and `ldf-module-rules` for the repo-wide conventions both build on.
