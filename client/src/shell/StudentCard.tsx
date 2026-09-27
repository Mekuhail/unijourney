import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { bus } from '@/lib/bus';
import { useQuery } from '@/lib/useQuery';
import { Avatar, Button, ErrorState, Modal, Skeleton } from '@/components/ui';
import type { CardData } from '@/modules/campus/types';

/** Opens the student ID pop-up from anywhere (account menu, Campus Life, portfolio, deep links). */
export function openStudentCard() {
  bus.emit('student-card');
}

function IdCard({ d }: { d: CardData }) {
  const { t, l } = useI18n();
  const [copied, setCopied] = useState(false);
  const id = d.user.student_no;
  const copy = () => { if (!id) return; void navigator.clipboard?.writeText(id); setCopied(true); window.setTimeout(() => setCopied(false), 1500); };
  const campus = d.campus ? l(d.campus.name_en, d.campus.name_ar).replace(/^.*[–-]\s*/, '') : null;
  return (
    <div className="rounded-2xl border-t-4 border-gold-500 bg-ink-950 p-5 text-ink-50 [color-scheme:dark]">
      <p className="text-sm font-semibold text-gold-300">{t('card.university')}</p>
      <div className="mt-4 flex items-center gap-4">
        <Avatar name={d.user.name_en} color={d.user.avatar_color} size={60} className="ring-2 ring-ink-50/20" />
        <div className="min-w-0">
          <p className="text-lg font-bold leading-tight">{l(d.user.name_en, d.user.name_ar)}</p>
          {d.program && <p className="truncate text-sm text-ink-200">{l(d.program.name_en, d.program.name_ar)}</p>}
        </div>
      </div>
      <div className="mt-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-ink-200">{t('card.studentId')}</p>
          {id ? (
            <button type="button" onClick={copy} className="group -ms-1 inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-start" aria-label={`${t('card.studentId')} ${id}. ${t(copied ? 'common.copied' : 'common.copy')}`}>
              <span className="num text-3xl font-bold tracking-wider">{id}</span>
              {copied ? <Check className="h-4 w-4 text-gold-300" aria-hidden /> : <Copy className="h-4 w-4 text-ink-200 opacity-70 group-hover:opacity-100" aria-hidden />}
            </button>
          ) : <p className="text-base font-semibold text-ink-100">{t('card.noId')}</p>}
          <p className="mt-1 text-sm text-ink-200">{[campus, d.user.level ? t('card.level', { n: d.user.level }) : null].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="shrink-0 rounded-lg bg-white p-1.5"><QRCodeSVG value={d.qr.payload} size={84} level="M" title={t('card.qr')} /></div>
      </div>
    </div>
  );
}

function StudentCardDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const q = useQuery(() => api<CardData>('/campus/me/card'), []);
  return (
    <Modal open onClose={onClose} size="sm" title={t('card.title')} footer={<Button onClick={onClose}>{t('common.close')}</Button>}>
      {q.loading && !q.data && <Skeleton className="h-56" />}
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {q.data && <IdCard d={q.data} />}
      <p className="mt-3 text-xs text-muted">{t('card.demoNote')}</p>
    </Modal>
  );
}

/** Mounted once in the shell. */
export function StudentCardHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => bus.on('student-card', () => setOpen(true)), []);
  return open ? <StudentCardDialog onClose={() => setOpen(false)} /> : null;
}

/** /campus/card is kept for old links and notifications: it opens the pop-up over Campus Life. */
export function StudentCardRoute() {
  const nav = useNavigate();
  useEffect(() => { nav('/campus', { replace: true }); window.setTimeout(openStudentCard, 0); }, [nav]);
  return null;
}
