import type { Policies } from '../../shared/types.ts';
import { db, j, pj } from './db.ts';

export function getSetting<T>(key: string, fallback: T): T {
  const row = db().get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row ? pj<T>(row.value, fallback) : fallback;
}

export function setSetting(key: string, value: unknown) {
  db().run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, j(value));
}

const DEMO = 'Illustrative demo policy for the prototype; not a verified Al Yamamah University regulation.';

export const DEFAULT_POLICIES: Policies = {
  creditLimit: { value: 19, provenance: DEMO, label_en: 'Maximum credits per term', label_ar: 'الحد الأقصى للساعات في الفصل' },
  creditMinimum: { value: 12, provenance: DEMO, label_en: 'Minimum credits for full-time status', label_ar: 'الحد الأدنى للساعات' },
  teachingWeek: { value: [0, 1, 2, 3, 4], provenance: 'Sunday–Thursday teaching week (configurable).', label_en: 'Teaching week', label_ar: 'أيام الدراسة' },
  travelGapMinutes: { value: 10, provenance: DEMO, label_en: 'Minimum gap between classes in different buildings', label_ar: 'الحد الأدنى للفاصل بين المحاضرات' },
  absenceWarningPercent: { value: 15, provenance: DEMO, label_en: 'Absence warning threshold (%)', label_ar: 'حد إنذار الغياب (%)' },
  absenceDenialPercent: { value: 25, provenance: DEMO, label_en: 'Absence denial threshold (%)', label_ar: 'حد الحرمان (%)' },
  excuseAcceptedTreatment: { value: 'excused', provenance: DEMO, label_en: 'Attendance treatment after an accepted excuse', label_ar: 'معالجة الغياب بعد قبول العذر' },
  excuseDeadlineDays: { value: 7, provenance: DEMO, label_en: 'Days allowed to submit an excuse after the session', label_ar: 'مهلة تقديم العذر (أيام)' },
  approvalTtlMinutes: { value: 30, provenance: 'Prototype safety rule: approvals expire so stale proposals are re-reviewed.', label_en: 'Approval validity (minutes)', label_ar: 'صلاحية الموافقة (دقائق)' },
  graduationCredits: { value: 142, provenance: 'https://yu.edu.sa/academics/coea/swe/ (Study Plan V9.8, Aug 2026: total credit hours = 142)', label_en: 'Credits required to graduate (BSE)', label_ar: 'الساعات المطلوبة للتخرج' }
};

export function getPolicies(): Policies {
  const stored = getSetting<Partial<Policies>>('policies', {});
  return { ...DEFAULT_POLICIES, ...stored } as Policies;
}

export function setPolicy<K extends keyof Policies>(key: K, value: Policies[K]['value'], provenance?: string) {
  const current = getPolicies();
  const next = { ...current, [key]: { ...current[key], value, provenance: provenance ?? current[key].provenance } };
  setSetting('policies', next);
  return next;
}

export const CURRENT_TERM = '2026-1'; // Fall 2026 (1448 AH) - demo term id
export const NEXT_TERM = '2026-2';
export const TERM_LABELS: Record<string, { en: string; ar: string }> = {
  '2024-1': { en: 'Fall 2024', ar: 'الفصل الأول 2024' },
  '2024-2': { en: 'Spring 2025', ar: 'الفصل الثاني 2025' },
  '2025-1': { en: 'Fall 2025', ar: 'الفصل الأول 2025' },
  '2025-2': { en: 'Spring 2026', ar: 'الفصل الثاني 2026' },
  '2025-3': { en: 'Summer 2026', ar: 'الفصل الصيفي 2026' },
  '2026-1': { en: 'Fall 2026', ar: 'الفصل الأول 2026' },
  '2026-2': { en: 'Spring 2027', ar: 'الفصل الثاني 2027' }
};
