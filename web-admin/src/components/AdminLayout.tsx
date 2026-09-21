import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { supabase } from '../utils/supabase';
import { 
  LogOut, 
  User, 
  ShieldCheck, 
  ChevronRight, 
  Menu, 
  Sun, 
  Moon 
} from 'lucide-react';

export const AdminLayout: React.FC = () => {
  const { user, signOut } = useAuthStore();
  const { theme, toggleTheme, initTheme } = useThemeStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    initTheme();
  }, [initTheme]);

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
    if (path.includes('/admin/approvals') || path.includes('/admin/couriers')) return 'Driver Approvals';
    if (path.includes('/admin/users')) return 'User Management';
    if (path.includes('/admin/orders')) return 'Order Log';
    if (path.includes('/admin/fleet')) return 'Fleet Map';
    if (path.includes('/admin/settings')) return 'System Settings';
    return 'Dashboard';
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex text-slate-100 font-sans relative">
      {/* Sidebar Navigation (with responsive mobile drawer support) */}
      <Sidebar 
        mobileOpen={mobileMenuOpen} 
        onCloseMobile={() => setMobileMenuOpen(false)} 
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen w-full min-w-0 overflow-hidden">
        {/* Top Premium Header */}
        <header className="h-18 sm:h-20 bg-slate-900/60 border-b border-slate-800 backdrop-blur-md px-4 sm:px-8 flex items-center justify-between sticky top-0 z-40">
          {/* Left: Mobile Menu Trigger & Breadcrumbs */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-750 transition-colors cursor-pointer shrink-0"
              title="Open Navigation"
              aria-label="Open Navigation"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium text-slate-400 truncate">
              <span className="hidden xs:inline">Admin</span>
              <ChevronRight className="hidden xs:inline w-3.5 h-3.5 text-slate-600" />
              <span className="text-white font-bold truncate">{getPageTitle()}</span>
            </div>
          </div>

          {/* Right: Theme Toggle, User Profile & Actions */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Theme Toggle Button */}
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-2 p-2.5 sm:px-3.5 sm:py-2 rounded-2xl bg-slate-800/80 border border-slate-700 hover:border-brand-blue/60 text-slate-300 hover:text-white transition-all cursor-pointer shadow-sm group"
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
              aria-label="Toggle light/dark mode"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400 group-hover:rotate-45 transition-transform" />
                  <span className="hidden md:inline text-xs font-bold text-slate-200">Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-brand-blue group-hover:-rotate-12 transition-transform" />
                  <span className="hidden md:inline text-xs font-bold text-slate-700">Dark</span>
                </>
              )}
            </button>

            {/* Admin Profile Badge */}
            <div className="hidden lg:flex items-center gap-3 bg-slate-800/80 border border-slate-700 rounded-2xl px-3.5 py-1.5">
              <div className="w-7 h-7 rounded-xl bg-brand-blue/10 flex items-center justify-center text-brand-blue">
                <User className="w-3.5 h-3.5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-white max-w-[130px] truncate">
                  {user?.email || 'Admin User'}
                </p>
                <div className="flex items-center gap-1 text-[10px] text-brand-orange font-bold uppercase tracking-wider">
                  <ShieldCheck className="w-2.5 h-2.5" />
                  Admin
                </div>
              </div>
            </div>

            {/* Logout CTA */}
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 sm:gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:text-white hover:bg-rose-500 rounded-2xl px-3 py-2 sm:px-4 sm:py-2 transition-all text-xs sm:text-sm font-semibold cursor-pointer shadow-sm"
              title="Log out"
            >
              <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Content Wrapper */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-900/30">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
