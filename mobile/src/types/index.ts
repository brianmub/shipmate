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

export interface DriverProfile {
    id: string;
    date_of_birth: string | null;
    national_id_number: string | null;
    license_number: string | null;
    license_expiry_date: string | null;
    verification_status: VerificationStatus;
    rejection_reason: string | null;
    is_online: boolean;
    working_radius_km: number;
    total_deliveries: number;
    completed_deliveries: number;
    cancelled_deliveries: number;
    average_rating: number;
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
    | 'cancelled' 
    | 'failed';

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
    
    // Pricing
    estimated_cost: number;
    
    created_at: string;
    updated_at: string;
}
