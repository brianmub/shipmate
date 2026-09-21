import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
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
  Cpu,
  MessageSquare,
  ExternalLink,
  Award,
  Building,
  ShoppingBag,
  Gift,
  Package,
  Truck,
  CheckCircle2,
  XCircle,
  Eye,
  Wallet,
  Clock,
  UserCheck,
  FileText,
  Users,
  ZoomIn,
  Car,
  ChevronRight,
  Info
} from 'lucide-react';

export interface CustomerLead {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  city: string;
  customer_type: 'personal' | 'business';
  business_name: string | null;
  estimated_frequency: string;
  notes: string | null;
  promo_code: string;
  status: 'new' | 'contacted' | 'converted' | 'archived';
  created_at: string;
}

export interface CourierApplication {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  city: string;
  vehicle_type: string;
  has_license: boolean;
  experience_years: string;
  notes: string | null;
  status: 'pending' | 'contacted' | 'approved' | 'rejected';
  created_at: string;
}

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
    id?: string;
    verification_status: string;
    rejection_reason?: string | null;
    platform_balance: number;
    available_balance?: number;
    total_deliveries: number;
    average_rating: number;
    national_id_number?: string | null;
    license_number?: string | null;
    emergency_contact_name?: string | null;
    emergency_contact_phone?: string | null;
    is_online?: boolean;
    tier?: string;
    working_radius_km?: number;
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
  driver_documents?: {
    id: string;
    driver_id: string;
    document_type: string;
    file_url: string;
    uploaded_at?: string;
    verified?: boolean;
  }[];
  vehicle?: {
    id: string;
    driver_id: string;
    vehicle_type: string;
    make: string;
    model: string;
    year?: number | null;
    color?: string | null;
    license_plate: string;
    photo_front_url?: string | null;
    photo_back_url?: string | null;
    photo_left_url?: string | null;
    photo_right_url?: string | null;
    is_active?: boolean;
    registration_number?: string | null;
    insurance_expiry_date?: string | null;
  } | null;
}

interface UserManagementProps {
  initialTab?: 'couriers' | 'users' | 'leads' | 'applicants';
}

export const UserManagement: React.FC<UserManagementProps> = ({ initialTab }) => {
  const location = useLocation();

  const getInitialTab = (): 'couriers' | 'users' | 'leads' | 'applicants' => {
    if (initialTab) return initialTab;
    if (location.pathname.includes('/admin/approvals') || location.pathname.includes('/admin/couriers')) {
      return 'couriers';
    }
    if (location.pathname.includes('/admin/users')) {
      return 'users';
    }
    return 'couriers';
  };

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

  // Main Tab Navigation: Defaults based on route or prop so pending drivers are immediately visible!
  const [activeMainTab, setActiveMainTab] = useState<'couriers' | 'users' | 'leads' | 'applicants'>(getInitialTab);

  useEffect(() => {
    if (location.pathname.includes('/admin/approvals') || location.pathname.includes('/admin/couriers')) {
      setActiveMainTab('couriers');
    } else if (location.pathname === '/admin/users') {
      setActiveMainTab('users');
    }
  }, [location.pathname]);

  // Courier Filter & Management State
  const [courierSearchTerm, setCourierSearchTerm] = useState('');
  const [courierStatusFilter, setCourierStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'suspended'>('all');
  const [courierVehicleFilter, setCourierVehicleFilter] = useState<string>('all');

  // Courier Application Review Modal State
  const [selectedCourier, setSelectedCourier] = useState<UserProfile | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewActiveSubTab, setReviewActiveSubTab] = useState<'docs' | 'vehicle' | 'ai'>('docs');

  // Courier Disapproval / Fix Request State
  const [showDisapprovalModal, setShowDisapprovalModal] = useState(false);
  const [disapprovalCourier, setDisapprovalCourier] = useState<UserProfile | null>(null);
  const [disapprovalReason, setDisapprovalReason] = useState('');

  // Lightbox Image Viewer State
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);

  // Customer Leads (Parcel Waitlist) State
  const [customerLeads, setCustomerLeads] = useState<CustomerLead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const [leadCityFilter, setLeadCityFilter] = useState('all');
  const [leadTypeFilter, setLeadTypeFilter] = useState('all');
  const [leadStatusFilter, setLeadStatusFilter] = useState('all');

  // Courier Applications (Waitlist) State
  const [courierApplications, setCourierApplications] = useState<CourierApplication[]>([]);
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [applicantSearch, setApplicantSearch] = useState('');
  const [applicantCityFilter, setApplicantCityFilter] = useState('all');
  const [applicantVehicleFilter, setApplicantVehicleFilter] = useState('all');
  const [applicantStatusFilter, setApplicantStatusFilter] = useState('all');

  useEffect(() => {
    fetchUsers();
    fetchCourierApplications();
    fetchCustomerLeads();
  }, []);

  const fetchCustomerLeads = async () => {
    try {
      setLoadingLeads(true);
      const { data, error } = await supabase
        .from('customer_leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('customer_leads query:', error.message);
      } else {
        setCustomerLeads(data || []);
      }
    } catch (err: any) {
      console.warn('Error fetching customer leads:', err);
    } finally {
      setLoadingLeads(false);
    }
  };

  const handleUpdateLeadStatus = async (id: string, newStatus: 'new' | 'contacted' | 'converted' | 'archived') => {
    try {
      const { error } = await supabase
        .from('customer_leads')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      setCustomerLeads(prev => prev.map(lead => lead.id === id ? { ...lead, status: newStatus } : lead));
      setSuccessMessage(`Customer lead status updated to: ${newStatus}`);
      setTimeout(() => setSuccessMessage(''), 3500);
    } catch (err: any) {
      alert(`Could not update status: ${err.message}`);
    }
  };

  const getCustomerWhatsAppUrl = (phone: string, name: string, city: string, businessName?: string | null) => {
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) {
      clean = '263' + clean.slice(1);
    } else if (!clean.startsWith('263')) {
      clean = '263' + clean;
    }
    const intro = businessName ? `Hi ${name} (${businessName})` : `Hi ${name}`;
    const msg = encodeURIComponent(`${intro}! This is ShipMate Parcel Delivery in ${city}. We saw your delivery inquiry with promo code WELCOME263. How can we help you dispatch your first parcel today?`);
    return `https://wa.me/${clean}?text=${msg}`;
  };

  const fetchCourierApplications = async () => {
    try {
      setLoadingApplications(true);
      const { data, error } = await supabase
        .from('courier_applications')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('courier_applications query:', error.message);
      } else {
        setCourierApplications(data || []);
      }
    } catch (err: any) {
      console.warn('Error fetching courier applications:', err);
    } finally {
      setLoadingApplications(false);
    }
  };

  const handleUpdateApplicationStatus = async (id: string, newStatus: 'pending' | 'contacted' | 'approved' | 'rejected') => {
    try {
      const { error } = await supabase
        .from('courier_applications')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      setCourierApplications(prev => prev.map(app => app.id === id ? { ...app, status: newStatus } : app));
      setSuccessMessage(`Applicant status updated to: ${newStatus}`);
      setTimeout(() => setSuccessMessage(''), 3500);
    } catch (err: any) {
      alert(`Could not update status: ${err.message}`);
    }
  };

  const getWhatsAppUrl = (phone: string, name: string, city: string) => {
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) {
      clean = '263' + clean.slice(1);
    } else if (!clean.startsWith('263')) {
      clean = '263' + clean;
    }
    const msg = encodeURIComponent(`Hi ${name}! This is ShipMate Dispatch regarding your delivery courier application in ${city}.`);
    return `https://wa.me/${clean}?text=${msg}`;
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      // 1. Fetch users with drivers, customers, driver_applications (omitting courier_wallets to avoid PGRST200 foreign key issue)
      const { data: usersData, error: usersError } = await supabase
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
            id,
            verification_status,
            rejection_reason,
            platform_balance,
            available_balance,
            total_deliveries,
            average_rating,
            national_id_number,
            license_number,
            emergency_contact_name,
            emergency_contact_phone,
            is_online,
            tier
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
        `)
        .order('created_at', { ascending: false });

      if (usersError) throw usersError;

      // 2. Fetch courier_wallets, driver_documents, and vehicles in parallel
      const [
        { data: walletsData },
        { data: docsData },
        { data: vehiclesData }
      ] = await Promise.all([
        supabase.from('courier_wallets').select('courier_id, balance, status'),
        supabase.from('driver_documents').select('*').order('uploaded_at', { ascending: false }),
        supabase.from('vehicles').select('*')
      ]);

      const walletMap = new Map<string, any>();
      (walletsData || []).forEach((w: any) => {
        if (w.courier_id) walletMap.set(w.courier_id, w);
      });

      const docsMap = new Map<string, any[]>();
      (docsData || []).forEach((d: any) => {
        if (d.driver_id) {
          const list = docsMap.get(d.driver_id) || [];
          list.push(d);
          docsMap.set(d.driver_id, list);
        }
      });

      const vehicleMap = new Map<string, any>();
      (vehiclesData || []).forEach((v: any) => {
        if (v.driver_id && !vehicleMap.has(v.driver_id)) {
          vehicleMap.set(v.driver_id, v);
        }
      });

      const mapped = (usersData || []).map((u: any) => {
        const driverObj = Array.isArray(u.drivers) ? u.drivers[0] : u.drivers;
        const appObj = Array.isArray(u.driver_applications) ? u.driver_applications[0] : u.driver_applications;
        const customerObj = Array.isArray(u.customers) ? u.customers[0] : u.customers;
        const walletObj = walletMap.get(u.id) || null;
        const userDocs = docsMap.get(u.id) || [];
        const userVehicle = vehicleMap.get(u.id) || null;

        return {
          ...u,
          drivers: driverObj || null,
          driver_applications: appObj || null,
          customers: customerObj || null,
          courier_wallets: walletObj,
          driver_documents: userDocs,
          vehicle: userVehicle
        };
      });

      setUsers(mapped);
    } catch (err: any) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const DISAPPROVAL_PRESETS = [
    { label: 'Blurry National ID', text: 'National ID photo is blurry or unreadable. Please upload clear, well-lit photos of both the front and back of your ID.' },
    { label: 'Expired Driver License', text: "Your Driver's License has expired or is invalid. Please upload a valid and current Driver's License." },
    { label: 'Missing ID Back Photo', text: 'The back side photo of your National ID is missing. Please upload both front and back.' },
    { label: 'Missing License Back Photo', text: "The back side photo of your Driver's License is missing. Please upload both front and back." },
    { label: 'Vehicle Plate Mismatch', text: 'The license plate visible in your vehicle photos does not match your registered vehicle license plate.' },
    { label: 'Unclear Vehicle Photos', text: 'Vehicle photos are dark or incomplete. Please provide clear photos showing the full vehicle from the front, rear (with plate), and both sides.' },
    { label: 'Name Mismatch', text: 'The name on your submitted identification documents does not match your registered ShipMate account name.' },
  ];

  const getCourierRejectionWhatsAppUrl = (phone: string, name: string, reason: string) => {
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) {
      clean = '263' + clean.slice(1);
    } else if (!clean.startsWith('263')) {
      clean = '263' + clean;
    }
    const msg = encodeURIComponent(
      `Hi ${name},\n\nThis is ShipMate Operations regarding your courier application.\n\n` +
      `Our team reviewed your submitted documents, but we need you to address the following before your account can be approved:\n\n` +
      `⚠️ Reason / Required Fix: ${reason}\n\n` +
      `Please open your ShipMate Driver app to update your details or re-upload the required photos so we can activate your account promptly.\n\n` +
      `Thank you,\nShipMate Fleet Team`
    );
    return `https://wa.me/${clean}?text=${msg}`;
  };

  const openReviewModal = (user: UserProfile) => {
    setSelectedCourier(user);
    setReviewActiveSubTab('docs');
    setShowReviewModal(true);
  };

  const openDisapprovalModal = (user: UserProfile) => {
    setDisapprovalCourier(user);
    setDisapprovalReason(user.drivers?.rejection_reason || '');
    setShowDisapprovalModal(true);
  };

  // Direct Courier Approval & Rejection Handlers
  const handleApproveDriver = async (user: UserProfile) => {
    try {
      setLoading(true);
      const nowIso = new Date().toISOString();

      const { error: drvErr } = await supabase
        .from('drivers')
        .update({
          verification_status: 'approved',
          rejection_reason: null,
          is_identity_verified: true,
          last_verification_at: nowIso
        })
        .eq('id', user.id);

      if (drvErr) throw drvErr;

      await supabase
        .from('users')
        .update({ account_status: 'active', role: 'driver' })
        .eq('id', user.id);

      await supabase
        .from('courier_wallets')
        .update({ status: 'active' })
        .eq('courier_id', user.id);

      // Also verify all uploaded documents for this driver
      await supabase
        .from('driver_documents')
        .update({
          verified: true,
          verified_at: nowIso
        })
        .eq('driver_id', user.id);

      // Verify driver_applications if existing
      await supabase
        .from('driver_applications')
        .update({
          id_verification_status: 'verified',
          license_verification_status: 'verified'
        })
        .eq('id', user.id);

      // Activate vehicle if registered
      await supabase
        .from('vehicles')
        .update({ is_active: true })
        .eq('driver_id', user.id);

      setUsers(prev => prev.map(u => {
        if (u.id === user.id) {
          const updatedDocs = (u.driver_documents || []).map(d => ({ ...d, verified: true, verified_at: nowIso }));
          return {
            ...u,
            role: 'driver',
            account_status: 'active',
            drivers: u.drivers 
              ? { ...u.drivers, verification_status: 'approved', rejection_reason: null, is_identity_verified: true, last_verification_at: nowIso }
              : { verification_status: 'approved', rejection_reason: null, is_identity_verified: true, last_verification_at: nowIso, platform_balance: 0, total_deliveries: 0, average_rating: 5 },
            courier_wallets: u.courier_wallets ? { ...u.courier_wallets, status: 'active' } : { balance: 0, status: 'active' },
            driver_documents: updatedDocs,
            vehicle: u.vehicle ? { ...u.vehicle, is_active: true } : u.vehicle,
            driver_applications: u.driver_applications ? {
              ...u.driver_applications,
              id_verification_status: 'verified',
              license_verification_status: 'verified'
            } : u.driver_applications
          };
        }
        return u;
      }));

      showToast(`🎉 Courier ${user.full_name || user.email} approved! Account activated.`);
      if (selectedUser?.id === user.id) {
        setSelectedUser(prev => prev ? {
          ...prev,
          role: 'driver',
          account_status: 'active',
          drivers: prev.drivers ? { ...prev.drivers, verification_status: 'approved', rejection_reason: null, is_identity_verified: true } : null
        } : null);
      }
      if (selectedCourier?.id === user.id) {
        setSelectedCourier(prev => prev ? {
          ...prev,
          role: 'driver',
          account_status: 'active',
          drivers: prev.drivers ? { ...prev.drivers, verification_status: 'approved', rejection_reason: null, is_identity_verified: true } : null,
          driver_documents: (prev.driver_documents || []).map(d => ({ ...d, verified: true })),
          vehicle: prev.vehicle ? { ...prev.vehicle, is_active: true } : prev.vehicle
        } : null);
      }
    } catch (err: any) {
      alert(`Approval failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDisapproval = async () => {
    if (!disapprovalCourier) return;
    if (!disapprovalReason.trim()) {
      alert('Please enter or select a reason explaining why the application was not approved.');
      return;
    }

    const reason = disapprovalReason.trim();
    try {
      setLoading(true);
      const { error: drvErr } = await supabase
        .from('drivers')
        .update({
          verification_status: 'rejected',
          rejection_reason: reason,
          last_verification_at: new Date().toISOString()
        })
        .eq('id', disapprovalCourier.id);

      if (drvErr) throw drvErr;

      setUsers(prev => prev.map(u => {
        if (u.id === disapprovalCourier.id) {
          return {
            ...u,
            drivers: u.drivers 
              ? { ...u.drivers, verification_status: 'rejected', rejection_reason: reason } 
              : { verification_status: 'rejected', rejection_reason: reason, platform_balance: 0, total_deliveries: 0, average_rating: 0 }
          };
        }
        return u;
      }));

      showToast(`Courier application marked as Disapproved with feedback message.`);
      setShowDisapprovalModal(false);

      if (selectedUser?.id === disapprovalCourier.id) {
        setSelectedUser(prev => prev ? {
          ...prev,
          drivers: prev.drivers ? { ...prev.drivers, verification_status: 'rejected', rejection_reason: reason } : null
        } : null);
      }
      if (selectedCourier?.id === disapprovalCourier.id) {
        setSelectedCourier(prev => prev ? {
          ...prev,
          drivers: prev.drivers ? { ...prev.drivers, verification_status: 'rejected', rejection_reason: reason } : null
        } : null);
      }
    } catch (err: any) {
      alert(`Disapproval failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectDriver = async (user: UserProfile) => {
    openDisapprovalModal(user);
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

      const newBal = data !== null && data !== undefined ? Number(data) : ((selectedUser.courier_wallets?.balance || 0) + amountNum);
      const newStatus: 'active' | 'locked' = newBal >= 0.25 ? 'active' : 'locked';

      setUsers(prevUsers => prevUsers.map(u => {
        if (u.id === selectedUser.id) {
          return {
            ...u,
            courier_wallets: {
              balance: newBal,
              status: newStatus
            }
          };
        }
        return u;
      }));

      setSelectedUser(prev => prev ? {
        ...prev,
        courier_wallets: { balance: newBal, status: newStatus }
      } : null);

      if (selectedCourier && selectedCourier.id === selectedUser.id) {
        setSelectedCourier(prev => prev ? {
          ...prev,
          courier_wallets: { balance: newBal, status: newStatus }
        } : null);
      }

      showToast(`Successfully credited $${amountNum.toFixed(2)} to ${selectedUser.full_name || selectedUser.email}'s wallet.`);
      setShowTopUpModalAdmin(false);
      fetchUsers(); // Sync with database
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

  // Filter logic for Couriers & Pending Approvals
  const couriers = users.filter(
    u => u.role === 'driver' || 
         Boolean(u.drivers) || 
         Boolean(u.driver_applications) || 
         Boolean(u.driver_documents && u.driver_documents.length > 0) || 
         Boolean(u.vehicle)
  );
  const pendingCouriersCount = couriers.filter(c => {
    const status = c.drivers?.verification_status;
    return status === 'pending' || !status || status === 'submitted';
  }).length;
  const approvedCouriersCount = couriers.filter(c => c.drivers?.verification_status === 'approved').length;
  const rejectedCouriersCount = couriers.filter(c => c.drivers?.verification_status === 'rejected').length;
  const onlineCouriersCount = couriers.filter(c => c.drivers?.is_online).length;

  const filteredCouriers = couriers.filter(c => {
    const q = courierSearchTerm.toLowerCase();
    const matchesSearch =
      q === '' ||
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.drivers?.national_id_number || '').toLowerCase().includes(q) ||
      (c.drivers?.license_number || '').toLowerCase().includes(q) ||
      (c.drivers?.emergency_contact_name || '').toLowerCase().includes(q) ||
      (c.vehicle?.license_plate || '').toLowerCase().includes(q) ||
      (c.vehicle?.make || '').toLowerCase().includes(q) ||
      (c.vehicle?.model || '').toLowerCase().includes(q);

    const status = c.drivers?.verification_status || 'pending';
    const matchesStatus =
      courierStatusFilter === 'all' ||
      (courierStatusFilter === 'pending' && (status === 'pending' || status === 'submitted')) ||
      (courierStatusFilter === 'approved' && status === 'approved') ||
      (courierStatusFilter === 'rejected' && status === 'rejected') ||
      (courierStatusFilter === 'suspended' && status === 'suspended');

    const vType = (c.vehicle?.vehicle_type || c.driver_applications?.vehicle_type || '').toLowerCase();
    const matchesVehicle =
      courierVehicleFilter === 'all' ||
      vType === courierVehicleFilter.toLowerCase();

    return matchesSearch && matchesStatus && matchesVehicle;
  });

  // Filters logic for Users
  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      (user.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.phone || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || user.account_status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  // Filters logic for Courier Applicants (Waitlist)
  const filteredApplicants = courierApplications.filter((app) => {
    const query = applicantSearch.toLowerCase();
    const matchesSearch =
      query === '' ||
      (app.full_name || '').toLowerCase().includes(query) ||
      (app.email || '').toLowerCase().includes(query) ||
      (app.phone || '').toLowerCase().includes(query) ||
      (app.city || '').toLowerCase().includes(query);

    const matchesCity = applicantCityFilter === 'all' || app.city.toLowerCase() === applicantCityFilter.toLowerCase();
    const matchesVehicle = applicantVehicleFilter === 'all' || app.vehicle_type === applicantVehicleFilter;
    const matchesStatus = applicantStatusFilter === 'all' || app.status === applicantStatusFilter;

    return matchesSearch && matchesCity && matchesVehicle && matchesStatus;
  });

  // Filters logic for Customer Leads
  const filteredLeads = customerLeads.filter((lead) => {
    const query = leadSearch.toLowerCase();
    const matchesSearch =
      query === '' ||
      (lead.full_name || '').toLowerCase().includes(query) ||
      (lead.email || '').toLowerCase().includes(query) ||
      (lead.phone || '').toLowerCase().includes(query) ||
      (lead.city || '').toLowerCase().includes(query) ||
      (lead.business_name || '').toLowerCase().includes(query);

    const matchesCity = leadCityFilter === 'all' || lead.city.toLowerCase() === leadCityFilter.toLowerCase();
    const matchesType = leadTypeFilter === 'all' || lead.customer_type === leadTypeFilter;
    const matchesStatus = leadStatusFilter === 'all' || lead.status === leadStatusFilter;

    return matchesSearch && matchesCity && matchesType && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">User & Fleet Management</h1>
            <p className="text-slate-400 text-sm mt-1">
              Manage registered accounts, troubleshoot logins, customer inquiries, and review new delivery courier applicants.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {activeMainTab === 'users' && (
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 bg-brand-blue hover:bg-brand-blue/90 text-white px-5 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-brand-blue/20 cursor-pointer"
              >
                <UserPlus className="w-5 h-5" />
                <span>Create User</span>
              </button>
            )}
          </div>
        </div>

        {/* Toast success indicator */}
        {successMessage && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
            <Check className="w-5 h-5 shrink-0" />
            <span className="text-sm font-semibold">{successMessage}</span>
          </div>
        )}

        {/* MAIN TAB SWITCHER */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 pb-4">
          <button
            onClick={() => setActiveMainTab('couriers')}
            className={`px-5 py-2.5 rounded-2xl font-bold text-sm transition-all cursor-pointer flex items-center gap-2.5 ${
              activeMainTab === 'couriers'
                ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/25 ring-2 ring-brand-blue/40'
                : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Couriers & Approvals ({couriers.length})</span>
            {pendingCouriersCount > 0 && (
              <span className="bg-amber-400 text-slate-950 font-black text-xs px-2.5 py-0.5 rounded-full animate-pulse shadow-sm">
                {pendingCouriersCount} Awaiting Approval
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveMainTab('users')}
            className={`px-5 py-2.5 rounded-2xl font-bold text-sm transition-all cursor-pointer flex items-center gap-2 ${
              activeMainTab === 'users'
                ? 'bg-slate-700 text-white shadow-lg'
                : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>All Registered Users ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveMainTab('leads')}
            className={`px-5 py-2.5 rounded-2xl font-bold text-sm transition-all cursor-pointer flex items-center gap-2 ${
              activeMainTab === 'leads'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-lg shadow-emerald-500/20'
                : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Customer Leads & Businesses</span>
            {customerLeads.length > 0 && (
              <span className="bg-slate-900/30 text-xs px-2 py-0.5 rounded-full font-bold">
                {customerLeads.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveMainTab('applicants')}
            className={`px-5 py-2.5 rounded-2xl font-bold text-sm transition-all cursor-pointer flex items-center gap-2 ${
              activeMainTab === 'applicants'
                ? 'bg-[#F2A33D] text-slate-950 font-black shadow-lg shadow-[#F2A33D]/20'
                : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>Courier Applicants / Waitlist</span>
            {courierApplications.length > 0 && (
              <span className="bg-slate-900/30 text-xs px-2 py-0.5 rounded-full font-bold">
                {courierApplications.length}
              </span>
            )}
          </button>
        </div>

        {/* ========================================================= */}
        {/* TAB 0: COURIERS & APPROVALS VIEW */}
        {/* ========================================================= */}
        {activeMainTab === 'couriers' ? (
          <>
            {/* Quick KPI Cards for Fleet & Approvals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-800/40 border border-slate-850 p-4.5 rounded-3xl relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">Awaiting Review</p>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                </div>
                <p className="text-3xl font-black text-amber-400 mt-1">{pendingCouriersCount}</p>
                <p className="text-[11px] text-slate-400 mt-1">Pending approval</p>
              </div>

              <div className="bg-slate-800/40 border border-slate-850 p-4.5 rounded-3xl">
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Approved Fleet</p>
                <p className="text-3xl font-black text-emerald-400 mt-1">{approvedCouriersCount}</p>
                <p className="text-[11px] text-slate-400 mt-1">Active registered couriers</p>
              </div>

              <div className="bg-slate-800/40 border border-slate-850 p-4.5 rounded-3xl">
                <p className="text-xs font-bold text-rose-400 uppercase tracking-wider">Fix Required / Rejected</p>
                <p className="text-3xl font-black text-rose-400 mt-1">{rejectedCouriersCount}</p>
                <p className="text-[11px] text-slate-400 mt-1">Disapproved with feedback</p>
              </div>

              <div className="bg-slate-800/40 border border-slate-850 p-4.5 rounded-3xl">
                <p className="text-xs font-bold text-sky-400 uppercase tracking-wider">Online Now</p>
                <p className="text-3xl font-black text-sky-400 mt-1">{onlineCouriersCount}</p>
                <p className="text-[11px] text-slate-400 mt-1">Currently on duty</p>
              </div>
            </div>

            {/* Courier Filter bar */}
            <div className="bg-slate-800/40 border border-slate-850 p-4 rounded-[2rem] flex flex-col md:flex-row items-center gap-4">
              <div className="relative w-full md:flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search couriers by name, email, phone, plate, ID number..."
                  value={courierSearchTerm}
                  onChange={(e) => setCourierSearchTerm(e.target.value)}
                  className="w-full bg-slate-950/40 border border-slate-850 rounded-2xl py-3 pl-12 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition-all text-sm font-semibold"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                {/* Status Filter */}
                <div className="flex items-center gap-2 bg-slate-950/30 border border-slate-850 px-3.5 py-2.5 rounded-2xl">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select
                    value={courierStatusFilter}
                    onChange={(e) => setCourierStatusFilter(e.target.value as any)}
                    className="bg-transparent text-slate-300 text-sm font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="all" className="bg-slate-900 text-white">All Statuses</option>
                    <option value="pending" className="bg-slate-900 text-amber-400">⏳ Awaiting Approval ({pendingCouriersCount})</option>
                    <option value="approved" className="bg-slate-900 text-emerald-400">✓ Approved ({approvedCouriersCount})</option>
                    <option value="rejected" className="bg-slate-900 text-rose-400">✗ Fix Required ({rejectedCouriersCount})</option>
                    <option value="suspended" className="bg-slate-900 text-slate-400">🔒 Suspended</option>
                  </select>
                </div>

                {/* Vehicle Filter */}
                <div className="flex items-center gap-2 bg-slate-950/30 border border-slate-850 px-3.5 py-2.5 rounded-2xl">
                  <Car className="w-4 h-4 text-slate-400" />
                  <select
                    value={courierVehicleFilter}
                    onChange={(e) => setCourierVehicleFilter(e.target.value)}
                    className="bg-transparent text-slate-300 text-sm font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="all" className="bg-slate-900 text-white">All Vehicles</option>
                    <option value="motorcycle" className="bg-slate-900 text-slate-200">Motorcycle 🏍️</option>
                    <option value="car" className="bg-slate-900 text-slate-200">Car 🚗</option>
                    <option value="bakkie" className="bg-slate-900 text-slate-200">Bakkie 🛻</option>
                    <option value="van" className="bg-slate-900 text-slate-200">Van 🚐</option>
                    <option value="bicycle" className="bg-slate-900 text-slate-200">Bicycle 🚴</option>
                  </select>
                </div>

                <button
                  onClick={fetchUsers}
                  className="p-3 bg-slate-850 border border-slate-800 rounded-2xl text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Refresh Couriers"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Couriers & Approvals Table */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-12 h-12 text-brand-blue animate-spin mb-4" />
                <p className="text-slate-400 font-semibold">Loading courier fleet applications...</p>
              </div>
            ) : filteredCouriers.length === 0 ? (
              <div className="bg-slate-850/20 border border-slate-850 rounded-[2.5rem] py-16 text-center text-slate-400 font-semibold">
                No couriers matched the selected criteria.
              </div>
            ) : (
              <div className="bg-slate-950/20 border border-slate-850 rounded-[2.5rem] overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-850/50 border-b border-slate-850 text-xs font-bold uppercase tracking-wider text-slate-400">
                        <th className="py-5 px-6">Courier Info</th>
                        <th className="py-5 px-6">Vehicle & Specs</th>
                        <th className="py-5 px-6">Submitted Docs</th>
                        <th className="py-5 px-6">Application Status</th>
                        <th className="py-5 px-6 text-right">Review & Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {filteredCouriers.map((courier) => {
                        const status = courier.drivers?.verification_status || 'pending';
                        const isPending = status === 'pending' || status === 'submitted';
                        const isApproved = status === 'approved';
                        const isRejected = status === 'rejected';

                        const idDocs = courier.driver_documents?.filter(d => d.document_type.startsWith('national_id')) || [];
                        const licDocs = courier.driver_documents?.filter(d => d.document_type.startsWith('license')) || [];
                        const vehPhotos = [
                          courier.vehicle?.photo_front_url,
                          courier.vehicle?.photo_back_url,
                          courier.vehicle?.photo_left_url,
                          courier.vehicle?.photo_right_url
                        ].filter(Boolean);

                        const vType = courier.vehicle?.vehicle_type || courier.driver_applications?.vehicle_type || 'unassigned';

                        return (
                          <tr key={courier.id} className="hover:bg-slate-850/15 transition-colors text-sm">
                            {/* Courier Info */}
                            <td className="py-5 px-6 space-y-1">
                              <div className="flex items-center gap-2">
                                <p className="font-extrabold text-white text-base">{courier.full_name || 'Unnamed Driver'}</p>
                                {courier.drivers?.is_online && (
                                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" title="Online on Duty" />
                                )}
                              </div>
                              <div className="flex flex-col gap-0.5 text-xs text-slate-400">
                                <span className="flex items-center gap-1.5 font-mono">
                                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                                  {courier.email}
                                </span>
                                {courier.phone && (
                                  <span className="flex items-center gap-1.5 font-mono">
                                    <Phone className="w-3.5 h-3.5 text-slate-500" />
                                    {courier.phone}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500">
                                Applied: {new Date(courier.created_at).toLocaleDateString()}
                              </p>
                            </td>

                            {/* Vehicle & Specs */}
                            <td className="py-5 px-6 space-y-1 text-xs">
                              <div className="flex items-center gap-1.5">
                                <span className="bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded-md uppercase text-[10px] flex items-center gap-1">
                                  {vType === 'motorcycle' && '🏍️ Motorcycle'}
                                  {vType === 'car' && '🚗 Car'}
                                  {vType === 'bakkie' && '🛻 Bakkie'}
                                  {vType === 'van' && '🚐 Van'}
                                  {vType === 'bicycle' && '🚴 Bicycle'}
                                  {!['motorcycle', 'car', 'bakkie', 'van', 'bicycle'].includes(vType) && `🚘 ${vType}`}
                                </span>
                              </div>
                              <p className="font-extrabold text-white text-sm">
                                {courier.vehicle ? `${courier.vehicle.make || ''} ${courier.vehicle.model || ''}`.trim() || 'Vehicle Registered' : 'Pending Specs'}
                              </p>
                              {courier.vehicle?.license_plate && (
                                <span className="inline-block bg-slate-900 border border-slate-800 text-amber-300 font-mono font-black text-xs px-2 py-0.5 rounded-md">
                                  {courier.vehicle.license_plate}
                                </span>
                              )}
                            </td>

                            {/* Submitted Docs & Badges */}
                            <td className="py-5 px-6 space-y-1.5">
                              <div className="flex flex-wrap gap-1.5 text-[11px]">
                                <span className={`px-2 py-0.5 rounded-md font-bold flex items-center gap-1 border ${
                                  idDocs.length >= 2 
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : idDocs.length === 1
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    : 'bg-slate-800 text-slate-500 border-slate-700'
                                }`}>
                                  <FileText className="w-3 h-3" />
                                  ID ({idDocs.length}/2)
                                </span>

                                <span className={`px-2 py-0.5 rounded-md font-bold flex items-center gap-1 border ${
                                  licDocs.length >= 2 
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : licDocs.length === 1
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    : 'bg-slate-800 text-slate-500 border-slate-700'
                                }`}>
                                  <Award className="w-3 h-3" />
                                  License ({licDocs.length}/2)
                                </span>

                                <span className={`px-2 py-0.5 rounded-md font-bold flex items-center gap-1 border ${
                                  vehPhotos.length >= 4 
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : vehPhotos.length > 0
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    : 'bg-slate-800 text-slate-500 border-slate-700'
                                }`}>
                                  <Car className="w-3 h-3" />
                                  Photos ({vehPhotos.length}/4)
                                </span>
                              </div>

                              {courier.driver_applications?.screening_verdict && (
                                <div className="text-[10px] flex items-center gap-1 font-bold">
                                  <span className="text-slate-500">AI Screen:</span>
                                  <span className={`uppercase px-1.5 py-0.2 rounded ${
                                    courier.driver_applications.screening_verdict === 'approve'
                                      ? 'bg-emerald-500/20 text-emerald-400'
                                      : courier.driver_applications.screening_verdict === 'reject'
                                      ? 'bg-rose-500/20 text-rose-400'
                                      : 'bg-amber-500/20 text-amber-400'
                                  }`}>
                                    {courier.driver_applications.screening_verdict.replace(/_/g, ' ')}
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* Verification Status & Feedback preview */}
                            <td className="py-5 px-6 space-y-1.5">
                              <span className={`inline-flex items-center gap-1.5 text-xs font-black uppercase px-3 py-1 rounded-xl border ${
                                isApproved
                                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                  : isRejected
                                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                                  : 'bg-amber-500/15 border-amber-500/30 text-amber-400 animate-pulse'
                              }`}>
                                {isApproved && <CheckCircle2 className="w-3.5 h-3.5" />}
                                {isRejected && <XCircle className="w-3.5 h-3.5" />}
                                {isPending && <Clock className="w-3.5 h-3.5" />}
                                <span>{isPending ? 'Pending Review' : isRejected ? 'Fix Required' : status}</span>
                              </span>

                              {courier.drivers?.rejection_reason && (
                                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-2 text-xs max-w-xs text-rose-300">
                                  <p className="font-bold text-[10px] text-rose-400 uppercase">Reason for Disapproval:</p>
                                  <p className="line-clamp-2 italic text-[11px] mt-0.5 font-medium">
                                    "{courier.drivers.rejection_reason}"
                                  </p>
                                </div>
                              )}
                            </td>

                            {/* Review & Actions */}
                            <td className="py-5 px-6 text-right space-y-2">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => openReviewModal(courier)}
                                  className="px-4 py-2 bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-brand-blue/20 cursor-pointer flex items-center gap-1.5"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Review Application</span>
                                </button>
                              </div>

                              <div className="flex items-center justify-end gap-2">
                                {!isApproved && (
                                  <button
                                    onClick={() => handleApproveDriver(courier)}
                                    className="p-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 border border-emerald-500/20 rounded-xl transition-all cursor-pointer"
                                    title="Quick Approve"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {!isRejected && (
                                  <button
                                    onClick={() => openDisapprovalModal(courier)}
                                    className="p-2 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 rounded-xl transition-all cursor-pointer"
                                    title="Disapprove / Request Fix"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {courier.phone && (
                                  <a
                                    href={getWhatsAppUrl(courier.phone, courier.full_name || 'Driver', 'Zimbabwe')}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 bg-[#25D366]/10 hover:bg-[#25D366] text-[#25D366] hover:text-slate-950 border border-[#25D366]/20 rounded-xl transition-all cursor-pointer"
                                    title="WhatsApp Driver"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                  </a>
                                )}

                                <button
                                  onClick={() => handleOpenTopUpModal(courier)}
                                  className="p-2 bg-amber-500/10 hover:bg-amber-500 text-amber-400 hover:text-slate-950 border border-amber-500/20 rounded-xl transition-all cursor-pointer"
                                  title="Top Up Driver Wallet"
                                >
                                  <Wallet className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => handleOpenLedgerModal(courier)}
                                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 rounded-xl transition-all cursor-pointer"
                                  title="View Wallet Ledger History"
                                >
                                  <Clock className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : activeMainTab === 'users' ? (
          <>
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
                  title="Refresh Users"
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

                          {/* Login Troubleshooting */}
                          <td className="py-5 px-6 space-y-3">
                            <div className="flex items-center gap-3">
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

                            <button
                              onClick={() => handleResetPassword(user.email)}
                              className="flex items-center gap-1.5 text-xs font-bold text-brand-blue hover:text-white transition-colors cursor-pointer bg-brand-blue/5 border border-brand-blue/15 px-3 py-1.5 rounded-xl"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              Send Password Reset
                            </button>
                          </td>

                          {/* Join stats / Balances */}
                          <td className="py-5 px-6 text-xs space-y-1">
                            {user.role === 'driver' && (
                              <div className="space-y-1 font-medium text-slate-350">
                                <p>Status: <span className="font-bold text-white uppercase tracking-wider text-[10px]">{user.drivers?.verification_status || 'Pending'}</span></p>
                                <p>Deliveries: <span className="font-bold text-white">{user.drivers?.total_deliveries || 0}</span></p>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p>Wallet: <span className="font-extrabold text-emerald-400">${user.courier_wallets?.balance !== undefined ? user.courier_wallets.balance.toFixed(2) : '0.00'}</span></p>
                                  <button
                                    onClick={() => handleOpenTopUpModal(user)}
                                    className="px-2 py-0.5 bg-amber-500/15 hover:bg-amber-500 text-amber-400 hover:text-slate-950 border border-amber-500/30 text-[10px] font-bold rounded transition-all cursor-pointer"
                                    title="Top Up Driver Wallet"
                                  >
                                    + Top Up
                                  </button>
                                  <button
                                    onClick={() => handleOpenLedgerModal(user)}
                                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[10px] font-bold rounded transition-all cursor-pointer"
                                    title="View Ledger"
                                  >
                                    Ledger
                                  </button>
                                </div>
                                <p>Wallet Status: <span className={`font-bold ${user.courier_wallets?.status === 'locked' ? 'text-rose-450' : 'text-emerald-400'} uppercase tracking-wider text-[10px]`}>{user.courier_wallets?.status || 'Active'}</span></p>
                                <p>Rating: <span className="font-bold text-white">{user.drivers?.average_rating || 'N/A'} ⭐</span></p>
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
          </>
        ) : activeMainTab === 'leads' ? (
          /* ========================================================= */
          /* TAB 2: CUSTOMER LEADS & BUSINESSES VIEW */
          /* ========================================================= */
          <>
            {/* Quick KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-800/40 border border-slate-850 p-4 rounded-3xl">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Customer Leads</p>
                <p className="text-2xl font-black text-white mt-1">{customerLeads.length}</p>
              </div>
              <div className="bg-slate-800/40 border border-slate-850 p-4 rounded-3xl">
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Commercial / Shops 🏢</p>
                <p className="text-2xl font-black text-emerald-400 mt-1">
                  {customerLeads.filter(l => l.customer_type === 'business').length}
                </p>
              </div>
              <div className="bg-slate-800/40 border border-slate-850 p-4 rounded-3xl">
                <p className="text-xs font-bold text-sky-400 uppercase tracking-wider">Harare Senders</p>
                <p className="text-2xl font-black text-sky-400 mt-1">
                  {customerLeads.filter(l => l.city.toLowerCase() === 'harare').length}
                </p>
              </div>
              <div className="bg-slate-800/40 border border-slate-850 p-4 rounded-3xl">
                <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">New Inquiries</p>
                <p className="text-2xl font-black text-amber-400 mt-1">
                  {customerLeads.filter(l => l.status === 'new').length}
                </p>
              </div>
            </div>

            {/* Leads Filter Bar */}
            <div className="bg-slate-800/40 border border-slate-850 p-4 rounded-[2rem] flex flex-col md:flex-row items-center gap-4">
              <div className="relative w-full md:flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search leads by customer name, store name, email, phone or city..."
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  className="w-full bg-slate-950/40 border border-slate-850 rounded-2xl py-3 pl-12 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all text-sm font-semibold"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                {/* City Filter */}
                <div className="flex items-center gap-2 bg-slate-950/30 border border-slate-850 px-3.5 py-2.5 rounded-2xl">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select
                    value={leadCityFilter}
                    onChange={(e) => setLeadCityFilter(e.target.value)}
                    className="bg-transparent text-slate-350 text-sm font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="all">All Cities</option>
                    <option value="Harare">Harare</option>
                    <option value="Bulawayo">Bulawayo</option>
                    <option value="Chitungwiza">Chitungwiza</option>
                    <option value="Mutare">Mutare</option>
                    <option value="Gweru">Gweru</option>
                  </select>
                </div>

                {/* Account Type Filter */}
                <div className="flex items-center gap-2 bg-slate-950/30 border border-slate-850 px-3.5 py-2.5 rounded-2xl">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select
                    value={leadTypeFilter}
                    onChange={(e) => setLeadTypeFilter(e.target.value)}
                    className="bg-transparent text-slate-350 text-sm font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="all">All Types</option>
                    <option value="personal">Personal 👤</option>
                    <option value="business">Business 🏢</option>
                  </select>
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-2 bg-slate-950/30 border border-slate-850 px-3.5 py-2.5 rounded-2xl">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select
                    value={leadStatusFilter}
                    onChange={(e) => setLeadStatusFilter(e.target.value)}
                    className="bg-transparent text-slate-350 text-sm font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="converted">Converted</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>

                <button
                  onClick={fetchCustomerLeads}
                  className="p-3 bg-slate-850 border border-slate-800 rounded-2xl text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Refresh Leads"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Leads Table */}
            {loadingLeads ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
                <p className="text-slate-400 font-semibold">Loading customer leads...</p>
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="bg-slate-850/20 border border-slate-850 rounded-[2.5rem] py-16 text-center text-slate-450 font-semibold">
                No customer leads matched the criteria.
              </div>
            ) : (
              <div className="bg-slate-950/20 border border-slate-850 rounded-[2.5rem] overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-850/50 border-b border-slate-850 text-xs font-bold uppercase tracking-wider text-slate-400">
                        <th className="py-5 px-6">Sender & City</th>
                        <th className="py-5 px-6">Direct Contact & WhatsApp</th>
                        <th className="py-5 px-6">Account Type & Frequency</th>
                        <th className="py-5 px-6">Promo Code & Date</th>
                        <th className="py-5 px-6 text-right">Lead Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {filteredLeads.map((lead) => (
                        <tr key={lead.id} className="hover:bg-slate-850/10 transition-colors text-sm">
                          {/* Name & City */}
                          <td className="py-5 px-6 space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-extrabold text-white text-base">{lead.full_name}</p>
                              {lead.customer_type === 'business' && (
                                <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                                  <Building className="w-3 h-3" />
                                  <span>{lead.business_name || 'Business'}</span>
                                </span>
                              )}
                            </div>
                            <span className="inline-block bg-slate-800 text-slate-300 text-xs font-bold px-2.5 py-0.5 rounded-md">
                              📍 {lead.city}
                            </span>
                          </td>

                          {/* Contact & WhatsApp */}
                          <td className="py-5 px-6 space-y-2">
                            <div className="text-xs text-slate-350 space-y-0.5">
                              <p className="font-mono text-slate-200">{lead.phone}</p>
                              <p className="text-slate-400">{lead.email}</p>
                            </div>
                            <a
                              href={getCustomerWhatsAppUrl(lead.phone, lead.full_name, lead.city, lead.business_name)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 border border-[#25D366]/30 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>WhatsApp Lead</span>
                            </a>
                          </td>

                          {/* Account Type & Frequency */}
                          <td className="py-5 px-6 space-y-1 text-xs">
                            <div className="font-bold text-white uppercase flex items-center gap-1.5">
                              {lead.customer_type === 'business' ? (
                                <span className="text-emerald-400 flex items-center gap-1">🏢 Commercial</span>
                              ) : (
                                <span className="text-slate-350 flex items-center gap-1">👤 Personal</span>
                              )}
                            </div>
                            <p className="text-slate-400">
                              Frequency: <span className="text-slate-200 font-semibold">{lead.estimated_frequency}</span>
                            </p>
                          </td>

                          {/* Promo Code & Date */}
                          <td className="py-5 px-6 text-xs text-slate-450 space-y-1">
                            <span className="inline-block bg-[#2D5FE0]/10 border border-[#2D5FE0]/20 text-[#2D5FE0] font-mono font-bold px-2 py-0.5 rounded-md">
                              🎁 {lead.promo_code || 'WELCOME263'}
                            </span>
                            <p className="text-[11px] text-slate-500">
                              Joined: {new Date(lead.created_at).toLocaleDateString()}
                            </p>
                          </td>

                          {/* Lead Status */}
                          <td className="py-5 px-6 text-right">
                            <select
                              value={lead.status}
                              onChange={(e) => handleUpdateLeadStatus(lead.id, e.target.value as any)}
                              className={`text-xs font-extrabold rounded-xl px-3 py-2 border focus:outline-none cursor-pointer ${
                                lead.status === 'new'
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                  : lead.status === 'contacted'
                                  ? 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                                  : lead.status === 'converted'
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                  : 'bg-slate-800 border-slate-700 text-slate-400'
                              }`}
                            >
                              <option value="new" className="bg-slate-900 text-amber-400">⭐ New Lead</option>
                              <option value="contacted" className="bg-slate-900 text-sky-400">💬 Contacted</option>
                              <option value="converted" className="bg-slate-900 text-emerald-400">✓ Converted</option>
                              <option value="archived" className="bg-slate-900 text-slate-400">📁 Archived</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          /* ========================================================= */
          /* TAB 3: COURIER APPLICANTS & WAITLIST VIEW */
          /* ========================================================= */
          <>
            {/* Quick KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-800/40 border border-slate-850 p-4 rounded-3xl">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Applicants</p>
                <p className="text-2xl font-black text-white mt-1">{courierApplications.length}</p>
              </div>
              <div className="bg-slate-800/40 border border-slate-850 p-4 rounded-3xl">
                <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">Pending Review</p>
                <p className="text-2xl font-black text-amber-400 mt-1">
                  {courierApplications.filter(a => a.status === 'pending').length}
                </p>
              </div>
              <div className="bg-slate-800/40 border border-slate-850 p-4 rounded-3xl">
                <p className="text-xs font-bold text-sky-400 uppercase tracking-wider">Harare Fleet</p>
                <p className="text-2xl font-black text-sky-400 mt-1">
                  {courierApplications.filter(a => a.city.toLowerCase() === 'harare').length}
                </p>
              </div>
              <div className="bg-slate-800/40 border border-slate-850 p-4 rounded-3xl">
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Motorcycles 🏍️</p>
                <p className="text-2xl font-black text-emerald-400 mt-1">
                  {courierApplications.filter(a => a.vehicle_type === 'motorcycle').length}
                </p>
              </div>
            </div>

            {/* Applicant Filter Bar */}
            <div className="bg-slate-800/40 border border-slate-850 p-4 rounded-[2rem] flex flex-col md:flex-row items-center gap-4">
              <div className="relative w-full md:flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search applicants by name, email, phone or city..."
                  value={applicantSearch}
                  onChange={(e) => setApplicantSearch(e.target.value)}
                  className="w-full bg-slate-950/40 border border-slate-850 rounded-2xl py-3 pl-12 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#F2A33D]/30 transition-all text-sm font-semibold"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                {/* City Filter */}
                <div className="flex items-center gap-2 bg-slate-950/30 border border-slate-850 px-3.5 py-2.5 rounded-2xl">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select
                    value={applicantCityFilter}
                    onChange={(e) => setApplicantCityFilter(e.target.value)}
                    className="bg-transparent text-slate-350 text-sm font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="all">All Cities</option>
                    <option value="Harare">Harare</option>
                    <option value="Bulawayo">Bulawayo</option>
                    <option value="Chitungwiza">Chitungwiza</option>
                    <option value="Mutare">Mutare</option>
                    <option value="Gweru">Gweru</option>
                  </select>
                </div>

                {/* Vehicle Filter */}
                <div className="flex items-center gap-2 bg-slate-950/30 border border-slate-850 px-3.5 py-2.5 rounded-2xl">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select
                    value={applicantVehicleFilter}
                    onChange={(e) => setApplicantVehicleFilter(e.target.value)}
                    className="bg-transparent text-slate-350 text-sm font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="all">All Vehicles</option>
                    <option value="motorcycle">Motorcycle 🏍️</option>
                    <option value="sedan">Car 🚗</option>
                    <option value="bakkie">Bakkie 🛻</option>
                    <option value="van">Van 🚐</option>
                    <option value="bicycle">Bicycle 🚴</option>
                  </select>
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-2 bg-slate-950/30 border border-slate-850 px-3.5 py-2.5 rounded-2xl">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select
                    value={applicantStatusFilter}
                    onChange={(e) => setApplicantStatusFilter(e.target.value)}
                    className="bg-transparent text-slate-350 text-sm font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="contacted">Contacted</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                <button
                  onClick={fetchCourierApplications}
                  className="p-3 bg-slate-850 border border-slate-800 rounded-2xl text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Refresh Applicants"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Applicants Table */}
            {loadingApplications ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-12 h-12 text-[#F2A33D] animate-spin mb-4" />
                <p className="text-slate-400 font-semibold">Loading courier applicants...</p>
              </div>
            ) : filteredApplicants.length === 0 ? (
              <div className="bg-slate-850/20 border border-slate-850 rounded-[2.5rem] py-16 text-center text-slate-450 font-semibold">
                No courier applicants matched the criteria.
              </div>
            ) : (
              <div className="bg-slate-950/20 border border-slate-850 rounded-[2.5rem] overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-850/50 border-b border-slate-850 text-xs font-bold uppercase tracking-wider text-slate-400">
                        <th className="py-5 px-6">Applicant & City</th>
                        <th className="py-5 px-6">Direct Contact & WhatsApp</th>
                        <th className="py-5 px-6">Vehicle & License</th>
                        <th className="py-5 px-6">Experience & Date</th>
                        <th className="py-5 px-6 text-right">Dispatch Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {filteredApplicants.map((app) => (
                        <tr key={app.id} className="hover:bg-slate-850/10 transition-colors text-sm">
                          {/* Name & City */}
                          <td className="py-5 px-6 space-y-1">
                            <p className="font-extrabold text-white text-base">{app.full_name}</p>
                            <span className="inline-block bg-slate-800 text-slate-300 text-xs font-bold px-2.5 py-0.5 rounded-md">
                              📍 {app.city}
                            </span>
                          </td>

                          {/* Contact & WhatsApp */}
                          <td className="py-5 px-6 space-y-2">
                            <div className="text-xs text-slate-350 space-y-0.5">
                              <p className="font-mono text-slate-200">{app.phone}</p>
                              <p className="text-slate-400">{app.email}</p>
                            </div>
                            <a
                              href={getWhatsAppUrl(app.phone, app.full_name, app.city)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 border border-[#25D366]/30 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>WhatsApp Candidate</span>
                            </a>
                          </td>

                          {/* Vehicle & License */}
                          <td className="py-5 px-6 space-y-1 text-xs">
                            <div className="font-bold text-white uppercase flex items-center gap-1">
                              <span>
                                {app.vehicle_type === 'motorcycle' && '🏍️'}
                                {app.vehicle_type === 'sedan' && '🚗'}
                                {app.vehicle_type === 'bakkie' && '🛻'}
                                {app.vehicle_type === 'van' && '🚐'}
                                {app.vehicle_type === 'bicycle' && '🚴'}
                              </span>
                              <span>{app.vehicle_type}</span>
                            </div>
                            <p className={app.has_license ? 'text-emerald-400 font-semibold' : 'text-slate-500 font-semibold'}>
                              {app.has_license ? '✓ Valid License' : '✗ No License'}
                            </p>
                          </td>

                          {/* Experience & Date */}
                          <td className="py-5 px-6 text-xs text-slate-450 space-y-1">
                            <p className="font-medium text-slate-300">{app.experience_years}</p>
                            <p className="text-[11px] text-slate-500">
                              Applied: {new Date(app.created_at).toLocaleDateString()}
                            </p>
                          </td>

                          {/* Dispatch Status */}
                          <td className="py-5 px-6 text-right">
                            <select
                              value={app.status}
                              onChange={(e) => handleUpdateApplicationStatus(app.id, e.target.value as any)}
                              className={`text-xs font-extrabold rounded-xl px-3 py-2 border focus:outline-none cursor-pointer ${
                                app.status === 'pending'
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                  : app.status === 'contacted'
                                  ? 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                                  : app.status === 'approved'
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                              }`}
                            >
                              <option value="pending" className="bg-slate-900 text-amber-400">⏳ Pending</option>
                              <option value="contacted" className="bg-slate-900 text-sky-400">💬 Contacted</option>
                              <option value="approved" className="bg-slate-900 text-emerald-400">✓ Approved</option>
                              <option value="rejected" className="bg-slate-900 text-rose-400">✗ Rejected</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ========================================================= */}
      {/* COURIER APPLICATION REVIEW MODAL */}
      {/* ========================================================= */}
      {showReviewModal && selectedCourier && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-3xl sm:rounded-[2.5rem] shadow-2xl relative max-h-[96vh] sm:max-h-[92vh] flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-7 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0 bg-slate-900/60 backdrop-blur-sm">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-brand-blue/15 text-brand-blue border border-brand-blue/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Truck className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <h2 className="text-xl sm:text-2xl font-black text-white">{selectedCourier.full_name || 'Unnamed Driver'}</h2>
                    <span className={`text-xs font-black uppercase px-2.5 py-0.5 rounded-lg border ${
                      selectedCourier.drivers?.verification_status === 'approved'
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                        : selectedCourier.drivers?.verification_status === 'rejected'
                        ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                        : 'bg-amber-500/15 border-amber-500/30 text-amber-400 animate-pulse'
                    }`}>
                      {selectedCourier.drivers?.verification_status || 'PENDING APPROVAL'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1 font-mono text-slate-300">
                      <Mail className="w-3.5 h-3.5 text-slate-500" />
                      {selectedCourier.email}
                    </span>
                    {selectedCourier.phone && (
                      <span className="flex items-center gap-1 font-mono text-slate-300">
                        <Phone className="w-3.5 h-3.5 text-slate-500" />
                        {selectedCourier.phone}
                      </span>
                    )}
                    <span className="text-slate-500">
                      Joined: {new Date(selectedCourier.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selectedCourier.phone && (
                  <a
                    href={getWhatsAppUrl(selectedCourier.phone, selectedCourier.full_name || 'Driver', 'Zimbabwe')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">WhatsApp</span>
                  </a>
                )}
                <button
                  onClick={() => setShowReviewModal(false)}
                  className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl transition-colors cursor-pointer"
                  title="Close Modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Current Rejection Feedback Banner (if rejected previously) */}
            {selectedCourier.drivers?.rejection_reason && (
              <div className="bg-rose-500/10 border-b border-rose-500/20 px-7 py-3 flex items-center justify-between text-xs shrink-0">
                <div className="flex items-center gap-2 text-rose-300">
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>
                    <strong className="text-rose-400 uppercase font-black mr-1">Current Disapproval Reason:</strong> 
                    "{selectedCourier.drivers.rejection_reason}"
                  </span>
                </div>
                <button
                  onClick={() => openDisapprovalModal(selectedCourier)}
                  className="text-xs font-bold text-rose-400 hover:text-rose-300 underline cursor-pointer shrink-0 ml-4"
                >
                  Edit Feedback
                </button>
              </div>
            )}

            {/* Sub-tab Navigation */}
            <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-7 pt-3 sm:pt-4 border-b border-slate-800/80 bg-slate-900/40 shrink-0 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setReviewActiveSubTab('docs')}
                className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
                  reviewActiveSubTab === 'docs'
                    ? 'border-brand-blue text-brand-blue font-extrabold'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Identification & Documents</span>
                <span className="bg-slate-800 px-2 py-0.5 rounded-full text-[10px] text-slate-300">
                  {(selectedCourier.driver_documents || []).length}
                </span>
              </button>

              <button
                onClick={() => setReviewActiveSubTab('vehicle')}
                className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
                  reviewActiveSubTab === 'vehicle'
                    ? 'border-brand-blue text-brand-blue font-extrabold'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Car className="w-4 h-4" />
                <span>Vehicle Inspection & Photos</span>
                {selectedCourier.vehicle && (
                  <span className="bg-slate-800 px-2 py-0.5 rounded-full text-[10px] text-slate-300">
                    {selectedCourier.vehicle.license_plate || 'Specs'}
                  </span>
                )}
              </button>

              <button
                onClick={() => setReviewActiveSubTab('ai')}
                className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
                  reviewActiveSubTab === 'ai'
                    ? 'border-brand-blue text-brand-blue font-extrabold'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Cpu className="w-4 h-4" />
                <span>AI Screening & OCR Data</span>
                {selectedCourier.driver_applications?.screening_verdict && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    selectedCourier.driver_applications.screening_verdict === 'approve'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {selectedCourier.driver_applications.screening_verdict.replace(/_/g, ' ')}
                  </span>
                )}
              </button>
            </div>

            {/* Scrollable Sub-tab Content Area */}
            <div className="p-6 sm:p-7 overflow-y-auto flex-1 space-y-6">
              {reviewActiveSubTab === 'docs' && (
                <div className="space-y-7">
                  {/* Summary row */}
                  <div className="bg-slate-850/40 border border-slate-800 p-4.5 rounded-2xl grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">National ID Number</span>
                      <span className="text-white font-mono font-bold text-sm mt-0.5 block">
                        {selectedCourier.drivers?.national_id_number || selectedCourier.driver_applications?.id_extracted_data?.id_number || 'Pending Entry'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">License Number</span>
                      <span className="text-white font-mono font-bold text-sm mt-0.5 block">
                        {selectedCourier.drivers?.license_number || selectedCourier.driver_applications?.license_extracted_data?.id_number || 'Pending Entry'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Emergency Contact</span>
                      <span className="text-slate-200 font-bold mt-0.5 block">
                        {selectedCourier.drivers?.emergency_contact_name || 'None specified'}
                      </span>
                      {selectedCourier.drivers?.emergency_contact_phone && (
                        <span className="text-slate-400 text-[11px] font-mono">
                          {selectedCourier.drivers.emergency_contact_phone}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Account Wallet Balance</span>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        <span className="text-emerald-400 font-black text-sm">
                          ${selectedCourier.courier_wallets?.balance !== undefined ? selectedCourier.courier_wallets.balance.toFixed(2) : '0.00'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenTopUpModal(selectedCourier)}
                          className="px-2 py-0.5 bg-amber-500/15 hover:bg-amber-500 text-amber-400 hover:text-slate-950 border border-amber-500/30 text-[10px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1"
                          title="Top Up Driver Float"
                        >
                          <Wallet className="w-3 h-3" />
                          <span>+ Top Up</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenLedgerModal(selectedCourier)}
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[10px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1"
                          title="View Ledger History"
                        >
                          <Clock className="w-3 h-3" />
                          <span>Ledger</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Section 1: National ID Photos */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                        <FileText className="w-4 h-4 text-brand-blue" />
                        <span>Zimbabwe National ID Card</span>
                      </h3>
                      <span className="text-xs text-slate-400">Front & back photos required</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* ID Front */}
                      {(() => {
                        const idFront = selectedCourier.driver_documents?.find(d => d.document_type === 'national_id_front');
                        const url = idFront?.file_url;
                        return (
                          <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-brand-blue" />
                                National ID (Front)
                              </span>
                              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                                url ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-500'
                              }`}>
                                {url ? 'Uploaded' : 'Missing'}
                              </span>
                            </div>

                            {url ? (
                              <div className="relative group rounded-xl overflow-hidden bg-slate-900 border border-slate-800 h-56 flex items-center justify-center">
                                <img
                                  src={url}
                                  alt="National ID Front"
                                  className="w-full h-full object-contain cursor-pointer transition-transform group-hover:scale-105"
                                  onClick={() => setLightboxImage({ url, title: `${selectedCourier.full_name} - National ID (Front)` })}
                                />
                                <div className="absolute inset-0 bg-slate-950/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                  <button
                                    onClick={() => setLightboxImage({ url, title: `${selectedCourier.full_name} - National ID (Front)` })}
                                    className="px-3.5 py-2 bg-brand-blue hover:bg-brand-blue/90 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg cursor-pointer"
                                  >
                                    <ZoomIn className="w-4 h-4" />
                                    <span>Inspect</span>
                                  </button>
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold shadow-lg cursor-pointer"
                                    title="Open Full Resolution"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </a>
                                </div>
                              </div>
                            ) : (
                              <div className="h-56 rounded-xl border border-dashed border-slate-800 flex flex-col items-center justify-center text-slate-500 gap-2 bg-slate-900/20">
                                <FileText className="w-8 h-8 opacity-40" />
                                <span className="text-xs font-semibold">Front ID not submitted</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* ID Back */}
                      {(() => {
                        const idBack = selectedCourier.driver_documents?.find(d => d.document_type === 'national_id_back');
                        const url = idBack?.file_url;
                        return (
                          <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-brand-blue" />
                                National ID (Back)
                              </span>
                              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                                url ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-500'
                              }`}>
                                {url ? 'Uploaded' : 'Missing'}
                              </span>
                            </div>

                            {url ? (
                              <div className="relative group rounded-xl overflow-hidden bg-slate-900 border border-slate-800 h-56 flex items-center justify-center">
                                <img
                                  src={url}
                                  alt="National ID Back"
                                  className="w-full h-full object-contain cursor-pointer transition-transform group-hover:scale-105"
                                  onClick={() => setLightboxImage({ url, title: `${selectedCourier.full_name} - National ID (Back)` })}
                                />
                                <div className="absolute inset-0 bg-slate-950/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                  <button
                                    onClick={() => setLightboxImage({ url, title: `${selectedCourier.full_name} - National ID (Back)` })}
                                    className="px-3.5 py-2 bg-brand-blue hover:bg-brand-blue/90 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg cursor-pointer"
                                  >
                                    <ZoomIn className="w-4 h-4" />
                                    <span>Inspect</span>
                                  </button>
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold shadow-lg cursor-pointer"
                                    title="Open Full Resolution"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </a>
                                </div>
                              </div>
                            ) : (
                              <div className="h-56 rounded-xl border border-dashed border-slate-800 flex flex-col items-center justify-center text-slate-500 gap-2 bg-slate-900/20">
                                <FileText className="w-8 h-8 opacity-40" />
                                <span className="text-xs font-semibold">Back ID not submitted</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Section 2: Driver's License Photos */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                        <Award className="w-4 h-4 text-emerald-400" />
                        <span>Driver's License Documentation</span>
                      </h3>
                      <span className="text-xs text-slate-400">Valid Zimbabwean driver's license</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* License Front */}
                      {(() => {
                        const licFront = selectedCourier.driver_documents?.find(d => d.document_type === 'license_front');
                        const url = licFront?.file_url;
                        return (
                          <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                Driver's License (Front)
                              </span>
                              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                                url ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-500'
                              }`}>
                                {url ? 'Uploaded' : 'Missing'}
                              </span>
                            </div>

                            {url ? (
                              <div className="relative group rounded-xl overflow-hidden bg-slate-900 border border-slate-800 h-56 flex items-center justify-center">
                                <img
                                  src={url}
                                  alt="License Front"
                                  className="w-full h-full object-contain cursor-pointer transition-transform group-hover:scale-105"
                                  onClick={() => setLightboxImage({ url, title: `${selectedCourier.full_name} - Driver's License (Front)` })}
                                />
                                <div className="absolute inset-0 bg-slate-950/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                  <button
                                    onClick={() => setLightboxImage({ url, title: `${selectedCourier.full_name} - Driver's License (Front)` })}
                                    className="px-3.5 py-2 bg-brand-blue hover:bg-brand-blue/90 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg cursor-pointer"
                                  >
                                    <ZoomIn className="w-4 h-4" />
                                    <span>Inspect</span>
                                  </button>
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold shadow-lg cursor-pointer"
                                    title="Open Full Resolution"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </a>
                                </div>
                              </div>
                            ) : (
                              <div className="h-56 rounded-xl border border-dashed border-slate-800 flex flex-col items-center justify-center text-slate-500 gap-2 bg-slate-900/20">
                                <Award className="w-8 h-8 opacity-40" />
                                <span className="text-xs font-semibold">License Front not submitted</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* License Back */}
                      {(() => {
                        const licBack = selectedCourier.driver_documents?.find(d => d.document_type === 'license_back');
                        const url = licBack?.file_url;
                        return (
                          <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                Driver's License (Back)
                              </span>
                              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                                url ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-500'
                              }`}>
                                {url ? 'Uploaded' : 'Missing'}
                              </span>
                            </div>

                            {url ? (
                              <div className="relative group rounded-xl overflow-hidden bg-slate-900 border border-slate-800 h-56 flex items-center justify-center">
                                <img
                                  src={url}
                                  alt="License Back"
                                  className="w-full h-full object-contain cursor-pointer transition-transform group-hover:scale-105"
                                  onClick={() => setLightboxImage({ url, title: `${selectedCourier.full_name} - Driver's License (Back)` })}
                                />
                                <div className="absolute inset-0 bg-slate-950/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                  <button
                                    onClick={() => setLightboxImage({ url, title: `${selectedCourier.full_name} - Driver's License (Back)` })}
                                    className="px-3.5 py-2 bg-brand-blue hover:bg-brand-blue/90 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg cursor-pointer"
                                  >
                                    <ZoomIn className="w-4 h-4" />
                                    <span>Inspect</span>
                                  </button>
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold shadow-lg cursor-pointer"
                                    title="Open Full Resolution"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </a>
                                </div>
                              </div>
                            ) : (
                              <div className="h-56 rounded-xl border border-dashed border-slate-800 flex flex-col items-center justify-center text-slate-500 gap-2 bg-slate-900/20">
                                <Award className="w-8 h-8 opacity-40" />
                                <span className="text-xs font-semibold">License Back not submitted</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-tab 2: Vehicle Inspection & Photos */}
              {reviewActiveSubTab === 'vehicle' && (
                <div className="space-y-6">
                  {/* Vehicle Specs Header Card */}
                  <div className="bg-slate-850/40 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-slate-800 pb-3">
                      <div>
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block">Registered Vehicle</span>
                        <h4 className="text-lg font-black text-white mt-0.5">
                          {selectedCourier.vehicle ? `${selectedCourier.vehicle.make || ''} ${selectedCourier.vehicle.model || ''}`.trim() : 'No Vehicle Profile'}
                        </h4>
                      </div>
                      {selectedCourier.vehicle?.license_plate && (
                        <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-center">
                          <span className="text-[10px] text-slate-500 font-bold uppercase block">Plate Number</span>
                          <span className="font-mono text-base font-black text-amber-400 tracking-wider">
                            {selectedCourier.vehicle.license_plate}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Vehicle Type</span>
                        <span className="text-white font-bold capitalize mt-0.5 block">
                          {selectedCourier.vehicle?.vehicle_type || selectedCourier.driver_applications?.vehicle_type || 'Unspecified'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Year / Model</span>
                        <span className="text-white font-bold mt-0.5 block">
                          {selectedCourier.vehicle?.year || 'N/A'} {selectedCourier.vehicle?.model || ''}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Color</span>
                        <span className="text-white font-bold capitalize mt-0.5 block">
                          {selectedCourier.vehicle?.color || 'Standard'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Active Status</span>
                        <span className="text-emerald-400 font-bold mt-0.5 block">
                          {selectedCourier.vehicle?.is_active ? 'Active on Fleet' : 'Pending Verification'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 4-angle Vehicle Photos Gallery */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                      <Car className="w-4 h-4 text-brand-blue" />
                      <span>Physical Vehicle Photos (4 Angles)</span>
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {[
                        { label: 'Front View (with Plate)', url: selectedCourier.vehicle?.photo_front_url },
                        { label: 'Rear View (with Plate)', url: selectedCourier.vehicle?.photo_back_url },
                        { label: 'Left Side View', url: selectedCourier.vehicle?.photo_left_url },
                        { label: 'Right Side View', url: selectedCourier.vehicle?.photo_right_url },
                      ].map((item, idx) => (
                        <div key={idx} className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-3.5 flex flex-col justify-between">
                          <span className="text-xs font-bold text-slate-200 mb-2.5 block truncate">
                            {item.label}
                          </span>

                          {item.url ? (
                            <div className="relative group rounded-xl overflow-hidden bg-slate-900 border border-slate-800 h-44 flex items-center justify-center">
                              <img
                                src={item.url}
                                alt={item.label}
                                className="w-full h-full object-cover cursor-pointer transition-transform group-hover:scale-105"
                                onClick={() => setLightboxImage({ url: item.url!, title: `${selectedCourier.full_name} - ${item.label}` })}
                              />
                              <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button
                                  onClick={() => setLightboxImage({ url: item.url!, title: `${selectedCourier.full_name} - ${item.label}` })}
                                  className="p-2 bg-brand-blue hover:bg-brand-blue/90 text-white rounded-lg text-xs font-bold cursor-pointer"
                                  title="Enlarge Photo"
                                >
                                  <ZoomIn className="w-4 h-4" />
                                </button>
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                                  title="Open in new tab"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              </div>
                            </div>
                          ) : (
                            <div className="h-44 rounded-xl border border-dashed border-slate-800 flex flex-col items-center justify-center text-slate-500 gap-1.5 bg-slate-900/20">
                              <Car className="w-6 h-6 opacity-40" />
                              <span className="text-[11px] font-semibold">Not uploaded</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-tab 3: AI Screening & OCR Data */}
              {reviewActiveSubTab === 'ai' && (
                <div className="space-y-6">
                  {/* Top Badges */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-slate-950/40 border border-slate-850 p-4.5 rounded-2xl">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">National ID AI Status</span>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs font-bold text-white">OCR Check</span>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                          selectedCourier.driver_applications?.id_verification_status === 'verified'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : selectedCourier.driver_applications?.id_verification_status === 'flagged'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {selectedCourier.driver_applications?.id_verification_status || 'Pending'}
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-950/40 border border-slate-850 p-4.5 rounded-2xl">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">License AI Status</span>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs font-bold text-white">OCR Check</span>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                          selectedCourier.driver_applications?.license_verification_status === 'verified'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : selectedCourier.driver_applications?.license_verification_status === 'flagged'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {selectedCourier.driver_applications?.license_verification_status || 'Pending'}
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-950/40 border border-slate-850 p-4.5 rounded-2xl">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Pre-Screening Recommendation</span>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs font-bold text-white">AI Verdict</span>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                          selectedCourier.driver_applications?.screening_verdict === 'approve'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : selectedCourier.driver_applications?.screening_verdict === 'reject'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {selectedCourier.driver_applications?.screening_verdict?.replace(/_/g, ' ') || 'Pending'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* AI Flags */}
                  {selectedCourier.driver_applications?.verification_flags && selectedCourier.driver_applications.verification_flags.length > 0 && (
                    <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex items-start gap-3">
                      <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-black text-amber-400 uppercase tracking-wider">AI Flags & Document Alerts</h4>
                        <ul className="list-disc pl-4 text-xs text-slate-300 space-y-1 mt-1 font-medium">
                          {selectedCourier.driver_applications.verification_flags.map((flag: string, i: number) => (
                            <li key={i}>{flag}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Extracted Comparison */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Extracted ID */}
                    <div className="bg-slate-850/30 border border-slate-800 p-4.5 rounded-2xl space-y-3">
                      <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-brand-blue" />
                        National ID OCR Data
                      </h4>
                      {selectedCourier.driver_applications?.id_extracted_data ? (
                        <div className="grid grid-cols-2 gap-2.5 text-xs">
                          <div>
                            <span className="text-slate-500 text-[10px] uppercase font-bold block">Name on ID</span>
                            <span className="text-slate-200 font-semibold">{selectedCourier.driver_applications.id_extracted_data.full_name || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[10px] uppercase font-bold block">ID Number</span>
                            <span className="text-slate-200 font-mono font-semibold">{selectedCourier.driver_applications.id_extracted_data.id_number || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[10px] uppercase font-bold block">Date of Birth</span>
                            <span className="text-slate-200 font-semibold">{selectedCourier.driver_applications.id_extracted_data.date_of_birth || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[10px] uppercase font-bold block">Confidence</span>
                            <span className="text-slate-200 font-semibold capitalize">{selectedCourier.driver_applications.id_extracted_data.confidence || 'N/A'}</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic">No ID OCR data extracted.</p>
                      )}
                    </div>

                    {/* Extracted License */}
                    <div className="bg-slate-850/30 border border-slate-800 p-4.5 rounded-2xl space-y-3">
                      <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        Driver's License OCR Data
                      </h4>
                      {selectedCourier.driver_applications?.license_extracted_data ? (
                        <div className="grid grid-cols-2 gap-2.5 text-xs">
                          <div>
                            <span className="text-slate-500 text-[10px] uppercase font-bold block">Name on License</span>
                            <span className="text-slate-200 font-semibold">{selectedCourier.driver_applications.license_extracted_data.full_name || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[10px] uppercase font-bold block">License Number</span>
                            <span className="text-slate-200 font-mono font-semibold">{selectedCourier.driver_applications.license_extracted_data.id_number || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[10px] uppercase font-bold block">Expiry Date</span>
                            <span className="text-slate-200 font-semibold">{selectedCourier.driver_applications.license_extracted_data.expiry_date || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[10px] uppercase font-bold block">Confidence</span>
                            <span className="text-slate-200 font-semibold capitalize">{selectedCourier.driver_applications.license_extracted_data.confidence || 'N/A'}</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic">No license OCR data extracted.</p>
                      )}
                    </div>
                  </div>

                  {/* AI Reasoning */}
                  {selectedCourier.driver_applications?.screening_reasoning && (
                    <div className="bg-slate-850/30 border border-slate-800 p-4.5 rounded-2xl space-y-1.5">
                      <h4 className="text-xs font-black text-white uppercase tracking-wider">AI Evaluation Reasoning</h4>
                      <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/40 p-3.5 rounded-xl border border-slate-800">
                        {selectedCourier.driver_applications.screening_reasoning}
                      </p>
                    </div>
                  )}

                  {/* Screening Transcript */}
                  {selectedCourier.driver_applications?.screening_transcript && selectedCourier.driver_applications.screening_transcript.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-black text-white uppercase tracking-wider">Applicant Pre-Screening Chat</h4>
                      <div className="bg-slate-950/40 border border-slate-850 rounded-2xl p-4 max-h-52 overflow-y-auto space-y-3 text-xs">
                        {selectedCourier.driver_applications.screening_transcript.map((msg: any, i: number) => {
                          const isUser = msg.role === 'user';
                          return (
                            <div key={i} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                              <div className={`max-w-[80%] p-3 rounded-2xl font-medium leading-relaxed ${
                                isUser 
                                  ? 'bg-brand-blue/15 text-brand-blue border border-brand-blue/30 rounded-tr-none' 
                                  : 'bg-slate-850 border border-slate-800 text-slate-200 rounded-tl-none'
                              }`}>
                                <p>{msg.content}</p>
                              </div>
                              <span className="text-[9px] text-slate-500 font-bold uppercase mt-1 px-2">
                                {isUser ? selectedCourier.full_name || 'Applicant' : 'Shipmate AI'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Bottom Decision Actions Bar */}
            <div className="p-4 sm:p-6 border-t border-slate-800 bg-slate-900/90 backdrop-blur-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center justify-between sm:justify-start gap-3 text-xs w-full sm:w-auto">
                <span className="text-slate-400 font-semibold">Current State:</span>
                <span className={`font-black uppercase px-2.5 py-1 rounded-lg border ${
                  selectedCourier.drivers?.verification_status === 'approved'
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : selectedCourier.drivers?.verification_status === 'rejected'
                    ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                    : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                }`}>
                  {selectedCourier.drivers?.verification_status || 'PENDING APPROVAL'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end">
                <button
                  onClick={() => setShowReviewModal(false)}
                  className="px-4 sm:px-5 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Close
                </button>

                {/* Disapprove Button */}
                <button
                  onClick={() => openDisapprovalModal(selectedCourier)}
                  className="px-4 sm:px-5 py-2.5 bg-rose-500/15 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/30 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 sm:gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Disapprove / Fix</span>
                </button>

                {/* Approve Button */}
                {selectedCourier.drivers?.verification_status !== 'approved' && (
                  <button
                    onClick={() => handleApproveDriver(selectedCourier)}
                    className="px-5 sm:px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl transition-all shadow-lg shadow-emerald-500/25 cursor-pointer flex items-center gap-1.5 sm:gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Approve Application</span>
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* DISAPPROVAL & FEEDBACK MODAL */}
      {/* ========================================================= */}
      {showDisapprovalModal && disapprovalCourier && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-55 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 p-5 sm:p-8 rounded-3xl sm:rounded-[2.5rem] shadow-2xl relative space-y-5 sm:space-y-6 max-h-[94vh] overflow-y-auto">
            
            <button
              onClick={() => setShowDisapprovalModal(false)}
              className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-rose-500/15 text-rose-400 border border-rose-500/30 rounded-2xl flex items-center justify-center shrink-0">
                <XCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white">Disapprove Application</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Courier: <strong className="text-slate-200">{disapprovalCourier.full_name || disapprovalCourier.email}</strong>
                </p>
              </div>
            </div>

            <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-2xl text-xs text-slate-300 leading-relaxed">
              <p className="font-semibold text-slate-200 mb-1 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-brand-blue" />
                How this works:
              </p>
              This comment will be displayed directly in the courier's ShipMate Driver mobile app with instructions on what documents or information to fix and resubmit.
            </div>

            {/* Quick Presets */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Quick-Select Reason Presets:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {DISAPPROVAL_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (!disapprovalReason.trim()) {
                        setDisapprovalReason(preset.text);
                      } else {
                        setDisapprovalReason(prev => `${prev}\n• ${preset.text}`);
                      }
                    }}
                    className="px-2.5 py-1 bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-750 text-[11px] font-semibold rounded-lg transition-all cursor-pointer"
                  >
                    + {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reason Text Area */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>Detailed Instructions for Driver:</span>
                <span className="text-[11px] text-slate-500 font-normal">
                  {disapprovalReason.length} characters
                </span>
              </label>
              <textarea
                rows={4}
                value={disapprovalReason}
                onChange={(e) => setDisapprovalReason(e.target.value)}
                placeholder="Explain clearly what needs to be fixed (e.g. National ID photo is blurry, please take a well-lit photo of the front and back)..."
                className="w-full bg-slate-950/60 border border-slate-800 rounded-2xl p-4 text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/40 focus:border-rose-500 leading-relaxed placeholder:text-slate-600"
              />
            </div>

            {/* Direct WhatsApp Action if phone available */}
            {disapprovalCourier.phone && disapprovalReason.trim() && (
              <div className="p-3 bg-[#25D366]/10 border border-[#25D366]/20 rounded-2xl flex items-center justify-between text-xs">
                <span className="text-[#25D366] font-semibold flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4" />
                  Also notify driver directly via WhatsApp
                </span>
                <a
                  href={getCourierRejectionWhatsAppUrl(disapprovalCourier.phone, disapprovalCourier.full_name || 'Driver', disapprovalReason)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-[#25D366] hover:bg-[#25D366]/90 text-slate-950 font-black rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Send on WhatsApp
                </a>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDisapprovalModal(false)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs rounded-xl transition-all cursor-pointer text-center"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDisapproval}
                className="px-6 py-2.5 bg-rose-500 hover:bg-rose-400 text-white font-black text-xs rounded-xl transition-all shadow-lg shadow-rose-500/25 cursor-pointer flex items-center justify-center gap-2"
              >
                <XCircle className="w-4 h-4" />
                <span>Submit Disapproval & Send Comment</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* IMAGE LIGHTBOX MODAL */}
      {/* ========================================================= */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-60 flex flex-col items-center justify-center p-4 sm:p-8 animate-in fade-in duration-150"
          onClick={() => setLightboxImage(null)}
        >
          <div 
            className="relative max-w-5xl w-full max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Toolbar */}
            <div className="w-full flex items-center justify-between p-3 bg-slate-900/80 rounded-2xl border border-slate-800 mb-3 text-xs">
              <span className="font-bold text-white px-2 truncate">{lightboxImage.title}</span>
              <div className="flex items-center gap-2">
                <a
                  href={lightboxImage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Full Size</span>
                </a>
                <button
                  onClick={() => setLightboxImage(null)}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* High-res Image */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden p-2 flex items-center justify-center max-h-[78vh]">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.title}
                className="max-h-[75vh] max-w-full object-contain rounded-xl shadow-2xl"
              />
            </div>
          </div>
        </div>
      )}

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
              {/* Courier Profile & Contact Snapshot */}
              <div className="bg-slate-850/40 border border-slate-800 p-5 rounded-2xl space-y-3">
                <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  Courier Profile Record
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">National ID Number</span>
                    <span className="text-white font-mono font-bold text-sm mt-1 block">
                      {selectedUser.drivers?.national_id_number || selectedUser.driver_applications?.id_extracted_data?.id_number || 'Pending'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">License Number</span>
                    <span className="text-white font-mono font-bold text-sm mt-1 block">
                      {selectedUser.drivers?.license_number || selectedUser.driver_applications?.license_extracted_data?.id_number || 'None'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Emergency Contact</span>
                    <span className="text-slate-200 font-bold mt-1 block">
                      {selectedUser.drivers?.emergency_contact_name || 'None'}
                    </span>
                    <span className="text-slate-400 text-[11px] block">
                      {selectedUser.drivers?.emergency_contact_phone || ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Wallet Float</span>
                    <span className="text-emerald-400 font-black text-sm mt-1 block">
                      ${selectedUser.courier_wallets?.balance !== undefined ? selectedUser.courier_wallets.balance.toFixed(2) : '0.00'}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Top Summary Badges */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* ID Doc Verification Card */}
                <div className="bg-slate-950/20 border border-slate-850 p-4.5 rounded-2xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">National ID Scan</span>
                  <div className="flex items-center justify-between mt-2.5">
                    <span className="text-xs font-bold text-white">Status</span>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                      selectedUser.driver_applications?.id_verification_status === 'verified'
                        ? 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/20'
                        : selectedUser.driver_applications?.id_verification_status === 'flagged'
                        ? 'bg-rose-500/10 text-rose-450 border border-rose-500/20'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {selectedUser.driver_applications?.id_verification_status}
                    </span>
                  </div>
                </div>

                {/* License Doc Verification Card */}
                <div className="bg-slate-950/20 border border-slate-850 p-4.5 rounded-2xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Driver's License Scan</span>
                  <div className="flex items-center justify-between mt-2.5">
                    <span className="text-xs font-bold text-white">Status</span>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                      selectedUser.driver_applications?.license_verification_status === 'verified'
                        ? 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/20'
                        : selectedUser.driver_applications?.license_verification_status === 'flagged'
                        ? 'bg-rose-500/10 text-rose-450 border border-rose-500/20'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {selectedUser.driver_applications?.license_verification_status}
                    </span>
                  </div>
                </div>

                {/* Screening Verdict Card */}
                <div className="bg-slate-950/20 border border-slate-850 p-4.5 rounded-2xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Pre-Screening Verdict</span>
                  <div className="flex items-center justify-between mt-2.5">
                    <span className="text-xs font-bold text-white">Verdict</span>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                      selectedUser.driver_applications?.screening_verdict === 'approve'
                        ? 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/20'
                        : selectedUser.driver_applications?.screening_verdict === 'reject'
                        ? 'bg-rose-500/10 text-rose-450 border border-rose-500/20'
                        : 'bg-amber-500/10 text-amber-450 border border-amber-500/20'
                    }`}>
                      {selectedUser.driver_applications?.screening_verdict?.replace(/_/g, ' ') || 'Pending'}
                    </span>
                  </div>
                </div>

              </div>

              {/* Warnings / Flags Alert */}
              {selectedUser.driver_applications?.verification_flags && selectedUser.driver_applications?.verification_flags.length > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/15 p-4.5 rounded-2xl flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-amber-450 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-black text-amber-450 uppercase tracking-wider">AI Flags & Mismatch Alerts</h4>
                    <ul className="list-disc pl-4 text-xs text-slate-350 space-y-1 mt-2 font-semibold">
                      {selectedUser.driver_applications?.verification_flags.map((flag: string, i: number) => (
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
                    {selectedUser.driver_applications?.id_extracted_data ? (
                      <div className="grid grid-cols-2 gap-3 text-xs font-semibold">
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Full Name</span>
                          <span className="text-slate-200 mt-0.5 block">{selectedUser.driver_applications?.id_extracted_data.full_name || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">ID Number</span>
                          <span className="text-slate-200 mt-0.5 block font-mono">{selectedUser.driver_applications?.id_extracted_data.id_number || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Date of Birth</span>
                          <span className="text-slate-200 mt-0.5 block">{selectedUser.driver_applications?.id_extracted_data.date_of_birth || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Confidence</span>
                          <span className="text-slate-200 mt-0.5 block capitalize">{selectedUser.driver_applications?.id_extracted_data.confidence || 'N/A'}</span>
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
                    {selectedUser.driver_applications?.license_extracted_data ? (
                      <div className="grid grid-cols-2 gap-3 text-xs font-semibold">
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Full Name</span>
                          <span className="text-slate-200 mt-0.5 block">{selectedUser.driver_applications?.license_extracted_data.full_name || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">License Number</span>
                          <span className="text-slate-200 mt-0.5 block font-mono">{selectedUser.driver_applications?.license_extracted_data.id_number || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Expiry Date</span>
                          <span className="text-slate-200 mt-0.5 block">{selectedUser.driver_applications?.license_extracted_data.expiry_date || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Confidence</span>
                          <span className="text-slate-200 mt-0.5 block capitalize">{selectedUser.driver_applications?.license_extracted_data.confidence || 'N/A'}</span>
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
                        {selectedUser.driver_applications?.screening_reasoning || 'No details.'}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Extracted Vehicle</span>
                        <span className="text-slate-200 mt-1 block capitalize font-extrabold">{selectedUser.driver_applications?.vehicle_type || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Extracted Coverage Area</span>
                        <span className="text-slate-200 mt-1 block capitalize font-extrabold">{selectedUser.driver_applications?.coverage_area || 'N/A'}</span>
                      </div>
                    </div>

                    {selectedUser.driver_applications?.screening_concerns && selectedUser.driver_applications?.screening_concerns.length > 0 && (
                      <div>
                        <span className="text-rose-450 block font-black uppercase tracking-wider text-[10px] mt-2">Flagged Chat Concerns</span>
                        <ul className="list-disc pl-4 text-rose-400 space-y-1 mt-2 font-bold">
                          {selectedUser.driver_applications?.screening_concerns.map((concern: string, i: number) => (
                            <li key={i}>{concern}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Chat Transcript Drawer */}
              {selectedUser.driver_applications?.screening_transcript && selectedUser.driver_applications?.screening_transcript.length > 0 && (
                <div className="space-y-3 shrink-0">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-450">Screening Chat Transcript</h3>
                  <div className="bg-slate-950/20 border border-slate-850 rounded-2xl p-5 max-h-[220px] overflow-y-auto space-y-3 text-xs">
                    {selectedUser.driver_applications?.screening_transcript.map((msg: any, i: number) => {
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

            {/* Modal Footer with Direct Courier Approval Actions */}
            <div className="border-t border-slate-800 pt-5 mt-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Current Status:</span>
                <span className={`font-black uppercase px-2.5 py-1 rounded-lg ${
                  selectedUser.drivers?.verification_status === 'approved'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : selectedUser.drivers?.verification_status === 'rejected'
                    ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                }`}>
                  {selectedUser.drivers?.verification_status || 'PENDING APPROVAL'}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Close
                </button>

                {selectedUser.drivers?.verification_status !== 'rejected' && (
                  <button
                    onClick={() => handleRejectDriver(selectedUser)}
                    className="px-5 py-2.5 bg-rose-500/15 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/30 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Reject</span>
                  </button>
                )}

                {selectedUser.drivers?.verification_status !== 'approved' && (
                  <button
                    onClick={() => handleApproveDriver(selectedUser)}
                    className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl transition-all shadow-lg shadow-emerald-500/20 cursor-pointer flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Approve Courier</span>
                  </button>
                )}
              </div>
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-6 sm:p-8 rounded-3xl sm:rounded-[2.5rem] shadow-2xl relative">
            <button
              onClick={() => {
                setShowTopUpModalAdmin(false);
                setSelectedUser(null);
              }}
              className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white transition-colors cursor-pointer bg-slate-850 rounded-xl"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-6 pr-8">
              <div className="w-11 h-11 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-2xl flex items-center justify-center shrink-0">
                <Wallet className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-black text-white">Top Up Driver Float</h2>
                <p className="text-xs text-slate-400">Credit funds directly into driver's wallet</p>
              </div>
            </div>

            <form onSubmit={handleAdminTopUpSubmit} className="space-y-4 text-xs font-semibold">
              <div className="bg-slate-950/30 border border-slate-850 p-4 rounded-2xl space-y-1 text-slate-350">
                <p>Driver: <span className="font-bold text-white">{selectedUser.full_name || 'No Name'}</span> ({selectedUser.email})</p>
                <p>Current Balance: <span className="font-bold text-emerald-400 text-sm">${selectedUser.courier_wallets?.balance !== undefined ? selectedUser.courier_wallets.balance.toFixed(2) : '0.00'}</span></p>
                <p>Status: <span className={`font-bold uppercase text-[10px] ${selectedUser.courier_wallets?.status === 'locked' ? 'text-rose-400' : 'text-emerald-400'}`}>{selectedUser.courier_wallets?.status || 'Active'}</span></p>
              </div>

              {/* Quick presets */}
              <div className="space-y-1.5">
                <label className="text-slate-400 ml-1">Quick Select Amount:</label>
                <div className="grid grid-cols-4 gap-2">
                  {['5.00', '10.00', '20.00', '50.00'].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setAdminTopUpAmount(amt)}
                      className={`py-2 rounded-xl border font-bold text-xs transition-all cursor-pointer text-center ${
                        adminTopUpAmount === amt
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                          : 'bg-slate-850 hover:bg-slate-800 text-slate-300 border-slate-750'
                      }`}
                    >
                      +${parseFloat(amt).toFixed(0)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-400 ml-1">Amount to Credit (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  placeholder="10.00"
                  value={adminTopUpAmount}
                  onChange={(e) => setAdminTopUpAmount(e.target.value)}
                  className="w-full bg-slate-950/40 border border-slate-800 rounded-2xl py-3 px-4 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowTopUpModalAdmin(false);
                    setSelectedUser(null);
                  }}
                  className="px-5 py-3 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adminTopUpLoading}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {adminTopUpLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Credit ${parseFloat(adminTopUpAmount || '0').toFixed(2)}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
