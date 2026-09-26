import type { ReactNode } from 'react';

/** Page title block. The title is plain text in an h1 so it is visible on first paint (no reveal animation). */
export function PageHeader({ eyebrow, title, subtitle, actions, className }: { eyebrow?: ReactNode; title: string; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={`mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between ${className ?? ''}`}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-[70ch] text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
