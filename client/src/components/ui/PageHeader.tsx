import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { useI18n } from '@/i18n';
import { usePageTitle } from '@/lib/usePageTitle';

export interface Crumb { to: string; label: string }

/** Breadcrumb trail for sub-pages: ancestors are links, the current page is the last item. */
export function Breadcrumbs({ items, current }: { items: Crumb[]; current: string }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t('common.breadcrumb')} className="mb-1">
      <ol className="flex flex-wrap items-center gap-x-1 text-sm text-muted">
        {items.map((c) => (
          <li key={c.to} className="flex items-center gap-1">
            <Link to={c.to} className="inline-flex min-h-11 items-center rounded-md hover:text-fg hover:underline sm:min-h-8">{c.label}</Link>
            <ChevronRight className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden />
          </li>
        ))}
        <li aria-current="page" className="max-w-[60vw] truncate text-fg sm:max-w-md">{current}</li>
      </ol>
    </nav>
  );
}

/**
 * Page title block. The title is plain text in the route's single h1 so it is visible on first paint (no reveal
 * animation). It also sets document.title; the shell moves focus to this h1 after client-side navigation.
 * Sub-pages pass `crumbs` (ancestors); top-level pages pass none.
 */
export function PageHeader({ crumbs, meta, title, subtitle, actions, className, documentTitle, crumbLabel }: { crumbs?: Crumb[]; meta?: ReactNode; title: string; subtitle?: ReactNode; actions?: ReactNode; className?: string; documentTitle?: string; crumbLabel?: string }) {
  usePageTitle(documentTitle ?? title);
  return (
    <div className={`mb-6 ${className ?? ''}`}>
      {crumbs && crumbs.length > 0 && <Breadcrumbs items={crumbs} current={crumbLabel ?? title} />}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 tabIndex={-1} className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">{meta}</div>}
          {subtitle && <p className="mt-1 max-w-[70ch] text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
