export type KpiKey = 'clarity' | 'grading' | 'support' | 'organisation' | 'workload' | 'value';
export type Band = 'strong' | 'on_track' | 'focus';
export const TEACHING_KPIS: KpiKey[] = ['clarity', 'grading', 'support', 'organisation'];
export const ALL_KPIS: KpiKey[] = ['clarity', 'grading', 'support', 'organisation', 'workload', 'value'];

export interface KpiStat { mean: number | null; favourable: number | null; band: Band | null; n: number }
export interface Aggregate {
  n: number; enough: boolean; index: number | null; recommend: number | null; hours: number | null;
  kpis: Record<KpiKey, KpiStat>;
  strengths: Array<{ key: string; share: number }>;
  suggestions: Array<{ key: string; share: number }>;
}
export interface TrendPoint { term: string; label_en: string; label_ar: string; n: number; index: number | null; kpis: Partial<Record<KpiKey, number | null>> }
export interface InstructorRef { slug: string; name_en: string; name_ar: string }
export interface FeedbackAction { id: string; course_code: string | null; instructor: string | null; kpi: KpiKey; body_en: string; body_ar: string; created_at: string; title_en?: string; title_ar?: string }
export interface College { key: string; en: string; ar: string }
export interface Window { phase: 'end_of_term' | 'mid_term'; term: string; term_label_en: string; term_label_ar: string; opens_on: string; closes_on: string; open: boolean }

export interface Overview {
  windows: Window[]; me: { pending: number; submitted: number }; totals: { responses: number; courses: number; instructors: number };
  overall: Aggregate; min_responses: number; public_terms: Array<{ term: string; en: string; ar: string }>; colleges: College[]; actions: FeedbackAction[]; is_staff: boolean;
}

export interface InstructorListItem extends InstructorRef { college: string; courses: string[]; n: number; enough: boolean; index: number | null; recommend: number | null; kpis: Record<string, { mean: number | null; band: Band | null }>; delta: number | null }
export interface CourseListItem { code: string; title_en: string; title_ar: string; college: string; instructors: InstructorRef[]; n: number; enough: boolean; index: number | null; hours: number | null; recommend: number | null; kpis: Record<KpiKey, { mean: number | null; band: Band | null }> }

export interface Eligible { course_code: string; title_en: string; title_ar: string; term: string; term_label_en: string; term_label_ar: string; instructor: InstructorRef; section_id: string | null; phase: 'end_of_term' | 'mid_term'; status: 'pending' | 'submitted' | 'closed'; response_id: string | null; closes_on: string }
export interface MyResponse { id: string; course_code: string; title_en: string; title_ar: string; term: string; phase: string; instructor: InstructorRef; status: 'published' | 'held' | 'rejected'; ratings: Record<KpiKey, number>; recommend: number | null; hours_per_week: number | null; comment: string; themes: Array<{ key: string; tone: string }>; created_at: string; updated_at: string; editable: boolean }
export interface Mine { windows: Window[]; items: Eligible[]; responses: MyResponse[]; min_responses: number }

export interface InstructorDetail extends InstructorRef {
  college: string; aggregate: Aggregate; benchmark: Record<KpiKey, number | null>; trend: TrendPoint[];
  courses: Array<{ code: string; title_en: string; title_ar: string; n: number; enough: boolean; index: number | null; terms: string[] }>;
  actions: FeedbackAction[]; response_rate: number | null; kpis: KpiKey[]; min_responses: number;
}
export interface CourseDetail {
  code: string; title_en: string; title_ar: string; college: string; aggregate: Aggregate; benchmark: Record<KpiKey, number | null>; trend: TrendPoint[];
  by_instructor: Array<InstructorRef & { n: number; enough: boolean; index: number | null; kpis: Record<string, number | null>; terms: string[] }>;
  actions: FeedbackAction[]; response_rate: number | null; kpis: KpiKey[]; mine: Eligible[]; min_responses: number;
}

export interface Ticket { id: string; public_id: string; category: string; subject: string; body: string; page: string | null; status: 'open' | 'answered' | 'closed'; reply: string | null; replied_at: string | null; created_at: string; requester?: { name_en: string; name_ar: string } }

export interface StaffOverview {
  alerts: Array<InstructorRef & { kpi: KpiKey; mean: number; college_mean: number | null; n: number; has_action: boolean }>;
  course_alerts: Array<{ code: string; title_en: string; title_ar: string; kpi: KpiKey; mean: number; n: number; has_action: boolean }>;
  pulse: Array<{ code: string; title_en: string; title_ar: string; instructor: InstructorRef; n: number; enough: boolean; index: number | null }>;
  by_college: Array<{ key: string; en: string; ar: string; responses: number; response_rate: number | null; index: number | null }>;
  held: number; tickets_open: number; actions: FeedbackAction[];
}
export interface HeldResponse { id: string; course_code: string; title_en: string; title_ar: string; term: string; instructor: InstructorRef; phase: string; ratings: Record<KpiKey, number>; comment: string; flags: string[]; themes: Array<{ key: string; tone: string }>; updated_at: string }
