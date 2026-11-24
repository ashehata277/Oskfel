# Team time: frontend guide

## Terms used in this guide

| Term | Simple meaning | Example |
|---|---|---|
| Calendar day / day-only value / day label | A date without a time or timezone. It stays the same date wherever the user is. | Leave on `2026-07-06` means July 6 everywhere. |
| Instant / timestamp | One exact moment. Different countries can show different clock times for that same moment. | `2026-07-06T12:30:00Z` is `13:30` in London that day. |
| UTC / `Z` | The shared time reference used when sending and storing instants. `Z` at the end means UTC. | `12:30Z` means 12:30 UTC. |
| Team timezone / zone | The team's rules for local time, including clock changes. Use a zone name, not a fixed number of hours. | `Europe/London` is UTC+0 in winter and UTC+1 in summer. |
| Team time / team-local time / wall-clock time | The date and time someone in the team's zone reads on a clock. By itself, it does not include a UTC marker. | London `2026-07-06T13:30` corresponds to `12:30Z`. |
| Device timezone | The timezone of the user's computer or phone. Team dates must still follow the team's zone. | A user in New York viewing a London team's attendance. |
| Offset | The difference from UTC at a particular moment. It is not a complete timezone rule. | `+01:00` means one hour ahead of UTC. |
| `TeamDate` / `TZDate` | A date object that keeps an instant and a timezone, so reading its hours or day uses that zone. | The instant `12:30Z`, held in London's zone, returns hour `13` in July. |
| Plain `Date` | JavaScript's normal date object. It keeps an instant, but its local getters use the device timezone. | The same instant can return a different hour on a New York device. |
| Epoch | An instant represented as milliseconds since January 1, 1970 UTC. Changing its display zone must not change this number. | `date.getTime()` returns the epoch value. |
| ISO string / format | A standard text representation of a date or time. `yyyy-MM-dd` means four-digit year, two-digit month, and two-digit day. | `2026-07-06` is a day; `2026-07-06T12:30:00Z` is an instant. |
| API contract / legacy contract | What a particular API field is agreed to mean. Some older fields encode a day as UTC midnight. | An expiry day sent as `2026-07-06T00:00:00Z` can mean “July 6”, rather than an event at midnight. |
| Serialize / round trip | Serialize means turn a value into API text. A round trip means load it, then save it again. | Loading and saving an unchanged check-in must preserve the same UTC instant. |
| Inclusive / exclusive boundary | Inclusive includes the boundary; exclusive stops before it. `[from, to)` includes `from` but excludes `to`. | July 6's timestamp filter ends just before July 7 starts in team time. |
| Daylight-saving time / DST | A seasonal clock change. Some local times can be skipped or happen twice. | In London, `01:30` does not exist on March 29, 2026, and occurs twice on October 25, 2026. |
| Adapter | A helper that changes the representation for a UI library at its boundary. | Syncfusion receives device-local date fields representing the team's clock time. |

## Before you start

Use the helpers in `src/app/shared/time`. Show the selected team's time and formats, even when the user's device is in another country.

Examples below target Frontend. HandoverApp and InspectionsApp have similar helpers, but their settings loading, route guards, and adapter behavior must be checked separately before copying wiring.

## Choose the value type first

| Meaning | Keep in the app | Send to API |
|---|---|---|
| A real moment, such as check-in | `TeamDate` (`TZDate`) | UTC instant with `Z` |
| A calendar date, such as leave day | `yyyy-MM-dd` | Same day string |
| A deliberately zone-less team clock | Team-local input | Existing local-clock contract |
| Legacy calendar day encoded at UTC midnight | Day label | `dayToApi(day)` |

`TZDate` keeps the real instant and a zone. Its getters read team time. Do not shift timestamps manually.

## 1. Enable the shared UI

Import `TimeKitModule` where using its components and pipes.

```ts
import { TimeKitModule } from 'src/app/shared/time/time-kit.module';

@NgModule({ imports: [TimeKitModule] })
export class ReportsModule {}
```

Frontend already activates `TeamTimeService` in `app.config.ts` and registers `TeamFormatDateAdapter` with `TEAM_DATE_FORMATS`. Reuse that setup. A standalone component can import the shared standalone pipe directly.

## 2. Wait for a valid selected-team zone

Inject `TeamTimeService`. Check validity before building dates, running calculations, or saving team-time input.

```ts
import { TeamTimeService } from 'src/app/shared/time/settings/team-time.service';

private readonly teamTime = inject(TeamTimeService);

save(): void {
  if (!this.teamTime.hasTeamZone) {
    return;
  }
  this.saveRecord();
}
```

Show the existing settings/loading error state when unavailable. Loading completion is not proof of validity: the route guard can time out and settings requests can fail. Do not use a default zone as confirmed settings. Let existing team selection send `X-Selected-Team`; do not forge `Intowork.*` headers.

## 3. Read a UTC timestamp from the API

Convert timestamp fields at the model boundary.

```ts
import { teamDate } from 'src/app/shared/time/conversion/from-api';

this.checkedInAt = teamDate(dto.checkedInAt);
```

For London, `2026-07-06T12:30:00Z` displays as `13:30`. The epoch stays unchanged. `teamDate` expects an explicit `Z` or offset and can leave an invalid/markerless string unchanged; it is not input validation. Use `asTeamDate` when a valid, required `TeamDate` is needed, and reject invalid dates.

## 4. Save an instant

Use the shared serializer boundary.

```ts
import { utcDate } from 'src/app/shared/time/conversion/to-api';

const body = { checkedInAt: utcDate(this.checkedInAt) };
```

For a London `13:30` on July 6, JSON contains `2026-07-06T12:30:00.000Z`. Use `teamIso(value)` from `conversion/team-time-conversion` when an explicit ISO string is needed. An untouched timestamp must save as the same instant, including during an autumn clock overlap.

## 5. Read and save a calendar-only date

Keep a day as a day, without converting it through UTC or device time.

```ts
import { calendarDay } from 'src/app/shared/time/conversion/from-api';

this.leaveDay = calendarDay(dto.leaveDay);
const body = { leaveDay: this.leaveDay };
```

`2026-07-06` remains July 6 everywhere. Validate a null result before saving. `calendarDay` can also extract the UTC date fields from a legacy timestamp-shaped day label; use it only when the field's contract is a calendar day.

## 6. Support a legacy UTC-midnight day contract

Use `dayToApi` only where the API already expects a day encoded at UTC midnight.

```ts
import { dayToApi } from 'src/app/shared/time/conversion/to-api';

const body = { expiryDate: dayToApi('2026-07-06') };
```

The result is `2026-07-06T00:00:00.000Z`. This is a day label, not London's midnight instant. For a picker needing a date object, `asTeamDay(dto.expiryDate)` preserves the label and constructs team midnight.

## 7. Use an instant date/time field

The shared field creates a team-aware date and shows the zone badge.

```html
<app-date-time-field
  mode="dateTime"
  valueAs="date"
  [(ngModel)]="appointmentAt"
  [required]="true">
</app-date-time-field>
```

Load with `asTeamDate(dto.appointmentAt)` and save with `utcDate(appointmentAt)`. Preserve the screen's label, validation, min/max bounds, readonly state, and input ID.

## 8. Use a day-only field

Choose `valueAs="day"` for a calendar date.

```html
<app-date-time-field
  mode="date"
  valueAs="day"
  [(ngModel)]="leaveDay">
</app-date-time-field>
```

The control returns `2026-07-06`. Send that string for a day-only contract, or use `dayToApi` for an existing legacy UTC-midnight day contract. A native date input does not provide the same team formatting and badge.

## 9. Use a local-clock contract

Use this only when the API intentionally accepts clock fields without a timezone.

```html
<app-date-time-field
  mode="dateTime"
  valueAs="localDateTime"
  [(ngModel)]="openingTime">
</app-date-time-field>
```

The control returns a value such as `2026-07-06T13:30`. Load local-clock input through `asLocalDateTime`. Do not send this markerless value to a field expecting a UTC instant; use case 7 instead.

## 10. Load a reactive form without triggering edits

Convert each field according to its meaning, then suppress programmatic change events if the screen requires that.

```ts
this.form.patchValue({
  appointmentAt: asTeamDate(dto.appointmentAt),
  leaveDay: calendarDay(dto.leaveDay),
  openingTime: asLocalDateTime(dto.openingTime),
}, { emitEvent: false });
```

These helpers come from `conversion/from-api`. Handle absent/invalid values before applying required fields. Do not parse all fields as timestamps.

## 11. Show a timestamp or calendar date

Use the shared pipe/component so the team format is applied.

```html
{{ checkedInAt | teamDate:'dateTime' }}
<app-date-time [value]="leaveDay" kind="calendar" format="date"></app-date-time>
```

Common format names are `date`, `time`, `dateTime`, `dateTimeSeconds`, and `weekdayDate`. Prefer those to fixed patterns. Do not use Angular's `date` pipe or device `toLocale*` methods for team dates.

## 12. Put a date in a translated sentence

Pass date values to the shared message component instead of joining text and formatted dates.

```html
<app-date-time-message
  key="attendance.checkedInAt"
  [dates]="{ at: { value: checkedInAt, format: 'dateTime' } }">
</app-date-time-message>
```

Example translation value: `Checked in at {{at}}`. Use the actual translation key and placeholder name for the screen.

## 13. Format text in code, exports, PDF, toasts, and history

Inject `TeamDateFormatter` and use the field's meaning.

```ts
import { TeamDateFormatter } from 'src/app/shared/time/display/team-date-formatter.service';

private readonly dateFormatter = inject(TeamDateFormatter);

const checkedInText = this.dateFormatter.format(checkedInAt, 'dateTime');
const leaveText = this.dateFormatter.formatDay(leaveDay, 'date');
```

Apply the same rule to grid callbacks, read-only answers, audit old/new values, downloads, and permission-gated screens. Rebuild cached text after zone or format changes. `dateFormatter.pattern('date')` provides a team pattern for placeholders/masks.

## 14. Calculate “now”, “today”, overdue, or tomorrow

Use shared team helpers rather than the device clock's calendar fields.

```ts
import { teamNow, teamDayText, isTeamToday, isTeamPast }
  from 'src/app/shared/time/conversion/team-time-conversion';

const today = teamDayText(teamNow());
const isToday = isTeamToday(checkedInAt);
const overdue = isTeamPast(deadlineAt);
```

Use `isTeamTomorrow`, `isTeamDayBeforeToday`, and `isTeamFuture` for the corresponding rules. Day comparisons and instant comparisons have different meanings.

## 15. Create, copy, and move team dates

Use shared constructors and date-fns calendar arithmetic.

```ts
import { addDays } from 'date-fns';
import { teamDateFrom, cloneTeamDate } from 'src/app/shared/time/conversion/from-api';

const start = teamDateFrom(2026, 6, 6, 13, 30);
const copy = cloneTeamDate(start);
const tomorrow = addDays(start, 1);
```

Months are zero-based: `6` means July. `cloneTeamDate` preserves a `TZDate`; it does not turn an existing plain Date into a team date. Do not copy with `new Date(teamDate)` or add 86,400,000 milliseconds to mean “next day”.

## 16. Filter a report by selected days

Send day labels to an endpoint that resolves the team's UTC boundaries on the backend.

```ts
const params = { firstDay: '2026-07-01', lastDay: '2026-07-31' };
```

This is an illustrative contract: preserve the actual endpoint's parameter names and meaning. The backend uses `DaysRangeUtc` and queries `[from, to)`. Do not use `dayToApi` as a substitute for a team's midnight boundary. This applies to attendance, worker reports, dashboards, and exports that query real timestamps.

## 17. Bind Syncfusion calendars, schedules, or Gantt

These components read device-local Date fields. Adapt only at their boundary and clone item objects because `withSyncfusionFields` mutates them.

```ts
import { withSyncfusionFields } from 'src/app/shared/time/conversion/from-api';

this.events = withSyncfusionFields(
  records.map(record => ({ ...record })),
  'StartTime',
  'EndTime',
);
```

The source fields must already be team-aware dates. For a single binding use `[selectedDate]="currentDate | toSyncfusion"`. Do not pass a `TeamDate` directly to a device-zone component. Shared grid date adapters should be reused for date/dateTime columns and exports.

## 18. Read a dragged or edited Syncfusion value

Convert the returned device-wall-clock fields back into a team date before serialization.

```ts
const body = {
  startUtc: utcDate(asTeamDate(args.data.StartTime)),
  endUtc: utcDate(asTeamDate(args.data.EndTime)),
};
```

Import `asTeamDate` from `conversion/from-api` and `utcDate` from `conversion/to-api`. The plain-Date warning is expected at this library boundary; plain Dates elsewhere should be investigated.

## 19. Display inclusive all-day records

Our inclusive business end day needs the last moment of that day at the existing Syncfusion boundary; its all-day end behavior treats midnight as exclusive.

```ts
const start = asTeamDay('2026-07-06');
const endDay = asTeamDay('2026-07-08');
const end = teamDateFrom(
  endDay.getFullYear(), endDay.getMonth(), endDay.getDate(), 23, 59, 59, 999,
);
const events = withSyncfusionFields(
  [{ StartTime: start, EndTime: end, IsAllDay: true }],
  'StartTime', 'EndTime',
);
```

This displays July 6–8. When reading an edited end back, use `teamDayText(asTeamDate(value))`; do not subtract a day. Timed/half-day records retain real instants. This UI adaptation is not the backend report-query rule: timestamp queries still use an exclusive next-day boundary.

## 20. Handle changed settings or a team switch

An existing `TZDate` retains its original zone. Re-zone the same epoch when retaining an instant across settings changes.

```ts
import { teamDateAt } from 'src/app/shared/time/core/time-core';

this.appointmentAt = teamDateAt(this.appointmentAt.getTime(), this.teamTime.zone);
```

Run this in the screen's existing valid-settings change flow. Refetch team-owned records when the selected team changes. Rebuild formatted labels, grid/schedule data, and exports when zone/date/time formats change. A pure pipe with the same input reference may not rerun. Never restore another team's settings cache as the new team's settings.

## 21. Handle daylight-saving input

Use the shared constructors and fields so frontend and backend agree.

```ts
const entered = teamDateFrom(2026, 2, 29, 1, 30);
const saved = utcDate(entered);
```

For London, the missing `2026-03-29 01:30` advances in 30-minute steps to `02:00`, saving `01:00Z`. The repeated `2026-10-25 01:30` chooses `00:30Z`. For a custom input that must warn about this, use the shared `resolveTeamClockTime` result (`normal`, `skipped`, or `repeated`) rather than inventing another conversion. Preserve the original instant when an existing value is unchanged.

## 22. Check a change

Example manual check: set the device zone to New York and the team to London. Load `2026-07-06T12:30:00Z`: it must show `13:30`, and saving unchanged must send the same UTC instant.

Also check a day near midnight, a calendar-only date, spring/autumn clock changes, slow/failed settings, switching teams, and format-only changes. Compare screen, filter results, exported text, and saved payload. For code changes, run `npm run check:dates` and relevant shared-time Jasmine/Karma specs; the date baseline alone does not prove correctness.

## Source reference

[Shared helpers](../Frontend/src/app/shared/time) · [Settings service](../Frontend/src/app/shared/time/settings/team-time.service.ts) · [Backend guide](team-time-backend-guide.md)

These are usage rules, not a claim that every existing screen or report has already migrated.
