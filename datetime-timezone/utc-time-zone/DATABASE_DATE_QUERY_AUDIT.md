# Database Date Query Audit

Audit date: 2026-10-05, rechecked 2026-10-06 point by point against the code and `UTC_IMPLEMENTATION_PLAN.md`. Read-only audit of every repo under `Oskfel/`. Test projects and `bin`/`obj` are excluded. It is a read-through, not proof that every query was found: a query that builds its dates in a helper method could be missing.

All services use MongoDB (no SQL or EF found). Mongo evaluates dates in UTC unless a pipeline passes a `timezone`.

## How each point is judged

Matching types (UTC values against UTC `UtcNow`) is not enough. After the migration a point is a problem only if one of these two things still breaks it:

1. **Which day is "today" for the team.** `UtcNow.Date` and `x > UtcNow` flip at 00:00 UTC. The team's day flips at its own midnight. The gap is 1 hour for London in BST and up to 13 hours for other zones.
2. **Which shape the stored row has.** A calendar date is midnight of the day in the team's zone, stored as UTC (D1): `D-1 23:00Z` in BST and `D 00:00Z` in GMT for London. Old rows already have this shape, plus a few others (end of day, `01:00`, real times; dev profile), and nothing is rewritten (D4). `.Date` and exact matches are wrong for these rows; only the team-day range is right for all of them.

A comparison is fine when both questions have the same answer in every zone and for every stored shape: an instant field against `UtcNow`, or a range whose boundaries and rows follow the same rule.

Fix pattern for every point that needs one (decided, section 4.3 of the plan, "Query rule"): the handler computes `day = calendar.DayOf(clock.UtcNow)` once per request and passes the `DateOnly` down. The repository never calls `.Date`, `UtcNow` or `UtcNow.Date` in a filter; it filters on `window = calendar.DayRangeUtc(day)`, the team's day `[StartOfDayUtc(D), StartOfDayUtc(D+1))`, for calendar dates and instants alike: before D `< window.From`, D or later `>= window.From`, after D `>= window.To`, covers D `Start < window.To && End >= window.From`. Every row of the team's day falls inside, whatever its time of day. Every call and screen that answers the same question moves in the same release.

Verdicts used below:

- **Problem, fixed by plan**: a plan step changes this code (step shown).
- **Problem, not fixed**: the plan does not mention it, so it stays after the migration.
- **Decide**: a problem only under one reading of "today"; needs a rule from the owner.
- **Verify**: the field kind is not confirmed.
- **No problem**: with the reason.

The file has two parts: Part A executes in the database, Part B executes in the application.

## At a glance

**Points by verdict** (Summary table, 20 points):

```text
Audit points by verdict (20)

Problem, fixed by plan                    ████████████████                          8   40 %
Problem, fixed by plan, query rule added  ████████                                  4   20 %
Problem, plan step not written yet        ██████                                    3   15 %
Decide (needs a today rule)               ████                                      2   10 %
Verify                                    ██                                        1    5 %
No problem (dead code, delete)            ████                                      2   10 %
Total                                                                               20  100 %
```

**Legend**

| Label | Meaning | Example |
|---|---|---|
| Problem, fixed by plan | A plan step already changes this code. | `UserAttendanceRepo.cs:30` → ATT 8.6, 8.10 |
| Problem, fixed by plan, query rule added | Fixed with the section 4.3 query rule (handler passes `day`, repo builds a window). | `VehiclesRepo:296/:300` → 4.M.3, 4.M.4 |
| Problem, plan step not written yet | Fix agreed, no step in the plan. | `StaffMemberRepo:415` month count |
| Decide | Right or wrong depends on which "today" the owner wants. | `ActiveWorkRepo:351` future active work |
| Verify | The field kind is not confirmed. | `CPPrelimRepository:54` |
| No problem (dead code) | Never runs; delete instead of converting. | `WagesPipeline` Dublin stages |

**Points per service:**

```text
Audit points per service (20)

Attendance  ████████████████████████████████████████  6
Report.API  █████████████████████████████████         5
Materials   ███████████████████████████               4
ActiveWork  ████████████████████                      3
Resources   █████████████                             2
```

**Legend**

| Label | Points | Example |
|---|---|---|
| Attendance | `UserAttendanceRepo`, `ReminderService`, `StaffAssignmentRepo:75`, `ResourceAllocationRepo:35`, in-memory `.Date`, `WageRecordsRepo:200` | `WageRecordsRepo:200` `$dayOfWeek` in UTC |
| Report.API | `CPLabourDailyRepository`, `CPPlantRepository`, `CPPrelimRepository`, `WagesPipeline`, `WageCalculationStageBuilder` | `$dateToString` in `"Europe/London"` |
| Materials | `VehiclesRepo`, `VehicleUnAvailabilityRepo:46`, `:55-60`, `GetPaginatedVehiclesForTeamHandler` | `SoldDate` against `UtcNow.Date` |
| ActiveWork | reminder `:171`, range edges, `ActiveWorkRepo:351` | `[D-1 23:00Z, D 23:00Z)` window |
| Resources | `StaffMemberRepo:415`, `StaffMemberRepo:220/:248/:254` | future absences vs `UtcNow` |

**Rows by where the code runs** (Parts A and B):

```text
Audit rows by section (21)

A2  range filters              ████████████████████████████████████████  7
A1  Mongo date-part operators  █████████████████████████████             5
A3  compare with UtcNow        █████████████████████████████             5
B   in-memory .Date            ███████████████████████                   4
```

**Legend**

| Label | Meaning | Example |
|---|---|---|
| A1 | Mongo splits a date into parts; the zone decides the day. | `$dateToParts` with `"Europe/Dublin"` |
| A2 | `from` / `to` filters; safe only when rows and boundaries follow the same shape. | `ActiveWorkRepo.cs:131` |
| A3 | Filters against "now" or "today". | `StartDate >= DateTime.UtcNow` |
| B | `.Date` after reading, in C#. | `PlantHireStartDate.Date` |

**The query rule on one day** (plan section 4.3; team London, summer):

```text
                 every row for D, old and new: the team's midnight (D1)
                        │        end-of-day row for D
                        │                 │
 ───────────────────────●─────────────────●──────────────────────────●─────►  time (UTC)
                    D-1 23:00Z         D 22:59Z                   D 23:00Z
                        ▲                                            ▲
                   window.From                                  window.To
                        └────────── calendar.DayRangeUtc(D) ─────────┘

 on day D       Date >= window.From  &&  Date < window.To
 before D       Date <  window.From
 D or later     Date >= window.From
 after D        Date >= window.To
 covers D       Start < window.To  &&  End >= window.From
```

**Legend**

| Label | Meaning | Example |
|---|---|---|
| D | The team's calendar day, computed once per request: `calendar.DayOf(clock.UtcNow)`. | 2026-07-06 |
| Row for D | A calendar date for D, old or new: midnight of D in the team's zone, as UTC (D1). Nothing is rewritten (D4). | `2026-07-05T23:00Z` for 6 July |
| End-of-day row | An old row saved as the end of the London day (dev profile); still inside the window. | `2026-07-06T22:59Z` for 6 July |
| `window.From` / `window.To` | `calendar.DayRangeUtc(D)`: the team's day `[StartOfDayUtc(D), StartOfDayUtc(D+1))`. | `[2026-07-05T23:00Z, 2026-07-06T23:00Z)` |
| The five filters | The only comparisons a repository may use for a calendar day. | sold before today: `SoldDate < window.From` |

## Part A. Executes in the database

### A1. Mongo operators that split a date into parts

| Where | What it does | Verdict after migration |
|---|---|---|
| `Report.API/Data/Repositories/CPLabourDailyRepository.cs:1338`, `:1618` | `$dateToString` `%Y-%m-%d` in `"Europe/London"`, on delivery and collection event stamps (`OrderDelivered.Date`, `DriverDeparted.Date`, `CollectionLoaded.Date`) | **Problem, fixed by plan**: 4.F.4. The fields are instants, so the team zone is the right zone to split them in. London is hardcoded today |
| `Report.API/Helpers/WagesPipeline.cs:8`, `:138`, `:145` | `$dateToParts` on clock-in and clock-out in `"Europe/Dublin"` | **No problem today, dead output**: the only readers of `ClockInDateUK` are the unused helpers in `WageCalculationStageBuilder`. Plan step 4.F.5 converts it; deleting it is cheaper (see the pattern note below) |
| `Report.API/Helpers/WageCalculationStageBuilder.cs:145-164` | `$year`, `$month`, `$dayOfMonth` then `$dateFromParts`, no `timezone` | **No problem today, dead code**: `GetStandardWageCalculation()` is private and never called, so the chain never runs. Only `Build()` is live and it has no date logic. Delete rather than convert |
| `Report.API/Data/Repositories/CPMonthlyReportRepository.cs:270` | `$dateFromParts` for a constant `2000-01-01` sentinel; next to it `$add WeekCommencing + oneWeekMs` | **No problem** for the sentinel. The fixed-millisecond week arithmetic should be checked across the clock change |
| `AttendanceService/.../WageRecordsRepo.cs:200` | `.Project(x => new { ..., x.Attendance.ClockOutDate.Value.DayOfWeek })` is translated by Mongo to `$dayOfWeek` in UTC | **Problem, not fixed yet**, but in the part read its only consumer is commented out, so the query looks unused. Fix: delete it if unused; otherwise read the instant and use `calendar.DayOf(ClockOutDate).DayOfWeek` in memory. New finding |

Pattern note: the Mongo date-part operators exist only in Report.API today. They are string literals and C# properties that Mongo translates, so nothing in the plan's analyzer catches them. Proposed guard: one helper in the time kit that always emits `timezone`, a grep gate on the operator literals outside the helper, and a shared test with a 23:30Z clock-in in BST under London and New York calendars.

### A2. Range filters

A range `Date >= from && Date < to` is safe when rows and boundaries follow the same rule. With UTC-day boundaries it is only true away from the edges: a boundary `from = D 00:00Z` excludes a row for day D stored as `D-1 23:00Z` (London summer). With team-day boundaries (`calendar.DayRangeUtc`) every row of the day is inside.

| Where | Verdict after migration |
|---|---|
| `ActiveWorkService/.../ActiveWorkRepo.cs:131`, `:132` (`GetAllForDateRangeAsync`), `StaffAssignmentsRepo.cs:52`, `:96`, `:106` | **Problem at the edges, fixed by plan**: 5.3 and 5.11 apply the team-day window |
| `ActiveWorkService/.../StaffAssignmentsRepo.cs` `GetDistinctActiveWorkIdsForDateAsync` | **No problem for London, fixed by plan for other zones**: the window is already London's day, `[D-1 23:00Z, D 23:00Z)` in BST, the same as `calendar.DayRangeUtc(D)`. 4.A.4 and 5.3 move it to the team zone |
| `ActiveWorkService/Background/.../TomorrowStaffAssignmentReminderService.cs:171` | **Problem for non-London, fixed by plan**: `date` is `LondonMidnightAsUtc(...)` (the earlier "verify" is resolved). Same reasoning as above. Fixed by 4.A.4 |
| `AttendanceService/.../StaffAssignmentRepo.cs:75`, `ResourceAllocationRepo.cs:35` | **Problem, fixed by plan**: boundaries come from the caller (`ResourceAllocationRepo` uses `date.Date`, the UTC day). Reads use `calendar.DayRangeUtc` in ATT 8.6 and 8.7 |
| `MaterialsService/.../VehicleUnAvailabilityRepo.cs:46` (`StartDate.Date <= DayDate.Date`) | **Problem in summer, fixed by plan**: Mongo truncates in UTC, so a row for day D stored as `D-1 23:00Z` is read as D-1. Fix: the repo takes `DateOnly day` and filters `Start < window.To && End >= window.From` (4.M.3, 4.M.4, 5.8) |
| `MaterialsService/.../VehicleUnAvailabilityRepo.cs:55-60` (`today = DateTime.UtcNow.Date`, `Lte(StartDate, today)`, `Gt(EndDate, today.AddDays(-1))`) | **Problem, fixed by plan**: same fix as the line above, `today` comes from the handler (4.M.3, 4.M.4). New finding |
| `Report.API/.../CPPrelimRepository.cs:54` (`x.Date <= DateTime.UtcNow`) | **Verify** the field kind. An instant: no problem. A calendar date: pattern fix, "on or before today" is `Date < window.To` with `day` passed from the report service |

### A3. Comparison with `UtcNow` or `UtcNow.Date`

| Where | What it compares | Verdict after migration |
|---|---|---|
| `AttendanceService/.../UserAttendanceRepo.cs:30` | Instant field against `datetime.Date`; `ReminderService.cs:57`, `:100` pass `UtcNow`, so the window is the UTC day | **Problem, fixed by plan**: ATT 8.6 and 8.10 (`DayOf(UtcNow)`) |
| `MaterialsService/.../VehiclesRepo.cs:296`, `:300` | `SoldDate` (a calendar date the user picked) against `UtcNow.Date` | **Problem, fixed by plan** (4.M.3, 4.M.4): flips at 00:00 UTC. London BST: 1 hour late. New York: about 20:00 local on the sold day. Old rows stored `D-1 23:00Z` flip a day early in BST. Fix: handler passes `day`, sold is `SoldDate < window.From` (sold from the day after the sold date) |
| `ActiveWorkService/.../ActiveWorkRepo.cs:351` (`GetAllPaginatedAsync`) | `StartDate > utcNow` and `StaffDayAssignments.Any(s => s.Date > utcNow)`. **Both are calendar dates** (earlier version of this file called `StartDate` an instant; that was wrong) | **Decide**: day D leaves the list at 00:00Z on D. London rows are the team's midnight (D1), so day D leaves at local midnight at the start of D, today and after go-live. Today's own work is never in the list. **Decide, then not fixed yet.** Pattern fix: `GetAllActiveWorkRecordsPaginatedHandler` passes `day`; "after today" is `Date >= window.To` (keeps today excluded, anchored to the team's midnight); "today or later" is `Date >= window.From` (if today's work should be listed). Needs the rule from the owner |
| `ResourcesService/.../StaffMemberRepo.cs:220`, `:248`, `:254` (`StartDate >= DateTime.UtcNow`, bank-holiday absences and future absences) | Absence start (calendar date) against `UtcNow` | **Decide**: an absence starting today is excluded from "future" from 00:00Z on its day, not the team's midnight. Moves by 1 hour in BST after Phase 7. **Decide, then not fixed yet.** Pattern fix: the caller passes `day`; "future" is `StartDate >= window.To` (today's absence not future) or `>= window.From` (today's absence counts). Lines 220 and 248 delete or list bank-holiday absences, so the rule must be the same on all three lines. The earlier audit placed this in Materials; the file is in Resources |
| `ResourcesService/.../StaffMemberRepo.cs:415` (`GetNewStaffMembersThisMonthCount`) | `Created` (instant) between `new DateTime(today.Year, today.Month, 1)` and `lastDay`, built from `UtcNow` | **Problem, not fixed yet**: the month starts at 00:00 UTC, not at the team's midnight, and `lastDayOfMonth` is midnight, so `Created` on the last day after 00:00 is excluded. Pattern fix (instant): the handler passes `day`; the repo filters `Created >= StartOfDayUtc(firstOfMonth) && Created < StartOfDayUtc(firstOfNextMonth)`. New finding |

### Items that are not problems

| Where | Why |
|---|---|
| Any instant field compared with `DateTime.UtcNow` (`x.Date <= DateTime.UtcNow` when `x.Date` is an instant) | Both sides are points in time; correct in every zone |
| Ranges whose boundaries and rows use the same shape and are not near the edge | See A2 |

## Part B. Executes in the application (not a database problem)

In-memory `.Date` on UTC values after read (30+ hits). The Mongo driver returns UTC values, so `.Date` is the UTC day. On an **instant** that is wrong for clock times near midnight in BST. On a **calendar date** stored as the team's midnight (D1) it is wrong in summer for London (`D-1 23:00Z` gives D-1) and for every zone east of UTC. The cure for both kinds is `calendar.DayOf` (plan 4.3, 5.11).

| Where | Verdict after migration |
|---|---|
| `AttendanceService`: `UserAttendanceRecord.cs:111`, `:123`, `:138`, `:156` (clock instants) | **Problem, fixed by plan**: ATT 6.10-6.12, plus the `.Date` ban in 12.3 |
| `AttendanceService`: `WageRecordsRepo.cs:128` | **Problem, fixed by plan**: ATT 8.5 |
| `AttendanceService`: `WageCalculatorExtension.cs:549`, `:584` | **Problem, fixed by plan**: Attendance phases and the ban in 12.3 |
| `FrameworkCache`: `CPPlantRepository.cs:863`, `:870`, `:871` (`PlantHireStartDate.Date`) | **Problem, fixed by plan**: `PlantHireStartDate` holds a real time, so it is an instant (plan 4.3, dev profile), not a calendar date; 4.F.7 cuts it by the team's day instead of `.Date` |

## Summary

| Verdict | Points |
|---|---|
| Problem, fixed by plan | `CPLabourDailyRepository`, `CPPlantRepository:863-871` (4.F.7), `UserAttendanceRepo`, `ReminderService`, `TomorrowStaffAssignmentReminderService:171`, `StaffAssignmentRepo:75`, `ResourceAllocationRepo:35`, ActiveWork range edges (5.3), Attendance in-memory `.Date` |
| Problem, fixed by plan, query rule added | `VehiclesRepo:296/:300`, `VehicleUnAvailabilityRepo:46`, `:55-60`, `GetPaginatedVehiclesForTeamHandler` (4.M.3, 4.M.4, 5.8) |
| Problem, fix agreed in principle, plan step not written yet | `StaffMemberRepo:415`, `WageRecordsRepo:200`, and any new `.Date` outside Attendance |
| Decide (needs a "today" rule), then pattern fix | `ActiveWorkRepo:351`, `StaffMemberRepo:220/:248/:254` |
| Verify | `CPPrelimRepository:54` |
| No problem (dead code) | `WageCalculationStageBuilder`, `WagesPipeline` Dublin stages (delete) |

## Consequences for the plan

- Every pipeline stage with a `timezone` field takes the zone from the team's calendar, never a literal. Calendar dates are split with the team zone too, because they are stored as the team's midnight (D1).
- Query windows use `calendar.DayRangeUtc` for instants and calendar dates, never `.Date` or `UtcNow.Date`.
- "Is it past this day" checks use `calendar.DayOf(clock.UtcNow)` and a window, not `UtcNow`, for calendar-date fields.
- Delete the unused Dublin and `WageCalculationStageBuilder` code instead of converting it (step 4.F.5).
- Extend the `.Date` ban from Attendance to every repo, and add a grep gate and helper for the Mongo date operators.
