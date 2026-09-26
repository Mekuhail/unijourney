import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import clsx from 'clsx';

/** Controlled step indicator (the vendored React Bits Stepper owns its own state; the admission form needs server-gated steps). */
export function StepHeader({ steps, current, onSelect, reached }: { steps: Array<{ key: string; label: string }>; current: number; onSelect: (i: number) => void; reached: number }) {
  return (
    <ol className="scroll-thin flex items-center gap-2 overflow-x-auto pb-2" aria-label="Steps">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const enabled = i <= reached;
        return (
          <li key={s.key} className="flex shrink-0 items-center gap-2">
            <button type="button" disabled={!enabled} onClick={() => onSelect(i)} aria-current={active ? 'step' : undefined} className={clsx('flex items-center gap-2 rounded-full border py-1 pe-3 ps-1 text-sm transition', active ? 'border-brand-500 bg-brand-500/10 text-fg' : done ? 'border-success/40 text-fg' : 'border-line text-muted', !enabled && 'cursor-not-allowed opacity-60')}>
              <motion.span layout className={clsx('grid h-7 w-7 place-items-center rounded-full text-xs font-bold', active ? 'bg-brand-500 text-white' : done ? 'bg-success text-white' : 'bg-line text-muted')}>{done ? <Check className="h-4 w-4" /> : i + 1}</motion.span>
              <span className="whitespace-nowrap font-medium">{s.label}</span>
            </button>
            {i < steps.length - 1 && <span className="relative h-0.5 w-6 overflow-hidden rounded bg-line sm:w-10"><motion.span className="absolute inset-y-0 start-0 bg-success" initial={false} animate={{ width: done ? '100%' : '0%' }} transition={{ duration: 0.4 }} /></span>}
          </li>
        );
      })}
    </ol>
  );
}
