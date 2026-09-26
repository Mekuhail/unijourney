import { PageHeader } from '@/components/ui/PageHeader';
import { useI18n } from '@/i18n';
import { Competitions } from './Competitions';

/** /competitions: university and national competitions, kept apart from the job market. */
export function CompetitionsPage() {
  const { t } = useI18n();
  return (
    <div>
      <PageHeader title={t('nav.competitions')} subtitle={t('comp.intro')} />
      <Competitions />
    </div>
  );
}
