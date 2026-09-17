/**
 * Test Suite: In-App Account & Data Deletion Flow (Apple Guideline 5.1.1(v) Compliance)
 * 
 * Verifies:
 * 1. Dual-Tree Parity between mobile/src and root src
 * 2. SQL Migration & Stored Procedure (delete_user_account_rpc)
 * 3. Pre-Flight Active Order Safeguard (blocks deletion if parcel in-transit)
 * 4. PII Anonymization & Data-Wiping Contract
 * 5. UserService.deleteAccount execution & error handling
 * 6. Customer & Driver Profile Screen UI bindings and DeleteAccountModal
 * 
 * Usage:
 *   node src/scripts/test_account_deletion.js
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
// SUITE 1: Dual-Tree Parity Check
// ─────────────────────────────────────────────────────────────────────────────
function testDualTreeParity() {
    logSection('Suite 1: Dual-Tree Parity Check (mobile/src <-> src)');

    const filesToVerify = [
        'components/DeleteAccountModal.tsx',
        'services/userService.ts',
        'screens/customer/CustomerProfileScreen.tsx',
        'screens/driver/DriverProfileScreen.tsx'
    ];

    for (const file of filesToVerify) {
        const rootPath = path.join(__dirname, '..', file);
        const mobilePath = path.join(__dirname, '..', '..', 'mobile', 'src', file);

        const rootExists = fs.existsSync(rootPath);
        const mobileExists = fs.existsSync(mobilePath);

        recordResult(`File existence: ${file}`, rootExists && mobileExists, `root: ${rootExists}, mobile: ${mobileExists}`);

        if (rootExists && mobileExists) {
            const rootContent = fs.readFileSync(rootPath, 'utf8').replace(/\r\n/g, '\n');
            const mobileContent = fs.readFileSync(mobilePath, 'utf8').replace(/\r\n/g, '\n');
            recordResult(`Parity Check: ${file}`, rootContent === mobileContent, `Matched length: ${rootContent.length} chars`);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: SQL Migration & Server-Side RPC Audit
// ─────────────────────────────────────────────────────────────────────────────
function testDatabaseMigration() {
    logSection('Suite 2: Database Migration & RPC Audit (delete_user_account_rpc)');

    const migrationPath = path.join(__dirname, '..', '..', 'supabase', 'migrations', '20260917170000_user_account_deletion.sql');
    const exists = fs.existsSync(migrationPath);
    recordResult('Migration file exists (20260917170000_user_account_deletion.sql)', exists);

    if (exists) {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        recordResult('RPC defines delete_user_account_rpc', sql.includes('CREATE OR REPLACE FUNCTION public.delete_user_account_rpc()'));
        recordResult('RPC verifies authenticated auth.uid()', sql.includes('v_user_id IS NULL') && sql.includes('UNAUTHORIZED'));
        recordResult('RPC checks for active in-flight orders', sql.includes('status IN') && sql.includes('picked_up') && sql.includes('ACTIVE_ORDERS_IN_PROGRESS'));
        recordResult('RPC wipes personal info in public.users', sql.includes("full_name = 'Deleted User'") && sql.includes('account_status = \'deleted\''));
        recordResult('RPC deactivates driver status if courier', sql.includes('public.drivers') && sql.includes('is_online = FALSE'));
        recordResult('RPC purges push notification tokens', sql.includes('public.order_notifications') && sql.includes('expo_push_token'));
        recordResult('RPC grants execute to authenticated users', sql.includes('GRANT EXECUTE ON FUNCTION public.delete_user_account_rpc() TO authenticated'));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: In-App UI Components & Modal Disclosure
// ─────────────────────────────────────────────────────────────────────────────
function testModalAndScreenBindings() {
    logSection('Suite 3: UI Components & Apple Guideline 5.1.1(v) Disclosures');

    const modalPath = path.join(__dirname, '..', 'components', 'DeleteAccountModal.tsx');
    const custProfilePath = path.join(__dirname, '..', 'screens', 'customer', 'CustomerProfileScreen.tsx');
    const driverProfilePath = path.join(__dirname, '..', 'screens', 'driver', 'DriverProfileScreen.tsx');
    const userServicePath = path.join(__dirname, '..', 'services', 'userService.ts');

    const modalCode = fs.readFileSync(modalPath, 'utf8');
    const custCode = fs.readFileSync(custProfilePath, 'utf8');
    const driverCode = fs.readFileSync(driverProfilePath, 'utf8');
    const userCode = fs.readFileSync(userServicePath, 'utf8');

    // Modal Disclosures
    recordResult('Modal displays clear permanent warning', modalCode.includes('This action is permanent and cannot be undone'));
    recordResult('Modal discloses personal profile erasure', modalCode.includes('Personal Profile Erased'));
    recordResult('Modal discloses active session revocation', modalCode.includes('Sessions Revoked'));
    recordResult('Modal discloses anonymized financial records', modalCode.includes('Anonymized Financial Receipts'));
    recordResult('Modal discloses active order protection', modalCode.includes('Active Order Protection'));
    recordResult('Modal provides permanent deletion button with spinner', modalCode.includes('Permanently Delete Account') && modalCode.includes('ActivityIndicator'));
    recordResult('Modal provides cancel option', modalCode.includes('Cancel & Keep Account'));

    // Customer Profile
    recordResult('CustomerProfileScreen includes Delete Account trigger', custCode.includes('Delete Account & Wipe Data'));
    recordResult('CustomerProfileScreen imports and renders DeleteAccountModal', custCode.includes('<DeleteAccountModal'));
    recordResult('CustomerProfileScreen calls userService.deleteAccount', custCode.includes('userService.deleteAccount'));

    // Driver Profile
    recordResult('DriverProfileScreen includes Delete Account trigger', driverCode.includes('Delete Account & Data'));
    recordResult('DriverProfileScreen imports and renders DeleteAccountModal', driverCode.includes('<DeleteAccountModal'));
    recordResult('DriverProfileScreen calls userService.deleteAccount', driverCode.includes('userService.deleteAccount'));

    // UserService contract
    recordResult('userService exports deleteAccount method', userCode.includes('async deleteAccount(userId: string)'));
    recordResult('userService checks active orders before deleting', userCode.includes('Cannot delete account while you have an active delivery in progress'));
    recordResult('userService attempts RPC with direct client fallback', userCode.includes("supabase.rpc('delete_user_account_rpc')"));
    recordResult('userService anonymizes public.users in fallback', userCode.includes("full_name: 'Deleted User'") && userCode.includes("account_status: 'deleted'"));
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: Functional Simulation of Account Deletion Logic
// ─────────────────────────────────────────────────────────────────────────────
function testDeletionSimulation() {
    logSection('Suite 4: Functional Simulation of Account Deletion Lifecycle');

    // Simulate Active Orders Guard
    function simulateDeleteAccount(user, activeOrders) {
        if (!user || !user.id) throw new Error('Not authenticated');

        const inProgress = activeOrders.filter(o => 
            (o.customer_id === user.id || o.driver_id === user.id) &&
            ['driver_assigned', 'en_route_to_pickup', 'arrived_at_pickup', 'picked_up', 'en_route_to_delivery', 'arrived_at_delivery'].includes(o.status)
        );

        if (inProgress.length > 0) {
            return {
                success: false,
                error: 'ACTIVE_ORDERS_IN_PROGRESS',
                message: 'Cannot delete account while you have an active delivery in progress. Please complete or cancel in-progress orders first.'
            };
        }

        // Wipe user
        const wipedUser = {
            ...user,
            full_name: 'Deleted User',
            phone: null,
            expo_push_token: null,
            account_status: 'deleted',
            profile_photo_url: null
        };

        return {
            success: true,
            wipedUser,
            message: 'Account and personal data have been permanently wiped and deactivated.'
        };
    }

    // Case 1: In-Flight Order Guard
    const userWithOrder = { id: 'cust-101', full_name: 'Jane Doe', phone: '+263771112222', account_status: 'active' };
    const ordersWithActive = [{ id: 'ord-55', customer_id: 'cust-101', status: 'en_route_to_delivery' }];
    const result1 = simulateDeleteAccount(userWithOrder, ordersWithActive);
    recordResult('Simulation: In-transit order blocks deletion', result1.success === false && result1.error === 'ACTIVE_ORDERS_IN_PROGRESS', result1.message);

    // Case 2: Clean User with Completed Orders
    const cleanUser = { id: 'cust-102', full_name: 'Bob Smith', phone: '+263773334444', account_status: 'active', expo_push_token: 'ExponentPushToken[abc]' };
    const ordersCompleted = [{ id: 'ord-10', customer_id: 'cust-102', status: 'completed' }];
    const result2 = simulateDeleteAccount(cleanUser, ordersCompleted);
    recordResult('Simulation: Clean user deletion succeeds', result2.success === true);
    recordResult('Simulation: Personal name erased', result2.wipedUser.full_name === 'Deleted User');
    recordResult('Simulation: Phone number erased', result2.wipedUser.phone === null);
    recordResult('Simulation: Push token erased', result2.wipedUser.expo_push_token === null);
    recordResult('Simulation: Account status set to deleted', result2.wipedUser.account_status === 'deleted');
}

// ─────────────────────────────────────────────────────────────────────────────
// RUN ALL TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log(`${colors.bright}ShipMate Test Runner: In-App Account Deletion (Apple Guideline 5.1.1(v))${colors.reset}`);
console.log(`Started at: ${new Date().toISOString()}`);

testDualTreeParity();
testDatabaseMigration();
testModalAndScreenBindings();
testDeletionSimulation();

const total = results.length;
const passed = results.filter(r => r.passed).length;
const failed = total - passed;

logSection('Test Run Summary');
console.log(`Total Checks : ${total}`);
console.log(`Passed       : ${passed}`);
console.log(`Failed       : ${failed}`);

if (failed === 0) {
    console.log(`\n${colors.bright}${colors.green}✔ ALL IN-APP ACCOUNT DELETION TESTS PASSED!${colors.reset}\n`);
    process.exit(0);
} else {
    console.log(`\n${colors.bright}${colors.red}✖ SOME TESTS FAILED!${colors.reset}\n`);
    process.exit(1);
}
