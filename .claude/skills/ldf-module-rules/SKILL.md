---
name: ldf-module-rules
description: >
  Enforces LDF (Labour Dispatch Form) business logic, architecture patterns, and validation rules
  when building new modules that copy from the LDF pattern. Use this skill whenever creating a new
  module based on LDF, copying LDF components, building board/scheduling views, implementing
  staff allocation logic, attendance tracking, labour cost calculations, drag-drop scheduling,
  or any module that follows the LDF architecture. Also trigger when someone says "new module",
  "copy from ldf", "ldf pattern", "board view", "scheduling module", or references staff/ITW/handover logic.
---

# LDF Module Rules

This skill enforces the business logic, architecture, and validation rules extracted from the LDF (Labour Dispatch Form) module. Every new module built from the LDF pattern MUST respect these rules. Skipping any of them will break scheduling, cost calculations, or staff management.

## Architecture Rules

### 1. Component-Service Separation

Components are dumb renderers. ALL logic lives in a dedicated service (like `LdfApisService`).

**Service responsibilities:**

- State management via BehaviorSubjects
- All filtering, calculations, and data transformations
- API calls and data loading
- Summary totals computation
- Labour cost calculations

**Component responsibilities:**

- Template bindings via `async` pipe
- Dispatching user actions to service methods
- UI-only state (drag state, dialog open/close, mobile detection)
- No business logic whatsoever

```
[Component] --pushes filters--> [Service BehaviorSubjects]
[Service combineLatest] --computes--> [Output BehaviorSubjects]
[Component template] --binds via async pipe--> [Output BehaviorSubjects]
```

### 2. State Management Pattern

Use `BehaviorSubject` streams, NOT NgRx, NOT Akita, NOT Angular signals (yet).

```typescript
// Input subjects — components push into these
readonly searchTerm$ = new BehaviorSubject<string>(undefined);
readonly selectedCMs$ = new BehaviorSubject<string[]>([]);
// ... more filters

// Output subjects — templates bind to these
readonly dates$ = new BehaviorSubject<AwForDate[]>([]);
readonly combinedTotals$ = new BehaviorSubject<SummaryTotals[]>([]);
```

All derived state recalculates in ONE `combineLatest` subscription that fires when ANY input changes. The subscription follows this exact pipeline order:

1. **Load & Parse** — parse JSON dates, merge existing + newly created records
2. **Filter** — apply each filter sequentially (search, CM, work item type, staff, status, readiness, project visibility)
3. **Status Calculation** — apply handover status, inspection status, overdue/incomplete checks
4. **Summary Totals** — count staff categories per day
5. **Labour Cost** — calculate cost and value per ITW per day
6. **Emit** — push results to output subjects

### 3. Service Lifecycle

- Service is `@Injectable()` (NOT `providedIn: 'root'` — provided in the module)
- `init()` method sets up all subscriptions
- `destroy()` method unsubscribes everything
- Component calls `init()` in `ngOnInit` and `destroy()` in `ngOnDestroy`
- Use a single `Subscription` container: `subs = new Subscription()` with `subs.add(...)`

### 4. Component Structure

```
MainComponent (orchestrator)
  injects Service
  delegates all events to service
  subscribes to service outputs
  |
  +-- HeaderComponent (@Input filter values, @Output filter changes)
  +-- SummaryBoxComponent (per-day totals, staff register)
  +-- DayColumnComponent (per-day column with cards)
       +-- CardComponent (individual record card)
```

### 5. SCSS Rule

Copy old SCSS files, rewrite TypeScript only. Never edit files in `src/scss/` (it is a submodule). Custom styles go in component `.scss` files or `src/styles.scss`. Use global theme tokens like `var(--theme-default)` from `_baton_custom_override.scss`, never hardcode hex colors.

### 6. Types

Define all interfaces in a dedicated `types/` directory within the module. Key interfaces pattern:

```typescript
interface SummaryTotals {
  unallocated: TotalItem;
  holiday: TotalItem;
  noShows: TotalItem;
  multipleSites: TotalItem;
  multipleItw: TotalItem;
  noClockOut: TotalItem;
  clockedIn: TotalItem;
  authAbsense: TotalItem;
  allocated: TotalItem;
  clockedOut: TotalItem;
  assignedToSite: TotalItem;
}

interface TotalItem {
  count: number;
  staffTotals: StaffTotals[];
}

interface StaffTotals {
  id: string;
  name: string;
  projectId: string;
  clockToolTip: string;
}
```

Every total category tracks both a count AND the individual staff members. This is required for the summary box drill-down and for cross-referencing (e.g., excluding no-shows from labour cost).

---

## Business Logic Rules (MUST NOT SKIP)

### 7. Date Boundary Validation

**Drag-drop date constraints:**

- Regular users: can only drop on today or future dates
- Admin users: can also drop on dates within the last 7 days (uses `IsFromLast7DaysPipe`)
- Past dates beyond 7 days: always blocked, even for admins

```typescript
if (!isToday(newDate) && !isFuture(newDate) && !(isAdminUser && isFromLast7Days(newDate))) return;
```

**Staff reallocation (Ctrl+Click):**

- Only allowed on today or future dates
- Staff must come from same source ITW and same date
- Target must be a different ITW

```typescript
if (!isToday(date) && !isFuture(date)) return; // block past reallocation
```

### 8. Date Sequence Maintenance

When moving an assignment via drag-drop, the system must handle sequential dates:

- Check if adjacent assignments are sequential (1 calendar day apart)
- If dates ARE sequential: automatically shift all subsequent assignments by the same business-day offset
- If dates are NOT sequential (or ITW v2+): show dialog asking "move single date or all subsequent?"
- Weekend handling: if source date is weekend and target is weekday (moving forward), add +1 to business day diff
- After any move, re-sort `staffDayAssignments` by date
- If moved assignment is index 0, update `aw.startDate` to the new date

### 9. No-Show Detection

A no-show is a staff member who was assigned to a project on a specific date but has NO attendance record for that project+date combination.

**Conditions (ALL must be true):**

- Date is today or in the past (`!isFuture(date)`)
- Staff member has an assignment for that project on that date
- No attendance record exists matching `userId + projectId + date`
- Staff member is NOT on holiday
- Staff member is NOT on authorized absence
- Staff member not already counted (deduplicate by `id + projectId`)

### 10. No-Clockout Detection

Staff who clocked in but never clocked out.

**Conditions:**

- Date is today or past
- Staff has an attendance record for that project+date
- The attendance record has NO `clockOutDate`
- Deduplicate by `id + projectId`

### 11. Clocked-In / Clocked-Out Counting

- Same staff clocked in at multiple projects = count each project separately in the totals
- But deduplicate by `staffId + projectId` (no double-counting same person at same project)
- Clock-in tooltip shows: `Clock In at HH:mm`, optionally `(By supervisorName)` if supervisor override
- Clock-out appended: `Clock Out at HH:mm`, optionally with supervisor override

### 12. Unallocated Staff

Staff with no assignment AND no absence on a given date.

- Only count staff with `userTypesToDisplay` = `['Handover User', 'Basic User']`
- Exclude staff who have ANY assignment (across all ITWs, not just filtered ones) — uses `allAssignments`, not filtered
- Exclude staff on any type of absence (holiday or authorized)

### 13. Multi-Site / Multi-ITW Detection

**Multiple Sites:** staff assigned to more than one distinct `projectId` on the same date
**Multiple ITW:** staff with more than one assignment record on the same date (regardless of project)

Both exclude absent staff from the count. Both use filtered assignments (only visible ITWs).

### 14. Labour Cost Calculation

Two different formulas based on ITW version:

**ITW v2+ (newer):**

```
cost = hours * gangHourlyGrossLabour
value = hours * gangHourlyNetLabourCost
```

**ITW v1 (legacy):**

```
gangRate = sum of staff rates (excluding no-show staff)
cost = gangRate (default)

// If start/finish times exist:
hourlyRate = gangRate / 8
actualHours = getDailyHours(assignment)
cost = hourlyRate * actualHours

// Value calculation:
valueDivisor = totalAssignmentDays - noShowDays
value = awLabourValue / valueDivisor

// Edge cases:
// If cost=0 and date is past → value=0 (no-show day)
// If valueDivisor=0 → value=0
```

No-shows in the past reduce labour value by reducing the divisor. This is critical for accurate cost reporting.

### 15. Summary Totals Creation

For EACH day in the date range, calculate all 11 total categories:

| Category       | Logic                                                         |
| -------------- | ------------------------------------------------------------- |
| holiday        | Staff on absence with `leaveType === 'Holiday'` for that date |
| authAbsence    | Staff on absence with `leaveType !== 'Holiday'` for that date |
| clockedIn      | Staff with attendance records on that date                    |
| clockedOut     | Staff with `clockOutDate` on that date                        |
| noShows        | Assigned but no attendance, not absent (past/today only)      |
| noClockOut     | Has attendance but no clockout (past/today only)              |
| allocated      | Unique staff with any assignment on that date                 |
| unallocated    | Active workers with no assignment and no absence              |
| multipleSites  | Staff assigned to >1 project                                  |
| multipleItw    | Staff with >1 assignment record                               |
| assignedToSite | Staff in `WorkItemType.AssignToSite` ITWs                     |

**Header totals are different from summary totals:** header totals further filter no-shows to only those who truly have NO attendance on that date (across all projects). A staff member might be a "no-show" for one project but clocked in at another.

### 16. Overdue/Incomplete Status

An ITW is marked as incomplete+overdue when ALL of these are true:

```typescript
// 1. Not all OGs are 100% complete
const completedOgs = aw.includedOGs.filter((og) => og.percentComplete === 100).length;
const isComplete = completedOgs === aw.includedOGs.length;

// 2. Overall percent is not 100
aw.percentComplete !== 100;

// 3. Expected handover date has passed (but NOT if it's today)
handoverDateExceeded(aw.expectedHandoverDate);
// Returns true if: date is null, OR date is in the past AND not today

// 4. ALL assignment dates are strictly in the past (none today or future)
aw.staffDayAssignments.every((ass) => isBefore(ass.date, now) && !isToday(ass.date));
```

When all conditions met: `aw.incompleteOverdue = true` and status class = `'inComplete'`

### 17. Status Class Determination

Priority order for card display class:

```
1. Not published OR no staff assigned → 'unassigned'
2. WorkItemType is AssignToSite → 'assign-to-site'
3. Has inspection → use inspectionStatus
4. No inspection → use handoverStatus
```

### 18. Staff Display Class Priority

When showing staff member styling (colors/badges), check in this order:

```
1. On holiday → 'holiday'
2. No-show (matching projectId) → 'no-show'
3. No clockout (matching projectId) → 'no-clockout'
4. Multiple sites → 'multi-project'   (skip if date is past)
5. Multiple ITWs → 'multi-itw'        (skip if date is past)
6. None of above → '' (default)
```

Multi-site and multi-ITW classes are only shown for today/future dates, not past.

### 19. Project Visibility Filtering

Two independent toggles:

```typescript
// hideCostCentres=true → hide jobs where job.costCentre === true
// hideSites=true → hide jobs where job.costCentre === false (or undefined)
```

Both can be true simultaneously (shows nothing). Both false shows everything. The filter applies to the ITW list by matching `aw.projectId` to `job.id`.

### 20. Handover Logic

- Handovers are filtered: only include state !== 'InProgress'
- Sorted by `submittedDate` descending (most recent first)
- `lastHandoverDate` = most recent handover's `submittedDate`
- An ITW is considered "completed on date" if `isComplete && isAfter(date, lastHandoverDate)`
- Completed ITWs are excluded from the board for dates after completion

### 21. Date Range / Week View

- Default: Monday to Sunday (7-day view)
- Mobile (width <= 500px): single day view
- Navigation: +/- 7 days (week mode) or +/- 1 day (day mode)
- Query param `?date=yyyy-MM-dd` sets initial date
- Range boundaries: Monday = start, Sunday = end
- If initial date is Sunday → that Sunday is the end, previous Monday is start

### 22. Drag Disabled Conditions

Drag is disabled when ANY of these is true:

- Device is mobile
- Date is in the past AND user is not admin or date is beyond 7 days
- All included OGs have 100% completion

### 23. Active Staff Filtering

Only `active === true && !archived` staff members participate in calculations. All totals, allocations, and cost computations must exclude inactive/archived staff.

### 24. Absence Date Check

A staff member is "absent on date" when:

```typescript
isWithinInterval(date, { start: absenceStartDate, end: absenceEndDate });
```

Both start and end dates are set to hour 0 before comparison. This means an absence that starts and ends on the same day covers that entire day.

---

## Checklist for New Module

When creating a new module from the LDF pattern, verify each item:

- [ ] Service created with all BehaviorSubject inputs and outputs
- [ ] Single `combineLatest` subscription following the 6-stage pipeline
- [ ] `init()` / `destroy()` lifecycle with `Subscription` container
- [ ] Components are pure renderers — no business logic
- [ ] Types defined in dedicated `types/` directory
- [ ] All 11 summary total categories implemented
- [ ] Header totals filter no-shows by actual attendance
- [ ] Labour cost uses correct formula per ITW version
- [ ] No-show detection excludes absent staff and future dates
- [ ] No-clockout detection only runs on past/today dates
- [ ] Date boundary validation respects admin/7-day rule
- [ ] Date sequence maintenance with dialog for non-sequential
- [ ] Staff reallocation restricted to today/future, same source ITW
- [ ] Overdue/incomplete status checks all 4 conditions
- [ ] Status class priority order preserved
- [ ] Staff display class priority with past-date exclusion for multi-site/ITW
- [ ] Project visibility filtering with dual toggles
- [ ] Drag disabled conditions all checked
- [ ] SCSS copied from old module, theme tokens used, no hex hardcoding
- [ ] Active staff filtering (active=true, not archived)
