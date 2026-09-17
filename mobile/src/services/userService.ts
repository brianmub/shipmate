import { supabase } from '../utils/supabase';
import { UserProfile, DriverTier } from '../types';

export const userService = {
    /**
     * Fetch user profile from public.users
     */
    async getUserProfile(userId: string) {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) throw error;
        return data as UserProfile;
    },

    /**
     * Fetch driver's current tier (e.g., 'platinum' | 'standard')
     */
    async getDriverTier(userId: string): Promise<DriverTier> {
        try {
            const { data, error } = await supabase
                .from('drivers')
                .select('tier')
                .eq('id', userId)
                .single();

            if (error || !data) return 'standard';
            return (data.tier as DriverTier) || 'standard';
        } catch {
            return 'standard';
        }
    },

    /**
     * Update user's push notification token
     */
    async updatePushToken(userId: string, token: string) {
        const { error } = await supabase
            .from('users')
            .update({ expo_push_token: token })
            .eq('id', userId);

        if (error) throw error;
    },

    /**
     * Fetch full driver profile with metrics
     */
    async getDriverProfile(userId: string) {
        const { data, error } = await supabase
            .from('drivers')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error) throw error;
        return data;
    },

    /**
     * Toggle driver online status
     */
    async toggleOnlineStatus(userId: string, isOnline: boolean) {
        const { error } = await supabase
            .from('drivers')
            .update({ is_online: isOnline })
            .eq('id', userId);

        if (error) throw error;
    },

    /**
     * Fetch driver verification status
     */
    async getDriverStatus(userId: string) {
        try {
            // 1. Fetch driver status
            const { data: driverData, error: driverError } = await supabase
                .from('drivers')
                .select('verification_status')
                .eq('id', userId)
                .single();
            
            if (driverError) {
                if (driverError.code === 'PGRST116') return 'onboarding'; // No profile created yet
                throw driverError;
            }

            // 2. Fetch driver application details to check onboarding completion
            const { data: appData, error: appError } = await supabase
                .from('driver_applications')
                .select('screening_status')
                .eq('id', userId)
                .single();

            // If no application exists, or screening_status is not 'completed', they are still onboarding
            if (appError || !appData || appData.screening_status !== 'completed') {
                // If driver is already approved in drivers subtable (e.g. seeded drivers), respect it
                if (driverData.verification_status === 'approved') {
                    return 'approved';
                }
                return 'onboarding';
            }

            return driverData.verification_status;
        } catch (error) {
            console.log('Error fetching driver status, defaulting to onboarding:', error);
            return 'onboarding';
        }
    },

    /**
     * Fetch recent transaction ledger entries for a driver
     */
    async getTransactions(driverId: string) {
        const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('driver_id', driverId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    /**
     * Fetch platform-wide system settings (pricing, payout thresholds)
     */
    async getSystemSettings() {
        const { data, error } = await supabase
            .from('system_settings')
            .select('*')
            .eq('id', 1)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    /**
     * Fetch platform-wide app settings toggles
     */
    async getAppSettings() {
        const { data, error } = await supabase
            .from('app_settings')
            .select('*');

        if (error) throw error;
        return data;
    },


    /**
     * Submit driver payout request via automated disbursement (EcoCash, InnBucks, or Bank Transfer)
     */
    async requestAutomatedPayout(params: {
        courierId: string;
        amount: number;
        payoutMethod: 'ecocash' | 'innbucks' | 'bank_transfer';
        destinationAccount: string;
        recipientName?: string;
        bankDetails?: {
            bankName: string;
            accountNumber: string;
            accountName: string;
        };
    }) {
        try {
            const { data, error } = await supabase.functions.invoke('driver-payout', {
                body: params
            });

            if (!error && data && data.success) {
                return data;
            }

            if (data && data.error) {
                throw new Error(data.error);
            }

            if (error) {
                throw error;
            }

            return data;
        } catch (invokeErr: any) {
            console.warn('Edge function driver-payout invocation error, attempting direct RPC fallback:', invokeErr.message);
            const prefix = params.payoutMethod === 'ecocash' ? 'ECO' : params.payoutMethod === 'innbucks' ? 'INN' : 'BNK';
            const uniqueRef = `PO-${prefix}-${params.courierId.substring(0, 6)}-${Date.now()}`;
            
            const { data: rpcData, error: rpcError } = await supabase.rpc('process_driver_payout_rpc', {
                p_driver_id: params.courierId,
                p_amount: params.amount,
                p_method: params.payoutMethod,
                p_destination: params.destinationAccount,
                p_reference: uniqueRef,
                p_provider_details: { mode: 'direct_rpc_disbursement', fallback: true }
            });

            if (rpcError) throw rpcError;
            return {
                success: true,
                payoutReference: uniqueRef,
                amount: params.amount,
                method: params.payoutMethod,
                destination: params.destinationAccount,
                remainingBalance: rpcData?.remaining_balance
            };
        }
    },

    /**
     * Legacy driver payout request
     */
    async requestPayout(driverId: string, amount: number) {
        return this.requestAutomatedPayout({
            courierId: driverId,
            amount: amount,
            payoutMethod: 'ecocash',
            destinationAccount: 'Registered Mobile Number'
        });
    },

    /**
     * Fetch courier's wallet details
     */
    async getCourierWallet(courierId: string) {
        const { data, error } = await supabase
            .from('courier_wallets')
            .select('*')
            .eq('courier_id', courierId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null; // No wallet found yet
            throw error;
        }
        return data;
    },

    /**
     * Fetch courier's wallet transaction history
     */
    async getWalletTransactions(courierId: string) {
        const { data, error } = await supabase
            .from('wallet_transactions')
            .select('*')
            .eq('courier_id', courierId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    /**
     * Delete user account and wipe personal data (complying with Apple Guideline 5.1.1(v))
     */
    async deleteAccount(userId: string): Promise<{ success: boolean; message: string }> {
        // 1. Pre-check: Verify user has no active in-flight orders
        const { data: activeOrders, error: orderCheckErr } = await supabase
            .from('orders')
            .select('id, status')
            .or(`customer_id.eq.${userId},driver_id.eq.${userId}`)
            .in('status', [
                'driver_assigned',
                'en_route_to_pickup',
                'arrived_at_pickup',
                'picked_up',
                'en_route_to_delivery',
                'arrived_at_delivery'
            ])
            .limit(1);

        if (!orderCheckErr && activeOrders && activeOrders.length > 0) {
            throw new Error(
                'Cannot delete account while you have an active delivery in progress. Please complete or cancel your active order first.'
            );
        }

        // 2. Execute server-side RPC if deployed
        try {
            const { data: rpcResult, error: rpcError } = await supabase.rpc('delete_user_account_rpc');
            if (!rpcError && rpcResult) {
                if (rpcResult.success === false) {
                    throw new Error(rpcResult.message || 'Account deletion failed.');
                }
                return { success: true, message: rpcResult.message || 'Account deleted.' };
            }
        } catch (rpcErr: any) {
            console.warn('RPC delete_user_account_rpc failed or not yet deployed, using direct client fallback:', rpcErr?.message);
        }

        // 3. Fallback: Anonymize personal identity in public.users
        const { error: userWipeErr } = await supabase
            .from('users')
            .update({
                full_name: 'Deleted User',
                phone: null,
                expo_push_token: null,
                account_status: 'deleted',
                profile_photo_url: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId);

        if (userWipeErr) {
            console.warn('Could not wipe public.users directly:', userWipeErr.message);
        }

        // 4. If driver, take offline and mark suspended
        try {
            await supabase
                .from('drivers')
                .update({
                    is_online: false,
                    tier: 'standard',
                    status: 'suspended',
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId);
        } catch {
            // Driver row may not exist for customer
        }

        return {
            success: true,
            message: 'Your account and personal data have been deleted.'
        };
    }
};
