import type { CalendarEntry, DocumentMeta, Locale, Policy } from '@shared/types';

// ---------------------------------------------------------------- shared shapes (mirror server views)
export interface LocationInfo { id: string; name_en: string; name_ar: string; building_id: string | null; building_en: string | null; building_ar: string | null; campus_id: string }
export interface Meeting { day: number; start: string; end: string; location_id: string | null; location: LocationInfo | null }
export interface SectionView { id: string; course_code: string; title_en: string; title_ar: string; credits: number; term: string; section_no: string; instructor: string; campus_id: string; capacity: number; enrolled: number; seats_left: number; status: string; meetings: Meeting[] }

export interface Check { id: string; label: string; status: 'pass' | 'fail' | 'warn'; hard: boolean; explanation: string; details?: unknown }
export interface TravelGap { day: number; from: string; to: string; from_building: string | null; to_building: string | null; gap_min: number; walk_min: number; distance_m: number | null; required_min: number; status: 'pass' | 'fail' | 'warn' }
export interface OptionCourse { code: string; title_en: string; title_ar: string; credits: number; section_id: string; section_no: string; instructor: string; meetings: Meeting[]; seats_left: number }
export interface PlanOption { id: string; label_en: string; label_ar: string; section_ids: string[]; credits: number; courses: OptionCourse[]; checks: Check[]; score: number; tradeoffs: string[]; travel: TravelGap[]; days: number[]; feasible: boolean }
export interface Preferences { text?: string; avoidEarly?: boolean; avoidDays?: number[]; keepWindows?: Array<{ day: number; start: string; end: string; label?: string }>; maxCredits?: number; pinned?: string[]; courses?: string[]; countInProgress?: boolean; compact?: boolean; lightLoad?: boolean; understood?: string[]; unparsed?: string[]; ai?: string }
export interface Receipt { operationId: string; portalRef: string; status: 'committed' | 'partial' | 'failed'; perSection: Array<{ sectionId: string; result: 'enrolled' | 'full' | 'error'; message?: string }>; committedAt: string; label: string; nextSteps?: { resources: string[]; studySetup: boolean } }
export interface Proposal {
  id: string; student_id: string; term: string; term_label: { en: string; ar: string }; status: string; revision: number; section_ids: string[]; credits: number; checks: Check[]; rationale: string; preferences: Preferences;
  options: PlanOption[]; action_log: Array<{ at: string; step: string; detail: string }>; approval_id: string | null; approval: { id: string; status: string; expires_at: string; revision: number } | null; operation_id: string | null;
  receipt: Receipt | null; error: string | null; created_at: string; updated_at: string; sections: SectionView[]; hard_fails: string[]; can_approve: boolean;
}
export interface EligibleCourse { code: string; title_en: string; title_ar: string; credits: number; category: string; required: boolean; eligible: boolean; reasons: string[]; missing: string[][]; in_progress: string[][]; credit_short: number; priority: number; sections: SectionView[]; conditional: boolean }
export interface SubmitResult { outcome: string; proposal: Proposal; receipt: Receipt | null; nextSteps: { resources: string[]; studySetup: boolean } | null; message: string }

export interface AttendanceSession { id: string; section_id: string; course_code: string; title_en: string; title_ar: string; session_date: string; start_time: string; end_time: string; status: string; original_status: string; excuse_request_id: string | null; location: { id: string; name_en: string; name_ar: string } | null; excuse_status?: string | null }
export interface AttendanceCourse { course_code: string; title_en: string; title_ar: string; section_id: string; section_no: string; instructor: string; sessions: AttendanceSession[]; total: number; counts: { present: number; absent: number; late: number; excused: number }; absence_percent: number; level: 'ok' | 'warning' | 'denial'; warning_percent: number; denial_percent: number }
export interface AttendanceOverview { term: string; policy: { warning: Policy<number>; denial: Policy<number>; excuseDeadlineDays: Policy<number>; treatment: Policy<string> }; courses: AttendanceCourse[] }

export interface ExtractedField { value: string; confidence: number; source: string }
export interface StoredExtraction { documentId: string; provider: string; textFound: boolean; fromDate?: ExtractedField; toDate?: ExtractedField; reference?: ExtractedField; patientName?: ExtractedField; issuer?: ExtractedField; dates: ExtractedField[]; note: string; extractedAt: string }
export interface ExcuseCheck { id: string; label: string; status: 'pass' | 'warn' | 'fail'; explanation: string }
export interface Excuse {
  id: string; student_id: string; student_name_en?: string; student_name_ar?: string; attendance_ids: string[]; sessions: AttendanceSession[]; type: 'medical' | 'event' | 'other'; reason: string; from_date: string | null; to_date: string | null; reference: string | null;
  document_ids: string[]; documents: DocumentMeta[]; extracted: StoredExtraction | null; event_id: string | null; event: { id: string; title_en: string; organizer: string; start_at: string; end_at: string } | null;
  status: string; portal_request_id: string | null; review_department: string; reviewer_id: string | null; reviewer_note: string | null; revision: number; approval_id: string | null; approval: { id: string; status: string; expires_at: string } | null;
  history: Array<{ at: string; action: string; by: string; note?: string }>; checks: ExcuseCheck[]; can_approve: boolean; editable: boolean; created_at: string; updated_at: string;
}

export interface StudySettings { student_id: string; daily_capacity_min: number; weekday_capacity: Record<string, number>; unavailable_dates: string[]; updated_at: string }
export interface StudyTask { id: string; course_code: string | null; title: string; effort_min: number; deadline: string | null; scheduled_date: string | null; locked: boolean; status: 'todo' | 'partial' | 'done'; progress: number; actual_min: number; source: string; notes: string | null; priority: number; history: Array<Record<string, unknown> & { at: string; action: string }>; created_at: string; completed_at: string | null }
export interface DayLoad { date: string; weekday: number; capacity: number; base_capacity: number; calendar_min: number; task_min: number; remaining: number; unavailable: boolean; over: boolean; tasks: string[] }
export interface StudyProposal { id: string; kind: 'schedule' | 'repair'; trigger: string; before_state: { assignments: Record<string, string | null>; loads: DayLoad[] }; after_state: { assignments: Record<string, string | null>; loads: DayLoad[] }; changes: Array<{ taskId: string; title: string; from: string | null; to: string | null; why: string }>; infeasible: Array<{ taskId: string; title: string; why: string; suggestion: string }>; status: string; created_at: string; applied_at: string | null }
export interface StudyState { today: string; settings: StudySettings; tasks: StudyTask[]; loads: DayLoad[]; proposal: StudyProposal | null; versions: Array<{ id: string; label: string; reason: string; created_at: string }>; history: Array<{ id: string; kind: string; trigger: string; status: string; created_at: string; applied_at: string | null; changes: number; infeasible: number }>; courses: string[] }
export interface TaskDraft { line: string; title: string; course_code: string | null; effort_min: number; deadline: string | null; priority: number; confidence: number; issues: string[] }

export interface Overview {
  student: { id: string; name_en: string; name_ar: string; program_id: string | null; program: { en: string; ar: string; college_en: string } | null; level: number; campus_id: string; student_no: string | null };
  term: { id: string; label: { en: string; ar: string }; dates: { start: string; end: string } | null; next: { id: string; label: { en: string; ar: string }; dates: { start: string; end: string } | null } };
  credits: { earned: number; in_progress: number; required: number; remaining: number; estimate: { terms_remaining: number; assumptions: string; earliest_completion_term: string } | null };
  week: { start: string; entries: CalendarEntry[] };
  attendance: { policy: AttendanceOverview['policy']; courses: Array<{ course_code: string; title_en: string; title_ar: string; total: number; counts: AttendanceCourse['counts']; absence_percent: number; level: AttendanceCourse['level'] }>; unexcused: number };
  proposals: { pending: number; latest: Proposal | null };
  excuses: { open: number; items: Excuse[] };
  tasks: { open: number; due_soon: number; overdue: number; next: StudyTask[] };
  nextActions: Array<{ kind: string; title: string; body: string; link: string; tone: 'warn' | 'info' | 'danger' | 'success' }>;
}

export interface AuditBucket { id: string; category: string; label_en: string; label_ar: string; required_credits: number; earned_credits: number; in_progress_credits: number; planned_credits: number; remaining_credits: number; courses: Array<{ code: string; title_en: string; credits: number; status: string; term?: string; grade?: string | null }> }
export interface DegreeAudit { student_id: string; program_id: string | null; total_required: number; earned: number; in_progress: number; planned: number; remaining: number; buckets: AuditBucket[]; unmet: Array<{ bucket: string; remaining_credits: number; suggestions: string[] }>; estimate: { terms_remaining: number; assumptions: string; earliest_completion_term: string } | null }
export interface PlanCourse { code: string | null; title_en: string; title_ar: string; credits: number; category: string; elective: string | null; slot_label_en?: string; slot_label_ar?: string; status: string; grade: string | null; term: string | null; reasons: string[]; in_progress: string[][]; candidates?: string[] }
export interface DegreePlan { program: { id: string; en: string; ar: string }; terms: Array<{ year: number; sem: number; label_en: string; label_ar: string; courses: PlanCourse[] }>; graph: { nodes: Array<{ code: string; title_en: string; credits: number; level: number; category: string; status: string }>; edges: Array<{ from: string; to: string; alt: boolean }> }; audit: DegreeAudit; next_term: { id: string; eligibility: Array<{ code: string; eligible: boolean; reasons: string[]; required: boolean; sections: number }> } }
export interface Timetable { term: string; term_label: { en: string; ar: string }; dates: { start: string; end: string } | null; today: string; weekday: number; sections: SectionView[]; credits: number; terms: string[] }
export interface CourseDetail { course: { code: string; title_en: string; title_ar: string; credits: number; dept: string; level: number; category: string; description_en: string; source: string; prereqs: string[][]; coreqs: string[][]; min_credits: number; rule: { prereqs: string[][]; coreqs: string[][]; min_credits: number } }; status: string; missing: string[][]; in_progress: string[][]; credit_short: number; chain: string[][]; dependents: string[]; sections: { current: SectionView[]; next: SectionView[] }; transcript: Array<{ term: string; status: string; grade: string | null }>; links: { resources: string; register: string } }

// ---------------------------------------------------------------- helpers
export function termLabel(term: string, locale: Locale): string {
  const [y, s] = term.split('-').map(Number);
  if (locale === 'ar') return s === 1 ? `الفصل الأول ${y}` : s === 2 ? `الفصل الثاني ${y + 1}` : `الفصل الصيفي ${y + 1}`;
  return s === 1 ? `Fall ${y}` : s === 2 ? `Spring ${y + 1}` : `Summer ${y + 1}`;
}
export const TEACHING_DAYS = [0, 1, 2, 3, 4];
export function minutesOf(t: string): number { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
