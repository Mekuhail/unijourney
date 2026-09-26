import { j } from '../../core/db.ts';
import { addDays, localToIso } from '../../core/clock.ts';
import type { SeedContext } from '../../seed/context.ts';
import { memberId } from '../../seed/members.ts';

/**
 * Club community seed: four more clubs, club profiles, synthetic members with officer titles, follows, posts
 * (announcements, discussions, questions, a poll), replies, reactions, one open report and a drop-in event running
 * "now" so QR self check-in can be demonstrated. Runs after the base campus seed.
 */
export function seedCommunity(ctx: SeedContext) {
  const { db: d, users: U, today } = ctx;
  const M = (n: number) => memberId(n - 1);
  const at = (dayOffset: number, time = '09:00') => localToIso(addDays(today, dayOffset), time);
  /** Stored like nowIso() (UTC) so seeded and new posts sort together. */
  const ago = (days: number, time: string) => new Date(localToIso(addDays(today, -days), time)).toISOString();
  const created = new Date(localToIso('2026-08-20', '10:00')).toISOString();

  // ------------------------------------------------------------------ new clubs (organisers of the YU competitions)
  const clubs = [
    { id: 'club_cyber', slug: 'cybersecurity', name_en: 'Cybersecurity Club', name_ar: 'نادي الأمن السيبراني', category: 'tech', color: '#334155', campus_id: 'khobar', lead: M(21),
      description_en: 'Hands-on security for every major: weekly labs, beginner CTFs, a team for national competitions and talks on responsible disclosure.',
      description_ar: 'أمن سيبراني عملي لجميع التخصصات: معامل أسبوعية ومسابقات التقاط العلم للمبتدئين وفريق للمسابقات الوطنية ولقاءات عن الإفصاح المسؤول.' },
    { id: 'club_cp', slug: 'competitive-programming', name_en: 'Competitive Programming Club', name_ar: 'نادي البرمجة التنافسية', category: 'tech', color: '#4F46E5', campus_id: 'riyadh', lead: M(14),
      description_en: 'Weekly virtual contests, problem-solving circles and ICPC-style team training. Every level welcome; we start from arrays and loops.',
      description_ar: 'مسابقات افتراضية أسبوعية وحلقات حل المسائل وتدريب فرق على نمط ICPC. جميع المستويات مرحب بها ونبدأ من المصفوفات والحلقات.' },
    { id: 'club_arch', slug: 'architecture-design', name_en: 'Architecture & Design Society', name_ar: 'جمعية العمارة والتصميم', category: 'design', color: '#BE185D', campus_id: 'riyadh', lead: M(11),
      description_en: 'Open crits, model-making nights, site visits and entries to student design competitions. Designers from every programme welcome.',
      description_ar: 'جلسات نقد مفتوحة وليالي صناعة المجسمات وزيارات ميدانية والمشاركة في مسابقات التصميم الطلابية. مرحب بالمصممين من كل التخصصات.' },
    { id: 'club_law', slug: 'law-society', name_en: 'Law Society', name_ar: 'الجمعية القانونية', category: 'law', color: '#7C2D12', campus_id: 'riyadh', lead: M(13),
      description_en: 'Moot court practice, legal research workshops and conversations with practitioners from Saudi firms and courts.',
      description_ar: 'تدريب على المحاكم الصورية وورش البحث القانوني ولقاءات مع ممارسين من المكاتب والمحاكم السعودية.' }
  ];
  for (const { lead, ...c } of clubs) d.insert('clubs', { ...c, lead_id: lead, created_at: created });
  // Existing clubs without a lead get one from the synthetic members (GDG keeps Layan).
  d.update('clubs', 'club_entrepreneurship', { lead_id: M(3) });
  d.update('clubs', 'club_debate', { lead_id: M(5) });
  d.update('clubs', 'club_photo', { lead_id: M(22) });
  d.update('clubs', 'club_volunteer', { lead_id: M(10) });

  // ------------------------------------------------------------------ profiles
  const profile = (club_id: string, p: Record<string, unknown>) => d.insert('club_profiles', { club_id, join_policy: 'approval', join_question_en: null, join_question_ar: null, founded: null, audience: 'all', ...p, tags: j(p.tags ?? []) });
  profile('club_gdg', { tagline_en: 'Build, ship and learn with developers across YU', tagline_ar: 'ابنِ وأطلق وتعلّم مع مطوري جامعة اليمامة', tags: ['web development', 'ai', 'games', 'iot', 'cloud', 'hackathons'], meets_en: 'Tuesdays 18:00 · IT lab', meets_ar: 'الثلاثاء 18:00 · معمل تقنية المعلومات', join_question_en: 'Which track would you like to start with?', join_question_ar: 'ما المسار الذي تودّ البدء به؟', founded: '2022' });
  profile('club_entrepreneurship', { tagline_en: 'Turn a class idea into a pitch-ready startup', tagline_ar: 'حوّل فكرة من القاعة إلى شركة ناشئة جاهزة للعرض', tags: ['entrepreneurship', 'fintech', 'startups'], meets_en: 'Every other Wednesday 17:30', meets_ar: 'كل أربعاء ثانٍ 17:30', founded: '2019', audience: 'riyadh' });
  profile('club_debate', { tagline_en: 'Argue better, in Arabic and English', tagline_ar: 'ناقش بإقناع بالعربية والإنجليزية', tags: ['debate', 'public speaking', 'law'], meets_en: 'Mondays 17:00', meets_ar: 'الاثنين 17:00', join_question_en: 'Have you debated before? Any language counts.', join_question_ar: 'هل سبق لك المشاركة في مناظرة؟ بأي لغة.', founded: '2018', audience: 'riyadh' });
  profile('club_photo', { tagline_en: 'Photo walks, edits and a termly exhibition in Khobar', tagline_ar: 'جولات تصوير وتحرير ومعرض فصلي في الخبر', tags: ['photography', 'design'], meets_en: 'Thursdays at golden hour', meets_ar: 'الخميس وقت الغروب', join_policy: 'open', founded: '2021', audience: 'khobar' });
  profile('club_volunteer', { tagline_en: 'Give time, log hours, meet people who care', tagline_ar: 'تطوّع ووثّق ساعاتك وتعرّف على من يهتمون', tags: ['volunteering', 'community', 'sustainability'], meets_en: 'Planning Sundays 13:00 · monthly field days', meets_ar: 'تخطيط الأحد 13:00 · أيام ميدانية شهرية', join_policy: 'approval', founded: '2017' });
  profile('club_cyber', { tagline_en: 'Hands-on security: CTFs, labs and responsible disclosure', tagline_ar: 'أمن عملي: مسابقات ومعامل وإفصاح مسؤول', tags: ['cybersecurity', 'ctf', 'networking'], meets_en: 'Wednesdays 18:30 · E-101 Networks Lab', meets_ar: 'الأربعاء 18:30 · معمل الشبكات E-101', join_question_en: 'Which area interests you most: web, forensics, crypto or networks?', join_question_ar: 'أي مجال يهمك أكثر: الويب أم التحليل الجنائي أم التشفير أم الشبكات؟', founded: '2024' });
  profile('club_cp', { tagline_en: 'Train for ICPC-style contests, one problem at a time', tagline_ar: 'استعد لمسابقات ICPC مسألةً تلو الأخرى', tags: ['competitive programming', 'algorithms', 'hackathons'], meets_en: 'Saturdays 16:00 · weekly virtual contest', meets_ar: 'السبت 16:00 · مسابقة افتراضية أسبوعية', join_policy: 'open', founded: '2023' });
  profile('club_arch', { tagline_en: 'Crits, model-making nights and design competitions', tagline_ar: 'جلسات نقد وليالي مجسمات ومسابقات تصميم', tags: ['architecture', 'design', 'ui/ux', 'sustainability'], meets_en: 'Thursdays 16:00 · design studio', meets_ar: 'الخميس 16:00 · استوديو التصميم', join_question_en: 'Share one project, sketch or portfolio link you are proud of.', join_question_ar: 'شاركنا مشروعًا أو رسمًا أو رابط ملف أعمال تفخر به.', founded: '2021', audience: 'riyadh' });
  profile('club_law', { tagline_en: 'Moot court, legal research and practitioners’ talks', tagline_ar: 'محاكم صورية وبحث قانوني ولقاءات مع الممارسين', tags: ['law', 'moot court', 'debate', 'public speaking'], meets_en: 'Tuesdays 13:00', meets_ar: 'الثلاثاء 13:00', join_question_en: 'Which area of law interests you?', join_question_ar: 'أي فرع من القانون يهمك؟', founded: '2020', audience: 'riyadh' });

  // ------------------------------------------------------------------ memberships and officer titles
  let k = 0;
  const joined = (days: number) => ago(days, '12:00');
  const member = (club: string, user: string, role: 'lead' | 'officer' | 'member' = 'member', title?: [string, string]) => {
    const id = `mem_${club.replace('club_', '')}_${user.replace(/^u_/, '')}`;
    const when = joined(40 - (k++ % 30));
    d.insert('memberships', { id, club_id: club, user_id: user, status: 'active', role, requested_at: when, decided_at: when, decided_by: null, note: null });
    if (title) d.insert('club_member_titles', { membership_id: id, title_en: title[0], title_ar: title[1], show_in_roster: 1 });
    return id;
  };
  d.insert('club_member_titles', { membership_id: 'mem_gdg_lead', title_en: 'President', title_ar: 'رئيسة النادي', show_in_roster: 1 });
  member('club_gdg', M(1), 'officer', ['Web track lead', 'قائدة مسار الويب']);
  member('club_gdg', M(18), 'officer', ['Game Dev track lead', 'قائدة مسار تطوير الألعاب']);
  for (const n of [2, 4, 7, 9, 12, 14, 16, 20]) member('club_gdg', M(n));

  member('club_entrepreneurship', M(3), 'lead', ['President', 'رئيسة النادي']);
  member('club_entrepreneurship', M(8), 'officer', ['Events coordinator', 'منسقة الفعاليات']);
  for (const n of [15, 10]) member('club_entrepreneurship', M(n));

  member('club_debate', M(5), 'lead', ['President', 'رئيسة النادي']);
  member('club_debate', M(13), 'officer', ['Tournament captain', 'قائدة فريق البطولات']);
  for (const n of [15, 10]) member('club_debate', M(n));

  member('club_photo', M(22), 'lead', ['President', 'رئيس النادي']);
  member('club_photo', M(24), 'officer', ['Exhibition curator', 'منسق المعرض']);
  for (const n of [20, 27]) member('club_photo', M(n));

  member('club_volunteer', M(10), 'lead', ['President', 'رئيسة النادي']);
  member('club_volunteer', M(17), 'officer', ['Volunteer hours coordinator', 'منسقة ساعات التطوع']);
  for (const n of [11, 3, 6]) member('club_volunteer', M(n));

  member('club_cyber', M(21), 'lead', ['President', 'رئيس النادي']);
  member('club_cyber', M(19), 'officer', ['CTF captain', 'قائد فريق CTF']);
  for (const n of [23, 26, 7, 16]) member('club_cyber', M(n));

  member('club_cp', M(14), 'lead', ['President', 'رئيسة النادي']);
  member('club_cp', M(2), 'officer', ['Contest coach', 'مدربة المسابقات']);
  for (const n of [12, 16, 23, 4]) member('club_cp', M(n));

  member('club_arch', M(11), 'lead', ['President', 'رئيسة الجمعية']);
  member('club_arch', M(6), 'officer', ['Studio lead', 'قائدة الاستوديو']);
  for (const n of [15, 17]) member('club_arch', M(n));

  member('club_law', M(13), 'lead', ['President', 'رئيسة الجمعية']);
  member('club_law', M(5), 'officer', ['Moot court coordinator', 'منسقة المحكمة الصورية']);
  member('club_law', M(3));

  // A pending request with a join answer for Layan's desk.
  d.insert('memberships', { id: 'mem_gdg_arwa_pending', club_id: 'club_gdg', user_id: M(15), status: 'pending', role: 'member', requested_at: ago(0, '08:10'), decided_at: null, decided_by: null, note: null });
  d.insert('club_join_answers', { membership_id: 'mem_gdg_arwa_pending', answer: 'Web Development first. I design in Figma and want to learn to build what I design.', created_at: ago(0, '08:10') });

  // Follows: Sara follows the Competitive Programming Club without joining; Faisal follows GDG.
  d.insert('club_follows', { club_id: 'club_cp', user_id: U.student, created_at: ago(5, '20:00') });
  d.insert('club_follows', { club_id: 'club_gdg', user_id: U.student2, created_at: ago(9, '21:00') });
  for (const n of [5, 9, 11, 18, 20]) d.insert('club_follows', { club_id: 'club_cp', user_id: M(n), created_at: ago(12, '10:00') });

  // ------------------------------------------------------------------ events for the new clubs + a drop-in running now
  const ev = (row: Record<string, unknown>) => d.insert('events', { title_ar: '', description_en: '', tz: 'Asia/Riyadh', campus_id: 'riyadh', location_id: null, venue_text: null, capacity: null, organizer: '', provenance: 'club', source_url: null, evidence_note: null, deadline: null, eligibility: null, tags: '[]', demo_label: 1, owner_id: null, status: 'scheduled', created_at: localToIso('2026-09-15', '09:00'), ...row });
  ev({ id: 'evt_gdg_openlab', club_id: 'club_gdg', kind: 'club', title_en: 'Open lab: portfolio and CV review drop-in', title_ar: 'معمل مفتوح: مراجعة ملف الأعمال والسيرة الذاتية', description_en: 'Drop in any time this morning. Officers review your GitHub, portfolio and CV in ten-minute slots. Scan the QR poster at the door to check in.', start_at: at(0, '08:00'), end_at: at(0, '12:00'), location_id: 'ryd_room_it_lab', organizer: 'GDG on Campus – Al Yamamah', tags: j(['track:Web Development', 'drop-in']) });
  ev({ id: 'evt_cyber_lab', club_id: 'club_cyber', kind: 'club', campus_id: 'khobar', title_en: 'Network forensics lab: read a packet capture', title_ar: 'معمل التحليل الجنائي للشبكات: قراءة ملف التقاط الحزم', description_en: 'Open Wireshark, follow a TCP stream and find the flag hidden in a captured login. Laptops provided.', start_at: at(3, '18:30'), end_at: at(3, '20:00'), location_id: 'khb_room_e101', capacity: 24, organizer: 'Cybersecurity Club', tags: j(['lab', 'beginner']) });
  ev({ id: 'evt_cp_contest', club_id: 'club_cp', kind: 'club', title_en: 'Weekly virtual contest #5 (beginner level)', title_ar: 'المسابقة الافتراضية الأسبوعية رقم 5 (مستوى مبتدئ)', description_en: 'Five problems, two and a half hours, individual. Editorial and walkthrough right after.', start_at: at(6, '16:00'), end_at: at(6, '18:30'), location_id: 'ryd_room_c220', capacity: 40, organizer: 'Competitive Programming Club', tags: j(['contest']) });
  ev({ id: 'evt_arch_crit', club_id: 'club_arch', kind: 'club', title_en: 'Open crit night: bring one sketch', title_ar: 'ليلة النقد المفتوح: أحضر رسمًا واحدًا', description_en: 'Pin up one drawing or screen, get five minutes of feedback from final-year students.', start_at: at(4, '16:00'), end_at: at(4, '18:00'), location_id: 'ryd_room_b305', organizer: 'Architecture & Design Society', tags: j(['crit']) });
  ev({ id: 'evt_law_moot', club_id: 'club_law', kind: 'club', title_en: 'Moot court practice round', title_ar: 'جولة تدريبية للمحكمة الصورية', description_en: 'A commercial-contract dispute; two teams, one bench of senior students. Observers welcome.', start_at: at(9, '13:00'), end_at: at(9, '14:30'), location_id: 'ryd_auditorium', organizer: 'Law Society', tags: j(['moot']) });

  // ------------------------------------------------------------------ posts
  let seq = 0;
  const post = (id: string, club: string, author: string, kind: string, body: string, when: string, extra: Record<string, unknown> = {}) =>
    d.insert('club_posts', { id, club_id: club, author_id: author, kind, body, event_id: null, pinned_until: null, answer_comment_id: null, hidden: 0, created_at: when, edited_at: null, removed_at: null, removed_by: null, removed_reason: null, ...extra });
  const reply = (post_id: string, author: string, body: string, when: string) => {
    const id = `cmt_seed_${++seq}`;
    d.insert('club_comments', { id, post_id, author_id: author, body, created_at: when, removed_at: null, removed_by: null });
    return id;
  };
  const react = (post_id: string, users: string[]) => users.forEach((u) => d.insert('club_reactions', { post_id, user_id: u, created_at: ago(0, '07:00') }));
  const pinUntil = new Date(localToIso(addDays(today, 10), '23:59')).toISOString();

  // GDG
  post('post_gdg_web', 'club_gdg', U.lead, 'announcement', 'Web Dev workshop is on Tuesday at 16:00 in D-105. Bring a laptop with Node 22 installed; we will build and deploy a small React dashboard together. Thirty seats, so please RSVP from the event page so we can plan mentors per table.', ago(2, '19:30'), { event_id: 'evt_gdg_web', pinned_until: pinUntil });
  react('post_gdg_web', [U.student, M(1), M(2), M(4), M(9), M(12), M(16), M(18)]);
  reply('post_gdg_web', M(4), 'Do we need React experience before coming?', ago(2, '20:05'));
  reply('post_gdg_web', M(1), 'Not at all. Basic JavaScript is enough; we start from an empty project.', ago(2, '20:40'));

  post('post_gdg_openlab', 'club_gdg', M(1), 'announcement', 'Open lab is running until noon today in the IT lab. Drop in for a ten-minute portfolio or CV review. Scan the QR poster at the door when you arrive so it counts on your digital card.', ago(0, '07:45'), { event_id: 'evt_gdg_openlab' });
  react('post_gdg_openlab', [M(9), M(14)]);

  post('post_gdg_poll', 'club_gdg', U.lead, 'poll', 'Which topic should the November workshop cover? Vote by Thursday.', ago(1, '18:00'));
  const opts = ['Next.js App Router', 'Testing with Vitest', 'Deploying to the cloud', 'Accessibility basics'];
  opts.forEach((label, i) => d.insert('club_poll_options', { id: `post_gdg_poll_o${i + 1}`, post_id: 'post_gdg_poll', label, sort: i }));
  const votes: Array<[number, number]> = [[1, 1], [2, 3], [4, 1], [7, 3], [9, 3], [12, 2], [14, 2], [16, 4], [18, 1]];
  for (const [n, o] of votes) d.insert('club_poll_votes', { post_id: 'post_gdg_poll', option_id: `post_gdg_poll_o${o}`, user_id: M(n), created_at: ago(1, '20:00') });

  post('post_gdg_cert', 'club_gdg', M(12), 'question', 'Where do I find the certificate for the TypeScript workshop from week 2?', ago(4, '14:10'));
  const ans = reply('post_gdg_cert', U.lead, 'Attendance was verified after the session, so it is already on your digital student card under achievements. It also shows on your portfolio as a university-verified item.', ago(4, '15:00'));
  reply('post_gdg_cert', M(12), 'Found it, thank you!', ago(4, '15:20'));
  d.update('club_posts', 'post_gdg_cert', { answer_comment_id: ans });
  react('post_gdg_cert', [M(4), M(16)]);

  post('post_gdg_team', 'club_gdg', M(4), 'discussion', 'Anyone forming a team for the Farq Hackathon? I do front-end and some Figma. Looking for someone comfortable with Node and databases.', ago(3, '21:15'));
  reply('post_gdg_team', M(12), 'I can take the backend: Node, SQLite and a bit of Python for data. Let us talk after the workshop.', ago(3, '21:50'));
  reply('post_gdg_team', M(9), 'If you need someone for deployment and cloud, count me in too.', ago(2, '09:30'));
  react('post_gdg_team', [M(12), M(9), M(18)]);

  post('post_gdg_notes', 'club_gdg', M(9), 'discussion', 'Sharing what helped me in the TypeScript session: generics finally clicked when we typed the API client instead of reading about them. What made it click for you?', ago(6, '18:40'));
  reply('post_gdg_notes', M(2), 'Writing the types before the function. It felt slower but I made fewer mistakes.', ago(6, '19:10'));
  react('post_gdg_notes', [M(2), M(1)]);

  post('post_gdg_jam', 'club_gdg', M(18), 'announcement', 'Game jam kickoff on Thursday: theme reveal, team formation and a Godot crash course. No game experience needed; artists and sound designers are very welcome.', ago(5, '17:00'), { event_id: 'evt_gdg_gamejam' });
  react('post_gdg_jam', [M(4), M(18), M(20)]);

  post('post_gdg_offtopic', 'club_gdg', M(20), 'discussion', 'Selling my used Calculus and Physics textbooks, good condition. Message me if interested.', ago(1, '11:00'));
  d.insert('club_reports', { id: 'rep_seed_offtopic', club_id: 'club_gdg', post_id: 'post_gdg_offtopic', comment_id: null, reporter_id: M(2), reason: 'off_topic', note: 'Not related to the club; there is a marketplace for this.', status: 'open', created_at: ago(1, '12:30'), resolved_at: null, resolved_by: null });

  // Competitive programming (Sara follows)
  post('post_cp_contest', 'club_cp', M(14), 'announcement', 'Contest #5 is this Saturday at 16:00 in C-220: five problems, beginner level. Editorial and walkthrough right after. New members are welcome to just watch the first time.', ago(1, '16:00'), { event_id: 'evt_cp_contest', pinned_until: pinUntil });
  react('post_cp_contest', [M(2), M(12), M(16), M(4)]);
  post('post_cp_icpc', 'club_cp', M(2), 'announcement', 'ICPC team trials start next month. We will pick three teams of three from the weekly contest standings. Practise on the sorting and greedy problem sets first.', ago(4, '12:00'));
  react('post_cp_icpc', [M(14), M(23)]);
  post('post_cp_q', 'club_cp', M(16), 'question', 'Which language is best for contests if I know Java and a bit of Python?', ago(3, '20:00'));
  const cpAns = reply('post_cp_q', M(2), 'Use Java to start; it is fast enough and you know it. Learn fast input reading early. Switch to C++ later if you want.', ago(3, '20:30'));
  d.update('club_posts', 'post_cp_q', { answer_comment_id: cpAns });

  // Cybersecurity (Khobar)
  post('post_cyber_lab', 'club_cyber', M(21), 'announcement', 'Network forensics lab on Wednesday at 18:30 in E-101. Laptops with Wireshark are ready; bring curiosity. We finish with a small flag hunt.', ago(1, '19:00'), { event_id: 'evt_cyber_lab', pinned_until: pinUntil });
  react('post_cyber_lab', [M(19), M(23), M(26)]);
  post('post_cyber_q', 'club_cyber', M(26), 'question', 'Is there a good first certification for networks and security, before CompTIA Security+?', ago(5, '22:00'));
  reply('post_cyber_q', M(19), 'Start with the free Cisco Networking Academy courses, then Security+. The club has a study group every other week.', ago(5, '22:40'));

  // Entrepreneurship, debate, photography, volunteering, architecture, law
  post('post_ent_pitch', 'club_entrepreneurship', M(8), 'announcement', 'Pitch night line-up is final: eight teams, three minutes and three slides each. Doors open at 18:30. Bring a friend to vote for the crowd favourite.', ago(2, '13:00'), { event_id: 'evt_ent_pitch', pinned_until: pinUntil });
  react('post_ent_pitch', [U.graduating, M(3), M(15)]);
  post('post_ent_q', 'club_entrepreneurship', M(15), 'question', 'Can a team pitch an idea that started as a course project?', ago(3, '10:00'));
  reply('post_ent_q', M(3), 'Yes, as long as the whole team agrees and you mention the course. Several past winners started that way.', ago(3, '11:00'));
  post('post_debate_motion', 'club_debate', M(5), 'announcement', 'This week’s practice motion: “This house would make a coding course compulsory for every major.” Teams are posted on the board; Arabic round first, then English.', ago(1, '09:00'), { pinned_until: pinUntil });
  post('post_photo_walk', 'club_photo', M(22), 'announcement', 'Corniche photo walk this Thursday at golden hour. Phones are welcome. Theme for the exhibition: “Lines of the city”.', ago(2, '18:00'), { event_id: 'evt_photo_walk' });
  react('post_photo_walk', [M(24), M(20), M(27)]);
  post('post_vol_trees', 'club_volunteer', M(17), 'announcement', 'Campus green day: two volunteer hours count towards your community-service record. Sign up on the event page so we can order enough saplings.', ago(3, '12:00'), { event_id: 'evt_vol_cleanup', pinned_until: pinUntil });
  post('post_arch_crit', 'club_arch', M(6), 'announcement', 'Open crit night on Thursday in B-305. Bring one sketch, model photo or screen. Five minutes each, kind and specific feedback only.', ago(1, '15:00'), { event_id: 'evt_arch_crit' });
  post('post_law_moot', 'club_law', M(5), 'announcement', 'Moot court practice round in the auditorium: a commercial-contract dispute. Observers welcome; teams get the case file on Sunday.', ago(2, '11:00'), { event_id: 'evt_law_moot' });
}
