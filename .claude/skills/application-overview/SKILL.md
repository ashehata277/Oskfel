---
name: application-overview
description: >
  Explains what the Baton (internally "Intowork") application is, does, and is built from —
  business domains (job costing, resource scheduling, active work, wage/payroll, materials,
  reporting), the 20+ feature modules and their routes/permissions, the microservice API map
  (gateway + per-service localhost ports), auth flow (Azure AD B2C + MSAL), data flow
  (component -> service -> HttpClient -> interceptors -> gateway -> microservice), and known
  technical debt/risk areas. Use this skill whenever the user asks "what does this app do",
  "how is the app structured", "which module handles X", "which permission/route does Y need",
  "how does auth/login work", "what backend service does Z call", wants an architecture
  overview/onboarding summary, or references any feature by name (jobs, calculator, activework,
  wages, materials, ldf, tdf, forecasting, pandl, permissions) without knowing where it lives.
---

# Application Overview (Baton / Intowork)

Baton (internal name: Intowork) is an enterprise workforce and project management platform for
the construction/scaffolding industry: tender pricing -> resource scheduling -> active site work
-> materials -> payroll, in one Angular 19.2 SPA. This file is the condensed map; the full
version with mermaid diagrams and developer-guide detail lives in `APPLICATION_OVERVIEW.md` at
the repo root — read it when you need the actual sequence/flow diagrams or setup commands.

## Business Domains

| Domain              | Purpose                                                            |
| ------------------- | ------------------------------------------------------------------ |
| Job Costing         | Multi-tier pricing engine for tendering and managing project costs |
| Resource Scheduling | Staff availability, allocation, forecasting                        |
| Active Work         | Real-time site operations (handovers, staff assignments)           |
| Wage & Payroll      | Clock-in/out, wage calc, CM approvals, weekly locking              |
| Materials           | Stock, vehicles, order/collection requests, transport forecasting  |
| Reporting           | P&L, LDF (Labour Diary Forecast), TDF (Transport Diary Forecast)   |

Roles (derived from `PermissionsService`, 28 named route permissions): Admin (implicit override),
Contract Manager (approves wages, manages jobs), Commercial Manager (pricing/variations/financial
reporting), Supervisor (active work, handovers, clock-in), Staff Member (self clock-in, mypage),
CRM User (customers/contacts).

## Feature Modules & Routes

Every route sits under `/` -> `TemplateComponent` -> lazy-loaded `LayoutModule` children, all
guarded by `MsalGuard` + `permissionCanActivate`.

| Route             | Feature                                                       | Permission                                  |
| ----------------- | ------------------------------------------------------------- | ------------------------------------------- |
| `/projects`       | Jobs — tender-to-completion, sections/OGs/priced items        | `intowork.projectlist.write`                |
| (embedded in job) | Calculator — pricing engine, 63 sub-folders                   | —                                           |
| `/activework`     | Active Work — staff assignments, handovers, inspection status | —                                           |
| `/materials`      | Materials — catalogues, stock, vehicles, orders/collections   | `intowork.materialcatalogue.write`          |
| `/wages`          | Wages — payroll, no-show handling, CM approval, weekly lock   | `intowork.wages.write`                      |
| `/attendance`     | Attendance — QR/GPS clock-in/out                              | —                                           |
| `/resources`      | Resources — staff registry, qualifications, availability      | `intowork.staff.write`                      |
| `/customers`      | Customers — CRM, archive/restore                              | `intowork.customers.write`                  |
| `/ldf`, `/tdf`    | Labour/Transport Diary Forecast — daily/weekly views          | `intowork.ldf.write` / `intowork.tdf.write` |
| `/variations`     | Job change orders, Stage 1/2 approvals                        | —                                           |
| `/rates`          | Rate catalogue + labour/material extras                       | —                                           |
| `/pandl`          | Daily/weekly P&L per customer or CM, CSV export               | —                                           |
| `/forecasting`    | Staff/role allocation forecasting                             | —                                           |
| `/inspections`    | Site inspections, H&S compliance                              | —                                           |
| `/permissions`    | Auth groups + named permission assignment                     | `intowork.permissions.write`                |
| `/home`           | Personal dashboard (mypage)                                   | `intowork.mypage.basic\|full`               |
| `/pricing`        | Item/material/stock catalogues, config zones                  | `intowork.teamsettings.write`               |

`wage-legacy` and `wage-legacy-2` exist alongside the current `wage` module for backward
compatibility — treat them as legacy, not reference patterns (see Technical Debt below).

## Architecture

Hybrid bootstrap: `bootstrapApplication(AppComponent, appConfig)` in `main.ts` (standalone entry
point, no `app.module.ts`) with `routes.ts` routing into `TemplateModule`, an otherwise
traditional NgModule tree with 30+ lazy-loaded feature modules. `APP_INITIALIZER` fetches
`assets/config/config.{dev|prod}.json` (gateway URL, B2C config, Syncfusion license,
`fractionDigits` default) before anything else runs — this is why `AppSettingsService` uses
`HttpBackend` directly instead of `HttpClient`, bypassing interceptors intentionally.

Guard/interceptor order matters: `MsalInterceptor` (Bearer token) -> `SignalrHttpInterceptor`
(`socket-client-id` header) -> `TestTokenHttpInterceptor` (dev-only identity headers) ->
`HttpRequestInterceptor` (spinner + error propagation). Route guards stack as `MsalGuard` then
`permissionCanActivate`.

## Data Flow

`Component (template, async pipe)` -> `Feature Service (BehaviorSubject<T> + HttpClient)` ->
interceptor chain -> `AppSettingsService.getGatewayUrlForService(name)`-resolved URL -> API
Gateway (prod) or per-service localhost port (dev) -> microservice. State never goes through
NgRx/Akita/Signals — every domain service exposes `private BehaviorSubject` + `public readonly
$-suffixed observable`, and only that service calls `.next()`.

## API / Microservice Map (dev ports)

| Service           | Port | Domain                                   |
| ----------------- | ---- | ---------------------------------------- |
| resources         | 5000 | Staff, absence                           |
| permissions       | 5001 | Permissions, auth groups                 |
| customers         | 5003 | Customers, contacts                      |
| jobs / pricing    | 5004 | Jobs, pricing, team settings, variations |
| handovers         | 5005 | Handovers                                |
| inspections       | 5006 | Inspections, H&S                         |
| activework        | 5007 | Active work, staff assignments           |
| attendance / wage | 5008 | Attendance, payroll                      |
| materials         | 5009 | Materials, vehicles, stock, requests     |
| forecasting       | 5010 | Role/staff allocations                   |
| reports           | 5011 | P&L, reporting                           |

In production all of these collapse behind a single Azure API Gateway URL
(`AppSettingsService.getGatewayUrlForService`), so branching dev-vs-prod logic per service is
never needed in feature code.

## Auth Flow

`MsalGuard` checks the MSAL token cache on every protected route; no valid token redirects to
Azure AD B2C sign-in, which redirects back to `/auth` (`MsalRedirectComponent`), which exchanges
the code for tokens. `ExternalUserTokenService` extracts `sub`, `name`, `email`, `team`,
`staffMemberId` from the account claims onto a `user$` observable. `PermissionsService` then
calls `GET /permissions/my` and stores the permission string array; `permissionCanActivate`
reads `myPermissions$` (admin always passes; no permission redirects to `/home`).

## Reusable UI (SharedModule)

`Generic2btnDialogComponent` (confirm/cancel — use this, don't add a new confirmation dialog),
`ContainerComponent`/`MobileGridContainerComponent` (Syncfusion grid wrappers — see the
`grid-patterns` skill), `AutoCompleteInputComponent`, `PlacesAutoCompleteComponent`,
`GalleryComponent`, `PdfViewerComponent`, `CommentaryComponent`, `AuditViewerComponent`.
Icons: Feather (SVG), FontAwesome Free Solid, Material Icons. i18n is `@ngx-translate/core`,
single `en-GB` locale, CLDR-backed for Syncfusion/Material number-date formatting.

## Developer Setup

```bash
npm install
npm run start-dev   # use this over `npm start` — large project, needs the 4GB heap flag
npm run build       # -> dist/IntoworkFrontend/
npm test            # Karma/Jasmine
```

Config secrets live in `src/assets/config/config.{dev,prod}.json` (not committed) — not
`environment.ts`. Without a valid `syncfusionLicenseKey` in that file, grids show a license
banner.

## Technical Debt & Risk Areas (be aware, don't extend)

| Area                                 | Risk       | Note                                                                    |
| ------------------------------------ | ---------- | ----------------------------------------------------------------------- |
| `wage-legacy` / `wage-legacy-2`      | High       | Two parallel legacy payroll modules, no deprecation path documented     |
| Partial TS strict mode               | High       | `strictNullChecks: false` — null bugs invisible at compile time         |
| `NavService` (36KB)                  | Medium     | Single service generating the entire menu tree — hard to maintain       |
| `ItemPricingService` v1 & v2 (41KB+) | Medium     | Two versions coexist in pricing/, unclear which is authoritative        |
| Calculator module (63 sub-folders)   | Medium     | High complexity, long onboarding curve                                  |
| No formal state management           | Medium     | BehaviorSubject-per-service works at current scale, harder as app grows |
| Hybrid standalone/NgModule           | Low-Medium | Migration stalled partway, inconsistency adds cognitive load            |

Full mermaid diagrams (architecture, routing flow, feature relationships, auth sequence, wage
processing flow) and the complete developer guide live in `APPLICATION_OVERVIEW.md` at the repo
root — open it directly when you need the diagram, not just the summary above.
