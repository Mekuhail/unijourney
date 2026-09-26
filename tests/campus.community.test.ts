import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db } from '../server/core/db.ts';
import { checkinCode } from '../server/modules/campus/community.ts';
import { checkText } from '../server/core/moderation.ts';

interface Post { id: string; kind: string; pinned: boolean; hidden: boolean; reactions: number; reacted: boolean; answer_comment_id: string | null; comments: Array<{ id: string; author: { id: string } }>; poll: { total: number; my_vote: string | null; options: Array<{ id: string; votes: number | null }> } | null; can: Record<string, boolean> }
interface Posts { pinned: Post[]; items: Post[]; members_only_hidden: number; can_post: Record<string, boolean>; open_reports: number }
interface ClubDetail { members: Array<{ id: string; user_id: string; role: string }>; roster_visible: boolean; officers: Array<{ user_id: string; role: string; title_en: string }>; profile: { join_policy: string }; my_membership: { status: string } | null }
interface ClubListItem { id: string; for_you: { score: number; reasons: Array<{ key: string }> } | null }

let s: TestServer;
beforeAll(async () => { freshDb(); s = await startServer(); });
afterAll(async () => { await s.close(); });

describe('club community: visibility and posting', () => {
  it('non-members read announcements only; the roster is members-only while officers stay public', async () => {
    const faisal = s.as('u_student2');
    const r = await faisal.get<Posts>('/campus/clubs/club_cp/posts');
    expect(r.status).toBe(200);
    const all = [...r.body.data!.pinned, ...r.body.data!.items];
    expect(all.every((p) => p.kind === 'announcement')).toBe(true);
    expect(r.body.data!.members_only_hidden).toBeGreaterThan(0);
    const c = await faisal.get<ClubDetail>('/campus/clubs/club_cp');
    expect(c.body.data!.roster_visible).toBe(false);
    expect(c.body.data!.members).toHaveLength(0);
    expect(c.body.data!.officers.map((o) => o.role)).toEqual(['lead', 'officer']);
    const sara = await s.as('u_student').get<ClubDetail>('/campus/clubs/club_gdg');
    expect(sara.body.data!.roster_visible).toBe(true);
    expect(sara.body.data!.members.length).toBeGreaterThan(5);
  });

  it('members start discussions; announcements are for moderators; abusive text and phone numbers are refused', async () => {
    const sara = s.as('u_student');
    const d = await sara.post<Post>('/campus/clubs/club_gdg/posts', { kind: 'discussion', body: 'Who wants to pair on the React dashboard after the workshop?' });
    expect(d.status).toBe(201);
    expect(d.body.data!.can.edit).toBe(true);
    expect((await sara.post('/campus/clubs/club_gdg/posts', { kind: 'announcement', body: 'Workshop moved' })).status).toBe(403);
    expect((await sara.post('/campus/clubs/club_gdg/posts', { kind: 'discussion', body: 'That speaker was an idiot' })).status).toBe(422);
    expect((await sara.post('/campus/clubs/club_gdg/posts', { kind: 'discussion', body: 'Call me on 0551234567 for the notes' })).status).toBe(422);
    expect((await s.as('u_student2').post('/campus/clubs/club_cp/posts', { kind: 'discussion', body: 'Hello everyone' })).status).toBe(403);
    expect(checkText('هذا الشرح غبي').blocking).toBe(true);
  });

  it('a lead announcement notifies every other active member and can be pinned', async () => {
    const before = db().count('notifications', "user_id = 'u_student' AND kind = 'club_announcement'");
    const r = await s.as('u_lead').post<Post>('/campus/clubs/club_gdg/posts', { kind: 'announcement', body: 'Room change: Tuesday workshop moves to the IT lab.', pin: true });
    expect(r.status).toBe(201);
    expect(r.body.data!.pinned).toBe(true);
    expect(db().count('notifications', "user_id = 'u_student' AND kind = 'club_announcement'")).toBe(before + 1);
    expect(db().count('notifications', "user_id = 'u_lead' AND kind = 'club_announcement'")).toBe(0);
  });

  it('poll results appear after voting; questions take an accepted answer from the asker', async () => {
    const sara = s.as('u_student');
    const before = (await sara.get<Posts>('/campus/clubs/club_gdg/posts')).body.data!.items.find((p) => p.id === 'post_gdg_poll')!;
    expect(before.poll!.options.every((o) => o.votes === null)).toBe(true);
    const v = await sara.post<Post>('/campus/clubs/club_gdg/posts/post_gdg_poll/vote', { option_id: 'post_gdg_poll_o2' });
    expect(v.body.data!.poll!.my_vote).toBe('post_gdg_poll_o2');
    expect(v.body.data!.poll!.total).toBe(before.poll!.total + 1);
    const q = await sara.post<Post>('/campus/clubs/club_gdg/posts', { kind: 'question', body: 'Is the workshop recorded?' });
    const c = await s.as('u_lead').post<Post>(`/campus/clubs/club_gdg/posts/${q.body.data!.id}/comments`, { body: 'No, but the slides go up after.' });
    const answer = c.body.data!.comments[0].id;
    expect((await s.as('u_student2').post(`/campus/clubs/club_gdg/posts/${q.body.data!.id}/answer`, { comment_id: answer })).status).toBe(403);
    const a = await sara.post<Post>(`/campus/clubs/club_gdg/posts/${q.body.data!.id}/answer`, { comment_id: answer });
    expect(a.body.data!.answer_comment_id).toBe(answer);
  });
});

describe('club community: reports and moderation', () => {
  it('three reports hide a post until the lead reviews it; dismissing restores it', async () => {
    const author = s.as('u_m_04');
    const p = await author.post<Post>('/campus/clubs/club_gdg/posts', { kind: 'discussion', body: 'Unrelated giveaway, message me.' });
    const id = p.body.data!.id;
    for (const u of ['u_student', 'u_m_02', 'u_m_07']) expect((await s.as(u).post(`/campus/clubs/club_gdg/posts/${id}/report`, { reason: 'spam' })).status).toBe(201);
    expect((await s.as('u_student').post<{ created: boolean }>(`/campus/clubs/club_gdg/posts/${id}/report`, { reason: 'spam' })).body.data!.created).toBe(false);
    expect(db().get<{ hidden: number }>('SELECT hidden FROM club_posts WHERE id = ?', id)!.hidden).toBe(1);
    const saraView = (await s.as('u_student').get<Posts>('/campus/clubs/club_gdg/posts')).body.data!;
    expect(saraView.items.some((x) => x.id === id)).toBe(false);
    const queue = await s.as('u_lead').get<Array<{ id: string; post_id: string }>>('/campus/clubs/club_gdg/reports');
    const mine = queue.body.data!.filter((r) => r.post_id === id);
    expect(mine).toHaveLength(3);
    expect(JSON.stringify(queue.body.data)).not.toContain('reporter_id');
    for (const r of mine) await s.as('u_lead').post(`/campus/clubs/club_gdg/reports/${r.id}/resolve`, { action: 'dismiss' });
    expect(db().get<{ hidden: number }>('SELECT hidden FROM club_posts WHERE id = ?', id)!.hidden).toBe(0);
  });

  it('removing a reported post notifies the author; students cannot open the queue', async () => {
    expect((await s.as('u_student').get('/campus/clubs/club_gdg/reports')).status).toBe(403);
    const queue = await s.as('u_lead').get<Array<{ id: string; post_id: string }>>('/campus/clubs/club_gdg/reports');
    const seeded = queue.body.data!.find((r) => r.post_id === 'post_gdg_offtopic')!;
    const r = await s.as('u_lead').post(`/campus/clubs/club_gdg/reports/${seeded.id}/resolve`, { action: 'remove', reason: 'Off-topic: use the marketplace' });
    expect(r.status).toBe(200);
    expect(db().get<{ removed_at: string | null }>("SELECT removed_at FROM club_posts WHERE id = 'post_gdg_offtopic'")!.removed_at).not.toBeNull();
    expect(db().count('notifications', "user_id = 'u_m_20' AND kind = 'club_moderation'")).toBe(1);
  });

  it('the lead can make a member an officer, who can then pin announcements', async () => {
    const detail = await s.as('u_lead').get<ClubDetail>('/campus/clubs/club_gdg');
    const sara = detail.body.data!.members.find((m) => m.user_id === 'u_student')!;
    expect((await s.as('u_student').patch(`/campus/clubs/club_gdg/members/${sara.id}`, { role: 'officer' })).status).toBe(403);
    const res = await s.as('u_lead').patch(`/campus/clubs/club_gdg/members/${sara.id}`, { role: 'officer', title_en: 'Design lead', title_ar: 'قائدة التصميم' });
    expect(res.status).toBe(200);
    const post = await s.as('u_student').post<Post>('/campus/clubs/club_gdg/posts', { kind: 'announcement', body: 'Design review slots are open for Thursday.', pin: false });
    expect(post.status).toBe(201);
    expect(post.body.data!.can.pin).toBe(true);
  });
});

describe('club community: follow, join policies, recommendations, feed', () => {
  it('open clubs admit at once; approval clubs keep the join answer for the lead', async () => {
    const faisal = s.as('u_student2');
    const open = await faisal.post<{ membership: { status: string } }>('/campus/clubs/club_cp/join');
    expect(open.body.data!.membership.status).toBe('active');
    const approval = await s.as('u_student').post<{ membership: { id: string; status: string } }>('/campus/clubs/club_arch/join', { answer: 'My Figma case study for the study-room finder.' });
    expect(approval.body.data!.membership.status).toBe('pending');
    expect(db().get<{ answer: string }>('SELECT answer FROM club_join_answers WHERE membership_id = ?', approval.body.data!.membership.id)!.answer).toContain('Figma');
  });

  it('suggests clubs by shared interests and explains why', async () => {
    const list = await s.as('u_student2').get<ClubListItem[]>('/campus/clubs');
    const cyber = list.body.data!.find((c) => c.id === 'club_cyber')!;
    expect(cyber.for_you!.reasons.map((r) => r.key)).toContain('campus.forYou.interests');
    const best = [...list.body.data!].filter((c) => c.for_you).sort((a, b) => b.for_you!.score - a.for_you!.score)[0];
    expect(best.id).toBe('club_cyber');
    expect(list.body.data!.find((c) => c.id === 'club_cp')!.for_you).toBeNull(); // already a member
  });

  it('the feed mixes posts from joined clubs with announcements from followed clubs', async () => {
    const feed = await s.as('u_student').get<{ items: Array<Post & { club: { id: string } }> }>('/campus/community/feed');
    const clubs = new Set(feed.body.data!.items.map((p) => p.club.id));
    expect(clubs.has('club_gdg')).toBe(true);
    expect(clubs.has('club_cp')).toBe(true);
    expect(feed.body.data!.items.filter((p) => p.club.id === 'club_cp').every((p) => p.kind === 'announcement')).toBe(true);
    await s.as('u_student').del('/campus/clubs/club_cp/follow');
    const after = await s.as('u_student').get<{ items: Array<{ club: { id: string } }> }>('/campus/community/feed');
    expect(after.body.data!.items.some((p) => p.club.id === 'club_cp')).toBe(false);
  });
});

describe('QR self check-in', () => {
  it('accepts the poster code during the event window and records a verified achievement', async () => {
    const sara = s.as('u_student');
    expect((await sara.post('/campus/events/evt_gdg_openlab/checkin', { code: 'WRONG1' })).status).toBe(422);
    const ok = await sara.post<{ checked_in: { method: string } | null; created: boolean }>('/campus/events/evt_gdg_openlab/checkin', { code: `uj:checkin:evt_gdg_openlab:${checkinCode('evt_gdg_openlab')}` });
    expect(ok.status).toBe(201);
    expect(ok.body.data!.checked_in!.method).toBe('qr_self');
    expect(db().count('achievements', "user_id = 'u_student' AND event_id = 'evt_gdg_openlab'")).toBe(1);
    const again = await sara.post<{ created: boolean }>('/campus/events/evt_gdg_openlab/checkin', { code: checkinCode('evt_gdg_openlab') });
    expect(again.body.data!.created).toBe(false);
  });

  it('refuses check-in outside the window', async () => {
    const r = await s.as('u_student').post('/campus/events/evt_cp_contest/checkin', { code: checkinCode('evt_cp_contest') });
    expect(r.status).toBe(409);
  });
});
