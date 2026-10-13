# UTC Plan vs Team-Local Plan — Comparison

> **Status:** comparison only, no product code changed. Written 2026-10-06, updated 2026-10-07 (UTC D1: a calendar date is the team's midnight, stored as UTC; no data rewritten).
> **Frame (agreed):** both plans go live **in one step**: code shipped dark, rehearsed on a production copy, switched on for every service and team in one go-live night.
> **Plans:** `utc-time-zone/UTC_IMPLEMENTATION_PLAN.md` and `team-local/TEAM_LOCAL_TIME_PLAN.md`. Every count, query, table and chart legend behind this summary is in `PLAN_COMPARISON_DETAILS.md`.
> **Decides:** team-local T0 / Q1. The plans cannot both run: they store opposite things.

---

## Which plan works more easily with external services

**The UTC plan.** Its dates mean the same inside and outside: `Z` is real UTC, the standard that every outside API, library and tool expects. In the team-local plan `Z` holds the London wall clock, so almost every boundary with the outside needs a conversion.

| External service | UTC plan | Team-local plan | Easier |
|---|---|---|---|
| Outside APIs that send or take times (Google Routes, TimeTastic, Breathe HR, push and e-mail providers) | pass times as they are | convert on every call: `ToSystemInstant` / `FromSystemInstant` | UTC |
| Day-only feeds (bank holidays) | turn the day into the team's midnight | store the day as it comes (`D 00:00Z`) | team-local |
| Our API, exports, webhooks, customer portal, BI | read correctly, no change on their side | one conversion layer at Gateway and exports, or every reader changes | UTC |
| Service Bus events read by other systems | UTC before and after go-live | wall clock after go-live; events already stored stay UTC, so a late reader gets both | UTC |
| Systems that read MongoDB directly | standard UTC | must convert with the team's zone themselves | UTC |
| A second time zone | works the same | needs Phase 8; wall clocks of different zones cannot be compared | UTC |

**Easier in 5 of 6 for the UTC plan.** Scorecard row "Outside consumers and integrations": UTC ●●●●●, team-local ●●○○○.

---

## 1. The answer

### The 7 benefits of the UTC plan

The **UTC plan** goes live in one go-live night and rewrites no stored date. A calendar date (absence, week commencing) is the picked day's midnight in the team's zone, sent and stored as UTC, which is what is stored today (`Sun 23:00Z` for Monday in a London summer; D1, D4). Every lookup reads the day with the team's calendar.

| # | Benefit | What it means | Lasts |
|---|---|---|---|
| 1 | Correct times everywhere | Teams in different zones and shifts across a clock change are always right, because every value is a real moment. | Life of the system |
| 2 | `Z` means UTC for every reader | Exports, BI, the customer portal and integrations read our times correctly with no change on their side. | Life of the system |
| 3 | A second time zone works from go-live | A Riyadh team can start the next day; no Phase 8, no data conversion. | Life of the system |
| 4 | One clock, plain duration maths | Hours worked are a simple subtraction; no `Elapsed`, no separate technical clock. | Life of the system |
| 5 | The common convention | Libraries, MongoDB, cloud tools and new staff all expect UTC, so less to explain and less to get wrong. | Life of the system |
| 6 | Shorter go-live night | No stored date is rewritten, against 118 collections and 12 event stores in team-local. | Once |
| 7 | Simple rollback | Flip the switch back, no data to restore; team-local must reverse every date after reopening. | Once |

Team-local's 4 in return: one calendar-date shape, `D 00:00Z` in every zone (for good), a smaller build (once), day logic as plain `.Date` and per-team MongoDB reports with no zone (both only while every team is London).

### In numbers

```text
╔═════════════════════════════════════════════════════════════════════════════════════════════╗
║ Simplest overall:   UTC         simpler in 5 of 8 stages of the system's life               ║
║ Simplest to build:  team-local  simpler in 3 of 8 stages; 194 build steps against about 490 ║
║ More benefits:      UTC         7 benefits against 4 (opinion, section 9)                   ║
╚═════════════════════════════════════════════════════════════════════════════════════════════╝
```

- **Both plans fix every London date on the same morning**, the one after the go-live night.
- **Team-local** is smaller to build and makes day logic, calendar dates and per-team database reports simpler. It pays with the longest go-live night, a `Z` that is not UTC, two clocks, `Elapsed` for every duration, and Phase 8 before any non-London team.
- **The UTC plan** is bigger to build. It rewrites no stored date, so its go-live night has no data stop; it keeps durations exact and `Z` real UTC, and works for other zones from day one.
- **Recommendation:** the UTC plan, unless every condition for team-local in section 8 holds.

---

## 2. The difference in one picture

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

---

## 3. How each plan goes live

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

**What changes in the UTC plan for the one-step go-live.** It is written as a phased rollout. Going live in one step, one global switch replaces the pilot team and the per-team switch; the summer and winter payroll checks on live teams become a 26-week shadow compare before go-live; a rehearsal is added; old app builds are blocked at go-live; `Legacy*` calculators for old weeks stay. The full list is in the details file, section 2.2.

---

## 4. Side by side

| Topic | UTC | Team-local |
|---|---|---|
| **Stored** | A real instant (UTC). | The team's wall clock, labelled `Z`. |
| **Calendar dates** | The team's midnight, stored as UTC: `Sun 23:00Z` for Monday in a London summer, as today. | Every row `D 00:00Z`. |
| **Old data rewritten** | None (D4). Old browser-midnight rows stay one day early, as today (optional fix, Q16). | 118 collections: 501 paths and 318 event paths. |
| **Go-live night** | Flip `Time:RulesMode`, remove `TZ`, block old app builds. No data stop. | Stop every service, migrate, flip `Time:StorageMode`, remove `TZ`, block old builds (C1–C12). |
| **Rollback** | Flip the switch back; no data to restore. | Rename back before reopening (R1); reverse every date after (R2). |
| **Backend** | `IDateTimeProvider` returns UTC; `IBusinessCalendar` in every day query, calendar dates too. | `IDateTimeProvider` returns team time, `ISystemClock` real UTC; `.Date` is the team day; `Elapsed` for durations. |
| **Frontend** | Shared control, `teamDate`, `calendarDate`. | The same, plus `ApiDateConverter` in 59 API service files. |
| **Durations, autumn hour** | Exact. | `Elapsed` needed across clock changes; the repeated autumn hour is ambiguous. |
| **Attendance** | One global switch after a 26-week shadow compare; `Legacy*` calculators for old weeks; 7 pay-affecting changes; night shifts paired (16 h). | One global flip after a 26-week shadow compare; 9 pay-affecting changes; night shifts still unpaired. |
| **Recurring jobs** | One per team, in the team's zone. | London schedule kept until Phase 8. |
| **Non-London teams** | Work from go-live. | Only after Phase 8. |
| **Outside consumers** | No change: `Z` stays UTC, calendar dates keep today's shape. | `Z` is wall clock: one conversion layer, or every consumer changes. |

**The same in both:**

- One go-live night after code shipped dark, a rehearsal on a production copy and a 26-week payroll shadow compare. Every London screen, report and wage is right the next morning.
- The same screens: `<app-date-time-field>`, `teamDate`, `calendarDate`, the zone label when the device zone differs.
- `IDateTimeProvider` for every clock read, `WireDate` for every incoming date, the TZ test matrix in CI, no `TZ` in any container.
- A team's zone is set once and never changes; London by default.

---

## 5. Scores, size and risk

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

```text
Size of the change
█ UTC   ▒ team-local

Build steps before go-live          UTC    ██████████████████████████████████  490
                                    Local  ▒▒▒▒▒▒▒▒▒▒▒▒▒                       194
of which Attendance                 UTC    █████████                           127
                                    Local  ▒▒                                   29
Code sites only team-local touches  UTC                                          0
                                    Local  ▒▒▒▒▒▒▒▒▒▒                          143
```

```text
Stored data rewritten in the go-live night
█ UTC   ▒ team-local

Model collections rewritten    UTC                                          0
                               Local  ▒▒▒▒▒▒▒                             106
Declared date paths rewritten  UTC                                          0
                               Local  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  501
Event payload paths rewritten  UTC                                          0
                               Local  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒              318
```

```text
Risk in each plan   (none · low ██ · medium ████ · high ██████)

Risk                                        UTC                Team-local

Everything changes in one night             ████   medium      ▒▒▒▒   medium
A value converted twice or not at all              none        ▒▒▒▒   medium
A calendar date read as the wrong day       ██     low         ▒▒     low
Payroll difference after go-live            ████   medium      ▒▒▒▒   medium
Go-live night longer than planned           ██     low         ▒▒▒▒   medium
A missed day query uses the UTC day         ██████ high        ▒▒     low
A missed duration ignores a clock change    ██     low         ▒▒▒▒   medium
Outside consumer misreads `Z`               ██     low         ▒▒▒▒▒▒ high
Mixed-zone reports wrong                    ██     low         ▒▒▒▒▒▒ high
Technical time confused with business time  ██     low         ▒▒▒▒   medium
```

---

## 6. Edge cases

| # | Case | UTC | Team-local | Simpler |
|---|---|---|---|---|
| E1 | Clock-in 08:00 BST, 15 Jul 2026 | stored `07:00Z` | stored `08:00Z` | same screen |
| E2 | Absence on 6 Jul (calendar date) | `2026-07-05T23:00Z`, day from `calendar.DayOf` | `2026-07-06T00:00Z`, day from `.Date` | team-local |
| E3 | Week commencing in summer | `Sun 23:00Z` (winter `Mon 00:00Z`), found by the team-day range | `Mon 00:00Z` all year, exact match | team-local |
| E4 | Night shift 22:00 → 06:00 on 28 Mar 2027 (clocks go forward) | 7 h by subtraction | 8 h by subtraction; 7 h only through `Elapsed` | UTC |
| E5 | In 01:30 BST, out 01:10 GMT on 25 Oct 2026 | 40 min | out before in | UTC |
| E6 | Clock-in 00:30 BST, which day? | `calendar.DayOf` | `.Date` | same |
| E7 | Who started before 08:00 local, London and Riyadh | convert per zone | compare as stored | team-local |
| E8 | Who was on site at the same moment, London and Riyadh | compare as stored | convert per zone | UTC |
| E9 | Bank holiday from the feed (a date) | convert to the team's midnight | store as it comes | team-local |
| E10 | `Created` from `ObjectId.CreationTime` | no change | `FromSystemInstant` at 84 sites | UTC |
| E11 | ISO date in a BI export or the portal | real UTC | wall clock; readers must be told | UTC |
| E12 | A time from an outside API (routes, part-day absence) | store as it comes | `FromSystemInstant` first | UTC |

**Count:** UTC simpler in 6, team-local in 4, same in 2.

---

## 7. Reports straight on MongoDB

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

**Example: clock-ins per day for one team.** UTC needs the zone in the query; team-local does not.

```javascript
db.getCollection("Attendance:WageRecords").aggregate([
  { $match: { TeamName: "acme", Deleted: false } },
  { $group: {
      _id: { $dateTrunc: { date: "$Attendance.ClockInDate", unit: "day", timezone: "Europe/London" } },
      clockIns: { $sum: 1 } } }
])
```

Team-local: the same query without `timezone: "Europe/London"`. The reverse case is "who was on site at the same moment" across zones: UTC compares as stored, team-local must convert each wall clock with `$dateFromParts` and the team's zone (full queries in the details file, section 9.2).

**In short:** team-local is better for per-team, local-day and calendar-date reports, UTC for same-moment, order and duration reports across teams. With either plan, give dashboards a MongoDB view with ready fields (`teamDay`, `teamHour`, `instant`, `minutesWorked`) so the zone logic is written once.

---

## 8. How to choose

Answer from the top. The first answer pointing right decides. **Part A** asks whether team-local can work for us at all (blockers, hardest to change first); **Part B** whether it is worth it (benefits, biggest first). If nothing decides, the UTC plan, the simplest overall.

```text
╔═════════════════════════════════════════════════════════════════════════════════════════════╗
║ Simplest overall:   UTC         simpler in 5 of 8 stages of the system's life               ║
║ Simplest to build:  team-local  simpler in 3 of 8 stages; 194 build steps against about 490 ║
║ More benefits:      UTC         7 benefits against 4 (opinion, section 9)                   ║
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

**Why outside consumers matter more in one step (Q2).** Team-local's `Z` problem is not caused by the one-step go-live, but the one step makes it a hard cut: every consumer must switch the same night, copies taken before the night mix two meanings, events already in outboxes stay UTC, and a rollback must be followed by every consumer.

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

**What "simplest overall" means.** Neither plan is simpler everywhere:

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

---

## 9. Opinion: which plan has more benefits

*The author's opinion, built on the counts above.*

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

**The UTC plan has more benefits** (listed in section 1): 7 against 4, and 5 of them last for the life of the system. Team-local keeps one calendar shape for good, but its biggest benefit, the smaller build, is spent on go-live day, and two others last only while every team is London; its costs stay for good. UTC's price: more to build (once) and a zone in every day query, calendar dates included (for good). It rewrites no data at all.

**Choose the team-local plan only if all of these hold:** every team stays London for years; nothing outside the three apps reads our dates, or one conversion layer serves them all; every service can stop for the long migration night; and the fix is needed sooner than the UTC build allows. Then build the conversion layer before go-live and keep Phase 8 in the roadmap.
