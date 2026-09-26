import { lazy, Suspense } from 'react';
import { LazyMotion, MotionConfig } from 'motion/react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { I18nProvider } from './i18n';
import { SessionProvider } from './lib/session';
import { ThemeProvider } from './lib/theme';
import { ToastProvider } from './components/ui/toast';
import { AppShell } from './shell/AppShell';
import { Skeleton } from './components/ui';

// Motion features (layout animations included) load in their own chunk after first paint.
const loadMotionFeatures = () => import('./lib/motionFeatures').then((m) => m.default);

// Route-level code splitting keeps the initial bundle small; every route loads on first visit.
const TodayPage = lazy(() => import('./modules/today/TodayPage').then((m) => ({ default: m.TodayPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const ApprovalsPage = lazy(() => import('./pages/ApprovalsPage').then((m) => ({ default: m.ApprovalsPage })));
const CalendarPage = lazy(() => import('./pages/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));
const AcademicsRoutes = lazy(() => import('./modules/academics/routes').then((m) => ({ default: m.AcademicsRoutes })));
const CampusRoutes = lazy(() => import('./modules/campus/routes').then((m) => ({ default: m.CampusRoutes })));
const CareerRoutes = lazy(() => import('./modules/career/routes').then((m) => ({ default: m.CareerRoutes })));
const JourneyRoutes = lazy(() => import('./modules/journey/routes').then((m) => ({ default: m.JourneyRoutes })));
const StaffRoutes = lazy(() => import('./modules/staff/routes').then((m) => ({ default: m.StaffRoutes })));
const PrereqChainsPage = lazy(() => import('./modules/prereqs/PrereqChainsPage').then((m) => ({ default: m.PrereqChainsPage })));
const PortfolioPage = lazy(() => import('./modules/career/PortfolioPage').then((m) => ({ default: m.PortfolioPage })));
const CompetitionsPage = lazy(() => import('./modules/career/CompetitionsPage').then((m) => ({ default: m.CompetitionsPage })));
const DemoPanel = lazy(() => import('./modules/demo/DemoPanel').then((m) => ({ default: m.DemoPanel })));

function Loading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
  );
}

export function App() {
  return (
    <LazyMotion features={loadMotionFeatures} strict>
    <MotionConfig reducedMotion="user">
    <ThemeProvider>
      <I18nProvider>
        <ToastProvider>
          <SessionProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<Navigate to="/today" replace />} />
                  <Route path="/today" element={<Suspense fallback={<Loading />}><TodayPage /></Suspense>} />
                  <Route path="/academics/*" element={<Suspense fallback={<Loading />}><AcademicsRoutes /></Suspense>} />
                  <Route path="/campus/*" element={<Suspense fallback={<Loading />}><CampusRoutes /></Suspense>} />
                  <Route path="/portfolio" element={<Suspense fallback={<Loading />}><PortfolioPage /></Suspense>} />
                  <Route path="/competitions" element={<Suspense fallback={<Loading />}><CompetitionsPage /></Suspense>} />
                  <Route path="/career/*" element={<Suspense fallback={<Loading />}><CareerRoutes /></Suspense>} />
                  <Route path="/journey/*" element={<Suspense fallback={<Loading />}><JourneyRoutes /></Suspense>} />
                  <Route path="/staff/*" element={<Suspense fallback={<Loading />}><StaffRoutes /></Suspense>} />
                  <Route path="/prereqs" element={<Suspense fallback={<Loading />}><PrereqChainsPage /></Suspense>} />
                  <Route path="/prereqs/:programId" element={<Suspense fallback={<Loading />}><PrereqChainsPage /></Suspense>} />
                  <Route path="/demo" element={<Suspense fallback={<Loading />}><DemoPanel /></Suspense>} />
                  <Route path="/notifications" element={<Suspense fallback={<Loading />}><NotificationsPage /></Suspense>} />
                  <Route path="/approvals" element={<Suspense fallback={<Loading />}><ApprovalsPage /></Suspense>} />
                  <Route path="/calendar" element={<Suspense fallback={<Loading />}><CalendarPage /></Suspense>} />
                  <Route path="*" element={<Suspense fallback={<Loading />}><NotFoundPage /></Suspense>} />
                </Route>
              </Routes>
            </BrowserRouter>
          </SessionProvider>
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
    </MotionConfig>
    </LazyMotion>
  );
}
