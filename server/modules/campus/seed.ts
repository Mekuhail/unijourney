import { j } from '../../core/db.ts';
import { addDays, localToIso } from '../../core/clock.ts';
import { upsertEntry } from '../../core/calendar.ts';
import { createDocumentFromBuffer } from '../../core/documents.ts';
import { sendEmail, notify } from '../../core/notify.ts';
import { makePdf, makePng } from '../../seed/fixtures.ts';
import type { SeedContext } from '../../seed/context.ts';
import { foundEmailHtml } from './lostfound.ts';

/**
 * Campus Life seed: clubs, memberships, events (+ RSVPs → calendar), achievements, original study resources (+ PDFs),
 * lost & found cases and found items. Deterministic; all people are the synthetic personas from the core seed.
 */
export function seedCampus(ctx: SeedContext) {
  const { db: d, users: U, today } = ctx;
  const at = (dayOffset: number, time = '09:00') => localToIso(addDays(today, dayOffset), time);
  const on = (date: string, time: string) => localToIso(date, time);
  const day = (n: number) => addDays(today, n);

  // ------------------------------------------------------------------ clubs
  const clubs = [
    { id: 'club_gdg', slug: 'gdg-on-campus', name_en: 'GDG on Campus – Al Yamamah', name_ar: 'مجموعة مطوري Google – جامعة اليمامة', description_en: 'Student-run developer community: hands-on workshops, jams and study circles across four activity tracks – Web Development, Game Development, IoT & Robotics and Cybersecurity. Open to all majors.', description_ar: 'مجتمع مطورين يديره الطلاب: ورش عملية وهاكاثونات مصغّرة وحلقات دراسية في أربعة مسارات – تطوير الويب، تطوير الألعاب، إنترنت الأشياء والروبوتات، والأمن السيبراني.', category: 'tech', lead_id: U.lead, color: '#F0762B', campus_id: 'riyadh' },
    { id: 'club_entrepreneurship', slug: 'entrepreneurship', name_en: 'Entrepreneurship Club', name_ar: 'نادي ريادة الأعمال', description_en: 'Pitch nights, founder talks and a yearly mini-incubator for student ideas.', description_ar: 'ليالي العرض، لقاءات مع مؤسسين، وحاضنة مصغّرة سنوية لأفكار الطلاب.', category: 'business', lead_id: null, color: '#0EA5A4', campus_id: 'riyadh' },
    { id: 'club_debate', slug: 'debate', name_en: 'Debate & Public Speaking', name_ar: 'نادي المناظرة والخطابة', description_en: 'Weekly practice debates in Arabic and English and preparation for inter-university tournaments.', description_ar: 'مناظرات تدريبية أسبوعية بالعربية والإنجليزية والتحضير للبطولات بين الجامعات.', category: 'culture', lead_id: null, color: '#8B5CF6', campus_id: 'riyadh' },
    { id: 'club_photo', slug: 'photography', name_en: 'Photography Club', name_ar: 'نادي التصوير', description_en: 'Photo walks around Al Khobar, editing sessions and a termly exhibition in the Khobar campus library.', description_ar: 'جولات تصوير في الخبر وجلسات تحرير ومعرض فصلي في مكتبة حرم الخبر.', category: 'arts', lead_id: null, color: '#2F6FDB', campus_id: 'khobar' },
    { id: 'club_volunteer', slug: 'volunteering', name_en: 'Volunteering & Community Service', name_ar: 'نادي التطوع وخدمة المجتمع', description_en: 'Community drives, campus sustainability days and volunteer-hour tracking for graduation clearance.', description_ar: 'حملات مجتمعية وأيام استدامة في الحرم وتوثيق ساعات التطوع.', category: 'community', lead_id: null, color: '#2E9E6B', campus_id: 'riyadh' }
  ];
  for (const c of clubs) d.insert('clubs', { ...c, created_at: on('2026-08-20', '10:00') });

  // ------------------------------------------------------------------ memberships (pending | active | rejected | left)
  const mem = (id: string, club: string, user: string, status: string, role: string, requested: string, decided?: string, by?: string | null, note?: string) =>
    d.insert('memberships', { id, club_id: club, user_id: user, status, role, requested_at: requested, decided_at: decided ?? null, decided_by: by ?? null, note: note ?? null });
  mem('mem_gdg_lead', 'club_gdg', U.lead, 'active', 'lead', on('2026-08-20', '10:05'), on('2026-08-20', '10:05'), U.reviewer, 'Club lead for 2026/27 (Deanship of Student Affairs, demo).');
  mem('mem_gdg_sara', 'club_gdg', U.student, 'active', 'member', on('2026-09-05', '14:20'), on('2026-09-06', '09:10'), U.lead, 'Welcome to the web track!');
  mem('mem_gdg_faisal', 'club_gdg', U.student2, 'pending', 'member', at(-1, '19:42'));
  mem('mem_ent_noura', 'club_entrepreneurship', U.graduating, 'active', 'member', on('2026-09-02', '11:00'), on('2026-09-02', '16:30'), null);
  mem('mem_ent_sara', 'club_entrepreneurship', U.student, 'pending', 'member', at(-3, '12:15'));
  mem('mem_debate_noura', 'club_debate', U.graduating, 'left', 'member', on('2025-09-10', '10:00'), on('2026-06-01', '10:00'), U.graduating, 'Left to focus on the graduation project.');

  // ------------------------------------------------------------------ events (next 3 weeks from ctx.today = 2026-09-27, Sunday)
  const ev = (row: Record<string, unknown>) => d.insert('events', { title_ar: '', description_en: '', tz: 'Asia/Riyadh', campus_id: 'riyadh', location_id: null, venue_text: null, capacity: null, organizer: '', provenance: 'demo', source_url: null, evidence_note: null, deadline: null, eligibility: null, tags: '[]', demo_label: 1, owner_id: null, status: 'scheduled', created_at: on('2026-09-10', '09:00'), ...row });
  ev({ id: 'evt_gdg_web', club_id: 'club_gdg', kind: 'club', title_en: 'Web Dev workshop: build a React dashboard in 2 hours', title_ar: 'ورشة تطوير الويب: ابنِ لوحة تحكم React خلال ساعتين', description_en: 'Hands-on session for the Web Development track. Bring a laptop with Node 22 installed. We build a small dashboard with React 19, fetch data from a mock API and deploy it. Beginners welcome; mentors on every table.', start_at: at(2, '16:00'), end_at: at(2, '18:00'), location_id: 'ryd_room_d105', capacity: 30, organizer: 'GDG on Campus – Al Yamamah', provenance: 'club', tags: j(['track:Web Development', 'workshop', 'beginner']) });
  ev({ id: 'evt_gdg_mentoring', club_id: 'club_gdg', kind: 'club', title_en: 'Web track mentoring circle (small group)', title_ar: 'حلقة إرشاد مسار الويب (مجموعة صغيرة)', description_en: 'Two seats only: bring your side project and get 30 minutes of code review from a track mentor. Demonstrates the waitlist.', start_at: at(3, '13:00'), end_at: at(3, '14:00'), location_id: 'ryd_room_d105', capacity: 2, organizer: 'GDG on Campus – Al Yamamah', provenance: 'club', tags: j(['track:Web Development', 'mentoring']) });
  ev({ id: 'evt_gdg_ctf', club_id: 'club_gdg', kind: 'club', title_en: 'Cybersecurity CTF: capture the flag (beginner tier)', title_ar: 'مسابقة الأمن السيبراني: التقط العلم (مستوى مبتدئ)', description_en: 'Jeopardy-style CTF with web, crypto and forensics challenges. Teams of up to 3. Overlaps the late-morning class block – check your calendar before you RSVP.', start_at: at(7, '11:00'), end_at: at(7, '13:00'), location_id: 'ryd_auditorium', capacity: 60, organizer: 'GDG on Campus – Al Yamamah', provenance: 'club', tags: j(['track:Cybersecurity', 'competition']) });
  ev({ id: 'evt_farq_info', club_id: null, kind: 'university', title_en: 'Farq Hackathon – information session', title_ar: 'هاكاثون فرق – جلسة تعريفية', description_en: 'Student Affairs briefing on the Farq Hackathon tracks, team formation and eligibility. Q&A with last year’s finalists.', start_at: at(1, '11:00'), end_at: at(1, '12:00'), location_id: 'ryd_auditorium', capacity: 200, organizer: 'Deanship of Student Affairs (demo)', provenance: 'university', tags: j(['hackathon', 'info-session']) });
  ev({ id: 'evt_gdg_gamejam', club_id: 'club_gdg', kind: 'club', title_en: 'Game Dev jam kickoff: 48-hour campus jam', title_ar: 'انطلاق هاكاثون تطوير الألعاب: 48 ساعة', description_en: 'Theme reveal, team formation and engine crash course (Godot). Submissions due Sunday night; showcase in the Student Affairs clubs room the week after.', start_at: at(8, '17:00'), end_at: at(8, '19:00'), location_id: 'ryd_room_b305', capacity: 25, organizer: 'GDG on Campus – Al Yamamah', provenance: 'club', tags: j(['track:Game Development', 'jam']) });
  ev({ id: 'evt_ent_pitch', club_id: 'club_entrepreneurship', kind: 'club', title_en: 'Pitch night: 3 minutes, 3 slides', title_ar: 'ليلة العروض: 3 دقائق و3 شرائح', description_en: 'Eight student teams pitch to a panel of alumni founders. Audience votes for the crowd favourite.', start_at: at(9, '18:00'), end_at: at(9, '20:00'), location_id: 'ryd_room_c220', capacity: 40, organizer: 'Entrepreneurship Club', provenance: 'club', tags: j(['pitch']) });
  ev({ id: 'evt_gdg_iot', club_id: 'club_gdg', kind: 'club', title_en: 'IoT & Robotics lab night: sensors to dashboard', title_ar: 'ليلة معمل إنترنت الأشياء والروبوتات: من الحساسات إلى لوحة التحكم', description_en: 'Wire an ESP32 to a temperature sensor, publish over MQTT and chart it live. Kits provided by IT & Student Affairs (limited).', start_at: at(10, '18:00'), end_at: at(10, '20:30'), location_id: 'ryd_room_it_lab', capacity: 20, organizer: 'GDG on Campus – Al Yamamah', provenance: 'club', tags: j(['track:IoT & Robotics', 'lab']) });
  ev({ id: 'evt_photo_walk', club_id: 'club_photo', kind: 'club', title_en: 'Khobar corniche photo walk', title_ar: 'جولة تصوير على كورنيش الخبر', description_en: 'Meet at the Khobar campus cafeteria, then a golden-hour walk along the corniche. Phones welcome.', start_at: at(13, '16:00'), end_at: at(13, '18:00'), campus_id: 'khobar', location_id: 'khb_cafe', capacity: 15, organizer: 'Photography Club', provenance: 'club', tags: j(['photo-walk']) });
  ev({ id: 'evt_vol_cleanup', club_id: 'club_volunteer', kind: 'club', title_en: 'Campus green day: tree planting', title_ar: 'يوم الحرم الأخضر: زراعة الأشجار', description_en: 'Two volunteer hours counted towards your community-service record. Gloves and saplings provided.', start_at: at(6, '08:00'), end_at: at(6, '10:00'), location_id: 'ryd_sports', capacity: 50, organizer: 'Volunteering & Community Service', provenance: 'club', tags: j(['volunteering']) });
  // External listings (labelled demo data with provenance)
  ev({ id: 'evt_ext_farq', club_id: null, kind: 'external', title_en: 'Farq Hackathon – Student Journey track', title_ar: 'هاكاثون فرق – مسار رحلة الطالب', description_en: 'Three-day hackathon hosted at the Khobar campus. Teams prototype connected student-journey services. Registration closes before the event; bring your student ID for check-in.', start_at: on('2026-10-14', '09:00'), end_at: on('2026-10-16', '18:00'), campus_id: 'khobar', location_id: 'khb_main', venue_text: 'Al Yamamah University, Khobar campus', capacity: null, organizer: 'Al Yamamah University', provenance: 'external', source_url: 'https://www.farq-hackathon-yu.com/tracks/student-journey', evidence_note: 'Listing reproduced for the demo from the organizer page. Verify dates, venue and eligibility on the source URL before relying on it.', deadline: '2026-10-10', eligibility: 'Teams of 2–5 currently enrolled university students; one track per team.', tags: j(['hackathon', 'external']) });
  ev({ id: 'evt_ext_scpc', club_id: null, kind: 'external', title_en: 'Saudi Collegiate Programming Contest – demo listing', title_ar: 'مسابقة البرمجة الجامعية السعودية – إدراج تجريبي', description_en: 'National ICPC-style team contest (3 students per team, 5 hours, 10–12 problems). This entry is a demo placeholder to show how external competitions appear; details are not verified.', start_at: on('2026-10-17', '09:00'), end_at: on('2026-10-17', '17:00'), campus_id: null, location_id: null, venue_text: 'Host university to be announced (demo)', capacity: null, organizer: 'Contest organizing committee (demo listing)', provenance: 'external', source_url: null, evidence_note: 'Demo listing modelled on national collegiate programming contests. No verified source URL – treat as illustrative.', deadline: '2026-10-05', eligibility: 'Undergraduate students; max 3 per team; coach optional.', tags: j(['competition', 'external', 'programming']) });
  // Past event (for the verified achievement)
  ev({ id: 'evt_gdg_past_ts', club_id: 'club_gdg', kind: 'club', title_en: 'Web track: intro to TypeScript (week 2)', title_ar: 'مسار الويب: مقدمة في TypeScript', description_en: 'First workshop of the term: types, interfaces and generics with live coding.', start_at: on('2026-09-15', '16:00'), end_at: on('2026-09-15', '18:00'), location_id: 'ryd_room_d105', capacity: 30, organizer: 'GDG on Campus – Al Yamamah', provenance: 'club', status: 'completed', tags: j(['track:Web Development', 'workshop']), created_at: on('2026-09-01', '09:00') });
  // Personal event for Sara (owner-only)
  ev({ id: 'evt_personal_dentist', club_id: null, kind: 'personal', title_en: 'Dentist', title_ar: 'موعد طبيب الأسنان', description_en: 'Personal appointment (owner-only).', start_at: at(11, '17:00'), end_at: at(11, '18:00'), venue_text: 'Dental clinic (personal)', organizer: 'Sara Al-Otaibi', provenance: 'personal', demo_label: 0, owner_id: U.student, created_at: on('2026-09-20', '20:00') });
  upsertEntry(U.student, { source_type: 'personal', source_id: 'evt_personal_dentist', title: 'Dentist', kind: 'personal', start_at: at(11, '17:00'), end_at: at(11, '18:00'), location_text: 'Dental clinic (personal)', link: '/campus/events/evt_personal_dentist' });

  // ------------------------------------------------------------------ RSVPs (+ exactly one calendar entry per going RSVP)
  const venue = (locId: string) => {
    const l = d.get('SELECT name_en, building_id FROM campus_locations WHERE id = ?', locId);
    const b = l?.building_id ? d.get('SELECT name_en FROM campus_locations WHERE id = ?', l.building_id as string) : null;
    return b ? `${l!.name_en} · ${b.name_en}` : (l?.name_en as string) ?? '';
  };
  const rsvp = (id: string, event: string, user: string, status: 'going' | 'waitlisted' | 'cancelled', when: string) => {
    d.insert('rsvps', { id, event_id: event, user_id: user, status, created_at: when, updated_at: when });
    if (status === 'going') {
      const e = d.get('SELECT * FROM events WHERE id = ?', event)!;
      upsertEntry(user, { source_type: 'event', source_id: event, title: e.title_en as string, kind: 'event', start_at: e.start_at as string, end_at: e.end_at as string, location_id: (e.location_id as string | null) ?? null, location_text: e.location_id ? venue(e.location_id as string) : (e.venue_text as string | null), immovable: false, link: `/campus/events/${event}`, meta: { club_id: e.club_id, event_kind: e.kind } });
    }
  };
  rsvp('rsvp_sara_web', 'evt_gdg_web', U.student, 'going', on('2026-09-22', '18:30'));
  rsvp('rsvp_layan_web', 'evt_gdg_web', U.lead, 'going', on('2026-09-12', '09:00'));
  rsvp('rsvp_layan_mentoring', 'evt_gdg_mentoring', U.lead, 'going', on('2026-09-12', '09:05'));
  rsvp('rsvp_noura_mentoring', 'evt_gdg_mentoring', U.graduating, 'going', on('2026-09-18', '10:00'));
  rsvp('rsvp_faisal_mentoring', 'evt_gdg_mentoring', U.student2, 'waitlisted', on('2026-09-21', '15:00'));
  rsvp('rsvp_noura_pitch', 'evt_ent_pitch', U.graduating, 'going', on('2026-09-20', '12:00'));
  rsvp('rsvp_faisal_farq', 'evt_ext_farq', U.student2, 'going', on('2026-09-24', '13:00'));
  rsvp('rsvp_layan_past', 'evt_gdg_past_ts', U.lead, 'going', on('2026-09-10', '09:00'));
  rsvp('rsvp_sara_past', 'evt_gdg_past_ts', U.student, 'going', on('2026-09-11', '09:00'));

  // ------------------------------------------------------------------ achievements (only after a verified action)
  d.insert('achievements', { id: 'ach_layan_ts', user_id: U.lead, title_en: 'Organized the GDG Web Development workshop series (Fall 2026)', title_ar: 'تنظيم سلسلة ورش تطوير الويب في GDG (خريف 2026)', kind: 'organizer', event_id: 'evt_gdg_past_ts', club_id: 'club_gdg', verified_by: U.reviewer, evidence_document_id: null, created_at: on('2026-09-16', '11:00') });

  // ------------------------------------------------------------------ resources (original study notes + PDF)
  seedResources(ctx);

  // ------------------------------------------------------------------ lost & found
  seedLostFound(ctx);
}

// ====================================================================== resources
interface ResSeed { id: string; course: string; term: string; type: string; title: string; description: string; author: string; status: string; helpful: number; downloads: number; pages: number; created: string; text: string; lang?: string }

function seedResources(ctx: SeedContext) {
  const { db: d, users: U } = ctx;
  const items: ResSeed[] = [
    { id: 'res_os_sched', course: 'CIS 321', term: '2025-2', type: 'notes', title: 'CPU scheduling in one page: FCFS, SJF, priority, round robin', description: 'My lecture notes with worked Gantt examples and the formulas for waiting and turnaround time.', author: U.lead, status: 'published', helpful: 14, downloads: 62, pages: 3, created: '2026-09-03T10:00:00+03:00', text:
`A scheduler decides which ready process gets the CPU next. First-come first-served (FCFS) runs processes in arrival order; it is simple but suffers from the convoy effect, where one long CPU burst delays every short process behind it. Shortest job first (SJF) picks the process with the smallest next CPU burst and is provably optimal for average waiting time, but the burst length has to be predicted, usually with an exponential average of previous bursts.

Priority scheduling generalises SJF: each process carries a priority and the highest priority runs first. The danger is starvation of low-priority processes, which is fixed with ageing (raising a process's priority the longer it waits). Round robin (RR) gives every process a fixed quantum, typically 10 to 100 ms, and preempts it when the quantum expires. A quantum that is too small wastes time on context switches; one that is too large degrades to FCFS.

For every exam question draw the Gantt chart first. Waiting time equals completion time minus arrival time minus burst time; turnaround time equals completion time minus arrival time. Average them over all processes and state which algorithm you used and whether it was preemptive.` },
    { id: 'res_os_midterm', course: 'CIS 321', term: '2025-2', type: 'past_exam', title: 'Operating Systems midterm practice set (self-written, with answers)', description: 'Twelve practice questions I wrote while revising: processes vs threads, scheduling, synchronisation. Not an official exam.', author: U.graduating, status: 'published', helpful: 9, downloads: 41, pages: 4, created: '2026-08-28T15:30:00+03:00', text:
`These questions are my own revision material and are not copies of any official exam. Question 1: explain the difference between a process and a thread in terms of address space, stack and scheduling. Answer: threads of one process share the address space and open files but each has its own stack and program counter; the kernel schedules threads, so a blocked thread does not block its siblings.

Question 2: a system runs P1 (burst 8), P2 (burst 4) and P3 (burst 2), all arriving at time 0. Compute the average waiting time under FCFS and SJF. Answer: FCFS waits are 0, 8 and 12 (average 6.67); SJF runs P3, P2, P1 with waits 0, 2 and 6 (average 2.67).

Question 3: what are the four necessary conditions for deadlock and which one does ordered resource allocation break? Answer: mutual exclusion, hold and wait, no preemption and circular wait; imposing a global order on resource acquisition prevents circular wait.` },
    { id: 'res_ai_search', course: 'CIS 316', term: '2026-1', type: 'summary', title: 'Search algorithms compared: BFS, DFS, uniform cost, greedy and A*', description: 'One-page comparison table plus when to use each. Includes the admissibility condition for A*.', author: U.lead, status: 'published', helpful: 11, downloads: 38, pages: 2, created: '2026-09-14T12:00:00+03:00', text:
`Uninformed search knows nothing about the goal except a goal test. Breadth-first search expands the shallowest frontier node first, is complete and optimal for unit step costs, but its memory grows exponentially with depth. Depth-first search expands the deepest node first, uses linear memory, but is neither complete on infinite trees nor optimal. Uniform-cost search orders the frontier by path cost g(n) and is optimal for any positive step costs.

Informed search uses a heuristic h(n) that estimates the cost to the goal. Greedy best-first expands the node with the smallest h(n); it is fast but can wander. A* orders by f(n) = g(n) + h(n) and is optimal when h is admissible (never overestimates) and, for graph search, consistent (h(n) <= c(n, n') + h(n')).

Exam tip: when asked to trace A*, keep a table with columns node, g, h, f and parent, and pop the smallest f each step. Straight-line distance is the classic admissible heuristic for route finding, which is exactly what the campus map uses as intuition.` },
    { id: 'res_arch_layers', course: 'SWE 302', term: '2026-1', type: 'notes', title: 'Lecture 4 notes: layered, hexagonal and clean architecture', description: 'Diagrams redrawn from the lecture with my own explanation of dependency direction and the ports/adapters idea.', author: U.graduating, status: 'published', helpful: 17, downloads: 73, pages: 5, created: '2026-09-18T09:15:00+03:00', text:
`Layered architecture stacks presentation, application, domain and infrastructure layers, and the rule is that dependencies point downward only. It is easy to explain and to test layer by layer, but business logic tends to leak into controllers and the database schema ends up shaping the domain.

Hexagonal architecture (ports and adapters) puts the domain in the centre and defines ports, which are interfaces the domain owns. Adapters on the outside implement those ports: a REST controller is a driving adapter, a SQL repository is a driven adapter. Because the domain never imports an adapter, you can swap SQLite for Postgres or a real portal for a demo one, which is the pattern UniJourney uses for its adapters.

Clean architecture is the same idea with named rings: entities, use cases, interface adapters and frameworks. The dependency rule says source code dependencies can only point inward. For the assignment, justify your choice by naming the change you expect most often and showing that it touches only one ring.` },
    { id: 'res_arch_tactics', course: 'SWE 302', term: '2025-2', type: 'cheatsheet', title: 'Quality attributes and architectural tactics cheat sheet', description: 'Availability, performance, modifiability, security and their standard tactics, formatted for the open-book quiz.', author: U.lead, status: 'published', helpful: 8, downloads: 29, pages: 1, created: '2026-05-02T18:00:00+03:00', text:
`Availability tactics detect faults (ping/echo, heartbeat, exception detection), recover from them (active or passive redundancy, rollback, retry) and prevent them (removal from service, transactions). Performance tactics either control resource demand (limit event rate, bound execution time, prioritise events) or manage resources (introduce concurrency, replicate data, caching).

Modifiability tactics reduce the size of a module (split it), increase cohesion, and reduce coupling through encapsulation, intermediaries and abstracting common services. Security tactics are grouped as detect (intrusion detection, message integrity), resist (authenticate, authorise, encrypt, limit access), react (revoke access, lock computer) and recover (audit trail, restore).

Write the attribute scenario in six parts: source, stimulus, artifact, environment, response and response measure. A tactic is only justified when you can point at the response measure it improves.` },
    { id: 'res_ui_state', course: 'SWE 312', term: '2026-1', type: 'slides', title: 'Component state and unidirectional data flow (summary slides)', description: 'Six summary slides on lifting state, controlled inputs and why props flow down and events flow up.', author: U.lead, status: 'published', helpful: 6, downloads: 22, pages: 6, created: '2026-09-21T13:40:00+03:00', text:
`Slide 1: a component owns state when it is the closest common ancestor of every view that needs it. Lifting state up means moving it to that ancestor and passing it down as props. Slide 2: a controlled input has its value driven by state and reports changes through an onChange handler, so the single source of truth is the state, never the DOM.

Slide 3: unidirectional data flow means props go down the tree and events bubble up through callbacks. It makes rendering predictable because a change in one place cannot silently mutate another. Slide 4: derived values should be computed during render rather than stored, to avoid two states drifting apart.

Slide 5: keep server data and UI state separate; refetch after a mutation instead of patching a copy by hand. Slide 6: for the lab, draw the component tree first, mark where each piece of state lives, then write the code.` },
    { id: 'res_web_rest', course: 'SWE 322', term: '2026-1', type: 'notes', title: 'REST API design checklist for the course project', description: 'Naming, status codes, idempotency and error envelopes: what the graders look for in the project API.', author: U.graduating, status: 'published', helpful: 12, downloads: 47, pages: 3, created: '2026-09-11T16:10:00+03:00', text:
`Resources are nouns in plural form (/clubs, /clubs/{id}/events) and HTTP methods carry the verb. GET reads and must not change state, POST creates or triggers an action, PUT replaces, PATCH updates partially and DELETE removes. Use 201 for a created resource, 204 for a successful delete with no body, 400 for validation errors, 403 when the caller is authenticated but not allowed, 404 when the record does not exist for that caller and 409 for state conflicts such as double booking.

Every write that a client might retry should be idempotent or accept an idempotency key, so a double click never creates two RSVPs. Return one consistent error envelope, for example {"ok": false, "error": {"code": "...", "message": "..."}}, and document every code you use.

Paginate lists with limit and cursor parameters, filter with query strings rather than new endpoints, and version the API in the path only when you must break clients. Finally, never trust identifiers from the client for ownership: derive the owner from the session on the server.` },
    { id: 'res_arch_pipeline', course: 'CIS 304', term: '2026-1', type: 'summary', title: 'Pipelining hazards summary: structural, data and control', description: 'What each hazard is, how forwarding and stalls fix data hazards, and how branch prediction reduces control hazards.', author: U.student2, status: 'published', helpful: 5, downloads: 19, pages: 2, created: '2026-09-19T21:05:00+03:00', text:
`A pipelined processor overlaps the fetch, decode, execute, memory and write-back stages of consecutive instructions. A structural hazard appears when two stages need the same hardware in the same cycle, such as a single memory port used for both instruction fetch and data access; separate caches remove it.

A data hazard occurs when an instruction depends on the result of an earlier one that has not been written back yet. Forwarding routes the ALU result directly to the next instruction's input; when the producer is a load, one stall cycle is still needed because the value is only available after the memory stage.

Control hazards come from branches: the pipeline does not know the next address until the branch resolves. Static prediction assumes not taken, dynamic predictors use a history table, and the misprediction penalty equals the number of stages between fetch and resolution. Count the stalls in an exam trace by drawing one row per instruction and one column per cycle.` },
    { id: 'res_req_stories', course: 'SWE 301', term: '2026-1', type: 'notes', title: 'Writing testable user stories and acceptance criteria', description: 'Template and examples from our team project. Pending moderation (uploaded today).', author: U.graduating, status: 'pending', helpful: 0, downloads: 0, pages: 2, created: '2026-09-27T08:20:00+03:00', text:
`A user story states who wants what and why: as a club lead, I want to approve join requests, so that only students I know join the private group. The story is a promise to have a conversation, not a specification, so the acceptance criteria carry the detail.

Write acceptance criteria in the given/when/then form and keep each one independently checkable: given a pending request, when the lead approves it, then the member status becomes active and the student receives a notification. A criterion that cannot fail is not a criterion.

Split stories that take longer than a sprint along workflow steps, business rules or data variations, never along technical layers, because a database-only story delivers nothing a user can accept.` },
    { id: 'res_la_eigen', course: 'MTH 301', term: '2025-2', type: 'cheatsheet', title: 'Eigenvalues and diagonalisation quick reference', description: 'The steps for finding eigenvalues, eigenvectors and diagonalising a matrix, with the two most common traps.', author: U.lead, status: 'published', helpful: 10, downloads: 55, pages: 1, created: '2026-04-15T10:30:00+03:00', text:
`To find the eigenvalues of a square matrix A, solve the characteristic equation det(A - λI) = 0. For a 2 by 2 matrix this is λ² - (trace A)λ + det A = 0, which gives a fast check: the eigenvalues must sum to the trace and multiply to the determinant.

For each eigenvalue λ, the eigenvectors are the non-zero solutions of (A - λI)v = 0; row-reduce and read the free variables. A is diagonalisable when the eigenvectors form a basis, which is guaranteed when all eigenvalues are distinct. Then A = PDP⁻¹ with the eigenvectors as the columns of P and the eigenvalues on the diagonal of D in the same order.

Trap one: a repeated eigenvalue with fewer independent eigenvectors than its multiplicity means A is not diagonalisable. Trap two: the order of columns in P must match the order of entries in D, or PDP⁻¹ will not reproduce A.` },
    { id: 'res_net_tcp', course: 'CNE 200', term: '2026-1', type: 'notes', title: 'TCP in practice: three-way handshake, flow control and congestion control', description: 'Sequence diagrams drawn from the Packet Tracer lab plus the difference between rwnd and cwnd.', author: U.student2, status: 'published', helpful: 7, downloads: 33, pages: 3, created: '2026-09-16T19:45:00+03:00', text:
`A TCP connection starts with a three-way handshake: the client sends SYN with an initial sequence number, the server replies SYN-ACK acknowledging it and offering its own number, and the client answers ACK. Only after the third segment can data flow, which is why a lost SYN-ACK shows up as a retransmission after the RTO timer.

Flow control protects the receiver: it advertises a receive window (rwnd) in every segment and the sender never has more unacknowledged bytes in flight than that. Congestion control protects the network: the sender keeps a congestion window (cwnd) that grows by one MSS per RTT in congestion avoidance and doubles per RTT in slow start, and it halves on loss.

The effective window is the minimum of rwnd and cwnd. In the lab, the capture showed the window scaling option in the SYN segments, which is what lets modern hosts advertise windows larger than 65,535 bytes.` },
    { id: 'res_os_deadlock', course: 'CIS 321', term: '2026-1', type: 'summary', title: 'Deadlock: conditions, prevention, avoidance and the Banker’s algorithm', description: 'Reported by a student for possibly copying textbook pages – under review.', author: U.student2, status: 'reported', helpful: 2, downloads: 8, pages: 2, created: '2026-09-24T22:10:00+03:00', text:
`Deadlock needs four conditions at once: mutual exclusion, hold and wait, no preemption and circular wait. Prevention removes one of them by design, for example by requesting all resources up front or by ordering resource types.

Avoidance keeps the system in a safe state: the Banker's algorithm checks, before granting a request, whether some ordering of the remaining processes can still finish with the resources that would remain. If no such ordering exists the request is delayed.

Detection lets deadlocks happen and periodically searches the wait-for graph for cycles; recovery then aborts a process or preempts a resource. Most desktop operating systems choose detection or simply ignore the problem because deadlocks are rare in practice.` }
  ];
  for (const r of items) {
    const lines = [r.title, `${r.course} · ${r.term} · ${r.type}`, 'Original study notes shared on UniJourney (synthetic demo).', '', ...wrap(r.text, 90)];
    const doc = createDocumentFromBuffer(r.author, 'resource', `${r.id}.pdf`, 'application/pdf', makePdf(lines, r.title), r.title, { resource_id: r.id });
    d.insert('resources', { id: r.id, course_code: r.course, term: r.term, type: r.type, title: r.title, description: r.description, author_id: r.author, document_id: doc.id, content_text: r.text, rights_confirmed: 1, status: r.status, helpful_count: r.helpful, downloads: r.downloads, pages: r.pages, language: r.lang ?? 'en', moderated_by: r.status === 'published' ? U.reviewer : null, moderation_note: r.status === 'published' ? 'Original notes; rights confirmed by the author.' : null, created_at: r.created });
  }
  const bm = (user: string, res: string, when: string) => d.insert('resource_bookmarks', { user_id: user, resource_id: res, created_at: when });
  bm(U.student, 'res_os_sched', '2026-09-20T10:00:00+03:00');
  bm(U.student, 'res_arch_layers', '2026-09-22T11:30:00+03:00');
  bm(U.lead, 'res_web_rest', '2026-09-12T09:00:00+03:00');
  const vote = (user: string, res: string, when: string) => d.insert('resource_votes', { user_id: user, resource_id: res, created_at: when });
  vote(U.student, 'res_os_sched', '2026-09-20T10:01:00+03:00');
  vote(U.student, 'res_ai_search', '2026-09-20T10:02:00+03:00');
  vote(U.student, 'res_arch_tactics', '2026-09-20T10:03:00+03:00');
  vote(U.lead, 'res_arch_layers', '2026-09-19T08:00:00+03:00');
  vote(U.graduating, 'res_os_sched', '2026-09-04T12:00:00+03:00');
  d.insert('resource_reports', { id: 'rep_deadlock', resource_id: 'res_os_deadlock', reporter_id: U.student, reason: 'The second paragraph looks copied from the course textbook; please check the rights confirmation.', status: 'open', created_at: '2026-09-26T09:40:00+03:00' });
}

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n\s*\n/)) {
    let line = '';
    for (const w of para.split(/\s+/)) {
      if ((line + ' ' + w).trim().length > width) { out.push(line.trim()); line = w; }
      else line = `${line} ${w}`;
    }
    if (line.trim()) out.push(line.trim());
    out.push('');
  }
  return out;
}

// ====================================================================== lost & found
function seedLostFound(ctx: SeedContext) {
  const { db: d, users: U, today } = ctx;
  const day = (n: number) => addDays(today, n);
  const ts = (n: number, time: string) => localToIso(day(n), time);
  const photo = createDocumentFromBuffer(U.student, 'lost_item', 'black-backpack.png', 'image/png', makePng(96, 96, [34, 32, 30]), 'Photo of the backpack (synthetic)');
  const insert = (row: Record<string, unknown>, timeline: unknown[]) => d.insert('lost_found_requests', { campus_id: 'riyadh', category: 'other', last_location_id: null, last_location_text: '', description: '', document_id: null, status: 'reported', collection_location_id: null, collection_note: null, found_by: null, found_at: null, handover: null, ...row, timeline: j(timeline) });

  // 1. Sara – black backpack – reported today (matches found item fi_backpack)
  insert({ id: 'lf_sara_backpack', public_id: 'YU-K7QX-3NM2P', owner_id: U.student, item: 'Black backpack', category: 'bags', lost_date: day(-1), last_location_id: 'ryd_library', last_location_text: 'Library & Learning Commons – 2nd floor study room', description: 'Black backpack with a laptop sleeve, a blue water bottle in the side pocket and a folder of CIS 321 notes. Small orange keychain on the zip.', contact_email: 'sara.demo@student.yu-demo.invalid', document_id: photo.id, created_at: ts(0, '08:35'), updated_at: ts(0, '08:35') },
    [{ at: ts(0, '08:35'), status: 'reported', by: U.student, note: 'Request submitted by the student.' }]);
  // 2. Sara – student ID card – found, ready at security (older case)
  insert({ id: 'lf_sara_idcard', public_id: 'YU-M4RT-8WQ2C', owner_id: U.student, item: 'Student ID card', category: 'documents', lost_date: '2026-09-22', last_location_id: 'ryd_cafeteria', last_location_text: 'Cafeteria & Food Court', description: 'University ID card in a clear sleeve.', contact_email: 'sara.demo@student.yu-demo.invalid', status: 'ready_for_collection', collection_location_id: 'ryd_security', collection_note: 'Ask for the lost & found box at the main gate desk.', found_by: U.security, found_at: '2026-09-24T13:10:00+03:00', created_at: '2026-09-23T09:05:00+03:00', updated_at: '2026-09-24T13:12:00+03:00' },
    [{ at: '2026-09-23T09:05:00+03:00', status: 'reported', by: U.student, note: 'Request submitted by the student.' }, { at: '2026-09-23T14:00:00+03:00', status: 'searching', by: U.security, note: 'Checked cafeteria desk; asked cleaning staff.' }, { at: '2026-09-24T13:10:00+03:00', status: 'found', by: U.security, note: 'Handed in at the main gate.' }, { at: '2026-09-24T13:12:00+03:00', status: 'ready_for_collection', by: U.security, note: 'Ready for collection at Security Office (Main Gate). Owner notified.', collection_location_id: 'ryd_security', email_id: 'eml_seed_idcard' }]);
  // 3. Layan – earbuds – searching (reported yesterday)
  insert({ id: 'lf_layan_earbuds', public_id: 'YU-P2HN-5ZXK9', owner_id: U.lead, item: 'Wireless earbuds case (white)', category: 'electronics', lost_date: day(-1), last_location_id: 'ryd_room_d105', last_location_text: 'Clubs Room (Student Affairs)', description: 'White charging case, small scratch on the lid, initials L.H. inside.', contact_email: 'layan.demo@student.yu-demo.invalid', status: 'searching', created_at: ts(-1, '17:20'), updated_at: ts(-1, '18:05') },
    [{ at: ts(-1, '17:20'), status: 'reported', by: U.lead, note: 'Request submitted by the student.' }, { at: ts(-1, '18:05'), status: 'searching', by: U.security, note: 'Security is searching for the item.' }]);
  // 4. Noura – calculator – found (before collection point confirmed)
  insert({ id: 'lf_noura_calc', public_id: 'YU-D8VB-2QJ7M', owner_id: U.graduating, item: 'Graphing calculator', category: 'electronics', lost_date: '2026-09-20', last_location_id: 'ryd_room_c220', last_location_text: 'Najd Auditorium', description: 'Grey graphing calculator with a cracked slide cover and a name label on the back.', contact_email: 'noura.demo@student.yu-demo.invalid', status: 'found', found_by: U.security, found_at: '2026-09-25T10:00:00+03:00', created_at: '2026-09-20T15:30:00+03:00', updated_at: '2026-09-25T10:00:00+03:00' },
    [{ at: '2026-09-20T15:30:00+03:00', status: 'reported', by: U.graduating, note: 'Request submitted by the student.' }, { at: '2026-09-25T10:00:00+03:00', status: 'found', by: U.security, note: 'Found by the Najd Auditorium lecturer; awaiting transfer to the security desk.' }]);
  // 5. Faisal (Khobar) – hoodie – collected
  insert({ id: 'lf_faisal_hoodie', public_id: 'YU-T6WC-9RNL4', owner_id: U.student2, campus_id: 'khobar', item: 'Grey hoodie', category: 'clothing', lost_date: '2026-09-14', last_location_id: 'khb_room_e101', last_location_text: 'E-101 Networks Lab', description: 'Grey zip hoodie, size M, university logo on the chest.', contact_email: 'faisal.demo@student.yu-demo.invalid', status: 'collected', collection_location_id: 'khb_security', found_by: U.security, found_at: '2026-09-15T11:00:00+03:00', handover: j({ at: '2026-09-16T12:30:00+03:00', by: U.security, verified_by: 'student_id_card', receiver_name_confirmed: true, receiver: 'Faisal Al-Dossari', note: null }), created_at: '2026-09-15T08:10:00+03:00', updated_at: '2026-09-16T12:30:00+03:00' },
    [{ at: '2026-09-15T08:10:00+03:00', status: 'reported', by: U.student2, note: 'Request submitted by the student.' }, { at: '2026-09-15T11:00:00+03:00', status: 'found', by: U.security, note: 'Left in the lab; collected by security.' }, { at: '2026-09-15T11:02:00+03:00', status: 'ready_for_collection', by: U.security, note: 'Ready for collection at Security Desk (Gate 1). Owner notified.', collection_location_id: 'khb_security' }, { at: '2026-09-16T12:30:00+03:00', status: 'collected', by: U.security, note: 'Handed over to Faisal Al-Dossari (verified by student id card).' }]);
  // 6. Noura – USB drive – closed (not found)
  insert({ id: 'lf_noura_usb', public_id: 'YU-H3ZF-7KPD6', owner_id: U.graduating, item: 'USB flash drive (32 GB)', category: 'electronics', lost_date: '2026-08-18', last_location_id: 'ryd_room_lib_2f', last_location_text: 'Library – Study Room 2F', description: 'Small silver USB drive with a red cap.', contact_email: 'noura.demo@student.yu-demo.invalid', status: 'closed', created_at: '2026-08-20T10:00:00+03:00', updated_at: '2026-09-19T10:00:00+03:00' },
    [{ at: '2026-08-20T10:00:00+03:00', status: 'reported', by: U.graduating, note: 'Request submitted by the student.' }, { at: '2026-08-21T09:00:00+03:00', status: 'searching', by: U.security, note: 'Security is searching for the item.' }, { at: '2026-09-19T10:00:00+03:00', status: 'closed', by: U.security, note: 'Closed after 30 days without a match. Re-open by submitting a new request if it turns up.' }]);

  // Seeded email preview for the ID-card case so the outbox shows the branded message.
  const seededEmail = sendEmail({ toUserId: U.student, toAddress: 'sara.demo@student.yu-demo.invalid', module: 'campus', subject: 'Your item has been found – YU-M4RT-8WQ2C', html: foundEmailHtml({ name: 'Sara Al-Otaibi', item: 'Student ID card', publicId: 'YU-M4RT-8WQ2C', location: 'Security Office (Main Gate)', note: 'Ask for the lost & found box at the main gate desk.', description: 'University ID card in a clear sleeve.' }), text: 'Your item has been found – YU-M4RT-8WQ2C. Collect it from Security Office (Main Gate) with your student ID.' });
  d.run("UPDATE lost_found_requests SET timeline = REPLACE(timeline, 'eml_seed_idcard', ?) WHERE id = 'lf_sara_idcard'", seededEmail.id);
  d.run('UPDATE email_outbox SET created_at = ? WHERE id = ?', '2026-09-24T13:12:00+03:00', seededEmail.id);
  notify(U.student, { module: 'campus', kind: 'lost_found_found', title: 'Your item has been found: Student ID card', body: 'Collect it from Security Office (Main Gate). Bring your student ID and request ID YU-M4RT-8WQ2C.', link: '/campus/lost-found/lf_sara_idcard' });
  d.run("UPDATE notifications SET created_at = '2026-09-24T13:12:00+03:00', read_at = '2026-09-24T18:00:00+03:00' WHERE link = '/campus/lost-found/lf_sara_idcard'");

  // Found items held by security (one clearly matching Sara's backpack)
  d.insert('found_items', { id: 'fi_backpack', campus_id: 'riyadh', reported_by: U.security, item: 'Black backpack with laptop sleeve', category: 'bags', description: 'Black backpack, laptop sleeve, blue water bottle in the side pocket, orange keychain. Found under a table in the library study area.', found_location_id: 'ryd_library', found_date: today, held_at_location_id: 'ryd_security', matched_request_id: null, status: 'held', created_at: ts(0, '08:50') });
  d.insert('found_items', { id: 'fi_umbrella', campus_id: 'riyadh', reported_by: U.security, item: 'Blue folding umbrella', category: 'accessories', description: 'Navy blue folding umbrella, no name tag.', found_location_id: 'ryd_cafeteria', found_date: day(-1), held_at_location_id: 'ryd_security', matched_request_id: null, status: 'held', created_at: ts(-1, '14:20') });
}
