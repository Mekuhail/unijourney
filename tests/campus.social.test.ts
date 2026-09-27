import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db } from '../server/core/db.ts';
import { appliedMigrations, runMigrations } from '../server/core/migrations.ts';
import { setSetting } from '../server/core/settings.ts';

interface Post { id: string; type: string; body: string; reactions: number; reacted: boolean; comments: Array<{ id: string }>; can: Record<string, boolean>; audience: string; author: { id: string } }
interface Profile { id: string; name_en: string; bio: string; clubs: unknown[] | null; program: unknown; can_message: boolean; message_reason: string | null; is_me: boolean; conversation_id: string | null }
interface Thread { conversation: { id: string; unread: number; can_send: boolean }; messages: Array<{ id: string; seq: number; mine: boolean; body: string }> }

let s: TestServer;
beforeAll(async () => { freshDb(); s = await startServer(); });
afterAll(async () => { await s.close(); });

describe('community profiles', () => {
  it('public profiles never carry email or student number, and respect what the student chose to show', async () => {
    const r = await s.as('u_lead').get<Profile>('/campus/community/people/u_student');
    expect(r.status).toBe(200);
    const text = JSON.stringify(r.body.data);
    expect(text).not.toContain('@');
    expect(text).not.toContain('202400118');
    expect(r.body.data!.clubs).not.toBeNull();
    await s.as('u_student').put('/campus/community/profile/me', { show_clubs: false, show_program: false, bio: 'Front-end, UI and hackathons.' });
    const hidden = await s.as('u_lead').get<Profile>('/campus/community/people/u_student');
    expect(hidden.body.data!.clubs).toBeNull();
    expect(hidden.body.data!.program).toBeNull();
    expect(hidden.body.data!.bio).toBe('Front-end, UI and hackathons.');
    const self = await s.as('u_student').get<Profile>('/campus/community/people/u_student');
    expect(self.body.data!.clubs).not.toBeNull();
    await s.as('u_student').put('/campus/community/profile/me', { show_clubs: true, show_program: true });
  });

  it('students edit only the allowed fields of their own profile', async () => {
    expect((await s.as('u_student').put('/campus/community/profile/me', { student_no: '1' })).status).toBe(400);
    expect((await s.as('u_student').put('/campus/community/profile/me', { avatar_color: '#123456' })).status).toBe(400);
    const ok = await s.as('u_student').put<{ name_en: string }>('/campus/community/profile/me', { display_name: 'Sara O.', interests: ['web development', 'UI/UX'] });
    expect(ok.body.data!.name_en).toBe('Sara O.');
    expect(db().get<{ interests: string }>("SELECT interests FROM users WHERE id = 'u_student'")!.interests).toContain('ui/ux');
    expect((await s.as('u_reviewer').put('/campus/community/profile/me', { bio: 'x' })).status).toBe(403);
    await s.as('u_student').put('/campus/community/profile/me', { display_name: null });
  });
});

describe('student posts', () => {
  let postId = '';
  it('a student publishes, edits and deletes their own post; others cannot edit it', async () => {
    const r = await s.as('u_student').post<Post>('/campus/community/posts', { body: 'Anyone else going to the React workshop? Saving seats near the front.', event_id: 'evt_gdg_web' });
    expect(r.status).toBe(201);
    postId = r.body.data!.id;
    expect(r.body.data!.can.edit).toBe(true);
    expect((await s.as('u_lead').patch(`/campus/community/posts/${postId}`, { body: 'hijack' })).status).toBe(403);
    expect((await s.as('u_lead').del(`/campus/community/posts/${postId}`)).status).toBe(403);
    const e = await s.as('u_student').patch<Post>(`/campus/community/posts/${postId}`, { body: 'Anyone else going to the React workshop on Tuesday?' });
    expect(e.body.data!.body).toContain('Tuesday');
    expect((await s.as('u_reviewer').post('/campus/community/posts', { body: 'Staff post' })).status).toBe(403);
    expect((await s.as('u_student').post('/campus/community/posts', { body: 'Call 0551234567 for notes' })).status).toBe(422);
  });

  it('another persona likes, unlikes and comments; the author is notified and can remove the reply', async () => {
    const layan = s.as('u_lead');
    const l1 = await layan.post<{ reacted: boolean; count: number }>(`/campus/community/posts/${postId}/react`);
    expect(l1.body.data).toEqual({ reacted: true, count: 1 });
    const l2 = await layan.post<{ reacted: boolean; count: number }>(`/campus/community/posts/${postId}/react`);
    expect(l2.body.data!.reacted).toBe(false);
    await layan.post(`/campus/community/posts/${postId}/react`);
    const c = await layan.post<Post>(`/campus/community/posts/${postId}/comments`, { body: 'Yes, see you there!' });
    expect(c.status).toBe(201);
    expect(db().count('notifications', "user_id = 'u_student' AND kind = 'community_reply'")).toBe(1);
    const cid = c.body.data!.comments[0].id;
    expect((await s.as('u_student2').del(`/campus/community/posts/${postId}/comments/${cid}`)).status).toBe(403);
    const after = await s.as('u_student').get<Post>(`/campus/community/posts/${postId}`);
    expect(after.body.data!.reactions).toBe(1);
    expect(after.body.data!.comments).toHaveLength(1);
  });

  it('campus-only posts stay on their campus; three reports hide a post until a moderator reviews it', async () => {
    const khb = await s.as('u_student').get<Post>('/campus/community/posts/sp_seed_lab_khb');
    expect(khb.status).toBe(404);
    expect((await s.as('u_student2').get('/campus/community/posts/sp_seed_lab_khb')).status).toBe(200);
    for (const u of ['u_student', 'u_m_02', 'u_m_04']) expect((await s.as(u).post('/campus/community/posts/sp_seed_readme/report', { reason: 'spam' })).status).toBe(201);
    expect((await s.as('u_m_09').get('/campus/community/posts/sp_seed_readme')).status).toBe(404);
    expect((await s.as('u_student').get('/campus/community/reports')).status).toBe(403);
    const q = await s.as('u_reviewer').get<Array<{ id: string; target_id: string }>>('/campus/community/reports');
    const rep = q.body.data!.find((r) => r.target_id === 'sp_seed_readme')!;
    await s.as('u_reviewer').post(`/campus/community/reports/${rep.id}/resolve`, { action: 'dismiss' });
    expect((await s.as('u_m_09').get('/campus/community/posts/sp_seed_readme')).status).toBe(200);
  });

  it('the home feed mixes student posts with club posts the viewer may see', async () => {
    const r = await s.as('u_student').get<{ items: Post[] }>('/campus/community/home');
    const types = new Set(r.body.data!.items.map((p) => p.type));
    expect(types).toEqual(new Set(['social', 'club']));
    expect(r.body.data!.items.some((p) => p.id === 'sp_seed_lab_khb')).toBe(false);
    const clubs = await s.as('u_student').get<{ items: Post[] }>('/campus/community/home?scope=clubs');
    expect(clubs.body.data!.items.every((p) => p.type === 'club')).toBe(true);
    const search = await s.as('u_student').get<{ posts: Post[]; clubs: unknown[]; events: unknown[]; people: unknown[] }>('/campus/community/search?q=workshop');
    expect(search.body.data!.events.length).toBeGreaterThan(0);
    expect(search.body.data!.posts.length).toBeGreaterThan(0);
  });
});

describe('messages', () => {
  it('two personas exchange messages; unread and read state persist on the server', async () => {
    const sara = s.as('u_student');
    const list = await sara.get<{ items: Array<{ id: string; unread: number }>; unread: number }>('/campus/community/messages');
    expect(list.body.data!.unread).toBe(1);
    const t = await sara.get<Thread>('/campus/community/messages/dm_seed_sara_layan');
    expect(t.body.data!.messages.length).toBe(3);
    expect((await sara.get<{ conversations: number }>('/campus/community/messages/unread')).body.data!.conversations).toBe(0);
    expect(db().get<{ read_at: string | null }>("SELECT read_at FROM notifications WHERE id = 'ntf_seed_dm_sara'")!.read_at).not.toBeNull();
    const sent = await sara.post<{ seq: number }>('/campus/community/messages/dm_seed_sara_layan', { body: 'Yes, I can help at the desk from 15:30.' });
    expect(sent.status).toBe(201);
    const layan = s.as('u_lead');
    expect((await layan.get<{ conversations: number }>('/campus/community/messages/unread')).body.data!.conversations).toBe(1);
    const again = await layan.post('/campus/community/messages/dm_seed_sara_layan', { body: 'Perfect, thank you!' });
    expect(again.status).toBe(201);
    await sara.post('/campus/community/messages/dm_seed_sara_layan', { body: 'See you Tuesday.' });
    await sara.post('/campus/community/messages/dm_seed_sara_layan', { body: 'Should I bring a laptop?' });
    // Two messages from Sara leave one coalesced unread notification for Layan.
    expect(db().count('notifications', "user_id = 'u_lead' AND kind = 'message' AND read_at IS NULL")).toBe(1);
    const incremental = await layan.get<Thread>(`/campus/community/messages/dm_seed_sara_layan?after=${sent.body.data!.seq}`);
    expect(incremental.body.data!.messages.map((m) => m.body)).toEqual(['Perfect, thank you!', 'See you Tuesday.', 'Should I bring a laptop?']);
  });

  it('only participants can read or send, and permissions and blocks are enforced by the server', async () => {
    expect((await s.as('u_student2').get('/campus/community/messages/dm_seed_sara_layan')).status).toBe(404);
    expect((await s.as('u_student2').post('/campus/community/messages/dm_seed_sara_layan', { body: 'hi' })).status).toBe(404);
    // Deema accepts no new messages; Wejdan only from club mates.
    expect((await s.as('u_student').post('/campus/community/messages/start', { user_id: 'u_m_08' })).status).toBe(403);
    expect((await s.as('u_student').post('/campus/community/messages/start', { user_id: 'u_m_05' })).status).toBe(403);
    expect((await s.as('u_reviewer').post('/campus/community/messages/start', { user_id: 'u_student' })).status).toBe(403);
    const start = await s.as('u_student2').post<{ id: string; created: boolean }>('/campus/community/messages/start', { user_id: 'u_student' });
    expect(start.status).toBe(201);
    const id = start.body.data!.id;
    const m = await s.as('u_student2').post<{ id: string }>(`/campus/community/messages/${id}`, { body: 'Hi Sara, are you in a Farq team yet?' });
    const rep = await s.as('u_student').post<{ blocked: boolean }>(`/campus/community/messages/${id}/report`, { message_id: m.body.data!.id, reason: 'spam', block: true });
    expect(rep.body.data!.blocked).toBe(true);
    expect((await s.as('u_student2').post(`/campus/community/messages/${id}`, { body: 'Hello?' })).status).toBe(403);
    const prof = await s.as('u_student').get<Profile>('/campus/community/people/u_student2');
    expect(prof.body.data!.message_reason).toBe('you_blocked');
    expect((await s.as('u_student2').get('/campus/community/people/u_student')).status).toBe(404);
    const q = await s.as('u_reviewer').get<Array<{ target_type: string; body: string }>>('/campus/community/reports');
    expect(q.body.data!.some((r) => r.target_type === 'message' && r.body.includes('Farq'))).toBe(true);
    await s.as('u_student').del('/campus/community/blocks/u_student2');
    expect((await s.as('u_student2').post(`/campus/community/messages/${id}`, { body: 'Sorry, wrong person.' })).status).toBe(201);
  });
});

describe('safe migration for existing volumes', () => {
  it('fills the new tables once on a database seeded before the community existed, without touching other rows', () => {
    expect(appliedMigrations()).toContain('community-social-v1');
    const users = db().count('users');
    const clubPosts = db().count('club_posts');
    // Simulate the live volume: new tables empty, migration not yet recorded.
    for (const t of ['dm_messages', 'dm_conversations', 'social_likes', 'social_comments', 'social_posts', 'community_profiles', 'community_reports', 'dm_blocks']) db().exec(`DELETE FROM ${t}`);
    db().exec("DELETE FROM notifications WHERE id = 'ntf_seed_dm_sara'");
    setSetting('migrations_applied', ['parking-v1', 'planner-v1']);
    expect(runMigrations(db())).toEqual(['community-social-v1']);
    expect(db().count('social_posts')).toBeGreaterThan(8);
    expect(db().count('dm_conversations')).toBe(2);
    expect(runMigrations(db())).toEqual([]);
    expect(db().count('users')).toBe(users);
    expect(db().count('club_posts')).toBe(clubPosts);
  });
});
