import React, { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabase';
import { createClient } from '@supabase/supabase-js';
import { 
  Search, 
  Filter, 
  UserPlus, 
  ShieldAlert, 
  Check, 
  X,
  Mail, 
  Phone, 
  ShieldCheck, 
  Loader2, 
  Lock, 
  RefreshCw,
  AlertCircle,
  Cpu
} from 'lucide-react';

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: 'customer' | 'driver' | 'admin';
  phone: string | null;
  account_status: 'active' | 'suspended' | 'deleted';
  email_verified: boolean;
  phone_verified: boolean;
  created_at: string;
  drivers?: {
    verification_status: string;
    platform_balance: number;
    total_deliveries: number;
    average_rating: number;
  } | null;
  courier_wallets?: {
    balance: number;
    status: 'active' | 'locked';
  } | null;
  customers?: {
    total_orders: number;
    lifetime_spend: number;
  } | null;
  driver_applications?: {
    id_verification_status: 'pending' | 'verified' | 'flagged' | 'skipped';
    id_extracted_data: any;
    license_verification_status: 'pending' | 'verified' | 'flagged' | 'skipped';
    license_extracted_data: any;
    verification_flags: string[];
    screening_status: 'not_started' | 'in_progress' | 'completed' | 'skipped';
    screening_transcript: any;
    screening_verdict: 'approve' | 'flag_for_review' | 'reject';
    screening_reasoning: string;
    vehicle_type: string;
    coverage_area: string;
    screening_concerns: string[];
  } | null;
}

export const UserManagement = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Details Modal State
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  
  // Ledger Modal State
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [ledgerTransactions, setLedgerTransactions] = useState<any[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Admin Top-up Modal State
  const [showTopUpModalAdmin, setShowTopUpModalAdmin] = useState(false);
  const [adminTopUpAmount, setAdminTopUpAmount] = useState('10.00');
  const [adminTopUpLoading, setAdminTopUpLoading] = useState(false);

  // Modals / Action States
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  // New User Form State
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<'customer' | 'driver' | 'admin'>('customer');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select(`
          id,
          email,
          full_name,
          role,
          phone,
          account_status,
          email_verified,
          phone_verified,
          created_at,
          drivers (
            verification_status,
            platform_balance,
            total_deliveries,
            average_rating
          ),
          courier_wallets (
            balance,
            status
          ),
          customers (
            total_orders,
            lifetime_spend
          ),
          driver_applications (
            id_verification_status,
            id_extracted_data,
            license_verification_status,
            license_extracted_data,
            verification_flags,
            screening_status,
            screening_transcript,
            screening_verdict,
            screening_reasoning,
            vehicle_type,
            coverage_area,
            screening_concerns
          )
        `);

      if (error) throw error;
      
      const mapped = (data || []).map((u: any) => ({
        ...u,
        driver_applications: Array.isArray(u.driver_applications) 
          ? u.driver_applications[0] 
          : u.driver_applications,
        courier_wallets: Array.isArray(u.courier_wallets)
          ? u.courier_wallets[0]
          : u.courier_wallets
      }));

      setUsers(mapped);
    } catch (err: any) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenLedgerModal = async (user: UserProfile) => {
    setSelectedUser(user);
    setShowLedgerModal(true);
    setLedgerLoading(true);
    try {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('courier_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLedgerTransactions(data || []);
    } catch (err: any) {
      alert(`Failed to load ledger: ${err.message}`);
    } finally {
      setLedgerLoading(false);
    }
  };

  const handleOpenTopUpModal = (user: UserProfile) => {
    setSelectedUser(user);
    setShowTopUpModalAdmin(true);
    setAdminTopUpAmount('10.00');
  };

  const handleAdminTopUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    const amountNum = parseFloat(adminTopUpAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('Please enter a valid positive amount.');
      return;
    }

    setAdminTopUpLoading(true);
    try {
      const { data, error } = await supabase.rpc('topup_wallet_rpc', {
        p_courier_id: selectedUser.id,
        p_gross_amount: amountNum,
        p_net_amount: amountNum
      });

      if (error) throw error;

      showToast(`Successfully credited $${amountNum.toFixed(2)} to ${selectedUser.full_name || selectedUser.email}'s wallet.`);
      setShowTopUpModalAdmin(false);
      fetchUsers(); // Refresh list to update display balances
    } catch (err: any) {
      alert(`Manual adjustment failed: ${err.message}`);
    } finally {
      setAdminTopUpLoading(false);
    }
  };

  const showToast = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 4000);
  };

  // 1. Password Reset trigger
  const handleResetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/admin/login`,
      });
      if (error) throw error;
      showToast(`Password reset link successfully sent to ${email}`);
    } catch (err: any) {
      alert(`Reset password failed: ${err.message}`);
    }
  };

  // 2. Verification toggle
  const handleToggleVerification = async (user: UserProfile, field: 'email_verified' | 'phone_verified') => {
    try {
      const targetValue = !user[field];
      const { error } = await supabase
        .from('users')
        .update({ [field]: targetValue })
        .eq('id', user.id);

      if (error) throw error;

      setUsers(users.map(u => u.id === user.id ? { ...u, [field]: targetValue } : u));
      showToast(`User ${field === 'email_verified' ? 'email' : 'phone'} verification updated.`);
    } catch (err: any) {
      alert(`Failed to update verification: ${err.message}`);
    }
  };

  // 3. Toggle account status (Lock / Unlock)
  const handleToggleStatus = async (user: UserProfile) => {
    try {
      const targetStatus = user.account_status === 'active' ? 'suspended' : 'active';
      const { error } = await supabase
        .from('users')
        .update({ account_status: targetStatus })
        .eq('id', user.id);

      if (error) throw error;

      // Update drivers subtable status too to match if applicable
      if (user.role === 'driver') {
        await supabase
          .from('drivers')
          .update({ verification_status: targetStatus === 'suspended' ? 'suspended' : 'approved' })
          .eq('id', user.id);
      }

      setUsers(users.map(u => {
        if (u.id === user.id) {
          const updated: UserProfile = { ...u, account_status: targetStatus };
          if (updated.drivers) {
            updated.drivers.verification_status = targetStatus === 'suspended' ? 'suspended' : 'approved';
          }
          return updated;
        }
        return u;
      }));

      showToast(`Account status for ${user.email} changed to ${targetStatus}.`);
    } catch (err: any) {
      alert(`Failed to toggle account status: ${err.message}`);
    }
  };

  // 4. Change Role
  const handleChangeRole = async (user: UserProfile, newRole: 'customer' | 'driver' | 'admin') => {
    if (user.role === newRole) return;
    try {
      // First update the role in users table
      const { error: userError } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', user.id);

      if (userError) throw userError;

      // Ensure appropriate sub-table rows are populated
      if (newRole === 'driver') {
        await supabase.from('drivers').insert({ id: user.id }).select();
      } else if (newRole === 'customer') {
        await supabase.from('customers').insert({ id: user.id }).select();
      }

      setUsers(users.map(u => u.id === user.id ? { ...u, role: newRole } : u));
      showToast(`Role for ${user.email} updated to ${newRole}.`);
      fetchUsers(); // reload to fetch join stats
    } catch (err: any) {
      alert(`Failed to change role: ${err.message}`);
    }
  };

  // 5. Create new user via isolated Supabase Client (bypassing session storage)
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError('');

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase credentials are missing.');
      }

      // Create isolated client so admin doesn't log out
      const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false }
      });

      const { data, error: signUpError } = await tempClient.auth.signUp({
        email: newEmail,
        password: newPassword,
        options: {
          data: {
            full_name: newFullName,
            role: newRole
          }
        }
      });

      if (signUpError) throw signUpError;
      if (!data.user) throw new Error('Registration failed.');

      // Update phone field which is not handled by handle_new_user trigger
      if (newPhone) {
        await supabase
          .from('users')
          .update({ phone: newPhone })
          .eq('id', data.user.id);
      }

      showToast(`User ${newEmail} created successfully.`);
      setShowAddModal(false);
      
      // Clear Form
      setNewEmail('');
      setNewPassword('');
      setNewFullName('');
      setNewPhone('');
      setNewRole('customer');

      fetchUsers(); // Refresh list
    } catch (err: any) {
      setModalError(err.message || 'Failed to create user');
    } finally {
      setModalLoading(false);
    }
  };

  // Filters logic
  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      (user.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.phone || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || user.account_status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 sm:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">User Management</h1>
            <p className="text-slate-400 text-sm mt-1">
              Add users, change roles, suspend accounts, and resolve login/password issues.
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-brand-blue hover:bg-brand-blue/90 text-white px-5 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-brand-blue/20 cursor-pointer"
          >
            <UserPlus className="w-5 h-5" />
            <span>Create User</span>
          </button>
        </div>

        {/* Toast success indicator */}
        {successMessage && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
            <Check className="w-5 h-5 shrink-0" />
            <span className="text-sm font-semibold">{successMessage}</span>
          </div>
        )}

        {/* Filter bar */}
        <div className="bg-slate-800/40 border border-slate-850 p-4 rounded-[2rem] flex flex-col md:flex-row items-center gap-4">
          {/* Search Input */}
          <div className="relative w-full md:flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              placeholder="Search by name, email or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950/40 border border-slate-850 rounded-2xl py-3 pl-12 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition-all text-sm font-semibold"
            />
          </div>

          {/* Filters dropdowns */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-slate-950/30 border border-slate-850 px-3.5 py-2.5 rounded-2xl">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="bg-transparent text-slate-350 text-sm font-bold focus:outline-none cursor-pointer"
              >
                <option value="all">All Roles</option>
                <option value="customer">Customers</option>
                <option value="driver">Drivers</option>
                <option value="admin">Admins</option>
              </select>
            </div>

            <div className="flex items-center gap-2 bg-slate-950/30 border border-slate-850 px-3.5 py-2.5 rounded-2xl">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent text-slate-350 text-sm font-bold focus:outline-none cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>

            <button
              onClick={fetchUsers}
              className="p-3 bg-slate-850 border border-slate-800 rounded-2xl text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Users Table */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-brand-blue animate-spin mb-4" />
            <p className="text-slate-400 font-semibold">Loading users list...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="bg-slate-850/20 border border-slate-850 rounded-[2.5rem] py-16 text-center text-slate-450 font-semibold">
            No users matched the criteria.
          </div>
        ) : (
          <div className="bg-slate-950/20 border border-slate-850 rounded-[2.5rem] overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-850/50 border-b border-slate-850 text-xs font-bold uppercase tracking-wider text-slate-400">
                    <th className="py-5 px-6">User Info</th>
                    <th className="py-5 px-6">Role</th>
                    <th className="py-5 px-6">Support & Login Issues</th>
                    <th className="py-5 px-6">Stats / Balance</th>
                    <th className="py-5 px-6 text-right">Account Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-850/10 transition-colors text-sm">
                      {/* Name & Contact */}
                      <td className="py-5 px-6 space-y-1">
                        <p className="font-extrabold text-white">{user.full_name || 'No Name'}</p>
                        <div className="flex flex-col gap-1 text-xs text-slate-450">
                          <span className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5" />
                            {user.email}
                          </span>
                          {user.phone && (
                            <span className="flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5" />
                              {user.phone}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Role drop-down */}
                      <td className="py-5 px-6">
                        <select
                          value={user.role}
                          onChange={(e) => handleChangeRole(user, e.target.value as any)}
                          className="bg-slate-900 border border-slate-800 text-slate-200 text-xs font-bold rounded-xl px-2.5 py-1.5 focus:outline-none cursor-pointer"
                        >
                          <option value="customer">Customer</option>
                          <option value="driver">Driver</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>

                      {/* Login Troubleshooting (Verify Email/Phone & Forgot Password Reset) */}
                      <td className="py-5 px-6 space-y-3">
                        {/* Verification controls */}
                        <div className="flex items-center gap-3">
                          {/* Email verified status */}
                          <button
                            onClick={() => handleToggleVerification(user, 'email_verified')}
                            className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border transition-all cursor-pointer ${
                              user.email_verified 
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                            }`}
                            title="Click to toggle email verification state"
                          >
                            <span>Email:</span>
                            {user.email_verified ? 'Verified' : 'Unverified'}
                          </button>

                          {/* Phone verified status */}
                          {user.phone && (
                            <button
                              onClick={() => handleToggleVerification(user, 'phone_verified')}
                              className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border transition-all cursor-pointer ${
                                user.phone_verified 
                                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                              }`}
                              title="Click to toggle phone verification state"
                            >
                              <span>Phone:</span>
                              {user.phone_verified ? 'Verified' : 'Unverified'}
                            </button>
                          )}
                        </div>

                        {/* Automated Password Reset */}
                        <button
                          onClick={() => handleResetPassword(user.email)}
                          className="flex items-center gap-1.5 text-xs font-bold text-brand-blue hover:text-white transition-colors cursor-pointer bg-brand-blue/5 border border-brand-blue/15 px-3 py-1.5 rounded-xl"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          Send Password Reset
                        </button>
                      </td>

                      {/* Join stats/Balances */}
                      <td className="py-5 px-6 text-xs space-y-1">
                        {user.role === 'driver' && (
                          <div className="space-y-1 font-medium text-slate-350">
                            <p>Status: <span className="font-bold text-white uppercase tracking-wider text-[10px]">{user.drivers?.verification_status || 'Pending'}</span></p>
                            <p>Deliveries: <span className="font-bold text-white">{user.drivers?.total_deliveries || 0}</span></p>
                            <p>Wallet Balance: <span className="font-extrabold text-emerald-400">${user.courier_wallets?.balance !== undefined ? user.courier_wallets.balance.toFixed(2) : '0.00'}</span></p>
                            <p>Wallet Status: <span className={`font-bold ${user.courier_wallets?.status === 'locked' ? 'text-rose-450' : 'text-emerald-400'} uppercase tracking-wider text-[10px]`}>{user.courier_wallets?.status || 'Active'}</span></p>
                            <p>Rating: <span className="font-bold text-white">{user.drivers?.average_rating || 'N/A'} ⭐</span></p>
                            
                            <div className="flex flex-wrap gap-1.5 pt-2">
                              {user.driver_applications && (
                                <button
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setShowDetailsModal(true);
                                  }}
                                  className="flex items-center gap-1 text-[9px] font-extrabold text-emerald-400 hover:text-white transition-colors bg-emerald-500/10 border border-emerald-500/15 px-2 py-1 rounded-lg cursor-pointer"
                                >
                                  <Cpu className="w-3 h-3" />
                                  AI Screen
                                </button>
                              )}
                              <button
                                onClick={() => handleOpenLedgerModal(user)}
                                className="flex items-center gap-1 text-[9px] font-extrabold text-brand-blue hover:text-white transition-colors bg-brand-blue/10 border border-brand-blue/15 px-2 py-1 rounded-lg cursor-pointer"
                              >
                                Ledger
                              </button>
                              <button
                                onClick={() => handleOpenTopUpModal(user)}
                                className="flex items-center gap-1 text-[9px] font-extrabold text-amber-400 hover:text-white transition-colors bg-amber-500/10 border border-amber-500/15 px-2 py-1 rounded-lg cursor-pointer"
                              >
                                Top Up
                              </button>
                            </div>
                          </div>
                        )}

                        {user.role === 'customer' && (
                          <div className="space-y-0.5 font-medium text-slate-350">
                            <p>Total Orders: <span className="font-bold text-white">{user.customers?.total_orders || 0}</span></p>
                            <p>Spend: <span className="font-extrabold text-brand-blue">${user.customers?.lifetime_spend || 0}</span></p>
                          </div>
                        )}

                        {user.role === 'admin' && (
                          <div className="text-slate-500 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1">
                            <ShieldCheck className="w-4 h-4 text-brand-blue" />
                            Admin Account
                          </div>
                        )}
                      </td>

                      {/* Toggle status (Lock / Unlock) */}
                      <td className="py-5 px-6 text-right">
                        <button
                          onClick={() => handleToggleStatus(user)}
                          className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                            user.account_status === 'active'
                              ? 'bg-rose-500/10 border-rose-500/20 text-rose-450 hover:bg-rose-500 hover:text-white'
                              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white'
                          }`}
                        >
                          {user.account_status === 'active' ? 'Suspend Account' : 'Unlock Account'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* AI SCREENING DETAILS MODAL */}
      {showDetailsModal && selectedUser && selectedUser.driver_applications && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] shadow-2xl relative max-h-[90vh] flex flex-col">
            {/* Close button */}
            <button
              onClick={() => {
                setShowDetailsModal(false);
                setSelectedUser(null);
              }}
              className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white transition-colors cursor-pointer bg-slate-850 rounded-xl"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-6 pr-10 border-b border-slate-850 pb-5 shrink-0">
              <div className="w-10 h-10 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">AI Screening & Verification</h2>
                <p className="text-xs text-slate-400 mt-1">Applicant: <span className="font-bold text-slate-200">{selectedUser.full_name || 'No Name'}</span> ({selectedUser.email})</p>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto flex-1 space-y-6 pr-2">
              
              {/* Top Summary Badges */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* ID Doc Verification Card */}
                <div className="bg-slate-950/20 border border-slate-850 p-4.5 rounded-2xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">National ID Scan</span>
                  <div className="flex items-center justify-between mt-2.5">
                    <span className="text-xs font-bold text-white">Status</span>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                      selectedUser.driver_applications.id_verification_status === 'verified'
                        ? 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/20'
                        : selectedUser.driver_applications.id_verification_status === 'flagged'
                        ? 'bg-rose-500/10 text-rose-450 border border-rose-500/20'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {selectedUser.driver_applications.id_verification_status}
                    </span>
                  </div>
                </div>

                {/* License Doc Verification Card */}
                <div className="bg-slate-950/20 border border-slate-850 p-4.5 rounded-2xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Driver's License Scan</span>
                  <div className="flex items-center justify-between mt-2.5">
                    <span className="text-xs font-bold text-white">Status</span>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                      selectedUser.driver_applications.license_verification_status === 'verified'
                        ? 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/20'
                        : selectedUser.driver_applications.license_verification_status === 'flagged'
                        ? 'bg-rose-500/10 text-rose-450 border border-rose-500/20'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {selectedUser.driver_applications.license_verification_status}
                    </span>
                  </div>
                </div>

                {/* Screening Verdict Card */}
                <div className="bg-slate-950/20 border border-slate-850 p-4.5 rounded-2xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Pre-Screening Verdict</span>
                  <div className="flex items-center justify-between mt-2.5">
                    <span className="text-xs font-bold text-white">Verdict</span>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                      selectedUser.driver_applications.screening_verdict === 'approve'
                        ? 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/20'
                        : selectedUser.driver_applications.screening_verdict === 'reject'
                        ? 'bg-rose-500/10 text-rose-450 border border-rose-500/20'
                        : 'bg-amber-500/10 text-amber-450 border border-amber-500/20'
                    }`}>
                      {selectedUser.driver_applications.screening_verdict?.replace(/_/g, ' ') || 'Pending'}
                    </span>
                  </div>
                </div>

              </div>

              {/* Warnings / Flags Alert */}
              {selectedUser.driver_applications.verification_flags && selectedUser.driver_applications.verification_flags.length > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/15 p-4.5 rounded-2xl flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-amber-450 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-black text-amber-450 uppercase tracking-wider">AI Flags & Mismatch Alerts</h4>
                    <ul className="list-disc pl-4 text-xs text-slate-350 space-y-1 mt-2 font-semibold">
                      {selectedUser.driver_applications.verification_flags.map((flag: string, i: number) => (
                        <li key={i}>{flag}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Two Column Layout for details */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* COLUMN 1: Extracted Documents Data */}
                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-450">Extracted Document Data</h3>
                  
                  {/* ID extracted details */}
                  <div className="bg-slate-850/20 border border-slate-800 p-5 rounded-2xl space-y-3.5">
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-brand-blue" />
                      Zimbabwe National ID (Extracted)
                    </h4>
                    {selectedUser.driver_applications.id_extracted_data ? (
                      <div className="grid grid-cols-2 gap-3 text-xs font-semibold">
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Full Name</span>
                          <span className="text-slate-200 mt-0.5 block">{selectedUser.driver_applications.id_extracted_data.full_name || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">ID Number</span>
                          <span className="text-slate-200 mt-0.5 block font-mono">{selectedUser.driver_applications.id_extracted_data.id_number || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Date of Birth</span>
                          <span className="text-slate-200 mt-0.5 block">{selectedUser.driver_applications.id_extracted_data.date_of_birth || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Confidence</span>
                          <span className="text-slate-200 mt-0.5 block capitalize">{selectedUser.driver_applications.id_extracted_data.confidence || 'N/A'}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 font-bold italic">No ID data extracted or document check skipped.</p>
                    )}
                  </div>

                  {/* License extracted details */}
                  <div className="bg-slate-850/20 border border-slate-800 p-5 rounded-2xl space-y-3.5">
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-brand-blue" />
                      Driver's License (Extracted)
                    </h4>
                    {selectedUser.driver_applications.license_extracted_data ? (
                      <div className="grid grid-cols-2 gap-3 text-xs font-semibold">
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Full Name</span>
                          <span className="text-slate-200 mt-0.5 block">{selectedUser.driver_applications.license_extracted_data.full_name || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">License Number</span>
                          <span className="text-slate-200 mt-0.5 block font-mono">{selectedUser.driver_applications.license_extracted_data.id_number || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Expiry Date</span>
                          <span className="text-slate-200 mt-0.5 block">{selectedUser.driver_applications.license_extracted_data.expiry_date || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Confidence</span>
                          <span className="text-slate-200 mt-0.5 block capitalize">{selectedUser.driver_applications.license_extracted_data.confidence || 'N/A'}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 font-bold italic">No license data extracted or document check skipped.</p>
                    )}
                  </div>
                </div>

                {/* COLUMN 2: Pre-Screening Evaluation */}
                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-450">Pre-Screening AI Verdict</h3>
                  
                  <div className="bg-slate-850/20 border border-slate-800 p-5 rounded-2xl space-y-4 text-xs font-semibold">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">AI Reasoning</span>
                      <p className="text-slate-200 mt-1.5 leading-relaxed bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
                        {selectedUser.driver_applications.screening_reasoning || 'No details.'}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Extracted Vehicle</span>
                        <span className="text-slate-200 mt-1 block capitalize font-extrabold">{selectedUser.driver_applications.vehicle_type || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Extracted Coverage Area</span>
                        <span className="text-slate-200 mt-1 block capitalize font-extrabold">{selectedUser.driver_applications.coverage_area || 'N/A'}</span>
                      </div>
                    </div>

                    {selectedUser.driver_applications.screening_concerns && selectedUser.driver_applications.screening_concerns.length > 0 && (
                      <div>
                        <span className="text-rose-450 block font-black uppercase tracking-wider text-[10px] mt-2">Flagged Chat Concerns</span>
                        <ul className="list-disc pl-4 text-rose-400 space-y-1 mt-2 font-bold">
                          {selectedUser.driver_applications.screening_concerns.map((concern: string, i: number) => (
                            <li key={i}>{concern}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Chat Transcript Drawer */}
              {selectedUser.driver_applications.screening_transcript && selectedUser.driver_applications.screening_transcript.length > 0 && (
                <div className="space-y-3 shrink-0">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-450">Screening Chat Transcript</h3>
                  <div className="bg-slate-950/20 border border-slate-850 rounded-2xl p-5 max-h-[220px] overflow-y-auto space-y-3 text-xs">
                    {selectedUser.driver_applications.screening_transcript.map((msg: any, i: number) => {
                      const isUser = msg.role === 'user';
                      return (
                        <div key={i} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                          <div className={`max-w-[75%] p-3.5 rounded-2xl font-semibold leading-relaxed ${
                            isUser 
                              ? 'bg-brand-blue/10 text-brand-blue border border-brand-blue/20 rounded-tr-none' 
                              : 'bg-slate-850 border border-slate-800 text-slate-200 rounded-tl-none'
                          }`}>
                            <p>{msg.content}</p>
                          </div>
                          <span className="text-[9px] text-slate-500 font-bold uppercase mt-1 px-2">
                            {isUser ? 'Applicant' : 'Shipmate AI'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* CREATE USER MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] shadow-2xl relative">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-brand-blue/10 text-brand-blue rounded-xl flex items-center justify-center">
                <UserPlus className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-white">Create New User</h2>
            </div>

            {modalError && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-2xl text-xs mb-5 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1.5">
                <label className="text-slate-400 ml-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="John Doe"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full bg-slate-950/40 border border-slate-800 rounded-2xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-400 ml-1">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="user@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-slate-950/40 border border-slate-800 rounded-2xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-400 ml-1">Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-950/40 border border-slate-800 rounded-2xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-400 ml-1">Phone Number (Optional)</label>
                <input
                  type="text"
                  placeholder="+263771234567"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full bg-slate-950/40 border border-slate-800 rounded-2xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-400 ml-1">Assign System Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  className="w-full bg-slate-950/40 border border-slate-800 rounded-2xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-brand-blue/40 cursor-pointer"
                >
                  <option value="customer">Customer (Ordering App)</option>
                  <option value="driver">Driver (Companion App)</option>
                  <option value="admin">Admin (Staff Panel)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={modalLoading}
                className="w-full bg-brand-blue hover:bg-brand-blue/90 text-white font-bold py-3.5 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
              >
                {modalLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span>Create User</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* LEDGER TRANSACTIONS MODAL */}
      {showLedgerModal && selectedUser && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] shadow-2xl relative max-h-[85vh] flex flex-col">
            <button
              onClick={() => {
                setShowLedgerModal(false);
                setSelectedUser(null);
                setLedgerTransactions([]);
              }}
              className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white transition-colors cursor-pointer bg-slate-850 rounded-xl"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-6 pr-10 border-b border-slate-850 pb-5 shrink-0">
              <div className="w-10 h-10 bg-brand-blue/10 text-brand-blue rounded-xl flex items-center justify-center">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Wallet Ledger History</h2>
                <p className="text-xs text-slate-400 mt-1">Courier: <span className="font-bold text-slate-200">{selectedUser.full_name || 'No Name'}</span> ({selectedUser.email})</p>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 pr-2">
              {ledgerLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-brand-blue animate-spin" />
                </div>
              ) : ledgerTransactions.length === 0 ? (
                <p className="text-center text-slate-500 font-semibold py-12">No transactions recorded for this wallet.</p>
              ) : (
                <div className="border border-slate-850 rounded-2xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-850/50 border-b border-slate-850 text-slate-400 uppercase tracking-wider font-bold">
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Gross Amt</th>
                        <th className="py-3 px-4">Net Amt</th>
                        <th className="py-3 px-4">Job Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {ledgerTransactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-850/10 transition-colors">
                          <td className="py-3.5 px-4 font-medium text-slate-350">
                            {new Date(tx.created_at).toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`font-bold uppercase text-[9px] px-2 py-0.5 rounded-md ${
                              tx.type === 'topup'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : tx.type === 'promo_credit'
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : 'bg-rose-500/10 text-rose-450 border border-rose-500/20'
                            }`}>
                              {tx.type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className={`py-3.5 px-4 font-bold ${tx.type === 'commission_deduction' ? 'text-rose-400' : 'text-slate-200'}`}>
                            {tx.type === 'commission_deduction' ? '-' : '+'}${tx.amount.toFixed(2)}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-emerald-400">
                            {tx.net_amount !== null ? `+$${tx.net_amount.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-500 select-all">
                            {tx.job_id || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ADMIN MANUAL TOP-UP MODAL */}
      {showTopUpModalAdmin && selectedUser && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] shadow-2xl relative">
            <button
              onClick={() => {
                setShowTopUpModalAdmin(false);
                setSelectedUser(null);
              }}
              className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white transition-colors cursor-pointer bg-slate-850 rounded-xl"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#F2A33D]/10 text-[#F2A33D] rounded-xl flex items-center justify-center">
                <UserPlus className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-white">Manual Float Adjust</h2>
            </div>

            <form onSubmit={handleAdminTopUpSubmit} className="space-y-4 text-xs font-semibold">
              <div className="bg-slate-950/30 border border-slate-850 p-4 rounded-2xl mb-2 text-slate-350">
                <p>Courier: <span className="font-bold text-white">{selectedUser.full_name || 'No Name'}</span></p>
                <p className="mt-1">Current Balance: <span className="font-bold text-emerald-400">${selectedUser.courier_wallets?.balance !== undefined ? selectedUser.courier_wallets.balance.toFixed(2) : '0.00'}</span></p>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-400 ml-1">Adjustment Credit Amount (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  placeholder="10.00"
                  value={adminTopUpAmount}
                  onChange={(e) => setAdminTopUpAmount(e.target.value)}
                  className="w-full bg-slate-950/40 border border-slate-800 rounded-2xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#F2A33D]/40"
                />
              </div>

              <button
                type="submit"
                disabled={adminTopUpLoading}
                className="w-full bg-[#F2A33D] hover:bg-[#F2A33D]/90 text-white font-bold py-3.5 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
              >
                {adminTopUpLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <span>Submit Credit Adjust</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
