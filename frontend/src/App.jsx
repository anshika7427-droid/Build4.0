import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Project Landing Page as the Root Route */}
        <Route path="/" element={<LandingPage />} />

        {/* Separate Coordinator Operations Dashboard */}
        <Route path="/dashboard" element={<DashboardPage />} />

        {/* Catch-all redirect to public landing page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
