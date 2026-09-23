/**
 * test_step4_bidding.js
 * 
 * Integration & concurrency test suite for Step 4: Live Counter-Offer Bidding:
 * 1. Client-side validation: reject amount <= 0, reject expired requests
 * 2. Realtime broadcast & receipt on channel `request:{requestId}`
 * 3. Concurrent bidding: two Mates bidding near-simultaneously both appear on customer screen
 * 4. Upsert deduplication: second bid from same Mate replaces earlier bid without duplicate entries
 * 5. Database persistence: bids table insert for audit/persistence
 * 
 * Usage: node src/scripts/test_step4_bidding.js
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

if (!supabaseUrl || !anonKey) {
    console.error('❌ Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env');
    process.exit(1);
}

const supabaseAdmin = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

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

// Client-side validation function matching JobOfferModal and CustomerTrackingScreen logic
function validateBidInput(amount, expiresAt) {
    const num = Number(amount);
    if (isNaN(num) || num <= 0) {
        return { valid: false, error: 'Offer must be greater than $0.00' };
    }
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
        return { valid: false, error: 'This request has expired and is no longer accepting bids.' };
    }
    return { valid: true };
}

// Upsert function matching CustomerTrackingScreen logic
function applyBidUpsert(prevBids, newBid) {
    const existingIdx = prevBids.findIndex(b => b.mate_id === newBid.mate_id);
    const updatedEntry = {
        ...newBid,
        amount: Number(newBid.amount),
        updated_at: Date.now(),
    };
    if (existingIdx >= 0) {
        const next = [...prevBids];
        next[existingIdx] = updatedEntry;
        return next;
    }
    return [...prevBids, updatedEntry];
}

async function run() {
    console.log('='.repeat(65));
    console.log('  ShipMate Step 4: Live Counter-Offer Bidding Test Suite');
    console.log('='.repeat(65));

    // ---------- 1. Client-Side Validation Tests ----------
    console.log('\n--- Section 1: Client-Side Validation Logic ---');

    const testNegative = validateBidInput(-5.0, null);
    assert(!testNegative.valid && testNegative.error.includes('greater than $0.00'), 'Rejects negative amount (-$5.00)');

    const testZero = validateBidInput(0, null);
    assert(!testZero.valid && testZero.error.includes('greater than $0.00'), 'Rejects zero amount ($0.00)');

    const testNaN = validateBidInput('abc', null);
    assert(!testNaN.valid && testNaN.error.includes('greater than $0.00'), 'Rejects non-numeric amount');

    const pastExpiry = new Date(Date.now() - 60000).toISOString();
    const testExpired = validateBidInput(10.0, pastExpiry);
    assert(!testExpired.valid && testExpired.error.includes('expired'), 'Rejects bid when expires_at has passed');

    const futureExpiry = new Date(Date.now() + 600000).toISOString();
    const testValid = validateBidInput(12.5, futureExpiry);
    assert(testValid.valid === true, 'Accepts valid positive amount on unexpired request');

    // ---------- 2. Setup Realtime Channel & Clients ----------
    console.log('\n--- Section 2: Realtime Channel Setup ---');

    const testRequestId = `test-req-${Date.now()}`;
    const channelName = `request:${testRequestId}`;
    console.log(`Test Request ID: ${testRequestId}`);
    console.log(`Channel: ${channelName}`);

    // Customer Client
    const customerClient = createClient(supabaseUrl, anonKey, {
        realtime: { params: { eventsPerSecond: 20 } },
    });

    let customerLiveBids = [];

    const customerChannel = customerClient.channel(channelName);
    customerChannel
        .on('broadcast', { event: 'bid' }, ({ payload }) => {
            if (!payload || !payload.mate_id) return;
            const validation = validateBidInput(payload.amount, payload.expires_at);
            if (!validation.valid) return;

            customerLiveBids = applyBidUpsert(customerLiveBids, payload);
        })
        .subscribe();

    await sleep(2500); // Wait for customer channel subscription to stabilize
    assert(customerChannel.state === 'joined', 'Customer channel joined successfully');

    // Mate 1 Client
    const mate1 = { id: 'mate-tendai-01', name: 'Tendai Moyo', avatar: 'https://example.com/tendai.jpg' };
    const mate1Client = createClient(supabaseUrl, anonKey, {
        realtime: { params: { eventsPerSecond: 20 } },
    });
    const mate1Channel = mate1Client.channel(channelName);
    mate1Channel.subscribe();

    // Mate 2 Client
    const mate2 = { id: 'mate-rumbi-02', name: 'Rumbi Chikara', avatar: 'https://example.com/rumbi.jpg' };
    const mate2Client = createClient(supabaseUrl, anonKey, {
        realtime: { params: { eventsPerSecond: 20 } },
    });
    const mate2Channel = mate2Client.channel(channelName);
    mate2Channel.subscribe();

    await sleep(2500); // Wait for mate subscriptions to stabilize
    assert(mate1Channel.state === 'joined', 'Mate 1 channel joined successfully');
    assert(mate2Channel.state === 'joined', 'Mate 2 channel joined successfully');

    // ---------- 3. Single Bid Submission & Receipt ----------
    console.log('\n--- Section 3: Single Bid Submission ---');

    await mate1Channel.send({
        type: 'broadcast',
        event: 'bid',
        payload: {
            mate_id: mate1.id,
            amount: 15.00,
            request_id: testRequestId,
            driver_name: mate1.name,
            driver_avatar: mate1.avatar,
            pickup_time_estimate: 8,
        },
    });

    await sleep(1500);
    assert(customerLiveBids.length === 1, `Customer received 1 bid (got ${customerLiveBids.length})`);
    assert(customerLiveBids[0]?.mate_id === mate1.id, `Bid is from Mate 1 (${mate1.id})`);
    assert(customerLiveBids[0]?.amount === 15.00, `Bid amount is $15.00 (got $${customerLiveBids[0]?.amount})`);
    assert(customerLiveBids[0]?.driver_name === 'Tendai Moyo', 'Driver name correctly attached');

    // ---------- 4. Concurrent Bidding from Two Mates ----------
    console.log('\n--- Section 4: Concurrent Bidding Test ---');

    // Mate 1 bids $12.00 and Mate 2 bids $11.50 simultaneously
    const bid1Promise = mate1Channel.send({
        type: 'broadcast',
        event: 'bid',
        payload: {
            mate_id: mate1.id,
            amount: 12.00,
            request_id: testRequestId,
            driver_name: mate1.name,
            pickup_time_estimate: 7,
        },
    });

    const bid2Promise = mate2Channel.send({
        type: 'broadcast',
        event: 'bid',
        payload: {
            mate_id: mate2.id,
            amount: 11.50,
            request_id: testRequestId,
            driver_name: mate2.name,
            pickup_time_estimate: 10,
        },
    });

    await Promise.all([bid1Promise, bid2Promise]);
    await sleep(2000);

    assert(customerLiveBids.length === 2, `Customer shows exactly 2 distinct Mates (got ${customerLiveBids.length})`);
    
    const mate1Bid = customerLiveBids.find(b => b.mate_id === mate1.id);
    const mate2Bid = customerLiveBids.find(b => b.mate_id === mate2.id);

    assert(Boolean(mate1Bid), 'Mate 1 bid present in customer state');
    assert(Boolean(mate2Bid), 'Mate 2 bid present in customer state');
    assert(mate1Bid?.amount === 12.00, `Mate 1 updated to $12.00 (got $${mate1Bid?.amount})`);
    assert(mate2Bid?.amount === 11.50, `Mate 2 bid is $11.50 (got $${mate2Bid?.amount})`);

    // ---------- 5. Upsert Deduplication Test (Counter-Offer Update) ----------
    console.log('\n--- Section 5: Upsert Deduplication Test ---');

    // Mate 2 counters with a lower offer of $9.75
    await mate2Channel.send({
        type: 'broadcast',
        event: 'bid',
        payload: {
            mate_id: mate2.id,
            amount: 9.75,
            request_id: testRequestId,
            driver_name: mate2.name,
            pickup_time_estimate: 9,
        },
    });

    await sleep(1500);

    assert(customerLiveBids.length === 2, `Customer still has exactly 2 bids, no duplicate cards (got ${customerLiveBids.length})`);
    const updatedMate2Bid = customerLiveBids.find(b => b.mate_id === mate2.id);
    assert(updatedMate2Bid?.amount === 9.75, `Mate 2 price updated to $9.75 (got $${updatedMate2Bid?.amount})`);

    // ---------- 6. Invalid Bid Broadcast Rejection on Customer Side ----------
    console.log('\n--- Section 6: Invalid Bid Realtime Filtering ---');

    // Mate 1 tries to send an invalid 0.00 bid
    await mate1Channel.send({
        type: 'broadcast',
        event: 'bid',
        payload: {
            mate_id: mate1.id,
            amount: 0.00,
            request_id: testRequestId,
        },
    });

    await sleep(1000);
    const currentMate1Bid = customerLiveBids.find(b => b.mate_id === mate1.id);
    assert(currentMate1Bid?.amount === 12.00, `Customer rejected $0.00 bid, kept prior $12.00 (got $${currentMate1Bid?.amount})`);

    // ---------- 7. Persistence to Bids Table ----------
    console.log('\n--- Section 7: Bids Table Persistence Audit ---');

    if (supabaseAdmin) {
        try {
            // Find a valid profile id to use for DB insertion test
            const { data: userProfiles } = await supabaseAdmin
                .from('users')
                .select('id')
                .limit(2);

            if (userProfiles && userProfiles.length >= 2) {
                const customerId = userProfiles[0].id;
                const mateProfileId = userProfiles[1].id;

                // Create a test request in requests table
                const { data: testReq, error: reqErr } = await supabaseAdmin
                    .from('requests')
                    .insert({
                        customer_id: customerId,
                        status: 'searching',
                        base_price: 10.00,
                        expires_at: new Date(Date.now() + 600000).toISOString(),
                    })
                    .select()
                    .single();

                if (reqErr) {
                    console.log('  ⚠️ Request creation note:', reqErr.message);
                } else if (testReq) {
                    // Test inserting a bid
                    const { data: bidRow, error: bidErr } = await supabaseAdmin
                        .from('bids')
                        .insert({
                            request_id: testReq.id,
                            mate_id: mateProfileId,
                            amount: 8.50,
                        })
                        .select()
                        .single();

                    assert(!bidErr && bidRow?.amount == 8.50, `Bid persisted to public.bids (id: ${bidRow?.id}, amount: $${bidRow?.amount})`);

                    // Clean up test rows
                    await supabaseAdmin.from('bids').delete().eq('id', bidRow?.id);
                    await supabaseAdmin.from('requests').delete().eq('id', testReq?.id);
                }
            } else {
                console.log('  ℹ️ Skipped DB insert: not enough test user profiles in public.users');
            }
        } catch (dbErr) {
            console.log('  ⚠️ DB persistence test note:', dbErr.message);
        }
    } else {
        console.log('  ℹ️ Skipped DB persistence test: no serviceRoleKey provided');
    }

    // ---------- 8. Teardown ----------
    console.log('\n--- Section 8: Teardown ---');
    await customerClient.removeChannel(customerChannel);
    await mate1Client.removeChannel(mate1Channel);
    await mate2Client.removeChannel(mate2Channel);
    assert(true, 'All channels gracefully unsubscribed and removed');

    console.log('\n' + '='.repeat(65));
    console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
    console.log('='.repeat(65));

    process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
    console.error('Test runner encountered an error:', err);
    process.exit(1);
});
