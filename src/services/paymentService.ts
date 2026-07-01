import { supabase } from '../utils/supabase';

export const paymentService = {
    /**
     * Initiate a wallet top-up transaction through ClickNPay
     * @param courierId The UUID of the courier
     * @param amount The gross amount to top up (Minimum $5.00 USD)
     * @returns Object containing transaction gross, fee, net credited amount, and new balance
     */
    async topupWallet(courierId: string, amount: number) {
        if (amount < 5.00) {
            throw new Error('Minimum top-up amount is $5.00 USD');
        }

        const { data, error } = await supabase.functions.invoke('clicknpay-topup', {
            body: {
                courierId,
                amount
            }
        });

        if (error) {
            throw error;
        }

        if (data && data.error) {
            throw new Error(data.error);
        }

        return data; // Returns { success, grossAmount, fee, netAmount, newBalance }
    }
};
