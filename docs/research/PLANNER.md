# Study planner: a to-do list that fills itself

September 2026. `/academics/study` is now a to-do list with a schedule next to it. Most items get there on their own: a professor's announcement of a quiz, midterm, assignment or lab becomes a to-do, a calendar entry and a notification for every enrolled student. Students add their own tasks and reminders in one line.

## Reference

[codeSprout](https://code-sprout-neon.vercel.app/) kept the add form to a few fields (title, description, date, time, urgency colour) and showed tasks on a month calendar with a selected-day list and an urgency filter. We kept that simplicity (one quick-add line, urgency as the colour of the checkbox, a month view with a day list) and added what a student planner needs:

- Assessments arrive from instructor emails, so nothing has to be typed.
- A week schedule that shows classes next to tasks, with drag to reschedule and click an empty slot to add.
- Reminders become notifications, even when the student is on another page.

## From email to planner

`server/modules/academics/assessments.ts`

1. **Parse** (`parseAnnouncement`) reads the subject first, then the body:
   - The kind: quiz, midterm, final, assignment, project, lab or presentation.
   - The number ("Quiz 2", "المعمل رقم 3").
   - The date, the time or time range, and the room.
   - Arabic day and month names, Arabic digits, and صباحًا/مساءً are normalised before the shared date resolver runs.
   - Messages with no assessment (for example "Office hours this week") are kept but not scheduled. So is an assessment with no date.
2. **Store** the email (`course_emails`) and the assessment (`course_assessments`). The title is the email subject and the description is the email body, word for word.
3. **Fan out** to every student enrolled in that course and section:
   - A to-do (`study_tasks` with `source = 'announcement'`) plus exact times (`study_task_times`).
   - A calendar entry: `exam` for quizzes, midterms, finals and presentations; `deadline` for everything else.
   - A reminder 24 hours before.
   - A notification that links to the item.
4. **Follow-ups** update the same item instead of adding a new one. "Quiz 1 has been moved to Thursday" changes the date, keeps both messages in the description, and notifies again. "Quiz 1 is cancelled" closes it and removes the calendar entry.

Students cannot edit or delete instructor items, only tick them off. The original email opens from the item for students in that course only.

## What the student does

- **Quick add:** "Revise CIS 321 ch 5 tomorrow 7pm". A live preview shows what will be added: type, course, day and time. "remind me …" makes a reminder.
- **Details form:** title, task or reminder, course, date, time, length, urgency, when to be reminded, notes.
- **List:** Overdue, Today, Tomorrow, Next 7 days, Later, No date, plus a collapsed Done group. Filters: Everything, From instructors, My tasks.
- **Week:** classes appear quietly, exams in gold, and tasks and reminders in orange. Deadlines and untimed tasks sit in the all-day row. Drag a task, or a list row, onto the grid to plan it. Click an empty slot to add at that time.
- **Month:** shows up to two items per day, with the selected day's list underneath.
- **From your instructors:** the latest course emails, each marked "Added" or "Nothing to add". In demo mode, "Send a test announcement" plays the instructor.

## Data safety

- Three new tables (`course_emails`, `course_assessments`, `study_task_times`), all `CREATE TABLE IF NOT EXISTS`.
- The demo announcements are added once by the `planner-v1` migration, with fixed ids. Existing tasks are untouched.
- `SEED_VERSION` is unchanged, so no reseed.
- The previous `/academics/study/*` APIs still work.

## Connecting a real mailbox

Only the source changes. Feed each message from a course mailbox (Microsoft Graph or IMAP), or an LMS announcement webhook, into `ingestCourseEmail({ course_code, section_id, from_name, from_email, subject, body, received_at })`. Parsing, deduplication, fan-out and notifications stay the same.
