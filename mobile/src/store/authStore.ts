import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';

type UserRole = 'customer' | 'driver' | 'admin' | null;
type VerificationStatus = 'onboarding' | 'pending' | 'approved' | 'rejected' | 'suspended' | null;

interface AuthState {
    session: Session | null;
    user: User | null;
    role: UserRole;
    verificationStatus: VerificationStatus;
    rejectionReason: string | null;
    setSession: (session: Session | null) => void;
    setUser: (user: User | null) => void;
    setRole: (role: UserRole) => void;
    setVerificationStatus: (status: VerificationStatus) => void;
    setRejectionReason: (reason: string | null) => void;
    signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    session: null,
    user: null,
    role: null,
    verificationStatus: null,
    rejectionReason: null,
    setSession: (session) => set({ session }),
    setUser: (user) => set({ user }),
    setRole: (role) => set({ role }),
    setVerificationStatus: (status) => set({ verificationStatus: status }),
    setRejectionReason: (rejectionReason) => set({ rejectionReason }),
    signOut: () => set({ session: null, user: null, role: null, verificationStatus: null, rejectionReason: null }),
}));
