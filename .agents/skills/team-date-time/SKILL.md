---
name: team-date-time
description: >
  Route team-zone date/time work across the Baton workspace: shared backend clock package, Gateway headers and the three Angular apps. Use for cross-repo date/time changes, timezone reviews and calendar-day API contracts.
---

# Team date and time (workspace)

## Verify the checkout first

Before relying on wiring or declaring a migration complete, run `git status --short --branch` and inspect the actual package references and source in the target checkout. The team-zone feature can be on a feature branch or another worktree while `main` still uses the old implementation. Use `git worktree list` and read the relevant branch with `git show` when needed; do not switch branches over unrelated changes. Rules below describe the team-zone implementation, not proof that every branch has it. Report the branch and scope searched with review findings.

## Where to read next

Read only the relevant repo skill. Both agents have matching copies: Codex uses `.agents/skills`, Claude uses `.claude/skills`.

- Workspace repo-specific copies: `.agents/skills/<Repo>/team-date-time/SKILL.md` and `.claude/skills/<Repo>/team-date-time/SKILL.md`.
- Inside each repo: `.agents/skills/team-date-time/SKILL.md` and `.claude/skills/team-date-time/SKILL.md`.
- `CommonLibs`: shared `Intowork.Common.Time` package, namespaces `Intowork.Common.Time.*`, one scoped clock and `UseTeamAsync`.
- `Gateway`: authorized team selection, claims, header stripping and downstream time headers.
- `Frontend`, `HandoverApp`, `InspectionsApp`: `src/app/shared/time`, `TZDate`, day/instant conversion, inputs, formatting and library adapters.
- Services: ActiveWorkService, AttendanceService, CustomerService, ForecastingService, GafferService, HandoverService, InspectionsService, MaterialsService, NotificationService, PermissionsService, ProjectService, ResourcesService and SafetySuiteService. Each skill lists its package references and integration entry points.

## End-to-end invariants

1. A team has an IANA zone and date/time formats. The Gateway replaces claims with authorized team settings, strips client `Intowork.*` headers and sends an empty zone when settings are unavailable; never a guessed London/UTC zone.
2. Requests use the zone from trusted Gateway headers through `Intowork.Common.Time`. Missing/invalid zones fail when zone-dependent logic first runs. `UtcNow` stays lazy and independent of the team.
3. Background work uses scoped `IDateTimeProvider` and `UseTeamAsync` before zone or format access, one message/team per scope. Do not use retired `ITeamClocks` or recreate service-local kits. Team-copy updates and event retry ordering matter.
4. Actual instants are stored/sent in UTC. Calendar days are labels: verify whether each endpoint expects `yyyy-MM-dd` or UTC-midnight encoding. Team-day boundaries for instant queries are a separate concept. Never zone-shift a day label.
5. Frontend team dates are `TZDate`s retaining a real instant and zone. Use the shared helpers, team formatter and date fields. Preserve instants across settings changes and DST overlaps; re-render in the current zone. No browser-zone display or date arithmetic for team business logic.
6. Settings readiness, valid settings and selected-team identity are separate conditions. Check guard timeout/error behavior and cached settings ownership. Invalidate derived text/grid data on zone or format changes. Defaults are not confirmation of a real team zone.
7. Date ranges use team calendar boundaries converted to half-open UTC windows, including DST days; no fixed 24-hour increment or inclusive last millisecond.

## Cross-repo work and verification

- Before editing, classify every value as an instant, calendar day or team wall clock, and trace receive → model → calculation → input → display → send. Preserve the existing wire contract unless a coordinated API migration is explicitly intended.
- Include history/audit fields, grid cells and exports, forms and read-only answers, From/To filters, min/max validation, valuations, near-miss incident fields, month names, toasts, translated text and reports/emails/PDFs where relevant. A clean grep cannot replace tracing these surfaces.
- Update backend clock behavior in CommonLibs, check package/version consumption in all affected services, and preserve repo-specific scope wiring. Port shared Angular fixes to all three apps deliberately; their Angular initialization, authentication/team source, caches, validity flags and route guards differ.
- Test different device/team zones, opposite sides of UTC, midnight, DST gap/overlap, unchanged save round trips, day labels, settings arriving late, team switching with cached settings and format-only changes. Backend checks also cover missing/invalid headers, unknown teams and per-message scope isolation.
- Report checked branch/worktree, test commands actually run and blockers. Type-checking does not mean browser tests passed. Do not describe known migration gaps as implemented behavior.
- The recent Frontend stale-zone fixes are not proof of parity in HandoverApp/InspectionsApp. Compare `renderDateText`, `toSyncfusionDate`, settings loaders and actual route guard use in each target checkout.
- Preserve unrelated edits and local-only configuration such as Frontend `useDevServer`. Do not add code comments.

## Keeping skills aligned

When changing date/time contracts, APIs, package ownership or app wiring, update the affected repo-local Codex and Claude skills plus both workspace repo-specific copies in the same task. Keep their content identical and copy referenced resources too. Update this workspace router when an end-to-end rule or ownership changes. Verify paths against the target branch and remove retired API guidance rather than appending a contradictory correction. Runtime correctness remains a separate task from skill maintenance.
