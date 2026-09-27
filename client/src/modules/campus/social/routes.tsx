import { Route, Routes } from 'react-router';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { CommunityHome } from './HomePage';
import { CommunityEvents } from './EventsPage';
import { PeoplePage, ProfilePage, MyProfilePage, ProfileEditPage } from './PeoplePages';
import { MessagesPage } from './MessagesPage';
import { PostPage, SearchPage } from './MorePages';

/** The campus community, mounted at /campus/community/*. */
export function CommunityRoutes() {
  return (
    <Routes>
      <Route index element={<CommunityHome />} />
      <Route path="events" element={<CommunityEvents />} />
      <Route path="people" element={<PeoplePage />} />
      <Route path="people/:id" element={<ProfilePage />} />
      <Route path="me" element={<MyProfilePage />} />
      <Route path="me/edit" element={<ProfileEditPage />} />
      <Route path="messages" element={<MessagesPage />} />
      <Route path="messages/:id" element={<MessagesPage />} />
      <Route path="posts/:id" element={<PostPage />} />
      <Route path="search" element={<SearchPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
