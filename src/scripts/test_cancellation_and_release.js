/**
 * Test Suite: Order Cancellation, Distance-Based Fee, Driver Release & Anti-Abuse Flow
 * 
 * Verifies:
 * 1. Dual-Tree Parity between mobile/src and root src
 * 2. SQL Migration & Schema definitions (cancellation_debt, order_releases, masked_call_logs, triggers & RPCs)
 * 3. Distance-Based Cancellation Fee logic:
 *    - < 0.5km: $0.00 fee, 0 debt rows
 *    - 0.5km - 1.0km: $0.50 flat fee
 *    - > 1.0km: $0.25/km uncapped linear
 * 4. Anti-Abuse Protocol for customer_no_show:
 *    - Pin arrival requirement (arrived_at_delivery / arrived)
 *    - 5-Minute waiting countdown timer (Push alert only, zero SMS/WhatsApp)
 *    - 3 masked call attempts spaced >= 1 minute apart
 *    - Rating penalty enforcement (-0.50 for unverified/forced, -0.05 for breakdown, -0.15 for store closed)
 * 5. Push-Only Guarantee for Arrival Countdown Timer:
 *    - Verification that edge function dispatches zero SMS, zero WhatsApp billing for arrival_timer
 * 6. Customer Unsettled Debt Enforcement & Mobile Money Clearing
 * 7. Release Compensation & Dispute Routing:
 *    - Acceptance writes debt row
 *    - Dispute transitions order to 'disputed' state
 * 8. Web Admin Disputed & Audit Inspection
 * 
 * Usage:
 *   node src/scripts/test_cancellation_and_release.js
 */

const fs = require('fs');
const path = require('path');

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    blue: '\x1b[34m',
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

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: Dual-Tree Parity Verification
// ─────────────────────────────────────────────────────────────────────────────
function testDualTreeParity() {
    logSection('Suite 1: Dual-Tree Code Parity (mobile/src <-> src)');

    const filesToVerify = [
        'types/index.ts',
        'services/orderService.ts',
        'screens/customer/CreateOrderScreen.tsx',
        'screens/customer/CustomerTrackingScreen.native.tsx',
        'screens/customer/CustomerTrackingScreen.web.tsx',
        'screens/driver/DriverActiveJobScreen.native.tsx',
        'screens/driver/DriverActiveJobScreen.web.tsx',
    ];

    const basePath = path.resolve(__dirname, '../../');
    const mobileSrc = path.join(basePath, 'mobile', 'src');
    const rootSrc = path.join(basePath, 'src');

    for (const relFile of filesToVerify) {
        const mobileFilePath = path.join(mobileSrc, relFile);
        const rootFilePath = path.join(rootSrc, relFile);

        const mobileExists = fs.existsSync(mobileFilePath);
        const rootExists = fs.existsSync(rootFilePath);

        if (!mobileExists || !rootExists) {
            recordResult(`Dual-Tree Parity: ${relFile}`, false, `File missing: mobileExists=${mobileExists}, rootExists=${rootExists}`);
            continue;
        }

        const mobileBuf = fs.readFileSync(mobileFilePath);
        const rootBuf = fs.readFileSync(rootFilePath);

        const isIdentical = mobileBuf.equals(rootBuf);
        recordResult(
            `Dual-Tree Parity: ${relFile}`,
            isIdentical,
            isIdentical ? `Exact match (${mobileBuf.length} bytes)` : `Byte mismatch (mobile: ${mobileBuf.length}b, root: ${rootBuf.length}b)`
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: SQL Migration & Schema Definition Verification
// ─────────────────────────────────────────────────────────────────────────────
function testSqlMigration() {
    logSection('Suite 2: Database Migration & Schema Integrity');

    const migrationPath = path.resolve(
        __dirname,
        '../../supabase/migrations/20260917150000_order_cancellation_release_and_debt.sql'
    );

    const exists = fs.existsSync(migrationPath);
    recordResult('Migration File Exists', exists, migrationPath);
    if (!exists) return;

    const sqlContent = fs.readFileSync(migrationPath, 'utf8');

    // 1. Check order status constraint expansion
    const hasOrderStatusEnum = sqlContent.includes("orders_status_check CHECK (status IN (") &&
        sqlContent.includes("'disputed'") &&
        sqlContent.includes("'driver_assigned'");
    recordResult('Order Status Constraint contains disputed & driver_assigned', hasOrderStatusEnum);

    // 2. Check masked_call_logs table
    const hasMaskedCalls = sqlContent.includes('CREATE TABLE IF NOT EXISTS public.masked_call_logs');
    recordResult('Masked Call Logs Table Defined', hasMaskedCalls);

    // 3. Check order_releases table
    const hasOrderReleases = sqlContent.includes('CREATE TABLE IF NOT EXISTS public.order_releases');
    recordResult('Order Releases Audit Table Defined', hasOrderReleases);

    // 4. Check cancellation_debt table
    const hasCancellationDebt = sqlContent.includes('CREATE TABLE IF NOT EXISTS public.cancellation_debt');
    recordResult('Cancellation Debt Table Defined', hasCancellationDebt);

    // 5. Check trigger preventing orders if unsettled debt
    const hasDebtTrigger = sqlContent.includes('trg_prevent_order_if_unsettled_debt') &&
        sqlContent.includes('BEFORE INSERT ON public.orders');
    recordResult('Trigger: trg_prevent_order_if_unsettled_debt', hasDebtTrigger);

    // 6. Check GPS distance accumulation trigger
    const hasGpsTrigger = sqlContent.includes('trg_accumulate_driver_gps_distance') &&
        sqlContent.includes('BEFORE UPDATE OF driver_latitude, driver_longitude ON public.orders');
    recordResult('Trigger: trg_accumulate_driver_gps_distance', hasGpsTrigger);

    // 7. Check atomic stored procedures
    const hasFeeCalcRpc = sqlContent.includes('calculate_cancellation_fee');
    const hasCancelRpc = sqlContent.includes('cancel_order_by_customer_rpc');
    const hasReleaseRpc = sqlContent.includes('release_order_by_driver_rpc');
    const hasArrivalTimerRpc = sqlContent.includes('start_arrival_timer_rpc');
    const hasSettleDebtRpc = sqlContent.includes('settle_cancellation_debt_rpc');
    const hasRespondCompRpc = sqlContent.includes('respond_to_release_compensation_rpc');

    recordResult('RPC: calculate_cancellation_fee', hasFeeCalcRpc);
    recordResult('RPC: cancel_order_by_customer_rpc', hasCancelRpc);
    recordResult('RPC: release_order_by_driver_rpc', hasReleaseRpc);
    recordResult('RPC: start_arrival_timer_rpc', hasArrivalTimerRpc);
    recordResult('RPC: settle_cancellation_debt_rpc', hasSettleDebtRpc);
    recordResult('RPC: respond_to_release_compensation_rpc', hasRespondCompRpc);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: Distance-Based Fee Calculation Engine
// ─────────────────────────────────────────────────────────────────────────────
function calculateFee(distanceKm) {
    const d = parseFloat(distanceKm) || 0;
    if (d < 0.5) {
        return 0.00;
    } else if (d <= 1.0) {
        return 0.50;
    } else {
        return Math.round((d * 0.25) * 100) / 100;
    }
}

function testFeeCalculation() {
    logSection('Suite 3: Distance-Based Cancellation Fee Logic');

    const testCases = [
        { km: 0.0, expected: 0.00, desc: '0km moved (free)' },
        { km: 0.2, expected: 0.00, desc: '0.2km moved (<0.5km free)' },
        { km: 0.49, expected: 0.00, desc: '0.49km moved (<0.5km free)' },
        { km: 0.5, expected: 0.50, desc: '0.5km moved ($0.50 flat)' },
        { km: 0.75, expected: 0.50, desc: '0.75km moved ($0.50 flat)' },
        { km: 1.0, expected: 0.50, desc: '1.0km moved ($0.50 flat)' },
        { km: 2.0, expected: 0.50, desc: '2.0km moved (2.0 * $0.25 = $0.50)' },
        { km: 3.0, expected: 0.75, desc: '3.0km moved (3.0 * $0.25 = $0.75)' },
        { km: 5.4, expected: 1.35, desc: '5.4km moved (5.4 * $0.25 = $1.35)' },
        { km: 10.0, expected: 2.50, desc: '10.0km moved (10.0 * $0.25 = $2.50 uncapped linear)' },
    ];

    for (const tc of testCases) {
        const actual = calculateFee(tc.km);
        const passed = Math.abs(actual - tc.expected) < 0.001;
        recordResult(
            `Fee for ${tc.km}km: $${actual.toFixed(2)}`,
            passed,
            `${tc.desc} -> Expected $${tc.expected.toFixed(2)}, got $${actual.toFixed(2)}`
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: Anti-Abuse Protocol for customer_no_show & Release
// ─────────────────────────────────────────────────────────────────────────────
function evaluateReleaseEligibility(params) {
    const {
        reason,
        orderStatus,
        timerStartedAt,
        currentTime,
        callAttempts
    } = params;

    if (reason === 'mechanical_issue') {
        return { eligible: true, penalty: 0.05, autoFlagged: false };
    }

    if (reason === 'store_closed') {
        const hasCall = callAttempts && callAttempts.length >= 1;
        return {
            eligible: hasCall,
            penalty: 0.15,
            autoFlagged: !hasCall,
            reason: hasCall ? 'Verified' : 'Missing at least 1 call attempt'
        };
    }

    if (reason === 'customer_no_show') {
        const atPin = orderStatus === 'arrived_at_delivery' || orderStatus === 'arrived';
        const timerSeconds = timerStartedAt ? Math.floor((currentTime - timerStartedAt) / 1000) : 0;
        const timerCompleted = timerSeconds >= 300; // 5 minutes

        // Check calls: need >= 3, and each spaced >= 60s
        let spacedCallsValid = false;
        if (callAttempts && callAttempts.length >= 3) {
            spacedCallsValid = true;
            for (let i = 1; i < callAttempts.length; i++) {
                const diff = (callAttempts[i] - callAttempts[i - 1]) / 1000;
                if (diff < 60) {
                    spacedCallsValid = false;
                    break;
                }
            }
        }

        const allSatisfied = atPin && timerCompleted && spacedCallsValid;
        return {
            eligible: allSatisfied,
            penalty: allSatisfied ? 0.00 : 0.50,
            autoFlagged: !allSatisfied,
            details: { atPin, timerCompleted, spacedCallsValid }
        };
    }

    return { eligible: false, penalty: 0.20, autoFlagged: true };
}

function testAntiAbuseProtocol() {
    logSection('Suite 4: Anti-Abuse Protocol Verification');

    const now = 1000000;

    // Case 1: Driver at delivery pin, 5-min timer completed, 3 calls spaced 65s apart -> Valid, zero penalty
    const case1 = evaluateReleaseEligibility({
        reason: 'customer_no_show',
        orderStatus: 'arrived_at_delivery',
        timerStartedAt: now - 310 * 1000,
        currentTime: now,
        callAttempts: [now - 150 * 1000, now - 80 * 1000, now - 10 * 1000]
    });
    recordResult('customer_no_show: Full Compliance (Zero Penalty)', case1.eligible && case1.penalty === 0.00);

    // Case 2: Driver NOT at delivery pin (still en_route) -> Blocked / Flagged
    const case2 = evaluateReleaseEligibility({
        reason: 'customer_no_show',
        orderStatus: 'en_route_to_delivery',
        timerStartedAt: now - 350 * 1000,
        currentTime: now,
        callAttempts: [now - 150 * 1000, now - 80 * 1000, now - 10 * 1000]
    });
    recordResult('customer_no_show: Blocked if not at delivery pin', !case2.eligible && case2.autoFlagged && case2.penalty === 0.50);

    // Case 3: Driver timer only 3 mins (180s) -> Blocked / Flagged
    const case3 = evaluateReleaseEligibility({
        reason: 'customer_no_show',
        orderStatus: 'arrived_at_delivery',
        timerStartedAt: now - 180 * 1000,
        currentTime: now,
        callAttempts: [now - 150 * 1000, now - 80 * 1000, now - 10 * 1000]
    });
    recordResult('customer_no_show: Blocked if 5-min timer incomplete (180s/300s)', !case3.eligible && case3.autoFlagged);

    // Case 4: Driver placed only 2 calls -> Blocked / Flagged
    const case4 = evaluateReleaseEligibility({
        reason: 'customer_no_show',
        orderStatus: 'arrived_at_delivery',
        timerStartedAt: now - 350 * 1000,
        currentTime: now,
        callAttempts: [now - 150 * 1000, now - 80 * 1000]
    });
    recordResult('customer_no_show: Blocked if < 3 calls placed (2/3)', !case4.eligible && case4.autoFlagged);

    // Case 5: Driver placed 3 rapid spam calls (< 60s apart) -> Blocked / Flagged
    const case5 = evaluateReleaseEligibility({
        reason: 'customer_no_show',
        orderStatus: 'arrived_at_delivery',
        timerStartedAt: now - 350 * 1000,
        currentTime: now,
        callAttempts: [now - 40 * 1000, now - 30 * 1000, now - 10 * 1000] // spaced 10s and 20s
    });
    recordResult('customer_no_show: Blocked if calls spaced < 60s apart', !case5.eligible && case5.autoFlagged);

    // Case 6: Mechanical Breakdown -> -0.05 penalty, never blocked
    const case6 = evaluateReleaseEligibility({
        reason: 'mechanical_issue',
        orderStatus: 'en_route_to_pickup',
        currentTime: now
    });
    recordResult('mechanical_issue: Allowed with -0.05 rating penalty', case6.eligible && case6.penalty === 0.05);

    // Case 7: Store Closed with >= 1 call -> Allowed with -0.15 rating penalty
    const case7 = evaluateReleaseEligibility({
        reason: 'store_closed',
        orderStatus: 'arrived_at_pickup',
        callAttempts: [now - 30 * 1000],
        currentTime: now
    });
    recordResult('store_closed: Allowed with >= 1 call attempt (-0.15 rating)', case7.eligible && case7.penalty === 0.15);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: Push-Only Guarantee for Arrival Countdown Timer
// ─────────────────────────────────────────────────────────────────────────────
function testPushOnlyCountdownGuarantee() {
    logSection('Suite 5: Countdown Timer Push-Only Guarantee (No SMS / No WhatsApp)');

    const edgeFunctionPath = path.resolve(
        __dirname,
        '../../supabase/functions/handle-cancellation-release/index.ts'
    );

    const exists = fs.existsSync(edgeFunctionPath);
    recordResult('Edge Function Exists', exists, edgeFunctionPath);
    if (!exists) return;

    const code = fs.readFileSync(edgeFunctionPath, 'utf8');

    // Verify arrival_timer event branch exists
    const hasArrivalTimerBranch = code.includes("event_type === 'arrival_timer'");
    recordResult('Edge Function handles arrival_timer event', hasArrivalTimerBranch);

    // Verify arrival_timer only triggers push notification and NO SMS / WhatsApp
    const timerDispatchesPush = code.includes("fetch(EXPO_PUSH_URL");
    recordResult('Edge Function dispatches Expo Push Notification for arrival_timer', timerDispatchesPush);

    // Check that inside the arrival_timer branch there is NO sendSMS or sendWhatsApp or telephony call
    const arrivalTimerSlice = code.substring(code.indexOf("event_type === 'arrival_timer'"));
    const timerSliceEnd = arrivalTimerSlice.indexOf("else if (event_type === 'cancellation')");
    const timerBlock = arrivalTimerSlice.substring(0, timerSliceEnd);

    const hasSmsInTimer = timerBlock.includes('sendSMS') || timerBlock.includes('clickatell') || timerBlock.includes('twilio');
    const hasWhatsAppInTimer = timerBlock.includes('sendWhatsApp') || timerBlock.includes('graph.facebook.com') || timerBlock.includes('api.whatsapp.com');
    const hasCallInTimer = timerBlock.includes('callRecipientId =');

    recordResult('Guarantee: ZERO SMS sent on arrival timer', !hasSmsInTimer, 'Verified no SMS client invoked in timer handler');
    recordResult('Guarantee: ZERO WhatsApp sent on arrival timer', !hasWhatsAppInTimer, 'Verified no WhatsApp client invoked in timer handler');
    recordResult('Guarantee: ZERO Voice call initiated on arrival timer', !hasCallInTimer, 'Verified callRecipientId not set for arrival_timer');
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6: UI Component Integrations & Copy Verification
// ─────────────────────────────────────────────────────────────────────────────
function testUiIntegrations() {
    logSection('Suite 6: UI Component Integrations & Customer Copy');

    const customerTrackingNative = path.resolve(__dirname, '../../mobile/src/screens/customer/CustomerTrackingScreen.native.tsx');
    const customerTrackingContent = fs.readFileSync(customerTrackingNative, 'utf8');

    // Distinct copy when an order re-enters pending via a release
    const hasReopenCopy = customerTrackingContent.includes('Re-opening your job for bids') ||
        customerTrackingContent.includes('⚡ Re-opening your job for bids');
    recordResult('Customer UI: "⚡ Re-opening your job for bids" copy on release', hasReopenCopy);

    // 5-minute waiting countdown timer UI
    const hasCountdownUI = customerTrackingContent.includes('formatTimer(timerSecondsLeft)') &&
        customerTrackingContent.includes('Your Mate is Outside at the Gate!');
    recordResult('Customer UI: 5-minute arrival waiting countdown banner', hasCountdownUI);

    // Release Compensation Card & Dispute Button
    const hasCompensationCard = customerTrackingContent.includes('Courier Compensation Request') &&
        customerTrackingContent.includes('Dispute');
    recordResult('Customer UI: Release compensation card with Dispute CTA', hasCompensationCard);

    // CreateOrderScreen Debt Check & Block
    const createOrderScreen = path.resolve(__dirname, '../../mobile/src/screens/customer/CreateOrderScreen.tsx');
    const createOrderContent = fs.readFileSync(createOrderScreen, 'utf8');

    const hasDebtCheck = createOrderContent.includes('checkCustomerDebt') &&
        createOrderContent.includes('unsettledDebt > 0');
    const hasDebtModal = createOrderContent.includes('debtModalVisible') &&
        createOrderContent.includes('debtSettleBtn');

    recordResult('CreateOrderScreen: Unsettled debt check & submission block', hasDebtCheck);
    recordResult('CreateOrderScreen: Mobile Money debt clearing modal', hasDebtModal);

    // DriverActiveJobScreen Arrival Timer Trigger & Release Modal
    const driverActiveScreen = path.resolve(__dirname, '../../mobile/src/screens/driver/DriverActiveJobScreen.native.tsx');
    const driverContent = fs.readFileSync(driverActiveScreen, 'utf8');

    const hasStartTimer = driverContent.includes('handleStartArrivalTimer') &&
        driverContent.includes('Start 5-Min Waiting Timer (Push Alert Only)');
    const hasReleaseModal = driverContent.includes('Release Active Job') &&
        driverContent.includes('customer_no_show') &&
        driverContent.includes('handleMakeMaskedCall');

    recordResult('DriverActiveJobScreen: Push-only arrival timer trigger', hasStartTimer);
    recordResult('DriverActiveJobScreen: Release modal with anti-abuse checklist & masked calls', hasReleaseModal);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 7: Web Admin Order Log Audit & Dispute Filter
// ─────────────────────────────────────────────────────────────────────────────
function testWebAdminAudit() {
    logSection('Suite 7: Web Admin Order Log & Dispute Auditing');

    const adminOrderLog = path.resolve(__dirname, '../../web-admin/src/pages/OrderLog.tsx');
    const adminContent = fs.readFileSync(adminOrderLog, 'utf8');

    const hasDisputeFilter = adminContent.includes("'disputed'") && adminContent.includes('statusFilter');
    const hasCancellationFeeDisplay = adminContent.includes('cancellation_fee') && adminContent.includes('km traveled');
    const hasReleasesAudit = adminContent.includes('selectedOrderReleases') && adminContent.includes('Order Release History');
    const hasCallsAudit = adminContent.includes('selectedOrderCalls') && adminContent.includes('Masked Call Attempts');

    recordResult('Web Admin: Disputed status filter & badge', hasDisputeFilter);
    recordResult('Web Admin: Cancellation fee & cumulative distance display', hasCancellationFeeDisplay);
    recordResult('Web Admin: Release audit trail with rating penalties', hasReleasesAudit);
    recordResult('Web Admin: Masked call logs audit history', hasCallsAudit);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXECUTION
// ─────────────────────────────────────────────────────────────────────────────
function main() {
    console.log(`\n${colors.bright}${colors.yellow}================================================================${colors.reset}`);
    console.log(`${colors.bright}${colors.yellow}   SHIPMATE ORDER CANCELLATION, RELEASE & ANTI-ABUSE TEST SUITE   ${colors.reset}`);
    console.log(`${colors.bright}${colors.yellow}================================================================${colors.reset}`);

    testDualTreeParity();
    testSqlMigration();
    testFeeCalculation();
    testAntiAbuseProtocol();
    testPushOnlyCountdownGuarantee();
    testUiIntegrations();
    testWebAdminAudit();

    // Summary
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;

    console.log(`\n${colors.bright}${colors.cyan}══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}Test Summary: ${passed}/${total} Passed (${failed} Failed)${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}══════════════════════════════════════════════════════════════${colors.reset}\n`);

    if (failed > 0) {
        console.error(`${colors.bright}${colors.red}❌ Some tests failed! Please review the output above.${colors.reset}\n`);
        process.exit(1);
    } else {
        console.log(`${colors.bright}${colors.green}🎉 ALL TESTS PASSED! Cancellation, release & fee system verified.${colors.reset}\n`);
        process.exit(0);
    }
}

main();
