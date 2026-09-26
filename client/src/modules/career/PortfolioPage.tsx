import { PageHeader } from '@/components/ui/PageHeader';
import { useI18n } from '@/i18n';
import { Portfolio } from './Portfolio';

/** /portfolio: the student's professional profile, with suggestions that follow from it. */
export function PortfolioPage() {
  const { t } = useI18n();
  return (
    <div>
      <PageHeader title={t('nav.portfolio')} subtitle={t('portfolio.pageSubtitle')} />
      <Portfolio />
    </div>
  );
}
