import { Navigate, Route, Routes } from 'react-router';

/** Career records are private to each student; there is no staff queue. Redirect to the staff index. */
export function CareerStaffRoutes() {
  return (
    <Routes>
      <Route path="*" element={<Navigate to="/staff" replace />} />
    </Routes>
  );
}
