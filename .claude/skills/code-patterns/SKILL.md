---
name: code-patterns
description: >
  Enforces this repo's Angular coding conventions — module structure, routing, permissions,
  dialogs, forms, HTTP/service patterns, state management (RxJS BehaviorSubject, no NgRx/Signals),
  Syncfusion grids, Material components, loading/error states, directives, pipes, guards,
  models/enums, dates/numbers, CSS/SCSS, i18n, localStorage, SignalR, file upload, and testing.
  Use this skill whenever creating a new component/service/module, adding a dialog, writing a
  form, calling an API, managing subscriptions, checking permissions, adding a route, or touching
  any file in this Angular 19 codebase — it lists the exact pattern to follow and the known
  anti-patterns to avoid. Also trigger on "new feature module", "new service", "new dialog",
  "add a form", "permission check", "subscribe", "BehaviorSubject", or "anti-pattern".
---

# Code Patterns (Baton / Intowork Frontend)

Angular 19.2, bootstrapped standalone (`bootstrapApplication` in `main.ts`, no `app.module.ts`)
but every feature is still `standalone: false` NgModule-based — do not introduce standalone
feature components. TypeScript strict mode is fully **off** (`strictNullChecks`, `noImplicitAny`,
`strictPropertyInitialization` all false) — be manually careful with nulls and types.

This file condenses the rules. The full reference with every code example lives in
`CODE_PATTERNS.md` at the repo root (2000+ lines, 28 sections) — read it when you need the
exact snippet, not just the rule.

## Module Structure

Every feature = `feature.module.ts` (declares/imports components, imports `SharedModule`) +
`feature-routing.module.ts` (imports the feature module, registers `RouterModule.forChild`).
`SharedModule` is the barrel for common components, Syncfusion grid services, Material re-exports,
pipes, and directives — import it into any feature module that needs them.

## Routing & Permissions

All 22+ feature routes live in `src/app/layout/layout-routes.ts` under `MsalGuard` +
`permissionCanActivate`, with `data.permissions: ['intowork.xyz.write']`. New routes need both
guards and a permission key. Check permissions in components via
`permissionsService.myPermissions$.pipe(filter(Array.isArray), take(1))`, set a boolean flag,
and use the flag in the template — never check inline in the template, never subscribe without
completing. Prefer named helpers (`permissionsService.canCreateHandovers(perms)`) over raw
strings (`perms.includes('intowork.handover.create')`); add a new helper if one doesn't exist.

## Dialogs

Every dialog follows the same three-part contract: caller opens with typed `data` via
`dialog.open(Component, { data: {...} as MyDialogData, disableClose: true })`; the dialog
component injects `@Inject(MAT_DIALOG_DATA) public data: MyDialogData` (never `any`); it closes
with a typed result via `dialogRef.close({ saved: true, record } as MyDialogResult)` or
`dialogRef.close(undefined)` on cancel. Guard submit buttons with an `isProcessing` flag. For any
"are you sure?" prompt, reuse `Generic2btnDialogComponent` (`src/app/shared/generic2btn-dialog/`)
— do not create a new confirmation dialog. Several bespoke duplicates already exist
(`shared/confirmation-dialog/`, `shared-pricing/confirm-dialog/`,
`shared-pricing/pricing-confirm-dialog/`, `customers/customer-edit/confirmation-dialog/`,
`calculator/job-information/confirmation-dialog/`, plus `daily-resource-planner/components/
remove-*-confirm-dialog/`); don't add another.

## Component Communication

`@Input()` for parent→child (use a setter when the value change should trigger a side effect,
not `ngOnChanges`). `@Output() + EventEmitter` for child→parent. Cross-component shared state goes
through a service's `BehaviorSubject` (private, `.next()` only from the owning service) exposed as
`public readonly foo$ = this._foo.asObservable()`. Event-only broadcasts (no "current value") use
a plain `Subject`. Always clean up subscriptions — prefer the `async` pipe; when that's not
possible use `takeUntil(destroy$)` with `destroy$` completed in `ngOnDestroy`. Never leave a bare
`.subscribe()` in `ngOnInit` uncleaned.

## Forms

Always typed `FormBuilder` (`this.fb.group({...})`), never `UntypedFormBuilder`/`UntypedFormGroup`
— migrate old ones when you touch them. Use `.getRawValue()` when the group has disabled controls
(`.value` silently omits them). Reuse validators from `src/app/helpers/custom-validators.ts`
(`FormValidators.preventWhitespaceOnly`, `.selectAtLeastOne()`); write cross-field validators as
static methods on a local class. `mat-form-field` is always `appearance="outline"` in new code.

## HTTP & Services

Every domain service follows the identical shape: `private readonly _records = new
BehaviorSubject<T[]>([])`, `public readonly records$ = this._records.asObservable()`, HTTP calls
via `HttpClient` only inside the service (components never call `HttpClient` directly). For
CRUD methods that need to update local state, use `.pipe(tap(...))` and return the observable
directly — **never** store the request in a `const`, `.subscribe()` internally, and also return
it; that double-subscribes and fires the request twice (`share()` masks the symptom, it doesn't
fix it — this exact bug exists today in `jobs/job.service.ts`, `pricing/pricing-data.service.ts`,
`forecasting/forecasting.service.ts`, treat those as "avoid, don't copy"). Always subscribe with
the `{ next, error }` object form, never the deprecated 3-argument form. The global loading
spinner is automatic via `HttpRequestInterceptor` — don't manually toggle it for HTTP calls, only
for CPU-bound work or grid refreshes (`grid.showSpinner()`).

## State Management

RxJS `BehaviorSubject` per service is the only state management pattern in this app. No NgRx, no
Akita, no Angular Signals — do not introduce any of them without a team-wide decision. Derive
combined state in components with `combineLatest([...]).pipe(takeUntil(destroy$), map(...))`.

## Syncfusion Grids

See the dedicated `grid-patterns` skill for the full grid contract (`<grid-container>`,
`CustomGridColumns`, `ListParamBase`, localStorage persistence). Never use `<ejs-grid>` directly
in a feature template and never define columns in HTML via `<e-column>` — always the TypeScript
`columnsList` array through the shared wrapper.

## Loading & Error States

Three loading mechanisms, pick the right one: the global spinner (automatic, do nothing), a
per-service `isBusy$` + `mat-progress-spinner` for dialog/section-scoped loading, and
`grid.showSpinner()`/`hideSpinner()` for grid-only refreshes. For errors, always use
`ToastService` (`showSuccess`/`showError`/`showWarning`) in new code — `NotificationService`
(wraps `MatSnackBar`) is legacy, migrate it when you touch a file that uses it. Be aware
`GlobalErrorHandler` (`src/app/shared/global-error-handler.service.ts`) short-circuits in
production — it `console.log`s the error and returns, showing the user no toast and reporting to
no monitoring service (only the dev branch shows a toast). Treat unhandled prod errors as
effectively invisible; catch your own expected error paths and surface them via `toastService`
regardless.

## Directives & Pipes

Any button triggering an async action (save/delete/API call) needs `appBlockDoubleClick` with
`(clicked)` instead of `(click)`. New shared directives go in `src/app/shared/`, declared in
`SharedModule`, `app`-prefixed selector, and must implement `OnDestroy` cleanup. Don't duplicate
an existing selector — `calculator/scroll-to.directive.ts` duplicates `shared/scroll-to.directive.ts`
and is a bug, not a pattern. Pipes must be pure — no HTTP calls, `Math.random()`, or `Date.now()`
inside `transform()`; if you're transforming the same data in multiple templates, that's the
signal to extract a pipe.

## Route Guards

`permissionCanActivate` is the only permission guard — extend it, don't create a parallel one.
For "leave with unsaved changes?" prompts, implement `CanComponentDeactivate.canDeactivate()` and
register `canDeactivate: [unsavedChangesGuard]` on the route.

## Models, Interfaces & Enums

Models live in a `.ts` file at the feature root (e.g. `jobs/job.ts`), not a separate
`interfaces/` folder (grid-specific models are the exception, in
`shared/syncfusion-grid/interfaces/`). Mark UI-only/computed fields with a comment. String enums
for values shown directly or round-tripped to the API as strings; numeric enums when mirroring a
C# backend enum. Use a `Record<Enum, string>` lookup for enum→label, not a switch statement.
Because the API sometimes returns enum values as strings even when the field is numeric, compare
defensively: `value.toString() === 'Binary' || value === Enum.Binary`.

## Dates & Numbers

`date-fns` v2 only — never `moment`, `luxon`, or raw `Date` arithmetic. Use `parseISO`/`parseJSON`
to parse API dates and `format(date, "yyyy-MM-dd'T'HH:mm:ss")` for API calls, not
`.toISOString()` (that converts to UTC and there is no timezone handling anywhere in this app).
Standard display format is `'dd MMM yyyy'`; API params use `'yyyy-MM-dd'`. For money, always
`roundTo(value, 2)` from `round-to` — never accumulate floating point error with raw
multiplication, never `.toFixed(2)` for display (loses locale separators). `Intl.NumberFormat`
locale is always `'en-GB'` — some old files use `'en-US'` or the invalid `'en-UK'`; don't copy
that.

## CSS & Styling

Flat BEM-ish naming (`.record-card__header`, no double-hyphen modifiers — use `[ngClass]` for
state instead). Bootstrap 5 utility classes (`d-flex`, `gap-*`, `mb-*`, etc.) are loaded globally
— use them for layout rather than writing new flex/spacing CSS. `src/scss/` is a submodule —
**never edit it directly**; put new styles in `src/styles.scss` or a component's own `.scss`.
Prefer the CSS custom properties (`var(--theme-default)`, etc.) over hardcoded hex so the runtime
theme keeps working. `ViewEncapsulation.None` + `::ng-deep` only when styling Syncfusion/Material
internals that don't respect emulated encapsulation.

## i18n

One file, `src/i18n/en-GB.json`, loaded via `APP_INITIALIZER` before the app renders. Template:
`{{ 'generic.save' | translate | uppercase }}` (uppercase is the button-label convention). In
TypeScript, use `translate.instant(key)`, not `.get()` — keys are already loaded post-init. Key
naming is `feature-area.component-context.element.qualifier`
(`activework.create-dialog.errors.name.required`). A missing key silently renders as the raw key
string in the UI — always add new keys to `en-GB.json` in the same change.

## Local Storage

Always `LocalStorageService.setByTeam/getByTeam` — raw `localStorage.setItem/getItem` bypasses
team-scoping (`${teamName}_${key}`) and leaks state across tenants. New persisted settings get a
new entry in the `LocalStorageKeys` enum (`src/app/shared/localStorage/localStorageKeys.ts`,
~85 keys already).

## SignalR

`SignalrServiceService` exposes real-time events as Angular `EventEmitter`s
(`onSectionAdded`, `onItemUpdated`, etc.), not RxJS `Subject`s. `EventEmitter.unsubscribe()`
isn't reliably supported — guard callbacks with a `private destroyed = false` flag set in
`ngOnDestroy` instead of expecting unsubscribe to work. Every HTTP request automatically carries
a `socket-client-id` header (via `SignalrHttpInterceptor`) so the server won't echo a change back
to the client that made it — no action needed on your part.

## File Upload

Use `FormData` + `HttpClient.post` for uploads; never set `Content-Type` manually — the browser
sets the multipart boundary. `pica` (resize) and `heic2any` (HEIC→JPEG) are available providers
for client-side image prep before upload. CSV export uses `file-saver`'s `saveAs`.

## Testing

197 spec files exist and **none test anything meaningful** — every one is an auto-generated
`expect(component).toBeTruthy()` smoke test, and CI doesn't run tests at all (it only builds a
Docker image). Don't take this as license to skip tests on new logic — if you add critical
business logic, write a real Jasmine/Karma test (`HttpClientTestingModule` +
`HttpTestingController`, `{ next, error }` assertions) rather than another smoke test.

## Tooling

`npm run start-dev` (not plain `npm start`) if you hit heap OOM — this repo is large. Prettier
(`printWidth: 120`, single quotes, trailing commas) runs automatically pre-commit via
`simple-git-hooks` — don't fight it manually. TSLint (deprecated) still enforces `app-` component
selector prefixes and blocks `!` non-null assertions. New components generated with `ng g
component` are correctly NgModule-based with SCSS by default — don't pass `--standalone`.

## Known Anti-Patterns (don't replicate, fix if you're touching the file anyway)

- `GlobalErrorHandler` swallowing all prod errors — critical, fix if you touch this file.
- Double-subscription via `share()` + internal `.subscribe()` + `return` in service mutation
  methods — see the three files named above under HTTP & Services.
- Duplicate `ScrollToDirective` (`calculator/` vs `shared/`) and three duplicate confirmation
  dialogs (`generic2btn-dialog/`, `customers/confirmation-dialog/`, `calculator/confirm-dialog/`)
  — use the shared/canonical one, don't add a fourth.
- `@Inject(MAT_DIALOG_DATA) data: any` — always type it.
- `UntypedFormBuilder`/`UntypedFormGroup`, 3-argument `.subscribe(fn, fn, fn)`, old
  `NotificationService`, raw permission strings, `en-US`/`en-UK` locale — migrate when touched,
  don't extend.
- `wage-legacy` / `wage-legacy-2` — legacy payroll modules kept for backward compat, not a
  reference pattern for new payroll work.

For the exact code snippet behind any rule above, read the matching numbered section in
`CODE_PATTERNS.md` at the repo root.
