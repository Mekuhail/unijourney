import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { GitBranch, Lock, Printer, RotateCcw, Search, BookOpen, ExternalLink, ArrowRight, Sparkles, ChevronDown, ZoomIn, ZoomOut, Maximize, Minimize } from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '@/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Select, Skeleton, Toggle, SectionTitle, ButtonLink, Tabs } from '@/components/ui';

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
  // Progressive disclosure: direct prerequisites and immediate unlocks first; the whole chain only on request.
  const [depth, setDepth] = useState<'direct' | 'full'>('direct');
  // The list is the compact alternative (default on phones, and the natural reading order for screen readers).
  const [view, setView] = useState<'map' | 'list'>(() => (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'list' : 'map'));
  const [params, setParams] = useSearchParams();
  useEffect(() => { setSelected(null); setHover(null); setQ(''); }, [pid]);

  const d = chain.data;
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false);
  const byCode = useMemo(() => new Map<string, ChainCourse>((d ? [...d.terms.flatMap((x) => x.slots), ...d.pool] : []).map((c) => [c.code, c])), [d]);
  // A pinned course keeps its chain lit; hovering only previews when nothing is pinned, so moving the pointer
  // across the map (or towards the detail panel) never makes the highlight flicker.
  const active = selected ?? hover;
  const full_ = depth === 'full' && !!selected && active === selected;
  const up = useMemo(() => {
    if (!active) return new Set<string>();
    if (full_) return ancestors(active, byCode);
    return new Set((byCode.get(active)?.prereqs.flat() ?? []).filter((p) => byCode.has(p)));
  }, [active, byCode, full_]);
  const down = useMemo(() => {
    if (!active) return new Set<string>();
    if (full_) return descendants(active, byCode);
    return new Set((byCode.get(active)?.unlocks ?? []).filter((p) => byCode.has(p)));
  }, [active, byCode, full_]);
  // Deep link: /prereqs?course=CIS%20104 selects the course once the programme has loaded.
  useEffect(() => { const c = params.get('course'); if (c && byCode.has(c)) { setSelected(c); setParams({}, { replace: true }); } }, [params, byCode, setParams]);
  const sel = selected ? byCode.get(selected) ?? null : null;
  const matches = useMemo(() => { const s = q.trim().toLowerCase(); if (!s || !d) return []; return [...byCode.values()].filter((c) => !c.code.startsWith('ELECTIVE:') && (c.code.toLowerCase().includes(s) || c.title_en.toLowerCase().includes(s) || c.title_ar.includes(q.trim()))).slice(0, 8); }, [q, byCode, d]);

  // ---- edge geometry (measured in unscaled content coordinates, so zoom never re-measures) -------------
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const [paths, setPaths] = useState<Array<{ key: string; d: string; from: string; to: string; alt: boolean; kind: string }>>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const rtl = locale === 'ar';
  const posOf = useCallback((el: HTMLElement) => {
    const content = contentRef.current;
    let x = 0, y = 0, n: HTMLElement | null = el;
    while (n && n !== content) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  }, []);
  const measure = useCallback(() => {
    const content = contentRef.current; if (!content || !d) return;
    const next: typeof paths = [];
    for (const e of d.edges) {
      const a = nodeRefs.current.get(e.from), b = nodeRefs.current.get(e.to);
      if (!a || !b) continue;
      const pa = posOf(a), pb = posOf(b);
      const x1 = rtl ? pa.x : pa.x + pa.w, y1 = pa.y + pa.h / 2;
      const x2 = rtl ? pb.x + pb.w : pb.x, y2 = pb.y + pb.h / 2;
      const dx = Math.max(40, Math.abs(x2 - x1) / 2) * (rtl ? -1 : 1);
      next.push({ key: `${e.from}>${e.to}`, d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`, from: e.from, to: e.to, alt: e.alt, kind: e.kind });
    }
    setPaths(next);
    setSize({ w: content.offsetWidth, h: content.offsetHeight });
  }, [d, rtl, posOf]);
  useLayoutEffect(() => { measure(); }, [measure, showMine]);
  useEffect(() => { void document.fonts?.ready.then(() => measure()); const ro = new ResizeObserver(() => measure()); if (contentRef.current) ro.observe(contentRef.current); return () => ro.disconnect(); }, [measure]);

  // ---- viewport: pan, zoom and centring ---------------------------------------------------------------
  const ZOOMS = [0.5, 0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5];
  const pendingCenter = useRef<{ x: number; y: number; smooth: boolean } | null>(null);
  /** Scrolls only the map (never the page) so content point (x, y) sits in the middle of the viewport. */
  const scrollToPoint = useCallback((x: number, y: number, smooth: boolean) => {
    const vp = viewportRef.current; if (!vp) return;
    const targetLeft = x * zoom - vp.clientWidth / 2;
    const left = rtl ? targetLeft - (vp.scrollWidth - vp.clientWidth) : targetLeft;
    const top = y * zoom - vp.clientHeight / 2;
    // Wait for the highlight re-render to settle; a smooth scroll started mid-commit gets cancelled by the browser.
    window.setTimeout(() => vp.scrollTo({ left, top, behavior: smooth && !reducedMotion && document.visibilityState === 'visible' ? 'smooth' : 'auto' }), 30);
  }, [zoom, rtl, reducedMotion]);
  const centerOn = useCallback((code: string, smooth = true) => {
    const el = nodeRefs.current.get(code); if (!el) return;
    const p = posOf(el);
    scrollToPoint(p.x + p.w / 2, p.y + p.h / 2, smooth);
  }, [posOf, scrollToPoint]);
  const viewportCenter = () => {
    const vp = viewportRef.current; if (!vp) return { x: 0, y: 0 };
    const visLeft = rtl ? vp.scrollWidth - vp.clientWidth + vp.scrollLeft : vp.scrollLeft;
    return { x: (visLeft + vp.clientWidth / 2) / zoom, y: (vp.scrollTop + vp.clientHeight / 2) / zoom };
  };
  const setZoomKeepCenter = (z: number) => {
    const next = Math.min(1.5, Math.max(0.5, Math.round(z * 100) / 100));
    if (next === zoom) return;
    pendingCenter.current = { ...viewportCenter(), smooth: false };
    setZoom(next);
  };
  const stepZoom = (dir: 1 | -1) => setZoomKeepCenter(dir > 0 ? ZOOMS.find((z) => z > zoom + 0.001) ?? 1.5 : [...ZOOMS].reverse().find((z) => z < zoom - 0.001) ?? 0.5);
  const fitWidth = () => { const vp = viewportRef.current; if (!vp || !size.w) return; pendingCenter.current = null; setZoom(Math.min(1, Math.max(0.5, Math.floor(((vp.clientWidth - 8) / size.w) * 100) / 100))); };
  useLayoutEffect(() => {
    const c = pendingCenter.current; pendingCenter.current = null;
    if (c) scrollToPoint(c.x, c.y, c.smooth);
    else if (selected) centerOn(selected, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, full]);
  // Selecting a course (map, search, gateways, the detail panel) glides it to the centre of the map.
  useEffect(() => { if (selected) centerOn(selected); }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl/⌘ + wheel zooms; dragging the background pans.
  useEffect(() => {
    const vp = viewportRef.current; if (!vp) return;
    const onWheel = (e: WheelEvent) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); stepZoom(e.deltaY < 0 ? 1 : -1); };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  });
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.pointerType === 'touch' || (e.target as HTMLElement).closest('button')) return;
    const vp = viewportRef.current!; drag.current = { x: e.clientX, y: e.clientY, left: vp.scrollLeft, top: vp.scrollTop, moved: false };
    vp.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = drag.current; if (!g) return;
    const vp = viewportRef.current!;
    if (Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) > 3) g.moved = true;
    vp.scrollLeft = g.left - (e.clientX - g.x); vp.scrollTop = g.top - (e.clientY - g.y);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => { drag.current = null; viewportRef.current?.releasePointerCapture?.(e.pointerId); };

  // Full screen: an overlay (works on phones too); Escape closes it and the page behind does not scroll.
  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [full]);

  // Hover intent: a short delay so sweeping across the map does not flash every chain on the way.
  const hoverTimer = useRef<number | null>(null);
  const hoverIn = (code: string) => { if (hoverTimer.current) window.clearTimeout(hoverTimer.current); hoverTimer.current = window.setTimeout(() => setHover(code), 90); };
  const hoverOut = () => { if (hoverTimer.current) window.clearTimeout(hoverTimer.current); hoverTimer.current = window.setTimeout(() => setHover(null), 60); };
  useEffect(() => () => { if (hoverTimer.current) window.clearTimeout(hoverTimer.current); }, []);

  // Nothing is drawn until a course is chosen, so the overview stays readable. Then only its own links appear.
  const edgeRole = (e: { from: string; to: string }): 'up' | 'down' | null => {
    if (!active) return null;
    if (full_) {
      if (up.has(e.from) && (up.has(e.to) || e.to === active)) return 'up';
      if (down.has(e.to) && (down.has(e.from) || e.from === active)) return 'down';
      return null;
    }
    if (e.to === active && up.has(e.from)) return 'up';
    if (e.from === active && down.has(e.to)) return 'down';
    return null;
  };

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
        onMouseEnter={() => hoverIn(c.code)}
        onMouseLeave={hoverOut}
        onFocus={() => setHover(c.code)}
        onBlur={() => setHover(null)}
        onClick={() => { if (drag.current?.moved) return; setSelected((s) => (s === c.code ? null : c.code)); }}
        onKeyDown={(ev) => onKey(ev, c.code, termIdx, slotIdx)}
        aria-pressed={isSel}
        title={`${c.code} · ${l(c.title_en, c.title_ar)}`}
        className={clsx('relative w-full rounded-xl border bg-surface px-2.5 py-2 text-start transition-[border-color,box-shadow,opacity] duration-150', CAT_TONE[c.category] ?? 'border-line',
          hover === c.code && !isAct && 'border-brand-400',
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
        {!isAct && (inUp || inDown) && <div className={clsx('mt-1 text-xs font-semibold', inUp ? 'text-gold-700' : 'text-info')}>{t(inUp ? 'prereqs.tag.before' : 'prereqs.tag.after')}</div>}
        {c.unlocks.length > 0 && <span className="absolute -end-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-line px-1 text-xs font-bold text-muted" title={`${t('prereqs.unlocks')} ${c.unlocks.length}`}>{c.unlocks.length}</span>}
      </button>
    );
  };

  const detail = (sel: ChainCourse) => (
    <>

                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-xs font-bold text-brand-600">{sel.code.startsWith('ELECTIVE:') ? t('prereqs.elective') : sel.code}</div>
                      <h3 className="text-lg font-semibold leading-tight">{l(sel.title_en, sel.title_ar)}</h3>
                    </div>
                    <Badge tone="neutral">{sel.credits} {t('prereqs.credits')}</Badge>
                  </div>
                  {sel.description_en && <p className="mt-2 text-sm text-muted">{sel.description_en}</p>}
                  {mineVisible && d?.my?.[sel.code] && <div className="mt-2"><Badge tone={['completed', 'equivalent'].includes(d!.my![sel.code].status) ? 'success' : d!.my![sel.code].status === 'enrolled' ? 'brand' : d!.my![sel.code].status === 'available' ? 'info' : 'neutral'}>{t(`status.${d!.my![sel.code].status}`)}{d!.my![sel.code].grade ? ` · ${d!.my![sel.code].grade}` : ''}</Badge></div>}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="card-2 p-2"><div className="text-muted">{t('prereqs.chainDepth')}</div><div className="num text-lg font-bold">{sel.depth}</div></div>
                    <div className="card-2 p-2"><div className="text-muted">{t('prereqs.unlocks')}</div><div className="num text-lg font-bold">{sel.unlocks.length}</div></div>
                  </div>
                  {sel.min_credits > 0 && <div className="mt-2 flex items-center gap-1 text-xs text-gold-700"><Lock className="h-3.5 w-3.5" />{t('prereqs.minCredits', { n: sel.min_credits })}</div>}
                  <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label={t('prereqs.depth')}>
                    {(['direct', 'full'] as const).map((k) => (
                      <button key={k} type="button" aria-pressed={depth === k} onClick={() => setDepth(k)} className={clsx('min-h-9 rounded-lg px-3 text-sm font-medium touch:min-h-11', depth === k ? 'bg-surface-2 text-fg ring-1 ring-line' : 'text-muted hover:text-fg')}>
                        {k === 'direct' ? t('prereqs.depth.direct') : t('prereqs.depth.full', { up: ancestors(sel.code, byCode).size, down: descendants(sel.code, byCode).size })}
                      </button>
                    ))}
                  </div>
                  <SectionTitle as="h4" className="mt-4">{sel.prereqs.length > 1 ? t('prereqs.requiresAll') : t('prereqs.requires')}</SectionTitle>
                  {sel.prereqs.length === 0 ? <div className="text-sm text-muted">{t('prereqs.noPrereqs')}</div> : (
                    <ul className="space-y-1.5 text-sm">{sel.prereqs.map((g, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-1">
                        {g.length > 1 && <span className="text-muted">{t('prereqs.oneOf')}</span>}
                        {g.map((p, j) => <span key={p} className="flex items-center gap-1">{j > 0 && <span className="text-xs font-semibold uppercase text-muted">{t('prereqs.or')}</span>}<button type="button" onClick={() => setSelected(p)} className="rounded-full border border-gold-500/60 bg-gold-100/60 px-2 py-0.5 font-mono text-xs hover:border-gold-700 dark:bg-gold-700/20">{p}</button></span>)}
                      </li>
                    ))}</ul>
                  )}
                  {sel.coreqs.length > 0 && <div className="mt-2 text-xs text-muted">{t('prereqs.legendCoreq')}: {sel.coreqs.flat().join(', ')}</div>}
                  <SectionTitle as="h4" className="mt-4">{t('prereqs.opensUp')}</SectionTitle>
                  {sel.unlocks.length === 0 ? <div className="text-sm text-muted">{t('prereqs.unlocksNothing')}</div> : <div className="flex flex-wrap gap-1">{sel.unlocks.map((u) => <button key={u} type="button" onClick={() => setSelected(u)} className="rounded-full border border-info/50 bg-info/10 px-2 py-0.5 font-mono text-xs hover:border-info">{u}</button>)}</div>}
                  {sel.elective?.pool.length ? <><SectionTitle as="h4" className="mt-4">{t('prereqs.electivePool')}</SectionTitle><div className="flex flex-wrap gap-1">{sel.elective.pool.map((p) => <button key={p} type="button" onClick={() => byCode.has(p) && setSelected(p)} className="rounded-full border border-line px-2 py-0.5 font-mono text-xs hover:border-brand-400">{p}</button>)}</div></> : null}
                  {!sel.code.startsWith('ELECTIVE:') && (
                    <div className="no-print mt-4 flex flex-wrap gap-2">
                      {d?.my && <ButtonLink to={`/academics/courses/${encodeURIComponent(sel.code)}`} size="sm" variant="outline" icon={<BookOpen className="h-4 w-4" />}>{t('prereqs.openCourse')}</ButtonLink>}
                      <ButtonLink to={`/campus/resources?course=${encodeURIComponent(sel.code)}`} size="sm" variant="ghost" icon={<ArrowRight className="h-4 w-4 rtl:rotate-180" />}>{t('prereqs.resources')}</ButtonLink>
                      {d?.my && d.my[sel.code]?.status === 'available' && <ButtonLink to={`/academics/register?course=${encodeURIComponent(sel.code)}`} size="sm" variant="gold">{t('prereqs.planTerm')}</ButtonLink>}
                    </div>
                  )}
    </>
  );

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
              <ul className="absolute z-[var(--z-dropdown)] mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                {matches.map((m) => <li key={m.code}><button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-line/60" onClick={() => { setSelected(m.code); setQ(''); }}><span className="font-mono text-xs text-brand-600">{m.code}</span><span className="truncate">{l(m.title_en, m.title_ar)}</span></button></li>)}
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
          <p className="num mb-3 text-sm text-muted">{t('prereqs.statsLine', { credits: d.stats.credits, courses: d.stats.courses, longest: d.stats.longestChain })}</p>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="flex items-center gap-1 font-semibold"><Sparkles className="h-4 w-4 text-gold-500" />{t('prereqs.gateways')}</span>
            {d.stats.gateways.map((g) => <button key={g.code} type="button" onClick={() => setSelected(g.code)} className={clsx('rounded-full border px-2.5 py-0.5 font-mono text-xs transition hover:border-brand-400', selected === g.code ? 'border-brand-500 bg-brand-500/10' : 'border-line')}>{g.code} <span className="font-sans text-muted">· {t('prereqs.unlocksN', { n: g.unlocks })}</span></button>)}
            <span className="text-xs text-muted">{t('prereqs.gatewaysHint')}</span>
          </div>

          <Tabs value={view} onChange={(v) => { setView(v); setFull(false); }} label={t('prereqs.view')} className="no-print mb-3 w-fit" items={[{ value: 'map', label: t('prereqs.view.map') }, { value: 'list', label: t('prereqs.view.list') }]} />
          {view === 'list' && (
            <section aria-labelledby="prereq-list-h" className="space-y-6">
              <h2 id="prereq-list-h" className="sr-only">{t('prereqs.view.list')}</h2>
              {[...d.terms.map((term) => ({ key: `${term.year}-${term.sem}`, title: `${t('prereqs.year', { n: term.year })} · ${term.sem === 3 ? t('prereqs.summer') : t('prereqs.semester', { n: term.sem })}`, courses: term.slots })), ...(d.pool.length ? [{ key: 'pool', title: t('prereqs.poolTitle'), courses: d.pool }] : [])].map((grp) => (
                <div key={grp.key}>
                  <h3 className="mb-2 text-sm font-semibold text-muted">{grp.title}</h3>
                  <ul className="divide-y divide-line rounded-2xl border border-line">
                    {grp.courses.map((c) => {
                      const st = mineVisible ? d.my![c.code]?.status : undefined;
                      const open = selected === c.code;
                      const isElective = c.code.startsWith('ELECTIVE:');
                      return (
                        <li key={c.code}>
                          <button type="button" aria-expanded={open} onClick={() => setSelected(open ? null : c.code)} className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-start">
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm"><span className="font-mono text-xs font-bold text-brand-600">{isElective ? t('prereqs.elective') : c.code}</span> <span dir="auto">{l(c.title_en, c.title_ar)}</span></span>
                              <span className="block text-xs text-muted">{c.prereqs.length ? t('prereqs.needsCount', { n: c.prereqs.length }) : t('prereqs.noPrereqsShort')}{c.unlocks.length ? ` · ${t('prereqs.unlocksN', { n: c.unlocks.length })}` : ''}{st ? ` · ${t(`prereqs.status.${st}`)}` : ''}</span>
                            </span>
                            <ChevronDown className={clsx('h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
                          </button>
                          {open && <div className="border-t border-line px-3 pb-4 pt-3">{detail(c)}</div>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </section>
          )}
          {view === 'map' && (
          <div className={clsx(full ? 'fixed inset-0 z-[var(--z-modal)] flex flex-col gap-2 bg-bg p-2 sm:p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[minmax(0,1fr)] lg:gap-4' : 'grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]')} role={full ? 'dialog' : undefined} aria-modal={full || undefined} aria-labelledby={full ? 'prereq-map-h' : undefined}>
            {/* Diagram */}
            <section aria-labelledby="prereq-map-h" className={clsx('card relative flex min-w-0 flex-col p-0', full && 'min-h-0 flex-1 lg:h-full')}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
                <div className="min-w-0">
                  <h2 id="prereq-map-h" className="text-sm font-semibold">{t('prereqs.h.map')}{full && program ? ` · ${l(program.name_en, program.name_ar)}` : ''}</h2>
                  <p className="text-xs text-muted">{t('prereqs.hint2')}</p>
                </div>
                <div className="no-print flex items-center gap-1" role="toolbar" aria-label={t('prereqs.view')}>
                  <Button size="icon" variant="ghost" aria-label={t('prereqs.zoomOut')} title={t('prereqs.zoomOut')} disabled={zoom <= 0.5} onClick={() => stepZoom(-1)}><ZoomOut className="h-4 w-4" aria-hidden /></Button>
                  <button type="button" onClick={() => setZoomKeepCenter(1)} className="num min-h-11 min-w-14 rounded-lg px-2 text-sm font-medium text-muted hover:bg-line/50 hover:text-fg sm:min-h-9" title={t('prereqs.zoomReset')} aria-label={`${t('prereqs.zoomReset')} (${Math.round(zoom * 100)}%)`}>{Math.round(zoom * 100)}%</button>
                  <Button size="icon" variant="ghost" aria-label={t('prereqs.zoomIn')} title={t('prereqs.zoomIn')} disabled={zoom >= 1.5} onClick={() => stepZoom(1)}><ZoomIn className="h-4 w-4" aria-hidden /></Button>
                  <Button size="sm" variant="ghost" onClick={fitWidth}>{t('prereqs.fitShort')}</Button>
                  <Button size="icon" variant={full ? 'secondary' : 'ghost'} aria-label={t(full ? 'prereqs.exitFull' : 'prereqs.full')} title={t(full ? 'prereqs.exitFull' : 'prereqs.full')} onClick={() => setFull((f) => !f)}>{full ? <Minimize className="h-4 w-4" aria-hidden /> : <Maximize className="h-4 w-4" aria-hidden />}</Button>
                </div>
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
              <div ref={viewportRef} tabIndex={0} aria-label={t('prereqs.h.map')}
                onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === '+' || e.key === '=') { e.preventDefault(); stepZoom(1); } else if (e.key === '-') { e.preventDefault(); stepZoom(-1); } else if (e.key === '0') { e.preventDefault(); setZoomKeepCenter(1); } }}
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
                className={clsx('scroll-thin relative overflow-auto overscroll-contain bg-surface-2/40 focus-visible:outline-none', full ? 'min-h-0 flex-1' : 'max-h-[min(78dvh,760px)]', 'cursor-grab active:cursor-grabbing')}>
                <div className="relative" style={{ width: size.w * zoom || undefined, height: size.h * zoom || undefined }}>
                  <div ref={contentRef} className="absolute top-0 start-0 inline-flex items-start gap-4 p-4" style={{ transform: `scale(${zoom})`, transformOrigin: rtl ? 'top right' : 'top left' }}>
                    <svg className="pointer-events-none absolute start-0 top-0" width={size.w} height={size.h} aria-hidden>
                      <defs>
                        <marker id="arrow-up" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="fill-gold-500" /></marker>
                        <marker id="arrow-down" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="fill-info" /></marker>
                      </defs>
                      {paths.map((p) => {
                        const role = edgeRole(p);
                        if (!role) return null;
                        return <path key={p.key} d={p.d} fill="none" strokeWidth={2.2} markerEnd={`url(#arrow-${role})`} className={role === 'up' ? 'stroke-gold-500' : 'stroke-info'} strokeDasharray={p.kind === 'coreq' ? '6 4' : p.alt ? '2 3' : undefined} />;
                      })}
                    </svg>
                    {d.terms.map((term, ti) => (
                      <div key={`${term.year}-${term.sem}`} className="relative w-[176px] shrink-0">
                        <div className="mb-2 rounded-lg bg-surface-2 px-2 py-1 text-center">
                          <div className="text-xs font-semibold text-muted">{t('prereqs.year', { n: term.year })}</div>
                          <div className="text-xs font-semibold">{term.sem === 3 ? t('prereqs.summer') : t('prereqs.semester', { n: term.sem })} · <span className="num text-muted">{term.credits}{t('prereqs.credits')}</span></div>
                        </div>
                        <div className="space-y-2">{term.slots.map((c, si) => node(c, ti, si))}</div>
                      </div>
                    ))}
                    {d.pool.length > 0 && (
                      <div className="relative w-[176px] shrink-0">
                        <div className="mb-2 rounded-lg bg-gold-100/70 px-2 py-1 text-center dark:bg-gold-700/20"><div className="text-xs font-semibold text-gold-700">{t('prereqs.poolTitle')}</div><div className="text-xs text-fg">{d.pool.length}</div></div>
                        <div className="space-y-2">{d.pool.map((c, si) => node(c, d.terms.length, si))}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Detail panel: a fixed-width column, so choosing another course never shifts the map */}
            <section aria-labelledby="prereq-detail-h" className={clsx('min-w-0 space-y-4', full && 'max-h-[38dvh] shrink-0 overflow-y-auto lg:h-full lg:max-h-none')}>
              <h2 id="prereq-detail-h" className="sr-only">{t('prereqs.h.detail')}</h2>
              {sel ? (
                <Card className={clsx(!full && 'lg:sticky lg:top-20')}>{detail(sel)}</Card>
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
          )}
        </>
      )}
    </div>
  );
}
