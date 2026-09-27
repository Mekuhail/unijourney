import { Navigate, Route, Routes } from 'react-router';
import { ClubsDesk } from './staff/ClubsDesk';
import { LostFoundDesk } from './staff/LostFoundDesk';
import { ResourcesDesk } from './staff/ResourcesDesk';
import { CommunityReportsDesk } from './social/MorePages';

/** Staff routes for the campus module, mounted at /staff/campus/*. Roles are enforced by the server on every call. */
export function CampusStaffRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="/staff" replace />} />
      <Route path="clubs" element={<ClubsDesk />} />
      <Route path="lost-found" element={<LostFoundDesk />} />
      <Route path="resources" element={<ResourcesDesk />} />
      <Route path="community" element={<CommunityReportsDesk />} />
      <Route path="*" element={<Navigate to="/staff" replace />} />
    </Routes>
  );
}
