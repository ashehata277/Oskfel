---
name: team-date-time
description: >
  Handle team-zone requests, scoped background clocks, UTC instants, calendar-day contracts and date/time tests in AttendanceService. Use when implementing or reviewing this service's date/time behavior.
---

# Team date and time (AttendanceService)

## Verify the checkout first

Before relying on wiring or declaring a migration complete, run `git status --short --branch` and inspect the actual package references and source in the target checkout. The team-zone feature can be on a feature branch or another worktree while `main` still uses the old implementation. Use `git worktree list` and read the relevant branch with `git show` when needed; do not switch branches over unrelated changes. Rules below describe the team-zone implementation, not proof that every branch has it. Report the branch and scope searched with review findings.

## This service

The reviewed `feature/1.6.0/team-zone-headers` branch references `Intowork.Common.Time` from:

- `Intowork.Attendance.Core/Intowork.Attendance.Core.csproj`

Use these existing registration, reader and scope integration files when present in the target branch:

- `Intowork.Attendance.Background/Events/Scoping/ScopedEventHandler.cs`
- `Intowork.Attendance.Background/Events/Scoping/ScopedEventHandlerServiceCollectionExtensions.cs`
- `Intowork.Attendance.Core/Utilities/AttendanceTeamTimeExtensions.cs`
- `Intowork.Attendance.Core/Utilities/TeamCopyReader.cs`

Relevant test entry points:

- `Intowork.Attendance.Core.Tests/Events/IntegrationEventHandlers/TeamTimeSettingsHandlerTests.cs`
- `Intowork.Attendance.Core.Tests/Time/ClockUsageTests.cs`
- `Intowork.Attendance.Core.Tests/Time/TeamCopyReaderTests.cs`

Existing test command (confirm against this checkout and `global.json`): `dotnet test AttendanceService.sln`.

Trace the actual callers of `UseTeamAsync`, team update handlers, scheduled jobs and report/email rendering when touching them; class names and constructor dependencies from the retired kit are not reliable. Preserve domain-specific behavior such as reminder schedules, wage recalculation ordering and explicit external-calendar zones.

## Shared package and clock contract

The implementation lives in `CommonLibs/Intowork.Common.Time` and is consumed as the `Intowork.Common.Time` NuGet package. Do not restore per-service `Time/` copies or introduce another clock abstraction. The migrated services use one scoped `DateTimeProvider` implementing `IDateTimeProvider`; the old `Intowork.TeamTime`, `RequestDateTimeProvider`, `TeamDateTimeProvider`, `ITeamClocks`, `ITeamZoneResolver`, `ForTeamAsync` and `WithFormatsForTeamAsync` APIs are retired on these branches.

| Namespace | Relevant API |
| --- | --- |
| `Intowork.Common.Time.Clock` | `IDateTimeProvider`, `DateTimeProvider`, `UtcWindow` |
| `Intowork.Common.Time.Requests` | `IRequestInfo`, `HeaderRequestInfo`, `TeamHeaders`, forwarding handler, missing-header filter, UTC JSON converter |
| `Intowork.Common.Time.Teams` | `ITeamCopyReader`, `TeamTimeSettings` |
| `Intowork.Common.Time.Zones` | `TeamZones`, missing-header and unavailable exceptions |
| `Intowork.Common.Time.Formats` | `TeamFormats` |
| `Intowork.Common.Time.Calendar` | `CalendarDays` |
| `Intowork.Common.Time.Mongo` | `MongoDateParts` |
| `Intowork.Common.Time.DependencyInjection` | `AddTeamTime`, `AddTeamTimeByTeamName<TReader>` |

Application code injects `IDateTimeProvider`. `TimeProvider` belongs inside the shared clock and test setup. Do not use `DateTime.Now`, `DateTime.Today`, `DateTimeOffset.Now`, `TimeZoneInfo.Local` or a hard-coded zone for team business logic. A fixed zone for an external calendar or an explicit team seed is a domain contract, not permission to add a fallback.

## Request time and registration

- The Gateway derives `Intowork.TeamTimeZone`, `Intowork.TeamDateFormat` and `Intowork.TeamTimeFormat` from the authorized team. Request code reads these through the package, never through body/query parameters or an independent team lookup.
- `AddTeamTime()` registers the scoped clock, request reader, forwarding handler, MVC missing-header filter and UTC JSON converter. `AddTeamTimeByTeamName<TReader>()` also registers a transient `ITeamCopyReader`; it does not register `ITeamClocks`.
- `UtcNow` is lazy and works without team settings. The first zone-dependent operation reads the request zone unless a background team was explicitly set. Missing, empty or invalid request zones become HTTP 400 through `TeamTimeHeaderMissingFilter`; keep zone reads out of constructors.
- Date/time formats have defaults (`dd/MM/yyyy`, `HH:mm`); the zone has no fallback. Use `clock.Formats` or `FormatDate`, `FormatTime`, `FormatDateTime` for backend-rendered reports, emails and exports. Wire values remain UTC instants.
- Forward trusted team headers on service-to-service requests. Never trust client-supplied `Intowork.*` headers or silently substitute another team's settings.

## Background, events, jobs and SignalR

- A message or worker scope handles one team. Resolve `IDateTimeProvider` inside that scope and call `await clock.UseTeamAsync(teamName, token)` before any zone **or format** member. This requires a registered `ITeamCopyReader`.
- `UseTeamAsync` sets the team once; calling it again or after reading zone/formats throws. A worker that only uses `UtcNow` needs no team lookup.
- Hosted services and other singletons open a scope and resolve the worker/clock inside it. Never inject the scoped clock or a scoped repository into a singleton. A loop over teams needs a new scope per team.
- Verify event-bus lifetimes. Where `RunEachEventInItsOwnScope()` wraps handlers, register it after all handlers and retain one scope per message. Do not resolve a handler from the root provider or share its clock across messages.
- Resolve team time before business writes, transaction commit or recording an event as handled. Missing team/name/zone throws `TeamTimeUnavailableException`; let message failures propagate for retry. A multi-team scheduled loop may log and skip the failing team, preserving the others.
- Team-settings synchronization is a special case: a TeamCreated/TeamUpdated handler must persist the incoming zone and both formats before dependent recalculation. Verify transaction and retry behavior rather than looking up an obsolete or nonexistent team copy first.
- Both TeamCreated and TeamUpdated must copy zone and formats wherever this service maintains a team copy. Readers return null for unknown teams and never invent a zone.
- Register recurring jobs with the resolved team's zone, not server local time. Check whether registrations must refresh after settings changes. A cron expression without an explicit correct zone is incomplete.
- SignalR has no reliable request headers per message. Derive the team from authorized connection identity and resolve within the message scope before formatting; invalidate any cached settings on a team/settings change. Do not share a scoped clock for the lifetime of a connection.

## Instants, calendar days and ranges

Classify each field from its API/domain contract before changing conversion. A display format cannot establish whether a field is an instant or a calendar day.

| Meaning | Handling |
| --- | --- |
| Actual event instant | Store/send UTC; convert with `ToTeamTime` for team business calculations |
| Calendar day | Prefer `DateOnly` / `yyyy-MM-dd` where the contract supports it; preserve existing UTC-midnight day encodings where required |
| Team wall-clock input | Resolve with `ToUtc`; do not assume it is already UTC |
| Team day containing an instant | `DayOf(utc)` |
| Today / day start | `TeamToday` / `StartOfDayUtc(day)` |
| Inclusive calendar-day selection | `DaysRangeUtc(firstDay, lastDay)`; its returned UTC range is half-open |
| Query one day | `DayRangeUtc(day)`, then `>= From && < To` |

A day encoded as UTC midnight is a calendar label, not the instant at which that team's day starts. Do not zone-shift it or change its wire representation incidentally. Derive day/month boundaries in team time, then convert both endpoints to UTC; never add a fixed 24 hours, use an inclusive end-of-day timestamp, or take `.Date` from a UTC instant to identify the team day. Mongo aggregation date operators need the team's zone via `MongoDateParts`.

`ToUtc` advances a nonexistent clock time in 30-minute steps until valid and picks the earlier instant in an overlap (largest offset). Preserve this policy across frontend and backend; an untouched repeated-hour value must preserve its original instant.

## Validation and review coverage

- Verify actual package version, registration, request-header behavior, scoped lifetimes and team-copy readers in the target branch. A shared package change requires package tests, release/version handling and affected consumer checks; do not copy its source into consumers.
- Cover zones on opposite sides of UTC, team midnight, a DST gap and overlap, and a 23/25-hour day range. Freeze the clock and set zones explicitly.
- Test missing/invalid headers, unknown or zone-less teams, team setup before zone/formats, one team per scope, per-message isolation and failure before commit/mark-handled where relevant.
- Check round trips for both instants and day labels, including nulls; verify backend-rendered dates use team formats. A grep passing on `main` is not validation of a feature branch.
- Use each repo's actual solution, `global.json` test runner and existing test helpers. A compile check is not a test run. Report private-feed or runtime blockers precisely.
- Do not add code comments. Preserve unrelated working-tree changes and local-only environment settings; do not commit them with date/time work.
