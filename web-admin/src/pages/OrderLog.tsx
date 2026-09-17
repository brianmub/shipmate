import React, { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { 
    Search, 
    Filter, 
    Download, 
    MoreHorizontal,
    Package,
    Clock,
    CheckCircle2,
    AlertCircle,
    User,
    MapPin,
    X,
    ShieldAlert,
    PhoneCall,
    Navigation,
    DollarSign,
    RotateCcw
} from 'lucide-react';

export const OrderLog = () => {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'active' | 'delivered' | 'cancelled' | 'disputed'>('all');
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
    const [selectedOrderReleases, setSelectedOrderReleases] = useState<any[]>([]);
    const [selectedOrderCalls, setSelectedOrderCalls] = useState<any[]>([]);
    const [selectedOrderDebt, setSelectedOrderDebt] = useState<any | null>(null);

    useEffect(() => {
        fetchOrders();
        
        const channel = supabase
            .channel('orders_log')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                fetchOrders();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    const fetchOrders = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('orders')
                .select('*, customer:users(full_name), driver:users(full_name)')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setOrders(data || []);
        } catch (error) {
            console.error('Error fetching orders:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectOrder = async (order: any) => {
        setSelectedOrder(order);
        setSelectedOrderReleases([]);
        setSelectedOrderCalls([]);
        setSelectedOrderDebt(null);

        // Fetch audit logs for the selected order
        try {
            const [releasesRes, callsRes, debtRes] = await Promise.all([
                supabase.from('order_releases').select('*, driver:users(full_name)').eq('order_id', order.id).order('created_at', { ascending: false }),
                supabase.from('masked_call_logs').select('*').eq('order_id', order.id).order('created_at', { ascending: true }),
                supabase.from('cancellation_debt').select('*').eq('order_id', order.id).maybeSingle(),
            ]);
            if (releasesRes.data) setSelectedOrderReleases(releasesRes.data);
            if (callsRes.data) setSelectedOrderCalls(callsRes.data);
            if (debtRes.data) setSelectedOrderDebt(debtRes.data);
        } catch (err) {
            console.warn('Error fetching order audit details:', err);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'delivered': case 'completed': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
            case 'disputed': return 'bg-purple-500/10 text-purple-400 border border-purple-500/30 font-extrabold';
            case 'cancelled': return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
            case 'pending': return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
            case 'driver_assigned': return 'bg-sky-500/10 text-sky-400 border border-sky-500/20';
            case 'en_route': case 'en_route_to_pickup': case 'en_route_to_delivery': return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
            case 'arrived': case 'arrived_at_pickup': case 'arrived_at_delivery': return 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';
            case 'picked_up': case 'in_delivery': case 'in_progress': return 'bg-teal-500/10 text-teal-400 border border-teal-500/20';
            default: return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
        }
    };

    const filteredOrders = orders.filter(order => {
        const matchesSearch = order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            order.customer?.full_name?.toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesSearch) return false;

        if (statusFilter === 'all') return true;
        if (statusFilter === 'disputed') return order.status === 'disputed';
        if (statusFilter === 'cancelled') return order.status === 'cancelled';
        if (statusFilter === 'delivered') return order.status === 'delivered' || order.status === 'completed';
        if (statusFilter === 'pending') return order.status === 'pending';
        if (statusFilter === 'active') {
            return ['driver_assigned', 'en_route_to_pickup', 'arrived_at_pickup', 'picked_up', 'en_route_to_delivery', 'arrived_at_delivery', 'en_route', 'arrived', 'in_delivery', 'in_progress'].includes(order.status);
        }
        return true;
    });

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-white">Order Log</h1>
                    <p className="text-slate-400 mt-1">Monitor deliveries, distance-based fees, releases, and disputes.</p>
                </div>
                <button className="bg-emerald-500 hover:bg-emerald-400 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20">
                    <Download className="w-5 h-5" />
                    Export CSV
                </button>
            </div>

            {/* Status Filter Tabs & Search Bar */}
            <div className="space-y-4 mb-8">
                <div className="flex flex-wrap gap-2">
                    {(['all', 'disputed', 'pending', 'active', 'delivered', 'cancelled'] as const).map((filter) => {
                        const count = orders.filter(o => {
                            if (filter === 'all') return true;
                            if (filter === 'disputed') return o.status === 'disputed';
                            if (filter === 'cancelled') return o.status === 'cancelled';
                            if (filter === 'delivered') return o.status === 'delivered' || o.status === 'completed';
                            if (filter === 'pending') return o.status === 'pending';
                            if (filter === 'active') return ['driver_assigned', 'en_route_to_pickup', 'arrived_at_pickup', 'picked_up', 'en_route_to_delivery', 'arrived_at_delivery', 'en_route', 'arrived', 'in_delivery', 'in_progress'].includes(o.status);
                            return true;
                        }).length;

                        return (
                            <button
                                key={filter}
                                onClick={() => setStatusFilter(filter)}
                                className={`px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all flex items-center gap-2 ${
                                    statusFilter === filter
                                        ? filter === 'disputed'
                                            ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/25'
                                            : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                                        : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700/60'
                                }`}
                            >
                                {filter === 'disputed' && <ShieldAlert className="w-3.5 h-3.5 text-purple-300" />}
                                {filter}
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                    statusFilter === filter ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-400'
                                }`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="flex gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                        <input 
                            type="text" 
                            placeholder="Search by Order ID or Customer Name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-2xl py-3 pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                        />
                    </div>
                </div>
            </div>

            {/* Orders Table */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-[2rem] overflow-hidden backdrop-blur-sm">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-slate-700 bg-slate-900/50">
                            <th className="px-6 py-5 text-sm font-bold text-slate-300 uppercase tracking-wider">Order Details</th>
                            <th className="px-6 py-5 text-sm font-bold text-slate-300 uppercase tracking-wider">Customer</th>
                            <th className="px-6 py-5 text-sm font-bold text-slate-300 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-5 text-sm font-bold text-slate-300 uppercase tracking-wider">Location</th>
                            <th className="px-6 py-5 text-sm font-bold text-slate-300 uppercase tracking-wider">Cost</th>
                            <th className="px-6 py-5"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-20 text-center text-slate-500">
                                    <div className="flex justify-center items-center gap-3">
                                        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                                        Loading Orders...
                                    </div>
                                </td>
                            </tr>
                        ) : filteredOrders.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-20 text-center text-slate-500">
                                    No orders found.
                                </td>
                            </tr>
                        ) : filteredOrders.map((order) => (
                            <tr 
                                key={order.id} 
                                className="hover:bg-slate-700/30 transition-colors group cursor-pointer"
                                onClick={() => handleSelectOrder(order)}
                            >
                                <td className="px-6 py-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
                                            <Package className="w-5 h-5 text-slate-400" />
                                        </div>
                                        <div>
                                            <p className="text-white font-bold">#{order.id.slice(0, 8)}</p>
                                            <p className="text-xs text-slate-500 font-medium">{new Date(order.created_at).toLocaleString()}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-5">
                                    <div className="flex items-center gap-2">
                                        <User className="w-4 h-4 text-slate-500" />
                                        <span className="text-slate-200 font-medium">{order.customer?.full_name || 'Guest'}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-5">
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(order.status)}`}>
                                        {order.status === 'disputed' ? '⚠️ DISPUTED' : order.status.replace(/_/g, ' ').toUpperCase()}
                                    </span>
                                </td>
                                <td className="px-6 py-5">
                                    <div className="flex items-center gap-2 max-w-[200px]">
                                        <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
                                        <span className="text-slate-400 text-sm truncate">{order.pickup_address}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-5">
                                    {order.status === 'cancelled' ? (
                                        <div>
                                            <p className="text-rose-400 font-bold font-mono">
                                                ${(order.cancellation_fee || 0).toFixed(2)} Fee
                                            </p>
                                            <span className="text-[10px] text-slate-400">
                                                {(order.cumulative_distance_km || 0).toFixed(1)} km traveled
                                            </span>
                                        </div>
                                    ) : (
                                        <div>
                                            <p className="text-emerald-400 font-bold font-mono">${order.estimated_cost?.toFixed(2)}</p>
                                            {order.discount_amount && order.discount_amount > 0 ? (
                                                <span className="text-[10px] bg-amber-500/10 text-amber-400 font-mono px-1.5 py-0.5 rounded inline-block mt-0.5">
                                                    🎁 -${order.discount_amount.toFixed(2)} ({order.promo_code || 'Promo'})
                                                </span>
                                            ) : null}
                                        </div>
                                    )}
                                </td>
                                <td className="px-6 py-5 text-right">
                                    <button 
                                        className="text-slate-500 hover:text-white p-2"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleSelectOrder(order);
                                        }}
                                    >
                                        <MoreHorizontal className="w-5 h-5" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Selected Order details modal with Proof of Delivery and Cancellation/Dispute Auditing */}
            {selectedOrder && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-[2rem] w-full max-w-5xl max-h-[92vh] overflow-y-auto relative shadow-2xl flex flex-col md:flex-row">
                        {/* Order info details */}
                        <div className="p-8 flex-1 border-r border-slate-700/50 space-y-6">
                            <div className="flex justify-between items-start">
                                <div>
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(selectedOrder.status)}`}>
                                        {selectedOrder.status === 'disputed' ? '⚠️ DISPUTED' : selectedOrder.status.replace(/_/g, ' ').toUpperCase()}
                                    </span>
                                    <h2 className="text-2xl font-bold text-white mt-2">Order Details</h2>
                                    <p className="text-xs text-slate-500 font-mono mt-1">ID: {selectedOrder.id}</p>
                                </div>
                                <button 
                                    className="text-slate-400 hover:text-white md:hidden"
                                    onClick={() => setSelectedOrder(null)}
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            {/* Dispute Alert Banner */}
                            {selectedOrder.status === 'disputed' && (
                                <div className="p-4 bg-purple-950/40 border border-purple-500/40 rounded-2xl">
                                    <div className="flex items-center gap-2 text-purple-300 font-bold text-sm">
                                        <ShieldAlert className="w-5 h-5 text-purple-400" />
                                        Disputed Job: Admin Mediation Required
                                    </div>
                                    <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                                        The courier proposed release compensation which the customer disputed. Review driver GPS pings and masked call attempts below before issuing resolution.
                                    </p>
                                </div>
                            )}

                            {/* Distance-Based Cancellation Details */}
                            {(selectedOrder.status === 'cancelled' || (selectedOrder.cancellation_fee && selectedOrder.cancellation_fee > 0)) && (
                                <div className="p-4 bg-rose-950/30 border border-rose-500/30 rounded-2xl space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <Navigation className="w-4 h-4" /> Distance-Based Cancellation Fee
                                        </span>
                                        <span className="text-lg font-bold font-mono text-rose-300">
                                            ${(selectedOrder.cancellation_fee || 0).toFixed(2)} USD
                                        </span>
                                    </div>
                                    <div className="text-xs text-slate-300 flex justify-between">
                                        <span>Cumulative Driver GPS Traveled:</span>
                                        <span className="font-bold text-white">{(selectedOrder.cumulative_distance_km || 0).toFixed(2)} km</span>
                                    </div>
                                    {selectedOrderDebt && (
                                        <div className="text-xs flex justify-between pt-1 border-t border-rose-500/20">
                                            <span>Debt Status:</span>
                                            <span className={`font-bold ${selectedOrderDebt.is_settled ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                {selectedOrderDebt.is_settled ? '✅ Settled' : '⏳ Unsettled (Customer blocked from new orders)'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="space-y-4">
                                <div>
                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Service Type</p>
                                    <p className="text-white capitalize">{selectedOrder.service_type}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Customer</p>
                                        <p className="text-white font-medium">{selectedOrder.customer?.full_name || 'Guest'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Driver / Mate</p>
                                        <p className="text-white font-medium">{selectedOrder.driver?.full_name || 'Not assigned'}</p>
                                    </div>
                                </div>

                                {selectedOrder.recipient_name && (
                                    <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-700/60">
                                        <div className="flex justify-between items-center">
                                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Recipient Contact</p>
                                            {selectedOrder.sms_notifications_enabled ? (
                                                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-bold px-2 py-0.5 rounded border border-emerald-500/20">
                                                    📲 Paid SMS (+${selectedOrder.sms_notification_fee?.toFixed(2) || '0.25'})
                                                </span>
                                            ) : (
                                                <span className="text-[10px] bg-slate-800 text-slate-400 font-semibold px-2 py-0.5 rounded">
                                                    In-App Only
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-white font-medium text-sm mt-1">{selectedOrder.recipient_name} {selectedOrder.recipient_phone ? `(${selectedOrder.recipient_phone})` : ''}</p>
                                        {selectedOrder.recipient_notes && (
                                            <p className="text-xs text-slate-400 mt-1 italic">"{selectedOrder.recipient_notes}"</p>
                                        )}
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <div>
                                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Pickup Address</p>
                                        <p className="text-slate-300 text-sm">{selectedOrder.pickup_address}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Dropoff Address</p>
                                        <p className="text-slate-300 text-sm">{selectedOrder.dropoff_address}</p>
                                    </div>
                                </div>

                                <div className="border-t border-slate-700/50 pt-4 grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Estimated Cost</p>
                                        <p className="text-xl font-bold text-emerald-400 font-mono">${selectedOrder.estimated_cost?.toFixed(2)}</p>
                                        {selectedOrder.discount_amount && selectedOrder.discount_amount > 0 ? (
                                            <p className="text-xs text-amber-400 font-semibold mt-1">
                                                🎁 Promo Discount: -${selectedOrder.discount_amount.toFixed(2)} ({selectedOrder.promo_code || 'Voucher'})
                                            </p>
                                        ) : null}
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Created At</p>
                                        <p className="text-white text-sm">{new Date(selectedOrder.created_at).toLocaleString()}</p>
                                    </div>
                                </div>

                                {/* Release Audit History */}
                                {selectedOrderReleases.length > 0 && (
                                    <div className="border-t border-slate-700/50 pt-4">
                                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                            <RotateCcw className="w-3.5 h-3.5" /> Order Release History ({selectedOrderReleases.length})
                                        </p>
                                        <div className="space-y-2">
                                            {selectedOrderReleases.map((release) => (
                                                <div key={release.id} className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 text-xs">
                                                    <div className="flex justify-between items-start">
                                                        <span className="font-bold text-white capitalize">
                                                            {release.reason?.replace(/_/g, ' ')}
                                                        </span>
                                                        <span className="text-rose-400 font-bold font-mono">
                                                            {release.rating_penalty_applied ? `-${release.rating_penalty_applied} rating` : 'No penalty'}
                                                        </span>
                                                    </div>
                                                    <div className="text-slate-400 mt-1 flex justify-between">
                                                        <span>Proposed Compensation:</span>
                                                        <span className="text-white font-mono font-bold">${(release.proposed_compensation || 0).toFixed(2)}</span>
                                                    </div>
                                                    <div className="text-slate-400 flex justify-between mt-0.5">
                                                        <span>Customer Response:</span>
                                                        <span className={`font-bold capitalize ${
                                                            release.customer_response === 'accepted' ? 'text-emerald-400' :
                                                            release.customer_response === 'disputed' ? 'text-purple-400' : 'text-amber-400'
                                                        }`}>
                                                            {release.customer_response || 'Pending'}
                                                        </span>
                                                    </div>
                                                    {release.auto_flagged && (
                                                        <p className="mt-1 text-rose-400 font-bold">
                                                            ⚠️ Auto-Flagged: Released without fulfilling anti-abuse prerequisites.
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Masked Call Logs Audit */}
                                {selectedOrderCalls.length > 0 && (
                                    <div className="border-t border-slate-700/50 pt-4">
                                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                            <PhoneCall className="w-3.5 h-3.5" /> Masked Call Attempts ({selectedOrderCalls.length})
                                        </p>
                                        <div className="space-y-1.5">
                                            {selectedOrderCalls.map((call, idx) => (
                                                <div key={call.id} className="flex justify-between items-center p-2 bg-slate-800/50 rounded-lg text-xs">
                                                    <span className="text-slate-300">
                                                        #{idx + 1} • {call.call_type?.replace(/_/g, ' ')} ({call.caller_role})
                                                    </span>
                                                    <span className="text-slate-400 font-mono">
                                                        {new Date(call.created_at).toLocaleTimeString()}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Proof of Delivery column */}
                        <div className="p-8 flex-1 bg-slate-950/40 flex flex-col justify-between relative">
                            <button 
                                className="absolute right-6 top-6 text-slate-400 hover:text-white hidden md:block"
                                onClick={() => setSelectedOrder(null)}
                            >
                                <X className="w-6 h-6" />
                            </button>

                            <div>
                                <h3 className="text-lg font-bold text-white mb-4">Delivery Handover & Proof</h3>
                                
                                {/* 4-Digit Handover PIN Card */}
                                <div className="mb-6 p-4 rounded-xl bg-slate-900 border border-slate-800">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-base">🔐</span>
                                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Handover PIN (OTP)</p>
                                        </div>
                                        {selectedOrder.pin_verified_at ? (
                                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                Verified & Confirmed
                                            </span>
                                        ) : selectedOrder.pin_locked ? (
                                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                                Locked (3 Failed Attempts)
                                            </span>
                                        ) : selectedOrder.handover_pin ? (
                                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                Active Handover PIN
                                            </span>
                                        ) : (
                                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 text-slate-400">
                                                Not Generated
                                            </span>
                                        )}
                                    </div>

                                    {selectedOrder.handover_pin ? (
                                        <div className="flex items-center gap-2 my-2">
                                            {selectedOrder.handover_pin.split('').map((char, i) => (
                                                <div 
                                                    key={i} 
                                                    className={`w-10 h-12 rounded-lg flex items-center justify-center font-mono font-bold text-lg border ${
                                                        selectedOrder.pin_verified_at 
                                                            ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                                                            : selectedOrder.pin_locked
                                                            ? 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                                                            : 'bg-slate-800 border-slate-700 text-blue-400'
                                                    }`}
                                                >
                                                    {char}
                                                </div>
                                            ))}
                                            <div className="ml-3 text-xs text-slate-400">
                                                {selectedOrder.pin_verified_at ? (
                                                    <p className="text-emerald-400 font-medium">Handover confirmed via customer's in-app PIN</p>
                                                ) : selectedOrder.pin_locked ? (
                                                    <p className="text-rose-400 font-medium">Flagged for review — Fallback to photo proof</p>
                                                ) : (
                                                    <p>Attempts: {selectedOrder.pin_attempts_count || 0}/3 used</p>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-500">PIN generated automatically when driver is assigned.</p>
                                    )}

                                    {selectedOrder.pin_failed_flagged && (
                                        <div className="mt-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center gap-2 text-xs text-rose-300">
                                            <span>⚠️</span>
                                            <span><strong>Security Alert:</strong> 3 incorrect PIN attempts exceeded. Order flagged for admin review.</span>
                                        </div>
                                    )}
                                </div>

                                {(selectedOrder.status === 'delivered' || selectedOrder.status === 'completed' || selectedOrder.delivery_photo_url) ? (
                                    <div className="space-y-6">
                                        {/* Dropoff Photo */}
                                        <div>
                                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">
                                                Delivery Photo {selectedOrder.pin_locked ? '(Photo Fallback)' : ''}
                                            </p>
                                            {selectedOrder.delivery_photo_url ? (
                                                <div className="rounded-xl overflow-hidden border border-slate-700 aspect-video bg-slate-900 flex items-center justify-center">
                                                    <img 
                                                        src={selectedOrder.delivery_photo_url} 
                                                        alt="Delivery Proof" 
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                            ) : selectedOrder.pin_verified_at ? (
                                                <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-4 text-center text-xs text-emerald-400">
                                                    ✅ Verified via 4-Digit Handover PIN. Photo proof was not required.
                                                </div>
                                            ) : (
                                                <div className="rounded-xl border border-slate-800 p-4 text-center text-xs text-slate-600">
                                                    No photo proof uploaded.
                                                </div>
                                            )}
                                        </div>

                                        {/* Recipient Signature */}
                                        <div>
                                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">Recipient Signature</p>
                                            {selectedOrder.delivery_signature_url ? (
                                                <div className="rounded-xl bg-white p-4 border border-slate-700 flex items-center justify-center h-28">
                                                    <img 
                                                        src={selectedOrder.delivery_signature_url} 
                                                        alt="Recipient Signature" 
                                                        className="max-h-full max-w-full object-contain filter invert-0"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="rounded-xl border border-slate-800 p-4 text-center text-xs text-slate-600">
                                                    {selectedOrder.pin_verified_at ? 'PIN authentication provided primary proof.' : 'No signature captured.'}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-12 text-slate-600 text-center">
                                        <Package className="w-12 h-12 text-slate-700 mb-3" />
                                        <p className="text-sm font-medium">Order is {selectedOrder.status.replace(/_/g, ' ')}</p>
                                        <p className="text-xs mt-1 max-w-[220px]">Handover PIN is active in customer app. Proof details will finalize upon arrival.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
