import { Route, Routes } from 'react-router';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { FeedbackPage } from './FeedbackPage';
import { CourseFeedbackPage, InstructorFeedbackPage } from './DetailPages';

/** Feedback & help, mounted at /feedback/*. */
export function FeedbackRoutes() {
  return (
    <Routes>
      <Route index element={<FeedbackPage />} />
      <Route path="courses/:code" element={<CourseFeedbackPage />} />
      <Route path="instructors/:slug" element={<InstructorFeedbackPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
