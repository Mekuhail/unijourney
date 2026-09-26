# Six-minute judge demo (UniJourney)

Demo clock: Sunday 27 Sep 2026, 09:00 Asia/Riyadh (frozen; advance it from the Demo panel). Personas switch from the
sidebar card or the Demo panel; the server still enforces ownership and roles for every call. Every route below is
independently usable — the script is only a suggested order. "Reset demo" restores the seeded state at any time.

| Time | Persona | Where | What to show |
|---|---|---|---|
| 0:00 | Omar (applicant) | My Journey → Admission | Program explorer with official links; the draft application is **blocked** until the checklist is complete; attach the missing document, submit, see the labelled demo receipt and timeline. Switch to Reem (admissions) → admit; switch back → accept the offer: the **same profile** becomes a student with an onboarding checklist. |
| 1:00 | Sara (BSE, level 6) | Academics → Register | Type "avoid early classes, no Thursday, keep Tuesday 4pm free". The agent generates 2–3 feasible options with deterministic checks (prerequisites, overlap, capacity, credits, travel gap) and tradeoffs; pin a section; approve the **exact** list; submit. Try "simulate stale capacity" (forced re-review), "duplicate click" (same receipt, no double enrolment) and "timeout" (outcome unknown → check status). Timetable and calendar update only on the confirmed receipt. |
| 2:15 | Sara | Academics → Attendance | Click the **Absent** pill on 21 Sep (SWE 302). The draft is bound to that session id. Attach the seeded Sehhaty-style PDF: dates and reference are extracted into an **editable** preview (extraction never authenticates). Approve, submit through the demo EduGate-style adapter (request ID). Attendance is unchanged. Switch to Dr. Hala (reviewer) → accept: the record becomes *excused* with the original status preserved. |
| 3:30 | Sara | Campus Life → Events / Academics → Study planner | RSVP to the Cybersecurity CTF that overlaps a class: exactly one calendar entry, a conflict panel offering an exact-session excuse draft and a study repair. In the planner, "Repair plan" shows before/after loads, locked tasks untouched, infeasible tasks listed; apply, then restore a plan version (execution history kept). |
| 4:30 | Sara → Abdullah (security) → Sara | Campus Life → Lost & found / Map | Submit a lost-item request and copy the opaque YU-… ID. As security: recent requests, mark found with a collection location (owner-only notice + email preview). As Sara: green "collect from" banner, route on the real Riyadh campus map (walking vs accessible), Google Maps directions link. |
| 5:15 | Noura (graduating) | Career / My Journey → Graduation | Filter opportunities, save one, create the single linked application, add an interview to the shared calendar with conflict check, resolve an ambiguous hiring email. Graduation audit: in-progress courses and the missing co-op block the request. Use the two labelled fixtures ("Post current-term results", "Fulfil unmet requirement") and "Clear pending clearances"; submit; Reem (registrar) approves; career handoff. |

Also worth showing if time allows: **Prerequisite chains** (sidebar) — switch college/major, click SWE 202 to light up the 22 courses behind it, then toggle "Show my progress"; Arabic/RTL toggle, dark mode, the mobile dock (resize to 390 px), the approval center
(every consequential action bound to a payload revision with expiry and idempotency key), the notification inbox with
the simulated email outbox, and the Demo panel's "Real vs simulated" table.
