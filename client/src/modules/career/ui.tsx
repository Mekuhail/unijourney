import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui';

/** Match score ring (0–100). Colour reflects the band; the number is the score, not an eligibility verdict. */
export function MatchRing({ score, size = 52, label }: { score: number; size?: number; label?: ReactNode }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const tone = score >= 70 ? 'var(--success)' : score >= 45 ? 'var(--accent)' : 'var(--muted)';
  return (
    <div className="flex flex-col items-center gap-0.5" aria-label={`Match ${score} of 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={5} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} style={{ transition: 'stroke-dashoffset 0.8s ease-out' }} />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="rotate-90 origin-center fill-[var(--fg)] text-[13px] font-bold" style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}>{score}</text>
      </svg>
      {label && <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</span>}
    </div>
  );
}

export function SkillChip({ children, tone = 'neutral', onRemove }: { children: ReactNode; tone?: 'neutral' | 'have' | 'missing'; onRemove?: () => void }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-medium', tone === 'have' && 'border-success/40 bg-success/10 text-success', tone === 'missing' && 'border-warn/40 bg-warn/10 text-warn', tone === 'neutral' && 'border-line bg-surface-2 text-fg')}>
      {children}
      {onRemove && <button type="button" onClick={onRemove} aria-label="Remove" className="ms-0.5 rounded px-0.5 text-muted hover:text-danger">×</button>}
    </span>
  );
}

export function EligibilityBadge({ eligible, note }: { eligible: boolean | null; note?: string }) {
  if (eligible === true) return <Badge tone="success" className="whitespace-nowrap" dot>Eligible (stated rule)</Badge>;
  if (eligible === false) return <Badge tone="danger" className="whitespace-nowrap" dot>Not eligible</Badge>;
  return <Badge tone="neutral" className="whitespace-nowrap" dot>{note ? 'Check eligibility' : 'Eligibility unknown'}</Badge>;
}
