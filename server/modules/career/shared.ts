import { createHash } from 'node:crypto';
import type { User } from '../../../shared/types.ts';
import { db, pj } from '../../core/db.ts';
import { nowIso } from '../../core/clock.ts';

/*
 * Status vocabulary and rank. Pattern adapted from "AI Job Tracker" (packages/core/src/index.ts, MIT License,
 * Copyright (c) 2024 Job Application Tracker): a rank prevents automatic downgrades, e.g. a late application
 * confirmation must never move an application back from Interview to Applied.
 */
export const APP_STATUSES = ['saved', 'preparing', 'applied', 'assessment', 'interview', 'offer', 'rejected', 'withdrawn'] as const;
export type AppStatus = (typeof APP_STATUSES)[number];
export const TERMINAL_STATUSES: AppStatus[] = ['rejected', 'withdrawn'];
export const STATUS_RANK: Record<AppStatus, number> = { saved: 0, preparing: 1, applied: 2, assessment: 3, interview: 4, offer: 5, rejected: 6, withdrawn: 6 };
export const isTerminal = (s: string) => TERMINAL_STATUSES.includes(s as AppStatus);
export const movesForward = (from: string, to: string) => (STATUS_RANK[to as AppStatus] ?? -1) > (STATUS_RANK[from as AppStatus] ?? -1) && !isTerminal(from);

export const EMAIL_CATEGORIES = ['application_confirmation', 'assessment_invite', 'interview_invite', 'offer', 'rejection', 'recruiter_outreach', 'other'] as const;
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];
export const CATEGORY_TO_STATUS: Partial<Record<EmailCategory, AppStatus>> = { application_confirmation: 'applied', assessment_invite: 'assessment', interview_invite: 'interview', offer: 'offer', rejection: 'rejected' };

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_|ref$|source$|trk$|_hs|yclid$|msclkid$)/i;

/** Lower-cases the host, drops tracking params/hash/trailing slash, sorts the remaining query for stable identity. */
export function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAMS.test(k)).sort(([a], [b]) => a.localeCompare(b));
    const q = params.length ? `?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}` : '';
    const path = u.pathname.replace(/\/+$/, '') || '';
    return `${u.protocol.toLowerCase()}//${host}${path}${q}`;
  } catch {
    return null;
  }
}

export function urlHash(normalized: string): string {
  return createHash('sha1').update(normalized).digest('hex').slice(0, 16);
}

/** Company name → comparable token (adapted from AI Job Tracker's normalizeCompany, MIT). */
export function normalizeCompany(name: string): string {
  return name.toLowerCase().replace(/\(.*?\)/g, '').replace(/[–-]\s*demo/g, '').replace(/,?\s+(inc|llc|ltd|corp|corporation|co|gmbh|sa|plc)\.?$/i, '').replace(/[^a-z0-9]/g, '');
}

export function normSkill(s: string): string {
  const x = s.trim().toLowerCase();
  const alias: Record<string, string> = { js: 'javascript', 'node': 'node.js', nodejs: 'node.js', reactjs: 'react', 'react.js': 'react', ts: 'typescript', postgres: 'sql', postgresql: 'sql', mysql: 'sql', 'ml': 'machine learning', 'ui/ux': 'ux', 'ui': 'ux', 'ux design': 'ux', 'cyber security': 'cybersecurity', 'infosec': 'cybersecurity' };
  return alias[x] ?? x;
}

export interface OpportunityRow {
  id: string; source: string; source_id: string; url: string | null; normalized_url: string | null; title: string; company: string; type: string;
  location: string; city: string; remote: string; field: string; skills: string; eligibility: string; deadline: string | null; posted_at: string | null;
  last_checked_at: string | null; status: string; description: string; salary: string | null; demo_label: number; created_at: string;
}
export interface Opportunity extends Omit<OpportunityRow, 'skills' | 'demo_label'> { skills: string[]; demo_label: boolean; expired: boolean }

export function rowToOpportunity(r: OpportunityRow, today: string): Opportunity {
  const expired = r.status === 'expired' || (!!r.deadline && r.deadline < today);
  return { ...r, skills: pj<string[]>(r.skills, []), demo_label: !!r.demo_label, status: expired && r.status !== 'unverified' ? 'expired' : r.status, expired };
}

export interface ApplicationRow {
  id: string; student_id: string; opportunity_id: string | null; company: string; title: string; url: string | null; normalized_url: string | null; type: string;
  status: string; notes: string; cv_version: string | null; deadline: string | null; applied_at: string | null; attested_by: string | null; created_at: string; updated_at: string;
}

export interface CareerProfile { student_id: string; headline: string; summary: string; skills: string[]; links: Record<string, string>; cv_versions: Array<{ id: string; label: string; updated_at: string }>; availability: string; updated_at: string }

export function getProfile(user: User): CareerProfile {
  const r = db().get('SELECT * FROM career_profiles WHERE student_id = ?', user.id);
  if (!r) {
    return { student_id: user.id, headline: '', summary: '', skills: [...user.skills], links: {}, cv_versions: [], availability: '', updated_at: nowIso() };
  }
  return { student_id: r.student_id, headline: r.headline, summary: r.summary, skills: pj<string[]>(r.skills, []), links: pj<Record<string, string>>(r.links, {}), cv_versions: pj(r.cv_versions, []), availability: r.availability, updated_at: r.updated_at };
}

/** Union of career profile skills and the user's core skills (normalized set). */
export function userSkillSet(user: User, profile: CareerProfile): Set<string> {
  return new Set([...user.skills, ...profile.skills].map(normSkill));
}
