import { lazy, Suspense } from 'react';
import { MotionConfig } from 'motion/react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { I18nProvider } from './i18n';
import { SessionProvider } from './lib/session';
import { ThemeProvider } from './lib/theme';
import { ToastProvider } from './components/ui/toast';
import { AppShell } from './shell/AppShell';
import { TodayPage } from './modules/today/TodayPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { CalendarPage } from './pages/CalendarPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { Skeleton } from './components/ui';

// Route-level code splitting keeps the initial bundle small; each module loads on first visit.
const AcademicsRoutes = lazy(() => import('./modules/academics/routes').then((m) => ({ default: m.AcademicsRoutes })));
const CampusRoutes = lazy(() => import('./modules/campus/routes').then((m) => ({ default: m.CampusRoutes })));
const CareerRoutes = lazy(() => import('./modules/career/routes').then((m) => ({ default: m.CareerRoutes })));
const JourneyRoutes = lazy(() => import('./modules/journey/routes').then((m) => ({ default: m.JourneyRoutes })));
const StaffRoutes = lazy(() => import('./modules/staff/routes').then((m) => ({ default: m.StaffRoutes })));
const PrereqChainsPage = lazy(() => import('./modules/prereqs/PrereqChainsPage').then((m) => ({ default: m.PrereqChainsPage })));
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
    <MotionConfig reducedMotion="user">
    <ThemeProvider>
      <I18nProvider>
        <ToastProvider>
          <SessionProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<Navigate to="/today" replace />} />
                  <Route path="/today" element={<TodayPage />} />
                  <Route path="/academics/*" element={<Suspense fallback={<Loading />}><AcademicsRoutes /></Suspense>} />
                  <Route path="/campus/*" element={<Suspense fallback={<Loading />}><CampusRoutes /></Suspense>} />
                  <Route path="/career/*" element={<Suspense fallback={<Loading />}><CareerRoutes /></Suspense>} />
                  <Route path="/journey/*" element={<Suspense fallback={<Loading />}><JourneyRoutes /></Suspense>} />
                  <Route path="/staff/*" element={<Suspense fallback={<Loading />}><StaffRoutes /></Suspense>} />
                  <Route path="/prereqs" element={<Suspense fallback={<Loading />}><PrereqChainsPage /></Suspense>} />
                  <Route path="/prereqs/:programId" element={<Suspense fallback={<Loading />}><PrereqChainsPage /></Suspense>} />
                  <Route path="/demo" element={<Suspense fallback={<Loading />}><DemoPanel /></Suspense>} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/approvals" element={<ApprovalsPage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </SessionProvider>
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
    </MotionConfig>
  );
}
