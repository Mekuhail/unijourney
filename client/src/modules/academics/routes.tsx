import { Navigate, Route, Routes } from 'react-router';
import { OverviewPage } from './pages/OverviewPage';
import { PlanPage } from './pages/PlanPage';
import { RegisterPage } from './pages/RegisterPage';
import { TimetablePage } from './pages/TimetablePage';
import { AttendancePage } from './pages/AttendancePage';
import { ExcusesListPage, ExcuseDetailPage } from './pages/ExcusesPage';
import { PlannerPage } from './pages/PlannerPage';
import { GpaPage } from './pages/GpaPage';
import { RequirementsPage } from './pages/RequirementsPage';
import { CoursePage } from './pages/CoursePage';

/** Academics module routes, mounted at /academics/*. */
export function AcademicsRoutes() {
  return (
    <Routes>
      <Route index element={<OverviewPage />} />
      <Route path="plan" element={<PlanPage />} />
      <Route path="requirements" element={<RequirementsPage />} />
      <Route path="register" element={<RegisterPage />} />
      <Route path="timetable" element={<TimetablePage />} />
      <Route path="attendance" element={<AttendancePage />} />
      <Route path="excuses" element={<ExcusesListPage />} />
      <Route path="excuses/:id" element={<ExcuseDetailPage />} />
      <Route path="study" element={<PlannerPage />} />
      <Route path="gpa" element={<GpaPage />} />
      <Route path="courses/:code" element={<CoursePage />} />
      <Route path="*" element={<Navigate to="/academics" replace />} />
    </Routes>
  );
}
