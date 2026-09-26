import clsx from 'clsx';
import type { ReactNode } from 'react';
import { CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { useI18n } from '@/i18n';

/** Match score ring (0–100). Colour reflects the band; the number is the score, not an eligibility verdict. */
export function MatchRing({ score, size = 52, label }: { score: number; size?: number; label?: ReactNode }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const tone = score >= 70 ? 'var(--success)' : score >= 45 ? 'var(--accent)' : 'var(--muted)';
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Only the arc is rotated so it starts at 12 o'clock; the number sits upright on top. */}
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={5} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={5} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
        </svg>
        <span className="num absolute inset-0 grid place-items-center text-sm font-bold text-fg">{score}</span>
      </div>
      {label && <span className="text-xs font-medium text-muted">{label}</span>}
    </div>
  );
}

export function SkillChip({ children, tone = 'neutral', onRemove }: { children: ReactNode; tone?: 'neutral' | 'have' | 'missing'; onRemove?: () => void }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-medium', tone === 'have' && 'border-success/40 bg-success/10 text-success', tone === 'missing' && 'border-warn/40 bg-warn/10 text-warn', tone === 'neutral' && 'border-line bg-surface-2 text-fg')}>
      {children}
      {onRemove && <button type="button" onClick={onRemove} aria-label="Remove" className="ms-0.5 rounded px-0.5 text-muted hover:text-danger">×</button>}
    </span>
  );
}

/** Eligibility as a status line (not a button): icon + text, with the rule shown when it is unclear. */
export function EligibilityBadge({ eligible, note }: { eligible: boolean | null; note?: string }) {
  const { t } = useI18n();
  if (eligible === true) return <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success"><CheckCircle2 className="h-4 w-4" aria-hidden />{t('career.eligible')}</span>;
  if (eligible === false) return <span className="inline-flex items-center gap-1.5 text-sm font-medium text-danger"><XCircle className="h-4 w-4" aria-hidden />{t('career.notEligible')}</span>;
  return <span className="inline-flex items-start gap-1.5 text-sm text-muted"><HelpCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{note ? t('career.eligibilityCheck', { rule: note }) : t('career.eligibilityUnknown')}</span></span>;
}
