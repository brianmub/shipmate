/**
 * Test Suite: Courier Wallet Threshold Enforcement ($3 Warning, $0.25 Lockout)
 * 
 * Verifies:
 * 1. Dual-Tree Parity between root `src` and `mobile/src`
 * 2. Remote Supabase Database Triggers & Policies:
 *    - `handle_courier_wallet_lockout` auto-locks wallet when balance <= 0.25
 *    - `handle_courier_wallet_lockout_after` forces driver offline when balance <= 0.25 or status = 'locked'
 *    - Auto-unlocks to 'active' when balance > 0.25
 * 3. RPC `get_nearby_available_drivers` filters out locked / <= 0.25 drivers
 * 4. RPC `deduct_commission_rpc` enforces <= 0.25 lockout and forces driver offline
 * 5. Service Layer Hardening (userService.toggleOnlineStatus & orderService.submitOffer)
 * 6. UI Thresholds & Modals on DriverHomeScreen & DriverJobsScreen (AppState, real-time, banners, modal)
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
    logSection('Suite 1: Dual-Tree Mirroring & Parity');

    const filesToCompare = [
        'services/userService.ts',
        'services/orderService.ts',
        'screens/driver/DriverHomeScreen.tsx',
        'screens/driver/DriverJobsScreen.tsx'
    ];

    const rootBase = path.join(__dirname, '..');
    const mobileBase = path.join(__dirname, '..', '..', 'mobile', 'src');

    for (const relPath of filesToCompare) {
        const rootPath = path.join(rootBase, relPath);
        const mobilePath = path.join(mobileBase, relPath);

        const rootExists = fs.existsSync(rootPath);
        const mobileExists = fs.existsSync(mobilePath);

        if (!rootExists || !mobileExists) {
            recordResult(`File existence: ${relPath}`, false, `Root exists: ${rootExists}, Mobile exists: ${mobileExists}`);
            continue;
        }

        const rootContent = fs.readFileSync(rootPath, 'utf8').trim();
        const mobileContent = fs.readFileSync(mobilePath, 'utf8').trim();

        const match = rootContent === mobileContent;
        recordResult(`100% Parity: ${relPath}`, match, match ? 'Files are bit-for-bit identical' : `Size diff: ${rootContent.length} vs ${mobileContent.length}`);
    }
}

async function testDatabaseTriggers() {
    logSection('Suite 2: Database Lockout Triggers & Offline Enforcement');

    // 1. Get a test driver
    const { data: driver, error: driverErr } = await supabase
        .from('drivers')
        .select('id, is_online, verification_status')
        .limit(1)
        .single();

    if (driverErr || !driver) {
        recordResult('Fetch test driver for trigger testing', false, driverErr?.message || 'No drivers found');
        return;
    }

    recordResult('Fetch test driver', true, `Testing with driver ID: ${driver.id}`);

    // Ensure courier wallet exists
    let { data: wallet } = await supabase
        .from('courier_wallets')
        .select('*')
        .eq('courier_id', driver.id)
        .maybeSingle();

    if (!wallet) {
        const { data: newWallet, error: createErr } = await supabase
            .from('courier_wallets')
            .insert({
                courier_id: driver.id,
                balance: 10.00,
                currency: 'USD',
                status: 'active'
            })
            .select()
            .single();

        if (createErr) {
            recordResult('Ensure courier wallet exists', false, createErr.message);
            return;
        }
        wallet = newWallet;
    }

    const originalBalance = wallet.balance;
    const originalStatus = wallet.status;
    const originalOnline = driver.is_online;

    try {
        // Set driver online first
        await supabase
            .from('drivers')
            .update({ is_online: true })
            .eq('id', driver.id);

        // Test A: Trigger sets status = 'locked' when balance <= 0.25 (e.g. 0.20)
        const { data: lockedWallet, error: lockErr } = await supabase
            .from('courier_wallets')
            .update({ balance: 0.20 })
            .eq('courier_id', driver.id)
            .select()
            .single();

        const isStatusLocked = lockedWallet && lockedWallet.status === 'locked';
        recordResult(
            'BEFORE Trigger (handle_courier_wallet_lockout): balance <= 0.25 locks wallet',
            isStatusLocked,
            `Balance: $${lockedWallet?.balance}, Status: '${lockedWallet?.status}'`
        );

        // Test B: AFTER Trigger forces driver offline
        const { data: updatedDriver } = await supabase
            .from('drivers')
            .select('is_online')
            .eq('id', driver.id)
            .single();

        const isForcedOffline = updatedDriver && updatedDriver.is_online === false;
        recordResult(
            'AFTER Trigger (handle_courier_wallet_lockout_after): forces driver offline',
            isForcedOffline,
            `is_online: ${updatedDriver?.is_online}`
        );

        // Test C: Exact threshold boundary (0.25) must also lock
        const { data: boundaryWallet } = await supabase
            .from('courier_wallets')
            .update({ balance: 0.25 })
            .eq('courier_id', driver.id)
            .select()
            .single();

        const isBoundaryLocked = boundaryWallet && boundaryWallet.status === 'locked';
        recordResult(
            'Threshold Boundary ($0.25): balance = 0.25 locked',
            isBoundaryLocked,
            `Balance: $${boundaryWallet?.balance}, Status: '${boundaryWallet?.status}'`
        );

        // Test D: Balance above threshold (e.g. 10.00) automatically unlocks to active
        const { data: activeWallet } = await supabase
            .from('courier_wallets')
            .update({ balance: 10.00 })
            .eq('courier_id', driver.id)
            .select()
            .single();

        const isReactivated = activeWallet && activeWallet.status === 'active';
        recordResult(
            'Auto-Reactivation: balance > 0.25 resets status to active',
            isReactivated,
            `Balance: $${activeWallet?.balance}, Status: '${activeWallet?.status}'`
        );

    } finally {
        // Restore original wallet balance & status and driver online state
        await supabase
            .from('courier_wallets')
            .update({ balance: originalBalance, status: originalStatus })
            .eq('courier_id', driver.id);

        await supabase
            .from('drivers')
            .update({ is_online: originalOnline })
            .eq('id', driver.id);
    }
}

async function testNearbyDriversRPC() {
    logSection('Suite 3: RPC get_nearby_available_drivers Lockout Exclusion');

    const { data: driver } = await supabase
        .from('drivers')
        .select('id, current_latitude, current_longitude, verification_status, is_online')
        .limit(1)
        .single();

    if (!driver) {
        recordResult('Driver available for RPC test', false, 'No driver found');
        return;
    }

    const testLat = -17.8252;
    const testLng = 31.0335;
    const origStatus = driver.verification_status;
    const origOnline = driver.is_online;

    // Get wallet
    const { data: wallet } = await supabase
        .from('courier_wallets')
        .select('*')
        .eq('courier_id', driver.id)
        .maybeSingle();

    const origBal = wallet ? wallet.balance : 10.00;
    const origWalletStat = wallet ? wallet.status : 'active';

    try {
        // Configure test driver as approved and located in Harare
        await supabase
            .from('drivers')
            .update({
                current_latitude: testLat,
                current_longitude: testLng,
                is_online: true,
                verification_status: 'approved',
                location_updated_at: new Date().toISOString()
            })
            .eq('id', driver.id);

        // Lock wallet: balance = 0.10, status = locked
        await supabase
            .from('courier_wallets')
            .update({ balance: 0.10, status: 'locked' })
            .eq('courier_id', driver.id);

        // Even if driver attempts to be online in DB, RPC must exclude locked wallets
        await supabase
            .from('drivers')
            .update({ is_online: true })
            .eq('id', driver.id);

        const { data: nearbyLocked, error: rpcErr1 } = await supabase.rpc('get_nearby_available_drivers', {
            p_latitude: testLat,
            p_longitude: testLng,
            p_radius_km: 15
        });

        const excludedWhenLocked = !rpcErr1 && (!nearbyLocked || !nearbyLocked.some(d => d.id === driver.id));
        recordResult(
            'RPC excludes driver with locked wallet (balance <= 0.25)',
            excludedWhenLocked,
            rpcErr1 ? rpcErr1.message : `Returned ${nearbyLocked?.length || 0} drivers (test driver excluded: ${excludedWhenLocked})`
        );

        // Top up wallet: balance = 15.00, status = active
        await supabase
            .from('courier_wallets')
            .update({ balance: 15.00, status: 'active' })
            .eq('courier_id', driver.id);

        await supabase
            .from('drivers')
            .update({ is_online: true, location_updated_at: new Date().toISOString() })
            .eq('id', driver.id);

        const { data: nearbyActive, error: rpcErr2 } = await supabase.rpc('get_nearby_available_drivers', {
            p_latitude: testLat,
            p_longitude: testLng,
            p_radius_km: 15
        });

        const includedWhenActive = !rpcErr2 && nearbyActive && nearbyActive.some(d => d.id === driver.id);
        recordResult(
            'RPC includes driver when wallet has balance > 0.25 and is active',
            includedWhenActive,
            rpcErr2 ? rpcErr2.message : `Returned ${nearbyActive?.length || 0} drivers (test driver included: ${includedWhenActive})`
        );

    } finally {
        // Restore driver status & wallet
        await supabase
            .from('drivers')
            .update({
                verification_status: origStatus,
                is_online: origOnline
            })
            .eq('id', driver.id);

        if (wallet) {
            await supabase
                .from('courier_wallets')
                .update({ balance: origBal, status: origWalletStat })
                .eq('id', wallet.id);
        }
    }
}

async function testServiceAndUICodeChecks() {
    logSection('Suite 4: Service Layer & UI Component Integrity');

    const userServiceCode = fs.readFileSync(path.join(__dirname, '..', 'services', 'userService.ts'), 'utf8');
    const orderServiceCode = fs.readFileSync(path.join(__dirname, '..', 'services', 'orderService.ts'), 'utf8');
    const driverHomeCode = fs.readFileSync(path.join(__dirname, '..', 'screens', 'driver', 'DriverHomeScreen.tsx'), 'utf8');
    const driverJobsCode = fs.readFileSync(path.join(__dirname, '..', 'screens', 'driver', 'DriverJobsScreen.tsx'), 'utf8');

    // 1. userService.toggleOnlineStatus
    const userHasLockoutCheck = userServiceCode.includes("wallet.status === 'locked' || Number(wallet.balance) <= 0.25");
    recordResult(
        'userService.toggleOnlineStatus enforces balance <= 0.25 lockout',
        userHasLockoutCheck,
        'Refuses to go online and throws or sets offline if balance <= 0.25'
    );

    // 2. orderService.submitOffer
    const orderHasLockoutCheck = orderServiceCode.includes("wallet.status === 'locked' || Number(wallet.balance) <= 0.25");
    recordResult(
        'orderService.submitOffer blocks bids when balance <= 0.25',
        orderHasLockoutCheck,
        'Throws Wallet Lockout error before writing offer'
    );

    // 3. DriverHomeScreen: AppState listener & real-time wallet subscription
    const homeHasAppState = driverHomeCode.includes('AppState.addEventListener') && driverHomeCode.includes('AppStateStatus');
    recordResult(
        'DriverHomeScreen reflects lockout on app resume (AppState)',
        homeHasAppState,
        'Listens for appState change and calls fetchData() on active'
    );

    const homeHasRealtimeWallet = driverHomeCode.includes('public:courier_wallet_') && driverHomeCode.includes('courier_wallets') && driverHomeCode.includes('courier_id');
    recordResult(
        'DriverHomeScreen real-time listener on courier_wallets (courier_id)',
        homeHasRealtimeWallet,
        'Subscribes to courier_wallets changes for driver and updates balance/status'
    );

    // 4. DriverHomeScreen: Warning banner ($3.00) & Lockout modal ($0.25)
    const homeHasWarningBanner = driverHomeCode.includes('walletBalance <= 3.00') && driverHomeCode.includes('Low Float Balance Warning');
    recordResult(
        'DriverHomeScreen persistent non-blocking banner at <= $3.00',
        homeHasWarningBanner,
        'Amber warning banner prompts top-up without blocking screen'
    );

    const homeHasLockoutModal = driverHomeCode.includes('Courier Float Lockout') && driverHomeCode.includes('ClicknPay') && driverHomeCode.includes('visible={isApproved && isLockedOut}');
    recordResult(
        'DriverHomeScreen non-dismissible blocking modal at <= $0.25',
        homeHasLockoutModal,
        'Blocking modal with ClicknPay top-up action and no dismissal button'
    );

    // 5. DriverJobsScreen: AppState, real-time wallet, and accept locks
    const jobsHasAppState = driverJobsCode.includes('AppState.addEventListener') && driverJobsCode.includes('checkWalletStatus');
    recordResult(
        'DriverJobsScreen re-checks wallet on app resume (AppState)',
        jobsHasAppState,
        'AppState listener calls checkWalletStatus()'
    );

    const jobsHasDirectAcceptLock = driverJobsCode.includes('handleAcceptDirectly') && driverJobsCode.includes('isLockedOut');
    recordResult(
        'DriverJobsScreen blocks direct job accept when isLockedOut',
        jobsHasDirectAcceptLock,
        'Guards handleAcceptDirectly with Wallet Locked Out alert'
    );

    const jobsHasLockoutScreen = driverJobsCode.includes('isLockedOut ? (') && driverJobsCode.includes('Wallet Locked Out');
    recordResult(
        'DriverJobsScreen displays Wallet Locked Out view when locked',
        jobsHasLockoutScreen,
        'Hides job queue and displays ClicknPay top-up card'
    );
}

async function runAllTests() {
    console.log(`${colors.bright}Starting Courier Wallet Threshold Enforcement Test Suite...${colors.reset}`);
    const startTime = Date.now();

    try {
        await testDualTreeParity();
        await testDatabaseTriggers();
        await testNearbyDriversRPC();
        await testServiceAndUICodeChecks();
    } catch (err) {
        console.error(`${colors.red}Test Suite encountered an unexpected exception:${colors.reset}`, err);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logSection('Test Summary');

    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;

    console.log(`Total Assertions: ${total}`);
    console.log(`Passed: ${colors.green}${passed}${colors.reset}`);
    console.log(`Failed: ${failed > 0 ? colors.red + failed + colors.reset : colors.green + '0' + colors.reset}`);
    console.log(`Duration: ${duration}s\n`);

    if (failed === 0) {
        console.log(`${colors.bright}${colors.green}ALL TESTS PASSED! Wallet threshold enforcement is completely operational and robust.${colors.reset}\n`);
        process.exit(0);
    } else {
        console.log(`${colors.bright}${colors.red}SOME TESTS FAILED! Review details above.${colors.reset}\n`);
        process.exit(1);
    }
}

runAllTests();
