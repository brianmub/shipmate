import React from 'react';
import { ShieldAlert, LogOut, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../utils/supabase';

export const Unauthorized = () => {
  const navigate = useNavigate();
  const { signOut } = useAuthStore();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    signOut();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F172A] p-4 text-slate-100">
      <div className="w-full max-w-md bg-slate-800/50 border border-slate-700 p-10 rounded-[2.5rem] backdrop-blur-xl shadow-2xl text-center">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-rose-500/10 animate-bounce">
            <ShieldAlert className="w-10 h-10" />
          </div>
        </div>

        <h1 className="text-3xl font-extrabold text-white tracking-tight mb-3">Access Denied</h1>
        <p className="text-slate-400 mb-8 leading-relaxed">
          Your account is not authorized to access the Shipmate Admin Portal. Admin permissions are required.
        </p>

        <div className="space-y-4">
          <button
            onClick={() => navigate('/')}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-4 rounded-2xl border border-slate-700 transition-all flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-5 h-5" />
            Go to Landing Page
          </button>
          
          <button
            onClick={handleLogout}
            className="w-full bg-rose-500 hover:bg-rose-600 text-white font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-2"
          >
            <LogOut className="w-5 h-5" />
            Sign Out & Try Again
          </button>
        </div>
      </div>
    </div>
  );
};
