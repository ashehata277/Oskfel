# Team Local Time — AttendanceService Change Report

> **Status:** report only — no product code has changed. Written 2026-10-06.
> **What it is:** every change the team-local plan needs in `AttendanceService` (clocking, wages, week commencing, reminders, projections, events, data), what each site does today in `Utc` mode and what it does in `TeamLocal` mode, the pay effects, the existing bugs found on the way, the tests and the shadow compare that gates the cut-over.
> **Parent plan:** `TEAM_LOCAL_TIME_PLAN.md` (Appendix A, steps `ATT-L.1–17`). **Data:** `TEAM_LOCAL_TIME_DB_MIGRATION_REPORT.md` (Attendance rows in Appendix A and B).
> Counts come from grep and a model scan over the working tree on 2026-10-06 (call sites and declared fields, not proven behaviour). Line numbers are from that tree.

---

## 1. Summary in numbers

| Item | Count | Notes |
|---|---|---|
| Non-test `.cs` files | 292 | API, Core, Background, `EventIdFiller` |
| Files that touch dates | 143 | 49% of the service |
| Clock reads | **40** | 32 business → `IDateTimeProvider`; 8 technical → `ISystemClock` (section 5.1) |
| `Parse` of request dates | **27** | `WageController` 17, `AttendanceController` 4, `FilterAndSortExtension` 2, `GetWagesByProjectIdHandler` 2, legacy override constant 2 |
| Files with a London zone | **9** | `WageCalculatorExtension`, `ClockInOutTimeCalculator`, `WageWeekDateCalculator`, `WageHelper`, `WageHelperLegacy`, `SupervisorClockInHandler`, `SupervisorClockoutHandler`, `ReminderService`, `AttendanceBackgroundJobExtensions` |
| DST adjustment sites | **33** in 8 files | `isSummer ? …`, `AdjustForDaylightSaving`, `RemoveDstSideEffect`, `NormalizeDate`, `ConvertTimeFromLondonToUTC` |
| `ObjectId.CreationTime` sites | **15** | `UserAttendanceRecord` 8, `WageRecord` 2, `WageBonus` 2, `WageWeekSnapshot` 2, `CreateWageWeekSnapshotHandler` 1 (+1 test assertion) |
| `.Date` uses | 133 | the day of a stored value; London day in TeamLocal mode |
| Elapsed-time subtractions | **8** | `WageCalculatorExtension` (T8) |
| Week-commencing lookups by exact match | **6** | `WageBonusRepo` ×3, `WageWeekSnapshotsRepo` ×1, `WageEventsRepo` ×1, `GetStaffMemberForWeekAsync` |
| Collections | 11 | 9 converted, 2 technical (inbox, outbox); Hangfire storage technical |
| Stored date paths | 46 | 34 instant, 10 calendar, 2 technical; 13 inside arrays. `StaffAssignments.CompletedDate` holds real times on dev, so it is an instant |
| Event stores | 2 | `Attendance:Events`, `Attendance:WageEvents` |
| Event payload classes with dates | 49 | 28 domain (55 paths), 21 integration (40 paths) |
| Recurring jobs | 2 | morning reminders 08:00, evening reminders 16:00, London zone |
| Container `TZ` | none | both Dockerfiles (API, Background) already run in UTC |
| Test files | 12 | **none** cover `WageCalculatorExtension`, `ClockInOutTimeCalculator`, `WageWeekDateCalculator`, `WageHelper` or `ReminderService` |
| Behaviour changes in TeamLocal mode | **14** (section 3) | 9 can change pay |
| Existing bugs found | **14** (section 4) | 8 fixed by TeamLocal mode, 6 need their own fix or a decision |
| Frontend services calling Attendance | 4 (+1 consumer) | `wage.service.ts`, `wage-legacy`, `wage-legacy-2`, `attendance.service.ts` (section 7) |


### 1.1 At a glance

**Code sites to change, by kind:**

```text
AttendanceService date sites by kind

.Date uses            ████████████████████████████████████████  133
Clock reads           ████████████                               40
DST adjustments       ██████████                                 33
Parse                 ████████                                   27
CreationTime          █████                                      15
Elapsed subtractions  ██                                          8
Exact WC matches      ██                                          6
```

**Files with the most date-related lines:**

```text
Date-related lines per file (top 11)

WageCalculatorExtension   ████████████████████████████████████████  55
WageRecordsRepo           ███████████████████████████████           43
FilterAndSortExtension    █████████████████████████                 35
WageController            ████████████████████                      27
WageHelperLegacy          █████████████████                         24
UserAttendanceRecord      ███████████████                           21
ClockInOutTimeCalculator  ███████████████                           20
WageWeekSnapshotsRepo     ███████████████                           20
IWageRecordsRepo          ██████████████                            19
WageHelper                ██████████                                14
GetTeamWagesAttendance…   ██████████                                14
```

**Clock reads (40)** and **stored date paths (46):**

```text
Clock reads (40)

Business: IDateTimeProvider  ████████████████████████████████          32   80 %
Technical: ISystemClock      ████████                                   8   20 %
Total                                                                  40  100 %
```

```text
Attendance date paths (46)

Instant (rule I)        ██████████████████████████████            34   74 %
Calendar date (rule C)  █████████                                 10   22 %
Technical (unchanged)   ██                                         2    4 %
Total                                                             46  100 %
```

**Behaviour changes (14)** and **existing bugs (14):**

```text
Behaviour changes in TeamLocal mode (14)

Can change pay  ██████████████████████████                9   64 %
No pay effect   ██████████████                            5   36 %
Total                                                     14  100 %
```

```text
Existing bugs found (14)

Fixed by TeamLocal mode           ███████████████████████                   8   57 %
Need their own fix or a decision  █████████████████                         6   43 %
Total                                                                       14  100 %
```

**Order of the ATT-L steps** (section 10):

```text
ATT-L.1   safety-net tests (Utc mode)
   │
   ├──► ATT-L.15  bug fixes, own release ───────────────────────────────────┐
   │                                                                        │
   ├──► ATT-L.2   kit ──┬──► ATT-L.5   wage calc        ──┐                 │
   │                    ├──► ATT-L.6   clock calc       ──┤                 │
   │                    ├──► ATT-L.7   week calc        ──┤                 │
   │                    ├──► ATT-L.8   WageHelper       ──┤                 │
   │                    ├──► ATT-L.9   supervisor msgs  ──┤                 │
   │                    └──► ATT-L.10  reminders        ──┤                 │
   ├──► ATT-L.3   clock reads ────────────────────────────┤                 │
   ├──► ATT-L.4   parsing ────────────────────────────────┤                 │
   └──► ATT-L.11  CreationTime ───────────────────────────┤                 │
                                                          ▼                 │
                                          ATT-L.12  TeamLocal tests         │
                                             ├──► ATT-L.13  TODO window     │
                                             ├──► ATT-L.14  dead query      │
                                             └──► ATT-L.17  dry-run, replay ┤
                                                                            │
F.8 wage services ──► ATT-L.16  frontend wage maths ────────────────────────┤
                                                                            ▼
                                                           Phase 4  shadow compare
```

---

## 2. How Attendance handles time today, and in TeamLocal mode

Today every stored value is a UTC instant. The code then mixes three views of it:

1. **UTC numbers used directly:** `.Date`, `DayOfWeek`, `.Hour` and `.TimeOfDay` on stored values give the **UTC** day, weekday and hour.
2. **London corrections:** in some places the code shifts by an hour in summer (`isSummer ? h - 1 : h`, `AdjustForDaylightSaving`, `RemoveDstSideEffect`, `ConvertTimeFromLondonToUTC`). Each one takes its DST reading from a different date: the clock time, the week start, or **today**.
3. **Week commencing stored as London midnight in UTC:** Sun 23:00Z in summer and Mon 00:00Z in winter. Lookups only work when both sides were shifted the same way. On dev, 1,403 `WageBonus` rows are at Sun `22:00Z`/`21:00Z` (midnight in a browser east of UTC); rule C case 2 converts them to the right Monday.

In TeamLocal mode the stored value is already London wall clock. Every correction becomes identity, and every `.Date`, `DayOfWeek` and `.Hour` gives the London answer with no code.

```text
Utc mode (today, unchanged until cut-over)

  Clock-in 07:55 BST ──DateTime.UtcNow──► stored 06:55Z
                                            ├──► start cap: isSummer ? 8 - 1 : 8, on the UTC date
                                            ├──► .Date = UTC day
                                            └──► week commencing = Sun 23:00Z

TeamLocal mode

  Clock-in 07:55 BST ──IDateTimeProvider.Now──► stored 07:55
                                                  ├──► start cap: 08:00 on the same date
                                                  ├──► .Date = London day
                                                  ├──► week commencing = Mon 00:00
                                                  └──► durations only: ITeamTime.Elapsed (T8)
```

**Rule for every code change in this report.** In `Utc` mode the result stays byte-for-byte the same as today; `ATT-L.1` pins it with tests before any edit. In `TeamLocal` mode the result is the London answer. Where a kit call reproduces today's result exactly (week commencing, overlap messages, reminder bounds), the code calls the kit with no branch. Where today's result depends on UTC numbers in a way the kit cannot reproduce (start and finish caps, weekday rules, durations), the method keeps today's body for `Utc` and adds a `TeamLocal` body. Phase 7 (P7.2) deletes the `Utc` bodies.

---

## 3. Behaviour changes in TeamLocal mode

These are the differences the shadow compare (section 9) must explain. "Window" means the times when today's code and TeamLocal mode disagree. "Pay" means the change can alter hours, pay, bonus or deductions.

| # | Area | Today (Utc mode) | TeamLocal mode | Window | Pay | Plan A.1 |
|---|---|---|---|---|---|---|
| **B1** | Force-start cap (`EstablishStartTime`, `GetClockInDate`) | start built on the **UTC** date of the clock-in, hour −1 in summer | start on the London date, hour as configured | clock-in 00:00–01:00 BST: today no cap (start is on the previous day), TeamLocal caps to the start time | **yes** (less pay for early clock-ins with `ForceStartTime`) | L-B1, L-B2 |
| **B2** | Finish cap (`EstablishFinishTime`, `GetClockOutDate`) | finish on the UTC date of the clock-out | finish on the London date of the clock-out | clock-out 00:00–01:00 BST: today capped at the previous day's finish, TeamLocal **not capped** (as in winter today, E7) | **yes** (more pay unless E7 is fixed) | L-B2 |
| **B3** | Weekday rules: Sat/Sun start times, standard hours, weekend flags, default start/finish | UTC weekday | London weekday | clock times 00:00–01:00 BST on Sat, Sun or Mon | **yes** (rate or standard hours of the wrong day) | L-B2 |
| **B4** | Grouping by day: `GetDateKey`, bonus unique-day count, deductions, no-shows, earliest attendance | UTC day | London day | values 00:00–01:00 BST | **yes** (day count for bonus/no-show) | L-B1, L-B7 |
| **B5** | Group start/end time for back-dated clocks (`ConvertTimeFromLondonToUTC`) | DST read from **`DateTime.Today`** | no conversion | a clock entered in one season for a day in the other (E2) | **yes** (cap 1 h off) | — |
| **B6** | Week commencing | Sun 23:00Z / Mon 00:00Z; approval window shifted twice (E1) | Mon 00:00 always; one window | every summer week | no (approval check only) | L-B3 |
| **B7** | Durations across a clock change (8 subtractions) | real elapsed | wall-clock difference, so `ITeamTime.Elapsed` keeps real elapsed (T8) | shifts across 01:00 on the last Sunday of March/October | **yes** if T8 is refused | L-B4 |
| **B8** | The repeated autumn hour (T9) | unambiguous | 01:00–02:00 happens twice; a clock-out in the second 01:xx can sort before a clock-in in the first | last Sunday of October, 01:00–02:00 | **yes** for those shifts | — |
| **B9** | Clock-out paired with an open clock-in (`UserAttendanceRecord` 123, 236) | same UTC day | same London day | clock-in 00:00–01:00 BST then clock-out the same morning: today **no match** (E6), TeamLocal matches | yes (fixes missing records) | L-B5 |
| **B10** | "First sign-in of the day" (`IsFirstSignInForDate`, `GetClockedInAttendance`) | UTC day | London day | 00:00–01:00 BST | yes (whether B1 applies) | L-B5 |
| **B11** | Report rows per day (`GetTeamWagesAttendanceForPeriodHandler`, `GetUserWagesAttendanceForPeriodHandler`) | `ClockIn.Date` = UTC day | London day | 00:00–01:00 BST | no | L-B7 |
| **B12** | "Today" in `WageCalculaterHelper` pending-weeks loop | `DateTime.UtcNow.Date` | `IDateTimeProvider.Today` | 00:00–01:00 BST every night (E10) | no | — |
| **B13** | Reminders | London day bounds converted to UTC; `UtcNow.Date` for "already clocked" | London day directly | none at 08:00 and 16:00 | no | L-B6 |
| **B14** | `Created`, `Updated`, `OverrideDate`, `OperationDate` | real UTC | London wall clock via `FromSystemInstant` | always | no (display only, same on screen after `ApiDateConverter`) | — |

**Sizing the windows before Phase 4** (run on a production copy in M0; the result goes in the shadow compare report):

```javascript
db.getCollection("Attendance:WageRecords").aggregate([
  { $match: { Deleted: false, "Attendance.ClockInDate": { $ne: null } } },
  { $project: {
      inLocal: { $dateToParts: { date: "$Attendance.ClockInDate", timezone: "Europe/London" } },
      outLocal: { $dateToParts: { date: "$Attendance.ClockOutDate", timezone: "Europe/London" } },
      inUtcDay: { $dateToString: { date: "$Attendance.ClockInDate", format: "%Y-%m-%d" } },
      inLocalDay: { $dateToString: { date: "$Attendance.ClockInDate", format: "%Y-%m-%d", timezone: "Europe/London" } },
      outUtcDay: { $dateToString: { date: "$Attendance.ClockOutDate", format: "%Y-%m-%d" } },
      outLocalDay: { $dateToString: { date: "$Attendance.ClockOutDate", format: "%Y-%m-%d", timezone: "Europe/London" } } } },
  { $group: { _id: null,
      clockInDayMoves: { $sum: { $cond: [{ $ne: ["$inUtcDay", "$inLocalDay"] }, 1, 0] } },
      clockOutDayMoves: { $sum: { $cond: [{ $ne: ["$outUtcDay", "$outLocalDay"] }, 1, 0] } },
      total: { $sum: 1 } } }
])
```

`clockInDayMoves` sizes B1, B3, B4, B10 and B11. `clockOutDayMoves` sizes B2. B7 and B8 are sized by counting records whose span contains the clock-change instants of each year (migration report M0.6).

---

## 4. Existing bugs found

| # | Where | Bug | Effect today | TeamLocal | Action |
|---|---|---|---|---|---|
| **E1** | `WageRecordApprovalHandler.cs:72-73` | `GetWeekCommencing` already applies `AdjustForDaylightSaving`; the handler applies it again | summer: "all clocked out" check runs Sun 22:00Z → Sun 22:00Z (London Sun 23:00 → Sun 23:00), so open records in the last hour of Sunday are missed | fixed (both calls identity) | test in ATT-L.12 |
| **E2** | `ClockInOutTimeCalculator.cs:79-88` | `ConvertTimeFromLondonToUTC` reads DST from `DateTime.Today`, not from the clock date | supervisor or back-dated clocks across a clock change get a start/end cap 1 h off | fixed (no conversion) | test in ATT-L.12 |
| **E3** | `ClockInOutTimeCalculator.cs:91-103` | `RoundToClosestMinutes` rounds 23:58 (5-min interval) to 1440 minutes and builds `new DateTime(…, 24, 0, …)` | `ArgumentOutOfRangeException`; the clock fails | **not fixed** | ATT-L.15: add the rounded minutes to `dateTime.Date` |
| **E4** | `ClockInOutTimeCalculator.cs:72-75` | `IsWeekday` tests `Day` (day of month) against 6 and 7 | unused | — | ATT-L.15: delete |
| **E5** | 133 `.Date` uses (B4, B11) | UTC day used as the working day | clock times 00:00–01:00 BST land on the previous day | fixed | ATT-L.12 |
| **E6** | `UserAttendanceRecord.cs:123, 236` | clock-out matched to a clock-in on the same **UTC** day | clock-in 00:00–01:00 BST is not found at clock-out | fixed | ATT-L.12 |
| **E7** | `WageCalculatorExtension.cs:685-703`, `ClockInOutTimeCalculator.GetClockOutDate` | finish cap uses the clock-out's own date | a shift crossing midnight is not capped (winter today; both seasons in TeamLocal) | **unchanged rule, wider window** | **Q-A1** for payroll: cap on the clock-in's day? |
| **E8** | `WageRecordsRepo.cs:152, 198, 238, 292, 420`; `WageWeekSnapshotsRepo.cs:123, 175, 213` | end of day as `to.AddDays(1).AddSeconds(-1)` with `<` | the last two seconds of the day are excluded | unchanged | ATT-L.15: `< to.AddDays(1)` |
| **E9** | `WageRecordsRepo.cs:96` | `//TODO: Verify time zone correctness` on `weekCommencing.AddDays(7)` | correct in winter; in summer the WC is Sun 23:00Z so the window is London Mon 00:00 → Mon 00:00, correct | correct | ATT-L.13: remove the TODO with a test |
| **E10** | `WageCalculaterHelper.cs:85, 155` | `DateTime.UtcNow.Date` as today | pending weeks stop one day early between 00:00 and 01:00 BST | fixed | ATT-L.3 |
| **E11** | `StaffMemberAbsenceDeletedHandler.cs:54`, `StaffMemberAbsenceCreatedOrUpdatedHandler.cs:72` | `DateTime.Now` depends on the container zone | correct only because the images have no `TZ` | fixed (`IDateTimeProvider.Now`) | ATT-L.3 |
| **E12** | `WageRecordsRepo.cs:194-200` | `potentialDeductions` query whose result is never used | one wasted query per call | — | ATT-L.14: delete |
| **E13** | `Frontend/src/app/wage/wage.service.ts` 923–2026 | the wage screen repeats the start/finish rule and day maths in the **browser's** zone; `toISOString().split('T')[0]` gives a UTC-day key (1159) | correct only on a London device; the key is the previous day in summer | fixed by `ApiDateConverter` + team-zone helpers | ATT-L.16 |
| **E14** | test projects | no unit tests on the three calculators that decide pay | every change here is untested today | — | ATT-L.1 first |

---

## 5. Changes per file

Column "Utc" is the result in `Utc` mode, which is always today's result. Column "TeamLocal" is the result after the flip.

### 5.1 Clock reads (40) — ATT-L.3

| File:line | Today | Change | Kind |
|---|---|---|---|
| `CQRS/Handlers/UserClockInHandler.cs:37` | `DateTime.UtcNow` | `dateTimeProvider.Now` | business |
| `CQRS/Handlers/UserClockOutHandler.cs:35` | `DateTime.UtcNow` | `dateTimeProvider.Now` | business |
| `CQRS/Handlers/UserSmartClockHandler.cs:57` | `DateTime.UtcNow` | `dateTimeProvider.Now` | business |
| `Utilities/ClockInOutTimeCalculator.cs:81` | `DateTime.Today` (DST read) | removed with `ConvertTimeFromLondonToUTC` (5.3) | business |
| `Utilities/Services/WageCalculaterHelper.cs:85, 155` | `DateTime.UtcNow.Date` | `dateTimeProvider.Today` as `DateTime` | business |
| `Background/Services/ReminderService.cs:57, 64, 100, 107, 198` | `DateTime.UtcNow`, `.Date` | `dateTimeProvider.Now` / `.Today` (5.7) | business |
| `Background/…/StaffMemberAbsenceDeletedHandler.cs:54` | `DateTime.Now` | `dateTimeProvider.Now` | business |
| `Background/…/StaffMemberAbsenceCreatedOrUpdatedHandler.cs:72` | `DateTime.Now` | `dateTimeProvider.Now` | business |
| `Events/Domain/WageBonusAwarded.cs:33, 38` | `WageOperationPerformer.*(…, DateTime.UtcNow)` | `now` parameter on the factory, passed by the handler from `dateTimeProvider.Now` | business |
| `Events/Domain/WageRecordApproved.cs:17`, `WageRecordApproved2.cs:21` | same | same | business |
| `Events/Domain/WageRecordOverridden2.cs:22`, `WageRecordOverridden3.cs:27` | `Date = DateTime.UtcNow` | same | business |
| `Events/Domain/WageWeekSnapshotTaken.cs:24` | `LockedBy` operation date | same | business |
| `Data/Models/User.cs` ×7 | `Updated = DateTime.UtcNow` | `now` passed in (the field is migrated as an instant) | business |
| `Data/Models/Team.cs:38` | initialiser `DateTime.UtcNow` | set by the handlers below | business |
| `Data/Models/ResourceAllocation.cs:28, 37` | `Updated = DateTime.UtcNow` | `now` passed in | business |
| `Background/…/TeamCreatedHandler.cs:62`, `TeamUpdatedHandler.cs:76` | `team.Updated = DateTime.UtcNow` | `dateTimeProvider.Now` | business |
| `Data/Repositories/TeamsRepo.cs:100` | cache expiry | `systemClock` (`DateTimeOffset`) | technical |
| `Data/Repositories/OutboundIntegrationEventsRepo.cs:54` | `PublishDate` | `systemClock.UtcNow` | technical |
| `Data/Repositories/IncomingIntegrationEventsRepo.cs:26` | `HandledDate` | `systemClock.UtcNow` | technical |
| `API/Controllers/AttendanceController.cs:79, 97, 116` | log text `DateTime.Now` | `systemClock.UtcNow` (log only) | technical |
| `CQRS/Handlers/AwardWageBonusHandler.cs:34, 47` | log text | `systemClock.UtcNow` (log only) | technical |

32 business, 8 technical. This replaces the plan's earlier estimate of ≈16 technical: `Updated` on `Users`, `Teams` and `ResourceAllocations` is migrated as an instant, so new writes must be wall clock too.

The domain events take the time in their constructors and static factories, so they cannot take DI. Each one gets a `DateTime now` parameter, passed by its creator from `dateTimeProvider.Now`. The creators are:

- `WageRecordApprovalHandler.cs:88` (`WageRecordApproved2`)
- `WageOverrideHandler.cs:45` and `DailyRateOverrideHandler.cs:89` (`WageRecordOverridden3`)
- `CreateWageWeekSnapshotHandler.cs:49` (`WageWeekSnapshotTaken`)
- `BonusHelper.cs:32, 40` (`WageBonusAwarded.AwardedByUser` / `AwardedBySystem`)

`WageRecordApproved` and `WageRecordOverridden2` have no live creator (they are only replayed). They get the same parameter for consistency.

### 5.2 Wage calculation — `Core/Extensions/WageCalculatorExtension.cs` — ATT-L.5

| Line | Method | Today | TeamLocal body |
|---|---|---|---|
| 16 | `_timezoneName` | Windows/Linux London id | removed; `ITeamTime` passed in |
| 600–625 | `EstablishDuration` | `clockOut - clockIn` | `teamTime.Elapsed(clockIn, clockOut)` |
| 650–668 | `EstablishStartTime` | DST read, `adjustedHour = isSummer ? h - 1 : h`, date = UTC date, seconds dropped | `clockIn.Date + start`, seconds dropped |
| 685–703 | `EstablishFinishTime` | same with clock-out | `clockOut.Date + finish` (E7 decision may change the date) |
| 76, 105, 232, 467 | hours | `(ClockOut - ClockIn).TotalHours` | `teamTime.Elapsed(…).TotalHours` |
| 167, 196 | travel gaps | `TotalMinutes` | `Elapsed` |
| 335 | span | subtraction | `Elapsed` |
| 338 | `GetDateKey` | `ClockInDate.ToString("yyyy-MM-dd")` | no code change; London day |
| 342, 626, 669, 704 | standard hours, default start/finish | UTC weekday | no code change; London weekday |
| 471, 549, 556, 576, 584 | bonus days, deductions, no-shows | `.Date` | no code change; London day |
| 495–508 | `GetAbsentDaysWithinWeek` | needs WC normalised by `RemoveDstSideEffect` | WC already Mon 00:00; doc comment at 492 removed in Phase 7 |
| 773 | `GetRecordsGroupedAndOrderdByDate` | UTC day | London day |
| 803–805 | `IsSaturday`, `IsSunday`, `IsWeekEnd` | UTC weekday | London weekday |

Only the start/finish methods and the 8 subtractions need a `TeamLocal` body. The `.Date` and weekday sites change meaning with the data and need no code, but each one gets a test (ATT-L.12).

The extension methods are static. `ITeamTime` reaches them as a parameter from their two callers, `RecalculateWageRecordHandler` and `DailyRateOverrideHandler`. Each private method keeps today's body under a `Utc` name and adds a `Local` body:

```csharp
private static TimeDto EstablishStartTime(ref DateTime clockIn, WorkerGroup workerGroup, TimeDto staffMemberStartTime, TimeDto projStartTime, ITeamTime teamTime) =>
    teamTime.Mode == TimeStorageMode.Utc
        ? EstablishStartTimeUtc(ref clockIn, workerGroup, staffMemberStartTime, projStartTime)
        : EstablishStartTimeLocal(ref clockIn, workerGroup, staffMemberStartTime, projStartTime);
```

### 5.3 Clock-in/out rules — `Core/Utilities/ClockInOutTimeCalculator.cs` — ATT-L.6

| Line | Today | TeamLocal |
|---|---|---|
| 20–68 `GetClockInDate` | weekday from UTC `clockDate`; `groupStartTime = ConvertTimeFromLondonToUTC(h, m)` (DST of today, E2); compares UTC `TimeOfDay`; force start `clockDate.Date.Add(groupStartTime)` | weekday, time of day and date all London; `groupStartTime = new TimeSpan(h, m, 0)` |
| 72–75 `IsWeekday` | wrong, unused (E4) | deleted |
| 79–89 `ConvertTimeFromLondonToUTC` | `DateTime.Today` + zone lookup | identity in TeamLocal; `teamTime.FromBusinessLocal(clockDate.Date + time) - clockDate.Date` in Utc mode would **change** today's result, so Utc mode keeps today's body |
| 91–103 `RoundToClosestMinutes` | hour 24 overflow (E3) | `dateTime.Date.AddMinutes(roundedMinutes)` in both modes |
| 105–137 `GetClockOutDate` | end cap via `ConvertTimeFromLondonToUTC`, `PayPastEndDay` | London end time |

The class is static and has 6 callers: `UserSmartClockHandler.cs:122, 132`, `UserClockInHandler.cs:56`, `UserClockOutHandler.cs:43`, `SupervisorClockInHandler.cs:92`, `SupervisorClockoutHandler.cs:124`. It becomes an injected service with a primary constructor:

```csharp
public sealed class ClockInOutTimeCalculator(ITeamTime teamTime) : IClockInOutTimeCalculator
{
    public DateTime GetClockInDate(DateTime clockDate, string workerGroupId, List<WorkerGroup> workerGroups, TimeDto userStartTime, TimeDto projectStartTime) =>
        teamTime.Mode == TimeStorageMode.Utc
            ? ClockInOutTimeCalculatorUtc.GetClockInDate(clockDate, workerGroupId, workerGroups, userStartTime, projectStartTime)
            : GetClockInDateLocal(clockDate, workerGroupId, workerGroups, userStartTime, projectStartTime);
}
```

`ClockInOutTimeCalculatorUtc` is today's static class renamed and frozen. Phase 7 deletes it.

### 5.4 Week commencing — `Core/Utilities/Services/WageWeekDateCalculator.cs` — ATT-L.7

The three London corrections are the kit's conversions. In Utc mode they return exactly today's values (checked on every Monday and Sunday from 2020 to 2030 in ATT-L.1). In TeamLocal mode they are identity.

```csharp
public sealed class WageWeekDateCalculator(ITeamTime teamTime) : IWageWeekDateCalculator
{
    public DateTime GetWeekCommencing(DateTime date, DayOfWeek startDay) =>
        AdjustForDaylightSaving(CalculateWeekCommencing(date, startDay));

    public DateTime AdjustForDaylightSaving(DateTime date) => teamTime.FromBusinessLocal(date);

    public DateTime NormalizeDate(DateTime storedDate) => teamTime.ToBusinessLocal(storedDate).Date;

    public DateTime RemoveDstSideEffect(DateTime value) => teamTime.ToBusinessLocal(value);
}
```

`CalculateWeekCommencing` keeps today's body.

| Caller | Today | TeamLocal |
|---|---|---|
| `WageRecordApprovalHandler.cs:72-73` | double shift (E1) | Mon 00:00; Phase 7 removes the second call |
| `RecalculateWageRecordHandler.cs:96` | `RemoveDstSideEffect(x).Date` on allocation dates | `x.Date` |
| `RecalculateWageRecordHandler.cs:211` | `ValidateWeekCommencing` on `RemoveDstSideEffect(WC).Date` | WC itself |
| `RecalculateWageRecordHandler` `GetWeekDateRange` | `from = WC` (not normalised), `to = from + 7 d − 1 tick` | same code; London week |
| `WageCalculaterHelper.cs:42` | `GetWeekCommencing(NormalizeDate(recordDate))` | same code; identity |
| `WageCalculaterHelper.cs:53, 62` | `GetWeekCommencing(recordDate)` on a UTC value | same code; London date |
| `WageCalculaterHelper.cs:88–92, 158–164` | `RemoveDstSideEffect(latest) + 7 d`, loop to `UtcNow.Date`, `AdjustForDaylightSaving` per week | loop to `Today`; identity |
| `WageCalculaterHelper.cs:99–102, 172–178` | `NormalizeDate(earliest)` | `.Date` |
| `StaffMemberAbsence*Handler` | `GetWeekCommencing(DateTime.Now)` | `GetWeekCommencing(dateTimeProvider.Now)` |

**Exact-match lookups.** These only work when stored and requested week starts follow the same rule. After the migration both sides are Mon 00:00: stored values by the calendar rule, requests by `ApiDateConverter.toApiDate` in the frontend.

- `WageBonusRepo.cs:21, 27, 47` (`WeekCommencing == wc`)
- `WageWeekSnapshotsRepo.cs:23`
- `WageEventsRepo.cs:159` (`Data.WeekCommencing`, inside the event store; the event migration must convert it)
- `GetStaffMemberForWeekAsync`

M4 adds a check that every stored `WeekCommencing` is midnight on the team's start day (section 8).

### 5.5 Other London code

| File | Today | Change | Step |
|---|---|---|---|
| `Data/WageHelper.cs:126-140` `CalcStdWage` | `earliest = isSummer ? 7 : 8`, `latest = isSummer ? 15 : 16` on UTC hours | TeamLocal body: 8 and 16 on London hours | ATT-L.8 |
| `Data/WageHelperLegacy.cs:215, 250` | same pattern ×2 | delete the class (never injected) | ATT-L.8 |
| `CQRS/Handlers/SupervisorClockInHandler.cs:197-209`, `SupervisorClockoutHandler.cs:199-211` | `ToLondonTime` for overlap log and message | `teamTime.ToBusinessLocal` (same result in Utc mode, identity in TeamLocal) | ATT-L.9 |
| `Background/Extensions/AttendanceBackgroundJobExtensions.cs:15-25` | Hangfire `TimeZone` = London | `teamTime.ScheduleZone` (still London) | ATT-L.10 |

### 5.6 Request parsing — ATT-L.4

| File | Sites | Endpoints | Change |
|---|---|---|---|
| `API/Controllers/WageController.cs` | 17 (`42, 43, 93, 114, 148, 149, 168, 169, 196, 197, 217, 218, 238, 274, 275, 381, 382`) | `GET /api/wage`, `GET snapshot`, `GET snapshot/my`, `GET projecttotals`, `POST all`, `GET {userId}`, `GET my`, `GET bonus`, `GET projecttotals/project/{id}`, `GET dailyallocated` | `WireDate.Parse` |
| `API/Controllers/AttendanceController.cs` | 4 (`225, 226, 256, 257`) | attendance ranges | `WireDate.Parse` |
| `Core/Extensions/FilterAndSortExtension.cs` | 2 (`202` `Parse` + `SpecifyKind Utc`; `259` `TryParse` with no styles) | grid filters | `WireDate.Parse`; `259` today depends on the server zone |
| `Data/Models/WageRecord.cs:134`, `API/CQRS/Handlers/GetWageRecordsForPeriodHandler.cs:42` | 2 | legacy override date `DateTime.Parse("1 January 2022")` | `new DateTime(2022, 1, 1)`; culture-independent, the same value in both modes |
| `API/CQRS/Handlers/GetWagesByProjectIdHandler.cs:48-49` | 2 (`TryParse`, no styles) | project wages filter | `WireDate.Parse`; today depends on the server zone |

In TeamLocal mode the API value is wall clock labelled `Z`. `WireDate` returns it as it is (Kind `Utc`, wall-clock numbers), so request code keeps its current shape.

### 5.7 Day bounds in repositories and the reminder service — ATT-L.10, ATT-L.15

| Site | Today | TeamLocal |
|---|---|---|
| `ReminderService.GetAllocationDateFilters` (195–205) | London day → UTC bounds | `(Today, Today + 1 d)`; the kit gives the same bounds in Utc mode via `FromBusinessLocal` |
| `ReminderService` 57, 100 | `GetAllForDateAsync(DateTime.UtcNow)` | `GetAllForDateAsync(dateTimeProvider.Now)` |
| `ReminderService` 64, 107 | `ClockOutDate?.Date == DateTime.UtcNow.Date` | `== dateTimeProvider.Today` |
| `UserAttendanceRepo.cs:32-34` `GetAllForDateAsync` | `datetime.Date` → UTC day | London day |
| `UserAttendanceRepo.cs:40-55`, `62`, `114` | ranges on `AttendanceRecords[].Date` | unchanged code |
| `ResourceAllocationRepo.cs:33-35` | `date.Date` | unchanged code |
| `StaffAssignmentRepo.cs:73-75` | `startOfTheDayUtc`, `endOfTheDayUtc` | rename to `dayStart`, `dayEnd` |
| `StaffAssignmentRepo.cs:82, 98`, `StaffMemberAbsenceRepo.cs:52-56` | calendar range and overlap | unchanged code |
| `WageRecordsRepo.cs:53-54, 577` | ranges on `ClockInDate`, `ClockOutDate` | unchanged code |
| `WageRecordsRepo.cs:116, 128, 139` | `.Date` grouping (earliest attendance, per day) | London day |
| `WageRecordsRepo.cs:152, 198, 238, 292, 420`, `WageWeekSnapshotsRepo.cs:123, 175, 213` | `< to.AddDays(1).AddSeconds(-1)` (E8) | `< to.AddDays(1)` |
| `WageWeekSnapshotsRepo.cs:30, 67, 104, 139, 197` | `from.DayOfWeek != Friday` | no change (true in both modes) |

### 5.8 Projections and `ObjectId.CreationTime` — ATT-L.11

| File | Lines | Field |
|---|---|---|
| `Data/Models/UserAttendanceRecord.cs` | 57, 190 | `Updated`, `Created` |
| `Data/Models/UserAttendanceRecord.cs` | 260, 272, 296, 308, 325, 342 | `SupervisorIn/OutOverride.OverrideDate` |
| `Data/Models/WageRecord.cs` | 73, 124 | `Updated`, `Created` |
| `Data/Models/WageBonus.cs` | 46, 65 | `Updated`, `Created` |
| `Data/Models/WageWeekSnapshot.cs` | 45, 61 | `Updated`, `Created` |
| `CQRS/Handlers/CreateWageWeekSnapshotHandler.cs` | 53 | `WageRecordSnapshotTaken` approver date from `id.CreationTime` |

Every site changes to `teamTime.FromSystemInstant(evt.EventId.CreationTime)`. The migration converts the stored values with the same rule, so a projection rebuilt from events equals the migrated projection (ATT-L.17).

`UserAttendanceRecord` day matching (`105, 111, 123, 138, 156, 162, 236`) needs no code; it follows the data (B9, B10).

### 5.9 Not changed (technical, stays real UTC)

- `Attendance:IncomingIntegrationEvents.HandledDate`, `Attendance:OutboundIntegrationEvents.PublishDate`.
- Hangfire storage collections.
- Cache expiry in `TeamsRepo`.
- Distributed lock keys and the semaphore in the clock handlers (no dates).
- `IntegrationEventPublisherService` delay.
- `EventIdFiller` (one-off tool; its `Stopwatch` is not a date).
- Outbox payload `Data` dates are business: the plan's B.l guard keeps old messages readable during cut-over.

---

## 6. Data

Full field lists are in the migration report, Appendix A (collections) and Appendix B (event payloads). Attendance totals:

| Collection | Instant | Calendar | Technical | Notes |
|---|---|---|---|---|
| `Attendance:UserAttendanceRecords` | 9 | — | — | `AttendanceRecords[]` array; `Date` equals `ClockInDate` before and after |
| `Attendance:WageRecords` | 9 | — | — | `OverrideDetail.Date`¹ legacy 2022-01-01 stays as it is |
| `Attendance:WageWeekSnapshots` | 8 | 2 | — | `WeekCommencing`, `Week[].Bonus.WeekCommencing`; nested `Week[].DayRecords[]` |
| `Attendance:WageBonus` | 3 | 1 | — | `WeekCommencing` exact-match key |
| `Attendance:Teams` | 2 | 3 | — | subscription dates |
| `Attendance:ResourceAllocations` | 1 | 1 | — | |
| `Attendance:StaffAssignments` | 1 | 1 | — | `Date` mixed on dev: London midnight, end of day (`23:59Z`/`22:59Z`, 10,178 rows), browser midnight (`21:00Z`); rule C cases 1–3. `CompletedDate` holds real times: instant (P0.5 confirms the 17,020 rows at `00:00Z`) |
| `Attendance:StaffMemberAbsence` | — | 2 | — | `StartDate`/`EndDate` stored as UTC midnight² (dev: 99 % `00:00Z`, 126 rows at `01:00Z`, 13 at `22:00Z`); rule C keeps the date in every shape |
| `Attendance:Users` | 1 | — | — | |
| `Attendance:IncomingIntegrationEvents` | — | — | 1 | |
| `Attendance:OutboundIntegrationEvents` | — | — | 1 | |
| **Total** | **34** | **10** | **2** | 13 paths inside arrays |

**Event stores.**
- `Attendance:Events` holds clock events: `UserClockedIn`/`2`, `UserClockedOut`, `SupervisorClockedIn`/`2`, `SupervisorClockedOut`/`2`, `SupervisorAbsent`, `SupervisorAttendanceCleared`, `AttendanceUpdated`, `AttendanceRecordModelUpdated`.
- `Attendance:WageEvents` holds wage events: `WageRecordCreated`, `WageRecordClockIn/OutUpdated`, `WageRecordApproved`/`2`, `WageRecordOverridden2`/`3`, `WageRecordSnapshotTaken`, `WageWeekSnapshotTaken`, `WageBonusAwarded`, and the `*ModelUpdated*` notifications.
- Altogether 28 domain classes, 55 paths. `WageWeekSnapshotTaken` carries 8, including `Week[].DayRecords[]`.

**Integration payloads** (21 classes, 40 paths) are converted in the outbox and inbox only for undelivered rows (migration report M2.4).

**Order.** In the migration order Attendance is the last business service (migration report 5). It is the largest nested data and the shadow compare reads it.

---

## 7. Frontend that calls Attendance

| File | HTTP calls | `toISOString` | Device-zone maths | Plan step |
|---|---|---|---|---|
| `src/app/wage/wage.service.ts` | 20 | 16 | 8 (`setHours` at 923, 1077, 1595, 1841, 1974, 2026; own start/finish rule 1955–2030; UTC-day key 1159) | F.8, ATT-L.16 |
| `src/app/wage-legacy/wage-legacy.service.ts` | 15 | 13 | 7 | F.8 (delete if unused) |
| `src/app/wage-legacy-2/wage-legacy2.service.ts` | 15 | 13 | 10 | F.8 (delete if unused) |
| `src/app/attendance/attendance.service.ts` | 11 | 4 | 4 | F.7 |
| `src/app/activework/labour-summary.service.ts` | consumer of wage data | — | 2 | F.4 |
| `HandoverApp` `attendance.service.ts` | — | — | — | H.1 |

What changes:
- `from`/`to` go through `ApiDateConverter.toApiDateRange` (day ranges; `to` = `toExclusive`) or `ApiDateConverter.toApiDateTime`.
- `wc` goes through `ApiDateConverter.toApiDate`.
- Received `ClockIn`/`ClockOut` are decoded by `ApiDateConverter.fromApiDateTime` before any maths.
- The wage screen's copy of the start/finish rule and its `setHours`/`isWeekend`/`isToday` calls use the UTC plan's team-zone helpers (`TeamTimeService`, `teamCalendar`), so they give London answers on any device.
- The UTC-day key at 1159 becomes a team-zone day key from `teamCalendar`.
- Display uses the `teamDate` pipe and `<app-date-time-field>` (UTC plan 6.F).

---

## 8. Tests

**Existing tests that change:**

| Test | Why |
|---|---|
| `WageRecordApprovalHandlerTests` (112–115) | mocks `GetWeekCommencing` and the second `AdjustForDaylightSaving` (E1); add a TeamLocal case where both return Mon 00:00 |
| `WageRecordTests` (88) | `Updated == EventId.CreationTime` → `FromSystemInstant(…)` |
| `UserSmartClockHandlerTests` (69–71), `SupervisorClockInHandlerTests`, `SupervisorClockoutHandlerTests` | fixtures from `DateTime.UtcNow`; switch to a fake `IDateTimeProvider` |
| `DailyRateOverrideCommandTests`, `WageOverrideHandlerTests` | `DateTime.UtcNow` fixtures; fake clock |

**New safety-net tests (ATT-L.1, Utc mode, written before any change).** They pin today's numbers, including the bugs in section 4, so the Utc body cannot drift.

- `WageWeekDateCalculator`: every Monday and Sunday 2020–2030, both start days; the kit-based version must equal today's.
- `ClockInOutTimeCalculator`: matrix below.
- `WageCalculatorExtension`: start, finish, duration, bonus days, deductions, no-shows, standard hours.
- `WageHelper.CalcStdWage`.
- `ReminderService` bounds at 08:00 and 16:00 in both seasons.

**Matrix for ATT-L.12 (TeamLocal mode, wall-clock fixtures):**

| Case | Dates | Clock times (London) | Expect |
|---|---|---|---|
| Winter day | 2026-01-14 | 07:30–16:30 | caps at 08:00 / 16:00 |
| Summer day | 2026-07-15 | 07:30–16:30 | same as winter |
| Early clock-in | 2026-07-15 | 00:30–09:00 | London day 15th; first sign-in; force start applies (B1) |
| Late clock-out | 2026-07-15 | 08:00–00:30 | E7 decision |
| Night shift | 2026-07-15/16 | 22:00–06:00 | grouping and pairing (B9) |
| Spring forward | 2026-03-28/29 | 22:00–06:00 | 7 h with T8 |
| Fall back | 2026-10-24/25 | 22:00–06:00 | 9 h with T8 |
| Repeated hour | 2026-10-25 | 01:30–01:10 | T9 rule |
| Saturday 00:30 | 2026-07-18 | 00:30 | Saturday rules (B3) |
| Week commencing | both seasons, both start days | — | Mon/start-day 00:00 |
| Back-dated supervisor clock | entered 2026-11-02 for 2026-10-20 | 07:00 | cap 08:00 London (E2) |
| Rounding near midnight | any | 23:58, 5-min interval | next day 00:00 (E3) |

Every case also runs in Utc mode, to check that the Utc body is unchanged.

---

## 9. Shadow compare (Phase 4, P4.3) — the cut-over gate

1. Restore the production copy and run the migration (M2) in a rehearsal environment.
2. Deploy Attendance with `Time:StorageMode = TeamLocal`.
3. For every team and every staff week in the last 26 weeks, call the recalculation path (`RecalculateWageRecordHandler`, dry-run flag added in ATT-L.17) and keep the result in memory.
4. Compare with the stored pre-migration `WageRecords` and `WageWeekSnapshots`, converted by the migration: hours per day, pay, bonus, deductions, no-shows, approval state.
5. Classify every difference:
   - **Explained:** the record falls in a section 3 window. Tag it with the B code (B1–B5 and B7–B10 can change pay).
   - **Unexplained:** blocks the cut-over until it is explained or fixed.
6. Report per team and week: identical, explained (with codes and the money total), unexplained. Finance signs it off; this closes T10 and Q7.

**Replay check (ATT-L.17).** For a 1% sample of `UserAttendanceRecords` and `WageRecords`, rebuild from the migrated events (`RebuildAttendanceRecordHandler`, `RebuildWageRecordHandler`) and compare with the migrated projection. The two must be identical; any difference means an event path or a `CreationTime` site was missed.

**Data checks (added to migration report M4):**
- every `WeekCommencing` is 00:00 on the team's start day;
- every `AttendanceRecords[].Date` equals its `ClockInDate`;
- `ClockOutDate >= ClockInDate`, except the counted T9 rows;
- every `WageBonus` week has its snapshot week where one existed before.

---

## 10. Steps (Appendix A of the plan) and order

| Step | Content | Sections | Size |
|---|---|---|---|
| ATT-L.1 | safety-net tests in Utc mode | 8 | L |
| ATT-L.2 | kit copy | — | S |
| ATT-L.3 | 40 clock reads, event factories take `now` | 5.1 | M |
| ATT-L.4 | 27 request parses | 5.6 | S |
| ATT-L.5 | `WageCalculatorExtension` TeamLocal bodies, `Elapsed` | 5.2 | M |
| ATT-L.6 | `ClockInOutTimeCalculator` → injected service | 5.3 | M |
| ATT-L.7 | `WageWeekDateCalculator` on the kit; callers | 5.4 | S |
| ATT-L.8 | `WageHelper`; delete `WageHelperLegacy` | 5.5 | S |
| ATT-L.9 | supervisor overlap messages | 5.5 | S |
| ATT-L.10 | reminders, Hangfire zone | 5.5, 5.7 | S |
| ATT-L.11 | 15 `CreationTime` sites | 5.8 | S |
| ATT-L.12 | TeamLocal tests (matrix) | 8 | M |
| ATT-L.13 | `WageRecordsRepo.cs:96` TODO | E9 | S |
| ATT-L.14 | delete `potentialDeductions` | E12 | S |
| ATT-L.15 | E3 rounding, E4 `IsWeekday`, E8 end-of-day bound (both modes) | 4 | S |
| ATT-L.16 | frontend wage maths on team-zone helpers | 7 | M |
| ATT-L.17 | recalculation dry-run flag, replay check | 9 | M |

**Order:**
1. ATT-L.1 first.
2. ATT-L.15 right after ATT-L.1, as its own release.
3. ATT-L.2–4 and 11 can run in parallel.
4. Then 5–10.
5. Then 12–14 and 17.
6. ATT-L.16 runs with F.8.
7. ATT-L.17 before Phase 4.

ATT-L.15 changes Utc-mode results: it fixes the midnight crash and two lost seconds at the end of each day. Ship it alone, before the rest, with its own release note, and update the ATT-L.1 tests that pinned those bugs.

---

## 11. Questions for payroll and finance

| # | Question | Default if unanswered |
|---|---|---|
| **Q-A1** | E7: should the finish cap use the clock-in's day (the shift's day) instead of the clock-out's day? | keep the clock-out's day (today's winter behaviour) |
| **Q-A2** | B1: force-start now applies to clock-ins between 00:00 and 01:00 BST. Is that intended? | yes (same as winter today) |
| **Q-A3** | T8: pay real elapsed time across clock changes (7 h / 9 h)? | yes (`Elapsed`) |
| **Q-A4** | T9: in the repeated autumn hour, is a clock-out that sorts before its clock-in read as +1 h? | yes, flagged for review |
| **Q-A5** | T10: may weeks before the cut-over be recalculated with the new code, or are they frozen? | frozen (approved weeks are never recalculated) |
