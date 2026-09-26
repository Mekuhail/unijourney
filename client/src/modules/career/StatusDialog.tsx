import { useEffect, useState } from 'react';
import { Button, Callout, Field, Modal, Select, Textarea, Toggle } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { ApiError, api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { APP_STATUSES, STATUS_RANK, type AppStatus, type Application } from './types';

/** Status change with the server's rules surfaced: forward moves, attestation for Applied, note-backed corrections. */
export function StatusDialog({ app, onClose, onDone }: { app: Application | null; onClose: () => void; onDone?: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [status, setStatus] = useState<AppStatus>('applied');
  const [note, setNote] = useState('');
  const [attest, setAttest] = useState(false);
  const [correction, setCorrection] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!app) return;
    const next = APP_STATUSES.find((s) => STATUS_RANK[s] > STATUS_RANK[app.status] && s !== 'rejected' && s !== 'withdrawn') ?? 'withdrawn';
    setStatus(app.terminal ? 'saved' : next); setNote(''); setAttest(false); setCorrection(false); setErr(null);
  }, [app]);
  if (!app) return null;
  const isForward = !app.terminal && STATUS_RANK[status] > STATUS_RANK[app.status];
  const needsCorrection = !isForward && status !== app.status;
  const submit = async () => {
    setErr(null); setLoading(true);
    try {
      await api(`/career/applications/${app.id}/status`, { body: { status, note: note || undefined, attest: status === 'applied' ? attest : undefined, correction: needsCorrection ? correction : undefined } });
      toast.success(t('career.statusUpdated'), t(`status.${status}`));
      refreshAll('career');
      onDone?.();
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError && e.details && typeof e.details === 'object' && 'attestation_required' in (e.details as object) ? t('career.attestRequired') : errorMessage(e));
    } finally { setLoading(false); }
  };
  return (
    <Modal open={!!app} onClose={onClose} title={t('career.changeStatus')} description={`${app.company} · ${app.title}`} size="sm" footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={loading} disabled={status === app.status || (status === 'applied' && !attest) || (needsCorrection && (!correction || !note.trim()))} onClick={() => void submit()}>{t('common.save')}</Button></>}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label={t('common.status')} hint={`${t('career.currentStatus')}: ${t(`status.${app.status}`)}`}>
          <Select value={status} onChange={(e) => setStatus(e.target.value as AppStatus)}>{APP_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}{STATUS_RANK[s] > STATUS_RANK[app.status] && !app.terminal ? '' : s === app.status ? ` (${t('career.current')})` : ` (${t('career.correctionTag')})`}</option>)}</Select>
        </Field>
        {status === 'applied' && (
          <Callout tone="gold" title={t('career.attestTitle')}>
            <Toggle checked={attest} onChange={setAttest} label={t('career.attestLabel')} description={t('career.attestBody')} />
          </Callout>
        )}
        {needsCorrection && (
          <Callout tone="warn" title={t('career.correctionTitle')}>
            <Toggle checked={correction} onChange={setCorrection} label={t('career.correctionLabel')} description={t('career.correctionBody')} />
          </Callout>
        )}
        <Field label={t('career.note')} required={needsCorrection} error={err}><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('career.notePlaceholder')} /></Field>
      </form>
    </Modal>
  );
}
