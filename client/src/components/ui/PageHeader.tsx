import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import BlurText from '@/components/reactbits/BlurText';
import { useTheme } from '@/lib/theme';

export function PageHeader({ eyebrow, title, subtitle, actions, className }: { eyebrow?: ReactNode; title: string; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  const { reducedMotion } = useTheme();
  return (
    <div className={`mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between ${className ?? ''}`}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">{eyebrow}</div>}
        {reducedMotion ? (
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        ) : (
          <BlurText text={title} delay={40} animateBy="words" direction="top" className="text-2xl font-bold tracking-tight sm:text-3xl" />
        )}
        {subtitle && (
          <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-1 max-w-2xl text-sm text-muted">
            {subtitle}
          </motion.p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
