# Deep health check rollout brief

Goal: Azure Service Bus health checks (AddAzureServiceBusTopic/Queue/Subscription) must not run on the Kubernetes `/health` probe. They get tagged `deep`, get an 8 s per-check timeout, run on `/health/deep` and in a periodic logging publisher.

## Reference implementation (already built and passing)
Repo InspectionsService, commit 5a7e248 on branch fix/background-health-deep-checks. View with `git -C /Volumes/SSD/Projects/Work/Oskfel/InspectionsService show 5a7e248`. It has:
- `HealthChecks/DeepHealthChecks.cs` (static class: `Tag = "deep"`, `Timeout = 8s`, `ProbeOptions` predicate `!Tags.Contains(Tag)`, `DeepOptions` predicate `Tags.Contains(Tag)`, `AddDeepHealthCheckPublisher` with Delay 30 s, Period 5 min, Predicate deep, registers `IHealthCheckPublisher`)
- `HealthChecks/DeepHealthCheckLogger.cs` (primary-constructor `IHealthCheckPublisher` logging a Warning per non-healthy entry and an Information summary)
- Health check extensions: every `AddAzureServiceBus*` call replaced by private helpers `AddDeepTopic/AddDeepQueue/AddDeepSubscription` passing `tags: DeepTags, timeout: DeepHealthChecks.Timeout`; `services.AddDeepHealthCheckPublisher();` called in the registration method.
- Application builder: `app.MapHealthChecks("/health", DeepHealthChecks.ProbeOptions); app.MapHealthChecks("/health/deep", DeepHealthChecks.DeepOptions);`

## Steps
1. `git fetch origin`, `git checkout main`, `git pull --ff-only`. Then `git checkout -b <branch name given in your prompt>` from main. Tree must be clean first.
2. Find every host (API, Background, Customer.Core modules, etc.) that registers Service Bus health checks: `git grep -nE "AddAzureServiceBus(Topic|Queue|Subscription)"`, and where `/health` is mapped (`MapHealthChecks`/`UseHealthChecks`). Apply the pattern to EACH host that has Service Bus checks. Put DeepHealthChecks.cs and DeepHealthCheckLogger.cs in the host project that registers them (namespace `<HostRootNamespace>.HealthChecks`). If checks are registered in a shared library project referenced by several hosts (e.g. Customer.Core), put the helper there, once, and make hosts reuse it, not duplicate it. Hosts with no Service Bus checks: leave unchanged. Keep each repo's existing style, health check names, and any other tags already present (merge `deep` with existing tags rather than dropping them).
3. If `/health` is mapped with other options (ResponseWriter, other Predicate), keep them and just add the exclusion of the deep tag. Add `/health/deep` only on hosts that have deep checks.
4. Code rules: NO code comments at all. New classes with constructor deps use C# primary constructors. Do not touch unrelated code, do not bump package versions.
5. Verify: build every changed project with the authenticated feed config (a restore against the plain nuget.config fails with 401):
   `dotnet build <csproj> --configfile /private/tmp/claude-501/-Volumes-SSD-Projects-Work-Oskfel/a3b20ae2-c5c6-45ad-808f-9d2a1305dbb0/scratchpad/feed.nuget.config`
   If that config returns 401 (token expired), stop and report; do not look for or create other credentials. Also run the repo's existing unit tests that cover health checks if any (`dotnet test` on the relevant test project with the same --configfile); if none relate, say so. Build must succeed with 0 errors; pre-existing warnings are fine.
6. `git add` only your changes, commit with message `fix: run Service Bus health checks on deep endpoint only` and a short body, ending with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. `git push -u origin <branch>`. Do NOT create the pull request and do NOT touch other branches. Never use --force.
7. Final report: branch, commit sha, files changed, which hosts were changed, build/test result.
