// Shared types between server and client. Keep runtime-free (types + const enums only).

export type Role =
  | 'applicant'
  | 'student'
  | 'reviewer'
  | 'club_lead'
  | 'security'
  | 'operator'
  | 'admission_officer'
  | 'registrar';

export type Stage = 'applicant' | 'admitted' | 'orientation' | 'current' | 'graduating' | 'alumni' | 'staff';
export type Locale = 'en' | 'ar';
export type CampusId = 'riyadh' | 'khobar';

export interface User {
  id: string;
  roles: Role[];
  name_en: string;
  name_ar: string;
  email: string;
  student_no: string | null;
  program_id: string | null;
  campus_id: CampusId;
  stage: Stage;
  level: number;
  locale: Locale;
  interests: string[];
  skills: string[];
  preferences: Record<string, unknown>;
  avatar_color: string;
  department: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  module: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export type CalendarKind = 'class' | 'exam' | 'event' | 'interview' | 'task' | 'personal' | 'deadline';

export interface CalendarEntry {
  id: string;
  owner_id: string;
  source_type: string;
  source_id: string;
  title: string;
  kind: CalendarKind;
  start_at: string;
  end_at: string;
  tz: string;
  location_id: string | null;
  location_text: string | null;
  immovable: boolean;
  link: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface DocumentMeta {
  id: string;
  owner_id: string;
  kind: 'medical' | 'event_evidence' | 'admission' | 'lost_item' | 'resource' | 'cv' | 'post_media' | 'other';
  filename: string;
  mime: string;
  size: number;
  sha256: string;
  label: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface Approval {
  id: string;
  owner_id: string;
  kind: 'enrollment' | 'excuse' | 'study_plan' | 'graduation' | 'admission';
  entity_id: string;
  revision: number;
  payload_hash: string;
  status: 'approved' | 'invalidated' | 'consumed' | 'expired';
  expires_at: string;
  idempotency_key: string;
  created_at: string;
  decided_at: string | null;
}

export interface ApiOk<T> { ok: true; data: T }
export interface ApiErr { ok: false; error: { code: string; message: string; details?: unknown } }
export type ApiResponse<T> = ApiOk<T> | ApiErr;

export interface Policy<T = unknown> {
  value: T;
  provenance: string;   // e.g. "Illustrative demo policy (not verified Al Yamamah policy)" or a URL
  label_en: string;
  label_ar: string;
}

export interface Policies {
  creditLimit: Policy<number>;
  creditMinimum: Policy<number>;
  teachingWeek: Policy<number[]>;         // 0 = Sunday
  travelGapMinutes: Policy<number>;
  absenceWarningPercent: Policy<number>;
  absenceDenialPercent: Policy<number>;
  excuseAcceptedTreatment: Policy<'excused' | 'present'>;
  excuseDeadlineDays: Policy<number>;
  approvalTtlMinutes: Policy<number>;
  graduationCredits: Policy<number>;
}

export interface DemoStatus {
  demoMode: boolean;
  clock: string;          // ISO now
  clockOverride: string | null;
  tz: string;
  adapters: Array<{ name: string; provider: string; real: boolean; note: string }>;
}
