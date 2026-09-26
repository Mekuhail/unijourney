import type { SeedContext } from '../../seed/context.ts';
import { j } from '../../core/db.ts';
import { addDays, localToIso, nowIso } from '../../core/clock.ts';
import { getUser } from '../../core/auth.ts';
import { demoDomain } from '../../adapters/mailbox.ts';
import { normalizeUrl } from './shared.ts';
import { createApplication, addInterview, recordEvent } from './applications.ts';
import { insertEmail } from './emails.ts';
import { seedCompetitions } from './competitions.ts';

interface OppSeed { id: string; source_id: string; url: string; title: string; company: string; type: string; location: string; city: string; remote: string; field: string; skills: string[]; eligibility: string; deadline: string | null; posted: number; description: string; salary?: string; status?: string }

/** All companies are fictional or fictionalised; URLs are synthetic (example-demo.sa). */
export function opportunitySeeds(today: string): OppSeed[] {
  const d = (n: number) => addDays(today, n);
  return [
    { id: 'opp_stc_swe_intern', source_id: 'stc-2027-swe-intern', url: 'https://careers.example-demo.sa/stc/software-intern-2027?utm_source=demo', title: 'Software Engineering Intern – Summer 2027', company: 'Najd Telecom', type: 'internship', location: 'Riyadh HQ', city: 'Riyadh', remote: 'onsite', field: 'software', skills: ['Java', 'SQL', 'Git', 'REST APIs'], eligibility: 'Current YU students in level 5 or above; software engineering or computer science.', deadline: d(35), posted: -6, description: 'Ten-week summer placement inside the digital platforms group. Interns ship small features end to end with a mentor, from API design to release. A final demo day closes the programme.', salary: 'SAR 4,000 / month' },
    { id: 'opp_aratech_coop', source_id: 'aratech-coop-2027', url: 'https://careers.example-demo.sa/aratech/coop-software-2027', title: 'Co-op Software Developer (6 months)', company: 'AraTech Digital', type: 'coop', location: 'Riyadh – Digital City', city: 'Riyadh', remote: 'hybrid', field: 'software', skills: ['JavaScript', 'React', 'Node.js', 'SQL'], eligibility: 'Current YU students who completed 90 credit hours; counts toward CIS 490 co-op with faculty approval.', deadline: d(20), posted: -10, description: 'A full-time cooperative assignment on a customer-facing web product. You will own a feature area, attend sprint rituals and present your work to stakeholders. Fits the university co-op requirement (verify with your adviser).', salary: 'SAR 5,500 / month' },
    { id: 'opp_ailab_intern', source_id: 'nail-ml-intern-2027', url: 'https://careers.example-demo.sa/national-ai-lab/ml-intern', title: 'Machine Learning Intern', company: 'Riyadh AI Lab', type: 'internship', location: 'Riyadh', city: 'Riyadh', remote: 'onsite', field: 'data & ai', skills: ['Python', 'Machine Learning', 'Statistics', 'SQL'], eligibility: 'Undergraduate students with at least one AI course.', deadline: d(42), posted: -3, description: 'Work with applied scientists on model evaluation for Arabic speech and text. Expect notebooks, experiment tracking and a lot of data cleaning. Twelve weeks, on site.', salary: 'SAR 3,500 / month' },
    { id: 'opp_elm_entry', source_id: 'elm-graduate-dev-2027', url: 'https://careers.example-demo.sa/elm/graduate-software-developer', title: 'Graduate Software Developer', company: 'Raqmi Digital', type: 'entry', location: 'Riyadh', city: 'Riyadh', remote: 'hybrid', field: 'software', skills: ['Java', 'Spring', 'SQL', 'Docker'], eligibility: 'Graduating students and graduates (class of 2026/2027).', deadline: d(60), posted: -12, description: 'Entry-level role on government digital services. New graduates join a rotation across backend, QA automation and DevOps before settling in a team. Structured mentoring for the first year.', salary: 'SAR 9,000 – 11,000 / month' },
    { id: 'opp_gulfnet_coop', source_id: 'gulfnet-coop-network-2027', url: 'https://careers.example-demo.sa/gulfnet/network-coop', title: 'Network Engineering Co-op', company: 'Gulf Net Integrators (Khobar)', type: 'coop', location: 'Al Khobar', city: 'Khobar', remote: 'onsite', field: 'networks', skills: ['Cisco', 'Routing', 'Linux', 'Packet Tracer'], eligibility: 'Current students who completed 90 credit hours; network engineering preferred.', deadline: d(25), posted: -8, description: 'Six-month co-op with a Khobar network integrator serving industrial clients in the Eastern Province. Configure switches and routers under supervision and document site surveys.', salary: 'SAR 4,500 / month' },
    { id: 'opp_riyalpay_intern', source_id: 'riyalpay-backend-intern', url: 'https://careers.example-demo.sa/riyalpay/backend-intern', title: 'Backend Intern – Payments', company: 'Riyal Pay', type: 'internship', location: 'Riyadh', city: 'Riyadh', remote: 'hybrid', field: 'fintech', skills: ['Node.js', 'TypeScript', 'SQL', 'REST APIs'], eligibility: 'Current students, level 6 or above.', deadline: d(18), posted: -4, description: 'Build and test payment webhooks and reconciliation jobs in a regulated sandbox. You will learn how a fintech handles idempotency, audit trails and PCI-style controls. Eight weeks.', salary: 'SAR 3,000 / month' },
    { id: 'opp_duneforge_intern', source_id: 'duneforge-gameplay-intern', url: 'https://careers.example-demo.sa/dune-forge/gameplay-intern', title: 'Gameplay Programming Intern', company: 'Dune Forge Studios', type: 'internship', location: 'Riyadh', city: 'Riyadh', remote: 'onsite', field: 'games', skills: ['C#', 'Unity', 'Git'], eligibility: 'Current students with a portfolio of at least one playable prototype.', deadline: d(30), posted: -5, description: 'Prototype mechanics for a mobile title with an indie studio. Interns pair with a senior gameplay programmer and take part in weekly playtests. Portfolio required.', salary: 'SAR 2,500 / month' },
    { id: 'opp_saharaux_intern', source_id: 'sahara-ux-product-design-intern', url: 'https://careers.example-demo.sa/sahara-ux/product-design-intern', title: 'Product Design Intern (UX)', company: 'Sahara UX Agency', type: 'internship', location: 'Remote (Saudi Arabia)', city: 'Remote', remote: 'remote', field: 'design', skills: ['Figma', 'UX', 'Prototyping', 'User Research'], eligibility: 'Current students; any major with design coursework or a portfolio.', deadline: d(15), posted: -9, description: 'Remote internship with a boutique agency designing Arabic-first interfaces. You will run usability sessions, iterate flows in Figma and hand off to developers. Part-time friendly.', salary: 'SAR 2,000 / month' },
    { id: 'opp_falconsoc_intern', source_id: 'falcon-soc-analyst-intern', url: 'https://careers.example-demo.sa/falcon-soc/analyst-intern', title: 'SOC Analyst Intern (Tier 1)', company: 'Falcon SOC (cybersecurity)', type: 'internship', location: 'Riyadh', city: 'Riyadh', remote: 'onsite', field: 'cybersecurity', skills: ['Cybersecurity', 'Linux', 'SIEM', 'Networking'], eligibility: 'Current students who completed a security course (e.g. CIS 383).', deadline: d(22), posted: -7, description: 'Shadow a 24/7 security operations centre: triage alerts, write incident notes and learn a SIEM. Shift-based, with a certification voucher on completion.', salary: 'SAR 3,200 / month' },
    { id: 'opp_yu_research_ra', source_id: 'yu-swe-lab-ra-2026', url: 'https://careers.example-demo.sa/yu-research/swe-lab-research-assistant', title: 'Undergraduate Research Assistant – Software Engineering Lab', company: 'YU Software Engineering Lab', type: 'research', location: 'Riyadh campus, Building B', city: 'Riyadh', remote: 'onsite', field: 'research', skills: ['Python', 'Git', 'Technical Writing'], eligibility: 'Current YU students, level 5 or above, GPA 3.0+ (illustrative).', deadline: d(12), posted: -2, description: 'Assist a faculty project on automated test generation. Duties include running experiments, maintaining scripts and co-authoring a short workshop paper. Ten hours per week during term.', salary: 'SAR 1,500 / month stipend' },
    { id: 'opp_stc_expired', source_id: 'stc-2026-summer-intern', url: 'https://careers.example-demo.sa/stc/summer-intern-2026', title: 'Summer Internship 2026 (closed)', company: 'Najd Telecom', type: 'internship', location: 'Riyadh', city: 'Riyadh', remote: 'onsite', field: 'software', skills: ['Java', 'SQL'], eligibility: 'Current students.', deadline: d(-40), posted: -120, description: 'Last summer\'s intake; kept for reference. Applications closed on the deadline shown.', status: 'expired' },
    { id: 'opp_nomad_unverified', source_id: 'nomad-cloud-backend-intern', url: 'https://jobs.example-demo.sa/nomad-cloud/backend-intern', title: 'Backend Intern (posting not verified)', company: 'Nomad Cloud', type: 'internship', location: 'Remote', city: 'Remote', remote: 'remote', field: 'software', skills: ['Go', 'Docker', 'SQL'], eligibility: '', deadline: null, posted: -1, description: 'Imported from a forwarded link. The source page could not be verified by the demo feed, so details may be incomplete; confirm before applying.', status: 'unverified' },
    { id: 'opp_tamkeen_data_intern', source_id: 'tamkeen-data-intern', url: 'https://careers.example-demo.sa/tamkeen-analytics/data-intern', title: 'Data Analytics Intern', company: 'Bayan Analytics', type: 'internship', location: 'Al Khobar', city: 'Khobar', remote: 'hybrid', field: 'data & ai', skills: ['SQL', 'Python', 'Power BI'], eligibility: 'Current students, level 4 or above.', deadline: d(27), posted: -11, description: 'Support the analytics team building dashboards for retail clients in the Eastern Province. You will clean data, write SQL and present findings weekly.', salary: 'SAR 2,800 / month' }
  ];
}

export function seedCareer(ctx: SeedContext) {
  const { db: d, today } = ctx;
  const now = nowIso();
  for (const o of opportunitySeeds(today)) {
    d.insert('opportunities', {
      id: o.id, source: 'demo-feed', source_id: o.source_id, url: o.url, normalized_url: normalizeUrl(o.url), title: o.title, company: o.company, type: o.type, location: o.location, city: o.city, remote: o.remote,
      field: o.field, skills: j(o.skills), eligibility: o.eligibility, deadline: o.deadline, posted_at: addDays(today, o.posted), last_checked_at: now, status: o.status ?? 'demo', description: o.description, salary: o.salary ?? null, demo_label: 1, created_at: now
    });
  }

  // Profiles
  d.insert('career_profiles', {
    student_id: ctx.users.student, headline: 'Software engineering student · web & UI', summary: 'Level 6 BSE student who enjoys building accessible web interfaces. Led the front end of a hackathon project and mentors first-year students in programming fundamentals.',
    skills: j(['JavaScript', 'React', 'SQL', 'Java', 'Figma', 'Git']), links: j({}),
    cv_versions: j([{ id: 'cv-v1', label: 'CV v1 – Feb 2026', updated_at: '2026-02-10T09:00:00.000Z' }, { id: 'cv-v2', label: 'CV v2 – Sep 2026', updated_at: '2026-09-20T09:00:00.000Z' }]), availability: 'Co-op from Jun 2027', updated_at: now
  });
  d.insert('career_profiles', {
    student_id: ctx.users.graduating, headline: 'Graduating software engineer · backend & cloud', summary: 'Final-level BSE student completing a fintech co-op. Comfortable with Java/Spring services, containers and SQL; looking for a graduate developer role in Riyadh.',
    skills: j(['Java', 'Spring', 'SQL', 'Docker', 'AWS', 'React', 'Git']), links: j({}),
    cv_versions: j([{ id: 'cv-grad', label: 'CV – graduate, Sep 2026', updated_at: '2026-09-15T09:00:00.000Z' }]), availability: 'Full-time from Feb 2027', updated_at: now
  });

  // Saved opportunities (Sara: 3)
  for (const oid of ['opp_aratech_coop', 'opp_yu_research_ra', 'opp_saharaux_intern']) d.run('INSERT OR IGNORE INTO saved_opportunities (user_id, opportunity_id, created_at) VALUES (?, ?, ?)', ctx.users.student, oid, now);

  const sara = getUser(ctx.users.student)!;
  const noura = getUser(ctx.users.graduating)!;

  // Sara: saved (linked), applied (attested), interview (with a calendar entry)
  const backdate = (appId: string, at: string) => d.run("UPDATE application_events SET created_at = ? WHERE application_id = ? AND to_status = 'saved'", at, appId);
  backdate(createApplication(sara, { opportunityId: 'opp_aratech_coop' }, 'seed').application.id, localToIso(addDays(today, -6), '21:15'));
  const applied = createApplication(sara, { opportunityId: 'opp_riyalpay_intern' }, 'seed').application;
  backdate(applied.id, localToIso(addDays(today, -13), '19:40'));
  const appliedAt = localToIso(addDays(today, -9), '16:20');
  d.update('applications', applied.id, { status: 'applied', applied_at: appliedAt, attested_by: 'student', cv_version: 'cv-v2', notes: 'Applied through the careers portal. Mentioned the payments reconciliation project from CIS 221.', updated_at: appliedAt });
  recordEvent(applied.id, 'saved', 'preparing', sara.id, 'manual', 'Tailoring CV v2', localToIso(addDays(today, -11), '10:00'));
  recordEvent(applied.id, 'preparing', 'applied', sara.id, 'manual', 'I submitted this application myself (attested)', appliedAt);

  const interviewApp = createApplication(sara, { opportunityId: 'opp_stc_swe_intern' }, 'seed').application;
  const stcApplied = localToIso(addDays(today, -21), '11:00');
  backdate(interviewApp.id, localToIso(addDays(today, -24), '17:00'));
  d.update('applications', interviewApp.id, { status: 'interview', applied_at: stcApplied, attested_by: 'student', cv_version: 'cv-v2', notes: 'Recruiter: Maha. Bring the portfolio link.', updated_at: localToIso(addDays(today, -2), '09:30') });
  recordEvent(interviewApp.id, 'saved', 'applied', sara.id, 'manual', 'I submitted this application myself (attested)', stcApplied);
  recordEvent(interviewApp.id, 'applied', 'assessment', sara.id, 'manual', 'Online coding assessment completed', localToIso(addDays(today, -12), '18:00'));
  recordEvent(interviewApp.id, 'assessment', 'interview', sara.id, 'manual', 'Interview invitation received', localToIso(addDays(today, -2), '09:30'));
  addInterview(sara, { ...interviewApp, status: 'interview' }, { start_at: '2026-09-30T14:00:00+03:00', end_at: '2026-09-30T15:00:00+03:00', location: 'Najd Telecom HQ, Riyadh – Tower 2', link: 'https://meet.example-demo.sa/stc/sara-2026-09-30', kind: 'technical', notes: 'Panel: two engineers + hiring manager.' });

  // Noura: applied + offer
  const nApplied = createApplication(noura, { opportunityId: 'opp_elm_entry' }, 'seed').application;
  const nAt = localToIso(addDays(today, -15), '13:00');
  backdate(nApplied.id, localToIso(addDays(today, -18), '10:00'));
  d.update('applications', nApplied.id, { status: 'applied', applied_at: nAt, attested_by: 'student', cv_version: 'cv-grad', updated_at: nAt });
  recordEvent(nApplied.id, 'saved', 'applied', noura.id, 'manual', 'I submitted this application myself (attested)', nAt);
  const nOffer = createApplication(noura, { company: 'Riyal Pay', title: 'Junior Backend Engineer (co-op conversion)', url: 'https://careers.example-demo.sa/riyalpay/junior-backend', type: 'entry' }, 'seed').application;
  backdate(nOffer.id, localToIso(addDays(today, -42), '09:00'));
  d.update('applications', nOffer.id, { status: 'offer', applied_at: localToIso(addDays(today, -40), '09:00'), attested_by: 'student', cv_version: 'cv-grad', notes: 'Conversion offer after the co-op. Decision due after graduation is approved.', updated_at: localToIso(addDays(today, -3), '15:00') });
  recordEvent(nOffer.id, 'saved', 'applied', noura.id, 'manual', 'I submitted this application myself (attested)', localToIso(addDays(today, -40), '09:00'));
  recordEvent(nOffer.id, 'applied', 'interview', noura.id, 'manual', 'Final interview with the engineering lead', localToIso(addDays(today, -10), '11:00'));
  recordEvent(nOffer.id, 'interview', 'offer', noura.id, 'manual', 'Offer letter received', localToIso(addDays(today, -3), '15:00'));

  // Sara's synthetic hiring emails (fictional domains). Never medical or unrelated inbox content.
  const riyalDomain = demoDomain('Riyal Pay');
  const stcDomain = demoDomain('Najd Telecom');
  insertEmail(sara.id, { from_address: `recruiting@${riyalDomain}`, subject: 'Interview invitation – Riyal Pay Backend Intern', snippet: 'We would like to invite you to a 45-minute technical interview next week.', body: 'Dear Sara,\n\nThank you for applying to the Backend Intern – Payments role at Riyal Pay. We would like to invite you to a 45-minute technical interview next week. Please reply with two time slots that suit you.\n\nKind regards,\nRecruiting Team', received_at: localToIso(addDays(today, -1), '10:15') });
  insertEmail(sara.id, { from_address: `assessments@${riyalDomain}`, subject: 'Riyal Pay: complete your online assessment', snippet: 'Please complete the coding assessment within 5 days.', body: 'Hello Sara,\n\nAs part of your application to Riyal Pay, please complete the online coding assessment within 5 days using the link below.\n\nhttps://assess.example-demo.sa/riyalpay/start\n\nTalent Acquisition', received_at: localToIso(addDays(today, -4), '09:05') });
  insertEmail(sara.id, { from_address: 'no-reply@talent-hub.example-demo.sa', subject: 'Thank you for your interest', snippet: 'We are reviewing applications for our Najd Telecom and Riyal Pay programmes and will be in touch.', body: 'Dear applicant,\n\nThank you for your interest. Our partner programmes for Najd Telecom and Riyal Pay are reviewing applications this month and the relevant team will be in touch about next steps.\n\nTalent Hub', received_at: localToIso(addDays(today, -2), '14:40') });
  insertEmail(sara.id, { from_address: `careers@${stcDomain}`, subject: 'We received your application – Software Engineering Intern', snippet: 'This confirms that we received your application.', body: 'Dear Sara,\n\nThis confirms that we have received your application for the Software Engineering Intern – Summer 2027 position at Najd Telecom. Our team will review it and contact you if you are shortlisted.\n\nNajd Telecom Careers', received_at: localToIso(addDays(today, -21), '11:05') });

  // Portfolio and competitions: Sara consented to using her portfolio for matching during onboarding (recorded, withdrawable).
  d.insert('portfolio_consents', { student_id: sara.id, purpose: 'matching', text_version: '2026-09', granted_at: localToIso(addDays(today, -30), '12:00'), withdrawn_at: null });
  seedCompetitions(sara.id);
}
