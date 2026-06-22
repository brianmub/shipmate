import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';

type UserRole = 'customer' | 'driver' | 'admin' | null;
type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'suspended' | null;

interface AuthState {
    session: Session | null;
    user: User | null;
    role: UserRole;
    verificationStatus: VerificationStatus;
    initialized: boolean;
    setSession: (session: Session | null) => void;
    setUser: (user: User | null) => void;
    setRole: (role: UserRole) => void;
    setVerificationStatus: (status: VerificationStatus) => void;
    setInitialized: (initialized: boolean) => void;
    signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    session: null,
    user: null,
    role: null,
    verificationStatus: null,
    initialized: false,
    setSession: (session) => set({ session }),
    setUser: (user) => set({ user }),
    setRole: (role) => set({ role }),
    setVerificationStatus: (status) => set({ verificationStatus: status }),
    setInitialized: (initialized) => set({ initialized }),
    signOut: () => {
        set({ session: null, user: null, role: null, verificationStatus: null });
    },
}));
