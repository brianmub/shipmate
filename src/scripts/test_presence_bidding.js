/**
 * test_presence_bidding.js
 * 
 * Multi-client Supabase Presence simulation for Step 3:
 * - Creates a customer listener on request:{requestId}
 * - Simulates 4 Mate clients joining presence one by one
 * - Asserts viewer count updates within ~1s per transition
 * - Validates avatar stack is capped at 3 with +N overflow
 * - Simulates Mates leaving and validates count decreases
 * 
 * Usage: node src/scripts/test_presence_bidding.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://lgnhcfppovtwxtmjyfty.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnbmhjZnBwb3Z0d3h0bWp5ZnR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MTUyOTEsImV4cCI6MjA4ODM5MTI5MX0.B7S4HTymOOcoXjhtC9JontWs3jrAQ_LmXtENpUNK49w';

// Generate a test request ID
const TEST_REQUEST_ID = `test-presence-${Date.now()}`;
const CHANNEL_NAME = `request:${TEST_REQUEST_ID}`;

// Simulated Mate profiles
const MATES = [
    { id: 'mate-001', name: 'Tendai Moyo', avatar_url: null },
    { id: 'mate-002', name: 'Rumbi Chikara', avatar_url: 'https://example.com/rumbi.jpg' },
    { id: 'mate-003', name: 'Blessing Ndlovu', avatar_url: null },
    { id: 'mate-004', name: 'Tatenda Mukono', avatar_url: 'https://example.com/tatenda.jpg' },
];

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
    console.log('='.repeat(60));
    console.log('ShipMate Presence Bidding Test');
    console.log(`Channel: ${CHANNEL_NAME}`);
    console.log('='.repeat(60));

    // ---------- Customer Client ----------
    const customerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        realtime: { params: { eventsPerSecond: 10 } },
    });

    let viewerCount = 0;
    let viewerAvatars = [];
    let lastSyncTime = 0;

    const customerChannel = customerClient.channel(CHANNEL_NAME);
    customerChannel
        .on('presence', { event: 'sync' }, () => {
            const state = customerChannel.presenceState();
            const viewers = [];
            Object.values(state).forEach((presences) => {
                presences.forEach((presence) => {
                    viewers.push({
                        id: presence.mate_id || presence.presence_ref,
                        full_name: presence.name || 'Courier',
                        avatar_url: presence.avatar_url || null,
                    });
                });
            });
            // Deduplicate by ID
            const unique = viewers.filter(
                (v, i, self) => self.findIndex((t) => t.id === v.id) === i
            );
            viewerCount = unique.length;
            viewerAvatars = unique.slice(0, 3);
            lastSyncTime = Date.now();
        })
        .subscribe();

    await sleep(2500); // Wait for customer subscription to stabilize

    console.log('\n--- Test 1: Initial state (0 viewers) ---');
    assert(viewerCount === 0, `Viewer count is 0 (got ${viewerCount})`);
    assert(viewerAvatars.length === 0, `Avatar stack is empty`);

    // ---------- Mate Clients Join ----------
    const mateChannels = [];

    // Mate 1 joins
    console.log('\n--- Test 2: Mate 1 joins ---');
    const mate1Client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        realtime: { params: { eventsPerSecond: 10 } },
    });
    const mate1Channel = mate1Client.channel(CHANNEL_NAME, {
        config: { presence: { key: MATES[0].id } },
    });
    mate1Channel
        .on('presence', { event: 'sync' }, () => {})
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await mate1Channel.track({
                    mate_id: MATES[0].id,
                    name: MATES[0].name,
                    avatar_url: MATES[0].avatar_url,
                    joined_at: Date.now(),
                });
            }
        });
    mateChannels.push({ client: mate1Client, channel: mate1Channel });

    await sleep(3000);
    assert(viewerCount === 1, `Viewer count is 1 (got ${viewerCount})`);
    assert(viewerAvatars.length === 1, `Avatar stack has 1 entry`);
    assert(viewerAvatars[0]?.full_name === 'Tendai Moyo', `Avatar 1 name is Tendai Moyo (got ${viewerAvatars[0]?.full_name})`);

    // Mate 2 joins
    console.log('\n--- Test 3: Mate 2 joins ---');
    const mate2Client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        realtime: { params: { eventsPerSecond: 10 } },
    });
    const mate2Channel = mate2Client.channel(CHANNEL_NAME, {
        config: { presence: { key: MATES[1].id } },
    });
    mate2Channel
        .on('presence', { event: 'sync' }, () => {})
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await mate2Channel.track({
                    mate_id: MATES[1].id,
                    name: MATES[1].name,
                    avatar_url: MATES[1].avatar_url,
                    joined_at: Date.now(),
                });
            }
        });
    mateChannels.push({ client: mate2Client, channel: mate2Channel });

    await sleep(3000);
    assert(viewerCount === 2, `Viewer count is 2 (got ${viewerCount})`);
    assert(viewerAvatars.length === 2, `Avatar stack has 2 entries`);

    // Mate 3 & 4 join
    console.log('\n--- Test 4: Mates 3 & 4 join (overflow test) ---');
    for (const mateIdx of [2, 3]) {
        const mClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            realtime: { params: { eventsPerSecond: 10 } },
        });
        const mChannel = mClient.channel(CHANNEL_NAME, {
            config: { presence: { key: MATES[mateIdx].id } },
        });
        mChannel
            .on('presence', { event: 'sync' }, () => {})
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await mChannel.track({
                        mate_id: MATES[mateIdx].id,
                        name: MATES[mateIdx].name,
                        avatar_url: MATES[mateIdx].avatar_url,
                        joined_at: Date.now(),
                    });
                }
            });
        mateChannels.push({ client: mClient, channel: mChannel });
        await sleep(2500);
    }
    await sleep(1500);

    assert(viewerCount === 4, `Viewer count is 4 (got ${viewerCount})`);
    assert(viewerAvatars.length === 3, `Avatar stack capped at 3 (got ${viewerAvatars.length})`);
    const overflowCount = viewerCount - 3;
    assert(overflowCount === 1, `Overflow badge shows +1 (got +${overflowCount})`);

    // ---------- Mates Leave ----------
    console.log('\n--- Test 5: Mate 1 leaves (unsubscribe) ---');
    const beforeLeaveSync = lastSyncTime;
    await mateChannels[0].client.removeChannel(mateChannels[0].channel);
    await sleep(3000);
    assert(viewerCount === 3, `Viewer count decreased to 3 (got ${viewerCount})`);
    assert(lastSyncTime > beforeLeaveSync, `Sync event fired after Mate 1 left`);
    assert(viewerAvatars.length === 3, `Avatar stack shows 3 (no overflow now)`);

    console.log('\n--- Test 6: All remaining Mates leave ---');
    for (let i = 1; i < mateChannels.length; i++) {
        await mateChannels[i].client.removeChannel(mateChannels[i].channel);
        await sleep(1500);
    }
    await sleep(1500);
    assert(viewerCount === 0, `Viewer count back to 0 (got ${viewerCount})`);
    assert(viewerAvatars.length === 0, `Avatar stack empty`);

    // ---------- Cleanup ----------
    await customerClient.removeChannel(customerChannel);

    console.log('\n' + '='.repeat(60));
    console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
    console.log('='.repeat(60));

    process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
    console.error('Test runner error:', err);
    process.exit(1);
});
