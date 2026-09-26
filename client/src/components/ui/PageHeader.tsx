import type { ReactNode } from 'react';
import { usePageTitle } from '@/lib/usePageTitle';

/**
 * Page title block. The title is plain text in the route's single h1 so it is visible on first paint (no reveal
 * animation). It also sets document.title; the shell moves focus to this h1 after client-side navigation.
 */
export function PageHeader({ eyebrow, title, subtitle, actions, className, documentTitle }: { eyebrow?: ReactNode; title: string; subtitle?: ReactNode; actions?: ReactNode; className?: string; documentTitle?: string }) {
  usePageTitle(documentTitle ?? title);
  return (
    <div className={`mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between ${className ?? ''}`}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-600 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">{eyebrow}</div>}
        <h1 tabIndex={-1} className="text-2xl font-bold tracking-tight focus:outline-none sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-[70ch] text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
