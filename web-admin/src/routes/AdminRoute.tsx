import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children?: React.ReactNode;
}

export const AdminRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { session, role, initialized } = useAuthStore();

  if (!initialized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0F172A] text-slate-100">
        <Loader2 className="w-12 h-12 text-brand-blue animate-spin mb-4" />
        <p className="text-slate-400 font-medium animate-pulse">Initializing session...</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/admin/login" replace />;
  }

  if (role !== 'admin') {
    return <Navigate to="/admin/unauthorized" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
