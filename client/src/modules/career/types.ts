export type AppStatus = 'saved' | 'preparing' | 'applied' | 'assessment' | 'interview' | 'offer' | 'rejected' | 'withdrawn';
export const APP_STATUSES: AppStatus[] = ['saved', 'preparing', 'applied', 'assessment', 'interview', 'offer', 'rejected', 'withdrawn'];
export const STATUS_RANK: Record<AppStatus, number> = { saved: 0, preparing: 1, applied: 2, assessment: 3, interview: 4, offer: 5, rejected: 6, withdrawn: 6 };

export interface Match { score: number; reasons: string[]; missing: string[]; eligible: boolean | null; eligibility_note: string }
export interface Opportunity {
  id: string; source: string; source_id: string; url: string | null; normalized_url: string | null; title: string; company: string; type: string; location: string; city: string; remote: string; field: string;
  skills: string[]; eligibility: string; deadline: string | null; posted_at: string | null; last_checked_at: string | null; status: string; description: string; salary: string | null; demo_label: boolean; expired: boolean;
  match: Match; saved: boolean; applicationId: string | null; applicationStatus: string | null;
}
export interface OppList { items: Opportunity[]; total: number; today: string; facets: { types: string[]; cities: string[]; fields: string[]; skills: string[]; remote: string[] } }

export interface AppEvent { id: string; from_status: string | null; to_status: string; actor_id: string | null; source: string; note: string | null; created_at: string }
export interface Interview { id: string; application_id: string; start_at: string; end_at: string; tz: string; location: string | null; link: string | null; kind: string; notes: string | null; calendar_entry_id: string | null }
export interface Application {
  id: string; student_id: string; opportunity_id: string | null; company: string; title: string; url: string | null; type: string; status: AppStatus; notes: string; cv_version: string | null; deadline: string | null;
  applied_at: string | null; attested_by: string | null; created_at: string; updated_at: string; last_event: AppEvent | null; interviews: Interview[]; next_interview: Interview | null; opportunity: Opportunity | null; emails_count: number; terminal: boolean; duplicate?: boolean;
}
export interface ApplicationDetail extends Application { events: AppEvent[]; emails: HiringEmail[]; profile: CareerProfile }
export interface Conflict { entry: { id: string; title: string; kind: string; start_at: string; end_at: string; location_text: string | null }; overlapMinutes: number }

export interface CvVersion { id: string; label: string; updated_at: string }
export interface CareerProfile { student_id: string; headline: string; summary: string; skills: string[]; links: Record<string, string>; cv_versions: CvVersion[]; availability: string; updated_at: string }

export interface HiringEmail {
  id: string; from_address: string; subject: string; snippet: string; body: string; received_at: string; category: string | null; confidence: number; suggested_application_id: string | null; suggested_status: string | null; review_status: string;
  matched_by: { method: string; candidates: string[]; ambiguous: boolean }; suggested_application: { id: string; company: string; title: string; status: string } | null; candidates: Array<{ id: string; company: string; title: string; status: string }>; ambiguous: boolean;
}
export interface EmailsRes { items: HiringEmail[]; autoApply: boolean; mailbox: { provider: string; connected: boolean; simulated: boolean; note: string } }

export interface SkillGap { skill: string; opportunities: Array<{ id: string; title: string; company: string }>; workshops: Array<{ id: string; title_en: string; title_ar: string; start_at: string; link: string }>; task: { id: string; status: string; link: string } | null }
export interface Handoff { stage: string; applications: { total: number; byStatus: Record<string, number>; active: Application[] }; suggested: Opportunity[]; checklist: Array<{ key: string; label_en: string; label_ar: string; done: boolean; detail: string; link: string }>; graduation: { status: string; receipt: { ref: string } | null } | null; profile: CareerProfile }
export interface PrepareDraft { label: string; simulated: boolean; provider: string; fields: Record<string, string | number>; cover_note: string; missing_skills: string[] }

export const TYPE_LABEL: Record<string, string> = { internship: 'Internship', coop: 'Co-op', entry: 'Entry-level', research: 'Research', competition: 'Competition' };
