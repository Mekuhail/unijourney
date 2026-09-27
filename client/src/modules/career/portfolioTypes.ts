import type { CareerProfile } from './types';

export type ItemKind = 'project' | 'experience' | 'certificate' | 'award' | 'volunteer' | 'language' | 'education';
export type Visibility = 'private' | 'staff' | 'employers';
export interface PortfolioItem {
  id: string; kind: ItemKind; title: string; org: string; start_date: string | null; end_date: string | null; description: string; url: string | null; credential_id: string | null;
  skills: string[]; source: 'manual' | 'linkedin_export' | 'github' | 'university' | 'competition'; verification: 'self' | 'link' | 'issuer' | 'university'; visibility: Visibility; created_at: string; updated_at: string;
  location: string | null; outcomes: string[]; sort: number | null; needs_review: boolean;
}
export interface GithubSummary { username: string; name: string | null; profile_url: string; avatar_url: string | null; public_repos: number; repos: Array<{ name: string; description: string | null; url: string; language: string | null; stars: number; topics: string[]; pushed_at: string }>; languages: Array<{ name: string; repos: number }>; fetched_at: string }
export interface Account { provider: 'linkedin' | 'github'; handle: string; url: string; verified: boolean; method: string; last_synced_at: string | null; data: GithubSummary | null; error: string | null }
export type EvidenceKind = 'self' | 'course' | 'course_in_progress' | 'project' | 'github' | 'experience' | 'certificate' | 'award' | 'award_verified';
export interface SkillEvidence { key: string; label_en: string; label_ar: string; strength: number; evidence: Array<{ kind: EvidenceKind; ref: string; weight: number }> }
export interface PortfolioData {
  profile: CareerProfile; items: PortfolioItem[]; accounts: Account[]; consents: Record<'matching' | 'staff_view', { granted: boolean; at: string | null }>; skills: SkillEvidence[];
  education: { program: { id: string; code: string; name_en: string; name_ar: string; degree: string; total_credits: number } | null; level: number; stage: string; credits: number; gpa: number | null; courses: Array<{ course_code: string; status: string; grade: string | null; title_en: string; title_ar: string; skills: string[] }> };
  completeness: { done: number; total: number; checks: Array<{ key: string; done: boolean }> };
}

export type CompKind = 'hackathon' | 'programming' | 'case' | 'design' | 'cyber' | 'ai_data';
export type EntryStatus = 'interested' | 'registered' | 'team_formed' | 'submitted' | 'result';
export interface Competition {
  id: string; title: string; organiser: string; kind: CompKind; scope: 'yu' | 'saudi' | 'international' | 'online'; format: 'onsite' | 'online' | 'hybrid'; city: string;
  registration_opens: string | null; registration_deadline: string; starts_at: string; ends_at: string; team: { min: number; max: number }; eligibility: string; prizes: string; fee: string; url: string | null;
  skills: string[]; description: string; segment: 'open' | 'upcoming' | 'past'; days_left: number; fit: string[];
  entry: { id: string; status: EntryStatus; team_name: string | null; result: string | null; portfolio_item_id: string | null } | null;
}
export interface CompetitionList { items: Competition[]; counts: Record<'open' | 'upcoming' | 'past' | 'mine', number>; today: string }
