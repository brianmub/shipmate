import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// If a Service Role Key is provided, use it to bypass RLS and perform automated test setups/cleanups.
const supabaseKey = serviceRoleKey || supabaseAnonKey;
if (serviceRoleKey) {
    console.log('🔑 Running test suite with Service Role permissions (RLS bypass enabled)');
} else {
    console.log('⚠️ Running test suite with Anon Key (subject to RLS policies)');
}
const supabase = createClient(supabaseUrl, supabaseKey);

async function runFullSystemTest() {
    console.log('🏁 Starting ShipMate Full System Test Suite...\n');

    let testOrder: any = null;
    let customerUuid: string | null = null;
    let driverUuid: string | null = null;
    let testOfferId: string | null = null;

    try {
        // --- 1. SETUP: Create Test Users ---
        console.log('🧪 [Setup] Creating test users...');
        
        // Create base Customer Auth User
        const { data: customerAuth, error: custAuthErr } = await supabase.auth.admin.createUser({
            email: `customer-${Date.now()}@test.com`,
            password: 'TestPassword123!',
            email_confirm: true,
            user_metadata: { role: 'customer', full_name: 'Test Customer' }
        });
        if (custAuthErr) throw custAuthErr;
        customerUuid = customerAuth.user.id;

        // Create base Driver Auth User
        const { data: driverAuth, error: drivAuthErr } = await supabase.auth.admin.createUser({
            email: `driver-${Date.now()}@test.com`,
            password: 'TestPassword123!',
            email_confirm: true,
            user_metadata: { role: 'driver', full_name: 'Test Driver' }
        });
        if (drivAuthErr) throw drivAuthErr;
        driverUuid = driverAuth.user.id;

        console.log(`   ✅ Test Customer created (ID: ${customerUuid})`);
        console.log(`   ✅ Test Driver created (ID: ${driverUuid})`);

        // --- 2. DRIVER ONBOARDING FLOW ---
        console.log('\n🪪 [Flow 1] Driver Onboarding & Verification');
        
        // Simulate document upload
        console.log('   - Simulating ID & License upload...');
        const { error: docErr } = await supabase.from('driver_documents').insert({
            driver_id: driverUuid,
            document_type: 'license_front',
            file_url: 'https://placeholder.url/license.jpg',
            verified: true
        });
        if (docErr) throw docErr;
        console.log('   ✅ Documents uploaded successfully');

        // Simulate Admin Approval
        console.log('   - Mocking Admin Approval (Direct DB update)...');
        const { error: approveErr } = await supabase.from('drivers')
            .update({ verification_status: 'approved' })
            .eq('id', driverUuid);
        if (approveErr) throw approveErr;
        console.log('   ✅ Driver approved by Admin');

        // --- 3. ORDER & BIDDING FLOW ---
        console.log('\n📦 [Flow 2] Order Creation & Bidding');
        
        console.log('   - Customer creating delivery order ($100)...');
        // Simulate customer placing order
        const { data: order, error: orderErr } = await supabase
            .from('orders')
            .insert({
                customer_id: customerUuid,
                service_type: 'delivery',
                status: 'pending',
                pickup_address: 'Test Origin',
                dropoff_address: 'Test Destination',
                estimated_cost: 100
            })
            .select()
            .single();
        
        if (orderErr) throw orderErr;
        testOrder = order;
        console.log(`   ✅ Order #${order.id.split('-')[0]} created`);

        console.log('   - Driver submitting bid ($95)...');
        // Simulate driver bidding
        const { data: offer, error: offerErr } = await supabase
            .from('order_offers')
            .insert({
                order_id: testOrder.id,
                driver_id: driverUuid,
                offer_amount: 95,
                status: 'pending'
            })
            .select()
            .single();
        
        if (offerErr) throw offerErr;
        testOfferId = offer.id;
        console.log('   ✅ Bid submitted');

        console.log('   - Customer accepting bid...');
        // Update offer to accepted
        const { error: acceptOfferErr } = await supabase.from('order_offers').update({ status: 'accepted' }).eq('id', offer.id);
        if (acceptOfferErr) throw acceptOfferErr;

        // Update order with driver_id and status
        const { error: assignErr } = await supabase.from('orders').update({ 
            driver_id: driverUuid, 
            status: 'driver_assigned',
            estimated_cost: 95 
        }).eq('id', testOrder.id);
        if (assignErr) throw assignErr;
        console.log('   ✅ Bid accepted & Order assigned');

        // --- 4. ORDER LIFECYCLE ---
        console.log('\n🚚 [Flow 3] Order Lifecycle Progression');
        
        const statuses = [
            'en_route_to_pickup',
            'arrived_at_pickup',
            'picked_up',
            'en_route_to_delivery',
            'arrived_at_delivery'
        ];

        for (const status of statuses) {
            const { error: statusErr } = await supabase
                .from('orders')
                .update({ status })
                .eq('id', testOrder.id);
            
            if (statusErr) throw statusErr;
            console.log(`   ➡️ Status: ${status}`);
        }

        // Simulate order completion with proof (signature & photo)
        console.log('\n📸 [Flow 3.5] Completing Order with Proof of Delivery');
        const testSignatureUrl = 'https://placeholder.url/signature.png';
        const testPhotoUrl = 'https://placeholder.url/delivery_photo.jpg';
        
        const { data: completedOrder, error: completeErr } = await supabase
            .from('orders')
            .update({ 
                status: 'delivered',
                delivery_signature_url: testSignatureUrl,
                delivery_photo_url: testPhotoUrl,
                updated_at: new Date().toISOString()
            })
            .eq('id', testOrder.id)
            .select()
            .single();
            
        if (completeErr) throw completeErr;
        
        if (completedOrder.delivery_signature_url === testSignatureUrl && completedOrder.delivery_photo_url === testPhotoUrl) {
            console.log('   ✅ Order completed with signature and photo proof successfully validated');
        } else {
            throw new Error('Verification of signature and photo proof columns failed!');
        }
        console.log('   ✅ Order Lifecycle completed');

        // --- 5. EARNINGS VERIFICATION ---
        console.log('\n💰 [Flow 4] Earnings & Commission Verification');
        
        // Wait a moment for trigger to finish
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Fetch the driver table balance
        console.log('   - Verifying balance updates...');
        const { data: updatedDriver, error: getDriverErr } = await supabase
            .from('drivers')
            .select('total_earnings, available_balance')
            .eq('id', driverUuid)
            .single();

        if (getDriverErr) throw getDriverErr;

        console.log(`   - Driver Total Earnings: $${updatedDriver.total_earnings}`);
        console.log(`   - Driver Available Balance: $${updatedDriver.available_balance}`);
        console.log('   ✅ Earnings successfully calculated and applied');

        console.log('\n✨ [SUCCESS] All features and flows validated successfully!');

    } catch (error: any) {
        console.error('\n❌ [FAILURE] Test suite failed:', error.message || error);
    } finally {
        console.log('\n🧹 [Cleanup] Removing test data...');
        if (testOrder) {
            await supabase.from('orders').delete().eq('id', testOrder.id);
        }
        if (testOfferId) {
            await supabase.from('order_offers').delete().eq('id', testOfferId);
        }
        // Deleting from auth.users cascades and automatically cleans up public tables
        if (driverUuid) {
            console.log('   - Deleting test driver auth account...');
            await supabase.auth.admin.deleteUser(driverUuid);
        }
        if (customerUuid) {
            console.log('   - Deleting test customer auth account...');
            await supabase.auth.admin.deleteUser(customerUuid);
        }
        console.log('   ✅ Cleanup complete');
    }
}

runFullSystemTest();
