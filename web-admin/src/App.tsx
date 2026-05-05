import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AdminDashboard } from './pages/AdminDashboard';
import { Login } from './pages/Login';
import { OrderLog } from './pages/OrderLog';
import { Settings } from './pages/Settings';
import { FleetMap } from './pages/FleetMap';
import { Sidebar } from './components/Sidebar';
import { useAuthStore } from './store/authStore';
import { supabase } from './utils/supabase';

function App() {
  const { session, setSession, setUser, setRole } = useAuthStore();

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session);
        setUser(session.user);
        
        // Fetch role
        supabase.from('users')
          .select('role')
          .eq('id', session.user.id)
          .single()
          .then(({ data }) => {
            if (data) setRole(data.role);
          });
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        setUser(session.user);
        supabase.from('users')
          .select('role')
          .eq('id', session.user.id)
          .single()
          .then(({ data }) => {
            if (data) setRole(data.role);
          });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <Router>
      <div className="min-h-screen bg-[#0F172A] flex">
        {session && <Sidebar />}
        
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/login" element={!session ? <Login /> : <Navigate to="/" />} />
            <Route 
              path="/" 
              element={session ? <AdminDashboard /> : <Navigate to="/login" />} 
            />
            <Route path="/orders" element={session ? <OrderLog /> : <Navigate to="/login" />} />
            <Route path="/fleet" element={session ? <FleetMap /> : <Navigate to="/login" />} />
            <Route path="/settings" element={session ? <Settings /> : <Navigate to="/login" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
