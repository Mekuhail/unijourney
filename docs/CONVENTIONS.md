# UniJourney – build conventions (read fully before writing code)

UniJourney is a modular monolith: **Express 5 + node:sqlite** server (`server/`), **Vite + React 19 + Tailwind v4** client
(`client/`), shared types (`shared/`). Demo context: Al Yamamah University. Every person/record is synthetic. No external
service is called except optional Anthropic (AI intent) and Google Maps tiles (client, only when a key is configured).

Run: `npm run dev` (API on :8787, Vite on :5173 proxies `/api`). Tests: `npm test` (vitest, `tests/**/*.test.ts`).
Typecheck: `npm run typecheck`. Seed/reset: `npm run reset`. Node >= 22.13.

## Server

* `server/core/db.ts` – `db()` returns the singleton `Db`: `all/get/run/insert/upsert/update/count/tx`. Params are
  positional `?`. Booleans become 0/1, objects are JSON-stringified automatically. JSON columns: write with `j(value)`,
  read with `pj<T>(row.col, fallback)`. Use `db().tx(() => …)` for multi-write operations (nesting is fine).
* Schema is in `server/core/schema.sql` (48 tables). **Do not rename existing columns.** You may add tables/columns for
  your module (append to schema.sql; keep `IF NOT EXISTS`). Reset rebuilds everything, so no migrations are needed.
* IDs: `newId('prefix')`; public refs `publicRef('YU')`; `stableHash(payload)` for approval hashes (`server/core/ids.ts`).
* Clock: **never use `new Date()` for business time** – use `now()/nowIso()/todayIso()/toLocal()/localToIso()/addDays()`
  from `server/core/clock.ts` (Asia/Riyadh, demo clock frozen at `DEMO_CLOCK`, default 2026-09-27 09:00 +03:00, a Sunday).
* HTTP: routers are Express `Router`s. Wrap handlers with `h(async (req,res) => …)`, validate with `parse(zodSchema, req.body)`,
  respond with `ok(res, data)`. Throw `bad()/forbidden()/notFound()/conflict()/gone()/unprocessable()` from `server/core/http.ts`.
  Response envelope is `{ ok: true, data }` / `{ ok: false, error: { code, message, details } }`.
* Auth: `req.user` is attached by the core middleware. Use `requireUser(req)`, `requireRole(req, 'reviewer')`,
  `requireOwnerOrRole(req, ownerId, 'security')`, `hasRole(user, …)` from `server/core/auth.ts`. Roles:
  `applicant | student | reviewer | club_lead | security | operator | admission_officer | registrar` (`user.roles` array).
  **Enforce ownership and roles on the server for every read and write.** Never trust ids from the client for ownership.
* Cross-cutting services (use them, don't reimplement):
  * `notify(userId, { module, kind, title, body, link })` – in-app notification (`server/core/notify.ts`).
  * `sendEmail({ toUserId, toAddress, subject, html, text, module })` – simulated outbox only; returns `{id,status:'simulated'}`.
  * `upsertEntry(ownerId, { source_type, source_id, title, kind, start_at, end_at, location_id, location_text, immovable, link })`
    – calendar entries are idempotent per (owner, source_type, source_id). `removeEntry`, `listEntries`, `findConflicts(ownerId, startIso, endIso, exclude?)`.
    Source types in use: `section` (class meeting occurrence id `${sectionId}:${date}:${start}`), `exam`, `event`, `interview`, `task`, `personal`, `deadline`.
    Calendar kinds: `class|exam|event|interview|task|personal|deadline`.
  * Documents: `createDocumentFromBuffer(ownerId, kind, filename, mime, buffer)` for seeds; uploads go through the core
    `POST /api/documents` (multipart field `file`, body `kind`, `label`) which returns `DocumentMeta`. Your module then
    references `document_id`s. Grant staff access to owner documents by calling `registerDocumentGrant((doc, user) => bool)`
    at module load (e.g. reviewer may open evidence attached to an excuse request in their queue). Medical evidence must
    never be included in search, AI prompts, notes or logs.
  * Approvals: `createApproval(ownerId, kind, entityId, revision, payloadHash)` → `Approval` (expires per policy);
    `checkApproval(approvalId, { ownerId, entityId, payloadHash, revision })` → `valid|expired|invalidated|consumed|mismatch|missing|wrong_owner`;
    `consumeApproval(id)`; `invalidateApprovals(kind, entityId)` whenever a material change happens.
  * `audit(actorId, action, entityType, entityId, payload)` for consequential actions.
  * Policies: `getPolicies()` (`server/core/settings.ts`) – credit limit, teaching week, travel gap, absence thresholds,
    excuse treatment/deadline, approval TTL, graduation credits. Each has `provenance`. Never hard-code a policy number.
  * Terms: `CURRENT_TERM = '2026-1'` (Fall 2026), `NEXT_TERM = '2026-2'`, `TERM_LABELS`.
* Module wiring: `server/modules/<name>/index.ts` exports `<name>Module: AppModule = { name, router, seed }`. The router is
  mounted at `/api/<name>`. `seed(ctx: SeedContext)` runs inside the global seed transaction after the core seed; `ctx.users`
  holds persona ids (`student`, `lead`, `student2`, `applicant`, `graduating`, `reviewer`, `admissions`, `security`, `operator`),
  `ctx.today`, `ctx.term`, `ctx.nextTerm`. Put your seed in `server/modules/<name>/seed.ts`. Seeds must be deterministic.
* Adapters live in `server/adapters/<name>.ts` with an interface + a demo provider. Label results (`simulated: true`,
  `provider: 'demo'`). Optional AI: `server/adapters/ai.ts` exposes `aiAvailable()` and helper calls; everything must work
  without a key, with a deterministic fallback.
* Personas (core seed): `u_student` Sara Al-Otaibi (BSE, level 6, Riyadh), `u_lead` Layan Al-Harbi (student + club lead,
  BSE level 7), `u_student2` Faisal Al-Dossari (BCNE level 3, Khobar), `u_applicant` Omar Al-Qahtani, `u_graduating`
  Noura Al-Shehri (BSE level 8, stage graduating), `u_reviewer` Dr. Hala Al-Mutairi (reviewer), `u_admissions` Reem Al-Ghamdi
  (admission_officer + registrar), `u_security` Abdullah Al-Anazi (security), `u_operator`.
* Campus data (core seed): `campuses` (`riyadh`, `khobar`), `campus_locations` (buildings, rooms, services; `searchable=1`
  for named places, `kind='junction'` for path nodes), `path_edges`. Room ids you can reference in sections/events:
  Riyadh `ryd_room_b101, ryd_room_b204, ryd_room_b210, ryd_room_b305 (software lab), ryd_room_b312 (networks lab), ryd_room_c115,
  ryd_room_c220, ryd_room_d105 (clubs room), ryd_room_lib_2f, ryd_room_it_lab`, buildings `ryd_bldg_a/b/c/d, ryd_library,
  ryd_auditorium, ryd_sports, ryd_cafeteria, ryd_security (lost & found desk), ryd_it, ryd_clinic, ryd_mosque`; Khobar
  `khb_room_e101, khb_room_e205, khb_room_l110, khb_room_m120, khb_main, khb_eng, khb_law, khb_library, khb_cafe, khb_security`.

## Client

* Router: `react-router` v7 (`Routes/Route/Link/NavLink/useNavigate/useParams/useSearchParams`). Module routes live in
  `client/src/modules/<name>/routes.tsx` and are mounted at `/<name>/*` (`academics`, `campus`, `career`, `journey`, `staff`).
* Data: `api<T>(path, { method, body, query })` and `apiUpload(path, file, fields)` (`client/src/lib/api.ts`); `useQuery(fn, deps, { refreshOn })`
  (`client/src/lib/useQuery.ts`). After a mutation call `refreshAll('topic')` (`client/src/lib/bus.ts`) so lists, the bell and
  the calendar refresh (`refreshOn: ['calendar']` etc.). Show real errors with `errorMessage(e)` and `useToast()`.
* Session: `useSession()` → `{ user, hasRole(...), demoMode, switchPersona }`. i18n: `useI18n()` → `{ t, locale, dir, l(en, ar) }`.
  Add strings to `client/src/modules/<name>/i18n.ts` (both `en` and `ar`, keys namespaced `<name>.*`). Shared status labels
  exist as `status.<value>` (render with `<StatusPill status=… />`). Use logical CSS (`ms-/me-/ps-/pe-/start-/end-`), never
  `ml-/mr-` – the app runs RTL for Arabic.
* UI kit: `client/src/components/ui/index.tsx` – `Button, Badge, StatusPill, Card, SectionTitle, Field, Input, Textarea, Select,
  Toggle, Modal, ConfirmDialog, Tabs, EmptyState, ErrorState, Skeleton, Callout, Progress, Avatar, KeyValue, CopyId`;
  `PageHeader` (`client/src/components/ui/PageHeader.tsx`); `useToast` (`components/ui/toast.tsx`); `WeekCalendar` (`pages/CalendarPage.tsx`).
* React Bits (already vendored in `client/src/components/reactbits/*`, default exports): `SplitText, BlurText, ShinyText, GradientText,
  CountUp, TextType, DecryptedText, Aurora, Particles, SpotlightCard, TiltedCard, Magnet, AnimatedList, Dock, Stepper, GlareHover,
  StarBorder, ClickSpark, AnimatedContent, FadeContent, Counter, Noise, Stack, GlassSurface, DotGrid, ScrollReveal`.
  Use them for hero headers, stat tiles (`CountUp`), step flows (`Stepper`), cards (`SpotlightCard`, `GlareHover`), CTA
  (`Magnet`, `StarBorder`). Respect `useTheme().reducedMotion` (skip WebGL backgrounds and letter animations when true).
  Dark mode uses the `.dark` class; use semantic Tailwind colours `bg-bg bg-surface bg-surface-2 text-fg text-muted border-line
  bg-brand-500 text-brand-600 bg-gold-500 text-success text-warn text-danger text-info` and the `card`, `card-2`, `glass` classes.
* Every interactive card/button must do something real (navigate, mutate, open a detail). No decorative dead controls.
  Implement loading (`Skeleton`), empty (`EmptyState`), error (`ErrorState` with retry), validation and success states.
  Forms keep user input on error. Dialogs are keyboard operable (Modal handles focus trap/ESC).
* Mobile: layouts must work at 390 px (stack columns, `overflow-x-auto` for tables). Desktop sidebar is 256 px.

## Cross-module contracts

* Timetable = `course_sections.meetings` for sections in `transcript_entries` with status `enrolled` for the current term.
  Calendar entries for classes are created by the academics module (source_type `section`).
* Events with `rsvps.status='going'` create exactly one calendar entry per user (source_type `event`, source_id = event id).
  Conflicts with classes are computed via `findConflicts`. The campus module exposes `POST /api/campus/events/:id/rsvp` and
  the academics module exposes `POST /api/academics/excuses/draft-from-event` (body `{ eventId, attendanceIds[] }`).
* Study tasks (`study_tasks`) can be created from resources (`resource_id`), enrollment (`source='enrollment'`) and events.
* Lost & found "found" → owner-only notification + email preview + link `/campus/map?to=<collection_location_id>`.
* Navigation deep links: `/campus/map?to=<locationId>` and `/campus/map?from=<id>&to=<id>&mode=accessible`.
* Saved opportunity → at most one application per (student, opportunity). Interviews create calendar entries (source_type `interview`).
* Graduation audit reads `transcript_entries` + `degree_requirements`; planned/enrolled credits are never counted as earned.

## Testing

* Tests use vitest with an in-memory DB: `initDb(':memory:')` then `seedAll({ reset: true })` (see `tests/helpers.ts`) and call
  services directly or the Express app via `fetch` on an ephemeral port (`createApp().listen(0)`). Keep each test file
  independent. Name files `tests/<module>.<topic>.test.ts`.

## Staff routing & shared audit

* Staff pages: each module exports `<Name>StaffRoutes` from `client/src/modules/<name>/staff.tsx`, mounted at
  `/staff/<name>/*` by `client/src/modules/staff/routes.tsx`. Expected paths: `/staff/academics/excuses`,
  `/staff/campus/clubs`, `/staff/campus/lost-found`, `/staff/campus/resources`, `/staff/journey/admissions`, `/staff/journey/graduation`.
* Degree audit: `computeDegreeAudit(studentId)` in `server/modules/academics/audit.ts` (owned by academics; consumed by
  graduation). Keep the exported types/signature stable.
* Curriculum data to seed: `server/seed/data/yu-curriculum.md` (official BSE V9.8 and BCNE V.2 plans, 142 CH each).
