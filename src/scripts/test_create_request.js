/**
 * Test script for Step 2: create-request Supabase Edge Function
 * Validates:
 * 1. Input validation error handling (negative base_price, missing locations)
 * 2. Successful request insertion into public.requests with calculated expires_at TTL
 * 3. Realtime broadcast emission and receipt on channel 'jobs:{zone_id}'
 * 4. Zero-matches scenario handling
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 1. Load environment variables
const envPath = path.resolve(__dirname, '../../.env');
if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found at:', envPath);
    process.exit(1);
}

const env = Object.fromEntries(
    fs.readFileSync(envPath, 'utf-8')
        .split('\n')
        .filter(line => line.includes('='))
        .map(line => {
            const idx = line.indexOf('=');
            return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
        })
);

const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, anonKey);
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const functionUrl = `${supabaseUrl}/functions/v1/create-request`;

async function runTests() {
    console.log('====================================================');
    console.log('  Testing create-request Supabase Edge Function');
    console.log('====================================================\n');

    let passedTests = 0;
    let totalTests = 0;

    function assert(condition, message) {
        totalTests++;
        if (condition) {
            console.log(`  ✅ PASS: ${message}`);
            passedTests++;
        } else {
            console.error(`  ❌ FAIL: ${message}`);
        }
    }

    // ---------------------------------------------------------------
    // Test 1: Validation - base_price <= 0
    // ---------------------------------------------------------------
    console.log('--- Test 1: Reject base_price <= 0 ---');
    try {
        const resp = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                pickup_location: { latitude: -17.8252, longitude: 31.0530 },
                dropoff_location: { latitude: -17.7850, longitude: 31.0350 },
                base_price: -5.00
            })
        });

        const data = await resp.json();
        assert(resp.status === 400, `Expected HTTP 400 for negative price, got ${resp.status}`);
        assert(data.error === 'INVALID_BASE_PRICE', `Expected error code INVALID_BASE_PRICE, got ${data.error}`);
    } catch (err) {
        assert(false, `Test 1 threw error: ${err.message}`);
    }

    // ---------------------------------------------------------------
    // Test 2: Validation - Missing pickup_location
    // ---------------------------------------------------------------
    console.log('\n--- Test 2: Reject missing pickup_location ---');
    try {
        const resp = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                dropoff_location: { latitude: -17.7850, longitude: 31.0350 },
                base_price: 10.00
            })
        });

        const data = await resp.json();
        assert(resp.status === 400, `Expected HTTP 400 for missing pickup, got ${resp.status}`);
        assert(data.error === 'INVALID_PICKUP_LOCATION', `Expected error code INVALID_PICKUP_LOCATION, got ${data.error}`);
    } catch (err) {
        assert(false, `Test 2 threw error: ${err.message}`);
    }

    // ---------------------------------------------------------------
    // Test 3: Validation - Missing dropoff_location
    // ---------------------------------------------------------------
    console.log('\n--- Test 3: Reject missing dropoff_location ---');
    try {
        const resp = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                pickup_location: { latitude: -17.8252, longitude: 31.0530 },
                base_price: 10.00
            })
        });

        const data = await resp.json();
        assert(resp.status === 400, `Expected HTTP 400 for missing dropoff, got ${resp.status}`);
        assert(data.error === 'INVALID_DROPOFF_LOCATION', `Expected error code INVALID_DROPOFF_LOCATION, got ${data.error}`);
    } catch (err) {
        assert(false, `Test 3 threw error: ${err.message}`);
    }

    // ---------------------------------------------------------------
    // Test 4: End-to-End Request Creation & Realtime Broadcast
    // ---------------------------------------------------------------
    console.log('\n--- Test 4: Request Creation + Realtime Broadcast on jobs:harare ---');
    try {
        const targetZone = 'harare';
        const channelName = `jobs:${targetZone}`;

        // Prepare Realtime listener
        let broadcastReceived = false;
        let receivedPayload = null;

        const realtimeChannel = supabase.channel(channelName);

        const broadcastPromise = new Promise((resolve) => {
            realtimeChannel.on('broadcast', { event: 'new_request' }, (payload) => {
                console.log(`  📡 Received 'new_request' broadcast event on ${channelName}:`, payload);
                broadcastReceived = true;
                receivedPayload = payload;
                resolve(payload);
            });
        });

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => resolve(), 3000);
            realtimeChannel.subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    clearTimeout(timeout);
                    console.log(`  Connected and subscribed to Realtime channel: ${channelName}`);
                    resolve();
                } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
                    clearTimeout(timeout);
                    reject(new Error(`Subscription status: ${status}`));
                }
            });
        });

        // Ensure at least one driver is online for Harare zone test
        const { data: testDriver } = await supabaseAdmin
            .from('drivers')
            .select('id, is_online')
            .limit(1)
            .single();

        if (testDriver && !testDriver.is_online) {
            await supabaseAdmin.from('drivers').update({ is_online: true }).eq('id', testDriver.id);
        }

        // Fetch a valid customer ID
        const { data: customer } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('role', 'customer')
            .limit(1)
            .single();

        const customerId = customer ? customer.id : null;

        // Invoke create-request Edge Function
        const requestPayload = {
            pickup_location: { latitude: -17.8252, longitude: 31.0530 },
            dropoff_location: { latitude: -17.7850, longitude: 31.0350 },
            pickup_address: 'Harare CBD, Jason Moyo Ave',
            dropoff_address: 'Avondale Shopping Centre',
            base_price: 15.50,
            zone_id: targetZone,
            customer_id: customerId
        };

        const startTime = Date.now();
        const createResp = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestPayload)
        });

        const result = await createResp.json();
        console.log('  Edge Function response:', result);

        assert(createResp.status === 200, `Expected HTTP 200 from create-request, got ${createResp.status}`);
        assert(result.success === true, 'Response success flag is true');
        assert(typeof result.request_id === 'string', `Valid request_id returned: ${result.request_id}`);
        assert(typeof result.expires_at === 'string', `Valid expires_at returned: ${result.expires_at}`);

        // Validate expires_at is roughly now + 90 seconds (between 80 and 100 seconds in future)
        const expiryDate = new Date(result.expires_at);
        const ttlDiffSec = (expiryDate.getTime() - startTime) / 1000;
        assert(ttlDiffSec >= 80 && ttlDiffSec <= 100, `TTL is ~90s (actual: ${ttlDiffSec.toFixed(1)}s)`);

        // Wait up to 5s for the Realtime broadcast
        await Promise.race([
            broadcastPromise,
            new Promise((res) => setTimeout(res, 5000))
        ]);

        assert(broadcastReceived === true, 'Realtime broadcast event new_request was received on jobs:harare');
        if (receivedPayload && receivedPayload.payload) {
            assert(receivedPayload.payload.request_id === result.request_id, 'Broadcast payload contains correct request_id');
            assert(receivedPayload.payload.base_price === 15.50, 'Broadcast payload contains correct base_price');
        }

        // Verify row was inserted into public.requests table
        const { data: dbRequest, error: fetchErr } = await supabaseAdmin
            .from('requests')
            .select('*')
            .eq('id', result.request_id)
            .single();

        assert(!fetchErr && dbRequest !== null, 'Request record successfully verified in public.requests table');
        assert(dbRequest.status === 'searching', `Request status is 'searching' (got: ${dbRequest?.status})`);
        assert(Number(dbRequest.base_price) === 15.50, `Request base_price is 15.50 (got: ${dbRequest?.base_price})`);

        // Clean up Realtime channel
        await supabase.removeChannel(realtimeChannel);

    } catch (err) {
        assert(false, `Test 4 threw error: ${err.message}`);
    }

    // ---------------------------------------------------------------
    // Test 5: Zero-Matches Handling (App doesn't hang)
    // ---------------------------------------------------------------
    console.log('\n--- Test 5: Zero Mates found handling ---');
    try {
        // Location in remote ocean with no drivers within 15 km
        const zeroMatchPayload = {
            pickup_location: { latitude: 0.0, longitude: 0.0 },
            dropoff_location: { latitude: 0.01, longitude: 0.01 },
            base_price: 25.00,
            zone_id: 'remote_ocean'
        };

        const resp = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(zeroMatchPayload)
        });

        const data = await resp.json();
        assert(resp.status === 200, `Expected HTTP 200 for zero-match scenario, got ${resp.status}`);
        assert(data.success === true, 'Request still successfully created');
        assert(typeof data.request_id === 'string', `Request ID created: ${data.request_id}`);
        assert(data.matched_mates_count === 0, `matched_mates_count is 0 (got: ${data.matched_mates_count})`);
        assert(typeof data.message === 'string', `Helpful message returned: "${data.message}"`);
    } catch (err) {
        assert(false, `Test 5 threw error: ${err.message}`);
    }

    console.log('\n====================================================');
    console.log(`  Tests Completed: ${passedTests}/${totalTests} Passed`);
    console.log('====================================================\n');

    process.exit(passedTests === totalTests ? 0 : 1);
}

runTests().catch(err => {
    console.error('Fatal error during test run:', err);
    process.exit(1);
});
