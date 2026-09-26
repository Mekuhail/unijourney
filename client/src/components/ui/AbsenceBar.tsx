import clsx from 'clsx';
import { useI18n } from '@/i18n';

/**
 * Absence meter on a real percentage scale. The track shows 0–30 % (absences above that are clamped visually but
 * reported exactly), with ticks at the warning and denial limits. Colour follows the status band.
 */
export function AbsenceBar({ percent, warn, deny, level, showScale, className, label }: { percent: number; warn: number; deny: number; level: 'ok' | 'warn' | 'danger'; showScale?: boolean; className?: string; label: string }) {
  const { t } = useI18n();
  const max = Math.max(deny + 5, 30);
  const pos = (v: number) => `${(Math.min(Math.max(v, 0), max) / max) * 100}%`;
  const fill = level === 'danger' ? 'bg-danger' : level === 'warn' ? 'bg-warn' : 'bg-success';
  return (
    <div className={className}>
      <div role="meter" aria-label={t('attendance.meterLabel', { course: label })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={t('attendance.meter', { p: percent, warn, deny })} className="relative h-2 w-full rounded-full bg-line">
        <div className={clsx('h-full rounded-full', fill)} style={{ width: pos(percent) }} />
        <span aria-hidden className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded bg-warn rtl:translate-x-1/2" style={{ insetInlineStart: pos(warn) }} />
        <span aria-hidden className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded bg-danger rtl:translate-x-1/2" style={{ insetInlineStart: pos(deny) }} />
      </div>
      {showScale && (
        <div aria-hidden className="relative mt-1.5 h-4 text-xs text-muted">
          <span className="absolute start-0">0%</span>
          <span className="absolute -translate-x-1/2 whitespace-nowrap rtl:translate-x-1/2" style={{ insetInlineStart: pos(warn) }}>{warn}%</span>
          <span className="absolute -translate-x-1/2 whitespace-nowrap rtl:translate-x-1/2" style={{ insetInlineStart: pos(deny) }}>{deny}%</span>
        </div>
      )}
    </div>
  );
}

/** One-line legend for a list of absence meters. */
export function AbsenceLegend({ warn, deny, className }: { warn: number; deny: number; className?: string }) {
  const { t } = useI18n();
  return (
    <div className={clsx('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted', className)}>
      <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-3 w-0.5 rounded bg-warn" />{t('attendance.legend.warn', { n: warn })}</span>
      <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-3 w-0.5 rounded bg-danger" />{t('attendance.legend.deny', { n: deny })}</span>
    </div>
  );
}
