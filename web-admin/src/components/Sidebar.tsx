import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
    LayoutDashboard, 
    Package, 
    Users, 
    Settings, 
    LogOut,
    Ship,
    Map
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export const Sidebar = () => {
    const { signOut } = useAuthStore();

    const menuItems = [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
        { icon: Package, label: 'Order Log', path: '/orders' },
        { icon: Map, label: 'Fleet Map', path: '/fleet' },
        { icon: Settings, label: 'Settings', path: '/settings' },
    ];

    return (
        <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen sticky top-0">
            <div className="p-8 flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <Ship className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-bold text-white tracking-tight">ShipMate</span>
            </div>

            <nav className="flex-1 px-4 py-4 space-y-2">
                {menuItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => `
                            flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200
                            ${isActive 
                                ? 'bg-emerald-500/10 text-emerald-500' 
                                : 'text-slate-400 hover:bg-slate-800 hover:text-white'}
                        `}
                    >
                        <item.icon className="w-5 h-5" />
                        <span className="font-medium">{item.label}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="p-4 border-t border-slate-800">
                <button 
                    onClick={signOut}
                    className="flex items-center gap-3 w-full px-4 py-3 text-slate-400 hover:text-rose-400 hover:bg-rose-500/5 rounded-2xl transition-all"
                >
                    <LogOut className="w-5 h-5" />
                    <span className="font-medium">Logout</span>
                </button>
            </div>
        </aside>
    );
};
