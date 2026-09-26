import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Plus, Save, BookOpen, ListTodo, GraduationCap } from 'lucide-react';
import { Badge, Button, Callout, Card, EmptyState, ErrorState, Field, Input, SectionTitle, Skeleton, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { refreshAll } from '@/lib/bus';
import { useQuery } from '@/lib/useQuery';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { SkillChip } from './ui';
import type { CareerProfile, SkillGap } from './types';

export function Profile() {
  const { t, locale, l } = useI18n();
  const toast = useToast();
  const q = useQuery(() => api<{ profile: CareerProfile; user: { name_en: string; name_ar: string; email: string; skills: string[]; interests: string[] } }>('/career/profile'), [], { refreshOn: ['career'] });
  const gaps = useQuery(() => api<{ items: SkillGap[]; basis: { saved: number; tracked: number } }>('/career/skill-gaps'), [], { refreshOn: ['career'] });
  const [form, setForm] = useState<CareerProfile | null>(null);
  const [skill, setSkill] = useState('');
  const [cvLabel, setCvLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [taskBusy, setTaskBusy] = useState<string | null>(null);
  useEffect(() => { if (q.data && !form) setForm(q.data.profile); }, [q.data, form]);
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!form || !q.data) return <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><Skeleton className="h-96" /><Skeleton className="h-96" /></div>;
  const save = async () => {
    setSaving(true);
    try {
      const r = await api<{ profile: CareerProfile }>('/career/profile', { method: 'PUT', body: { headline: form.headline, summary: form.summary, skills: form.skills, links: form.links, availability: form.availability } });
      setForm(r.profile); toast.success(t('career.profileSaved')); refreshAll('career');
    } catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); }
  };
  const addSkill = () => { const s = skill.trim(); if (!s || form.skills.some((x) => x.toLowerCase() === s.toLowerCase())) { setSkill(''); return; } setForm({ ...form, skills: [...form.skills, s] }); setSkill(''); };
  const addCv = async () => {
    if (!cvLabel.trim()) return;
    try { const r = await api<{ profile: CareerProfile }>('/career/profile/cv', { body: { label: cvLabel.trim() } }); setForm(r.profile); setCvLabel(''); toast.success(t('career.cvAdded')); refreshAll('career'); } catch (e) { toast.error(errorMessage(e)); }
  };
  const createTask = async (g: SkillGap) => {
    setTaskBusy(g.skill);
    try { const r = await api<{ created: boolean }>('/career/skill-gaps/task', { body: { skill: g.skill, effort_min: 90 } }); toast.success(r.created ? t('career.taskCreated') : t('career.taskExists'), g.skill); refreshAll('career', 'study'); } catch (e) { toast.error(errorMessage(e)); } finally { setTaskBusy(null); }
  };
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card as="section">
        <SectionTitle action={<Button size="sm" loading={saving} icon={<Save className="h-4 w-4" />} onClick={() => void save()}>{t('common.save')}</Button>}>{t('career.profile')}</SectionTitle>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="text-sm text-muted">{l(q.data.user.name_en, q.data.user.name_ar)} · {q.data.user.email}</div>
          <Field label={t('career.headline')}><Input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} maxLength={140} /></Field>
          <Field label={t('career.summary')}><Textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></Field>
          <Field label={t('career.availability')} hint={t('career.availabilityHint')}><Input value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })} /></Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="GitHub"><Input value={form.links.github ?? ''} onChange={(e) => setForm({ ...form, links: { ...form.links, github: e.target.value } })} placeholder="https://github.com/…" /></Field>
            <Field label="LinkedIn"><Input value={form.links.linkedin ?? ''} onChange={(e) => setForm({ ...form, links: { ...form.links, linkedin: e.target.value } })} placeholder="https://linkedin.com/in/…" /></Field>
            <Field label={t('career.portfolio')}><Input value={form.links.portfolio ?? ''} onChange={(e) => setForm({ ...form, links: { ...form.links, portfolio: e.target.value } })} placeholder="https://…" /></Field>
          </div>
          <Field label={t('career.skills')} hint={t('career.skillsHint')}>
            <div className="mb-2 flex flex-wrap gap-1.5">{form.skills.map((s) => <SkillChip key={s} onRemove={() => setForm({ ...form, skills: form.skills.filter((x) => x !== s) })}>{s}</SkillChip>)}{form.skills.length === 0 && <span className="text-xs text-muted">{t('common.none')}</span>}</div>
            <div className="flex gap-2"><Input value={skill} onChange={(e) => setSkill(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }} placeholder={t('career.addSkill')} /><Button type="button" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={addSkill}>{t('career.add')}</Button></div>
          </Field>
          <div className="text-xs text-muted">{t('career.coreSkills')}: {q.data.user.skills.join(', ') || '—'} · {t('career.interests')}: {q.data.user.interests.join(', ') || '—'}</div>
        </form>
        <div className="mt-5 border-t border-line pt-4">
          <SectionTitle>{t('career.cvVersions')}</SectionTitle>
          <ul className="mb-2 space-y-1 text-sm">{form.cv_versions.map((v) => <li key={v.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-1.5"><span>{v.label}</span><span className="text-xs text-muted">{fmtDate(v.updated_at, locale)}</span></li>)}{form.cv_versions.length === 0 && <li className="text-xs text-muted">{t('common.none')}</li>}</ul>
          <div className="flex gap-2"><Input value={cvLabel} onChange={(e) => setCvLabel(e.target.value)} placeholder={t('career.cvLabelPlaceholder')} /><Button type="button" variant="outline" onClick={() => void addCv()} disabled={!cvLabel.trim()}>{t('career.add')}</Button></div>
          <p className="mt-1 text-xs text-muted">{t('career.cvNote')}</p>
        </div>
      </Card>

      <Card as="section">
        <SectionTitle>{t('career.skillGaps')}</SectionTitle>
        <Callout tone="info">{t('career.skillGapsBody', { saved: gaps.data?.basis.saved ?? 0, tracked: gaps.data?.basis.tracked ?? 0 })}</Callout>
        {!!gaps.error && <ErrorState error={gaps.error} onRetry={() => void gaps.refetch()} />}
        {gaps.loading && !gaps.data && <Skeleton className="mt-3 h-40" />}
        {gaps.data && gaps.data.items.length === 0 && <EmptyState className="mt-3" icon={<GraduationCap className="h-6 w-6" />} title={t('career.noGaps')} body={t('career.noGapsBody')} />}
        <ul className="mt-3 space-y-3">
          {gaps.data?.items.map((g) => (
            <li key={g.skill} className="card-2 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2"><SkillChip tone="missing">{g.skill}</SkillChip><span className="text-xs text-muted">{t('career.neededBy', { n: g.opportunities.length })}: {g.opportunities.map((o) => o.company).join(', ')}</span></div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {g.workshops.map((w) => <Link key={w.id} to={w.link} className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-xs hover:border-brand-400"><BookOpen className="h-3.5 w-3.5 text-brand-500" />{l(w.title_en, w.title_ar)} · {fmtDateTime(w.start_at, locale)}</Link>)}
                {g.workshops.length === 0 && <span className="text-xs text-muted">{t('career.noWorkshops')}</span>}
                {g.task ? <Link to={g.task.link} className="ms-auto inline-flex items-center gap-1 text-xs text-success"><ListTodo className="h-3.5 w-3.5" />{t('career.taskExists')} · <Badge tone="neutral">{t(`status.${g.task.status}`)}</Badge></Link> : <Button size="sm" variant="outline" className="ms-auto" loading={taskBusy === g.skill} icon={<ListTodo className="h-4 w-4" />} onClick={() => void createTask(g)}>{t('career.createTask')}</Button>}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">{t('career.skillGapDisclaimer')}</p>
      </Card>
    </div>
  );
}
