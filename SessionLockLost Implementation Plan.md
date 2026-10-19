# SessionLockLost Implementation Plan (Attendance Service)

Source: SessionLockLost Investigation Kit. Package versions are deliberately out of scope.
Status: plan only. No code or configuration has been changed.

## Errors under investigation

- `ServiceBusException: The session lock was lost (SessionLockLost)`, thrown while fetching the next message.
- `MongoConnectionPoolPausedException` on `baton-dev-shard-00-02`, thrown in `Hangfire.Mongo.MongoNotificationObserver`.

## Investigation results (kit steps 1 to 7, read-only)

| Kit step | Result |
| --- | --- |
| 1. Map the flow | Processors are created in the shared `EventBusServiceBus` (`CommonLibs/Intowork.Common.Messaging`). Attendance Background subscribes 23 event types plus 5 ordered ones, and each subscription creates its own processor: 28 processors in one pod. |
| 2. Blocking calls | None on the handler path. The `.Result` calls follow `Task.WhenAll`, so they are safe. The sync Mongo methods have no callers on the handler path. Thread-pool starvation is not supported by the code. |
| 3. Settlement | `AttendanceUpdatedHandler` catches exceptions after aborting the transaction and does not rethrow, so the message is completed and the event is lost. |
| 4. Long work | No loop or retry that could plausibly reach the 10-minute renewal limit. No timeouts on handler work. |
| 5. Session design | Session ids are per wage record, project or staff member plus date: many small sessions. A 30-second idle timeout is appropriate. |
| 6. Mongo and Hangfire | One singleton `MongoClient`. Hangfire.Mongo uses `CheckQueuedJobsStrategy.Watch` (a change stream) outside Development. Only two daily recurring jobs. |
| 7. Runtime | One worker replica, no CPU requests or limits in the helm values, transport is AMQP over WebSockets. |

Most likely cause: a very large number of concurrent session links per pod (library default of 100 sessions per processor across 28 processors), a single replica, and link drops. Confidence is about 55% until Phase 0 evidence is collected.

## Phase 0: Confirm before changing anything (no code)

1. Get the real `Messaging__SessionProcessor__*` values from the deployed environment. The repo only shows library defaults (100 sessions, not the 20 in the kit).
2. Export `SessionLockLost` and `MongoConnectionPoolPausedException` timestamps from Application Insights, grouped by pod.
3. Compare them with pod restart and deploy times, and with Atlas events (elections, connection spikes).
4. Decision gate: if errors cluster at restarts or Atlas events, do Phases 3 and 4 first. If spread evenly, start with Phase 1.

## Phase 1: Reduce session link load (configuration)

- Set `MaxConcurrentSessions` to 5-10 per processor through configuration.
- Roll out to dev first and watch the `SessionLockLost` rate for several days.
- Done when: fewer `SessionLockLost` events per hour than the Phase 0 baseline.

## Phase 2: Fix event loss in AttendanceUpdatedHandler (code)

- File: `AttendanceService/Intowork.Attendance.Background/Events/IntegrationEventHandlers/AttendanceUpdatedHandler.cs`.
- Rethrow after `AbortTransactionAsync` in both catch blocks, so the message is abandoned, retried, and dead-lettered after the maximum delivery count.
- Add a unit test for the failure path.
- Done when: a failed transaction leaves the message redelivered, not completed.
- Do this regardless of Phase 0, because it affects correctness.

## Phase 3: Worker resilience (deployment)

- File: `AttendanceService/helm/attendanceservice/values.yaml`.
- Raise `serviceReplicaCount` from 1 to 2 and add CPU requests and limits.
- Check that every handler that can be redelivered is idempotent. Only `AttendanceUpdatedHandler` currently checks the incoming-events log.
- Done when: a pod restart no longer drops every session at once.

## Phase 4: Mongo and Hangfire (configuration)

- Add `serverSelectionTimeoutMS` and an explicit pool size to the Mongo connection string.
- Trial a polling `CheckQueuedJobsStrategy` instead of `Watch`, since the pool-paused error comes from the change stream.
- Done when: the `MongoNotificationObserver` errors stop, or you confirm they come only from Atlas.

## Phase 5: Optional experiment

- Try `AmqpTcp` instead of `AmqpWebSockets` in one environment and compare the `SessionLockLost` rate.

## After each phase

Compare the `SessionLockLost` and pool-paused counts with the Phase 0 baseline before starting the next phase.

## Settings summary

| Setting | Current | Proposed |
| --- | --- | --- |
| `MaxConcurrentSessions` | 100 (library default) | 5-10 per processor |
| `serviceReplicaCount` | 1 | 2 |
| CPU requests and limits | none | set |
| Mongo `serverSelectionTimeoutMS` and pool size | defaults | explicit |
| Hangfire `CheckQueuedJobsStrategy` | `Watch` | polling (trial) |

## Open questions

- What are the real `Messaging__SessionProcessor__*` values in each environment?
- Do `SessionLockLost` timestamps line up with pod restarts or deploys?
- Do they line up with Atlas elections or connection spikes?
