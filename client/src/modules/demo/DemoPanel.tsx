import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { FlaskConical, Clock, RotateCcw, Users, Plug, Scale, ListChecks, BookMarked, ChevronRight, CheckCircle2, XCircle } from 'lucide-react';
import { useI18n } from '@/i18n';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, Button, Badge, ConfirmDialog, Field, Input, Select, SectionTitle, Tabs, Avatar, ButtonLink } from '@/components/ui';
import { readDemoLocation, writeDemoLocation } from '@/modules/campus/map/useCampusLocation';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { refreshAll } from '@/lib/bus';
import { useSession } from '@/lib/session';
import { useDemoStatus } from '@/shell/DemoClock';
import { RoleBadges } from '@/shell/PersonaSwitcher';
import { fmtDateTime } from '@/lib/format';
import type { Policies } from '@shared/types';

const TOUR: Array<{ minute: string; persona: string; title: string; steps: string[]; link: string }> = [
  { minute: '0:00', persona: 'u_applicant', title: 'Admission → orientation', steps: ['Open My Journey → Admission: the draft is blocked until the checklist is complete.', 'Attach the missing document, submit, read the demo receipt, then switch to the admissions officer to admit, and back to accept the offer — the same profile becomes a student with an onboarding checklist.'], link: '/journey/admission' },
  { minute: '1:00', persona: 'u_student', title: 'Course-registration agent', steps: ['Academics → Register: type “avoid early classes, no Thursday, keep Tuesday 4pm free”, generate options.', 'Compare options, pin a section, approve the exact list, submit; try “simulate stale capacity” and “duplicate click” to see revalidation and idempotency; timetable updates only on the confirmed receipt.'], link: '/academics/register' },
  { minute: '2:15', persona: 'u_student', title: 'Exact-session absence excuse', steps: ['Academics → Attendance: click the Absent pill on 21 Sep (SWE 302).', 'Attach the seeded Sehhaty-style PDF: extracted dates/reference appear in an editable preview; approve, submit (demo EduGate adapter, request ID).', 'Switch to Dr. Hala (reviewer): accept — attendance becomes excused while the original record stays.'], link: '/academics/attendance' },
  { minute: '3:30', persona: 'u_student', title: 'Event conflict → study repair', steps: ['Campus Life → Events: RSVP to the Cybersecurity CTF that overlaps a class; the conflict panel offers an exact-session excuse draft and a study repair.', 'Academics → Study planner → Repair plan: before/after loads, locked tasks untouched, infeasible tasks listed; apply, then restore a version.'], link: '/campus/events' },
  { minute: '4:30', persona: 'u_student', title: 'Lost & found (YU Claimed flow)', steps: ['Campus Life → Lost & found: submit a request, copy the YU-… ID.', 'Switch to Abdullah (security): mark found with a collection location; switch back: green “collect from” banner, email preview, walking route on the real campus map (accessible mode available).'], link: '/campus/lost-found' },
  { minute: '5:15', persona: 'u_graduating', title: 'Career tracker + graduation audit', steps: ['Career: filter opportunities, save one, create the single linked application, add an interview to the shared calendar (conflict check), review an ambiguous hiring email.', 'My Journey → Graduation: one unmet requirement blocks the request; use the labelled demo fixture to fulfil it and submit; registrar approves; career handoff.'], link: '/journey/graduation' }
];

const INTEGRATIONS: Array<{ area: string; working: string; simulated: string; future: string }> = [
  { area: 'Course registration', working: 'Prerequisite/co-requisite/overlap/capacity/credit/travel checks, options, approvals, idempotent submission, timetable + calendar updates', simulated: 'EduGate submission (mock portal with atomic capacity, operation IDs, timeouts)', future: 'Authorized EduGate connector implementing UniversityPortalAdapter' },
  { area: 'Attendance & excuses', working: 'Exact-session drafts, evidence ownership, extraction preview, approval, reviewer decisions, attendance treatment', simulated: 'EduGate excuse submission + request IDs; Sehhaty report is a synthetic PDF', future: 'EduGate excuse API; Sehhaty verification (never claimed here)' },
  { area: 'Study planner', working: 'Intake parsing, scheduling, repair with locked tasks, versions, execution history', simulated: 'Optional AI parsing (deterministic rules by default)', future: 'Model-backed intent parsing with the same interface' },
  { area: 'Clubs & events', working: 'Membership states, lead approvals, RSVP/waitlist, calendar, conflicts, achievements', simulated: 'External hackathon/competition listings are labelled demo data', future: 'Import from official event calendars' },
  { area: 'Navigation', working: 'Real OSM footprints/paths (Riyadh), Dijkstra routing, accessible mode, Google Maps tiles when a key is set', simulated: 'Khobar layout (approximate centre, synthetic buildings); accessibility attributes unverified', future: 'Surveyed campus geometry, indoor maps, live occupancy' },
  { area: 'Lost & found', working: 'Owner-bound requests, opaque IDs, security queue, found matching, handover, notifications', simulated: 'Email delivery (rendered to an outbox preview)', future: 'SMTP/notification provider' },
  { area: 'Career', working: 'Discovery filters/matching, dedupe, single application per opportunity, history, interviews → calendar, email review queue', simulated: 'Opportunity feed, hiring emails, application autofill draft', future: 'Authorized job-board APIs, Gmail read-only sync' },
  { area: 'Admission & graduation', working: 'Checklist completeness, receipts, officer/registrar decisions, same-profile transition, degree audit', simulated: 'Decisions by demo personas; criteria are illustrative', future: 'Official admission system + degree-audit source of truth' }
];

const ATTRIBUTION = [
  'React Bits components (MIT + Commons Clause, © David Haz) — client/src/components/reactbits',
  'OpenStreetMap data (© OpenStreetMap contributors, ODbL) — Riyadh campus footprints, paths, boundary',
  'Leaflet (BSD-2-Clause), motion (MIT), GSAP (Standard “no charge” license), lucide (ISC), Tailwind CSS (MIT), Express (MIT), React (MIT), qrcode.react (ISC), ogl (MIT), Zod (MIT)',
  'Study plans: Al Yamamah University official BSE V9.8 / BCNE V.2 (Aug 2026) PDFs transcribed for the demo curriculum',
  'Reference projects inspected but not copied: study-planner (AGPL-3.0), all-clubs-community (no license), Smart-Campus-Navigation-System (license unclear), JobRADAR (no license); AI Job Tracker (MIT) — status taxonomy pattern reused with attribution',
  'YU Claimed video — workflow reference only; no personal data reused'
];

export function DemoPanel() {
  const { t, locale, l } = useI18n();
  const toast = useToast();
  const { personas, user, switchPersona } = useSession();
  const { data: status, refetch } = useDemoStatus();
  const policies = useQuery(() => api<Policies>('/policies'));
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'tour' | 'controls' | 'integrations' | 'policies' | 'attribution'>(params.get('tour') ? 'tour' : 'controls');
  const [resetOpen, setResetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clockInput, setClockInput] = useState('2026-09-27T09:00');

  const setClock = async (body: { iso?: string | null; advanceMinutes?: number }) => {
    try {
      await api('/demo/clock', { body });
      await refetch();
      refreshAll('clock', 'calendar');
      toast.success('Demo clock updated');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const reset = async () => {
    setBusy(true);
    try {
      await api('/demo/reset', { method: 'POST' });
      setResetOpen(false);
      await refetch();
      refreshAll('clock', 'calendar', 'persona');
      toast.success(t('shell.resetDone'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const savePolicy = async (key: keyof Policies, raw: string) => {
    const current = policies.data?.[key].value;
    let value: unknown = raw;
    if (typeof current === 'number') value = Number(raw);
    if (Array.isArray(current)) value = raw.split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
    try {
      await api(`/policies/${key}`, { method: 'PUT', body: { value } });
      await policies.refetch();
      refreshAll();
      toast.success('Policy updated (demo)');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div>
      <PageHeader title={t('nav.demo')} subtitle={t('demo.subtitle')} actions={<Button variant="danger" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setResetOpen(true)}>{t('shell.reset')}</Button>} />
      <Tabs value={tab} onChange={setTab} className="mb-5" items={[{ value: 'tour', label: t('shell.tour'), icon: <ListChecks className="h-4 w-4" /> }, { value: 'controls', label: 'Controls', icon: <FlaskConical className="h-4 w-4" /> }, { value: 'integrations', label: 'Real vs simulated', icon: <Plug className="h-4 w-4" /> }, { value: 'policies', label: 'Policies', icon: <Scale className="h-4 w-4" /> }, { value: 'attribution', label: 'Attribution', icon: <BookMarked className="h-4 w-4" /> }]} />

      {tab === 'tour' && (
        <div className="space-y-3">
          {TOUR.map((s, i) => (
            <Card key={s.title} className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="flex shrink-0 items-center gap-3 sm:w-40 sm:flex-col sm:items-start">
                <span className="num rounded-full bg-brand-500 px-2.5 py-0.5 text-xs font-bold text-ink-950">{s.minute}</span>
                <span className="text-xs text-muted">Step {i + 1} · persona <button className="font-mono text-brand-600 hover:underline" onClick={() => void switchPersona(s.persona).then(() => toast.success('Persona switched'))}>{s.persona}</button></span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{s.title}</div>
                <ol className="mt-1 list-decimal space-y-1 ps-5 text-sm text-muted">{s.steps.map((x) => <li key={x}>{x}</li>)}</ol>
              </div>
              <ButtonLink to={s.link} className="shrink-0" variant="outline" size="sm" icon={<ChevronRight className="h-4 w-4 rtl:rotate-180" />}>{t('common.open')}</ButtonLink>
            </Card>
          ))}
        </div>
      )}

      {tab === 'controls' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card>
            <SectionTitle>{t('shell.demoClock')}</SectionTitle>
            <div className="mb-3 flex items-center gap-2 text-sm"><Clock className="h-4 w-4 text-brand-500" /><span className="num font-semibold">{status ? fmtDateTime(status.clock, locale) : '…'}</span><Badge tone="gold">{status?.tz}</Badge>{status?.clockOverride ? <Badge tone="info">frozen</Badge> : <Badge tone="neutral">real time</Badge>}</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void setClock({ advanceMinutes: 60 })}>+1 hour</Button>
              <Button size="sm" variant="outline" onClick={() => void setClock({ advanceMinutes: 60 * 24 })}>+1 day</Button>
              <Button size="sm" variant="outline" onClick={() => void setClock({ advanceMinutes: 60 * 24 * 7 })}>+1 week</Button>
              <Button size="sm" variant="ghost" onClick={() => void setClock({ iso: '2026-09-27T09:00:00+03:00' })}>Reset to seed clock</Button>
            </div>
            <div className="mt-3 flex items-end gap-2">
              <Field label="Set (Asia/Riyadh)" className="flex-1"><Input type="datetime-local" value={clockInput} onChange={(e) => setClockInput(e.target.value)} /></Field>
              <Button size="md" onClick={() => void setClock({ iso: `${clockInput}:00+03:00` })}>{t('common.save')}</Button>
            </div>
            <p className="mt-2 text-xs text-muted">The clock is frozen so demos are deterministic; every module reads it (deadlines, "yesterday's absence", approvals expiry).</p>
          </Card>
          <DemoLocationCard />
          <Card>
            <SectionTitle>Status</SectionTitle>
            <ul className="space-y-1.5 text-sm">
              <li className="flex justify-between"><span>Demo mode</span>{status?.demoMode ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-danger" />}</li>
              <li className="flex justify-between"><span>AI intent adapter (ANTHROPIC_API_KEY)</span><Badge tone={status?.aiConfigured ? 'success' : 'neutral'}>{status?.aiConfigured ? 'configured' : 'deterministic rules'}</Badge></li>
              <li className="flex justify-between"><span>Google Maps tiles (GOOGLE_MAPS_API_KEY)</span><Badge tone={status?.googleMapsConfigured ? 'success' : 'neutral'}>{status?.googleMapsConfigured ? 'configured' : 'OpenStreetMap fallback'}</Badge></li>
              <li className="flex justify-between"><span>Seeded at</span><span className="num text-muted">{status?.seededAt ? fmtDateTime(status.seededAt, locale) : '—'}</span></li>
              <li className="flex justify-between"><span>Signed in as</span><span className="font-medium">{user ? l(user.name_en, user.name_ar) : '—'}</span></li>
            </ul>
          </Card>
          <Card className="lg:col-span-2">
            <SectionTitle><span className="flex items-center gap-2"><Users className="h-4 w-4" />{t('shell.switchPersona')}</span></SectionTitle>
            <p className="mb-3 text-xs text-muted">{t('shell.personaHint')}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {personas.map((p) => (
                <button key={p.id} onClick={() => void switchPersona(p.id).then(() => toast.success('Persona switched'))} className={`flex items-start gap-3 rounded-2xl border p-3 text-start transition hover:border-brand-400 ${user?.id === p.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-line bg-surface-2'}`}>
                  <Avatar name={p.name_en} color={p.avatar_color} />
                  <span className="min-w-0"><span className="block font-semibold">{l(p.name_en, p.name_ar)}</span><span className="block text-xs text-muted">{p.id} · {p.campus_id}</span><span className="mt-1 block"><RoleBadges roles={p.roles} /></span></span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'integrations' && (
        <div className="space-y-5">
          <Card>
            <SectionTitle>Adapters</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-start text-xs text-muted"><th className="py-2 pe-3 text-start">Adapter</th><th className="py-2 pe-3 text-start">Provider</th><th className="py-2 pe-3 text-start">Real?</th><th className="py-2 text-start">Note</th></tr></thead>
                <tbody>{status?.adapters.map((a) => <tr key={a.name} className="border-t border-line align-top"><td className="py-2 pe-3 font-medium">{a.name}</td><td className="py-2 pe-3 font-mono text-xs">{a.provider}</td><td className="py-2 pe-3">{a.real ? <Badge tone="success">real</Badge> : <Badge tone="gold">simulated</Badge>}</td><td className="py-2 text-muted">{a.note}</td></tr>)}</tbody>
              </table>
            </div>
          </Card>
          <Card>
            <SectionTitle>Real vs simulated by area</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-muted"><th className="py-2 pe-3 text-start">Area</th><th className="py-2 pe-3 text-start">Working locally</th><th className="py-2 pe-3 text-start">Simulated</th><th className="py-2 text-start">Future integration</th></tr></thead>
                <tbody>{INTEGRATIONS.map((r) => <tr key={r.area} className="border-t border-line align-top"><td className="py-2 pe-3 font-medium">{r.area}</td><td className="py-2 pe-3">{r.working}</td><td className="py-2 pe-3 text-muted">{r.simulated}</td><td className="py-2 text-muted">{r.future}</td></tr>)}</tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'policies' && (
        <Card>
          <SectionTitle>Configurable policies (with provenance)</SectionTitle>
          <div className="space-y-3">
            {policies.data && (Object.keys(policies.data) as Array<keyof Policies>).map((k) => {
              const p = policies.data![k];
              return (
                <div key={k} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_180px]">
                  <div><div className="font-medium">{l(p.label_en, p.label_ar)}</div><div className="text-xs text-muted">{p.provenance}</div></div>
                  <Input defaultValue={Array.isArray(p.value) ? p.value.join(',') : String(p.value)} onBlur={(e) => { const v = e.target.value; const cur = Array.isArray(p.value) ? p.value.join(',') : String(p.value); if (v !== cur) void savePolicy(k, v); }} aria-label={p.label_en} />
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {tab === 'attribution' && (
        <Card>
          <SectionTitle>Third-party attribution</SectionTitle>
          <ul className="list-disc space-y-1 ps-5 text-sm text-muted">{ATTRIBUTION.map((a) => <li key={a}>{a}</li>)}</ul>
        </Card>
      )}

      <ConfirmDialog open={resetOpen} onClose={() => setResetOpen(false)} onConfirm={reset} title={t('shell.reset')} body={t('shell.resetConfirm')} danger loading={busy} confirmLabel={t('shell.reset')} />
    </div>
  );
}

/**
 * Demo only: pretend the device is standing somewhere, so the map's "You are here" dot and "Start from my location"
 * can be shown to people who are not on campus. Stored in this browser only; real GPS is used when it is off.
 */
const DEMO_SPOTS: Array<{ id: string; label: string; location: string | null; offset?: [number, number] }> = [
  { id: 'off', label: 'Off – use the real device location', location: null },
  { id: 'gate1', label: 'Riyadh · just inside Gate 1', location: 'ryd_gate_main', offset: [-25, -30] },
  { id: 'parking', label: 'Riyadh · Student Parking 2', location: 'ryd_parking_students' },
  { id: 'library', label: 'Riyadh · outside the Library', location: 'ryd_library', offset: [18, 12] },
  { id: 'khobar', label: 'Khobar · main building', location: 'khb_main', offset: [20, 0] },
  { id: 'city', label: 'Off campus · central Riyadh (nothing should show)', location: null, offset: [0, 0] }
];

function DemoLocationCard() {
  const toast = useToast();
  const [spot, setSpot] = useState<string>(() => { const f = readDemoLocation(); return f ? f.spot ?? "gate1" : "off"; });
  const apply = async (id: string) => {
    setSpot(id);
    const s = DEMO_SPOTS.find((x) => x.id === id)!;
    if (id === 'off') { writeDemoLocation(null); toast.info('Using the real device location.'); return; }
    if (id === 'city') { writeDemoLocation({ lat: 24.7136, lng: 46.6753, accuracy: 15, heading: null, spot: id }); toast.info('Simulating a position in central Riyadh (off campus).'); return; }
    try {
      const loc = await api<{ lat: number; lng: number }>(`/campus/map/locations/${s.location}`);
      const [n, e] = s.offset ?? [0, 0];
      const lat = loc.lat + n / 111320, lng = loc.lng + e / (111320 * Math.cos((loc.lat * Math.PI) / 180));
      writeDemoLocation({ lat, lng, accuracy: 12, heading: 40, spot: id });
      toast.success(`Simulating the device at ${s.label}.`);
    } catch (err) { toast.error(errorMessage(err)); }
  };
  return (
    <Card>
      <SectionTitle>Device location (demo)</SectionTitle>
      <Field label="Pretend this device is at">
        <Select value={spot} onChange={(e) => void apply(e.target.value)}>{DEMO_SPOTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select>
      </Field>
      <p className="mt-2 text-xs text-muted">The campus map shows “You are here” and “Start from my location” only on campus. This setting is kept in this browser only; turn it off to use the real GPS position.</p>
    </Card>
  );
}
