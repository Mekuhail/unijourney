import type { DocumentMeta } from '@shared/types';

export interface Criterion { key: string; label_en: string; label_ar: string; note: string }
export interface Program { id: string; code: string; name_en: string; name_ar: string; college_en: string; college_ar: string; degree: string; total_credits: number; duration_years: number; description_en: string; description_ar: string; criteria: Criterion[]; campus_ids: string[]; source_url: string | null; source_note: string | null; has_study_plan?: boolean }
export interface ProgramDetail extends Program { study_plan: { available: boolean; buckets: Array<{ id: string; category: string; label_en: string; label_ar: string; required_credits: number; courses: number }>; sample_courses: Array<{ code: string; title_en: string; title_ar: string; credits: number; level: number }>; source_url: string | null } }
export interface ChecklistItem { key: string; required: boolean; label_en: string; label_ar: string; documentId: string | null; status: 'missing' | 'attached' }
export interface Personal { full_name?: string; national_id_last4?: string; date_of_birth?: string; phone?: string; email?: string; high_school_gpa?: number; english_score?: number | null; nationality?: string; city?: string }
export interface Completeness { complete: boolean; missing: Array<{ key: string; label: string; kind: 'field' | 'document' }>; warnings: string[] }
export interface TimelineEntry { at: string; status: string; note: string; actor?: string }
export interface AdmApp {
  id: string; applicant_id: string; program_id: string; campus_id: string; status: string; personal: Personal; checklist: ChecklistItem[]; receipt: { ref: string; submitted_at: string; simulated: boolean; label: string } | null; timeline: TimelineEntry[];
  reviewer_id: string | null; reviewer_note: string | null; submitted_at: string | null; decided_at: string | null; created_at: string; updated_at: string;
  program: { id: string; code: string; name_en: string; name_ar: string; college_en: string; college_ar: string; source_url: string | null } | null; applicant: { id: string; name_en: string; name_ar: string; email: string; stage: string } | null; documents: Record<string, DocumentMeta | null>; completeness: Completeness;
}
export interface OnboardingStep { key: string; label_en: string; label_ar: string; link: string; status: 'pending' | 'done'; completed_at: string | null }
export interface Onboarding { exists: boolean; steps: OnboardingStep[]; done: number; total: number; complete: boolean; updated_at: string | null; adviser: { name_en: string; name_ar: string; email: string; office: string }; stage: string }

export interface AuditCourse { code: string; title_en: string; credits: number; status: 'completed' | 'equivalent' | 'enrolled' | 'planned' | 'missing' | 'failed' | 'withdrawn'; term?: string; grade?: string | null }
export interface AuditBucket { id: string; category: string; label_en: string; label_ar: string; required_credits: number; earned_credits: number; in_progress_credits: number; planned_credits: number; remaining_credits: number; courses: AuditCourse[] }
export interface DegreeAudit { student_id: string; program_id: string | null; total_required: number; earned: number; in_progress: number; planned: number; remaining: number; buckets: AuditBucket[]; unmet: Array<{ bucket: string; remaining_credits: number; suggestions: string[] }>; estimate: { terms_remaining: number; assumptions: string; earliest_completion_term: string } | null; generated_at: string }
export interface Clearance { id: string; key: string; label_en: string; label_ar: string; status: string; cleared_by: string | null; cleared_at: string | null; note: string | null }
export interface GradRequest { id: string; student_id: string; status: string; audit_snapshot: DegreeAudit | null; reviewer_id: string | null; reviewer_note: string | null; receipt: { ref: string; submitted_at: string; simulated: boolean; label: string } | null; submitted_at: string | null; decided_at: string | null; created_at: string; student: { id: string; name_en: string; name_ar: string; student_no: string | null; program_id: string | null; stage: string } | null; clearances: Clearance[] }
export interface AuditRes { audit: DegreeAudit; clearances: Clearance[]; coop: { code: string; title_en: string; credits: number; status: string; term: string | null; term_label: string | null; grade: string | null; evidence: string | null; counts: boolean }; blockers: Array<{ key: string; message: string }>; canRequest: boolean; request: GradRequest | null; policy_note: string; stage: string; demoMode: boolean }

export const STAGES = ['applicant', 'admitted', 'orientation', 'current', 'graduating', 'alumni'] as const;
