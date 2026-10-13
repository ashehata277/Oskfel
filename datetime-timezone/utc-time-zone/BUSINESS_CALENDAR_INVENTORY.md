# Business Calendar Inventory

Survey date: 2026-10-05. Read-only survey of every repo under `Oskfel/`. Test projects and `bin`/`obj` are excluded.

## Finding

No `IBusinessCalendar`, `IClock`, `TimeProvider` or `IDateTimeProvider` exists in any repo. The same London-zone code is copied in 10+ places across 7 services. Each copy picks the zone ID by OS (`"GMT Standard Time"` on Windows, `"Europe/London"` elsewhere), calls `TimeZoneInfo.FindSystemTimeZoneById`, then converts or finds a day boundary. All of them hardcode London.

## At a glance

**Files with a London-zone copy, per service:**

```text
London-zone copies: files per service (25)

Attendance   ████████████████████████████████████████  11
ActiveWork   ███████████████                            4
Handover     ███████████                                3
Resources    ███████                                    2
Materials    ███████                                    2
Report.API   ███████                                    2
Inspections  ████                                       1
```

**Legend**

| Label | Meaning | Example |
|---|---|---|
| Service | Where the copy lives. | Attendance |
| Number | Files that pick the London zone by OS and convert or find a day boundary. | `WageWeekDateCalculator.cs`, `ClockInOutTimeCalculator.cs` |

**What each copy turns into** (column "Maps to"):

```text
Copies by target IBusinessCalendar member

DayOf                      ████████████████████████████████████████  5
StartOfDayUtc              ████████████████████████████████          4
ScheduleZone               ████████████████████████                  3
AtTimeOfDayUtc             ████████████████████████                  3
WeekCommencing             ████████████████████████                  3
IsSaturday / IsWorkingDay  ████████████████                          2
teamDate (display)         ████████                                  1
```

**Legend**

| Label | Meaning | Example |
|---|---|---|
| `DayOf` | The team's day of an instant. | Materials: "now" in London for unavailable dates |
| `StartOfDayUtc` | The instant a team day starts. | `ReportingCalendar.UkDayBoundsUtc` |
| `ScheduleZone` | The zone Hangfire jobs run in. | `HRJobScheduler` per team |
| `AtTimeOfDayUtc` | A local time of day on a team day, as UTC. | Attendance `ConvertTimeFromLondonToUTC` |
| `WeekCommencing` | The start of the wage week. | `WageWeekDateCalculator` |
| `IsSaturday` / `IsWorkingDay` | Weekend and working-day checks. | Handover `AddBusinessDays` |
| `teamDate` (display) | Display conversion, in the PDF generators. | Handover and Inspections `ReportGeneratorService` |

**Clock reads per project** (section "Clock reads per project"):

```text
Clock reads per project (non-test)

Materials    ████████████████████████████████████████  74
Common core  ███████████████████████████████           57
Report.API   ██████████████████████████                48
Handover     ████████████████████████                  45
ActiveWork   ████████████████                          29
Resources    ███████████████                           28
Attendance   ███████████████                           28
Gaffer       ██████████████                            25
Inspections  ██████████                                18
```

**Legend**

| Label | Meaning | Example |
|---|---|---|
| Project | A .NET project, not a repo. | ActiveWork = 14 in Core + 15 in Background |
| Common core | The shared `Core` projects counted together. | — |
| Number | `DateTime.Now/UtcNow/Today` reads on 2026-10-05; the plan's 8.1 counts per repo differ. | Attendance 28 here, 40 in the plan |

**Proposed split** (section "Proposed split"):

```text
Time kit, copied into each service
IBusinessCalendar · ZonedBusinessCalendar · CalendarDay · TeamTimeSettings
   │
   ├──► ActiveWork · Attendance · Resources · Materials · Handover · Inspections
   │       calendar through the provider; their own London code is deleted
   │
   ├──► Report.API
   │       replaces ReportingCalendar and LabourSummaryService
   │
   └──► Gaffer · SafetySuite · Notification · the rest
           ITeamTimeContext only, where a call site needs a day or a display time
```

**Legend**

| Label | Meaning | Example |
|---|---|---|
| Time kit | The shared code each service copies (plan D8). | `CalendarDay` |
| calendar through the provider | The service injects `IBusinessCalendar` for the team. | `calendar.WeekCommencing(day)` in Attendance |
| `ITeamTimeContext` | The team zone and formats from the request headers, with no calendar maths. | Gaffer formatting a reply time |

## Copies of the London-zone pattern

| Service | File | London logic | Maps to |
|---|---|---|---|
| ActiveWork | `Core/Utilities/TimeZoneProvider.cs`, `Core/Utilities/ActiveWorkDateUtilities/ActiveWorkDateUtilities.cs` | Shared London zone, working hours 08:00-16:00 as London time, same-day check | `ScheduleZone`, `DayOf`, `AtTimeOfDayUtc` |
| ActiveWork | `Background/Services/TomorrowStaffAssignmentReminderService.cs`, `ActiveWorkNotificationService.cs` | "Tomorrow" in London, reminder log written with `SpecifyKind(londonDate)` | `DayOf`, `StartOfDayUtc` |
| Attendance | `Core/Utilities/Services/WageWeekDateCalculator.cs` | Week commencing, `AdjustForDaylightSaving`, `NormalizeDate`, `RemoveDstSideEffect` | `WeekCommencing` |
| Attendance | `Core/Utilities/ClockInOutTimeCalculator.cs` | `ConvertTimeFromLondonToUTC` for group start and end times, `IsSaturday`, `IsSunday` | `AtTimeOfDayUtc`, `IsSaturday` |
| Attendance | `Core/Data/WageHelper.cs`, `WageHelperLegacy.cs`, `Core/Extensions/WageCalculatorExtension.cs` | Wage week and day logic (about 140 week-boundary hits, mostly in `Core`) | `WeekCommencing`, `DayOf` |
| Attendance | `Background/Services/ReminderService.cs`, `Background/Extensions/AttendanceBackgroundJobExtensions.cs`; Background events `StaffMemberAbsenceCreatedOrUpdatedHandler`, `StaffMemberAbsenceDeletedHandler`; API `GetWageWeekSnapshotsQuery`, `GetWageBonusQuery` | Reminder timing, job schedule, week boundaries | `ScheduleZone`, `WeekCommencing` |
| Resources | `Core/ServiceWorkers/HRJobScheduler.cs` | Hangfire jobs in the London zone (per team and bank holidays) | `ScheduleZone` per team |
| Resources | `API/Controllers/ResourcesController.cs` | London zone, `SpecifyKind(toDate, Utc)` | `StartOfDayUtc` |
| Materials | `CQRS/Queries/Handlers/GetVehiclesForTeamHandler.cs`, `GetVehiclesForTeamByCategoryHandler.cs` | "Now" in London for unavailable dates | `DayOf` |
| Handover | `Core/Data/Models/HandoverNotification.cs` | Next notification date, London to UTC | `AtTimeOfDayUtc` |
| Handover | `Core/Extensions/DateTimeExtensions.cs` | `AddBusinessDays`, hardcoded weekend list | `IsSaturday`, new `IsWorkingDay` |
| Handover, Inspections | `Background/Services/ReportGeneratorService.cs` | Display conversion to London | `teamDate` equivalent |
| Report.API (FrameworkCache) | `Helpers/ReportingCalendar.cs` | `UkDayBoundsUtc`, `UkRangeBoundsUtc`, `UkDateOf`. Cleanest copy, closest to the target interface | `StartOfDayUtc`, range, `DayOf` |
| Report.API (FrameworkCache) | `BL/LabourSummaryService.cs` | Local to UTC range conversion (twice) | `StartOfDayUtc` |

`ReportingCalendar` is the best starting point for the real interface: it already has the day-bounds and instant-to-day pair.

## Services with no zone logic yet (clock reads only)

| Service | Clock reads | Approach |
|---|---|---|
| Gaffer | 25 | `ITeamTimeContext` (header-only) |
| SafetySuite | 10 | `ITeamTimeContext` (header-only) |
| Notification | 9 | `ITeamTimeContext` (header-only) |
| Customer | 7+ | Decide per call site |
| Gateway | about 15 (`Core`, `Customer.Core`, `Background`) | Decide per call site |
| Forecasting | 1 | Decide per call site |

## Clock reads per project (non-test)

Materials 74, Common core 57, Report.API 48, Handover 45, Resources 28, Attendance 28, Gaffer 25, Inspections 18, ActiveWork 14 (+15 in Background).

## Proposed split

- **Shared library, copied into services with the time kit:** `IBusinessCalendar`, `ZonedBusinessCalendar`, `CalendarDay`, `TeamTimeSettings`.
- **ActiveWork, Attendance, Resources, Materials, Handover, Inspections:** get the calendar through the provider and delete their own copy of the zone code.
- **Report.API:** replaces `ReportingCalendar` and `LabourSummaryService`.
- **Gaffer, SafetySuite, Notification and the rest:** `ITeamTimeContext` only, and only where a call site needs a day or a display time.
