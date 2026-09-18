export type UserRole = 'customer' | 'driver' | 'admin';
export type AccountStatus = 'active' | 'suspended' | 'deleted';
export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type VehicleType = 'motorcycle' | 'car' | 'van' | 'bicycle';
export type DocumentType = 'national_id_front' | 'national_id_back' | 'license_front' | 'license_back' | 'vehicle_registration' | 'insurance';

export interface UserProfile {
    id: string;
    email: string;
    full_name: string | null;
    role: UserRole;
    phone: string | null;
    account_status: AccountStatus;
    expo_push_token: string | null;
    profile_photo_url: string | null;
    email_verified: boolean;
    phone_verified: boolean;
    created_at: string;
    updated_at: string;
}

export interface CustomerProfile {
    id: string;
    total_orders: number;
    lifetime_spend: number;
    referral_code: string | null;
    referred_by: string | null;
}

export type DriverTier = 'standard' | 'silver' | 'gold' | 'platinum';

export interface DriverProfile {
    id: string;
    date_of_birth: string | null;
    national_id_number: string | null;
    license_number: string | null;
    license_expiry_date: string | null;
    verification_status: VerificationStatus;
    rejection_reason: string | null;
    is_online: boolean;
    is_identity_verified?: boolean;
    tier?: DriverTier;
    working_radius_km: number;
    total_deliveries: number;
    completed_deliveries: number;
    cancelled_deliveries: number;
    average_rating: number;
    acceptance_rate?: number;
    completion_rate?: number;
    on_time_rate?: number;
    platform_balance: number;
    available_balance: number;
    total_earnings: number;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
}

export interface Vehicle {
    id: string;
    driver_id: string;
    vehicle_type: VehicleType;
    make: string;
    model: string;
    year: number;
    color: string;
    license_plate: string;
    photo_front_url: string | null;
    photo_back_url: string | null;
    photo_left_url: string | null;
    photo_right_url: string | null;
    is_active: boolean;
    registration_number: string | null;
    insurance_expiry_date: string | null;
}

export interface DriverDocument {
    id: string;
    driver_id: string;
    document_type: DocumentType;
    file_url: string;
    uploaded_at: string;
    verified: boolean;
    verified_at?: string | null;
}

export type ServiceType = 'delivery' | 'errand';

export type OrderStatus = 
    | 'pending' 
    | 'driver_assigned' 
    | 'en_route_to_pickup' 
    | 'arrived_at_pickup' 
    | 'picked_up' 
    | 'en_route_to_delivery' 
    | 'arrived_at_delivery' 
    | 'delivered' 
    | 'completed'
    | 'cancelled' 
    | 'failed'
    | 'en_route'
    | 'arrived'
    | 'in_delivery'
    | 'disputed';

export type OrderReleaseReason = 'mechanical_issue' | 'store_closed' | 'customer_no_show';

export interface Order {
    id: string;
    order_number: string | null;
    customer_id: string;
    driver_id: string | null;
    service_type: ServiceType;
    status: OrderStatus;
    
    // Pickup Details
    pickup_address: string | null;
    pickup_latitude: number | null;
    pickup_longitude: number | null;
    
    // Dropoff Details
    dropoff_address: string | null;
    dropoff_latitude: number | null;
    dropoff_longitude: number | null;
    
    // Real-time Driver Tracking
    driver_latitude: number | null;
    driver_longitude: number | null;
    
    // Errand Specifics
    errand_location: string | null;
    errand_instructions: string | null;
    
    // Package Details
    package_description: string | null;
    package_category: string | null;
    package_weight: string | null;
    package_dimensions: string | null;
    
    // Pricing & Discounts
    estimated_cost: number;
    gross_amount?: number | null;
    discount_amount?: number | null;
    promo_code?: string | null;
    
    // Priority Dispatch & Metric Fields
    priority_window_ends_at?: string | null;
    priority_tier_required?: DriverTier | null;
    estimated_delivery_at?: string | null;
    delivered_at?: string | null;
    customer_rating?: number | null;
    customer_feedback?: string | null;
    customer_acknowledged?: boolean;
    acknowledged_at?: string | null;
    delivery_signature_url?: string | null;
    // Payment & Settlement Directives
    payment_method?: string;
    payment_status?: string;
    cash_to_collect?: number;
    payment_phone?: string | null;

    // Recipient & SMS Notification Directives
    recipient_name?: string | null;
    recipient_phone?: string | null;
    recipient_notes?: string | null;
    sms_notifications_enabled?: boolean;
    sms_notification_fee?: number;

    // Cancellation & Release & Anti-Abuse Tracking
    cumulative_distance_km?: number;
    last_driver_latitude?: number | null;
    last_driver_longitude?: number | null;
    cancellation_reason?: string | null;
    cancellation_fee?: number;
    cancelled_at?: string | null;
    released_count?: number;
    last_released_reason?: OrderReleaseReason | null;
    last_released_at?: string | null;
    arrival_timer_started_at?: string | null;
    pending_release_compensation?: number;
    pending_release_driver_id?: string | null;

    // Handover PIN (OTP) Delivery Confirmation
    handover_pin?: string | null;
    pin_attempts_count?: number;
    pin_locked?: boolean;
    pin_verified_at?: string | null;
    pin_fallback_to_photo?: boolean;
    pin_failed_flagged?: boolean;

    created_at: string;
    updated_at: string;
    courier_wallets?: CourierWalletInfo | null;
}

export interface HandoverPinVerificationResult {
    success: boolean;
    order?: Order;
    order_status?: string;
    error?: string;
    message?: string;
    attempts_left?: number;
    locked?: boolean;
    fallback_to_photo?: boolean;
}

export type CourierWalletStatus = 'active' | 'locked';
export type WalletTransactionType = 'topup' | 'commission_deduction' | 'promo_credit';

export interface CourierWalletInfo {
    balance: number;
    status: CourierWalletStatus;
}

export interface CourierWallet {
    courier_id: string;
    balance: number;
    status: CourierWalletStatus;
    promo_applied: boolean;
    created_at: string;
    updated_at: string;
}

export interface WalletTransaction {
    id: string;
    courier_id: string;
    type: WalletTransactionType;
    amount: number;
    net_amount: number | null;
    job_id: string | null;
    created_at: string;
}

export interface MaskedCallLog {
    id: string;
    order_id: string;
    caller_id?: string | null;
    caller_role: 'driver' | 'customer' | 'system';
    recipient_id?: string | null;
    recipient_phone?: string | null;
    masked_proxy_number: string;
    status: 'initiated' | 'completed' | 'unanswered' | 'busy' | 'failed' | 'simulated';
    duration_seconds: number;
    trigger_event: 'manual_driver_call' | 'auto_cancellation' | 'auto_release';
    created_at: string;
}

export interface OrderRelease {
    id: string;
    order_id: string;
    driver_id: string;
    reason: OrderReleaseReason;
    call_log_id?: string | null;
    auto_flagged: boolean;
    rating_penalty_applied: number;
    compensation_proposed: number;
    compensation_accepted?: boolean | null;
    dispute_reason?: string | null;
    created_at: string;
}

export interface CancellationDebt {
    id: string;
    customer_id: string;
    order_id: string;
    amount: number;
    source: 'cancellation_fee' | 'release_compensation';
    settled: boolean;
    settled_at?: string | null;
    payment_method?: string | null;
    payment_reference?: string | null;
    created_at: string;
}

