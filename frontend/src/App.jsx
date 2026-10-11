import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import NgoDashboardPage from './pages/NgoDashboardPage';
import VolunteerDashboardPage from './pages/VolunteerDashboardPage';
import VolunteerProfilePage from './pages/VolunteerProfilePage';
import LoginPage from './pages/LoginPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Project Landing Page as the Root Route */}
        <Route path="/" element={<LandingPage />} />

        {/* Dedicated Sign-in / Workspace Access */}
        <Route path="/login" element={<LoginPage />} />

        {/* Dedicated Role-Specific NGO Dashboard */}
        <Route path="/ngo-dashboard" element={<NgoDashboardPage />} />

        {/* Dedicated Role-Specific Volunteer Dashboard & Profile */}
        <Route path="/volunteer-dashboard" element={<VolunteerDashboardPage />} />
        <Route path="/volunteer-profile" element={<VolunteerProfilePage />} />

        {/* Operational Coordinator Operations Dashboard */}
        <Route path="/dashboard" element={<DashboardPage />} />

        {/* Catch-all redirect to public landing page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
