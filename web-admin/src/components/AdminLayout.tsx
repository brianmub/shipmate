import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../utils/supabase';
import { LogOut, User, ShieldCheck, ChevronRight } from 'lucide-react';

export const AdminLayout: React.FC = () => {
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      signOut();
      navigate('/admin/login');
    } catch (err) {
      console.error('Logout error:', err);
      // Fallback
      signOut();
      navigate('/admin/login');
    }
  };

  // Determine current page title based on path
  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes('/admin/orders')) return 'Order Log';
    if (path.includes('/admin/fleet')) return 'Fleet Map';
    if (path.includes('/admin/settings')) return 'System Settings';
    return 'Dashboard';
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex text-slate-100 font-sans">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Top Premium Header */}
        <header className="h-20 bg-slate-900/60 border-b border-slate-800 backdrop-blur-md px-8 flex items-center justify-between sticky top-0 z-40">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 text-sm font-medium text-slate-400">
            <span>Admin</span>
            <ChevronRight className="w-4 h-4 text-slate-600" />
            <span className="text-white font-semibold">{getPageTitle()}</span>
          </div>

          {/* User & Actions */}
          <div className="flex items-center gap-6">
            {/* Admin Badge */}
            <div className="hidden sm:flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-2xl px-4 py-2">
              <div className="w-8 h-8 rounded-xl bg-brand-blue/10 flex items-center justify-center text-brand-blue">
                <User className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-white max-w-[150px] truncate">
                  {user?.email || 'Admin User'}
                </p>
                <div className="flex items-center gap-1 text-[10px] text-brand-orange font-bold uppercase tracking-wider">
                  <ShieldCheck className="w-3 h-3" />
                  Admin
                </div>
              </div>
            </div>

            {/* Logout CTA */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:text-white hover:bg-rose-500 rounded-2xl px-5 py-2.5 transition-all text-sm font-semibold cursor-pointer shadow-lg shadow-rose-500/5"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </header>

        {/* Content Wrapper */}
        <main className="flex-1 overflow-auto bg-slate-900/30">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
