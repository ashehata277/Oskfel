# Azure Service Bus: Sessions and Lock Time (Attendance Service)

Purpose: explain how sessions, locks and timeouts work, and how they map to the Attendance service settings. This is background for the `SessionLockLost` investigation. No code was changed.

## 1. What a session is

A session groups related messages by `SessionId`. Service Bus guarantees:

- Messages with the same `SessionId` are delivered in order (first in, first out).
- Only one receiver holds a session at a time, so one session is never processed in parallel.
- Different sessions are processed in parallel, up to the processor's `MaxConcurrentSessions`.

In Attendance, the session id is usually the wage record id (`wageRecord.Id`), a project id, or `{StaffMemberId}:{yyyyMMdd}` for daily-rate overrides. The result is many small sessions, each holding a few messages.

## 2. Two different locks

| Lock | Applies to | Set by | Purpose |
| --- | --- | --- | --- |
| Session lock | The whole session, for sessionful entities | `LockDuration` on the queue or subscription (5 min here) | Keeps the session owned by one receiver |
| Message lock | One message, only for non-session entities | `LockDuration` | Not used for session processing |

For a session entity the session lock is what matters. If the receiver loses it, the SDK raises `SessionLockLost` ("Request a new session receiver"). Every message still unsettled in that session becomes available again and is redelivered.

## 3. Lock time: how long is a lock and how is it kept alive

- `LockDuration` is set on the entity: 5 minutes in the shared library. The Service Bus maximum is 5 minutes.
- While the processor holds a session, the SDK renews the session lock in the background before it expires. The handler does not call renew itself.
- `MaxAutoLockRenewalDuration` is 10 minutes. It is how long the SDK keeps renewing while a single message handler runs. If one handler runs longer than this, renewal stops and the lock is lost.
- Renewal needs a free thread and a healthy connection. If either is missing, the lock can lapse even though the handler is still running.

### Timeline (5 minute lock, auto-renew on)

```
t=0:00   Processor accepts session S, lock valid until 5:00
t=0:00   Message 1 delivered, handler starts
t~4:50   SDK renews session lock, now valid until ~9:50
t~9:40   SDK renews again, valid until ~14:40
...
         Renewals continue only while handler time < MaxAutoLockRenewalDuration (10 min)
t=handler ends   Message completed. Session stays held until idle timeout
t+30s idle       SessionIdleTimeout reached with no new message, session released
```

If a renewal fails (network drop, starved thread, server restart), the lock expires at its `LockedUntil` time. The next operation on that session (complete, or "get next message") throws `SessionLockLost`. In Attendance this shows up in `ReceiveAndProcessMessagesAsync` when fetching the next message.

## 4. Processor settings in Attendance

Source: `CommonLibs/Intowork.Common.Messaging/MessagingConfig.cs` and `EventBusServiceBus.cs`. Actual deployed values come from the `Messaging:SessionProcessor` configuration, which is not in the repo.

| Setting | Library default | Meaning |
| --- | --- | --- |
| `MaxConcurrentSessions` | 100 (your kit says 20) | Sessions processed in parallel per processor |
| `MaxConcurrentCallsPerSession` | 1 | Messages in one session handled at once |
| `PrefetchCount` | 2 | Messages pulled ahead into the receiver buffer |
| `AutoCompleteMessages` | false | Handler completes the message itself |
| `MaxAutoLockRenewalDuration` | 10 minutes | Longest time the SDK renews the lock for one handler |
| `SessionIdleTimeout` | 30 seconds | Release a session after this long with no messages |
| `LockDuration` | 5 minutes | Lock period on the queue or subscription |
| `DefaultMessageTimeToLive` | 2 days | Set when entities are created |
| `MaxDeliveryCount` | Service default (10) | Deliveries before dead-letter |

The Attendance Background service creates one processor for each subscribed event type. That is 23 regular plus 5 ordered, 28 in total, in a single pod (`serviceReplicaCount: 1`). The slots multiply: 28 processors times `MaxConcurrentSessions`.

## 5. Common reasons for SessionLockLost

1. Connection or link dropped (network, WebSockets transport, Service Bus maintenance, idle timeout on a proxy).
2. Pod restart, rolling deploy or scale-down. Every held session is lost at once.
3. A handler runs longer than `MaxAutoLockRenewalDuration`.
4. Renewal could not run in time: thread-pool starvation or a CPU-throttled container.
5. Too many concurrent session links on one connection, which slows accept and renew operations.

## 6. How to read the logs against these timeslots

- Match each `SessionLockLost` timestamp to pod start times and deploys. A cluster of errors at one second points to a restart or a dropped connection.
- Match them to Atlas events (elections, connection spikes). Mongo stalls make handlers slower but cannot by themselves exceed 10 minutes.
- A single message whose handler time is near 10 minutes points to the renewal limit.
- Errors spread evenly over time with no restarts point to link load or thread starvation.

## 7. Useful checks (read-only)

- Application Insights: count of `SessionLockLost` per minute, grouped by pod (`cloud_RoleInstance`).
- Kubernetes: pod restart count and start times for the Attendance Background deployment.
- Service Bus: per-subscription active session count, dead-letter count and delivery count.
- Config: the real `Messaging__SessionProcessor__*` values in the deployed environment.
