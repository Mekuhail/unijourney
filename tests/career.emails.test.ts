import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db } from '../server/core/db.ts';

interface Email { id: string; subject: string; category: string | null; confidence: number; ambiguous: boolean; suggested_status: string | null; suggested_application_id: string | null; review_status: string; candidates: Array<{ id: string; company: string; status: string }> }
interface EmailsRes { items: Email[]; autoApply: boolean; mailbox: { connected: boolean; simulated: boolean } }

let s: TestServer;
beforeAll(async () => { s = await startServer(); });
beforeEach(() => { freshDb(); });
afterAll(async () => { await s.close(); });

const appStatus = (company: string) => db().get<{ status: string }>("SELECT status FROM applications WHERE student_id = 'u_student' AND company = ?", company)!.status;

describe('career hiring-email review', () => {
  it('leaves an ambiguous email pending with both candidate applications', async () => {
    const r = await s.as('u_student').get<EmailsRes>('/career/emails');
    expect(r.status).toBe(200);
    expect(r.body.data!.mailbox.connected).toBe(false);
    expect(r.body.data!.mailbox.simulated).toBe(true);
    const amb = r.body.data!.items.find((e) => e.subject === 'Thank you for your interest')!;
    expect(amb.ambiguous).toBe(true);
    expect(amb.review_status).toBe('pending');
    expect(amb.confidence).toBeLessThan(0.8);
    expect(amb.suggested_application_id).toBeNull();
    expect(amb.candidates.map((c) => c.company).sort()).toEqual(['Najd Telecom', 'Riyal Pay']);
    // pending emails are listed first
    expect(r.body.data!.items[0].review_status).toBe('pending');
    const noChoice = await s.as('u_student').post('/career/emails/' + amb.id + '/accept', {});
    expect(noChoice.status).toBe(400);
    const chosen = await s.as('u_student').post<{ applied: boolean; email: Email }>('/career/emails/' + amb.id + '/accept', { applicationId: amb.candidates[0].id });
    expect(chosen.status).toBe(200);
    expect(chosen.body.data!.applied).toBe(false);
    expect(chosen.body.data!.email.review_status).toBe('accepted');
  });

  it('an older confirmation never downgrades an application that is already at interview', async () => {
    const c = s.as('u_student');
    expect(appStatus('Najd Telecom')).toBe('interview');
    const list = await c.get<EmailsRes>('/career/emails');
    const older = list.body.data!.items.find((e) => e.category === 'application_confirmation')!;
    expect(older.suggested_status).toBe('applied');
    // classify with auto-apply ON: forward-only rule keeps Najd Telecom at interview and moves Riyal Pay forward
    await c.put('/career/settings', { autoApplyEmails: true });
    const cls = await c.post<{ classified: number; autoApplied: number }>('/career/emails/classify');
    expect(cls.status).toBe(200);
    expect(appStatus('Najd Telecom')).toBe('interview');
    expect(appStatus('Riyal Pay')).toBe('interview');
    expect(cls.body.data!.autoApplied).toBe(1);
    const after = await c.get<EmailsRes>('/career/emails');
    expect(after.body.data!.items.find((e) => e.id === older.id)!.review_status).toBe('pending');
    // explicit accept of the older email links it without changing status
    const acc = await c.post<{ applied: boolean; note: string; application: { status: string } }>('/career/emails/' + older.id + '/accept', {});
    expect(acc.body.data!.applied).toBe(false);
    expect(acc.body.data!.application.status).toBe('interview');
    expect(acc.body.data!.note).toMatch(/never downgrades/);
    const ev = db().all("SELECT source, from_status, to_status FROM application_events WHERE application_id = (SELECT id FROM applications WHERE company = 'Najd Telecom' AND student_id = 'u_student') ORDER BY created_at, rowid");
    expect(ev[ev.length - 1]).toMatchObject({ source: 'email', from_status: 'interview', to_status: 'interview' });
  });

  it('accepting a confident suggestion moves the application forward with an email-sourced event', async () => {
    const c = s.as('u_student');
    const list = await c.get<EmailsRes>('/career/emails');
    const assess = list.body.data!.items.find((e) => e.category === 'assessment_invite')!;
    expect(assess.review_status).toBe('pending'); // auto-apply is off by default
    expect(appStatus('Riyal Pay')).toBe('applied');
    const r = await c.post<{ applied: boolean; application: { status: string } }>('/career/emails/' + assess.id + '/accept', {});
    expect(r.status).toBe(200);
    expect(r.body.data!.applied).toBe(true);
    expect(r.body.data!.application.status).toBe('assessment');
    expect(db().count('application_events', "source = 'email' AND to_status = 'assessment'")).toBe(1);
    const dismissed = await c.post<Email>('/career/emails/' + list.body.data!.items.find((e) => e.category === 'interview_invite')!.id + '/dismiss');
    expect(dismissed.body.data!.review_status).toBe('dismissed');
    expect(appStatus('Riyal Pay')).toBe('assessment');
  });

  it('simulates a labelled email and blocks cross-student access', async () => {
    const before = db().count('hiring_emails', "student_id = 'u_student'");
    const r = await s.as('u_student').post<{ simulated: boolean; email: Email }>('/career/emails/simulate');
    expect(r.status).toBe(201);
    expect(r.body.data!.simulated).toBe(true);
    expect(db().count('hiring_emails', "student_id = 'u_student'")).toBe(before + 1);
    expect((await s.as('u_student2').post('/career/emails/' + r.body.data!.email.id + '/accept', {})).status).toBe(403);
    expect((await s.as('u_student2').get<EmailsRes>('/career/emails')).body.data!.items.length).toBe(0);
  });
});
