import React, { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { 
    LayoutDashboard, 
    Users, 
    Package, 
    DollarSign, 
    Map as MapIcon, 
    Settings, 
    RefreshCw, 
    TrendingUp, 
    Clock,
    ShieldCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const AdminDashboard = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        totalOrders: 0,
        activeOrders: 0,
        onlineDrivers: 0,
        pendingApprovals: 0,
        revenue: 0
    });
    const [loading, setLoading] = useState(true);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const [
                { data: orders, error: ordersError },
                { data: drivers, error: driversError },
                { data: pendingDrivers }
            ] = await Promise.all([
                supabase.from('orders').select('*'),
                supabase.from('users').select('*').eq('role', 'driver'),
                supabase.from('drivers').select('id').in('verification_status', ['pending', 'submitted'])
            ]);

            if (ordersError || driversError) throw ordersError || driversError;

            const active = orders?.filter(o => ['accepted', 'in_progress', 'picked_up'].includes(o.status)).length || 0;
            const revenue = orders?.filter(o => o.status === 'delivered').reduce((acc, o) => acc + (o.estimated_cost || 0), 0) || 0;

            setStats({
                totalOrders: orders?.length || 0,
                activeOrders: active,
                onlineDrivers: drivers?.length || 0,
                pendingApprovals: pendingDrivers?.length || 0,
                revenue: revenue
            });
        } catch (error) {
            console.error('Error fetching admin stats:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
        
        const channel = supabase
            .channel('admin_stats')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                fetchStats();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
                fetchStats();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_documents' }, () => {
                fetchStats();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const StatCard = ({ title, value, icon: Icon, color, trend, badge, onClick }: any) => (
        <div 
            onClick={onClick}
            className={`bg-slate-800/50 border border-slate-700 p-6 rounded-3xl backdrop-blur-sm transition-all ${
                onClick ? 'cursor-pointer hover:border-slate-600 hover:bg-slate-800/70' : ''
            }`}
        >
            <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-2xl ${color} bg-opacity-20`}>
                    <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
                </div>
                {badge && (
                    <span className="bg-amber-400 text-slate-950 font-black text-xs px-2.5 py-1 rounded-full animate-pulse">
                        {badge}
                    </span>
                )}
                {trend && !badge && (
                    <span className="text-emerald-400 text-sm font-medium flex items-center">
                        <TrendingUp className="w-4 h-4 mr-1" />
                        {trend}
                    </span>
                )}
            </div>
            <p className="text-slate-400 text-sm font-medium mb-1">{title}</p>
            <h3 className="text-2xl font-bold text-white">{value}</h3>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 sm:mb-12">
                    <div>
                        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white mb-1 sm:mb-2">
                            Admin Dashboard
                        </h1>
                        <p className="text-slate-400 text-sm">Welcome back. Here's what's happening on the platform.</p>
                    </div>
                    <button 
                        onClick={fetchStats}
                        className="p-2.5 sm:p-3 bg-slate-800 border border-slate-700 rounded-2xl hover:bg-slate-700 transition-colors cursor-pointer self-end sm:self-auto"
                        title="Refresh Stats"
                    >
                        <RefreshCw className={`w-5 h-5 text-emerald-500 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </header>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 sm:gap-6 mb-8 sm:mb-12">
                    <StatCard 
                        title="Pending Approvals" 
                        value={stats.pendingApprovals} 
                        icon={ShieldCheck} 
                        color="bg-amber-500"
                        badge={stats.pendingApprovals > 0 ? `${stats.pendingApprovals} Action Required` : undefined}
                        onClick={() => navigate('/admin/approvals')}
                    />
                    <StatCard 
                        title="Active Orders" 
                        value={stats.activeOrders} 
                        icon={Clock} 
                        color="bg-emerald-500"
                        trend="+12%"
                        onClick={() => navigate('/admin/orders')}
                    />
                    <StatCard 
                        title="Total Deliveries" 
                        value={stats.totalOrders} 
                        icon={Package} 
                        color="bg-blue-500"
                        onClick={() => navigate('/admin/orders')}
                    />
                    <StatCard 
                        title="Total Revenue" 
                        value={`$${stats.revenue.toLocaleString()}`} 
                        icon={DollarSign} 
                        color="bg-amber-500"
                        trend="+8%"
                    />
                    <StatCard 
                        title="Registered Drivers" 
                        value={stats.onlineDrivers} 
                        icon={Users} 
                        color="bg-rose-500"
                        onClick={() => navigate('/admin/users')}
                    />
                </div>

                {/* Quick Actions */}
                <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 flex items-center">
                    <LayoutDashboard className="w-5 h-5 sm:w-6 sm:h-6 mr-2 text-emerald-500" />
                    Quick Actions
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
                    {/* Driver Approvals Quick Action */}
                    <button 
                        onClick={() => navigate('/admin/approvals')}
                        className="group relative overflow-hidden bg-slate-800 border border-slate-700 p-5 sm:p-7 rounded-3xl text-left hover:border-amber-500/50 hover:bg-slate-800/80 transition-all cursor-pointer"
                    >
                        <div className="relative z-10">
                            <div className="flex items-center justify-between mb-3 sm:mb-4">
                                <ShieldCheck className="w-8 h-8 sm:w-10 sm:h-10 text-amber-400 group-hover:scale-110 transition-transform" />
                                {stats.pendingApprovals > 0 && (
                                    <span className="bg-amber-400 text-slate-950 font-black text-xs px-2.5 py-1 rounded-full animate-pulse">
                                        {stats.pendingApprovals} Pending
                                    </span>
                                )}
                            </div>
                            <h3 className="text-lg sm:text-xl font-bold mb-1.5 text-white">Driver Approvals</h3>
                            <p className="text-slate-400 text-xs sm:text-sm">Review submitted IDs, licenses, vehicle inspection photos, and activate couriers.</p>
                        </div>
                    </button>

                    <button 
                        onClick={() => navigate('/admin/orders')}
                        className="group relative overflow-hidden bg-slate-800 border border-slate-700 p-5 sm:p-7 rounded-3xl text-left hover:border-emerald-500/50 hover:bg-slate-800/80 transition-all cursor-pointer"
                    >
                        <div className="relative z-10">
                            <Package className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-500 mb-3 sm:mb-4 group-hover:scale-110 transition-transform" />
                            <h3 className="text-lg sm:text-xl font-bold mb-1.5 text-white">Order Log</h3>
                            <p className="text-slate-400 text-xs sm:text-sm">Review, track, and manage all platform deliveries in real-time.</p>
                        </div>
                    </button>

                    <button 
                        onClick={() => navigate('/admin/fleet')}
                        className="group relative overflow-hidden bg-slate-800 border border-slate-700 p-5 sm:p-7 rounded-3xl text-left hover:border-blue-500/50 hover:bg-slate-800/80 transition-all cursor-pointer"
                    >
                        <div className="relative z-10">
                            <MapIcon className="w-8 h-8 sm:w-10 sm:h-10 text-blue-500 mb-3 sm:mb-4 group-hover:scale-110 transition-transform" />
                            <h3 className="text-lg sm:text-xl font-bold mb-1.5 text-white">Fleet Management</h3>
                            <p className="text-slate-400 text-xs sm:text-sm">Live GPS tracking of all active couriers and errand runners.</p>
                        </div>
                    </button>

                    <button 
                        onClick={() => navigate('/admin/settings')}
                        className="group relative overflow-hidden bg-slate-800 border border-slate-700 p-5 sm:p-7 rounded-3xl text-left hover:border-amber-500/50 hover:bg-slate-800/80 transition-all cursor-pointer"
                    >
                        <div className="relative z-10">
                            <Settings className="w-8 h-8 sm:w-10 sm:h-10 text-amber-500 mb-3 sm:mb-4 group-hover:scale-110 transition-transform" />
                            <h3 className="text-lg sm:text-xl font-bold mb-1.5 text-white">System Settings</h3>
                            <p className="text-slate-400 text-xs sm:text-sm">Configure commission rates, delivery fees, and radius limits.</p>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
};

