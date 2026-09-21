import React, { useState } from 'react';
import { supabase } from '../../utils/supabase';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, Loader2, Ship, AlertCircle, Sun, Moon } from 'lucide-react';

export const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    
    const { setSession, setUser, setRole, setInitialized } = useAuthStore();
    const { theme, toggleTheme } = useThemeStore();
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const { data, error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (signInError) throw signInError;

            if (data.session) {
                // Fetch user profile role
                const { data: profile, error: profileError } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', data.session.user.id)
                    .single();

                if (profileError) {
                    await supabase.auth.signOut();
                    throw new Error('Failed to retrieve user profile.');
                }

                if (profile.role !== 'admin') {
                    await supabase.auth.signOut();
                    throw new Error('Unauthorized. Only admins can access the admin dashboard.');
                }

                setSession(data.session);
                setUser(data.session.user);
                setRole(profile.role);
                setInitialized(true);
                navigate('/admin/dashboard');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to login');
            await supabase.auth.signOut();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`min-h-screen flex items-center justify-center p-4 font-sans relative overflow-hidden transition-colors ${
            theme === 'light' ? 'bg-slate-100 text-slate-900' : 'bg-[#0B1F4D] text-white'
        }`}>
            {/* Theme Toggle Button */}
            <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
                <button
                    onClick={toggleTheme}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-sm ${
                        theme === 'light'
                            ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 shadow-slate-200'
                            : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-700 shadow-black/20'
                    }`}
                    title="Toggle Theme"
                >
                    {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-brand-blue" />}
                    <span className="capitalize">{theme === 'dark' ? 'Light' : 'Dark'} Mode</span>
                </button>
            </div>

            {/* Background decorative circles */}
            <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-brand-blue/15 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-brand-orange/10 blur-3xl pointer-events-none" />

            <div className={`w-full max-w-md p-8 sm:p-10 rounded-[2.5rem] shadow-2xl z-10 border transition-all ${
                theme === 'light'
                    ? 'bg-white border-slate-200 text-slate-900 shadow-slate-200/50'
                    : 'bg-slate-900/80 border-slate-800 backdrop-blur-xl text-white'
            }`}>
                <div className="flex flex-col items-center mb-8">
                    {/* Logo Graphic */}
                    <div className="w-16 h-16 bg-brand-blue rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-brand-blue/25">
                        <Ship className="w-9 h-9 text-white" />
                    </div>
                    
                    {/* Branding */}
                    <h1 className={`text-3xl font-black tracking-tight flex items-center ${
                        theme === 'light' ? 'text-slate-900' : 'text-white'
                    }`}>
                        SHIP<span className="text-brand-blue">MATE</span>
                    </h1>
                    <div className="flex items-center gap-1.5 mt-2 bg-brand-orange/10 px-3 py-1 rounded-full border border-brand-orange/20 text-brand-orange text-xs font-bold uppercase tracking-wider">
                        <Lock className="w-3.5 h-3.5" />
                        Admin Portal
                    </div>
                </div>

                {error && (
                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-2xl text-sm mb-6 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-5">
                    <div className="space-y-2">
                        <label className={`text-sm font-medium ml-1 ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>Email Address</label>
                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input 
                                type="email" 
                                placeholder="admin@shipmate.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className={`w-full border rounded-2xl py-4 pl-12 pr-4 transition-all text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-blue/50 focus:border-brand-blue ${
                                    theme === 'light'
                                        ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
                                        : 'bg-slate-950/40 border-slate-800 text-white placeholder:text-slate-600'
                                }`}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className={`text-sm font-medium ml-1 ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>Password</label>
                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input 
                                type="password" 
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className={`w-full border rounded-2xl py-4 pl-12 pr-4 transition-all text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-blue/50 focus:border-brand-blue ${
                                    theme === 'light'
                                        ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
                                        : 'bg-slate-950/40 border-slate-800 text-white placeholder:text-slate-600'
                                }`}
                                required
                            />
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full bg-brand-blue hover:bg-brand-blue/90 text-white font-bold py-4 rounded-2xl shadow-lg shadow-brand-blue/20 transition-all flex items-center justify-center group disabled:opacity-50 disabled:cursor-not-allowed mt-4 cursor-pointer"
                    >
                        {loading ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            <>
                                Sign In to Dashboard
                                <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
                            </>
                        )}
                    </button>
                </form>
                
                <div className="text-center mt-6">
                    <button
                        onClick={() => navigate('/')}
                        className="text-sm text-slate-450 hover:text-white transition-colors"
                    >
                        ← Back to marketing site
                    </button>
                </div>
            </div>
        </div>
    );
};
