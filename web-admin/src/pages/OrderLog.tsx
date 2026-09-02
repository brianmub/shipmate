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
    X
} from 'lucide-react';

export const OrderLog = () => {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

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

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'delivered': return 'bg-emerald-500/10 text-emerald-500';
            case 'in_progress': return 'bg-blue-500/10 text-blue-500';
            case 'pending': return 'bg-amber-500/10 text-amber-500';
            case 'cancelled': return 'bg-rose-500/10 text-rose-500';
            default: return 'bg-slate-500/10 text-slate-500';
        }
    };

    const filteredOrders = orders.filter(order => 
        order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customer?.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-white">Order Log</h1>
                    <p className="text-slate-400 mt-1">Monitor and manage all deliveries on the platform.</p>
                </div>
                <button className="bg-emerald-500 hover:bg-emerald-400 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20">
                    <Download className="w-5 h-5" />
                    Export CSV
                </button>
            </div>

            {/* Filters Bar */}
            <div className="flex gap-4 mb-8">
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
                <button className="bg-slate-800 border border-slate-700 px-4 rounded-2xl text-slate-400 hover:text-white transition-colors">
                    <Filter className="w-5 h-5" />
                </button>
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
                                onClick={() => setSelectedOrder(order)}
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
                                        {order.status.replace('_', ' ').toUpperCase()}
                                    </span>
                                </td>
                                <td className="px-6 py-5">
                                    <div className="flex items-center gap-2 max-w-[200px]">
                                        <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
                                        <span className="text-slate-400 text-sm truncate">{order.pickup_address}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-5">
                                    <p className="text-emerald-400 font-bold font-mono">${order.estimated_cost?.toFixed(2)}</p>
                                    {order.discount_amount && order.discount_amount > 0 ? (
                                        <span className="text-[10px] bg-amber-500/10 text-amber-400 font-mono px-1.5 py-0.5 rounded inline-block mt-0.5">
                                            🎁 -${order.discount_amount.toFixed(2)} ({order.promo_code || 'Promo'})
                                        </span>
                                    ) : null}
                                </td>
                                <td className="px-6 py-5 text-right">
                                    <button 
                                        className="text-slate-500 hover:text-white p-2"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedOrder(order);
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

            {/* Selected Order details modal with Proof of Delivery auditing */}
            {selectedOrder && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-[2rem] w-full max-w-4xl max-h-[90vh] overflow-y-auto relative shadow-2xl flex flex-col md:flex-row">
                        {/* Order info details */}
                        <div className="p-8 flex-1 border-r border-slate-700/50">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(selectedOrder.status)}`}>
                                        {selectedOrder.status.replace('_', ' ').toUpperCase()}
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
                                <h3 className="text-lg font-bold text-white mb-6">Proof of Delivery</h3>
                                
                                {selectedOrder.status === 'delivered' ? (
                                    <div className="space-y-6">
                                        {/* Dropoff Photo */}
                                        <div>
                                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">Delivery Photo</p>
                                            {selectedOrder.delivery_photo_url ? (
                                                <div className="rounded-xl overflow-hidden border border-slate-700 aspect-video bg-slate-900 flex items-center justify-center">
                                                    <img 
                                                        src={selectedOrder.delivery_photo_url} 
                                                        alt="Delivery Proof" 
                                                        className="w-full h-full object-cover"
                                                    />
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
                                                    No signature captured.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-12 text-slate-600 text-center">
                                        <Package className="w-12 h-12 text-slate-700 mb-3" />
                                        <p className="text-sm font-medium">Order is {selectedOrder.status.replace('_', ' ')}</p>
                                        <p className="text-xs mt-1 max-w-[200px]">Proof of delivery (photo & signature) will show up here once delivered.</p>
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
