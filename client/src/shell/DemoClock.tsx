import { useQuery } from '@/lib/useQuery';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { fmtDateTime } from '@/lib/format';
import { FlaskConical } from 'lucide-react';
import { Link } from 'react-router';

export interface DemoStatus { demoMode: boolean; clock: string; clockOverride: string | null; tz: string; adapters: Array<{ name: string; provider: string; real: boolean; note: string }>; aiConfigured: boolean; googleMapsConfigured: boolean; seededAt: string | null }

export function useDemoStatus() {
  return useQuery(() => api<DemoStatus>('/demo/status'), [], { refreshOn: ['clock'] });
}

/** The single place the UI says "demo": a header pill that opens the demo panel and shows the frozen clock. */
export function DemoPill() {
  const { data } = useDemoStatus();
  const { locale, t } = useI18n();
  return (
    <Link to="/demo" className="inline-flex h-11 items-center gap-2 rounded-full border border-gold-500/50 bg-gold-100 px-3 text-sm font-semibold text-gold-700 transition hover:border-gold-700 dark:bg-gold-700/20" title={t('shell.demoPillHint')}>
      <FlaskConical className="h-4 w-4" aria-hidden />
      <span>{t('shell.demoMode')}</span>
      {data && <span className="num hidden font-normal md:inline">· {fmtDateTime(data.clock, locale)}</span>}
    </Link>
  );
}
