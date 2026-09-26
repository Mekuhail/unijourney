import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import * as M from 'motion/react-m';
import { Bell, Languages, Moon, Sun, Monitor, Menu as MenuIcon, X, IdCard, Users, LogOut } from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '@/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { Avatar } from '@/components/ui';
import { Brand } from './Brand';
import { NAV, STAFF_NAV, DEMO_NAV, type NavItem } from './nav';
import { DemoPill } from './DemoClock';
import { PersonaSwitcher } from './PersonaSwitcher';
import { NotificationsPanel } from './NotificationsPanel';
import { Menu, MenuRadio, MenuItem, MenuGroup, MenuSeparator } from '@/components/ui/Menu';

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
              {isActive && <M.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-brand-500/10 ring-1 ring-brand-500/30" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
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
  const { theme, setTheme } = useTheme();
  const [personaOpen, setPersonaOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const loc = useLocation();
  const items = useNavItems();
  useEffect(() => setMenuOpen(false), [loc.pathname]);

  const bottomItems = items.filter((it) => it.to !== '/prereqs' && it.to !== '/staff').slice(0, 5);
  const iconBtn = 'grid h-11 w-11 place-items-center rounded-full border border-line hover:border-brand-400';

  // After client-side navigation, move focus to the new page's h1 (the h1 may render after lazy chunks or data load).
  const lastPath = useRef(loc.pathname);
  useEffect(() => {
    if (lastPath.current === loc.pathname) return; // first load (and StrictMode re-runs): leave focus alone
    lastPath.current = loc.pathname;
    let tries = 0;
    let timer = 0;
    const focusH1 = () => {
      const h1 = document.querySelector<HTMLElement>('#main h1');
      if (h1) { if (!h1.hasAttribute('tabindex')) h1.tabIndex = -1; h1.focus({ preventScroll: true }); window.scrollTo(0, 0); return; }
      if (++tries < 20) timer = window.setTimeout(focusH1, 50);
    };
    timer = window.setTimeout(focusH1, 0);
    return () => window.clearTimeout(timer);
  }, [loc.pathname]);

  const content = (
    <div className="flex min-h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-[var(--z-skip)] focus:rounded-lg focus:bg-brand-500 focus:px-3 focus:py-2 focus:text-ink-950">{t('shell.skipToContent')}</a>
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-e border-line bg-surface p-4 lg:flex">
        <div className="mb-6 px-1"><Brand /></div>
        <SideNav />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="app-header pad-safe-x sticky top-0 z-[var(--z-sticky)] flex h-14 items-center gap-1 border-b border-line bg-surface/95 backdrop-blur-md sm:gap-1.5 sm:px-5">
          <button type="button" className="grid h-11 w-11 place-items-center rounded-xl lg:hidden" onClick={() => setMenuOpen((v) => !v)} aria-label={t('shell.menu')} aria-expanded={menuOpen} aria-controls="mobile-nav">{menuOpen ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}</button>
          <div className="lg:hidden"><Brand compact /></div>
          <div className="ms-auto flex items-center gap-1 sm:gap-1.5">
            {demoMode && <DemoPill />}
            <button type="button" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')} className="hidden h-11 items-center justify-center gap-1.5 rounded-full border border-line px-3 text-sm font-semibold hover:border-brand-400 sm:inline-flex" aria-label={t('shell.languageSwitch')}><Languages className="h-4 w-4" aria-hidden /><span lang={locale === 'ar' ? 'en' : 'ar'}>{t('shell.language')}</span></button>
            <button type="button" onClick={() => setNotifOpen(true)} className={clsx('relative', iconBtn)} aria-label={`${t('nav.notifications')} (${unread})`}>
              <Bell className="h-4 w-4" />
              {unread > 0 && <span className="absolute -end-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1 text-xs font-bold text-ink-950">{unread > 99 ? '99+' : unread}</span>}
            </button>
            {user && (
              <Menu label={t('shell.account')} buttonClassName="grid h-11 w-11 place-items-center rounded-full" button={<Avatar name={user.name_en} color={user.avatar_color} size={34} />} panelClassName="w-72">
                <div className="flex items-center gap-3 px-3 pb-2 pt-1.5">
                  <Avatar name={user.name_en} color={user.avatar_color} size={40} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{l(user.name_en, user.name_ar)}</span>
                    <span className="block truncate text-xs text-muted">{user.department ?? (user.student_no ? `#${user.student_no}` : user.stage)}</span>
                  </span>
                </div>
                <MenuSeparator />
                <MenuItem icon={<IdCard className="h-4 w-4" />} to="/campus/card">{t('shell.profile')}</MenuItem>
                {demoMode && <MenuItem icon={<Users className="h-4 w-4" />} onSelect={() => setPersonaOpen(true)}>{t('shell.switchPersonaDemo')}</MenuItem>}
                <MenuSeparator />
                <div className="sm:hidden">
                  <MenuGroup label={t('shell.languageLabel')}>
                    <MenuRadio checked={locale === 'en'} onSelect={() => setLocale('en')}><span lang="en">English</span></MenuRadio>
                    <MenuRadio checked={locale === 'ar'} onSelect={() => setLocale('ar')}><span lang="ar">العربية</span></MenuRadio>
                  </MenuGroup>
                  <MenuSeparator />
                </div>
                <MenuGroup label={t('shell.theme')}>
                  <MenuRadio icon={<Monitor className="h-4 w-4" />} checked={theme === 'system'} onSelect={() => setTheme('system')}>{t('shell.theme.system')}</MenuRadio>
                  <MenuRadio icon={<Sun className="h-4 w-4" />} checked={theme === 'light'} onSelect={() => setTheme('light')}>{t('shell.theme.light')}</MenuRadio>
                  <MenuRadio icon={<Moon className="h-4 w-4" />} checked={theme === 'dark'} onSelect={() => setTheme('dark')}>{t('shell.theme.dark')}</MenuRadio>
                </MenuGroup>
                <MenuSeparator />
                <MenuItem icon={<LogOut className="h-4 w-4" />} disabled hint={t('shell.signOutDemo')}>{t('shell.signOut')}</MenuItem>
              </Menu>
            )}
          </div>
        </header>
        {menuOpen && (
          <div id="mobile-nav" className="border-b border-line bg-surface p-3 lg:hidden">
            <SideNav />
          </div>
        )}
        <main id="main" className="pad-safe-x mx-auto w-full max-w-7xl flex-1 pb-[calc(5.5rem+var(--safe-bottom))] pt-5 sm:px-6 lg:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav aria-label={t('shell.primaryNav')} className="fixed inset-x-0 bottom-0 z-[var(--z-sticky)] border-t border-line bg-surface/95 backdrop-blur-md lg:hidden" style={{ paddingBottom: 'var(--safe-bottom)' }}>
        <ul className="mx-auto flex max-w-xl" style={{ paddingLeft: 'var(--safe-left)', paddingRight: 'var(--safe-right)' }}>
          {bottomItems.map((it) => (
            <li key={it.to} className="min-w-0 flex-1">
              <NavLink to={it.to} className={({ isActive }) => clsx('flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 text-xs font-medium transition-colors', isActive ? 'text-brand-600' : 'text-muted hover:text-fg')}>
                {({ isActive }) => (<><it.icon className="h-5 w-5" aria-hidden strokeWidth={isActive ? 2.4 : 2} /><span className="max-w-full truncate">{t(it.key.replace('nav.', 'nav.short.'))}</span></>)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <PersonaSwitcher open={personaOpen} onClose={() => setPersonaOpen(false)} />
      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  );

  return content;
}
