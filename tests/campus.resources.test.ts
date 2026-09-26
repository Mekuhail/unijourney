import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db } from '../server/core/db.ts';
import { createDocumentFromBuffer } from '../server/core/documents.ts';
import { makePdf } from '../server/seed/fixtures.ts';

let s: TestServer;
beforeAll(async () => { freshDb(); s = await startServer(); });
afterAll(async () => { await s.close(); });

describe('resources: search, upload, bookmark, study task', () => {
  it('searches by course code and general text; medical docs are never listed', async () => {
    const sara = s.as('u_student');
    const byCode = await sara.get<{ items: Array<{ course_code: string; status: string }> }>('/campus/resources?q=SWE%20302');
    expect(byCode.status).toBe(200);
    expect(byCode.body.data!.items.length).toBeGreaterThanOrEqual(2);
    expect(byCode.body.data!.items.every((r) => r.course_code === 'SWE 302')).toBe(true);
    const byText = await sara.get<{ items: Array<{ title: string }> }>('/campus/resources?q=scheduling');
    expect(byText.body.data!.items.some((r) => /scheduling/i.test(r.title))).toBe(true);
    // pending resources of others are hidden
    const all = await sara.get<{ items: Array<{ id: string; status: string }> }>('/campus/resources');
    expect(all.body.data!.items.some((r) => r.status === 'pending')).toBe(false);
    expect(all.body.data!.items.length).toBeGreaterThanOrEqual(10);
    // a medical document can never be attached to a resource
    const med = createDocumentFromBuffer('u_student', 'medical', 'report.pdf', 'application/pdf', makePdf(['Sick leave']));
    const r = await sara.post('/campus/resources', { course_code: 'CIS 321', term: '2026-1', type: 'notes', title: 'Should fail', documentId: med.id, rights_confirmed: true });
    expect(r.status).toBe(400);
  });

  it('upload requires rights confirmation and document ownership', async () => {
    const sara = s.as('u_student');
    const mine = createDocumentFromBuffer('u_student', 'resource', 'notes.pdf', 'application/pdf', makePdf(['My notes']));
    const theirs = createDocumentFromBuffer('u_lead', 'resource', 'other.pdf', 'application/pdf', makePdf(['Not mine']));
    const noRights = await sara.post('/campus/resources', { course_code: 'CIS 321', term: '2026-1', type: 'notes', title: 'Paging notes', documentId: mine.id, rights_confirmed: false });
    expect(noRights.status).toBe(400);
    const notOwner = await sara.post('/campus/resources', { course_code: 'CIS 321', term: '2026-1', type: 'notes', title: 'Paging notes', documentId: theirs.id, rights_confirmed: true });
    expect(notOwner.status).toBe(403);
    const ok = await sara.post<{ id: string; status: string; course_code: string }>('/campus/resources', { course_code: 'cis321', term: '2026-1', type: 'notes', title: 'Paging notes', documentId: mine.id, rights_confirmed: true, content_text: 'Paging splits memory into frames.\n\nA page table maps pages to frames.' });
    expect(ok.status).toBe(201);
    expect(ok.body.data!.status).toBe('pending');
    expect(ok.body.data!.course_code).toBe('CIS 321');
    // visible to the owner under mine=1, not to others
    expect((await sara.get<{ items: Array<{ id: string }> }>('/campus/resources?mine=1')).body.data!.items.some((r) => r.id === ok.body.data!.id)).toBe(true);
    expect((await s.as('u_student2').get(`/campus/resources/${ok.body.data!.id}`)).status).toBe(403);
    // other users cannot read the pending file through the document grant; the owner can
    expect((await s.as('u_student2').get(`/documents/${mine.id}`)).status).toBe(403);
    expect((await sara.get(`/documents/${mine.id}`)).status).toBe(200);
  });

  it('bookmark and helpful are toggles', async () => {
    const sara = s.as('u_student');
    const b1 = await sara.post<{ bookmarked: boolean }>('/campus/resources/res_ai_search/bookmark');
    expect(b1.body.data!.bookmarked).toBe(true);
    const b2 = await sara.post<{ bookmarked: boolean }>('/campus/resources/res_ai_search/bookmark');
    expect(b2.body.data!.bookmarked).toBe(false);
    const before = db().get('SELECT helpful_count FROM resources WHERE id = ?', 'res_net_tcp')!.helpful_count as number;
    const v1 = await sara.post<{ voted: boolean; resource: { helpful_count: number } }>('/campus/resources/res_net_tcp/helpful');
    expect(v1.body.data!.voted).toBe(true);
    expect(v1.body.data!.resource.helpful_count).toBe(before + 1);
    const v2 = await sara.post<{ voted: boolean; resource: { helpful_count: number } }>('/campus/resources/res_net_tcp/helpful');
    expect(v2.body.data!.voted).toBe(false);
    expect(v2.body.data!.resource.helpful_count).toBe(before);
  });

  it('creates a linked study task from a resource', async () => {
    const sara = s.as('u_student');
    const r = await sara.post<{ task: { id: string; source: string; resource_id: string; course_code: string; scheduled_date: string | null } }>('/campus/resources/res_os_sched/study-task', { effort_min: 45, deadline: '2026-10-05' });
    expect(r.status).toBe(201);
    expect(r.body.data!.task.source).toBe('resource');
    expect(r.body.data!.task.resource_id).toBe('res_os_sched');
    expect(r.body.data!.task.course_code).toBe('CIS 321');
    expect(r.body.data!.task.scheduled_date).toBeNull();
    expect(db().count('study_tasks', "student_id = 'u_student' AND resource_id = 'res_os_sched'")).toBe(1);
  });

  it('published resource files are readable by any user via the document grant', async () => {
    const docId = db().get('SELECT document_id FROM resources WHERE id = ?', 'res_os_sched')!.document_id as string;
    expect((await s.as('u_student2').get(`/documents/${docId}`)).status).toBe(200);
  });

  it('summary works without an AI key (extractive, cited to paragraphs)', async () => {
    const r = await s.as('u_student').post<{ provider: string; points: Array<{ citation: { paragraph: number } }> }>('/campus/resources/res_os_sched/summary');
    expect(r.status).toBe(200);
    expect(r.body.data!.points.length).toBe(3);
    expect(r.body.data!.points[2].citation.paragraph).toBe(3);
  });
});

describe('moderation', () => {
  it('only reviewer/registrar can moderate; decision notifies the author', async () => {
    expect((await s.as('u_student').get('/campus/moderation/resources')).status).toBe(403);
    expect((await s.as('u_lead').post('/campus/moderation/resources/res_req_stories', { decision: 'published' })).status).toBe(403);
    expect((await s.as('u_security').post('/campus/moderation/resources/res_req_stories', { decision: 'published' })).status).toBe(403);
    const q = await s.as('u_reviewer').get<{ items: Array<{ id: string }>; counts: { pending: number } }>('/campus/moderation/resources');
    expect(q.status).toBe(200);
    expect(q.body.data!.items.some((r) => r.id === 'res_req_stories')).toBe(true);
    const d = await s.as('u_admissions').post<{ status: string }>('/campus/moderation/resources/res_req_stories', { decision: 'published', note: 'Looks original' });
    expect(d.status).toBe(200);
    expect(d.body.data!.status).toBe('published');
    expect(db().count('notifications', "user_id = 'u_graduating' AND kind = 'resource_decision'")).toBe(1);
    // report → reported status → dismiss restores published
    const rep = await s.as('u_student').post<{ report_id: string }>('/campus/resources/res_req_stories/report', { reason: 'Looks like copied slides from the lecture' });
    expect(rep.status).toBe(201);
    expect(db().get('SELECT status FROM resources WHERE id = ?', 'res_req_stories')!.status).toBe('reported');
    const res = await s.as('u_reviewer').post(`/campus/moderation/reports/${rep.body.data!.report_id}/resolve`, { action: 'dismiss' });
    expect(res.status).toBe(200);
    expect(db().get('SELECT status FROM resources WHERE id = ?', 'res_req_stories')!.status).toBe('published');
  });
});
