import { useState } from 'react';
import { Modal, Avatar, Badge, Button } from '@/components/ui';
import { useSession, type Persona } from '@/lib/session';
import { useI18n } from '@/i18n';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';
import { Check } from 'lucide-react';
import clsx from 'clsx';

const roleLabel: Record<string, { en: string; ar: string }> = {
  applicant: { en: 'Applicant', ar: 'متقدم' }, student: { en: 'Student', ar: 'طالب' }, reviewer: { en: 'Academic reviewer', ar: 'مراجع أكاديمي' }, club_lead: { en: 'Club lead', ar: 'قائد نادٍ' },
  security: { en: 'Campus security', ar: 'أمن الحرم' }, operator: { en: 'Demo operator', ar: 'مشغّل العرض' }, admission_officer: { en: 'Admissions officer', ar: 'موظف قبول' }, registrar: { en: 'Registrar', ar: 'مسجّل' }
};
export function RoleBadges({ roles }: { roles: string[] }) {
  const { locale } = useI18n();
  return <span className="flex flex-wrap gap-1">{roles.map((r) => <Badge key={r} tone={r === 'student' || r === 'applicant' ? 'brand' : 'gold'}>{roleLabel[r]?.[locale] ?? r}</Badge>)}</span>;
}

export function PersonaSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { personas, user, switchPersona } = useSession();
  const { t, l } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const groups: Array<{ label: string; filter: (p: Persona) => boolean }> = [
    { label: t('nav.journey') + ' · ' + 'Students & applicants', filter: (p) => p.roles.includes('student') || p.roles.includes('applicant') },
    { label: t('nav.staff'), filter: (p) => !p.roles.includes('student') && !p.roles.includes('applicant') && !p.roles.includes('operator') },
    { label: t('nav.demo'), filter: (p) => p.roles.includes('operator') }
  ];
  const pick = async (id: string) => {
    setBusy(id);
    try {
      await switchPersona(id);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('shell.switchPersona')} description={t('shell.personaHint')} size="lg">
      <div className="space-y-5">
        {groups.map((g) => {
          const items = personas.filter(g.filter);
          if (!items.length) return null;
          return (
            <div key={g.label}>
              <div className="mb-2 text-xs font-semibold text-muted">{g.label}</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {items.map((p) => {
                  const active = user?.id === p.id;
                  return (
                    <button key={p.id} onClick={() => void pick(p.id)} disabled={!!busy} className={clsx('flex items-start gap-3 rounded-2xl border p-3 text-start transition hover:border-brand-400', active ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-line bg-surface-2')}>
                      <Avatar name={p.name_en} color={p.avatar_color} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 font-semibold">{l(p.name_en, p.name_ar)}{active && <Check className="h-4 w-4 text-brand-600" />}</span>
                        <span className="block text-xs text-muted">{p.department ?? (p.program_id ? `${p.program_id.toUpperCase()} · ${p.stage}` : p.stage)} · {p.campus_id === 'khobar' ? t('shell.khobar') : t('shell.riyadh')}</span>
                        <span className="mt-1.5 block"><RoleBadges roles={p.roles} /></span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="flex justify-end"><Button variant="ghost" onClick={onClose}>{t('common.close')}</Button></div>
      </div>
    </Modal>
  );
}
