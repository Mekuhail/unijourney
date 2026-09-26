import { useQuery } from '@/lib/useQuery';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { fmtDateTime } from '@/lib/format';
import { Clock } from 'lucide-react';
import { Link } from 'react-router';

export interface DemoStatus { demoMode: boolean; clock: string; clockOverride: string | null; tz: string; adapters: Array<{ name: string; provider: string; real: boolean; note: string }>; aiConfigured: boolean; googleMapsConfigured: boolean; seededAt: string | null }

export function useDemoStatus() {
  return useQuery(() => api<DemoStatus>('/demo/status'), [], { refreshOn: ['clock'] });
}

export function DemoClockChip() {
  const { data } = useDemoStatus();
  const { locale, t } = useI18n();
  if (!data) return null;
  return (
    <Link to="/demo" className="hidden items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs text-muted transition hover:border-brand-400 hover:text-fg md:inline-flex" title={t('shell.demoClock')}>
      <Clock className="h-3.5 w-3.5 text-brand-500" />
      <span className="num">{fmtDateTime(data.clock, locale)}</span>
      <span className="rounded-full bg-gold-100 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-gold-700 dark:bg-gold-700/30 dark:text-gold-300">{data.tz.replace('Asia/', '')}</span>
    </Link>
  );
}
