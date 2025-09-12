import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout'; // Unified project's main layout

// Unified Project Pages
import AiShortsGeneratorPage from './pages/AiShortsGeneratorPage';

import YoutubeShortsContentFactoryPage from './pages/YoutubeShortsContentFactoryPage';

// GCP Test Pages
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import DrivePage from './pages/DrivePage';
import SheetsPage from './pages/SheetsPage';
import DocsPage from './pages/DocsPage';
import YouTubePage from './pages/YouTubePage';
import AuthCallbackPage from './pages/AuthCallbackPage';

import YouTubeSchedulerPage from './pages/YouTubeSchedulerPage';

import { AuthProvider } from './context/AuthContext'; // Import AuthProvider

function App() {
  return (
    <AuthProvider> {/* AuthProvider wraps all routes */}
      <Routes>
        {/* Main Layout Route - all other routes render inside its <Outlet /> */}
        <Route path="/" element={<Layout />}>
          {/* Unified Project Main Pages (as children of Layout) */}
          <Route index element={<HomePage />} /> {/* Default route for / */}
          <Route path="ai-shorts-generator" element={<AiShortsGeneratorPage />} />
          
          <Route path="youtube-shorts-content-factory" element={<YoutubeShortsContentFactoryPage />} />
          <Route path="youtube-scheduler" element={<YouTubeSchedulerPage />} />

          {/* GCP Test Pages (Temporarily Disabled) */}
          {/* <Route path="login" element={<LoginPage />} /> */}
          {/* <Route path="drive" element={<DrivePage />} /> */}
          {/* <Route path="sheets" element={<SheetsPage />} /> */}
          {/* <Route path="docs" element={<DocsPage />} /> */}
          {/* <Route path="youtube" element={<YouTubePage />} /> */}
        </Route>

        {/* Auth Callback Page (Temporarily Disabled) */}
        {/* <Route path="/auth/callback" element={<AuthCallbackPage />} /> */}
      </Routes>
    </AuthProvider>
  );
}

export default App;