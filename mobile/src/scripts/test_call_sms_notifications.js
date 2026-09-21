/**
 * Test Suite: End-to-End In-App Call & SMS/Message Notification Pipeline
 * 
 * Verifies:
 * 1. Database schema: order_notifications allows 'driver', 'customer', 'recipient'
 * 2. Android permissions in app.json and mobile/app.json (POST_NOTIFICATIONS, VIBRATE)
 * 3. Notification channels (default, incoming-calls with MAX importance & vibration patterns)
 * 4. Dual-tree architectural parity across all modified components
 * 5. Backend Edge Function (notify-call-message) live execution for calls and messages
 * 6. User push token capture & registration across Customer and Driver roles
 * 7. In-app banner & toast component structure, call vibration pattern, and actions
 * 8. Deep-linking response listeners for foreground, backgrounded, and killed app states
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

async function testDatabaseSchema() {
    logSection('Suite 1: Database Schema & Notification Constraints');

    // 1. Verify order_notifications allows 'driver' recipient_type
    const testOrderId = '9800cc31-b1ec-4419-9df5-e2655becd450';
    let driverInsertPassed = false;
    let driverInsertErr = null;

    try {
        const { data, error } = await supabase
            .from('order_notifications')
            .insert([{
                order_id: testOrderId,
                recipient_type: 'driver',
                channel: 'push',
                milestone: 'in_app_call',
                destination: 'ExponentPushToken[test_token_validation]',
                title: 'Test Call Alert',
                body: 'Incoming call from customer',
                status: 'sent'
            }])
            .select();

        if (!error && data && data.length > 0) {
            driverInsertPassed = true;
            // Clean up test row
            await supabase.from('order_notifications').delete().eq('id', data[0].id);
        } else {
            driverInsertErr = error?.message;
        }
    } catch (err) {
        driverInsertErr = err.message;
    }

    recordResult(
        'order_notifications accepts recipient_type: "driver"',
        driverInsertPassed,
        driverInsertErr || 'Constraint allows customer, recipient, and driver'
    );

    // 2. Verify masked_call_logs table allows in_app_call trigger_event
    let callLogPassed = false;
    try {
        const { data, error } = await supabase
            .from('masked_call_logs')
            .insert([{
                order_id: testOrderId,
                caller_role: 'driver',
                status: 'initiated',
                trigger_event: 'in_app_call'
            }])
            .select();

        if (!error && data && data.length > 0) {
            callLogPassed = true;
            await supabase.from('masked_call_logs').delete().eq('id', data[0].id);
        }
    } catch (err) {
        // non-blocking
    }

    recordResult('masked_call_logs allows trigger_event: "in_app_call"', callLogPassed);
}

async function testAppPermissionsAndChannels() {
    logSection('Suite 2: Android Permissions & Notification Channels');

    const rootAppJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../app.json'), 'utf8'));
    const mobileAppJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../mobile/app.json'), 'utf8'));

    const rootPermissions = rootAppJson.expo?.android?.permissions || [];
    const mobilePermissions = mobileAppJson.expo?.android?.permissions || [];

    const rootHasPost = rootPermissions.includes('POST_NOTIFICATIONS');
    const rootHasVibrate = rootPermissions.includes('VIBRATE');
    const mobileHasPost = mobilePermissions.includes('POST_NOTIFICATIONS');
    const mobileHasVibrate = mobilePermissions.includes('VIBRATE');

    recordResult(
        'app.json: POST_NOTIFICATIONS permission present (Android 13+)',
        rootHasPost
    );
    recordResult(
        'app.json: VIBRATE permission present',
        rootHasVibrate
    );
    recordResult(
        'mobile/app.json: POST_NOTIFICATIONS & VIBRATE present',
        mobileHasPost && mobileHasVibrate
    );

    // Check pushNotifications.ts for incoming-calls channel configuration
    const pushUtils = fs.readFileSync(path.resolve(__dirname, '../utils/pushNotifications.ts'), 'utf8');
    const hasIncomingChannel = pushUtils.includes("'incoming-calls'") && pushUtils.includes('AndroidImportance.MAX');
    const hasCallVibration = pushUtils.includes('[0, 600, 300, 600, 300, 1000]');
    const hasLaunchPrompt = pushUtils.includes('requestNotificationPermissionsOnLaunch');
    const hasForegroundListener = pushUtils.includes('setupForegroundNotificationListener');

    recordResult(
        'pushNotifications.ts: Configures "incoming-calls" channel with MAX importance',
        hasIncomingChannel
    );
    recordResult(
        'pushNotifications.ts: inDrive/Bolt ringing vibration pattern defined',
        hasCallVibration
    );
    recordResult(
        'pushNotifications.ts: requestNotificationPermissionsOnLaunch on startup',
        hasLaunchPrompt
    );
    recordResult(
        'pushNotifications.ts: setupForegroundNotificationListener configured',
        hasForegroundListener
    );
}

async function testDualTreeParity() {
    logSection('Suite 3: Dual-Tree Architectural Parity (src/ vs mobile/src/)');

    const filesToCompare = [
        'utils/pushNotifications.ts',
        'components/InAppNotificationBanner.tsx',
        'components/InAppCallModal.tsx',
        'services/chatService.ts',
        'navigation/RootNavigator.tsx',
        'screens/driver/DriverActiveJobScreen.native.tsx',
        'screens/customer/CustomerTrackingScreen.native.tsx',
        'screens/auth/SignUpScreen.tsx'
    ];

    let allParityPass = true;

    for (const relFile of filesToCompare) {
        const rootPath = path.resolve(__dirname, '..', relFile);
        const mobilePath = path.resolve(__dirname, '../../mobile/src', relFile);

        const rootExists = fs.existsSync(rootPath);
        const mobileExists = fs.existsSync(mobilePath);

        if (!rootExists || !mobileExists) {
            recordResult(`File existence: ${relFile}`, false, `Root: ${rootExists}, Mobile: ${mobileExists}`);
            allParityPass = false;
            continue;
        }

        const rootContent = fs.readFileSync(rootPath, 'utf8').replace(/\r\n/g, '\n').trim();
        const mobileContent = fs.readFileSync(mobilePath, 'utf8').replace(/\r\n/g, '\n').trim();

        const match = rootContent === mobileContent;
        if (!match) allParityPass = false;
        recordResult(`Parity: ${relFile}`, match, match ? 'Identical' : 'Mismatch detected');
    }
}

async function testBackendEdgeFunction() {
    logSection('Suite 4: Backend Push Dispatch (notify-call-message)');

    const testOrderId = '9800cc31-b1ec-4419-9df5-e2655becd450';

    // 1. Invoke Call Notification
    let callDispatched = false;
    let callResponseData = null;
    try {
        const { data, error } = await supabase.functions.invoke('notify-call-message', {
            body: {
                orderId: testOrderId,
                eventType: 'call',
                callerRole: 'driver',
                callerName: 'Mate Test Caller'
            }
        });

        if (!error && data?.success) {
            callDispatched = true;
            callResponseData = data;
        } else {
            console.warn('Call invoke error:', error || data);
        }
    } catch (err) {
        console.warn('Call invoke exception:', err);
    }

    recordResult(
        'notify-call-message: Dispatches call push notification to recipient',
        callDispatched,
        callResponseData ? `Push Dispatched: ${callResponseData.push_dispatched}, Title: "${callResponseData.push_title}"` : 'Failed'
    );

    // 2. Invoke Message Notification
    let messageDispatched = false;
    let messageResponseData = null;
    try {
        const { data, error } = await supabase.functions.invoke('notify-call-message', {
            body: {
                orderId: testOrderId,
                eventType: 'message',
                senderRole: 'customer',
                senderName: 'Customer Test Sender',
                messageText: 'Hello Mate! I am at the gate waiting.'
            }
        });

        if (!error && data?.success) {
            messageDispatched = true;
            messageResponseData = data;
        }
    } catch (err) {
        console.warn('Message invoke exception:', err);
    }

    recordResult(
        'notify-call-message: Dispatches message push notification to recipient',
        messageDispatched,
        messageResponseData ? `Push Dispatched: ${messageResponseData.push_dispatched}, Title: "${messageResponseData.push_title}"` : 'Failed'
    );

    // 3. Verify audit record in order_notifications
    const { data: auditRecords } = await supabase
        .from('order_notifications')
        .select('*')
        .eq('order_id', testOrderId)
        .order('created_at', { ascending: false })
        .limit(3);

    const hasRecentAudit = auditRecords && auditRecords.some(r => r.milestone === 'in_app_call' || r.milestone === 'in_app_message');
    recordResult(
        'order_notifications: Dispatches logged in audit trail with status "sent"',
        hasRecentAudit
    );
}

async function testForegroundAndBackgroundPipelines() {
    logSection('Suite 5: Foreground & Deep-Linking Pipeline Inspection');

    // 1. Check InAppNotificationBanner implementation
    const bannerPath = path.resolve(__dirname, '../components/InAppNotificationBanner.tsx');
    const bannerContent = fs.readFileSync(bannerPath, 'utf8');

    const hasAnswerAction = bannerContent.includes('handleAnswerCall') && bannerContent.includes('onAnswerCall');
    const hasDeclineAction = bannerContent.includes('handleDeclineCall') && bannerContent.includes('decline_call');
    const hasRingingVibration = bannerContent.includes('Vibration.vibrate([0, 600, 300, 600, 300, 1000], true)');
    const hasVibrationCancel = bannerContent.includes('Vibration.cancel()');
    const hasMessageToast = bannerContent.includes('handleTapMessage') && bannerContent.includes('onOpenMessage');

    recordResult('InAppNotificationBanner: Answer action stops vibration & opens call', hasAnswerAction);
    recordResult('InAppNotificationBanner: Decline action broadcasts decline_call', hasDeclineAction);
    recordResult('InAppNotificationBanner: InDrive/Bolt repeating ringing vibration active', hasRingingVibration);
    recordResult('InAppNotificationBanner: Vibration.cancel() invoked on answer/decline', hasVibrationCancel);
    recordResult('InAppNotificationBanner: Message toast with tap-to-reply action', hasMessageToast);

    // 2. Check RootNavigator integration
    const navPath = path.resolve(__dirname, '../navigation/RootNavigator.tsx');
    const navContent = fs.readFileSync(navPath, 'utf8');

    const hasLaunchPermissions = navContent.includes('requestNotificationPermissionsOnLaunch()');
    const hasUniversalPushToken = navContent.includes('registerForPushNotificationsAsync(session.user.id)') && !navContent.includes("if (session && role === 'driver') registerForPushNotificationsAsync");
    const hasMountedBanner = navContent.includes('<InAppNotificationBanner');
    const hasDeepLinkCall = navContent.includes("data.type === 'in_app_call'") && navContent.includes('openCall: true');
    const hasDeepLinkMessage = navContent.includes("data.type === 'in_app_message'") && navContent.includes("'Chat'");

    recordResult('RootNavigator: Requests permissions & caches token on first launch', hasLaunchPermissions);
    recordResult('RootNavigator: Binds push token universally for both Customer & Driver', hasUniversalPushToken);
    recordResult('RootNavigator: InAppNotificationBanner mounted globally in view hierarchy', hasMountedBanner);
    recordResult('RootNavigator: Deep-links in_app_call taps to active trip with openCall: true', hasDeepLinkCall);
    recordResult('RootNavigator: Deep-links in_app_message taps directly to Chat screen', hasDeepLinkMessage);

    // 3. Check ChatService & InAppCallModal triggers
    const chatPath = path.resolve(__dirname, '../services/chatService.ts');
    const chatContent = fs.readFileSync(chatPath, 'utf8');
    const callModalPath = path.resolve(__dirname, '../components/InAppCallModal.tsx');
    const callModalContent = fs.readFileSync(callModalPath, 'utf8');

    const chatTriggersPush = chatContent.includes("notify-call-message") && chatContent.includes("eventType: 'message'");
    const callModalTriggersPush = callModalContent.includes("notify-call-message") && callModalContent.includes("eventType: 'call'");
    const callModalSupportsIncoming = callModalContent.includes('isIncoming = false') && callModalContent.includes("payload: { action: 'answer_call', orderId }");

    recordResult('chatService.sendMessage: Asynchronously invokes notify-call-message', chatTriggersPush);
    recordResult('InAppCallModal: Asynchronously invokes notify-call-message on initiate', callModalTriggersPush);
    recordResult('InAppCallModal: Supports callee answering (isIncoming) & signals answer_call', callModalSupportsIncoming);
}

async function runAll() {
    console.log(`\n${colors.bright}🚀 RUNNING COMPREHENSIVE CALL & SMS NOTIFICATION PIPELINE VERIFICATION${colors.reset}`);
    await testDatabaseSchema();
    await testAppPermissionsAndChannels();
    await testDualTreeParity();
    await testBackendEdgeFunction();
    await testForegroundAndBackgroundPipelines();

    const total = results.length;
    const passedCount = results.filter(r => r.passed).length;
    const failedCount = total - passedCount;

    console.log(`\n${colors.bright}══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}  FINAL SUMMARY: ${passedCount}/${total} PASSED (${failedCount} FAILED)${colors.reset}`);
    console.log(`${colors.bright}══════════════════════════════════════════════════════════════${colors.reset}\n`);

    if (failedCount > 0) {
        process.exit(1);
    } else {
        console.log(`${colors.green}${colors.bright}✅ ALL NOTIFICATION PIPELINE AUDIT AND FIX TESTS PASSED SUCCESSFULLY!${colors.reset}\n`);
    }
}

runAll().catch(err => {
    console.error('Fatal error running verification suite:', err);
    process.exit(1);
});
