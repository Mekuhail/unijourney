import type { SeedContext } from '../../seed/context.ts';
import { addDays, localToIso } from '../../core/clock.ts';
import { newId } from '../../core/ids.ts';

export const CLEARANCE_KEYS = [
  { key: 'library', label_en: 'Library – no outstanding loans or fines', label_ar: 'المكتبة – لا توجد استعارات أو غرامات معلقة' },
  { key: 'finance', label_en: 'Finance – tuition and fees settled', label_ar: 'المالية – تسوية الرسوم الدراسية' },
  { key: 'housing', label_en: 'Housing – room handed over (N/A for day students)', label_ar: 'السكن – تسليم الغرفة (لا ينطبق على الطلاب غير المقيمين)' },
  { key: 'coop_report', label_en: 'Co-op report submitted and graded', label_ar: 'تسليم تقرير التدريب التعاوني وتقييمه' },
  { key: 'exit_exam', label_en: 'Exit exam attempted (SWE 410)', label_ar: 'أداء اختبار الخروج (SWE 410)' }
] as const;

export function seedGraduation(ctx: SeedContext) {
  const { db: d, today } = ctx;
  const cleared = (n: number) => localToIso(addDays(today, -n), '12:00');
  const rows: Array<{ key: string; status: 'pending' | 'cleared'; by?: string; at?: string; note?: string }> = [
    { key: 'library', status: 'cleared', by: ctx.users.admissions, at: cleared(20), note: 'No loans on record (demo).' },
    { key: 'finance', status: 'pending', note: 'Final-term fee statement awaiting confirmation (demo).' },
    { key: 'housing', status: 'cleared', by: ctx.users.admissions, at: cleared(30), note: 'Not applicable – day student.' },
    { key: 'coop_report', status: 'pending', note: 'Report submitted to the co-op coordinator; grade pending (demo).' },
    { key: 'exit_exam', status: 'cleared', by: ctx.users.admissions, at: cleared(8), note: 'Attempted in Spring 2026 (demo).' }
  ];
  for (const r of rows) {
    const spec = CLEARANCE_KEYS.find((k) => k.key === r.key)!;
    d.insert('clearance_items', { id: newId('clr'), student_id: ctx.users.graduating, key: r.key, label_en: spec.label_en, label_ar: spec.label_ar, status: r.status, cleared_by: r.by ?? null, cleared_at: r.at ?? null, note: r.note ?? null });
  }
}
