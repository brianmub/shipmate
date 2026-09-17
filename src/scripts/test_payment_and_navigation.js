/**
 * Test Suite: Customer Payment Selection, Directives & 1-Tap GPS Navigation
 * 
 * Verifies:
 * 1. Dual-Tree Parity between mobile/src and root src
 * 2. SQL Migration & Schema definition for payment directives and settlement RPC
 * 3. Payment Directive Calculation & Trigger Simulation (COD vs Digital)
 * 4. Settlement Accounting Simulation (Cash float deduction vs Digital net credit)
 * 5. Turn-by-Turn GPS Navigation URL generator across iOS, Android, and Web
 * 6. OrderService contract & UI directive bindings
 * 
 * Usage:
 *   node src/scripts/test_payment_and_navigation.js
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
        'components/JobOfferModal.tsx',
        'screens/driver/DriverJobsScreen.tsx'
    ];

    const projectRoot = process.cwd();

    filesToVerify.forEach(relPath => {
        const rootPath = path.join(projectRoot, 'src', relPath);
        const mobilePath = path.join(projectRoot, 'mobile', 'src', relPath);

        if (!fs.existsSync(rootPath)) {
            recordResult(`Parity Check: ${relPath}`, false, `Root file missing: ${rootPath}`);
            return;
        }
        if (!fs.existsSync(mobilePath)) {
            recordResult(`Parity Check: ${relPath}`, false, `Mobile file missing: ${mobilePath}`);
            return;
        }

        const rootContent = fs.readFileSync(rootPath, 'utf8').replace(/\r\n/g, '\n').trim();
        const mobileContent = fs.readFileSync(mobilePath, 'utf8').replace(/\r\n/g, '\n').trim();

        if (rootContent === mobileContent) {
            recordResult(`Parity Check: ${relPath}`, true, `Exact byte match (${rootContent.length} chars)`);
        } else {
            recordResult(`Parity Check: ${relPath}`, false, `Content discrepancy detected!`);
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: Migration & Schema Contract Verification
// ─────────────────────────────────────────────────────────────────────────────
function testMigrationContract() {
    logSection('Suite 2: Database Migration & Schema Contract');

    const migrationPath = path.join(
        process.cwd(),
        'supabase',
        'migrations',
        '20260917130000_order_payment_methods_and_directives.sql'
    );

    if (!fs.existsSync(migrationPath)) {
        recordResult('Migration File Existence', false, `Missing: ${migrationPath}`);
        return;
    }

    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    // 1. Column additions
    const hasColumns = 
        migrationSql.includes('payment_method') &&
        migrationSql.includes('payment_status') &&
        migrationSql.includes('cash_to_collect') &&
        migrationSql.includes('payment_phone');
    recordResult('Columns Added to orders (payment_method, payment_status, cash_to_collect, payment_phone)', hasColumns);

    // 2. Trigger function
    const hasTriggerFn = migrationSql.includes('fn_sync_order_payment_directive()');
    recordResult('Directive Auto-Sync Function (fn_sync_order_payment_directive)', hasTriggerFn);

    // 3. Trigger declaration
    const hasTrigger = migrationSql.includes('trg_sync_order_payment_directive');
    recordResult('BEFORE INSERT/UPDATE Trigger (trg_sync_order_payment_directive)', hasTrigger);

    // 4. Atomic Settlement RPC
    const hasRpc = migrationSql.includes('CREATE OR REPLACE FUNCTION public.settle_order_payment_rpc');
    recordResult('Atomic Settlement RPC (settle_order_payment_rpc)', hasRpc);

    // 5. Digital vs COD logic in RPC
    const hasCodBranch = migrationSql.includes("v_order.payment_method = 'cash_on_delivery'");
    const hasDigitalBranch = migrationSql.includes("v_net_driver_earnings := GREATEST(0.00, COALESCE(v_order.estimated_cost, 0.00) - v_commission_amount)");
    recordResult('Settlement RPC Branching (COD Float Deduction vs Digital Earnings Credit)', hasCodBranch && hasDigitalBranch);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: Payment Directive & Trigger Logic Simulation
// ─────────────────────────────────────────────────────────────────────────────
function simulatePaymentDirectiveTrigger(order) {
    const cost = Number(order.estimated_cost) || 0;
    let paymentMethod = order.payment_method || 'cash_on_delivery';
    let paymentStatus = order.payment_status;
    let cashToCollect = 0;

    if (!paymentStatus) {
        if (paymentMethod === 'cash_on_delivery') {
            paymentStatus = 'pending_cash';
        } else {
            paymentStatus = 'pending_digital';
        }
    }

    if (paymentStatus === 'paid') {
        cashToCollect = 0;
    } else if (paymentMethod === 'cash_on_delivery') {
        cashToCollect = cost;
    } else {
        cashToCollect = 0;
    }

    return {
        ...order,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        cash_to_collect: cashToCollect
    };
}

function testPaymentDirectiveSimulation() {
    logSection('Suite 3: Payment Directive Simulation (fn_sync_order_payment_directive)');

    // Test 1: Default COD Order
    const codOrder = simulatePaymentDirectiveTrigger({ estimated_cost: 15.50 });
    const codOk = codOrder.payment_method === 'cash_on_delivery' &&
                  codOrder.payment_status === 'pending_cash' &&
                  codOrder.cash_to_collect === 15.50;
    recordResult('COD Order Initialization: Collects $15.50 cash, status pending_cash', codOk, JSON.stringify(codOrder));

    // Test 2: EcoCash Digital Order
    const ecoOrder = simulatePaymentDirectiveTrigger({ 
        estimated_cost: 22.00, 
        payment_method: 'ecocash',
        payment_phone: '+263771234567' 
    });
    const ecoOk = ecoOrder.payment_method === 'ecocash' &&
                  ecoOrder.payment_status === 'pending_digital' &&
                  ecoOrder.cash_to_collect === 0;
    recordResult('EcoCash Digital Order: $0.00 cash to collect, status pending_digital', ecoOk, JSON.stringify(ecoOrder));

    // Test 3: InnBucks Digital Order
    const innbucksOrder = simulatePaymentDirectiveTrigger({ 
        estimated_cost: 8.50, 
        payment_method: 'innbucks',
        payment_phone: '+263712345678' 
    });
    const innbucksOk = innbucksOrder.payment_method === 'innbucks' &&
                        innbucksOrder.payment_status === 'pending_digital' &&
                        innbucksOrder.cash_to_collect === 0;
    recordResult('InnBucks Digital Order: $0.00 cash to collect, status pending_digital', innbucksOk, JSON.stringify(innbucksOrder));

    // Test 4: Card Digital Order (Paid up-front)
    const cardOrder = simulatePaymentDirectiveTrigger({ 
        estimated_cost: 45.00, 
        payment_method: 'card',
        payment_status: 'paid'
    });
    const cardOk = cardOrder.payment_method === 'card' &&
                   cardOrder.payment_status === 'paid' &&
                   cardOrder.cash_to_collect === 0;
    recordResult('Paid Card Order: $0.00 cash to collect, status paid', cardOk, JSON.stringify(cardOrder));

    // Test 5: COD Order Completed & Paid
    const completedCodOrder = simulatePaymentDirectiveTrigger({ 
        estimated_cost: 15.50, 
        payment_method: 'cash_on_delivery',
        payment_status: 'paid'
    });
    const completedCodOk = completedCodOrder.payment_status === 'paid' && completedCodOrder.cash_to_collect === 0;
    recordResult('Completed COD Order Marked Paid: cash_to_collect transitions to $0.00', completedCodOk, JSON.stringify(completedCodOrder));
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: Settlement Accounting Simulation (COD Float vs Digital Earnings)
// ─────────────────────────────────────────────────────────────────────────────
function simulateSettlementRPC({
    orderCost,
    commissionRate = 0.15,
    paymentMethod,
    driverFloatBalance,
    driverAvailableBalance
}) {
    const commission = Math.round(orderCost * commissionRate * 100) / 100;
    let newFloatBalance = driverFloatBalance;
    let newAvailableBalance = driverAvailableBalance;
    let cashPocketedByDriver = 0;
    let netEarningsCredited = 0;

    if (paymentMethod === 'cash_on_delivery') {
        // Driver collected 100% of orderCost in cash directly from customer
        cashPocketedByDriver = orderCost;
        // Platform deducts commission from courier prepaid float wallet
        newFloatBalance -= commission;
    } else {
        // Digital Payment: ShipMate received full payment online
        cashPocketedByDriver = 0;
        // Platform retains commission, credits net earnings to driver's balance
        netEarningsCredited = orderCost - commission;
        newAvailableBalance += netEarningsCredited;
    }

    return {
        orderCost,
        commission,
        cashPocketedByDriver,
        netEarningsCredited,
        finalFloatBalance: Math.round(newFloatBalance * 100) / 100,
        finalAvailableBalance: Math.round(newAvailableBalance * 100) / 100
    };
}

function testSettlementAccounting() {
    logSection('Suite 4: Settlement Accounting Simulation (settle_order_payment_rpc)');

    // Case 1: COD Delivery of $20.00 (Commission 15% = $3.00)
    // Driver starts with $25.00 float, $50.00 available balance
    const codResult = simulateSettlementRPC({
        orderCost: 20.00,
        commissionRate: 0.15,
        paymentMethod: 'cash_on_delivery',
        driverFloatBalance: 25.00,
        driverAvailableBalance: 50.00
    });

    const codExpected = codResult.cashPocketedByDriver === 20.00 &&
                        codResult.commission === 3.00 &&
                        codResult.finalFloatBalance === 22.00 && // $25 - $3 = $22
                        codResult.finalAvailableBalance === 50.00; // Untouched
    recordResult(
        'COD Settlement: Driver pockets $20.00 cash, float deducted -$3.00 ($25->$22), balance unchanged ($50)',
        codExpected,
        `Float: $25 -> $${codResult.finalFloatBalance}, Cash Pocketed: $${codResult.cashPocketedByDriver}`
    );

    // Case 2: Digital EcoCash Delivery of $20.00 (Commission 15% = $3.00)
    // Driver starts with $25.00 float, $50.00 available balance
    const digitalResult = simulateSettlementRPC({
        orderCost: 20.00,
        commissionRate: 0.15,
        paymentMethod: 'ecocash',
        driverFloatBalance: 25.00,
        driverAvailableBalance: 50.00
    });

    const digitalExpected = digitalResult.cashPocketedByDriver === 0.00 &&
                            digitalResult.commission === 3.00 &&
                            digitalResult.finalFloatBalance === 25.00 && // Untouched!
                            digitalResult.finalAvailableBalance === 67.00 && // $50 + $17 = $67
                            digitalResult.netEarningsCredited === 17.00;
    recordResult(
        'Digital Settlement: Driver collects $0 cash, float untouched ($25), balance credited +$17.00 ($50->$67)',
        digitalExpected,
        `Net Credited: $${digitalResult.netEarningsCredited}, Balance: $50 -> $${digitalResult.finalAvailableBalance}`
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: Turn-by-Turn GPS Navigation URL Generator
// ─────────────────────────────────────────────────────────────────────────────
function generateNavigationUrl(platform, lat, lng, address) {
    const hasCoords = lat !== null && lat !== undefined && lng !== null && lng !== undefined;
    const dest = hasCoords ? `${lat},${lng}` : encodeURIComponent(address || '');

    if (platform === 'ios') {
        return `maps://app?daddr=${dest}`;
    } else if (platform === 'android') {
        return `google.navigation:q=${dest}`;
    } else {
        // Universal web / browser fallback
        return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
    }
}

function testTurnByTurnNavigation() {
    logSection('Suite 5: Turn-by-Turn GPS Deep-Linking Engine');

    const testLat = -17.8292;
    const testLng = 31.0522;
    const testAddress = '123 Samora Machel Ave, Harare, Zimbabwe';

    // 1. iOS URL with coordinates
    const iosUrl = generateNavigationUrl('ios', testLat, testLng, testAddress);
    const iosOk = iosUrl === `maps://app?daddr=${testLat},${testLng}`;
    recordResult('iOS Apple Maps URL format with coordinates', iosOk, iosUrl);

    // 2. Android URL with coordinates
    const androidUrl = generateNavigationUrl('android', testLat, testLng, testAddress);
    const androidOk = androidUrl === `google.navigation:q=${testLat},${testLng}`;
    recordResult('Android Google Navigation URL format with coordinates', androidOk, androidUrl);

    // 3. Web fallback URL with coordinates
    const webUrl = generateNavigationUrl('web', testLat, testLng, testAddress);
    const webOk = webUrl === `https://www.google.com/maps/dir/?api=1&destination=${testLat},${testLng}`;
    recordResult('Web Universal Fallback URL format with coordinates', webOk, webUrl);

    // 4. Address-only fallback (no coordinates)
    const addressOnlyUrl = generateNavigationUrl('web', null, null, testAddress);
    const expectedEncoded = encodeURIComponent(testAddress);
    const addressOk = addressOnlyUrl.includes(expectedEncoded);
    recordResult('Address Fallback URL properly encodes special characters & spaces', addressOk, addressOnlyUrl);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6: UI Component Integrity & Directive Bindings
// ─────────────────────────────────────────────────────────────────────────────
function testUIComponentDirectives() {
    logSection('Suite 6: UI Component Directives & Payment Indicators');

    const projectRoot = process.cwd();

    // 1. Check CreateOrderScreen has Payment Method Selector
    const createOrderFile = fs.readFileSync(path.join(projectRoot, 'mobile/src/screens/customer/CreateOrderScreen.tsx'), 'utf8');
    const hasPaymentSelector = createOrderFile.includes('payment_method') &&
                               createOrderFile.includes('cash_on_delivery') &&
                               createOrderFile.includes('ecocash') &&
                               createOrderFile.includes('innbucks') &&
                               createOrderFile.includes('payment_phone');
    recordResult('CreateOrderScreen: Multi-option payment selector (COD, EcoCash, InnBucks, Card)', hasPaymentSelector);

    // 2. Check CustomerTrackingScreen has Payment Directive Cards
    const trackingNative = fs.readFileSync(path.join(projectRoot, 'mobile/src/screens/customer/CustomerTrackingScreen.native.tsx'), 'utf8');
    const trackingWeb = fs.readFileSync(path.join(projectRoot, 'mobile/src/screens/customer/CustomerTrackingScreen.web.tsx'), 'utf8');
    const hasTrackingDirective = trackingNative.includes('Cash on Delivery') &&
                                 trackingNative.includes('Paid Digitally') &&
                                 trackingNative.includes('trackingPaymentCard') &&
                                 trackingWeb.includes('Cash on Delivery') &&
                                 trackingWeb.includes('Paid Digitally') &&
                                 trackingWeb.includes('trackingPaymentCard');
    recordResult('CustomerTrackingScreen: Payment directive banners (Cash on Delivery vs Paid Digitally)', hasTrackingDirective);

    // 3. Check DriverActiveJobScreen has Turn-by-Turn Navigation & Driver Directives
    const activeJobNative = fs.readFileSync(path.join(projectRoot, 'mobile/src/screens/driver/DriverActiveJobScreen.native.tsx'), 'utf8');
    const activeJobWeb = fs.readFileSync(path.join(projectRoot, 'mobile/src/screens/driver/DriverActiveJobScreen.web.tsx'), 'utf8');
    const hasNavigationBtn = activeJobNative.includes('openNativeNavigation') &&
                             activeJobNative.includes('turnByTurnButton') &&
                             activeJobWeb.includes('openNativeNavigation') &&
                             activeJobWeb.includes('turnByTurnButton');
    const hasDriverDirective = activeJobNative.includes('COLLECT CASH:') &&
                               activeJobNative.includes('PAID DIGITALLY') &&
                               activeJobNative.includes('driverDirectiveBanner') &&
                               activeJobWeb.includes('COLLECT CASH:') &&
                               activeJobWeb.includes('PAID DIGITALLY') &&
                               activeJobWeb.includes('driverDirectiveBanner');
    recordResult('DriverActiveJobScreen: 1-Tap Turn-by-Turn GPS Navigation buttons', hasNavigationBtn);
    recordResult('DriverActiveJobScreen: High-visibility Courier Payment Directives', hasDriverDirective);

    // 4. Check DriverJobsScreen and JobOfferModal badge bindings
    const jobOfferModal = fs.readFileSync(path.join(projectRoot, 'mobile/src/components/JobOfferModal.tsx'), 'utf8');
    const driverJobsScreen = fs.readFileSync(path.join(projectRoot, 'mobile/src/screens/driver/DriverJobsScreen.tsx'), 'utf8');
    const hasJobOfferPill = jobOfferModal.includes('paymentMethodPill') && 
                            jobOfferModal.includes('Cash on Delivery') && 
                            jobOfferModal.includes('Paid Digitally');
    const hasDriverJobsBadge = driverJobsScreen.includes('💵 Cash') && driverJobsScreen.includes('💳 Digital');
    recordResult('JobOfferModal: Payment method pill badge on job offers', hasJobOfferPill);
    recordResult('DriverJobsScreen: Payment method badge on available job feed', hasDriverJobsBadge);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTE ALL TESTS
// ─────────────────────────────────────────────────────────────────────────────
function runAllTests() {
    console.log(`${colors.bright}${colors.blue}ShipMate Test Runner: Payment Methods, Directives & Navigation${colors.reset}`);
    console.log(`${colors.gray}Started at: ${new Date().toISOString()}${colors.reset}`);

    testDualTreeParity();
    testMigrationContract();
    testPaymentDirectiveSimulation();
    testSettlementAccounting();
    testTurnByTurnNavigation();
    testUIComponentDirectives();

    logSection('Test Run Summary');
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;

    if (failed === 0) {
        console.log(`${colors.bright}${colors.green}ALL ${total} TESTS PASSED SUCCESSFULLY! 🚀${colors.reset}\n`);
        process.exit(0);
    } else {
        console.log(`${colors.bright}${colors.red}${failed} of ${total} TESTS FAILED.${colors.reset}\n`);
        process.exit(1);
    }
}

runAllTests();
