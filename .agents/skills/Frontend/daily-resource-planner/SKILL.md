---
name: daily-resource-planner
description: >
  Architecture, service contracts, and business rules for the Daily Resource Planner (a.k.a.
  the labour dispatch / LDF-successor board) at src/app/daily-resource-planner. Use this skill
  whenever adding to or modifying the daily resource planner / dispatch board — staff pool,
  vehicle pool, project view, assignment rows, drag-drop staff/vehicle assignment, group-by
  views, dispatch date navigation, optimistic assign/move/remove, staff dispatch/daily state
  calculation, ticket status, or its SignalR live-refresh. Also trigger on "dispatch board",
  "resource planner", "staff pool", "vehicle pool", "assign staff to ITW", "drag staff",
  "DailyResourcePlannerApiService", "ldfApis", "StaffPoolService", "DispatchProject",
  "group by project/role/work type", or "optimistic assignment". This module is signals-free,
  NgModule-based, and follows the dumb-component / all-logic-in-services pattern.
---

# Daily Resource Planner

The Daily Resource Planner (`src/app/daily-resource-planner`) is a single-day labour dispatch
board — the successor to the old `ldf` god-component, rebuilt as dumb components over a stack of
services. It shows one day's ITWs (ActiveWorkRecords) grouped in a project view, with a draggable
staff pool and vehicle pool on the side. Drag a worker onto an assignment to allocate them; the
board updates optimistically and rolls back if the API fails.

It routes at `/daily-resource-planner` (`layout-routes.ts`), guarded by `MsalGuard` with
permission `intowork.ldf.write` (it shares LDF's permission; breadcrumb is "Daily Resource
Planner"). Note the route lists `MsalGuard` only — it does NOT stack `permissionCanActivate` the
way most routes do; the `permissions` data key is present but unenforced. Match the surrounding
route entries if you change this.

This is consistent with the repo's `ldf-new` approach: **signals-free, `standalone: false`
NgModule, dumb components, all logic in services, BehaviorSubject streams recomputed via
`combineLatest`.** Do not introduce Angular signals or standalone components here.

## Architecture

### Module & DI

`DailyResourcePlannerModule` is a lazy NgModule. All six services are provided in the **module's
`providers`**, not `providedIn: 'root'` — they are `@Injectable()` (no root), so each are scoped
to a single mounted board and reset cleanly on navigation. The module imports CDK `DragDropModule`

- `OverlayModule`, FontAwesome, a broad set of Material modules, `SharedModule`, and
  `ActiveworkModule` (it reuses activework services for the actual mutations).

### Component map & data flow

Data flows **down** as `@Input` (`▼`), user intent flows **up** as `@Output` events (`▲`). The
orchestrator (`DailyResourcePlannerComponent`) is the only component that talks to services: it
binds service streams into child inputs and turns child events into `ldfApis` calls. Every event
bubbles child → group → project-view → orchestrator unchanged (same event object re-emitted at
each level).

```
                         ┌──────────────────── SERVICES (all logic) ────────────────────┐
                         │  ldfApis (DailyResourcePlannerApiService)                     │
                         │    dates$ ─┐  isLoading$  dueTodayCount$  set*()/refresh()     │
                         │  StaffPoolService.staffPool$                                  │
                         │  DispatchProjectViewService.projects$ / staffMap$ / dateLabel$│
                         │  VehiclePoolService.vehiclePool$                              │
                         │  DispatchGroupByBuilderService (pure, used by project-view)   │
                         │  dispatchNotifications.assignmentsChanged$ (SignalR)          │
                         └───────────▲──────────────────────────────────────┬───────────┘
                        subscribes / │ set*(), refresh(),                    │ streams
                        mutation calls│ assign/move/remove                   ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ ShellComponent   ngOnInit: ldfApis.init(), loadStaff(), loadJobs()  · ngOnDestroy: destroy()
│  └── DailyResourcePlannerComponent  (ORCHESTRATOR — owns toasts, dialogs, groupBy, subscriptions)
│        │
│        ├─ Toolbar          ▲ dailyStatusSelected, createItw, openAudit
│        │                     (date nav / filters call ldfApis.set*() ; createItw → onAddAssignment)
│        │
│        ├─ ResourcePool     ▼ staffPool, vehiclePool, dailyStatusFilter, collapsed
│        │     │              ▲ collapsedChange, selectionChange (multi-select staff)
│        │     ├─ StaffPool     ▼ staffPool, dailyStatusFilter, searchTerm
│        │     │                ▲ staffDragStart, staffClick, selectionChange
│        │     └─ VehiclePool   ▼ vehiclePool, searchTerm
│        │                      ▲ vehicleDragStart
│        │
│        └─ ProjectView      ▼ projects, staffMap, dateLabel, dragType, searchTerm, selectedStaffIds
│              │              ▲ staffDropped, staffMoved, vehicleDropped, addAssignment,
│              │                assigneeClicked, rowClicked, editClicked, vehicleRemoved,
│              │                roleRemoved, resetBoard
│              │   (injects DispatchGroupByBuilderService; local `groupBy` state picks the builder)
│              └─ WorkTypeGroup  ▼ group, staffMap, dragType, selectedStaffIds, showNames/showProjectName, collapsed
│                    │           ▲ toggleCollapse, addAssignment, + re-emits all row events
│                    └─ AssignmentRow  ▼ assignment, staffMap, selected, dragType, selectedStaffIds
│                                      ▲ staffDropped, staffMoved, vehicleDropped, assigneeClicked,
│                                        rowClicked, editClicked, vehicleRemoved, roleRemoved
└───────────────────────────────────────────────────────────────────────────────────────┘
```

Event → action mapping in the orchestrator:

| Child event                           | Orchestrator does                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| `staffDragStart` / `vehicleDragStart` | pool notifies which item is dragging (selection/preview)                                 |
| `staffDropped` (StaffDropEvent)       | surface `skippedStaffIds` toasts, then `ldfApis.assignStaffToAssignment`                 |
| `staffMoved` (StaffMoveEvent)         | `ldfApis.moveStaffBetweenAssignments`                                                    |
| `vehicleDropped` (VehicleDropEvent)   | `ldfApis.assignVehicleToAssignment`                                                      |
| `vehicleRemoved` / `roleRemoved`      | confirm dialog → `ldfApis.removeVehicle…` / `removeStaffManagementRole…`                 |
| `assigneeClicked`                     | remove-assignee confirm → `ldfApis.removeAssigneeFromAssignment`                         |
| `addAssignment` / `createItw`         | project-picker / create-ITW dialog → `ldfApis.createActiveWork`                          |
| `dailyStatusSelected`                 | sets `activeDailyStatus` (bound down as `dailyStatusFilter`) — highlight only, no reload |
| `assignmentsChanged$` (SignalR)       | `ldfApis.refresh()`                                                                      |

**Drag mechanism:** despite `DragDropModule` being imported, drag-type detection uses **native
HTML5 drag-and-drop**, not CDK. The orchestrator has `@HostListener('dragstart')` /
`('dragend')` that read `event.dataTransfer.types` — MIME `text/ldf-vehicle` means a vehicle
drag, otherwise staff — and set `dragType` (`'staff'`/`'vehicle'`/`'none'`), which it binds down
into `ProjectView` so drop zones light up. Keep the MIME-type convention when adding drag sources.

`ResourcePool` is a layout wrapper that simply hosts `StaffPool` + `VehiclePool` and forwards
their selection/collapse events. `ProjectView` builds its groups internally via
`DispatchGroupByBuilderService` keyed on its own `groupBy` field — the orchestrator passes
`projects`/`staffMap`, not pre-grouped data.

Components hold only UI state and delegate every action to a service. Business logic lives in the
services below — keep it that way.

### Services

| Service                                   | Injected as             | Role                                                                                                                                                           |
| ----------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DailyResourcePlannerApiService`          | `ldfApis`               | Orchestrator. Wraps existing feature services, owns filter subjects, builds the single-day `dates$`, and performs all mutations with optimistic UI + rollback. |
| `StaffPoolService`                        | —                       | Pure builder of `StaffPoolItem[]` — dispatch state (drag eligibility), daily states, ticket status, colors.                                                    |
| `DispatchProjectViewService`              | `projectViewService`    | Builds `DispatchProject[]` + `staffMap` from `ldfApis` streams via `combineLatest`.                                                                            |
| `DispatchGroupByBuilderService`           | —                       | Pure, stateless. Re-groups assignments by the 8 group-by modes.                                                                                                |
| `VehiclePoolService`                      | —                       | Pure builder of `VehiclePoolItem[]`.                                                                                                                           |
| `DailyResourcePlannerNotificationService` | `dispatchNotifications` | SignalR `activeworkassignmentschanged` -> `assignmentsChanged$`; the board calls `ldfApis.refresh()` on it.                                                    |

`DailyResourcePlannerApiService` does NOT call HTTP directly — it composes `ResourcesService`,
`AttendanceService`, `HandoverService`, `JobService`, `ActiveworkService`,
`CreateActiveworkService`. New data needs go through those, not a new HttpClient call here.

### Data flow

```
Toolbar sets dispatch date -> ldfApis.setDispatchDate(date)
  -> loadForDate(date): loads AW range, absence, allocations, attendance for a small business-day window
  -> dispatchDate$.next(date)
ldfApis.init() combineLatest([dateData$, staff$, handovers$, ...9 filter subjects])
  -> filters AW list, sets handover/inspection status, builds single-day dates$ (AwForDate[])
  -> StaffPoolService.buildStaffPool(...)   (writes staffPool$)
DispatchProjectViewService.init() combineLatest([dates$, dispatchDate$, staff$, staffPool$, jobs$])
  -> builds projects$ + staffMap$
DailyResourcePlannerComponent subscribes projects$/staffMap$/staffPool$, passes to project view.
User drags -> AssignmentRow emits StaffDropEvent -> component -> ldfApis.assignStaffToAssignment(event)
```

`ldfApis.dates$` holds a **single** `AwForDate` for the dispatch day (not a week). `dispatchDate$`
is a `ReplaySubject(1)` so late subscribers still get the current date. The `combineLatest` in
`init()` uses `debounceTime(0)` to collapse the burst of filter emissions into one recompute.

## Business Rules

### 1. Dispatch date & load window

`setDispatchDate` zeroes the time, sets `_currentDispatchDate`, flips `isLoading$` on, and loads.
`getDayRange(date)` returns `addBusinessDays(utcMidnight, -1)` .. `addBusinessDays(utcEnd, +1)` —
a small window around the day (in UTC) so ITWs whose assignments straddle the day still load.
`refresh()` re-runs `setDispatchDate(currentDispatchDate)`.

### 2. Active staff filter

Only `active === true && !archived` staff participate, and the pool additionally excludes anyone
whose `location === 'Head Office'`. All pool/state/count logic must respect this.

### 3. Staff dispatch state (drag eligibility) — `StaffPoolService`

Each worker gets a `StaffDispatchState` with a `canDrag` flag. Resolution order in
`resolveDispatchStateKey`:

1. Absence covering the date → `unavailable` (subtext: Annual leave / No show / Authorised
   absence / raw leaveType). `canDrag: false`.
2. No assignments and no allocations → `freeAllDay`. `canDrag: true`.
3. Overlapping time ranges on the day (`IsConflict`) → `conflict`. `canDrag: false`.
4. Allocated to >1 distinct project → `multiSite`. `canDrag: true`.
5. Assignments exist with a free gap in the 06:00–18:00 day (>30 min uncovered) → `partDayFree`.
   `canDrag: true`.
6. Otherwise assignments exist → `fullyAssigned`. `canDrag: false`.

So draggable states are `freeAllDay`, `partDayFree`, `multiSite`; blocked are `conflict`,
`fullyAssigned`, `unavailable`. Times are parsed from `"9am"/"5:30pm"` style strings via
`parseTimeToMinutes` — respect that format when adding time logic.

### 4. Staff daily state (badges) — `StaffPoolService.resolveDailyStatus`

Same 11-category vocabulary as the old LDF: `holiday`, `authAbsense`, `unallocated`,
`multipleSites`, `multiItws`, `noShows`, `clockedIn`, `clockedOut`, `allocated`, `assignedToSite`.
Key conditions:

- `holiday` = absence with `leaveType === 'Holiday'`; `authAbsense` = any non-Holiday absence.
- `unallocated`/`multipleSites`/`multiItws` only count for display users
  (`authGroup.groupName` in `['Handover User', 'Basic User']`).
- No-show / clock-in / clock-out only evaluated when `!isFuture(date)`:
  `noShows` = has allocation but no attendance record; `clockedIn`/`clockedOut` from attendance
  clock in/out dates.
- `assignedToSite` = appears in a `WorkItemType.AssignToSite` ITW's day assignments.

A staff member can hold several daily statuses; `primaryDailyColor` picks the display color by
priority (noShows > holiday > authAbsense > clockedOut > clockedIn > multipleSites > multiItws >
assignedToSite > allocated > unallocated). Keep that precedence if you touch coloring.

### 5. Ticket status

Derived from `qualifications` expiry: any expired → `expired`; any within 30 days → `expiring`;
else `valid`; no qualifications → `unknown`. The 30-day threshold is hardcoded (marked
`//TODO: Go settings`) — if you make it configurable, thread it through, don't just change the
constant silently.

### 6. Project view build — `DispatchProjectViewService`

Finds the `AwForDate` matching the dispatch date, groups its `awrs` by `projectId`, and maps each
ITW to one or more `DispatchLabourAssignment` (one per `staffDayAssignment` on that date; if none,
a single empty assignment). Crucial id distinction, preserved in the types:

- `DispatchLabourAssignment.id` = the **AWR id** (`ActiveWorkRecord.id`).
- `DispatchLabourAssignment.dayAssignmentId` = the **`AWStaffAssignment.id`** for the dispatch
  day. All drop/move/remove events carry both — pass both through to the API, never collapse them.

`projectId` is the job id, distinct from the AWR id — don't conflate. `isYard` = the job's
`costCentre === true`. Health status is filled-ratio (≥0.8 on_track, ≥0.4 warning, else behind).
Status icons cover work-readiness, handover status, ticket alerts, and multi-site.

### 7. Group-by views — `DispatchGroupByBuilderService`

Pure/stateless. Supports 8 `DispatchGroupBy` modes: Project, Allocation, Role, Work Type,
Readiness, Handover, Principal, Gang. Each builder buckets assignments and appends an
`*-unknown`/unspecified group that always sorts **last**. "Gang" groups by the dominant team name
across an assignment's assigned staff. Add new group modes here, not in the component.

### 8. Optimistic mutations — `DailyResourcePlannerApiService`

Assign / remove / move (staff, vehicle, staff-management-role) all follow the same shape:

```
const snapshot = this.dates$.getValue();
this.dates$.next(<optimistically-updated state>);
return this.activework.<mutation>(...).pipe(
  catchError((err) => { this.dates$.next(snapshot); return throwError(() => err); }),
);
```

The optimistic helpers rebuild `dates$` immutably (spread every level — `afd`, `awrs`, `sda`,
`staffMembers`/`vehicles`), keyed on `awrId` + `dayAssignmentId`. When adding a new mutation, keep
the snapshot/rollback and immutable-update pattern; never mutate the existing state in place.

### 9. Duplicate-assignment guard

`StaffDropEvent` carries `skippedStaffIds` for workers already on the target assignment. The
orchestrator surfaces this: all-skipped → error toast "Already assigned"; some-skipped → warning
"Some staff skipped"; otherwise proceeds. Preserve this UX when changing drop handling (recent
work added a duplicate-vehicle warning in the same spirit).

### 10. Handovers & completion

`addHandoversToAw` keeps only handovers with `state !== 'InProgress'`, sorts them `compareDesc` by
`submittedDate`, and sets `lastHandoverDate`. An ITW is excluded from a date once complete and
`isAfter(date, lastHandoverDate)` (`awCompletedOnDate`).

### 11. Live refresh via SignalR

`DailyResourcePlannerNotificationService` listens for `activeworkassignmentschanged`
(`LDF_DISPATCH_NOTIFICATION_METHODS`). The board subscribes to `assignmentsChanged$` and calls
`ldfApis.refresh()` (a null `date` in the payload means reload regardless). New server-pushed
changes should extend this service, not add ad-hoc hub wiring in a component.

## Known Rough Edges (be aware, don't copy)

- Debug `console.log`s remain in `DailyResourcePlannerApiService.init()` (approx lines 143–213,
  dispatchDate / allitws count / dayRange / awrs count) — remove them if you touch that block;
  don't add more.
- `dispatch-project-view.service.ts` has `⚠️ POTENTIAL ISSUE` comments documenting a possible
  empty-`staffMap` race (staff arriving after `dates$`) and phantom "empty" assignments for ITWs
  that overlap the day by range but have no assignment on it. Real, unresolved — factor them in
  when debugging empty/blank rows.
- Several `//Need clarification` / `//TODO` markers (e.g. `getJobTitleClass`, ticket 30-day
  window) mark intentionally-provisional logic.

## Checklist for changes here

- [ ] New logic goes in a service, not a component; components stay dumb renderers.
- [ ] No signals, no standalone components — `standalone: false`, BehaviorSubject + `combineLatest`.
- [ ] New service is provided in the module's `providers`, `@Injectable()` (not root).
- [ ] Data comes via the existing wrapped feature services through `DailyResourcePlannerApiService`,
      not a fresh `HttpClient` call.
- [ ] Any mutation is optimistic with snapshot rollback via `catchError`, updating `dates$` immutably.
- [ ] Drop/move/remove events carry BOTH the AWR id and the `dayAssignmentId`.
- [ ] Staff eligibility respects `canDrag` on the dispatch state; active/non-archived/non-Head-Office filter honored.
- [ ] New group-by modes added in `DispatchGroupByBuilderService` with an unknown bucket sorted last.
- [ ] Toasts follow the assign/move/remove success/error convention; duplicate-assignment skips surfaced.
- [ ] Copy old SCSS, rewrite TS only; theme tokens over hardcoded hex (note existing files still hardcode a lot — don't extend that).

See the `code-patterns`, `grid-patterns`, and `ldf-module-rules` skills for the repo-wide
conventions this module builds on.
