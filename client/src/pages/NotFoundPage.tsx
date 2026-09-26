import { ButtonLink } from '@/components/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { useI18n } from '@/i18n';

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div>
      <PageHeader title={t('notFound.title')} subtitle={t('notFound.body')} />
      <ButtonLink to="/today">{t('notFound.cta')}</ButtonLink>
    </div>
  );
}
