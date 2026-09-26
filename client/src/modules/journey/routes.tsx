import { Route, Routes } from 'react-router';
import { JourneyHome } from './JourneyHome';
import { AdmissionPage } from './AdmissionPage';
import { OnboardingPage } from './OnboardingPage';
import { GraduationPage } from './GraduationPage';

export function JourneyRoutes() {
  return (
    <Routes>
      <Route index element={<JourneyHome />} />
      <Route path="admission" element={<AdmissionPage />} />
      <Route path="onboarding" element={<OnboardingPage />} />
      <Route path="graduation" element={<GraduationPage />} />
      <Route path="*" element={<JourneyHome />} />
    </Routes>
  );
}
