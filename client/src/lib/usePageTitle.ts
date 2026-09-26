import { useEffect } from 'react';
import { useI18n } from '@/i18n';

/** Sets document.title to "<Page> · UniJourney" (localized brand name in Arabic). */
export function usePageTitle(title: string | null | undefined) {
  const { t } = useI18n();
  const brand = t('app.name');
  useEffect(() => {
    document.title = title ? `${title} · ${brand}` : brand;
  }, [title, brand]);
}
