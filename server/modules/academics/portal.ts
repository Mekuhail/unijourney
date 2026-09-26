/**
 * UniversityPortalAdapter (EduGate-style) — demo provider. Runs in-process against the local database:
 * capacity check + increment are atomic (single transaction), every write is identified by an operation id and an
 * idempotency key (unique in portal_operations), and callers can simulate timeouts / partial success.
 * Nothing here talks to a real university system; every result is labelled `simulated: true`.
 */
import { db, j, pj } from '../../core/db.ts';
import { nowIso } from '../../core/clock.ts';
import { newId } from '../../core/ids.ts';

export interface PerSectionResult { sectionId: string; result: 'enrolled' | 'full' | 'error'; message?: string }
export interface EnrollmentReceipt { operationId: string; portalRef: string; status: 'committed' | 'partial' | 'failed'; perSection: PerSectionResult[]; committedAt: string; label: 'Demo submission' }
export interface EnrollmentResult { receipt: EnrollmentReceipt; simulated: true; provider: 'demo'; replayed: boolean }
export interface ExcuseReceipt { operationId: string; portal_request_id: string; status: 'submitted'; submittedAt: string; label: 'Demo submission' }

export type SimulateMode = 'timeout' | 'stale_capacity' | 'partial' | undefined;

let refCounter = 0;
function portalRef(): string {
  refCounter += 1;
  const n = db().count('portal_operations') + refCounter;
  return `EDU-${String(2026)}-${String(100000 + n).slice(1)}`;
}

/** Read-only preview: live seat counts for the requested sections. */
export function previewEnrollment(sectionIds: string[]): { ok: boolean; sections: Array<{ sectionId: string; seatsLeft: number; capacity: number; enrolled: number; status: string }>; simulated: true } {
  const sections = sectionIds.map((id) => {
    const r = db().get('SELECT id, capacity, enrolled, status FROM course_sections WHERE id = ?', id);
    return { sectionId: id, seatsLeft: r ? Math.max(0, (r.capacity as number) - (r.enrolled as number)) : 0, capacity: (r?.capacity as number) ?? 0, enrolled: (r?.enrolled as number) ?? 0, status: (r?.status as string) ?? 'missing' };
  });
  return { ok: sections.every((s) => s.seatsLeft > 0 && s.status === 'open'), sections, simulated: true };
}

/**
 * Atomic enrolment. Idempotent on `idempotencyKey`: replaying the same key returns the stored receipt without
 * touching seat counts again. `simulate: 'partial'` marks the last section as full to model a non-atomic portal.
 */
export function submitEnrollment(input: { operationId: string; idempotencyKey: string; studentId: string; sectionIds: string[]; payloadHash: string; simulate?: SimulateMode }): EnrollmentResult {
  return db().tx(() => {
    const existing = db().get('SELECT * FROM portal_operations WHERE idempotency_key = ?', input.idempotencyKey);
    if (existing) return { receipt: pj<EnrollmentReceipt>(existing.result, null as never), simulated: true, provider: 'demo', replayed: true };
    const perSection: PerSectionResult[] = [];
    input.sectionIds.forEach((sectionId, idx) => {
      const r = db().get('SELECT capacity, enrolled, status FROM course_sections WHERE id = ?', sectionId);
      if (!r) { perSection.push({ sectionId, result: 'error', message: 'Section not found' }); return; }
      const forceFull = input.simulate === 'partial' && idx === input.sectionIds.length - 1;
      if (r.status !== 'open' || (r.enrolled as number) >= (r.capacity as number) || forceFull) { perSection.push({ sectionId, result: 'full', message: forceFull ? 'Seat taken moments before commit (simulated)' : 'No seats left' }); return; }
      db().run('UPDATE course_sections SET enrolled = enrolled + 1 WHERE id = ? AND enrolled < capacity', sectionId);
      perSection.push({ sectionId, result: 'enrolled' });
    });
    const enrolledCount = perSection.filter((p) => p.result === 'enrolled').length;
    const status: EnrollmentReceipt['status'] = enrolledCount === input.sectionIds.length ? 'committed' : enrolledCount > 0 ? 'partial' : 'failed';
    const receipt: EnrollmentReceipt = { operationId: input.operationId, portalRef: portalRef(), status, perSection, committedAt: nowIso(), label: 'Demo submission' };
    db().insert('portal_operations', { id: input.operationId, kind: 'enrollment', student_id: input.studentId, payload_hash: input.payloadHash, idempotency_key: input.idempotencyKey, status, result: j(receipt), created_at: nowIso(), completed_at: nowIso() });
    return { receipt, simulated: true, provider: 'demo', replayed: false };
  });
}

/** Reconciliation after an uncertain outcome: look the operation up by id. `not_found` is not proof of failure. */
export function getSubmissionStatus(operationId: string): { found: boolean; status: 'committed' | 'partial' | 'failed' | 'pending' | 'not_found'; receipt: EnrollmentReceipt | null; excuse?: ExcuseReceipt | null; simulated: true } {
  const r = db().get('SELECT * FROM portal_operations WHERE id = ?', operationId);
  if (!r) return { found: false, status: 'not_found', receipt: null, simulated: true };
  const result = pj<Record<string, unknown>>(r.result, {});
  return { found: true, status: r.status as never, receipt: r.kind === 'enrollment' ? (result as unknown as EnrollmentReceipt) : null, excuse: r.kind === 'excuse' ? (result as unknown as ExcuseReceipt) : null, simulated: true };
}

/** Attendance feed (demo): the local attendance table is the source of truth for the prototype. */
export function getAttendance(studentId: string, term: string) {
  return db().all(`SELECT a.* FROM attendance_records a JOIN course_sections s ON s.id = a.section_id WHERE a.student_id = ? AND s.term = ? ORDER BY a.session_date, a.start_time`, studentId, term);
}

export function submitExcuse(input: { operationId: string; idempotencyKey: string; studentId: string; excuseId: string; payloadHash: string }): { receipt: ExcuseReceipt; simulated: true; replayed: boolean } {
  return db().tx(() => {
    const existing = db().get('SELECT * FROM portal_operations WHERE idempotency_key = ?', input.idempotencyKey);
    if (existing) return { receipt: pj<ExcuseReceipt>(existing.result, null as never), simulated: true, replayed: true };
    const n = db().count('portal_operations', `kind = 'excuse'`) + 89;
    const receipt: ExcuseReceipt = { operationId: input.operationId, portal_request_id: `EX-2026-${String(n).padStart(4, '0')}`, status: 'submitted', submittedAt: nowIso(), label: 'Demo submission' };
    db().insert('portal_operations', { id: input.operationId, kind: 'excuse', student_id: input.studentId, payload_hash: input.payloadHash, idempotency_key: input.idempotencyKey, status: 'committed', result: j(receipt), created_at: nowIso(), completed_at: nowIso() });
    return { receipt, simulated: true, replayed: false };
  });
}

export function newOperationId() { return newId('op'); }
