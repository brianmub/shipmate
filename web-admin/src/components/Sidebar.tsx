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
        { icon: LayoutDashboard, label: 'Dashboard', path: '/admin/dashboard' },
        { icon: Package, label: 'Order Log', path: '/admin/orders' },
        { icon: Map, label: 'Fleet Map', path: '/admin/fleet' },
        { icon: Users, label: 'Users', path: '/admin/users' },
        { icon: Settings, label: 'Settings', path: '/admin/settings' },
    ];

    return (
        <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen sticky top-0">
            <div className="p-8 flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-blue rounded-xl flex items-center justify-center shadow-lg shadow-brand-blue/20">
                    <Ship className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-bold text-white tracking-tight flex items-center">
                    SHIP<span className="text-brand-blue font-black">MATE</span>
                </span>
            </div>

            <nav className="flex-1 px-4 py-4 space-y-2">
                {menuItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => `
                            flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200
                            ${isActive 
                                ? 'bg-brand-blue/10 text-brand-blue font-semibold' 
                                : 'text-slate-400 hover:bg-slate-800 hover:text-white'}
                        `}
                    >
                        <item.icon className="w-5 h-5" />
                        <span className="font-medium">{item.label}</span>
                    </NavLink>
                ))}
            </nav>
        </aside>
    );
};
