# Team Zone via Request Headers — Implementation Plan

> **Status:** plan only. No product code has changed. Written 2026-10-07; the answers to Q1–Q7 were applied the same day.
> **What it is:** a third, lighter plan beside `../utc-time-zone/UTC_IMPLEMENTATION_PLAN.md` and `../team-local/TEAM_LOCAL_TIME_PLAN.md`. Dates stay stored as UTC, exactly as today. The team's time zone is used only at the edges:
> - the shared date/time control and the pipes in the three apps;
> - the backend code that decides days, "now", day queries and printed times.
>
> Gateway tells every service the team's zone through request headers.
> **Report:** `team-zone-headers-report.html` in this folder is the same plan as a readable page (published as an artifact).
> **Scope:**
> - 14 .NET service repos and Gateway;
> - the three Angular apps (Frontend, HandoverApp, InspectionsApp);
> - no data migration.
>
> **Counts** come from read-only scans of the working trees on 2026-10-07, and from `../utc-time-zone/DATABASE_DATE_QUERY_AUDIT.md` for the day queries: call sites and declared fields, not proven behaviour.

---

## Before any work: branch in every affected repo

Work spans 18 repos: 14 .NET service repos, Gateway, and the three Angular apps. Before the first step in a repo, create the feature branch from the latest remote main branch, in its own worktree:

```bash
git status --short
git fetch origin main
git worktree add ../<repo>-team-zone-headers -b feature/1.6.0/team-zone-headers origin/main
```

- Do this in every affected repo, with one branch name across all of them: `feature/1.6.0/team-zone-headers`. Work in the new `../<repo>-team-zone-headers` folder.
- **Nothing is discarded.** The branch is made beside the current checkout, so uncommitted work, stashes and a checkout on another branch stay exactly as they are. (The other two plans reset the checkout instead; this plan does not need to.)
- If the branch already exists in a repo, add a worktree for it (`git worktree add ../<repo>-team-zone-headers feature/1.6.0/team-zone-headers`) and pull there; never recreate it.
- This plan never shares a branch with the other two plans. `feature/1.6.0/team-time-zone` and `feature/1.6.0/team-local-time` are not reused, and the three are never merged into each other.
- **Not affected:**
  - `CommonLibs` (the kit is copied per repo, Z9);
  - `OcelotConfigValidator`, which only checks duplicate routes;
  - `oskfel-migrations`, because there is no data migration;
  - `Prototype`;
  - `datetime-timezone` (this folder is not a git repo).

| Repo | Base branch | Work in this plan |
|---|---|---|
| ActiveWorkService | `main` | kit, 7 London sites, day queries, reminders, PDF |
| AttendanceService | `main` | kit master copy, 54 London sites, day queries, shadow compare, reminders |
| CustomerService | `main` | kit, day-query gate |
| ForecastingService | `main` | kit, day-query gate |
| FrameworkCache (Report.API) | `main` | kit, 25 London sites, day queries, dead pipeline code removed |
| GafferService | `main` | kit, day-query gate |
| Gateway | `main` | read model, claims, three headers, contract tests |
| HandoverService | `main` | kit, 9 London sites, reminders, PDF |
| InspectionsService | `main` | kit, 4 London sites, PDF |
| MaterialsService | `main` | kit, 10 London sites, day queries |
| NotificationService | `main` (checked out on **`stage`** today; the worktree is made from `origin/main` and leaves `stage` as it is) | kit, team copy, hub zone |
| PermissionsService | `main` | kit, day-query gate |
| ProjectService | `main` | team settings fields, events, `/teamsettings` |
| ResourcesService | `main` | kit, 9 London sites, day queries, HR scheduler |
| SafetySuiteService | `main` | kit, day-query gate |
| Frontend | `main` | time kit, control, pipes, screens, customer screens |
| HandoverApp | `main` | time kit, pipes, range code |
| InspectionsApp | `main` | time kit, control, `date-entry` |

---

## 1. The goal on one page

**One sentence:** dates stay UTC in the database and on the wire. The team's time zone travels with every request, and only the edges use it: the shared control and pipes on screen, and the backend code that decides days, "now", day queries and printed times.

### What changes, for whom

| Who | Today | After |
|---|---|---|
| **Users** | Dates are typed and shown in the device's zone; a user abroad sees and enters shifted times | Every date is typed and shown in the **team's** zone. A warning inside the input control tells the user when the device zone differs |
| **Customer-portal users** | Device zone | Each record's dates in the zone of the team that owns it |
| **Backend developers** | London hard-coded in 118 places; `DateTime.UtcNow` and `.Date` in day filters; the team read from headers in each controller | `IRequestInfo` gives the team and its zone; `IDateTimeProvider` gives "now", "today", day windows and conversions in that zone; no zone literal outside `Time/` |
| **Frontend developers** | `mat-datepicker`, native inputs, `toISOString()`, device-local maths | One control (`<app-date-time-field>`), two pipes (`teamDate`, `calendarDate`), helpers in `shared/time/` |
| **Gateway** | Sends `Intowork.TeamName` and the user headers | Also sends `Intowork.TeamTimeZone`, `Intowork.TeamDateFormat`, `Intowork.TeamTimeFormat` |
| **Database** | UTC | **Unchanged.** Three new optional fields on the team, with no backfill |

### The four rules

| Rule | Meaning | Proof |
|---|---|---|
| **G1 — Storage** | Every stored date stays UTC. Nothing is rewritten. | No migration script exists; S.5 shows the same wages, apart from the signed-off day-boundary list |
| **G2 — Edges only** | The team zone is applied only in the control and pipes, and in backend day, "now", query and print logic. | ESLint and grep gates (S.7) |
| **G3 — From the request** | The zone comes from Gateway headers. Without a team request (jobs, events, customer users, the hub) it comes from the team that owns the data, then London. | Contract tests (S.3), fallback counter (S.4) |
| **G4 — No hard-coded zone or UTC day** | No `Europe/London` or `GMT Standard Time` outside the time kit, and no `.Date` or `UtcNow.Date` in a day filter. | Grep gates (S.7, 6.9) |

### Worked example (the case from the request)

```text
A user in Toronto (device UTC−4) on a London team (BST, UTC+1) records a clock-in at 08:00 on 15 July 2026

Control shows        08:00                       London time, the team's zone
Warning in control   "Your device is on Toronto time (UTC−4). Times here are in London time (UTC+1)."
Form value           2026-07-15T07:00:00.000Z    only London's offset removed
Request body         "2026-07-15T07:00:00.000Z"
Gateway adds         Intowork.TeamTimeZone: Europe/London
Stored in MongoDB    2026-07-15T07:00:00Z        UTC, as today
Backend "which day"  clock.DayOf(v) → 15 Jul
Day query            clock.DayRangeUtc(15 Jul) → [14 Jul 23:00Z, 15 Jul 23:00Z)
Shown again          teamDate → 15/07/2026 08:00, on any device
```

**Legend**

| Label | Meaning | Example |
|---|---|---|
| Control shows | What the user sees and types in `<app-date-time-field>`: always the team's zone. | 08:00 |
| Warning in control | Shown when the device zone differs from the team zone on that date. | Toronto device, London team |
| Form value | What the control gives the form and the request: UTC with `Z`. | `07:00:00.000Z` |
| Gateway adds | Headers added to the request on its way to the service. | `Europe/London`, `dd/MM/yyyy` |
| Backend "which day" | How service code finds the team's day. | `clock.DayOf(v)` |
| Day query | The UTC window that holds the whole team day; every repository filter uses it (Phase 6). | `[14 Jul 23:00Z, 15 Jul 23:00Z)` |

### Phase map

```text
Before any work   branches in 18 repos
      │
Phase 0   decisions and discovery
      │
Phase 1   safety net ── pins today's London results before anything changes
      │
Phase 2   team settings fields and events (ProjectService)
      │
Phase 3   Gateway headers ─────────────────────────┐
      │                                            │
Phase 4   backend time kit in every service        Phase 8  frontend time kit (3 apps)
      │                                            │
Phase 5   hard-coded London replaced, per repo     Phase 9  frontend screens
      │   (Attendance last)                        │
Phase 6   day queries fixed (UTC day → team day)   │
      │                                            │
Phase 7   work without a team request              │
      │   (jobs, events, customers, hub)           │
      └──────────────┬─────────────────────────────┘
                     ▼
Phase 10  verification and one-step go-live
      │
Phase 11  clean-up
```

**Legend**

| Label | Meaning | Example |
|---|---|---|
| Phase n | A phase in section 4. | Phase 6: day queries |
| Two columns | Backend (left) and frontend (right) run side by side after Phase 3. | Phase 8 starts when `/teamsettings` returns the zone |
| `▼` | Both columns must finish first. | Phase 10 waits for 7 and 9 |

---

## 2. Decisions

| # | Question | Answer used by this plan | Status |
|---|---|---|---|
| **Z1** | How are dates stored? | UTC in MongoDB, exactly as today. | decided |
| **Z2** | Are old dates rewritten? | No. There is no data migration. | decided |
| **Z3** | What is a calendar date (a picked day)? | Midnight of that day in the team's zone, stored as UTC: Monday 6 July for a London team is `2026-07-05T23:00Z` in summer and `2026-07-06T00:00Z` in winter. This is today's shape. It is read back with the team's zone, never from the UTC date part. | decided |
| **Z4** | What does Gateway send? | `Intowork.TeamTimeZone` (IANA id, authoritative), `Intowork.TeamDateFormat`, `Intowork.TeamTimeFormat`. There is **no offset header**: an offset is only right for the moment it was read (a request in July about a date in December needs `+00:00`), and the kit never read it, because every offset is worked out from the zone for each date. | decided |
| **Z5** | Where does the zone come from? | New optional fields `TimeZone`, `DateFormat`, `TimeFormat` on the ProjectService Team. A missing value means `Europe/London`, `dd/MM/yyyy`, `HH:mm`, so existing teams need no backfill. | decided |
| **Z6** | Work without a request (jobs, event handlers, hosted services)? | The zone of the team the work is for, from the service's own team copy, then London. | decided |
| **Z7** | How does the control work? | It shows and accepts the team's zone and gives the form UTC. When the device zone differs from the team zone at that date, it shows a warning inside itself. The warning appears **only in input controls**, not beside displayed times (Q6). | decided |
| **Z8** | Request team ≠ data team? | Code working on another team's data uses that team's zone (resolver), not the request headers. Phase 7, customer screens (Z13) and the hub depend on this rule. | decided |
| **Z9** | Where does the backend kit live? | Copied as source into every service under `Time/`, with a sync script and a drift check, as UTC plan D8 (Q3). | decided |
| **Z10** | Who sets the zone and formats? Can they change? | The team admin. The **zone is set once, at team creation, and never changes**; the API refuses a change and the screen shows it read-only. **Date and time formats can change at any time** (Q4). Existing teams have no zone stored, read as London, and stay London unless support sets the zone once before go-live (proposal in Q8). A zone chosen by mistake at creation has no fix, so the create screen asks the admin to confirm it (2.7). | decided; Q8 open |
| **Z11** | How does it go live? | **In one step**, like the other two plans (Q1). Everything is merged and tested together on staging, then released in one window in the order ProjectService → Gateway → 14 services → three apps (10.5). The only thing released earlier is the readers of the new event fields (2.4, "Release 0" in 10.5). | decided |
| **Z12** | Are UTC-day query bugs fixed? | **Yes, in this plan** (Q2): every `.Date`, `UtcNow.Date` and UTC date-part filter becomes a team-day window (Phase 6). For London teams "today" then starts at London midnight, not 00:00 UTC: one hour earlier in summer. | decided |
| **Z13** | Customer-portal users and the SignalR hub? | **They get the team zone** (Q5). A customer user has no team: the token has none, and the Gateway customer record (`BatonCustomer`) has no team field, while one customer can work with several teams. So the service that returns a team's record uses that team's zone (Z8), and the response carries `teamTimeZone` for the customer screens. `NotificationHub` reads `extension_Team` from its own token and looks up that team's zone. | decided |
| **Z14** | Should this plan be in the plan comparison? | Yes, as a third column in `../PLAN_COMPARISON.md` and `../PLAN_COMPARISON_DETAILS.md` (Q7). | decided |
| **Z15** | When may production get a team outside London? | Not before one stable payroll cycle after go-live (11.1). Until then only staging teams are non-London. This keeps rollback a plain redeploy: no production data has been written with another team's midnights (10.6). | recommended |
| **Z16** | Is there a kill switch? | **No.** The team zone is always applied; there is no `Time:TeamZoneEnabled` setting anywhere. A team with no stored zone reads as London (Z5). | decided |
| **Z17** | What does a service do outside a request? | Nothing throws. Background jobs, event handlers and hosted services get their zone from the team that owns the data through the kit's `ITeamClocks` (`ForTeamAsync`, `WithFormatsForTeamAsync`, `ForZoneId`), available in every service. A bare `IDateTimeProvider` built without a request returns London and counts `no-context`, so a job that skipped `ITeamClocks` shows up in the counter. | decided |
| **Z18** | Do internal service-to-service calls carry the team? | Yes. A kit `DelegatingHandler` copies `Intowork.TeamName`, `TeamTimeZone`, `TeamDateFormat` and `TeamTimeFormat` onto outgoing internal calls (4.1, inventory in 0.8). | decided |

---

## 3. Target design

### 3.1 Header flow: ProjectService → Gateway → every request

```text
Team created (zone set once) or edited (formats only)
        │
        ▼
ProjectService ── Team.TimeZone / DateFormat / TimeFormat (optional fields)
        │  publishes TeamCreated / TeamUpdated { …, TimeZone, DateFormat, TimeFormat }
        │
        ├──────────► Gateway.Background ──► Gateway Teams read model (Mongo + Redis, cleared on update)
        │                                        │
        │                    every request: IntoworkAuthInjector reads the team (already done today)
        │                                        │ adds 3 claims (London defaults when empty)
        │                                        ▼
        │                    Ocelot AddHeadersToRequest (Ingress.cs) ──► Intowork.Team* headers ──► every service
        │
        ├──────────► team copies in ActiveWork, Attendance, Handover, Inspections, Materials, Resources, Notification
        │                                        └──► ITeamZoneResolver: jobs, events, customer requests, hub
        │
        └──────────► GET /teamsettings ──► TeamTimeService in the three apps
```

**Legend**

| Label | Meaning | Example |
|---|---|---|
| `TeamCreated` / `TeamUpdated` | The existing integration events, with three new optional fields. | `TimeZone: "America/Toronto"` |
| Gateway Teams read model | The Gateway's own team store (`TeamsRepo.cs`), already read on every request for the inactive-team check. | Redis key per team, 60 min |
| `IntoworkAuthInjector` | The Gateway class that resolves the team from the token or `X-Selected-Team`. | `Auth/IntoworkAuthInjector.cs:87`, `:287-289` |
| `AddHeadersToRequest` | Ocelot's claims-to-headers mapping, generated in `Ingress.cs:82-117`. | `Intowork.TeamName` today |
| Team copies | Services that keep their own copy of the team from the events. NotificationService gets one in this plan. | Resources `HRJobScheduler` |
| `ITeamZoneResolver` | Finds a team's zone when the request carries no team, or carries another team. | a customer reading a London team's job |

**Headers Gateway adds to every authenticated downstream request**

| Header | Example | Use |
|---|---|---|
| `Intowork.TeamTimeZone` | `Europe/London` | **Authoritative.** Every conversion uses it. |
| `Intowork.TeamDateFormat` | `dd/MM/yyyy` | PDFs and e-mails made inside the request. |
| `Intowork.TeamTimeFormat` | `HH:mm` | Same. |

- Clients cannot send them: `IntoworkHeaderStrippingMiddleware` already removes every client-sent `Intowork.*` header.
- Ocelot drops a route when a mapped claim is missing, so the injector always adds the three claims, with London defaults.
- **Internal calls:** a service that calls another service directly does not pass through Gateway, so it would send no team headers. The kit's `TeamHeadersForwardingHandler` copies the four team headers (`TeamName` and the three above) onto each internal call (Z18).
- **Customer-portal users:** Gateway sends the London defaults, because no single team applies. The service uses the zone of the team that owns each record (7.6), and the fallback counter marks these requests with reason `customer`.
- **SignalR:** the Gateway route to `NotificationHub` is anonymous, because the hub checks the token itself (`SignalRJwtBearer`). The hub reads `extension_Team` from that token and resolves the zone (7.7).

### 3.2 Backend time kit (copied into every service under `Time/`)

```csharp
public interface IRequestInfo
{
    string? TeamName { get; }
    string? StaffMemberId { get; }
    bool HasTeam { get; }
    bool HasRequest { get; }
    TimeZoneInfo TimeZone { get; }
    string DateFormat { get; }
    string TimeFormat { get; }
}

public sealed class HeaderRequestInfo(IHttpContextAccessor accessor, IOptions<TeamTimeOptions> options, TimeZoneFallbackMeter meter) : IRequestInfo
{
    private IHeaderDictionary? Headers => accessor.HttpContext?.Request.Headers;

    public string? TeamName => Header("Intowork.TeamName");
    public string? StaffMemberId => Header("Intowork.StaffMemberId");
    public bool HasTeam => !string.IsNullOrEmpty(TeamName);
    public bool HasRequest => accessor.HttpContext is not null;
    public TimeZoneInfo TimeZone => HasRequest
        ? TeamZones.Resolve(Header("Intowork.TeamTimeZone"), options.Value, meter)
        : TeamZones.NoContext(options.Value, meter);
    public string DateFormat => Header("Intowork.TeamDateFormat") ?? options.Value.DefaultDateFormat;
    public string TimeFormat => Header("Intowork.TeamTimeFormat") ?? options.Value.DefaultTimeFormat;

    private string? Header(string name) => Headers?[name].FirstOrDefault() is { Length: > 0 } value ? value : null;
}

public readonly record struct UtcWindow(DateTime From, DateTime To);

public interface IDateTimeProvider
{
    DateTime UtcNow { get; }
    DateTime TeamNow { get; }
    DateOnly TeamToday { get; }
    DateTime ToTeamTime(DateTime utc);
    DateTime ToUtc(DateTime teamLocal);
    TimeSpan OffsetAt(DateTime utc);
    DateOnly DayOf(DateTime utc);
    DateTime StartOfDayUtc(DateOnly day);
    UtcWindow DayRangeUtc(DateOnly day);
    IDateTimeProvider ForZone(TimeZoneInfo zone);
}

public sealed class TeamDateTimeProvider(TimeProvider clock, TimeZoneInfo zone) : IDateTimeProvider
{
    public DateTime UtcNow => clock.GetUtcNow().UtcDateTime;
    public DateTime TeamNow => ToTeamTime(UtcNow);
    public DateOnly TeamToday => DayOf(UtcNow);

    public DateTime ToTeamTime(DateTime utc) =>
        TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), zone);

    public DateTime ToUtc(DateTime teamLocal)
    {
        var local = DateTime.SpecifyKind(teamLocal, DateTimeKind.Unspecified);
        while (zone.IsInvalidTime(local))
            local = local.AddMinutes(30);
        if (zone.IsAmbiguousTime(local))
            return DateTime.SpecifyKind(local - zone.GetAmbiguousTimeOffsets(local).Max(), DateTimeKind.Utc);
        return TimeZoneInfo.ConvertTimeToUtc(local, zone);
    }

    public TimeSpan OffsetAt(DateTime utc) => zone.GetUtcOffset(DateTime.SpecifyKind(utc, DateTimeKind.Utc));
    public DateOnly DayOf(DateTime utc) => DateOnly.FromDateTime(ToTeamTime(utc));
    public DateTime StartOfDayUtc(DateOnly day) => ToUtc(day.ToDateTime(TimeOnly.MinValue));
    public UtcWindow DayRangeUtc(DateOnly day) => new(StartOfDayUtc(day), StartOfDayUtc(day.AddDays(1)));
    public IDateTimeProvider ForZone(TimeZoneInfo other) => new TeamDateTimeProvider(clock, other);
}

public interface ITeamZoneResolver
{
    Task<TimeZoneInfo> ZoneForAsync(string? teamName, CancellationToken token);
}

public sealed class TeamZoneResolver(ITeamCopyReader teams, IOptions<TeamTimeOptions> options, TimeZoneFallbackMeter meter) : ITeamZoneResolver
{
    public async Task<TimeZoneInfo> ZoneForAsync(string? teamName, CancellationToken token)
    {
        var stored = string.IsNullOrEmpty(teamName) ? null : await teams.TimeZoneOfAsync(teamName, token);
        return TeamZones.Resolve(stored, options.Value, meter);
    }
}

public sealed class TeamHeadersForwardingHandler(IHttpContextAccessor accessor) : DelegatingHandler
{
    private static readonly string[] ForwardedHeaders =
        ["Intowork.TeamName", "Intowork.TeamTimeZone", "Intowork.TeamDateFormat", "Intowork.TeamTimeFormat"];

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
    {
        if (accessor.HttpContext is { } context)
            foreach (var name in ForwardedHeaders)
                if (context.Request.Headers.TryGetValue(name, out var value) && !request.Headers.Contains(name))
                    request.Headers.TryAddWithoutValidation(name, value.ToArray());
        return base.SendAsync(request, token);
    }
}

public static class TeamTimeServiceCollectionExtensions
{
    public static IServiceCollection AddTeamTime(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddHttpContextAccessor();
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<TimeZoneFallbackMeter>();
        services.Configure<TeamTimeOptions>(configuration.GetSection("Time"));
        services.AddScoped<IRequestInfo, HeaderRequestInfo>();
        services.AddScoped<IDateTimeProvider>(sp => new TeamDateTimeProvider(
            sp.GetRequiredService<TimeProvider>(),
            sp.GetRequiredService<IRequestInfo>().TimeZone));
        services.AddScoped<ITeamZoneResolver, TeamZoneResolver>();
        services.AddTransient<TeamHeadersForwardingHandler>();
        return services;
    }
}
```

| Part | Job |
|---|---|
| `IRequestInfo` | The team and its zone and formats for the current request. One place reads the `Intowork.*` headers. |
| `TeamZones.Resolve` | Turns a zone id into `TimeZoneInfo`. When the id is missing or unknown, it returns London and counts the fallback (`time.zone.fallback`, reason `missing`, `invalid` or `customer`). `TeamZones.NoContext` does the same for code that runs outside a request, with reason `no-context` (Z17). |
| `TeamHeadersForwardingHandler` | Copies the four team headers onto internal service-to-service calls (Z18). Added to each internal `HttpClient` in 4.3. |
| `IDateTimeProvider` | "Now", "today", day windows and conversions in the team's zone. The offset is worked out for each date from the zone, so dates across a clock change are right. |
| `ToUtc` | A time in the spring gap moves forward to the first valid time. A time in the repeated autumn hour takes the first occurrence (summer time). The frontend control uses the same rules. |
| `DayOf`, `DayRangeUtc` | The team's day of an instant, and the UTC window `[StartOfDayUtc(D), StartOfDayUtc(D+1))` that holds every row of that day, old and new (Phase 6). |
| `ITeamZoneResolver` | For work without a team request: the team's zone from the service's team copy (`ITeamCopyReader`, one small adapter per service), then London. |
| `ITeamClocks` | A clock for any team, from anywhere: `ForTeamAsync(teamName)`, `WithFormatsForTeamAsync(teamName)` (clock plus the team's date and time formats), `ForZoneId(zoneId)`. Used by jobs, Service Bus handlers, hosted services, PDFs and e-mails. |
| `TeamTimeOptions` | `Time:DefaultZone` (`Europe/London`), default formats. |

### 3.3 Replacing hard-coded London

| Today | After | Example site |
|---|---|---|
| `IsOSPlatform(Windows) ? "GMT Standard Time" : "Europe/London"` | `requestInfo.TimeZone`, or `await resolver.ZoneForAsync(team)` without a team request | 118 sites |
| `isSummer ? hour - 1 : hour` | `clock.ToUtc(day.ToDateTime(startTime))` | `WageCalculatorExtension.cs:652-693` |
| `AdjustForDaylightSaving` / `RemoveDstSideEffect` | `clock.ToUtc` / `clock.ToTeamTime` | `WageWeekDateCalculator.cs` |
| `ConvertTimeFromUtc(x, London)` | `clock.ToTeamTime(x)` | `ReportingCalendar.cs:12-55` |
| Mongo `$dateToString` with `timezone: "Europe/London"` | `timezone: requestInfo.TimeZone.Id` | `CPLabourDailyRepository.cs:1338,1618` |
| `nowInLondon` as "now" | `clock.TeamNow` | `GetVehiclesForTeamHandler.cs:12-23` |
| Hangfire `TimeZone = londonTimeZone` | the team's zone per team job | `HRJobScheduler.cs:29-42` |
| PDF and e-mail `"dd/MM/yyyy HH:mm"` in London | team zone and team formats | `ReportGeneratorService` (Handover, Inspections, ActiveWork) |

**London sites per repo** (grep, 2026-10-07):

```text
Hard-coded London sites (118)

Attendance    ████████████████████████████████████████  54
Report.API    ███████████████████                       25
Materials     ███████                                   10
Handover      ███████                                    9
Resources     ███████                                    9
ActiveWork    █████                                      7
Inspections   ███                                        4
```

**Legend**

| Label | Meaning | Example |
|---|---|---|
| Site | One place that names London or converts with it. | `IsOSPlatform(Windows) ? "GMT Standard Time" : "Europe/London"` |
| Bar | Sites in the repo, scaled to Attendance (54). | Report.API 25 |

### 3.4 Fixing day queries (the query rule)

The handler works out the team's day once and passes a `DateOnly` down. A repository never calls `.Date`, `UtcNow` or `UtcNow.Date` in a filter. It filters on `window = clock.DayRangeUtc(day)`:

```text
                 every row for D, old and new: the team's midnight (Z3)
                        │        end-of-day row for D
                        │                 │
 ───────────────────────●─────────────────●──────────────────────────●─────►  time (UTC)
                    D-1 23:00Z         D 22:59Z                   D 23:00Z
                        ▲                                            ▲
                   window.From                                  window.To
                        └─────────── clock.DayRangeUtc(D) ───────────┘

 on day D       Date >= window.From  &&  Date < window.To
 before D       Date <  window.From
 D or later     Date >= window.From
 after D        Date >= window.To
 covers D       Start < window.To  &&  End >= window.From
```

**Legend**

| Label | Meaning | Example |
|---|---|---|
| D | The team's calendar day, worked out once per request: `clock.DayOf(clock.UtcNow)` or the day the user picked. | 2026-07-06 |
| Row for D | A calendar date for D: the team's midnight as UTC (Z3). | `2026-07-05T23:00Z` for 6 July, London summer |
| End-of-day row | An old row saved as the end of the London day; still inside the window. | `2026-07-06T22:59Z` |
| `window.From` / `window.To` | The team's day as a UTC range. | `[2026-07-05T23:00Z, 2026-07-06T23:00Z)` |
| The five filters | The only comparisons a repository may use for a calendar day. | sold before today: `SoldDate < window.From` |

Mongo date-part operators (`$dateToString`, `$dateToParts`, `$dayOfWeek`, `$year`, `$month`, `$dayOfMonth`) go through one kit helper that always passes `timezone`.

### 3.5 Frontend time kit (copied into `shared/time/` in each app)

```html
<app-date-time-field formControlName="clockIn" mode="dateTime" label="Clock in"></app-date-time-field>
<app-date-time-field formControlName="absenceStart" mode="date" label="First day"></app-date-time-field>
{{ row.clockIn | teamDate:'dateTime' }}
{{ absence.startDate | calendarDate:'dateMedium' }}
{{ job.deliveredAt | teamDate:'dateTime':job.teamTimeZone }}
```

| Part | Job |
|---|---|
| `<app-date-time-field>` | A `ControlValueAccessor` on Angular Material. Modes `dateTime`, `date`, `time`. It shows and accepts the team zone and format. The form value is always UTC with `Z`. In `date` mode the value is the team's midnight as UTC (Z3). An optional `[zone]` input overrides the team zone (customer screens). |
| Warning | Inside the input control only, when the device zone differs from the team zone on that date: "Your device is on Toronto time (UTC−4). Times here are in London time (UTC+1)." Translated through ngx-translate; dismissible for the session. |
| `teamDate` pipe | Shows an instant in the team zone and format. An optional third argument gives another zone (customer screens). |
| `calendarDate` pipe | Shows a picked day as the team's day, with date-only formats. Same optional zone argument. |
| `TeamTimeService` | Zone and formats from `/teamsettings`, London defaults until loaded. Frontend reloads on `teamContext.resolvedTeam$`; the mobile apps read once per login and keep it offline. Customer users have no team settings, so screens pass each record's `teamTimeZone`. |
| `time-core.ts` | `teamWallClockToUtc`, `utcToTeamWallClock`, `calendarDateToWire`, `formatInZone`, `deviceZone`, `isDeviceZoneDifferent`, strict `parseWire`. The same file in all three apps. |
| `teamCalendar`, `utcRange` | `teamDayOf`, `startOfTeamDayUtc`, `teamDayRangeUtc`, list-filter ranges. |

The control in Frontend is a standalone component (Angular 19). HandoverApp and InspectionsApp (Angular 16) get it through an NgModule. The core files are byte-identical, with a CI drift check.

### 3.6 What does not change

- MongoDB: no migration, no rewrite, no new collection. The three team fields are optional and need no backfill.
- The API date shape: ISO 8601 with `Z`, real UTC.
- Integration events, apart from the three optional team fields.
- Container `TZ` settings. Removing them is UTC plan work (4.7); this plan's code no longer depends on the process zone.
- Attendance pay rules. Results for London teams stay identical, apart from the day-boundary rows signed off in 6.3 (S.5).

---

## 4. Phases

Every step has a checkbox and a test. A phase is done when its "Done when" line is true.

### Phase 0 — Decisions and discovery

**Goal:** every decision recorded and every site listed before code changes.

- [ ] **0.1** Record Z1–Z14 and Z16–Z18 as decided, and confirm Z15. Close the remaining questions Q8–Q11.
- [ ] **0.2** Table of the 118 London sites, with columns repo, file:line, kind and step. Kinds:
  - zone conversion;
  - `isSummer` hour shift;
  - Hangfire zone;
  - Mongo `timezone`;
  - PDF or e-mail text;
  - "now in London".
- [ ] **0.3** Table of every frontend date input and date display, each marked instant or calendar date:
  - Frontend: 19 `mat-datepicker` files, 21 `type="date"`, 10 `type="time"`, 1 `datetime-local`, 30 date-only `toISOString().substring(0,10)`, 48 `'yyyy-MM-dd'`;
  - Frontend customer-portal screens (`baton-customers`, `customers`, `customer-mapping` and the portal views);
  - InspectionsApp: `date-entry`;
  - HandoverApp: the range code in `attendance.service.ts`.
- [ ] **0.4** List every background entry point (Hangfire jobs, Service Bus handlers, hosted services) and where its team comes from. Events carry `TeamName` per class; the `IntegrationEvent` base has none.
- [ ] **0.5** Choose the frontend zone library: `Intl`, or `date-fns-tz` 2 (fits the apps' date-fns 2). Record the outcome of the 8.0 date-picker spike here too.
- [ ] **0.6** Agree the warning text and its translation keys.
- [ ] **0.7** List the customer-portal endpoints that return or filter dates, with the team field each record carries. List the SignalR payloads that carry dates or date text.
- [ ] **0.8** List every service-to-service HTTP call (typed `HttpClient`s) and every route a service exposes without going through Gateway. For each call, say whether it already forwards the team headers; for each route, confirm that only Gateway can reach it (network rule), because services trust the `Intowork.*` headers they receive.

**Done when:** 0.1–0.8 are signed off.

### Phase 1 — Safety net (before any change)

**Goal:** today's London behaviour is pinned and watched, so any difference shows up at once.

```text
What each safety-net layer catches

S.1 characterization tests   a changed result at a site we touched
S.2 TZ matrix in CI          code that still depends on the server's own zone
S.3 Gateway contract tests   a header missing, renamed or sent on an anonymous route
S.4 runtime guards           a request or job that fell back to London in production
S.5 Attendance shadow        any change in hours, pay, bonuses or deductions
S.6 frontend zone tests      a control or pipe that uses the device zone
S.7 gates                    a new hard-coded zone, UTC-day filter, datepicker or toISOString
```

**Legend**

| Label | Meaning | Example |
|---|---|---|
| S.n | A safety-net step below. | S.5 shadow compare |
| What it catches | The mistake that layer stops before or after release. | a wage that moves by one hour |

- [ ] **S.1** Characterization tests (`Current_` prefix) at every site in 0.2 and every point in the day-query audit, for summer, winter and both clock-change days (2026-10-25, 2027-03-28). Main targets:
  - **Attendance:** `WageCalculatorExtension.cs:652-693` start and finish caps; `WageWeekDateCalculator`; `ClockInOutTimeCalculator.cs:85-88`; `SupervisorClockInHandler` and `SupervisorClockoutHandler` (:197-209); `UserAttendanceRepo.cs:30` with a clock-in at 23:30Z in summer.
  - **Resources:** `ResourcesController.cs:36-38,446,468,484` range conversion, the `HRJobScheduler` job zone, `StaffMemberRepo.cs:220,248,254,415`.
  - **Report.API:** `ReportingCalendar.cs`, and the output of the `CPLabourDailyRepository.cs:1338,1618` pipelines on fixture data.
  - **Materials:** the `nowInLondon` handlers; `VehiclesRepo.cs:296,300` and `VehicleUnAvailabilityRepo.cs:46,55-60` around midnight.
  - **Handover and Inspections:** the PDF date text.
  - **ActiveWork:** the reminder day and the subject line; `ActiveWorkRepo.cs:131,351` at the window edges.

  A day-query test that is meant to change records today's answer, and is listed in 6.3 with the new answer.
- [ ] **S.2** `scripts/test-tz-matrix.sh` runs the tests under process zones `UTC`, `Europe/London`, `America/Los_Angeles` and `Pacific/Auckland`, as a CI job in every service repo. The results must be identical.
- [ ] **S.3** Gateway contract tests in `Intowork.Gateway.Tests/Auth/HeaderTransformationContractTests.cs`:
  - the header names stay stable;
  - authenticated routes carry the three new headers;
  - no `Intowork.TeamUtcOffset` header is sent;
  - customer-portal requests carry the London defaults;
  - anonymous routes do not carry them;
  - a client-sent `Intowork.TeamTimeZone` is stripped.
- [ ] **S.4** Runtime guards, built in Phase 4:
  - the fallback counter `time.zone.fallback`, with reason `missing`, `invalid`, `customer` or `no-context`;
  - `ITeamClocks` in every service, so background code can always reach its team's zone (Z17);
  - the Gateway refuses to forward an unknown zone id and uses London.
- [ ] **S.5** Attendance shadow-compare tool: recalculate the last 26 weeks for every team with the new code, and compare with the stored wage records (hours, pay, bonuses, deductions). Differences are reported per week. **Zero difference for London**, apart from rows on the 6.3 list (a clock-in between 23:00Z and 00:00Z in summer can move to the next London day).
- [ ] **S.6** Frontend test setup: the control, pipe and helper tests run with `TZ=America/Toronto`, `Pacific/Auckland` and `Europe/London`, with fixtures for both clock-change days.
- [ ] **S.7** Gates, in warn mode:
  - a CI grep for `Europe/London`, `GMT Standard Time` and `FindSystemTimeZoneById` outside `Time/`;
  - a CI grep for `.Date` and `UtcNow.Date` inside Mongo filter expressions, and for Mongo date-part operator literals outside the kit helper;
  - ESLint bans on `mat-datepicker`, native date and time inputs, `| date` and `toISOString()` outside `shared/time/`.

  All switch to error in Phase 11.

**Done when:** S.1–S.3 and S.6 are green on today's code, and the S.5 tool reproduces the stored wages.

### Phase 2 — Team settings (ProjectService)

**Goal:** each team has a zone and formats, and every service and app can learn them.

- [ ] **2.1** `Intowork.Core/Models/Data/Team.cs`: add nullable `TimeZone`, `DateFormat`, `TimeFormat`. Readers treat null as the London defaults. No backfill. *Test: a team document without the fields reads as London, `dd/MM/yyyy`, `HH:mm`.*
- [ ] **2.2** `Models/Api/TeamSettings.cs` and its validator:
  - the zone is checked with `TimeZoneInfo.TryFindSystemTimeZoneById`;
  - date formats allowed: `dd/MM/yyyy`, `MM/dd/yyyy`, `yyyy-MM-dd`, `dd.MM.yyyy`;
  - time formats allowed: `HH:mm`, `h:mm a`.

  *Test: unknown zones and formats are refused with a clear message.*
- [ ] **2.3** Zone set once (Z10):
  - team creation takes the zone, London by default;
  - an update that changes the zone of an existing team is refused (`TEAM_TIME_ZONE_FIXED`), including a team with no zone stored;
  - formats can change at any time;
  - **pending Q8 (recommended yes):** a support-only call sets the zone once for a team with no zone stored. It is audited, and it closes for good when the 10.5 window completes, because after that the team's picked days have been read as London.

  *Test: create with and without a zone; update the zone → refused; update the formats → saved; the support call works once before go-live and is refused after it.*
- [ ] **2.4** `TeamCreated` and `TeamUpdated` get the three optional fields. Old consumers ignore them: ship the readers first, then the publisher (two-release rule). **The readers are "Release 0"**, a small release of Gateway, the seven team-copy services and Report.API ahead of the window (10.5). It changes no behaviour: the new fields are stored and not used. *Test: event round trip; an old consumer still reads the event.*
- [ ] **2.5** Team copies in ActiveWork, Attendance, Handover, Inspections, Materials, Resources and NotificationService store the fields from the events (missing = London). NotificationService has no team copy today; it gets a small one fed by the same events. Report.API reads the ProjectService collection directly, so it only needs the model change. *Test: the copy updates on `TeamUpdated`.*
- [ ] **2.6** The `/teamsettings` response the apps already call returns the three fields. A team with no stored values gets the London defaults. *Test: the API contract includes them; a team without the fields returns London.*
- [ ] **2.7** The team settings screen in Frontend: a zone picker on create, read-only afterwards, and the two format choices, editable. Creating a team asks the admin to confirm the zone ("This cannot be changed later"), because a wrong zone has no fix. *Test: create with Toronto; the zone is read-only on edit; format changes save and reload; creation needs the confirmation.*

**Done when:** a staging team created with `America/Toronto` shows that zone in every team copy and in `/teamsettings`, and an attempt to change it is refused.

### Phase 3 — Gateway headers

**Goal:** every authenticated downstream request carries the team's zone and formats.

- [ ] **3.1** Gateway `Team` model, `TeamsRepo` and `TeamCreatedHandler` / `TeamUpdatedHandler`: store the three fields. The existing Redis entry is cleared on update. *Test: handler stores the fields; the cache is refreshed.*
- [ ] **3.2** `IntoworkAuthInjector`: on the default path (`:87`) and the `X-Selected-Team` path (after `:287-289`), add the claims:
  - `intowork_team_time_zone`;
  - `intowork_team_date_format`;
  - `intowork_team_time_format`.

  On the customer path (`AddCustomerUserScopesAsync`) and for empty values, add the London defaults. Add the three claims to `HeaderMappedClaims` and `AddMissingHeaderClaims` (`:25-34`, `:371-378`), and give them dummy values in `AddDummyPreflightValues`. *Test: default team, selected team, customer user, preflight.*
- [ ] **3.3** `Intowork.Gateway.Core/Data/Models/Ingress.cs:82-117`: three `AddHeadersToRequest` entries, which also apply to the `Options` route copies. *Test: generated configuration has the three mappings on authenticated routes only.*
- [ ] **3.4** An invalid stored zone id is logged, and London is sent. *Test: a team with `Mars/Base` gets `Europe/London`.*
- [ ] **3.5** Update the contract tests (S.3) and the `working.json` snapshot used by OcelotConfigValidator.
- [ ] **3.6** Headers are harmless before services read them, so ProjectService and Gateway changes can reach staging first. Production still waits for the one-step window (10.5).

**Done when:** in staging, a request for the Toronto team reaches every service with `Intowork.TeamTimeZone: America/Toronto`.

### Phase 4 — Backend time kit in every service

**Goal:** one small kit gives every service the request zone, a team-aware clock and a fallback without a team request, with no behaviour change yet.

- [ ] **4.1** Master copy in AttendanceService `Time/`, as in section 3.2:
  - `IRequestInfo` and `HeaderRequestInfo`;
  - `TeamZones`;
  - `IDateTimeProvider` and `TeamDateTimeProvider`;
  - `ITeamZoneResolver` and `TeamZoneResolver`;
  - `TeamHeadersForwardingHandler` (Z18);
  - `TeamTimeOptions`, `TimeZoneFallbackMeter`, `AddTeamTime`.

  *Tests:*
  - the standard zone set: London, Toronto, New York, Riyadh, Kolkata, Auckland, UTC;
  - both clock-change days: the spring gap moves forward, the autumn hour takes the first occurrence;
  - a missing or invalid header gives London and counts the fallback;
  - outside a request the zone is London and counts `no-context`; `ITeamClocks` gives a Toronto team's zone there;
  - an internal call made inside a request carries the four team headers, and one made outside a request carries none.
- [ ] **4.2** `scripts/sync-time-kit.sh` copies the kit into the other 13 service repos. A CI drift check compares file hashes with the master's `time-kit.version`.
- [ ] **4.3** In each service: call `AddTeamTime(configuration)` in API and Background hosts, and add `ITeamCopyReader` over the existing team copy (or a London-only reader where the service has no copy). Add `.AddHttpMessageHandler<TeamHeadersForwardingHandler>()` to each internal `HttpClient` found in 0.8. *Test: the host starts; DI resolves every part.*
- [ ] **4.4** Inject `IRequestInfo` and `IDateTimeProvider` only into classes that do date logic. Controllers keep their existing `TeamName` header properties (minimal change); ProjectService keeps its static `CurrentUser`.

**Done when:** the kit is in all 14 service repos, the drift check is green, and S.1 and S.2 are still green (nothing changed behaviour).

### Phase 5 — Replace hard-coded London, repo by repo

**Goal:** every site in 0.2 uses the team zone through the kit. For London teams every result stays identical (S.1).

Each repo is one or more PRs, in order from fewest sites to most. Patterns are in section 3.3.

- [ ] **5.1 Inspections (4 sites).** PDF dates in `Intowork.Inspections.Background/Services/ReportGeneratorService.cs:15-23,176,204` use the team zone and formats.
- [ ] **5.2 ActiveWork (7 sites).**
  - Delete `Utilities/TimeZoneProvider.London`.
  - Reminder day and subject: `TomorrowStaffAssignmentReminderService.cs:33,64`, `ActiveWorkNotificationService.cs:78-79,171`.
  - The ActiveWork PDF (`ReportGeneratorService.cs:139-147`) prints raw UTC today; it will print team time. **Behaviour change: sign-off needed.**
- [ ] **5.3 Handover (9 sites).** `ReportGeneratorService.cs:23-38,169`. In `HandoverNotification.cs:32-44,137`, the zone logic moves out of the data model into the handler.
- [ ] **5.4 Resources (9 sites).** `ResourcesController.cs:36-38,446,468,484` range conversion through `clock.ToUtc`. The `HRJobScheduler` zone moves in Phase 7.
- [ ] **5.5 Materials (10 sites).** `GetVehiclesForTeamHandler.cs:12-23` and `GetVehiclesForTeamByCategoryHandler`: `nowInLondon` → `clock.TeamNow`.
- [ ] **5.6 Report.API (25 sites).** Report output compared on staging data before and after.
  - `Helpers/ReportingCalendar.cs:12-55` becomes an instance built from the zone.
  - `BL/LabourSummaryService.cs:91-124`.
  - `CPLabourDailyRepository.cs:1338,1618` gets `timezone` from the request.
  - `OrderRequestResponse.cs:46-51`, `CollectionRequestResponse.cs:44-49`.
- [ ] **5.7 Attendance (54 sites), last.** One PR per area, each behind S.5. `WageHelperLegacy.cs` stays frozen, because old weeks keep their old code.
  - [ ] **5.7a** Wage calculator start and finish: `WageCalculatorExtension.cs:652-693`, `WageHelper.cs:128-132`.
  - [ ] **5.7b** Week commencing: `WageWeekDateCalculator.cs` (`AdjustForDaylightSaving`, `RemoveDstSideEffect`), and the callers `WageCalculaterHelper.cs:92,102,164,178` and `WageRecordApprovalHandler.cs:73`.
  - [ ] **5.7c** Clock in and out: `ClockInOutTimeCalculator.cs:85-88`, `SupervisorClockInHandler.cs:197-207`, `SupervisorClockoutHandler.cs:199-209`.
  - [ ] **5.7d** Reminder day window: `ReminderService.cs:198-202`.

**Done when:** S.1 is green in every repo, S.5 shows zero difference, and the S.7 grep finds no zone literal outside `Time/`.

### Phase 6 — Day queries: UTC day → team day (Z12)

**Goal:** every filter that asks "which day" uses the team's day window (section 3.4). Today these flip at 00:00 UTC: one hour late for London in summer, up to 13 hours for other zones.

The starting list is `../utc-time-zone/DATABASE_DATE_QUERY_AUDIT.md`: 20 points in 5 services, plus 30+ in-memory `.Date` hits.

```text
Day-query points per service (audit, 20)

Attendance  ████████████████████████████████████████  6
Report.API  █████████████████████████████████         5
Materials   ███████████████████████████               4
ActiveWork  ████████████████████                      3
Resources   █████████████                             2
```

**Legend**

| Label | Meaning | Example |
|---|---|---|
| Point | One query or in-memory check from the audit. | `VehiclesRepo.cs:296` `SoldDate` against `UtcNow.Date` |
| Bar | Points in the service, scaled to Attendance (6). | Resources 2 |

- [ ] **6.1** Kit: `DayOf`, `StartOfDayUtc`, `DayRangeUtc` (section 3.2), and a `MongoDateParts` helper that always passes `timezone`. Synced by 4.2. *Test: a 23:30Z clock-in in July is the next day for London and the same day for New York; windows across both clock-change days are 23 and 25 hours long.*
- [ ] **6.2** Refresh the audit: rerun the greps for `.Date`, `UtcNow.Date`, `DateTime.Today`, `$dateToString`, `$dateToParts`, `$dayOfWeek`, `$year`, `$month`, `$dayOfMonth` in all 14 services. Add every new hit, with kind (instant or calendar date) and step. *Test: none; the list is the output.*
- [ ] **6.3** Owner rules and behaviour-change list:
  - `ActiveWorkRepo.cs:351`: is "future active work" after today (`>= window.To`) or today and later (`>= window.From`)? (Q9)
  - `StaffMemberRepo.cs:220,248,254`: is an absence starting today "future"? The same rule must apply on all three lines. (Q10)
  - verify the field kind of `CPPrelimRepository.cs:54`;
  - list every day-query fix that changes a London answer (the hour between 23:00Z and 00:00Z in summer), with today's and the new result, for sign-off.
- [ ] **6.4 Attendance (6 points).** Behind S.5.
  - `UserAttendanceRepo.cs:30` with `ReminderService.cs:57,100`: the day window comes from the handler.
  - `StaffAssignmentRepo.cs:75`, `ResourceAllocationRepo.cs:35`: `clock.DayRangeUtc`.
  - `WageRecordsRepo.cs:200` (`$dayOfWeek` in UTC): delete if unused, otherwise `clock.DayOf(ClockOutDate).DayOfWeek` in memory; `WageRecordsRepo.cs:128`.
  - In-memory `.Date`: `UserAttendanceRecord.cs:111,123,138,156`, `WageCalculatorExtension.cs:549,584` → `clock.DayOf`.
- [ ] **6.5 Materials (4 points).** `VehiclesRepo.cs:296,300` (sold: `SoldDate < window.From`); `VehicleUnAvailabilityRepo.cs:46` and `:55-60` (covers D: `Start < window.To && End >= window.From`); `GetPaginatedVehiclesForTeamHandler` passes `day`.
- [ ] **6.6 ActiveWork (3 points).** `ActiveWorkRepo.cs:131,132` and `StaffAssignmentsRepo.cs:52,96,106` window edges; `TomorrowStaffAssignmentReminderService.cs:171`; `ActiveWorkRepo.cs:351` with the 6.3 rule.
- [ ] **6.7 Resources (2 points).** `StaffMemberRepo.cs:220,248,254` with the 6.3 rule; `StaffMemberRepo.cs:415` month count: `Created >= StartOfDayUtc(first of month) && Created < StartOfDayUtc(first of next month)`.
- [ ] **6.8 Report.API (5 points).**
  - `CPPlantRepository.cs:863,870,871` (`PlantHireStartDate.Date`) → `clock.DayOf`.
  - `CPPrelimRepository.cs:54` after the 6.3 check.
  - `CPMonthlyReportRepository.cs:270`: check the fixed-millisecond week step across a clock change.
  - Delete the dead `WagesPipeline` Dublin stages and the unused `WageCalculationStageBuilder` chain instead of converting them.
  - `CPLabourDailyRepository` is already covered by 5.6.
- [ ] **6.9** Gates in every service repo: the S.7 day-filter grep and the Mongo operator grep in warn mode now, error in Phase 11. New `.Date` hits outside Attendance follow the same rule.

**Done when:** every audit point is fixed, decided and fixed, or deleted; the 6.3 behaviour-change list is signed off; S.1 is green with the new answers; and S.5 shows no difference outside the 6.3 list.

### Phase 7 — Work without a team request

**Goal:** jobs, event handlers, customer-portal requests and the notification hub use the zone of the team the data belongs to.

- [ ] **7.1** Service Bus handlers that do date logic call `resolver.ZoneForAsync(event.TeamName)` and use `clock.ForZone(zone)`. Every event in the 0.4 list either carries `TeamName` or is listed as a gap. *Test: one handler per service for a Toronto team.*
- [ ] **7.2** Hosted services work out the zone per item from `item.TeamName`, e.g. `HandoverService/.../ServiceWorkers/ReminderService.cs:64-153`. *Test: two items for two zones.*
- [ ] **7.3** Resources `HRJobScheduler.cs:29-42`: `RecurringJobOptions.TimeZone` is the team's zone for each team job; the bank-holiday system job stays London. *Test: a Toronto team's job runs at Toronto time.*
- [ ] **7.4** Attendance reminders (`AttendanceBackgroundJobExtensions.cs:15-24`, `Cron.Daily(8,00)` and `Cron.Daily(16,00)` in London): one job per zone in use, at 08:00 and 16:00 team time. Only London exists today, so the schedule does not change. *Test: adding a Toronto team adds a Toronto job.*
- [ ] **7.5** PDFs made in the background (Handover, Inspections, ActiveWork): zone and formats come from the entity's team. *Test: a Toronto handover PDF shows Toronto times.*
- [ ] **7.6** Customer-portal endpoints (the 0.7 list):
  - the handler takes the zone from the record's team: `clock.ForZone(await resolver.ZoneForAsync(record.TeamName))`;
  - a list that mixes teams works out days per team;
  - each response that carries dates also carries `teamTimeZone`;
  - the fallback counter reason `customer` is allowed only where the 0.7 list says no team data is involved.

  *Test: a customer reading a Toronto team's job gets Toronto days and `teamTimeZone: "America/Toronto"`.*
- [ ] **7.7** NotificationService `NotificationHub`:
  - on connect it reads `extension_Team` (as today), resolves the zone through the 2.5 team copy, and keeps it in `Context.Items`;
  - pushed payloads carry dates as UTC instants;
  - any date text in a payload is built by the sending service in the team zone (7.1);
  - the apps format pushed dates with `teamDate`.

  *Test: a Toronto connection gets Toronto-formatted text; a payload date round-trips as UTC.*

**Done when:** the staging Toronto team gets its reminders at its own 08:00, its PDFs show its own times, a customer sees its records in Toronto time, and the counter shows `customer` only on the listed routes.

### Phase 8 — Frontend time kit (the three apps)

**Goal:** one shared control and two pipes that work in the team zone on any device.

- [ ] **8.0** Spike before 8.3, once per Angular version (19 in Frontend, 16 in the two mobile apps): can Angular Material's date picker run on the team's wall clock? Material works in device-local `Date` objects, so this needs a custom `DateAdapter` (`TeamZoneDateAdapter`) that maps the calendar grid, the "today" highlight and the typed text to the team zone. The spike is done when a Toronto device on a London team, near London midnight, highlights the London day and returns the right UTC value. If no adapter is workable, 8.3 uses a text-and-time input with our own calendar popup. The outcome is recorded in 0.5.
- [ ] **8.1** `shared/time/time-core.ts`, the same file in all three apps, with a CI drift check. *Test: the vectors are shared with the backend kit (same zone set, same clock-change rules).*
- [ ] **8.2** `TeamTimeService`: zone and formats from `/teamsettings`, London defaults until loaded. Frontend reloads on `teamContext.resolvedTeam$`; HandoverApp and InspectionsApp read once per login and cache for offline use. *Test: team switch reloads; offline start uses the cache.*
- [ ] **8.3** `<app-date-time-field>` as a `ControlValueAccessor` on Angular Material (on the 8.0 adapter, or the fallback it names):
  - modes `dateTime`, `date`, `time`;
  - an optional `[zone]` input;
  - the value is UTC with `Z`;
  - `date` mode gives the team's midnight as UTC;
  - the spring gap moves forward and the autumn hour takes the first occurrence, each with a hint;
  - invalid input gives the form error `dateTimeInvalid`.

  *Test: every mode × device zone × team zone × clock-change day (S.6).*
- [ ] **8.4** The warning inside the control, shown when `isDeviceZoneDifferent(zone, value or now)`. Only in the input control (Z7). *Test: shown for Toronto and Auckland devices on a London team, hidden for a London device.*
- [ ] **8.5** Pipes `teamDate` (instants) and `calendarDate` (picked days, date-only formats), each with an optional zone argument. *Test: the same value shows the same text on every device zone; a passed zone wins over the team zone.*
- [ ] **8.6** Helpers `teamCalendar` and `utcRange`. *Test: `teamDayRangeUtc` for London summer is `[D-1 23:00Z, D 23:00Z)`.*
- [ ] **8.7** Wrappers: standalone components in Frontend (Angular 19), an NgModule in HandoverApp and InspectionsApp (Angular 16).

**Done when:** the kit is in all three apps and the S.6 tests are green.

### Phase 9 — Frontend screens

**Goal:** every date input uses the control and every date display uses the pipes.

- [ ] **9.1** Frontend, one PR per area. A picked-day field sends the team's midnight as UTC; a time field sends UTC.
  - [ ] **9.1a** Attendance: `user-attendance-row` clock-in/out (`type="time"` plus `setHours`) and the header clock-in.
  - [ ] **9.1b** Resources: `staff-detail` dates, `staff-calendar` (`Date.UTC` mapping), `staff-attendance-calendar`, `dob-input`.
  - [ ] **9.1c** ActiveWork: the create dialogs; remove `UKDateAdapter`.
  - [ ] **9.1d** Calculator: `secure-job` and the other `toISOString().substring(0,10)` sites.
  - [ ] **9.1e** SafetySuite: `near-miss-form` (`datetime-local`, `getTimezoneOffset`).
  - [ ] **9.1f** Shared: `report-period-selector`, and the wage `adjustmenttable-date-selector` (three copies).
  - [ ] **9.1g** Fix `labour-summary.service.ts:226` (hard-coded `+1 h`) and `shared/utils/date-utils.ts:26` (`addHoursUTCDifferent`).
  - [ ] **9.1h** Customer-portal screens (0.3 list): pass each record's `teamTimeZone` to the pipes and controls.
- [ ] **9.2** InspectionsApp: `inspection/steps/hands/date-entry` → the control in `date` mode; `capturedDate.toUTCString()` → `toISOString()`.
- [ ] **9.3** HandoverApp: `attendance/attendance.service.ts:44-69`, the local `setHours` day range → `teamDayRangeUtc`. System stamps (`new Date()`) stay, because they are instants.
- [ ] **9.4** Display: `| date` on date fields → `teamDate` or `calendarDate`; chart and calendar labels through `formatInZone`.
- [ ] **9.5** Turn on the S.7 ESLint rules for each app once its screens are done.

**Done when:** no banned pattern is left, and the 10.2 script passes on a Toronto device for a London team.

### Phase 10 — Verification and one-step go-live (Z11)

- [ ] **10.1** Staging teams created in London, Toronto and Auckland, and one customer linked to the Toronto team.
- [ ] **10.2** Manual script per app on devices set to Toronto, Auckland and London:
  - type 08:00 → stored as the team's 08:00 in UTC;
  - the warning shows only in inputs, and only when the zones differ;
  - lists and PDFs show team time;
  - picked days stay the same day;
  - "today" lists change at the team's midnight;
  - the customer sees the Toronto team's records in Toronto time.
- [ ] **10.3** Rerun S.5 on a production copy: zero difference for London outside the 6.3 list.
- [ ] **10.4** Watch the fallback counter on staging: zero for authenticated routes; `customer` only on the 0.7 routes; **zero `no-context`**, so every job and handler has its zone.
- [ ] **10.5** Release 0, ahead of the window: the readers of the new event fields (2.4): Gateway, the seven team-copy services and Report.API. No behaviour changes. Then one release window, from the same build that passed 10.1–10.4:
  1. ProjectService (publishes the new fields);
  2. Gateway;
  3. the 14 services;
  4. Frontend, HandoverApp and InspectionsApp.
- [ ] **10.6** Rollback:
  - **Clean while no production team is outside London (Z15).** A rollback redeploys the previous versions of ProjectService, Gateway, the services and the apps.
  - The day-query fixes are correct for London, so a redeploy of the previous versions is the only way back.
  - There is no setting that switches the feature off.
  - There is no data to restore, as long as Z15 holds.
  - **If a non-London team already has production data, do not redeploy the previous versions.** That team's picked days and times are saved as its own midnights, and London reads them an hour or more off. Fix forward instead.

**Done when:** 10.2–10.4 pass, the window completes, and one payroll cycle runs in production with every production team on London (Z15).

### Phase 11 — Clean-up

- [ ] **11.1** After one stable payroll cycle, open production to teams outside London (Z15). Then remove the `Current_` tests that newer tests replace.
- [ ] **11.2** Switch the S.7 and 6.9 gates from warn to error.
- [ ] **11.3** Delete the old helpers: `TimeZoneProvider` (ActiveWork), the `date-utils` offset helpers and `UKDateAdapter` (Frontend).

---

## 5. Order, dependencies and size

**Steps per repo** (checklist steps that touch the repo; Phases 0, 10 and 11 belong to no repo):

```text
Plan steps per repo (179 in all)

Frontend        ████████████████████████████████████████  21
Attendance      ████████████████████████████████          17
HandoverApp     ███████████████████████████               14
InspectionsApp  ███████████████████████████               14
ProjectService  █████████████████████                     11
Handover        █████████████████████                     11
Resources       █████████████████████                     11
ActiveWork      █████████████████████                     11
Inspections     ███████████████████                       10
Materials       ███████████████████                       10
Report.API      █████████████████                         9
Gateway         ███████████████                           8
Notification    █████████████                             7
Customer        ██████████                                5
Forecasting     ██████████                                5
Gaffer          ██████████                                5
Permissions     ██████████                                5
SafetySuite     ██████████                                5
```

**Legend**

| Label | Meaning | Example |
|---|---|---|
| Bar and number | Checklist steps in Phases 1–9 that change the repo. A step can be one PR or a few; site counts are in sections 3.3 and Phase 6. | Attendance 17: S.1, S.2, S.5, S.7, 2.5, 4.1–4.4, 5.7a–d, 6.1, 6.4, 6.9, 7.4 |
| Five-step repos | Services with no London site or day query: S.2, S.7, 4.2, 4.3 and 6.9. | Customer |
| Not counted | 7.6 touches the services on the 0.7 customer list, not known yet. | — |

**Critical path:** 0 → 1 → 2 → 3 → 5 (Attendance last) → 6 → 7 → 10 → 11. Phase 4 needs only Phase 1, so it runs beside 2 and 3, and 5 waits for 4 in each repo. Phases 8 and 9 run alongside once 2.6 is on staging; the 8.0 spike can start at once, because it needs no backend.

| Phase | Needs first |
|---|---|
| 1 Safety net | 0.2, 0.3, the audit list |
| 2 Team settings | 1 green |
| 3 Gateway | 2.1–2.4 on staging |
| 4 Backend kit | 1 green |
| 5 London sites | 4 in that repo; S.5 for Attendance; S.1 for the repo |
| 6 Day queries | 4 in that repo; the 6.3 rules signed off |
| 7 Without a request | 2.5 and 4 in that repo; 0.7 for 7.6 |
| 8 Frontend kit | 2.6 on staging |
| 9 Screens | 8 in that app; 7.6 for 9.1h |
| 10 Go-live | 5, 6, 7 and 9 done |
| 11 Clean-up | one stable payroll cycle |

---

## 6. How it differs from the other two plans

| Topic | UTC plan | Team-local plan | This plan |
|---|---|---|---|
| What is stored | UTC | Team wall clock labelled `Z` | UTC, as today |
| Data migration | None | 118 collections, 12 event stores | None |
| Backend change | `IBusinessCalendar` everywhere (about 490 repo steps) | `ITeamTime`, recipe per repo (194 steps) | Small kit, the 118 London sites and the day-query audit (179 steps) |
| Frontend | Shared control and pipes | Control, pipes and `ApiDateConverter` in every API service | Shared control and pipes |
| Attendance rules | 15 behaviour changes (B1–B16 without B13), shadow compare | 14 behaviour changes, shadow compare | No rule change; only the 6.3 day-boundary list differs for London |
| Non-London teams | From go-live | After Phase 8 | After one stable payroll cycle (Z15); staging only until then |
| Outside consumers | Unaffected | `Z` means wall clock | Unaffected |
| UTC-day query bugs | Fixed | Fixed (`.Date` is the team day) | Fixed (Phase 6) |
| Go-live | One step | One step | One step |

The step counts are not like for like: each plan counts its steps differently. This plan is close to a smaller UTC plan. It keeps the UTC plan's storage, frontend control, header design and query rule, and drops its full calendar rewrite, `Kind=Utc` entry points, container `TZ` removal and Attendance rule changes.

---

## 7. Known gaps kept

| Gap | Effect | Why kept |
|---|---|---|
| Old browser-midnight calendar rows (`21:00Z`, `22:00Z`, winter `23:00Z`) | Rows outside the team-day window read as the day before, as today | No data changes (Z2) |
| Existing teams are fixed to London | A team that works elsewhere today keeps London, unless support sets its zone once before go-live (Q8) | Z10; Q8 |
| Rollback is clean only while production has no non-London team | After a non-London team writes data, redeploying the previous versions would misread its picked days; the fix is forward | Z15 keeps production on London until one stable payroll cycle; 10.6 |
| A wrong zone at team creation | No fix, because the zone never changes | The create screen asks for confirmation (2.7) |
| `NotificationHub` reads the token's team | A user who picked another team with `X-Selected-Team` gets the token team's zone on the hub | The hub never sees `X-Selected-Team`; payload dates are UTC and the apps format them, so only prebuilt text is affected |
| Queries built in helpers the greps miss | A UTC-day filter could survive | The 6.9 gates and S.1 tests catch new ones; the audit says it is a read-through, not proof |
| Container `TZ=Europe/London` in six containers | Left as today | Removing it is UTC plan work; this plan's code no longer needs it |

---

## 8. Questions for the team

### Answered (2026-10-07)

| # | Question | Answer | Where applied |
|---|---|---|---|
| Q1 | Go live per service or in one step? | One step | Z11, 10.5 |
| Q2 | Fix the UTC-day query bugs here? | Yes | Z12, Phase 6 |
| Q3 | Kit copied per repo or in CommonLibs? | Copied per repo | Z9, 4.2 |
| Q4 | Who sets the zone and formats; can they change? | Zone fixed at creation; formats can change | Z10, 2.3, 2.7 |
| Q5 | London fallback for customer users and SignalR? | No: both get the team zone | Z13, 7.6, 7.7, 9.1h |
| Q6 | Warning in inputs only, or also on displayed times? | Inputs only | Z7, 8.4 |
| Q7 | Add this plan to the comparison? | Yes | Z14 |

### Still open

| # | Question | Needed by |
|---|---|---|
| **Q8** | Existing teams have no zone stored and are fixed to London (Z10). If a team that exists today works outside London, may support set its zone once before go-live, or must a new team be created? **Proposed: yes**, support-only, once, audited, closed when the 10.5 window completes (2.3). | 2.3 |
| **Q9** | `ActiveWorkRepo.cs:351`: should "future active work" start after today, or include today? | 6.3 |
| **Q10** | `StaffMemberRepo.cs:220,248,254`: is an absence that starts today a "future" absence? | 6.3 |
| **Q11** | ActiveWork PDF (5.2) will print team time instead of raw UTC: is that change approved? | 5.2 |
| **Z15** | Confirm: production stays on London teams until one stable payroll cycle after go-live (keeps rollback clean). | 10.6, 11.1 |
