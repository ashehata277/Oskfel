# Team Local Time — Database Migration Report

> **Status:** report and design only — nothing has been run against any database. Written 2026-10-06.
> **Goal of the migration:** convert every stored business date from UTC to the team's wall-clock time. Every team is London today, so the target zone is `Europe/London` for all data.
> **Parent plan:** `TEAM_LOCAL_TIME_PLAN.md` (decisions T0–T14, backend and frontend changes, phases). This report covers only the data: scope, rules, method, scripts, cut-over runbook, verification, rollback.
> **Sources:** a scan of every MongoDB model reachable from a `GetCollection<T>(…)` call in the 14 service repos (nested types, lists and base classes followed), every event class with a date, and grep over the code. No live database was read. Row counts, values that the models do not declare and string-typed dates come from the profile run (M0) on a production copy.

---

## 1. Summary in numbers

| Item | Count | Notes |
|---|---|---|
| Databases | 1 per environment | MongoDB Atlas, shared by every service: `Intowork` (production), `baton-stage` / `IntoworkStaging` (staging). Collections are named `Service:Name`. |
| Collections owned by the services | **172** | 171 declared in the services' `DbContext` classes + `gaffer_conversations` (GafferService). Hangfire storage (`ActiveWork:Hangfire*`, `Attendance:Hangfire*`, `Materials:Hangfire*`, `Resources:Hangfire*`) is not counted and not touched. |
| **Collections converted** | **118** | 106 whose models declare business dates + 12 event stores whose `Data` payloads hold dates |
| Collections with technical dates only (not converted) | 24 | 23 inbox/outbox collections + `Notifications:ExternalNotifications` |
| Collections with no dates in the models | 29 | Profiled in M0; any date found there moves the collection into scope |
| Other not converted | 1 | `gaffer_conversations` (technical, plan T7) |
| Date paths declared in models | **501** | 372 instant · 96 calendar date · 32 technical · 1 duration (`TimeSpan`, not a date). 20 paths first listed as calendar dates hold a real time and moved to instant (dev profile, section 3.4; marked ³) |
| Converted paths inside arrays | 127 | e.g. `StaffDayAssignments[].Date`, `sections[].items[].pricedItem.pricedMaterials[].material.createdDate` (4 array levels) |
| Event stores | **12** | `ActiveWork:Events`, `Attendance:Events`, `Attendance:WageEvents`, `Customers:Events`, `Forecasting:Events`, `Handovers:Events`, `Inspections:Events`, `Jobs:Events`, `Permissions:Events`, `Permissions:Customer:Events`, `Resources:Events`, `Resources:Customer:Events` |
| Domain event classes with dates | **120** classes, **318** date paths (72 calendar, 246 instant) | Appendix B; 31 event paths for the same fields moved from calendar to instant (marked ³) |
| Integration event classes with dates | 157 classes, 356 date paths | Outbox `Data` and Service Bus contracts; **not converted in storage** (M2.4) |
| Paths flagged "verify kind" | 29 | marked ¹ in Appendix A; settled by the M0 histogram |
| Calendar paths already date-only | 32 on dev | 9 known from the code (marked ²: HR-synced and bank-holiday absences, vehicle unavailability); the dev profile found 32 calendar paths holding `00:00Z` only or nearly only (section 3.4) |
| `DateTime.MinValue` / `MaxValue` in code | 59 sites | sentinel values are never converted (rule S) |
| Unique indexes containing a date | 1 | `Resources:HrBankHolidays` `{ Date, CountryCode }` — calendar rule leaves those values unchanged |
| TTL indexes on a date | 2 | `ActiveWork:NotificationsLogs.CreatedAtUtc` (30 days), `Notifications:UserNotifications.ExpiresAt` — technical, not converted |
| Readers of other services' collections | Report.API reads 15 collections directly | owns none; changes with the code (plan section 4.5) |

**Per service**

| Service | Collections | Converted (fields) | Event stores | Technical only | No dates | Instant paths | Calendar paths |
|---|---|---|---|---|---|---|---|
| ActiveWork | 10 | 6 | 1 | 2 | 1 | 21 | 8 |
| Attendance | 14 | 9 | 2 | 2 | 1 | 34 | 10 |
| Customer | 5 | 3 | 1 | — | 1 | 7 | — |
| Forecasting | 4 | 2 | 1 | 1 | — | 4 | 2 |
| Gateway | 8 | 1 | — | 2 | 5 | 2 | — |
| Handover (incl. customer) | 14 | 8 | 1 | 4 | 1 | 32 | 5 |
| Inspections | 9 | 5 | 1 | 2 | 1 | 12 | 4 |
| Materials | 14 | 11 | — | 1 | 2 | 68 | 14 |
| Notification | 2 | 1 | — | 1 | — | 1 | — |
| Permissions (incl. customer) | 11 | 5 | 2 | 2 | 2 | 5 | — |
| Project (incl. customer) | 61 | 45 | 1 | 3 | 12 | 167 | 37 |
| Resources (incl. customer) | 15 | 7 | 2 | 4 | 2 | 12 | 16 |
| SafetySuite | 4 | 3 | — | — | 1 | 7 | — |
| Gaffer | 1 | — | — | 1 | — | — | — |
| **Total** | **172** | **106** | **12** | **25** | **29** | **372** | **96** |

### 1.1 At a glance

**What happens to each of the 172 collections:**

```text
Collections by treatment (172)

Converted by declared fields         █████████████████████████                 106   62 %
Converted event stores               ███                                        12    7 %
Technical dates only (unchanged)     ██████                                     24   14 %
No dates in the models (M0 profile)  ███████                                    29   17 %
Assistant store (technical)          █                                           1    1 %
Total                                                                          172  100 %
```

**Legend**

| Label | Meaning | Example |
|---|---|---|
| Converted by declared fields | The C# model declares at least one business date; the migration rewrites those values. | `Attendance:WageRecords` (`Attendance.ClockInDate`), `Materials:Vehicles` (`MotExpiryDate`) |
| Converted event stores | Event history; every date inside `Data` is rewritten, `_id` and the other ObjectIds are not. | `Attendance:WageEvents`: `Data.WeekCommencing` of a `WageBonusAwarded` event |
| Technical dates only (unchanged) | The only dates are bookkeeping times compared with the real clock; they stay UTC. | `ActiveWork:IncomingIntegrationEvents` (`HandledDate`), `Notifications:ExternalNotifications` (`NextAttemptAt`) |
| No dates in the models (M0 profile) | The model has no date property; M0 still scans the stored documents and moves the collection into scope if it finds one. | `ActiveWork:ITWSequence`, `Attendance:Projects`, `Gateway:CurrentConfig` |
| Assistant store (technical) | GafferService conversations; kept UTC (plan T7). | `gaffer_conversations` |
| Bar, count, % | The bar length is the share of the 172 collections; the % is rounded. | `106   62 %` = 106 of 172 collections |

**What kind of date each of the 501 declared paths holds:**

```text
Declared date paths by rule (501)

I - instant            ██████████████████████████████            372   74 %
C - calendar date      ████████                                   96   19 %
T - technical          ███                                        32    6 %
Duration (not a date)  █                                           1    0 %
Total                                                            501  100 %
```

**Legend**

| Label | Meaning | Example |
|---|---|---|
| Path | Where a field sits inside a document, with dots for nesting; `[]` marks an array. | `Week[].DayRecords[].ClockIn` in `Attendance:WageWeekSnapshots` |
| I - instant | A moment in time; becomes the London wall clock of that moment, still labelled `Z`. | `Handovers:Handovers.SubmittedDate`: `2026-07-01T07:00Z` → `2026-07-01T08:00Z` in summer; unchanged in winter |
| C - calendar date | A day with no time of day; becomes `D 00:00Z` by rule C (section 2), which handles every old shape found by the dev profile. | `Attendance:WageBonus.WeekCommencing`: `2026-07-05T23:00Z` → `2026-07-06T00:00Z` |
| T - technical | Bookkeeping time (TTL, retry, inbox, outbox); unchanged. | `ActiveWork:OutboundIntegrationEvents.PublishDate`, `ActiveWork:NotificationsLogs.CreatedAtUtc` (TTL) |
| Duration (not a date) | A `TimeSpan`; not a point in time, so unchanged. | `Jobs:QuotationVersions` `site.yardToSiteEstimatedJourneyTime` |

**Converted date paths per service** (█ instant, ▒ calendar date):

```text
Converted date paths per service
█ instant   ▒ calendar date

Project       █████████████████████████████████▒▒▒▒▒▒▒  204  (167 + 37)
Materials     █████████████▒▒▒                           82  (68 + 14)
Attendance    ███████▒▒                                  44  (34 + 10)
Handover      ██████▒                                    37  (32 + 5)
ActiveWork    ████▒▒                                     29  (21 + 8)
Resources     ██▒▒▒                                      28  (12 + 16)
Inspections   ██▒                                        16  (12 + 4)
Customer      █                                           7  (7 + 0)
SafetySuite   █                                           7  (7 + 0)
Forecasting   █▒                                          6  (4 + 2)
Permissions   █                                           5  (5 + 0)
Gateway       █                                           2  (2 + 0)
Notification  █                                           1  (1 + 0)
```

**Legend**

| Label | Meaning | Example |
|---|---|---|
| █ | Instant paths (rule I) in that service's converted collections. | Attendance: 34, such as `AttendanceRecords[].ClockInDate` |
| ▒ | Calendar-date paths (rule C). | Attendance: 10, such as `WageWeekSnapshots.WeekCommencing` |
| Number, `(a + b)` | The total converted paths, then instant + calendar. Technical paths are not counted. | `44  (34 + 10)` |
| Project | All `Jobs:*` collections, including `Jobs:Customer:*`. | `Jobs:Jobs` `securedSections[].information.orderReceivedDate` (calendar), `Jobs:Quotations.submittedOn` (instant) |
| Handover, Permissions, Resources | Include their `:Customer:` collections. | `Resources:Customer:StaffMembers.DateOfBirth` (calendar) |
| Materials | All `Materials:*` collections. | `Materials:Vehicles.MotExpiryDate` (calendar), `Materials:CollectionRequests.RequestedOn` (instant) |

**Event store payloads converted** (domain events; 318 paths in 120 classes):

```text
Domain event date paths per service (318 paths, 120 classes)

Project       ████████████████████████████████████████  130
ActiveWork    ████████████████████████                   77
Attendance    █████████████████                          55
Resources     █████                                      16
Handover      ████                                       13
Inspections   ███                                         9
Forecasting   ██                                          8
Notification  █                                           4
Permissions   █                                           4
Customer      █                                           2
```

**Legend**

| Label | Meaning | Example |
|---|---|---|
| Service | The service that owns the event store(s). | Project → `Jobs:Events`; Attendance → `Attendance:Events` + `Attendance:WageEvents`; Permissions and Resources include their `:Customer:Events` stores |
| Number | Date paths inside `Data`, summed over every event class of that service (Appendix B). | Project 130 over 21 classes |
| Calendar path in an event | Marked `c` in Appendix B; converted with rule C (`c`³ = moved to rule I by the dev profile). | `ActiveWorkCreatedEvent3` `StartDate` `c` |
| Instant path in an event | Converted with rule I. | `HandoverApprovedEvent.ApprovedDate` |
| Not counted | Integration events (outbox and Service Bus): 157 classes, 356 paths, not converted in storage (M2.4). | `Handovers:OutboundIntegrationEvents` |

**How a single value is converted** (section 2):

```text
BSON Date v at path p
   │
   ▼
p technical? (plan 4.4) ──── yes ──► T: unchanged
   │ no
   ▼
year < 1800 or > 9000? ───── yes ──► S: unchanged
   │ no
   ▼
p in the calendar list? ──── yes ──► C: London day of v at 00:00Z ────┐
   │ no                                                               │
   ▼                                                                  ▼
I: London wall clock of v, labelled Z ──────────────────────────────► M4 invariants
```

**Legend**

| Label | Meaning | Example |
|---|---|---|
| `v` | The stored value: a BSON Date, real UTC today. | `2026-07-06T06:55Z` |
| `p` | The path of that value in its document. | `Attendance.ClockInDate` in `Attendance:WageRecords` |
| technical? | `p` is in the technical list of plan 4.4. | `HandledDate` → **T**, unchanged |
| year < 1800 or > 9000 | A sentinel (`DateTime.MinValue` / `MaxValue`). | `0001-01-01T00:00Z` → **S**, unchanged |
| calendar list | Appendix A middle column, or Appendix B `c`. | `Attendance:WageBonus.WeekCommencing` `2026-07-05T23:00Z` → **C** → `2026-07-06T00:00Z` |
| Neither | Everything else is an instant. | `Attendance:WageRecords` `Attendance.ClockInDate` `2026-07-06T06:55Z` → **I** → `2026-07-06T07:55Z` |
| M4 invariants | The checks in section 2 that every converted value must pass. | I: `v' − v` is 0 or +60 min; C: `v'` is at `00:00:00.000Z` |

**From profile to swap, with the rollback paths** (sections 4, 5 and 7):

```text
M0  profile (172 collections)
 │
 ▼
M1  dry run
 │
 ▼
M2  build shadows: 118 × X__tl  ◄───────────────────────────────────────┐
 │                                                                      │
 ▼                                                                      │
M3  copy indexes                                                        │
 │                                                                      │
 ▼                                                                      │
M4  verify (M4.1–M4.10) ── red ──► drop X__tl, fix the rules file ──────┘
 │ green
 ▼
M5  swap: X → X__utc_<date>, X__tl → X
 │
 ▼
C12 go? ──── no-go ──► R1  rename back + Utc mode (no data loss)
 │ go
 ▼
Reopen and monitor for 30 days
 ├──► fault with no forward fix ──► R2  reverse shadows
 ├──► last resort ────────────────► R3  restore the C7 snapshot
 └──► after 30 stable days ───────► R4  drop the X__utc backups
```

**Legend**

| Label | Meaning | Example |
|---|---|---|
| `X` | An in-scope collection. | `Attendance:WageRecords` |
| `X__tl` | Its shadow, built with converted values; the original is never written. | `Attendance:WageRecords__tl` |
| `X__utc_<date>` | The original after the swap, kept as a backup for 30 days. | `Attendance:WageRecords__utc_20261108` |
| M0–M5 | Steps in section 5.1: profile, dry run, build, indexes, verify, swap. | M3 copies every index of `X` onto `X__tl` |
| red / green | The M4 result. Red loops back to M2 after the shadow is dropped and the rules file is fixed. | A calendar path found at `01:00Z` fails M4.4 → red |
| C7, C12 | Runbook steps: C7 is the Atlas snapshot, C12 the go / no-go decision. | — |
| R1–R4 | Rollback options in section 7. | R1: rename `X__utc_<date>` back to `X` and set `Utc` mode |

**Cut-over runbook** (section 5.2):

```text
BEFORE THE WINDOW
  T-14 d   rehearsal 2 signed off · payroll shadow compare signed
    │
  T-7 d    announce · mobile builds with ApiDateConverter released
    │
  T-2 d    every mode-aware build live in Utc mode
    │
  T-1 d    disk headroom · Atlas backups · deployment freeze
    │
    ▼
WINDOW
  C1   maintenance mode (Gateway 503)
    │
  C2   mobile queues synced and counted
    │
  C3   stop schedulers (Hangfire, external reminder caller)
    │
  C4   drain outboxes and Service Bus to zero
    │
  C5   stop every API and Background host
    │
  C6   flush Redis
    │
  C7   Atlas on-demand snapshot
    │
  C8   migration: M2 → M3 → M4 → M5
    │
  C9   Time:StorageMode = TeamLocal · images without TZ
    │
  C10  start hosts · smoke tests · start schedulers
    │
  C11  raise minimum app versions
    │
  C12  go? ──── no-go ──► R1 (rollback, no data loss)
    │ go
    ▼
AFTER
  T+1 d … T+30 d   monitor daily
    │
  P7.1             drop the __utc backups
```

**Legend**

| Label | Meaning | Example |
|---|---|---|
| T-14 d … T-1 d | Days before the window. | T-2 d: every build with the mode-aware code is live but still in `Utc` mode |
| C1–C12 | Steps inside the window, in order; each needs its check (section 5.2) before the next. | C4: every `*:OutboundIntegrationEvents` has 0 rows with `Published = false` |
| Maintenance mode | Gateway answers 503 on every business route. | the apps show the maintenance page |
| Schedulers | Hangfire servers and the external reminder caller. | Attendance morning reminders at 08:00 |
| `Time:StorageMode` | The switch that makes every service read and write team-local values. | `Utc` → `TeamLocal` at C9 |
| Images without TZ | The six containers that set `TZ=Europe/London` are rebuilt without it. | ActiveWork API and Background |
| Minimum versions | Old app builds are blocked so they cannot send UTC values. | Frontend `version-block-interceptor` |
| T+1 d … T+30 d, P7.1 | Days after the window, then dropping the backups. | daily check that no calendar value has a time other than `00:00` |

**Risks by area** (section 8, 13 risks):

```text
Risks by area (13)

Rules and classification                ████████████                              4   31 %
Writes and messages during the window   █████████                                 3   23 %
Window length, disk and oplog           ██████                                    2   15 %
Autumn repeated hour                    ███                                       1    8 %
Sentinels                               ███                                       1    8 %
Atlas Search, triggers, change streams  ███                                       1    8 %
Readers with old assumptions            ███                                       1    8 %
Total                                                                             13  100 %
```

**Legend**

| Label | Risks in section 8 it groups | Example |
|---|---|---|
| Rules and classification | converted twice; calendar treated as instant; instant treated as calendar; undeclared path | a calendar `StartDate` of `2026-07-06T00:00Z` treated as an instant becomes `01:00Z`, and an exact lookup on `00:00Z` misses it |
| Writes and messages during the window | writes during the migration; messages in flight; mobile offline items | an offline InspectionsApp item queued before C1 and sent after C9 with a UTC time |
| Window length, disk and oplog | window too long; disk or oplog pressure | the shadows need free disk equal to the 118 collections and their indexes |
| Autumn repeated hour | values in 01:00–02:00 on the last Sunday of October | clock-out `01:10` sorts before clock-in `01:30` |
| Sentinels | `MinValue` shifted to London local mean time | `0001-01-01` would become `-00:01:15` without rule S |
| Atlas Search, triggers, change streams | renaming a collection breaks them | a search index on `Jobs:Jobs` has to be recreated after M5 |
| Readers with old assumptions | Report.API or a script still expecting UTC | a report shifting values by an hour twice |

---

## 2. Conversion rules

`v` is the stored value (a BSON Date, real UTC today); `v'` is the value after migration.

| Rule | Applies to | `v'` | Example (summer) | Example (winter) |
|---|---|---|---|---|
| **I — instant** | every date not covered by C, T or S | London wall clock of `v`, labelled `Z` | `2026-07-01T07:00Z` → `2026-07-01T08:00Z` | `2026-01-01T08:00Z` → `2026-01-01T08:00Z` |
| **C — calendar date** | paths in the calendar list (Appendix A middle column without ³, Appendix B `c` without ³) | `D 00:00Z`, where D is: (1) time `22:59` or `23:59` → the London day of `v`; (2) exactly on the hour within 3 h of a UTC midnight (`21:00`–`03:00`) → the nearest UTC midnight; (3) any other time → the London day of `v` | `2026-07-05T23:00Z` (London midnight) → `2026-07-06T00:00Z`; `2026-07-06T00:00Z` (UTC midnight) unchanged; `2026-07-05T21:00Z` (+3 browser midnight) → `2026-07-06T00:00Z`; `2026-07-06T22:59Z` (end of London day) → `2026-07-06T00:00Z` | `2026-01-06T00:00Z` unchanged; `2026-01-05T23:00Z` (+1 browser midnight) → `2026-01-06T00:00Z` |
| **T — technical** | collections and paths in plan section 4.4 | unchanged | | |
| **S — sentinel** | year < 1800 or > 9000 (`DateTime.MinValue`, `MaxValue`) | unchanged | `0001-01-01T00:00Z` stays | |
| **N — null / missing / non-date** | null, missing, numbers, `TimeSpan`, ObjectId (incl. its timestamp) | unchanged | | |
| **X — string that looks like a date** | found by M0 | **decision per path** (convert the text the same way and keep it a string, or leave it) | | |

**Why both C and I are needed.** For a calendar date stored as London midnight, rules I and C give the same day. They differ for calendar dates stored at another time of day: a UTC-midnight absence on 6 July (`2026-07-06T00:00Z`) is `01:00` under rule I but `00:00` under rule C. The dev profile (section 3.4) found such values in most calendar paths, so the calendar list must be right: a calendar path treated as an instant gets a time, and an instant path treated as a calendar date loses its time.

**Why rule C has three cases.** The dev profile found shapes that a single rule mis-reads: end-of-London-day values (`22:59Z`/`23:59Z`, about 10,000 assignment rows) are the next day by nearest midnight, and browser midnights from devices east of UTC (`21:00Z`, `22:00Z`, winter `23:00Z`) are the previous day by London day. Case 2 is limited to whole hours, so a real time such as `21:47Z` keeps its London day under case 3. Rule C does **not** cover device midnights further east than +3 (Kolkata `18:30Z`, Auckland `12:00Z`, +13 `11:00Z`): case 3 would put them a day early. None were found on dev; the production run (plan P0.5) must show none.

**Invariants checked in M4** (London):
- Rule I: `v' − v` is exactly the London offset at `v` — 0 in GMT, +60 min in BST.
- Rule C: `v'` is at `00:00:00.000Z`; the count of values per case (1, 2, 3) per path matches the M0 profile; values at `00:00Z` are unchanged; case 3 values (real times in a calendar path) are listed per path.
- Rules T, S, N: `v' = v`.
- The repeated autumn hour: values with `v` in `[00:00Z, 02:00Z)` on the last Sunday of October map into `01:00–02:00` and are counted (plan T9).

**Implementation of rule I and C** — done with the IANA rules for `Europe/London` (Node's `Intl`, full ICU), never with a fixed offset. A server-side alternative for very large flat collections uses `$dateToParts` with `timezone: "Europe/London"` and `$dateFromParts` without a timezone (section 4.4).

---

## 3. Scope

### 3.1 Converted: 118 collections

- **106 collections by declared fields** — full list with every path in Appendix A.
- **12 event stores** — every date inside `Data` is converted; `_id` (`EventId`), `AggregateId`, `PerformerId` (ObjectIds) are never touched. Calendar rules for `Data` are keyed by `EventType` + path (Appendix B marks them), because the same path (for example `Date`) means a calendar date in an allocation event and an instant in a readiness report.
- **Paths that the models do not declare** (old fields still stored, `BsonDocument` payloads, `IgnoreExtraElements` leftovers) are converted too: the script walks every BSON Date in every document (section 4.1), not just the declared paths. M0 lists them so each one is classified before the run.

### 3.2 Not converted

| Group | Collections | Why |
|---|---|---|
| Inbox (`HandledDate`) | `ActiveWork`, `Attendance`, `Gateway` (+ customer), `Handovers` (+ customer), `Inspections`, `Jobs` (+ customer), `Materials`, `Permissions` (+ customer), `Resources` (+ customer) `:IncomingIntegrationEvents` — 14 | idempotency bookkeeping |
| Outbox (`PublishDate`, `Data`) | `ActiveWork`, `Attendance`, `Forecasting`, `Handovers` (+ customer), `Inspections`, `Jobs`, `Resources` (+ customer) `:OutboundIntegrationEvents` — 9; `Customers:IntegrationEvents` | published history, never replayed (M2.4) |
| Retry queue | `Notifications:ExternalNotifications` | compared with the system clock |
| Technical fields inside converted collections | `ActiveWork:NotificationsLogs.CreatedAtUtc/SentAtUtc/FailedAtUtc`, `Notifications:UserNotifications.ExpiresAt` | TTL and send bookkeeping |
| Assistant store | `gaffer_conversations` | plan T7 / P0.8 |
| Hangfire storage | `*:Hangfire*` | Hangfire's own schedule state |
| Redis | all keys | **flushed** at cut-over (C6), not converted |
| Blob storage | file names and metadata | no business dates found in names; P0.4 confirms |

### 3.3 Values the code scan cannot see (closed by M0)

- Row counts per collection and per path.
- Dates stored as strings (Report.API's `LabourSummaryService.GetDateTimeSafe` accepts both, so string dates may exist).
- Paths no longer in the models.
- `SafetySuite:NearMissCounters` and other collections read as `BsonDocument`.
- Jobs:QuotationEvents (`QuotationEvent`) — declares no date; check whether it holds payloads.
- The real shape of every calendar path in production (London midnight, UTC midnight, other). Done on dev (section 3.4); production still needed.
- Values in the repeated autumn hour per path.
- Atlas Search indexes, Atlas triggers or change streams on any in-scope collection (renaming affects them).

### 3.4 Dev profile of the calendar paths (2026-10-06)

A read-only profile script (dev run; retired 2026-10-07) counted every value of the 116 calendar paths of the models by UTC time of day and month, on the dev cluster (`../utc-time-zone/UTC_IMPLEMENTATION_PLAN.md` Appendix B). Result:

| Group | Paths | What dev stores | Effect on this migration |
|---|---|---|---|
| Already date-only | 32 | `00:00Z` all year | rule C leaves them unchanged |
| London midnight | 25 | `00:00Z` winter, `23:00Z` summer | rule C case 2 |
| Assignment days, several shapes | 9 | London midnight, end of day, browser midnight, real times | rule C cases 1, 2 and 3 |
| Team subscription dates | 21 | mostly `21:00Z`/`22:00Z` browser midnights | rule C case 2 |
| **Really timestamps** | **20** | real times of day | **moved to rule I** (marked ³ in Appendix A) |
| Empty | 9 | no values on dev | stay calendar; production decides |

The 20 paths moved to rule I: `ActiveWork:ActiveWorkRecords` `OperationalGroups[].PlantHireStartDate`, `PlantHireEndDate`; `ActiveWork:StaffAssignments.CompleteDate`; `Attendance:StaffAssignments.CompletedDate`; `Materials:OrderRequests` `RequestedFor`, `DeliveryDate`, `PickDate`; `Materials:CollectionRequests` `RequestedFor`, `CollectionDate`; `Jobs:Jobs` `sections[].sectionSecuredMetadata.secureDate`, `securedSections[].secureDate`, `openingBalance.secureDate`, `contractPerformanceSettings.firstWageDate`; `Jobs:Sections` `sectionSecuredMetadata.secureDate`, `secureDate`, `items[].unpricedItem.secureDate`, `overHireData.handoverFirstErectDate`, `overHireData.handoverLastStrikeDate`; `Jobs:Quotations.obtainedSections[].secureDate`; `Jobs:QuotationSections.items[].unpricedItem.secureDate`. The 31 event paths that carry the same fields (Appendix B, `c`³) move with them.

Open points for the production run (plan P0.5): that `23:59`/`22:59` rows mean the same London day; the 17,020 `Attendance:StaffAssignments.CompletedDate` rows at exactly `00:00Z`; the 90 Prelims rows stamped `16:13`; the odd rows of the date-only group (`HrAbsences`, `HrEmployees.EndDate`, `ResourceAllocations`, `StaffMemberAbsence` `01:00`); no device midnight further east than +3 (outside rule C); rows that become the same key after rule C (M4.10).

---

## 4. Method

### 4.1 One generic walker, driven by a rules file

For each document of an in-scope collection, the script walks every field (objects, arrays, arrays of arrays) and converts **every BSON Date** by rule I, unless the path is in the calendar list (rule C), the technical list (rule T) or the value is a sentinel (rule S). `_id` is never changed.

Why a walker and not field-by-field updates: 501 declared paths plus 318 event paths, 127 of them inside nested arrays, and an unknown number of undeclared ones. A walker cannot miss a field; the rules file only has to name the exceptions (calendar and technical paths), and M0 proves the file is complete.

The rules file `oskfel-migrations/team-local-time/rules.js` is generated from Appendix A and B, then edited with the M0 results:

```js
module.exports = {
  'Resources:StaffMemberAbsence': { calendar: ['StartDate', 'EndDate'] },
  'ActiveWork:NotificationsLogs': { calendar: ['AssignmentDate'], technical: ['CreatedAtUtc', 'SentAtUtc', 'FailedAtUtc'] },
  'ActiveWork:Events': {
    byEventType: {
      ActiveWorkCreatedEvent5: { calendar: ['Data.StartDate', 'Data.StaffDayAssignments[].Date', 'Data.OperationalGroups[].PlantHireStartDate', 'Data.OperationalGroups[].PlantHireEndDate'] },
    },
  },
};
```

Paths are matched case-insensitively (Project and Customer collections are camelCase, except `Jobs:Takeoffs` and `Jobs:CatalogueMappings`, which are PascalCase; other services are PascalCase), with `[]` for array elements.

### 4.2 Shadow collections and swap (plan T5)

```
X  ──read──►  walker  ──insert──►  X__tl          (M2: build, resumable)
                                     │ copy indexes (M3), verify (M4)
                                     ▼
rename  X → X__utc_<yyyymmdd>   and   X__tl → X    (M5: swap, seconds per collection)
```

- **The original is never modified.** A failed or interrupted build is fixed by dropping `X__tl` and building it again.
- **Resumable and safe to re-run:** documents are read in `_id` order; the ledger collection `_Migrations:TeamLocalTime` stores `{ _id: collection, status, lastId, copied, converted, skipped, startedAt, finishedAt }` after every batch. `insertMany` uses `ordered: false`; a duplicate-key error on re-run only means the document is already copied. A value can never be converted twice because the source is never written.
- **Indexes** are read from `X.getIndexes()` and created on `X__tl` after the copy (faster bulk build). A unique index that fails on `X__tl` is a verification failure (M4.7), not a production error.
- **Rollback before reopening** is two renames per collection (R1).
- **Cost:** disk for one extra copy of the 118 collections and their indexes, plus the oplog volume of inserting them. M0 measures `storageSize` + `totalIndexSize`; the cluster tier must have that headroom (or be scaled up for the window).

### 4.3 Collections with mixed `_id` types

`_id` ordering with `$gt` only walks one BSON type. M0 reports collections whose `_id` has more than one type; for those the build reads `{ _id: { $type: t } }` for each type in turn.

### 4.4 Alternatives if the window is too long or the disk check fails

| Option | When | How |
|---|---|---|
| Server-side pipeline into the shadow | a large flat collection (e.g. inbox-style volumes in a business collection) | `aggregate([{ $set: { f: { $dateFromParts: { …$dateToParts: { date: '$f', timezone: 'Europe/London' } } } } }, { $out: 'X__tl' }])` generated per declared path, including `$map` for arrays; the walker still checks for undeclared dates afterwards |
| In-place conversion | not enough disk for shadows | transaction per batch: `updateOne` with `$set` of the converted top-level fields **and** the ledger `lastId` in the same transaction, so a batch is never applied twice; rollback then needs R2 or R3 |
| Pre-copy before the window | very large, append-only collections (event stores) | build the shadow for `_id < cut-over marker` days before, then convert only newer documents in the window; the ledger keeps the marker |

### 4.5 Ordering inside the window

Smallest collections first, to surface rule problems early; then event stores (can run in parallel per collection); then Project collections (largest and most nested); Attendance last among business collections so the wage team can start its checks as soon as it finishes. Exact order and parallelism come from the P4 timings.

---

## 5. Steps and cut-over runbook

### 5.1 Steps before the window

| Step | What | Where | Output |
|---|---|---|---|
| **M0 — profile** | full scan of all 172 collections: document count, size, every BSON Date path with count, min, max, UTC time-of-day histogram (`00:00`, `23:00`, other), weekday histogram for calendar paths, sentinel count, repeated-autumn-hour count, string values matching ISO date patterns, paths not in the rules file, `_id` types, indexes (unique, TTL), Atlas Search indexes, triggers | production snapshot restored to an isolated cluster (never production) | `profile-<date>.json` + a summary appended to this report |
| **M1 — dry run** | the walker with `dryRun: true`: per path, number of values per rule, invariant breaches, ambiguous-hour values | same copy | `dry-run-<date>.json`; zero unexplained breaches |
| **M2 — build** | shadows for the 118 collections (section 4.2) | rehearsal copy (P4), then production in the window | ledger rows `built` |
| **M2.4 — outbox history** | not converted. Code guard (plan B.l): the outbox publisher only publishes rows created after the cut-over marker, so a pre-cut-over row with UTC dates can never be sent again | code | — |
| **M3 — indexes** | copy every index to each shadow | same | identical index lists |
| **M4 — verify** | section 6 | same | verification report |
| **M5 — swap** | renames (section 4.2) | same | ledger rows `swapped` |
| **M6 — post-checks** | smoke tests and app checks (C10) | production | go / no-go |

### 5.2 Cut-over runbook (Phase 5 of the plan)

Times are filled in from rehearsal P4.7; owners are set at T13.

| # | Step | Check before moving on |
|---|---|---|
| **T-14 d** | Rehearsal 2 signed off; window length agreed; payroll shadow compare (plan P4.3) signed. | written sign-offs |
| **T-7 d** | Announce the window. HandoverApp and InspectionsApp builds with `ApiDateConverter` and the queue change (plan H.2, I.2) released; minimum build ready to switch on. | adoption of the new builds |
| **T-2 d** | All backend and frontend builds that contain the mode-aware code are in production in `Utc` mode (plan Phases 2–3). TeamLocal images (no `TZ`) built and tagged. | no behaviour change in production (counters, error rates) |
| **T-1 d** | Disk headroom confirmed (or cluster scaled); Atlas backup policy confirmed; deployment freeze. | |
| **C1** | Maintenance mode: Gateway returns 503 on every business route; the apps show the maintenance page. | no business requests in Gateway logs for 5 minutes |
| **C2** | Mobile queues: push "sync now" before C1; after C1 count queued items reported by the apps (or accept that the minimum build in C11 blocks old queues). | counts recorded |
| **C3** | Stop schedulers: Hangfire servers (Attendance, Resources, ActiveWork Background, Materials API) and the external caller of ActiveWork `TriggerTomorrowAssignmentsReminder` (plan P0.11). | no job running |
| **C4** | Drain messaging: every outbox has 0 rows with `Published = false`; every Service Bus subscription has 0 active messages; dead letters reviewed and recorded. | zero counts |
| **C5** | Stop all API and Background hosts (scale to 0). | no connections from services in Atlas |
| **C6** | Flush Redis (dates in cached entries). | key count 0 for the service prefixes |
| **C7** | Atlas on-demand snapshot; record its id. | snapshot completed |
| **C8** | Run M2 → M3 → M4 → M5 against production. | M4 all green |
| **C9** | Deploy config `Time:StorageMode=TeamLocal` to every service and Gateway; deploy the TeamLocal images for the six containers that had `TZ`. | every service health reports `timeStorageMode: TeamLocal` |
| **C10** | Start hosts; smoke tests (section 6.2) with test users; start Hangfire servers; re-enable the external reminder caller. | all smoke tests green |
| **C11** | Raise the Frontend minimum version (`version-block-interceptor`) and the mobile minimum build. | old builds are blocked |
| **C12** | **Go / no-go.** Go: reopen and monitor. No-go: R1. | decision recorded |
| **T+1 d … T+30 d** | Monitor errors, wage recalculations, reports; keep `__utc_<date>` backups; daily check that no new document contains UTC-shaped calendar dates (time ≠ 00:00 on calendar paths). | daily report |

---

## 6. Verification

### 6.1 Data checks (M4) — all automatic, per collection

| # | Check | Pass |
|---|---|---|
| **M4.1** | Document count `X__tl` = `X` | equal |
| **M4.2** | Every non-date field equal (hash of the document with dates removed, on all documents; full compare on samples) | equal |
| **M4.3** | Rule invariants (section 2) for every converted value | 0 breaches, or each one listed and accepted |
| **M4.4** | Calendar paths: every value at `00:00:00.000Z` | 100 % |
| **M4.5** | Recompute on a random sample of 1,000 documents per collection (`$sample`): walker(original) deep-equals shadow | equal |
| **M4.6** | Event stores: for 200 aggregates per store, rebuild the projection from the converted events with the TeamLocal code and compare with the converted projection | equal, except fields set from `EventId.CreationTime` before plan B.f — none after B.f |
| **M4.7** | Index builds on every shadow succeed (unique indexes included) | all built |
| **M4.8** | Technical paths and collections unchanged (byte-equal on samples) | equal |
| **M4.9** | Ambiguous-hour values counted per path and listed | list attached |
| **M4.10** | Rows that become the same key after rule C (for example two `WageBonus` rows for one week at `Sun 23:00Z` and `Mon 00:00Z`), listed per collection; each has a merge rule signed off by the data owner before the night | list attached, 0 open |

### 6.2 Behaviour checks (C10 and P4)

- **Wages:** recalculate 20 staff weeks spread over summer and winter (including the weeks of 2026-03-29 and 2026-10-25) in TeamLocal mode; results equal the stored pre-migration results or match an Appendix A.1 reason in the plan.
- **Lookups that used exact dates:** `WageBonusRepo`, `WageWeekSnapshotsRepo`, `WageEventsRepo` (`WeekCommencing`), `StaffAssignmentRepo` upsert — return the same rows as before for 10 weeks.
- **Day lists:** ActiveWork list and calendar, resource planners (daily, weekly), staff wallchart, vehicle calendar, absences — the same items on the same days as before for 5 sample days in summer and winter.
- **Reports:** Report.API labour daily, CVR, plant, prelims for one month — same totals per day, except the 00:00–01:00 BST hour (plan P4.4).
- **Documents:** one Handover PDF, one Inspections PDF, one notification e-mail — same printed times as before.
- **Apps:** Frontend, HandoverApp, InspectionsApp show the same wall-clock times as before for a set of 30 recorded screens; a new clock-in, absence, MOR delivery, ITW and handover create the expected wall-clock values in the database.

---

## 7. Rollback

| # | When | How | Data loss |
|---|---|---|---|
| **R1** | Before reopening (C12 no-go) | Per collection: rename `X` → `X__tl_failed`, `X__utc_<date>` → `X`; set `Time:StorageMode=Utc`; redeploy the previous images (with `TZ`); start; lower the minimum versions. Rehearsed in P4.6. | none (no writes happened) |
| **R2** | After reopening, if a forward fix is not possible | Stop writes (C1–C5); build reverse shadows from the current data with the inverse rules (wall clock → UTC; in the repeated autumn hour take the first, BST, occurrence; calendar dates → London midnight as UTC, the old shape); swap; `Utc` mode. Data written after reopening is kept. Script `07-reverse.js`, tested on fixtures and in P4 (optional drill). | none, but ambiguous-hour values may move by one hour |
| **R3** | Last resort | Restore the C7 snapshot. | every write after C7 |
| **R4** | After 30 stable days | Drop the `__utc_<date>` backups (plan P7.1). | — |

---

## 8. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| A date is converted twice | values one hour ahead in summer | the source is never written (shadows); ledger; M4.3 catches it |
| A calendar path is treated as an instant | UTC-midnight days become `01:00`, exact lookups miss them | M0 histogram per path; rules file review; M4.4 |
| An instant path is treated as a calendar date | the time of day is lost | calendar list reviewed against M0 (instants show many times of day); M4.4 would show nothing wrong, so the review is the guard — every calendar path needs a histogram with only `00:00` / `23:00` values |
| An undeclared date path | stays UTC | the walker converts every date; M0 lists every path for classification |
| Writes during the migration | mixed values | C1, C3–C5; Atlas connection count check |
| Messages in flight with UTC dates | stored unconverted after cut-over | C4 drain to zero; outbox guard (M2.4) |
| Mobile offline items queued before cut-over | UTC values written after cut-over | plan H.2/I.2 encode at send time; force sync; minimum build (C11) |
| Window too long | extended downtime | P4 timings + 50 %; pre-copy of event stores (4.4) |
| Disk or oplog pressure | Atlas throttling, replication lag | M0 sizes; scale the tier for the window; batch size tuned in P4 |
| Repeated autumn hour | order and duration anomalies in that hour | counted (M4.9); accepted by T9 |
| Sentinel shifted | `0001-01-01` becomes `-00:01:15` (London LMT) | rule S |
| Renaming breaks Atlas Search, triggers or change streams | search or triggers stop | M0 lists them; recreate after M5 |
| Report.API or a script reads with the old assumption | values off by one hour | plan Phase 2 (Report.API), P0.6 consumer list |

---

## 9. Open items

- Row counts, sizes and window length → M0, P4.
- String-typed dates (rule X) → M0, decision per path.
- 29 "verify kind" paths (¹ in Appendix A) → M0 histogram.
- Disk headroom and Atlas tier for the window → M0, T-1 d.
- Atlas Search indexes, triggers, change streams → M0.
- Owner and exact time of each runbook step → T13.

---

## Appendix A — Field inventory per collection (models, 2026-10-06)

Columns: **Instant** → rule I · **Calendar date** → rule C · **Not migrated** → rule T (technical) or not a date. ¹ = kind to verify in M0 · ² = known to hold UTC midnight today · ³ = holds a real time (dev profile, section 3.4): converted by rule I, not C.
Event stores declare no date fields on the envelope; their payloads are in Appendix B. Collections with no dates and the technical-only collections are listed in section 3.2 and below.

**No dates declared (29, profiled in M0):** `ActiveWork:ITWSequence`, `Attendance:Projects`, `Customers:IntegrationEvents`, `Gateway:CurrentConfig`, `Gateway:Customer:Permissions`, `Gateway:IngressUpdates`, `Gateway:Permissions`, `Gateway:Teams`, `Handovers:HandoverSequences`, `Inspections:ITWSequence`, `Jobs:BoardSetupReferences`, `Jobs:FloorReferences`, `Jobs:HeightReferences`, `Jobs:ItemCatalogueOptions`, `Jobs:ItemUnits`, `Jobs:LengthReferences`, `Jobs:LiftReferences`, `Jobs:MaterialReferences`, `Jobs:QuotationEvents`, `Jobs:TransportProcessing`, `Jobs:TypeReferences`, `Jobs:VariationSequences`, `Materials:Items`, `Materials:OrderRequestSequence`, `Permissions:Customer:Permissions`, `Permissions:Permissions`, `Resources:LeaveTypeMappings`, `Resources:LeaveTypes`, `SafetySuite:NearMissCounters`.

#### ActiveWorkService

| Collection (model) | Instant fields | Calendar-date fields | Not migrated |
|---|---|---|---|
| `ActiveWork:ActiveWorkRecords` (ActiveWorkRecord) | `Created`, `Updated`, `AssignedStaff[].Acceptance.Updated`, `StaffDayAssignments[].StaffMembers[].Acceptance.Updated`, `StaffDayAssignments[].RejectedStaffMembers[].Acceptance.Updated`, `StaffDayAssignments[].WorkStart`, `StaffDayAssignments[].WorkEnd`, `PrincipleStaff[].Acceptance.Updated`, `Attachments[].CapturedDate`, `Commentary[].Date`, `Commentary[].Attachments[].CapturedDate`, `ReadinessStateReports[].Date`, `ReadinessStateReports[].Evidence[].CapturedDate` | `OperationalGroups[].PlantHireStartDate`³, `OperationalGroups[].PlantHireEndDate`³, `StaffDayAssignments[].Date`, `StartDate`, `ExpectedHandoverDate`¹ | — |
| `ActiveWork:GranularAudit` (ModelUpdate) | `UpdateDate` | — | — |
| `ActiveWork:IncomingIntegrationEvents` (IntegrationEventLogItem) | — | — | `HandledDate` |
| `ActiveWork:NotificationsLogs` (NotificationsLog) | — | `AssignmentDate` | `CreatedAtUtc`, `SentAtUtc`, `FailedAtUtc` |
| `ActiveWork:OutboundIntegrationEvents` (OutboundIntegrationEvent) | — | — | `PublishDate` |
| `ActiveWork:Projects` (Project) | `Updated` | — | — |
| `ActiveWork:StaffAssignments` (StaffAssignment) | `acceptance.Updated` | `Date`, `CompleteDate`³ | — |
| `ActiveWork:Teams` (Team) | `TeamLogo.CapturedDate`, `Updated` | `SubscriptionInformation.StartDate`¹, `SubscriptionInformation.BetaPeriodEndDate`, `SubscriptionInformation.StoppedDate` | — |

#### AttendanceService

| Collection (model) | Instant fields | Calendar-date fields | Not migrated |
|---|---|---|---|
| `Attendance:IncomingIntegrationEvents` (IntegrationEventLogItem) | — | — | `HandledDate` |
| `Attendance:OutboundIntegrationEvents` (OutboundIntegrationEvent) | — | — | `PublishDate` |
| `Attendance:ResourceAllocations` (ResourceAllocation) | `Updated` | `Date` | — |
| `Attendance:StaffAssignments` (ActiveWorkStaffAssignment) | — | `Date`, `CompletedDate`³ | — |
| `Attendance:StaffMemberAbsence` (StaffMemberAbsence) | — | `StartDate`², `EndDate`² | — |
| `Attendance:Teams` (Team) | `TeamLogo.CapturedDate`, `Updated` | `SubscriptionInformation.StartDate`¹, `SubscriptionInformation.BetaPeriodEndDate`, `SubscriptionInformation.StoppedDate` | — |
| `Attendance:UserAttendanceRecords` (UserAttendanceRecord) | `AttendanceRecords[].Date`, `AttendanceRecords[].SupervisorInOverride.OverrideDate`, `AttendanceRecords[].SupervisorOutOverride.OverrideDate`, `AttendanceRecords[].ClockInDate`, `AttendanceRecords[].ClockOutDate`, `AttendanceRecords[].ClockInActualDate`, `AttendanceRecords[].ClockOutActualDate`, `Created`, `Updated` | — | — |
| `Attendance:Users` (User) | `Updated` | — | — |
| `Attendance:WageBonus` (WageBonus) | `AwardedBy.OperationDate`, `Created`, `Updated` | `WeekCommencing` | — |
| `Attendance:WageRecords` (WageRecord) | `Attendance.ClockInDate`, `Attendance.ClockOutDate`, `Attendance.ClockInActualDate`, `Attendance.ClockOutActualDate`, `OverrideDetail.Date`¹, `Approver.OperationDate`, `SMApprover.OperationDate`, `Created`, `Updated` | — | — |
| `Attendance:WageWeekSnapshots` (WageWeekSnapshot) | `Week[].DayRecords[].ClockIn`, `Week[].DayRecords[].clockOut`, `Week[].DayRecords[].Override.Date`¹, `Week[].DayRecords[].ClockInActualDate`, `Week[].DayRecords[].ClockOutActualDate`, `LockedBy.OperationDate`, `Created`, `Updated` | `WeekCommencing`, `Week[].Bonus.WeekCommencing` | — |

#### CustomerService

| Collection (model) | Instant fields | Calendar-date fields | Not migrated |
|---|---|---|---|
| `Customers:BatonCustomers` (BatonCustomer) | `customerLogo.capturedDate`, `created`, `updated` | — | — |
| `Customers:Contacts` (Contact) | `created`, `updated` | — | — |
| `Customers:Customers` (Customer) | `created`, `updated` | — | — |

#### ForecastingService

| Collection (model) | Instant fields | Calendar-date fields | Not migrated |
|---|---|---|---|
| `Forecasting:OutboundIntegrationEvents` (OutboundIntegrationEvent) | — | — | `PublishDate` |
| `Forecasting:RoleAllocations` (RoleAllocation) | `Created`, `Updated` | `Date` | — |
| `Forecasting:StaffAllocations` (StaffAllocation) | `Created`, `Updated` | `Date` | — |

#### Gateway

| Collection (model) | Instant fields | Calendar-date fields | Not migrated |
|---|---|---|---|
| `Gateway:BatonCustomers` (BatonCustomer) | `Created`, `Updated` | — | — |
| `Gateway:Customer:IncomingIntegrationEvents` (CustomerIntegrationEventLogItem) | — | — | `HandledDate` |
| `Gateway:IncomingIntegrationEvents` (IntegrationEventLogItem) | — | — | `HandledDate` |

#### HandoverService

| Collection (model) | Instant fields | Calendar-date fields | Not migrated |
|---|---|---|---|
| `Handovers:Customer:AuditLog` (CustomerAuditLogEntry) | `Timestamp` | — | — |
| `Handovers:Customer:Handovers` (CustomerHandover) | `UploadedOn`, `SubmittedAt`, `ReviewDate`, `DecisionAt`, `LastUpdated` | — | — |
| `Handovers:Customer:IncomingIntegrationEvents` (CustomerIntegrationEventLogItem) | — | — | `HandledDate` |
| `Handovers:Customer:OutboundIntegrationEvents` (CustomerOutboundIntegrationEvent) | — | — | `PublishDate` |
| `Handovers:HandoverClaimTransactions` (HandoverClaimTransaction) | `RaisedDate`, `LastUpdatedDate` | `ClaimDate` | — |
| `Handovers:HandoverNotifications` (HandoverNotification) | `RaisedEmailSentDate`, `ApprovedEmailSentDate`, `RejectedEmailSentDate`, `ReminderEmailRequiredDate`, `ReminderEmailSentDate`, `Reminder2EmailRequiredDate`, `Reminder2EmailSentDate`, `AutoApproveRequiredDate`, `AutoApproveAppliedDate`, `Created`, `Updated` | — | — |
| `Handovers:Handovers` (Handover) | `Attachments[].CapturedDate`, `Created`, `Updated`, `SubmittedDate`, `ReviewDate`, `StaffDayAssignments[].WorkStart`, `StaffDayAssignments[].WorkEnd` | `StaffDayAssignments[].Date` | — |
| `Handovers:IncomingIntegrationEvents` (IntegrationEventLogItem) | — | — | `HandledDate` |
| `Handovers:Jobs` (Job) | `Updated` | — | — |
| `Handovers:OutboundIntegrationEvents` (OutboundIntegrationEvent) | — | — | `PublishDate` |
| `Handovers:PublishedProjects` (PublishedProject) | `BackfillCompletedAt`, `Created`, `Updated` | — | — |
| `Handovers:Teams` (Team) | `TeamLogo.CapturedDate`, `Updated` | `SubscriptionInformation.StartDate`¹, `SubscriptionInformation.BetaPeriodEndDate`, `SubscriptionInformation.StoppedDate` | — |

#### InspectionsService

| Collection (model) | Instant fields | Calendar-date fields | Not migrated |
|---|---|---|---|
| `Inspections:ActiveWorkInspectionClaims` (ActiveWorkInspectionClaim) | `ClaimedAt` | — | — |
| `Inspections:HsInspections` (HsInspection) | `SubmissionMeta.RaisedDate`, `Sections[].Answers[].Attachments[].CapturedDate`, `Created`, `Updated` | `Sections[].Answers[].DateAnswer` | — |
| `Inspections:IncomingIntegrationEvents` (IntegrationEventLogItem) | — | — | `HandledDate` |
| `Inspections:InspectionNotifications` (InspectionNotification) | `RaisedSent`, `HsRaisedSent` | — | — |
| `Inspections:Inspections` (Inspection) | `Sections[].Items[].Attachments[].CapturedDate`, `Sections[].Items[].ResolveDate`¹, `SubmissionMeta.RaisedDate` | — | — |
| `Inspections:OutboundIntegrationEvents` (OutboundIntegrationEvent) | — | — | `PublishDate` |
| `Inspections:Teams` (Team) | `TeamLogo.CapturedDate`, `Updated` | `SubscriptionInformation.StartDate`¹, `SubscriptionInformation.BetaPeriodEndDate`, `SubscriptionInformation.StoppedDate` | — |

#### MaterialsService

| Collection (model) | Instant fields | Calendar-date fields | Not migrated |
|---|---|---|---|
| `Materials:CollectionRequests` (CollectionRequest) | `RequestedOn`, `CollectionImages[].CapturedDate`, `DriverInstructed`, `Created`, `Updated`, `VehicleWeight.WeightImage.CapturedDate`, `DriverInTransit`, `DriverAtSite`, `PreCollectionCheck.Date`, `PreCollectionCheck.Evidence[].CapturedDate`, `CollectionLoaded.Date`, `CollectionLoaded.Evidence[].CapturedDate`, `CollectionInTransit.ProofOfCollection[].CapturedDate`, `CollectionInTransit.Date`, `CollectionAtYard`, `CollectionAbandoned.Date`, `CollectionAbandoned.Evidence[].CapturedDate`, `CollectionAttempts[].Date`¹, `CollectionAttempts[].Attachments[].CapturedDate`, `CollectionAttempts[].DriverInTransit`, `CollectionAttempts[].DriverAtSite` | `RequestedFor`³¹, `CollectionDate`³¹ | — |
| `Materials:GranularAudit` (ModelUpdate) | `UpdateDate` | — | — |
| `Materials:IncomingIntegrationEvents` (IntegrationEventLogItem) | — | — | `HandledDate` |
| `Materials:OrderRequests` (OrderRequest) | `RequestedOn`, `Created`, `Updated`, `OrderLoaded.Date`, `OrderLoaded.Evidence[].CapturedDate`, `OrderInTransit.Date`, `OrderInTransit.Evidence[].CapturedDate`, `OrderAtSite`, `PreDeliveryCheck.Date`, `PreDeliveryCheck.Evidence[].CapturedDate`, `OrderDelivered.Date`, `OrderDelivered.Evidence[].CapturedDate`, `DriverDeparted.Date`, `OrderReadyToCollect.Date`, `OrderReadyToCollect.Evidence[].CapturedDate`, `OrderCollected.Date`, `OrderCollected.Evidence[].CapturedDate`, `DriverInstructed`, `VehicleWeight.WeightImage.CapturedDate`, `PickerInstructed`, `DeliveryAbandoned.Date`, `DeliveryAbandoned.Evidence[].CapturedDate`, `DeliveryAttempts[].Date`¹, `DeliveryAttempts[].Attachments[].CapturedDate`, `DeliveryAttempts[].VehicleWeight.WeightImage.CapturedDate`, `DeliveryAttempts[].OrderInTransit.Date`, `DeliveryAttempts[].OrderInTransit.Evidence[].CapturedDate`, `DeliveryAttempts[].OrderAtSite` | `RequestedFor`³¹, `DeliveryDate`³¹, `PickDate`³¹ | — |
| `Materials:OrderRequests_Audit` (AuditItem) | `ChangeTime` | — | — |
| `Materials:StaffMembers` (StaffMember) | — | `EndDate` | — |
| `Materials:StockAudit` (BundleStockMovement) | `Date`¹ | — | — |
| `Materials:StockReturns` (StockReturn) | `ProcessDate`, `Evidence[].CapturedDate`, `Created`, `Updated` | — | — |
| `Materials:Teams` (Team) | `TeamLogo.CapturedDate`, `Updated` | `SubscriptionInformation.StartDate`¹, `SubscriptionInformation.BetaPeriodEndDate`, `SubscriptionInformation.StoppedDate` | — |
| `Materials:VehicleSettings` (VehicleSettings) | `Updated` | — | — |
| `Materials:VehicleUnavailabilities` (VehicleUnavailability) | `AddedDate` | `StartDate`², `EndDate`² | — |
| `Materials:Vehicles` (Vehicle) | `Created`, `Updated`, `VehiclePhoto.CapturedDate` | `RegDate`, `PurchaseDate`, `SoldDate`, `LastServiceDate`, `NextServiceDue`, `MotExpiryDate`, `InsuranceExpiryDate`, `RoadTaxExpiryDate` | — |

#### NotificationService

| Collection (model) | Instant fields | Calendar-date fields | Not migrated |
|---|---|---|---|
| `Notifications:ExternalNotifications` (ExternalNotification) | — | — | `CreatedAt`, `LastAttemptAt`, `SentAt`, `NextAttemptAt`, `LockedUntil` |
| `Notifications:UserNotifications` (UserNotification) | `CreatedAt` | — | `ExpiresAt` |

#### PermissionsService

| Collection (model) | Instant fields | Calendar-date fields | Not migrated |
|---|---|---|---|
| `Permissions:AuthorisationGroups` (AuthorisationGroup) | `Updated` | — | — |
| `Permissions:Customer:AuthorisationGroups` (CustomerAuthorisationGroup) | `Updated` | — | — |
| `Permissions:Customer:IncomingIntegrationEvents` (CustomerIntegrationEventLogItem) | — | — | `HandledDate` |
| `Permissions:Customer:UserPermissions` (CustomerUserPermission) | `Updated` | — | — |
| `Permissions:IncomingIntegrationEvents` (IntegrationEventLogItem) | — | — | `HandledDate` |
| `Permissions:StaffMembers` (UserPermission) | `Updated` | — | — |
| `Permissions:UserPermissions` (UserPermission2) | `Updated` | — | — |

#### ProjectService

| Collection (model) | Instant fields | Calendar-date fields | Not migrated |
|---|---|---|---|
| `Jobs:CatalogueMappings` (CatalogueMapping) | `Types[].DecidedDate`, `CreatedDate`, `LastUpdatedDate` | — | — |
| `Jobs:Customer:AuditLog` (CustomerAuditLogEntry) | `timestamp` | — | — |
| `Jobs:Customer:IncomingIntegrationEvents` (CustomerIntegrationEventLogItem) | — | — | `handledDate` |
| `Jobs:Customer:Jobs` (CustomerJob) | `lastUpdated` | `startDate`¹, `endDate`¹ | — |
| `Jobs:Customer:ParentJobs` (CustomerParentJob) | `created`, `updated` | — | — |
| `Jobs:Customer:QuotationSentAudits` (CustomerQuotationSentAudit) | `sentAt`, `decisionAt` | — | — |
| `Jobs:Customer:Quotations` (CustomerQuotation) | `latestSentAt`, `lastUpdated` | — | — |
| `Jobs:Customers` (Customer) | `created`, `updated` | — | — |
| `Jobs:ExternalMoneyTransactions` (ExternalMoneyTransaction) | `raisedDate`, `lastUpdatedDate` | `transactionDate` | — |
| `Jobs:ExternalValuationTransactions` (ExternalValuationTransaction) | `raisedDate`, `lastUpdatedDate` | `transactionDate` | — |
| `Jobs:Files` (ProjectFile) | `uploadedOn`, `notes[].createdOn`, `versions[].uploadedOn` | — | — |
| `Jobs:Handovers` (Handover) | `approvedDate` | — | — |
| `Jobs:IncomingIntegrationEvents` (IntegrationEventLogItem) | — | — | `handledDate` |
| `Jobs:ItemBoardSetups` (ItemBoardSetup) | `createdDate` | — | — |
| `Jobs:ItemCatalogueCategories` (ItemCatalogueCategory) | `createdDate` | — | — |
| `Jobs:ItemExtras` (ItemExtra) | `materialModifiers[].material.importedAt`, `materialModifiers[].material.deletedDate`, `materialModifiers[].material.createdDate`, `materialModifiers[].material.lastUpdatedDate`, `materialModifiers[].material.deleted.date` | — | — |
| `Jobs:ItemFloors` (ItemFloor) | `createdDate` | — | — |
| `Jobs:ItemHeights` (ItemHeight) | `createdDate` | — | — |
| `Jobs:ItemLengths` (ItemLength) | `createdDate` | — | — |
| `Jobs:ItemLifts` (ItemLift) | `createdDate` | — | — |
| `Jobs:ItemMaterials` (ItemMaterial) | `createdDate` | — | — |
| `Jobs:ItemTagsExtractionRules` (ExtractionRule) | `createdAt`, `updatedAt` | — | — |
| `Jobs:ItemTypes` (ItemType) | `createdDate` | — | — |
| `Jobs:Items` (PricedMaterialItem) | `pricedMaterials[].material.importedAt`, `pricedMaterials[].material.deletedDate`, `pricedMaterials[].material.createdDate`, `pricedMaterials[].material.lastUpdatedDate`, `pricedMaterials[].material.deleted.date`, `deletedDate`, `createdDate`, `lastUpdatedDate`, `deleted.date` | — | — |
| `Jobs:Jobs` (Job) | `customer.created`, `customer.updated`, `sections[].items[].pricedItem.pricedMaterials[].material.importedAt`, `sections[].items[].pricedItem.pricedMaterials[].material.deletedDate`, `sections[].items[].pricedItem.pricedMaterials[].material.createdDate`, `sections[].items[].pricedItem.pricedMaterials[].material.lastUpdatedDate`, `sections[].items[].pricedItem.pricedMaterials[].material.deleted.date`, `sections[].items[].itemExtras[].materialModifiers[].material.importedAt`, `sections[].items[].itemExtras[].materialModifiers[].material.deletedDate`, `sections[].items[].itemExtras[].materialModifiers[].material.createdDate`, `sections[].items[].itemExtras[].materialModifiers[].material.lastUpdatedDate`, `sections[].items[].itemExtras[].materialModifiers[].material.deleted.date`, `created`, `updated`, `contractPerformanceSettings.date`¹ | `sections[].sectionSecuredMetadata.secureDate`³, `sections[].secureDate`, `sections[].items[].unpricedItem.secureDate`, `sections[].overHireData.handoverFirstErectDate`, `sections[].overHireData.handoverLastStrikeDate`, `securedSections[].secureDate`³, `securedSections[].information.orderReceivedDate`, `securedSections[].information.commencementOnSiteDate`, `securedSections[].information.contractedCompletionDate`, `securedSections[].information.completionOfDesignDate`, `securedSections[].information.completionOfRAMSDate`, `startDate`¹, `endDate`¹, `openingBalance.secureDate`³, `finalAccountValuationDate`, `contractPerformanceSettings.firstWageDate`³, `contractPerformanceSettings.userInputDate` | — |
| `Jobs:Materials` (Material) | `importedAt`, `deletedDate`, `createdDate`, `lastUpdatedDate`, `deleted.date` | — | — |
| `Jobs:OutboundIntegrationEvents` (OutboundIntegrationEvent) | — | — | `publishDate` |
| `Jobs:PrelimsCostTransactions` (PrelimsCostTransaction) | `created.date`, `lastModified.date`, `deleted.date` | `date` | — |
| `Jobs:PrelimsIncomeTransactions` (PrelimsIncomeTransaction) | `created.date`, `lastModified.date`, `deleted.date` | `date` | — |
| `Jobs:PublishedJobs` (PublishedJob) | `publishedAt`, `unpublishedAt`, `lastSnapshot.updated` | `lastSnapshot.startDate`¹, `lastSnapshot.endDate`¹ | — |
| `Jobs:QuotationAdditionalPages` (QuotationAdditionalPage) | `deletedDate`, `createdDate`, `lastUpdatedDate`, `deleted.date` | — | — |
| `Jobs:QuotationBuilders` (QuotationBuilder) | `generatedDocument.generatedOn`, `createdDate`, `lastUpdatedDate`, `deleted.date` | — | — |
| `Jobs:QuotationContainers` (QuotationContainer) | `deletedDate`, `createdDate`, `lastUpdatedDate`, `deleted.date` | — | — |
| `Jobs:QuotationFiles` (QuotationFile) | `uploadedOn`, `notes[].createdOn`, `versions[].uploadedOn` | — | — |
| `Jobs:QuotationLayouts` (QuotationLayout) | `createdDate`, `lastUpdatedDate`, `deleted.date` | — | — |
| `Jobs:QuotationNotes` (QuotationNote) | `created` | — | — |
| `Jobs:QuotationSections` (QuotationSection) | `items[].pricedItem.pricedMaterials[].material.importedAt`, `items[].pricedItem.pricedMaterials[].material.deletedDate`, `items[].pricedItem.pricedMaterials[].material.createdDate`, `items[].pricedItem.pricedMaterials[].material.lastUpdatedDate`, `items[].pricedItem.pricedMaterials[].material.deleted.date`, `items[].itemExtras[].materialModifiers[].material.importedAt`, `items[].itemExtras[].materialModifiers[].material.deletedDate`, `items[].itemExtras[].materialModifiers[].material.createdDate`, `items[].itemExtras[].materialModifiers[].material.lastUpdatedDate`, `items[].itemExtras[].materialModifiers[].material.deleted.date`, `createdDate`, `lastUpdatedDate`, `deleted.date` | `items[].unpricedItem.secureDate`³, `overHireData.handoverFirstErectDate`, `overHireData.handoverLastStrikeDate` | — |
| `Jobs:QuotationSentAudits` (QuotationSentAudit) | `createdDate`, `lastUpdatedDate`, `deleted.date` | — | — |
| `Jobs:QuotationSetup` (QuotationSetup) | `createdDate`, `lastUpdatedDate`, `deleted.date` | — | — |
| `Jobs:QuotationVersions` (QuotationVersion) | `submittedOn`, `createdDate`, `lastUpdatedDate`, `deleted.date` | `valuationDates[].date`, `dueDate`, `startDate`¹, `endDate`¹, `contractPerformanceStartDate`, `finalReviewDate` | `site.yardToSiteEstimatedJourneyTime` (duration) |
| `Jobs:Quotations` (Quotation) | `customer.created`, `customer.updated`, `created`, `updated`, `submittedOn`, `obtainedDate`, `createdDate`, `lastUpdatedDate`, `deleted.date` | `obtainedSections[].secureDate`³, `obtainedSections[].information.orderReceivedDate`, `obtainedSections[].information.commencementOnSiteDate`, `obtainedSections[].information.contractedCompletionDate`, `obtainedSections[].information.completionOfDesignDate`, `obtainedSections[].information.completionOfRAMSDate` | — |
| `Jobs:Sections` (Section) | `items[].pricedItem.pricedMaterials[].material.importedAt`, `items[].pricedItem.pricedMaterials[].material.deletedDate`, `items[].pricedItem.pricedMaterials[].material.createdDate`, `items[].pricedItem.pricedMaterials[].material.lastUpdatedDate`, `items[].pricedItem.pricedMaterials[].material.deleted.date`, `items[].itemExtras[].materialModifiers[].material.importedAt`, `items[].itemExtras[].materialModifiers[].material.deletedDate`, `items[].itemExtras[].materialModifiers[].material.createdDate`, `items[].itemExtras[].materialModifiers[].material.lastUpdatedDate`, `items[].itemExtras[].materialModifiers[].material.deleted.date` | `sectionSecuredMetadata.secureDate`³, `secureDate`³, `items[].unpricedItem.secureDate`³, `overHireData.handoverFirstErectDate`³, `overHireData.handoverLastStrikeDate`³ | — |
| `Jobs:StockItemCatalogues` (StockItemCatalogue) | `brandLogo.capturedDate`, `deletedDate`, `createdDate`, `lastUpdatedDate`, `deleted.date` | — | — |
| `Jobs:StockItems` (StockItem) | `deletedDate`, `createdDate`, `lastUpdatedDate`, `deleted.date` | — | — |
| `Jobs:Takeoffs` (Takeoff) | `Sources[].Parse.ParsedDate`, `Sources[].AddedDate`, `CreatedDate`, `LastUpdatedDate` | — | — |
| `Jobs:TeamSectors` (TeamSector) | `deletedDate`, `createdDate`, `lastUpdatedDate`, `deleted.date` | — | — |
| `Jobs:Teams` (Team) | `teamLogo.capturedDate` | `subscriptionInformation.startDate`¹, `subscriptionInformation.betaPeriodEndDate`, `subscriptionInformation.stoppedDate` | — |
| `Jobs:VersionInfo` (VersionInfo) | `createdDate`, `lastUpdatedDate`, `deleted.date` | — | — |

#### ResourcesService

| Collection (model) | Instant fields | Calendar-date fields | Not migrated |
|---|---|---|---|
| `Resources:Customer:IncomingIntegrationEvents` (CustomerIntegrationEventLogItem) | — | — | `HandledDate` |
| `Resources:Customer:OutboundIntegrationEvents` (CustomerOutboundIntegrationEvent) | — | — | `PublishDate` |
| `Resources:Customer:StaffMembers` (CustomerStaffMember) | `MemberPhoto.CapturedDate`, `Created`, `Updated` | `DateOfBirth` | — |
| `Resources:HrAbsences` (HrAbsence) | `CreatedAt`, `UpdatedAt` | `StartDate`², `EndDate`² | — |
| `Resources:HrBankHolidays` (BankHoliday) | `CreatedAt`, `UpdatedAt` | `Date`² | — |
| `Resources:HrEmployees` (HrEmployee) | — | `EndDate`, `Birthday`, `StartDate` | — |
| `Resources:IncomingIntegrationEvents` (IntegrationEventLogItem) | — | — | `HandledDate` |
| `Resources:OutboundIntegrationEvents` (OutboundIntegrationEvent) | — | — | `PublishDate` |
| `Resources:StaffMemberAbsence` (StaffMemberAbsence) | — | `StartDate`², `EndDate`² | — |
| `Resources:StaffMembers` (StaffMember) | `Created`, `Updated`, `MemberPhoto.CapturedDate` | `StartDate`, `EndDate`, `Qualifications[].ExpiryDate`, `DateOfBirth` | — |
| `Resources:Teams` (Team) | `TeamLogo.CapturedDate`, `Updated` | `SubscriptionInformation.StartDate`¹, `SubscriptionInformation.BetaPeriodEndDate`, `SubscriptionInformation.StoppedDate` | — |

#### SafetySuiteService

| Collection (model) | Instant fields | Calendar-date fields | Not migrated |
|---|---|---|---|
| `SafetySuite:NearMissLogs` (NearMissLog) | `Date`¹ | — | — |
| `SafetySuite:NearMissSettings` (NearMissSettings) | `Updated` | — | — |
| `SafetySuite:NearMisses` (NearMiss) | `Attachments[].CapturedDate`, `CreatedAt`, `IncidentTime`, `SentToClientTime`, `ActionedTime` | — | — |

---

## Appendix B — Event payload dates (models, 2026-10-06)

Domain events live in the 12 event stores and are converted (rule I, or rule C for paths marked `c`). Integration events are listed for completeness: their stored copies in the outboxes are not converted (M2.4); after cut-over the same contracts carry wall-clock values between services.

#### ActiveWorkService — domain events (event store `Data`, converted): 32 classes, 77 date paths

| Event class | Date paths (`c` = calendar date, others instant) |
|---|---|
| `ActiveWorkCreatedEvent` | `OperationalGroups[].PlantHireStartDate` `c`³, `OperationalGroups[].PlantHireEndDate` `c`³ |
| `ActiveWorkCreatedEvent2` | `OperationalGroups[].PlantHireStartDate` `c`³, `OperationalGroups[].PlantHireEndDate` `c`³, `AssignedStaff[].Acceptance.Updated` |
| `ActiveWorkCreatedEvent3` | `OperationalGroups[].PlantHireStartDate` `c`³, `OperationalGroups[].PlantHireEndDate` `c`³, `AssignedStaff[].Acceptance.Updated`, `PrincipleStaff[].Acceptance.Updated`, `StartDate` `c` |
| `ActiveWorkCreatedEvent4` | `OperationalGroups[].PlantHireStartDate` `c`³, `OperationalGroups[].PlantHireEndDate` `c`³, `AssignedStaff[].Acceptance.Updated`, `PrincipleStaff[].Acceptance.Updated`, `StartDate` `c`, `StaffDayAssignments[].Date` `c`, `StaffDayAssignments[].StaffMembers[].Acceptance.Updated`, `StaffDayAssignments[].RejectedStaffMembers[].Acceptance.Updated`, `StaffDayAssignments[].WorkStart`, `StaffDayAssignments[].WorkEnd`, `ExpectedHandoverDate` `c` |
| `ActiveWorkCreatedEvent5` | `OperationalGroups[].PlantHireStartDate` `c`³, `OperationalGroups[].PlantHireEndDate` `c`³, `AssignedStaff[].Acceptance.Updated`, `PrincipleStaff[].Acceptance.Updated`, `StartDate` `c`, `StaffDayAssignments[].Date` `c`, `StaffDayAssignments[].StaffMembers[].Acceptance.Updated`, `StaffDayAssignments[].RejectedStaffMembers[].Acceptance.Updated`, `StaffDayAssignments[].WorkStart`, `StaffDayAssignments[].WorkEnd`, `ExpectedHandoverDate` `c` |
| `ActiveWorkModelRebuild2` | `CreationDate` |
| `ActiveWorkPrincipleAssigned` | `CreationDate` |
| `ActiveWorkProgressUpdatedEvent` | `HandoverApprovedDate` |
| `ActiveWorkUserAssigned` | `CreationDate` |
| `AssignmentAcceptanceUpdatedEvent` | `Updated` |
| `AttachmentUploadedEvent` | `Attachment.CapturedDate` |
| `CommentaryUpdatedEvent` | `Comment.Date`, `Comment.Attachments[].CapturedDate` |
| `CreateWorkReadinessStateReportEvent` | `Evidence[].CapturedDate`, `CreationDate` |
| `DownloadAWReportsEvent` | `CreationDate` |
| `InAppNotificationEvent` | `ExpiresAt`, `CreationDate` |
| `InstructionToWorkDateUpdated` | `CreationDate` |
| `InstructionToWorkTextUpdated` | `CreationDate` |
| `InstructionToWorkUpdatedEvent` | `AssignedStaff[].Acceptance.Updated` |
| `InstructionToWorkUpdatedEvent2` | `AssignedStaff[].Acceptance.Updated`, `PrincipleStaff[].Acceptance.Updated`, `StartDate` `c` |
| `InstructionToWorkUpdatedEvent3` | `AssignedStaff[].Date` `c`, `AssignedStaff[].StaffMembers[].Acceptance.Updated`, `AssignedStaff[].RejectedStaffMembers[].Acceptance.Updated`, `AssignedStaff[].WorkStart`, `AssignedStaff[].WorkEnd`, `PrincipleStaff[].Acceptance.Updated`, `StartDate` `c`, `ExpectedHandoverDate` `c` |
| `InternalBulkActiveWorkCreated` | `OperationalGroups[].PlantHireStartDate` `c`³, `OperationalGroups[].PlantHireEndDate` `c`³, `CreationDate` |
| `MoveActiveWorkAssignmentEvent` | `ActiveWorkAssignment.OldStartDate` `c`, `ActiveWorkAssignment.NewStartDate` `c` |
| `MoveActiveWorkEvent` | `ActiveWork.OldStartDate` `c`, `ActiveWork.NewStartDate` `c` |
| `NoteToPrincipleTextUpdated` | `CreationDate` |
| `OperationalGroupValueUpdatedEvent` | `Ogs[].PlantHireStartDate` `c`³, `Ogs[].PlantHireEndDate` `c`³ |
| `PushNotificationEvent` | `CreationDate` |
| `StaffAddedToAssignmentEvent` | `StaffMembers[].Acceptance.Updated` |
| `StaffAssignedEvent` | `StaffMember.Acceptance.Updated` |
| `StaffAssignmentEmailUpdatedEvent` | `FromDate` `c` |
| `StaffMemberMovedEvent` | `StaffMember.Acceptance.Updated` |
| `StaffRemovedEvent` | `FromDate` `c` |
| `WorkReadinessStateEvent` | `Date`, `Evidence[].CapturedDate` |

#### ActiveWorkService — integration events (outbox `Data` and Service Bus contracts, not converted in storage): 5 classes, 15 date paths

| Event class | Date paths (`c` = calendar date, others instant) |
|---|---|
| `ActiveWorkAssignmentCompleted` | `CompletedDate` `c`, `CreationDate` |
| `ActiveWorkDeleted` | `OperationalGroups[].PlantHireStartDate` `c`, `OperationalGroups[].PlantHireEndDate` `c`, `CreationDate` |
| `ActiveWorkStaffUpdated` | `AssignedStaff[].Date` `c`, `AssignedStaff[].StaffMembers[].Acceptance.Updated`, `AssignedStaff[].RejectedStaffMembers[].Acceptance.Updated`, `AssignedStaff[].WorkStart`, `AssignedStaff[].WorkEnd`, `CreationDate` |
| `SectionFirstErectDateUpdated` | `FirstErectDate` `c`, `CreationDate` |
| `SectionFirstErectOccurred` | `OccurredDate`, `CreationDate` |

#### AttendanceService — domain events (event store `Data`, converted): 28 classes, 55 date paths

| Event class | Date paths (`c` = calendar date, others instant) |
|---|---|
| `AttendanceRecordModelUpdated` | `CreationDate` |
| `AttendanceUpdated` | `Attendance.ClockInDate`, `Attendance.ClockOutDate`, `Attendance.ClockInActualDate`, `Attendance.ClockOutActualDate`, `CreationDate` |
| `BulkWageRecordsModelUpdatedEvent` | `CreationDate` |
| `SupervisorAbsent` | `Date` |
| `SupervisorAttendanceCleared` | `Date` |
| `SupervisorClockedIn` | `ClockInDate`, `ClockInActualDate` |
| `SupervisorClockedIn2` | `ClockInDate`, `ClockInActualDate` |
| `SupervisorClockedOut` | `ClockOutDate`, `ClockOutActualDate` |
| `SupervisorClockedOut2` | `ClockOutDate`, `ClockOutActualDate` |
| `UserClockedIn` | `ClockInDate`, `ClockInActualDate` |
| `UserClockedIn2` | `ClockInDate`, `ClockInActualDate` |
| `UserClockedOut` | `ClockOutDate`, `ClockOutActualDate` |
| `WageBonusAwarded` | `WeekCommencing` `c`, `AwardedBy.OperationDate` |
| `WageBonusModelUpdated` | `CreationDate` |
| `WageRecordApproved` | `Approver.OperationDate` |
| `WageRecordApproved2` | `Approver.OperationDate` |
| `WageRecordClockInUpdated` | `ClockIn`, `ClockInActualDate` |
| `WageRecordClockOutUpdated` | `ClockOut`, `ClockOutActualDate` |
| `WageRecordCreated` | `Attendance.ClockInDate`, `Attendance.ClockOutDate`, `Attendance.ClockInActualDate`, `Attendance.ClockOutActualDate` |
| `WageRecordModelRecalculated` | `WeekCommencing` `c`, `CreationDate` |
| `WageRecordModelUpdated` | `CreationDate` |
| `WageRecordModelUpdatedRecalculate` | `RecordDate`, `CreationDate` |
| `WageRecordOverridden2` | `Date` |
| `WageRecordOverridden3` | `Date` |
| `WageRecordSnapshotTaken` | `Approver.OperationDate` |
| `WageRecordsModelUpdatedRecalculate` | `RecordDate`, `CreationDate` |
| `WageSnapshotModelUpdated` | `CreationDate` |
| `WageWeekSnapshotTaken` | `WeekCommencing` `c`, `LockedBy.OperationDate`, `Week[].DayRecords[].ClockIn`, `Week[].DayRecords[].clockOut`, `Week[].DayRecords[].Override.Date`, `Week[].DayRecords[].ClockInActualDate`, `Week[].DayRecords[].ClockOutActualDate`, `Week[].Bonus.WeekCommencing` `c` |

#### CustomerService — domain events (event store `Data`, converted): 1 classes, 2 date paths

| Event class | Date paths (`c` = calendar date, others instant) |
|---|---|
| `CustomerCreatedEvent` | `created`, `updated` |

#### CustomerService — integration events (outbox `Data` and Service Bus contracts, not converted in storage): 8 classes, 12 date paths

| Event class | Date paths (`c` = calendar date, others instant) |
|---|---|
| `BatonCustomerCreated` | `created`, `updated`, `creationDate` |
| `BatonCustomerUpdated` | `created`, `updated`, `creationDate` |
| `CustomerArchived` | `creationDate` |
| `CustomerBatonCustomerCodeSet` | `creationDate` |
| `CustomerCreated` | `creationDate` |
| `CustomerMetaUpdated` | `creationDate` |
| `CustomerRestored` | `creationDate` |
| `SetBatonCustomerDefaultConfiguration` | `creationDate` |

#### ForecastingService — domain events (event store `Data`, converted): 7 classes, 8 date paths

| Event class | Date paths (`c` = calendar date, others instant) |
|---|---|
| `RoleAllocationCreated` | `Date` `c` |
| `RoleAllocationDeleted` | `CreationDate` |
| `RoleAllocationModelUpdated` | `CreationDate` |
| `StaffAllocationCreated` | `Date` `c`, `CreationDate` |
| `StaffAllocationDeleted` | `CreationDate` |
| `StaffAllocationDurationUpdated` | `CreationDate` |
| `StaffAllocationModelUpdated` | `CreationDate` |

#### ForecastingService — integration events (outbox `Data` and Service Bus contracts, not converted in storage): 3 classes, 4 date paths

| Event class | Date paths (`c` = calendar date, others instant) |
|---|---|
| `StaffAllocationCreated` | `Date` `c`, `CreationDate` |
| `StaffAllocationDeleted` | `CreationDate` |
| `StaffAllocationDurationUpdated` | `CreationDate` |

#### Gateway — integration events (outbox `Data` and Service Bus contracts, not converted in storage): 13 classes, 19 date paths

| Event class | Date paths (`c` = calendar date, others instant) |
|---|---|
| `BatonCustomerCreated` | `Created`, `Updated`, `CreationDate` |
| `BatonCustomerUpdated` | `Created`, `Updated`, `CreationDate` |
| `CustomerStaffMemberArchivedEvent` | `CreationDate` |
| `CustomerStaffMemberDeactivatedEvent` | `CreationDate` |
| `CustomerStaffMemberExternalIdUpdatedEvent` | `CreationDate` |
| `CustomerUserPermissionUpdatedEvent` | `Updated`, `CreationDate` |
| `ReplayPermissionUpdatesEvent` | `CreationDate` |
| `StaffMemberArchivedEvent` | `CreationDate` |
| `StaffMemberDeactivatedEvent` | `CreationDate` |
| `StaffMemberExternalIdUpdatedEvent` | `CreationDate` |
| `TeamCreated` | `CreationDate` |
| `TeamUpdated` | `CreationDate` |
| `UserPermissionUpdatedEvent` | `Updated`, `CreationDate` |

#### HandoverService — domain events (event store `Data`, converted): 10 classes, 13 date paths

| Event class | Date paths (`c` = calendar date, others instant) |
|---|---|
| `HandoverApprovedEvent` | `ApprovedDate` |
| `HandoverApprovedEvent2` | `ApprovedDate` |
| `HandoverAttachmentUploadedEvent` | `Attachment.CapturedDate` |
| `HandoverAutoApprovedEvent` | `ApprovedDate` |
| `HandoverCreatedEvent2` | `Attachments[].CapturedDate`, `StaffDayAssignments[].Date` `c`, `StaffDayAssignments[].WorkStart`, `StaffDayAssignments[].WorkEnd` |
| `HandoverInternalApprovedEvent` | `ApprovedDate` |
| `HandoverModelBulkRebuildEvent` | `CreationDate` |
| `HandoverModelRebuildEvent` | `CreationDate` |
| `HandoverRejectedEvent` | `RejectedDate` |
| `HandoverUpdatedEvent` | `SubmittedDate` |

#### HandoverService — integration events (outbox `Data` and Service Bus contracts, not converted in storage): 29 classes, 76 date paths

| Event class | Date paths (`c` = calendar date, others instant) |
|---|---|
| `BatonCustomerHandoverApproved` | `DecidedAt`, `CreationDate` |
| `BatonCustomerHandoverApproved` | `DecidedAt`, `CreationDate` |
| `BatonCustomerHandoverRejected` | `DecidedAt`, `CreationDate` |
| `BatonCustomerHandoverRejected` | `DecidedAt`, `CreationDate` |
| `BatonCustomerJobProjected` | `CreationDate` |
| `BatonHandoverDeleted` | `DeletedAt`, `CreationDate` |
| `BatonHandoverDeleted` | `DeletedAt`, `CreationDate` |
| `BatonHandoverSubmitted` | `Snapshot.UploadedOn`, `Snapshot.SubmittedAt`, `Snapshot.ReviewDate`, `Snapshot.Updated`, `CreationDate` |
| `BatonHandoverSubmitted` | `Snapshot.UploadedOn`, `Snapshot.SubmittedAt`, `Snapshot.ReviewDate`, `Snapshot.Updated`, `CreationDate` |
| `BatonHandoverUpdated` | `ChangedAt`, `Snapshot.UploadedOn`, `Snapshot.SubmittedAt`, `Snapshot.ReviewDate`, `Snapshot.Updated`, `CreationDate` |
| `BatonHandoverUpdated` | `ChangedAt`, `Snapshot.UploadedOn`, `Snapshot.SubmittedAt`, `Snapshot.ReviewDate`, `Snapshot.Updated`, `CreationDate` |
| `BatonJobPublished` | `PublishedAt`, `Snapshot.StartDate` `c`, `Snapshot.EndDate` `c`, `Snapshot.Updated`, `CreationDate` |
| `BatonJobUnpublished` | `UnpublishedAt`, `CreationDate` |
| `BatonJobUpdated` | `UpdatedAt`, `Snapshot.StartDate` `c`, `Snapshot.EndDate` `c`, `Snapshot.Updated`, `CreationDate` |
| `CustomerHandoverSnapshot` | `UploadedOn`, `SubmittedAt`, `ReviewDate`, `Updated` |
| `CustomerHandoverSnapshot` | `UploadedOn`, `SubmittedAt`, `ReviewDate`, `Updated` |
| `CustomerJobSnapshot` | `StartDate` `c`, `EndDate` `c`, `Updated` |
| `DownloadHandoverReportsEvent` | `CreationDate` |
| `HandoverApproved` | `ApprovedDate`, `CreationDate` |
| `HandoverApproved2` | `ApprovedDate`, `CreationDate` |
| `HandoverCreated` | `CreationDate` |
| `HandoverDeleted` | `CreationDate` |
| `HandoverRaised` | `CreationDate` |
| `HandoverRejected` | `CreationDate` |
| `PushNotificationEvent` | `CreationDate` |
| `SectionFirstErectDateUpdated` | `FirstErectDate` `c`, `CreationDate` |
| `SectionFirstErectOccurred` | `OccurredDate`, `CreationDate` |
| `SectionLastStrikeDateUpdated` | `LastStrikeDate`, `CreationDate` |
| `SectionLastStrikeOccurred` | `LastStrikeDate`, `CreationDate` |

#### InspectionsService — domain events (event store `Data`, converted): 6 classes, 9 date paths

| Event class | Date paths (`c` = calendar date, others instant) |
|---|---|
| `HsInspectionCreatedEvent` | `Sections[].Answers[].DateAnswer` `c`, `Sections[].Answers[].Attachments[].CapturedDate` |
| `HsInspectionModelUpdatedEvent` | `CreationDate` |
| `HsInspectionStepResultAddedEvent` | `StepResult.DateAnswer` `c`, `StepResult.Attachments[].CapturedDate` |
| `InspectionAttachmentUploadedEvent` | `Attachment.CapturedDate` |
| `InspectionModelUpdatedEvent` | `CreationDate` |
| `InspectionSectionItemAddedEvent` | `Item.Attachments[].CapturedDate`, `Item.ResolveDate` |

#### InspectionsService — integration events (outbox `Data` and Service Bus contracts, not converted in storage): 10 classes, 28 date paths

| Event class | Date paths (`c` = calendar date, others instant) |
|---|---|
| `DownloadHsInspectionReportsEvent` | `CreationDate` |
| `DownloadInspectionReportsEvent` | `CreationDate` |
| `HandoverApproved` | `ApprovedDate`, `CreationDate` |
| `HsInspectionSubmitted` | `Sections[].Answers[].DateAnswer` `c`, `Sections[].Answers[].Attachments[].CapturedDate`, `SubmissionMeta.RaisedDate`, `CreationDate` |
| `InspectionStatusUpdated` | `Sections[].Items[].Attachments[].CapturedDate`, `Sections[].Items[].ResolveDate`, `SubmissionMeta.RaisedDate`, `CreationDate` |
| `InspectionSubmitted` | `Sections[].Items[].Attachments[].CapturedDate`, `Sections[].Items[].ResolveDate`, `SubmissionMeta.RaisedDate`, `CreationDate` |
| `PushNotificationEvent` | `CreationDate` |
| `StaffMemberEmailChangedEvent` | `CreationDate` |
| `TeamCreated` | `TeamLogo.CapturedDate`, `SubscriptionInformation.StartDate` `c`, `SubscriptionInformation.BetaPeriodEndDate` `c`, `SubscriptionInformation.StoppedDate` `c`, `CreationDate` |
| `TeamUpdated` | `TeamLogo.CapturedDate`, `SubscriptionInformation.StartDate` `c`, `SubscriptionInformation.BetaPeriodEndDate` `c`, `SubscriptionInformation.StoppedDate` `c`, `CreationDate` |

#### MaterialsService — integration events (outbox `Data` and Service Bus contracts, not converted in storage): 12 classes, 22 date paths

| Event class | Date paths (`c` = calendar date, others instant) |
|---|---|
| `StaffMemberActivatedEvent` | `CreationDate` |
| `StaffMemberArchivedEvent` | `CreationDate` |
| `StaffMemberAuthGroupUpdatedEvent` | `CreationDate` |
| `StaffMemberCreatedEvent` | `CreationDate` |
| `StaffMemberDeactivatedEvent` | `CreationDate` |
| `StaffMemberEmailChangedEvent` | `CreationDate` |
| `StaffMemberEndDateSetEvent` | `EndDate` `c`, `CreationDate` |
| `StaffMemberMetaUpdatedEvent` | `EndDate` `c`, `CreationDate` |
| `StaffMemberRestoredEvent` | `CreationDate` |
| `StockAdjustedEvent` | `CreationDate` |
| `TeamCreated` | `TeamLogo.CapturedDate`, `SubscriptionInformation.StartDate` `c`, `SubscriptionInformation.BetaPeriodEndDate` `c`, `SubscriptionInformation.StoppedDate` `c`, `CreationDate` |
| `TeamUpdated` | `TeamLogo.CapturedDate`, `SubscriptionInformation.StartDate` `c`, `SubscriptionInformation.BetaPeriodEndDate` `c`, `SubscriptionInformation.StoppedDate` `c`, `CreationDate` |

#### NotificationService — domain events (event store `Data`, converted): 3 classes, 4 date paths

| Event class | Date paths (`c` = calendar date, others instant) |
|---|---|
| `ExternalNotificationEvent` | `CreationDate` |
| `InAppNotificationEvent` | `ExpiresAt`, `CreationDate` |
| `PushNotificationEvent` | `CreationDate` |

#### PermissionsService — domain events (event store `Data`, converted): 4 classes, 4 date paths

| Event class | Date paths (`c` = calendar date, others instant) |
|---|---|
| `AuthorisationGroupModelUpdated` | `CreationDate` |
| `CustomerUserPermissionModelUpdated` | `CreationDate` |
| `UserPermission2ModelUpdated` | `CreationDate` |
| `UserPermissionModelUpdated` | `CreationDate` |

#### PermissionsService — integration events (outbox `Data` and Service Bus contracts, not converted in storage): 13 classes, 20 date paths

| Event class | Date paths (`c` = calendar date, others instant) |
|---|---|
| `BatonCustomerCreated` | `Created`, `Updated`, `CreationDate` |
| `CustomerStaffMemberAuthGroupUpdatedEvent` | `Updated`, `CreationDate` |
| `CustomerStaffMemberCreatedEvent` | `DateOfBirth` `c`, `CreationDate` |
| `CustomerStaffMemberExternalIdUpdatedEvent` | `CreationDate` |
| `CustomerUserPermissionUpdatedEvent` | `Updated`, `CreationDate` |
| `ReplayCustomerPermissionUpdatesEvent` | `CreationDate` |
| `ReplayPermissionUpdatesEvent` | `CreationDate` |
| `SetBatonCustomerDefaultConfiguration` | `CreationDate` |
| `SetTeamDefaultConfiguration` | `CreationDate` |
| `StaffMemberAuthGroupUpdatedEvent` | `Updated`, `CreationDate` |
| `StaffMemberExternalIdUpdatedEvent` | `CreationDate` |
| `TeamCreated` | `CreationDate` |
| `UserPermissionUpdatedEvent` | `Updated`, `CreationDate` |

#### ProjectService — domain events (event store `Data`, converted): 21 classes, 130 date paths

| Event class | Date paths (`c` = calendar date, others instant) |
|---|---|
| `JobCopiedEvent` | `customer.created`, `customer.updated`, `sections[].sectionSecuredMetadata.secureDate` `c`³, `sections[].secureDate` `c`³, `sections[].items[].pricedItem.pricedMaterials[].material.importedAt`, `sections[].items[].pricedItem.pricedMaterials[].material.deletedDate`, `sections[].items[].pricedItem.pricedMaterials[].material.createdDate`, `sections[].items[].pricedItem.pricedMaterials[].material.lastUpdatedDate`, `sections[].items[].pricedItem.pricedMaterials[].material.deleted.date`, `sections[].items[].unpricedItem.secureDate` `c`³, `sections[].items[].itemExtras[].materialModifiers[].material.importedAt`, `sections[].items[].itemExtras[].materialModifiers[].material.deletedDate`, `sections[].items[].itemExtras[].materialModifiers[].material.createdDate`, `sections[].items[].itemExtras[].materialModifiers[].material.lastUpdatedDate`, `sections[].items[].itemExtras[].materialModifiers[].material.deleted.date`, `sections[].overHireData.handoverFirstErectDate` `c`³, `sections[].overHireData.handoverLastStrikeDate` `c`³ |
| `JobMetadataUpdatedEvent4` | `startDate` `c`, `endDate` `c`, `finalAccountValuationDate` `c`, `contractPerformanceSettings.date`, `contractPerformanceSettings.firstWageDate` `c`³, `contractPerformanceSettings.userInputDate` `c` |
| `JobMetadataUpdatedEvent5` | `startDate` `c`, `endDate` `c`, `finalAccountValuationDate` `c`, `contractPerformanceSettings.date`, `contractPerformanceSettings.firstWageDate` `c`³, `contractPerformanceSettings.userInputDate` `c` |
| `JobModelUpdatedEvent` | `creationDate` |
| `OperationalGroupProgressRevertedEvent` | `handover.approvedDate` |
| `OperationalGroupProgressUpdatedEvent` | `handover.approvedDate` |
| `ProjectFirstWageCreatedEvent` | `date` |
| `QuotationBuilderEventData` | `createdDate`, `lastUpdatedDate`, `generatedDocument.generatedOn` |
| `QuotationCreatedEventData` | `customer.created`, `customer.updated`, `createdDate` |
| `QuotationMetadataEventData` | `site.yardToSiteEstimatedJourneyTime`, `dueDate` `c`, `startDate` `c`, `endDate` `c`, `updated`, `lastUpdatedDate`, `contractPerformanceStartDate` `c`, `finalReviewDate` `c` |
| `QuotationObtainedEvent` | `obtainDate`, `information.orderReceivedDate` `c`, `information.commencementOnSiteDate` `c`, `information.contractedCompletionDate` `c`, `information.completionOfDesignDate` `c`, `information.completionOfRAMSDate` `c` |
| `QuotationSectionEventData` | `items[].pricedItem.pricedMaterials[].material.importedAt`, `items[].pricedItem.pricedMaterials[].material.deletedDate`, `items[].pricedItem.pricedMaterials[].material.createdDate`, `items[].pricedItem.pricedMaterials[].material.lastUpdatedDate`, `items[].pricedItem.pricedMaterials[].material.deleted.date`, `items[].unpricedItem.secureDate` `c`³, `items[].itemExtras[].materialModifiers[].material.importedAt`, `items[].itemExtras[].materialModifiers[].material.deletedDate`, `items[].itemExtras[].materialModifiers[].material.createdDate`, `items[].itemExtras[].materialModifiers[].material.lastUpdatedDate`, `items[].itemExtras[].materialModifiers[].material.deleted.date`, `overHireData.handoverFirstErectDate` `c`³, `overHireData.handoverLastStrikeDate` `c`³, `createdDate`, `lastUpdatedDate` |
| `QuotationUpdatedEvent` | `creationDate` |
| `QuotationVersionCreatedEventData` | `version.createdDate`, `version.lastUpdatedDate`, `version.submittedOn`, `version.valuationDates[].date`, `version.site.yardToSiteEstimatedJourneyTime`, `version.dueDate` `c`, `version.startDate` `c`, `version.endDate` `c`, `version.contractPerformanceStartDate` `c`, `version.finalReviewDate` `c`, `sections[].items[].pricedItem.pricedMaterials[].material.importedAt`, `sections[].items[].pricedItem.pricedMaterials[].material.deletedDate`, `sections[].items[].pricedItem.pricedMaterials[].material.createdDate`, `sections[].items[].pricedItem.pricedMaterials[].material.lastUpdatedDate`, `sections[].items[].pricedItem.pricedMaterials[].material.deleted.date`, `sections[].items[].unpricedItem.secureDate` `c`³, `sections[].items[].itemExtras[].materialModifiers[].material.importedAt`, `sections[].items[].itemExtras[].materialModifiers[].material.deletedDate`, `sections[].items[].itemExtras[].materialModifiers[].material.createdDate`, `sections[].items[].itemExtras[].materialModifiers[].material.lastUpdatedDate`, `sections[].items[].itemExtras[].materialModifiers[].material.deleted.date`, `sections[].overHireData.handoverFirstErectDate` `c`³, `sections[].overHireData.handoverLastStrikeDate` `c`³, `sections[].createdDate`, `sections[].lastUpdatedDate`, `builder.createdDate`, `builder.lastUpdatedDate`, `builder.generatedDocument.generatedOn` |
| `QuotationVersionEventData` | `createdDate`, `lastUpdatedDate`, `submittedOn`, `valuationDates[].date` `c`, `site.yardToSiteEstimatedJourneyTime`, `dueDate` `c`, `startDate` `c`, `endDate` `c`, `contractPerformanceStartDate` `c`, `finalReviewDate` `c` |
| `QuotationVersionRevisionSummaryEventData` | `lastUpdatedDate` |
| `QuotationVersionValuationDatesEventData` | `valuationDates[].date` `c` |
| `SectionItemUpdatedEvent` | `item.pricedItem.pricedMaterials[].material.importedAt`, `item.pricedItem.pricedMaterials[].material.deletedDate`, `item.pricedItem.pricedMaterials[].material.createdDate`, `item.pricedItem.pricedMaterials[].material.lastUpdatedDate`, `item.pricedItem.pricedMaterials[].material.deleted.date`, `item.unpricedItem.secureDate` `c`³, `item.itemExtras[].materialModifiers[].material.importedAt`, `item.itemExtras[].materialModifiers[].material.deletedDate`, `item.itemExtras[].materialModifiers[].material.createdDate`, `item.itemExtras[].materialModifiers[].material.lastUpdatedDate`, `item.itemExtras[].materialModifiers[].material.deleted.date` |
| `SectionOverHireDataUpdatedEvent` | `handoverLastStrikeDate` `c`³, `handoverFirstErectDate` `c`³ |
| `SecureSectionsEvent` | `securedSections.secureDate` `c`³, `securedSections.information.orderReceivedDate` `c`, `securedSections.information.commencementOnSiteDate` `c`, `securedSections.information.contractedCompletionDate` `c`, `securedSections.information.completionOfDesignDate` `c`, `securedSections.information.completionOfRAMSDate` `c` |
| `SendQuotationEmailEvent` | `document.generatedOn`, `creationDate` |

#### ProjectService — integration events (outbox `Data` and Service Bus contracts, not converted in storage): 41 classes, 115 date paths

| Event class | Date paths (`c` = calendar date, others instant) |
|---|---|
| `ActiveWorkDeleted` | `creationDate` |
| `BatonCustomerJobProjected` | `creationDate` |
| `BatonCustomerJobProjected` | `creationDate` |
| `BatonJobPublished` | `publishedAt`, `snapshot.startDate` `c`, `snapshot.endDate` `c`, `snapshot.updated`, `creationDate` |
| `BatonJobPublished` | `publishedAt`, `snapshot.startDate` `c`, `snapshot.endDate` `c`, `snapshot.updated`, `creationDate` |
| `BatonJobUnpublished` | `unpublishedAt`, `creationDate` |
| `BatonJobUnpublished` | `unpublishedAt`, `creationDate` |
| `BatonJobUpdated` | `updatedAt`, `snapshot.startDate` `c`, `snapshot.endDate` `c`, `snapshot.updated`, `creationDate` |
| `BatonJobUpdated` | `updatedAt`, `snapshot.startDate` `c`, `snapshot.endDate` `c`, `snapshot.updated`, `creationDate` |
| `BatonQuotationSent` | `sentAt`, `creationDate` |
| `BatonQuotationSent` | `sentAt`, `creationDate` |
| `CustomerBatonCustomerCodeSet` | `creationDate` |
| `CustomerCreated` | `creationDate` |
| `CustomerJobSnapshot` | `startDate` `c`, `endDate` `c`, `updated` |
| `CustomerJobSnapshot` | `startDate` `c`, `endDate` `c`, `updated` |
| `CustomerMetaUpdated` | `creationDate` |
| `ExtraMaterialModifierUpdated` | `creationDate` |
| `HandoverApproved` | `approvedDate`, `creationDate` |
| `HandoverDeleted` | `creationDate` |
| `JobContactsUpdated` | `creationDate` |
| `JobCreated` | `customer.created`, `customer.updated`, `creationDate` |
| `JobCustomer` | `created`, `updated` |
| `JobFileDeleted` | `creationDate` |
| `JobFileUpdated` | `creationDate` |
| `JobMetadataUpdated` | `creationDate` |
| `JobPrelimsInfoUpdated` | `date` `c`, `creationDate` |
| `OperationalGroupDeleted` | `creationDate` |
| `OperationalGroupUpdated` | `items[].pricedItem.pricedMaterials[].material.importedAt`, `items[].pricedItem.pricedMaterials[].material.deletedDate`, `items[].pricedItem.pricedMaterials[].material.createdDate`, `items[].pricedItem.pricedMaterials[].material.lastUpdatedDate`, `items[].pricedItem.pricedMaterials[].material.deleted.date`, `items[].unpricedItem.secureDate` `c`, `items[].itemExtras[].materialModifiers[].material.importedAt`, `items[].itemExtras[].materialModifiers[].material.deletedDate`, `items[].itemExtras[].materialModifiers[].material.createdDate`, `items[].itemExtras[].materialModifiers[].material.lastUpdatedDate`, `items[].itemExtras[].materialModifiers[].material.deleted.date`, `creationDate` |
| `OperationalGroupUpdatedv2` | `items[].pricedItem.pricedMaterials[].material.importedAt`, `items[].pricedItem.pricedMaterials[].material.deletedDate`, `items[].pricedItem.pricedMaterials[].material.createdDate`, `items[].pricedItem.pricedMaterials[].material.lastUpdatedDate`, `items[].pricedItem.pricedMaterials[].material.deleted.date`, `items[].unpricedItem.secureDate` `c`, `items[].itemExtras[].materialModifiers[].material.importedAt`, `items[].itemExtras[].materialModifiers[].material.deletedDate`, `items[].itemExtras[].materialModifiers[].material.createdDate`, `items[].itemExtras[].materialModifiers[].material.lastUpdatedDate`, `items[].itemExtras[].materialModifiers[].material.deleted.date`, `creationDate` |
| `OutboundItem` | `pricedItem.pricedMaterials[].material.importedAt`, `pricedItem.pricedMaterials[].material.deletedDate`, `pricedItem.pricedMaterials[].material.createdDate`, `pricedItem.pricedMaterials[].material.lastUpdatedDate`, `pricedItem.pricedMaterials[].material.deleted.date`, `unpricedItem.secureDate` `c`, `itemExtras[].materialModifiers[].material.importedAt`, `itemExtras[].materialModifiers[].material.deletedDate`, `itemExtras[].materialModifiers[].material.createdDate`, `itemExtras[].materialModifiers[].material.lastUpdatedDate`, `itemExtras[].materialModifiers[].material.deleted.date` |
| `PricedMaterialItemUpdated` | `creationDate` |
| `ProjectFirstWageCreated` | `date`, `creationDate` |
| `PushNotificationEvent` | `creationDate` |
| `SectionFirstErectDateUpdated` | `firstErectDate` `c`, `creationDate` |
| `SectionFirstErectOccurred` | `occurredDate`, `creationDate` |
| `SectionLastStrikeDateUpdated` | `lastStrikeDate`, `creationDate` |
| `SectionLastStrikeOccurred` | `lastStrikeDate`, `creationDate` |
| `SecuredItemUpdated` | `creationDate` |
| `SetTeamDefaultConfiguration` | `creationDate` |
| `TeamCreated` | `teamLogo.capturedDate`, `subscriptionInformation.startDate` `c`, `subscriptionInformation.betaPeriodEndDate` `c`, `subscriptionInformation.stoppedDate` `c`, `creationDate` |
| `TeamUpdated` | `teamLogo.capturedDate`, `subscriptionInformation.startDate` `c`, `subscriptionInformation.betaPeriodEndDate` `c`, `subscriptionInformation.stoppedDate` `c`, `creationDate` |

#### ResourcesService — domain events (event store `Data`, converted): 8 classes, 16 date paths

| Event class | Date paths (`c` = calendar date, others instant) |
|---|---|
| `BulkStaffMemberModelUpdated` | `CreationDate` |
| `CustomerStaffMemberCreated` | `DateOfBirth` `c` |
| `CustomerStaffMemberMetaUpdated` | `DateOfBirth` `c`, `MemberPhoto.CapturedDate` |
| `CustomerStaffMemberModelUpdated` | `CreationDate` |
| `StaffMemberCreated3` | `DateOfBirth` `c`, `StartDate` `c`, `Qualifications[].ExpiryDate` `c` |
| `StaffMemberMetaUpdated6` | `DateOfBirth` `c`, `MemberPhoto.CapturedDate`, `StartDate` `c`, `EndDate` `c`, `Qualifications[].ExpiryDate` `c` |
| `StaffMemberModelUpdated` | `CreationDate` |
| `StartMemberStartEndDateUpdated` | `StartDate` `c`, `EndDate` `c` |

#### ResourcesService — integration events (outbox `Data` and Service Bus contracts, not converted in storage): 23 classes, 45 date paths

| Event class | Date paths (`c` = calendar date, others instant) |
|---|---|
| `BatonCustomerCreated` | `CreationDate` |
| `CustomerStaffMemberActivatedEvent` | `CreationDate` |
| `CustomerStaffMemberArchivedEvent` | `CreationDate` |
| `CustomerStaffMemberAuthGroupUpdatedEvent` | `CreationDate` |
| `CustomerStaffMemberCreatedEvent` | `DateOfBirth` `c`, `CreationDate` |
| `CustomerStaffMemberDeactivatedEvent` | `CreationDate` |
| `CustomerStaffMemberExternalIdUpdatedEvent` | `CreationDate` |
| `CustomerStaffMemberMetaUpdatedEvent` | `DateOfBirth` `c`, `MemberPhoto.CapturedDate`, `CreationDate` |
| `CustomerStaffMemberRestoredEvent` | `CreationDate` |
| `StaffMemberAbsenceCreatedOrUpdatedEvent` | `StartDate` `c`, `EndDate` `c`, `CreationDate` |
| `StaffMemberAbsenceDeletedEvent` | `CreationDate` |
| `StaffMemberActivatedEvent` | `CreationDate` |
| `StaffMemberArchivedEvent` | `CreationDate` |
| `StaffMemberAuthGroupUpdatedEvent` | `CreationDate` |
| `StaffMemberCreatedEvent` | `DateOfBirth` `c`, `StartDate` `c`, `Qualifications[].ExpiryDate` `c`, `CreationDate` |
| `StaffMemberDeactivatedEvent` | `CreationDate` |
| `StaffMemberEmailChangedEvent` | `CreationDate` |
| `StaffMemberEndDateSetEvent` | `EndDate` `c`, `CreationDate` |
| `StaffMemberExternalIdUpdatedEvent` | `CreationDate` |
| `StaffMemberMetaUpdatedEvent` | `DateOfBirth` `c`, `MemberPhoto.CapturedDate`, `StartDate` `c`, `EndDate` `c`, `Qualifications[].ExpiryDate` `c`, `CreationDate` |
| `StaffMemberRestoredEvent` | `CreationDate` |
| `TeamCreated` | `TeamLogo.CapturedDate`, `SubscriptionInformation.StartDate` `c`, `SubscriptionInformation.BetaPeriodEndDate` `c`, `SubscriptionInformation.StoppedDate` `c`, `CreationDate` |
| `TeamUpdated` | `TeamLogo.CapturedDate`, `SubscriptionInformation.StartDate` `c`, `SubscriptionInformation.BetaPeriodEndDate` `c`, `SubscriptionInformation.StoppedDate` `c`, `CreationDate` |

---

## Appendix C — Script skeleton (`oskfel-migrations/team-local-time/`)

Files: `config.js`, `rules.js`, `01-profile.js`, `02-dry-run.js`, `03-build-shadows.js`, `04-verify.js`, `05-swap.js`, `06-rollback-swap.js`, `07-reverse.js`. Run with `mongosh <connection-string> <file>`; `dryRun: true` by default; every script prints a summary and writes it to `_Migrations:TeamLocalTime:Runs`. Same conventions as `PIC-Scripts/MIGRATION_OPTIMIZATION_GUIDE.md` (`ordered: false`, error counts, no per-document round trips where a batch works).

```js
const CONFIG = {
  zone: 'Europe/London',
  dryRun: true,
  batchSize: 500,
  shadowSuffix: '__tl',
  backupSuffix: '__utc_20261107',
  ledger: '_Migrations:TeamLocalTime',
};

const wallFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: CONFIG.zone,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function wallParts(date) {
  const parts = {};
  for (const part of wallFormat.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return parts;
}

function toWallClock(date) {
  const p = wallParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, date.getUTCMilliseconds()));
}

function toCalendarDay(date) {
  const p = wallParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

function isSentinel(date) {
  const year = date.getUTCFullYear();
  return year < 1800 || year > 9000;
}

function isBsonScalar(value) {
  return value !== null && typeof value === 'object' && value._bsontype !== undefined;
}

function convert(value, path, rules, stats) {
  if (value instanceof Date) {
    const key = path.toLowerCase();
    if (isSentinel(value)) {
      stats.skipped(key, 'sentinel');
      return value;
    }
    if (rules.technical.has(key)) {
      stats.skipped(key, 'technical');
      return value;
    }
    const isCalendar = rules.calendar.has(key);
    const next = isCalendar ? toCalendarDay(value) : toWallClock(value);
    stats.converted(key, value, next, isCalendar);
    return next;
  }
  if (Array.isArray(value)) return value.map(item => convert(item, `${path}[]`, rules, stats));
  if (value !== null && typeof value === 'object' && !isBsonScalar(value)) {
    const out = {};
    for (const [name, child] of Object.entries(value)) {
      out[name] = path === '' && name === '_id' ? child : convert(child, path ? `${path}.${name}` : name, rules, stats);
    }
    return out;
  }
  return value;
}

function buildShadow(name, rulesFor, stats) {
  const source = db.getCollection(name);
  const shadow = db.getCollection(name + CONFIG.shadowSuffix);
  const ledger = db.getCollection(CONFIG.ledger);
  const state = ledger.findOne({ _id: name }) ?? { lastId: null, copied: 0, status: 'new' };
  if (state.status === 'built' || state.status === 'swapped') return;
  let { lastId, copied } = state;
  for (;;) {
    const filter = lastId === null ? {} : { _id: { $gt: lastId } };
    const batch = source.find(filter).sort({ _id: 1 }).limit(CONFIG.batchSize).toArray();
    if (batch.length === 0) break;
    const converted = batch.map(doc => convert(doc, '', rulesFor(doc), stats));
    lastId = batch[batch.length - 1]._id;
    copied += batch.length;
    if (CONFIG.dryRun) continue;
    try {
      shadow.insertMany(converted, { ordered: false });
    } catch (error) {
      if (!(error.writeErrors ?? []).every(e => e.code === 11000)) throw error;
    }
    ledger.updateOne({ _id: name }, { $set: { lastId, copied, status: 'building', updatedAt: new Date() } }, { upsert: true });
  }
  if (!CONFIG.dryRun) ledger.updateOne({ _id: name }, { $set: { status: 'built', finishedAt: new Date() } });
}

function copyIndexes(name) {
  const shadow = db.getCollection(name + CONFIG.shadowSuffix);
  for (const { key, name: indexName, v, ns, ...options } of db.getCollection(name).getIndexes()) {
    if (indexName !== '_id_') shadow.createIndex(key, { name: indexName, ...options });
  }
}

function swap(name) {
  db.getCollection(name).renameCollection(name + CONFIG.backupSuffix);
  db.getCollection(name + CONFIG.shadowSuffix).renameCollection(name);
  db.getCollection(CONFIG.ledger).updateOne({ _id: name }, { $set: { status: 'swapped', swappedAt: new Date() } });
}
```

`rulesFor(doc)` returns the calendar and technical sets for the collection, and for event stores the sets of `doc.EventType`, all lower-cased. `stats` collects counts per path and rule, invariant breaches and ambiguous-hour values, and writes them to the run summary.

---
