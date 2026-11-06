---
name: team-date-time
description: >
  Maintain and integrate the Intowork.Common.Time package in CommonLibs: scoped clock, team lookup, UTC and calendar-day conversions, MVC headers/JSON, formatting, Mongo helpers and package releases. Use for shared time implementation, consumer migration or compatibility reviews.
---

# CommonLibs team date and time

## Start with the source and package guide

Read `Intowork.Common.Time/DEVELOPER-GUIDE.md` from the CommonLibs repository root. From the workspace root, prepend `CommonLibs/`. It is the maintained human guide and contains architecture, usage examples, exact boundary behavior, troubleshooting and publishing details. Read the sections relevant to the task before changing implementation or consumer wiring.

Run `git status --short --branch` and inspect the actual source, project version and consumer references. CommonLibs `main` now contains this package; feature branches and services may still differ. Use `git show` or existing worktrees to compare without switching over unrelated changes. A project version is not proof of publication or deployment.

## Choose the change owner

| Task | Owner and first files |
|---|---|
| Clock/conversion/ranges | `Clock/IDateTimeProvider.cs`, `Clock/DateTimeProvider.cs` |
| Scope registration | `DependencyInjection/TeamTimeServiceCollectionExtensions.cs` |
| Team lookup contract | `Teams/ITeamCopyReader.cs`; concrete readers belong to consumers |
| Header/error/JSON behavior | `Requests/`; Gateway owns authorization and header stripping |
| Formats or tokens | `Formats/TeamFormats.cs`; check frontend compatibility |
| Zone identifiers | `Zones/TeamZones.cs`; check deployment timezone support |
| Calendar/legacy boundaries | `Calendar/CalendarDays.cs`, `Clock/PeriodEdges.cs` |
| Mongo aggregation | `Mongo/MongoDateParts.cs`; check Mongo token/weekday conventions |
| Packaging | `.csproj`, `azure.pipelines.build.yml` inside `Intowork.Common.Time/` |

These source paths are relative to `Intowork.Common.Time/` unless stated otherwise. Shared behavior belongs here once; consumers retain their repositories, event scopes, transaction ordering and job policies. Do not restore copied service-local time kits or retired `ITeamClocks`, `ITeamZoneResolver` and `Intowork.TeamTime` APIs.

## Preserve these contracts

- Application classes inject scoped `IDateTimeProvider`. `TimeProvider` is for the implementation and deterministic tests. Use the shared clock for current timestamps and team business time.
- `AddTeamTime` supports HTTP request settings. `AddTeamTimeByTeamName<TReader>` adds a transient reader for background initialization. Preserve scoped resolution of reader dependencies.
- `UtcNow` needs no team. `UseTeamAsync(teamName, token)` must run before either zone or format access and successfully initializes only once. One team per scope; singletons create scopes and resolve scoped workers. Do not read zone/formats in constructors.
- Missing/invalid zones have no fallback. Missing formats have defaults. `Formats` alone does not validate the zone. HTTP missing-zone exceptions map to 400 through the MVC filter; background failures and non-MVC transports need their own handling.
- Resolve background team time before business writes or marking events handled. Team-settings events must persist incoming settings before dependent recalculation. The package itself creates no message scopes or retry policy.
- Classify each value as UTC instant, calendar-day label or team wall-clock fields. `ToTeamTime` interprets input fields as UTC; `ToUtc` interprets them as team wall clock regardless of `Kind`. Preserve existing UTC-midnight day-label contracts.
- `DaysRangeUtc` takes inclusive calendar days and returns a half-open UTC window. Validate range order in callers. Derive both endpoints in team time; avoid fixed 24-hour UTC arithmetic.
- DST gaps advance in 30-minute steps; overlaps choose the earlier instant. Preserve the original instant for unchanged repeated-hour values. Coordinate policy changes with all three Angular apps.
- Team formatting uses invariant culture and standalone `a` → `tt`, not a general token conversion. `TeamFormats` takes local fields; clock formatting methods accept UTC instants.
- MVC JSON treats unspecified `DateTime` as UTC without shifting fields. It does not convert team wall-clock input. MVC registration does not configure minimal APIs, SignalR or message serializers.
- Header forwarding copies only the current HTTP request's team name, zone and formats, and preserves existing outgoing headers. It does not derive headers from `UseTeamAsync` and does nothing without HTTP context. Review background downstream calls explicitly.
- `CalendarDays` skips Saturday/Sunday only, not team holidays. `PeriodEdges` day helpers are arithmetic, not DST-aware UTC boundaries. Mongo helpers require a zone and Mongo-specific formats.

## Implementation and compatibility workflow

Trace the affected API from registration to request/background callers and serialization. Inspect consumer package references and existing tests on their actual branches. Preserve public signatures and semantics, or plan a coordinated consumer migration. Fix shared behavior here and update the consumed package; source edits alone cannot change deployed services.

For clock or lifecycle changes, cover fixed UTC time, missing/invalid request settings, unknown teams, formats read before initialization, duplicate initialization, separate message scopes and team-settings update ordering. For conversion changes, cover opposite UTC offsets, midnight, DST gap/overlap, 23/25-hour windows, unchanged instant round trips and day labels. For transport changes, cover MVC versus other serializers and HTTP versus background forwarding.

There is currently no dedicated package time test project and no test stage in this package pipeline. Inspect available tests before naming commands; report missing coverage honestly. Add focused regression coverage when changing runtime behavior and run relevant consumer tests. Documentation-only edits require checking examples and links against source, not a runtime test suite.

Use the developer guide's local restore/build/pack commands when implementation validation is needed. Read `global.json` and the target framework first. Report commands actually run and private-feed/SDK blockers. Do not publish merely to validate a local change.

## Release and documentation maintenance

Read the actual pipeline before changing release behavior. Feature/develop builds use alpha versions, stage uses RC versions, and main uses the project version. Deployment environment approvals live outside YAML. Stable tagging may fail independently of package publishing. Verify actual feed versions and consumer restores.

Keep the package guide and these four CommonLibs skill copies aligned for both agents:

- Repo `.agents/skills/team-date-time/SKILL.md` and `.claude/skills/team-date-time/SKILL.md`.
- Workspace `.agents/skills/CommonLibs/team-date-time/SKILL.md` and `.claude/skills/CommonLibs/team-date-time/SKILL.md`.

Update affected consumer skills and workspace routing when ownership or end-to-end contracts change. Preserve unrelated edits, especially logging/health changes. Do not add code comments or include unrelated local settings in commits.
