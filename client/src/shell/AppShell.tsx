import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { Bell, Languages, Moon, Sun, Monitor, ChevronDown, Menu, X } from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '@/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { Avatar } from '@/components/ui';
import { Brand } from './Brand';
import { NAV, STAFF_NAV, DEMO_NAV, type NavItem } from './nav';
import { DemoClockChip } from './DemoClock';
import { PersonaSwitcher } from './PersonaSwitcher';
import { NotificationsPanel } from './NotificationsPanel';
import ClickSpark from '@/components/reactbits/ClickSpark';
import Dock from '@/components/reactbits/Dock';

function useNavItems(): NavItem[] {
  const { hasRole } = useSession();
  const items = [...NAV];
  if (STAFF_NAV.roles && hasRole(...STAFF_NAV.roles)) items.push(STAFF_NAV);
  return items;
}

function SideNav() {
  const { t } = useI18n();
  const items = useNavItems();
  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {[...items, DEMO_NAV].map((it) => (
        <NavLink key={it.to} to={it.to} className={({ isActive }) => clsx('group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors', isActive ? 'text-fg' : 'text-muted hover:text-fg hover:bg-line/50')}>
          {({ isActive }) => (
            <>
              {isActive && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-brand-500/10 ring-1 ring-brand-500/30" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
              <it.icon className={clsx('relative h-[18px] w-[18px]', isActive ? 'text-brand-600' : 'text-muted group-hover:text-fg')} />
              <span className="relative">{t(it.key)}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell() {
  const { t, locale, setLocale, l } = useI18n();
  const { user, unread, demoMode } = useSession();
  const { theme, setTheme, resolved, reducedMotion } = useTheme();
  const [personaOpen, setPersonaOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  const items = useNavItems();
  useEffect(() => setMenuOpen(false), [loc.pathname]);

  const cycleTheme = () => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system');
  const ThemeIcon = theme === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun;

  const dockItems = items.filter((it) => it.to !== '/prereqs').slice(0, 5).map((it) => ({
    icon: <it.icon className={clsx('h-5 w-5', loc.pathname.startsWith(it.to) ? 'text-brand-500' : 'text-fg')} />,
    label: t(it.key),
    onClick: () => nav(it.to),
    className: loc.pathname.startsWith(it.to) ? 'ring-2 ring-brand-500/60' : ''
  }));

  const content = (
    <div className="flex min-h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-[200] focus:rounded-lg focus:bg-brand-500 focus:px-3 focus:py-2 focus:text-white">{t('shell.skipToContent')}</a>
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-e border-line bg-surface/70 p-4 backdrop-blur lg:flex">
        <div className="mb-6 px-1"><Brand /></div>
        <SideNav />
        <div className="mt-auto space-y-3">
          {user && (
            <button onClick={() => setPersonaOpen(true)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3 text-start transition hover:border-brand-400" title={t('shell.switchPersona')}>
              <Avatar name={user.name_en} color={user.avatar_color} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{l(user.name_en, user.name_ar)}</span>
                <span className="block truncate text-[11px] text-muted">{user.department ?? (user.student_no ? `#${user.student_no}` : user.stage)}</span>
              </span>
              {demoMode && <ChevronDown className="h-4 w-4 text-muted" />}
            </button>
          )}
          <div className="px-1 text-[10px] leading-relaxed text-muted">All people, records and outcomes are synthetic demo data.</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="pad-safe-x sticky top-0 z-40 glass flex h-14 items-center gap-2 sm:px-5">
          <button className="rounded-lg p-2 lg:hidden" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu" aria-expanded={menuOpen}>{menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          <div className="lg:hidden"><Brand compact /></div>
          <div className="ms-auto flex items-center gap-1.5">
            <DemoClockChip />
            <button onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-semibold hover:border-brand-400" aria-label={t('shell.language')}><Languages className="h-4 w-4" />{t('shell.language')}</button>
            <button onClick={cycleTheme} className="grid h-9 w-9 place-items-center rounded-full border border-line hover:border-brand-400" aria-label={t('shell.theme')} title={`${t('shell.theme')}: ${theme}`}><ThemeIcon className="h-4 w-4" /></button>
            <button onClick={() => setNotifOpen(true)} className="relative grid h-9 w-9 place-items-center rounded-full border border-line hover:border-brand-400" aria-label={`${t('nav.notifications')} (${unread})`}>
              <Bell className="h-4 w-4" />
              {unread > 0 && <span className="absolute -end-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
            </button>
            {user && <button onClick={() => setPersonaOpen(true)} className="lg:hidden" aria-label={t('shell.switchPersona')}><Avatar name={user.name_en} color={user.avatar_color} size={34} /></button>}
          </div>
        </header>
        {menuOpen && (
          <div className="border-b border-line bg-surface p-3 lg:hidden">
            <SideNav />
          </div>
        )}
        <main id="main" className="pad-safe-x mx-auto w-full max-w-7xl flex-1 pb-28 pt-5 sm:px-6 lg:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Mobile dock */}
      <div className="dock-safe fixed inset-x-0 bottom-0 z-40 lg:hidden" style={{ pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto' }}>
          <Dock items={dockItems} panelHeight={64} baseItemSize={44} magnification={reducedMotion ? 44 : 60} className="!bg-[var(--surface)]/95 !border-[var(--line)] backdrop-blur" />
        </div>
      </div>

      <PersonaSwitcher open={personaOpen} onClose={() => setPersonaOpen(false)} />
      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  );

  if (reducedMotion) return content;
  return <ClickSpark sparkColor={resolved === 'dark' ? '#F58A47' : '#F0762B'} sparkSize={8} sparkRadius={18} sparkCount={8} duration={380}>{content}</ClickSpark>;
}
