# Service Bus Listening Guide: Handled vs To Handle (Attendance)

Reference: Service Bus Listening Guide from Mahmoud Ibrahim (rebuilt 19 October 2026).
Scope: AttendanceService and the CommonLibs packages it uses. Branch: `feature/telemetry-noise`, then merged into `feature/telemetry-noise-develop`. Nothing is pushed until review.
Status date: 2026-10-19. This document is a review only. No service code or chart has been changed.

Target configuration from the guide, for both the `Queue` and `SessionSubscription` profiles: `MaxConcurrentSessions` 32, `SessionIdleTimeout` 00:00:02, `MaxConcurrentCallsPerSession` 1, `PrefetchCount` 2.

---

## 1. Already handled

These requirements already exist in the code. No action is needed except where a note says so.

### 1.1 CommonLibs: Intowork.Common.Messaging

| Requirement | Evidence |
| --- | --- |
| `SessionIdleTimeout` exists on the processor profile | `MessagingConfig.cs:28`; commit `44424db` is in the branch history |
| Separate `Queue` and `SessionSubscription` profiles | `SessionProcessorOptionsConfig` in `MessagingConfig.cs` |
| Library defaults match what the guide says "today" is: 100 sessions, 30 s idle, 1 call per session, prefetch 2 | `MessagingConfig.cs:35-54` |
| Config values reach the processor | `BuildSessionProcessorOptions` in `EventBusServiceBus.cs`; unset keys keep the defaults |
| Auto-compression and decompression of large messages | `EventBusServiceBus.cs`: `Compress`, `Decompress`, `IsAutoCompressedProperty` |
| Session-lock-lost handling in the handler | `SessionMessageHandler` catches `SessionLockLost` and `MessageLockLost` |
| Version 2.1.8 commit and newer | Commit `1b5aedd` is in the branch; tags `Intowork.Common.Messaging-v2.1.8` and `-v2.1.9` exist; source is at 2.2.0 |

Conclusion: the guide needs no code change in `Common.Messaging`. Version 2.2.0 in source is not yet tagged and is the pending Messaging release (it carries the message-bodies-to-Debug telemetry change).

### 1.2 AttendanceService

| Requirement | Evidence |
| --- | --- |
| Messaging package at 2.1.8 or newer | `Intowork.Attendance.Core.csproj`: `Intowork.Common.Messaging` 2.1.9, so Step 1 of the guide is not needed |
| `Messaging` section bound into `MessagingConfig` | `AttendanceBackgroundServiceCollectionExtensions.cs`: `services.Configure<MessagingConfig>(configuration.GetSection("Messaging"))` |
| Only the Background host listens | `Program.cs` of Background subscribes 23 events plus 5 ordered ones. The API host only registers publish types (`RegisterAttendancePublishTypesAsync`) and builds no processors |
| Logging package on the 2.3.0 line | Background and API reference `Intowork.Common.Logging` 2.3.0-rc.11457 |
| Service Bus health checks exist in both hosts | Background: 24 `AddAzureServiceBusSubscription` checks. API: 6 `AddAzureServiceBusTopic` checks |
| `appsettings.json` holds no real values | Messaging values are empty strings, as the guide requires |

### 1.3 Investigation findings (already known, no action unless you decide)

| Finding | Status |
| --- | --- |
| No blocking calls on the message-handler path | Confirmed by code review |
| Single `MongoClient` (singleton `MongoProvider`) | Confirmed |
| Hangfire has two daily recurring jobs only | Confirmed |

---

## 2. Need to handle

### 2.1 CommonLibs (first, on `feature/telemetry-noise`)

| # | Change | Status | Where |
| --- | --- | --- | --- |
| C1 | Deep health check publisher: `AddDeepHealthCheckPublisher()` and `LoggingHealthCheckPublisher` (5-minute period, 30-second delay, Warning per unhealthy check, one summary line) | Written, uncommitted, not compiled (this machine cannot restore from the private feed) | `Intowork.Common.Logging/HealthChecks/` |
| C2 | Unit tests for the publisher | Written, not run | `Intowork.Common.Logging.Tests/DeepHealthCheckPublisherTests.cs` |
| C3 | Commit on `feature/telemetry-noise`, then merge into `feature/telemetry-noise-develop` locally. No push, no version bump | Waiting for your go-ahead | CommonLibs |
| C4 | Build and test on a machine with feed access, then publish `Intowork.Common.Logging` 2.3.0 (and `Intowork.Common.Messaging` 2.2.0 if you want it out) | Yours | Pipeline |

### 2.2 AttendanceService (after you provide the published version)

| # | Change | File | Notes |
| --- | --- | --- | --- |
| A1 | Update `Intowork.Common.Logging` to your published version | `Intowork.Attendance.Background.csproj` and `Intowork.Attendance.API.csproj` | Do not touch the Messaging reference |
| A2 | Add `sessionProcessor:` with `maxConcurrentSessions: 32` and `sessionIdleTimeout: "00:00:02"` under `env.messaging` | `helm/attendanceservice/values.yaml` (around line 121) | Chart default applies to every environment |
| A3 | Add the four env variables: `Messaging__SessionProcessor__Queue__MaxConcurrentSessions`, `Queue__SessionIdleTimeout`, `SessionSubscription__MaxConcurrentSessions`, `SessionSubscription__SessionIdleTimeout` | `helm/attendanceservice/templates/deployment-service.yaml` (around line 49) | This is the Background host, the one that listens |
| A4 | Same four variables on the API deployment | `helm/attendanceservice/templates/deployment-api.yaml` | Optional: the API builds no processors. The guide says to add them to every deployment, so decide whether to follow it literally |
| A5 | Tag all 24 subscription checks with `tags: new[] { "deep" }` | `AttendanceBackgroundHealthCheckExtensions.cs` | Guide Step 3a |
| A6 | Tag all 6 topic checks with `tags: new[] { "deep" }` | `Intowork.Attendance.API/Extensions/AttendanceHealthCheckExtensions.cs` | Guide Step 3a |
| A7 | Background probe runs only untagged checks: `app.UseHealthChecks("/health", new HealthCheckOptions { Predicate = c => !c.Tags.Contains("deep") })` | `AttendanceBackgroundApplicationBuilderExtensions.cs:21` | Guide Step 3b |
| A8 | API probe: pass the same `HealthCheckOptions` to `app.MapHealthChecks("/health", ...)` | `AttendanceApplicationBuilderExtensions.cs:32` | Guide Step 3b |
| A9 | Call `services.AddDeepHealthCheckPublisher()` after `AddHealthChecks` in both hosts | The two health check extension files above | Guide Step 3c |

### 2.3 Verification after the changes

| # | Check | How |
| --- | --- | --- |
| V1 | Chart renders the new variables | `helm template` and `helm lint` on `helm/attendanceservice` |
| V2 | Services build and tests pass | `dotnet build` and `dotnet test` with feed access |
| V3 | `/health` answers fast and lists only untagged checks | Local run with header `HealthProbe-Type: liveness` |
| V4 | Deep checks log every 5 minutes | Log line "Deep health checks: N healthy" after 30 seconds, then every 5 minutes |
| V5 | After dev deploy, compare backlog, handler busy time and billable operations | Guide section 5 queries |

### 2.4 Outside the guide (decide separately)

| Item | Why it matters |
| --- | --- |
| `AttendanceUpdatedHandler` swallows exceptions after aborting the transaction, so the message is completed and the event is lost | Correctness risk; separate fix |
| `serviceReplicaCount: 1` and no CPU limits for the Background host | A restart drops every session at once |
| Hangfire.Mongo `Watch` strategy and Mongo pool settings | Related to the `MongoConnectionPoolPausedException` seen in the logs |
| The guide does not address `SessionLockLost` directly | Compare timestamps with restarts and Atlas events after the rollout |

### 2.5 Rules in force

- Work on the base branch `feature/telemetry-noise`, then merge into `-develop`.
- Do not push anything until you review the diff.
- CommonLibs first. Wait for your published version, then do the service changes.
- Do not bump versions. Package version checks from the investigation kit are skipped.
- Do not lower `MaxConcurrentSessions` before the idle timeout is 2 seconds (guide section 7).
