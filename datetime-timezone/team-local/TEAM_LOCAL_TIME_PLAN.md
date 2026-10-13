# Team Local Time — Implementation Plan (reverse of the UTC plan)

> **Status:** plan only — no product code has changed. Written 2026-10-06.
> **What it is:** the reverse of `../utc-time-zone/UTC_IMPLEMENTATION_PLAN.md`. Instead of storing UTC everywhere, the database stores every business date as the **team's local wall-clock time**; the backend uses dates exactly as stored and does no zone conversion; the frontend shows and edits dates in the team's zone with the same control and pipes as the UTC plan, and converts only when it sends or receives, inside the API services (no HTTP interceptor).
> **Go-live (agreed 2026-10-07):** one step for both plans (UTC and team-local). The phases are **implementation phases**: code is built and shipped dark phase by phase, then every service and every team is switched on in one go-live night.
> **Companion documents:**
> - `TEAM_LOCAL_TIME_DB_MIGRATION_REPORT.md`: the full database migration report, with every collection and field, the conversion rules, the scripts, the cut-over runbook, verification and rollback.
> - `TEAM_LOCAL_TIME_ATTENDANCE_REPORT.md`: every change in AttendanceService, the payroll effects, the existing bugs, the tests and the shadow compare (Appendix A in detail).
> **Scope:** all 16 .NET repos, Gateway, the three Angular apps (Frontend, HandoverApp, InspectionsApp), the MongoDB data, containers and the cut-over. Every team is London today, so the migration converts every stored value from UTC to `Europe/London` wall-clock time.
> Counts come from grep and a model scan over the working trees on 2026-10-06 (call sites and declared fields, not proven behaviour). Row counts need a database run (migration report, M0).

---

## Before any work: branch in every affected repo

Work spans 21 repos: the 16 .NET repos (including Gateway), OcelotConfigValidator, the three Angular apps and `oskfel-migrations`. Before the first step in a repo, create the feature branch from the latest remote main branch:

```bash
git reset --hard
git clean -fd
git checkout main
git pull origin main
git checkout -b feature/1.6.0/team-local-time
```

- OcelotConfigValidator uses `master` instead of `main`.
- Do this in every affected repo; one branch name across all of them: `feature/1.6.0/team-local-time`.
- **Local changes are removed before the checkout:** `git reset --hard` discards changes to tracked files and `git clean -fd` deletes untracked files and folders, so the branch starts clean. These cannot be undone; anything worth keeping is pushed or copied elsewhere first. Ignored files (`bin/`, `obj/`, local settings in `.gitignore`) are kept.
- If the branch already exists in a repo, check it out and pull; never recreate it.
- This plan never shares a branch with the UTC plan: `feature/1.6.0/team-time-zone` is not reused, and the two are never merged into each other (see "Pick one plan").
- `datetime-timezone` (this folder) is not a git repo and is skipped. `Prototype` is not affected.

| Repo | Base branch | Checked out on 2026-10-06 | Work in this plan |
|---|---|---|---|
| ActiveWorkService | `main` | `main` | B.a–B.l, container `TZ` ×2 |
| AttendanceService | `main` | `main` | B.a–B.l, Appendix A |
| CommonLibs | `main` | `main` | kit master copy, P1.4–P1.6 |
| CustomerService | `main` | `main` | B.a–B.k |
| ForecastingService | `main` | `main` | B.a–B.l |
| FrameworkCache (Report.API) | `main` | `main` | B.a–B.k, container `TZ` |
| GafferService | `main` | `main` | B.a–B.k |
| Gateway | `main` | `main` | B.a–B.k, P1.15 |
| HandoverService | `main` | `main` | B.a–B.l |
| InspectionsService | `main` | `main` | B.a–B.l, container `TZ` ×2 |
| MaterialsService | `main` | `main` | B.a–B.k, container `TZ` |
| NotificationService | `main` | **`stage`** (the procedure switches it to `main`; commits on `stage` are kept) | B.a–B.k, SignalR |
| PermissionsService | `main` | `main` | B.a–B.k |
| ProjectService | `main` | `main` | B.a–B.l |
| ResourcesService | `main` | `main` | B.a–B.l |
| SafetySuiteService | `main` | `main` | B.a–B.k |
| OcelotConfigValidator | **`master`** | `master` | gate only: validates the P1.15 route |
| Frontend | `main` | `main` | F.1–F.18, Phase 6 |
| HandoverApp | `main` | `main` | H.1–H.3, Phase 6 |
| InspectionsApp | `main` | `main` | I.1–I.3, Phase 6 |
| oskfel-migrations | `main` | `main` | migration scripts M0–M6 |

No repo has a `team-local-time` or `team-time-zone` branch yet (checked 2026-10-06).

---

## Pick one plan

This plan and `../utc-time-zone/UTC_IMPLEMENTATION_PLAN.md` give opposite answers to one question: **what is stored in the database**. They cannot both run. Section 9 lists which parts of the UTC plan carry over unchanged (shared control and pipes, team settings through Gateway, clock provider, removing `TZ` from containers, per-team Hangfire jobs) and which are dropped (calendar dates as the team's midnight stored as UTC, team-day ranges `calendar.DayRangeUtc`, "no correction of old data").

---

## 1. The goal on one page

**One sentence:** every business date is stored as the team's wall-clock time, the backend treats every date "as it is", and only the frontend's API services convert between the team's wall clock and real instants, using the team zone's offset **at that date**.

### What changes, for whom

| Who | Today | After |
|---|---|---|
| **Database** | Instants stored as UTC; calendar dates stored in several shapes: London midnight (`D-1 23:00Z` in summer, `D 00:00Z` in winter), UTC midnight, end of the London day (`22:59Z`/`23:59Z`), browser midnights east of UTC (`21:00Z`, `22:00Z`); 20 fields listed as calendar dates hold real times (dev profile, `../utc-time-zone/UTC_IMPLEMENTATION_PLAN.md` Appendix B) | Every business date stored as London wall-clock time with a `Z` label: 08:00 in July is stored `08:00Z`; every calendar date is `D 00:00Z` |
| **Backend developers** | `DateTime.UtcNow`, `isSummer ? -1 : 0`, `ConvertTimeFromUtc(…, London)`, `timezone: "Europe/London"` in pipelines | `IDateTimeProvider.Now` for "now"; dates used as stored; `.Date` is the team's day; no zone code outside one class (`ITeamTime`) |
| **Frontend developers** | Device-local `Date` objects sent with `toISOString()` | Components hold real instants (exactly like the UTC plan); the shared control and the `teamDate` / `calendarDate` pipes show the team zone; API services call `ApiDateConverter` to add the team offset before sending and remove it after receiving |
| **Ops** | Six containers set `TZ=Europe/London` | No container sets `TZ`; one config value `Time:StorageMode` is flipped at cut-over |

### The four rules (how we know we are done)

| Rule | Meaning | Proof |
|---|---|---|
| **L1 — Storage** | Every business date in MongoDB is team wall-clock time (BSON Date, read as `Kind=Utc`, digits = team local). Calendar dates are `D 00:00Z`. Technical times (section 4.4) stay real UTC. | Migration verification (report M4): every converted value moved by exactly the London offset of its instant (0 or +1 h); every calendar field is at 00:00. |
| **L2 — API dates** | Every business date in an API call is ISO-8601 with `Z` carrying team wall-clock digits. Only `ApiDateConverter` (frontend) converts; there is no date interceptor. | API-date golden tests: the same screen input under every device zone of the standard zone set gives byte-identical request bodies and query strings; request DTO types only accept `ApiDateConverter` output (section 4.6). |
| **L3 — Backend** | The backend does no zone conversion of business dates. "Now" for business data is `IDateTimeProvider.Now`. `TimeZoneInfo` is used only inside `ITeamTime`. | Grep gate: zone names and `TimeZoneInfo` outside `ITeamTime` = 0. Test suites identical under `TZ` = UTC, London, Los Angeles, Auckland. |
| **L4 — Technical time** | Technical times (TTL, locks, retries, inbox/outbox, SAS links, cache, Hangfire storage) stay real UTC from `ISystemClock` and are never compared with business dates. A technical time that leaves the API is converted with `ITeamTime.FromSystemInstant`. | Analyzer: `ISystemClock` only in allow-listed folders; review list in section 4.4; API-date golden tests cover the technical fields in responses. |

### Worked example (the rule the user gave)

| Step | London, 1 Jul (BST, +1) | London, 1 Jan (GMT, +0) | A +3 team (Riyadh) |
|---|---|---|---|
| User types in the shared control | 01/07/2026 08:00 | 01/01/2026 08:00 | 01/10/2026 10:00 |
| Value in the component (real instant, like the UTC plan) | `2026-07-01T07:00:00.000Z` | `2026-01-01T08:00:00.000Z` | `2026-10-01T07:00:00.000Z` |
| `ApiDateConverter.toApiDateTime` adds the zone offset **at that instant** | +60 min → `…T08:00:00.000Z` | +0 → `…T08:00:00.000Z` | +180 min → `…T10:00:00.000Z` |
| Backend stores, compares and returns as is | `08:00` | `08:00` | `10:00` |
| `ApiDateConverter.fromApiDateTime` subtracts the offset valid at that wall-clock time | `07:00Z` | `08:00Z` | `07:00Z` |
| `teamDate` pipe shows | 08:00 | 08:00 | 10:00 |

The offset always comes from the zone's rules for that date (IANA), never from today's offset and never from the device. A request sent in October about a date in December uses December's offset.

### Phase map

```
 Phase 0  Decisions & discovery (incl. data profile on a production copy)
    │
 Phase 1  Foundations ── backend time kit (mode-aware) · frontend ApiDateConverter + control & pipes · CI gates · migration tooling
    │
    ├── Phase 2  Backend: every repo mode-aware (Utc mode = today's behaviour)      ┐ run in parallel,
    ├── Phase 3  Frontend: ApiDateConverter in every API service, query string, cache, SignalR ┘ deployed in Utc mode
    │
 Phase 4  Rehearsals on a production copy ── migration timing · verification · wage shadow compare · rollback drill
    │
 Phase 5  Cut-over (one maintenance window) ── drain · back up · migrate · flip Time:StorageMode=TeamLocal · remove TZ
    │
 Phase 6  Screens on the shared control and pipes (continues after cut-over; required before non-London teams or devices)
 Phase 7  Clean-up ── delete Utc mode, gates permanent
 Phase 8  Later: per-team zones (before the first non-London team)
```

---

## 2. Decisions

| # | Question | Answer used by this plan | Status |
|---|---|---|---|
| **T0** | UTC plan or this plan? | This plan. The UTC plan stops at its Phase 0; parts listed in section 9 move here. | **open — needed first** |
| **T1** | API date shape | ISO-8601 with `Z`, digits = team wall clock (`2026-07-01T08:00:00.000Z` means 08:00 London). | **decided by the product owner 2026-10-06** |
| **T2** | Where the frontend converts | In the API services, through `ApiDateConverter`, explicitly per field. **No HTTP interceptor.** | **decided by the product owner 2026-10-06** |
| **T3** | How users see and type dates | The team zone and format, through the UTC plan's shared control and the `teamDate` / `calendarDate` pipes (UTC plan 4.4, 4.6). | **decided by the product owner 2026-10-06** |
| **T4** | How the change goes live | Code ships early behind `Time:StorageMode` (`Utc` = today's behaviour, `TeamLocal` = new). Data migration and the flip happen together in one maintenance window for all services. Rollback before reopening = flip back + rename collections back. | recommended |
| **T5** | How the data is converted | Copy-and-convert into shadow collections, verify, then swap by `renameCollection`; originals kept as `__utc_<date>` backups for 30 days (report section 4). In-place conversion only if the disk check fails. | recommended |
| **T6** | Event stores | Event payload dates are converted like every other document (one-off rewrite, backed up). No read-time upcaster. `EventId` timestamps cannot change; code that uses them converts (B.f). | recommended |
| **T7** | Which dates stay real UTC | The technical list in section 4.4: inbox/outbox bookkeeping, TTL fields, retry and lock fields, SAS and link expiry, cache, Hangfire storage, Gaffer conversation store. | recommended |
| **T8** | Elapsed time across a clock change (payroll) | Pay uses **real elapsed time**: `ITeamTime.Elapsed(from, to)` converts both wall clocks to instants. A shift 00:00–08:00 on 2027-03-28 pays 7 h and on 2026-10-25 pays 9 h, as today. Plain subtraction would give 8 h on both nights. | recommended; **payroll decides** |
| **T9** | The repeated autumn hour | Two real times in 00:00–02:00 UTC on the last Sunday of October map to the same 01:00–02:00 London wall clock. Accepted: the dry run counts the affected values; ordering inside that hour can invert. | recommended; counted in M0 |
| **T10** | Recalculating a week from before the cut-over | Allowed with the new code. The Phase 4 shadow compare must show no difference for normal weeks; differences only in the 00:00–01:00 BST hour (section A.1). Finance may instead lock pre-cut-over weeks. | **finance decides** |
| **T11** | Can a team's zone change? | **Never** (as UTC plan D13). A change would mean converting that team's data again. | carried over |
| **T12** | Cross-team views (portfolio reports, admin) | Wall clocks of different zones are compared as they are. Accepted while every team is London; revisited in Phase 8. | recommended |
| **T13** | Cut-over date | A low-traffic weekend after Phase 4 passes; **not** the weekend of a UK clock change (2026-10-24/25, 2027-03-27/28). | open |
| **T14** | Old app builds and offline queues | Mobile apps: force sync, then a minimum build (`x-client-build`, as UTC plan D5). Frontend: the existing `version-block-interceptor` forces a reload after cut-over. No server-side compatibility conversion. | recommended |
| **T15** | What is a calendar date (a picked day)? | `D 00:00Z`: the digits are the day, with no zone (L1, 4.1). Old rows are converted with rule C (migration report 3.4), browser midnights east of London included. The UTC plan answers differently (its D1: the team's midnight, stored as UTC, `Sun 23:00Z` for Monday in a London summer). | follows from T1; recommended |
| **T16** | Which zone decides business days (wages, week commencing, reminders, PDFs)? | London, the one zone `ITeamTime` reads from config: the stored wall clock is the London time, so `.Date` and `DayOfWeek` are the London day (as UTC plan D3, without a calendar class). Other zones come with Phase 8. | follows from T1 |
| **T17** | Which zone does a team get? | **London only until Phase 8.** The team settings endpoint (P1.15) returns London, and no other zone can be picked. A non-London team must not be created before Phase 8: `ITeamTime` has one zone, and a zone never changes (T11). The UTC plan answers differently (its D13: any zone at creation, nothing blocked). | recommended; **business decides** (Q10) |
| **T18** | In which zone do recurring jobs run? | One Hangfire job per purpose on the London schedule (`ITeamTime.ScheduleZone`), as today. Per-team jobs (UTC plan D9, 4.8) come with Phase 8. | recommended |
| **T19** | How do the new Attendance rules go live? | In the T4 window, for every team at once: no per-team switch, no pilot team, and no `Legacy*` calculators (UTC plan D10 and D11 are not used). The proof is the 26-week shadow compare (P4.3); old weeks follow T10. | recommended |
| **T20** | How is a clock-out matched to its clock-in? | By the **same London day** (L-B5, Attendance report B9). This fixes clock-ins between 00:00 and 01:00 BST. A night shift that crosses London midnight (22:00 → 06:00) still does not pair. The UTC plan's rule (D12: the latest open clock-in on the project within 16 h) could be added as a separate change. | recommended; **payroll decides** (Q11) |
| **T21** | Which UTC plan decisions carry over unchanged? | D6 (BSON Date, read as `Kind=Utc`; the digits are now team wall clock), D7 (named formats; London defaults until team settings arrive in Phase 8), D8 (time code copied as source into every repo, 4.3), D14 (no project zone). | carried over |

---

## 3. How we work

1. **Utc mode is a pure refactor.** Every change in Phases 2 and 3 keeps today's results while `Time:StorageMode=Utc`. A PR that changes a result in Utc mode is wrong.
2. **TeamLocal mode is tested before cut-over** on a migrated production copy (Phase 4), never first in production.
3. **One flip for everything.** All services, Gateway and the three apps switch mode in the same maintenance window, after the data is converted. There is no state where some services are in TeamLocal mode and others are not.
4. **Small steps.** One step = one PR; each deployable in Utc mode and revertible.
5. **Readers of the mode report it.** Every service's health endpoint returns `timeStorageMode`; the cut-over smoke test fails if any service disagrees.
6. **Payroll steps** (Appendix A) list every changed expectation in the PR and need finance sign-off.

---

## 4. Target design

### 4.1 Kinds of date and their storage

| Kind | Examples | Stored after cut-over | Sent by the frontend with | Backend use |
|---|---|---|---|---|
| **Instant (business)** | clock in/out, `Created`, `Updated`, `SubmittedDate`, `ReviewDate`, `CapturedDate`, delivery and collection stamps | team wall clock: 08:00 BST → `08:00Z` | `ApiDateConverter.toApiDateTime` | as is; "now" = `IDateTimeProvider.Now` |
| **Calendar date** | absence, assignment, allocation, `WeekCommencing`, DOB, expiry, secure/claim/transaction dates | `D 00:00Z` | `ApiDateConverter.toApiDate` (no offset) | as is; `.Date` and `DayOfWeek` are correct |
| **Date + typed time** | MOR delivery time, clock override, ITW start | team wall clock | `toApiDateTime` | as is |
| **Range** | `from`/`to` of lists and reports | — | `ApiDateConverter.toApiDateRange(firstDay, lastDay)` = `{ from: firstDay 00:00Z, toExclusive: lastDay+1 00:00Z }` | `x >= from && x < toExclusive` |
| **Technical** | section 4.4 | real UTC | converted only if it leaves the API (`FromSystemInstant`) | `ISystemClock.UtcNow` |

**What becomes simple:** a day is `[D 00:00Z, D+1 00:00Z)` for every field; `WeekCommencing` is always Monday 00:00; Mongo `$dateToString`, `$dayOfWeek`, `$year` give the team's day without a `timezone`; PDFs and e-mails print the stored value; "today" is `IDateTimeProvider.Today`. The UTC plan's team-day ranges (`calendar.DayRangeUtc`) and its reading of old odd shapes with the London calendar are not needed.

**What becomes harder:** technical and business times must be kept apart (L4); elapsed time across a clock change needs `ITeamTime.Elapsed` (T8); the repeated autumn hour is ambiguous (T9); any consumer that reads `Z` as a real instant is wrong by the offset (P0.6); a second zone needs Phase 8.

### 4.2 The mode switch `Time:StorageMode`

One config value in every service host and in Gateway: `Utc` (default) or `TeamLocal`. Gateway returns it to the apps with the team time settings (`GET /api/gateway/team/time-settings` → `{ timeZone, dateFormat, timeFormat, storageMode }`). Before Gateway carries it, the apps read it from their environment config.

| Piece | `Utc` (until cut-over) | `TeamLocal` (after cut-over) |
|---|---|---|
| `IDateTimeProvider.Now` | `DateTime.UtcNow` | London wall clock now, `Kind=Utc` |
| `ITeamTime.ToBusinessLocal(x)` / `FromBusinessLocal(x)` | UTC ↔ London (today's code) | identity |
| `ITeamTime.FromSystemInstant(x)` / `ToSystemInstant(x)` | identity | UTC ↔ London |
| `WireDate.Parse` | today's `DateTime.Parse` behaviour (process zone) | digits as written, `Kind=Utc` |
| Mongo `DateTime` serializer | driver default (today) | `Unspecified`/`Local` stored with their digits, no zone shift |
| Mongo pipeline `timezone` | `"Europe/London"` (today) | omitted |
| `ApiDateConverter.toApiDateTime` | `toISOString()` (today) | add zone offset at that instant |
| `ApiDateConverter.toApiDate` | London midnight as UTC (today's London shape) | `D 00:00Z` |
| `ApiDateConverter.fromApiDateTime` | parse as UTC | subtract zone offset at that wall clock |

Phase 7 deletes the `Utc` branches; what remains is the TeamLocal column.

### 4.3 Server building blocks (copied into every service, as UTC plan D8)

Folder `<Repo>.Core/Utilities/Time/` (namespace `Intowork.Common.Time`), master copy in AttendanceService, synced by script with a drift check (UTC plan 1.12).

```csharp
public enum TimeStorageMode { Utc, TeamLocal }

public interface ISystemClock
{
    DateTime UtcNow { get; }
}

public interface IDateTimeProvider
{
    DateTime Now { get; }
    DateOnly Today { get; }
}

public interface ITeamTime
{
    TimeStorageMode Mode { get; }
    DateTime ToBusinessLocal(DateTime stored);
    DateTime FromBusinessLocal(DateTime businessLocal);
    DateTime FromSystemInstant(DateTime utcInstant);
    DateTime ToSystemInstant(DateTime stored);
    TimeSpan Elapsed(DateTime from, DateTime to);
    TimeZoneInfo ScheduleZone { get; }
}

public sealed class TeamDateTimeProvider(ISystemClock clock, ITeamTime teamTime) : IDateTimeProvider
{
    public DateTime Now => teamTime.FromSystemInstant(clock.UtcNow);
    public DateOnly Today => DateOnly.FromDateTime(Now);
}
```

- `IDateTimeProvider` is the business clock and every handler, service, repository and job injects it for "now" and "today". Its only implementation is `TeamDateTimeProvider`; tests replace it with a fake that returns a fixed team wall-clock time. `ISystemClock` is injected only for the technical times in section 4.4.
- `ITeamTime` is the **only** class allowed to use `TimeZoneInfo` (L3). Its zone is `Europe/London` from config until Phase 8 adds per-team zones (`ITeamTimeContext`, UTC plan 4.5).
- `Elapsed` converts both values to instants in TeamLocal mode (T8) and subtracts directly in Utc mode.
- `FromSystemInstant` turns a real UTC instant (ObjectId timestamp, Hangfire `LastExecution`, SAS `ExpiresOn`) into the stored format; `ToSystemInstant` does the reverse for anything that needs a real instant (external APIs, scheduling).
- `WireDate`, the JSON converters and the MVC binder all follow `Mode`. In TeamLocal mode `2026-07-01T08:00:00Z`, `2026-07-01T08:00:00` and `2026-07-01` keep their digits (`08:00`, `08:00`, `00:00`), `Kind=Utc`. An input with a non-zero offset (`+01:00`) is rejected with 400 in TeamLocal mode (no client sends one).
- **Common packages** (`Common.Data`, `Common.Messaging`) get the mode-aware Mongo serializer and the shared JSON options, as UTC plan 1.13–1.14b; Redis entries are flushed at cut-over (report C6) instead of being converted.
- **Analyzer** (`BannedApiAnalyzers`): `DateTime.Now/UtcNow/Today`, `DateTimeOffset.Now/UtcNow`, `TimeZoneInfo.*`, `ToLocalTime`, `ToUniversalTime`, `DateTime.Parse/TryParse` without styles; allowed only inside `Time/`.

### 4.4 What stays real UTC (L4, T7)

| Area | Fields / sites | Why | If it reaches a client |
|---|---|---|---|
| Inbox / outbox | `*:IncomingIntegrationEvents.HandledDate`, `*:OutboundIntegrationEvents.PublishDate` and their `Data` (24 collections) | bookkeeping; history is never replayed (report M2.4) | not exposed |
| TTL indexes | `ActiveWork:NotificationsLogs.CreatedAtUtc` (30 days, `DbContext.cs:385-391`), `Notifications:UserNotifications.ExpiresAt` (`DbContext.cs:37-44`) | MongoDB expires on real time | `ExpiresAt` → `FromSystemInstant` |
| Retry / lock | `Notifications:ExternalNotifications` (`CreatedAt`, `LastAttemptAt`, `SentAt`, `NextAttemptAt`, `LockedUntil`), `ActiveWork:NotificationsLogs.SentAtUtc/FailedAtUtc` | workers compare with the system clock | not exposed |
| Links and tokens | Blob SAS `ExpiresOn` (`Common.Data/BlobStorage`, Project, Resources, Materials, SafetySuite blob services), `QuotationBuilderGeneratedDocument.LinkExpiresOn` (returned to the app), session revocation (Gateway) | real expiry | `LinkExpiresOn` → `FromSystemInstant` |
| Hangfire | `*:Hangfire` storage (ActiveWork, Attendance, Materials, Resources); `LastExecution` / `NextExecution` shown by `GetHrSyncDetailHandler` | Hangfire schedules in real time with the job's zone | → `FromSystemInstant` |
| Cache | Redis (`Common.Data/AzureRedisCache.cs`), memory caches | flushed at cut-over | — |
| Gaffer | `gaffer_conversations` (`At`, `Created`, daily cap by `UtcNow.Date`) | assistant bookkeeping | decide in P0.8 |
| Logs, metrics, stopwatches | everywhere | — | — |

About **115 of the 459** server clock reads look technical by name (estimate from code text); P2 step B.b classifies every one.

### 4.5 What the backend stops doing

Each site below converts or adjusts for London today. In TeamLocal mode it would shift migrated data a second time, so each one goes through `ITeamTime` in Phase 2 and is deleted in Phase 7.

| Repo | Sites (files) | Becomes |
|---|---|---|
| ActiveWork | `Core/Utilities/TimeZoneProvider.cs`, `ActiveWorkDateUtilities.cs`, `Background/Services/ActiveWorkNotificationService.cs`, `TomorrowStaffAssignmentReminderService.cs` | `ToBusinessLocal` / `FromBusinessLocal`, `IDateTimeProvider.Today` |
| Attendance | `WageCalculatorExtension.cs`, `ClockInOutTimeCalculator.cs`, `WageWeekDateCalculator.cs`, `WageHelper.cs`, `WageHelperLegacy.cs`, `SupervisorClockInHandler.cs`, `SupervisorClockoutHandler.cs`, `ReminderService.cs`, `AttendanceBackgroundJobExtensions.cs` (+ DST logic in `RecalculateWageRecordHandler.cs`, `WageRecordApprovalHandler.cs`, `WageCalculaterHelper.cs`, `IWageWeekDateCalculator.cs`) | Appendix A |
| Report.API | `ReportingCalendar.cs`, `LabourSummaryService.cs`, `OrderRequestResponse.cs`, `CollectionRequestResponse.cs`, `CPLabourDailyRepository.cs:1338, 1618` (`$dateToString` with `"Europe/London"`), `WagesPipeline.cs` (Dublin, unused output — delete) | `timezone` omitted in TeamLocal mode; responses print stored values |
| Handover | `Background/Services/ReportGeneratorService.cs` (PDF), `Core/Data/Models/HandoverNotification.cs` | print stored value; `ToBusinessLocal` |
| Inspections | `Background/Services/ReportGeneratorService.cs` (PDF) | print stored value |
| Materials | `GetVehiclesForTeamHandler.cs`, `GetVehiclesForTeamByCategoryHandler.cs` ("now in London") | `IDateTimeProvider.Today` |
| Resources | `API/Controllers/ResourcesController.cs` (range conversion), `Core/ServiceWorkers/HRJobScheduler.cs` (Hangfire zone — **kept**, it is a schedule zone) | `FromBusinessLocal`; `ITeamTime.ScheduleZone` |

**Totals:** 76 `TimeZoneInfo` uses and 44 zone-name literals in 7 repos; 33 DST-adjustment sites (all in Attendance); 4 Mongo `timezone` stages (Report.API); 99 `DateTime.Parse/TryParse` sites; 39 `ToUniversalTime` calls (Report.API 36 — those on `BsonValue` are safe and stay; those on `DateTime` go through `WireDate` or are removed); 25 `SpecifyKind` (Resources 14).

**`ObjectId.CreationTime` as a business date (84 sites).** Projections set `Created`, `Updated` and `OverrideDate` from `EventId.CreationTime` (for example `Job.cs:553, 671, 698`, `Handover.cs:238-457`, `UserAttendanceRecord.cs:57-342`, `ActiveWorkRecord.cs:108-632`). ObjectId timestamps are real UTC and cannot be migrated, so after cut-over a rebuild would bring UTC back. Every site becomes `teamTime.FromSystemInstant(evt.EventId.CreationTime)`. Per repo: Project 30, Attendance 15, Handover 14, ActiveWork 7, Permissions 7, Customer 5, Forecasting 2, Inspections 2, Resources 2.

### 4.6 Frontend: the UTC plan's control and pipes, plus `ApiDateConverter` in the services

**Display and input are the UTC plan, unchanged** (UTC plan 4.4 and 4.6, rules C1–C3): `<app-date-time-field>` with `mode='dateTime' | 'date' | 'time'`, `teamDate` for instants, `calendarDate` for calendar dates, `TeamTimeService`, `teamCalendar` helpers, zone label when the device zone differs, named formats. Components, stores and forms hold **real instants** (UTC ISO) and calendar dates as `D 00:00Z`, exactly as in the UTC plan.

**New: `ApiDateConverter`, the only code that converts.** Copied into `src/app/shared/time/` in all three apps.

**Names.** Every name says what the value is and which direction it goes:

| Name | Meaning |
|---|---|
| `ApiDateTime` | a date-time exactly as sent to or received from the API. In TeamLocal mode it is the team's wall clock written with `Z` (`2026-07-01T08:00:00.000Z` = 08:00 London). |
| `ApiDate` | a calendar date as sent to or received from the API: `D 00:00Z`. |
| `ApiDateRange` | `{ from, toExclusive }`, two `ApiDate` values for list and report filters. |
| `toApi…` / `fromApi…` | the direction. `to` goes out to the API; `from` comes back from the API. |
| `UtcModeRules` / `TeamLocalModeRules` | the conversion for each value of `Time:StorageMode`; Phase 7 deletes `UtcModeRules`. |
| `ApiDateConverter` | the injectable that API services call; it picks the rules for the current mode. |

The names match the UTC plan's control modes (`'dateTime'` and `'date'`) and the backend kit (`IDateTimeProvider`). Earlier drafts used other names (old → new):

| Earlier name | New name |
|---|---|
| `TeamWire` | `ApiDateConverter` |
| `WireInstant` / `WireDay` | `ApiDateTime` / `ApiDate` |
| `instantToWire` / `instantFromWire` | `toApiDateTime` / `fromApiDateTime` |
| `dayToWire` / `dayFromWire` | `toApiDate` / `fromApiDate` |
| `rangeToWire` → `{ from, to }` | `toApiDateRange` → `{ from, toExclusive }` |
| `nowToWire` | `nowAsApiDateTime` |
| rules W1–W7 | rules AD1–AD7 |
| wire-golden tests | API-date golden tests |

**`shared/time/api-date.types.ts`:**

```ts
export type ApiDateTime = string & { readonly __brand: 'ApiDateTime' };

export type ApiDate = string & { readonly __brand: 'ApiDate' };

export interface ApiDateRange {
  readonly from: ApiDate;
  readonly toExclusive: ApiDate;
}
```

**`shared/time/storage-mode-rules.ts`.** This is the only file that may create `ApiDateTime` and `ApiDate`; the brand functions are not exported.

```ts
export interface StorageModeRules {
  toApiDateTime(instant: Date): ApiDateTime;
  fromApiDateTime(value: string): Date;
  toApiDate(day: CalendarDay): ApiDate;
  fromApiDate(value: string): CalendarDay;
}

export class UtcModeRules implements StorageModeRules {
  constructor(private readonly zone: string) {}

  toApiDateTime(instant: Date): ApiDateTime {
    return asApiDateTime(instant.toISOString());
  }

  fromApiDateTime(value: string): Date {
    return parseApiInstant(value);
  }

  toApiDate(day: CalendarDay): ApiDate {
    return asApiDate(startOfTeamDayUtc(this.zone, day).toISOString());
  }

  fromApiDate(value: string): CalendarDay {
    return teamDayOf(this.zone, parseApiInstant(value));
  }
}

export class TeamLocalModeRules implements StorageModeRules {
  constructor(private readonly zone: string) {}

  toApiDateTime(instant: Date): ApiDateTime {
    const wallClock = utcToTeamWallClock(this.zone, instant);
    return asApiDateTime(wallClock.toISOString());
  }

  fromApiDateTime(value: string): Date {
    const wallClock = parseApiWallClock(value);
    return teamWallClockToUtc(this.zone, wallClock);
  }

  toApiDate(day: CalendarDay): ApiDate {
    return asApiDate(calendarDayToIso(day));
  }

  fromApiDate(value: string): CalendarDay {
    return calendarDayOf(parseApiInstant(value));
  }
}

function asApiDateTime(iso: string): ApiDateTime {
  return iso as ApiDateTime;
}

function asApiDate(iso: string): ApiDate {
  return iso as ApiDate;
}
```

**`shared/time/api-date-converter.ts`.** The mode is chosen once, not inside every method. The overloads keep `null` only where the caller passes it, so no `!` is needed.

```ts
@Injectable({ providedIn: 'root' })
export class ApiDateConverter {
  private readonly teamTime = inject(TeamTimeService);

  private readonly rules = computed<StorageModeRules>(() => {
    const zone = this.teamTime.zone();
    return this.teamTime.storageMode() === 'teamLocal' ? new TeamLocalModeRules(zone) : new UtcModeRules(zone);
  });

  toApiDateTime(instant: Date | string): ApiDateTime;
  toApiDateTime(instant: Date | string | null | undefined): ApiDateTime | null;
  toApiDateTime(instant: Date | string | null | undefined): ApiDateTime | null {
    if (instant == null) {
      return null;
    }
    return this.rules().toApiDateTime(toInstant(instant));
  }

  fromApiDateTime(value: string): Date;
  fromApiDateTime(value: string | null | undefined): Date | null;
  fromApiDateTime(value: string | null | undefined): Date | null {
    if (value == null) {
      return null;
    }
    return this.rules().fromApiDateTime(value);
  }

  toApiDate(day: CalendarDay): ApiDate;
  toApiDate(day: CalendarDay | null | undefined): ApiDate | null;
  toApiDate(day: CalendarDay | null | undefined): ApiDate | null {
    if (day == null) {
      return null;
    }
    return this.rules().toApiDate(day);
  }

  fromApiDate(value: string): CalendarDay;
  fromApiDate(value: string | null | undefined): CalendarDay | null;
  fromApiDate(value: string | null | undefined): CalendarDay | null {
    if (value == null) {
      return null;
    }
    return this.rules().fromApiDate(value);
  }

  toApiDateRange(firstDay: CalendarDay, lastDay: CalendarDay): ApiDateRange {
    return {
      from: this.toApiDate(firstDay),
      toExclusive: this.toApiDate(addCalendarDays(lastDay, 1)),
    };
  }

  nowAsApiDateTime(): ApiDateTime {
    return this.toApiDateTime(nowUtc());
  }
}
```

**Helpers it uses** (`shared/time/time-core.ts` and `team-calendar.ts`, from the UTC plan's kit). Every helper takes the zone first:

| Helper | Does | Origin |
|---|---|---|
| `nowUtc()` | the real current instant | UTC plan `time-core` |
| `toInstant(value)` | a `Date`, or the UTC ISO string a component holds, → `Date` | new |
| `parseApiInstant(value)` | strict ISO parse; a missing `Z` is UTC, never device-local | UTC plan `parseWire`, renamed |
| `parseApiWallClock(value)` | the same parse, typed `WallClock` (its UTC fields are the team's wall clock) | new |
| `utcToTeamWallClock(zone, instant)` | instant → `WallClock`, using the offset **at that instant** (AD1) | UTC plan `time-core` |
| `teamWallClockToUtc(zone, wallClock)` | `WallClock` → instant, using the offset valid **at that wall clock** (AD2) | UTC plan `time-core` |
| `startOfTeamDayUtc(zone, day)` | the instant the team's day starts (today's London-midnight shape) | UTC plan `teamCalendar` |
| `teamDayOf(zone, instant)` | the team's day of an instant | UTC plan `teamCalendar` |
| `calendarDayOf(instant)` | the day of a calendar-date value (the UTC date of `D 00:00Z`) | new (the UTC plan reads calendar dates with `teamDayOf`) |
| `calendarDayToIso(day)` | `D` → `D T00:00:00.000Z` | UTC plan `calendarDateToWire`, renamed |
| `addCalendarDays(day, n)` | day arithmetic with no zone | new |

**Code style for everything in `shared/time/` and the API services:**

- One job per file: types, mode rules, converter, helpers.
- The storage mode is read in one place (`rules`), never as an `if` inside a conversion.
- Names pair up: every `toApi…` has a `fromApi…`.
- Helpers take the zone first and the value second.
- No `!` and no `as ApiDateTime` / `as ApiDate` outside `storage-mode-rules.ts`.
- Braces on every `if`, an explicit return type on every public method, and no comments.
- An API service injects the converter as `apiDates` and converts DTOs in two private methods, `toRequest(…)` and `fromResponse(…)`, next to the HTTP call.

| Rule | Detail |
|---|---|
| **AD1 — offset per date** | `utcToTeamWallClock` uses the IANA rules at that instant (`Intl` or `date-fns-tz`, chosen in P1.12): never `getTimezoneOffset()`, never today's offset, never the `Intowork.TeamUtcOffset` header. |
| **AD2 — wall clock back to instant** | `teamWallClockToUtc` subtracts the offset valid at that wall clock. A time in the spring gap (01:30 on 2027-03-28) moves forward; a time in the repeated autumn hour takes the first (BST) occurrence. |
| **AD3 — calendar dates never get an offset** | `D 00:00Z` in memory, in API calls and in the database. |
| **AD4 — explicit per field** | Each API service maps its request and response DTOs field by field (`toApiDateTime` / `toApiDate` / `fromApiDateTime` / `fromApiDate`). Which fields are date-times and which are dates comes from the field mapping (P0.9). |
| **AD5 — the type system enforces it** | Request DTO date fields are typed `ApiDateTime` / `ApiDate`. Only `storage-mode-rules.ts` creates those types, so a raw `Date` or `toISOString()` in a request body does not compile. ESLint bans `toISOString()`, `toJSON()`, `JSON.stringify` of objects with `Date`, and `as ApiDateTime` / `as ApiDate` outside `shared/time/`. |
| **AD6 — query strings too** | `HttpParams` dates come only from `ApiDateConverter` (67 sites in 14 Frontend files, 5 in HandoverApp, 2 in InspectionsApp). |
| **AD7 — everything that crosses the boundary** | SignalR notification payloads (NotificationService hub), `localStorage` entries holding dates (keyed by `storageMode`, cleared on change), offline queues (mobile apps), `xlsx` exports (display helpers, UTC plan 1.31). |

**Example: an API service.**

```ts
@Injectable({ providedIn: 'root' })
export class AbsenceApiService {
  private readonly http = inject(HttpClient);
  private readonly apiDates = inject(ApiDateConverter);
  private readonly url = `${environment.resourcesApi}/absences`;

  createAbsence(form: AbsenceForm): Observable<Absence> {
    return this.http
      .post<AbsenceResponse>(this.url, this.toRequest(form))
      .pipe(map(response => this.fromResponse(response)));
  }

  getAbsences(firstDay: CalendarDay, lastDay: CalendarDay): Observable<Absence[]> {
    const range = this.apiDates.toApiDateRange(firstDay, lastDay);
    const params = new HttpParams().set('from', range.from).set('to', range.toExclusive);
    return this.http
      .get<AbsenceResponse[]>(this.url, { params })
      .pipe(map(responses => responses.map(response => this.fromResponse(response))));
  }

  private toRequest(form: AbsenceForm): CreateAbsenceRequest {
    return {
      staffMemberId: form.staffMemberId,
      startDate: this.apiDates.toApiDate(form.startDay),
      endDate: this.apiDates.toApiDate(form.endDay),
      requestedAt: this.apiDates.nowAsApiDateTime(),
    };
  }

  private fromResponse(response: AbsenceResponse): Absence {
    return {
      ...response,
      startDay: this.apiDates.fromApiDate(response.startDate),
      endDay: this.apiDates.fromApiDate(response.endDate),
      requestedAt: this.apiDates.fromApiDateTime(response.requestedAt),
    };
  }
}
```

**What is required at cut-over and what can follow.** `ApiDateConverter` in every API service, query string, SignalR handler, cache and offline queue (Phase 3) **must** be live before the flip. A screen that still uses `mat-datepicker` and `| date` keeps working for users whose device is in London, because the values it holds are real instants and the service converts them. Moving every screen onto the shared control and pipes (Phase 6) is required before a non-London team or a user whose device is outside London.

### 4.7 Containers

No container sets `TZ` (UTC plan 4.7). The six `ENV TZ=Europe/London` lines (ActiveWork API and Background, Inspections API and Background, Materials API, Report.API) are removed **in the cut-over release** of those six images. Phase 2 makes the code independent of the process zone in both modes, so the TZ-matrix suite is the proof that the removal changes nothing else.

### 4.8 Recurring jobs (Hangfire)

Jobs keep their zone: a job set up for 08:00 London still runs at 08:00 London (Hangfire stores the next run in real UTC). What changes is inside the job: "today" is `IDateTimeProvider.Today` and every date it writes is wall clock. The UTC plan's per-team job registrar (UTC plan 4.8) is not needed for cut-over; it moves to Phase 8.

### 4.9 Event-sourced services

ActiveWork, Attendance (`Events`, `WageEvents`), Customer, Forecasting, Handover, Inspections, Permissions (+ customer), Project and Resources (+ customer) keep event stores: **12 collections**, with **120 domain event classes and 318 date paths** inside `Data`. The migration converts those dates (T6). After cut-over:

- Replaying an aggregate from converted events gives the same projection as the converted projection (report M4.6 checks this on samples).
- `EventId.CreationTime` is real UTC → B.f.
- `RaisedDate = DateTime.UtcNow` inside `OnSubmitted` (`HsInspection.cs:127`, `Inspection.cs:174`) is re-evaluated on replay today; it becomes `IDateTimeProvider.Now` stamped in the handler (as UTC plan 3.g).

### 4.10 Known consequences (accepted unless a decision changes them)

| Consequence | Where it shows | Handling |
|---|---|---|
| Repeated autumn hour | two real times 00:xx Z and 01:xx Z on the last Sunday of October both store as 01:xx | T9; M0 counts them; sort ties possible |
| Elapsed time across a clock change | clock-in/out, durations, SLAs | T8: `ITeamTime.Elapsed` for pay and durations shown to users |
| `Z` no longer means UTC | any consumer outside the three apps (customer portal, exports with ISO dates, integrations, BI) | P0.6 lists them; each converts or accepts wall-clock semantics |
| Mixed zones later | portfolio and admin views over teams in different zones | T12, Phase 8 |
| Zone cannot change | team settings | T11; the edit form keeps the zone read-only |

---

## 5. Phases

Each phase: **Goal · Before you start · Steps · Done when.**

---

### Phase 0 — Decisions and discovery

**Goal:** close T0–T14 and measure the data before code changes.

*Decisions*
- [ ] **P0.1** T0 (which plan), then T4–T14 with the recommended answers or alternatives.
- [ ] **P0.2** Payroll sign-off on T8 and on Appendix A.1.
- [ ] **P0.3** Finance answer for T10.

*Data (migration report M0)*
- [ ] **P0.4** Restore a production snapshot into an isolated Atlas cluster; run the profile script (report M0): document counts, date paths found in data that the models do not declare, string-typed dates, sentinel counts, UTC time-of-day histogram per calendar field, values in the repeated autumn hour, Atlas Search indexes and change streams per collection, disk headroom for shadow collections.
- [ ] **P0.5** Confirm every calendar field's old shape (London midnight vs UTC midnight vs other) from the histogram; update the calendar list in the migration config. Dev is done (2026-10-06, `../utc-time-zone/UTC_IMPLEMENTATION_PLAN.md` Appendix B): it moved 20 fields that hold real times to rule I and gave rule C its three cases (migration report section 2 and 3.4). The production run confirms: the same 20 instant fields, that `23:59`/`22:59` means the same London day, the 17,020 `Attendance:StaffAssignments.CompletedDate` rows at `00:00Z`, the 90 Prelims rows at `16:13`, the 9 paths empty on dev, the odd rows of the date-only group, and that no value falls outside rule C: device midnights further east than +3 (`18:30Z`, `12:00Z`, `11:00Z`) are not covered (none on dev; a new shape gets a rule case before the night). The P4 rehearsal also lists rows that become the same key after rule C (migration report M4.10). Known UTC-midnight writers: Resources HR-synced and bank-holiday absences (`HrService.cs:169, 200`, `TimeTasticAbsenceProviderService.cs:157`, `BankHolidaysProviderService.cs:78`), Frontend `Date.UTC` sites (vehicle calendar and availability, staff wallchart and calendar, daily and weekly resource planners).

*Consumers and boundaries*
- [ ] **P0.6** Every reader of our dates outside the three apps: customer-facing apps (Customer modules in Gateway, Handover, Jobs, Permissions, Resources), exports, webhooks, BI. Each gets a conversion owner or an accepted "wall clock" note.
- [ ] **P0.7** External APIs that need real instants (Google Routes, TimeTastic, Breathe HR, bank holidays, push and e-mail providers): mark which send or receive instants; those use `ToSystemInstant` / `FromSystemInstant`.
- [ ] **P0.8** Gaffer: does it show or reason about business "today"? If yes, its business reads use `IDateTimeProvider`; its store stays technical.
- [ ] **P0.9** **Field mapping** (frontend): every DTO date field in the 59 API service files marked instant, day or technical; also marks the display kind for Phase 6 (UTC plan 0.18). Generated from the backend inventory (report Appendix A) plus the frontend models (135 Frontend model files, 502 date-like fields; HandoverApp 17; InspectionsApp 13).
- [ ] **P0.10** Clock-read classification list (459 server sites): business → `IDateTimeProvider`, technical → `ISystemClock`. Starts from the estimate in section 8.1.
- [ ] **P0.11** Find the external caller of ActiveWork `TriggerTomorrowAssignmentsReminder` (UTC plan 0.11); it must stop during the window.
- [ ] **P0.12** Offline queues: confirm what HandoverApp (`handover.service.ts`, `offline-handovers`) and InspectionsApp (`post-queue.service.ts`, `sync.service.ts`) store — the model or the request body.

**Done when:** every decision has an answer; the profile output and both mappings are attached to the migration report.

---

### Phase 1 — Foundations

**Before you start:** P0.1, P0.2.

*Backend kit (master in AttendanceService)*
- [ ] **P1.1** `ISystemClock`, `IDateTimeProvider`, `ITeamTime` (both modes), `TimeStorageMode`, config binding, health field `timeStorageMode`. *Tests: every method × both modes × the standard zone set (UTC plan 4.3) × both UK clock-change days; `Elapsed` gives 7 h and 9 h for 00:00–08:00 on 2027-03-28 and 2026-10-25 in TeamLocal mode.*
- [ ] **P1.2** `WireDate`, JSON converters, MVC binder — both modes. *Tests: in TeamLocal mode `…T08:00:00Z`, `…T08:00:00`, `2026-07-01` keep their digits under every TZ-matrix process zone; `+01:00` → 400; in Utc mode results equal today's `DateTime.Parse` in a London process.*
- [ ] **P1.3** Analyzer + `BannedSymbols.txt`, sync script, drift check (UTC plan 1.11, 1.12).
- [ ] **P1.4** `Common.Data`: mode-aware `DateTime` serializer (TeamLocal: `Unspecified`/`Local` stored by digits, read `Kind=Utc`); `FilterAndSortExtension` through the package's `WireDate` rule. *Tests under the TZ matrix.*
- [ ] **P1.5** `Common.Messaging`: shared JSON options (round-trip `Z` values unchanged).
- [ ] **P1.6** Publish both packages.

*CI*
- [ ] **P1.7** TZ-matrix pipeline (UTC, London, Los Angeles, Auckland) × mode matrix (Utc, TeamLocal) in every repo; record baselines.
- [ ] **P1.8** Grep gates: zone names and `TimeZoneInfo` outside `Time/`; `TZ` in Dockerfiles and pipelines; Mongo `"timezone"` outside the kit.

*Frontend kit*
- [ ] **P1.9** `TeamTimeService` with `zone()`, formats and `storageMode()` (from Gateway, P1.15; from environment config until then).
- [ ] **P1.10** `ApiDateConverter`, `UtcModeRules`, `TeamLocalModeRules`, branded types + tests: the worked example in section 1 for London summer, London winter, Riyadh, New York, Kolkata (+5:30), Chatham (+12:45); spring gap and autumn overlap; device zone ≠ team zone; both modes.
- [ ] **P1.11** API-date golden harness (UTC plan 1.33) extended to query strings, SignalR payloads and queued offline requests.
- [ ] **P1.12** Shared control and pipes — UTC plan 1.19–1.29 (time core, formats, `teamCalendar`, `teamDate`, `calendarDate`, `<app-date-time-field>`), choosing `Intl` or `date-fns-tz`.
- [ ] **P1.13** ESLint: AD5 rules (warn), plus the UTC plan's C1 bans for Phase 6 (warn).
- [ ] **P1.14** Copy `shared/time/` to HandoverApp and InspectionsApp (Angular 16 wrappers) with the drift check (UTC plan 1.34, 1.35); `x-client-build` header (UTC plan 1.36).

*Gateway*
- [ ] **P1.15** `Time:StorageMode` in Gateway config; `GET /api/gateway/team/time-settings` returns `{ timeZone: "Europe/London", dateFormat, timeFormat, storageMode }` (UTC plan 6.T.12 reduced to defaults).

*Migration tooling (report section 5)*
- [ ] **P1.16** `oskfel-migrations/team-local-time/` scripts: config, profile, dry run, build shadows, verify, swap, rollback, reverse. Tests with fixture documents for every rule in report section 2.

**Done when:** kit tagged and synced to Attendance; packages published; both CI matrices running in every repo; `ApiDateConverter`, the control and the pipes pass their tests in the three apps; the migration scripts pass their fixtures.

---

### Phase 2 — Backend: every repo mode-aware

**Goal:** every service gives today's results in Utc mode and correct wall-clock results in TeamLocal mode.
**Before you start:** P1.3, P1.6, P1.7 for the repo; P0.10 for the repo.

**Recipe — one PR per row, per repo**

| | Step |
|---|---|
| **B.a** | Sync the kit; `AddIntoworkTime()`; analyzer at warning. |
| **B.b** | Every clock read: business → `IDateTimeProvider.Now` / `Today`; technical → `ISystemClock.UtcNow` (list from P0.10). Property initialisers `= DateTime.UtcNow` move to the creating handler. |
| **B.c** | `DateTime.Parse` / `TryParse` at controllers and in filters → `WireDate`. |
| **B.d** | Bump `Common.Data` and `Common.Messaging`; register the serializer. |
| **B.e** | Every London conversion or DST adjustment (section 4.5) → `ITeamTime.ToBusinessLocal` / `FromBusinessLocal`; pinned by tests in Utc mode first. |
| **B.f** | `ObjectId.CreationTime` used as a business date → `FromSystemInstant` (84 sites). |
| **B.g** | Mongo pipeline `timezone` → `ITeamTime` (omitted in TeamLocal mode). |
| **B.h** | PDFs, e-mails, push texts print the stored value through the formatter (UTC plan `IDateFormatter`) using `ToBusinessLocal` (identity in TeamLocal mode). |
| **B.i** | Technical times in API responses (section 4.4 last column) → `FromSystemInstant`; real instants sent to external APIs (P0.7) → `ToSystemInstant`. |
| **B.j** | Day logic review: `.Date`, `DayOfWeek`, `UtcNow.Date` on business values are correct in TeamLocal mode; any comparison of a business date with `ISystemClock` is a bug (L4). |
| **B.k** | Tests: request round trip, repository read/write, event replay, both modes, TZ matrix; analyzer to error for the repo. |
| **B.l** | Services with an outbox (ActiveWork, Attendance, Forecasting, Handover incl. customer, Inspections, Project, Resources incl. customer): the publisher never sends a row created before the cut-over marker (report M2.4), so an unconverted pre-cut-over row cannot reach another service. |

A sub-step with nothing to do is closed with a one-line note.

**Repo order (smallest first):** Forecasting · Notification · CommonLibs · SafetySuite · Customer · Permissions · Gateway · Gaffer · Inspections · ActiveWork · Resources · Handover · Materials · Project · Report.API · Attendance (Appendix A).

**Repo notes**
- **Report.API** reads other services' collections directly (15 collections); its pipelines and `ReportingCalendar` follow the mode; `WagesPipeline` Dublin stages and `WageCalculationStageBuilder` are deleted (unused output, UTC audit).
- **Resources:** `HRJobScheduler` keeps the London schedule zone through `ITeamTime.ScheduleZone`; the 14 `SpecifyKind` calls are rechecked in B.c.
- **Inspections:** `RaisedDate` stamping moves to the handler (section 4.9).
- **NotificationService:** SignalR payload dates are wall clock in TeamLocal mode; `ExpiresAt` stays technical and is converted when sent.

**Done when:** every repo green in both modes under the TZ matrix; analyzer at error; zone gate at 0 outside `Time/`; every service reports `timeStorageMode` on health.

---

### Phase 3 — Frontend: `ApiDateConverter` at every boundary

**Goal:** every date that leaves or enters the three apps goes through `ApiDateConverter`; behaviour in Utc mode equals today.
**Before you start:** P1.9–P1.14; P0.9 for the module.

*Frontend (Angular 19) — one PR per service file or group*

| Step | Files (HTTP calls / date mentions) |
|---|---|
| **F.1** | `jobs/job.service.ts` (62 / 58), `jobs/project-overview-tab/project-overview.service.ts`, `jobs/job-minimized.service.ts`, `jobs/published-job.service.ts` |
| **F.2** | `quotations/quotations.service.ts` (48 / 73), `variations/variations.service.ts` |
| **F.3** | `pricing/pricing-data.service.ts` (47 / 30), `teams-settings/sector-list/sector.service.ts` |
| **F.4** | `activework/activework.service.ts` (29 / 111), `activework/handover.service.ts` (14 / 10), `activework/aggregate.service.ts` |
| **F.5** | `resources/resources.service.ts` (25 / 11), `resources/availability-calendar/availability.service.ts` |
| **F.6** | `materials/vehicles.service.ts` (21 / 24), `material-orders.service.ts` (16 / 59), `material-collections.service.ts` (15 / 34), `stock/material-stock.service.ts`, `materials.service.ts`, `materials-requests.service.ts` |
| **F.7** | `attendance/attendance.service.ts` (11 / 18) |
| **F.8** | `wage/wage.service.ts` (10 / 155), `wage-legacy/wage-legacy.service.ts` (8 / 84), `wage-legacy-2/wage-legacy2.service.ts` (8 / 177) — or delete the legacy ones if unused |
| **F.9** | `forecasting/forecasting.service.ts` (7 / 49), `weekly-resource-planner/services/weekly-resource-planner-api.service.ts`, `daily-resource-planner/services/daily-resource-planner-api.service.ts` |
| **F.10** | `customers/customers.service.ts`, `baton-customers/baton-customer.service.ts`, `auth/permissions.service.ts`, `auth/teams-api.service.ts`, `shared/team-settings.service.ts` |
| **F.11** | `safety-suite/near-miss/near-miss.service.ts`; `near-miss-form.component.ts:165` (device-offset hack) → control + `ApiDateConverter` |
| **F.12** | `reports/*` services (project-labour-drill, portfolio-labour, project-cvr-all, project-centre-cvr) |
| **F.13** | `takeoff/*` services and `takeoff/engine-3d.component.ts`, `shared/version-info.service.ts`, `shared/item-title-tags-extraction/...service.ts`, `gaffer/services/gaffer-api.service.ts`, `shared/help/help-content.service.ts`, `shared/tenant-plan/tenant-plan.service.ts` (confirm no dates, close with a note) |
| **F.14** | `shared/user-notifications.service.ts` + the SignalR handler for the notification hub (AD7) |
| **F.15** | `HttpParams` dates (67 sites in 14 files) and components that pre-format dates for services (149 `toISOString` in 52 files; date-fns `format` to `yyyy-MM-dd` for requests) → pass days/instants to the service, which encodes |
| **F.16** | `localStorage` entries with dates (from the 158 sites in 46 files) keyed by `storageMode`; delete `DateUtils.addHoursUTCDifferent` (`shared/utils/date-utils.ts:26`, unused) |
| **F.17** | API-date golden spec per service: every endpoint's body and query string, both modes, device zones of the standard set |
| **F.18** | ESLint AD5 to error |

*HandoverApp (Angular 16)* — 5 service files, 22 HTTP calls, 5 query-string dates, 17 model fields
- [ ] **H.1** `ApiDateConverter` in `handover.service.ts`, `attendance.service.ts` and the other three services; capture dates from `nowAsApiDateTime()`; `signoff-info-step.component.ts:82` `startOfDay(<string>)` → `ApiDateConverter.fromApiDate`.
- [ ] **H.2** Offline queue (P0.12): if it stores request bodies, it stores the **model** and encodes at send time, so a mode change between queueing and sending is safe; otherwise force sync before the window (report C2).
- [ ] **H.3** API-date golden and offline replay specs; minimum build released before the window.

*InspectionsApp (Angular 16)* — 8 service files, 21 HTTP calls, 2 query-string dates, 13 model fields
- [ ] **I.1** `ApiDateConverter` in the 8 services; `date-entry.component.ts:73` day via `toApiDate`.
- [ ] **I.2** `post-queue.service.ts` / `sync.service.ts` as H.2.
- [ ] **I.3** Specs; minimum build.

**Done when:** every API call, query string, SignalR payload, cache entry and queued request in the three apps passes through `ApiDateConverter` (API-date golden green in both modes); ESLint AD5 at error; apps deployed in Utc mode with no change in request bodies (API-date golden baseline equal to today).

---

### Phase 4 — Rehearsals on a production copy

**Goal:** prove the whole cut-over end to end, twice, and measure it.
**Before you start:** Phases 2 and 3 merged; images built for TeamLocal mode with `TZ` removed.

- [ ] **P4.1** Rehearsal 1 on a fresh production snapshot (isolated cluster): run the report runbook C1–C12 exactly, with timings per collection.
- [ ] **P4.2** Verification suite (report section 6) green.
- [ ] **P4.3** **Wage shadow compare** (Appendix A.3): the last 26 weeks, including the weeks of 2026-03-29 and 2026-10-25, recalculated in TeamLocal mode on migrated data vs the stored pre-migration results. Every difference maps to A.1; finance signs off.
- [ ] **P4.4** **Report shadow compare:** Report.API outputs (labour daily, CVR, plant, stock, prelims) for 3 months before and after, by day; differences only in the 00:00–01:00 BST hour.
- [ ] **P4.5** UI walk-through in staging on the migrated copy: every Frontend route, both mobile apps, a PDF, an e-mail, an export — dates show the same wall clock as before migration.
- [ ] **P4.6** Rollback drill: swap back (report R1), flip to Utc, start; the apps work as before.
- [ ] **P4.7** Rehearsal 2 with the final scripts; the window estimate is the measured time + 50 %.

**Done when:** two clean rehearsals; P4.3 signed off; window length agreed.

---

### Phase 5 — Cut-over

Runbook: migration report section 5 (C1–C12). Summary: maintenance on → mobile queues synced → schedulers and the external reminder caller stopped → outbox and Service Bus drained to zero → services stopped → Redis flushed → Atlas snapshot → migrate → verify → swap → deploy TeamLocal config and `TZ`-free images → smoke tests → apps forced to reload → reopen.

**Go / no-go before reopening:** verification green, smoke tests green, every service reports `TeamLocal`. A "no-go" runs rollback R1 (minutes, no data loss).

---

### Phase 6 — Screens on the shared control and pipes

The UTC plan's screen work, unchanged: UTC plan 6.F.1–6.F.30 (Frontend), 6.H.6–6.H.9 (HandoverApp), 6.I.3–6.I.6 (InspectionsApp), with the 0.18 display mapping taken from P0.9. **Difference:** request and response conversion is already done by `ApiDateConverter` (Phase 3), so these steps change only inputs, displays and in-component logic.

Counts to migrate (Frontend): 310 `| date` pipes in 112 files, 61 `formatDate`, 113 date-fns `format`, 140 `toLocale*`, 213 datepicker references in 19 files, 57 native date inputs, 19 time inputs, 904 local getters and 239 local setters, 1,230 `new Date(<value>)`. HandoverApp: 9 pipes; InspectionsApp: 5 pipes, 8 datepicker references.

**Done when:** UTC plan 6.F "Done when" holds; required before Phase 8.

---

### Phase 7 — Clean-up

- [ ] **P7.1** After 30 stable days: drop `__utc_<date>` backup collections (report R4).
- [ ] **P7.2** Delete the `Utc` branches: `ToBusinessLocal` / `FromBusinessLocal` become identity and are inlined away; `WireDate` and the serializer keep only the TeamLocal rule; `storage-mode-rules.ts` loses `UtcModeRules` and `ApiDateConverter.rules` always builds `TeamLocalModeRules`; remove `Time:StorageMode`.
- [ ] **P7.3** Gates permanent: analyzer, zone grep, `TZ` grep, API-date golden, TZ matrix.

---

### Phase 8 — Later: per-team zones (before the first non-London team)

Reuse UTC plan 6.T (team settings in ProjectService → events → Gateway headers `Intowork.TeamTimeZone` …), UTC plan 4.5 precedence rules and UTC plan 4.8 per-team Hangfire jobs. `ITeamTime` takes the zone from `ITeamTimeContext` (request) or the service's team copy (background). New teams choose their zone once (T11); their data is written in that zone from the first day, so no migration is needed. Cross-team views follow T12.

---

## 6. Order, dependencies and size

| Phase | Starts after | Runs in parallel with |
|---|---|---|
| 0 | — | — |
| 1 | P0.1, P0.2 | P0.4–P0.12 |
| 2 | P1.3, P1.6, P1.7 for the repo; P0.10 | 3 |
| 3 | P1.9–P1.14; P0.9 | 2 |
| 4 | 2 and 3 merged and deployed in Utc mode | — |
| 5 | 4 signed off; T13 | — |
| 6 | P1.12 (can start before 5) | 2, 3, 4, after 5 |
| 7 | 30 days after 5 | 6 |
| 8 | 6 done | — |

**Critical path:** P0.1 → P1 → Attendance (Appendix A) → P4.3 payroll sign-off → cut-over.

### Change map across every service

How the changes flow. Each box gives the steps, the collections and event stores migrated, and the largest code counts (8.1). The bar shows the size of the change in backend date sites.

```text
Time:StorageMode    Utc ══ one flip at cut-over (C9) ══► TeamLocal
                    applies to every service and app below

CommonLibs · Intowork.Common.Time kit (P1.1–P1.8)
ISystemClock · IDateTimeProvider · ITeamTime · WireDate · JSON · binder · Mongo serializer
│
├─► EVENT-SOURCED SERVICES · B.a–B.l + event store rewrite
│     Service      Steps          Colls  Stores  Highlights                            Size (date sites)
│     Attendance   12 + 17 ATT-L      9       2  DST 33 · Parse 27 · CreationTime 15   ████████████████████ 115
│     Project      12                45       1  clock 65 · CreationTime 30            █████████████████     99
│     Handover     12                 8       1  clock 61 · CreationTime 14            ██████████████        80
│     Resources    12                 7       2  clock 36 · HRJobScheduler zone        █████████             49
│     ActiveWork   12                 6       1  clock 29 · Parse 9 · TZ ×2            ████████              45
│     Inspections  12                 5       1  Parse 12 · TZ ×2                      ███████               39
│     Permissions  11                 5       2  CreationTime 7                        ███                   18
│     Customer     11                 3       1  CreationTime 5                        ███                   17
│     Forecasting  12                 2       1  Parse 4                               █                      7
│
├─► SERVICES WITHOUT AN EVENT STORE · B.a–B.k
│     Service      Steps          Colls  Stores  Highlights                            Size (date sites)
│     Materials    11                11       —  clock 74 · Parse 12 · TZ              ███████████████       86
│     Report.API   11                0*       —  clock 47 · Mongo timezone 4 · TZ      ██████████            55
│     Gaffer       11                 0       —  technical store                       ██████                32
│     SafetySuite  11                 3       —  clock 10                              ██                    10
│     Notification 11                 1       —  SignalR                               ██                     9
│     * Report.API owns no collections; it reads 15 of the others.
│
├─► GATEWAY · 11 steps · 1 coll · clock 12 · P1.15 time settings + storageMode
│     └─► OcelotConfigValidator: gate only
│
└─► ANGULAR APPS · ApiDateConverter in the API services, no interceptor
      Frontend        F.1–F.18   46 services  450 calls  ████████████████████ 450
      HandoverApp     H.1–H.3     5 services   22 calls  █                     22
      InspectionsApp  I.1–I.3     8 services   21 calls  █                     21
      ▲
      └── team zone + storageMode come from Gateway; dates go out as wall clock labelled Z

oskfel-migrations (M0–M6) ══ shadow, then swap at cut-over ══► 118 collections · 12 event stores · 501 paths
```

**Backend code sites per service.** These are the sum of the 8.1 counts: clock reads + `Parse` + DST logic + `CreationTime` + Mongo `timezone`.

```text
Backend date sites to change, per service (clock reads + Parse + DST + CreationTime + Mongo timezone)

Attendance    ████████████████████████████████████████  115
Project       ██████████████████████████████████         99
Materials     ██████████████████████████████             86
Handover      ████████████████████████████               80
Report.API    ███████████████████                        55
Resources     █████████████████                          49
ActiveWork    ████████████████                           45
Inspections   ██████████████                             39
Gaffer        ███████████                                32
Permissions   ██████                                     18
Customer      ██████                                     17
Gateway       ████                                       12
SafetySuite   ███                                        10
Notification  ███                                         9
Forecasting   ██                                          7
CommonLibs    ██                                          6
```

**Collections migrated per service.** These come from the migration report; event stores are counted separately below.

```text
Collections converted, per service

Project       ████████████████████████████████████████  45
Materials     ██████████                                11
Attendance    ████████                                   9
Handover      ███████                                    8
Resources     ██████                                     7
ActiveWork    █████                                      6
Inspections   ████                                       5
Permissions   ████                                       5
Customer      ███                                        3
SafetySuite   ███                                        3
Forecasting   ██                                         2
Gateway       █                                          1
Notification  █                                          1
```

Event stores: Attendance 2, Permissions 2, Resources 2, and one each in ActiveWork, Customer, Forecasting, Handover, Inspections and Project. That makes 12.

**Frontend per app.**

```text
Frontend API surface to wrap with ApiDateConverter (HTTP calls)

Frontend        ████████████████████████████████████████  450
HandoverApp     ██                                         22
InspectionsApp  ██                                         21
```

**Backend change sites by kind** (8.1 totals):

```text
Backend date sites by kind

Clock reads                   ███████████████████████████               459   68 %
DateTime.Parse / TryParse     ██████                                     99   15 %
ObjectId.CreationTime         █████                                      84   12 %
DST adjustments (Attendance)  ██                                         33    5 %
Mongo timezone stages         █                                           4    1 %
Total                                                                   679  100 %
```

**Frontend touchpoints per kind** (8.2, Frontend app):

```text
Frontend date touchpoints (Frontend app)

Model date fields   ████████████████████████████████████████  502
HTTP calls          ████████████████████████████████████      450
| date pipe         █████████████████████████                 310
Datepicker refs     █████████████████                         213
toISOString         ████████████                              149
Query-string dates  █████                                      67
```

**Storage mode over time** (4.2, Phase 5, Phase 7, migration report R1 and R2):

```text
 Phases 2 and 3 deployed
        │
        ▼
 ┌──────────────┐
 │   Utc mode   │ ◄──────────────────────────────┐
 └──────┬───────┘                                │
        │ C1–C8: maintenance + migration         │
        ▼                                        │ R1 no-go: rename back
 ┌──────────────┐                                │
 │  Migrating   │ ───────────────────────────────┤
 └──────┬───────┘                                │
        │ C9: flip Time:StorageMode              │ R2: reverse shadows (rare)
        ▼                                        │
 ┌──────────────┐                                │
 │  TeamLocal   │ ───────────────────────────────┘
 └──────┬───────┘
        │ P7, after 30 stable days: Utc code deleted
        ▼
 ┌──────────────────┐
 │  TeamLocal only  │
 └──────────────────┘
```

**Order of change per service across the phases:**

```text
P0  decisions T0–T14 · M0 profile
 │
 ▼
P1  kit: CommonLibs → every repo · Gateway P1.15
 │
 ├───────────────────────────────────┐
 ▼                                   ▼
P2  backend B.a–B.l                  P3  frontend ApiDateConverter
    16 repos, Utc mode                   Frontend · HandoverApp · InspectionsApp
    Attendance ATT-L.1–17
 │                                   │
 └─────────────────┬─────────────────┘
                   ▼
P4  rehearsals: migration timing · M4 checks · Attendance shadow compare
                   │
                   ▼
P5  cut-over: migrate 118 colls + 12 stores · flip StorageMode · remove TZ ×6
                   │
         ┌─────────┴──────────┐
         ▼                    ▼
P6  screens on the        P7  clean-up after 30 days
    shared control            delete the Utc bodies
         │
         ▼
P8  per-team zones
```

### Steps per repo

| Repo | B.a–B.l | Extra | Collections migrated | Event store |
|---|---|---|---|---|
| ActiveWork | 12 | container `TZ` ×2 | 6 | `ActiveWork:Events` |
| Attendance | 12 | Appendix A (17 ATT-L steps) | 9 | `Attendance:Events`, `Attendance:WageEvents` |
| CommonLibs | 5 (B.a, B.b, B.c, B.d, B.k) | P1.4–P1.6 | — | — |
| Customer | 11 | — | 3 | `Customers:Events` |
| Forecasting | 12 | — | 2 | `Forecasting:Events` |
| Report.API (FrameworkCache) | 11 | container `TZ`; delete Dublin code | 0 (reads 15) | — |
| Gaffer | 11 | P0.8 | 0 (technical store) | — |
| Gateway | 11 | P1.15 | 1 | — |
| Handover | 12 | — | 8 (incl. customer) | `Handovers:Events` |
| Inspections | 12 | container `TZ` ×2; `RaisedDate` | 5 | `Inspections:Events` |
| Materials | 11 | container `TZ` | 11 | — |
| Notification | 11 | SignalR | 1 | — |
| Permissions | 11 | — | 5 (incl. customer) | `Permissions:Events`, `Permissions:Customer:Events` |
| Project | 12 | — | 45 (incl. customer) | `Jobs:Events` |
| Resources | 12 | `HRJobScheduler` zone | 7 (incl. customer) | `Resources:Events`, `Resources:Customer:Events` |
| SafetySuite | 11 | — | 3 | — |

| App | `ApiDateConverter` steps | Service files | Screens (Phase 6) |
|---|---|---|---|
| Frontend | F.1–F.18 | 46 | UTC plan 6.F (30 steps) |
| HandoverApp | H.1–H.3 | 5 | UTC plan 6.H |
| InspectionsApp | I.1–I.3 | 8 | UTC plan 6.I |

---

## 7. Open questions (closed in Phase 0)

- Row counts, unknown fields and string dates → P0.4.
- Old shape of each calendar field → P0.5.
- Consumers outside the three apps → P0.6.
- External APIs with real instants → P0.7.
- Offline queue storage → P0.12.
- Whether `wage-legacy` and `wage-legacy-2` are still used → F.8.

---

## 8. Reference: inventory (2026-10-06)

### 8.1 Backend

| Repo | Clock reads (≈ technical) | `Parse` | Zone files | DST logic | `CreationTime` | Mongo `timezone` | Container `TZ` |
|---|---|---|---|---|---|---|---|
| ActiveWork | 29 (5) | 9 | 4 | — | 7 | — | API + Background |
| Attendance | 40 (8) | 27 | 9 | 33 sites / 8 files | 15 | — | — |
| CommonLibs | 4 (3) | 2 | — | — | — | — | — |
| Customer | 10 (2) | 2 | — | — | 5 | — | — |
| Forecasting | 1 (1) | 4 | — | — | 2 | — | — |
| Report.API | 47 (0) | 4 | 6 | — | — | 4 | API |
| Gaffer | 25 (0) | 7 | — | — | — | — | — |
| Gateway | 12 (12) | — | — | — | — | — | — |
| Handover | 61 (13) | 5 | 2 | — | 14 | — | — |
| Inspections | 25 (10) | 12 | 1 | — | 2 | — | API + Background |
| Materials | 74 (6) | 12 | 2 | — | — | — | API |
| Notification | 9 (4) | — | — | — | — | — | — |
| Permissions | 11 (2) | — | — | — | 7 | — | — |
| Project | 65 (15) | 4 | — | — | 30 | — | — |
| Resources | 36 (21) | 11 | 2 | — | 2 | — | — |
| SafetySuite | 10 (4) | — | — | — | — | — | — |
| **Total** | **459 (≈106)** | **99** | **26 files** | **33** | **84** | **4** | **6 images** |

Also: 537 `.Date` uses (Report.API 196, Attendance 133, ActiveWork 81, Materials 48, Project 36) — reviewed in B.j, mostly correct in TeamLocal mode; 59 `DateTime.MinValue/MaxValue` uses (the migration skips sentinels); 1 unique index on a date (`Resources:HrBankHolidays` `Date + CountryCode`, values unchanged by the calendar rule); 2 TTL indexes on dates (technical).

### 8.2 Frontend

| App | API service files | HTTP calls | Query-string dates | `toISOString` | Model files / date fields | `\| date` | Datepicker refs | Interceptors converting dates |
|---|---|---|---|---|---|---|---|---|
| Frontend | 46 | 450 | 67 | 149 | 135 / 502 | 310 | 213 | none (5 interceptors, none touch dates) |
| HandoverApp | 5 | 22 | 5 | 4 | 8 / 17 | 9 | 0 | none (4) |
| InspectionsApp | 8 | 21 | 2 | 0 | 7 / 13 | 5 | 8 | none (3) |

Device-offset hacks to remove: `shared/utils/date-utils.ts:26` (unused), `safety-suite/near-miss/near-miss-form/near-miss-form.component.ts:165`.

---

## 9. What carries over from the UTC plan

| UTC plan part | Here |
|---|---|
| 4.4 named formats, 4.6 control, pipes, `TeamTimeService`, `teamCalendar`, ESLint C1–C3 | **kept** (P1.12, Phase 6) |
| 1.19–1.35 frontend kit, 6.F / 6.H / 6.I screen steps | **kept** (P1.12, Phase 6) |
| `IDateTimeProvider` (R3), analyzer, kit copied per repo (D8), sync and drift check | **kept, with a new meaning:** `IDateTimeProvider` (implementation `TeamDateTimeProvider`) now returns the **team's** "now" for business data; the real UTC clock for technical times is the separate `ISystemClock` |
| 4.7 no `TZ` in containers | **kept**, done at cut-over |
| 6.T team settings through Gateway, 4.5 headers and precedence, 4.8 per-team Hangfire jobs, D13 zone never changes | **kept for Phase 8**; P1.15 ships the endpoint with London defaults |
| `IBusinessCalendar` | replaced by `ITeamTime` (much smaller: the data is already local) |
| D1 calendar date = the team's midnight stored as UTC (`D-1 23:00Z` for London in summer), `calendar.DayRangeUtc`, Phase 5 "calendar dates by the team's day" | **dropped** — every calendar date is `D 00:00` wall clock after the migration |
| D4 "no stored date is rewritten" | **reversed** — all business data, instants and calendar dates, is converted once |
| Attendance per-team switch (D10, D11), `Core/Legacy/` | **dropped**; replaced by the mode switch and the P4.3 shadow compare (Appendix A) |
| Kind=Utc guarantee (4.1) | kept as a mechanism; the meaning of the value changes (wall clock) |

---

## Appendix A — AttendanceService (payroll)

### A.1 What changes for payroll when data is wall clock

Today the code reads UTC values and adjusts for London in places (`isSummer ? -1 : 0`, `AdjustForDaylightSaving`, `RemoveDstSideEffect`, `ConvertTimeFromLondonToUTC`) and uses the UTC date in others. In TeamLocal mode every value is already London time, so the adjustments become identity and every `.Date` is the London day.

| # | Area | Today | TeamLocal | Expected pay effect |
|---|---|---|---|---|
| L-B1 | Day of a clock-in at 00:00–01:00 BST | previous UTC day where the code uses `.Date` | London day | moves to the correct day |
| L-B2 | Start/finish caps, standard hours, weekend rules | London via DST adjustments | London directly | none for normal shifts |
| L-B3 | `WeekCommencing` | Sun 23:00Z (summer) / Mon 00:00Z (winter) | Mon 00:00 always | none; exact-match lookups become reliable |
| L-B4 | Elapsed time across a clock change | real elapsed (UTC) | `ITeamTime.Elapsed` keeps real elapsed (T8) | none if T8 is accepted; ±1 h on those nights otherwise |
| L-B5 | Clock-out matched to clock-in by day | UTC day | London day | night shifts crossing 00:00–01:00 BST pair as on a London day |
| L-B6 | Reminders "today" | London (job zone) + UTC date filters | London | none |
| L-B7 | Report rows per day | UTC day | London day | rows in 00:00–01:00 BST move to the right day |

### A.2 Steps (`ATT-L`)

- [ ] **ATT-L.1** Safety-net tests in Utc mode, pinning today's results (UTC plan ATT 1.1–1.12 reused as is).
- [ ] **ATT-L.2** Kit master copy (P1.1–P1.3).
- [ ] **ATT-L.3** Clock reads (UTC plan ATT 3.1–3.9 with `IDateTimeProvider` / `ISystemClock`).
- [ ] **ATT-L.4** `WageController` (17 `Parse`), `AttendanceController` (4), `FilterAndSortExtension`, `GetWagesByProjectIdHandler` → `WireDate`.
- [ ] **ATT-L.5** `WageCalculatorExtension`: every London adjustment → `ToBusinessLocal` / `FromBusinessLocal`; elapsed time → `Elapsed`.
- [ ] **ATT-L.6** `ClockInOutTimeCalculator`: `ConvertTimeFromLondonToUTC` and the `DateTime.Today` DST read → `ITeamTime`; `Today` from `IDateTimeProvider`.
- [ ] **ATT-L.7** `WageWeekDateCalculator`: `AdjustForDaylightSaving`, `NormalizeDate`, `RemoveDstSideEffect` → `ITeamTime` (identity in TeamLocal mode); callers in `RecalculateWageRecordHandler`, `WageRecordApprovalHandler`, `WageCalculaterHelper`.
- [ ] **ATT-L.8** `WageHelper.CalcStdWage`; delete `WageHelperLegacy` (registered, never injected).
- [ ] **ATT-L.9** `SupervisorClockInHandler`, `SupervisorClockoutHandler` overlap messages → formatter.
- [ ] **ATT-L.10** `ReminderService` "today" → `IDateTimeProvider.Today`; Hangfire job zone → `ITeamTime.ScheduleZone` (still London).
- [ ] **ATT-L.11** `UserAttendanceRecord` (`.CreationTime` ×8), wage models and `CreateWageWeekSnapshotHandler` (15 sites) → `FromSystemInstant`.
- [ ] **ATT-L.12** TeamLocal-mode tests: the clock-change cases (7 h / 9 h with T8), a clock-in at 00:30 BST, a night shift 22:00–06:00, week commencing in both seasons — on wall-clock fixtures.
- [ ] **ATT-L.13** `WageRecordsRepo` `AddDays(7)` window and the `//TODO: Verify time zone correctness` note: correct in TeamLocal mode; remove the TODO with a test.
- [ ] **ATT-L.14** Delete the unused `potentialDeductions` query (`WageRecordsRepo.cs:194-200`).
- [ ] **ATT-L.15** Existing bugs, fixed in both modes and shipped alone before the rest: `RoundToClosestMinutes` hour-24 crash near midnight, delete the wrong and unused `IsWeekday`, end-of-day bound `< to.AddDays(1)` instead of `AddDays(1).AddSeconds(-1)` (8 sites).
- [ ] **ATT-L.16** Frontend wage maths (`wage/wage.service.ts`: own start/finish rule, `setHours`, UTC-day key) on the team-zone helpers; with F.8.
- [ ] **ATT-L.17** Recalculation dry-run flag for the shadow compare; replay check (rebuilt projections from migrated events equal the migrated projections).

Every site, the Utc and TeamLocal result of each, the 14 behaviour changes (B1–B14), the 14 existing bugs (E1–E14), the test matrix and the payroll questions Q-A1–Q-A5 are in `TEAM_LOCAL_TIME_ATTENDANCE_REPORT.md`.

### A.3 Shadow compare (Phase 4, P4.3)

On the migrated production copy, for the last 26 weeks and every team: recalculate each staff week in TeamLocal mode and compare hours, pay, bonuses and deductions with the stored (pre-migration) wage records. Report per week: identical, different with an A.1 reason, different without a reason (blocks cut-over). Finance signs off the report before T13 is set.

---

## Questions for the team

| # | Question | Needed by |
|---|---|---|
| **Q1** | T0: this plan instead of the UTC plan? | P0.1 |
| **Q2** | T4: ship code early behind `Time:StorageMode`, one flip at cut-over? | P1 |
| **Q3** | T5: shadow collections + rename (needs disk headroom = size of the in-scope collections), or in-place? | P0.4 |
| **Q4** | T6: rewrite event payload dates once (backed up)? | P1.16 |
| **Q5** | T7: is the technical list in 4.4 complete, and does Gaffer stay technical (P0.8)? | P0.10 |
| **Q6** | T8 (payroll): pay real elapsed time across clock changes? | P0.2 |
| **Q7** | T10 (finance): may weeks before the cut-over be recalculated with the new code? | P0.3 |
| **Q8** | T13: preferred weekend and maximum window length? | P4.7 |
| **Q9** | Who outside the three apps reads our dates (customer portal, exports, BI)? | P0.6 |
| **Q10** | T17: is blocking non-London teams until Phase 8 acceptable to the business? | P0.1 |
| **Q11** | T20 (payroll): pair clock-outs by the same London day, or adopt the UTC plan's 16-hour rule so night shifts pair? | P0.2 |
