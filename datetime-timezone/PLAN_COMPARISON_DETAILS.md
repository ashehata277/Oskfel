# UTC Plan vs Team-Local Plan — Comparison: Full Details

> The short version is `PLAN_COMPARISON.md`. This file keeps every count, query, phase map and table behind it.

> **Status:** comparison only — no product code has changed. Written 2026-10-06, updated 2026-10-07 for the UTC plan's D1 change (calendar date = the team's midnight, stored as UTC; no data rewritten). **Compares:** `utc-time-zone/UTC_IMPLEMENTATION_PLAN.md` (with `DATABASE_DATE_QUERY_AUDIT.md`, `BUSINESS_CALENDAR_INVENTORY.md`) and `team-local/TEAM_LOCAL_TIME_PLAN.md` (with `TEAM_LOCAL_TIME_DB_MIGRATION_REPORT.md`, `TEAM_LOCAL_TIME_ATTENDANCE_REPORT.md`). **Frame (agreed):** both plans go live **in one step**: code built and shipped dark, rehearsed on a production copy, then switched on for every service and every team in one go-live night. The UTC plan is written as a phased rollout; section 2 lists what changes to deliver it in one step. **Decides:** team-local T0 / Q1, "this plan instead of the UTC plan?". The two plans cannot both run: they give opposite answers to what is stored in the database. Counts come from the plans' own tables (grep and model scans of 2026-10-01 and 2026-10-06). Counts marked "about" are adjusted for the one-step go-live. Scores and risk levels are judgements, marked as such.

---

## Which plan works more easily with external services

**The UTC plan.** Its dates mean the same inside and outside: `Z` is real UTC, the standard that every outside API, library and tool expects. In the team-local plan `Z` holds the London wall clock, so almost every boundary with the outside needs a conversion.

| External service | UTC plan | Team-local plan | Easier |
| --- | --- | --- | --- |
| Outside APIs that send or take times (Google Routes, TimeTastic, Breathe HR, push and e-mail providers) | pass times as they are | convert on every call: `ToSystemInstant` / `FromSystemInstant` | UTC |
| Day-only feeds (bank holidays) | turn the day into the team's midnight | store the day as it comes (`D 00:00Z`) | team-local |
| Our API, exports, webhooks, customer portal, BI | read correctly, no change on their side | one conversion layer at Gateway and exports, or every reader changes | UTC |
| Service Bus events read by other systems | UTC before and after go-live | wall clock after go-live; events already stored stay UTC, so a late reader gets both | UTC |
| Systems that read MongoDB directly | standard UTC | must convert with the team's zone themselves | UTC |
| A second time zone | works the same | needs Phase 8; wall clocks of different zones cannot be compared | UTC |

**Easier in 5 of 6 for the UTC plan.** Scorecard row "Outside consumers and integrations": UTC ●●●●●, team-local ●●○○○.

---

## 1. The difference in one picture

The same clock-in, end to end. Everything the user sees is identical; what travels and what is stored is not.

```text
A worker clocks in at 08:00 London on 15 July 2026 (BST, UTC+1)

                     UTC plan                         Team-local plan
                     ────────────────────────────     ────────────────────────────
Browser holds        Date = 07:00Z (real instant)     Date = 07:00Z (real instant)
                          │                                │
Sent to the API           │ toISOString()                  │ ApiDateConverter.toApiDateTime
                          ▼                                ▼
Request body         "2026-07-15T07:00:00.000Z"       "2026-07-15T08:00:00.000Z"
                          │                                │
Service code         Kind=Utc 07:00                   Kind=Utc 08:00, used as it is
                          │                                │
Stored in MongoDB    2026-07-15T07:00:00Z             2026-07-15T08:00:00Z
                          │                                │
"Which day?"         calendar.DayOf(v) → 15 Jul        v.Date → 15 Jul
"Before 08:00?"      calendar.AtTimeOfDayUtc → no      v.TimeOfDay < 08:00 → no
                          │                                │
Sent back            "…T07:00:00.000Z"                "…T08:00:00.000Z"
                          │                                │ ApiDateConverter.fromApiDateTime
                          ▼                                ▼
Screen               teamDate → 15/07/2026 08:00      teamDate → 15/07/2026 08:00
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| Browser holds | The value inside components and stores. Both plans hold real instants there. | `Date` for 07:00Z |
| Request body | The ISO string the API receives. | UTC plan `07:00Z`; team-local `08:00Z` = 08:00 London |
| Service code | What C# sees after model binding. | `Kind=Utc` in both |
| Stored | The BSON Date in MongoDB. | `2026-07-15T08:00:00Z` in team-local |
| "Which day?", "Before 08:00?" | Typical business questions and the code each plan uses. | `calendar.DayOf(v)` vs `v.Date` |
| `teamDate` | The shared pipe both plans use for display. | `15/07/2026 08:00` |

---

## 2. Both plans in one step

Going live in one step, **both plans fix every London screen, report and wage on the same morning: the morning after the go-live night.** Neither plan leaves some screens fixed and others not. What differs is how much must be built before that night, and what the night itself has to do.

### 2.1 How each plan goes live

```text
                     Build (ships dark)          Rehearse                    Go-live night                       After
                     ─────────────────────────   ─────────────────────────   ─────────────────────────────────   ──────────────────────
UTC                  UTC phases 0–6; every       go-live rehearsal and       flip Time:RulesMode → Utc           strict mode (9.9),
                     behaviour change behind     26-week payroll shadow      no data rewritten                   remove compatibility
                     Time:RulesMode = Legacy     compare on a production     remove TZ from 6 containers         code and the switch
                                                 copy                        block old app builds

Team-local           P0–P3; every behaviour      P4: rehearsals and          P5: stop every service, rewrite     P6 screens,
                     change behind               26-week payroll shadow      118 collections, 12 event stores,   P7 clean-up after
                     Time:StorageMode = Utc      compare                     flip Time:StorageMode → TeamLocal   30 days

                     ──────────────────────────────────────────────────────────────────────────────────────────►│
                     London dates still wrong in every plan                                                     │  every screen, report and wage
                                                                                                                │  right, in every plan
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| Ships dark | Code is released to production early but changes nothing until the switch flips. | `IBusinessCalendar` calls running with `Time:RulesMode = Legacy` |
| `Time:RulesMode` | One global switch for the UTC plan (`Legacy` | `Utc`). It replaces the UTC plan's per-team switch (D10). | flipped to `Utc` at go-live |
| `Time:StorageMode` | The team-local plan's global switch (`Utc` | `TeamLocal`). | flipped to `TeamLocal` at C9 |
| Rehearse | Run the go-live night and a 26-week payroll shadow compare on a production copy first. | team-local P4; new for the UTC plan |
| `│` line | The go-live night. Before it no plan has fixed anything; after it every plan has fixed everything. | — |

### 2.2 What changes in the UTC plan to deliver it in one step

| UTC plan item | As written (phased) | One step |
| --- | --- | --- |
| Attendance per-team switch (D10, ATT 2b) | Off → one UK pilot team → compare 1–2 weeks → all teams. | One global switch `Time:RulesMode` with one start week for every team. 2b.1, 2b.4, 2b.5, 2b.7, 2b.9 dropped; 2b.2, 2b.3, 2b.6, 2b.8 kept, keyed on the global start week. |
| Payroll comparisons (10.3, 13.2) | Summer and winter cycles on live teams, into 2027. | 26-week shadow compare (one summer and one winter change) on a production copy before go-live, as team-local P4.3. |
| Rehearsal | None. | New: a full go-live rehearsal on a production copy, as team-local P4 (about 7 items). |
| Containers (9.1–9.8) | `TZ` removed per service. | `TZ` removed from all six in the go-live night. |
| Old app builds (Phase 8) | Retired over time; tolerant paths stay meanwhile. | Minimum build enforced at go-live, as team-local C11. |
| Old calendar rows (D4, Phase 5) | Not rewritten; already the team's midnight (D1). Read by the team's day. | Unchanged: nothing rewritten in the go-live night. Old browser-midnight rows are an optional later fix (Q16). |
| Old weeks in payroll (D11) | `Legacy*` calculators. | Unchanged: kept. |
| Non-London teams (9.12) | Checklist, about April 2027. | Checklist items built before go-live; zones work from the first day. |

**Old calendar dates in the UTC plan.** The UTC plan stores a calendar date like any other time: the picked day's midnight in the team's zone, sent and stored as UTC (D1, changed 2026-10-07). Monday 6 July for a London team is `2026-07-05T23:00Z`. This is the shape stored today, so nothing is rewritten (D4) and the go-live night touches no data. Every lookup reads the day with the team's calendar (`calendar.DayOf`, `calendar.DayRangeUtc`).

**What the dev profile showed (2026-10-06, UTC plan Appendix B).** Old calendar dates are mostly London midnight, but dev also holds end-of-London-day values (`22:59Z`/`23:59Z`), `01:00` rows and real times; read with the London calendar they all give the right day. Browser midnights from devices east of London (`21:00Z`, `22:00Z`, winter `23:00Z`) read as the day before, as they do today; the UTC plan leaves them (optional fix, Q16), team-local corrects them with rule C. 20 fields first listed as calendar dates hold real times and are instants in both plans.

---

## 3. Side by side

| Topic | UTC | Team-local |
| --- | --- | --- |
| **What is stored** | A real instant (UTC). | The team's wall clock, labelled `Z`. |
| **What `Z` means on the wire** | UTC. | Team wall clock (T1). |
| **Calendar dates** | Midnight of the day in the team's zone, stored as UTC (D1): `Sun 23:00Z` for Monday in a London summer, `Mon 00:00Z` in winter. The shape stored today. | `D 00:00Z` for every row after the migration. |
| **Old data** | Nothing rewritten (D4): instants are already UTC and calendar dates already the team's midnight. Old browser-midnight rows read as the day before, as today (optional fix, Q16). | Converted once: 118 collections, 501 paths, 318 event paths. |
| **Going live** | Code ships dark; one go-live night flips `Time:RulesMode` for every service and every team. | Code ships dark; one go-live night flips `Time:StorageMode` (T4). |
| **What the go-live night does** | Flip the switch, remove `TZ` from six containers, block old app builds. No data stop. | Stop every service, rewrite 118 collections and 12 event stores, flip, remove `TZ`, block old builds (C1–C12). |
| **Rollback** | Flip the switch back; weeks since go-live recalculated with the old rules. No data to restore. | R1 renames back before reopening; R2 reverse migration of every date after; R3 snapshot. |
| **When London dates are right** | Every screen, report and wage, the morning after the go-live night. | The same. |
| **Backend clock** | `IDateTimeProvider` returns UTC. | `IDateTimeProvider` returns team time; `ISystemClock` returns real UTC for technical times. |
| **Backend day logic** | `IBusinessCalendar` everywhere (`DayOf`, `DayRangeUtc`, `WeekCommencing`), for instants and calendar dates alike. | `ITeamTime` (small); `.Date` and `DayOfWeek` work as they are. |
| **Durations** | Plain subtraction is correct. | `ITeamTime.Elapsed` needed across clock changes (T8). |
| **Repeated autumn hour** | No ambiguity. | Two real times share one wall clock (T9). |
| **Frontend display and input** | Shared control, `teamDate`, `calendarDate`. | The same control and pipes (T3). |
| **Frontend conversion** | Inside the control and the `teamDate` and `calendarDate` pipes; services send UTC. | Also in every API service through `ApiDateConverter`, no interceptor (T2). |
| **Attendance** | One global switch at go-live after a 26-week shadow compare; no pilot team; `Legacy*` calculators for old weeks (D11). | Global flip at go-live after a 26-week shadow compare (P4.3). |
| **Recurring jobs** | One Hangfire job per team, team zone (D9). | London schedule kept; per team in Phase 8. |
| **Non-London teams** | Work from go-live once the 9.12 items are built. | Phase 8, not planned in detail; cross-team views compare wall clocks (T12). |
| **A team's zone changes** | Never (D13). | Never (T11); a change would need its data converted again. |
| **Outside consumers** | Unaffected: instants stay UTC and calendar dates keep today's shape (section 11.3). | Must learn that `Z` is wall clock, in the go-live night, or read through one conversion layer (P0.6, section 11.3). |
| **Reports straight on MongoDB** | Correct instants and durations as stored; every day, hour or weekday grouping needs `timezone`, on instants and calendar dates. | Day, hour and weekday groupings work as stored; durations across a clock change and same-moment comparisons between zones need conversion. |
| **Status** | Written as a phased plan; the one-step go-live is the change list in section 2.2. D1 changed 2026-10-07: a calendar date is the team's midnight stored as UTC, so nothing is rewritten. | Written 2026-10-06 as one step; T1–T3 decided by the product owner; T0 open. |

---

## 4. Scorecard

```text
Criterion                                 UTC    Local

Correct for teams in different zones      ●●●●●  ●●○○○
Durations and order across clock changes  ●●●●●  ●●●○○
Simple backend day logic                  ●●●○○  ●●●●●
Frontend effort                           ●●●●○  ●●●○○
Data risk                                 ●●●●●  ●●○○○
Short go-live night                       ●●●●●  ●●○○○
Rollback                                  ●●●●●  ●●●○○
Payroll safety                            ●●●●○  ●●●○○
Size of the work before go-live           ●●○○○  ●●●●○
Time until the go-live night              ●●●○○  ●●●●○
Ready for a non-London team               ●●●●○  ●●○○○
Outside consumers and integrations        ●●●●●  ●●○○○
Long-term maintenance                     ●●●●○  ●●●○○
Per-team reports straight on MongoDB      ●●●○○  ●●●●●
Cross-team reports straight on MongoDB    ●●●●○  ●●●○○

Unweighted total (of 75)                     61     46
```

**Legend**

| Label | Meaning |
| --- | --- |
| ●●●●● | 5 = strong on this criterion; ●○○○○ = 1 = weak. A judgement from the plans, not a measurement. |
| UTC | The UTC plan: no stored date rewritten (D4); a calendar date is the team's midnight stored as UTC, as today (D1 changed 2026-10-07). |
| Local | The team-local plan as written. |
| Unweighted total | Every criterion counts the same. Your weighting decides (section 11). |

| Criterion | UTC | Local | Why |
| --- | --- | --- | --- |
| Correct for teams in different zones | 5 | 2 | UTC stores instants. Team-local wall clocks of different zones cannot be compared (T12) and need Phase 8. |
| Durations and order across clock changes | 5 | 3 | Team-local needs `ITeamTime.Elapsed` for every duration (T8); the repeated autumn hour is ambiguous (T9). |
| Simple backend day logic | 3 | 5 | UTC needs `IBusinessCalendar` in every day query, for instants and calendar dates (stored as the team's midnight). In team-local `.Date` is already the team's day. |
| Frontend effort | 4 | 3 | Both build the shared control and pipes. Team-local also converts in 59 API service files, SignalR, storage and queues. |
| Data risk | 5 | 2 | The UTC plan rewrites no stored date (D4): instants are already UTC and calendar dates already hold the team's midnight (D1). Team-local rewrites 501 paths in 118 collections and 12 event stores. |
| Short go-live night | 5 | 2 | UTC: a switch flip and container restarts; no data rewritten. Team-local: every service stopped while 118 collections convert (C1–C12). |
| Rollback | 5 | 3 | UTC: flip `Time:RulesMode` back and recalculate weeks since go-live; no data to restore. Team-local: easy before reopening (R1), every date reversed after (R2). |
| Payroll safety | 4 | 3 | Both: 26-week shadow compare, then one global flip. UTC keeps `Legacy*` calculators for old weeks, has 7 pay-affecting changes and fixes night shifts (D12). Team-local: 9 pay-affecting changes, night shifts still unpaired (B9). |
| Size of the work before go-live | 2 | 4 | UTC: about 490 repo steps (Attendance 127). Team-local: 194 recipe steps (Attendance 29) plus the migration runbook (coarser steps, see 5.2). |
| Time until the go-live night | 3 | 4 | Both plans fix every date in the same night. The team-local night can come sooner because less must be built first. |
| Ready for a non-London team | 4 | 2 | UTC: zones work from go-live once the 9.12 checklist items are in the build. Team-local: Phase 8 is not planned in detail. |
| Outside consumers and integrations | 5 | 2 | In team-local, `Z` no longer means UTC; every consumer outside the three apps must convert (P0.6). |
| Long-term maintenance | 4 | 3 | UTC is the common convention; calendar dates are the team's midnight and always read with the team's calendar, and old browser-midnight rows stay unless fixed (Q16). Team-local code must always tell business from technical time (L4). |
| Per-team reports straight on MongoDB | 3 | 5 | Team-local: dates group by day, hour and weekday as stored. UTC: every operator on an instant or a calendar date needs `timezone` (section 9). |
| Cross-team reports straight on MongoDB | 4 | 3 | UTC: same-moment questions and durations work as stored; local days need a zone lookup. Team-local: local days work as stored, same-moment questions need conversion per team (section 9). |

---

## 5. The work before the go-live night

### 5.1 Code sites

Same inventory, different treatment: a site counted in both plans may be changed differently (see the legend).

```text
Code sites each plan must change
█ UTC   ▒ team-local

Clock reads                   UTC    ██████████████████████████████████  459
                              Local  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  459
DateTime.Parse / TryParse     UTC    ███████                              99
                              Local  ▒▒▒▒▒▒▒                              99
ObjectId.CreationTime         UTC                                          0
                              Local  ▒▒▒▒▒▒                               84
DST adjustments               UTC    ██                                   33
                              Local  ▒▒                                   33
Mongo timezone stages         UTC    █                                     4
                              Local  ▒                                     4
Frontend API service files    UTC                                          0
                              Local  ▒▒▒▒                                 59
Query-string dates            UTC    █████                                74
                              Local  ▒▒▒▒▒                                74
Screen steps (6.F, 6.H, 6.I)  UTC    ███                                  45
                              Local  ▒▒▒                                  45
```

**Legend**

| Label | UTC | Team-local | Example |
| --- | --- | --- | --- |
| Clock reads | every read → `IDateTimeProvider` (UTC) | business → `IDateTimeProvider` (team time), technical → `ISystemClock` | `DateTime.UtcNow` in `UserClockInHandler` |
| `DateTime.Parse / TryParse` | → `WireDate`, `Kind=Utc` | → `WireDate`, digits kept | `WageController` 17 sites |
| `ObjectId.CreationTime` | already UTC, no change | → `FromSystemInstant` (B.f) | `UserAttendanceRecord` `Created` |
| DST adjustments | rewritten into `IBusinessCalendar` | become identity, then deleted | `isSummer ? h - 1 : h` |
| Mongo `timezone` stages | zone from the calendar | removed | Report.API `$dateToString` |
| Frontend API service files | no conversion (services send UTC) | `ApiDateConverter` in each | `wage.service.ts` |
| Query-string dates | from `toWire` (UTC plan 1.30) | from `ApiDateConverter` | `from`/`to` of list filters |
| Screen steps | 30 + 9 + 6 in Phase 6 | the same 45, after go-live (P6) | absence dialog |

### 5.2 Steps per repo

The two plans count steps differently: a UTC step is usually one change; a team-local recipe row (B.a–B.l) is one PR that may cover many sites. Read the bars as the shape of the work, not as hours. Going live in one step barely shrinks the UTC plan: only Attendance loses its per-team switch steps.

```text
Steps per repo before go-live (UTC about 490, team-local 194)
█ UTC   ▒ team-local

Attendance      UTC    ██████████████████████████████████  127
                Local  ▒▒▒▒▒▒▒▒                             29
ActiveWork      UTC    ██████████                           39
                Local  ▒▒▒                                  12
Resources       UTC    █████████                            35
                Local  ▒▒▒                                  12
FrameworkCache  UTC    █████████                            34
                Local  ▒▒▒                                  11
Handover        UTC    █████████                            33
                Local  ▒▒▒                                  12
Inspections     UTC    ████████                             31
                Local  ▒▒▒                                  12
Materials       UTC    ███████                              28
                Local  ▒▒▒                                  11
Project         UTC    ███████                              25
                Local  ▒▒▒                                  12
Customer        UTC    █████                                19
                Local  ▒▒▒                                  11
Forecasting     UTC    █████                                19
                Local  ▒▒▒                                  12
Gateway         UTC    █████                                19
                Local  ▒▒▒                                  11
Gaffer          UTC    █████                                17
                Local  ▒▒▒                                  11
Permissions     UTC    █████                                17
                Local  ▒▒▒                                  11
SafetySuite     UTC    █████                                17
                Local  ▒▒▒                                  11
Notification    UTC    ████                                 16
                Local  ▒▒▒                                  11
CommonLibs      UTC    ████                                 14
                Local  ▒                                     5
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| UTC | The repo's total in the UTC plan's "Steps per repo" table, adjusted for the one-step go-live: Attendance 131 − 5 per-team switch steps + 1 global switch = 127; other repos unchanged. | Attendance 127 |
| Local | Recipe rows B.a–B.l for the repo, plus the 17 ATT-L steps for Attendance (team-local section 6). | Attendance 12 + 17 = 29 |
| Not counted | Steps owned by no repo: UTC Phases 0, 1, 10, 11 and the new rehearsal; team-local P0, P1, P4, P7 and the migration runbook. | UTC Phase 1 has 42 checklist items |
| Phase 5 | Lookups on calendar dates by the team's day, counted per repo. | ATT 8.1 `WageBonusRepo` |

### 5.3 Phases, both in one step

```text
UTC (checklist / repo steps)                     Team-local (checklist / repo steps)
──────────────────────────────────────────────   ─────────────────────────────────────────────
Build, shipped dark
0   decisions and discovery          23          P0  decisions and discovery          12
1   foundations + Time:RulesMode     42          P1  foundations + Time:StorageMode   16
1b  team settings readers             7          ──  P1.15 Gateway endpoint, London defaults
2   clock reads                     115 ──┐
3   Kind=Utc entry points            85   ├────► P2  backend recipe B.a–B.l          194
4   zone logic → IBusinessCalendar   65   │          (one recipe covers UTC 2, 3, 4)
4.X cross-service steps              43 ──┘
4.S recurring jobs per team          16          ──  London schedule kept (ScheduleZone)
5   calendar dates by team day       14          ──  not needed: the data is migrated
6   team settings + every screen     59 ──────► P3  ApiDateConverter              6 + 18
Rehearse
R   rehearsal + 26-week shadow     new 7 ◄─────► P4  rehearsals on a production copy   7
Go-live night
9   flip, TZ, minimum builds         13 ◄─────► P5  one window C1–C12 + migration M0–M6
After
10  verification                     13          ──  inside B.k, P4 and migration M4
──                                               P6  screens (UTC 6.F, 6.H, 6.I reused)
──                                               P7  clean-up after 30 days            3
11  optional UTC business days        4          P8  later: per-team zones
ATT Attendance                      119          ATT-L Attendance                     17
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| Number after a UTC phase | Checklist items for phases 0, 1, 1b, 5–11 and R; repo steps (column sum) for 2, 3, 4, 4.X, 4.S. Changes for the one-step go-live: Phase 1 + `Time:RulesMode`, Phase 8 folded into the go-live night, ATT 123 − 5 + 1. | Phase 5 = 14 |
| Number after a team-local phase | Checklist items; P2 is recipe rows summed over repos; P3 is 6 app steps + 18 Frontend rows. | P2 = 194 |
| `──►` | Where the team-local plan does the same job. | UTC 6 → P3 and P6 |
| `◄────►` | Both plans have this step in the same place. | rehearsal, go-live night |
| `──` | No equivalent; the reason is given. | UTC 5 → "not needed: the data is migrated" |

### 5.4 Data

```text
Stored data each plan changes in the go-live night
█ UTC   ▒ team-local

Model collections rewritten    UTC                                          0
                               Local  ▒▒▒▒▒▒▒                             106
Declared date paths rewritten  UTC                                          0
                               Local  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  501
Event payload paths rewritten  UTC                                          0
                               Local  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒              318
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| Model collections rewritten | Collections whose model fields are converted. Event stores are counted in the next rows. UTC: none (D4). | team-local: `Attendance:WageRecords` |
| Declared date paths rewritten | Field paths in the models converted by rule I (instants) or C (calendar dates). UTC: none. | `Week[].DayRecords[].ClockIn` |
| Event payload paths rewritten | Dates inside event store `Data`. UTC: none; team-local: all 318 in 12 event stores. | `WageBonusAwarded.WeekCommencing` |

```text
A calendar date: week commencing for Mon 6 July 2026

                  Before         Go-live night                          After
                  ───────────    ─────────────────────────────────────  ─────────────────────────────
UTC               Sun 23:00Z     nothing rewritten                      Sun 23:00Z (summer), Mon 00:00Z
                                                                        (winter): the team's midnight;
                                                                        found with calendar.DayRangeUtc

Team-local        Sun 23:00Z     every row → Mon 00:00Z (rule C)        one shape: Mon 00:00Z
                                                                        exact matches work
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| Sun 23:00Z | London midnight of Monday, in summer, stored as UTC: today's shape and the UTC plan's shape (D1). | week of 6 July |
| Mon 00:00Z | In the UTC plan, London midnight in winter; in team-local, wall-clock midnight all year. | `2026-07-06T00:00:00Z` |
| `calendar.DayRangeUtc` | The team's day as a UTC range; every row of that day falls inside. | `[2026-07-05T23:00Z, 2026-07-06T23:00Z)` |
| rule C | Team-local's calendar rule (dev profile): `22:59Z`/`23:59Z` → the London day; a whole hour within 3 h of a UTC midnight → the nearest UTC midnight; any other time → the London day; stored as `D 00:00Z`. | `2026-07-05T23:00Z` and `2026-07-05T21:00Z` → `2026-07-06T00:00Z` |

---

## 6. Attendance (payroll)

```text
Attendance in each plan
█ UTC   ▒ team-local

Attendance steps          UTC    ██████████████████████████████████  127
                          Local  ▒▒▒▒▒▒▒▒                             29
Behaviour changes listed  UTC    ████                                 15
                          Local  ▒▒▒▒                                 14
Of which can change pay   UTC    ██                                    7
                          Local  ▒▒                                    9
```

**Legend**

| Label | UTC | Team-local |
| --- | --- | --- |
| Attendance steps | 131 − 5 + 1 = 127; ATT 8 lookups by the team's day | 12 recipe rows + 17 ATT-L |
| Behaviour changes listed | B1–B16 without B13 (A.1) | B1–B14 (Attendance report section 3) |
| Of which can change pay | B1–B5, B9, B16 | B1–B5, B7–B10 |

| Topic | UTC | Team-local |
| --- | --- | --- |
| How it goes live | One global switch at go-live, for every team, after a 26-week shadow compare on a production copy. No pilot team. | Global flip at go-live, after a 26-week shadow compare (P4.3). |
| Payroll evidence | The shadow compare covers a summer and a winter clock change, on every team. | The same. |
| Old weeks | Always the old rules; `Legacy*` calculators stay in production (D11). | Recalculated with the new code if finance allows (T10); otherwise frozen. |
| Pay rollback after go-live | Flip `Time:RulesMode` back; weeks since go-live are recalculated with the old rules (2b.5, made global). | R1 before reopening; after it, reverse migration (R2) and recalculation. |
| Clock-out pairing | Latest open clock-in on the project within 16 h (D12): fixes night shifts. | Same London day: fixes 00:00–01:00 BST, night shifts still unpaired (Attendance report B9). |
| DST code | Moves into `IBusinessCalendar` (`AtTimeOfDayUtc`, `WeekCommencing`). | Becomes identity, deleted in P7 (e.g. `ConvertTimeFromLondonToUTC`). |
| Finish cap after midnight | Capped at the clock-in day's finish (B2). | Rule kept: capped on the clock-out's day; payroll asked (Q-A1). |

---

## 7. Edge cases

| \# | Case | UTC | Team-local | Note |
| --- | --- | --- | --- | --- |
| E1 | Clock-in 08:00 BST, 15 Jul 2026 | stored `07:00Z` | stored `08:00Z` | same screen: 08:00 |
| E2 | Absence on 6 Jul (calendar date) | `2026-07-05T23:00Z` (London midnight, as today); day from `calendar.DayOf` | every row `2026-07-06T00:00Z`; day from `.Date` | team-local needs no calendar call |
| E3 | Week commencing, summer | `Sun 23:00Z` in summer, `Mon 00:00Z` in winter, as today; found with `calendar.DayRangeUtc` | `Mon 00:00Z` all year | team-local can match exactly |
| E4 | Night shift 22:00 Sat 27 Mar → 06:00 Sun 28 Mar 2027 | `22:00Z → 05:00Z` = 7 h by subtraction | `22:00 → 06:00` = 8 h by subtraction; 7 h only through `Elapsed` | a missed `Elapsed` overpays 1 h |
| E5 | Clock-in 01:30 BST, clock-out 01:10 GMT, 25 Oct 2026 | `00:30Z → 01:10Z` = 40 min | `01:30 → 01:10`: out before in (T9) | team-local loses the order inside that hour |
| E6 | Clock-in 00:30 BST (late-night start) | UTC day is the day before; `calendar.DayOf` gives the London day | `.Date` gives the London day | both right when done; UTC needs the calendar call |
| E7 | Who started before 08:00 local, London and Riyadh teams | convert each team's instants to its zone first | compare wall clocks as stored | team-local is simpler for local-time questions |
| E8 | Who was on site at the same moment, London and Riyadh | compare instants as stored | convert each team's wall clock to UTC first (T12) | UTC is simpler for same-moment questions |
| E9 | Bank holiday from the bank-holiday feed (a date) | the feed's `D 00:00Z` → the team's midnight, `calendar.StartOfDayUtc(day)` (4.R.4) | stored as it comes, `D 00:00Z` | team-local stores the day as it comes |
| E10 | `Created` set from `ObjectId.CreationTime` | already UTC, no change | `FromSystemInstant` at 84 sites (B.f) | a missed site shows `Created` 1 h early in summer |
| E11 | ISO date in a BI export or the customer portal | `Z` is real UTC | `Z` is London wall clock; consumers must be told (P0.6) | silent 1 h error in summer if missed |
| E12 | A time from an outside API (Google Routes, TimeTastic part-day absence, push provider) | store the instant as it comes | `FromSystemInstant` before storing, `ToSystemInstant` before sending (B.i, P0.7) | one more conversion per integration |

```text
Which plan handles each edge case more simply

Case    UTC simpler   Same   Local simpler
E1                     ██
E2                           ▒▒▒▒▒▒▒▒▒▒▒▒▒
E3                           ▒▒▒▒▒▒▒▒▒▒▒▒▒
E4      ███████████
E5      ███████████
E6                     ██
E7                           ▒▒▒▒▒▒▒▒▒▒▒▒▒
E8      ███████████
E9                           ▒▒▒▒▒▒▒▒▒▒▒▒▒
E10     ███████████
E11     ███████████
E12     ███████████

UTC simpler 6   same 2   team-local simpler 4
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| E1–E12 | The cases in the table above. | E5 = the repeated autumn hour |
| UTC simpler | The UTC plan gets it right with less code or less risk. | E4: subtraction is enough |
| Same | Both plans give the same result with similar effort. | E1: the screen shows 08:00 in both |
| Local simpler | The team-local plan gets it right with less code or less risk. | E7: wall clocks compared as stored |

---

## 8. Risk

```text
Risk in each plan
█ UTC   ▒ team-local   (none · low ██ · medium ████ · high ██████)

Everything changes in one night             UTC    ████    medium
                                            Local  ▒▒▒▒    medium
A value converted twice or not at all       UTC            none
                                            Local  ▒▒▒▒    medium
A calendar date read as the wrong day       UTC    ██      low
                                            Local  ▒▒      low
Payroll difference after go-live            UTC    ████    medium
                                            Local  ▒▒▒▒    medium
Go-live night longer than planned           UTC    ██      low
                                            Local  ▒▒▒▒    medium
A missed day query uses the UTC day         UTC    ██████  high
                                            Local  ▒▒      low
A missed duration ignores a clock change    UTC    ██      low
                                            Local  ▒▒▒▒    medium
Outside consumer misreads `Z`               UTC    ██      low
                                            Local  ▒▒▒▒▒▒  high
Mixed-zone reports wrong                    UTC    ██      low
                                            Local  ▒▒▒▒▒▒  high
Technical time confused with business time  UTC    ██      low
                                            Local  ▒▒▒▒    medium
```

**Legend**

| Label | Meaning |
| --- | --- |
| none / low / medium / high | Chance that the problem reaches users, from the plans' own mitigations. A judgement, not a measurement. |

| Risk | UTC | Team-local |
| --- | --- | --- |
| Everything changes in one night | medium (all code at once; no data rewritten; switch flips back) | medium (all data and code at once; rehearsed in P4) |
| A value converted twice or not at all | none (no data converted) | medium (one rewrite; shadows and M4 guard it) |
| A calendar date read as the wrong day | low (old browser-midnight rows, as today; Q16) | low (one shape after the migration; checked by M4.4) |
| Payroll difference after go-live | medium (one global flip after shadow compare) | medium (one global flip after shadow compare) |
| Go-live night longer than planned | low (no data rewritten) | medium (118 collections, 12 event stores) |
| A missed day query uses the UTC day | high (every day query must change, calendar dates too) | low (`.Date` is the team day) |
| A missed duration ignores a clock change | low (instants subtract correctly) | medium (every duration needs `Elapsed`) |
| Outside consumer misreads `Z` | low (`Z` is UTC) | high (`Z` is wall clock) |
| Mixed-zone reports wrong | low (instants) | high once a second zone exists (T12) |
| Technical time confused with business time | low (one clock meaning) | medium (two clocks: `ISystemClock` and `IDateTimeProvider`) |

---

## 9. Reports straight on MongoDB (dashboards, Compass, mongosh)

MongoDB stores every date as a BSON Date with no zone. Its date operators (`$dateTrunc`, `$dateToString`, `$hour`, `$dayOfWeek`, `$dateDiff`) work in UTC unless a `timezone` is passed. `timezone` accepts an expression, so it can come from the team's own document. The queries below need MongoDB 5.0 or later (`$dateTrunc`, `$dateDiff`).

### 9.1 Which reports are easy in each plan

```text
Ease and safety of writing the report straight on MongoDB

Report                                  UTC                      Team-local

Per team: by local day, hour, weekday   ●●●○○ needs timezone     ●●●●● as stored
Per team: calendar dates (absence, WC)  ●●●○○ needs timezone     ●●●●● as stored
Per team: hours worked (durations)      ●●●●● as stored          ●●●○○ wrong 2 nights a year
Across teams, all London (today)        ●●●○○ needs timezone     ●●●●● as stored
Across teams, mixed zones: local day    ●●●●○ zone lookup        ●●●●● as stored
Across teams, mixed zones: same moment  ●●●●● as stored          ●●○○○ convert per team
Across teams: order of events           ●●●●● as stored          ●●○○○ autumn hour lost
Safety if the author forgets the zone   ●●○○○ 1 h wrong in BST   ●●●●● nothing to forget

Total (of 40)                           30                       32
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| ●●●●● … ●○○○○ | How easy and how safe the report is to write by hand in a dashboard or `mongosh`. A judgement from how the data is stored. | ●●●●● = a plain `$group` gives the right answer |
| as stored | The stored value already answers the question; no zone in the query. | team-local `$dateTrunc` with no `timezone` gives the London day |
| needs timezone | The query must pass `timezone: "Europe/London"` (or the team's zone) to every date operator. | UTC `$hour` without it gives 07 for an 08:00 BST clock-in |
| wrong 2 nights a year | `$dateDiff` of two wall clocks is off by 1 h for shifts across a clock change. | 22:00 → 06:00 on 28 Mar 2027 gives 8 h; real time is 7 h |
| zone lookup | A `$lookup` brings each team's zone, then `timezone: "$zone"`. | query C |
| convert per team | Each wall clock is turned into an instant with the team's zone before comparing. | query D |
| autumn hour lost | Two real times between 01:00 and 02:00 on the last Sunday of October share one wall clock (T9). | 00:30Z and 01:30Z both stored as 01:30 |
| 1 h wrong in BST | Forgetting `timezone` silently groups by the UTC day and hour. An instant near midnight lands on the wrong day; in the UTC plan every summer calendar date lands on the day before. | a 00:30 BST clock-in, or an absence on Mon 6 July stored as `Sun 23:00Z`, counted on Sunday |
| Total (of 40) | Sum of the eight rows. | — |

### 9.2 The same reports as queries

**A. Clock-ins per day for one team.**

UTC:

```javascript
db.getCollection("Attendance:WageRecords").aggregate([
  { $match: { TeamName: "acme", Deleted: false } },
  { $group: {
      _id: { $dateTrunc: { date: "$Attendance.ClockInDate", unit: "day", timezone: "Europe/London" } },
      clockIns: { $sum: 1 } } },
  { $sort: { _id: 1 } }
])
```

Team-local:

```javascript
db.getCollection("Attendance:WageRecords").aggregate([
  { $match: { TeamName: "acme", Deleted: false } },
  { $group: {
      _id: { $dateTrunc: { date: "$Attendance.ClockInDate", unit: "day" } },
      clockIns: { $sum: 1 } } },
  { $sort: { _id: 1 } }
])
```

**B. Absences by start day (a calendar date).**

UTC (a calendar date is the team's midnight, `Sun 23:00Z` for Monday in summer):

```javascript
db.getCollection("Resources:StaffMemberAbsence").aggregate([
  { $group: {
      _id: { $dateTrunc: { date: "$StartDate", unit: "day", timezone: "Europe/London" } },
      absences: { $sum: 1 } } }
])
```

Team-local (every row is `D 00:00Z`):

```javascript
db.getCollection("Resources:StaffMemberAbsence").aggregate([
  { $group: { _id: "$StartDate", absences: { $sum: 1 } } }
])
```

**C. Clock-ins per local day, every team, mixed zones.**

UTC, with the zone from the team read model (UTC plan 6.T.4):

```javascript
db.getCollection("Attendance:WageRecords").aggregate([
  { $match: { Deleted: false } },
  { $lookup: { from: "Attendance:Teams", localField: "TeamName", foreignField: "TeamName", as: "team" } },
  { $set: { zone: { $ifNull: [{ $first: "$team.TimeZone" }, "Europe/London"] } } },
  { $group: {
      _id: { team: "$TeamName", day: { $dateTrunc: { date: "$Attendance.ClockInDate", unit: "day", timezone: "$zone" } } },
      clockIns: { $sum: 1 } } }
])
```

Team-local: query A without the `TeamName` filter, grouped by `{ team: "$TeamName", day: { $dateTrunc: { date: "$Attendance.ClockInDate", unit: "day" } } }`.

**D. Who was on site at the same moment, every team, mixed zones.**

UTC: compare `Attendance.ClockInDate` and `Attendance.ClockOutDate` as stored.

Team-local: each wall clock is turned into an instant with its team's zone first. Values in the repeated autumn hour stay ambiguous.

```javascript
db.getCollection("Attendance:WageRecords").aggregate([
  { $match: { Deleted: false } },
  { $lookup: { from: "Attendance:Teams", localField: "TeamName", foreignField: "TeamName", as: "team" } },
  { $set: { zone: { $ifNull: [{ $first: "$team.TimeZone" }, "Europe/London"] } } },
  { $set: { clockInInstant: { $dateFromParts: {
      year: { $year: "$Attendance.ClockInDate" }, month: { $month: "$Attendance.ClockInDate" },
      day: { $dayOfMonth: "$Attendance.ClockInDate" }, hour: { $hour: "$Attendance.ClockInDate" },
      minute: { $minute: "$Attendance.ClockInDate" }, second: { $second: "$Attendance.ClockInDate" },
      timezone: "$zone" } } } }
])
```

**E. Hours worked.**

UTC: `{ $dateDiff: { startDate: "$Attendance.ClockInDate", endDate: "$Attendance.ClockOutDate", unit: "minute" } }` is exact.

Team-local: the same expression is exact except for shifts across a clock change. Convert both ends as in query D first when the report must be exact on those nights.

### 9.3 Verdict for direct database reports

```text
Per-team reports          ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  team-local better: no zone in any query
Calendar-date reports     ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  team-local better: UTC stores the team's midnight, needs timezone
Cross-team, all London    ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  team-local better: same as per-team
Cross-team, local days    ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  team-local better: UTC needs a zone lookup
Cross-team, same moment   ████████████████████  UTC better: team-local converts per team
Durations, event order    ████████████████████  UTC better: exact across clock changes
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| ▒ | The team-local plan is better for this kind of report. | query A has no `timezone` |
| █ | The UTC plan is better for this kind of report. | query D is a plain comparison in the UTC plan |

**In short:** while every team is London, and for any report that asks "which local day or hour", the **team-local plan is better for querying MongoDB directly**. The stored value is what the team sees, so a dashboard needs no zone and an author cannot forget one. The **UTC plan is better for cross-team reports about the same moment, event order and exact durations**. Its price is that every day, hour or weekday grouping must pass the team's zone, on instants and on calendar dates (stored as the team's midnight). In team-local calendar dates are `D 00:00Z` and group as stored.

**Either way, give dashboard authors a view.** Create a MongoDB view per reporting collection, owned by the backend team, that adds ready fields (`teamDay`, `teamHour`, `instant`, `minutesWorked`) using the rules above. Dashboards read the view, never the raw dates, so the zone logic is written once and tested.

---

## 10. What both plans share

- One go-live night after code shipped dark, a rehearsal on a production copy and a 26-week payroll shadow compare.
- Every London screen, report and wage right from the morning after that night.
- The same display and input: `<app-date-time-field>`, `teamDate`, `calendarDate`, named team formats, the zone label when the device zone differs.
- `IDateTimeProvider` for every clock read, enforced by the analyzer; time code copied into each repo (D8).
- `WireDate` for every incoming date; the TZ test matrix in CI.
- No `TZ` in any container after go-live.
- A team's zone never changes (D13 / T11); London by default.
- Team settings published by ProjectService and carried by Gateway.
- The same Attendance risk areas: start and finish caps, week commencing, day grouping, reminders.
- The same frontend clean-up: no device-local maths, no `| date`, no `toISOString()` outside the time folder.

---

## 11. How to choose

### 11.1 The questions in order

Answer the questions from the top. The first answer that points right decides; otherwise go down to the next question. Part A asks whether the team-local plan can work for us at all; Part B, asked only when nothing blocks it, asks whether it is worth choosing. If no answer decides, the UTC plan is the default, because it is the simplest overall: simpler in more stages of the system's life (chart below the questions). The team-local plan is the simplest to build, and wins only when Part A finds no blocker and Part B finds that benefit worth it.

```text
╔═════════════════════════════════════════════════════════════════════════════════════════════╗
║ Simplest overall:   UTC         simpler in 5 of 8 stages of the system's life               ║
║ Simplest to build:  team-local  simpler in 3 of 8 stages; 194 build steps against about 490 ║
║ More benefits:      UTC         7 benefits against 4 (opinion, section 11.6)                ║
╚═════════════════════════════════════════════════════════════════════════════════════════════╝

                    Start
                      │
                      ▼
Part A · Can the team-local plan work for us?  (blockers, hardest to change first)
══════════════════════════════════════════════════════════════════════════════════
                      │
                      ▼
┌─ Q1 ─────────────────────────────────────┐
│ Must a non-London team start before      │
│ team-local Phase 8 could be built?       ├── yes / not sure ───────►  [ UTC ]  simplest overall
└─────────────────────┬────────────────────┘
                      │ no
                      ▼
┌─ Q2 ─────────────────────────────────────┐
│ Is there an outside consumer that one    │
│ conversion layer cannot serve?           ├── yes ──────────────────►  [ UTC ]  simplest overall
└─────────────────────┬────────────────────┘
                      │ no
                      ▼
┌─ Q3 ─────────────────────────────────────┐
│ Can every service stop for the long      │
│ migration night?                         ├── no ───────────────────►  [ UTC ]  simplest overall
└─────────────────────┬────────────────────┘
                      │ yes
                      │
Part B · Is the team-local plan worth it?  (benefits, biggest first)
════════════════════════════════════════════════════════════════════
                      │
                      ▼
┌─ Q4 ─────────────────────────────────────┐
│ Is the smallest build before the         │
│ go-live night the priority?              ├── yes ──────────────────►  [ Team-local ]  simplest to build
└─────────────────────┬────────────────────┘
                      │ no
                      ▼
┌─ Q5 ─────────────────────────────────────┐
│ Are per-team reports run straight on     │
│ MongoDB a main reporting path?           ├── yes ──────────────────►  [ Team-local ]  simplest to build
└─────────────────────┬────────────────────┘
                      │ no
                      ▼
            [ UTC ]  simplest overall
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| Part A | Blockers: one UTC answer means team-local cannot work for us. Asked first, so no time is spent on benefits of a plan that cannot be used. Ordered by how hard the answer is to change: business direction, then outside parties, then our own operations. | — |
| Part B | Benefits: why team-local would be worth choosing once nothing blocks it. Ordered by weight: build size is the plan's main benefit, MongoDB reports the smaller one. | — |
| Q1 Non-London team | Any team whose zone is not `Europe/London`. Explained in 11.2. | a Riyadh team |
| Q2 Outside consumer | Anything outside the three apps that reads our ISO dates. Explained in 11.3. | BI, exports, webhooks, customer portal |
| Q2 One conversion layer | A single place at our boundary (Gateway, export layer) that turns team wall clock back into UTC for outside readers. If Q2 is "no" and outside consumers exist, build it before go-live. | customer-portal routes and exports send `07:00Z` for an 08:00 London clock-in |
| Q3 Long migration night | All services stopped while 118 collections and 12 event stores are converted (team-local C1–C12). Length estimated from the migration report, confirmed in rehearsal P4. The UTC plan rewrites no data, so its night is a switch flip and container restarts. | a Saturday night |
| Q4 Smallest build | Both plans fix every London date in the same night. Team-local has fewer steps to build first (194 recipe steps against about 490), so its night can come sooner. | team-local Attendance 29 steps, UTC 127 |
| Simplest overall | The plan that is simpler in more stages of the system's life: build, go-live night, rollback, daily code, outside consumers, reports, a second zone (stages chart below). Unweighted. | UTC: 5 of 8 stages |
| Simplest to build | The plan with the least to build before the go-live night. | team-local: 194 steps against about 490 |
| More benefits | The author's opinion of which plan gives more, and longer-lasting, benefits (section 11.6). | UTC: 7 against 4 |
| Q5 Reports straight on MongoDB | Dashboards, Compass or `mongosh` queries on the raw collections (section 9). The UTC plan with report views (9.3) is the other good answer here. | daily clock-ins per team |
| `├── yes ──►` | The answer that decides. The plan in brackets is the choice; stop here. | Q3 no → UTC |
| `│ no` then `▼` | The answer that does not decide; go to the next question. | Q1 no → Q2 |

**What "simplest overall" means.** Neither plan is simpler everywhere. The chart below takes each stage of the system's life and names the plan that is simpler there.

```text
Which plan is simpler at each stage of the system's life
█ UTC   ▒ team-local   ░ equal

Build before go-live              ▒▒▒▒▒▒▒▒▒▒ Local    194 recipe steps against about 490
Go-live night                     ██████████ UTC      no data rewritten; team-local: 118 collections + 12 event stores
Rollback                          ██████████ UTC      flip the switch back, no data to restore; team-local reverses every date after reopening
Daily code: day and week logic    ▒▒▒▒▒▒▒▒▒▒ Local    .Date is the team day; UTC calls IBusinessCalendar
Daily code: durations and clocks  ██████████ UTC      plain subtraction, one clock; team-local needs Elapsed and two clocks
Outside consumers                 ██████████ UTC      Z stays UTC; team-local needs a conversion layer or consumer changes
Reports straight on MongoDB       ▒▒▒▒▒▒▒▒▒▒ Local    32 of 40 against 30; UTC needs timezone on calendar dates too (section 9.1)
A second time zone                ██████████ UTC      works from go-live; team-local needs Phase 8

Simpler in:  UTC 5   team-local 3   equal 0   →   simplest overall: UTC
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| ██████████ UTC | The UTC plan is simpler at this stage. | go-live night: no data rewritten against 118 collections + 12 event stores |
| ▒▒▒▒▒▒▒▒▒▒ Local | The team-local plan is simpler at this stage. | build: 194 steps against about 490 |
| ░░░░░░░░░░ equal | Neither is simpler. | none at present |
| Simpler in | Count of stages each plan is simpler in. Every stage counts the same; your weighting can differ. | 5 against 3 |
| Simplest overall | The plan simpler in more stages. | UTC |

```text
Every path to each plan

UTC                                             Team-local
──────────────────────────────────────────      ──────────────────────────────────────────
Part A: Q1 yes or not sure                      Part A: Q1 no
     or Q2 yes                                        and Q2 no
     or Q3 no                                         and Q3 yes
  or Part B: Q4 no and Q5 no                      and Part B: Q4 yes or Q5 yes

Any one of these is enough.                     All of these must hold.
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| or | Any one of these answers leads to the plan. | Q2 yes alone → UTC |
| and | All of these answers are needed for the plan. | Q1 no, Q2 no, Q3 yes, Q4 yes → team-local |
| no question decides | Every answer pointed down, so the chart ends at its last bracket. | Q1 no, Q2 no, Q3 yes, Q4 no, Q5 no |

### 11.2 Q1: a team outside London

**What it asks.** Will a team whose zone is not `Europe/London` need to start real work (clock-ins, wages, absences) before team-local Phase 8 could be built after go-live?

**Why it matters.**

- **UTC plan:** nothing blocks other zones (D13). A non-London team works from go-live once the 9.12 checklist items are built.
- **Team-local plan:** `ITeamTime` reads one zone, London, from config. A Riyadh clock-in at 08:00 would be stored and shown as London time. Until Phase 8 is built, a non-London team must not be created at all: a zone can never change (T11), so a team created as London by mistake cannot be fixed.
- **Phase 8 is mostly the UTC plan's team-zone work, reused:** team settings through Gateway (6.T), the per-request zone rules (4.5) and per-team Hangfire jobs (4.8). Even after it, cross-team views compare wall clocks of different zones (T12) and each needs its own conversion.

```text
Team-local, second zone arrives soon

  build P0–P4      go-live P5       Phase 8: team settings, zone headers,          first non-London team
  ───────────────── ● ───────────── per-team jobs, ITeamTimeContext ────────────── ●
                                    (UTC plan 6.T, 4.5, 4.8 reused)
                                    cross-team views still compare wall clocks (T12)

Team-local, second zone arrives late or never

  build P0–P4      go-live P5       London only: the smaller build pays off ·························· Phase 8 later, if ever
  ───────────────── ● ─────────────────────────────────────────────────────────────

UTC

  build 0–6, R     go-live          a non-London team can start the next day (9.12 items built)
  ───────────────── ● ─────────────────────────────────────────────────────────────
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| ● | A milestone: the go-live night, or the day the first non-London team starts. | go-live P5 |
| Phase 8 | Team-local's later work for per-team zones (team-local plan section 5, Phase 8). | `ITeamTimeContext` gives `ITeamTime` the team's zone |
| `·····` | Time with no time-zone work, while every team is London. | the saving of the smaller build |
| 9.12 items | The UTC plan's checklist for non-London teams, built before go-live in the one-step go-live. | Attendance days by the team's zone |

**Why it decides early.** If a second zone comes soon after go-live, Phase 8 starts at once: the business pays for the full data migration and then for much of the UTC plan's team-zone work, and still has cross-team reports comparing wall clocks. The smaller build no longer saves anything. If the second zone is far away or never comes, the saving holds.

**Who answers.** The business (sales pipeline, expansion plans), not the engineering team. **If nobody can answer, treat it as yes** *(recommendation)*: a team's zone can never change, and the cost of a wrong "no" is Phase 8 under time pressure.

### 11.3 Q2: outside consumers

**What it asks.** Does anything outside the three apps read our ISO dates: the customer-facing modules (Customer in Gateway, Handover, Jobs, Permissions, Resources), exports, webhooks, BI, or readers of our Service Bus events (P0.6)?

**Going live in one step does not cause this problem.** The team-local plan stores team wall clock labelled `Z`, and every standard library reads `Z` as UTC. A consumer that does not know shows 09:00 for an 08:00 London clock-in in summer. A phased team-local plan would have the same problem.

**What the one step changes is how the break arrives:**

1. **A hard cut in one night.** The same field changes meaning for every row, past and new, at one moment. Every consumer must switch in that same night, so each needs its own switch ready beforehand. Outside parties keep their own release dates.
2. **Copies made before the night.** A BI warehouse, saved exports or data synced to the portal hold rows in the old UTC meaning; everything after the night is wall clock. Their store mixes both unless they reload everything.
3. **Messages in flight.** Integration events in the outboxes are not converted (M2.4). Events published before the night are UTC, after it wall clock; a consumer that replays or runs late gets both.
4. **Rollback.** A rollback after reopening (R2) must be followed by every consumer too.

```text
A clock-in at 08:00 London on 15 July 2026, as a consumer outside the three apps sees it

                           Before the night       After the night: team-local       After the night: UTC plan
                           ────────────────────   ───────────────────────────────   ─────────────────────────────
API, export, webhook       2026-07-15T07:00Z      2026-07-15T08:00Z                 2026-07-15T07:00Z
Consumer reads Z as UTC    08:00 London  ✔        09:00 London  ✘                   08:00 London  ✔
Copy taken before the      07:00Z                 old rows UTC, new rows wall       one meaning  ✔
night (BI, portal sync)                           clock: mixed  ✘
Event in an outbox         07:00Z                 published before: UTC,            one meaning  ✔
(not converted, M2.4)                             after: wall clock  ✘
Read through one           not needed             layer turns 08:00 London          not needed
conversion layer                                  back into 07:00Z  ✔
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| ✔ | The consumer gets the right London time with no change on its side. | UTC API value |
| ✘ | The consumer is wrong unless it changes. | 09:00 shown for an 08:00 clock-in |
| Copy taken before the night | Data the consumer stored before go-live and keeps. | last month's rows in the BI warehouse |
| Event in an outbox | An integration event stored in an outbox and published to Service Bus; its stored copy is not converted. | ActiveWork `SectionFirstErectOccurred` (`OccurredDate`) |
| Conversion layer | One place at our boundary that turns wall clock back into UTC with the team's zone. | Gateway route for the customer portal |

**The UTC plan is unaffected.** Instants keep a real UTC `Z`, and calendar dates keep today's shape (the team's midnight as UTC, `2026-07-05T23:00Z` for 6 July in a London summer), so no consumer sees a change. A consumer that takes the UTC date part of a calendar date is wrong today and stays wrong; it should convert to the team's zone.

**How team-local can soften it: one conversion layer.** Gateway and the export layer turn wall clock back into UTC with the team's zone for every outside reader. "Every consumer must change" becomes "we build one boundary before go-live", and points 1, 3 and 4 above disappear for consumers behind it. Point 2 stays for any copy made before the night that reads raw data. The layer does not help consumers that read MongoDB or Service Bus directly: those must change themselves, so for them Q2 is "yes".

### 11.4 Reading of the evidence

Going live in one step, both plans fix London on the same morning, so the old "team-local is faster to be right" argument shrinks to "team-local has less to build before the night". The UTC plan keeps its strengths: no stored date is rewritten, the go-live night needs no data stop, durations and order stay exact, outside consumers keep a real UTC `Z`, and other zones work from go-live. Its costs stay too: about 490 repo steps and a time zone in every day query, calendar dates included. The team-local plan is smaller and makes day logic and per-team database reports simpler, but needs the longest go-live night, a wall-clock `Z` that outside consumers must understand or read through a conversion layer, and Phase 8 before the first non-London team.

### 11.5 Recommendation

Choose the **UTC plan** if any of these holds:

- a non-London team must start before team-local Phase 8 could be built, or nobody can say (Q1);
- outside consumers read our dates and one conversion layer cannot serve them all (Q2);
- every service cannot stop for the long migration night (Q3).

It rewrites no data: calendar dates keep today's shape (the team's midnight as UTC) and are read with the team's calendar.

With no blocker and no strong benefit, the UTC plan is also the default: it is the **simplest overall** (simpler in 5 of 8 stages).

Otherwise, if the business is confident it stays London-only and wants the smallest build before go-live, choose the **team-local plan**, the **simplest to build**: build the conversion layer for outside consumers before go-live, and keep Phase 8 in the roadmap.

For direct MongoDB reporting, team-local is better for per-team and local-day reports and UTC for cross-team same-moment and duration reports; with either plan, report views (section 9.3) remove most of the difference.

### 11.6 Opinion: which plan has more benefits

*This section is the author's opinion, built on the counts and scores above.*

```text
Benefits of each plan, and how long each lasts
█ UTC   ▒ team-local

Correct times across zones and clock changes           ██████████ UTC      for the life of the system
Z means UTC for every reader                           ██████████ UTC      for the life of the system
A second time zone works from go-live                  ██████████ UTC      for the life of the system
One clock, plain duration maths                        ██████████ UTC      for the life of the system
The common convention for libraries, tools, new staff  ██████████ UTC      for the life of the system
Shorter go-live night, no data rewritten               ██████████ UTC      once, at go-live
Simple rollback                                        ██████████ UTC      once, in the first weeks
Smaller build before go-live                           ▒▒▒▒▒▒▒▒▒▒ Local    once, before go-live
Day and week logic as plain .Date                      ▒▒▒▒▒▒▒▒▒▒ Local    while every team is London
Per-team MongoDB reports with no zone                  ▒▒▒▒▒▒▒▒▒▒ Local    while every team is London
One calendar-date shape, D 00:00Z in every zone        ▒▒▒▒▒▒▒▒▒▒ Local    for the life of the system

UTC         7 benefits, 5 for the life of the system
Team-local  4 benefits, 1 for the life of the system: 1 is spent at go-live, 2 last while every team is London
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| ██████████ UTC | A benefit only the UTC plan gives. | `Z` means UTC for every reader |
| ▒▒▒▒▒▒▒▒▒▒ Local | A benefit only the team-local plan gives. | day logic as plain `.Date` |
| for the life of the system | The benefit keeps paying every day after go-live, whatever teams are added. | durations need no `Elapsed` |
| once, at go-live / before go-live / in the first weeks | The benefit is spent once. | the smaller build is used up on go-live day |
| while every team is London | The benefit lasts only until the first non-London team; then it needs Phase 8 or conversion. | per-team reports with no zone |

**In my opinion the UTC plan has more benefits**: 7 against 4, and 5 of its 7 last for the life of the system. The team-local plan's benefits are real: one calendar shape lasts for good, but its biggest one, the smaller build, is spent on go-live day, and two last only while every team is London. Its costs last for good: a `Z` that does not mean UTC, two clocks, `Elapsed` for every duration, the ambiguous autumn hour and Phase 8 before a second zone.

The UTC plan's price: about 490 build steps against 194, paid once, and a time zone in every day query, calendar dates included, for good. It rewrites no data at all.

**I would choose the team-local plan only if all of these hold:** the business is sure every team stays London for years, nothing outside the three apps reads our dates (or one conversion layer serves them all), every service can stop for the long migration night, and the date fix is needed sooner than the UTC build allows.