---
name: toast-notifications
description: >
  How to show user-facing toasts in the Baton Angular app. Use whenever saving, deleting,
  failing an HTTP call, blocking a permission, confirming success, showing a warning, or
  adding any snackbar/toast/toaster/notify call. Also trigger on ToastService, showSuccess,
  showError, showWarning, showInfo, showProcessing, NotificationService, MatSnackBar,
  notify.error, notify.success, or "toaster".
---

# Toast notifications (Baton app)

New code uses **`ToastService`** (`src/app/shared/toast.service.ts`). The host
`<app-toast-container>` is already on `app.component.ts` — do not add another container.

`NotificationService` (`src/app/helpers/notification.service.ts`, MatSnackBar) is **legacy**.
Do not use it in new code. When you touch a file that still calls `this.notify.success/error`,
switch that call to `ToastService`.

## Inject

```ts
import { ToastService } from 'src/app/shared/toast.service';

constructor(private toastService: ToastService) {}
```

`this.toast` is also used in a few modules — prefer `toastService` in new files.

## API

Every show method takes **title then message** (both strings). Most auto-hide after 5s.

| Method                                   | When                                                          | Auto-hide                          |
| ---------------------------------------- | ------------------------------------------------------------- | ---------------------------------- |
| `showSuccess(title, message)`            | Save/create/update/delete succeeded                           | yes                                |
| `showError(title, message)`              | Permission denied, HTTP failure, validation the user must see | yes                                |
| `showWarning(title, message, autoHide?)` | Recoverable caution                                           | yes (pass `false` to keep)         |
| `showInfo(title, message)`               | Neutral status                                                | yes                                |
| `showProcessing(title, message)`         | Long-running work                                             | **no** — call `hide(id)` when done |
| `hide(id)`                               | Dismiss a processing/warning toast                            | —                                  |

```ts
this.service.save().subscribe({
  next: (record) => this.toastService.showSuccess('Saved', record.name),
  error: (err) => this.toastService.showError('Save failed', err?.message ?? 'Please try again'),
});
```

Permission block (no dialog):

```ts
this.toastService.showError('Permission denied', 'You do not have permission to change the tenant plan.');
```

Processing:

```ts
const id = this.toastService.showProcessing('Exporting', 'Building the file…');
this.export().subscribe({
  next: () => {
    this.toastService.hide(id);
    this.toastService.showSuccess('Export ready', 'Your file is downloading');
  },
  error: () => {
    this.toastService.hide(id);
    this.toastService.showError('Export failed', 'Could not build the file');
  },
});
```

## Copy

- Prefer `this.translate.instant('feature.key')` for new user-facing strings and add the key to
  `src/i18n/en-GB.json` in the same change (`toast.save-success` style is fine).
- Title is short (what happened). Message is the detail. Do not pass an empty message.
- Do not toast raw HTTP error objects; use `err?.message` or a translated fallback.

## Do not

- `NotificationService` / `MatSnackBar` / `this.notify.error` in new code
- `window.alert`, `window.confirm` for success/error feedback
- `console.error` as the only user signal
- Rely on `GlobalErrorHandler` — it swallows errors in production. Catch expected failures
  and `showError` yourself
- Add a second `<app-toast-container>`
