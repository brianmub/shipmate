import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { useAuthStore } from './store/authStore';
import { supabase } from './utils/supabase';
import { Loader2 } from 'lucide-react';

// Lazy-loaded Admin pages/layouts for code-splitting
const Login = lazy(() => import('./pages/admin/Login').then(m => ({ default: m.Login })));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const OrderLog = lazy(() => import('./pages/OrderLog').then(m => ({ default: m.OrderLog })));
const FleetMap = lazy(() => import('./pages/FleetMap').then(m => ({ default: m.FleetMap })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const UserManagement = lazy(() => import('./pages/admin/UserManagement').then(m => ({ default: m.UserManagement })));
const Privacy = lazy(() => import('./pages/Privacy').then(m => ({ default: m.Privacy })));
const Unauthorized = lazy(() => import('./pages/admin/Unauthorized').then(m => ({ default: m.Unauthorized })));
const AdminRoute = lazy(() => import('./routes/AdminRoute').then(m => ({ default: m.AdminRoute })));
const AdminLayout = lazy(() => import('./components/AdminLayout').then(m => ({ default: m.AdminLayout })));

const AdminLoading = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-[#0F172A] text-slate-100">
    <Loader2 className="w-10 h-10 text-brand-blue animate-spin mb-3" />
    <p className="text-slate-400 text-sm font-medium animate-pulse">Loading panel...</p>
  </div>
);

function App() {
  const { session, setSession, setUser, setRole, setInitialized } = useAuthStore();

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
          .then(({ data, error }) => {
            if (data) setRole(data.role);
            setInitialized(true);
          })
          .catch(() => {
            setInitialized(true);
          });
      } else {
        setInitialized(true);
      }
    }).catch(() => {
      setInitialized(true);
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
            setInitialized(true);
          })
          .catch(() => {
            setInitialized(true);
          });
      } else {
        setUser(null);
        setRole(null);
        setInitialized(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <Router>
      <Suspense fallback={<AdminLoading />}>
        <Routes>
          {/* Public Marketing Landing Route */}
          <Route path="/" element={<Landing />} />

          {/* Public Privacy Policy Route */}
          <Route path="/privacy" element={<Privacy />} />

          {/* Admin Login Route */}
          <Route 
            path="/admin/login" 
            element={!session ? <Login /> : <Navigate to="/admin/dashboard" />} 
          />

          {/* Gated Protected Admin Routes */}
          <Route path="/admin" element={<AdminRoute />}>
            <Route element={<AdminLayout />}>
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="orders" element={<OrderLog />} />
              <Route path="fleet" element={<FleetMap />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="settings" element={<Settings />} />
              {/* Redirect /admin/ or /admin to dashboard */}
              <Route path="" element={<Navigate to="dashboard" replace />} />
            </Route>
            <Route path="unauthorized" element={<Unauthorized />} />
          </Route>

          {/* Global Fallback to Public Landing Page */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
