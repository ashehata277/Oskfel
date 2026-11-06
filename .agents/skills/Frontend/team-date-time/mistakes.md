# Common date mistakes and how to fix them

Each entry shows the wrong code, why it is wrong, and the fix. The rules behind them are in `SKILL.md`. Where a real
example is still in the codebase, its location is given so it can be fixed the next time someone touches that file.

The short version: **the device zone is never the team zone.** Most of these mistakes look correct on a London laptop
with a London team. They only go wrong for someone abroad, around a daylight-saving change, or near midnight. To see
them, set Chrome DevTools → Sensors → Timezone ID to `America/New_York`.

---

## 1. Using `new Date()` or `Date.now()` as "now" or "today"

```ts
const today = new Date();
today.setHours(0, 0, 0, 0);
```

**Why it is wrong:** this gives midnight on the **device's** day. Between 19:00 and 24:00 in New York, the team in
London is already on the next day.

```ts
const today = startOfDay(teamNow());
if (isTeamToday(record.date)) { … }
```

`setHours(0, 0, 0, 0)` is fine on a `TeamDate` (for example `teamNow()` in `create-active-work-dialog.component.ts:529`),
because a `TZDate` sets the hours in the team zone. On a plain `Date` it is wrong.

✅ **Allowed:** measuring elapsed time, such as `Date.now() - instant.getTime()` in `time-ago.pipe.ts` or the "hours
since closed" banner timer. That uses no zone.

---

## 2. Copying a team date with `new Date(x)`

```ts
const baseDate = new Date(startDate);
```

**Why it is wrong:** the instant stays the same but the zone is lost. The copy is a plain `Date`, so `getDate()` and
`getHours()` now answer in the device zone, and `utcDate` / `asTeamDate` will log the plain-Date warning.

```ts
const baseDate = cloneTeamDate(startDate);
```

`cloneTeamDate` takes a `Date`. For a string or a number, use `asTeamDate(x)`.

📍 Still in the code: `create-active-work-dialog.component.ts:778` and `:2067`, and many more counted by
`npm run check:dates`.

---

## 3. Building a date from parts with `new Date(y, m, d)`

```ts
const firstOfMonth = new Date(year, month, 1);
```

**Why it is wrong:** this is midnight in the **device** zone. For a London team on a New York device, it is 05:00
London time, and the date can be a day off.

```ts
const firstOfMonth = teamDateFrom(year, month, 1);
const lastOfMonth = teamDateFrom(year, month + 1, 0);
```

---

## 4. Moving a date by adding milliseconds

```ts
const dayDeltaMs = newStart.getTime() - originalStart.getTime();
date: new Date(new Date(sda.date).getTime() + dayDeltaMs);
```

**Why it is wrong:** a day is not always 24 hours. A day with a clock change is 23 or 25 hours, so a shift across
the end of March or October moves every date by one hour, and a midnight date lands on 23:00 the day before. It also
breaks the zone (mistake 2).

```ts
const dayDelta = differenceInCalendarDays(newStart, originalStart);
date: addDays(asTeamDate(sda.date), dayDelta);
```

📍 Still in the code: `src/app/shared/active-work/create-activework.service.ts:174-195`.

✅ **Allowed:** `quotation-detail-overview-tab.component.ts:836` divides by `24 * 60 * 60 * 1000`, but it first
snaps both sides to team midnight and then uses `Math.round`, so an hour gained or lost does not matter.
`differenceInCalendarDays` would be clearer, though.

---

## 5. Using Angular's `| date` pipe or `DatePipe`

```html
date: (element.date | date: 'yyyy-MM-dd') [max]="today | date: 'yyyy-MM-dd'"
```

```ts
return this.datePipe.transform(date, 'E dd MMM, HH:mm');
```

**Why it is wrong:** Angular's `DatePipe` formats in the **browser** zone and ignores the team's date and time
format.

```html
{{ element.date | teamDate:'date' }}
```

```ts
date: teamDayText(element.date);
max: teamDayText(this.today);
return this.dateFormatter.format(date, 'E dd MMM, HH:mm');
```

For a `yyyy-MM-dd` value used as a query param or an `<input type="date">` bound, use `teamDayText(x)`. It is not
for display.

📍 Still in the code:

- `daily-summary.component.html:27`, `daily-variations-transactions-summary.component.html:28` and `:48`, and
  `handover-value-details-dialog.component.html:23` and `:37`
- `report-filter-bar.component.html:46` and `:56`, and `new-member.component.html:158`
- `gantt-chart.component.ts:528`

---

## 6. Using `toLocaleDateString('en-GB', …)` to show a date

```ts
const when = expiry.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
```

**Why it is wrong:**

- On a plain `Date`, it formats in the device zone.
- On a `TZDate`, the zone is correct, but it is fixed to British English and ignores both the team's date format and
  the user's language. A Norwegian user still sees `"12 Oct 2026"`.

```ts
const when = this.dateFormatter.format(expiry, 'dateMedium');
```

Or, in a template, use `{{ expiry | teamDate:'dateMedium' }}`. Pick a named format (`date`, `dateMedium`,
`dateLong`, `dayMonth`, `monthYear`, …) before writing a raw pattern.

📍 Still in the code: `resources/workforce.ts:381`, `staff-wallchart.component.ts:2109`,
`cm-tool-grid.model.ts:97`, `takeoff/quote-import-files.ts:104`, `yard-tonnage.component.ts:210`,
`materials-movement-chart.component.ts:187`.

---

## 7. Reading a day-only value with `new Date('2026-07-06')`

```ts
const day = new Date(data.firstDay);
```

**Why it is wrong:** JavaScript reads a bare `yyyy-MM-dd` as **UTC** midnight. In any zone west of UTC, that is the
evening of the day before. (A `yyyy-MM-ddTHH:mm` string, by contrast, is read as **device** local time, which is
just as wrong.)

```ts
const day = asTeamDay(data.firstDay);
```

Better still, keep the string. Two `yyyy-MM-dd` strings compare correctly with `<` and `>=`:

```ts
const from =
  data.dateRange.firstDay >= data.projectRange.firstDay ? data.dateRange.firstDay : data.projectRange.firstDay;
```

📍 Still in the code: `add-edit-external-money.component.ts:22` and `:88`, and the matching lines in
`add-edit-external-valuation.component.ts`. Line 88 also compares a raw `new Date(control.value)` with a normalised
min and max, so the two sides of the check are not in the same zone.

---

## 8. Reading an API date in a model without converting it

```ts
this.opDate = data.opDate;
this.opDate = new Date(data.opDate);
```

**Why it is wrong:** the first leaves a string where the type says `Date`. The second makes a plain `Date` that reads
in the device zone.

```ts
this.opDate = teamDate(data.opDate);
```

If the API sends a zone-less clock-time string such as `2026-07-06T13:30:00`, `teamDate` will **not** accept it. It
leaves the string as it is and logs a warning. Use `asLocalDateTime(data.x)`, or better, get the API fixed to send
`Z`.

---

## 9. Sending a date to the API without `utcDate`

```ts
this.http.post(url, { ...form.value, startDate: form.value.startDate });
const body = { date: someDate.toISOString().split('T')[0] };
```

**Why it is wrong:**

- A plain `Date` serialises its instant. If it was built in the device zone (mistakes 1 to 3), that instant is wrong.
- Cutting the day out of `toISOString()` gives the **UTC** day, not the team's day. Just after midnight in London
  during summer time, that is yesterday.

```ts
this.http.post(url, { ...form.value, startDate: utcDate(form.value.startDate) });
const body = { date: teamDayText(someDate) };
```

Use `utcDate` for instant fields, `teamDayText` for day-only fields, and `teamIso` when you need the string yourself.

---

## 10. Passing a `TeamDate` straight into Syncfusion

```html
<ejs-schedule [selectedDate]="currentDate" [eventSettings]="{ dataSource: events }"></ejs-schedule>
```

**Why it is wrong:** Syncfusion reads `getHours()` / `getDate()` in the device zone through `Date.prototype`. A
London 09:00 shift appears at 04:00 on a New York device.

```html
<ejs-schedule
  [selectedDate]="currentDate | toSyncfusion"
  [eventSettings]="{ dataSource: syncfusionEvents }"
></ejs-schedule>
```

```ts
this.syncfusionEvents = withSyncfusionFields([...events], 'StartTime', 'EndTime');
onDragStop(args) { const start = asTeamDate(args.data.StartTime); … }
```

`withSyncfusionFields` changes the objects **in place**, so spread a copy first if the originals are used elsewhere.

---

## 11. Hard-coding a zone or a format

```ts
formatInTimeZone(date, 'Europe/London', 'dd/MM/yyyy');
```

**Why it is wrong:** every team has its own zone, date format and time format, set in Team Settings.

```ts
this.dateFormatter.format(date, 'date');
this.teamTime.zone;
```

✅ **Allowed:** `team-time-settings.component.ts:16` lists `Europe/London` as one of the zones a user can **choose**.
That is a list of options, not a default.

---

## 12. Passing a plain `Date` to the conversion helpers

```ts
const picked = new Date(this.form.value.start);
this.save({ start: utcDate(picked) });
```

**Why it is wrong:** when `toUtcDate` / `asTeamDate` receive a plain `Date`, they read its **device-local** fields as
the team's wall clock. The console then shows
`toUtcDate: a plain Date was read as team clock time. Use asTeamDate() at …`.

```ts
this.save({ start: utcDate(this.form.value.start) });
```

If the value came from `<app-date-time-field>` or a `mat-datepicker`, it is already a `TeamDate`, so do not wrap it.
The warning is expected only where a date comes back from Syncfusion (mistake 10).

---

## 13. Writing a second date helper

```ts
function isSameTeamDay(a: Date, b: Date) { … }
private formatDate(d: Date) { return format(d, 'dd/MM/yyyy'); }
```

**Why it is wrong:** `CLAUDE.md`, "one derivation, everywhere". Two copies of a date rule drift apart, and when they
disagree, nobody can tell which screen is right.

Look in `src/app/shared/time/` first (`isTeamToday`, `teamDayText`, `TeamDateFormatter`, …). If what you need is
missing, add it there once, and copy the change to `HandoverApp` and `InspectionsApp`.

---

## Checklist before committing date code

- [ ] No new `new Date(` outside `shared/time`. `npm run check:dates` passes.
- [ ] No `| date`, `DatePipe`, `toLocaleDateString` / `toLocaleTimeString` on team data.
- [ ] "Now" and "today" come from `teamNow()` and the `isTeam*` helpers.
- [ ] Dates move with `addDays` / `addMonths`, not by adding milliseconds.
- [ ] Request bodies use `utcDate` / `teamDayText` / `teamIso`.
- [ ] Syncfusion bindings use `| toSyncfusion` / `withSyncfusionFields`, and read back with `asTeamDate`.
- [ ] Checked once with the device zone set to `America/New_York` and a London team.
