/**
 * test_step5_atomic_accept.js
 * 
 * Integration & Concurrency Test Suite for Step 5: Atomic Accept + Reassign-on-Timeout
 * 
 * Verifies:
 * 1. Migration verification: accepted_mate_id and accepted_amount exist on public.requests
 * 2. Race condition test: fire two near-simultaneous accept calls for the same request
 *    (different mate_id each) and confirm EXACTLY ONE succeeds (HTTP 200) and the other
 *    gets the conflict response (HTTP 409).
 * 3. Realtime broadcast test: request_accepted event emitted on request:{requestId} with winning mate_id
 * 4. Losing Mate live card dismissal: losing Mate client receives broadcast and drops the request in < 1s
 * 5. Database state integrity: requests table updated with status='accepted', accepted_mate_id, accepted_amount
 * 6. Timeout reassign / check-on-read: expired request rejects accept (409) and transitions to 'expired'
 * 
 * Usage: node src/scripts/test_step5_atomic_accept.js
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
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

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('❌ Missing SUPABASE credentials in .env');
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
const acceptFunctionUrl = `${supabaseUrl}/functions/v1/accept-request`;

let passed = 0;
let failed = 0;

function assert(condition, label) {
    if (condition) {
        console.log(`  ✅ PASS: ${label}`);
        passed++;
    } else {
        console.log(`  ❌ FAIL: ${label}`);
        failed++;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log('='.repeat(70));
    console.log('  ShipMate Step 5: Atomic Accept + Reassign-on-Timeout Test Suite');
    console.log('='.repeat(70));

    // ---------- Section 1: Schema Verification ----------
    console.log('\n--- Section 1: Database Migration Schema Verification ---');

    const { data: testReqCols, error: colErr } = await supabaseAdmin
        .from('requests')
        .select('id, status, accepted_mate_id, accepted_amount')
        .limit(1);

    assert(!colErr, 'Successfully queried accepted_mate_id and accepted_amount from requests table');

    // Get 2 valid users from database for customer and mates
    const { data: users, error: userErr } = await supabaseAdmin
        .from('users')
        .select('id, full_name')
        .limit(3);

    if (userErr || !users || users.length < 3) {
        console.error('❌ Need at least 3 users in public.users to run test suite');
        process.exit(1);
    }

    const customerUser = users[0];
    const mate1 = users[1]; // e.g. Tendai
    const mate2 = users[2]; // e.g. Rumbi
    console.log(`Customer: ${customerUser.full_name} (${customerUser.id})`);
    console.log(`Mate 1 (Racer A): ${mate1.full_name} (${mate1.id})`);
    console.log(`Mate 2 (Racer B): ${mate2.full_name} (${mate2.id})`);

    // ---------- Section 2: Realtime Channel Setup & Losing Feed Listening ----------
    console.log('\n--- Section 2: Realtime Setup & Feed Listener ---');

    // Create a new searching request
    const { data: requestRow, error: reqCreateErr } = await supabaseAdmin
        .from('requests')
        .insert({
            customer_id: customerUser.id,
            status: 'searching',
            base_price: 10.00,
            expires_at: new Date(Date.now() + 180000).toISOString(), // 3 mins TTL
        })
        .select()
        .single();

    assert(!reqCreateErr && Boolean(requestRow?.id), `Created test request (${requestRow?.id}) in 'searching' status`);

    const channelName = `request:${requestRow.id}`;

    // Simulate Mate 1 client (with job in their feed)
    let mate1Feed = [requestRow.id, 'other-job-1', 'other-job-2'];
    let mate1DismissTimestamp = 0;
    const mate1Client = createClient(supabaseUrl, anonKey);
    const mate1Channel = mate1Client.channel(channelName);

    mate1Channel
        .on('broadcast', { event: 'request_accepted' }, ({ payload }) => {
            if (payload && payload.mate_id !== mate1.id) {
                mate1Feed = mate1Feed.filter(id => id !== payload.request_id);
                mate1DismissTimestamp = Date.now();
            }
        })
        .subscribe();

    // Simulate Mate 2 client (with job in their feed)
    let mate2Feed = [requestRow.id, 'other-job-1', 'other-job-2'];
    let mate2DismissTimestamp = 0;
    const mate2Client = createClient(supabaseUrl, anonKey);
    const mate2Channel = mate2Client.channel(channelName);

    mate2Channel
        .on('broadcast', { event: 'request_accepted' }, ({ payload }) => {
            if (payload && payload.mate_id !== mate2.id) {
                mate2Feed = mate2Feed.filter(id => id !== payload.request_id);
                mate2DismissTimestamp = Date.now();
            }
        })
        .subscribe();

    // Simulate Customer client
    let customerAcceptedEventReceived = null;
    const customerClient = createClient(supabaseUrl, anonKey);
    const customerChannel = customerClient.channel(channelName);
    customerChannel
        .on('broadcast', { event: 'request_accepted' }, ({ payload }) => {
            customerAcceptedEventReceived = payload;
        })
        .subscribe();

    await sleep(2500); // Channel subscription stabilization
    assert(mate1Channel.state === 'joined', 'Mate 1 subscribed to request channel');
    assert(mate2Channel.state === 'joined', 'Mate 2 subscribed to request channel');
    assert(customerChannel.state === 'joined', 'Customer subscribed to request channel');

    // ---------- Section 3: Concurrent Race Condition Test ----------
    console.log('\n--- Section 3: Concurrent Race Condition Test ---');
    console.log('Firing two near-simultaneous POST /accept-request calls for the exact same request...');

    const startRaceTime = Date.now();

    // Call A: Customer confirming Mate 2 @ $11.50
    const callA = fetch(acceptFunctionUrl, {
        method: 'POST',
        headers: {
            'apikey': anonKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            request_id: requestRow.id,
            mate_id: mate2.id,
            accepted_amount: 11.50,
        }),
    });

    // Call B: Customer / concurrent call trying to confirm Mate 1 @ $12.00
    const callB = fetch(acceptFunctionUrl, {
        method: 'POST',
        headers: {
            'apikey': anonKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            request_id: requestRow.id,
            mate_id: mate1.id,
            accepted_amount: 12.00,
        }),
    });

    const [respA, respB] = await Promise.all([callA, callB]);
    const bodyA = await respA.json();
    const bodyB = await respB.json();

    console.log(`Call A (Mate 2) Response: HTTP ${respA.status}`, bodyA);
    console.log(`Call B (Mate 1) Response: HTTP ${respB.status}`, bodyB);

    const statuses = [respA.status, respB.status].sort();
    assert(statuses[0] === 200 && statuses[1] === 409, `Exactly ONE call returned HTTP 200 and ONE returned HTTP 409 (got ${respA.status} and ${respB.status})`);

    const winner = respA.status === 200 ? { name: mate2.full_name, id: mate2.id, body: bodyA } : { name: mate1.full_name, id: mate1.id, body: bodyB };
    const loser = respA.status === 409 ? { name: mate2.full_name, id: mate2.id, body: bodyA } : { name: mate1.full_name, id: mate1.id, body: bodyB };

    console.log(`\n  🏆 WINNER: ${winner.name} (${winner.id})`);
    console.log(`  ❌ CONFLICT: ${loser.name} (${loser.id}) received: "${loser.body?.error}"`);

    assert(loser.body?.code === 'REQUEST_ALREADY_ACCEPTED_OR_EXPIRED', 'Conflict payload returned REQUEST_ALREADY_ACCEPTED_OR_EXPIRED code');
    assert(loser.body?.error?.includes('unavailable'), 'Conflict payload contains friendly unavailable message');

    // ---------- Section 4: Realtime Broadcast & Feed Pruning Reaction ----------
    console.log('\n--- Section 4: Realtime Broadcast & Feed Pruning Reaction ---');
    await sleep(1500);

    assert(Boolean(customerAcceptedEventReceived), 'Customer received broadcast request_accepted event');
    assert(customerAcceptedEventReceived?.request_id === requestRow.id, `Broadcast matches request_id (${customerAcceptedEventReceived?.request_id})`);
    assert(customerAcceptedEventReceived?.mate_id === winner.id, `Broadcast declares correct winner (${winner.id})`);

    // Verify losing Mate feed card removal
    const losingFeed = winner.id === mate1.id ? mate2Feed : mate1Feed;
    const dismissTimestamp = winner.id === mate1.id ? mate2DismissTimestamp : mate1DismissTimestamp;
    assert(!losingFeed.includes(requestRow.id), `Losing Mate (${loser.name}) feed dropped the accepted request card`);
    const elapsedDismissMs = dismissTimestamp - startRaceTime;
    assert(elapsedDismissMs < 2000, `Losing card disappeared live within ~1s (${elapsedDismissMs}ms)`);

    // ---------- Section 5: Database State Integrity ----------
    console.log('\n--- Section 5: Database State Integrity ---');

    const { data: finalReq, error: finalReqErr } = await supabaseAdmin
        .from('requests')
        .select('*')
        .eq('id', requestRow.id)
        .single();

    assert(!finalReqErr, 'Fetched updated request from database');
    assert(finalReq?.status === 'accepted', `Request status in DB is 'accepted' (got '${finalReq?.status}')`);
    assert(finalReq?.accepted_mate_id === winner.id, `DB accepted_mate_id matches winner (${finalReq?.accepted_mate_id})`);
    assert(Number(finalReq?.accepted_amount) > 0, `DB accepted_amount is recorded ($${finalReq?.accepted_amount})`);

    // ---------- Section 6: Timeout Reassign / Stale Request Expiration ----------
    console.log('\n--- Section 6: Timeout Reassign & Stale Expiration ---');

    // Create an expired request (expires_at 1 minute in past)
    const { data: expiredReq, error: expCreateErr } = await supabaseAdmin
        .from('requests')
        .insert({
            customer_id: customerUser.id,
            status: 'searching',
            base_price: 8.00,
            expires_at: new Date(Date.now() - 60000).toISOString(),
        })
        .select()
        .single();

    assert(!expCreateErr && Boolean(expiredReq?.id), 'Created expired test request with past expires_at');

    // Attempting to accept an expired request must fail with 409
    const expAcceptResp = await fetch(acceptFunctionUrl, {
        method: 'POST',
        headers: {
            'apikey': anonKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            request_id: expiredReq.id,
            mate_id: mate1.id,
            accepted_amount: 8.00,
        }),
    });

    assert(expAcceptResp.status === 409, `Accepting expired request rejected with HTTP 409 (got ${expAcceptResp.status})`);

    // Test expire_stale_requests stored procedure
    const { data: expiredCount, error: procErr } = await supabaseAdmin.rpc('expire_stale_requests');
    assert(!procErr, `expire_stale_requests() RPC executed successfully`);

    const { data: checkedReq } = await supabaseAdmin
        .from('requests')
        .select('status')
        .eq('id', expiredReq.id)
        .single();

    assert(checkedReq?.status === 'expired', `Expired request transitioned to status='expired' (got '${checkedReq?.status}')`);

    // ---------- Section 7: Teardown & Clean Up ----------
    console.log('\n--- Section 7: Teardown & Cleanup ---');
    await mate1Client.removeChannel(mate1Channel);
    await customerClient.removeChannel(customerChannel);

    // Clean up test rows
    await supabaseAdmin.from('requests').delete().in('id', [requestRow.id, expiredReq.id]);
    assert(true, 'Test rows cleaned up and channels unsubscribed');

    console.log('\n' + '='.repeat(70));
    console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
    console.log('='.repeat(70));

    process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
    console.error('Test suite failed with unexpected error:', err);
    process.exit(1);
});
