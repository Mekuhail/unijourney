import { forwardRef, useEffect, type ComponentProps, type KeyboardEvent as ReactKeyboardEvent, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { Loader2, X, Inbox, AlertTriangle, CheckCircle2, Info, ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { useI18n, statusKey } from '@/i18n';
import { useEdgeFade } from './useEdgeFade';

// ------------------------------------------------------------------ Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'gold' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'icon';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}
const variantCls: Record<Variant, string> = {
  primary: 'bg-brand-500 text-ink-950 hover:bg-brand-400 shadow-sm',
  secondary: 'bg-surface-2 text-fg border border-line hover:bg-line/60',
  ghost: 'bg-transparent text-fg hover:bg-line/60',
  outline: 'bg-transparent text-fg border border-line hover:border-brand-400 hover:text-brand-600',
  danger: 'bg-danger text-on-strong hover:brightness-110',
  success: 'bg-success text-on-strong hover:brightness-110',
  gold: 'bg-gold-500 text-ink-950 hover:bg-gold-300'
};
const sizeCls: Record<Size, string> = { sm: 'h-8 touch:h-11 px-3 text-xs touch:text-sm gap-1.5', md: 'h-10 touch:h-11 px-4 text-sm gap-2', lg: 'h-12 px-6 text-base gap-2', icon: 'h-10 w-10 shrink-0 touch:h-11 touch:w-11 p-0' };

const baseBtn = 'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap';

/** A router link that looks like a Button (never nest a <button> inside an <a>). */
export function ButtonLink({ to, variant = 'primary', size = 'md', icon, className, children, ...rest }: { to: string; variant?: Variant; size?: Size; icon?: ReactNode; className?: string; children?: ReactNode } & Omit<ComponentProps<typeof Link>, 'to' | 'className' | 'children'>) {
  return <Link to={to} className={clsx(baseBtn, variantCls[variant], sizeCls[size], className)} {...rest}>{icon}{children}</Link>;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(baseBtn, variantCls[variant], sizeCls[size], className)}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

// ------------------------------------------------------------------ Badge / StatusPill
const tone: Record<string, string> = {
  neutral: 'bg-line/70 text-fg',
  brand: 'bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200',
  success: 'bg-success/15 text-success',
  warn: 'bg-warn/15 text-warn',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-info/15 text-info',
  gold: 'bg-gold-100 text-gold-700 dark:bg-gold-700/30 dark:text-gold-300'
};
export function Badge({ children, tone: t = 'neutral', className, dot }: { children: ReactNode; tone?: keyof typeof tone; className?: string; dot?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide', tone[t], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const statusTone: Record<string, keyof typeof tone> = {
  draft: 'neutral', needs_review: 'warn', ready: 'info', approved: 'info', submitting: 'info', submitted: 'brand', under_review: 'warn', needs_information: 'warn', accepted: 'success', rejected: 'danger', failed: 'danger', partial: 'warn', outcome_unknown: 'warn',
  pending: 'warn', active: 'success', left: 'neutral', going: 'success', cancelled: 'neutral', waitlisted: 'warn',
  reported: 'warn', searching: 'info', found: 'success', ready_for_collection: 'success', collected: 'brand', closed: 'neutral',
  published: 'success', saved: 'neutral', preparing: 'info', applied: 'brand', assessment: 'warn', interview: 'info', offer: 'success', withdrawn: 'neutral',
  completed: 'success', enrolled: 'brand', planned: 'neutral', equivalent: 'gold', present: 'success', absent: 'danger', late: 'warn', excused: 'info',
  todo: 'neutral', done: 'success', unscheduled: 'danger', admitted: 'success', open: 'info', cleared: 'success', blocked: 'danger', scheduled: 'brand',
  held: 'info', matched: 'warn', returned: 'success', invalidated: 'danger', consumed: 'neutral', expired: 'danger', preview: 'info', discarded: 'neutral',
  auto_applied: 'success', dismissed: 'neutral', demo: 'gold', unverified: 'warn'
};
export function StatusPill({ status, className }: { status: string; className?: string }) {
  const { t } = useI18n();
  return <Badge tone={statusTone[status] ?? 'neutral'} dot className={className}>{t(statusKey(status))}</Badge>;
}

// ------------------------------------------------------------------ Card
export function Card({ children, className, as: As = 'div', ...rest }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' | 'li' } & Record<string, unknown>) {
  return <As className={clsx('card p-5', className)} {...rest}>{children}</As>;
}

export function SectionTitle({ children, action, className, as: H = 'h2', id }: { children: ReactNode; action?: ReactNode; className?: string; as?: 'h2' | 'h3' | 'h4'; id?: string }) {
  return (
    <div className={clsx('mb-3 flex min-h-8 items-center justify-between gap-3', className)}>
      <H id={id} className="text-base font-semibold text-fg">{children}</H>
      {action}
    </div>
  );
}

/** "View all" style link in a section header: 44px target, arrow follows reading direction. */
export function SectionLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={clsx('-me-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand-600 hover:underline', className)}>
      {children}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
    </Link>
  );
}

// ------------------------------------------------------------------ Form fields
export function Field({ label, hint, error, children, required, className }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={clsx('block text-sm', className)}>
      <span className="mb-1.5 flex items-center gap-1 font-medium text-fg">
        {label}
        {required && <span className="text-danger" aria-hidden>*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-danger" role="alert">{error}</span>}
    </label>
  );
}
const inputCls = 'w-full touch:min-h-11 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30 disabled:opacity-60';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={clsx(inputCls, className)} {...rest} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={clsx(inputCls, 'min-h-[96px]', className)} {...rest} />;
});
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={clsx(inputCls, 'appearance-none bg-[length:16px] bg-[position:right_0.75rem_center] bg-no-repeat pe-9 rtl:bg-[position:left_0.75rem_center]', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%238f857b' stroke-width='2'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
});
export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={clsx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-brand-500' : 'bg-line')}>
        <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'start-[22px]' : 'start-0.5')} />
      </button>
      <span className="text-sm">
        <span className="font-medium">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
}

// ------------------------------------------------------------------ Modal (accessible)
export function Modal({ open, onClose, title, children, footer, size = 'md', description }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; description?: ReactNode }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open, onClose]);
  const { t } = useI18n();
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center bg-ink-950/55 p-0 sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} className={clsx('card max-h-[92vh] w-full overflow-hidden rounded-b-none sm:rounded-b-[1.25rem]', w)} initial={{ y: 24, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <h2 id={`${id}-t`} className="text-lg font-semibold">{title}</h2>
                {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
              </div>
              <button onClick={onClose} aria-label={t('common.close')} className="-me-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-line/60 hover:text-fg"><X className="h-5 w-5" /></button>
            </div>
            <div className="scroll-thin max-h-[calc(92vh-130px)] overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel, danger, loading }: { open: boolean; onClose: () => void; onConfirm: () => void | Promise<void>; title: ReactNode; body?: ReactNode; confirmLabel?: ReactNode; danger?: boolean; loading?: boolean }) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={() => void onConfirm()}>{confirmLabel ?? t('common.confirm')}</Button></>}>
      <div className="text-sm text-muted">{body}</div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Tabs
export function Tabs<T extends string>({ value, onChange, items, className, label }: { value: T; onChange: (v: T) => void; items: Array<{ value: T; label: ReactNode; count?: number; icon?: ReactNode }>; className?: string; label?: string }) {
  const row = useEdgeFade<HTMLDivElement>(value);
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const i = items.findIndex((it) => it.value === value);
    const step = (e.key === 'ArrowRight') !== rtl ? 1 : -1;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + step + items.length) % items.length;
    e.preventDefault();
    onChange(items[next].value);
    requestAnimationFrame(() => row.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
  };
  return (
    <div className={clsx('min-w-0 max-w-full rounded-2xl border border-line bg-surface-2 p-1', className)}>
      <div ref={row} role="tablist" aria-label={label} onKeyDown={onKey} className="scroll-row flex gap-1 overflow-x-auto">
        {items.map((it) => {
          const active = it.value === value;
          return (
            <button key={it.value} type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1} onClick={() => onChange(it.value)} className={clsx('relative flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors touch:min-h-11', active ? 'text-fg' : 'text-muted hover:text-fg')}>
              {active && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-xl bg-surface shadow-sm" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
              <span className="relative flex items-center gap-2 whitespace-nowrap">{it.icon}{it.label}{it.count !== undefined && <span className="num rounded-full bg-line px-1.5 text-xs font-semibold text-muted">{it.count}</span>}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Empty / Error / Skeleton
export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx('card-2 flex flex-col items-center justify-center gap-2 px-6 py-10 text-center', className)}>
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-line/60 text-muted">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <div className="text-base font-semibold">{title}</div>
      {body && <div className="max-w-md text-sm text-muted">{body}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm" role="alert">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
      <div className="flex-1">
        <div className="font-semibold text-danger">{t('common.error')}</div>
        <div className="text-fg/80">{msg}</div>
      </div>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>{t('common.retry')}</Button>}
    </div>
  );
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-xl bg-line/70', className)} aria-hidden />;
}
export function Callout({ tone: t = 'info', title, children, icon }: { tone?: 'info' | 'warn' | 'success' | 'danger' | 'gold'; title?: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  const cls = { info: 'border-info/30 bg-info/10', warn: 'border-warn/30 bg-warn/10', success: 'border-success/30 bg-success/10', danger: 'border-danger/30 bg-danger/10', gold: 'border-gold-500/40 bg-gold-100/60 dark:bg-gold-700/20' }[t];
  const ic = icon ?? { info: <Info className="h-4 w-4 text-info" />, warn: <AlertTriangle className="h-4 w-4 text-warn" />, success: <CheckCircle2 className="h-4 w-4 text-success" />, danger: <AlertTriangle className="h-4 w-4 text-danger" />, gold: <Info className="h-4 w-4 text-gold-700" /> }[t];
  return (
    <div className={clsx('flex gap-3 rounded-2xl border p-3.5 text-sm', cls)}>
      <span className="mt-0.5 shrink-0">{ic}</span>
      <div className="min-w-0 flex-1">{title && <div className="font-semibold">{title}</div>}<div className="text-fg/85">{children}</div></div>
    </div>
  );
}

// ------------------------------------------------------------------ Progress / Avatar / KeyValue
export function Progress({ value, max = 100, className, tone: t = 'brand', label }: { value: number; max?: number; className?: string; tone?: 'brand' | 'success' | 'warn' | 'danger' | 'gold'; label?: string }) {
  const pct = max > 0 && Number.isFinite(value) ? Math.max(0, Math.min(100, (value / max) * 100)) : value > 0 ? 100 : 0;
  const c = { brand: 'bg-brand-500', success: 'bg-success', warn: 'bg-warn', danger: 'bg-danger', gold: 'bg-gold-500' }[t];
  return (
    <div className={clsx('h-2 w-full overflow-hidden rounded-full bg-line', className)} role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div className={clsx('h-full rounded-full', c)} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
    </div>
  );
}
/** Avatar colours: keep the persona hue but darken it until white initials reach 4.5:1 (WCAG AA). */
function lum(hex: string): number {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function avatarColors(input: string): { bg: string; fg: string } {
  const m = /^#?([0-9a-f]{6})$/i.exec(input);
  if (!m) return { bg: input, fg: '#ffffff' };
  let hex = m[1];
  for (let i = 0; i < 12 && 1.05 / (lum(hex) + 0.05) < 4.5; i++) {
    hex = [0, 2, 4].map((j) => Math.round(parseInt(hex.slice(j, j + 2), 16) * 0.9).toString(16).padStart(2, '0')).join('');
  }
  return { bg: `#${hex}`, fg: '#ffffff' };
}
export function Avatar({ name, color, size = 36, className }: { name: string; color?: string; size?: number; className?: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
  const { bg, fg } = avatarColors(color ?? '#F0762B');
  const small = size < 30;
  return (
    <span className={clsx('grid shrink-0 place-items-center rounded-full font-semibold', className)} style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.max(12, size * 0.38) }} aria-hidden>
      {small ? initials.slice(0, 1) : initials}
    </span>
  );
}
export function KeyValue({ items, className }: { items: Array<{ k: ReactNode; v: ReactNode }>; className?: string }) {
  return (
    <dl className={clsx('grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm', className)}>
      {items.map((it, i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{it.k}</dt>
          <dd className="font-medium">{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ------------------------------------------------------------------ Copyable ID
export function CopyId({ value, className }: { value: string; className?: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={() => { void navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }} className={clsx('inline-flex items-center gap-2 rounded-lg border border-dashed border-gold-500/70 bg-gold-100/60 px-3 py-1.5 font-mono text-sm font-semibold tracking-wider text-gold-700 dark:bg-gold-700/20 dark:text-gold-300', className)} title={t('common.copy')}>
      {value}
      <span className="text-xs font-sans font-medium uppercase tracking-wide">{done ? t('common.copied') : t('common.copy')}</span>
    </button>
  );
}
