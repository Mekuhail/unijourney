# UniJourney — a connected student journey for Al Yamamah University (hackathon prototype)

Farq hackathon · Student Journey track. One student workspace from **admission to graduation and career**: a course
registration agent with final approval, exact-session absence excuses with Sehhaty-style evidence, an adaptive study
planner, clubs and events, learning resources, real campus navigation (Riyadh + Khobar), the YU Claimed lost & found
flow, career discovery and tracking with a portfolio (LinkedIn export import, GitHub) and a separate competitions tab, admission/onboarding and a graduation audit — all sharing one profile, calendar,
notification inbox, document store and approval center. English/Arabic with RTL, Asia/Riyadh time, Sunday–Thursday week.

> Demonstration context only. Every person, record, policy and outcome is **synthetic**. EduGate, Sehhaty, email and job
> boards are **simulated behind documented adapters**; nothing is sent to a real system.

## Run it (no keys needed)

```bash
npm install
npm run dev          # API http://localhost:8787 · UI http://localhost:5173
```

Requires Node.js **22.13+** (built-in `node:sqlite`, no native builds). The database is created and seeded on first
start at `data/unijourney.db`. `npm run reset` rebuilds the fixtures (also from the Demo panel). `npm test` runs 162
domain/API tests, `npm run typecheck` checks both projects, `npm run build && npm start` serves the production build.

Optional `.env` (see `.env.example`): `ANTHROPIC_API_KEY` enables model-backed intent parsing/explanations (the
deterministic assistant is the default), `GOOGLE_MAPS_API_KEY` switches the campus map from OpenStreetMap tiles to
Google Maps, `CARTO_API_KEY` removes the watermark from the street basemap. Keys stay in `.env` (gitignored) or
platform secrets; see "Secrets and keys" in `docs/RUN.md`. After cloning, run `git config core.hooksPath .githooks`
to enable the secret-scanning pre-commit hook.

## Demo

Open **Demo panel → Judge tour** (six minutes, `docs/DEMO.md`). Personas switch from the sidebar card; the server still
enforces ownership and roles. The demo clock is frozen at **Sunday 27 Sep 2026, 09:00 Asia/Riyadh** and can be advanced.

| Persona | Who |
|---|---|
| Omar Al-Qahtani | applicant (draft admission application) |
| Sara Al-Otaibi | BSE student, level 6, Riyadh — the main demo persona |
| Layan Al-Harbi | BSE student + GDG club lead |
| Faisal Al-Dossari | BCNE student, Khobar campus |
| Noura Al-Shehri | graduating BSE student |
| Dr. Hala Al-Mutairi | academic reviewer (excuses, resource moderation) |
| Reem Al-Ghamdi | admissions officer + registrar |
| Abdullah Al-Anazi | campus security (lost & found) |

Club rosters, discussions and the anonymous course-feedback aggregates are filled by 27 synthetic community members
(`server/seed/members.ts`). They are not personas and do not appear in the persona switcher.

## Devices

The UI adapts from 360 px phones to desktops: a sidebar on large screens, a bottom dock on phones and portrait tablets,
safe-area padding for notched devices, touch-sized controls on coarse pointers, and horizontal scrolling only inside wide
widgets (timetable, prerequisite chains, calendar). It is installable as a PWA (manifest + icons) and works in dark mode and RTL.

## Repository map

```
server/core        session, db (node:sqlite), clock, http, approvals, calendar, notify, documents, policies, today aggregate
server/adapters    UniversityPortal (demo), DocumentExtraction, OpportunitySource, Mailbox, AI intent — all keyless by default
server/modules     academics · admission · campus · career · graduation · feedback (routes, services, seeds)
server/seed        personas, campuses (Riyadh from OpenStreetMap, Khobar approximate), curriculum data, fixtures
client/src         shell, UI kit, React Bits, i18n (en/ar), modules (today, academics, campus, career, journey, staff, demo)
shared             types shared by server and client
tests              vitest (in-memory database, API + domain rules)
docs               RUN, DEMO, COVERAGE, TESTS, INTEGRATIONS, ATTRIBUTION, CONVENTIONS
```

## Documents
* `docs/RUN.md` — run guide and environment.
* `docs/DEMO.md` — six-minute judge script.
* `docs/COVERAGE.md` — module coverage matrix.
* `docs/TESTS.md` — test evidence and manual checks.
* `docs/INTEGRATIONS.md` — real vs simulated vs future integrations.
* `docs/ATTRIBUTION.md` — third-party attribution and licence notes.
* `docs/research/CLUBS-COMMUNITY-FEEDBACK.md` — clubs & community and KPI course feedback: research and decisions.
* `docs/research/COMMUNITY.md` — the campus community (feed, profiles, workshops, messages): design, permissions, safe migration.
* `docs/research/PARKING.md` — parking occupancy on the campus map: prior art, data model, simulation, accessibility.
