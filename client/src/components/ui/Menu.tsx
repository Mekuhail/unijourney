import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Check } from 'lucide-react';
import clsx from 'clsx';

/**
 * Accessible dropdown menu (menu button pattern): Escape closes and returns focus, arrow keys move between items,
 * clicking outside closes. Items are real buttons or links so they work without JavaScript-only roles.
 */
const MenuCtx = createContext<{ close: () => void } | null>(null);

export function Menu({ label, button, buttonClassName, children, align = 'end', panelClassName }: { label: string; button: ReactNode; buttonClassName?: string; children: ReactNode; align?: 'start' | 'end'; panelClassName?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback((refocus = true) => { setOpen(false); if (refocus) btn.current?.focus(); }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    requestAnimationFrame(() => (panel.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? panel.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])'))?.focus());
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') { setOpen(false); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div ref={wrap} className="relative">
      <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} aria-label={label} title={label} onClick={() => setOpen((v) => !v)} onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } }} className={buttonClassName}>
        {button}
      </button>
      {open && (
        <div ref={panel} id={id} role="menu" aria-label={label} onKeyDown={onKey} className={clsx('absolute top-full z-[var(--z-dropdown)] mt-2 min-w-56 rounded-2xl border border-line bg-surface p-1.5 shadow-[var(--shadow-soft)]', align === 'end' ? 'end-0' : 'start-0', panelClassName)}>
          <MenuCtx.Provider value={{ close: () => close(true) }}>{children}</MenuCtx.Provider>
        </div>
      )}
    </div>
  );
}

const itemCls = 'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-start text-sm text-fg hover:bg-line/60 focus:bg-line/60 focus:outline-none';

export function MenuItem({ icon, children, onSelect, to, disabled, hint }: { icon?: ReactNode; children: ReactNode; onSelect?: () => void; to?: string; disabled?: boolean; hint?: ReactNode }) {
  const ctx = useContext(MenuCtx);
  const body = <>{icon && <span className="grid w-5 shrink-0 place-items-center text-muted">{icon}</span>}<span className="min-w-0 flex-1">{children}{hint && <span className="block text-xs text-muted">{hint}</span>}</span></>;
  if (to && !disabled) return <Link role="menuitem" tabIndex={-1} to={to} className={itemCls} onClick={() => ctx?.close()}>{body}</Link>;
  return (
    <button type="button" role="menuitem" tabIndex={-1} aria-disabled={disabled || undefined} className={clsx(itemCls, disabled && 'cursor-not-allowed opacity-60 hover:bg-transparent')} onClick={() => { if (disabled) return; ctx?.close(); onSelect?.(); }}>
      {body}
    </button>
  );
}

export function MenuRadio({ icon, children, checked, onSelect }: { icon?: ReactNode; children: ReactNode; checked: boolean; onSelect: () => void }) {
  const ctx = useContext(MenuCtx);
  return (
    <button type="button" role="menuitemradio" aria-checked={checked} tabIndex={-1} className={clsx(itemCls, checked && 'font-semibold')} onClick={() => { onSelect(); ctx?.close(); }}>
      {icon && <span className={clsx('grid w-5 shrink-0 place-items-center', checked ? 'text-brand-600' : 'text-muted')}>{icon}</span>}
      <span className="flex-1">{children}</span>
      {checked && <Check className="h-4 w-4 text-brand-600" aria-hidden />}
    </button>
  );
}

export function MenuGroup({ label, children }: { label?: ReactNode; children: ReactNode }) {
  return (
    <div role="group" aria-label={typeof label === 'string' ? label : undefined} className="py-0.5">
      {label && <div className="px-3 pb-1 pt-2 text-xs font-semibold text-muted">{label}</div>}
      {children}
    </div>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-line" />;
}
