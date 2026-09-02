import { supabase } from '../utils/supabase';

export interface ClicknPayOrderResponse {
    success: boolean;
    clientReference: string;
    paymeURL: string;
    grossAmount: number;
    orderData?: any;
    error?: string;
}

export interface ClicknPayVerificationResponse {
    success: boolean;
    status: string;
    grossAmount?: number;
    fee?: number;
    netAmount?: number;
    newBalance?: number;
    message?: string;
    clicknPayDetails?: any;
    error?: string;
}

export const paymentService = {
    /**
     * Create a ClicknPay payment order for driver wallet top-up
     * @param courierId The UUID of the courier
     * @param amount The gross amount to top up (Minimum $5.00 USD)
     * @param phoneNumber Optional phone number of the customer/driver
     * @returns Object containing clientReference and paymeURL
     */
    async createPaymentOrder(courierId: string, amount: number, phoneNumber?: string): Promise<ClicknPayOrderResponse> {
        if (amount < 5.00) {
            throw new Error('Minimum top-up amount is $5.00 USD');
        }

        const { data, error } = await supabase.functions.invoke('clicknpay-topup', {
            body: {
                action: 'create-order',
                courierId,
                amount,
                phoneNumber
            }
        });

        if (error) {
            throw error;
        }

        if (data && data.error) {
            throw new Error(data.error);
        }

        return data;
    },

    /**
     * Verify the payment status with ClicknPay and credit driver wallet if successful
     * @param courierId The UUID of the courier
     * @param clientReference The unique reference generated during order creation
     * @param amount The gross amount to verify
     * @returns Verification result including payment status and new balance
     */
    async verifyPaymentStatus(courierId: string, clientReference: string, amount?: number): Promise<ClicknPayVerificationResponse> {
        const { data, error } = await supabase.functions.invoke('clicknpay-topup', {
            body: {
                action: 'verify-status',
                courierId,
                clientReference,
                amount
            }
        });

        if (error) {
            throw error;
        }

        if (data && data.error) {
            throw new Error(data.error);
        }

        return data;
    },

    /**
     * Legacy / helper method for wallet topup
     */
    async topupWallet(courierId: string, amount: number, phoneNumber?: string) {
        return this.createPaymentOrder(courierId, amount, phoneNumber);
    }
};

