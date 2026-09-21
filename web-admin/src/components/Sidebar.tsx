import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
    LayoutDashboard, 
    ShieldCheck,
    Package, 
    Users, 
    Settings, 
    Ship,
    Map,
    X
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../utils/supabase';

interface SidebarProps {
    mobileOpen?: boolean;
    onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen = false, onCloseMobile }) => {
    const { signOut } = useAuthStore();
    const [pendingApprovals, setPendingApprovals] = useState<number>(0);

    const fetchPendingApprovals = async () => {
        try {
            const { data, error } = await supabase
                .from('drivers')
                .select('id')
                .in('verification_status', ['pending', 'submitted']);
            if (data && !error) {
                setPendingApprovals(data.length);
            }
        } catch (err) {
            console.warn('Error fetching pending approvals:', err);
        }
    };

    useEffect(() => {
        fetchPendingApprovals();

        const channel = supabase
            .channel('sidebar_pending_approvals')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
                fetchPendingApprovals();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_documents' }, () => {
                fetchPendingApprovals();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const menuItems = [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/admin/dashboard' },
        { 
            icon: ShieldCheck, 
            label: 'Driver Approvals', 
            path: '/admin/approvals', 
            badge: pendingApprovals,
            badgeColor: 'bg-amber-400 text-slate-950 font-black'
        },
        { icon: Package, label: 'Order Log', path: '/admin/orders' },
        { icon: Map, label: 'Fleet Map', path: '/admin/fleet' },
        { icon: Users, label: 'Users', path: '/admin/users' },
        { icon: Settings, label: 'Settings', path: '/admin/settings' },
    ];

    const handleLinkClick = () => {
        if (onCloseMobile) {
            onCloseMobile();
        }
    };

    return (
        <>
            {/* Mobile Backdrop Overlay */}
            {mobileOpen && (
                <div 
                    onClick={onCloseMobile}
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-45 md:hidden transition-opacity animate-in fade-in duration-200"
                    aria-hidden="true"
                />
            )}

            {/* Sidebar Navigation Container */}
            <aside 
                className={`
                    w-72 md:w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen shrink-0
                    fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out
                    md:sticky md:top-0 md:translate-x-0
                    ${mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}
                `}
            >
                {/* Brand Logo & Close Button */}
                <div className="p-6 md:p-8 flex items-center justify-between border-b border-slate-800/40 md:border-b-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-brand-blue rounded-xl flex items-center justify-center shadow-lg shadow-brand-blue/20">
                            <Ship className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-xl font-bold text-white tracking-tight flex items-center">
                            SHIP<span className="text-brand-blue font-black">MATE</span>
                        </span>
                    </div>

                    {/* Mobile Close Button */}
                    <button
                        onClick={onCloseMobile}
                        className="md:hidden p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-850 transition-colors cursor-pointer"
                        title="Close menu"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Nav Links */}
                <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
                    {menuItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={handleLinkClick}
                            className={({ isActive }) => `
                                flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-200
                                ${isActive 
                                    ? 'bg-brand-blue/10 text-brand-blue font-semibold ring-1 ring-brand-blue/20' 
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'}
                            `}
                        >
                            <div className="flex items-center gap-3">
                                <item.icon className="w-5 h-5 shrink-0" />
                                <span className="font-medium text-sm">{item.label}</span>
                            </div>
                            {Boolean(item.badge && item.badge > 0) && (
                                <span className={`text-[11px] px-2 py-0.5 rounded-full animate-pulse shadow-sm ${item.badgeColor || 'bg-brand-blue text-white'}`}>
                                    {item.badge}
                                </span>
                            )}
                        </NavLink>
                    ))}
                </nav>
            </aside>
        </>
    );
};
