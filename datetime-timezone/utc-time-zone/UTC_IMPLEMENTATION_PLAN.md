# UTC Migration — Implementation Plan

> **Status:** plan only — no product code has changed. Written 2026-10-01. Reviewed 2026-10-06: see the change log and the open questions at the end. **Companion documents:** `DATABASE_DATE_QUERY_AUDIT.md` (database date filters and their fix pattern), `BUSINESS_CALENDAR_INVENTORY.md` (London-zone copies per service). `DATA_MIGRATION_VERDICT.md` and `UTC_PLAN_DIAGRAMS.html` are referenced in older notes but do not exist in this folder. **Scope:** every part of the migration — shared libraries, CI, all 16 .NET repos, Gateway, the three Angular apps, data compatibility, containers and cut-over. **Go-live (agreed 2026-10-07):** one step for both plans (UTC and team-local). The phases are **implementation phases**: code is built and shipped dark phase by phase, then every service and every team is switched on in one go-live night. Where a step below still describes a live rollout (pilot team in D10 and ATT 2b, `TZ` removed per service in 9.1–9.8), the one-step changes in `../PLAN_COMPARISON_DETAILS.md` section 2.2 apply. Counts come from grep over the working trees on 2026-10-01 (call sites, not proven behaviour).

---

## Before any work: branch in every affected repo

Work spans every affected repo: the 16 .NET repos, Gateway, OcelotConfigValidator, the three Angular apps and `oskfel-migrations`. Before the first step in a repo, create the feature branch from the latest remote main branch:

```bash
git reset --hard
git clean -fd
git checkout main
git pull origin main
git checkout -b feature/1.6.0/team-time-zone
```

- OcelotConfigValidator uses `master` instead of `main`.
- Do this in every affected repo; one branch name across all of them: `feature/1.6.0/team-time-zone`.
- **Local changes are removed before the checkout:** `git reset --hard` discards changes to tracked files and `git clean -fd` deletes untracked files and folders, so the branch starts clean. These cannot be undone; anything worth keeping is pushed or copied elsewhere first. Ignored files (`bin/`, `obj/`, local settings in `.gitignore`) are kept.
- If the branch already exists in a repo, check it out and pull; never recreate it.
- `datetime-timezone` (this folder) is not a git repo and is skipped.

---

## How to read this plan

| If you want to… | Read |
| --- | --- |
| Understand the goal in five minutes | [1. The goal on one page](#1-the-goal-on-one-page) |
| Know what is already decided | [2. Decisions](#2-decisions) |
| Understand how the finished system works | [4. Target design](#4-target-design) |
| Pick up work | [5. Phases](#5-phases) — every phase is a card with a checklist |
| Know what can run in parallel | [6. Order, dependencies and size](#6-order-dependencies-and-size) |
| Find a file or a count | [8. Reference: inventory](#8-reference-inventory) |
| Work on AttendanceService | [Appendix A](#appendix-a--attendanceservice-step-by-step-att) |
| See what old calendar dates hold (dev profile) | [Appendix B](#appendix-b--dev-calendar-date-profile-2026-10-06) |

**Conventions**

- `1.13`, `6.T.9a`, `6.F.11` … are step IDs. One step = one PR (or one config change).
- `ATT 5.4` is a step in Appendix A (AttendanceService).
- **\[behaviour\]** marks a step that changes results on purpose.
- **\[behaviour: day fix\]** marks a step that keeps the business rule but applies it on the team's day instead of the UTC day. For London teams results change only in the hour where the two days differ (00:00–01:00 BST); the PR lists those cases.
- `D1`–`D14` are decisions (section 2). `R1`–`R3` are the rules (section 1). `C1`–`C3` are the frontend rules (section 4.6).

---

## 1. The goal on one page

**One sentence:** every date is sent, processed, stored and read back as UTC; people see and type dates in their **team's** time zone and format; and no container, server or browser time zone can change a result.

### What changes, for whom

| Who | Today | After |
| --- | --- | --- |
| **Users** | Dates show in whatever the screen or the browser decides; some screens are an hour or a day off around clock changes | Every date/time shows and is typed in the **team's time zone and format**. If the user's device is in another zone, the field shows a label like *"Times in London time (BST, UTC+1)"*. |
| **Frontend developers** | 297 `date` pipes, 59 datepickers, 546 local getters, hand-made conversions | One shared control `<app-date-time-field>` and two pipes: `teamDate` for instants (team zone) and `calendarDate` for picked days (date only, team zone). Components and services only hold UTC. |
| **Backend developers** | `DateTime.Now`, hard-coded `Europe/London`, `isSummer ? -1 : 0` | `IDateTimeProvider` for "now", `IBusinessCalendar` for days and times, every `DateTime` is `Kind=Utc`. |
| **Ops** | Six containers set `TZ=Europe/London` | No container sets a time zone. Containers run on the image default (UTC). |

### The three rules (how we know we are done)

| Rule | Meaning | Proof |
| --- | --- | --- |
| **R1 — Clients** | Zone conversion happens **only inside the shared control and the `teamDate` and `calendarDate` pipes**. Components and services work in UTC. Every date leaves as ISO-8601 with `Z`. | Wire-golden test: the same input under every device zone of the standard zone set (4.3) and on the UK, New York and Auckland clock-change days gives byte-identical request bodies. ESLint date rules at error. |
| **R2 — Backends** | No hard-coded or implicit zone. Day, week and time-of-day logic only inside `IBusinessCalendar`. No container sets `TZ`. | Test suites identical under `TZ` = UTC, London, Los Angeles, Auckland. Grep gates: zone names outside the calendar = 0; `TZ` in Dockerfiles/compose/Helm/pipelines = 0. |
| **R3 — Clock** | Every clock read goes through `IDateTimeProvider`. | `BannedApiAnalyzers` at error in every repo; grep for `DateTime.Now/UtcNow/Today`, `DateTimeOffset.Now/UtcNow` outside the provider = 0. |

### Phase map

```
 Phase 0  Decisions & discovery
    │
 Phase 1  Foundations ── shared time code (copied) · CI gates · frontend control & pipe
    │
 Phase 1b Team settings readers (6.T.1–6.T.5) ── every service can read the team zone and formats (London defaults)
    │
    ├── Phase 2  Clock reads (per repo) ─────────┐
    ├── Phase 3  Kind=Utc at every entry point ──┤   run in parallel
    ├── Phase 5  Calendar dates by team day ─────┤
    │                                            │
 Phase 4  Zone logic into the calendar (per service; Attendance & Report.API last)
          + 4.S recurring jobs per team, in team local time
    │
 Phase 6  Team settings writer, backfill and Gateway headers (6.T.6–6.T.17) + every screen on the shared control (6.H, 6.I, 6.F)
    │
 Phase 8  Retire old app builds & offline queues
    │
 Phase 9  Cut-over ── remove container TZ · strict mode · gates permanent
 Phase 10 Verification (runs alongside every phase)
 Phase 11 Optional: UTC business days (only if decided)
```

---

## 2. Decisions

| \# | Question | Answer used by this plan | Status |
| --- | --- | --- | --- |
| **D1** | What is a calendar date (a picked day)? | **Midnight of that day in the team's zone, sent and stored as UTC**, like any other time. Monday 6 July picked by a London team is `2026-07-05T23:00:00.000Z` in summer; Monday 5 January is `2026-01-05T00:00:00.000Z` in winter. It is the shape stored today, so old and new rows match. The day is always read back with the team's calendar (`calendar.DayOf`), never from the UTC date part (4.3). | **decided 2026-10-06** as UTC midnight (Q7); **changed 2026-10-07**: midnight in the team's zone, stored as UTC; 0.1 records the details |
| **D2** | In which zone do users see and type dates? | **The team's time zone** (team setting, default `Europe/London`), through one shared control. A label shows the zone when the device zone differs. Values leave the control as UTC. | **product requirement 2026-10-01**; 0.2 confirms the zone list |
| **D3** | Which zone decides business days (wages, reminders, PDFs)? | `IBusinessCalendar` built from the team zone (London by default). A switch to UTC business days is optional (Phase 11). | **decided 2026-10-06** (recommended answer, Q7); 0.3 records the details |
| **D4** | Do we correct old stored dates? | **No.** Instants are already UTC. Calendar dates already hold midnight in the team's zone (London), the D1 shape, so no stored date is rewritten. The dev profile (Appendix B) shows old rows with other times (end of the London day, `01:00`, real times); read with the London calendar they fall on the right day (4.3). Only midnights saved by browsers east of London (`21:00Z`, `22:00Z`, winter `23:00Z`) read as the day before; they are today's behaviour too, and fixing them once is optional (Q16). | **decided 2026-09-30** (no rewrite); changed to a one-time calendar conversion on 2026-10-07 and **back to no rewrite the same day**, with the D1 change |
| **D5** | Old app builds and offline queues? | Server accepts old formats for a window (counted), apps are force-updated, then strict. | **decided in principle 2026-10-06** (Q7); 0.4 sets the window length and the forced-update mechanism |
| **D6** | How are dates stored in Mongo? | BSON Date, read as `Kind=Utc`. | **decided 2026-10-06** (recommended answer, Q7); 0.5 records the details |
| **D7** | How are dates written on screen, PDFs, e-mails, exports? | Per-team **time zone**, **date format**, **time format**; all output uses named formats (section 4.4). Defaults: `Europe/London`, `dd/MM/yyyy`, `HH:mm`. Machine formats (API, file names, ISO exports) never change. | **decided 2026-10-06** (recommended answer, Q7); 0.17 records the details |
| **D8** | How is the server time code shared? | **Copied as source into every service** (`Time/` folders, section 4.2). **No `Intowork.Common.Time` package for now**; a package can replace the copies later without code changes (same namespace). | **decided 2026-10-01** |
| **D9** | In which zone do recurring jobs run? | **Every recurring job is set up in team local time, with the team's time zone** — one Hangfire job per team per purpose (e.g. 08:00 in the team's zone). Hangfire works out the UTC run time and handles clock changes. Every service that schedules jobs keeps the team zone in its team copy — **including Attendance** (section 4.8). | **decided 2026-10-01** |
| **D10** | How do the new Attendance time rules go live? | **A per-team switch** with a start week. Off for every team at first → on for one UK team → compare wages for 1–2 weeks → on for the rest. The switch picks the **rules** (old or new) for weeks from the start week. Switching a team **off** returns the calculation of those weeks to the old rules (recalculated, ATT 2b.5). It does **not** undo clock times and pairing ids already written with the new rules (B6–B8, B14), and it does not cover B12 (global) or B13 (per-service flag). A shift is judged by the week of its clock-in (ATT 2b.8). After full rollout new teams start on the new rules (ATT 2b.9); switching off is for London teams only (ATT 2b.4). Scope per change: A.1. | **decided 2026-10-01**; claim "returns it to the old rules at once" corrected in review 2026-10 (Questions Q2) |
| **D11** | What if someone recalculates an old week? | Weeks **before** the team's switch-on week are always calculated with the **old rules** (`Legacy*` calculators kept in production code). Old pay never changes. | **decided 2026-10-01** |
| **D12** | How is a clock-out matched to its clock-in? | Not by day. A clock-out matches the **latest open clock-in on the same project within the last 16 hours** (`Attendance:MaxShiftHours = 16`). Night shifts (22:00 → 06:00) work. | **decided 2026-10-01**; payroll may change the 16 |
| **D13** | Which zone does a team get? | **London by default, no block.** Every team starts on `Europe/London` (new teams, existing teams through 6.T.9a, any layer that finds no value). The zone is chosen **once, when the team is created** (default London; any zone allowed, nothing blocks it) and **never changes** afterwards. Existing teams are London (6.T.9a) and stay London. The conditions that make a non-London zone fully correct are tracked in 9.12 as a checklist, not a gate. | **decided 2026-10-01**; changed to "not blocked" and "set at creation, never changed" by the team 2026-10-06 |
| **D14** | Can a project have its own zone (site abroad)? | **Not now.** The team zone is the only zone. Kept as a later idea (section 7). | **decided 2026-10-01** |

**Notes on decisions (review 2026-10)**

- **Assumed → decided (2026-10-06, Q7):** D1, D3, D6 and D7 were assumed and are now decided with the answers the design already used; D5 is decided in principle (0.4 still sets the window length). If a later decision differs, only the steps that name it change.
- **D13's checklist uses D1.** A calendar date is the team's midnight (D1, changed 2026-10-07), so every service reads it with the calendar of the team the data belongs to (4.5, 9.12).
- **D13 not blocking (2026-10-06).** London is only the default. Because nothing blocks other zones, the parts of the system that are not yet zone-ready (9.12 checklist: days sent between services, Attendance before the switch, 4.X.4) can be reached by a non-London team. Those teams get correct instants and display; day-based results (assignments, absences, wages, reminders) are only verified for London until 9.12 is done. The picker shows a non-blocking notice (6.T.15) and every non-London zone is logged (6.T.15).
- **D10** is corrected in the table above: the switch cannot undo everything. See A.1 and Questions Q2.
- **D4 / D11 and Phase 11.3:** a rebuild of derived stores never reaches back before the flip (11.3).
- **Dev calendar-date profile (2026-10-06, Appendix B).** Of the 116 calendar-date paths: 32 at `00:00Z`, 25 London midnight, 9 assignment-day and 21 team-subscription fields with extra shapes, 9 empty, and **20 that hold a real time and are instants** (4.3). Read with the London calendar every shape gives the right day except browser midnights east of London (4.3, Q16).

If a decision ends differently, only the steps that name it change.

---

## 3. How we work

1. **Small steps.** One step = one PR or config change; each is deployable and revertible on its own.
2. **Order rules.**
   - Backend accepts a new format **before** clients send it.
   - **Readers before writers** for any new field or stored shape.
   - **Code before container** — the container time zone is removed last.
   - **Read tolerance before a new stored field.** ActiveWork, Attendance, Inspections, Materials and Resources register no `IgnoreExtraElements`, so an old build fails on a document or event with a field it does not know. A new persisted field ships in two releases: first read tolerance, then the writer; Background deploys before or with the API.
3. **\[behaviour\] steps** list every changed expectation in the PR; payroll-related ones need finance sign-off.
4. **API and Background deploy together** when they share a Core project.
5. **Every backend PR** from Phase 1 on runs the TZ-matrix job; every client PR runs lint and wire-golden tests.
6. **Rollback** = revert the PR. No step rewrites stored dates (D4). Wage-affecting rollbacks re-run recalculation for the affected weeks.

---

## 4. Target design

This section describes the finished system. The phases in section 5 build it.

### 4.1 Every `DateTime` entering service code is `Kind=Utc`

Service code may assume that **every** `DateTime` it receives is `Kind=Utc` and holds a UTC instant. This is enforced at the edges, never in business code.

**The three main entry points**

|  | Database reads (MongoDB) | Request inputs (HTTP) | Clock ("now") |
| --- | --- | --- | --- |
| **How** | Global `DateTimeSerializer(DateTimeKind.Utc)` registered by `Intowork.Common.Data` before any class map or collection is used. | `AddIntoworkTime()` registers JSON converters (`DateTime`, `DateTime?`, `DateTimeOffset`), an MVC model binder (query, route, form) and `WireDate` for manual parsing. | `IDateTimeProvider.UtcNow` — the only way to read the clock. "Today" is `calendar.DayOf(clock.UtcNow)` (a `DateOnly`), never a clock `DateTime`. |
| **Covers** | Entity fields, `DateTime?`, lists, nested objects, dictionaries, LINQ projections, aggregation results, event-store payloads (`BsonSerializer.Deserialize<T>(…)`). Raw `BsonDocument` reads use `BsonValue.ToUniversalTime()` only. `$dateToString` results are parsed with `WireDate`. | JSON bodies (nested, lists), query strings, route values, form fields, filter values (`FilterAndSortExtension`). | Every handler, service, repository, model and background job. |
| **Test** | Every repository method that returns a date, with old- and new-shape values, under the TZ matrix → `Kind == Utc`, instant unchanged. | Request tests with `Z`, offset, no offset, date-only, nested and list properties. | Provider tests; `FakeTimeProvider` in all service tests. |
| **Runtime guard** | Counter `time.nonconforming{source=mongo}` (tolerant) → exception (strict). | **`UtcKindGuardFilter`** (global action filter) checks every bound argument: counts (tolerant) → 400 (strict). | Analyzer error for every other clock API. |

**Tolerant mode in the six containers with `TZ=Europe/London`.** ActiveWork API and Background, Inspections API and Background, Materials API and Report.API read offset-less input in the **process zone (London)** today: `2026-07-01T08:00:00` is stored as `07:00Z`, and the date-only `2026-07-01` as London midnight (`2026-06-30T23:00Z`). If tolerant mode read the same input as UTC (`08:00Z`, `2026-07-01T00:00Z`), Phase 3 would shift stored values by an hour and write the D1 shape before the Phase 5 readers exist, against the rule "readers before writers" (section 3) and against section 4.7. So in these services tolerant mode reads offset-less and date-only input in the **legacy process zone**: the config value `Time:LegacyOffsetlessZone = Europe/London`, set in these six hosts only, counted as `reason=offsetless-legacy-zone`. The same option covers `Unspecified` values written through the Mongo serializer and the Service Bus options. **Strict mode (9.9) removes the option**; offset-less input is then UTC (or 400). Attendance and the other containers already run with a UTC process zone and read offset-less input as UTC today, so they are **not affected**. Because the option is a config value, removing `TZ` (9.1–9.6) does not change parsing.

**Every other way a date can come in is closed too**

| Entry point | Today | Fix | Step |
| --- | --- | --- | --- |
| Integration events (Service Bus) | `Common.Messaging/EventBusServiceBus.cs` uses `JsonSerializer` with **default** options (lines 69, 144, 385): no offset → `Unspecified`, offset → `Local` | Shared `JsonSerializerOptions` with the UTC converters for publish and receive | 1.14a |
| Redis cache | `Common.Data/AzureRedisCache.cs` uses Newtonsoft defaults (lines 26, 59). Example: ProjectService's bulk-move entry stores `DateAcquired = DateTime.Now` as local time with an offset | **Rule: every date is written to the cache as UTC (ISO with `Z`) and read back as `Kind=Utc`.** `DateTimeZoneHandling = Utc` on both write and read; cached values are built from `IDateTimeProvider.UtcNow`, never local time; the TTL uses `DateTimeOffset.UtcNow` | 1.14b, 2.e |
| Hangfire job arguments | Newtonsoft defaults in six hosts | `DateTimeZoneHandling.Utc` in every host | 3.h |
| External APIs (TimeTastic, Breathe HR, bank holidays, Google Routes) | Ad-hoc parsing | Explicit formats + `WireDate` / `DateOnly` | 3.i |
| Dates built in code | `new DateTime(y, m, d…)` and `DateOnly.ToDateTime(t)` without kind → `Unspecified` | Those overloads are banned; use the `DateTimeKind.Utc` overloads or `IBusinessCalendar` | 1.11, 4.X.2 |

**Going out:** responses, events and cache entries are written as ISO-8601 with `Z`; Mongo stores BSON Date (UTC).

### 4.2 Server building blocks (time code copied into every service)

**Where the code lives (for now): no new package.** The time code is plain source, copied into every .NET repo — the same idea as the frontend (section 4.6).

| Folder in each repo | Contents | Depends on |
| --- | --- | --- |
| `<Repo>.Core/Utilities/Time/` | `IDateTimeProvider`, `IBusinessCalendar` + implementations, `ITeamTimeContext`, `TeamTimeSettings`, `WireDate`, `IDateFormatter`, JSON converters, meter | BCL + `System.Text.Json` + `MongoDB.Bson` only |
| `<Repo>.API/Time/` (and each Background host) | `AddIntoworkTime()`, MVC binder, `UtcKindGuardFilter`, header reader for `ITeamTimeContext` | ASP.NET Core |
| repo root | `BannedSymbols.txt`, `time-kit.version` | — |

- **One master copy:** built and tested first in **AttendanceService** (it needs the most), then copied by `scripts/sync-time-kit.sh`. Fixes are made in the master and re-synced; never edit a copy.
- **Same namespace everywhere:** `Intowork.Common.Time` — so a later package swap is "delete folder, add reference", no `using` changes.
- **Drift check:** CI compares each copy's file hashes with the master's `time-kit.version` (1.12).
- **Tests travel too:** the time tests are copied into each repo's test project and run under the TZ matrix.
- **Existing packages stay packages:** `Common.Data` and `Common.Messaging` are already NuGet packages, so their changes (1.13–1.14b) ship as package versions. They must not depend on the copied code, so each holds a small **internal** copy of the UTC read rule, tested with the **same test vectors** as `WireDate`. **Their clock:** the packages read time only through an injected `System.TimeProvider` (a constructor parameter that defaults to `TimeProvider.System`), never through `DateTime.UtcNow`. `AddIntoworkTime()` registers one `TimeProvider` per host and the kit's `SystemDateTimeProvider` wraps that same instance, so service code and the packages see one clock, and tests replace both with one `FakeTimeProvider`. The legacy-zone option (4.1) is passed to the packages by the host in the same way.

```csharp
public interface IDateTimeProvider { DateTime UtcNow { get; } }

public interface IBusinessCalendar
{
    DateOnly DayOf(DateTime utcInstant);
    DateTime StartOfDayUtc(DateOnly day);
    (DateTime From, DateTime To) DayRangeUtc(DateOnly day);
    DateTime AtTimeOfDayUtc(DateOnly day, TimeOnly timeOfDay);
    DateOnly WeekCommencing(DateOnly day, DayOfWeek startDay);
    bool IsSaturday(DateOnly day);
    DateTime ToBusinessLocal(DateTime utcInstant);
    TimeZoneInfo ScheduleZone { get; }
    string MongoTimezone { get; }
}

public interface ITeamTimeContext { TeamTimeSettings Current { get; } }

public static class WireDate { DateTime ParseUtc(string s); bool TryParseUtc(string s, out DateTime utc); }

public interface IDateFormatter { string Format(DateTime utcInstant, DisplayFormat format, TeamTimeSettings team); }
```

| Type | Job |
| --- | --- |
| `IDateTimeProvider` | "now": the only clock (`Kind=Utc`, wraps `TimeProvider`). |
| `IBusinessCalendar` | Days, weeks and times of day: the only code allowed to use `TimeZoneInfo`. `ToBusinessLocal` is for display text only, `ScheduleZone` for Hangfire and schedulers only, `MongoTimezone` for `$dateToString` stages. Implementations: `ZonedBusinessCalendar(ianaId)` and `UtcBusinessCalendar`; `IBusinessCalendarProvider.ForTeam(teamName)` gives the calendar for the team's zone (4.X.4). |
| `ITeamTimeContext` | Team time settings for the current request, from Gateway headers (4.5); default `Europe/London`. |
| `WireDate` | Parsing of incoming dates. |
| `IDateFormatter` | Output for PDFs and e-mails. |
| Also copied per repo | JSON converters, MVC binder, `UtcKindGuardFilter`, non-conformance meter, `AddIntoworkTime()`, `BannedSymbols.txt` (table above). |
| `Common.Data` package | `DateTimeSerializer(Utc)` registration, `Tolerant` | `Strict` mode, `BsonDates.ToUtc` helper. |

### 4.3 Two kinds of date, one lookup rule

| Kind | Examples | Stored | To find "day D" |
| --- | --- | --- | --- |
| **Instant** — a moment in time | clock in/out, `Created`, `RaisedDate`, `SentAt`, `submittedDate` | the moment, as UTC | `calendar.DayRangeUtc(D)` = `[StartOfDayUtc(D), StartOfDayUtc(D+1))` |
| **Calendar date** — a day someone picked | assignment, absence, claim, transaction dates, secured-section information dates (order received, commencement, completion, design, RAMS), `WeekCommencing`, DOB, vehicle dates | midnight of that day in the **team's zone**, as UTC (D1): Monday 6 July for a London team is `2026-07-05T23:00Z` in summer; Monday 5 January is `2026-01-05T00:00Z`. The shape stored today, so nothing is rewritten (D4). | the same: `calendar.DayRangeUtc(D)` |

**In memory, both kinds use the team's calendar.** `calendar.DayOf(value)` gives the day in the team's zone. A clock-in at `2026-07-05T23:30Z` is Monday 6 July in London and Sunday 5 July in New York. A calendar date for Monday 6 July is `2026-07-05T23:00Z` for a London team and `2026-07-06T04:00Z` for a New York team, and `calendar.DayOf` gives 6 July for both. The calendar is always the one of the team the data belongs to (4.5). A team's zone never changes (D13), so a stored calendar date always reads back as the day that was picked. Taking the UTC date part of a calendar date (`.Date`, `$dateTrunc` without `timezone`) is a bug: in summer it gives the day before for London.

**What still tells the two kinds apart:** display (a calendar date shows a date only, with the `calendarDate` pipe), input (the control's `date` mode has no time), and the 20 fields below.

**Fields that look like calendar dates but are instants (dev profile, group 5).** These 20 paths hold a real time, so they are shown with their time (`teamDate`): `ActiveWork:ActiveWorkRecords` `OperationalGroups[].PlantHireStartDate` and `PlantHireEndDate`; `ActiveWork:StaffAssignments.CompleteDate`; `Attendance:StaffAssignments.CompletedDate`; `Materials:OrderRequests` `RequestedFor`, `DeliveryDate`, `PickDate`; `Materials:CollectionRequests` `RequestedFor`, `CollectionDate`; every `secureDate` (`Jobs:Jobs` `sections[].sectionSecuredMetadata`, `securedSections[]`, `openingBalance`; `Jobs:Sections` `sectionSecuredMetadata`, `secureDate`, `items[].unpricedItem`; `Jobs:Quotations.obtainedSections[]`; `Jobs:QuotationSections.items[].unpricedItem`); `Jobs:Jobs.contractPerformanceSettings.firstWageDate`; `Jobs:Sections.overHireData` `handoverFirstErectDate` and `handoverLastStrikeDate`.

**Old rows that are not the team's midnight (dev profile, Appendix B).** Most calendar values on dev are London midnight, the D1 shape. The others read like this with the London calendar:

| Stored | Where it comes from (all *found* on dev) | `calendar.DayOf` (London) | Correct? |
| --- | --- | --- | --- |
| `2026-07-05T23:00Z` | London summer midnight | 6 Jul | ✅ |
| `2026-07-06T00:00Z` | London winter midnight shape; HR and bank-holiday feeds | 6 Jul | ✅ |
| `2026-07-06T01:00Z` | an `01:00` row | 6 Jul | ✅ |
| `2026-07-06T22:59Z` | end of the London day, 23:59 BST | 6 Jul | ✅ |
| `2026-07-06T15:48Z` | the current time saved instead of a day | 6 Jul | ✅ |
| `2026-07-05T21:00Z` | midnight in a UTC+3 browser | 5 Jul | ❌ known (Q16) |
| `2026-07-05T22:00Z` | midnight in a UTC+2 browser | 5 Jul | ❌ known (Q16) |
| `2026-01-05T23:00Z` | midnight in a UTC+1 browser, winter (6 Jan) | 5 Jan | ❌ known (Q16) |

Only midnights saved by browsers east of London read as the day before. Today's code reads them the same way, so this is not new. From go-live the shared control writes the team's midnight whatever the browser zone (C2), so no new ones appear. Fixing the old ones once is optional (Q16).

**East and west of UTC.** Every zone works, because a calendar date is written and read with the same team zone. Monday 6 July:

| Team zone | Stored | `calendar.DayOf` (team zone) |
| --- | --- | --- |
| London (BST, +1) | `2026-07-05T23:00Z` | 6 Jul ✅ |
| Riyadh (+3) | `2026-07-05T21:00Z` | 6 Jul ✅ |
| Kolkata (+5:30) | `2026-07-05T18:30Z` | 6 Jul ✅ |
| Auckland (+12, winter) | `2026-07-05T12:00Z` | 6 Jul ✅ |
| Kiritimati (+14) | `2026-07-05T10:00Z` | 6 Jul ✅ |
| UTC | `2026-07-06T00:00Z` | 6 Jul ✅ |
| New York (−4) | `2026-07-06T04:00Z` | 6 Jul ✅ |
| Los Angeles (−7) | `2026-07-06T07:00Z` | 6 Jul ✅ |
| Honolulu (−10) | `2026-07-06T10:00Z` | 6 Jul ✅ |

There is no zone limit. The one rule: never read a calendar date with another team's zone (4.5, "Request team ≠ data team"); a cross-team view reads each row with its own team's calendar.

**Standard zone set for tests.** Every test that involves a zone uses at least: London (GMT and BST), **west** — New York, Los Angeles, Honolulu; **east** — Riyadh, Kolkata (+5:30), Auckland (+12 winter / +13 summer), Chatham (+12:45/+13:45), Kiritimati (+14); and UTC. Each test runs on both UK clock-change days and on the local clock-change days of New York and Auckland.

**Query rule (decided): the handler works out the day once and passes it down.** A handler that needs "today", or any other day, computes `day = calendar.DayOf(clock.UtcNow)` once for the team and passes the `DateOnly` to every repository call. A repository never calls `.Date`, `DateTime.UtcNow` or `DateTime.UtcNow.Date` inside a filter and needs no clock: it filters on the range the handler built with `calendar.DayRangeUtc(day)`, for instants and calendar dates alike. Every call in one request, and every screen that shows the same fact, then uses the same team day.

With `range = calendar.DayRangeUtc(day)`, filters on any date field are:

| Question | Filter |
| --- | --- |
| on day D | `Date >= range.From && Date < range.To` |
| before D | `Date < range.From` |
| D or later | `Date >= range.From` |
| after D | `Date >= range.To` |
| period `[Start, End]` covers D | `Start < range.To && End >= range.From` |

Every row of the team's day falls inside the range, whatever its time of day (end-of-day, `01:00` and real-time rows included). A partial fix is not allowed: if one handler moves to the team day, every handler and repository that answers the same question moves in the same step, otherwise two screens disagree for up to a day.

**Whose team?** The day is always worked out with the calendar of the team the data belongs to (section 4.5, "Request team ≠ data team").

### 4.4 Team time settings: zone, date format, time format

**Owned by ProjectService** (`Team` / `TeamSettings`), shared by events and forwarded by Gateway (section 4.5).

```csharp
public class TeamTimeSettings
{
    public string TimeZone   { get; set; }
    public string DateFormat { get; set; }
    public string TimeFormat { get; set; }
}
```

Stored on the team as `DisplayFormats`. `TimeZone` is an IANA id (default `Europe/London`); `DateFormat` is `dd/MM/yyyy` (default), `MM/dd/yyyy`, `yyyy-MM-dd` or `dd.MM.yyyy`; `TimeFormat` is `HH:mm` (default) or `h:mm a`.

**Defaults are London everywhere.** A new team is created with `Europe/London`, `dd/MM/yyyy`, `HH:mm` (6.T.7). Existing teams get the same values from a script (6.T.9a). Any layer that still finds no value uses the same defaults.

**Named formats** — screens, PDFs and e-mails only ask for a name; the pattern is built in one place from the team settings.

| Name | Built from | `dd/MM/yyyy` + `HH:mm` | `MM/dd/yyyy` + `h:mm a` | Replaces today's patterns |
| --- | --- | --- | --- | --- |
| `date` | DateFormat | 01/10/2026 | 10/01/2026 | `dd/MM/yyyy`, `shortDate` |
| `time` | TimeFormat | 14:30 | 2:30 PM | `HH:mm`, `shortTime` |
| `dateTime` | both | 01/10/2026 14:30 | 10/01/2026 2:30 PM | `dd/MM/yyyy HH:mm`, `dd/MM/yyyy, HH:mm`, `HH:mm dd/MM/yyyy`, `short` |
| `dateMedium` | day/month order | 01 Oct 2026 | Oct 01, 2026 | `dd MMM yyyy`, `d MMM yyyy`, `dd-MMM-yyyy`, `mediumDate` |
| `dateMediumTime` | dateMedium + time | 01 Oct 2026 14:30 | Oct 01, 2026 2:30 PM | `dd MMM yyyy, HH:mm` |
| `dayDate` | weekday + dateMedium | Thu 01 Oct 2026 | Thu Oct 01, 2026 | `EE dd MMM yyyy`, `E dd MMM` |
| `dayTime` | weekday + day/month + time | Thu 01 Oct, 14:30 | Thu Oct 01, 2:30 PM | `E dd MMM, HH:mm` |
| `monthYear` | fixed | Oct 2026 | Oct 2026 | `MMM yyyy`, `MMMM yyyy` |
| `iso` | fixed, machine | 2026-10-01 | 2026-10-01 | `yyyy-MM-dd` in file names, API, machine columns |

Typing `10/01/2026` in the control means **10 Jan** for a `dd/MM/yyyy` team and **1 Oct** for a `MM/dd/yyyy` team.

### 4.5 Event flow: ProjectService → Gateway → every request

The system is event driven. ProjectService owns the settings; Gateway keeps a read model and adds the team's settings to **every** request it forwards. No service calls ProjectService to find a team's zone.

```
Team created (London defaults) · admin edits settings · script fills old teams
        │
        ▼
ProjectService ── stores Team.DisplayFormats
        │  publishes TeamCreated / TeamUpdated { …, DisplayFormats }
        ├──────────────► Gateway.Background ──► Gateway:Teams read model (cache cleared on update)
        │                         │
        │                         ├─► every request: IntoworkAuthInjector adds team-time claims
        │                         │        └─► Ocelot ClaimsToHeaders ─► Intowork.Team* headers ─► every service
        │                         │
        │                         └─► GET /api/gateway/team/time-settings ─► the three apps
        │
        └──────────────► services with background work keep their own copy (same events)
```

**Headers Gateway adds to every downstream request**

| Header | Example | Use |
| --- | --- | --- |
| `Intowork.TeamTimeZone` | `Europe/London` | **Authoritative** — services build the team's calendar from it. |
| `Intowork.TeamUtcOffset` | `+01:00` (summer), `+00:00` (winter) | **Informational only** (logs, "now" display). Never used to convert another date: a request in October about a date in December has a different offset. |
| `Intowork.TeamDateFormat` | `dd/MM/yyyy` | PDFs/e-mails produced inside the request. |
| `Intowork.TeamTimeFormat` | `HH:mm` | same |

- Gateway **always** sets all four (Ocelot fails a route whose mapped claim is missing), using London defaults when needed.
- Clients cannot spoof them: `IntoworkHeaderStrippingMiddleware` already removes client-sent `Intowork.*` headers.
- `X-Selected-Team` switches them to the selected team.
- Services read them through `ITeamTimeContext`; a missing header means London.
- Work without a Gateway request (background jobs, PDFs, reminders, schedulers) uses the service's own team copy, defaulting to London.

**Which zone wins (precedence).** For one calculation the calendar's zone is the first one that exists in this list:

1. **The data's team** when it is known (next rule); otherwise the request's team (headers) or, in background work, the service's own team copy.
2. `BusinessCalendar:Zone` from configuration — a **fallback only**, used when there is no team at all (system jobs such as `resources:bank-holidays`, start-up work, tests).
3. `Europe/London`.

Per-service flags are not per-team. `BusinessCalendar:Mode=Utc` (11.2, ATT 14.2; only if D3 is ever changed to UTC) is also per service: when it is on, `UtcBusinessCalendar` replaces the team's calendar for business days in that service, while display (`teamDate`, PDFs, e-mails) still uses the team zone. Calendar dates are always read with the team-zone calendar, never `UtcBusinessCalendar`, because they are stored as the team's midnight (D1). The per-team Attendance switch (D10) chooses the **rules** (old or new), never the zone.

**Request team ≠ data team.** Gateway's headers describe the team the request runs as. When the code works on data that belongs to another team, the calendar comes from `calendarProvider.ForTeam(dataTeam)`, not from the headers. This applies to admin and support endpoints (the ATT 2b.4 switch endpoint and any call that acts on a named team), to calls using `X-Selected-Team` where the data row carries its own team, and to cross-team reports (group each row by its own team's day, one calendar per team). Rule: if the row or the command names a team, use that team; the headers are only the default when it does not.

### 4.6 Frontend: one control, two pipes, UTC everywhere else

**Where the code lives (for now):** copied into each app under `src/app/shared/time/` — Frontend (Angular 19, standalone), HandoverApp and InspectionsApp (Angular 16, NgModule). The framework-free core files are byte-identical; a CI check fails if they drift (1.35). A shared package can come later.

**The three frontend rules**

|  | Rule |
| --- | --- |
| **C1** | All date/time **input** goes through `<app-date-time-field>`; all **display** goes through the `teamDate` pipe (instants) or the `calendarDate` pipe (calendar dates). No `mat-datepicker`, native date/time inputs, time pickers, \` |
| **C2** | The control converts **inside itself**: it shows and accepts the team zone and format; its form value is **always UTC** (ISO string with `Z`). Components, services, stores and requests only see UTC. |
| **C3** | Calculations and comparisons in components and services use UTC. Team-day questions ("today", "same day", "this week") use the `teamCalendar` helpers — never device-local `Date` methods. Instants and calendar dates become a day with `teamDayOf` (D1). |

**The control — `<app-date-time-field>`** (a `ControlValueAccessor`)

| Input | Meaning |
| --- | --- |
| `mode` | `'dateTime'` — an instant (clock in/out, delivery time, ITW start) · `'date'` — a calendar date (assignment, absence, DOB, claim) · `'time'` — a time on the date given by `forDate` |
| `label`, `required`, `min`, `max`, `disabled` | Normal form behaviour; `min`/`max` are UTC |
| `forDate` | For `mode='time'`: the UTC date the time belongs to |
| `showZone` | `'auto'` (default) · `'always'` · `'never'` |

| Behaviour | `dateTime` / `time` | `date` |
| --- | --- | --- |
| Value written to the form | `2026-10-01T13:30:00.000Z` (team wall-clock → UTC inside the control) | `2026-09-30T23:00:00.000Z` (midnight of the picked day in the team zone, as UTC — D1; the browser's zone plays no part) |
| Display and typing | team `DateFormat` + `TimeFormat` | team `DateFormat` |
| Zone label | Shown when the device zone differs from the team zone at that date, e.g. *"Times in London time (BST, UTC+1)"* | Never — the day shown is the team's day |
| Clock-change days | Non-existent time (spring) moves forward with a hint; repeated time (autumn) uses the first one with a hint | n/a |
| Bad input | form error `dateTimeInvalid`, value `null` | same |

**The pipes — `teamDate` and `calendarDate`** use the same formatting core as the control.

- `teamDate` is for **instants**: it shows the moment in the team zone. `{{ row.clockIn | teamDate:'dateTime' }}`. Optional `:'zone'` adds the zone label when the device zone differs.
- `calendarDate` is for **calendar dates**: it takes `teamDayOf(value)` and formats that day, so a picked day shows the same on every device, east or west. `{{ absence.startDate | calendarDate:'dateMedium' }}`. Only date-only names (`date`, `dateMedium`, `dayDate`, `monthYear`, `iso`) are allowed.
- Showing a calendar date with a time format is a bug (it would show `00:00` or `23:00`); the 0.18 mapping marks every displayed field as instant or calendar date.

**Helpers (same in every app)**

| Name | Purpose |
| --- | --- |
| `TeamTimeService` | Current team zone and formats from Gateway (`GET /api/gateway/team/time-settings`); London defaults until loaded; reloads on team switch and after settings are saved; cached offline in the mobile apps. |
| `time-core.ts` | `nowUtc`, strict `parseWire` (no offset = UTC), `toWire`, `teamWallClockToUtc`, `utcToTeamWallClock`, `calendarDateToWire` (team midnight of the picked day, as UTC), `formatInZone`, `isDeviceZoneDifferent`. Built on `Intl` or `date-fns-tz` (chosen in 0.7). |
| `teamCalendar` | UTC in, UTC out: `teamDayOf` (instants and calendar dates, same vectors as the C# `calendar.DayOf`), `startOfTeamDayUtc`, `teamDayRangeUtc`, `addTeamDays`, `isSameTeamDay`, `teamWeekCommencing`. |
| `utcRange` | `rangeToWire(fromDay, toDay)` for list filters (inclusive end computed once). |
| Display helpers | Chart labels, calendar labels, `xlsx` date cells — all via `formatInZone`. |

**ESLint (all three apps):** bans the datepicker, native date/time inputs and time pickers outside `shared/time/`; bans `| date`, `DatePipe`, `formatDate`, date-fns `format`/local functions, `toLocale*`, local `Date` getters/setters, `new Date(<string>)` and literal date patterns.

### 4.7 Containers: no time zone

No container specifies a time zone. The six `ENV TZ=Europe/London` lines and their `/etc/localtime` symlink lines are **removed** — not replaced with `TZ=UTC`. Containers then run on the base image default (UTC). Images keep `tzdata` (the calendar needs the zone database). Removal is the **last** change for each service: removing it earlier would shift summer writes and filter boundaries by an hour. A startup check logs an error and raises a metric if the process zone is not UTC, and a CI gate stops `TZ` from coming back. In the six containers that still set `TZ` the check **never fails a readiness or liveness probe** between Phase 2 and their 9.1–9.6 step (0.21).

### 4.8 Recurring jobs (Hangfire): team local time, team time zone

**The rule (D9):** a recurring job is always set up as **"this local time, in this team's zone"**. The cron expression is the team's wall-clock time; `RecurringJobOptions.TimeZone` is the team's zone from `calendarProvider.ForTeam(team).ScheduleZone`. Hangfire stores the next run in UTC and moves it correctly across clock changes. Nothing depends on the container zone (which is removed, section 4.7).

**Today vs target — every scheduled thing in the code (grep 2026-10-01)**

| Service · host | Job today | Schedule · zone today | Set up where today | Target |
| --- | --- | --- | --- | --- |
| Attendance · Background | `Send morning reminders` — one job for **all** teams | `Cron.Daily(8, 0)` · London (Windows/Linux branch) | `AttendanceBackgroundJobExtensions.cs:12-28`, called from `Program.cs:40` | `attendance:reminder-morning:{team}` — 08:00 **team zone**, one per eligible team |
| Attendance · Background | `Send evening reminders` | `Cron.Daily(16, 0)` · London | same | `attendance:reminder-evening:{team}` — 16:00 team zone |
| Resources · Background | `{HrProvider}-{team}-sync` | `{m} */{N} * * *`, or `{m} 0 * * *` for 24 h (m = 0 prod / 20 staging / 40 other) · London | `HRJobStartupService` at start-up (`RemoveIfExists` + `AddOrUpdate`), `TeamCreatedHandler`, `TeamUpdatedHandler` | `resources:hr-sync:{team}` — same cron, team zone; id no longer contains the provider |
| Resources · Background | `BankHolidays-sync` | `Cron.Yearly()` · London | start-up | **Only exception:** not owned by a team (one national bank-holiday feed). Stays one job, `resources:bank-holidays`, in UTC. |
| ActiveWork · Background | no recurring job — "tomorrow's assignments" reminder is started by an **external caller** through `TriggerTomorrowAssignmentsReminder` (0.11) | outside our code | external | `activework:tomorrow-assignments:{team}` at the team-local time the caller uses today; the route stays for manual runs |
| Materials · API (runs the Hangfire server) | none — fire-and-forget only | — | — | no recurring job; argument serialisation only (3.h) |
| Fire-and-forget jobs (Attendance per-user reminder sends, ActiveWork per-item sends, Materials notifications) | `Enqueue`, not scheduled | — | — | no zone; argument serialisation (3.h); the job works out "today" itself |
| Hosted-service loops (Handover `ReminderService`, Inspections `NotificationService`, `BatonHandoverBackfillService`, event publishers, Permissions reconciliation) | `Task.Delay` interval | interval only, no wall-clock time | — | no scheduling change; clock reads only (Phase 2) |

**How jobs are set up (same in every service with Hangfire)**

|  | Rule |
| --- | --- |
| Where | Only in the **host that runs the Hangfire server** (Background hosts; Materials API). API hosts that only enqueue never register recurring jobs. |
| Who | One `RecurringJobsRegistrar` (`IHostedService`) per service, using the kit's `TeamRecurringJobs` helper (1.10c) over an injected `IRecurringJobManager`. Static `RecurringJob.*` and `RecurringJobOptions` without `TimeZone` are banned (1.11). |
| When | **At start-up:** reconcile — build the wanted list (per active, eligible team + system jobs), `AddOrUpdate` each, remove jobs with the service prefix that are no longer wanted. Under a Hangfire distributed lock, so several pods can start at once. **On `TeamCreated`:** register that team's jobs in its zone. **On `TeamUpdated`:** re-register (eligibility may change; the zone never does, D13). **Team deactivated:** remove its jobs. |
| Ids | `{service}:{purpose}:{teamName}` — stable; never include data that can change (Resources today includes the HR provider, which leaves orphans). Legacy ids are removed once by the registrar. Teams cannot be renamed (0.23), so the team name is stable. |
| Update | `AddOrUpdate` only — **no** `RemoveIfExists` first (it wipes `LastExecution`, which `GetHrSyncDetailHandler` shows to users). |
| Arguments | Team name only. The job works out "today" at **run time** with `calendar.DayOf(clock.UtcNow)` — never a date captured at registration. |
| Zone | `calendarProvider.ForTeam(team).ScheduleZone` (London when the team copy has no zone). No `FindSystemTimeZoneById`, no Windows branch, no `TimeZoneInfo.Local`. |
| Clock changes | Fixed times (08:00, 16:00, midnight) run once a day, including 2026-03-29 and 2026-10-25. A time inside the spring gap runs at the jump; in the autumn overlap it runs once. Interval crons (`0 */N`) are tested for the overlap hour (1.10c). |
| Logs | At registration: id, cron, zone, next run in UTC **and** team local time. |
| Double sends | Reminder sends are idempotent per (team, user, business day, kind), so a rollout or re-registration cannot send twice. |

**Attendance needs the team zone.** Today Attendance's `Team` copy (`Core/Data/Models/Team.cs`) has no zone, and its `TeamCreated` / `TeamUpdated` events don't carry one. They get `DisplayFormats` (zone, date format, time format) in 6.T.4 — Attendance's handlers map it to `Team.TimeSettings`, missing → London. `ITeamsRepo` gets `GetAllActiveAsync` for the registrar. The same is true for Resources and ActiveWork, which also schedule per team.

**Safe rollout:** every team is London by default (D13), so per-team jobs run at exactly today's times. A team created with another zone gets its jobs in that zone from the start. A team's zone never changes (D13), so jobs never move between zones (9.12 lists what is verified).

### 4.9 The one exemption: `Core/Legacy/`

The frozen legacy calculators (`WageCalculatorExtension`, `ClockInOutTimeCalculator`, `WageWeekDateCalculator`; ATT 1.11) must keep their old behaviour exactly, so they still contain `Europe/London`, `TimeZoneInfo` and `DateTime.Today`. **`Core/Legacy/` is exempt from every gate and analyzer**, and this is the only exemption:

| Gate | Exemption |
| --- | --- |
| R2 grep gate (zone names outside the calendar), 4.X.3, Phase 4 "Done when" | `Core/Legacy/**` excluded by path |
| R3 clock gate, `BannedApiAnalyzers` (1.11), ATT 3.9, ATT 3.10 | excluded through an `.editorconfig` section for `**/Core/Legacy/**` (severity none) |
| `TZ` gate, container gates (1.18, 9.7) | not affected (no container sets `TZ` there) |
| `.Date` ban in Attendance (ATT 12.3) | `Core/Legacy/` excluded |

"Frozen" means no edit after the copy is taken, with one possible exception decided by ATT 0.7 (the `DateTime.Today` question). The folder is deleted only when finance closes the old weeks (ATT 13.6).

---

## 5. Phases

Each phase below has the same layout: **Goal · Before you start · Steps · Done when.**

---

### Phase 0 — Decisions and discovery

**Goal:** close every open question before code changes. No product code.

**Steps**

*Decisions*

- [ ] **0.1** Record D1 (changed 2026-10-07: calendar date = midnight in the team's zone, stored as UTC) and its details.

- [ ] **0.2** Confirm D2 details: allowed team zones (IANA list; zones east and west of UTC, offsets −11 to +14; no −12 zone), default `Europe/London`, zone-label wording, who may pick the zone when creating a team (it cannot be changed later, D13), server calendar follows the team zone.

- [ ] **0.3** Record D3 (decided 2026-10-06: team-zone calendar; optional UTC switch later) and decide who signs off payroll shadow reports.

- [ ] **0.4** Decide D5: compatibility window length; forced-update mechanism for HandoverApp and InspectionsApp.

- [ ] **0.5** Record D6 (decided 2026-10-06: keep BSON Date, read as `Kind=Utc`).

- [ ] **0.16** Payroll sign-off on Attendance behaviour changes **B1–B16** (Appendix A.1), including night-shift matching (B14), report days (B15) and night-shift pay (B16).

- [ ] **0.17** Record D7 (decided 2026-10-06) and set its details: allowed date/time formats, defaults, who may change them, whether Excel date columns use the team format or ISO.

*Spikes*

- [ ] **0.6** Mongo `DateTimeSerializer(Utc)` on `DateTime?`, lists, nested and `BsonDocument` paths (driver 3.5.1). → test code reused in 1.13.

- [ ] **0.7** `<app-date-time-field>` prototype in Angular 16 and 19: datepicker + time input, team zone ↔ UTC, both date orders, clock-change days, zone label; choose `Intl` or `date-fns-tz` (date-fns 2 compatible).

- [ ] **0.8** JSON converter vs MVC binder precedence for query, route and body.

*Discovery*

- [ ] **0.9** Read Report.API in depth (`ReportingCalendar`, `LabourSummaryService`, `CPLabourDailyRepository`, `WagesPipeline`); list every day bucketing and lookup.

- [ ] **0.10** Confirm `Prototype` and `signalR-across-sharedworkers` are not deployed and write no dates. `oskfel-migrations` is not a deployed service, but it **is used**: it hosts the production script 6.T.9a (run by hand, reviewed, staging first). Confirm who may run it in production.

- [ ] **0.11** Find the external caller of ActiveWork `TriggerTomorrowAssignmentsReminder`.

- [ ] **0.12** Consumer audit: for every calendar-date field, who writes it, who reads it, exact match or range. Exact-match readers become Phase 5 steps. Also list every **write, upsert and unique index** keyed on a calendar-date field (for example `WeekCommencing`), so each filter uses the team-day range (5.12). The dev profile is done (Appendix B): most calendar fields hold London midnight, the D1 shape; 20 fields are really instants (4.3); browser-midnight rows are listed for Q16. A production run is optional and only sizes Q16 (Appendix B.9).

- [ ] **0.13** List Hangfire recurring jobs in each environment (Attendance, Resources, ActiveWork, Materials storage) and compare with the table in section 4.8. Every id found gets a target row or is marked for removal.

- [ ] **0.20** Attendance reminders: today the job only sends for team `framework` (hard-coded filter in `ReminderService`). Decide where eligibility lives (team setting or config list, default `framework` only) so per-team jobs keep today's behaviour.

- [ ] **0.14** Check that deserialising events does not call constructors that stamp `DateTime.UtcNow` (Attendance, Handover, Inspections, ActiveWork).

- [ ] **0.15** Check the repo-root `CLAUDE.md` / outbox rules referenced by `ActiveWorkService/CLAUDE.md`.

- [ ] **0.18** Format inventory script: every display pattern in the three apps mapped to a named format (section 4.4); unmatched patterns get a decision. Each displayed field is marked **instant** (`teamDate`) or **calendar date** (`calendarDate`). Becomes the checklist for the 6.F module steps.

- [ ] **0.19** UX check: typed `MM/dd/yyyy` input and 12-hour time on the key screens (clock override, ITW create, deliveries, absences).

- [ ] **0.21** Startup check (1.10): confirm the "process zone is not UTC" warning cannot fail a readiness or liveness probe in the six `TZ=Europe/London` containers (ActiveWork API/Background, Inspections API/Background, Materials API, Report.API) between Phase 2 and their 9.1–9.6 step.

- [ ] **0.22** Gateway headers "on every route" (6.T.11) against Ocelot failing a route whose mapped claim is missing: list the anonymous routes (no token, so no claims) and decide for each one whether it gets London defaults or no headers.

- [x] **0.23** Job ids contain the team name (section 4.8): **teams cannot be renamed** — `Team.TeamName` is the Mongo `_id` in ProjectService and `TeamsRepo.EditTeamAsync` does not set it (the `.Set(x => x.TeamName, …)` line is commented out); only `TeamDisplayName` changes. Team-name job ids are stable (checked 2026-10-06).

- [ ] **0.24** `Europe/Dublin` has negative DST in current tzdata, so `IsDaylightSavingTime` can be inverted compared with London. Check `WagesPipeline` (and `WageCalculationStageBuilder`) for DST-flag logic before 4.F.5.

**Done when:** every decision has a written answer; spike notes and discovery lists are appended to this plan.

---

### Phase 1 — Foundations

**Goal:** build every shared piece once — the server time code (master copy in Attendance), CI gates and the frontend control — before any repo uses them. **Before you start:** 0.1–0.8 and **0.17** (D7: 1.9 and 1.20 build the named formats). D1, D3, D6 and D7 are decided; D5 is decided in principle (section 2).

**Steps — server time code (master copy in AttendanceService, section 4.2)**

- [ ] **1.1** Create `Attendance.Core/Utilities/Time/` and `Attendance.API/Time/` (namespace `Intowork.Common.Time`) + `Time` test folder. No new package or pipeline.

- [ ] **1.2** `IDateTimeProvider` + `SystemDateTimeProvider`; `FakeTimeProvider` guidance for tests.

- [ ] **1.3** `WireDate`: `Z` as is · offset → UTC · invariant culture. **No offset (`2026-07-01T08:00:00`) or date-only (`2026-07-01`):** read as UTC (date-only = UTC midnight) and counted, by default. When `Time:LegacyOffsetlessZone` is set (the six `TZ=Europe/London` services in tolerant mode, section 4.1) the input is read in that zone and counted as `offsetless-legacy-zone`. Strict mode (9.9) ignores the option. *Tests: with the option `Europe/London`, `2026-07-01T08:00:00` → `07:00Z` and `2026-07-01` → `2026-06-30T23:00Z`; without it `08:00Z` and `2026-07-01T00:00Z`; identical under all four TZ-matrix process zones.*

- [ ] **1.4** Meter `time.nonconforming{source,reason}`.

- [ ] **1.5** JSON converters for `DateTime` / `DateTime?` / `DateTimeOffset` (read via `WireDate`, so the legacy-zone option of 1.3 applies; write ISO with `Z` and ms).

- [ ] **1.6** MVC model binder for query/route/form dates (same `WireDate` rule and option).

- [ ] **1.7** `IBusinessCalendar`, `ZonedBusinessCalendar` (spring gap → forward, autumn overlap → standard time, `Unspecified` counted), `UtcBusinessCalendar`. *Tests: the standard zone set (4.3), east and west: 2026-03-29, 2026-10-25 and the New York and Auckland clock-change days; 23:30Z summer/winter; `DayOf`, `StartOfDayUtc`, `AtTimeOfDayUtc` and `WeekCommencing` for a day in Auckland (starts the day before in UTC) and in Los Angeles (starts the same day in UTC).*

- [ ] **1.8** `DayRangeUtc` in `ZonedBusinessCalendar` and the calendar-date tests. *Tests: for every zone of the standard set (4.3), Monday 6 July stored with `calendar.StartOfDayUtc` reads back as 6 July with `calendar.DayOf`; the property `calendar.DayOf(x) == D` ⇔ `x ∈ calendar.DayRangeUtc(D)` for random `x`; the old-row table of 4.3 reads as shown (browser midnights east of London as the day before); a non-UTC kind throws. The vectors go into the shared vector file (1.20).*

- [ ] **1.9** `TeamTimeSettings`, `DisplayFormat` names, `IDateFormatter` (team zone + formats, London defaults). *Tests: every name × every allowed format.*

- [ ] **1.10** `AddIntoworkTime(config)`: provider (one `TimeProvider` per host, section 4.2), calendar, converters, binder, formatter, plus startup checks — the zone resolves (`tzdata` present) and the process zone is UTC; otherwise an error log and a metric. The check **never fails a readiness or liveness probe** in the six `TZ=Europe/London` containers until their 9.1–9.6 step (0.21).

- [ ] **1.10b** `UtcKindGuardFilter`: global action filter; checks bound arguments (nested, lists, nullable; cached per type); counts non-UTC (tolerant) / returns 400 (strict).

- [ ] **1.10c** Kit `Time/Hangfire/` (copied only into repos that use Hangfire: Attendance, Resources, ActiveWork, Materials): `TeamRecurringJobs` (`AddOrUpdateForTeam(id, job, localCron, teamCalendar)`, `RemoveForTeam`), `RecurringJobsReconciler` (wanted list vs stored jobs by prefix, distributed lock, removes orphans and legacy ids), registration log. *Tests (Cronos next-occurrence): 08:00 and 16:00 London on 2026-03-29 and 2026-10-25 → one run each, `07:00Z`/`15:00Z` in summer, `08:00Z`/`16:00Z` in winter; a 01:30 job in the gap and the overlap; `0 */2 * * *` across the overlap; a non-London zone; next run unchanged under all TZ-matrix process zones.*

- [ ] **1.11** Analyzer: Microsoft `BannedApiAnalyzers` NuGet + a `BannedSymbols.txt` (copied per repo) — static `Hangfire.RecurringJob` members; clock reads; `DateTime` constructors without kind; `DateOnly.ToDateTime(TimeOnly)` without kind; `Parse`/`TryParse` without styles; `ToLocalTime`; `TimeZoneInfo.ConvertTime*` / `FindSystemTimeZoneById` outside the calendar; `BsonValue.ToLocalTime`. Severity per repo. `Core/Legacy/**` is excluded (section 4.9).

- [ ] **1.12** Copy kit: `scripts/sync-time-kit.sh` (copies the two folders, tests and `BannedSymbols.txt` into a target repo) + `time-kit.version` hash file + CI drift check. Tag the master as kit **1.0**.

**Steps — existing CommonLibs packages** (they stay packages)

- [ ] **1.13** `Common.Data`: global `DateTimeSerializer(Utc)` (registered before any class map), tolerant/strict mode, counters, `BsonDates.ToUtc` helper. **Write path:** the stock serializer treats an `Unspecified` value as process-local time, so its meaning would change when `TZ` is removed (9.1–9.6). The registered serializer therefore converts `Unspecified` itself: in the legacy zone when `Time:LegacyOffsetlessZone` is set (4.1), otherwise as UTC, and counts it. Cost measured with driver 3.5.1 (1M documents, 8 dates each): about 35 ns per date on write and 60 ns on read, no measurable difference from the stock serializer. *Tests: plain, nullable, list, nested, dictionary, projection, aggregation, `BsonSerializer.Deserialize<T>` — all `Kind=Utc` under the TZ matrix.*

- [ ] **1.14** `Common.Data`: shared `FilterAndSortExtension` parses dates with its internal UTC read rule (same vectors as `WireDate`).

- [ ] **1.14a** `Common.Messaging`: one `JsonSerializerOptions` with its own internal UTC converters (same vectors as 1.5) for publish (`EventBusServiceBus.cs:69, 144`) and receive (`:385`); old offset-less messages read as UTC and counted, or in the legacy zone when the host sets `Time:LegacyOffsetlessZone` (4.1). *Round-trip test under the TZ matrix.*

- [ ] **1.14b** `Common.Data/AzureRedisCache.cs`: **saved as UTC, read as UTC.** One shared `JsonSerializerSettings` with `DateTimeZoneHandling = Utc` is used by `SetCacheData` and `GetCachedData`; a `DateTime` with another kind is converted to UTC on write; the TTL stays `DateTimeOffset.UtcNow` based. *Tests under the TZ matrix: round trip for `DateTime`, `DateTime?`, lists and nested objects → same instant, `Kind=Utc`, written text ends with `Z`; an **old entry** written with an offset (`2026-10-06T14:00:00+01:00`) reads back as the same instant with `Kind=Utc`; a `Local` value is stored as `Z`; an old entry **without** offset (an `Unspecified` value written by a `TZ=Europe/London` host) is read in the legacy zone when the host sets it, otherwise as UTC, and counted. Old entries disappear within their TTL.*

- [ ] **1.15** Publish `Common.Data` and `Common.Messaging`.

**Steps — CI**

- [ ] **1.16** Pipeline template `tz-matrix.yml`: `dotnet test` under UTC, London, Los Angeles, Auckland (Linux, `tzdata`).

- [ ] **1.17** Add it to all 16 repos (non-blocking); record baseline failures.

- [ ] **1.18** Grep gate (non-blocking): any `TZ` in Dockerfile/compose/Helm/pipelines (`ENV TZ`, `TZ=`, `name: TZ`, `/usr/share/zoneinfo`, `/etc/localtime`, `/etc/timezone`), zone names, banned symbols (`Core/Legacy/**` excluded, section 4.9).

**Steps — frontend shared code and control** (built in Frontend, then copied — section 4.6)

- [ ] **1.19** `time-core.ts`. *Tests under the standard zone set (4.3) and its clock-change days (half-hour and 45-minute zones included).*

- [ ] **1.20** Named formats + `formatInZone`, using the **same test vectors** as the C# formatter (1.9) and the same typed-input vectors as 1.24 (`10/01/2026` → `2026-01-10T00:00:00.000Z` for `dd/MM/yyyy`, `2026-10-01T00:00:00.000Z` for `MM/dd/yyyy`). The vector file is shared by C# and TypeScript.

- [ ] **1.21** `teamCalendar` and `utcRange`. *Tests: day boundaries, week commencing, summer/winter/DST days, all in the standard zone set (4.3); a calendar date written by `calendarDateToWire` reads back as the same day with `teamDayOf` in every zone; `teamDayOf` uses the same vectors as 1.8.*

- [ ] **1.22** `TeamTimeService`.

- [ ] **1.23** `teamDate` pipe (instants) and `calendarDate` pipe (calendar dates, team day, date only); both re-render when team zone or format changes. *Test: Monday 6 July stored as the team's midnight (`2026-07-05T23:00Z` London, `2026-07-06T04:00Z` New York, `2026-07-05T12:00Z` Auckland) shows 6 Jul with `calendarDate` for its own team on devices in Los Angeles and Auckland.*

- [ ] **1.24** Control `mode='date'`. *Typing `10/01/2026` → `2026-01-10T00:00:00.000Z` (`dd/MM/yyyy`) or `2026-10-01T00:00:00.000Z` (`MM/dd/yyyy`), same under every device zone of the standard zone set (4.3).*

- [ ] **1.25** Control `mode='dateTime'`. *01/07/2026 08:00 London → `07:00Z`; 01/01/2026 08:00 → `08:00Z`; same under all device zones.*

- [ ] **1.26** Control `mode='time'` with `forDate`.

- [ ] **1.27** Zone label (accessible). *Device Riyadh + team London → "London time (BST, UTC+1)" in summer, "(GMT, UTC+0)" in winter; device London → no label.*

- [ ] **1.28** Clock-change handling with hints. *2026-03-29 01:30 and 2026-10-25 01:30.*

- [ ] **1.29** Validation, keyboard and screen-reader checks.

- [ ] **1.30** Query-string rule: dates in `HttpParams` and URLs are built only from `toWire` output (UTC ISO with `Z`); the wire-golden harness (1.33) checks query strings as well as bodies.

- [ ] **1.31** Chart, calendar and `xlsx` helpers.

- [ ] **1.32** ESLint rules (warn).

- [ ] **1.33** Wire-golden test harness (device zones = the standard zone set, 4.3).

- [ ] **1.34** Copy `shared/time/` into HandoverApp and InspectionsApp (Angular 16 wrappers).

- [ ] **1.35** CI drift check across the three copies.

- [ ] **1.36** `x-client-build` header in all three apps.

- [ ] **1.37** Log `x-client-build` with the non-conformance counters (Gateway/backends).

**Done when:** time kit 1.0 tagged in Attendance with the sync script and drift check; `Common.Data` / `Common.Messaging` published; TZ-matrix and grep gates run in every repo; the control, both pipes and the helpers pass their tests in all three apps.

---

### Phase 1b — Team settings readers (6.T.1–6.T.5)

**Goal:** every service that needs a team's zone can read it — from the headers on requests and from its own team copy in background work — **before** any step uses it. Nothing writes the new fields yet and every layer answers the London defaults, so behaviour does not change. This moves the "readers first" steps of 6.T out of Phase 6 because 4.S, 4.X.4 and ATT 10 need them. **Before you start:** 0.2, 0.17, 1.9, 1.12 (kit 1.0). 6.T.5 for a service also needs its 2.a (`AddIntoworkTime()`). **Runs:** in parallel with Phases 2 and 3; finished for a service before its 4.S and 4.X.4. Step IDs keep their 6.T numbers.

**Steps**

- [ ] **6.T.1** Time kit (master in Attendance): `TeamTimeSettings` with London defaults; `ITeamTimeContext` reads the four `Intowork.Team*` headers (missing → London). Re-sync to every repo.

- [ ] **6.T.2** Gateway read model: `TimeZone`, `DateFormat`, `TimeFormat` on `Gateway.Core/Data/Models/Team.cs` (missing → London); `TeamsRepo.AddOrUpdateAsync` sets them (cache already cleared there).

- [ ] **6.T.3** Gateway events: optional `DisplayFormats` on its `TeamCreated` / `TeamUpdated`; both handlers map them (missing → London).

- [ ] **6.T.4** Services with a team copy (ActiveWork, Attendance, Handover, Inspections, Materials, Resources; Permissions for `TeamCreated`): optional `DisplayFormats` on their event classes and team models (missing → London). One PR each; released before 6.T.7.

- [ ] **6.T.4a** **Attendance team zone:** `TeamTimeSettings TimeSettings` on `Attendance.Core/Data/Models/Team.cs`; `DisplayFormats` on `Background/Events/IntegrationEvents/TeamCreated.cs` and `TeamUpdated.cs`; `TeamCreatedHandler` and `TeamUpdatedHandler` map it (missing → London); `ITeamsRepo.GetAllActiveAsync`. *Tests: event without the field → London; with it → stored; old team documents read as London.*

- [ ] **6.T.4b** Team handlers in Attendance, Resources and ActiveWork call the registrar for that team after saving (deactivated → jobs removed; the zone never changes, D13). Done in 4.S.

- [ ] **6.T.5** Every service API registers `ITeamTimeContext` (no change yet — London = today).

**Done when:** every service with a team copy reads `TimeSettings` (missing → London); every API registers `ITeamTimeContext`; Attendance's team copy holds a zone (6.T.4a); per service, a team document without `TimeSettings` and a request without the headers both resolve to London, `dd/MM/yyyy`, `HH:mm`.

---

### Phase 2 — Clock reads (R3)

**Goal:** every "now" comes from `IDateTimeProvider`. No behaviour change. **Before you start:** 1.12, and 1.17 for the repo.

**Repo order (fewest clock reads first; the number is the count of clock reads):** Forecasting (1) · Notification (2) · CommonLibs (7) · SafetySuite (10) · Customer (10) · Permissions (11) · Gateway (12) · Gaffer (25) · Inspections (25) · ActiveWork (29) · Resources (36) · Attendance (40) · FrameworkCache (47) · Handover (61) · Project (65) · Materials (74).

**Recipe — the same small PRs in every repo**

|  | Step |
| --- | --- |
| **2.a** | Copy the time kit in (`sync-time-kit.sh`), add the drift check, call `AddIntoworkTime()`, analyzer at **warning**. **CommonLibs is the exception:** it must not depend on the kit (4.2), so it gets only the clock-symbol part of `BannedSymbols.txt` and its types take an injected `System.TimeProvider` (default `TimeProvider.System`); `AddIntoworkTime()` in each host registers the `TimeProvider` they receive. |
| **2.b** | Handlers, services, repositories: inject `IDateTimeProvider`; tests use `FakeTimeProvider`. |
| **2.c** | Models/aggregates: no clock in `Apply`/`On*`/constructors — the handler stamps the time. |
| **2.d** | Static helpers take `DateTime nowUtc`. |
| **2.e** | Remove `= DateTime.UtcNow` property initialisers; set in the creating handler. Values put into the cache are built from `IDateTimeProvider.UtcNow`, never `DateTime.Now` (ProjectService bulk-move `DateAcquired`). |
| **2.f** | Remove `DateTime.Now` from log text (the logger stamps time). |
| **2.g** | Clock warnings = 0 → analyzer **error** for clock symbols. |

A sub-step with nothing to do in a repo is closed with a one-line note.

**Repo notes**

- **Inspections:** `HsInspection.cs:127`, `Inspection.cs:174` → handled in 3.g (needs an event field).
- **Handover:** `HandoverClaimTransaction.cs:44` → same pattern if 0.14 shows it runs on replay.
- **Attendance:** Appendix A, ATT Phase 3.
- **Materials:** vehicle "today" only gets the provider here; its zone logic moves in Phase 4.
- **FrameworkCache:** after 0.9.
- **CommonLibs:** `Common.Data` and `Common.Messaging` use an injected `TimeProvider`, not `IDateTimeProvider` (4.2). Tests use `FakeTimeProvider`. R3 is met for the packages by the analyzer on the clock symbols plus this injection.

**Done when:** banned clock symbols = 0 in every repo; suites green; TZ-matrix no worse than baseline.

---

### Phase 3 — `Kind=Utc` at every entry point

**Goal:** the guarantee in section 4.1 holds in every service (tolerant mode: bad input is counted, not rejected). **Before you start:** 1.15 for the repo.

**Repo order:** same as Phase 2.

**Recipe — per repo, one PR each**

|  | Step |
| --- | --- |
| **3.a** | Register JSON converters and binder (tolerant) via `AddIntoworkTime()`; request tests (`Z`, offset, none, date-only). **In the six `TZ=Europe/London` services** (ActiveWork API/Background, Inspections API/Background, Materials API, Report.API) set `Time:LegacyOffsetlessZone=Europe/London`, so offset-less and date-only input keeps today's meaning (section 4.1). *Test: `2026-07-01T08:00:00` is still stored as `07:00Z` and `2026-07-01` as `2026-06-30T23:00Z`, with the container zone London and with `TZ` removed.* Attendance and the other UTC containers need no option. |
| **3.b** | Replace controller `DateTime.Parse/TryParse` with `WireDate` (section 8.1); in the six services the same option applies, so the parsed instant does not change. |
| **3.c** | Replace the local `FilterAndSortExtension` copy with the `Common.Data` one, or apply the same fix (Attendance, Customer, FrameworkCache, Materials, Project, Resources ×2). |
| **3.d** | Bump `Common.Data`; register the Mongo serializer (tolerant); read test with old-shape values (e.g. `2026-09-30T23:00Z`) under the TZ matrix. In the six services `Unspecified` values written through the serializer are read in the legacy zone (4.1), so writes keep today's instants. |
| **3.e** | Fix read paths that can produce non-UTC values (table below). |
| **3.f** | Audit `SpecifyKind`: keep only where the source is known UTC. |
| **3.g** | Event-sourced services: stamp `RaisedDate` (and similar) in the handler into the event; `Apply` falls back to `EventId.CreationTime` for old events; release in two steps (readers first). |
| **3.h** | Hangfire hosts: `DateTimeZoneHandling.Utc`; test a job with a `DateTime` argument. |
| **3.i** | External APIs (Resources: TimeTastic, Breathe HR, bank holidays; Project: Google Routes): explicit formats; tests with recorded responses. |
| **3.j** | Bump `Common.Messaging` (1.14a) and `Common.Data` (1.14b) — every service that caches a date must then show cache write = UTC and cache read = UTC in its tests (ProjectService: team settings, bulk-move registry `DateAcquired`, route estimates); enable `UtcKindGuardFilter` (tolerant); add the "every repository date read" test. |

**Read paths for 3.e**

| Repo | Site | Fix |
| --- | --- | --- |
| ActiveWork | `ActiveWorkRepo.cs:229, 244` — `ToUniversalTime()` on `Unspecified` | Use the value as UTC (serializer guarantees it) |
| FrameworkCache | `LabourSummaryService.cs:92, 122` — `ToUniversalTime()` | Same |
| FrameworkCache | `LabourSummaryService.cs:175` — `TryParse` on legacy strings | `WireDate.TryParseUtc` |
| FrameworkCache | `OrderRequestResponse.cs:45-51`, `CollectionRequestResponse.cs:43-49` — `ConvertTimeFromUtc` on read | Keep UTC; display via `IDateFormatter` (Phase 4) |
| Inspections | `InspectionsReportRepo.cs` (2) — filter parsing | `WireDate` |
| Attendance | ATT 4.2–4.9 | see Appendix A |

**Done when:** database reads, request inputs, events, cache, Hangfire and external APIs all produce `Kind=Utc` in every service (tests green under the TZ matrix); counters show which clients still send non-UTC; **in the six `TZ=Europe/London` services no stored instant changed** (3.a test). Phase 3 writes no D1-shape value.

---

### Phase 4 — Zone logic into `IBusinessCalendar` (R2)

**Goal:** every day/week/time-of-day decision uses the calendar; hard-coded zones are deleted. Results stay the same with the London calendar, except the **\[behaviour: day fix\]** steps (4.M.4, 4.R.5, 4.H.4, 4.A.6, 4.F.8, 4.F.9), which keep the rule and only stop using the UTC day, and 4.F.7. **Before you start:** Phase 2 done in the repo; Phase 1b done for the repo; TZ-matrix baseline; **4.X.4 first in the service** (every step that uses `calendarProvider.ForTeam` needs it).

**Pattern for every service:** ① pin today's results with tests → ② refactor to the calendar (same results) → ③ delete the zone code → ④ run the suite with and without `TZ=Europe/London`.

**Order:** Materials → Resources → Handover → Inspections → ActiveWork → Attendance → FrameworkCache (payroll last).

**MaterialsService**

- [ ] **4.M.1** Pin tests for the vehicle "today" filter and the sold filter (`GetVehiclesForTeamHandler`, `GetVehiclesForTeamByCategoryHandler`, `GetPaginatedVehiclesForTeamHandler`). Vectors: London BST at 00:30 on D+1, New York, Auckland, each against an old-shape and a new-shape row.

- [ ] **4.M.2** `nowInLondon` → `calendar.DayOf(clock.UtcNow)` in the two handlers above; unavailable dates via `calendar.DayRangeUtc`; delete zone fields and commented code.

- [ ] **4.M.3** `GetPaginatedVehiclesForTeamHandler` computes `day = calendar.DayOf(clock.UtcNow)` once and passes it to `GetUnavailableVehicleIdsForDateAsync`, `GetPaginatedForTeamAsync` and `GetUnavailabilityBasicInfoForVehiclesAsync` (query rule, section 4.3). The three signatures take a `DateOnly`. Ships in the same release as 4.M.2.

- [ ] **4.M.4** **\[behaviour: day fix\]** `VehicleUnAvailabilityRepo` (`GetUnavailableVehicleIdsForDateAsync` and the `today` filter in `GetUnavailabilityBasicInfoForVehiclesAsync`) and `VehiclesRepo.ApplySoldDateFilter`: replace `.Date` and `UtcNow.Date` with `calendar.DayRangeUtc` filters. Sold means `SoldDate < range.From`, so a vehicle is sold from the day after its sold date. *Tests: both row shapes at every vector of 4.M.1.*

**ResourcesService**

- [ ] **4.R.1** Pin tests for `ResourcesController` range conversion (446, 468, 484).

- [ ] **4.R.2** Replace `ConvertTimeToUtc(…, londonTimeZone)` with calendar day boundaries; delete the zone field.

- [ ] **4.R.3** `HRJobScheduler`: see 4.S.6–4.S.8.

- [ ] **4.R.4** `HrService`, `TimeTasticAbsenceProviderService`, `BankHolidaysProviderService`: explicit parsing; absences stored as the team's midnight (`calendar.StartOfDayUtc(day)`, D1). For London the feeds' `D 00:00Z` values already read as the right day (4.3) and are not rewritten (D4).

- [ ] **4.R.5** **\[behaviour: day fix\]** **Future absences by the team's day** (query rule, section 4.3). `StaffMemberRepo.GetAllStaffMemberFutureBankHolidaysAbsenceForTeam` (:220), `DeleteFutureAbsenceForStaffMemberAsync` (:248) and `GetFutureAbsenceForStaffMemberAsync` (:254) compare a calendar date with the clock (`a.StartDate >= DateTime.UtcNow`). HR-synced and bank-holiday absences are already stored as UTC midnight, so **today** a London absence stops being "future" at 01:00 BST instead of 00:00; for other zones the error is hours (New York the evening before, Auckland until midday). Rule kept: an absence that starts on the team's today is **not** future. Fix: the three methods take `DateOnly today` and filter `a.StartDate >= calendar.DayRangeUtc(today).To`; they read no clock. `ArchiveStaffMemberHandler` and `HrService` (sync, background path) compute `today = calendarProvider.ForTeam(teamName).DayOf(clock.UtcNow)` once and pass it to both calls. *Pin tests first, then the same tests green after: absence starting Tue 7 Jul 2026 — London archived Mon 23:30 BST (future) and Tue 00:30 BST (not future), each with an old London-midnight row (`Mon 23:00Z`) and a UTC-midnight row (`Tue 00:00Z`); New York archived Mon 21:00 EDT (future); Auckland archived Tue 09:00 NZST (not future); the same in winter. One release for the three methods and both callers (no partial fix, 4.3). Ships with 5.4, before Phase 7.*

**HandoverService**

- [ ] **4.H.1** Pin tests for `HandoverNotification` next-date logic on clock-change days.

- [ ] **4.H.2** Use `calendar.AtTimeOfDayUtc`; delete zone fields.

- [ ] **4.H.3** PDF `ReportGeneratorService`: `IDateFormatter`; PDF text snapshot tests.

- [ ] **4.H.4** **\[behaviour: day fix\]** **Cancel window by the team's business days.** `CancelHandoverHandler` (:53) blocks a cancel when `ReviewDate.AddBusinessDays(2) < DateTime.UtcNow.Date`; `DateTimeExtensions.AddBusinessDays` skips Saturday/Sunday of the **UTC** date. Rule kept: an approved handover can be cancelled until the end of the day that is 2 business days (Saturday and Sunday skipped) after the review day. Fix: `reviewDay = calendar.DayOf(ReviewDate)`, `lastDay` = `reviewDay` + 2 business days (same Saturday/Sunday list, on `DateOnly`), blocked when `calendar.DayOf(clock.UtcNow) > lastDay`. *Pin tests: London winter review Mon 10:00 → allowed Wed, blocked Thu; review Fri → allowed Tue, blocked Wed; London summer review Fri 23:30 BST (`Fri 22:30Z`); New York review Fri 21:00 EDT (`Sat 01:00Z`, Friday in New York); Auckland review Mon 08:00 NZST (`Sun 20:00Z`, Monday in Auckland).*

**InspectionsService**

- [ ] **4.I.1** PDF `ReportGeneratorService` (176, 204): `IDateFormatter`; delete zone fields; snapshot tests.

**ActiveWorkService**

- [ ] **4.A.1** Pin tests for `ActiveWorkDateUtilities` across clock changes.

- [ ] **4.A.2** Calendar-based `ActiveWorkDateUtilities`; update `GetLinkedActiveWorkRecordsByActiveWorkHandler`, `MoveActiveWorkHandler`.

- [ ] **4.A.3** `ActiveWorkNotificationService`: `calendar.DayOf(clock.UtcNow)` for "today" and `calendar.DayOf` for the assignment day (a calendar date, D1); text via `IDateFormatter`.

- [ ] **4.A.4** `TomorrowStaffAssignmentReminderService`: tomorrow = `DayOf(now) + 1`; `calendar.DayRangeUtc(tomorrow)`.

- [ ] **4.A.5** Delete `TimeZoneProvider`.

- [ ] **4.A.6** **\[behaviour: day fix\]** **Active-work list by the team's day** (query rule, section 4.3). `ActiveWorkRepo.GetAllPaginatedAsync` (:351) filters `x.StartDate > utcNow || x.StaffDayAssignments.Any(s => s.Date > utcNow)` on calendar dates. Rule kept (team decision 2026-10-06): **a work record is listed while it has a day after the team's today**; work whose last day is today is not listed. Fix: `GetAllActiveWorkRecordsPaginatedHandler` computes `today = calendarProvider.ForTeam(teamName).DayOf(clock.UtcNow)` and passes it; the repository uses `var after = calendar.DayRangeUtc(today).To` and filters `x.StartDate >= after || x.StaffDayAssignments.Any(s => s.Date >= after)`; no clock in the repository. *Pin tests first: last day Tue 7 Jul 2026 — London opened Mon 23:30 BST (listed) and Tue 00:30 BST (not listed), with a London-midnight row and an end-of-day (`22:59Z`) row; New York opened Mon 21:00 EDT (listed); Auckland opened Tue 09:00 NZST (not listed); the same in winter.* Ships with 5.3.

**AttendanceService** — Appendix A: ATT Phases 5, 6, 7, 10, 11.

**FrameworkCache / Report.API** (after 0.9)

- [ ] **4.F.1** Pin tests for `ReportingCalendar`, `LabourSummaryService`, `CPLabourDailyRepository`, `WagesPipeline`.

- [ ] **4.F.2** `ReportingCalendar` over `IBusinessCalendar`; update its five users.

- [ ] **4.F.3** `LabourSummaryService` ranges from the calendar.

- [ ] **4.F.4** `CPLabourDailyRepository:1338, 1618`: `timezone` from `calendar.MongoTimezone`.

- [ ] **4.F.5** `WagesPipeline` Dublin stages and `WageCalculationStageBuilder`: the audit (`DATABASE_DATE_QUERY_AUDIT.md`) found their output unused, so **delete** them instead of converting them. 0.24 confirms they are unused and checks for DST-flag logic first. Only if 0.24 finds a live reader: **\[behaviour\]** replace `Europe/Dublin` with the calendar zone and prove it with a shadow run.

- [ ] **4.F.6** Order/collection responses: durations from UTC; display via `IDateFormatter`.

- [ ] **4.F.7** **\[behaviour: figures only\]** **Daily plant-hire accrual by the real hire day.** `CPPlantRepository` (`GetDailyHireHandoverTransactionsAsync`, about :836–871) cuts `PlantHireStartDate` / `PlantHireEndDate` with `.Date` (UTC). Rule kept: an item is on hire from its hire start day (or, when it has none, the day its handover was accepted) for its priced weeks; the end is exclusive. Fix: a stored hire date becomes a day with `calendar.DayOf` for the team: the dev profile shows `PlantHireStartDate` / `PlantHireEndDate` hold a real time (08:00 London), so they are instants (4.3); the fallback `ReviewDate` (an instant) becomes `calendar.DayOf(reviewDate)` for the team; end day = start day + priced weeks × 7; the day loop and comparisons use `DateOnly`. Effect: **each hire accrues from its London day**, also for hires started late in the evening UTC; each item's total is unchanged; a day's value can move across a month end on the CVR. *Pin tests first (hire times in London summer and winter, fallback in London, New York and Auckland); 10.4 shadow compare; finance sign-off.*

- [ ] **4.F.8** **\[behaviour: day fix\]** **Prelim income "up to today".** `CPPrelimRepository` (:54) counts income with `x.Date <= DateTime.UtcNow`; `PrelimsIncomeTransaction.Date` is a calendar date (the transaction day). Rule kept: income dated on or before the team's today is counted. Fix: the caller passes `today = calendar.DayOf(clock.UtcNow)`; the stage uses `x.Date < calendar.DayRangeUtc(today).To`. 0.12 confirms the field's stored shape. *Pin tests: income dated today and tomorrow, London midnight and a winter `23:00Z` browser row, London summer 00:30 BST, New York 21:00, Auckland 09:00.*

- [ ] **4.F.9** **\[behaviour: day fix\]** **Report.API "today" and day cuts.** `CPPlantReportService` (`DateOnly.FromDateTime(DateTime.UtcNow)` at :431, :432, :513, :524, :600, :671, :752, :761; `UtcNow` caps at :183, :412; `.Date` at :218, :236, :274-275; `DateOnly.FromDateTime(t.Date)` at :65, :340, :416, :425) and `CPProjectCvrService` (:137, :138). Rule kept for every report: the same days and caps, worked out for the team. Fix: today = `calendar.DayOf(clock.UtcNow)`; caps from `calendar.StartOfDayUtc`; calendar-date fields and instants → `calendar.DayOf`. The list is checked again in 0.9. *Pin tests per method before the change.*

**4.S — Recurring jobs per team, in team local time** (section 4.8)

*Before you start:* 1.10c; 4.X.4 for the service; Phase 1b done for the service (6.T.1–6.T.5, including 6.T.4/6.T.4a: team copies hold the zone); 0.13, 0.20, 0.23.

*Attendance*

- [ ] **4.S.1** Pin tests: today's two jobs fire at 08:00/16:00 London and send for the same users.

- [ ] **4.S.2** `IReminderService.GenerateMorningReminders(teamName)` / `GenerateEveningReminders(teamName)`: one team per run; "today" = that team's `calendar.DayOf(clock.UtcNow)`; allocation and attendance filters for that team only (with ATT 8.10).

- [ ] **4.S.3** Idempotent sends: sent marker per (team, user, business day, morning/evening); a second run the same day sends nothing.

- [ ] **4.S.4** `AttendanceRecurringJobsRegistrar`: `attendance:reminder-morning:{team}` `0 8 * * *` and `attendance:reminder-evening:{team}` `0 16 * * *` in the team zone, for active eligible teams (0.20); removes legacy `Send morning reminders` / `Send evening reminders`. Replaces `AddAttendanceBackgroundRecurringJobs` (delete it and the `Program.cs:40` call).

- [ ] **4.S.5** Attendance `TeamCreatedHandler` / `TeamUpdatedHandler` → registrar for that team (6.T.4b).

*Resources*

- [ ] **4.S.6** `HRJobScheduler` → `ResourcesRecurringJobsRegistrar`: id `resources:hr-sync:{team}`; same cron (env minute kept); team zone; `AddOrUpdate` without `RemoveIfExists`; `IRecurringJobManager` instead of static `RecurringJob`; delete the zone field and Windows branch; remove legacy `{provider}-{team}-sync` ids.

- [ ] **4.S.7** `GetHrSyncDetailHandler`: look up the new id; `LastExecution` / `NextExecution` returned as UTC with `Z`. *Test.*

- [ ] **4.S.8** `BankHolidays-sync` → `resources:bank-holidays`, UTC (the one exception, section 4.8). `HRJobStartupService` becomes the reconcile call.

*ActiveWork* (after 0.11)

- [ ] **4.S.9** `activework:tomorrow-assignments:{team}` at the team-local time found in 0.11, team zone; registrar + team handlers; the job uses 4.A.4 "tomorrow".

- [ ] **4.S.10** Turn off the external caller once the jobs have run for a week with matching sends; keep the route for manual runs.

*All Hangfire services*

- [ ] **4.S.11** Registration only in the server host; API hosts (Attendance, Resources, ActiveWork) checked to register none. *Architecture test.*

- [ ] **4.S.12** Start-up log of every job (id, cron, zone, next run UTC and local) checked in staging for each service.

**Cross-service**

- [ ] **4.X.1** One PDF/e-mail formatting path (`IDateFormatter` + team formats) in Handover, Inspections, ActiveWork, Attendance — one PR per service.

- [ ] **4.X.2** Every server-built date is `Kind=Utc` at creation — one PR per repo.

- [ ] **4.X.3** Zone-name grep gate becomes blocking in each repo when its count is 0.

- [ ] **4.X.4** Per-team calendar: `IBusinessCalendarProvider.ForTeam(team)` from `ITeamTimeContext` (request path) or the local team copy (background path), default London. **The data's team wins over the request's team** (section 4.5): where the row or the command names a team (admin and support endpoints such as ATT 2b.4, `X-Selected-Team`, cross-team reports) the calendar is `ForTeam(dataTeam)`; the configured zone is only the fallback when there is no team. One PR per service (Attendance, ActiveWork, Handover, Inspections, Materials, Resources, Report.API). *Tests: a request made as team A on data of team B uses B's zone; a report over two zones groups each row by its own team's day.*

**Done when:** `TimeZoneInfo` appears only inside the calendar and in `Core/Legacy/` (exemption, section 4.9); TZ-matrix green with the London `TZ` removed in a test run.

---

### Phase 5 — Calendar dates by the team's day (D1, D4)

**Goal:** every lookup and grouping on a calendar date uses the team's day: `calendar.DayRangeUtc(D)` in filters, `calendar.DayOf` in memory. No stored data is rewritten (D4). **Before you start:** 0.12.

- [ ] **5.1** Attendance exact matches (`WageBonusRepo`, `WageWeekSnapshotsRepo`, `WageEventsRepo`) → the team-day range, `calendar.DayRangeUtc(D)` (ATT 8.1–8.3).

- [ ] **5.2** Attendance day windows and the `StaffAssignmentRepo` upsert (ATT 8.4–8.12).

- [ ] **5.3** ActiveWork: `StaffDayAssignments.Date`, `StaffAssignments.Date` (`CompleteDate` is an instant, 4.3).

- [ ] **5.4** Resources: absences, `HrAbsences`, `DateOfBirth`.

- [ ] **5.5** Handover: `StaffDayAssignments.Date`, `HandoverClaimTransactions.ClaimDate`.

- [ ] **5.6** Inspections: `HsInspections` `DateAnswer`.

- [ ] **5.7** Project: secured-section information dates (order received, commencement, contracted completion, design, RAMS), transaction dates, `CustomerJob` dates, `QuotationsOverview.DueDate`. Every `secureDate` and `firstWageDate` is an instant (4.3).

- [ ] **5.8** Materials: vehicle dates (`RegDate`, `PurchaseDate`, service, MOT, insurance, road tax) and fulfilment dates; order and collection `RequestedFor`, `DeliveryDate`, `PickDate` and `CollectionDate` are instants (4.3); `VehicleUnavailability.StartDate` and `EndDate`; `Vehicle.SoldDate` (filters in 4.M.4).

- [ ] **5.9** Forecasting: `StaffAllocation.Date`, `RoleAllocation.Date`.

- [ ] **5.10** FrameworkCache: lookups found in 0.9.

- [ ] **5.11** `.Date` bucketing in every repo → `calendar.DayOf` (the team's day) for calendar dates and instants alike (4.3) — one PR per repo.

- [ ] **5.12** Exact-match consumers from 0.12 in other services, **and every write, upsert and unique index keyed on a calendar-date field** (0.12): the filter uses the team-day range, so a row of the same day with another time of day (end-of-day, `01:00`, real time, 4.3) is found and not duplicated (Attendance: ATT 8.7 and 8.12).

- [ ] **5.12a** `fromUtc` / `toUtc` beside legacy `from` / `to` where apps send ranges (Attendance, Forecasting, Resources, Materials, Handover, Inspections) — moved here from 8.2: the server accepts a parameter before any client sends it (section 3, rule 2). Released for the target service before the first 6.F, 6.H or 6.I step that sends it.

- [ ] **5.13** Staging check: every touched lookup and report returns the same rows as today for London teams, and the right rows for a test team in New York and one in Auckland.

**Done when:** 5.13 passes in staging.

---

### Phase 6 — Team settings through Gateway, and every screen on the shared control

**Goal:** team zone and formats flow ProjectService → Gateway → every request and every app; every screen uses the control and the two pipes.

#### 6.T — Team time settings (event driven)

**Before you start:** 0.2, 0.17, 1.9, 1.19–1.23; **Phase 1b released in every service** (the readers). **Order:** readers (Phase 1b) → writer → backfill → Gateway headers → apps. 0.22 (anonymous routes) before 6.T.10.

*Readers first* — moved to **Phase 1b** (6.T.1–6.T.5, same step IDs).

*Writer — ProjectService*

- [ ] **6.T.6** `DisplayFormats` on `Models/Data/Team.cs`, `Models/Api/TeamSettings.cs`, `CreateTeamSettings.cs`; AutoMapper; missing on read → London.

- [ ] **6.T.7** **New teams choose their zone at creation:** the create form and `CreateTeamSettingsHandler` take `DisplayFormats` (zone default London, formats default `dd/MM/yyyy`, `HH:mm`) — missing values get `_dataSeeder.GetDefaultDisplayFormats()`; the result is included in `TeamCreated`; `DataSeeder` teams too.

- [ ] **6.T.8** Edit/update: date and time formats can be edited (formats from 0.17); **the time zone is read-only** — `EditTeamSettingsHandler` / `UpdateTeamSettingsHandler` reject any request that changes `TimeZone` (400). Controller and handlers persist the formats; `TeamUpdated.FromTeam` and the `EditTeamSettingsHandler` event include `DisplayFormats`. Contract test against Gateway's event class. *Test: an edit with a different zone is rejected and nothing is published.*

*Backfill existing teams*

- [ ] **6.T.9a** **Default script** `oskfel-migrations/teams/2026-10-xx_set_default_team_time_settings.js` (mongosh, like `worker-group-migration.js`). On `Jobs:Teams`, sets **only missing** `displayFormats.timeZone = "Europe/London"`, `dateFormat = "dd/MM/yyyy"`, `timeFormat = "HH:mm"`. Never overwrites; idempotent; `DRY_RUN = true` by default; prints a summary. Run staging → check → production, after 6.T.6. Team settings only — no stored date changes (D4).

- [ ] **6.T.9b** Audit script: teams in `Jobs:Teams` and `Gateway:Teams` with missing/invalid values → must be 0 after 6.T.9c.

- [ ] **6.T.9c** ProjectService admin command republishes `TeamUpdated` for every team (after 6.T.8), so Gateway and every service copy get the values through their normal handlers. No script writes another service's database.

*Gateway forwards to every request*

- [ ] **6.T.10** `IntoworkAuthInjector`: after the team is resolved (token or `X-Selected-Team`), add claims for zone, current offset, date format, time format from the read model (London if not found); add them to `HeaderMappedClaims`.

- [ ] **6.T.11** `Ingress.cs` `HeaderTransformation`: map them to `Intowork.TeamTimeZone`, `Intowork.TeamUtcOffset`, `Intowork.TeamDateFormat`, `Intowork.TeamTimeFormat` on **every** route; update `HeaderTransformationContractTests` and `OcelotConfigValidator`; test that client-sent `Intowork.Team*` headers are stripped.

- [ ] **6.T.12** Endpoint `GET /api/gateway/team/time-settings` (current or selected team; London if missing).

- [ ] **6.T.13** Services: request paths use `ITeamTimeContext`; background paths use the local copy. One PR per service.

*Apps*

- [ ] **6.T.14** Frontend team-settings model and service: new fields; create form pre-filled with London.

- [ ] **6.T.15** Frontend team settings screens: **create** form has the time zone (searchable, default London, any listed zone, no block); **edit** form shows the zone read-only ("set when the team was created"). Date format, time format, live preview and label preview on both. Available to the same role that creates teams today (Q1). On create, a non-London zone shows a non-blocking notice ("Day-based results are fully verified for London only"), and the backend logs every team created with a non-London zone (team, zone, who).

- [ ] **6.T.16** Frontend `TeamTimeService` loads from Gateway at start-up, on team switch and after saving.

- [ ] **6.T.17** HandoverApp and InspectionsApp: same call at bootstrap, cached offline, London before first sync.

**Before a screen step starts** (each one):

- The target service has finished the Phase 4 steps where it **reinterprets date inputs**: Resources screens after 4.R.2, ActiveWork screens after 4.A.2–4.A.4, Materials screens after 4.M.2–4.M.4, Handover after 4.H.2, Report.API screens after 4.F.2–4.F.3, Attendance screens after ATT 5–8.
- 5.12a is released for the service if the screen sends ranges.
- 3.a is done for the service and Phase 5 for the fields the screen writes.

#### What every screen step delivers

1. **Inputs** — every date/time field becomes `<app-date-time-field>` with the right `mode`; form models hold the UTC string it emits.
2. **Displays** — every pattern, `format()`, `formatDate()`, `DatePipe`, `toLocale*` → `teamDate` (instants) or `calendarDate` (calendar dates), with the kind and named format from the 0.18 mapping.
3. **Logic** — comparisons, sorting, durations, "today", "this week", overlaps use UTC and `teamCalendar`.
4. **Tests** — wire-golden specs; display specs with device zone = team zone and ≠ team zone (label visible), in both team formats.

#### 6.H — HandoverApp (Angular 16)

- [ ] **6.H.1** Wire up `shared/time/`, `TeamTimeService`, ESLint (warn).

- [ ] **6.H.2** Offline queue holds UTC: payloads are built from the control and `nowUtc()`, so queued requests already carry `Z`. *Test: a queued request replays with `Z`, body and query string.*

- [ ] **6.H.3** `attendance.service.ts` ranges via `utcRange` / `teamCalendar` (needs 5.12a if it sends `fromUtc` / `toUtc`).

- [ ] **6.H.4** `handover.service.ts` capture dates from `nowUtc()` / the control.

- [ ] **6.H.5** `signoff-info-step.component.ts:82`: `startOfDay(<string>)` → `parseWire` + `startOfTeamDayUtc`.

- [ ] **6.H.6** Every date/time input → the control.

- [ ] **6.H.7** 8 pipes → `teamDate` / `calendarDate` (0.18); remove local getters/setters and `new Date(x)` (3 + 4 + 4).

- [ ] **6.H.8** Wire-golden and display specs.

- [ ] **6.H.9** ESLint to error; release with forced update (D5).

#### 6.I — InspectionsApp (Angular 16)

- [ ] **6.I.1** Wire up `shared/time/`, `TeamTimeService`, ESLint (warn).

- [ ] **6.I.2** Queued items in `post-queue.service` / `sync.service` hold UTC strings (built from the control); `parseWire` on replay.

- [ ] **6.I.3** `date-entry.component.ts:73` → `<app-date-time-field mode="date">`.

- [ ] **6.I.4** Other inputs → the control; 5 pipes → `teamDate` / `calendarDate` (0.18) (`HH:mm dd/MM/yyyy` becomes `dateTime` — confirm the order change with the product owner).

- [ ] **6.I.5** Service files: 9 getters, 1 `new Date`, 1 `toLocale*` → UTC, `teamCalendar`, `teamDate`.

- [ ] **6.I.6** Specs; ESLint to error; forced update.

#### 6.F — Frontend (Angular 19)

*Plumbing*

- [ ] **6.F.1** Wire up `shared/time/`, `TeamTimeService`, ESLint (warn); record warning counts per module.

- [ ] **6.F.2** Record the Frontend wire-golden baseline (request bodies and query strings) before the first module is migrated.

- [ ] **6.F.3** Remove `provideNativeDateAdapter()` + `MAT_DATE_LOCALE` (`app.config.ts:284-285`) and the adapter in `activework.module.ts:50-54`; unmigrated modules keep a temporary local provider.

- [ ] **6.F.4** `shared` module (34 files): helpers → `teamCalendar`/`utcRange`; components wrap the control; pipes → `teamDate` / `calendarDate` (0.18).

- [ ] **6.F.5** Time pickers (9 files) → the control.

- [ ] **6.F.6** Calendars (4 files) and the chart (1 file): team days and `formatInZone`.

- [ ] **6.F.7** Excel exports (11 files) via the export helper.

*Modules* (file counts in brackets)

- [ ] **6.F.8** attendance (8)

- [ ] **6.F.9** wage (11)

- [ ] **6.F.10** wage-legacy (9), wage-legacy-2 (9) — or delete if unused

- [ ] **6.F.11** activework 1: `create-active-work-dialog` (`setHours` at 1315, 1330)

- [ ] **6.F.12** activework 2: other dialogs and forms

- [ ] **6.F.13** activework 3: lists, calendars, pipes

- [ ] **6.F.14** daily-resource-planner (8), weekly-resource-planner (9)

- [ ] **6.F.15** pandl (5)

- [ ] **6.F.16** inspections (2)

- [ ] **6.F.17** materials 1: order and collection forms

- [ ] **6.F.18** materials 2: yard, plant, vehicles, lists

- [ ] **6.F.19** resources (33)

- [ ] **6.F.20** forecasting (10)

- [ ] **6.F.21** jobs (17)

- [ ] **6.F.22** quotations (27)

- [ ] **6.F.23** pricing (16), shared-pricing (9)

- [ ] **6.F.24** calculator (16)

- [ ] **6.F.25** reports (20)

- [ ] **6.F.26** mypage (21)

- [ ] **6.F.27** ldf (10), takeoff (5), template (4), safety-suite (4), search (2), home, helpers, gaffer (1 each)

*Finish*

- [ ] **6.F.28** Leftovers sweep (datepickers, pipes, `format()`, `formatDate()`, `DatePipe`, `toLocale*`, local getters/setters, `new Date(x)`).

- [ ] **6.F.29** Remove the temporary datepicker providers from 6.F.3.

- [ ] **6.F.30** ESLint to error.

**Done when:** lint clean at error in all three apps; every input is the control and every display `teamDate` or `calendarDate`; the zone label shows whenever device and team zones differ; wire-golden identical; changing a team's format changes every screen, picker, chart, calendar and export with no code change; Gateway headers present on every route.

---

### Phase 7 — Removed (D1 changed 2026-10-07)

The server keeps writing calendar dates as the team's midnight (`calendar.StartOfDayUtc(day)`), which Phase 4 already puts in the calendar for every service. No flag and no flip are needed. The step IDs 7.1–7.4 stay unused so old references resolve.

---

### Phase 8 — Old app builds and offline queues (D5)

- [ ] **8.1** Dashboard: non-conformance count per `x-client-build`.

- [ ] **8.2** *(moved to **5.12a**: the server must accept `fromUtc` / `toUtc` before the first Phase 6 module sends them. The ID stays here so old references resolve.)*

- [ ] **8.3** HandoverApp and InspectionsApp: force sync, then force update.

- [ ] **8.4** Retire old builds (minimum build check).

**Done when:** counters near zero; old builds blocked.

---

### Phase 9 — Cut-over

**Goal:** remove container time zones, switch to strict mode, make every gate permanent. **Before you start:** Phases 2–5 done for the service; 9.9 also needs Phase 8.

*Remove container time zones* (section 4.7)

- [ ] **9.1** ActiveWork API: delete `ENV TZ=Europe/London` (line 2) and `RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone` (line 8). Add nothing. Keep `tzdata`. After deploy, the startup check reports UTC.

- [ ] **9.2** ActiveWork Background — same.

- [ ] **9.3** Inspections API — same.

- [ ] **9.4** Inspections Background — same.

- [ ] **9.5** Materials API — same.

- [ ] **9.6** Report.API — same (after 4.F).

- [ ] **9.7** Confirm no other Dockerfile, compose file, Helm chart or pipeline sets `TZ`; make the container-zone gate **blocking** everywhere.

- [ ] **9.8** Hangfire: after each removal, confirm the registrar log shows the same next-run UTC times as before (jobs carry their own team zone, so removing `TZ` changes nothing); no legacy ids remain (0.13).

*Strict and permanent*

- [ ] **9.9** Strict mode per service (converters, binder, Mongo serializer, event-bus options, `UtcKindGuardFilter`) once counters stay at zero. This step also **removes `Time:LegacyOffsetlessZone`** in the six `TZ=Europe/London` services: offset-less and date-only input becomes UTC (or 400). It needs the `offsetless-legacy-zone` counter at zero and Phase 8 done.

- [ ] **9.10** All banned symbols at error; all grep gates blocking; frontend "no literal pattern" rule blocking.

- [ ] **9.11** Remove compatibility code (legacy parameters, tolerant paths).

- [ ] **9.12** **Non-London zones — checklist, not a gate (D13).** A new team may already be created with another zone. This step is done when every item is true, and until then non-London teams are "supported with known gaps": 4.X.4 live everywhere; days sent between services (ActiveWork assignments, Resources allocations and absences) are read with the data team's calendar (4.5); the Attendance switch (D10) on for all teams (ATT 2b.7: summer and winter payroll comparison, 10.3, 13.2); 10.8a and 10.8b pass. Remove the picker notice of 6.T.15 when done.

- [ ] **9.13** TZ-matrix and wire-golden become permanent required checks.

**Done when:** no `TZ` anywhere; strict mode on; gates permanent.

---

### Phase 10 — Verification (runs alongside every phase)

- [ ] **10.1** Round-trip property tests per wire kind (instant, calendar date, date + time, range), ±30 years, DST edges.

- [ ] **10.1a** `Kind=Utc` guarantee suite per service under the TZ matrix: every repository date read, every controller date input, every consumed event with a date, cache and Hangfire round-trips, the clock; in the six `TZ=Europe/London` services also offset-less and date-only input (legacy-zone option, 4.1). New endpoints/repository methods without a test fail the suite (reflection discovery).

- [ ] **10.2** Event replay: Inspections submission replayed twice days apart → identical `RaisedDate` (Handover too, if 0.14 says so).

- [ ] **10.3** Attendance wage shadow compare, one summer and one winter payroll cycle; finance sign-off (ATT 13.2).

- [ ] **10.4** Report.API shadow compare before/after 4.F.

- [ ] **10.5** PDF and e-mail snapshots before/after 4.X.1, in both team formats.

- [ ] **10.6** Old-shape data test (5.13) re-run after each Phase 6 module release.

- [ ] **10.7** Format end-to-end: switch a staging team between `dd/MM/yyyy`+`HH:mm` and `MM/dd/yyyy`+`h:mm a`; check every Frontend route, both mobile apps, a PDF, an e-mail, an export; typed input stores the same date in both.

- [ ] **10.8a** Zone end-to-end for a **London** team: browsers in Riyadh and Los Angeles — label visible, correct UTC stored, lists show the same wall-clock as the input. Part of the 9.12 checklist; runs as soon as Phase 6 is released.

- [ ] **10.8b** Repeat 10.8a with another team zone (staging; may run before 9.12 to find gaps).

- [ ] **10.9** Gateway headers on every route: London team and another zone, summer and winter offsets, `X-Selected-Team`, spoofed header stripped, missing team → London.

- [ ] **10.10** Event flow: create team → London stored and published → Gateway and subscribers hold it; create a team with another zone → headers and copies hold it without restart; an edit that changes the zone is rejected (6.T.8); audit script reports 0.

- [ ] **10.11** Recurring jobs: every job id in storage matches section 4.8; a staging team created with another zone gets its reminder jobs at that zone's 08:00/16:00 from the start. **Live check dates: 2027-03-28 and 2027-10-31** (the UK clock changes), reminders sent once at the right local time; the 2026 dates stay in unit tests (1.10c).

---

### Phase 11 — Optional: UTC business days (only if D3 decides so)

- [ ] **11.1** Shadow report: zoned vs UTC calendar per wage week and day (Attendance, Report.API); finance review.

- [ ] **11.2** Flip `BusinessCalendar:Mode=Utc` per service (not per team; section 4.5); schedulers follow `ScheduleZone`.

- [ ] **11.3** Rebuild derived stores for this flip only (Attendance wage/attendance records, Report.API snapshots and labour-daily), **limited to weeks from the flip onward** — weeks before it are never recomputed (D4, D11); compare totals.

- [ ] **11.4** If final, delete `ZonedBusinessCalendar` and the switch.

---

## 6. Order, dependencies and size

### What waits for what

| Phase | Starts after | Runs in parallel with |
| --- | --- | --- |
| 0 Decisions | — | — |
| 1 Foundations | 0.1–0.8 and 0.17 | — |
| 1b Team settings readers (6.T.1–6.T.5) | 0.2, 0.17, 1.9, 1.12; 6.T.5 per service after its 2.a | 2, 3, 5 |
| 2 Clock | 1.12; 1.17 for the repo | 1b, 3, 5 |
| 3 Kind=Utc entry points | 1.15 for the repo | 1b, 2, 5 |
| 4 Zone logic | Phase 2 and Phase 1b in the repo; TZ baseline | 5 |
| 4.S Recurring jobs | 1.10c; 4.X.4 and Phase 1b (6.T.4/6.T.4a) for the service; 0.11 (ActiveWork), 0.20 (Attendance), 0.23 | 5 |
| 5 Calendar dates by team day | 0.12; 5.12a before any screen that sends ranges | 2, 3, 4 |
| 6.T writer and Gateway (6.T.6–6.T.17) | 0.2, 0.17, 1.9, 1.19–1.23; Phase 1b released in every service · writer (6.T.6–8) → script (6.T.9a after 6.T.6) → republish (6.T.9c after 6.T.8) → headers (6.T.10–11 after 6.T.2; 0.22 first) · **no zone guard (D13); checklist 9.12** | 2–5 |
| 6 Screens | 1.19–1.35; 3.a for the target service; **Phase 4 of the target service where it reinterprets date inputs** (e.g. Resources after 4.R.2, ActiveWork after 4.A.2–4.A.4, Materials after 4.M.2–4.M.4, Report.API after 4.F.2–4.F.3, Attendance after ATT 5–8); 5.12a for range screens; Phase 5 for fields the screen writes; 6.T.12 and 6.T.14–17 | 2, 3, and Phase 4 of other services |
| 8 Old builds | 6.H, 6.I released | 9.1–9.7 |
| 9 Cut-over | Phases 2–5 for the service; 9.9 also needs 8; 9.12 (checklist) needs the Attendance switch on for all teams (ATT 2b.7) | — |
| 10 Verification | alongside each phase | — |
| 11 UTC business days | Phase 9; D3 = UTC | — |

**Critical path:** 0 → 1 → 1b → (2, 3 per repo) → 4 (Attendance, Report.API) → ATT 2b.7 (pilot team on, then all teams, with a **summer and a winter payroll comparison**: 10.3, 13.2) → 9.12 (checklist, not a gate). The container steps 9.1–9.6 and 9.9 run beside it. Nothing waits for 9.12: teams may pick another zone at any time (D13). The payroll comparisons put the end of the 9.12 checklist at about April 2027 (the first summer cycle after the clock change on 2027-03-28); until then non-London teams have known gaps.

### Change map across every service

**Every repo and app, with its share of the work:**

```text
CommonLibs · time kit copied into every repo (D8), 14 steps
IDateTimeProvider · IBusinessCalendar · CalendarDay · TeamTimeSettings
│
├─► SERVICES WITH ZONE LOGIC · London code moves into IBusinessCalendar (Phase 4)
│     Repo           Steps  Clock      TZ  Highlights                              Size (steps)
│     Attendance       131     40       —  payroll · Appendix A · per-team switch  ████████████████████ 131
│     ActiveWork        39     29  API+Bg  reminders · event-sourced               ██████                39
│     Resources         35     36       —  HRJobScheduler per team · absences      █████                 35
│     FrameworkCache    34     47     API  ReportingCalendar · delete Dublin code  █████                 34
│     Handover          33     61       —  PDF times · AddBusinessDays             █████                 33
│     Inspections       31     25  API+Bg  PDF times · stamps on replay            █████                 31
│     Materials         28     74     API  vehicle availability windows            ████                  28
│
├─► SERVICES WITH CLOCK READS ONLY · IDateTimeProvider, Kind=Utc
│     Repo           Steps  Clock      TZ  Highlights                              Size (steps)
│     Project           25     65       —  owns team settings (6.T.6–6.T.9c)       ████                  25
│     Customer          19     10       —                                          ███                   19
│     Forecasting       19      1       —  allocation dates from events            ███                   19
│     Gaffer            17     25       —                                          ███                   17
│     Permissions       17     11       —                                          ███                   17
│     SafetySuite       17     10       —                                          ███                   17
│     Notification      16      2       —                                          ██                    16
│
├─► GATEWAY · 19 steps · 12 clock reads · team settings → Intowork.Team* headers on every route
│     └─► OcelotConfigValidator: gate only
│
└─► ANGULAR APPS · <app-date-time-field>, teamDate, calendarDate; UTC everywhere else
      Frontend        30 screens (6.F)   297 date pipes   59 datepickers
      HandoverApp      9 screens (6.H)     8 date pipes   offline queue
      InspectionsApp   6 screens (6.I)     5 date pipes   offline queue

Team settings:  ProjectService ══ TeamCreated / TeamUpdated ══► Gateway ══ headers ══► every service and app
Containers:     6 images drop TZ=Europe/London in Phase 9
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| Steps | The repo's total in "Steps per repo" (all phases). | Attendance 133 = ATT steps in every phase |
| Clock | Clock reads in 8.1 (`DateTime.Now/UtcNow/Today`, `DateTimeOffset.Now/UtcNow`). | Materials 74 |
| TZ | Which of its images set `TZ=Europe/London` today; removed in Phase 9. | ActiveWork `API+Bg` = API and Background images |
| Highlights | The repo's special work in this plan. | Resources: Hangfire jobs per team in `HRJobScheduler` |
| Size bar | Total steps, scaled to Attendance (131). | `████ 28` for Materials |
| Services with zone logic | The 7 repos with hard-coded London code (23 zone definitions). | `WageWeekDateCalculator.AdjustForDaylightSaving` |
| Services with clock reads only | No zone code; only "now" and `Kind=Utc`. | Forecasting: 1 clock read |
| Team settings | ProjectService publishes the team's zone and formats; Gateway turns them into headers (4.5). | `Intowork.TeamTimeZone: Europe/London` |

**Steps per repo** ("Steps per repo" table, Total column):

```text
Plan steps per repo (494 in all)

Attendance      ████████████████████████████████████████  131
ActiveWork      ████████████                               39
Resources       ███████████                                35
FrameworkCache  ██████████                                 34
Handover        ██████████                                 33
Inspections     █████████                                  31
Materials       █████████                                  28
Project         ████████                                   25
Customer        ██████                                     19
Forecasting     ██████                                     19
Gateway         ██████                                     19
Gaffer          █████                                      17
Permissions     █████                                      17
SafetySuite     █████                                      17
Notification    █████                                      16
CommonLibs      ████                                       14
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| Repo | A .NET repo; FrameworkCache is Report.API. | FrameworkCache 35 |
| Bar and number | Steps the repo owns across Phases 2–9 and the ATT before-and-after steps. Phase 0, 1, 10 and 11 steps belong to no repo and are not counted. | Gateway 19: 7 clock, 2 entry points, 2 cross-service, 5 team settings, 3 cut-over |

**Steps per phase** (column sums of the same table):

```text
Repo steps per phase (494 in all)

Ph 2  clock reads                 ████████████████████████████████████████  115
Ph 3  Kind=Utc entry points       ██████████████████████████████             85
Ph 4  zone logic                  ███████████████████████                    65
Ph 9  cut-over                    ██████████████████                         53
1b / 6.T  team settings           ████████████████                           47
4.X  cross-service                ███████████████                            43
ATT 0–2b, 13  before and after    ███████████████                            43
Ph 5  calendar dates by team day  ███████                                    21
4.S  recurring jobs               ██████                                     16
Ph 8  old app builds              ██                                          6
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| Ph 2 | Every clock read through `IDateTimeProvider` (R3). | `DateTime.UtcNow` → `clock.UtcNow` |
| Ph 3 | Every incoming `DateTime` becomes `Kind=Utc` (4.1). | controller `DateTime.Parse` → `WireDate` |
| Ph 4 | Zone, day and week logic moves into `IBusinessCalendar` (R2). | `isSummer ? -1 : 0` → `calendar.AtTimeOfDayUtc` |
| 4.X | Steps that repeat in several repos: PDF and e-mail times, analyzers, calendar wiring. | 4.X.1 in Handover, Inspections, ActiveWork, Attendance |
| 4.S | Hangfire jobs run per team, in team local time. | Attendance reminders at 08:00 team time |
| Ph 5 | Lookups and grouping on calendar dates by the team's day (`calendar.DayRangeUtc`, `calendar.DayOf`); no data rewritten. | bonus for week 6 July found at `Sun 23:00Z` |
| 1b / 6.T | Team settings: readers in every service, writer in Project, headers in Gateway. | 6.T.11 Gateway headers |
| Ph 8 | Old app builds and offline queues retired (D5). | HandoverApp minimum build |
| Ph 9 | Cut-over: `TZ` removed, strict mode, gates permanent. | 9.1 ActiveWork API image without `TZ` |
| ATT 0–2b, 13 | Attendance steps before and after the main phases. | ATT 1 safety-net tests |

**Clock reads per repo** (8.1):

```text
Clock reads per repo (~455)

Materials       ████████████████████████████████████████  74
Project         ███████████████████████████████████       65
Handover        █████████████████████████████████         61
FrameworkCache  █████████████████████████                 47
Attendance      ██████████████████████                    40
Resources       ███████████████████                       36
ActiveWork      ████████████████                          29
Gaffer          ██████████████                            25
Inspections     ██████████████                            25
Gateway         ██████                                    12
Permissions     ██████                                    11
Customer        █████                                     10
SafetySuite     █████                                     10
CommonLibs      ████                                       7
Notification    █                                          2
Forecasting     █                                          1
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| Clock read | A direct read of the machine clock, replaced in Phase 2 by `IDateTimeProvider`. | `DateTime.UtcNow`, `DateTime.Now`, `DateTimeOffset.UtcNow` |
| \~455 | Approximate grep count; the analyzer (2.a) gives the exact list. | — |

**Frontend date touchpoints** (8.2, Frontend app):

```text
Frontend app: date code by kind

new Date(x)        ████████████████████████████████████████  756
Local getters      █████████████████████████████             546
date pipes         ████████████████                          297
Local setters      ████████████                              227
date-fns format()  █████████                                 166
toLocale*          ███████                                   139
Date.UTC           █████                                      99
Datepicker inputs  ███                                        59
formatDate()       ███                                        51
DatePipe           ██                                         44
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| `new Date(x)` | A `Date` built from a value; ESLint bans the string form. | `new Date(row.clockIn)` |
| Local getters / setters | `Date` methods that use the device zone. | `getHours()`, `setHours(0, 0, 0, 0)` |
| date pipes | Angular \` | date`, replaced by `teamDate`or`calendarDate\`. |
| date-fns `format()`, `formatDate()`, `DatePipe`, `toLocale*` | Other device-zone formatting, replaced by `formatInZone`. | `format(d, 'yyyy-MM-dd')` |
| `Date.UTC` | Hand-built UTC values. | `Date.UTC(y, m, d)` |
| Datepicker inputs | `mat-datepicker` fields, replaced by `<app-date-time-field>`. | absence start date |

**Frontend date pipe formats** (8.2, top 10 of 297):

```text
Frontend app: date pipe patterns

dd/MM/yyyy         ████████████████████████████████████████  50
dd/MM/yyyy, HH:mm  █████████████████████████████             36
dd/MM/yyyy HH:mm   ██████████████████████████                33
HH:mm              ██████████████████                        22
dd MMM yyyy        █████████████████                         21
dd-MMM-yyyy        ██████████████                            18
EE dd MMM yyyy     ██████████                                12
d MMM yyyy         ██████████                                12
yyyy-MM-dd         ████████                                  10
E dd MMM, HH:mm    █████                                      6
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| Pattern | The format string passed to the `date` pipe. Each becomes a named team format (4.4). | `dd/MM/yyyy` → `date`; `dd/MM/yyyy, HH:mm` → `dateTime` |
| Number | How many pipes use that exact pattern. | 50 pipes use `dd/MM/yyyy` |

**Frontend files with date code per module** (8.2, top 15):

```text
Frontend app: files with date code

activework               ████████████████████████████████████████  58
materials                ██████████████████████████████████████    55
shared                   ███████████████████████                   34
resources                ███████████████████████                   33
quotations               ███████████████████                       27
mypage                   ██████████████                            21
reports                  ██████████████                            20
jobs                     ████████████                              17
pricing                  ███████████                               16
calculator               ███████████                               16
wage                     ████████                                  11
ldf                      ███████                                   10
forecasting              ███████                                   10
weekly-resource-planner  ██████                                     9
wage-legacy-2            ██████                                     9
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| Module | A folder under `Frontend/src/app/`. | `activework` |
| Number | Files in that module with date code; each is a Phase 6 (6.F) review target. | 58 files in `activework` |

**Critical path** (section 6):

```text
Phase 0   decisions
   │
   ▼
Phase 1   foundations: time kit, CI gates, control and pipes
   │
   ▼
Phase 1b  team settings readers (6.T.1–6.T.5), London defaults
   │
   ├──► Phase 2  clock reads ─────────────┐
   ├──► Phase 3  Kind=Utc entry points ───┤  per repo, in parallel
   └──► Phase 5  calendar dates by team day ┤
                                          ▼
Phase 4   zone logic into IBusinessCalendar (Attendance and Report.API last)
   │
   ▼
ATT 2b.7  pilot team on → all teams; summer and winter payroll comparison (10.3, 13.2)
   │
   ▼
9.12      checklist for non-London teams (not a gate; ends about April 2027)

Beside the path: 9.1–9.6 and 9.9 container steps · Phase 6 screens · Phase 8
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| Phase n | A phase in section 5. | Phase 1b: every service can read the team zone |
| ATT 2b.7 | Attendance per-team switch turned on, pilot team first. | one London team for one payroll cycle |
| 10.3, 13.2 | The summer and winter payroll comparisons that gate the switch. | wages before vs after for the same weeks |
| 9.12 | Checklist before a non-London team; not a gate. | ends about April 2027, after the first summer cycle |
| Beside the path | Work that does not hold up the critical path. | 9.1 ActiveWork API image without `TZ` |

### Steps per repo

Columns are phases. **4.X** = the cross-service steps that apply to the repo (4.X.1 PDF/e-mail path in Handover, Inspections, ActiveWork, Attendance; 4.X.2 and 4.X.3 in every repo; 4.X.4 in the seven calendar services). **4.S** = recurring-job steps (4.S.1–4.S.5 Attendance, 4.S.6–4.S.8 Resources, 4.S.9–4.S.10 ActiveWork, and 4.S.11–4.S.12 in each Hangfire service). Pointer steps (4.R.3, ATT 10, 6.T.4b) are counted once, under 4.S. For Attendance the columns come from the ATT steps: Ph 2 = ATT 3, Ph 3 = ATT 4, Ph 4 = ATT 5–7 and 11, Ph 5 = ATT 8, Ph 9 = ATT 12, "Before and after" = ATT 0–2b (37) + ATT 13 (6). The optional Phase 11 / ATT 14 steps are not counted.

| Repo | Ph 2 | Ph 3 | Ph 4 | 4.X | 4.S | Ph 5 | 1b / 6.T | Ph 8 | Ph 9 | Before and after (ATT 0–2b, 13) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ActiveWork | 7 | 10 | 6 | 4 | 4 | 1 | 3 | — | 4 | — | 39 |
| Attendance | 10 | 9 | 37 | 4 | 7 | 12 | 3 | 1 | 5 | 43 | 131 |
| CommonLibs | 7 | 2 | — | 2 | — | — | 1 | — | 2 | — | 14 |
| Customer | 7 | 4 | — | 2 | — | 1 | 2 | — | 3 | — | 19 |
| Forecasting | 7 | 3 | — | 2 | — | 1 | 2 | 1 | 3 | — | 19 |
| FrameworkCache | 7 | 7 | 9 | 3 | — | 1 | 3 | — | 4 | — | 34 |
| Gaffer | 7 | 3 | — | 2 | — | — | 2 | — | 3 | — | 17 |
| Gateway | 7 | 2 | — | 2 | — | — | 5 | — | 3 | — | 19 |
| Handover | 7 | 10 | 4 | 4 | — | 1 | 3 | 1 | 3 | — | 33 |
| Inspections | 7 | 10 | 1 | 4 | — | 1 | 3 | 1 | 4 | — | 31 |
| Materials | 7 | 5 | 4 | 3 | — | 1 | 3 | 1 | 4 | — | 28 |
| Notification | 7 | 2 | — | 2 | — | — | 2 | — | 3 | — | 16 |
| Permissions | 7 | 2 | — | 2 | — | — | 3 | — | 3 | — | 17 |
| Project | 7 | 5 | — | 2 | — | 1 | 7 | — | 3 | — | 25 |
| Resources | 7 | 8 | 4 | 3 | 5 | 1 | 3 | 1 | 3 | — | 35 |
| SafetySuite | 7 | 3 | — | 2 | — | — | 2 | — | 3 | — | 17 |

| App | 1b / 6.T | Screens | Shared control |
| --- | --- | --- | --- |
| HandoverApp | 1 | 9 (6.H) | 1.34 |
| InspectionsApp | 1 | 6 (6.I) | 1.34 |
| Frontend | 3 | 30 (6.F) | 1.19–1.33 |

Counts for Phases 3 and 5 firm up after 0.9 and 0.12. Sub-steps with nothing to do are closed with a one-line note. Steps that belong to no single repo are not in the table: Phase 0, Phase 1, Phase 10 and Phase 11. The ProjectService writer and backfill steps (6.T.6–6.T.9c) are in Project's "1b / 6.T" column, and the Gateway steps (6.T.2, 6.T.3, 6.T.10–6.T.12) in Gateway's.

---

## 7. Open questions (closed in Phase 0)

- Stored shapes of Project, Materials order, transaction and DOB rows → 0.12.
- Report.API day bucketing → 0.9.
- Material datepicker adapter in Angular 16 and 19 → 0.7.
- Mongo serializer on nested and `BsonDocument` paths → 0.6.
- External caller of the ActiveWork reminder route → 0.11.
- Event-versioning convention in Handover and Inspections (ActiveWork uses numbered event classes) → 3.g.
- ActiveWork tests run on Microsoft.Testing.Platform from inside `ActiveWorkService/`; the TZ-matrix template must support it → 1.16, 1.17.
- The clock-read count (\~455) is approximate; the analyzer (2.a) gives the exact list.
- Team-event subscribers on 2026-10-01: `TeamCreated` → Gateway, Permissions, ActiveWork, Attendance, Handover, Inspections, Materials, Resources; `TeamUpdated` → Gateway, ActiveWork, Attendance, Handover, Inspections, Materials, Resources. Re-check in 6.T.4.
- Whether HandoverApp and InspectionsApp already have a bootstrap call that can carry the time settings → 6.T.17.
- Later idea (D14): a project-level zone for sites abroad. Not in this plan.

---

## 8. Reference: inventory

### 8.1 Backends

| Repo | Clock reads | Hard-coded zones | Parse / Kind sites | Container sets `TZ` | Notes |
| --- | --- | --- | --- | --- | --- |
| ActiveWork | 29 | `Core/Utilities/TimeZoneProvider.cs:9-10` · `ActiveWorkDateUtilities.cs:17-22` · `ActiveWorkNotificationService.cs:85-87, 177-179` · `TomorrowStaffAssignmentReminderService.cs:28-64` | `ActiveWorkController` (2) · `StaffAssignmentController` (4) · `ActiveWorkRepo.cs:229, 244` · `CreateWorkReadinessStateReportHandler` · `ReportGeneratorService` · reminder service | API + Background | Event-sourced; reminder route caller unknown |
| Attendance | 40 | 9 files (Appendix A.2.1) | 31 | no | Payroll; Hangfire reminders; exact `WeekCommencing` matches |
| CommonLibs | 7 | — | `Common.Data/Extensions/FilterAndSortExtension.cs` (3) | — | Bus and cache serializers (section 4.1); **no** time package — time code is copied per repo (D8) |
| Customer | 10 | — | `FilterAndSortExtension` (3) | no |  |
| Forecasting | 1 | — | `StaffAllocationsController` (4) | no | Allocation dates from events |
| FrameworkCache (Report.API) | 47 | `LabourSummaryService.cs:15-16, 91-94, 121-124` · `ReportingCalendar.cs:12-55` · `WagesPipeline.cs:8, 138, 145` (**Dublin**) · `CPLabourDailyRepository.cs:1338, 1618` · `OrderRequestResponse.cs:45-51` · `CollectionRequestResponse.cs:43-49` | 41 (`CPLabourDailyRepository` 23, `LabourSummaryService`, `CPPlant`, `CPStockPosition`, `CPTransport`, `FilterAndSortExtension`) | Report.API | Read in depth in 0.9 |
| Gaffer | 25 | — | `FleetComplianceTool` (1) | no |  |
| Gateway | 12 | — | — | no | Team read model `Gateway:Teams` (`Core/Data/Models/Team.cs`: only `TeamName`, `TeamAdminEmail`, `IsActive`) · `TeamCreatedHandler`, `TeamUpdatedHandler` · cache cleared in `TeamsRepo.AddOrUpdateAsync` · claims → headers in `IntoworkAuthInjector` (`HeaderMappedClaims`) and `Ingress.cs` (`HeaderTransformation`) · `IntoworkHeaderStrippingMiddleware` |
| Handover | 61 | `ReportGeneratorService.cs:23-38, 169` (PDF) · `HandoverNotification.cs:32-45, 135-145` | `HandoversController` (4), report generator | no | Event-sourced; `HandoverClaimTransaction.cs:44` |
| Inspections | 25 | `ReportGeneratorService.cs:15-23, 176, 204` (PDF) | `HsInspectionsController` (4) · `InspectionsController` (4) · `InspectionsReportRepo` (2) | API + Background | Event-sourced; `HsInspection.cs:127`, `Inspection.cs:174` stamp on replay |
| Materials | 74 | `GetVehiclesForTeamHandler.cs:12-23` · `GetVehiclesForTeamByCategoryHandler.cs:12-23` | Controllers `CollectionRequests`, `OrderRequests`, `Stock` (2 each) · repos (2 each) · `FilterAndSortExtension` (3) | API |  |
| Notification | 2 | — | — | no |  |
| Permissions | 11 | — | — | no |  |
| Project | 65 | — | `FilterAndSortExtension` (3) · `ImportMaterialsToCatalogueHandler` (2) | no | Owns team settings: `Models/Data/Team.cs`, `Models/Api/TeamSettings.cs`, `CreateTeamSettings.cs`, `TeamSettingsController`, `CreateTeamSettingsHandler` (publishes `TeamCreated`), `EditTeamSettingsHandler` / `UpdateTeamSettingsHandler` (publish `TeamUpdated`); collection `Jobs:Teams` (camelCase) |
| Resources | 36 | `HRJobScheduler.cs:30-42, 63-100` · `ResourcesController.cs:36-38, 446, 468, 484` | `ResourcesController` (6) · `HrService` (4) · `TimeTasticAbsenceProviderService` (4) · `BankHolidaysProviderService` (2) · two `FilterAndSortExtension` copies; \~14 `SpecifyKind` | no | Absences and DOB are calendar dates |
| SafetySuite | 10 | — | `CreateNearMissCommandHandler` (1) | no |  |
| OcelotConfigValidator | 0 | — | — | — | Gate only |

**Totals:** \~455 clock reads · 23 zone definitions in 7 repos · 7 copies of `FilterAndSortExtension`.

**Containers that set a time zone** — each Dockerfile has `ENV TZ=Europe/London` (line 2) and `RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone` (line 8): `ActiveWorkService/Intowork.ActiveWork.API` · `ActiveWorkService/Intowork.ActiveWork.Background` · `InspectionsService/Intowork.Inspections.API` · `InspectionsService/Intowork.Inspections.Background` · `MaterialsService/Intowork.MaterialsService.API` · `FrameworkCache/Intowork.Report.API`. No compose file, Helm chart or pipeline sets `TZ`.

### 8.2 Frontends

| App | Angular | Date lib | `date` pipes | Getters / setters | `new Date(x)` | `Date.UTC` | Interceptors | Datepicker setup | Offline queue |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Frontend | 19.2 | date-fns 2.28 | 297 | 546 / 227 | 756 | 99 | `team-header`, `http-request`, `signalr-http`, `test-token`, `version-block` | `provideNativeDateAdapter()` + `en-GB` (`app.config.ts:284-285`); `NativeDateAdapter` (`activework.module.ts:50-54`) | — |
| HandoverApp | 16.2 | date-fns 2.22 | 8 | 3 / 4 | 4 | 0 | `offline-request`, `offline-response`, `conditional-msal`, `test-token` | — | `offline-request.interceptor.ts`, `handover.service.ts`, `offline-handovers` |
| InspectionsApp | 16.2 | date-fns 2.29 | 5 | 9 / 0 | 1 | 0 | `offline-response`, `conditional-msal`, `test-token` | `MatNativeDateModule` (testing) | `post-queue.service.ts`, `sync.service.ts`, `db.service.ts` |

**Formatting touchpoints in Frontend:** 297 pipes (top patterns: `dd/MM/yyyy` 50 · `dd/MM/yyyy, HH:mm` 36 · `dd/MM/yyyy HH:mm` 33 · `HH:mm` 22 · `dd MMM yyyy` 21 · `dd-MMM-yyyy` 18 · `EE dd MMM yyyy` 12 · `d MMM yyyy` 12 · `yyyy-MM-dd` 10 · `E dd MMM, HH:mm` 6) · date-fns `format()` 166 · `formatDate()` 51 · `DatePipe` 44 · `toLocale*` 139 · 59 datepicker inputs · time pickers in 9 files · calendars in 4 · apexcharts in 1 · `xlsx` exports in 11. **HandoverApp pipes:** `dd MMM yyyy, HH:mm`, `dd MMM yyyy`, `dd/MM/yyyy HH:mm` ×2, `dd/MM/yyyy, HH:mm`, `mediumDate`, `short`. **InspectionsApp pipes:** `HH:mm dd/MM/yyyy` ×4, `dd/MM/yyyy, HH:mm`.

**Frontend team settings:** `shared/team-settings.ts`, `shared/team-settings.service.ts`, `teams-settings/edit-team-settings`, `teams-settings/create-team-settings`. No zone or format field today.

**Frontend files with date code per module:** activework 58 · materials 55 · shared 34 · resources 33 · quotations 27 · mypage 21 · reports 20 · jobs 17 · pricing 16 · calculator 16 · wage 11 · ldf 10 · forecasting 10 · weekly-resource-planner 9 · wage-legacy-2 9 · wage-legacy 9 · shared-pricing 9 · daily-resource-planner 8 · attendance 8 · takeoff 5 · pandl 5 · template 4 · safety-suite 4 · search 2 · inspections 2 · home 1 · helpers 1 · gaffer 1.

**Known client bugs:** HandoverApp `signoff-info-step.component.ts:82` (`startOfDay(<string>)`), `attendance.service.ts` range, `handover.service.ts` capture dates · InspectionsApp `date-entry.component.ts:73` · Frontend `create-active-work-dialog.component.ts:1315, 1330` (`setHours`).

### 8.3 Other folders

| Folder | Status | Step |
| --- | --- | --- |
| `Prototype`, `Frontend/Prototype` | Prototype UI | 0.10 — joins Phase 6 if deployed |
| `signalR-across-sharedworkers` | Sample | 0.10 |
| `oskfel-migrations` | mongosh scripts. **Not deployed, but used:** it hosts the production script 6.T.9a (run by hand, reviewed, staging first) | 0.10 |

---

## Appendix A — AttendanceService step by step (`ATT`)

AttendanceService is payroll-critical and has the most zone logic, so its steps are broken down further. Inside this appendix, a step number like "5.4" means **ATT 5.4**.

**Where each ATT phase fits in the main plan**

| ATT phase | Main phase |
| --- | --- |
| ATT 0 Decisions | Phase 0 (0.16) |
| ATT 1 Safety-net tests | before Phase 2 |
| ATT 2 Foundations | Phase 1 / 2.a |
| ATT 3 Clock reads | Phase 2 |
| ATT 4 Entry points | Phase 3 |
| ATT 2b Per-team switch | Phase 4, before ATT 5 (ships switched off; D10, D11) |
| ATT 5, 6, 7, 11 | Phase 4 |
| ATT 10 Hangfire | Phase 4 (4.S) |
| ATT 8 Lookups | Phase 5 |
| ATT 12 Cut-over | Phase 9 |
| ATT 13 Verification | Phase 10 |
| ATT 14 UTC business days | Phase 11 |

### A.1 Behaviour changes (sign-off in ATT 0.1)

| \# | Area | Today | After | Step |
| --- | --- | --- | --- | --- |
| B1 | Finish cap, summer clock-out 00:00–01:00 BST | Capped at shift day's finish (by accident) | Same result, on purpose (clock-in business day) | 5.4 |
| B2 | Finish cap, winter clock-out after midnight | Not capped | Capped at the clock-in day's finish | 5.4 |
| B3 | Start / standard hours, summer clock-in 23:00–00:00 UTC | Weekday and start from the UTC date | From the UK business day | 5.3, 5.5 |
| B4 | Start or finish time 00:00 in summer | Wraps to 23:00 UTC same date | 00:00 UK time that day | 5.3, 5.4 |
| B5 | Day grouping (travel, break, bonus days, no-show) | UTC date | UK business day | 5.7–5.9 |
| B6 | Clock rules for a time in a different DST period than today (back-dating) | Uses today's offset — one hour wrong | Uses the clock date's offset | 6.4, 6.6 |
| B7 | Clock rules, clock time 23:00–00:00 UTC in summer | UTC date | UK business day | 6.3–6.6 |
| B8 | "First sign-in of the day" | UTC date | UK business day | 6.8 |
| B9 | Recalculation week range in a clocks-go-back week | `from + 7 days` (misses an hour) | Exact business-day week | 7.6 |
| B10 | Daily-rate override day range | UTC day | UK business day | 8.8 |
| B11 | Reminder "clocked in/out today" | UTC date | UK business day | 8.10 |
| B12 | Legacy override date (`1 January 2022`) in responses | No `Z` | With `Z` (same instant) | 4.9 |
| B13 | *(Removed 2026-10-07 with the D1 change: new `WeekCommencing` values stay London midnight, `Mon 00:00Z` in winter and `Sun 23:00Z` in summer, as today.)* | — | — | — |
| B14 | Clock-out after midnight (night shift, or 00:00–01:00 BST) | Not matched — different UTC day | Matched: latest open clock-in on that project within 16 h (D12) | 6.10–6.12 |
| B15 | Report rows per day (ranged wages, team/user period, attendance range) | UTC day | Team business day | 8.11 |
| B16 | Night shift pay (worker-group finish ≤ start, e.g. 22:00–06:00) and weekend settings for the finish | Finish settings picked by the **clock-out** weekday; overnight finish lands before the start → 0 minutes unless `PayPastEndDay` | Weekday and settings from the **clock-in** business day; when finish ≤ start the finish is on the **next** business day | 5.14 |

**Which changes the per-team switch controls (D10).** The switch cannot undo everything:

| Change | Controlled by | Switching off |
| --- | --- | --- |
| B1–B5, B9, B16 (wage calculation) | per-team switch (2b) | Undone: 2b.5 recalculates the weeks since the start week with the old rules |
| B10, B11, B15 (day windows, reminders, report days) | per-team switch | Undone at once; nothing is stored |
| B6–B8 (clock rules) | per-team switch | Only new clock-ins/outs follow the old rules; clock times already written with the new rules stay |
| B14 (night-shift matching) | per-team switch | Only new clock-outs follow the old rule; `ClockInId` already written in events (6.12) stays, so matched shifts stay paired |
| B12 (legacy override date with `Z`) | **global**, always on (ATT 4.9) | Not switchable |

**A shift that crosses the switch-on week** is judged by the week of its **clock-in** business day (2b.8). Weeks before the team's start week keep the old rules (D11).

Unchanged but worth knowing: a shift that **starts** after its finish time pays 0 minutes unless `PayPastEndDay` is set.

### A.2 Inventory — every site and the step that fixes it

**Hard-coded zones and DST rules**

| File:line | What | Step |
| --- | --- | --- |
| `Core/Extensions/WageCalculatorExtension.cs:16-18, 652-669, 687-704` | London zone, `isSummer ? -1` | 5.1–5.11 |
| `Core/Utilities/ClockInOutTimeCalculator.cs:79-90` | Uses **`DateTime.Today`**'s DST | 6.1–6.7 |
| `Core/Utilities/Services/WageWeekDateCalculator.cs:8-62` | `AdjustForDaylightSaving`, `NormalizeDate`, `RemoveDstSideEffect` | 7.1–7.8 |
| `Core/Data/WageHelper.cs:22-24, 126-157` | `CalcStdWage` summer hours | 11.2 |
| `Core/Data/WageHelperLegacy.cs:16-18, 213-275` | Same rule twice; registered, never injected | 11.1 |
| `Core/CQRS/Handlers/SupervisorClockInHandler.cs:197-208`, `SupervisorClockoutHandler.cs:199-210` | `ToLondonTime` for overlap messages | 6.9 |
| `Background/Services/ReminderService.cs:28, 38, 196-205` | London "today" filter | 8.10 |
| `Background/Extensions/AttendanceBackgroundJobExtensions.cs:12-28` | One global job, London zone, registered in `Program.cs:40` | 10.1–10.4 |
| `Core/Data/Models/Team.cs`, `Background/Events/IntegrationEvents/TeamCreated.cs`, `TeamUpdated.cs` | No team time zone | main 6.T.4a |

**Clock reads**

| File:line | What | Step |
| --- | --- | --- |
| `API/Controllers/AttendanceController.cs:79, 97, 116`; `AwardWageBonusHandler.cs:34, 47` | Clock in log text | 3.1 |
| `UserClockInHandler.cs:37`, `UserClockOutHandler.cs:35`, `UserSmartClockHandler.cs:57` | Clock times | 3.2 |
| `WageBonusAwarded.cs:33, 38`, `WageRecordApproved.cs:17`, `WageRecordApproved2.cs:21`, `WageRecordOverridden2.cs:22`, `WageRecordOverridden3.cs:27`, `WageWeekSnapshotTaken.cs:24` | Event stamps | 3.3 |
| `Team.cs:38`, `User.cs:42, 66, 80, 86, 93, 100, 107`, `ResourceAllocation.cs:28, 37` | `Updated` | 3.4 |
| `OutboundIntegrationEventsRepo.cs:54`, `IncomingIntegrationEventsRepo.cs:26`, `TeamsRepo.cs:100` | Repository stamps, cache expiry | 3.5 |
| `TeamCreatedHandler.cs:62`, `TeamUpdatedHandler.cs:76`; `StaffMemberAbsenceCreatedOrUpdatedHandler.cs:72`, `StaffMemberAbsenceDeletedHandler.cs:54` (**`DateTime.Now`**) | Background handlers | 3.6 |
| `WageCalculaterHelper.cs:85, 155` | Loop end | 3.7 |
| `ReminderService.cs:57, 64, 100, 107, 198` | "today" | 3.8 |
| `ClockInOutTimeCalculator.cs:81` | `DateTime.Today` | 3.9 → 6.4 |

**Incoming dates and `Kind`**

| File:line | What | Step |
| --- | --- | --- |
| `WageController.cs:42-43, 93, 114, 148-149, 168-169, 196-197, 217-218, 238, 274-275, 381-382` | 17 × `DateTime.Parse` | 4.2 |
| `AttendanceController.cs:225-226, 256-257` | 4 × `DateTime.Parse` | 4.3 |
| `Core/Extensions/FilterAndSortExtension.cs:202-203, 259` | `Parse` + `SpecifyKind`; `TryParse` | 4.4 |
| `GetWagesByProjectIdHandler.cs:48-51` | `TryParse`; inclusive end | 4.5 |
| `GetMyWageWeekSnapshotsHandler.cs:27` | `SpecifyKind` | 4.6 |
| All JSON bodies | default System.Text.Json | 4.7 |
| Mongo | no serializer registered | 4.8 |
| `WageRecord.cs:134`, `GetWageRecordsForPeriodHandler.cs:42` | `DateTime.Parse("1 January 2022")` | 4.9 \[B12\] |

**Day and week lookups**

| File:line | What | Step |
| --- | --- | --- |
| `WageBonusRepo.cs:21, 27, 47` | `WeekCommencing == wc` | 8.1 |
| `WageWeekSnapshotsRepo.cs:23` | `WeekCommencing == wc` | 8.2 |
| `WageEventsRepo.cs:159` | `Eq("Data.WeekCommencing", wc)` | 8.3 |
| `WageRecordsRepo.cs:70-104` | `AddDays(7)` week window (`//TODO: Verify time zone correctness`) | 8.4 |
| `WageRecordsRepo.cs:116, 128, 139` | Earliest attendance `.Date` | 8.5 |
| `UserAttendanceRepo.cs:32-34, 38-58`, `ResourceAllocationRepo.cs:33-35` | UTC day windows | 8.6 |
| `StaffAssignmentRepo.cs:38` | Upsert on exact date | 8.7 |
| `DailyRateOverrideHandler.cs:46-47` | UTC day | 8.8 \[B10\] |
| `GetProjectWagesForPeriodHandler.cs:57, 100` | `WageDate = ...Date` | 8.9 |
| `UserAttendanceRecord.cs:154-164` | `IsFirstSignInForDate` | 6.8 \[B8\] |
| `UserAttendanceRecord.cs:105, 111, 123, 138` | `GetClockedInAttendance`, `UserCanClockIn`, `CanClockOut`, `GetOverlappingAttendance` — UTC `.Date` | 6.10, 6.11 \[B14\] |
| `UserAttendanceRecord.cs:236, 319, 402` | Event replay (`OnClockOut`, supervisor clock-out, `GetAttendanceForDate`) pairs by UTC `.Date` | 6.12 |
| `StaffAllocationCreatedHandler.cs:41`, `ActiveWorkStaffUpdatedHandler.cs:88` | Days from other services stored exactly as received (audit challenge 10) — correct; reads use the team-day range | 8.6, 8.7 |
| `GetRangedWagesPerDayHandler.cs:39, 60`, `GetUserWagesAttendanceForPeriodHandler.cs:48, 85, 118`, `GetTeamWagesAttendanceForPeriodHandler.cs:36-48` | Report days cut at UTC midnight | 8.11 \[B15\] |
| `RecalculateWageRecordHandler.cs:96, 211, 216-221` | `RemoveDstSideEffect`, week range | 7.6, 5.12 |
| `WageRecordApprovalHandler.cs:72-74` | Week range | 7.3 |

**Infrastructure and other fixes**

- Dockerfiles set no `TZ` today — keep it that way (12.1).
- Hangfire Mongo storage in both hosts; jobs re-registered on startup (10.1, 10.2).
- `WageCalculatorExtension.GetTotalTravelTime` checks `next.ClockOutDate.HasValue` instead of `next.ClockInDate` — harmless today, fixed in 5.13.

### A.3 The two lookup rules, applied to Attendance

| Kind | Attendance fields | Find "day D" with |
| --- | --- | --- |
| Instant | `ClockInDate`, `ClockOutDate`, `AttendanceRecord.Date` | `calendar.DayRangeUtc(D)` = `[StartOfDayUtc(D), StartOfDayUtc(D+1))` |
| Calendar date | `WeekCommencing` (bonus, snapshot, events), `ActiveWorkStaffAssignment.Date`, `ResourceAllocation.Date`, absence start/end — in memory with `calendar.DayOf` | `calendar.DayRangeUtc(D)` — the same team-day range; London midnight, end-of-day and other times of that day all fall inside |

### A.4 ATT phases

---

#### ATT 0 — Decisions and discovery

- [ ] **0.1** Payroll sign-off on A.1 (including B14–B16 night shifts and the 16-hour limit, D12): cap uses the clock-in business day; any worker group with 00:00 start/finish; night-shift groups and `PayPastEndDay`.

- [ ] **0.2** Agree time contracts (section 4.2). Attendance holds the **master copy** of the time kit (`Attendance.Core/Utilities/Time/`, `Attendance.API/Time/`); main Phase 1 builds it here.

- [ ] **0.3** Stored `WeekCommencing` values: the team confirmed `00:00Z` and `23:00Z` (2026-10-06), the D1 shape, so nothing is rewritten. The dev profile adds `22:00Z` and `21:00Z` browser-midnight rows (1,403 in `WageBonus`, 8 in `WageWeekSnapshots`) that the London calendar reads as the Sunday before (4.3, Q16). Consumer audit of `WeekCommencing` and calendar dates (FrameworkCache, Report.API, Frontend `wc`); exact-match consumers move to the team-day range in ATT 8. Also list every **upsert and unique index** keyed on `WeekCommencing` or another calendar date (bonus, snapshot, events, wage records, staff assignments), so each one filters on the team-day range (8.7, 8.12).

- [ ] **0.4** Test that `BsonSerializer.Deserialize<WageRecordApproved2>` (and the other stamped events) keeps the stored time; if not, 3.3 adds a `[BsonConstructor]`.

- [ ] **0.5** List Hangfire recurring jobs per environment (for 10.2).

- [ ] **0.6** `scripts/test-tz-matrix.sh` (UTC, London, Los Angeles, Auckland) as a CI job; record the baseline.

- [ ] **0.7** Trace whether recalculating an old week (D11) runs the **legacy `ClockInOutTimeCalculator`**, which reads `DateTime.Today`'s DST. If it does, the result depends on the date of the recalculation, which breaks D11. Write the finding here. If it does run, the only permitted edit to the frozen `Core/Legacy/` copy is to take the reference date as a parameter, filled from the week being recalculated (needs payroll sign-off; Questions Q3).

---

#### ATT 1 — Safety-net tests (tests only)

Tests go through public methods; xUnit, FluentAssertions, Moq.

- [ ] **1.1** Test data builders (`Core.Tests/TestData/WageTestData.cs`).

- [ ] **1.2** Finish-cap tests (winter/summer, before/after, `PayPastEndDay`, seconds dropped).

- [ ] **1.3** Start-time tests (`ForceStartTime` 08:00Z winter / 07:00Z summer; every start-time source).

- [ ] **1.4** Weekend and standard-hours tests (daily rate, cap).

- [ ] **1.5** Travel and break tests (four apportion modes, single/multi site).

- [ ] **1.6** Bonus, deduction, absence tests.

- [ ] **1.7** `ClockInOutTimeCalculator` tests (start, grace, end, rounding, weekdays; summer and winter).

- [ ] **1.8** `WageWeekDateCalculator` tests (all methods, both DST weeks, every start day).

- [ ] **1.9** Day-window tests for `RecalculateWageRecordHandler`, `WageRecordApprovalHandler`, `DailyRateOverrideHandler`, `ReminderService`.

- [ ] **1.10** One `Current_B<n>` test per row **B1–B16**, pinning today's result (B14: a clock-out after midnight is not matched; B15: report rows cut at the UTC day; B16: night-shift pay by the clock-out weekday).

- [ ] **1.11** `Legacy*` copies of the three calculators (`WageCalculatorExtension`, `ClockInOutTimeCalculator`, `WageWeekDateCalculator`) in **production code** `Core/Legacy/` — used by the switch (D10), old-week recalculation (D11) and shadow compare (13.2). Frozen: no edits (one possible exception: 0.7). **Exempt from every gate and analyzer** (main section 4.9): the copies keep `Europe/London`, `TimeZoneInfo` and `DateTime.Today` on purpose. They are copied **before** 3.9, so they keep `DateTime.Today`.

- [ ] **1.12** Clock-change pay tests: shift Sun 29 Mar 2026 00:00–08:00 London → **7 h**; Sun 25 Oct 2026 00:00–08:00 → **9 h**; clock-in Mon 13 Jul 00:30 BST → day = Mon 13 Jul.

- [ ] **1.13** Other-zone tests, east and west (standard zone set, main 4.3; they show the known gaps until 9.12): Sydney Mon 12 Oct 08:00–16:00 = one record, day Mon 12 Oct; Auckland Mon 12 Oct 07:00 (Sun 11 Oct 18:00Z) → day and week 12 Oct; Dubai Mon 12 Oct 01:00 → week 12 Oct; Sydney Sat 17 Oct 08:00 → Saturday rules; New York Fri 16 Oct 20:00 (Sat 17 Oct 00:00Z) → Friday rules; Los Angeles Sun 18 Oct 22:00 (Mon 19 Oct 05:00Z) → Sunday, week of 12 Oct; night shift 22:00 → 06:00 → one record (D12) in Auckland and in Los Angeles.

**Done when:** green under the four zones, or differences recorded in the baseline.

---

#### ATT 2 — Foundations

- [ ] **2.1** Time kit folders (main 1.1) + reference `Microsoft.Extensions.TimeProvider.Testing`.

- [ ] **2.2** `SystemDateTimeProvider` + tests.

- [ ] **2.3** `ZonedBusinessCalendar` (only class using `TimeZoneInfo`).

- [ ] **2.4** Calendar tests (23:30Z July/January, 16:00 July/January, both DST days, spring gap, `Kind=Utc`, week commencing).

- [ ] **2.5** `UtcBusinessCalendar` + tests (not registered).

- [ ] **2.6** `DayRangeUtc` and `WireDate` + tests.

- [ ] **2.7** DI in API and Background: provider + `ZonedBusinessCalendar(config["BusinessCalendar:Zone"] ?? "Europe/London")`; resolve at startup. This calendar is the **fallback only**; team calendars come from `IBusinessCalendarProvider.ForTeam` (main 4.X.4; precedence in section 4.5).

- [ ] **2.8** Analyzer at warning; record the count.

---

#### ATT 2b — Per-team switch and old weeks (D10, D11)

- [ ] **2b.1** Collection `Attendance:TimeRulesRollout` `{ teamName, newRulesFromWeek (DateOnly), enabled, changedBy, changedAt }`; repo with a short cache. Missing → old rules **until full rollout (2b.7)**; after it see 2b.9.

- [ ] **2b.2** `ITimeRulesSelector.For(team, weekCommencingDay)` → `New` when enabled and the week ≥ `newRulesFromWeek`, else `Legacy`. The start week is always a whole week, so no week mixes old and new rules. A shift is judged by the week of its clock-in business day (2b.8). The legacy calculators are London-only (main 4.9), so for a team whose zone is not London the selector always returns `New`. That team was created with that zone (a zone never changes, D13), so it has no old weeks and D11 is not affected.

- [ ] **2b.3** Wage calculation, clock rules and day checks ask the selector and call the new code or `Core/Legacy/` (1.11). One PR per call site group (wage handlers, clock handlers, reminders, reports).

- [ ] **2b.4** Admin endpoint (support role only) to switch a team on/off and set the start week; every change logged. Week boundaries use `ForTeam(dataTeam)`, not the caller's headers (main 4.5). **Switching off is refused for a team whose zone is not London.**

- [ ] **2b.5** Switching **off** (London teams only) queues a recalculation of that team's weeks since `newRulesFromWeek` with the old rules; result compared and logged. It reverses calculation only, not clock times written (B6–B8) or pairing ids (B14); see A.1.

- [ ] **2b.6** Recalculation of any week before `newRulesFromWeek` uses the old rules — including `Rebuild*Handler`s. *Test: rebuild a 2025 week after switch-on → identical result.*

- [ ] **2b.7** Rollout: one UK team on → 1–2 payroll weeks compared (13.2) → finance OK → all teams on.

- [ ] **2b.8** **Shift across the switch-on week** *(proposed; payroll confirms in 0.1, Questions Q2)*: the rule set is chosen **once per shift, by the week of its clock-in business day**, and a clock-out in the next week does not change it. A shift that clocks in in the last old week and out in the first new week is matched, paid and reported under the **old** rules (today's behaviour; B14 does not apply to it). A shift that clocks in in the first new week uses the new rules throughout. *Tests: clock-in Sun 22:00 and clock-out Mon 06:00 across the start week; the same events replayed with the switch on and off.*

- [ ] **2b.9** **New teams after full rollout.** When 2b.7 completes, store `Attendance:TimeRulesRollout:FullRolloutFrom` (a date). `TeamCreatedHandler` writes a rollout row `{ enabled = true, newRulesFromWeek = the team's first full week }` for every team created on or after that date, and the selector treats a missing row for such a team as `New`. Teams created before it and still without a row stay on the old rules until switched on. *Test: a team created after the date runs the new rules from its first week.*

---

#### ATT 3 — Clock reads (no behaviour change)

- [ ] **3.1** Remove clock reads from log text.

- [ ] **3.2** Provider in the three user clock handlers.

- [ ] **3.3** Event stamps take `performedAtUtc` from the handler (one PR per event if large).

- [ ] **3.4** Models: remove `Team.Updated` initialiser; `User` / `ResourceAllocation` methods take `nowUtc`.

- [ ] **3.5** Repositories: provider for stamps; `TimeProvider` for cache expiry.

- [ ] **3.6** Background handlers: provider; `DateTime.Now` → `clock.UtcNow`.

- [ ] **3.7** `WageCalculaterHelper` "today" via the provider.

- [ ] **3.8** `ReminderService`: one `nowUtc` per method.

- [ ] **3.9** `ClockInOutTimeCalculator`: `DateTime.Today` → `nowUtc` parameter (removed in 6.4). Live code only; the frozen `Core/Legacy/` copy keeps `DateTime.Today` (main 4.9).

- [ ] **3.10** Clock symbols to error (`Core/Legacy/**` excluded, main 4.9).

---

#### ATT 4 — Incoming dates (tolerant)

- [ ] **4.1** Meter `attendance.time.nonconforming`.

- [ ] **4.2** `WageController`: 17 × `WireDate.TryParseUtc`.

- [ ] **4.3** `AttendanceController`: 4 × `WireDate`.

- [ ] **4.4** `FilterAndSortExtension`: `WireDate`.

- [ ] **4.5** `GetWagesByProjectIdHandler`: `WireDate`; keep and document the inclusive end.

- [ ] **4.6** `GetMyWageWeekSnapshotsHandler`: drop `SpecifyKind` after 4.7.

- [ ] **4.7** JSON converters (tolerant), responses with `Z`.

- [ ] **4.8** Mongo serializer (tolerant) + per-repository read test (Mongo test container if needed).

- [ ] **4.9** **\[B12\]** Legacy override date as a UTC constant.

---

#### ATT 5 — Wage calculator (`WageCalculatorExtension`)

- [ ] **5.1** Add `IBusinessCalendar calendar` to the public methods and helpers (unused yet); update `RecalculateWageRecordHandler` and `DailyRateOverrideHandler` and their tests.

- [ ] **5.2** `TruncateToMinuteUtc` in start and finish.

- [ ] **5.3** **\[B3, B4\]** `shiftDay = calendar.DayOf(clockIn)` in `EstablishDuration`; start time via `AtTimeOfDayUtc(shiftDay, start)`.

- [ ] **5.4** **\[B1, B2, B4\]** Finish time via `AtTimeOfDayUtc(shiftDay, finish)` — the **clock-in** day. *Tests: summer Fri 06:55Z → 23:30Z capped at Fri 15:00Z; winter Fri 07:55Z → Sat 00:30Z capped at Fri 16:00Z.*

- [ ] **5.5** **\[B3\]** Standard hours and weekend checks on `DateOnly`.

- [ ] **5.6** Break allowance by business day.

- [ ] **5.7** **\[B5\]** Group records by business day (`Dictionary<DateOnly, …>`); delete `GetDateKey`.

- [ ] **5.8** **\[B5\]** Bonus day count by business day.

- [ ] **5.9** **\[B5\]** Deduction by business day. *Tests: `2026-07-06T23:00Z` and `2026-07-07T00:00Z` are both 7 July.*

- [ ] **5.10** Absent days as `List<DateOnly>`; update the handler signature and XML comment.

- [ ] **5.11** Delete `_timezoneName`, `InteropServices` using and the old note. *Gate: no zone code left in the file.*

- [ ] **5.12** Handler: drop `RemoveDstSideEffect(x).Date` for allocation dates; use `calendar.DayOf(x)`.

- [ ] **5.13** Fix the `GetTotalTravelTime` null check.

- [ ] **5.14** **\[B16\]** `GetDefaultStartTime` / `GetDefaultFinishTime` / `IsSaturday` / `IsSunday` (lines 344-350, 628-704): pick weekday settings from `shiftDay` (clock-in business day), never from the clock-out; when the finish time ≤ start time, finish = `AtTimeOfDayUtc(shiftDay + 1, finish)`. *Tests: Sat 22:00 → Sun 06:00 uses Saturday settings and pays 8 h; group 22:00–06:00 across 25 Oct 2026 pays 9 h.* Payroll confirms in ATT 0.1.

---

#### ATT 6 — Clock-in/out rules

- [ ] **6.1** Make `ClockInOutTimeCalculator` injectable (`IClockInOutTimeCalculator` with the calendar); update five handlers and their tests.

- [ ] **6.2** `Kind=Utc` outputs.

- [ ] **6.3** **\[B7\]** Weekday from the business day; delete the wrong `IsWeekday`.

- [ ] **6.4** **\[B6, B7\]** Start time via `AtTimeOfDayUtc(day, start)`. *Test: on 1 Nov, entering 20 Oct 07:30 BST with start 08:00 → 07:00Z (today: wrongly 08:00Z).*

- [ ] **6.5** Grace period on instants; delete the midnight workaround.

- [ ] **6.6** **\[B6, B7\]** End time via the calendar (clock-out's own business day; the wage calculator applies the shift-day rule — confirmed in 0.1).

- [ ] **6.7** Rounding on UTC minutes; delete `ConvertTimeFromLondonToUTC`.

- [ ] **6.8** **\[B8\]** `IsFirstSignInForDate` by business day.

- [ ] **6.9** Overlap messages via `calendar.ToBusinessLocal`.

- [ ] **6.10** **\[B14\]** `CanClockOut` and `GetClockedInAttendance`: latest open clock-in (same project for `CanClockOut`) with clock-in within `MaxShiftHours` (16) before the clock-out — no day comparison (D12).

- [ ] **6.11** `UserCanClockIn` by business day; `GetOverlappingAttendance` compares time windows of records from the last 24 h instead of "same UTC day".

- [ ] **6.12** Event replay stays exact: new `UserClockedOut` and supervisor clock-out events carry the matched `ClockInId` (optional field); `OnClockOut` and line 319 use `GetAttendanceByClockInId` when it is set, else the **old** UTC-day rule — so old events replay exactly as before. *Test: replay a 2025 stream → identical records.*

---

#### ATT 7 — Week commencing (`WageWeekDateCalculator`)

Stored `WeekCommencing` = midnight of the week day in the team's zone, as UTC = `calendar.StartOfDayUtc(day)` (D1). ATT 7 keeps that shape for every team; for London it is the value stored today.

- [ ] **7.1** New API beside the old one:

  ```csharp
  DateOnly WeekCommencingDay(DateTime utcInstant, DayOfWeek startDay);
  DateOnly WeekCommencingDay(DateOnly day, DayOfWeek startDay);
  DateTime ToStoredWeekCommencing(DateOnly weekDay);
  DateOnly FromStoredWeekCommencing(DateTime stored);
  (DateTime FromUtc, DateTime ToUtc) WeekRangeUtc(DateOnly weekDay);
  ```

  `ToStoredWeekCommencing` is `calendar.StartOfDayUtc(weekDay)`; `FromStoredWeekCommencing` is `calendar.DayOf(stored)`. *Results equal the old methods for every case in 1.8.*

- [ ] **7.2** `RecalculateStaffWeekWagesAsync` overload 1.

- [ ] **7.3** `WageRecordApprovalHandler` week and range.

- [ ] **7.4** `WageCalculaterHelper` overloads 2 and 3 (one PR each).

- [ ] **7.5** `RebuildAndRecalculateStaffWeekWagesDirectlyAsync` and both absence handlers.

- [ ] **7.6** **\[B9\]** `RecalculateWageRecordHandler` week validation and `WeekRangeUtc`.

- [ ] **7.7** Review `StaffMemberMetaUpdatedHandler` / `WageHelper.GetLatestWeekCommencingForStaffAsync`.

- [ ] **7.8** Delete the old methods and the zone field.

---

#### ATT 8 — Lookups by the team's day

Stored `WeekCommencing` has two main shapes, `Mon 00:00Z` (winter) and `Sun 23:00Z` (summer), both London midnight (ATT 0.3), and both fall inside the team-day range of the Monday. Every lookup uses `calendar.DayRangeUtc` (or `WeekRangeUtc`), so no stored value changes. The 1,403 browser midnights (`Sun 22:00Z`, `Sun 21:00Z`) in `WageBonus` fall on the Sunday before, as today (4.3, Q16). Every ATT 8 test runs on both London shapes and one browser-midnight row.

- [ ] **8.1** `WageBonusRepo` → the team-day range. *A bonus stored at `2026-07-05T23:00Z` is found for week 6 July; a new bonus for that week is written with the same value; a bonus at `2026-07-05T22:00Z` is not found for 6 July (known, Q16).*

- [ ] **8.2** `WageWeekSnapshotsRepo` (and `GetAllForWeekAsync`).

- [ ] **8.3** `WageEventsRepo` → `Gte/Lt` window.

- [ ] **8.4** `GetStaffIdsGroupedByWeekCommencingAsync` → `WeekRangeUtc`; remove the TODO.

- [ ] **8.5** Earliest attendance: return the instant / `DayOf`.

- [ ] **8.6** `UserAttendanceRepo` and `ResourceAllocationRepo` by the team-day range (`calendar.DayRangeUtc`).

- [ ] **8.7** `StaffAssignmentRepo` upsert keyed by `StaffAssignmentId` (+ team, work, staff) with the team-day range — prevents duplicates when ActiveWork sends the same day with another time (end-of-day `22:59Z`/`23:59Z` rows, 4.3).

- [ ] **8.8** **\[B10\]** Daily-rate override by business day.

- [ ] **8.9** `GetProjectWagesForPeriodHandler` `WageDate` by business day (contract agreed with Frontend in 0.3).

- [ ] **8.10** **\[B11\]** `ReminderService`: `today = calendar.DayOf(clock.UtcNow)`; windows; remove the zone field.

- [ ] **8.11** **\[B15\]** Report handlers (`GetRangedWagesPerDayHandler`, `GetUserWagesAttendanceForPeriodHandler`, `GetTeamWagesAttendanceForPeriodHandler`, `GetAttendanceForRangeHandler:30`): range from the team's day boundaries (inclusive end computed once); rows grouped by `calendar.DayOf(clockIn)`.

- [ ] **8.12** Other upserts, finds-then-inserts and unique indexes on `WeekCommencing` or another calendar date (bonus, snapshot, events, wage records — the list comes from 0.3): the filter uses the team-day range, so a London-midnight row and an end-of-day row of the same day are one key. Without this a second row of the same day is inserted and a bonus can be doubled.

---

#### ATT 9 — Removed (D1 changed 2026-10-07)

`WeekCommencing` keeps the team's midnight (ATT 7), so there is no flag and no flip. The IDs 9.1 and 9.2 stay unused so old references resolve.

---

#### ATT 10 — Hangfire

- [ ] **10.1** Team zone in Attendance's team copy (main 6.T.4a, in Phase 1b) — must be released first.

- [ ] **10.2** Reminders per team and idempotent sends (main 4.S.2, 4.S.3).

- [ ] **10.3** Registrar: per-team jobs at 08:00/16:00 **team local time** in the team zone; legacy global ids removed (main 4.S.4).

- [ ] **10.4** Team handlers re-register on create/update/deactivate (main 4.S.5).

---

#### ATT 11 — Remaining helpers

- [ ] **11.1** Delete `WageHelperLegacy` (never injected) with its interface, registration and commented code.

- [ ] **11.2** `WageHelper.CalcStdWage` via the calendar; pay formula unchanged; tests first.

- [ ] **11.3** `WageRecordsRepo` (:194-200): delete the unused `potentialDeductions` query (its `.DayOfWeek` projection is computed by Mongo in UTC) and the commented-out code that used it. Nothing reads the result, so behaviour does not change; if no-show deductions come back, they are written on business days (`calendar.DayOf`).

---

#### ATT 12 — Cut-over and gates

- [ ] **12.1** Dockerfiles: keep **no** `TZ`; confirm zone resolves and process is UTC; enable the blocking gate (main 9.7).

- [ ] **12.2** Zone matrix becomes a required check.

- [ ] **12.3** Analyzer to error; zone-name grep gate; ban `P:System.DateTime.Date` in Attendance outside the calendar and `Core/Legacy/` (stops new "UTC day" checks — the audit counted \~90). `Core/Legacy/` is the documented exemption (main 4.9).

- [ ] **12.4** Strict mode when counters stay at 0 and old builds are retired.

- [ ] **12.5** Drift check green: Attendance's kit matches `time-kit.version` (a package swap is a later, separate decision — D8).

---

#### ATT 13 — Verification

- [ ] **13.1** Zone matrix identical; differences only in `After_` tests.

- [ ] **13.2** Wage shadow compare (`Legacy*` vs new) for a summer and a winter payroll cycle, first for the pilot team (2b.7) then all; every difference maps to B1–B16; finance signs off.

- [ ] **13.3** Clock-rule shadow compare; differences map to B6/B7.

- [ ] **13.4** Old-shape data in staging for every ATT 8 lookup.

- [ ] **13.5** Release order: API + Background together; ATT 7 before ATT 8; monitor counters for one payroll cycle after each wage release.

- [ ] **13.6** After one stable cycle: delete replaced `Current_` tests and unused compatibility code. **Keep `Core/Legacy/` and the switch** while old weeks can still be recalculated (D11); finance decides when old weeks are closed.

---

#### ATT 14 — UTC business days (only if D3 decides so)

- [ ] **14.1** Shadow report zoned vs UTC for a full payroll cycle; finance review.

- [ ] **14.2** Flip `BusinessCalendar:Mode=Utc` — per service, not per team; the team zone is then ignored for business days but still used for display (main 4.5; only if D3 is ever changed to UTC); Hangfire follows.

- [ ] **14.3** If final, delete `ZonedBusinessCalendar` and the switch.

---

### A.5 ATT order at a glance

| ATT phase | Steps | Behaviour change | Needs |
| --- | --- | --- | --- |
| 0 Decisions | 7 | no | — |
| 1 Safety-net tests | 13 | no | 0.6 |
| 2 Foundations | 8 | no | 0.2 |
| 2b Per-team switch | 9 | no (switch starts off) | 2, 1.11 |
| 3 Clock reads | 10 | no | 2.7 |
| 4 Incoming dates | 9 | B12 | 2.6, 4.1 |
| 5 Wage calculator | 14 | B1–B5, B16 | 1, 2.7, 0.1 |
| 6 Clock rules | 12 | B6–B8, B14 | 1.7, 3.9, 0.1, 2b |
| 7 Week commencing | 8 | B9 | 1.8, 5.1 |
| 8 Lookups | 12 | B10, B11, B15 | 7.1, 2b |
| 10 Hangfire | 4 | no (London by default; zone follows the team, D13) | 2.7, 0.5, main 6.T.4a (Phase 1b), 1.10c |
| 11 Helpers | 3 | no | 2.7 |
| 12 Cut-over | 5 | no | 3–11 |
| 13 Verification | 6 | — | each release |
| 14 UTC days (optional) | 3 | yes | 13 |

ATT 3, 4, 10 and 11 can run alongside ATT 5. ATT 6 and 7 can run in parallel after ATT 2 and 2b. The per-team switch controls B1–B11 and B14–B16 as A.1 describes; B12 is global (B13 was removed with the D1 change), and B6–B8 and B14 leave stored values behind when a team is switched off.

### A.6 Charts

**ATT steps per phase** (A.5):

```text
ATT steps per phase (123 in all)

5  Wage calculator      ████████████████████████████████████████  14
1  Safety-net tests     █████████████████████████████████████     13
6  Clock rules          ██████████████████████████████████        12
8  Lookups              ██████████████████████████████████        12
3  Clock reads          █████████████████████████████             10
2b Per-team switch      ██████████████████████████                 9
4  Incoming dates       ██████████████████████████                 9
2  Foundations          ███████████████████████                    8
7  Week commencing      ███████████████████████                    8
0  Decisions            ████████████████████                       7
13 Verification         █████████████████                          6
12 Cut-over             ██████████████                             5
10 Hangfire             ███████████                                4
11 Helpers              █████████                                  3
14 UTC days (optional)  █████████                                  3
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| Number before the name | The ATT phase (A.4). | `6 Clock rules` = ATT 6 |
| Bar and number | Steps in that phase. | ATT 5 has 14 steps |
| 14 UTC days (optional) | Runs only if D3 decides so; not counted in "Steps per repo". | ATT 14.1 |

**Behaviour changes by what controls them** (A.1, 15 changes; B13 removed):

```text
Behaviour changes B1–B16 (without B13) by control

Per-team switch: wage calculation                 ██████████████████                        7   47 %
Per-team switch: clock rules                      ████████                                  3   20 %
Per-team switch: day windows, reminders, reports  ████████                                  3   20 %
Per-team switch: night-shift matching             ██                                        1    7 %
Global, always on                                 ██                                        1    7 %
Total                                                                                       15  100 %
```

**Legend**

| Label | Changes | Example |
| --- | --- | --- |
| Per-team switch: wage calculation | B1–B5, B9, B16 | B2: a winter clock-out after midnight is capped at the clock-in day's finish |
| Per-team switch: clock rules | B6–B8 | B6: a back-dated clock uses the clock date's offset, not today's |
| Per-team switch: day windows, reminders, reports | B10, B11, B15 | B11: "clocked in today" uses the UK business day |
| Per-team switch: night-shift matching | B14 | a clock-out after midnight matches the open clock-in within 16 h |
| Global, always on | B12 | legacy override date returned with `Z` |

**ATT order** (A.5):

```text
ATT 0   decisions
  │
  ▼
ATT 1   safety-net tests
  │
  ▼
ATT 2   foundations
  │
  ▼
ATT 2b  per-team switch (ships off)
  │
  ├──► ATT 5   wage calculator (alongside: ATT 3, 4, 10, 11) ───┐
  ├──► ATT 6   clock rules ─────────────────────────────────────┤
  └──► ATT 7   week commencing                                  │
         │                                                      │
         ▼                                                      │
       ATT 8   lookups ─────────────────────────────────────────┤
                                                                ▼
                                                     ATT 12  cut-over (after ATT 3–11)
                                                                │
                                                                ▼
                                                     ATT 13  verification, every release
                                                                │
                                                                ▼
                                                     ATT 14  UTC days (optional, D3)
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| `──►` | Must finish first. | ATT 7 before ATT 8 |
| alongside | Can run at the same time. | ATT 3 clock reads beside ATT 5 |
| ships off | The per-team switch is deployed switched off (D10). | no team changes until ATT 2b.7 |

---

## Appendix B — Dev calendar-date profile (2026-10-06)

A read-only scan of the dev cluster with a profile script (retired 2026-10-07 after its results were merged here): every value of the 116 calendar-date paths (team-local migration report Appendix A) counted by UTC time of day and month. No data or code changed. Dev data includes testers and scripts, so it shows what the code can write; a production run (B.9, optional) only sizes Q16. The results are used in D1, D4, 4.3, 0.12 and Phase 5.

**Answer on dev:** 32 of 116 fields hold `00:00Z`; 55 hold London midnight (the D1 shape) or other shapes; 20 are not calendar dates at all, they hold a real time (instants, 4.3); 9 are empty. Nothing is rewritten (D4): read with the London calendar every shape gives the right day except browser midnights east of London (4.3, Q16).

### B.1 At a glance

```text
Calendar-date fields by what dev stores (116)

1 Already date-only        ████████████████████████████████████████  32
2 London midnight          ███████████████████████████████           25
3 Assignment days, mixed   ███████████                                9
4 Team subscription dates  ██████████████████████████                21
5 Really timestamps        █████████████████████████                 20
6 Empty                    ███████████                                9
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| 1 Already date-only | `00:00Z` all year (a handful of odd rows at most). | `Resources:HrBankHolidays.Date` |
| 2 London midnight | `00:00Z` in winter, `23:00Z` in summer (the day before). | `Attendance:WageBonus.WeekCommencing` |
| 3 Assignment days, mixed | London midnight plus end-of-day, browser-midnight and real-time rows. | `ActiveWork:StaffAssignments.Date` |
| 4 Team subscription dates | Mostly `21:00Z`/`22:00Z`: midnight in a UTC+3/UTC+2 browser. | `SubscriptionInformation.StartDate` |
| 5 Really timestamps | Real times of day; listed as calendar dates by mistake. | `Materials:OrderRequests.DeliveryDate` |
| 6 Empty | No values on dev. | `Handovers:HandoverClaimTransactions.ClaimDate` |

```text
Rows scanned per group (dev)

1 Already date-only        ██████████████                            130575
2 London midnight          ███████████████████████████████           286298
3 Assignment days, mixed   ████████████████████████████████████████  374705
4 Team subscription dates  █                                           1283
5 Really timestamps        ████████████████████████████              262476
```

**Legend**

| Label | Meaning | Example |
| --- | --- | --- |
| Rows | Values found in the group's fields, array elements counted one by one. | `WageBonus.WeekCommencing` alone has 277,156 |

### B.2 Shapes found

| Stored time (UTC) | Biggest field | Likely meaning | Correct day | London `calendar.DayOf` |
| --- | --- | --- | --- | --- |
| `00:00` | everywhere | date-only, or London midnight in winter | that day | ✅ |
| `23:00`, summer months only | `WageBonus.WeekCommencing` 239,575 | London midnight in summer | the next UTC day | ✅ |
| `23:59` / `22:59` | `StaffAssignments.Date` 10,172 | end of the London day (23:59 GMT / BST) | the same London day | ✅ |
| `21:00` / `22:00` | subscription dates, `WageBonus` 1,403 | midnight in a browser at UTC+3 (summer) / UTC+2 (winter) | the next UTC day | ❌ the day before (Q16) |
| `23:00` in winter months | `PrelimsIncomeTransactions.date` 133 | midnight in a UTC+1 browser in winter | the next UTC day | ❌ the day before (Q16) |
| `01:00` | `Forecasting:RoleAllocations.Date` 282 | an hour after midnight; likely a summer conversion applied the wrong way | that day | ✅ |
| `02:00`, `03:00` | `Handovers` 27 | an hour or two after midnight | that day | ✅ |
| one time many times (`16:13` × 90) | Prelims transactions | one import stamped every row | needs a look | the London day of that time |
| scattered times | thousands in group 3 | the current time saved instead of a picked day | the London day of that moment | ✅ |

### B.3 Group 1 — Already date-only (32 fields)

**In the plan:** not rewritten (D4). `00:00Z` reads as the right day with the London calendar, in summer too (01:00 BST). New rows are written as the team's midnight (D1), so a summer row is `23:00Z` the day before, which reads as the same day. The `22:00Z`/`21:00Z` odd rows are browser midnights (Q16).

| Collection | Path | Rows | `00:00` | `23:00` | `23:00` winter | `23:59`/`22:59` | Other | Top other times |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Attendance:ResourceAllocations` | `Date` | 440 | 398 | 0 | 0 | 0 | 42 | 14:44=18 15:01=6 08:27=3 16:56=3 |
| `Attendance:StaffMemberAbsence` | `StartDate` | 36,479 | 36,183 | 155 | 0 | 0 | 141 | 01:00=126 22:00=13 12:30=2 |
| `Attendance:StaffMemberAbsence` | `EndDate` | 36,479 | 36,183 | 155 | 0 | 0 | 141 | 01:00=126 22:00=13 16:00=2 |
| `Forecasting:RoleAllocations` | `Date` | 1,080 | 798 | 0 | 0 | 0 | 282 | 01:00=282 |
| `Forecasting:StaffAllocations` | `Date` | 582 | 498 | 0 | 0 | 0 | 84 | 01:00=42 14:44=18 15:01=6 08:27=3 |
| `Inspections:HsInspections` | `Sections[].Answers[].DateAnswer` | 17,334 | 16,916 | 396 | 0 | 0 | 22 | 22:00=11 21:00=11 |
| `Materials:StaffMembers` | `EndDate` | 186 | 186 | 0 | 0 | 0 | 0 | — |
| `Materials:VehicleUnavailabilities` | `StartDate` | 110 | 110 | 0 | 0 | 0 | 0 | — |
| `Materials:VehicleUnavailabilities` | `EndDate` | 110 | 110 | 0 | 0 | 0 | 0 | — |
| `Jobs:ExternalMoneyTransactions` | `transactionDate` | 14 | 14 | 0 | 0 | 0 | 0 | — |
| `Jobs:Quotations` | `obtainedSections[].information.orderReceivedDate` | 48 | 48 | 0 | 0 | 0 | 0 | — |
| `Jobs:Quotations` | `obtainedSections[].information.commencementOnSiteDate` | 48 | 48 | 0 | 0 | 0 | 0 | — |
| `Jobs:Quotations` | `obtainedSections[].information.contractedCompletionDate` | 48 | 48 | 0 | 0 | 0 | 0 | — |
| `Jobs:Quotations` | `obtainedSections[].information.completionOfDesignDate` | 15 | 15 | 0 | 0 | 0 | 0 | — |
| `Jobs:Quotations` | `obtainedSections[].information.completionOfRAMSDate` | 48 | 48 | 0 | 0 | 0 | 0 | — |
| `Jobs:QuotationVersions` | `valuationDates[].date` | 293 | 293 | 0 | 0 | 0 | 0 | — |
| `Jobs:QuotationVersions` | `dueDate` | 36 | 36 | 0 | 0 | 0 | 0 | — |
| `Jobs:QuotationVersions` | `startDate` | 54 | 54 | 0 | 0 | 0 | 0 | — |
| `Jobs:QuotationVersions` | `endDate` | 46 | 46 | 0 | 0 | 0 | 0 | — |
| `Jobs:QuotationVersions` | `contractPerformanceStartDate` | 13 | 13 | 0 | 0 | 0 | 0 | — |
| `Jobs:QuotationVersions` | `finalReviewDate` | 10 | 10 | 0 | 0 | 0 | 0 | — |
| `Resources:Customer:StaffMembers` | `DateOfBirth` | 1 | 1 | 0 | 0 | 0 | 0 | — |
| `Resources:StaffMembers` | `StartDate` | 487 | 487 | 0 | 0 | 0 | 0 | — |
| `Resources:StaffMembers` | `EndDate` | 447 | 447 | 0 | 0 | 0 | 0 | — |
| `Resources:HrEmployees` | `EndDate` | 1,344 | 1,336 | 0 | 0 | 0 | 8 | 16:08=2 08:50=2 16:19=2 16:16=2 |
| `Resources:HrEmployees` | `Birthday` | 1,440 | 1,440 | 0 | 0 | 0 | 0 | — |
| `Resources:HrEmployees` | `StartDate` | 1,657 | 1,657 | 0 | 0 | 0 | 0 | — |
| `Resources:HrAbsences` | `StartDate` | 6,666 | 6,664 | 0 | 0 | 0 | 2 | 12:30=2 |
| `Resources:HrAbsences` | `EndDate` | 6,666 | 6,664 | 0 | 0 | 0 | 2 | 16:00=2 |
| `Resources:StaffMemberAbsence` | `StartDate` | 9,021 | 9,008 | 0 | 0 | 0 | 13 | 22:00=13 |
| `Resources:StaffMemberAbsence` | `EndDate` | 9,021 | 9,008 | 0 | 0 | 0 | 13 | 22:00=13 |
| `Resources:HrBankHolidays` | `Date` | 352 | 352 | 0 | 0 | 0 | 0 | — |

### B.4 Group 2 — London midnight (25 fields)

**In the plan:** already the D1 shape; not rewritten (D4). The `21:00Z`/`22:00Z` rows are browser midnights (Q16).

| Collection | Path | Rows | `00:00` | `23:00` | `23:00` winter | `23:59`/`22:59` | Other | Top other times |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ActiveWork:ActiveWorkRecords` | `ExpectedHandoverDate` | 642 | 310 | 329 | 0 | 0 | 3 | 02:00=2 13:15=1 |
| `Attendance:WageWeekSnapshots` | `WeekCommencing` | 1,159 | 459 | 692 | 0 | 0 | 8 | 22:00=6 21:00=2 |
| `Attendance:WageWeekSnapshots` | `Week[].Bonus.WeekCommencing` | 395 | 162 | 230 | 0 | 0 | 3 | 22:00=3 |
| `Attendance:WageBonus` | `WeekCommencing` | 277,156 | 36,178 | 239,575 | 0 | 0 | 1,403 | 22:00=1366 21:00=37 |
| `Materials:Vehicles` | `RegDate` | 269 | 114 | 150 | 0 | 0 | 5 | 22:00=3 21:00=2 |
| `Materials:Vehicles` | `PurchaseDate` | 273 | 116 | 152 | 0 | 0 | 5 | 22:00=3 21:00=2 |
| `Materials:Vehicles` | `SoldDate` | 19 | 7 | 12 | 0 | 0 | 0 | — |
| `Materials:Vehicles` | `LastServiceDate` | 11 | 1 | 10 | 0 | 0 | 0 | — |
| `Materials:Vehicles` | `NextServiceDue` | 12 | 0 | 12 | 0 | 0 | 0 | — |
| `Materials:Vehicles` | `MotExpiryDate` | 16 | 0 | 16 | 0 | 0 | 0 | — |
| `Materials:Vehicles` | `InsuranceExpiryDate` | 16 | 1 | 15 | 0 | 0 | 0 | — |
| `Materials:Vehicles` | `RoadTaxExpiryDate` | 13 | 1 | 12 | 0 | 0 | 0 | — |
| `Jobs:Customer:Jobs` | `startDate` | 6 | 4 | 0 | 0 | 0 | 2 | 21:00=1 22:00=1 |
| `Jobs:Customer:Jobs` | `endDate` | 8 | 5 | 1 | 0 | 0 | 2 | 21:00=1 22:00=1 |
| `Jobs:Jobs` | `securedSections[].information.orderReceivedDate` | 1,353 | 1,236 | 112 | 0 | 0 | 5 | 22:00=5 |
| `Jobs:Jobs` | `securedSections[].information.commencementOnSiteDate` | 1,353 | 955 | 373 | 1 | 0 | 25 | 21:00=13 22:00=12 |
| `Jobs:Jobs` | `securedSections[].information.contractedCompletionDate` | 1,353 | 914 | 412 | 0 | 0 | 27 | 21:00=15 22:00=12 |
| `Jobs:Jobs` | `securedSections[].information.completionOfDesignDate` | 796 | 610 | 174 | 0 | 0 | 12 | 22:00=7 21:00=5 |
| `Jobs:Jobs` | `securedSections[].information.completionOfRAMSDate` | 1,175 | 873 | 274 | 1 | 0 | 28 | 21:00=14 22:00=14 |
| `Jobs:Jobs` | `contractPerformanceSettings.userInputDate` | 5 | 3 | 1 | 0 | 0 | 1 | 21:00=1 |
| `Jobs:ExternalValuationTransactions` | `transactionDate` | 15 | 14 | 1 | 0 | 0 | 0 | — |
| `Jobs:PublishedJobs` | `lastSnapshot.startDate` | 6 | 4 | 0 | 0 | 0 | 2 | 21:00=1 22:00=1 |
| `Jobs:PublishedJobs` | `lastSnapshot.endDate` | 8 | 5 | 1 | 0 | 0 | 2 | 21:00=1 22:00=1 |
| `Resources:StaffMembers` | `Qualifications[].ExpiryDate` | 201 | 86 | 106 | 0 | 0 | 9 | 22:00=8 21:00=1 |
| `Resources:StaffMembers` | `DateOfBirth` | 38 | 28 | 4 | 0 | 0 | 6 | 22:00=6 |

### B.5 Group 3 — Assignment days, several shapes (9 fields)

**In the plan:** not rewritten (D4). London midnight, end-of-day (`23:59`/`22:59`), `01:00`–`03:00` and real-time rows all read as the right day with the London calendar (4.3); lookups and upserts use the team-day range (5.12, ATT 8.7). Browser midnights are Q16; the `16:13` import is checked in Q15.

| Collection | Path | Rows | `00:00` | `23:00` | `23:00` winter | `23:59`/`22:59` | Other | Top other times |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ActiveWork:ActiveWorkRecords` | `StaffDayAssignments[].Date` | 70,652 | 23,010 | 33,334 | 0 | 5,256 | 14,308 | 23:59=2686 22:59=2570 21:00=506 22:00=407 |
| `ActiveWork:ActiveWorkRecords` | `StartDate` | 32,384 | 12,665 | 14,648 | 0 | 0 | 5,071 | 07:00=528 05:00=456 06:00=352 08:00=103 |
| `ActiveWork:StaffAssignments` | `Date` | 135,325 | 42,032 | 66,042 | 0 | 10,172 | 27,251 | 23:59=5448 22:59=4724 15:48=362 21:00=328 |
| `Attendance:StaffAssignments` | `Date` | 108,665 | 33,005 | 52,650 | 0 | 10,178 | 23,010 | 23:59=5456 22:59=4722 15:48=360 21:00=323 |
| `Handovers:Handovers` | `StaffDayAssignments[].Date` | 24,891 | 9,907 | 13,103 | 0 | 0 | 1,881 | 22:00=145 21:00=88 05:03=65 02:00=27 |
| `Jobs:Jobs` | `startDate` | 661 | 366 | 61 | 0 | 0 | 234 | 11:11=5 22:00=4 13:14=3 13:54=3 |
| `Jobs:Jobs` | `endDate` | 697 | 361 | 100 | 1 | 0 | 236 | 11:11=5 22:00=4 13:14=3 13:54=3 |
| `Jobs:PrelimsCostTransactions` | `date` | 359 | 207 | 62 | 21 | 0 | 90 | 16:13=90 |
| `Jobs:PrelimsIncomeTransactions` | `date` | 1,071 | 759 | 222 | 133 | 0 | 90 | 16:13=90 |

### B.6 Group 4 — Team subscription dates (21 fields)

**In the plan:** not rewritten (D4). Most rows are browser midnights (`22:00Z`/`21:00Z`) that read as the day before: a subscription start or stop one day early. Fixing them is Q16.

| Collection | Path | Rows | `00:00` | `23:00` | `23:00` winter | `23:59`/`22:59` | Other | Top other times |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ActiveWork:Teams` | `SubscriptionInformation.StartDate` | 82 | 6 | 19 | 0 | 0 | 57 | 22:00=34 21:00=23 |
| `ActiveWork:Teams` | `SubscriptionInformation.BetaPeriodEndDate` | 56 | 2 | 6 | 0 | 0 | 48 | 22:00=30 21:00=18 |
| `ActiveWork:Teams` | `SubscriptionInformation.StoppedDate` | 47 | 1 | 3 | 0 | 0 | 43 | 22:00=30 21:00=13 |
| `Attendance:Teams` | `SubscriptionInformation.StartDate` | 82 | 6 | 19 | 0 | 0 | 57 | 22:00=34 21:00=23 |
| `Attendance:Teams` | `SubscriptionInformation.BetaPeriodEndDate` | 56 | 2 | 6 | 0 | 0 | 48 | 22:00=30 21:00=18 |
| `Attendance:Teams` | `SubscriptionInformation.StoppedDate` | 47 | 1 | 3 | 0 | 0 | 43 | 22:00=30 21:00=13 |
| `Handovers:Teams` | `SubscriptionInformation.StartDate` | 80 | 5 | 19 | 0 | 0 | 56 | 22:00=33 21:00=23 |
| `Handovers:Teams` | `SubscriptionInformation.BetaPeriodEndDate` | 55 | 1 | 6 | 0 | 0 | 48 | 22:00=30 21:00=18 |
| `Handovers:Teams` | `SubscriptionInformation.StoppedDate` | 46 | 0 | 3 | 0 | 0 | 43 | 22:00=30 21:00=13 |
| `Inspections:Teams` | `SubscriptionInformation.StartDate` | 80 | 5 | 19 | 0 | 0 | 56 | 22:00=33 21:00=23 |
| `Inspections:Teams` | `SubscriptionInformation.BetaPeriodEndDate` | 55 | 1 | 6 | 0 | 0 | 48 | 22:00=30 21:00=18 |
| `Inspections:Teams` | `SubscriptionInformation.StoppedDate` | 46 | 0 | 3 | 0 | 0 | 43 | 22:00=30 21:00=13 |
| `Materials:Teams` | `SubscriptionInformation.StartDate` | 80 | 5 | 19 | 0 | 0 | 56 | 22:00=33 21:00=23 |
| `Materials:Teams` | `SubscriptionInformation.BetaPeriodEndDate` | 55 | 1 | 6 | 0 | 0 | 48 | 22:00=30 21:00=18 |
| `Materials:Teams` | `SubscriptionInformation.StoppedDate` | 46 | 0 | 3 | 0 | 0 | 43 | 22:00=30 21:00=13 |
| `Jobs:Teams` | `subscriptionInformation.startDate` | 82 | 6 | 19 | 0 | 0 | 57 | 22:00=34 21:00=23 |
| `Jobs:Teams` | `subscriptionInformation.betaPeriodEndDate` | 56 | 2 | 6 | 0 | 0 | 48 | 22:00=30 21:00=18 |
| `Jobs:Teams` | `subscriptionInformation.stoppedDate` | 47 | 1 | 3 | 0 | 0 | 43 | 22:00=30 21:00=13 |
| `Resources:Teams` | `SubscriptionInformation.StartDate` | 82 | 6 | 19 | 0 | 0 | 57 | 22:00=34 21:00=23 |
| `Resources:Teams` | `SubscriptionInformation.BetaPeriodEndDate` | 56 | 2 | 6 | 0 | 0 | 48 | 22:00=30 21:00=18 |
| `Resources:Teams` | `SubscriptionInformation.StoppedDate` | 47 | 1 | 3 | 0 | 0 | 43 | 22:00=30 21:00=13 |

### B.7 Group 5 — Really timestamps (20 fields)

**In the plan:** instants (4.3), shown with their time. Q15 confirms with the owners that they are meant to carry a time.

| Collection | Path | Rows | `00:00` | `23:00` | `23:00` winter | `23:59`/`22:59` | Other | Top other times |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ActiveWork:ActiveWorkRecords` | `OperationalGroups[].PlantHireStartDate` | 9,197 | 0 | 0 | 0 | 0 | 9,197 | 07:00=2372 08:00=1270 07:01=570 06:00=560 |
| `ActiveWork:ActiveWorkRecords` | `OperationalGroups[].PlantHireEndDate` | 9,197 | 0 | 0 | 0 | 0 | 9,197 | 07:00=2372 08:00=1270 07:01=570 06:00=560 |
| `ActiveWork:StaffAssignments` | `CompleteDate` | 107,431 | 0 | 0 | 0 | 0 | 107,431 | 05:00=667 14:58=666 06:41=664 14:43=652 |
| `Attendance:StaffAssignments` | `CompletedDate` | 108,665 | 17,020 | 0 | 0 | 0 | 91,645 | 05:00=667 06:41=660 14:43=593 07:08=573 |
| `Materials:OrderRequests` | `RequestedFor` | 4,381 | 1 | 0 | 0 | 0 | 4,380 | 07:30=1218 07:00=649 08:30=540 08:00=466 |
| `Materials:OrderRequests` | `DeliveryDate` | 4,381 | 3 | 0 | 0 | 0 | 4,378 | 07:30=983 07:00=578 08:30=436 08:00=420 |
| `Materials:OrderRequests` | `PickDate` | 3,272 | 16 | 1 | 0 | 0 | 3,255 | 15:00=806 16:00=622 14:00=246 07:00=232 |
| `Materials:CollectionRequests` | `RequestedFor` | 3,096 | 0 | 0 | 0 | 0 | 3,096 | 07:30=802 08:00=632 08:30=430 07:00=301 |
| `Materials:CollectionRequests` | `CollectionDate` | 3,096 | 0 | 0 | 0 | 0 | 3,096 | 07:30=549 08:00=493 08:30=290 11:30=271 |
| `Jobs:Jobs` | `sections[].sectionSecuredMetadata.secureDate` | 543 | 0 | 0 | 0 | 0 | 543 | 13:13=136 14:04=135 09:13=58 14:25=34 |
| `Jobs:Jobs` | `securedSections[].secureDate` | 1,353 | 0 | 0 | 0 | 0 | 1,353 | 14:49=9 15:01=8 16:21=7 14:11=6 |
| `Jobs:Jobs` | `openingBalance.secureDate` | 476 | 0 | 0 | 0 | 0 | 476 | 13:58=4 11:18=4 12:36=3 14:15=3 |
| `Jobs:Jobs` | `contractPerformanceSettings.firstWageDate` | 495 | 1 | 1 | 0 | 0 | 493 | 08:00=159 07:00=41 12:00=26 06:00=16 |
| `Jobs:Sections` | `sectionSecuredMetadata.secureDate` | 5,589 | 0 | 0 | 0 | 0 | 5,589 | 16:22=402 14:04=265 12:44=192 16:45=191 |
| `Jobs:Sections` | `secureDate` | 462 | 0 | 0 | 0 | 0 | 462 | 17:07=13 13:39=12 13:58=9 15:14=8 |
| `Jobs:Sections` | `items[].unpricedItem.secureDate` | 571 | 0 | 0 | 0 | 0 | 571 | 14:59=91 14:54=37 14:56=32 12:57=31 |
| `Jobs:Sections` | `overHireData.handoverFirstErectDate` | 116 | 0 | 0 | 0 | 0 | 116 | 07:00=16 15:18=9 08:00=8 06:34=7 |
| `Jobs:Sections` | `overHireData.handoverLastStrikeDate` | 70 | 0 | 0 | 0 | 0 | 70 | 07:00=18 11:39=7 06:00=4 09:54=3 |
| `Jobs:Quotations` | `obtainedSections[].secureDate` | 48 | 0 | 0 | 0 | 0 | 48 | 15:36=2 03:07=1 13:26=1 14:51=1 |
| `Jobs:QuotationSections` | `items[].unpricedItem.secureDate` | 37 | 0 | 0 | 0 | 0 | 37 | 14:59=30 09:37=1 15:51=1 12:33=1 |

### B.8 Group 6 — Empty (9 fields)

**In the plan:** written as the team's midnight (D1) like every calendar date; nothing to rewrite.

- `ActiveWork:NotificationsLogs.AssignmentDate`
- `Handovers:HandoverClaimTransactions.ClaimDate`
- `Jobs:Jobs.sections[].secureDate`
- `Jobs:Jobs.sections[].items[].unpricedItem.secureDate`
- `Jobs:Jobs.sections[].overHireData.handoverFirstErectDate`
- `Jobs:Jobs.sections[].overHireData.handoverLastStrikeDate`
- `Jobs:Jobs.finalAccountValuationDate`
- `Jobs:QuotationSections.overHireData.handoverFirstErectDate`
- `Jobs:QuotationSections.overHireData.handoverLastStrikeDate`

### B.9 Next run: production copy

The dev script was retired once its results were merged into this appendix. The run is optional: it only sizes Q16 and answers Q15. For it, write the same read-only `mongosh` query again and run it on a production copy or a read-only secondary:

- every path of B.3–B.8, array elements counted one by one;
- per path: rows, then counts at `00:00` in winter, `00:00` in summer, `23:00` in summer, `23:00` in winter, `23:59`/`22:59`, and other times with the top four;
- `00:00` in summer is its own column, so date-only rows are told apart from London winter midnights inside a mixed field (for example `Inspections DateAnswer`).

The production result gives the number of browser-midnight rows per field (Q16) and the owner questions of Q15.

---

## Change log — review 2026-10

Review applied 2026-10-06. Only this document changed; no product code. Step IDs that moved keep their number (6.T.1–6.T.5 stay in the 6.T series; 8.2 stays as a pointer).

### A. Errors

| \# | Change | Steps touched |
| --- | --- | --- |
| 1 | Typed `10/01/2026` is **10 Jan** for `dd/MM/yyyy` and **1 Oct** for `MM/dd/yyyy` | section 4.4 |
| 2 | Test vector fixed: `2026-01-10T00:00:00.000Z` (`dd/MM/yyyy`), `2026-10-01T00:00:00.000Z` (`MM/dd/yyyy`); shared C#/TS vector file stated in 1.20 | 1.24, 1.20 |
| 3 | Tolerant mode in the six `TZ=Europe/London` services reads offset-less and date-only input in the **legacy process zone** (`Time:LegacyOffsetlessZone`), counted, until strict mode; Attendance and other UTC containers unaffected; test that no stored instant changes | 4.1 (new paragraph), 4.7, 1.3, 1.5, 1.6, 1.14a, 3.a, 3.b, 3.d, Phase 3 "Done when", 9.9, 10.1a |

### B. Conflicts between sections

| \# | Change | Steps touched |
| --- | --- | --- |
| 4 | New **Phase 1b** holds the "readers first" steps 6.T.1–6.T.5 (4.S, 4.X.4 and ATT 10 need them); phase map, section 6, 4.S, Phase 4, Phase 6 "Before you start", ATT 10.1 and A.5 updated | Phase 1b, 6.T.1–6.T.5, 4.S, 4.X.4, section 6, ATT 10.1 |
| 5 | Phase 1 now needs 0.17; D1, D3, D5, D6, D7 marked **assumed**; note that D13 (decided) depends on D1 (open) | Phase 1, section 2 |
| 6 | 0.16 and ATT 1.10 cover B1–B16 | 0.16, ATT 1.10 |
| 7 | One zone-guard list, at 9.12; D13, section 4.8 and section 6 point to it; 10.8 split into 10.8a (London, before 9.12) and 10.8b (other zone, after) so 9.12 needs only 10.8a | D13, 4.8, 9.12, 10.8a, 10.8b, section 6 |
| 8 | `fromUtc`/`toUtc` moved from 8.2 to **5.12a** (before the first Phase 6 module that sends them); added as a prerequisite of screen steps | 5.12a, 8.2, 6.H.3, Phase 6 "Before a screen step", section 6 |
| 9 | D10 and A.1 corrected: table of which B-changes are per team and which are not (B12 global, B13 per service, B6–B8 and B14 persist); rule for a shift across the switch-on week | D10, A.1, ATT 2b.2, 2b.8, A.5 |
| 10 | New teams get new rules after full rollout (2b.9); switching off refused for non-London teams; selector always returns `New` for non-London | ATT 2b.1, 2b.2, 2b.4, 2b.5, 2b.9 |
| 11 | One documented exemption for `Core/Legacy/` in every gate and analyzer (new section 4.9); "Frozen" qualified; new check whether old-week recalculation runs the legacy `ClockInOutTimeCalculator` | 4.9, 1.11, 1.18, 4.X.3, Phase 4 "Done when", ATT 0.7 (new), ATT 1.11, 3.9, 3.10, 12.3 |
| 12 | CommonLibs read the clock only through an injected `System.TimeProvider`; Phase 2 recipe and repo note adjusted | 4.2, 2.a, Phase 2 repo notes |
| 13 | Derived-store rebuild limited to weeks from the flip onward | 11.3 |

### C. Decisions to clarify

| \# | Change | Steps touched |
| --- | --- | --- |
| 14 | Precedence rule: data's team → request/team copy → configured zone (fallback only) → London; `CalendarDateShape` and `Mode=Utc` are per service | 4.5, 7.1, 11.2, ATT 2.7, ATT 9.1, ATT 14.2 |
| 15 | "Request team ≠ data team": calendar from `ForTeam(dataTeam)` | 4.3, 4.5, 4.X.4, ATT 2b.4 |
| 16 | 0.12 and ATT 0.3 extended to writes, upserts and unique indexes on calendar dates; new 5.12 text and ATT 8.12 | 0.12, 5.12, ATT 0.3, ATT 8.12 |
| 17 | Screens wait for Phase 4 of the target service where it reinterprets date inputs | Phase 6 "Before a screen step", section 6 |
| 18 | Four new discovery steps: startup warning vs readiness probes, anonymous routes, job ids and team renames, Dublin DST flag | 0.21, 0.22, 0.23, 0.24, 1.10, 4.7, 4.8, 4.F.5, 6.T.10 |
| 19 | 9.12 on the critical path with the payroll dependency (not before about April 2027); live check dates 2027-03-28 and 2027-10-31 (2026 dates stay in unit tests) | section 6, 9.12, 10.11 |

### D. Text fixes

- "D1–D7" → "D1–D14" (Conventions).
- Phase 2 repo order sorted by clock reads, fewest first (label now says so).
- Phase 10: 10.10 before 10.11.
- Section 6 "Steps per repo" recounted: new columns 4.X, 4.S, Ph 8 and "Before and after" (Attendance ATT 0–2b and 13); Attendance counts now follow the ATT steps (Ph 5 = 12, ATT 8; Appendix total 120 incl. 3 optional); the frontend apps have their own small table.
- Appendix A mapping: added ATT 2b (Phase 4, before ATT 5) and ATT 10 (4.S); A.5 counts updated (ATT 0 = 7, 2b = 9, 8 = 12).
- 8.3 and 0.10: `oskfel-migrations` is "not deployed, but used" for 6.T.9a.

### Added 2026-10-06 (requested)

- **Cache rule:** every cached date is saved as UTC and read as UTC. Edited: 4.1 entry-point table (Redis row), 1.14b (settings, old-entry test), 3.j (per-service cache tests, ProjectService examples), 2.e (the `DateAcquired = DateTime.Now` case is fixed by the clock-read recipe).

### Review 2 (2026-10-06)

- Header: companion documents listed; `UTC_MIGRATION_PLAN.md` marked superseded; two missing files named as missing.
- D13 note now points at the 9.12 checklist (D13 itself no longer says "UTC midnight").
- 4.3 limit sentence rewritten for D13 not blocking (Q12).
- 1.3 wording: date-only and offset-less input stated once.
- 1.13: the Mongo write path handles `Unspecified` itself, because the stock serializer would change meaning when `TZ` is removed.
- 1.14b: old cache entries without an offset added to the tests.
- 4.R.4: UTC-midnight absences are written by Phase 7, not Phase 5.
- 4.F.5: delete the unused Dublin and `WageCalculationStageBuilder` code (matches the audit) instead of converting it.
- A.1: B12 points to ATT 4.9, not main section 4.9.
- Section 6: the sentence about steps not in the table matched the Project and Gateway counts wrongly; fixed.

### Q11 and Q12 applied (2026-10-06)

- New `CalendarDate.DayOf` / `ToStored` (server) and `calendarDayOf` + `calendarDate` pipe (screens); `calendar.DayOf` and `teamDayOf` limited to instants. Edited: 4.2, 4.3 (rule table, east/west table, standard zone set), 4.6 (helpers, pipes, C3), 0.2, 0.18, 1.7, 1.8, 1.21, 1.23, 4.A.3, 5.11, 7.1, ATT A.3, ATT 1.13, ATT 5.12, ATT 7, ATT 7.1, ATT 9.1.
- Non-London teams always write UTC midnight (7.1, ATT 7, ATT 9.1).

### Old data is London only (2026-10-06)

- Team confirmed: every old calendar date was written as London midnight; `WeekCommencing` values are only `00:00Z` and `23:00Z`. 4.3 now states it, the east/west table marks the non-London rows as "not expected", the +13 limit no longer applies to stored data, and 0.12 checks it with a time-of-day count per field. The rule (`CalendarDate.DayOf`, ±12 h window) is unchanged: it reads both London shapes and the new UTC-midnight rows, and any team zone.

### A team's zone never changes (2026-10-06, Q13)

- The zone is chosen at team creation and is read-only afterwards; existing teams stay London. Edited: D13, 4.8 (registrar, safe rollout), 0.2, 6.T.4b, 6.T.7, 6.T.8 (zone change rejected), 6.T.15 (zone only on the create form), 9.12, 10.10, 10.11, ATT 2b.2.

### Future absences fixed by the team's day (2026-10-06, Q14 part 1)

- New step 4.R.5 (option A): the three `StaffMemberRepo` "future absence" queries use `calendar.DayRangeUtc(today).To` with the team's today; fixes today's 1-hour BST gap and the larger error for other zones. 0.12 notes that HR-synced and bank-holiday absences are already UTC midnight. Section 6 Resources count 35 → 36.

### Left as is (2026-10-06, Q14 part 2)

- `StaffMemberRepo.GetNewStaffMembersThisMonthCount` keeps the UTC month and its `<=` end on the last day at 00:00. Known effects: staff created on the last day of the month are not counted; the month boundary is UTC (1 h off for London in summer, more for other zones). No plan step.

### Active-work list by the team's day (2026-10-06, Q14 part 3)

- New step 4.A.6 (option A): `ActiveWorkRepo.GetAllPaginatedAsync` keeps today's rule (listed while it has a day after the team's today) using `calendar.DayRangeUtc(today).To`. Section 6 ActiveWork count 39 → 40.

### Remaining audit items (2026-10-06, Q14 parts 4–8)

- Team chose the recommended fixes with business rules unchanged. New steps: 4.H.4 (Handover cancel window by team business days), 4.F.7 (plant-hire accrual by the real hire day; figures only), 4.F.8 (prelim income up to the team's today), 4.F.9 (Report.API today and day cuts), ATT 11.3 (delete the unused `potentialDeductions` query). Section 6: Handover 33 → 34, FrameworkCache 32 → 35, Attendance 132 → 133; A.5 ATT 11 = 3.

### Open questions closed with the recommended answers (2026-10-06)

- Team rule: take the recommended solution, business rules unchanged. Q1–Q10 answered (see Questions); D1, D3, D6, D7 decided, D5 decided in principle; 0.23 checked (teams cannot be renamed); Q4 checked (exactly six Dockerfiles set `TZ`).

### Review 3 — divergence from the goal (2026-10-06)

- Two pipes everywhere: section 1, R1, 4.6 title, C1, "What every screen step delivers", 6.H.7, 6.I.4, 6.F.4 and the Phase 1/6 "Done when" now name `teamDate` (instants) and `calendarDate` (calendar dates). R1 now says `calendarDate` never converts.
- Device-zone tests (R1, 1.19, 1.24, 1.33) use the standard zone set of 4.3 (east and west) instead of the older list of 7 zones.
- Phase 4 goal said results never change with the London calendar; 4.M.4, 4.R.5, 4.H.4, 4.A.6, 4.F.8 and 4.F.9 change London results in the 00:00–01:00 BST hour. They are now marked **\[behaviour: day fix\]** (rule kept, day corrected; new convention). Phase 4 "Before you start" now needs 4.X.4 first in the service.
- Stale text: "D1 is still open" (notes on decisions), "If a team can be renamed" (4.8), "Decide D1/D3/D6/D7" (0.1, 0.3, 0.5, 0.17 now record the decided answers), 6.T.15 "Team admin only" (now the role from Q1).

### Not changed on purpose

- **D13 changed 2026-10-06 (Q1 answered): London is the default and nothing blocks other zones.** Edited: D13, decision notes, 4.3 limit, 4.8 safe rollout, 6.T.15 (notice and log instead of a block), 9.12 (checklist, not a gate), 10.8a/10.8b, 10.10, 10.11, ATT 1.13, ATT A.5 row 10, section 6 table and critical path.
- (Superseded 2026-10-06: D1, D3, D6, D7 decided; D5 decided in principle — see Q7.)

### Dev calendar-date profile applied (2026-10-06)

- Source: Appendix B (read-only scan of the dev cluster; the script was retired 2026-10-07). Supersedes "Old data is London only" above.
- D1 states that a calendar date is date-only. D4 revised (proposed): calendar dates converted once to `D 00:00Z` (new step 5.14); instants never.
- 4.3: old-data shapes listed; 20 paths moved to the instant rules; one-time conversion rule; east/west table rows for found shapes. 1.8 tests, 0.12 (dev done, production still needed), 4.F.7 (plant hire is an instant), 5.3, 5.7, 5.8, ATT 0.3 and ATT 8 intro updated.
- New question Q15.

### Dev profile file merged (2026-10-07)

- `../CALENDAR_DATE_PROFILE_DEV.md` is merged into this plan as Appendix B (group charts, shapes, every field per group, the production run) and the file is removed. 5.15 gained the group 1 odd rows and the owner check of the 20 instant fields. The dev script `../scripts/calendar-date-profile.js` is removed too; B.9 describes the query for the production run.

### Earlier design file retired (2026-10-07)

- `UTC_MIGRATION_PLAN.md` (the 2026-09-29 design, superseded) is no longer needed. Its two facts not yet here were moved: the `IgnoreExtraElements` two-release rule (section 3, rule 2) and the measured serializer cost (1.13).

### Plain UTC removed: calendar dates converted once (2026-10-07; superseded by the D1 change below)

- The team agreed on a one-step go-live and on converting old calendar dates once. D4 is now decided as "instants never, calendar dates once" (no longer proposed). The no-rewrite path, with old shapes kept and read by a ± 12 h window, is removed from the plan.
- 4.2 and 4.3: `calendar.DayRangeUtc(D)` is the UTC day `[D 00:00Z, D+1 00:00Z)`; `CalendarDate.DayOf` is the UTC date; new `CalendarDate.ConvertOld` holds the conversion rule. The east/west table now shows what 5.14 stores; device midnights further east than +3 are marked outside the rule. 1.8 tests updated.
- Phase 5 renamed "Calendar dates: one shape". 5.1, 5.11, 5.12, 5.13 and 5.14 rewritten; new steps 5.15–5.21 list the points 5.14 must handle (production profile, write stop, event stores, caches, old-shape values after the night, rollback, rehearsal).
- Section 3 rule 6, 4.5 flag text, 7.1, A.1 B13 rollback, A.3, ATT 0.3, ATT 7.1, ATT 8 (intro, 8.1, 8.7, 8.12), ATT 9 and Q11 updated. New question Q16.

### D1 changed: calendar date = the team's midnight, stored as UTC (2026-10-07)

- The team decided that a picked day is sent and stored like any other time: midnight of that day in the team's zone, as UTC. Monday 6 July for a London team is `2026-07-05T23:00Z` in summer and Monday 5 January is `2026-01-05T00:00Z` in winter. This is the shape stored today.
- D4 is back to **no rewrite at all**: the one-time calendar conversion (old 5.14) and its points 5.15–5.21 are removed. Phase 5 is now "Calendar dates by the team's day" (5.1–5.13). Phase 7 and ATT 9 are removed (no write-shape change, no flag); B13 is removed from A.1. Section 3 rule 6 and 4.5 no longer mention the flag.
- 4.2: `IBusinessCalendar.DayRangeUtc(DateOnly day)` added; `CalendarDate` and `CalendarDateWindow` removed. 4.3 rewritten: both kinds of date are read with the team's calendar (`calendar.DayOf`, `calendar.DayRangeUtc`); a table shows how each old shape reads with the London calendar; the east/west table shows what each team zone stores. Calendar dates always use the team-zone calendar, even with `Mode=Utc`.
- 4.6: `calendarDayOf` removed; the `calendarDate` pipe takes `teamDayOf`; the control writes the team's midnight. 0.1, 0.12, 1.8, 1.21, 1.23, 4.M.2, 4.M.4, 4.R.4, 4.A.4, 4.A.6, 4.F.8, 4.F.9, 9.12, ATT 0.3, 2.6, 7, 8 (intro, 8.1, 8.6, 8.7, 8.12), 13.5, A.3, Appendix B, Q7, Q11, Q12, Q15 and Q16 updated.
- Section 6: 494 repo steps (was 506; the Ph 7 column is gone); Attendance 131; ATT 123 steps; 15 behaviour changes.
- 4.2 and 4.4 snippets: code comments removed; what they said is now in a table under the 4.2 snippet and a line under `TeamTimeSettings`.

## Questions for the team

| \# | Question | Needed by |
| --- | --- | --- |
| **Q1** | **Answered 2026-10-06:** London is the default, not blocking; the zone is chosen at team creation and never changes (Q13). Who may pick the zone: the same role that creates teams today (no new rule). | done |
| **Q2** | **Answered 2026-10-06 (recommended, rules unchanged):** (a) the corrected D10 wording stands; (b) a shift is judged by its clock-in week (2b.8) — the one crossing shift keeps today's behaviour; (c) 2b.9 and the ban on switching off non-London teams stand. Payroll still signs off the B-changes in ATT 0.1. | done |
| **Q3** | **Answered 2026-10-06 (recommended):** if ATT 0.7 shows that old-week recalculation runs the legacy clock calculator, its frozen copy takes the reference date as a parameter filled from the week being recalculated, so the old rules give the same result whenever they run (D11). This is the only allowed edit to `Core/Legacy/`. | done |
| **Q4** | **Answered 2026-10-06 (checked in the repos):** exactly six Dockerfiles set `TZ` — ActiveWork API and Background, Inspections API and Background, Materials API, Report.API; no compose file, YAML or JSON config sets `TZ`. `Common.Messaging` and the Mongo serializer follow `Time:LegacyOffsetlessZone` (4.1, 1.13, 1.14a). | done |
| **Q5** | **Answered 2026-10-06 (recommended):** precedence as in 4.5 — the data's team, then the request's team or the team copy, then the configured zone (no team only), then London. `Mode=Utc` stays per service and only if D3 is ever changed (Phase 11). | done |
| **Q6** | **Answered 2026-10-06 (recommended):** the non-blocking notice on the create form (6.T.15) tells the team admin when the team is created; no other process. | done |
| **Q7** | **Answered 2026-10-06:** the recommended answers are taken — D1 UTC midnight (changed 2026-10-07 to midnight in the team's zone, stored as UTC), D3 the team-zone calendar (Phase 11 optional), D6 BSON Date read as `Kind=Utc`, D7 per-team zone/date/time formats with London defaults; D5 decided in principle, 0.4 sets the window length. Phase 0 steps 0.1, 0.3, 0.4, 0.5, 0.17 record the details. | done |
| **Q8** | **Answered 2026-10-06 (recommended):** 6.T.9a is run by the person with production database access, after a second developer reviews the script and its staging dry-run output; staging first, `DRY_RUN = true` first, the summary is attached to the release. | done |
| **Q9** | **Answered 2026-10-06 (checked in the code):** teams cannot be renamed (0.23); job ids keep the team name. | done |
| **Q10** | **Answered 2026-10-06 (recommended):** the 11.3 rebuild never reaches before the flip (D4, D11); old weeks keep their stored results. | done |
| **Q11** | **Answered 2026-10-06, changed 2026-10-07 with D1:** a calendar date becomes a day with the team's calendar, `calendar.DayOf` (server) and `teamDayOf` (screens), shown with the `calendarDate` pipe (date only). `CalendarDate`, `CalendarDateWindow` and `calendarDayOf` are removed; filters use `calendar.DayRangeUtc`. East and west of UTC are covered (4.3). | done |
| **Q12** | **Answered 2026-10-06, changed 2026-10-07 with D1:** every team, London or not, writes calendar dates as its own midnight, stored as UTC. No flag. | done |
| **Q13** | **Answered 2026-10-06:** a team's zone never changes. It is chosen at creation; existing teams stay London. So no team has old weeks under another zone and no week is split. Applied in D13, 4.8, 0.2, 6.T.4b, 6.T.7, 6.T.8, 6.T.15, 9.12, 10.10, 10.11, ATT 2b.2. | done |
| **Q14** | **Answered 2026-10-06 — recommended fixes, business rules unchanged:** `StaffMemberRepo:220/248/254` → 4.R.5; `StaffMemberRepo:415` left as is; `ActiveWorkRepo:351` → 4.A.6; `CPPlantRepository` → 4.F.7 (figures for old summer hires move one day; finance sign-off); `CPPrelimRepository:54` → 4.F.8; `CPPlantReportService` / `CPProjectCvrService` → 4.F.9; Handover cancel window → 4.H.4; `WageRecordsRepo:200` → ATT 11.3 (dead code removed). | done |
| **Q15** | **Open (2026-10-06), optional: production calendar-date profile.** Run the profile query of Appendix B.9 on a production copy. Confirm with the owners: the 20 instant paths of 4.3; that `23:59`/`22:59` rows mean the same London day (spot-check 5 rows); what the 17,020 `Attendance:StaffAssignments.CompletedDate` rows at `00:00Z` mean; the day for the 90 Prelims rows stamped `16:13`. Gives the row counts for Q16. | before Q16 is decided |
| **Q16** | **Open (2026-10-07): fix old browser-midnight rows?** Rows saved as midnight in a browser east of London (`21:00Z`, `22:00Z`, winter `23:00Z`; on dev 1,403 `WageBonus` rows, most team subscription dates, a few hundred assignment days) read as the day before, today and after go-live. From go-live no new ones appear (C2). Options: (a) leave them, as today; (b) a one-time script per field moves them to London midnight of the next day, with a dry run, a backup and owner sign-off (payroll for `WageBonus`). Not needed for go-live. | after go-live |
