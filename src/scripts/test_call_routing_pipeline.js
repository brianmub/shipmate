/**
 * Test Suite: In-App Calling & Plain Text Messaging Pipeline
 * 
 * Verifies:
 * 1. Dual-tree architectural parity between src/ and mobile/src/
 * 2. Database schema additions (customer_phone, driver_phone, caller_phone, in_app_call check constraint)
 * 3. In-App Calling Component (InAppCallModal) presence and integration
 * 4. In-App Plain Text Messaging (Gate arrival via chatService.sendMessage, not external SMS)
 * 5. Masked call logging with trigger_event 'in_app_call'
 * 6. Customer & Driver tracking screen calling flow without mobile numbers exposed
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};

const results = [];

function logSection(title) {
    console.log(`\n${colors.bright}${colors.cyan}══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}  ${title}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}══════════════════════════════════════════════════════════════${colors.reset}\n`);
}

function recordResult(name, passed, details = '') {
    results.push({ name, passed, details });
    const badge = passed ? `${colors.green}✔ PASS${colors.reset}` : `${colors.red}✖ FAIL${colors.reset}`;
    console.log(`[${badge}] ${colors.bright}${name}${colors.reset}`);
    if (details) {
        console.log(`      ${colors.gray}${details}${colors.reset}`);
    }
}

const supabase = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDualTreeParity() {
    logSection('Suite 1: Dual-Tree Mirroring & Architectural Parity');

    const filesToCompare = [
        'types/index.ts',
        'components/InAppCallModal.tsx',
        'services/orderService.ts',
        'screens/driver/DriverActiveJobScreen.native.tsx',
        'screens/driver/DriverActiveJobScreen.web.tsx',
        'screens/customer/CustomerTrackingScreen.native.tsx',
        'screens/customer/CustomerTrackingScreen.web.tsx',
        'screens/ChatScreen.tsx'
    ];

    for (const relPath of filesToCompare) {
        const rootPath = path.resolve(process.cwd(), 'src', relPath);
        const mobilePath = path.resolve(process.cwd(), 'mobile/src', relPath);

        const existsRoot = fs.existsSync(rootPath);
        const existsMobile = fs.existsSync(mobilePath);

        if (!existsRoot || !existsMobile) {
            recordResult(
                `File existence: ${relPath}`,
                false,
                `Root exists: ${existsRoot}, Mobile exists: ${existsMobile}`
            );
            continue;
        }

        const rootContent = fs.readFileSync(rootPath, 'utf8').replace(/\r\n/g, '\n');
        const mobileContent = fs.readFileSync(mobilePath, 'utf8').replace(/\r\n/g, '\n');

        const isMatch = rootContent === mobileContent;
        recordResult(
            `Parity check: ${relPath}`,
            isMatch,
            isMatch ? '100% byte-for-byte match' : 'Difference detected between root and mobile tree'
        );
    }
}

async function testDatabaseSchema() {
    logSection('Suite 2: Database Schema & Migration Verification');

    // 1. Check orders table columns (customer_phone, driver_phone)
    const { data: orderCols, error: orderErr } = await supabase
        .from('orders')
        .select('customer_phone, driver_phone')
        .limit(1);

    recordResult(
        'orders table: customer_phone and driver_phone columns exist',
        !orderErr,
        orderErr ? orderErr.message : 'Columns verified on public.orders'
    );

    // 2. Check masked_call_logs columns (caller_phone)
    const { data: callCols, error: callErr } = await supabase
        .from('masked_call_logs')
        .select('caller_phone, trigger_event')
        .limit(1);

    recordResult(
        'masked_call_logs table: caller_phone column exists',
        !callErr,
        callErr ? callErr.message : 'Column verified on public.masked_call_logs'
    );

    // 3. Test insert in_app_call trigger event into masked_call_logs
    const testOrderId = (await supabase.from('orders').select('id').limit(1)).data?.[0]?.id;
    if (testOrderId) {
        const { data: testLog, error: testLogErr } = await supabase
            .from('masked_call_logs')
            .insert([{
                order_id: testOrderId,
                caller_role: 'driver',
                status: 'completed',
                duration_seconds: 18,
                trigger_event: 'in_app_call',
                masked_proxy_number: '+2638677000123'
            }])
            .select()
            .single();

        recordResult(
            'masked_call_logs allows trigger_event: in_app_call',
            !testLogErr && Boolean(testLog?.id),
            testLogErr ? testLogErr.message : `Successfully inserted in_app_call log ${testLog?.id}`
        );

        // Clean up test log
        if (testLog?.id) {
            await supabase.from('masked_call_logs').delete().eq('id', testLog.id);
        }
    }
}

async function testInAppCallingAndMessagingLogic() {
    logSection('Suite 3: In-App Calling & Plain Text Messaging UI Logic');

    // 1. Check InAppCallModal component implementation
    const modalPath = path.resolve(process.cwd(), 'src/components/InAppCallModal.tsx');
    const modalContent = fs.readFileSync(modalPath, 'utf8');

    const hasPrivacyPill = modalContent.includes('100% IN-APP CALL • MOBILE NUMBERS PRIVATE') || modalContent.includes('MOBILE NUMBERS PRIVATE');
    recordResult('InAppCallModal: Displays Mobile Numbers Private Guarantee', hasPrivacyPill);

    const hasRealtimeSignaling = modalContent.includes('order_call_') && modalContent.includes('broadcast');
    recordResult('InAppCallModal: Real-time audio channel signaling', hasRealtimeSignaling);

    const hasMuteSpeaker = modalContent.includes('isMuted') && modalContent.includes('isSpeakerOn');
    recordResult('InAppCallModal: Mute & Speakerphone controls', hasMuteSpeaker);

    const hasProxyFallback = modalContent.includes('Switch to Cellular Masked Proxy');
    recordResult('InAppCallModal: Telephony Virtual Proxy fallback (+263 867 700 0123)', hasProxyFallback);

    // 2. Check DriverActiveJobScreen: No external sms:, uses InAppCallModal
    const driverNativePath = path.resolve(process.cwd(), 'src/screens/driver/DriverActiveJobScreen.native.tsx');
    const driverContent = fs.readFileSync(driverNativePath, 'utf8');

    const driverHasInAppCall = driverContent.includes('<InAppCallModal') && driverContent.includes('setInAppCallVisible(true)');
    recordResult('DriverActiveJobScreen: Launches InAppCallModal on Call press', driverHasInAppCall);

    const driverNoExternalSms = !driverContent.includes('Linking.openURL(`sms:') && driverContent.includes('chatService.sendMessage');
    recordResult('DriverActiveJobScreen: "Ping Gate Arrival" sends in-app chat message (no external SMS)', driverNoExternalSms);

    // 3. Check CustomerTrackingScreen: No external tel:, uses InAppCallModal
    const customerNativePath = path.resolve(process.cwd(), 'src/screens/customer/CustomerTrackingScreen.native.tsx');
    const customerContent = fs.readFileSync(customerNativePath, 'utf8');

    const customerHasInAppCall = customerContent.includes('<InAppCallModal') && customerContent.includes('setInAppCallVisible(true)');
    recordResult('CustomerTrackingScreen: Launches InAppCallModal on Call Mate press', customerHasInAppCall);

    const customerHasTimingFix = customerContent.includes('payload.new?.driver_id') && customerContent.includes('fetchOrder()');
    recordResult('CustomerTrackingScreen: Realtime driver_assigned race-condition timing fix', customerHasTimingFix);

    // 4. Check ChatScreen: Header call button launches InAppCallModal
    const chatPath = path.resolve(process.cwd(), 'src/screens/ChatScreen.tsx');
    const chatContent = fs.readFileSync(chatPath, 'utf8');

    const chatHasInAppCall = chatContent.includes('<InAppCallModal') && chatContent.includes('setInAppCallVisible(true)');
    recordResult('ChatScreen: Header call icon launches InAppCallModal (no tel: prompt)', chatHasInAppCall);
}

async function runAllSuites() {
    console.log(`\n${colors.bright}${colors.yellow}==================================================================${colors.reset}`);
    console.log(`${colors.bright}${colors.yellow}   ShipMate In-App Call & Plain Text Messaging Test Runner   ${colors.reset}`);
    console.log(`${colors.bright}${colors.yellow}==================================================================${colors.reset}`);

    await testDualTreeParity();
    await testDatabaseSchema();
    await testInAppCallingAndMessagingLogic();

    logSection('Final Verification Summary');
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    console.log(`Total Assertions: ${colors.bright}${results.length}${colors.reset}`);
    console.log(`Passed:           ${colors.bright}${colors.green}${passed}${colors.reset}`);
    console.log(`Failed:           ${colors.bright}${failed > 0 ? colors.red : colors.gray}${failed}${colors.reset}\n`);

    if (failed > 0) {
        console.error(`${colors.bright}${colors.red}❌ Test suite failed with ${failed} failure(s).${colors.reset}\n`);
        process.exit(1);
    } else {
        console.log(`${colors.bright}${colors.green}✅ All tests passed with 0 failures! Dual-tree parity & In-app calling verified.${colors.reset}\n`);
        process.exit(0);
    }
}

runAllSuites().catch((err) => {
    console.error('Unhandled error during test run:', err);
    process.exit(1);
});
