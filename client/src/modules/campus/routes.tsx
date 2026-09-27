import { Route, Routes } from 'react-router';
import { CampusHub } from './pages/CampusHub';
import { ClubsPage, ClubDetailPage } from './pages/ClubsPage';
import { EventsPage, EventDetailPage } from './pages/EventsPage';
import { StudentCardRoute } from '@/shell/StudentCard';
import { ResourcesPage } from './pages/ResourcesPage';
import { MapPage } from './pages/MapPage';
import { LostFoundPage, LostFoundDetailPage } from './pages/LostFoundPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { CommunityRoutes } from './social/routes';

/** Campus Life module, mounted at /campus/*. */
export function CampusRoutes() {
  return (
    <Routes>
      <Route index element={<CampusHub />} />
      <Route path="clubs" element={<ClubsPage />} />
      <Route path="clubs/:id" element={<ClubDetailPage />} />
      <Route path="events" element={<EventsPage />} />
      <Route path="events/:id" element={<EventDetailPage />} />
      <Route path="card" element={<StudentCardRoute />} />
      <Route path="community/*" element={<CommunityRoutes />} />
      <Route path="resources" element={<ResourcesPage />} />
      <Route path="map" element={<MapPage />} />
      <Route path="lost-found" element={<LostFoundPage />} />
      <Route path="lost-found/:id" element={<LostFoundDetailPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
