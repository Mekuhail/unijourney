# Test evidence

Run on 2026-09-26 (Asia/Riyadh) with `npm test` (vitest 3, Node v25.2.1, in-memory SQLite, fixtures reseeded per file).

```
Test Files  19 passed (19)
Tests  162 passed (162)
```

New in the portfolio release: `tests/career.portfolio.test.ts` (evidence-weighted skills, consent gating, LinkedIn
export import and erase, LinkedIn URL rules, JSON Resume export, co-op credit-hour eligibility, cross-student isolation,
competition lifecycle and calendar entries, verified awards, LinkedIn ZIP parsing, GitHub summary with a mocked API).

## Tests by file

### tests/academics.audit.test.ts
- ✅ curriculum and degree audit > seeds both programs with buckets that sum to 142 credits
- ✅ curriculum and degree audit > never counts enrolled or planned credits as earned and reports the unmet co-op for the graduating persona
- ✅ curriculum and degree audit > exposes the plan and audit through the API for the current student only

### tests/academics.excuses.test.ts
- ✅ exact-session excuses > binds a draft to exact attendance ids and rejects foreign or non-absent sessions
- ✅ exact-session excuses > only accepts evidence owned by the student and extracts editable fields
- ✅ exact-session excuses > requires explicit approval, invalidates it on edit, submits once and leaves attendance untouched
- ✅ exact-session excuses > restricts the review queue to reviewers and applies the accepted treatment while keeping the original status
- ✅ exact-session excuses > needs_information sends the request back to the student and keeps the full history

### tests/academics.registration.test.ts
- ✅ registration agent: deterministic checks > detects unmet and in-progress prerequisites and 90 CH rules
- ✅ registration agent: deterministic checks > flags time overlap, full sections and the credit limit as hard failures
- ✅ registration agent: deterministic checks > parses free-text preferences into rules and generates distinct feasible options
- ✅ registration agent: approval binding and submission > invalidates the approval when the basket is edited
- ✅ registration agent: approval binding and submission > rejects an expired approval
- ✅ registration agent: approval binding and submission > submits once: a duplicate submit returns the same receipt and never double-enrols
- ✅ registration agent: approval binding and submission > forces re-review when a seat disappears between approval and submission
- ✅ registration agent: approval binding and submission > reconciles a timed-out submission without submitting twice

### tests/academics.study.test.ts
- ✅ natural-language intake (deterministic, no model) > parses course, effort and deadlines in several formats relative to the demo clock
- ✅ natural-language intake (deterministic, no model) > maps registration preference text to rules
- ✅ adaptive study planning > repairs missed/unavailable/overloaded tasks with minimal movement, never moves locked tasks and reports infeasible ones
- ✅ adaptive study planning > schedules unscheduled tasks before their deadlines and within capacity
- ✅ adaptive study planning > restores a version without deleting execution history

### tests/campus.clubs.test.ts
- ✅ clubs: join → lead approve → active > creates a pending membership and the lead of THAT club can approve it
- ✅ clubs: join → lead approve → active > another club's lead gets 403 on the GDG queue and on decisions
- ✅ clubs: join → lead approve → active > leave keeps the row with status left
- ✅ role boundaries between staff desks > a club lead gets 403 on security routes
- ✅ role boundaries between staff desks > security gets 403 on review queues
- ✅ achievements & digital card > verify attendance needs a going RSVP and the right role; card exposes a demo QR

### tests/campus.events.test.ts
- ✅ RSVP → exactly one calendar entry > creates one entry, refuses a duplicate RSVP, and cancel removes it
- ✅ RSVP → exactly one calendar entry > seeded RSVP has exactly one calendar entry (upsert idempotency)
- ✅ capacity → waitlist → promotion > waitlists when full and promotes the first waitlisted user on cancel
- ✅ conflict detection > returns the overlapping class and offers an excuse draft with attendance ids
- ✅ conflict detection > personal events land on the calendar and other users cannot see them
- ✅ lead event editor > only the club lead can create/edit club events

### tests/campus.lostfound.test.ts
- ✅ YU Claimed lost & found > create → opaque public id (YU-XXXX-XXXXX), owner-bound, optional owned photo
- ✅ YU Claimed lost & found > status by public id: owner and security see details, another student only sees the status
- ✅ YU Claimed lost & found > security can open the attached photo through the document grant; a club lead cannot
- ✅ YU Claimed lost & found > mark found requires a collection location, notifies only the owner and writes a branded email
- ✅ YU Claimed lost & found > handover is required before collected; close afterwards
- ✅ YU Claimed lost & found > security desk lists by day and found items suggest matches without auto-linking

### tests/campus.map.test.ts
- ✅ campus routing (Dijkstra over path_edges) > finds a walking route between two named places with steps and a polyline
- ✅ campus routing (Dijkstra over path_edges) > accessible mode avoids stairs: a floor-2 room in a building with an elevator is reachable, one without is not
- ✅ campus routing (Dijkstra over path_edges) > unreachable Old Storage Annex returns found:false and never a straight line
- ✅ campus routing (Dijkstra over path_edges) > refuses cross-campus routes with an explanation
- ✅ campus routing (Dijkstra over path_edges) > Khobar synthetic graph routes and labels geometry as synthetic
- ✅ campus routing (Dijkstra over path_edges) > search includes the building name for rooms and next-class prefill reads the calendar

### tests/campus.resources.test.ts
- ✅ resources: search, upload, bookmark, study task > searches by course code and general text; medical docs are never listed
- ✅ resources: search, upload, bookmark, study task > upload requires rights confirmation and document ownership
- ✅ resources: search, upload, bookmark, study task > bookmark and helpful are toggles
- ✅ resources: search, upload, bookmark, study task > creates a linked study task from a resource
- ✅ resources: search, upload, bookmark, study task > published resource files are readable by any user via the document grant
- ✅ resources: search, upload, bookmark, study task > summary works without an AI key (extractive, cited to paragraphs)
- ✅ moderation > only reviewer/registrar can moderate; decision notifies the author

### tests/career.applications.test.ts
- ✅ career tracker > creates at most one application per (student, opportunity)
- ✅ career tracker > keeps distinct manual applications to the same company distinct
- ✅ career tracker > enforces forward transitions, attestation for applied and notes for corrections
- ✅ career tracker > records an interview exactly once on the calendar and reports a class conflict
- ✅ career tracker > rejects cross-student reads and writes with 403
- ✅ career tracker > prepare returns a labelled draft that is never submitted

### tests/career.emails.test.ts
- ✅ career hiring-email review > leaves an ambiguous email pending with both candidate applications
- ✅ career hiring-email review > an older confirmation never downgrades an application that is already at interview
- ✅ career hiring-email review > accepting a confident suggestion moves the application forward with an email-sourced event
- ✅ career hiring-email review > simulates a labelled email and blocks cross-student access

### tests/career.opportunities.test.ts
- ✅ career discovery > filters by type/city and explains the match with reasons and missing skills
- ✅ career discovery > filters by skill and hides expired postings unless asked
- ✅ career discovery > eligibility is null when the posting has conditions the profile cannot verify
- ✅ career discovery > save is idempotent and can be undone
- ✅ career discovery > feed refresh adds labelled demo records once and never duplicates
- ✅ career discovery > manual import normalizes the URL and returns the existing record on a duplicate

### tests/core.approvals.test.ts
- ✅ approvals bind exact payload revisions > valid when hash, revision and owner match
- ✅ approvals bind exact payload revisions > mismatch when the payload changed (material change invalidates)
- ✅ approvals bind exact payload revisions > expires after the policy TTL and cannot be reused after consumption
- ✅ approvals bind exact payload revisions > rejects another owner and missing ids
- ✅ approvals bind exact payload revisions > a new approval for the same entity supersedes the previous one

### tests/core.auth-documents.test.ts
- ✅ session, roles and private documents > defaults to the demo student persona without a cookie and switches personas explicitly
- ✅ session, roles and private documents > validates uploads by magic bytes and rejects executables
- ✅ session, roles and private documents > only the owner can read a document; other students and unrelated staff get 403
- ✅ session, roles and private documents > exposes policies with provenance and the demo status honestly labels adapters
- ✅ session, roles and private documents > reset rebuilds fixtures (demo mode only)

### tests/core.calendar.test.ts
- ✅ shared calendar > upsert is idempotent per (owner, source_type, source_id)
- ✅ shared calendar > detects overlapping entries and excludes the source being checked
- ✅ shared calendar > clock helpers use Asia/Riyadh (+03:00) with a Sunday-based week

### tests/journey.admission.test.ts
- ✅ admission journey > lists programmes with labelled criteria and campus availability
- ✅ admission journey > blocks an incomplete submission with the missing list
- ✅ admission journey > validates personal fields server-side and never stores full national IDs
- ✅ admission journey > attaches owned admission documents only, then submits and gets a demo receipt
- ✅ admission journey > requires the officer role for the review queue and keeps applications private
- ✅ admission journey > officer decision → accept-offer transitions the same user record and retains personal data

### tests/journey.graduation.test.ts
- ✅ graduation journey > audit shows an unmet requirement, never counts planned/enrolled credits and blocks the request
- ✅ graduation journey > demo fixture fulfils the unmet requirement; clearances then allow a demo request with a receipt
- ✅ graduation journey > registrar role is required; approval notifies the student with the career handoff link
- ✅ graduation journey > registrar can clear a clearance for a student

## Checks performed outside the test suite
- `npm run typecheck` (server + client) — clean.
- `npm run build` — production client bundle built (route-level code splitting; initial chunk ≈ 206 kB gzip) and served by `npm start` (index, deep link `/campus/map`, `/api/health`, hashed assets all 200).
- `npm run reset` — deterministic reseed of all modules; verified the live API afterwards.
- API smoke run across personas (student, applicant, graduating, reviewer, security, admissions, club lead): overview, plan, timetable, attendance, sections, study, excuses, clubs, events, resources, map search/route (walking, accessible, unreachable), lost & found, digital card, opportunities, applications, emails, profile, skill gaps, programs, audit, handoff, review queues — all 200; role violations (club lead → security desk, club lead → reviewer queue) → 403.
- Browser (in-app pane): Today, Academics (register, attendance, study), Campus map with a step-free route to C-220, Lost & found form, Career discover, My Journey timeline and graduation audit, reviewer excuse queue — rendered with seeded data in English and Arabic (RTL); mobile layout (375 px) verified for the shell and Today page.

## Known limitations of the evidence
- Screenshot-based visual verification of every module page was limited because the app's browser pane was hidden for part of the session; those pages were verified through their rendered text/DOM and the API instead.
- Google Maps provider is type-checked but was not exercised at runtime (no key configured).
- Optional AI-backed parsing/explanations were not exercised (no key); deterministic fallbacks are what the tests cover.
