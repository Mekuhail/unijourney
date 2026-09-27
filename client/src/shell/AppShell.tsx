import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import * as M from 'motion/react-m';
import { Bell, Languages, Moon, Sun, Monitor, Menu as MenuIcon, X, IdCard, Users, LogOut, BadgeCheck } from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '@/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { Avatar } from '@/components/ui';
import { Brand } from './Brand';
import { sideNavFor, bottomNavFor, isActive } from './nav';
import { capabilityForPath, landingFor } from '@shared/access';
import { NoAccess } from './NoAccess';
import { DemoPill } from './DemoClock';
import { PersonaSwitcher } from './PersonaSwitcher';
import { NotificationsPanel } from './NotificationsPanel';
import { StudentCardHost, openStudentCard } from './StudentCard';
import { Menu, MenuRadio, MenuItem, MenuGroup, MenuSeparator } from '@/components/ui/Menu';

/** Grouped side menu. Each item decides its own active state (several destinations share the /campus prefix). */
function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const { user, demoMode } = useSession();
  const { pathname } = useLocation();
  const groups = sideNavFor(user?.roles, demoMode);
  return (
    <nav aria-label={t('shell.primaryNav')} className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.key ?? 'home'} role="group" aria-labelledby={g.key ? `navg-${g.key}` : undefined}>
          {g.key && <div id={`navg-${g.key}`} className="mb-1 px-3 text-xs font-semibold text-muted">{t(g.key)}</div>}
          <ul className="flex flex-col gap-0.5">
            {g.items.map((it) => {
              const active = isActive(it, pathname);
              return (
                <li key={it.to}>
                  <Link to={it.to} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={clsx('group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors lg:min-h-10', active ? 'text-fg' : 'text-muted hover:bg-line/50 hover:text-fg')}>
                    {active && <M.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-brand-500/10 ring-1 ring-brand-500/30" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                    <it.icon className={clsx('relative h-[18px] w-[18px] shrink-0', active ? 'text-brand-600' : 'text-muted group-hover:text-fg')} aria-hidden />
                    <span className="relative">{t(it.key)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppShell() {
  const { t, locale, setLocale, l } = useI18n();
  const { user, unread, demoMode, can } = useSession();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [personaOpen, setPersonaOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setMenuOpen(false), [loc.pathname]);

  // Route guard from the role → capability matrix. After a persona switch, leave a page the new role cannot use.
  const needed = capabilityForPath(loc.pathname);
  const allowed = !user || !needed || can(needed);
  const lastUser = useRef(user?.id);
  useEffect(() => {
    if (!user || lastUser.current === user.id) return;
    lastUser.current = user.id;
    if (!allowed) navigate(landingFor(user.roles), { replace: true });
  }, [user, allowed, navigate]);
  const bottom = bottomNavFor(user?.roles);

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
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-e border-line bg-surface lg:flex">
        <div className="px-5 pb-4 pt-4"><Brand /></div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pb-4"><SideNav /></div>
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
                {can('portfolio') && <MenuItem icon={<BadgeCheck className="h-4 w-4" />} to="/portfolio">{t('nav.portfolio')}</MenuItem>}
                {can('studentCard') && <MenuItem icon={<IdCard className="h-4 w-4" />} onSelect={openStudentCard}>{t('shell.card')}</MenuItem>}
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
            <SideNav onNavigate={() => setMenuOpen(false)} />
          </div>
        )}
        <main id="main" className="pad-safe-x mx-auto w-full max-w-7xl flex-1 pb-[calc(5.5rem+var(--safe-bottom))] pt-5 sm:px-6 lg:pb-10">
          {allowed ? <Outlet /> : <NoAccess path={loc.pathname} />}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav aria-label={t('shell.primaryNav')} className="fixed inset-x-0 bottom-0 z-[var(--z-sticky)] border-t border-line bg-surface/95 backdrop-blur-md lg:hidden" style={{ paddingBottom: 'var(--safe-bottom)' }}>
        <ul className="mx-auto flex max-w-xl" style={{ paddingLeft: 'var(--safe-left)', paddingRight: 'var(--safe-right)' }}>
          {bottom.map((it) => {
            const active = isActive(it, loc.pathname);
            return (
              <li key={it.to} className="min-w-0 flex-1">
                <Link to={it.to} aria-current={active ? 'page' : undefined} className={clsx('flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 text-xs font-medium transition-colors', active ? 'text-brand-600' : 'text-muted hover:text-fg')}>
                  <it.icon className="h-5 w-5" aria-hidden strokeWidth={active ? 2.4 : 2} /><span className="max-w-full truncate">{t(it.key.replace('nav.', 'nav.short.'))}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <PersonaSwitcher open={personaOpen} onClose={() => setPersonaOpen(false)} />
      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
      <StudentCardHost />
    </div>
  );

  return content;
}
