import React, { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { 
    Navigation, 
    Shield, 
    Zap, 
    Search,
    Map as MapIcon,
    Circle,
    User,
    Info
} from 'lucide-react';

export const FleetMap = () => {
    const [drivers, setDrivers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDrivers();
        
        const channel = supabase
            .channel('fleet_tracking')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
                fetchDrivers();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    const fetchDrivers = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('drivers')
                .select('*, user:users(full_name)');

            if (error) throw error;
            setDrivers(data || []);
        } catch (error) {
            console.error('Error fetching fleet:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 h-screen flex flex-col">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
                        <Navigation className="w-8 h-8 text-emerald-500" />
                        Fleet Control
                    </h1>
                    <p className="text-slate-400 mt-1">Live tracking and status of all active couriers.</p>
                </div>
                <div className="flex bg-slate-800 border border-slate-700 rounded-2xl p-1">
                    <button className="px-6 py-2 bg-emerald-500 text-white rounded-xl font-bold text-sm transition-all">Map View</button>
                    <button className="px-6 py-2 text-slate-400 hover:text-white rounded-xl font-bold text-sm transition-all">List View</button>
                </div>
            </div>

            <div className="flex-1 flex gap-8 min-h-0">
                {/* High-Tech Radar Visualization */}
                <div className="flex-[2] bg-slate-900 border border-slate-800 rounded-[3rem] relative overflow-hidden shadow-inner">
                    {/* Radar Circles */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-10">
                        <div className="w-[80%] aspect-square border border-emerald-500 rounded-full animate-[ping_10s_infinite]"></div>
                        <div className="w-[60%] aspect-square border border-emerald-500 rounded-full"></div>
                        <div className="w-[40%] aspect-square border border-emerald-500 rounded-full"></div>
                        <div className="w-[20%] aspect-square border border-emerald-500 rounded-full"></div>
                        {/* Grid Lines */}
                        <div className="absolute w-full h-[1px] bg-emerald-500"></div>
                        <div className="absolute h-full w-[1px] bg-emerald-500"></div>
                    </div>

                    {/* Scanning Line */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-1/2 h-[2px] bg-gradient-to-r from-transparent to-emerald-500/50 origin-left animate-[spin_4s_linear_infinite]"></div>
                    </div>

                    {/* Driver Dots (Real GPS Positions & Status) */}
                    <div className="absolute inset-0">
                        {drivers.map((driver, index) => {
                            const centerLat = -17.8248;
                            const centerLng = 31.0530;
                            let left = 30 + (index * 15) % 60;
                            let top = 20 + (index * 25) % 60;

                            if (driver.current_latitude && driver.current_longitude) {
                                const latDiff = (driver.current_latitude - centerLat) / 0.12;
                                const lngDiff = (driver.current_longitude - centerLng) / 0.12;
                                left = Math.max(8, Math.min(92, 50 + lngDiff * 40));
                                top = Math.max(8, Math.min(92, 50 - latDiff * 40));
                            }

                            return (
                                <div 
                                    key={driver.id}
                                    className="absolute group cursor-pointer -translate-x-1/2 -translate-y-1/2"
                                    style={{ 
                                        left: `${left}%`, 
                                        top: `${top}%` 
                                    }}
                                >
                                    <div className={`w-4 h-4 rounded-full ${driver.is_online ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.7)] animate-pulse' : 'bg-slate-500'} border-2 border-slate-900`}></div>
                                    {/* Tooltip */}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 bg-slate-800 border border-slate-700 p-2.5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
                                        <p className="text-white text-xs font-bold truncate">{driver.user?.full_name || 'Courier'}</p>
                                        <div className="flex items-center justify-between mt-1 text-[10px]">
                                            <span className={`capitalize font-semibold ${driver.is_online ? 'text-emerald-400' : 'text-slate-400'}`}>
                                                {driver.is_online ? '● Online' : '○ Offline'}
                                            </span>
                                            <span className="text-slate-400">{driver.tier || 'Standard'}</span>
                                        </div>
                                        {driver.current_latitude && driver.current_longitude && (
                                            <p className="text-[9px] text-slate-400 mt-1 font-mono">
                                                {driver.current_latitude.toFixed(4)}, {driver.current_longitude.toFixed(4)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="absolute bottom-8 left-8 bg-slate-900/80 backdrop-blur-md border border-slate-700 p-4 rounded-2xl flex gap-6 text-xs font-bold uppercase tracking-widest">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                            <span className="text-emerald-500">Online</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            <span className="text-blue-500">Active</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-slate-600 rounded-full"></div>
                            <span className="text-slate-500">Offline</span>
                        </div>
                    </div>
                </div>

                {/* Sidebar Driver List */}
                <div className="flex-1 bg-slate-800/30 border border-slate-700 rounded-[2.5rem] flex flex-col min-w-[350px]">
                    <div className="p-6 border-b border-slate-700">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input 
                                type="text" 
                                placeholder="Search couriers..."
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                            />
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-auto p-4 space-y-3">
                        {drivers.map(driver => (
                            <div key={driver.id} className="bg-slate-800 border border-slate-700 p-4 rounded-2xl flex items-center justify-between group hover:border-emerald-500/30 transition-all cursor-pointer">
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <div className="w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center">
                                            <User className="w-5 h-5 text-slate-400" />
                                        </div>
                                        <div className={`absolute bottom-0 right-0 w-3 h-3 border-2 border-slate-800 rounded-full ${driver.is_online ? 'bg-emerald-500' : 'bg-slate-500'}`}></div>
                                    </div>
                                    <div>
                                        <p className="text-white font-bold text-sm">{driver.user?.full_name}</p>
                                        <p className="text-slate-400 text-xs">Toyota Corolla • {driver.id.slice(0, 5)}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-white font-mono text-xs font-bold">4.9 ★</p>
                                    <p className="text-emerald-500 text-[10px] font-bold">READY</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-6 bg-slate-900/50 rounded-b-[2.5rem] border-t border-slate-700">
                        <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-tighter">
                            <span>Total Fleet</span>
                            <span className="text-white">{drivers.length} Vehicles</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
