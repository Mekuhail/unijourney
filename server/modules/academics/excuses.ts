import { db, j, pj } from '../../core/db.ts';
import { diffDays, nowIso, todayIso, toLocal } from '../../core/clock.ts';
import { newId, stableHash } from '../../core/ids.ts';
import { bad, conflict, forbidden, notFound, unprocessable } from '../../core/http.ts';
import { checkApproval, consumeApproval, createApproval, getApproval, invalidateApprovals } from '../../core/approvals.ts';
import { getDocument, readDocumentBuffer } from '../../core/documents.ts';
import { notify } from '../../core/notify.ts';
import { audit } from '../../core/audit.ts';
import { getPolicies } from '../../core/settings.ts';
import { extractFromBuffer, type ExtractionResult } from '../../adapters/extraction.ts';
import type { DocumentMeta, User } from '../../../shared/types.ts';
import { hasRole } from '../../core/auth.ts';
import { courseTitle, locationInfo } from './common.ts';
import { findCourseCodes, resolveDatePhrase } from './nl.ts';
import { newOperationId, submitExcuse as portalSubmitExcuse } from './portal.ts';

export type ExcuseStatus = 'draft' | 'ready' | 'approved' | 'submitting' | 'submitted' | 'under_review' | 'needs_information' | 'accepted' | 'rejected' | 'failed' | 'outcome_unknown';
const EDITABLE: ExcuseStatus[] = ['draft', 'ready', 'needs_information', 'approved'];
export const REVIEWABLE: ExcuseStatus[] = ['submitted', 'under_review', 'needs_information'];

export interface AttendanceSession { id: string; section_id: string; course_code: string; title_en: string; title_ar: string; session_date: string; start_time: string; end_time: string; status: string; original_status: string; excuse_request_id: string | null; location: { id: string; name_en: string; name_ar: string } | null; excuse_status?: string | null }
export interface ExcuseCheck { id: string; label: string; status: 'pass' | 'warn' | 'fail'; explanation: string }
export interface StoredExtraction { documentId: string; provider: 'demo'; textFound: boolean; fromDate?: ExtractionResult['fromDate']; toDate?: ExtractionResult['toDate']; reference?: ExtractionResult['reference']; patientName?: ExtractionResult['patientName']; issuer?: ExtractionResult['issuer']; dates: ExtractionResult['dates']; note: string; extractedAt: string }
export interface ExcuseView {
  id: string; student_id: string; student_name_en?: string; student_name_ar?: string; attendance_ids: string[]; sessions: AttendanceSession[]; type: string; reason: string; from_date: string | null; to_date: string | null; reference: string | null;
  document_ids: string[]; documents: DocumentMeta[]; extracted: StoredExtraction | null; event_id: string | null; event: { id: string; title_en: string; organizer: string; start_at: string; end_at: string } | null;
  status: ExcuseStatus; portal_request_id: string | null; review_department: string; reviewer_id: string | null; reviewer_note: string | null; revision: number; payload_hash: string; approval_id: string | null;
  approval: { id: string; status: string; expires_at: string } | null; history: Array<{ at: string; action: string; by: string; note?: string }>; checks: ExcuseCheck[]; can_approve: boolean; editable: boolean; created_at: string; updated_at: string;
}

// ---------------------------------------------------------------- attendance
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sessionView(r: any): AttendanceSession {
  const t = courseTitle(r.course_code);
  const loc = locationInfo(r.location_id);
  return { id: r.id, section_id: r.section_id, course_code: r.course_code, title_en: t.en, title_ar: t.ar, session_date: r.session_date, start_time: r.start_time, end_time: r.end_time, status: r.status, original_status: r.original_status, excuse_request_id: r.excuse_request_id ?? null, location: loc ? { id: loc.id, name_en: loc.name_en, name_ar: loc.name_ar } : null };
}

export function attendanceOverview(studentId: string, term: string) {
  const pol = getPolicies();
  const rows = db().all(`SELECT a.*, s.section_no, s.instructor FROM attendance_records a JOIN course_sections s ON s.id = a.section_id WHERE a.student_id = ? AND s.term = ? ORDER BY a.course_code, a.session_date, a.start_time`, studentId, term);
  const open = new Map<string, string>();
  for (const e of db().all(`SELECT id, attendance_ids, status FROM excuse_requests WHERE student_id = ? AND status NOT IN ('rejected')`, studentId)) for (const aid of pj<string[]>(e.attendance_ids, [])) open.set(aid, `${e.id}|${e.status}`);
  const byCourse = new Map<string, { course_code: string; title_en: string; title_ar: string; section_id: string; section_no: string; instructor: string; sessions: AttendanceSession[] }>();
  for (const r of rows) {
    const key = r.section_id as string;
    if (!byCourse.has(key)) { const t = courseTitle(r.course_code); byCourse.set(key, { course_code: r.course_code, title_en: t.en, title_ar: t.ar, section_id: key, section_no: r.section_no, instructor: r.instructor, sessions: [] }); }
    const v = sessionView(r);
    const o = open.get(v.id);
    if (o) { const [eid, st] = o.split('|'); v.excuse_request_id = v.excuse_request_id ?? eid; v.excuse_status = st; }
    byCourse.get(key)!.sessions.push(v);
  }
  const courses = [...byCourse.values()].map((c) => {
    const total = c.sessions.length;
    const counts = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const s of c.sessions) counts[s.status as keyof typeof counts] = (counts[s.status as keyof typeof counts] ?? 0) + 1;
    const absencePct = total ? Math.round((counts.absent / total) * 1000) / 10 : 0;
    const level = absencePct >= pol.absenceDenialPercent.value ? 'denial' : absencePct >= pol.absenceWarningPercent.value ? 'warning' : 'ok';
    return { ...c, total, counts, absence_percent: absencePct, level, warning_percent: pol.absenceWarningPercent.value, denial_percent: pol.absenceDenialPercent.value };
  });
  return { term, today: todayIso(), policy: { warning: pol.absenceWarningPercent, denial: pol.absenceDenialPercent, excuseDeadlineDays: pol.excuseDeadlineDays, treatment: pol.excuseAcceptedTreatment }, courses };
}

export function ownedAttendance(studentId: string, ids: string[]) {
  const rows = ids.map((id) => db().get('SELECT * FROM attendance_records WHERE id = ?', id));
  const missing = rows.findIndex((r) => !r);
  if (missing >= 0) throw notFound(`Attendance record ${ids[missing]} not found`);
  const foreign = rows.find((r) => r!.student_id !== studentId);
  if (foreign) throw forbidden('One of the attendance records belongs to another student');
  return rows.map((r) => r!);
}

// ---------------------------------------------------------------- views
function checksFor(row: Record<string, unknown>, sessions: AttendanceSession[], docs: DocumentMeta[], extracted: StoredExtraction | null, studentName: string): ExcuseCheck[] {
  const pol = getPolicies();
  const checks: ExcuseCheck[] = [];
  const today = todayIso();
  const late = sessions.filter((s) => diffDays(s.session_date, today) > pol.excuseDeadlineDays.value);
  checks.push(late.length ? { id: 'deadline', label: 'Submission deadline', status: 'warn', explanation: `${late.map((s) => `${s.course_code} on ${s.session_date}`).join(', ')} ${late.length > 1 ? 'are' : 'is'} older than ${pol.excuseDeadlineDays.value} days (${pol.excuseDeadlineDays.provenance}); the department may reject late requests.` } : { id: 'deadline', label: 'Submission deadline', status: 'pass', explanation: `Within ${pol.excuseDeadlineDays.value} days of the session.` });
  const reason = String(row.reason ?? '').trim();
  checks.push(reason.length >= 10 ? { id: 'reason', label: 'Reason', status: 'pass', explanation: 'Reason provided.' } : { id: 'reason', label: 'Reason', status: 'fail', explanation: 'Add a short reason (at least 10 characters).' });
  const type = String(row.type);
  if (type === 'other') checks.push(docs.length ? { id: 'evidence', label: 'Evidence', status: 'pass', explanation: `${docs.length} file(s) attached.` } : { id: 'evidence', label: 'Evidence', status: 'warn', explanation: 'No evidence attached; the department may ask for supporting documents.' });
  else checks.push(docs.length ? { id: 'evidence', label: 'Evidence', status: 'pass', explanation: `${docs.length} file(s) attached (originals kept unchanged).` } : { id: 'evidence', label: 'Evidence', status: 'fail', explanation: type === 'medical' ? 'Attach the Sehhaty sick-leave report (PDF/JPG/PNG).' : 'Attach the invitation, confirmation or participation certificate.' });
  const from = row.from_date as string | null, to = row.to_date as string | null;
  if (from && to) {
    const uncovered = sessions.filter((s) => s.session_date < from || s.session_date > to);
    checks.push(uncovered.length ? { id: 'coverage', label: 'Dates cover the session(s)', status: 'warn', explanation: `${from} → ${to} does not cover ${uncovered.map((s) => `${s.course_code} ${s.session_date}`).join(', ')}. Correct the dates or expect staff review.` } : { id: 'coverage', label: 'Dates cover the session(s)', status: 'pass', explanation: `${from} → ${to} covers every selected session.` });
    if (from > to) checks.push({ id: 'range', label: 'Date order', status: 'fail', explanation: 'The start date is after the end date.' });
  } else checks.push({ id: 'coverage', label: 'Dates cover the session(s)', status: 'fail', explanation: 'Enter the covered period (from / to).' });
  if (extracted?.patientName?.value) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
    const ok = norm(extracted.patientName.value) === norm(studentName) || norm(studentName).includes(norm(extracted.patientName.value)) || norm(extracted.patientName.value).includes(norm(studentName));
    checks.push(ok ? { id: 'name', label: 'Name on evidence', status: 'pass', explanation: `"${extracted.patientName.value}" matches your profile (confidence ${Math.round(extracted.patientName.confidence * 100)}%).` } : { id: 'name', label: 'Name on evidence', status: 'warn', explanation: `The document names "${extracted.patientName.value}", which does not match ${studentName}. Correct the file or expect staff review.` });
  }
  if (extracted && (extracted.fromDate || extracted.toDate) && from && to) {
    const ef = extracted.fromDate?.value, et = extracted.toDate?.value;
    if ((ef && ef !== from) || (et && et !== to)) checks.push({ id: 'dates_match', label: 'Dates vs evidence', status: 'warn', explanation: `Entered ${from} → ${to} differs from the extracted ${ef ?? '?'} → ${et ?? '?'}. Extraction can be wrong — keep the correct values.` });
    else checks.push({ id: 'dates_match', label: 'Dates vs evidence', status: 'pass', explanation: 'Entered dates match the extracted dates.' });
  }
  return checks;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function excuseView(r: any, opts: { withStudent?: boolean } = {}): ExcuseView {
  const attendanceIds = pj<string[]>(r.attendance_ids, []);
  const sessions = attendanceIds.map((id) => db().get('SELECT * FROM attendance_records WHERE id = ?', id)).filter(Boolean).map(sessionView);
  const documentIds = pj<string[]>(r.document_ids, []);
  const documents = documentIds.map((id) => getDocument(id)).filter((d): d is DocumentMeta => !!d);
  const extracted = pj<StoredExtraction | null>(r.extracted, null);
  const student = db().get('SELECT name_en, name_ar FROM users WHERE id = ?', r.student_id);
  const approval = r.approval_id ? getApproval(r.approval_id) : null;
  const event = r.event_id ? db().get('SELECT id, title_en, organizer, start_at, end_at FROM events WHERE id = ?', r.event_id) : null;
  const checks = checksFor(r, sessions, documents, extracted && extracted.documentId ? extracted : null, (student?.name_en as string) ?? '');
  const status = r.status as ExcuseStatus;
  return {
    id: r.id, student_id: r.student_id, ...(opts.withStudent ? { student_name_en: student?.name_en as string, student_name_ar: student?.name_ar as string } : {}), attendance_ids: attendanceIds, sessions, type: r.type, reason: r.reason, from_date: r.from_date ?? null, to_date: r.to_date ?? null, reference: r.reference ?? null,
    document_ids: documentIds, documents, extracted: extracted && extracted.documentId ? extracted : null, event_id: r.event_id ?? null, event: event ? { id: event.id as string, title_en: event.title_en as string, organizer: event.organizer as string, start_at: event.start_at as string, end_at: event.end_at as string } : null,
    status, portal_request_id: r.portal_request_id ?? null, review_department: r.review_department, reviewer_id: r.reviewer_id ?? null, reviewer_note: r.reviewer_note ?? null, revision: r.revision, payload_hash: r.payload_hash, approval_id: r.approval_id ?? null,
    approval: approval ? { id: approval.id, status: approval.status, expires_at: approval.expires_at } : null, history: pj(r.history, []), checks, can_approve: EDITABLE.includes(status) && !checks.some((c) => c.status === 'fail'), editable: EDITABLE.includes(status), created_at: r.created_at, updated_at: r.updated_at
  };
}
export function getExcuseRow(id: string) {
  const r = db().get('SELECT * FROM excuse_requests WHERE id = ?', id);
  if (!r) throw notFound('Excuse request not found');
  return r;
}
export function requireOwnExcuse(user: User, id: string) {
  const r = getExcuseRow(id);
  if (r.student_id !== user.id) throw forbidden();
  return r;
}
function pushHistory(r: Record<string, unknown>, action: string, by: string, note?: string) {
  const h = pj<unknown[]>(r.history, []);
  h.push({ at: nowIso(), action, by, note });
  return j(h);
}
export function excusePayloadHash(r: Record<string, unknown>) {
  return stableHash({ attendance_ids: pj<string[]>(r.attendance_ids, []), type: r.type, reason: r.reason, from_date: r.from_date ?? null, to_date: r.to_date ?? null, reference: r.reference ?? null, document_ids: pj<string[]>(r.document_ids, []) });
}
function readiness(r: Record<string, unknown>): ExcuseStatus {
  const v = excuseView(r);
  if (r.status === 'needs_information') return 'needs_information';
  return v.checks.some((c) => c.status === 'fail') ? 'draft' : 'ready';
}

// ---------------------------------------------------------------- student actions
export function createExcuse(user: User, attendanceIds: string[], type: 'medical' | 'event' | 'other', extra: { eventId?: string | null; reason?: string; from_date?: string | null; to_date?: string | null } = {}): ExcuseView {
  const ids = [...new Set(attendanceIds)];
  if (!ids.length) throw bad('Select at least one absence');
  const rows = ownedAttendance(user.id, ids);
  const notAbsent = rows.filter((r) => !['absent', 'late'].includes(r.status as string));
  if (notAbsent.length) throw unprocessable(`Only absent or late sessions can be excused: ${notAbsent.map((r) => `${r.course_code} ${r.session_date} is ${r.status}`).join('; ')}`);
  for (const r of rows) {
    const open = db().get(`SELECT id, status FROM excuse_requests WHERE student_id = ? AND status NOT IN ('rejected') AND attendance_ids LIKE ?`, user.id, `%"${r.id}"%`);
    if (open) throw conflict(`An excuse request (${open.id}, ${open.status}) already covers ${r.course_code} on ${r.session_date}.`, { excuseId: open.id });
  }
  const dates = rows.map((r) => r.session_date as string).sort();
  const id = newId('exc');
  const now = nowIso();
  const reason = extra.reason ?? '';
  const row = { id, student_id: user.id, attendance_ids: j(ids), type, reason, from_date: extra.from_date ?? dates[0], to_date: extra.to_date ?? dates[dates.length - 1], reference: null, document_ids: '[]', extracted: '{}', event_id: extra.eventId ?? null, status: 'draft', portal_request_id: null, review_department: 'Deanship of Student Affairs (demo)', reviewer_id: null, reviewer_note: null, revision: 1, payload_hash: '', approval_id: null, operation_id: null, history: j([{ at: now, action: 'created', by: user.id, note: `Draft bound to ${ids.length} attendance record(s): ${rows.map((r) => `${r.course_code} ${r.session_date} ${r.start_time}`).join(', ')}` }]), created_at: now, updated_at: now };
  db().insert('excuse_requests', row);
  db().update('excuse_requests', id, { payload_hash: excusePayloadHash(row), status: readiness(row) });
  audit(user.id, 'academics.excuse.create', 'excuse_request', id, { attendanceIds: ids, type });
  return excuseView(getExcuseRow(id));
}

export function updateExcuse(user: User, id: string, patch: { reason?: string; from_date?: string | null; to_date?: string | null; reference?: string | null; type?: 'medical' | 'event' | 'other' }): ExcuseView {
  const r = requireOwnExcuse(user, id);
  if (!EDITABLE.includes(r.status as ExcuseStatus)) throw conflict(`Request is ${r.status} and cannot be edited.`);
  const next = { ...r, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as Record<string, unknown>;
  const hash = excusePayloadHash(next);
  const changed = hash !== r.payload_hash;
  if (changed) invalidateApprovals('excuse', id);
  db().update('excuse_requests', id, { reason: next.reason, from_date: next.from_date ?? null, to_date: next.to_date ?? null, reference: next.reference ?? null, type: next.type, revision: changed ? (r.revision as number) + 1 : r.revision, payload_hash: hash, approval_id: changed ? null : r.approval_id, status: readiness(next), history: pushHistory(r, 'edited', user.id, Object.keys(patch).join(', ')), updated_at: nowIso() });
  return excuseView(getExcuseRow(id));
}

/** Attaches a student-owned document and extracts candidate fields (never the raw text) for an editable preview. */
export function attachEvidence(user: User, id: string, documentId: string): { excuse: ExcuseView; extraction: ExtractionResult & { documentId: string } } {
  const r = requireOwnExcuse(user, id);
  if (!EDITABLE.includes(r.status as ExcuseStatus)) throw conflict(`Request is ${r.status} and cannot be edited.`);
  const doc = getDocument(documentId);
  if (!doc) throw notFound('Document not found');
  if (doc.owner_id !== user.id) throw forbidden('You can only attach your own documents');
  if (!['medical', 'event_evidence', 'other'].includes(doc.kind)) throw unprocessable(`Document kind "${doc.kind}" cannot be used as excuse evidence.`);
  const ids = pj<string[]>(r.document_ids, []);
  if (!ids.includes(doc.id)) ids.push(doc.id);
  const extraction = runExtraction(doc);
  const stored: StoredExtraction = { documentId: doc.id, provider: 'demo', textFound: extraction.textFound, fromDate: extraction.fromDate, toDate: extraction.toDate, reference: extraction.reference, patientName: extraction.patientName, issuer: extraction.issuer, dates: extraction.dates, note: extraction.note, extractedAt: nowIso() };
  const next: Record<string, unknown> = { ...r, document_ids: j(ids), extracted: j(stored) };
  // Prefill empty fields only; the student confirms every value in the preview.
  if (!r.reference && extraction.reference) next.reference = extraction.reference.value;
  if (extraction.fromDate && extraction.toDate && (!r.from_date || !r.to_date)) { next.from_date = extraction.fromDate.value; next.to_date = extraction.toDate.value; }
  const hash = excusePayloadHash(next);
  invalidateApprovals('excuse', id);
  db().update('excuse_requests', id, { document_ids: j(ids), extracted: j(stored), reference: next.reference ?? null, from_date: next.from_date ?? null, to_date: next.to_date ?? null, revision: (r.revision as number) + 1, payload_hash: hash, approval_id: null, status: readiness(next), history: pushHistory(r, 'evidence_attached', user.id, `${doc.filename} (${extraction.textFound ? 'fields extracted' : 'no text layer — manual entry'})`), updated_at: nowIso() });
  audit(user.id, 'academics.excuse.evidence', 'excuse_request', id, { documentId: doc.id, kind: doc.kind, textFound: extraction.textFound });
  return { excuse: excuseView(getExcuseRow(id)), extraction: { ...extraction, text: '', documentId: doc.id } };
}

export function rerunExtraction(user: User, id: string): { excuse: ExcuseView; extraction: (ExtractionResult & { documentId: string }) | null } {
  const r = requireOwnExcuse(user, id);
  const ids = pj<string[]>(r.document_ids, []);
  if (!ids.length) return { excuse: excuseView(r), extraction: null };
  const doc = getDocument(ids[ids.length - 1]);
  if (!doc) return { excuse: excuseView(r), extraction: null };
  const extraction = runExtraction(doc);
  const stored: StoredExtraction = { documentId: doc.id, provider: 'demo', textFound: extraction.textFound, fromDate: extraction.fromDate, toDate: extraction.toDate, reference: extraction.reference, patientName: extraction.patientName, issuer: extraction.issuer, dates: extraction.dates, note: extraction.note, extractedAt: nowIso() };
  db().update('excuse_requests', id, { extracted: j(stored), history: pushHistory(r, 'extraction_rerun', user.id, doc.filename), updated_at: nowIso() });
  return { excuse: excuseView(getExcuseRow(id)), extraction: { ...extraction, text: '', documentId: doc.id } };
}

function runExtraction(doc: DocumentMeta): ExtractionResult {
  const buf = readDocumentBuffer(doc.id);
  if (!buf) return { provider: 'demo', textFound: false, text: '', dates: [], note: 'Stored file is missing; enter the fields manually.' };
  return extractFromBuffer(doc.mime, buf);
}

export function approveExcuse(user: User, id: string): { excuse: ExcuseView; approval: { id: string; expires_at: string }; review: { sessions: AttendanceSession[]; reason: string; from_date: string | null; to_date: string | null; files: string[]; department: string } } {
  const r = requireOwnExcuse(user, id);
  if (!EDITABLE.includes(r.status as ExcuseStatus)) throw conflict(`Request is ${r.status}; only drafts can be approved.`);
  const v = excuseView(r);
  const fails = v.checks.filter((c) => c.status === 'fail');
  if (fails.length) throw unprocessable('Approval blocked: complete the request first.', { fails });
  const hash = excusePayloadHash(r);
  const approval = createApproval(user.id, 'excuse', id, r.revision as number, hash);
  db().update('excuse_requests', id, { status: 'approved', approval_id: approval.id, payload_hash: hash, history: pushHistory(r, 'approved', user.id, `Student approved revision ${r.revision}; approval ${approval.id}`), updated_at: nowIso() });
  audit(user.id, 'academics.excuse.approve', 'excuse_request', id, { revision: r.revision, approval: approval.id });
  return { excuse: excuseView(getExcuseRow(id)), approval: { id: approval.id, expires_at: approval.expires_at }, review: { sessions: v.sessions, reason: v.reason, from_date: v.from_date, to_date: v.to_date, files: v.documents.map((d) => d.filename), department: v.review_department } };
}

export function submitExcuse(user: User, id: string, approvalId: string): { excuse: ExcuseView; receipt: { portal_request_id: string; label: 'Demo submission'; operationId: string }; replayed: boolean } {
  const r = requireOwnExcuse(user, id);
  if (r.portal_request_id && ['submitted', 'under_review', 'accepted', 'rejected'].includes(r.status as string)) {
    return { excuse: excuseView(r), receipt: { portal_request_id: r.portal_request_id as string, label: 'Demo submission', operationId: r.operation_id as string }, replayed: true };
  }
  if (r.status !== 'approved') throw conflict(`Request must be approved before submission (status: ${r.status}).`);
  const check = checkApproval(approvalId, { ownerId: user.id, entityId: id, payloadHash: excusePayloadHash(r), revision: r.revision as number });
  if (check.result !== 'valid') {
    if (check.result === 'expired' || check.result === 'invalidated') db().update('excuse_requests', id, { status: readiness(r), approval_id: null, history: pushHistory(r, 'approval_rejected', user.id, check.result), updated_at: nowIso() });
    throw conflict(`Approval is ${check.result}. Review the request again before submitting.`, { approval: check.result });
  }
  if (r.portal_request_id) {
    // Resubmission after "needs information": same portal request, new revision, back to the reviewer.
    consumeApproval(approvalId);
    let hist = pushHistory({ ...r }, 'resubmitted', user.id, `Revision ${r.revision} sent with the requested information`);
    hist = pushHistory({ history: hist }, 'under_review', 'portal', `Returned to ${r.review_department}`);
    db().update('excuse_requests', id, { status: 'under_review', history: hist, updated_at: nowIso() });
    audit(user.id, 'academics.excuse.resubmit', 'excuse_request', id, { portal_request_id: r.portal_request_id, revision: r.revision });
    return { excuse: excuseView(getExcuseRow(id)), receipt: { portal_request_id: r.portal_request_id as string, label: 'Demo submission', operationId: r.operation_id as string }, replayed: false };
  }
  const operationId = (r.operation_id as string | null) ?? newOperationId();
  db().update('excuse_requests', id, { status: 'submitting', operation_id: operationId, updated_at: nowIso() });
  const res = portalSubmitExcuse({ operationId, idempotencyKey: check.approval!.idempotency_key, studentId: user.id, excuseId: id, payloadHash: r.payload_hash as string });
  consumeApproval(approvalId);
  let hist = pushHistory({ ...r }, 'submitted', user.id, `${res.receipt.label} ${res.receipt.portal_request_id}`);
  hist = pushHistory({ history: hist }, 'under_review', 'portal', `Assigned to ${r.review_department}`);
  db().update('excuse_requests', id, { status: 'under_review', portal_request_id: res.receipt.portal_request_id, history: hist, updated_at: nowIso() });
  notify(user.id, { module: 'academics', kind: 'excuse_submitted', title: `Excuse request submitted (${res.receipt.portal_request_id})`, body: 'Demo submission recorded. Your attendance record is unchanged until the department accepts the request.', link: `/academics/excuses/${id}` });
  audit(user.id, 'academics.excuse.submit', 'excuse_request', id, { portal_request_id: res.receipt.portal_request_id, operationId });
  return { excuse: excuseView(getExcuseRow(id)), receipt: { portal_request_id: res.receipt.portal_request_id, label: 'Demo submission', operationId }, replayed: res.replayed };
}

export function draftFromEvent(user: User, eventId: string, attendanceIds: string[]): ExcuseView {
  const ev = db().get('SELECT * FROM events WHERE id = ?', eventId);
  if (!ev) throw notFound('Event not found');
  const from = toLocal(ev.start_at as string).date, to = toLocal(ev.end_at as string).date;
  return createExcuse(user, attendanceIds, 'event', { eventId, reason: `University representation: ${ev.title_en}${ev.organizer ? ` organised by ${ev.organizer}` : ''} (${from}${to !== from ? ` → ${to}` : ''}).`, from_date: from, to_date: to });
}

/** "yesterday's absence" → concrete dates and the matching absent/late sessions. */
export function resolveAbsenceText(user: User, text: string): { date: string | null; phrase: string | null; matches: AttendanceSession[]; needsChoice: boolean; message: string } {
  const dp = resolveDatePhrase(text);
  const codes = findCourseCodes(text);
  const where = ['student_id = ?', `status IN ('absent','late')`];
  const params: unknown[] = [user.id];
  if (dp) { where.push('session_date = ?'); params.push(dp.date); }
  if (codes.length) { where.push(`course_code IN (${codes.map(() => '?').join(',')})`); params.push(...codes); }
  const rows = db().all(`SELECT * FROM attendance_records WHERE ${where.join(' AND ')} ORDER BY session_date DESC, start_time`, ...params);
  const isOpen = (s: AttendanceSession) => !db().get(`SELECT id FROM excuse_requests WHERE student_id = ? AND status NOT IN ('rejected') AND attendance_ids LIKE ?`, user.id, `%"${s.id}"%`);
  let matches = rows.map(sessionView).filter(isOpen);
  let message = !dp && !codes.length ? 'No date or course found in the text — showing all open absences.' : dp ? `"${dp.phrase}" resolved to ${dp.date} (demo clock ${todayIso()}). ${matches.length ? `${matches.length} matching session(s).` : 'No unexcused absence on that date.'}` : `Filtered by ${codes.join(', ')}.`;
  if (dp && !matches.length) {
    // Fall back to the most recent open absences so the student can pick the one they meant.
    const recent = db().all(`SELECT * FROM attendance_records WHERE student_id = ? AND status IN ('absent','late') AND session_date <= ? ORDER BY session_date DESC, start_time DESC LIMIT 6`, user.id, dp.date).map(sessionView).filter(isOpen).slice(0, 3);
    if (recent.length) { matches = recent; message += ` The most recent open absences are on ${[...new Set(recent.map((s) => s.session_date))].join(', ')} — choose the one you meant.`; }
  }
  return { date: dp?.date ?? null, phrase: dp?.phrase ?? null, matches, needsChoice: matches.length > 1, message };
}

// ---------------------------------------------------------------- reviewer
export function reviewQueue(status?: string) {
  const rows = status ? db().all('SELECT * FROM excuse_requests WHERE status = ? ORDER BY updated_at DESC', status) : db().all(`SELECT * FROM excuse_requests WHERE status IN ('submitted','under_review','needs_information','accepted','rejected') ORDER BY CASE status WHEN 'submitted' THEN 0 WHEN 'under_review' THEN 1 WHEN 'needs_information' THEN 2 ELSE 3 END, updated_at DESC`);
  return rows.map((r) => excuseView(r, { withStudent: true }));
}
export function reviewerGet(id: string): ExcuseView {
  const r = getExcuseRow(id);
  if (!['submitted', 'under_review', 'needs_information', 'accepted', 'rejected'].includes(r.status as string)) throw forbidden('This request has not been submitted for review.');
  return excuseView(r, { withStudent: true });
}
export function reviewerDecision(reviewer: User, id: string, decision: 'accepted' | 'rejected' | 'needs_information', note: string): ExcuseView {
  const r = getExcuseRow(id);
  if (!REVIEWABLE.includes(r.status as ExcuseStatus)) throw conflict(`Request is ${r.status}; only submitted requests can be decided.`);
  if (!note.trim()) throw bad('A rationale note is required');
  const pol = getPolicies();
  return db().tx(() => {
    if (decision === 'accepted') {
      for (const aid of pj<string[]>(r.attendance_ids, [])) {
        db().run('UPDATE attendance_records SET status = ?, excuse_request_id = ?, updated_at = ? WHERE id = ? AND student_id = ?', pol.excuseAcceptedTreatment.value, id, nowIso(), aid, r.student_id);
      }
    }
    db().update('excuse_requests', id, { status: decision, reviewer_id: reviewer.id, reviewer_note: note, history: pushHistory(r, decision, reviewer.id, note), updated_at: nowIso() });
    const titles = { accepted: 'Excuse accepted', rejected: 'Excuse rejected', needs_information: 'Excuse needs more information' };
    const bodies = { accepted: `The ${r.review_department} accepted request ${r.portal_request_id}. Attendance treatment applied: ${pol.excuseAcceptedTreatment.value} (original status kept).`, rejected: `Request ${r.portal_request_id} was rejected: ${note}`, needs_information: `Please add the requested information: ${note}` };
    notify(r.student_id as string, { module: 'academics', kind: `excuse_${decision}`, title: titles[decision], body: bodies[decision], link: `/academics/excuses/${id}` });
    audit(reviewer.id, `academics.excuse.${decision}`, 'excuse_request', id, { note, treatment: decision === 'accepted' ? pol.excuseAcceptedTreatment.value : null });
    return excuseView(getExcuseRow(id), { withStudent: true });
  });
}

/** Reviewers may open evidence only for requests that are in a review state. */
export function reviewerCanOpenDocument(doc: DocumentMeta, user: User): boolean {
  if (!hasRole(user, 'reviewer')) return false;
  const r = db().get(`SELECT id FROM excuse_requests WHERE status IN ('submitted','under_review','needs_information') AND document_ids LIKE ?`, `%"${doc.id}"%`);
  return !!r;
}

export function listExcuses(userId: string): ExcuseView[] {
  return db().all('SELECT * FROM excuse_requests WHERE student_id = ? ORDER BY created_at DESC', userId).map((r) => excuseView(r));
}
