import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { CalendarDays, Clock, LocateFixed, Search, Star, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { MapLocation } from '../types';
import { categoryOf, placeName } from './style';

/**
 * A searchable, grouped place picker for the From/To fields: shortcuts (my location, my next class), recent picks,
 * popular places, then every place on this campus grouped building → floor → room (other places by kind).
 * ARIA combobox + listbox, full names that wrap, and a clear "nothing found" state.
 */
interface Option { key: string; value: string; label: string; detail?: string; icon?: 'me' | 'class' | 'recent' | 'popular' }
interface Group { id: string; label: string; options: Option[] }

const RECENT_KEY = (campus: string) => `uj.map.recent.${campus}`;
export function rememberPlace(campus: string, id: string) {
  if (!id || id.startsWith('@')) return;
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY(campus)) ?? '[]') as string[];
    localStorage.setItem(RECENT_KEY(campus), JSON.stringify([id, ...list.filter((x) => x !== id)].slice(0, 4)));
  } catch { /* storage unavailable */ }
}
function recentPlaces(campus: string): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY(campus)) ?? '[]') as string[]; } catch { return []; }
}

export function PlacePicker({ id, label, placeholder, value, campusId, locations, popular, meAvailable, onNextClass, onChange }: {
  id: string; label: string; placeholder: string; value: string | null; campusId: string; locations: MapLocation[]; popular: MapLocation[];
  meAvailable?: boolean; onNextClass?: () => void; onChange: (value: string | null) => void;
}) {
  const { t, l } = useI18n();
  const ln = (en: string, ar?: string | null) => placeName(l(en, ar));
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(locations.map((x) => [x.id, x])), [locations]);
  const labelOf = (x: MapLocation) => ln(x.name_en, x.name_ar);
  const detailOf = (x: MapLocation) => (x.building_id ? [ln(x.building_name_en ?? '', x.building_name_ar), x.floor ? t('map.picker.floor', { n: x.floor }) : null].filter(Boolean).join(' · ') : t(`map.cat.${categoryOf(x)}`));
  const current = value === '@me' ? t('map.me.option') : value ? (byId.get(value) ? `${labelOf(byId.get(value)!)}${byId.get(value)!.building_id ? ` · ${ln(byId.get(value)!.building_name_en ?? '', byId.get(value)!.building_name_ar)}` : ''}` : '') : '';

  const groups = useMemo<Group[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (x: MapLocation) => !q || [x.name_en, x.name_ar, x.building_name_en ?? '', x.building_name_ar ?? '', x.kind, ...x.tags].join(' ').toLowerCase().includes(q);
    const opt = (x: MapLocation, icon?: Option['icon'], keyPrefix = ''): Option => ({ key: `${keyPrefix}${x.id}`, value: x.id, label: labelOf(x), detail: detailOf(x), icon });
    const out: Group[] = [];
    if (!q) {
      const shortcuts: Option[] = [];
      if (meAvailable) shortcuts.push({ key: '@me', value: '@me', label: t('map.me.option'), icon: 'me' });
      if (onNextClass) shortcuts.push({ key: '@next', value: '@next', label: t('campus.map.nextClass'), icon: 'class' });
      if (shortcuts.length) out.push({ id: 'shortcuts', label: t('map.picker.shortcuts'), options: shortcuts });
      const recent = recentPlaces(campusId).map((rid) => byId.get(rid)).filter((x): x is MapLocation => !!x);
      if (recent.length) out.push({ id: 'recent', label: t('map.picker.recent'), options: recent.map((x) => opt(x, 'recent', 'r:')) });
      if (popular.length) out.push({ id: 'popular', label: t('map.popular'), options: popular.map((x) => opt(x, 'popular', 'p:')) });
    }
    // Buildings with their rooms (floor, then name), then everything else by kind.
    const pickable = locations.filter((x) => !['junction', 'entrance'].includes(x.kind) && match(x));
    const buildings = new Map<string, MapLocation[]>();
    const loose: MapLocation[] = [];
    for (const x of pickable) {
      if (x.building_id) buildings.set(x.building_id, [...(buildings.get(x.building_id) ?? []), x]);
      else if (x.kind === 'building' || locations.some((r) => r.building_id === x.id)) buildings.set(x.id, [...(buildings.get(x.id) ?? []), x]);
      else loose.push(x);
    }
    const bGroups = [...buildings.entries()].map(([bid, xs]) => {
      const b = byId.get(bid);
      const title = b ? labelOf(b) : ln(xs[0].building_name_en ?? '', xs[0].building_name_ar);
      const sorted = xs.sort((a, c) => Number(a.id !== bid) - Number(c.id !== bid) || a.floor - c.floor || labelOf(a).localeCompare(labelOf(c)));
      return { id: `b:${bid}`, label: title, options: sorted.map((x) => ({ ...opt(x), detail: x.id === bid ? t('map.picker.wholeBuilding') : x.floor ? t('map.picker.floor', { n: x.floor }) : t('map.picker.groundFloor') })) };
    }).sort((a, b) => a.label.localeCompare(b.label));
    out.push(...bGroups);
    const cats = new Map<string, MapLocation[]>();
    for (const x of loose) cats.set(categoryOf(x), [...(cats.get(categoryOf(x)) ?? []), x]);
    for (const [cat, xs] of [...cats.entries()].sort()) out.push({ id: `c:${cat}`, label: t(`map.cat.${cat}`), options: xs.sort((a, b) => labelOf(a).localeCompare(labelOf(b))).map((x) => opt(x)) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, locations, popular, meAvailable, onNextClass, campusId, byId, l, t]);
  const flat = useMemo(() => groups.flatMap((g) => g.options), [groups]);
  useEffect(() => { setActive(0); }, [query, open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  useEffect(() => { if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, open, listId]);

  const choose = (o: Option) => {
    setOpen(false); setQuery('');
    if (o.value === '@next') { onNextClass?.(); return; }
    rememberPlace(campusId, o.value);
    onChange(o.value);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && open && flat[active]) { e.preventDefault(); choose(flat[active]); }
    else if (e.key === 'Escape') { if (open) { e.preventDefault(); setOpen(false); setQuery(''); } }
  };
  let idx = -1;
  return (
    <div ref={wrapRef} className="relative min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-muted">{label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-muted" aria-hidden />
        <input
          ref={inputRef} id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={open && flat[active] ? `${listId}-${active}` : undefined}
          value={open ? query : current} placeholder={placeholder} autoComplete="off" dir="auto"
          onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onKeyDown={onKey}
          title={current || undefined}
          className="w-full min-h-11 rounded-xl border border-line bg-surface py-2 pe-9 ps-9 text-sm text-fg placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
        />
        {value && !open && <button type="button" onClick={() => { onChange(null); inputRef.current?.focus(); }} aria-label={t('map.picker.clear', { field: label })} className="absolute end-1 top-1 grid h-9 w-9 place-items-center rounded-lg text-muted hover:text-fg"><X className="h-4 w-4" /></button>}
      </div>
      {open && (
        <div id={listId} role="listbox" aria-label={label} className="absolute inset-x-0 z-[var(--z-dropdown)] mt-1 max-h-80 overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface p-1 shadow-lg">
          {flat.length === 0 && <p className="px-3 py-3 text-sm text-muted">{t('map.picker.none', { q: query.trim() })}</p>}
          {groups.filter((g) => g.options.length).map((g) => (
            <div key={g.id} role="group" aria-labelledby={`${listId}-${g.id}`}>
              <div id={`${listId}-${g.id}`} role="presentation" className="px-3 pb-1 pt-2 text-xs font-semibold text-muted" dir="auto">{g.label}</div>
              {g.options.map((o) => {
                idx += 1;
                const i = idx;
                const Icon = o.icon === 'me' ? LocateFixed : o.icon === 'class' ? CalendarDays : o.icon === 'recent' ? Clock : o.icon === 'popular' ? Star : null;
                return (
                  <div key={o.key} id={`${listId}-${i}`} role="option" aria-selected={o.value === value}
                    onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)} onMouseEnter={() => setActive(i)}
                    className={clsx('flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-sm', i === active && 'bg-line/60', o.value === value && 'font-semibold')}>
                    {Icon && <Icon className={clsx('mt-0.5 h-4 w-4 shrink-0', o.icon === 'me' ? 'text-[#1a73e8]' : 'text-muted')} aria-hidden />}
                    <span className="min-w-0 flex-1">
                      <span className="block break-words" dir="auto">{o.label}</span>
                      {o.detail && <span className="block text-xs text-muted" dir="auto">{o.detail}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
