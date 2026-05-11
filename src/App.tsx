/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { Player } from './pages/Player';
import { Dashboard } from './pages/Dashboard';
import { SplashScreen } from './components/SplashScreen';
import { ThemeProvider } from './components/ThemeProvider';
import { Studio } from './pages/Studio';
import { SimulationEditor } from './pages/SimulationEditor';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import { Pricing } from './pages/Pricing';
import { UsersList } from './pages/UsersList';
import { UserProfile } from './pages/UserProfile';
import { initializeSimulationsSync } from './data';
import { AuthProvider, useAuth } from './context/AuthContext';

function AppContent() {
  const [showSplash, setShowSplash] = useState(true);
  const { user, loading } = useAuth();

  useEffect(() => {
    initializeSimulationsSync();
  }, []);

  if (loading) {
    return <div className="h-screen w-screen bg-[#0a0a0a] flex items-center justify-center text-white">Loading...</div>;
  }

  if (!user) {
    return (
      <AnimatePresence mode="wait">
        {showSplash ? <SplashScreen onComplete={() => setShowSplash(false)} /> : <Login />}
      </AnimatePresence>
    );
  }

  return (
    <>
      <AnimatePresence>
        {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      </AnimatePresence>
      {!showSplash && (
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="library" element={<Library />} />
            <Route path="profile" element={<Dashboard />} />
            <Route path="pricing" element={<Pricing />} />
            
            {/* Show Studio based on role */}
            {user.role === 'super_admin' && (
              <>
                <Route path="studio" element={<Studio />} />
                <Route path="studio/new" element={<SimulationEditor />} />
                <Route path="studio/edit/:id" element={<SimulationEditor />} />
              </>
            )}

            {/* Users Module for Admin and Super Admin */}
            {(user.role === 'super_admin' || user.role === 'organization') && (
              <>
                <Route path="manage" element={<Navigate to="/users" replace />} />
                <Route path="users" element={<UsersList />} />
                <Route path="users/:id" element={<UserProfile />} />
              </>
            )}

            {/* Settings route */}
            <Route path="settings" element={<Settings />} />

            {/* Play route should not have the sidebars normally but we handled it in Layout to render Outlet only */}
            <Route path="play/:id" element={<Player />} />
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

