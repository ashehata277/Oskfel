# Team Time Zone Test Cases

*Business scenarios and expected outcomes for Baton*

Version 1  |  9 November 2026  |  68 test cases

The scenarios below cover the affected business areas. The goal is to prove that each team sees the correct working day and time, regardless of where a user or the system is located.

## What customers should experience

A team time zone controls the team’s working day. A person using a laptop in another country should still see the same team schedule. A date selected on a calendar, such as an assignment day or holiday, must stay on that date. An event, such as clocking in or approving work, must keep its actual moment and display the correct team time.

## Business examples and shared rules

Use examples with staff, customers, projects, assignments, materials and forms. Include administrators, supervisors, workers and customer portal users where the business workflow applies.

| **Team zone** | **Why it is needed** |
| --- | --- |
| UTC | Control team with no time difference |
| Europe/London | Existing behaviour and seasonal clock changes |
| America/Toronto | Working day behind UTC and next-day reminders |
| America/Los_Angeles | Assignment dates and Gaffer schedules |
| Asia/Tokyo | Working day ahead of UTC and daily wages |
| Asia/Kolkata | Half hour difference and daily wages |
| Pacific/Auckland | Large difference and seasonal clock changes |

For the main checks, use a device in a different zone from the selected team. Repeat selected checks with two users in different countries. Include the web app, Handover app, Inspections app, customer portal and downloaded reports wherever the workflow is available.

## Records to prepare

Prepare an ordinary day, a month end, a year end and a leap day. For event filters, prepare records at 23:59 on the previous team day, 00:00, midday, 23:59 and 00:00 on the next team day. Give each record a clear name so it can be recognised on screen.

Prepare a normal 08:00 to 16:00 shift with a day rate of 160, no unpaid break, no overtime and no deductions. Prepare an overnight shift from 22:00 to 06:00. For leave, assignments, valuation dates and holidays, write down the exact selected calendar date before saving.

## How to judge dates and times

For a single day event filter, include events from the start of that team day up to, but excluding, the next day. A date only value stays on the selected date. An event time represents the same real moment across screens. Use the configured team date and time format, rather than assuming day first or a 24 hour clock.

Clock change tests: in London, 29 March 2026 has 23 hours and 25 October 2026 has 25 hours. In Toronto, use 8 March and 1 November 2026. Include two separate events during the repeated hour.

Overnight attendance, pay during seasonal clock changes, and historical payroll follow the organisation’s existing business rules. Where those rules differ between customers, the expected amounts and day allocation depend on the customer’s policy.

## Team settings and access

Use the example below. Repeat common scenarios for teams ahead of and behind UTC, such as Tokyo and Toronto.

### TZ01  Team zone survives saving and signing in

**Example:** Administrator account and Tokyo team.

**Steps:** Save Tokyo as the team zone. Sign out, sign in, and open settings and today’s work.

**Expected:** Tokyo remains selected and today follows Tokyo’s calendar day.

### TZ02  Device location does not change the team day

**Example:** Tokyo team; devices set to London and Los Angeles.

**Steps:** Two users open the same schedule and record at the same moment. Refresh both screens.

**Expected:** Both see the same team day, assignment dates and team event times.

### TZ03  Switching teams does not carry the previous zone

**Example:** Access to Toronto and Tokyo teams; use a moment when their dates differ.

**Steps:** Open Toronto, switch to Tokyo, then return. Compare work lists, today and timestamps.

**Expected:** Each screen uses its selected team. No records or time settings leak between teams.

### TZ04  Formats and permitted settings

**Example:** Administrator and worker accounts.

**Steps:** Set day first and month first formats in turn, then 12 and 24 hour time. Reopen a saved record. Attempt a settings change as a worker.

**Expected:** Display follows the selected format without changing the date or event. Only an authorised role can change team settings.

## Date filters and list screens

Use the example below. Repeat common scenarios for teams ahead of and behind UTC, such as Tokyo and Toronto.

### TZ05  One day includes the complete team day

**Example:** Boundary event records from the “Records to prepare” section in Toronto and Tokyo.

**Steps:** Filter one day on each available list containing event dates. Compare the named records.

**Expected:** 00:00 through 23:59 are included. Previous day 23:59 and next day 00:00 are excluded.

### TZ06  All date comparison options

**Example:** Boundary records and a dated record before and after the chosen day.

**Steps:** Use equals, not equals, before, after and between where offered. Write the expected record names before running each filter.

**Expected:** Returned names match the selected team date and the operator shown. No record changes day because of the device zone.

### TZ07  Sorting paging and exporting filtered records

**Example:** Enough boundary records for at least two result pages.

**Steps:** Apply a date filter, sort ascending then descending, change pages, and export if available.

**Expected:** Order is chronological. No records disappear or repeat across pages. Export contains the same filtered records and dates.

### TZ08  Month year and leap day boundaries

**Example:** Records on 31 December, 1 January and 29 February 2028.

**Steps:** Filter each day separately, then a period crossing the boundary. Clear the filter and repeat.

**Expected:** All expected records appear once. Leap day is selectable. The period includes the displayed start and end dates according to the screen’s labels.

## Work planning and assignments

Use the example below. Repeat common scenarios for teams ahead of and behind UTC, such as Tokyo and Toronto.

### TZ09  Assignment stays on its selected date

**Example:** Los Angeles team; a worker available on 4 November 2026.

**Steps:** Assign the worker to 4 November. Save, refresh, reopen and view the same assignment on another device.

**Expected:** Assignment stays on 4 November in all views; it never moves to 3 November.

### TZ10  Move copy and remove an assignment

**Example:** Existing assignment with a worker and vehicle.

**Steps:** Move it to the next day, copy it to another day, remove the copy and reopen the plan.

**Expected:** Only selected days change. Worker and vehicle follow the intended assignment with no extra or missing booking.

### TZ11  Daily weekly and related work views agree

**Example:** Work with linked records, an incomplete item and an overnight activity.

**Steps:** Compare daily and weekly planning with staff period, linked work and incomplete work lists for the same dates.

**Expected:** Each view follows its stated date rule and shows the intended work once. A selected assignment day remains unchanged.

### TZ12  Day boundaries do not lose assignments

**Example:** Assignments on consecutive days in Tokyo and Toronto.

**Steps:** View one day, then the next, then both together. Complete one assignment and reopen all views.

**Expected:** No assignment is lost or duplicated at midnight; completion updates the correct assignment and day.

## Assignment messages and scheduled reminders

Use the example below. Repeat common scenarios for teams ahead of and behind UTC, such as Tokyo and Toronto.

### TZ13  New assignment message shows the selected day

**Example:** Toronto team; test worker email address.

**Steps:** Assign the worker to 9 July 2026 and trigger the normal assignment notification. Open the message and its work link.

**Expected:** Message says 9 July and the link opens that assignment. The day is not changed to 8 July.

### TZ14  Tomorrow reminder uses the assignment calendar date

**Example:** Toronto team; assignments on 8, 9 and 10 July 2026. The team’s current day is 8 July.

**Steps:** Check the tomorrow reminder received by each worker and open the linked assignment.

**Expected:** Only the 9 July assignments are selected, and every intended worker receives the correct 9 July reminder.

### TZ15  Reminder schedule follows each team

**Example:** London and Tokyo teams; agreed reminder delivery time and test recipients.

**Steps:** Check when workers in each team receive their reminders and compare the dates in the messages.

**Expected:** Each reminder follows its own team’s intended local schedule and tomorrow date; another team’s zone is never reused.

### TZ16  Reminders after an assignment changes

**Example:** A future assignment with a reminder ready to run.

**Steps:** Remove or reschedule the assignment before its reminder is due. Check any subsequent reminders received by the worker.

**Expected:** The reminder reflects the current assignment date. Removed assignments do not produce misleading reminders, and workers do not receive unintended duplicate messages.

## Attendance and shifts

Use the example below. Repeat common scenarios for teams ahead of and behind UTC, such as Tokyo and Toronto.

### TZ17  Normal clock in and clock out

**Example:** Tokyo team; shift 08:00 to 16:00 with no break.

**Steps:** Clock in and out using prepared test times. Open worker attendance, supervisor view and the daily summary.

**Expected:** All views show 08:00 to 16:00 on the team day and 8 elapsed hours.

### TZ18  Overnight attendance keeps the actual duration

**Example:** Toronto team; shift 22:00 to 06:00 the next day.

**Steps:** Clock in, cross midnight, clock out and inspect both days and the period summary.

**Expected:** The record keeps both correct dates and 8 elapsed hours. Daily allocation follows the agreed overnight shift rule without duplication.

### TZ19  Supervisor and bulk attendance

**Example:** At least three workers; one already clocked in.

**Steps:** Use supervisor clock in and clock out, then the bulk actions. Repeat an action and refresh.

**Expected:** Correct workers are updated at the intended team time. Existing validation and duplicate prevention still apply.

### TZ20  Corrections and history

**Example:** Completed shift and permission to amend it.

**Steps:** Correct a time across team midnight, save, reopen and inspect history and totals.

**Expected:** The intended event is corrected. Duration and affected summaries update; history keeps the actual correction time and original ordering.

## Wages and pay periods

Use the example below. Repeat common scenarios for teams ahead of and behind UTC, such as Tokyo and Toronto.

### TZ21  Standard daily wage in control zones

**Example:** 160 day rate; 08:00 to 16:00, no breaks or deductions. UTC, London and Toronto teams.

**Steps:** Calculate the wage for each identical full shift. Open the wage detail and any bonus allocation based on the standard wage.

**Expected:** The standard wage is 160 in each team. Zone alone does not change the agreed full day value.

### TZ22  Full day wage in Tokyo and Kolkata

**Example:** Same 160 full day setup as TZ21; Tokyo and Kolkata teams.

**Steps:** Calculate 08:00 to 16:00 wages in each team, including recalculation and applicable bonus allocation.

**Expected:** Standard wage is 160 in both teams, with correct bonus allocation. The same full shift must receive the same agreed daily pay regardless of the team’s time zone.

### TZ23  Pay period edges and project totals

**Example:** Shifts immediately before, within and after a pay week and month end.

**Steps:** Open worker wages, team wages, project wages and ranged daily totals for exactly that period.

**Expected:** Each eligible wage is counted once in the correct period. Worker, team, project and exported totals reconcile under the same rules.

### TZ24  Override rebuild and partial shift

**Example:** An approved partial shift, a wage override and an existing saved pay week.

**Steps:** Record the expected values under the pay rules. Override a wage, recalculate another, rebuild attendance where supported and reopen the week.

**Expected:** Values match the approved rules. Recalculation keeps the intended day and does not silently remove an override or change a completed period.

## Clock changes and unusual local times

Use the example below. Repeat common scenarios for teams ahead of and behind UTC, such as Tokyo and Toronto.

### TZ25  Short clock change day includes all events

**Example:** London events on 29 March 2026 before and after the missing hour.

**Steps:** Filter that day in attendance, work and reports. Review each event’s order and actual duration.

**Expected:** All events belonging to that local day appear once. No extra hour is invented; elapsed duration follows actual time.

### TZ26  Repeated hour is kept twice when it happened twice

**Example:** London on 25 October 2026; two separate events at local 01:30.

**Steps:** Open history, filter that day and calculate elapsed duration across both occurrences.

**Expected:** Both distinct events remain visible and ordered correctly. Neither is overwritten or counted as an accidental duplicate.

### TZ27  Other regions use their own clock change dates

**Example:** Toronto test days 8 March and 1 November 2026; Tokyo control team.

**Steps:** Repeat the day filter and shift duration checks on those dates, then compare Tokyo.

**Expected:** Toronto follows its own clock change. Tokyo has no seasonal hour change. London’s dates are not applied to other teams.

### TZ28  Invalid or ambiguous manually entered time

**Example:** Editable time field; business owner’s approved validation rule.

**Steps:** Enter a nonexistent London 01:30 on 29 March 2026, then ambiguous 01:30 on 25 October.

**Expected:** The app rejects or resolves the entry according to the approved rule with a clear outcome. It must not silently save an unintended moment.

## Staff resources leave and holidays

Use the example below. Repeat common scenarios for teams ahead of and behind UTC, such as Tokyo and Toronto.

### TZ29  Leave dates stay on the selected days

**Example:** Tokyo and Los Angeles teams; worker with no existing leave.

**Steps:** Book leave for 4 to 6 November. Approve where required, reopen and compare staff overview and planner.

**Expected:** Leave remains on 4 to 6 November in every view and affects only the intended days.

### TZ30  Availability at the period boundary

**Example:** Worker with leave ending before a selected period and another starting on its final day.

**Steps:** Open staff availability and overview for that period; attempt assignments on adjacent days.

**Expected:** Availability follows the leave calendar dates and the existing overlap rules without an extra blocked or available day.

### TZ31  Future bank holidays and today

**Example:** Team with a configured holiday calendar; yesterday, today and future holiday records.

**Steps:** Open future holidays just before and after team midnight. Compare the selected calendar and planner.

**Expected:** Today and future are judged using the team day. Holiday dates and the configured jurisdiction stay correct.

### TZ32  Staff lifecycle and history

**Example:** Staff member with permission to edit and archive.

**Steps:** Create, update, archive and reopen staff details and history from a device in another zone.

**Expected:** Changes persist, event times display correctly and history remains ordered. Archive status and access behave as before.

## Projects quotations and valuations

Use the example below. Repeat common scenarios for teams ahead of and behind UTC, such as Tokyo and Toronto.

### TZ33  Project and quotation dates

**Example:** A project with quotation, notes and target dates.

**Steps:** Create and edit the records around team midnight. Reopen details and available document output.

**Expected:** Selected target dates stay fixed. Creation and edit times show the correct team time and chronological order.

### TZ34  Valuation today and past status

**Example:** Tokyo team at a moment when London is still on the previous day; valuations yesterday, today and tomorrow.

**Steps:** Open valuation lists and details. Trigger the supported date regeneration action.

**Expected:** Yesterday and today are treated as past or due according to the screen’s rule; tomorrow remains future. Generated dates follow the intended team calendar.

### TZ35  Receipts and monthly summaries

**Example:** Receipts on both sides of team month end.

**Steps:** Add, amend and delete test receipts. Compare valuation detail, monthly totals and reporting.

**Expected:** The intended receipts change once, audit times remain correct and each receipt contributes to the proper displayed period.

### TZ36  Publishing and customer view

**Example:** Quotation or job ready to publish; test customer account.

**Steps:** Publish or send using the normal workflow, then open it as the customer and download its document.

**Expected:** Customer receives the intended version. Business dates agree across internal view, portal and document; sending time represents the same moment.

## Handover workflows and documents

Use the example below. Repeat common scenarios for teams ahead of and behind UTC, such as Tokyo and Toronto.

### TZ37  Create and approve a handover

**Example:** Tokyo team; work ready for handover and an authorised approver.

**Steps:** Create the handover near team midnight, approve it and open the detail and approval history.

**Expected:** Correct work and valuation are used. Selected work dates stay fixed; creation and approval show the correct team date and time.

### TZ38  Bulk and internal handovers

**Example:** Several eligible work items across consecutive team days.

**Steps:** Create an internal bulk handover for one chosen period. Compare included work and quantities with source records.

**Expected:** Only eligible work in the intended period is included once. Totals and handover dates match the selected work.

### TZ39  Handover report and email

**Example:** Approved handover and test recipients.

**Steps:** Generate its report, send the normal email and follow the link from the Handover app or portal.

**Expected:** Report, message and opened record show consistent dates, quantities and approval status. No date moves to the adjacent day.

### TZ40  Consistent handovers across apps

**Example:** Handover open in web and Handover app on differently zoned devices.

**Steps:** Update a handover, refresh both clients and request the document again.

**Expected:** Both clients show the same team dates and final state. Requesting the document again does not create an extra approval or duplicate business record.

## Materials and deliveries

Use the example below. Repeat common scenarios for teams ahead of and behind UTC, such as Tokyo and Toronto.

### TZ41  Order and expected delivery dates

**Example:** Material order for a project in Los Angeles.

**Steps:** Create an order with expected delivery on 4 November, amend it to 5 November and reopen.

**Expected:** Expected delivery stays on 5 November in the order, project and relevant lists.

### TZ42  Receipt and issue around midnight

**Example:** Delivery receipt before team midnight and a material issue after it.

**Steps:** Record both actions, inspect stock movement history and filter each day.

**Expected:** Each movement appears on its actual team day, in order, with correct quantities and no double counting.

### TZ43  Material period totals and documents

**Example:** Material movements across week and month end.

**Steps:** Compare period lists, project totals and available order or delivery documents.

**Expected:** Same period and records produce matching quantities and values; dates agree between screen and document.

### TZ44  Material changes and cancellation

**Example:** Test material record with an editable note or status.

**Steps:** Edit it, change its status and delete or cancel where permitted. Refresh related views.

**Expected:** Correct record changes once. Event times and related views remain consistent and existing permissions still apply.

## Inspections and actions

Use the example below. Repeat common scenarios for teams ahead of and behind UTC, such as Tokyo and Toronto.

### TZ45  Inspection date and submission time

**Example:** Inspection planned on 4 November in Tokyo; assigned inspector.

**Steps:** Open it in the Inspections app, submit near team midnight and inspect the web record.

**Expected:** Planned date stays on 4 November. Submission time reflects the actual moment in the team zone on both clients.

### TZ46  Due and overdue actions

**Example:** Actions due yesterday, today and tomorrow; agreed overdue rule.

**Steps:** Open action lists before and after team midnight, then complete one action.

**Expected:** Due status changes at the correct team boundary under the approved rule; completion updates only the intended action.

### TZ47  Inspection day filters and reports

**Example:** Submissions around team midnight and month end.

**Steps:** Filter one day and a multi day period. Generate available inspection reports.

**Expected:** Correct submissions are included once and report dates agree with the filtered records.

### TZ48  Templates amendments and history

**Example:** Inspection template and a submitted inspection that permits amendment.

**Steps:** Create or update a template, amend the inspection and compare history on two devices.

**Expected:** Template and amendment workflows still work; timestamps and ordering are consistent without changing the planned calendar date.

## Safety forms talks and near misses

Use the example below. Repeat common scenarios for teams ahead of and behind UTC, such as Tokyo and Toronto.

### TZ49  Near miss actual event time

**Example:** Near miss occurring at 23:55 and recorded after team midnight.

**Steps:** Enter the actual occurrence time, submit and inspect list, detail and history.

**Expected:** Occurrence remains on the previous team day; submission is on the next. The two meanings are not confused.

### TZ50  Toolbox talk planned date and attendance

**Example:** Talk scheduled on 4 November; test attendees.

**Steps:** Create, amend, deliver and complete the talk. Reopen its attendance and available report.

**Expected:** Planned talk date stays fixed and actual completion times are correct. Attendees and completion status persist.

### TZ51  Safety form lifecycle

**Example:** Template with date only and date with time questions where supported.

**Steps:** Create a draft, publish, submit both kinds of answers, amend where allowed and export.

**Expected:** Date only answers remain unchanged. Event answers keep the intended moment. Draft and publish history are correctly ordered.

### TZ52  Safety filtering and follow up

**Example:** Near misses, talks and forms around a day boundary; follow up actions.

**Steps:** Filter each type for one team day and check pending or completed actions.

**Expected:** Correct records and action states appear for that day. No item is lost or duplicated due to a different device zone.

## Gaffer assistant responses

Use the example below. Repeat common scenarios for teams ahead of and behind UTC, such as Tokyo and Toronto.

### TZ53  Assignment is returned for its calendar date

**Example:** Los Angeles team; worker and vehicle assigned on 4 November 2026.

**Steps:** Ask Gaffer for the 4 November schedule, crew and vehicles. Ask separately for 3 November.

**Expected:** 4 November includes the assignment; 3 November does not.

### TZ54  Today tomorrow and daily briefing

**Example:** Tokyo team; different assignments today and tomorrow.

**Steps:** Ask for today’s briefing and tomorrow’s plan; compare with the daily planner. Repeat using a device in London.

**Expected:** Answers use the selected team’s today and tomorrow and agree with the planner.

### TZ55  Week and explicit period questions

**Example:** Work and attendance across a week boundary.

**Steps:** Ask for the named week and for an explicit start and end date. Compare crew, work and attendance answers with source screens.

**Expected:** The stated period contains the same eligible records and totals as the source, with no adjacent day shift.

### TZ56  Team switching and inaccessible records

**Example:** User with two teams; another user with access to only one.

**Steps:** Ask identical date questions after switching teams. Ask the restricted user about the other team.

**Expected:** Responses use the active team’s zone and authorised records. No other team’s data or date context is exposed.

## Customers permissions and notifications

Use the example below. Repeat common scenarios for teams ahead of and behind UTC, such as Tokyo and Toronto.

### TZ57  Customer and contact history

**Example:** Customer with contacts; authorised staff and portal user.

**Steps:** Create and update customer and contact details near team midnight, then view history and portal details.

**Expected:** Details persist; event times follow the correct team and remain ordered. Date only fields retain their selected values.

### TZ58  Each role can access its permitted work

**Example:** Administrator, supervisor, worker and customer test accounts.

**Steps:** Sign in to each supported app, open permitted areas, then attempt a known restricted area.

**Expected:** Existing permissions remain enforced. Valid users can use their normal workflows; restricted records remain inaccessible.

### TZ59  Notification content and links

**Example:** Test notifications from assignment, handover, inspection and safety workflows where configured.

**Steps:** Trigger each enabled notification, inspect its dates and follow its link from a differently zoned device.

**Expected:** Dates match the intended team record and the link opens the correct authorised record. No adjacent day shift occurs.

### TZ60  Setting updates reach all affected areas

**Example:** Administrator and two open sessions; team changing its working time zone.

**Steps:** Change the team zone, refresh or sign in as required, then inspect planning, attendance, reports, notifications and customer views.

**Expected:** All areas converge on the saved zone after the normal refresh or sign-in. No area keeps another team’s or the old zone indefinitely.

## Forecasting reports and existing data

Use the example below. Repeat common scenarios for teams ahead of and behind UTC, such as Tokyo and Toronto.

### TZ61  Forecast periods agree with source work

**Example:** Assignments, resources and financial data across a month boundary.

**Steps:** Open forecasts for that month and adjacent month; compare their included work with source screens.

**Expected:** Work is attributed to the intended business periods and totals reconcile under the existing forecast rules.

### TZ62  Report defaults use the team day

**Example:** Tokyo and Toronto teams at a moment with different dates; report access.

**Steps:** Open reports without manually selecting dates, including valuation reports where available.

**Expected:** Default today and periods follow the selected team day. Choosing explicit dates overrides the default as labelled.

### TZ63  Existing business records keep their meaning

**Example:** Existing assignments, attendance records, wages and valuations with known dates and amounts.

**Steps:** Open existing records and compare their dates, durations, values and history with the original business records. Export them without editing.

**Expected:** Calendar dates and actual events retain their meaning. Existing wages and quantities do not change merely from viewing or exporting.

### TZ64  Reports after changing the team time zone

**Example:** Existing records, generated report and a team changing its working time zone.

**Steps:** Regenerate the report, reopen related screens and repeat after a permitted zone change.

**Expected:** Views converge on current settings. Selected calendar dates stay fixed; event displays may change zone while keeping the same moment. Historical payroll follows the approved policy.

## Complete business journeys and continuity

Use the example below. Repeat common scenarios for teams ahead of and behind UTC, such as Tokyo and Toronto.

### TZ65  Assignment to attendance to wages

**Example:** Tokyo then Kolkata teams; 08:00 to 16:00 shift and 160 rate.

**Steps:** Create the assignment, check Gaffer, clock in and out, calculate wages, open project totals and generate the available report.

**Expected:** Assignment day agrees throughout; attendance is 8 hours; standard wage is 160 and totals reconcile. No step loses the record.

### TZ66  Work to handover to customer report

**Example:** Los Angeles team; work, customer and valuation.

**Steps:** Plan work, complete it, create and approve handover, publish to customer and open the resulting report.

**Expected:** Same intended work day, quantities and valuation flow through every step; event history stays chronological.

### TZ67  Two teams working at the same time

**Example:** Tokyo and Toronto teams with similarly named test records.

**Steps:** Have users update records in both teams at the same time. Check their reminders, reports and Gaffer answers.

**Expected:** Every record, reminder, report and assistant response uses its own team and zone. One team’s activity does not change another team’s records, dates or messages.

### TZ68  Returning to work after an interruption

**Example:** A saved assignment, a changed team setting and a report that is still being prepared.

**Steps:** Save the assignment and setting, leave the app while the report is being prepared, then return and reopen the work and report.

**Expected:** Saved work and settings remain available. Once the report is ready, it uses the correct team dates and includes the intended records without duplication.

## Business area coverage

| Business area | Scenarios |
| --- | --- |
| Team settings, date formats and working across countries | TZ01–TZ04, TZ60 |
| Date filters, lists, exports and calendar boundaries | TZ05–TZ08 |
| Daily and weekly work planning and assignments | TZ09–TZ12 |
| Assignment messages and reminders | TZ13–TZ16, TZ59 |
| Attendance, overnight shifts and corrections | TZ17–TZ20 |
| Wages, pay periods and project pay totals | TZ21–TZ24 |
| Seasonal clock changes and unusual local times | TZ25–TZ28 |
| Staff, availability, leave and holidays | TZ29–TZ32 |
| Projects, quotations, valuations and receipts | TZ33–TZ36 |
| Handovers, approvals and customer documents | TZ37–TZ40 |
| Materials, orders, deliveries and stock movements | TZ41–TZ44 |
| Inspections, due actions and reports | TZ45–TZ48 |
| Safety forms, toolbox talks and near misses | TZ49–TZ52 |
| Gaffer schedules, briefings and period questions | TZ53–TZ56 |
| Customers, contacts, access and notifications | TZ57–TZ60 |
| Forecasts, reports and existing business records | TZ61–TZ64 |
| Complete business journeys and interrupted work | TZ65–TZ68 |
