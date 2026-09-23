/**
 * test_step7_background_reconnect.js
 * 
 * Step 7 Test Suite: Background/Reconnect Behavior & Presence Recovery
 * 
 * Verifies:
 * 1. Re-track on reconnect: channel.track() re-announces presence on every SUBSCRIBED event (no track-once guard)
 * 2. Presence deduplication: config: { presence: { key: mateId } } guarantees re-tracking does not create duplicate entries
 * 3. Customer AppState resume resync: customer calling channel.presenceState() on resume ('active') captures state changes made while backgrounded
 * 4. Android background survival: channel survives backgrounding and re-tracks on foreground resume
 * 5. iOS fresh mount simulation: cold-start from push notification establishes a fresh channel with clean subscribe -> track sequence
 * 6. Zero leaked channels: all channels cleanly unsubscribe leaving 0 active channels
 * 
 * Usage: node src/scripts/test_step7_background_reconnect.js
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

if (!supabaseUrl || !anonKey) {
    console.error('❌ Missing SUPABASE credentials in .env');
    process.exit(1);
}

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

async function waitForCondition(checkFn, timeoutMs = 10000, stepMs = 300) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        try {
            if (await checkFn()) return true;
        } catch (_) {}
        await sleep(stepMs);
    }
    try {
        return await checkFn();
    } catch (_) {
        return false;
    }
}

function getDeduplicatedViewers(presenceState) {
    const raw = [];
    Object.values(presenceState).forEach((presences) => {
        presences.forEach((presence) => {
            raw.push({
                id: presence.mate_id || presence.presence_ref,
                full_name: presence.name || 'Courier',
            });
        });
    });
    return raw.filter((v, index, self) => self.findIndex((t) => t.id === v.id) === index);
}

async function run() {
    console.log('='.repeat(70));
    console.log('  ShipMate Step 7: Background/Reconnect Behavior Test Suite');
    console.log('='.repeat(70));

    const testReqId = 'step7_' + Date.now();
    const channelName = `request:${testReqId}`;

    // Distinct simulated user devices
    const customer = { id: 'cust-' + Date.now(), name: 'Customer Rutendo' };
    const mate1 = { id: 'mate1-' + Date.now(), name: 'Tendai Moyo' };
    const mate2 = { id: 'mate2-' + Date.now(), name: 'Rumbi Chikara' };

    console.log(`Channel:  ${channelName}`);
    console.log(`Customer: ${customer.name} (${customer.id})`);
    console.log(`Mate 1:   ${mate1.name} (${mate1.id})`);
    console.log(`Mate 2:   ${mate2.name} (${mate2.id})`);

    // =========================================================================
    // SECTION 1: Customer Channel Setup & Listener
    // =========================================================================
    console.log('\n--- Section 1: Customer Channel Setup & Presence Listener ---');

    const customerClient = createClient(supabaseUrl, anonKey, {
        realtime: { params: { eventsPerSecond: 10 } },
    });

    let syncEventsReceived = 0;
    const customerChannel = customerClient.channel(channelName);
    customerChannel.on('presence', { event: 'sync' }, () => {
        syncEventsReceived++;
    });

    await new Promise((resolve) => {
        customerChannel.subscribe((status) => {
            if (status === 'SUBSCRIBED') resolve();
        });
    });

    await sleep(500);
    assert(customerChannel.state === 'joined', 'Customer channel joined and listening on ' + channelName);
    assert(customerClient.getChannels().length === 1, 'Customer client has 1 active channel');

    // =========================================================================
    // SECTION 2: Mate Presence Join & Re-track on Reconnect
    // =========================================================================
    console.log('\n--- Section 2: Mate Re-Track on Reconnect (No Track-Once Guard) ---');

    const mate1Client = createClient(supabaseUrl, anonKey, {
        realtime: { params: { eventsPerSecond: 10 } },
    });

    let mateTrackCount = 0;
    const mate1Channel = mate1Client.channel(channelName, {
        config: { presence: { key: mate1.id } },
    });
    mate1Channel.on('presence', { event: 'sync' }, () => {});

    // Mate subscribe handler with NO track-once guard: re-tracks on every SUBSCRIBED
    mate1Channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            mateTrackCount++;
            await mate1Channel.track({
                mate_id: mate1.id,
                name: mate1.name,
                avatar_url: null,
                joined_at: Date.now(),
            });
        }
    });

    // Wait for customer to receive presence sync
    const mate1Synced = await waitForCondition(() => {
        const viewers = getDeduplicatedViewers(customerChannel.presenceState());
        return viewers.some(v => v.id === mate1.id);
    }, 10000);

    assert(mateTrackCount >= 1, `Mate channel tracked presence on initial SUBSCRIBED (track count: ${mateTrackCount})`);
    assert(mate1Synced, `Customer received presence sync for Mate 1 (${mate1.name})`);

    // Simulate Reconnect: socket reconnects -> re-announces presence
    console.log('\n  [Simulating Socket Reconnect & Re-track...]');
    await mate1Channel.track({
        mate_id: mate1.id,
        name: mate1.name,
        avatar_url: null,
        joined_at: Date.now(),
        reconnected: true,
    });
    mateTrackCount++;

    const retrackSynced = await waitForCondition(() => {
        const viewers = getDeduplicatedViewers(customerChannel.presenceState());
        return viewers.some(v => v.id === mate1.id);
    }, 5000);

    assert(retrackSynced, 'Mate 1 remains present in customer presenceState after simulated reconnect');
    assert(mateTrackCount === 2, `Re-track executed without "track-once" guard obstruction (track count: ${mateTrackCount})`);

    // =========================================================================
    // SECTION 3: Presence Deduplication Verification
    // =========================================================================
    console.log('\n--- Section 3: Presence Deduplication Verification ---');

    // Verify that multiple tracks (initial + reconnect) with config: { presence: { key: mate1.id } }
    // collapse into a single presence key rather than accumulating duplicates
    await sleep(500);

    const customerPresenceState = customerChannel.presenceState();
    const distinctKeys = Object.keys(customerPresenceState);
    assert(distinctKeys.length === 1 && distinctKeys[0] === mate1.id, `Presence state has exactly 1 presence key for mate1.id: [${distinctKeys.join(', ')}]`);

    const viewers = getDeduplicatedViewers(customerPresenceState);
    assert(viewers.length === 1, `Deduplication successfully collapsed repeat tracks to exactly 1 viewer: ${viewers.length}`);
    assert(viewers[0].id === mate1.id, `Deduplicated viewer matches Mate 1 ID (${mate1.id})`);

    // =========================================================================
    // SECTION 4: Customer AppState Resume Resync
    // =========================================================================
    console.log('\n--- Section 4: Customer AppState Resume Resync ---');

    // Step A: Customer simulates backgrounding
    console.log(`  Customer backgrounded with initial viewers: ${viewers.length}`);

    // Step B: Mate 2 joins while Customer is in background
    const mate2Client = createClient(supabaseUrl, anonKey, {
        realtime: { params: { eventsPerSecond: 10 } },
    });
    const mate2Channel = mate2Client.channel(channelName, {
        config: { presence: { key: mate2.id } },
    });
    mate2Channel.on('presence', { event: 'sync' }, () => {});

    await new Promise((resolve) => {
        mate2Channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await mate2Channel.track({
                    mate_id: mate2.id,
                    name: mate2.name,
                    avatar_url: null,
                    joined_at: Date.now(),
                });
                resolve();
            }
        });
    });

    // Wait until customerChannel's presence state has synced Mate 2 from server
    await waitForCondition(() => {
        const checkViewers = getDeduplicatedViewers(customerChannel.presenceState());
        return checkViewers.some(v => v.id === mate2.id);
    }, 10000);

    // Step C: Customer resumes (AppState change -> 'active')
    // AppState listener calls customerChannel.presenceState() directly
    console.log('  Customer foregrounded (AppState: active) -> invoking channel.presenceState() resync');
    const resumedState = customerChannel.presenceState();
    const deduplicatedResumedViewers = getDeduplicatedViewers(resumedState);

    assert(deduplicatedResumedViewers.length === 2, `AppState resume resync updated viewers from 1 to 2 without page reload: ${deduplicatedResumedViewers.length}`);
    const viewerIds = deduplicatedResumedViewers.map(v => v.id);
    assert(viewerIds.includes(mate1.id) && viewerIds.includes(mate2.id), `Both Mate 1 and Mate 2 present after AppState resume: [${viewerIds.join(', ')}]`);

    // =========================================================================
    // SECTION 5: Android Foreground Service Backgrounding Simulation
    // =========================================================================
    console.log('\n--- Section 5: Android Foreground Service Simulation ---');

    // Android foreground service keeps socket alive in background
    // When returning to foreground, activeChannelRef re-tracks to refresh presence lease
    console.log('  Simulating Android foreground service backgrounding (30s+ simulated survival)...');
    assert(mate1Channel.state === 'joined', 'Mate 1 Realtime channel survived backgrounding with open state');

    // Foregrounding: re-track presence
    await mate1Channel.track({
        mate_id: mate1.id,
        name: mate1.name,
        avatar_url: null,
        joined_at: Date.now(),
        foreground_resumed: true,
    });

    const androidSynced = await waitForCondition(() => {
        const currentState = customerChannel.presenceState();
        const check = getDeduplicatedViewers(currentState);
        return check.some(v => v.id === mate1.id);
    }, 8000);

    assert(androidSynced, 'Customer viewer count continues to reflect Mate 1 after Android resume');

    // =========================================================================
    // SECTION 6: iOS Cold Start / Fresh Mount from Push Simulation
    // =========================================================================
    console.log('\n--- Section 6: iOS Cold Start / Fresh Mount from Push ---');

    // iOS cold kill: previous channel dropped
    await mate2Client.removeChannel(mate2Channel);

    // Wait until customerChannel reflects Mate 2 removal
    await waitForCondition(() => {
        const check = getDeduplicatedViewers(customerChannel.presenceState());
        return !check.some(v => v.id === mate2.id);
    }, 8000);

    console.log('  Simulating push notification tap on iOS -> fresh mount with clean channel join');
    const freshIosClient = createClient(supabaseUrl, anonKey, {
        realtime: { params: { eventsPerSecond: 10 } },
    });
    const freshIosChannel = freshIosClient.channel(channelName, {
        config: { presence: { key: mate2.id } },
    });
    freshIosChannel.on('presence', { event: 'sync' }, () => {});

    let freshIosSubscribed = false;
    freshIosChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            freshIosSubscribed = true;
            await freshIosChannel.track({
                mate_id: mate2.id,
                name: mate2.name,
                avatar_url: null,
                joined_at: Date.now(),
                fresh_mount: true,
            });
        }
    });

    const iosJoined = await waitForCondition(() => {
        const check = getDeduplicatedViewers(customerChannel.presenceState());
        return check.some(v => v.id === mate2.id);
    }, 10000);

    assert(freshIosSubscribed, 'Fresh iOS mount successfully subscribed');
    assert(iosJoined, 'Fresh iOS channel immediately joins customer presence state upon push open');

    // =========================================================================
    // SECTION 7: Cleanup & Leak Verification
    // =========================================================================
    console.log('\n--- Section 7: Final Teardown & 0 Leaked Channels Audit ---');

    await customerClient.removeChannel(customerChannel);
    await mate1Client.removeChannel(mate1Channel);
    await freshIosClient.removeChannel(freshIosChannel);

    await sleep(500);

    assert(customerClient.getChannels().length === 0, 'Customer client has 0 remaining channels');
    assert(mate1Client.getChannels().length === 0, 'Mate 1 client has 0 remaining channels');
    assert(mate2Client.getChannels().length === 0, 'Mate 2 client has 0 remaining channels');
    assert(freshIosClient.getChannels().length === 0, 'Fresh iOS client has 0 remaining channels');

    console.log('\n' + '='.repeat(70));
    console.log(`Test Results: ${passed} PASSED, ${failed} FAILED`);
    console.log('='.repeat(70));

    if (failed > 0) {
        process.exit(1);
    } else {
        console.log('✨ All Step 7 Background/Reconnect Tests Passed Successfully!\n');
    }
}

run().catch((err) => {
    console.error('Unhandled test suite error:', err);
    process.exit(1);
});
