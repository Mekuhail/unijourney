import type { Db } from '../../core/db.ts';
import { addDays, localToIso, todayIso } from '../../core/clock.ts';
import { registerMigration } from '../../core/migrations.ts';
import { memberId } from '../../seed/members.ts';

/**
 * Community demo content: profiles, student posts, replies, likes and two message threads. Written with
 * INSERT OR IGNORE and fixed ids so it is safe to run on a fresh seed and, once, on an existing volume through the
 * 'community-social-v1' migration. Only references people, clubs and events that both kinds of database already have.
 */
export function seedSocial(d: Db, today: string = todayIso()) {
  const M = (n: number) => memberId(n - 1);
  const at = (days: number, time: string) => new Date(localToIso(addDays(today, -days), time)).toISOString();
  const has = (table: string, id: string, col = 'id') => !!d.get(`SELECT 1 FROM ${table} WHERE ${col} = ?`, id);

  // ------------------------------------------------------------------ profiles
  const profile = (user_id: string, bio: string, extra: Record<string, unknown> = {}) => {
    if (!has('users', user_id)) return;
    d.insertOrIgnore('community_profiles', { user_id, display_name: null, bio, avatar_color: null, show_program: 1, show_campus: 1, show_clubs: 1, dm_policy: 'everyone', updated_at: at(10, '12:00'), ...extra });
  };
  profile('u_student', 'Software engineering, level 6. Front-end and UI design; looking for a Farq hackathon team.');
  profile('u_lead', 'GDG on Campus lead. TypeScript, Node and far too many workshops. Ask me about the web track.');
  profile('u_student2', 'Network engineering in Khobar. Cybersecurity, IoT and weekend CTFs.');
  profile('u_graduating', 'Final-year SWE. Happy to answer questions about the graduation project and the co-op.');
  profile(M(1), 'Web track lead at GDG. I review portfolios for fun.');
  profile(M(2), 'Competitive programming coach. Arrays first, then everything else.');
  profile(M(3), 'MIS. Running the Entrepreneurship Club this year.');
  profile(M(4), 'Level 3 SWE. Games, Godot and pixel art.');
  profile(M(5), 'Law student and debate club president.', { dm_policy: 'club_mates' });
  profile(M(6), 'Architecture. Model-making nights are my happy place.');
  profile(M(8), 'Finance and fintech.', { dm_policy: 'nobody' });
  profile(M(9), 'Cloud and web. Currently learning Kubernetes the hard way.');
  profile(M(12), 'AI and data. Always up for a study group.');
  profile(M(14), 'Competitive Programming Club president. Weekly contests on Saturdays.');
  profile(M(17), 'Industrial engineering. Volunteer hours coordinator.');
  profile(M(18), 'Game Dev track lead at GDG.');
  profile(M(21), 'Cybersecurity Club president, Khobar campus.');

  // ------------------------------------------------------------------ student posts
  let n = 0;
  const post = (id: string, author: string, body: string, when: string, extra: Record<string, unknown> = {}) => {
    if (!has('users', author) || has('social_posts', id)) return false;
    if (extra.event_id && !has('events', extra.event_id as string)) delete extra.event_id;
    if (extra.club_id && !has('clubs', extra.club_id as string)) delete extra.club_id;
    const campus = (d.get<{ campus_id: string }>('SELECT campus_id FROM users WHERE id = ?', author))!.campus_id;
    d.insertOrIgnore('social_posts', { id, author_id: author, body, media_document_id: null, media_alt: null, event_id: null, club_id: null, audience: 'all', campus_id: campus, hidden: 0, created_at: when, edited_at: null, removed_at: null, removed_by: null, removed_reason: null, ...extra });
    return true;
  };
  const reply = (post_id: string, author: string, body: string, when: string) => {
    if (!has('social_posts', post_id) || !has('users', author)) return;
    d.insertOrIgnore('social_comments', { id: `sc_seed_${post_id}_${++n}`, post_id, author_id: author, body, created_at: when, removed_at: null, removed_by: null });
  };
  const like = (post_id: string, users: string[]) => users.forEach((u) => { if (has('users', u) && has('social_posts', post_id)) d.insertOrIgnore('social_likes', { post_id, user_id: u, created_at: at(0, '07:00') }); });

  post('sp_seed_studygroup', M(12), 'Study group for SWE 302 before next week’s quiz: Tuesday 13:00, library second floor, group room 2. Bring your lecture 4 notes on layered and hexagonal architecture.', at(0, '07:40'));
  reply('sp_seed_studygroup', M(9), 'Count me in. I can walk through the ports and adapters example.', at(0, '08:05'));
  reply('sp_seed_studygroup', M(18), 'Is it OK to join for the second hour only?', at(0, '08:20'));
  like('sp_seed_studygroup', [M(9), M(18), M(1), M(16)]);

  post('sp_seed_volunteers', 'u_lead', 'Looking for two volunteers to run the registration desk at Tuesday’s React workshop. You get organiser credit on your digital card, and first pick of the seats.', at(0, '06:50'), { event_id: 'evt_gdg_web', club_id: 'club_gdg' });
  reply('sp_seed_volunteers', M(4), 'I can do the first hour.', at(0, '07:15'));
  like('sp_seed_volunteers', [M(4), M(1), M(12)]);

  post('sp_seed_readme', M(1), 'Just finished the portfolio reviews at the open lab. The single most common fix: add a README with a screenshot and one paragraph on what you built and why. Recruiters open it first.', at(1, '19:10'));
  reply('sp_seed_readme', M(2), 'This. Also pin your best three repositories.', at(1, '19:40'));
  like('sp_seed_readme', [M(2), M(9), M(12), M(14), M(16), 'u_lead', 'u_graduating']);

  post('sp_seed_farq', 'u_student2', 'هل يوجد أحد من طلاب الخبر مشارك في هاكاثون فرق؟ نبحث عن عضو ثالث يجيد تصميم الواجهات.', at(1, '21:30'), { event_id: 'evt_ext_farq' });
  reply('sp_seed_farq', M(20), 'أنا مهتم، أعمل على Figma منذ سنة.', at(1, '22:05'));
  like('sp_seed_farq', [M(20), M(23)]);

  post('sp_seed_contest', M(14), 'Weekly contest #5 is on Saturday at 16:00. First time? Problems A and B only need loops and arrays. Come and watch if you prefer; the walkthrough afterwards is the best part.', at(1, '16:30'), { event_id: 'evt_cp_contest', club_id: 'club_cp' });
  like('sp_seed_contest', [M(2), M(16), M(23), M(4)]);

  post('sp_seed_audit', 'u_graduating', 'Final-year tip: request your graduation audit early. Mine flagged a missing co-op form that took two weeks to sort out.', at(2, '12:15'));
  reply('sp_seed_audit', M(9), 'Thanks, did not know the audit checks the co-op too.', at(2, '12:40'));
  like('sp_seed_audit', [M(9), M(1), 'u_lead']);

  post('sp_seed_ent', M(3), 'لقاء مفتوح لريادة الأعمال يوم الأربعاء: أحضروا أفكاركم حتى لو كانت في بدايتها، وسنساعدكم في صياغة عرض من ثلاث شرائح.', at(2, '10:00'), { club_id: 'club_entrepreneurship' });
  like('sp_seed_ent', [M(15), M(10), M(8)]);

  post('sp_seed_lab_khb', M(21), 'Khobar campus: the E-101 networks lab is open for practice on Wednesday evenings. Bring a laptop; Wireshark and the lab images are ready.', at(2, '18:00'), { audience: 'campus', club_id: 'club_cyber' });
  like('sp_seed_lab_khb', [M(19), M(23), M(26)]);

  post('sp_seed_debate', M(5), 'Anyone want to practise for the debate tournament in Arabic? Looking for a sparring partner for Monday evenings.', at(3, '20:20'));
  reply('sp_seed_debate', M(13), 'Yes please. Same motion as last week?', at(3, '20:45'));
  like('sp_seed_debate', [M(13), M(15)]);

  post('sp_seed_trees', M(17), 'يوم الحرم الأخضر: نحتاج متطوعين لزراعة الأشجار، ساعتان تُحتسبان في سجل خدمة المجتمع. سجّلوا من صفحة الفعالية لنطلب عددًا كافيًا من الشتلات.', at(3, '11:00'), { event_id: 'evt_vol_cleanup', club_id: 'club_volunteer' });
  like('sp_seed_trees', [M(10), M(11), M(3), M(6)]);

  post('sp_seed_jam', M(18), 'Game jam kickoff on Thursday. Looking for an artist or a sound designer for our team; we build in Godot and keep the scope tiny.', at(4, '17:30'), { event_id: 'evt_gdg_gamejam', club_id: 'club_gdg' });
  reply('sp_seed_jam', M(4), 'I do pixel art. Messaging you.', at(4, '18:00'));
  like('sp_seed_jam', [M(4), M(12)]);

  post('sp_seed_studio', M(6), 'Does anyone know until when the design studio stays open in the evening? We need space to assemble models for the crit.', at(5, '15:10'));
  reply('sp_seed_studio', M(11), 'Until 21:00 on weekdays. Sign the sheet at the door.', at(5, '15:30'));
  like('sp_seed_studio', [M(11), M(15)]);

  // ------------------------------------------------------------------ messages (Sara has one unread from Layan)
  const conv = (id: string, x: string, y: string, created: string) => {
    if (!has('users', x) || !has('users', y)) return false;
    const [a, b] = [x, y].sort();
    if (d.get('SELECT 1 FROM dm_conversations WHERE user_a = ? AND user_b = ?', a, b)) return false;
    d.insertOrIgnore('dm_conversations', { id, user_a: a, user_b: b, created_at: created, last_message_at: null, a_read_seq: 0, b_read_seq: 0 });
    return true;
  };
  const msg = (conversation_id: string, sender: string, body: string, when: string) => {
    const r = d.run('INSERT INTO dm_messages (id, conversation_id, sender_id, body, created_at, removed_at) VALUES (?, ?, ?, ?, ?, NULL)', `msg_seed_${conversation_id}_${++n}`, conversation_id, sender, body, when);
    d.run('UPDATE dm_conversations SET last_message_at = ? WHERE id = ?', when, conversation_id);
    return Number(r.lastInsertRowid);
  };
  const markRead = (conversation_id: string, user: string, seq: number) => {
    const c = d.get<{ user_a: string }>('SELECT user_a FROM dm_conversations WHERE id = ?', conversation_id)!;
    d.run(`UPDATE dm_conversations SET ${c.user_a === user ? 'a_read_seq' : 'b_read_seq'} = ? WHERE id = ?`, seq, conversation_id);
  };

  if (conv('dm_seed_sara_layan', 'u_student', 'u_lead', at(2, '18:00'))) {
    const s1 = msg('dm_seed_sara_layan', 'u_lead', 'Hi Sara! Are you still coming to the React workshop on Tuesday?', at(2, '18:00'));
    const s2 = msg('dm_seed_sara_layan', 'u_student', 'Yes! Can I bring a friend who is not a member yet?', at(2, '18:12'));
    markRead('dm_seed_sara_layan', 'u_student', s2);
    const s3 = msg('dm_seed_sara_layan', 'u_lead', 'Of course, RSVP is open to everyone. Also, would you like to help at the registration desk? I posted about it in the community.', at(0, '07:05'));
    markRead('dm_seed_sara_layan', 'u_lead', s3);
    void s1;
    d.insertOrIgnore('notifications', { id: 'ntf_seed_dm_sara', user_id: 'u_student', module: 'community', kind: 'message', title: 'New message from Layan Al-Harbi', body: 'Of course, RSVP is open to everyone. Also, would you like to help at the registration desk?', link: '/campus/community/messages/dm_seed_sara_layan', read_at: null, created_at: at(0, '07:05') });
  }
  if (conv('dm_seed_sara_rawan', 'u_student', M(9), at(3, '21:00'))) {
    msg('dm_seed_sara_rawan', M(9), 'Thanks for sharing your SWE 302 notes, the diagrams saved me.', at(3, '21:00'));
    const last = msg('dm_seed_sara_rawan', 'u_student', 'Anytime! See you at the study group on Tuesday.', at(3, '21:20'));
    markRead('dm_seed_sara_rawan', 'u_student', last);
    markRead('dm_seed_sara_rawan', M(9), last);
  }
}

registerMigration({
  id: 'community-social-v1',
  description: 'profiles, student posts and demo message threads for the campus community',
  run: (d) => seedSocial(d)
});
