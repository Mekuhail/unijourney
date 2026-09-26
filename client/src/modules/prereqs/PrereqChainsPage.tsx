import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { GitBranch, Lock, Printer, RotateCcw, Search, BookOpen, ExternalLink, ArrowRight, Sparkles, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '@/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { watchEdgeFade } from '@/components/ui/useEdgeFade';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Select, Skeleton, Toggle, SectionTitle, ButtonLink } from '@/components/ui';

interface ProgramInfo { id: string; code: string; name_en: string; name_ar: string; college_id: string; college_en: string; college_ar: string; degree: string; total_credits: number; duration_years: number; source_url: string; source_version: string; source_note: string; campus_ids: string[]; courses: number; mine: boolean }
interface Catalog { colleges: Array<{ id: string; name_en: string; name_ar: string; url: string; programs: ProgramInfo[] }>; mine: string | null }
interface ChainCourse { code: string; title_en: string; title_ar: string; credits: number; category: string; description_en: string; prereqs: string[][]; coreqs: string[][]; min_credits: number; year: number; sem: number; elective: { kind: string; label_en: string; label_ar: string; pool: string[] } | null; unlocks: string[]; depth: number; in_program: boolean }
interface ChainData { program: ProgramInfo; terms: Array<{ year: number; sem: number; label_en: string; label_ar: string; credits: number; slots: ChainCourse[] }>; pool: ChainCourse[]; edges: Array<{ from: string; to: string; alt: boolean; kind: 'prereq' | 'coreq' }>; stats: { courses: number; credits: number; edges: number; longestChain: number; gateways: Array<{ code: string; unlocks: number }> }; my: Record<string, { status: string; term?: string; grade?: string | null }> | null }

const CAT_TONE: Record<string, string> = { gen: 'border-line', hss_elective: 'border-line', core: 'border-brand-300', major: 'border-gold-500/60', major_elective: 'border-gold-500/40', elective: 'border-dashed border-line', orientation: 'border-line' };
const STATUS_DOT: Record<string, string> = { completed: 'bg-success', equivalent: 'bg-success', enrolled: 'bg-brand-500', planned: 'bg-info', available: 'bg-teal-500', blocked: 'bg-ink-400', failed: 'bg-danger', withdrawn: 'bg-warn' };

function ancestors(code: string, byCode: Map<string, ChainCourse>, acc = new Set<string>()): Set<string> {
  const n = byCode.get(code);
  if (!n) return acc;
  for (const p of n.prereqs.flat()) if (byCode.has(p) && !acc.has(p)) { acc.add(p); ancestors(p, byCode, acc); }
  return acc;
}
function descendants(code: string, byCode: Map<string, ChainCourse>, acc = new Set<string>()): Set<string> {
  const n = byCode.get(code);
  if (!n) return acc;
  for (const d of n.unlocks) if (byCode.has(d) && !acc.has(d)) { acc.add(d); descendants(d, byCode, acc); }
  return acc;
}

export function PrereqChainsPage() {
  const { t, locale, l } = useI18n();
  const { user } = useSession();
  const { reducedMotion } = useTheme();
  const nav = useNavigate();
  const { programId } = useParams();
  const catalog = useQuery(() => api<Catalog>('/academics/prereqs/catalog'), [user?.id], { refreshOn: ['persona'] });
  const pid = programId ?? catalog.data?.mine ?? catalog.data?.colleges.flatMap((c) => c.programs)[0]?.id ?? null;
  const chain = useQuery(() => api<ChainData>(`/academics/prereqs/${pid}`), [pid, user?.id], { enabled: !!pid, refreshOn: ['persona'] });
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [showMine, setShowMine] = useState(true);
  const [q, setQ] = useState('');
  useEffect(() => { setSelected(null); setHover(null); setQ(''); }, [pid]);

  const d = chain.data;
  const byCode = useMemo(() => new Map<string, ChainCourse>((d ? [...d.terms.flatMap((x) => x.slots), ...d.pool] : []).map((c) => [c.code, c])), [d]);
  const active = hover ?? selected;
  const up = useMemo(() => (active ? ancestors(active, byCode) : new Set<string>()), [active, byCode]);
  const down = useMemo(() => (active ? descendants(active, byCode) : new Set<string>()), [active, byCode]);
  const sel = selected ? byCode.get(selected) ?? null : null;
  const matches = useMemo(() => { const s = q.trim().toLowerCase(); if (!s || !d) return []; return [...byCode.values()].filter((c) => !c.code.startsWith('ELECTIVE:') && (c.code.toLowerCase().includes(s) || c.title_en.toLowerCase().includes(s) || c.title_ar.includes(q.trim()))).slice(0, 8); }, [q, byCode, d]);

  // ---- edge geometry -----------------------------------------------------
  const wrapRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const [paths, setPaths] = useState<Array<{ key: string; d: string; from: string; to: string; alt: boolean; kind: string }>>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const measure = useCallback(() => {
    const wrap = wrapRef.current; if (!wrap || !d) return;
    const wr = wrap.getBoundingClientRect();
    const rtl = locale === 'ar';
    const pos = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { x: r.left - wr.left + wrap.scrollLeft, y: r.top - wr.top + wrap.scrollTop, w: r.width, h: r.height }; };
    const next: typeof paths = [];
    for (const e of d.edges) {
      const a = nodeRefs.current.get(e.from), b = nodeRefs.current.get(e.to);
      if (!a || !b) continue;
      const pa = pos(a), pb = pos(b);
      const x1 = rtl ? pa.x : pa.x + pa.w, y1 = pa.y + pa.h / 2;
      const x2 = rtl ? pb.x + pb.w : pb.x, y2 = pb.y + pb.h / 2;
      const dx = Math.max(40, Math.abs(x2 - x1) / 2) * (rtl ? -1 : 1);
      next.push({ key: `${e.from}>${e.to}`, d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`, from: e.from, to: e.to, alt: e.alt, kind: e.kind });
    }
    setPaths(next);
    setSize({ w: wrap.scrollWidth, h: wrap.scrollHeight });
  }, [d, locale]);
  useLayoutEffect(() => { measure(); }, [measure, showMine]);
  useEffect(() => (wrapRef.current ? watchEdgeFade(wrapRef.current) : undefined), [d]);
  useEffect(() => { const ro = new ResizeObserver(() => measure()); if (wrapRef.current) ro.observe(wrapRef.current); window.addEventListener('resize', measure); return () => { ro.disconnect(); window.removeEventListener('resize', measure); }; }, [measure]);

  const edgeTone = (e: { from: string; to: string }) => {
    if (!active) return 'stroke-[var(--line)]';
    if (e.to === active || (up.has(e.to) && up.has(e.from)) || (e.to === active && up.has(e.from))) return 'stroke-gold-500';
    if (up.has(e.to) && (up.has(e.from) || e.from === active)) return 'stroke-gold-500';
    if (e.from === active || (down.has(e.from) && down.has(e.to))) return 'stroke-info';
    if (down.has(e.to) && (down.has(e.from) || e.from === active)) return 'stroke-info';
    return 'stroke-[var(--line)] opacity-30';
  };
  const isUpEdge = (e: { from: string; to: string }) => !!active && (e.to === active || up.has(e.to)) && (up.has(e.from));
  const isDownEdge = (e: { from: string; to: string }) => !!active && (e.from === active || down.has(e.from)) && down.has(e.to);

  const onKey = (ev: React.KeyboardEvent, code: string, termIdx: number, slotIdx: number) => {
    if (!d) return;
    const cols = [...d.terms.map((x) => x.slots), d.pool];
    let ti = termIdx, si = slotIdx;
    if (ev.key === 'ArrowDown') si++; else if (ev.key === 'ArrowUp') si--; else if (ev.key === 'ArrowRight') ti += locale === 'ar' ? -1 : 1; else if (ev.key === 'ArrowLeft') ti += locale === 'ar' ? 1 : -1; else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setSelected(code); return; } else return;
    ev.preventDefault();
    ti = Math.max(0, Math.min(cols.length - 1, ti)); si = Math.max(0, Math.min(cols[ti].length - 1, si));
    const target = cols[ti][si]; if (!target) return;
    nodeRefs.current.get(target.code)?.focus();
    setHover(target.code);
  };

  const programsFlat = catalog.data?.colleges.flatMap((c) => c.programs) ?? [];
  const program = programsFlat.find((p) => p.id === pid) ?? d?.program ?? null;
  const collegeId = program?.college_id ?? catalog.data?.colleges[0]?.id ?? '';
  const mineVisible = !!d?.my && showMine;

  const node = (c: ChainCourse, termIdx: number, slotIdx: number) => {
    const isSel = selected === c.code, isAct = active === c.code, inUp = up.has(c.code), inDown = down.has(c.code);
    const dim = !!active && !isAct && !inUp && !inDown;
    const st = mineVisible ? d!.my![c.code]?.status : undefined;
    const isElective = c.code.startsWith('ELECTIVE:');
    return (
      <button
        key={c.code}
        ref={(el) => { if (el) nodeRefs.current.set(c.code, el); else nodeRefs.current.delete(c.code); }}
        type="button"
        onMouseEnter={() => setHover(c.code)}
        onMouseLeave={() => setHover(null)}
        onFocus={() => setHover(c.code)}
        onBlur={() => setHover(null)}
        onClick={() => setSelected((s) => (s === c.code ? null : c.code))}
        onKeyDown={(ev) => onKey(ev, c.code, termIdx, slotIdx)}
        aria-pressed={isSel}
        title={`${c.code} · ${l(c.title_en, c.title_ar)}`}
        className={clsx('relative w-full rounded-xl border bg-surface px-2.5 py-2 text-start transition-all duration-200', CAT_TONE[c.category] ?? 'border-line',
          isAct && 'ring-2 ring-brand-500 border-brand-500 shadow-md',
          !isAct && inUp && 'ring-2 ring-gold-500 border-gold-500',
          !isAct && inDown && 'ring-2 ring-info border-info',
          dim && 'opacity-35',
          isElective && 'bg-surface-2 text-muted')}
      >
        <div className="flex items-center justify-between gap-1">
          <span className={clsx('font-mono text-xs font-bold', isElective ? 'text-muted' : 'text-brand-600')}>{isElective ? c.elective?.kind.toUpperCase() : c.code}</span>
          <span className="flex items-center gap-1">
            {c.min_credits > 0 && <Lock className="h-3 w-3 text-gold-700" aria-label={t('prereqs.minCredits', { n: c.min_credits })} />}
            {st && <span role="img" className={clsx('h-2 w-2 rounded-full', STATUS_DOT[st] ?? 'bg-muted')} aria-label={t(`prereqs.status.${st}`)} />}
            <span className="num text-xs text-muted">{c.credits}{t('prereqs.credits')}</span>
          </span>
        </div>
        <div className="mt-0.5 line-clamp-2 text-xs leading-snug">{l(c.title_en, c.title_ar)}</div>
        {c.unlocks.length > 0 && <span className="absolute -end-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-line px-1 text-xs font-bold text-muted" title={`${t('prereqs.unlocks')} ${c.unlocks.length}`}>{c.unlocks.length}</span>}
      </button>
    );
  };

  return (
    <div>
      <PageHeader title={t('prereqs.title')} subtitle={t('prereqs.subtitle')} actions={<div className="flex gap-2 no-print"><Button variant="outline" size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>{t('prereqs.print')}</Button>{selected && <Button variant="ghost" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setSelected(null)}>{t('prereqs.reset')}</Button>}</div>} />

      {/* Controls */}
      <div className="no-print mb-4 grid gap-3 md:grid-cols-[220px_260px_1fr_auto]">
        <Field label={t('prereqs.college')}>
          <Select value={collegeId} onChange={(e) => { const first = catalog.data?.colleges.find((c) => c.id === e.target.value)?.programs[0]; if (first) nav(`/prereqs/${first.id}`); }}>
            {catalog.data?.colleges.map((c) => <option key={c.id} value={c.id}>{l(c.name_en, c.name_ar)}</option>)}
          </Select>
        </Field>
        <Field label={t('prereqs.program')}>
          <Select value={pid ?? ''} onChange={(e) => nav(`/prereqs/${e.target.value}`)}>
            {catalog.data?.colleges.filter((c) => c.id === collegeId).flatMap((c) => c.programs).map((p) => <option key={p.id} value={p.id}>{l(p.name_en, p.name_ar)} ({p.code}){p.mine ? ` · ${t('prereqs.yours')}` : ''}</option>)}
          </Select>
        </Field>
        <Field label={t('prereqs.search')}>
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} className="ps-9" placeholder="SWE 302, Operating Systems…" />
            {matches.length > 0 && (
              <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                {matches.map((m) => <li key={m.code}><button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-line/60" onClick={() => { setSelected(m.code); setQ(''); nodeRefs.current.get(m.code)?.scrollIntoView({ block: 'center', inline: 'center', behavior: reducedMotion ? 'auto' : 'smooth' }); }}><span className="font-mono text-xs text-brand-600">{m.code}</span><span className="truncate">{l(m.title_en, m.title_ar)}</span></button></li>)}
              </ul>
            )}
          </div>
        </Field>
        {d?.my && <div className="flex items-end pb-1"><Toggle checked={showMine} onChange={setShowMine} label={t('prereqs.myStatus')} description={t('prereqs.myStatusHint')} /></div>}
      </div>

      {chain.error ? <ErrorState error={chain.error} onRetry={chain.refetch} /> : null}
      {!d && !chain.error && <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-[420px]" /></div>}

      {d && (
        <>
          {/* Stats */}
          <h2 className="sr-only">{t('prereqs.h.overview')}</h2>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[{ k: t('prereqs.credit_total'), v: d.stats.credits }, { k: t('prereqs.courses'), v: d.stats.courses }, { k: t('prereqs.longest'), v: d.stats.longestChain }, { k: t('prereqs.links'), v: d.stats.edges }].map((s) => (
              <div key={s.k} className="card-2 p-3"><div className="text-sm text-muted">{s.k}</div><div className="num text-2xl font-bold">{s.v}</div></div>
            ))}
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="flex items-center gap-1 font-semibold"><Sparkles className="h-4 w-4 text-gold-500" />{t('prereqs.gateways')}</span>
            {d.stats.gateways.map((g) => <button key={g.code} type="button" onClick={() => setSelected(g.code)} className={clsx('rounded-full border px-2.5 py-0.5 font-mono text-xs transition hover:border-brand-400', selected === g.code ? 'border-brand-500 bg-brand-500/10' : 'border-line')}>{g.code} <span className="font-sans text-muted">· {t('prereqs.unlocksN', { n: g.unlocks })}</span></button>)}
            <span className="text-xs text-muted">{t('prereqs.gatewaysHint')}</span>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
            {/* Diagram */}
            <section aria-labelledby="prereq-map-h" className="card relative min-w-0 p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
                <h2 id="prereq-map-h" className="text-sm font-semibold">{t('prereqs.h.map')}</h2>
                <p className="text-sm text-muted">{t('prereqs.hint')}</p>
              </div>
              <details className="group border-b border-line px-4 py-1 text-sm">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium text-fg [&::-webkit-details-marker]:hidden"><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />{t('prereqs.legend')}</summary>
                <div className="flex flex-wrap gap-x-5 gap-y-2 pb-3 text-muted">
                  <span className="flex items-center gap-1.5"><span aria-hidden className="h-3 w-3 rounded border-2 border-brand-500" />{t('prereqs.legendSelected')}</span>
                  <span className="flex items-center gap-1.5"><span aria-hidden className="h-3 w-3 rounded border-2 border-gold-500" />{t('prereqs.legendUp')}</span>
                  <span className="flex items-center gap-1.5"><span aria-hidden className="h-3 w-3 rounded border-2 border-info" />{t('prereqs.legendDown')}</span>
                  <span className="flex items-center gap-1.5"><svg aria-hidden width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="currentColor" strokeDasharray="6 4" /></svg>{t('prereqs.legendCoreq')}</span>
                  <span className="flex items-center gap-1.5"><svg aria-hidden width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="currentColor" strokeDasharray="2 3" /></svg>{t('prereqs.legendAlt')}</span>
                  {mineVisible && <><span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full bg-success" />{t('prereqs.status.completed')}</span><span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full bg-brand-500" />{t('prereqs.status.enrolled')}</span><span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full bg-teal-500" />{t('prereqs.status.available')}</span><span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full bg-ink-400" />{t('prereqs.status.blocked')}</span></>}
                </div>
              </details>
              <div ref={wrapRef} className="scroll-thin fade-x relative overflow-x-auto p-4" onScroll={measure}>
                <svg className="pointer-events-none absolute start-0 top-0" width={size.w} height={size.h} aria-hidden>
                  {paths.map((p) => (
                    <path key={p.key} d={p.d} fill="none" strokeWidth={isUpEdge(p) || isDownEdge(p) || p.from === active || p.to === active ? 2.2 : 1.2} className={clsx('transition-all duration-300', edgeTone(p))} strokeDasharray={p.kind === 'coreq' ? '6 4' : p.alt ? '2 3' : undefined} />
                  ))}
                </svg>
                <div className="relative flex items-start gap-4">
                  {d.terms.map((term, ti) => (
                    <div key={`${term.year}-${term.sem}`} className="w-[176px] shrink-0">
                      <div className="mb-2 rounded-lg bg-surface-2 px-2 py-1 text-center">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t('prereqs.year', { n: term.year })}</div>
                        <div className="text-xs font-semibold">{term.sem === 3 ? t('prereqs.summer') : t('prereqs.semester', { n: term.sem })} · <span className="num text-muted">{term.credits}{t('prereqs.credits')}</span></div>
                      </div>
                      <div className="space-y-2">{term.slots.map((c, si) => node(c, ti, si))}</div>
                    </div>
                  ))}
                  {d.pool.length > 0 && (
                    <div className="w-[176px] shrink-0">
                      <div className="mb-2 rounded-lg bg-gold-100/70 px-2 py-1 text-center dark:bg-gold-700/20"><div className="text-xs font-semibold uppercase tracking-wide text-gold-700">{t('prereqs.poolTitle')}</div><div className="text-xs text-muted">{d.pool.length}</div></div>
                      <div className="space-y-2">{d.pool.map((c, si) => node(c, d.terms.length, si))}</div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Detail panel */}
            <section aria-labelledby="prereq-detail-h" className="space-y-4">
              <h2 id="prereq-detail-h" className="sr-only">{t('prereqs.h.detail')}</h2>
              {sel ? (
                <Card className="lg:sticky lg:top-20">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-xs font-bold text-brand-600">{sel.code.startsWith('ELECTIVE:') ? t('prereqs.elective') : sel.code}</div>
                      <h3 className="text-lg font-semibold leading-tight">{l(sel.title_en, sel.title_ar)}</h3>
                    </div>
                    <Badge tone="neutral">{sel.credits} {t('prereqs.credits')}</Badge>
                  </div>
                  {sel.description_en && <p className="mt-2 text-sm text-muted">{sel.description_en}</p>}
                  {mineVisible && d.my?.[sel.code] && <div className="mt-2"><Badge tone={['completed', 'equivalent'].includes(d.my[sel.code].status) ? 'success' : d.my[sel.code].status === 'enrolled' ? 'brand' : d.my[sel.code].status === 'available' ? 'info' : 'neutral'}>{t(`status.${d.my[sel.code].status}`)}{d.my[sel.code].grade ? ` · ${d.my[sel.code].grade}` : ''}</Badge></div>}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="card-2 p-2"><div className="text-muted">{t('prereqs.chainDepth')}</div><div className="num text-lg font-bold">{sel.depth}</div></div>
                    <div className="card-2 p-2"><div className="text-muted">{t('prereqs.unlocks')}</div><div className="num text-lg font-bold">{sel.unlocks.length}</div></div>
                  </div>
                  {sel.min_credits > 0 && <div className="mt-2 flex items-center gap-1 text-xs text-gold-700"><Lock className="h-3.5 w-3.5" />{t('prereqs.minCredits', { n: sel.min_credits })}</div>}
                  <SectionTitle as="h4" className="mt-4">{t('prereqs.requires')}</SectionTitle>
                  {sel.prereqs.length === 0 ? <div className="text-sm text-muted">{t('prereqs.noPrereqs')}</div> : (
                    <ul className="space-y-1.5">{sel.prereqs.map((g, i) => <li key={i} className="flex flex-wrap items-center gap-1">{g.map((p, j) => <span key={p} className="flex items-center gap-1">{j > 0 && <span className="text-xs uppercase text-muted">or</span>}<button type="button" onClick={() => setSelected(p)} className="rounded-full border border-gold-500/60 bg-gold-100/60 px-2 py-0.5 font-mono text-xs hover:border-gold-700 dark:bg-gold-700/20">{p}</button></span>)}</li>)}</ul>
                  )}
                  {sel.coreqs.length > 0 && <div className="mt-2 text-xs text-muted">{t('prereqs.legendCoreq')}: {sel.coreqs.flat().join(', ')}</div>}
                  <SectionTitle as="h4" className="mt-4">{t('prereqs.unlocks')}</SectionTitle>
                  {sel.unlocks.length === 0 ? <div className="text-sm text-muted">{t('prereqs.unlocksNothing')}</div> : <div className="flex flex-wrap gap-1">{sel.unlocks.map((u) => <button key={u} type="button" onClick={() => setSelected(u)} className="rounded-full border border-info/50 bg-info/10 px-2 py-0.5 font-mono text-xs hover:border-info">{u}</button>)}</div>}
                  {sel.elective?.pool.length ? <><SectionTitle as="h4" className="mt-4">{t('prereqs.electivePool')}</SectionTitle><div className="flex flex-wrap gap-1">{sel.elective.pool.map((p) => <button key={p} type="button" onClick={() => byCode.has(p) && setSelected(p)} className="rounded-full border border-line px-2 py-0.5 font-mono text-xs hover:border-brand-400">{p}</button>)}</div></> : null}
                  {!sel.code.startsWith('ELECTIVE:') && (
                    <div className="no-print mt-4 flex flex-wrap gap-2">
                      {d.my && <ButtonLink to={`/academics/courses/${encodeURIComponent(sel.code)}`} size="sm" variant="outline" icon={<BookOpen className="h-4 w-4" />}>{t('prereqs.openCourse')}</ButtonLink>}
                      <ButtonLink to={`/campus/resources?course=${encodeURIComponent(sel.code)}`} size="sm" variant="ghost" icon={<ArrowRight className="h-4 w-4 rtl:rotate-180" />}>{t('prereqs.resources')}</ButtonLink>
                      {d.my && d.my[sel.code]?.status === 'available' && <ButtonLink to={`/academics/register?course=${encodeURIComponent(sel.code)}`} size="sm" variant="gold">{t('prereqs.planTerm')}</ButtonLink>}
                    </div>
                  )}
                </Card>
              ) : (
                <EmptyState icon={<GitBranch className="h-6 w-6" />} title={t('prereqs.hint')} body={program ? `${l(program.name_en, program.name_ar)} · ${program.degree}` : ''} />
              )}
              {program && (
                <Card className="text-xs text-muted">
                  <h3 className="mb-1 font-semibold text-fg">{t('prereqs.source')}</h3>
                  <div>{program.source_version}</div>
                  <div className="mt-1">{program.source_note}</div>
                  <a href={program.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm text-brand-600 hover:underline"><ExternalLink className="h-3.5 w-3.5" aria-hidden />yu.edu.sa</a>
                </Card>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
