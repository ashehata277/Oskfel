# Agent brief: team zone headers implementation

Read first: `/Users/ahmedmohamedshehata/Oskfel/datetime-timezone/team-zone-headers/TEAM_ZONE_HEADERS_PLAN.md` (the whole plan; your steps are named in your task).

## Where to work
- Every repo has a worktree on branch `feature/1.6.0/team-zone-headers`: `/Users/ahmedmohamedshehata/Oskfel/<Repo>-team-zone-headers` (e.g. `Gateway-team-zone-headers`, `AttendanceService-team-zone-headers`). Work ONLY in the worktrees named in your task. Never touch the original checkouts (`/Users/ahmedmohamedshehata/Oskfel/<Repo>` without the suffix).
- Do not commit, push, stash, reset or clean. Leave changes uncommitted in the worktree.
- Do not edit the plan file or other agents' repos.

## Standing code rules (the user's, non-negotiable)
- No comments in code you write or edit (no `//`, `/* */`, `///`, `<!-- -->` in new code; do not add JSDoc). Leave existing comments alone unless you delete the line they describe.
- New C# classes that take dependencies use C# 12 primary constructors, not explicit constructors with private readonly fields.
- Match the surrounding code's style and naming.
- Existing CLAUDE.md files in the repos describe gotchas; read the one in your repo.

## The backend time kit (already written and tested)
Master copy: `/Users/ahmedmohamedshehata/Oskfel/AttendanceService-team-zone-headers/Intowork.Attendance.Core/Time/` (namespace `Intowork.TeamTime`), tests in `Intowork.Attendance.Core.Tests/Time/`. It is copied into each service under `<CoreProject>/Time/` by `AttendanceService-team-zone-headers/scripts/sync-time-kit.sh`. Never edit a copied kit file in another repo: if the kit needs a change, say so in your report. `scripts/check-time-kit.sh` in each repo checks the copy has not drifted.

API summary:
- `IRequestInfo`: `TeamName`, `StaffMemberId`, `HasTeam`, `HasRequest`, `TimeZone`, `DateFormat`, `TimeFormat`, read from the `Intowork.*` request headers (`TeamHeaders` has the names). Outside a request `TimeZone` is London and counts `no-context` (never throws; use `ITeamClocks` in background code).
- `IDateTimeProvider` (scoped, zone = request zone): `UtcNow`, `TeamNow`, `TeamToday`, `Zone`, `ToTeamTime(utc)`, `ToUtc(teamLocal)`, `OffsetAt(utc)`, `DayOf(utc)`, `StartOfDayUtc(day)`, `DayRangeUtc(day)` -> `UtcWindow(From, To)`, `ForZone(zone)`.
- `ITeamZoneResolver`: `ZoneForAsync(teamName, ct)` and `TimeForAsync(teamName, ct)` -> `ResolvedTeamTime(Zone, DateFormat, TimeFormat)`; reads the service's team copy through `ITeamCopyReader.SettingsOfAsync(teamName, ct)` -> `TeamTimeSettings(TimeZone, DateFormat, TimeFormat)`. `AddTeamTime` registers a London-only reader with `TryAdd`; a service with a team copy registers its own reader AFTER `AddTeamTime`, replacing it.
- `ITeamClocks` (scoped, registered by `AddTeamTime`): `ForTeamAsync(teamName, ct)` -> `IDateTimeProvider`, `WithFormatsForTeamAsync(teamName, ct)` -> `TeamClockWithFormats(Clock, DateFormat, TimeFormat)`, `ForZoneId(zoneId)`. Use it for jobs, handlers, hosted services, PDFs and e-mails instead of per-service factories.
- `TeamZones.Resolve/ForCustomer/NoContext/IsKnown/Default`, `TeamHeadersForwardingHandler` (add `.AddHttpMessageHandler<TeamHeadersForwardingHandler>()` to internal HttpClients), `MongoDateParts` (always passes `timezone`), `AddTeamTime(configuration)` reads `Time:DefaultZone`.

## Rules for the work
- Behaviour for London teams must stay identical, except the documented day-boundary changes in plan 6.3. Before changing a site, write a characterization test (`Current_` prefix) that pins today's London result, make sure it passes on the unchanged code, then change the code and keep it green.
- Day filters: handler works out `DateOnly day` once (`clock.DayOf(clock.UtcNow)` or the picked day), repository filters use `clock.DayRangeUtc(day)` with the five filters in plan 3.4. No `.Date`, `UtcNow.Date`, `DateTime.Today` in a filter.
- No `Europe/London`, `GMT Standard Time`, `FindSystemTimeZoneById` outside `Time/`.
- Open questions: use these defaults and list them in your report. Q9 and Q10: keep today's inclusion semantics (a row dated today counts as "future" exactly as the code treats it now: `>= window.From`). Q11: ActiveWork PDF prints team time and team formats. Q8: support-only once-only zone set is implemented (proposal accepted). Z15: a rollout rule, not code.
- Build and test your repos: `dotnet build` and `dotnet test` (check the repo's CLAUDE.md for the test layout; AttendanceService uses xUnit v2 with `Assert`). The NuGet feed warning NU1900 about the Azure feed is expected and harmless. Everything must build with 0 errors and the repo's tests must pass; if a test was already failing before your change, say so.
- Process zone matrix (S.2): `scripts/test-tz-matrix.sh` runs `dotnet test` under `TZ=UTC`, `Europe/London`, `America/Los_Angeles`, `Pacific/Auckland` and fails if any run fails. Create it in every service repo you touch (one script, the same file everywhere; copy from `AttendanceService-team-zone-headers/scripts/test-tz-matrix.sh` once it exists, else write it).
- Gates (S.7/6.9): `scripts/check-time-gates.sh` greps tracked `.cs` files outside `Time/` and outside test projects for `Europe/London|GMT Standard Time|FindSystemTimeZoneById` and for `\.Date\b|UtcNow\.Date|DateTime\.Today` inside Mongo filter expressions and for the literals `\$dateToString|\$dateToParts|\$dayOfWeek|\$dayOfMonth|\$year|\$month` outside `Time/`. It prints hits and exits 0 in warn mode (`TIME_GATES_MODE=error` exits 1). Same file everywhere (copy from the Attendance worktree once it exists).
- Hosted services and Service Bus handlers: use `ITeamZoneResolver` with the event/item team, then `clock.ForZone(zone)`.

## Report format (final message, under 40 lines)
Repos and steps done (plan step ids), files changed (count and key ones), build/test result with numbers, deviations from the plan and why, defaults taken for open questions, anything not done and why, anything another agent must do next. Do not paste code.
