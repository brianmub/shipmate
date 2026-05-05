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
    Clock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const AdminDashboard = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        totalOrders: 0,
        activeOrders: 0,
        onlineDrivers: 0,
        revenue: 0
    });
    const [loading, setLoading] = useState(true);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const { data: orders, error: ordersError } = await supabase.from('orders').select('*');
            const { data: drivers, error: driversError } = await supabase.from('users').select('*').eq('role', 'driver');

            if (ordersError || driversError) throw ordersError || driversError;

            const active = orders?.filter(o => ['accepted', 'in_progress', 'picked_up'].includes(o.status)).length || 0;
            const revenue = orders?.filter(o => o.status === 'delivered').reduce((acc, o) => acc + (o.estimated_cost || 0), 0) || 0;

            setStats({
                totalOrders: orders?.length || 0,
                activeOrders: active,
                onlineDrivers: drivers?.length || 0,
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
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const StatCard = ({ title, value, icon: Icon, color, trend }: any) => (
        <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-3xl backdrop-blur-sm">
            <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-2xl ${color} bg-opacity-20`}>
                    <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
                </div>
                {trend && (
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
        <div className="min-h-screen bg-slate-900 text-slate-100 p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <header className="flex justify-between items-center mb-12">
                    <div>
                        <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">
                            Admin Dashboard
                        </h1>
                        <p className="text-slate-400">Welcome back. Here's what's happening on the platform.</p>
                    </div>
                    <button 
                        onClick={fetchStats}
                        className="p-3 bg-slate-800 border border-slate-700 rounded-2xl hover:bg-slate-700 transition-colors"
                    >
                        <RefreshCw className={`w-6 h-6 text-emerald-500 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </header>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                    <StatCard 
                        title="Active Orders" 
                        value={stats.activeOrders} 
                        icon={Clock} 
                        color="bg-emerald-500"
                        trend="+12%"
                    />
                    <StatCard 
                        title="Total Deliveries" 
                        value={stats.totalOrders} 
                        icon={Package} 
                        color="bg-blue-500"
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
                    />
                </div>

                {/* Quick Actions */}
                <h2 className="text-2xl font-bold mb-6 flex items-center">
                    <LayoutDashboard className="w-6 h-6 mr-2 text-emerald-500" />
                    Quick Actions
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <button 
                        onClick={() => navigate('/orders')}
                        className="group relative overflow-hidden bg-slate-800 border border-slate-700 p-8 rounded-3xl text-left hover:border-emerald-500/50 transition-all"
                    >
                        <div className="relative z-10">
                            <Package className="w-10 h-10 text-emerald-500 mb-4 group-hover:scale-110 transition-transform" />
                            <h3 className="text-xl font-bold mb-2">Order Log</h3>
                            <p className="text-slate-400 text-sm">Review, track, and manage all platform deliveries in real-time.</p>
                        </div>
                        <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <RefreshCw className="w-6 h-6 text-emerald-500" />
                        </div>
                    </button>

                    <button 
                        onClick={() => navigate('/fleet')}
                        className="group relative overflow-hidden bg-slate-800 border border-slate-700 p-8 rounded-3xl text-left hover:border-blue-500/50 transition-all"
                    >
                        <div className="relative z-10">
                            <MapIcon className="w-10 h-10 text-blue-500 mb-4 group-hover:scale-110 transition-transform" />
                            <h3 className="text-xl font-bold mb-2">Fleet Management</h3>
                            <p className="text-slate-400 text-sm">Live GPS tracking of all active couriers and errand runners.</p>
                        </div>
                    </button>

                    <button 
                        onClick={() => navigate('/settings')}
                        className="group relative overflow-hidden bg-slate-800 border border-slate-700 p-8 rounded-3xl text-left hover:border-amber-500/50 transition-all"
                    >
                        <div className="relative z-10">
                            <Settings className="w-10 h-10 text-amber-500 mb-4 group-hover:scale-110 transition-transform" />
                            <h3 className="text-xl font-bold mb-2">System Settings</h3>
                            <p className="text-slate-400 text-sm">Configure commission rates, delivery fees, and radius limits.</p>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
};
