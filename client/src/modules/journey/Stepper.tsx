import { motion } from 'motion/react';
import { Check, ChevronLeft } from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '@/i18n';
import { useEdgeFade } from '@/components/ui/useEdgeFade';

/** Controlled step indicator (the vendored React Bits Stepper owns its own state; the admission form needs server-gated steps). */
export function StepHeader({ steps, current, onSelect, reached }: { steps: Array<{ key: string; label: string }>; current: number; onSelect: (i: number) => void; reached: number }) {
  const { t } = useI18n();
  const row = useEdgeFade<HTMLOListElement>(current);
  return (
    <>
      {/* Phones: one line, "Step 2 of 5 · Programme" */}
      <div className="flex items-center justify-between gap-2 pb-2 sm:hidden">
        <p className="text-sm font-medium" aria-live="polite"><span className="text-muted">{t('common.stepOf', { n: current + 1, total: steps.length })} · </span>{steps[current]?.label}</p>
        {current > 0 && <button type="button" onClick={() => onSelect(current - 1)} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-sm font-medium text-brand-600"><ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />{t('common.back')}</button>}
      </div>
      <ol ref={row} className="scroll-row hidden items-center gap-2 overflow-x-auto pb-2 sm:flex" aria-label={t('common.progress')}>
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const enabled = i <= reached;
          return (
            <li key={s.key} className="flex shrink-0 items-center gap-2">
              <button type="button" disabled={!enabled} onClick={() => onSelect(i)} aria-current={active ? 'step' : undefined} className={clsx('flex items-center gap-2 rounded-full border py-1 pe-3 ps-1 text-sm transition', active ? 'border-brand-500 bg-brand-500/10 text-fg' : done ? 'border-success/40 text-fg' : 'border-line text-muted', !enabled && 'cursor-not-allowed opacity-60')}>
                <span className={clsx('grid h-7 w-7 place-items-center rounded-full text-xs font-bold', active ? 'bg-brand-500 text-ink-950' : done ? 'bg-success text-on-strong' : 'bg-line text-muted')}>{done ? <Check className="h-4 w-4" /> : i + 1}</span>
                <span className="whitespace-nowrap font-medium">{s.label}</span>
              </button>
              {i < steps.length - 1 && <span className="relative h-0.5 w-6 overflow-hidden rounded bg-line sm:w-10"><motion.span className="absolute inset-y-0 start-0 bg-success" initial={false} animate={{ width: done ? '100%' : '0%' }} transition={{ duration: 0.2 }} /></span>}
            </li>
          );
        })}
      </ol>
    </>
  );
}
