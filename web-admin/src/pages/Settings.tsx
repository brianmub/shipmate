import React, { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { 
    Save, 
    RefreshCw, 
    Shield, 
    DollarSign, 
    MapPin, 
    Bell,
    CheckCircle2
} from 'lucide-react';

export const Settings = () => {
    const [settings, setSettings] = useState({
        commission_rate: 15,
        base_delivery_fee: 5.00,
        per_km_rate: 1.50,
        max_driver_radius: 10,
        min_payout_threshold: 50.00
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('system_settings')
                .select('*')
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            if (data) setSettings(data);
        } catch (error) {
            console.error('Error fetching settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setSuccess(false);
            const { error } = await supabase
                .from('system_settings')
                .upsert({ id: 1, ...settings });

            if (error) throw error;
            
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (error) {
            console.error('Error saving settings:', error);
            alert('Failed to save settings. Check if the "system_settings" table exists.');
        } finally {
            setSaving(false);
        }
    };

    const SettingGroup = ({ title, icon: Icon, children }: any) => (
        <div className="bg-slate-800/50 border border-slate-700 rounded-3xl p-8 backdrop-blur-sm mb-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-slate-900 rounded-2xl">
                    <Icon className="w-6 h-6 text-emerald-500" />
                </div>
                <h3 className="text-xl font-bold text-white">{title}</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {children}
            </div>
        </div>
    );

    const InputField = ({ label, value, onChange, prefix, suffix }: any) => (
        <div className="space-y-2">
            <label className="text-sm font-medium text-slate-400 ml-1">{label}</label>
            <div className="relative">
                {prefix && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">{prefix}</span>}
                <input 
                    type="number" 
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    className={`w-full bg-slate-900 border border-slate-700 rounded-2xl py-4 ${prefix ? 'pl-10' : 'pl-4'} pr-12 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono`}
                />
                {suffix && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium text-sm">{suffix}</span>}
            </div>
        </div>
    );

    return (
        <div className="p-8 max-w-4xl">
            <div className="flex justify-between items-center mb-12">
                <div>
                    <h1 className="text-3xl font-extrabold text-white">System Settings</h1>
                    <p className="text-slate-400 mt-1">Configure global platform parameters and fees.</p>
                </div>
                <div className="flex gap-4">
                    <button 
                        onClick={fetchSettings}
                        className="p-4 bg-slate-800 border border-slate-700 rounded-2xl text-slate-400 hover:text-white transition-colors"
                    >
                        <RefreshCw className={`w-6 h-6 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button 
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
                    >
                        {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        {success ? 'Saved!' : 'Save Changes'}
                    </button>
                </div>
            </div>

            {success && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-2xl flex items-center gap-3 mb-8 animate-in fade-in slide-in-from-top-4">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Settings updated successfully! These changes are now live across the platform.</span>
                </div>
            )}

            <div className="space-y-6">
                <SettingGroup title="Financials & Commissions" icon={DollarSign}>
                    <InputField 
                        label="Platform Commission" 
                        value={settings.commission_rate}
                        onChange={(val: any) => setSettings({...settings, commission_rate: val})}
                        suffix="%"
                    />
                    <InputField 
                        label="Minimum Payout" 
                        value={settings.min_payout_threshold}
                        onChange={(val: any) => setSettings({...settings, min_payout_threshold: val})}
                        prefix="$"
                    />
                </SettingGroup>

                <SettingGroup title="Pricing Engine" icon={Shield}>
                    <InputField 
                        label="Base Delivery Fee" 
                        value={settings.base_delivery_fee}
                        onChange={(val: any) => setSettings({...settings, base_delivery_fee: val})}
                        prefix="$"
                    />
                    <InputField 
                        label="Per Kilometer Rate" 
                        value={settings.per_km_rate}
                        onChange={(val: any) => setSettings({...settings, per_km_rate: val})}
                        prefix="$"
                        suffix="/ km"
                    />
                </SettingGroup>

                <SettingGroup title="Logistics & Dispatch" icon={MapPin}>
                    <InputField 
                        label="Max Search Radius" 
                        value={settings.max_driver_radius}
                        onChange={(val: any) => setSettings({...settings, max_driver_radius: val})}
                        suffix="KM"
                    />
                </SettingGroup>

                <div className="bg-amber-500/10 border border-amber-500/20 p-6 rounded-3xl flex gap-4">
                    <Bell className="w-6 h-6 text-amber-500 shrink-0" />
                    <div>
                        <p className="text-amber-500 font-bold">Important Notice</p>
                        <p className="text-amber-500/80 text-sm mt-1">Changes to financial settings will only apply to new orders. Active orders will retain their original pricing.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
