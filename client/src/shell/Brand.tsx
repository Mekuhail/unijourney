import { Link } from 'react-router';
import { useI18n } from '@/i18n';

export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0">
      <rect width="64" height="64" rx="16" className="fill-ink-900 dark:fill-ink-800" />
      <rect x="12" y="34" width="8" height="18" rx="2" fill="#F0762B" />
      <rect x="24" y="24" width="8" height="28" rx="2" fill="#F0762B" />
      <rect x="36" y="16" width="8" height="36" rx="2" fill="#C8975B" />
      <rect x="48" y="28" width="6" height="24" rx="2" fill="#FFFBF7" />
    </svg>
  );
}

export function Brand({ compact }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <Link to="/today" className="flex min-h-11 min-w-11 items-center gap-3" aria-label={compact ? t('app.name') : undefined}>
      <BrandMark />
      {!compact && (
        <span className="leading-tight">
          <span className="block text-base font-bold tracking-tight">{t('app.name')}</span>
          <span className="block text-xs text-muted">{t('app.university')}</span>
        </span>
      )}
    </Link>
  );
}
