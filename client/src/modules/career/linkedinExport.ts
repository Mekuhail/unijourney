import { unzipSync, strFromU8 } from 'fflate';

/**
 * Reads a LinkedIn "Get a copy of your data" archive in the browser. Only a whitelist of profile files is opened;
 * connections, messages, ad data, contact details and other people's recommendations are never read or uploaded.
 * Column names follow the export format (mapping reference: JMPerez/linkedin-to-json-resume, MIT). Headers are matched
 * case-insensitively and every file is optional, because LinkedIn changes the format from time to time.
 */

export type DraftKind = 'experience' | 'education' | 'certificate' | 'project' | 'language' | 'award';
export interface DraftItem { key: string; kind: DraftKind; title: string; org: string; start_date: string | null; end_date: string | null; description: string; url: string | null; credential_id: string | null; skills: string[] }
export interface LinkedinImport { items: DraftItem[]; skills: string[]; headline: string; summary: string; filesRead: string[]; filesIgnored: number }

const WANTED = ['profile.csv', 'positions.csv', 'education.csv', 'skills.csv', 'certifications.csv', 'projects.csv', 'languages.csv', 'honors.csv'];

/** RFC 4180-style CSV parser (quoted fields, doubled quotes, embedded newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

/** Rows as objects keyed by lower-cased header. Skips any "Notes:" preamble before the header row. */
function records(text: string, mustHave: string): Array<Record<string, string>> {
  const rows = parseCsv(text);
  const h = rows.findIndex((r) => r.some((c) => c.trim().toLowerCase() === mustHave));
  if (h < 0) return [];
  const header = rows[h].map((c) => c.trim().toLowerCase());
  return rows.slice(h + 1).map((r) => Object.fromEntries(header.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

/** "Mar 2024", "2024", "03/2024", "2024-03-01" → "2024-03" or "2024"; anything else → null. */
export function exportDate(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  let m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[2]}-${MONTHS[m[1].toLowerCase()]}`;
  m = s.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/); if (m) return `${m[1]}-${m[2]}`;
  m = s.match(/^(\d{1,2})\/(\d{4})$/); if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})$/); if (m) return m[1];
  return null;
}

const key = (...parts: Array<string | null>) => parts.filter(Boolean).join('|').toLowerCase();

export async function readLinkedinExport(file: File): Promise<LinkedinImport> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const wanted = new Map<string, string>();
  let ignored = 0;
  const files = unzipSync(buf, {
    filter: (f) => {
      const base = f.name.split('/').pop()!.toLowerCase();
      if (WANTED.includes(base)) { wanted.set(base, f.name); return true; }
      ignored++;
      return false;
    }
  });
  const text = (base: string) => { const n = wanted.get(base); return n && files[n] ? strFromU8(files[n]) : ''; };
  const out: LinkedinImport = { items: [], skills: [], headline: '', summary: '', filesRead: [...wanted.keys()], filesIgnored: ignored };

  const profile = records(text('profile.csv'), 'first name')[0];
  if (profile) { out.headline = profile['headline'] ?? ''; out.summary = profile['summary'] ?? ''; }

  for (const r of records(text('positions.csv'), 'company name')) {
    if (!r['title'] && !r['company name']) continue;
    out.items.push({ key: key('experience', r['title'], r['company name'], r['started on']), kind: 'experience', title: r['title'] || r['company name'], org: r['company name'] ?? '', start_date: exportDate(r['started on']), end_date: exportDate(r['finished on']), description: [r['description'], r['location']].filter(Boolean).join(' · '), url: null, credential_id: null, skills: [] });
  }
  for (const r of records(text('education.csv'), 'school name')) {
    if (!r['school name']) continue;
    out.items.push({ key: key('education', r['school name'], r['degree name'], r['start date']), kind: 'education', title: r['degree name'] || r['school name'], org: r['school name'], start_date: exportDate(r['start date']), end_date: exportDate(r['end date']), description: [r['notes'], r['activities']].filter(Boolean).join(' · '), url: null, credential_id: null, skills: [] });
  }
  for (const r of records(text('certifications.csv'), 'name')) {
    if (!r['name']) continue;
    out.items.push({ key: key('certificate', r['name'], r['authority']), kind: 'certificate', title: r['name'], org: r['authority'] ?? '', start_date: exportDate(r['started on']), end_date: exportDate(r['finished on']), description: '', url: /^https?:\/\//.test(r['url'] ?? '') ? r['url'] : null, credential_id: r['license number'] || null, skills: [] });
  }
  for (const r of records(text('projects.csv'), 'title')) {
    if (!r['title']) continue;
    out.items.push({ key: key('project', r['title'], r['started on']), kind: 'project', title: r['title'], org: '', start_date: exportDate(r['started on']), end_date: exportDate(r['finished on']), description: r['description'] ?? '', url: /^https?:\/\//.test(r['url'] ?? '') ? r['url'] : null, credential_id: null, skills: [] });
  }
  for (const r of records(text('languages.csv'), 'name')) {
    if (!r['name']) continue;
    out.items.push({ key: key('language', r['name']), kind: 'language', title: r['name'], org: '', start_date: null, end_date: null, description: r['proficiency'] ?? '', url: null, credential_id: null, skills: [] });
  }
  for (const r of records(text('honors.csv'), 'title')) {
    if (!r['title']) continue;
    out.items.push({ key: key('award', r['title'], r['issued on']), kind: 'award', title: r['title'], org: '', start_date: exportDate(r['issued on']), end_date: exportDate(r['issued on']), description: r['description'] ?? '', url: null, credential_id: null, skills: [] });
  }
  out.skills = records(text('skills.csv'), 'name').map((r) => r['name']).filter(Boolean);
  return out;
}

/** LinkedIn "Add to profile" link for a certificate or award (no API or approval needed). */
export function addToLinkedinUrl(a: { name: string; org: string; date?: string | null; url?: string | null; credentialId?: string | null }): string {
  const p = new URLSearchParams({ startTask: 'CERTIFICATION_NAME', name: a.name, organizationName: a.org });
  if (a.date) { const [y, m] = a.date.split('-'); p.set('issueYear', y); if (m) p.set('issueMonth', String(Number(m))); }
  if (a.url) p.set('certUrl', a.url);
  if (a.credentialId) p.set('certId', a.credentialId);
  return `https://www.linkedin.com/profile/add?${p.toString()}`;
}
