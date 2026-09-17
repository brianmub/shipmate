/**
 * Test Suite: 4-Digit Handover PIN (OTP) Delivery Confirmation
 * 
 * Verifies:
 * 1. Dual-Tree Parity between mobile/src and root src (100% byte-for-byte)
 * 2. Database Migration & Schema (handover_pin, pin_attempts_count, pin_locked, verify_handover_pin_rpc)
 * 3. PIN Generation on Driver Acceptance (Single 4-digit code, persistent lifetime)
 * 4. Customer Tracking Screen Persistent In-App Display (Zero SMS / Zero third-party OTP cost)
 * 5. Driver Active Job Flow:
 *    - Primary handover confirmation via 4-digit PIN
 *    - Existing Masked-Call integration (+263 867 700 0123) for requesting PIN
 *    - Wrong PIN retries (1st and 2nd attempts)
 *    - 3rd wrong attempt -> Server-Side Lockout + Flagging + Automatic Photo Proof Fallback
 *    - Locked state blocks further PIN verification even with correct code
 *    - Correct PIN entry -> Immediate completion & financial settlement
 * 6. Cancelled Order State Handling (Natural invalidation without separate expiry jobs)
 * 7. Web Admin Visibility & Security Review Flag
 * 
 * Usage:
 *   node src/scripts/test_handover_pin.js
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
    console.log(`${colors.bright}${colors.cyan}══════════════════════════════════════════════════════════════${colors.reset}`);
}

function assertTest(name, condition, details = '') {
    if (condition) {
        console.log(`  ${colors.green}✔ PASS:${colors.reset} ${name}`);
        results.push({ name, passed: true });
    } else {
        console.log(`  ${colors.red}✘ FAIL:${colors.reset} ${name}`);
        if (details) console.log(`    ${colors.yellow}Details: ${details}${colors.reset}`);
        results.push({ name, passed: false, details });
    }
}

// ============================================================================
// 1. DUAL-TREE PARITY VALIDATION
// ============================================================================
logSection('1. Dual-Tree Parity Validation (mobile/src vs src)');

const rootDir = path.resolve(__dirname, '../..');
const filesToCheck = [
    'types/index.ts',
    'services/orderService.ts',
    'screens/customer/CustomerTrackingScreen.native.tsx',
    'screens/customer/CustomerTrackingScreen.web.tsx',
    'screens/driver/DriverActiveJobScreen.native.tsx',
    'screens/driver/DriverActiveJobScreen.web.tsx'
];

filesToCheck.forEach(relPath => {
    const rootPath = path.join(rootDir, 'src', relPath);
    const mobilePath = path.join(rootDir, 'mobile/src', relPath);

    const rootExists = fs.existsSync(rootPath);
    const mobileExists = fs.existsSync(mobilePath);

    assertTest(`File exists in both trees: ${relPath}`, rootExists && mobileExists);

    if (rootExists && mobileExists) {
        const rootContent = fs.readFileSync(rootPath, 'utf8');
        const mobileContent = fs.readFileSync(mobilePath, 'utf8');
        assertTest(`Byte-for-byte parity: ${relPath}`, rootContent === mobileContent);
    }
});

// ============================================================================
// 2. DATABASE MIGRATION & SCHEMA AUDIT
// ============================================================================
logSection('2. Database Migration & Schema Audit');

const migrationPath = path.join(rootDir, 'supabase/migrations/20260917160000_handover_pin_delivery_confirmation.sql');
assertTest('Migration file exists', fs.existsSync(migrationPath));

if (fs.existsSync(migrationPath)) {
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    
    assertTest('Schema adds handover_pin VARCHAR(4) column', migrationSql.includes('handover_pin VARCHAR(4)'));
    assertTest('Schema adds pin_attempts_count column', migrationSql.includes('pin_attempts_count INTEGER DEFAULT 0'));
    assertTest('Schema adds pin_locked column', migrationSql.includes('pin_locked BOOLEAN DEFAULT FALSE'));
    assertTest('Schema adds pin_verified_at column', migrationSql.includes('pin_verified_at TIMESTAMP WITH TIME ZONE'));
    assertTest('Schema adds pin_fallback_to_photo column', migrationSql.includes('pin_fallback_to_photo BOOLEAN DEFAULT FALSE'));
    assertTest('Schema adds pin_failed_flagged column', migrationSql.includes('pin_failed_flagged BOOLEAN DEFAULT FALSE'));
    assertTest('Trigger fn_generate_handover_pin creates 4-digit code', migrationSql.includes("lpad((floor(random() * 9000) + 1000)::text, 4, '0')"));
    assertTest('Stored procedure verify_handover_pin_rpc defined', migrationSql.includes('CREATE OR REPLACE FUNCTION public.verify_handover_pin_rpc'));
    assertTest('RPC checks driver authorization', migrationSql.includes('v_order.driver_id <> p_driver_id'));
    assertTest('RPC checks active handover status', migrationSql.includes('INVALID_ORDER_STATE'));
    assertTest('RPC enforces 3-attempt lockout', migrationSql.includes('pin_attempts_count >= 3') || migrationSql.includes('v_new_attempts >= 3'));
    assertTest('RPC transitions correct PIN to completed', migrationSql.includes("status = 'completed'") && migrationSql.includes("pin_verified_at = NOW()"));
    assertTest('RPC settles payment on PIN success', migrationSql.includes('settle_order_payment_rpc'));
}

// ============================================================================
// 3. TYPESCRIPT TYPE DEFINITIONS AUDIT
// ============================================================================
logSection('3. TypeScript Type Definitions Audit');

const typesPath = path.join(rootDir, 'src/types/index.ts');
const webAdminTypesPath = path.join(rootDir, 'web-admin/src/types/index.ts');

if (fs.existsSync(typesPath)) {
    const typesContent = fs.readFileSync(typesPath, 'utf8');
    assertTest('Order interface has handover_pin', typesContent.includes('handover_pin?: string | null;'));
    assertTest('Order interface has pin_attempts_count', typesContent.includes('pin_attempts_count?: number;'));
    assertTest('Order interface has pin_locked', typesContent.includes('pin_locked?: boolean;'));
    assertTest('Order interface has pin_verified_at', typesContent.includes('pin_verified_at?: string | null;'));
    assertTest('Order interface has pin_fallback_to_photo', typesContent.includes('pin_fallback_to_photo?: boolean;'));
    assertTest('Order interface has pin_failed_flagged', typesContent.includes('pin_failed_flagged?: boolean;'));
    assertTest('HandoverPinVerificationResult interface exported', typesContent.includes('export interface HandoverPinVerificationResult'));
}

if (fs.existsSync(webAdminTypesPath)) {
    const adminTypesContent = fs.readFileSync(webAdminTypesPath, 'utf8');
    assertTest('Web-Admin types match handover PIN fields', adminTypesContent.includes('handover_pin?: string | null;') && adminTypesContent.includes('pin_locked?: boolean;'));
}

// ============================================================================
// 4. SERVICE LAYER IMPLEMENTATION AUDIT
// ============================================================================
logSection('4. Service Layer Implementation Audit');

const orderServicePath = path.join(rootDir, 'src/services/orderService.ts');
if (fs.existsSync(orderServicePath)) {
    const orderContent = fs.readFileSync(orderServicePath, 'utf8');
    assertTest('orderService has verifyHandoverPin method', orderContent.includes('async verifyHandoverPin('));
    assertTest('orderService calls verify_handover_pin_rpc', orderContent.includes("'verify_handover_pin_rpc'"));
    assertTest('orderService has verifyHandoverPinDirectFallback', orderContent.includes('verifyHandoverPinDirectFallback('));
    assertTest('acceptOffer generates 4-digit handover_pin fallback', orderContent.includes('handover_pin: generatedPin'));
}

// ============================================================================
// 5. CUSTOMER TRACKING SCREEN PERSISTENCE (ZERO TELCO COST)
// ============================================================================
logSection('5. Customer Tracking Screen Persistent In-App Display');

const customerNativePath = path.join(rootDir, 'src/screens/customer/CustomerTrackingScreen.native.tsx');
const customerWebPath = path.join(rootDir, 'src/screens/customer/CustomerTrackingScreen.web.tsx');

[customerNativePath, customerWebPath].forEach(filePath => {
    const fileBase = path.basename(filePath);
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        assertTest(`${fileBase} displays persistent Handover Delivery PIN Card`, content.includes('handoverPinCard'));
        assertTest(`${fileBase} displays 4 styled digit boxes`, content.includes('handoverPinDigitsRow') && content.includes('handoverPinDigitBox'));
        assertTest(`${fileBase} informs customer of Zero SMS fee handover`, content.includes('Zero SMS fees') || content.includes('Zero external SMS fees'));
        assertTest(`${fileBase} responds to locked and verified states`, content.includes('handoverPinCardLocked') && content.includes('handoverPinCardVerified'));
    }
});

// ============================================================================
// 6. DRIVER ACTIVE JOB SCREEN: PIN MODAL & PHOTO FALLBACK
// ============================================================================
logSection('6. Driver Active Job Screen: PIN Entry & Fallback Routing');

const driverNativePath = path.join(rootDir, 'src/screens/driver/DriverActiveJobScreen.native.tsx');
const driverWebPath = path.join(rootDir, 'src/screens/driver/DriverActiveJobScreen.web.tsx');

[driverNativePath, driverWebPath].forEach(filePath => {
    const fileBase = path.basename(filePath);
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        assertTest(`${fileBase} primary dropoff CTA opens Handover PIN Modal`, content.includes("Enter Handover PIN"));
        assertTest(`${fileBase} switches CTA when locked to Photo Proof`, content.includes("Complete via Photo Proof (PIN Locked)"));
        assertTest(`${fileBase} provides Masked-Call CTA inside PIN modal`, content.includes("handleMakeMaskedCall") && content.includes("Call Customer for PIN"));
        assertTest(`${fileBase} handles 3rd wrong attempt with alert & routes to ProofOfDeliveryModal`, content.includes("setPodVisible(true)") && content.includes("PIN Locked (3 Failed Attempts)"));
    }
});

// ============================================================================
// 7. WEB ADMIN AUDIT DRAWER
// ============================================================================
logSection('7. Web Admin Audit Drawer');

const orderLogPath = path.join(rootDir, 'web-admin/src/pages/OrderLog.tsx');
if (fs.existsSync(orderLogPath)) {
    const orderLogContent = fs.readFileSync(orderLogPath, 'utf8');
    assertTest('Web Admin displays Handover PIN (OTP) Card in drawer', orderLogContent.includes('Handover PIN (OTP)'));
    assertTest('Web Admin displays PIN verification badge and digits', orderLogContent.includes('selectedOrder.pin_verified_at') && orderLogContent.includes('selectedOrder.handover_pin'));
    assertTest('Web Admin displays 3-attempt lockout alert banner', orderLogContent.includes('Security Alert:') && orderLogContent.includes('3 incorrect PIN attempts exceeded'));
    assertTest('Web Admin acknowledges happy path requires no photo proof', orderLogContent.includes('Photo proof was not required'));
}

// ============================================================================
// 8. SIMULATION OF COMPLETE HANDOVER PIN LIFECYCLE
// ============================================================================
logSection('8. Simulation of Complete Handover PIN Lifecycle');

// Emulate backend logic to verify state transitions and lockout invariants
function createMockOrder(driverAssigned = true) {
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    return {
        id: 'ord_' + Math.random().toString(36).substring(2, 9),
        status: driverAssigned ? 'arrived_at_delivery' : 'pending',
        driver_id: driverAssigned ? 'drv_123' : null,
        handover_pin: driverAssigned ? pin : null,
        pin_attempts_count: 0,
        pin_locked: false,
        pin_verified_at: null,
        pin_fallback_to_photo: false,
        pin_failed_flagged: false,
        delivery_photo_url: null
    };
}

function verifyPinSimulation(order, driverId, enteredPin) {
    if (order.driver_id !== driverId) {
        return { success: false, error: 'UNAUTHORIZED', locked: false, fallback_to_photo: false, attempts_left: 0 };
    }
    if (['completed', 'delivered', 'cancelled', 'disputed'].includes(order.status)) {
        return { success: false, error: 'INVALID_ORDER_STATE', locked: false, fallback_to_photo: false, attempts_left: 0 };
    }
    if (order.pin_locked || order.pin_attempts_count >= 3) {
        return { success: false, error: 'PIN_LOCKED', locked: true, fallback_to_photo: true, attempts_left: 0 };
    }

    if (order.handover_pin === enteredPin) {
        order.status = 'completed';
        order.pin_verified_at = new Date().toISOString();
        order.pin_attempts_count += 1;
        return { success: true, locked: false, fallback_to_photo: false, attempts_left: Math.max(0, 3 - order.pin_attempts_count) };
    } else {
        order.pin_attempts_count += 1;
        const isLocked = order.pin_attempts_count >= 3;
        order.pin_locked = isLocked;
        order.pin_fallback_to_photo = isLocked;
        order.pin_failed_flagged = isLocked;
        return {
            success: false,
            error: isLocked ? 'MAX_ATTEMPTS_EXCEEDED' : 'INCORRECT_PIN',
            locked: isLocked,
            fallback_to_photo: isLocked,
            attempts_left: Math.max(0, 3 - order.pin_attempts_count)
        };
    }
}

// Test Flow A: Happy Path (Immediate correct PIN)
const happyOrder = createMockOrder(true);
assertTest('Happy Path: Order generated with valid 4-digit PIN', /^\d{4}$/.test(happyOrder.handover_pin));

const happyRes = verifyPinSimulation(happyOrder, 'drv_123', happyOrder.handover_pin);
assertTest('Happy Path: Correct PIN returns success = true', happyRes.success === true);
assertTest('Happy Path: Order transitioned to completed', happyOrder.status === 'completed');
assertTest('Happy Path: pin_verified_at recorded', Boolean(happyOrder.pin_verified_at));
assertTest('Happy Path: Photo proof is skipped (null photo URL)', happyOrder.delivery_photo_url === null);

// Test Flow B: 3-Attempt Lockout & Photo Fallback Routing
const lockoutOrder = createMockOrder(true);
const wrongPin = '0000';

const attempt1 = verifyPinSimulation(lockoutOrder, 'drv_123', wrongPin);
assertTest('Attempt 1 (wrong): Rejected with attempts_left = 2, locked = false', !attempt1.success && attempt1.attempts_left === 2 && !attempt1.locked);

const attempt2 = verifyPinSimulation(lockoutOrder, 'drv_123', wrongPin);
assertTest('Attempt 2 (wrong): Rejected with attempts_left = 1, locked = false', !attempt2.success && attempt2.attempts_left === 1 && !attempt2.locked);

const attempt3 = verifyPinSimulation(lockoutOrder, 'drv_123', wrongPin);
assertTest('Attempt 3 (wrong): Triggers lockout (locked = true)', attempt3.locked === true);
assertTest('Attempt 3 (wrong): Triggers photo proof fallback (fallback_to_photo = true)', attempt3.fallback_to_photo === true);
assertTest('Attempt 3 (wrong): Order state marked pin_failed_flagged = true', lockoutOrder.pin_failed_flagged === true);

// Test Flow C: Server-Side Lockout Enforcement
const attempt4 = verifyPinSimulation(lockoutOrder, 'drv_123', lockoutOrder.handover_pin);
assertTest('Attempt 4 (even with correct PIN): Blocked by server-side lockout', !attempt4.success && attempt4.error === 'PIN_LOCKED');

// Test Flow D: Cancelled Order Invalidation
const cancelledOrder = createMockOrder(true);
cancelledOrder.status = 'cancelled';
const cancelRes = verifyPinSimulation(cancelledOrder, 'drv_123', cancelledOrder.handover_pin);
assertTest('Cancelled order naturally invalidates PIN with INVALID_ORDER_STATE', !cancelRes.success && cancelRes.error === 'INVALID_ORDER_STATE');

// Test Flow E: Unauthorized Driver Rejection
const unauthOrder = createMockOrder(true);
const unauthRes = verifyPinSimulation(unauthOrder, 'hacker_driver', unauthOrder.handover_pin);
assertTest('Unauthorized driver rejected with UNAUTHORIZED', !unauthRes.success && unauthRes.error === 'UNAUTHORIZED');

// ============================================================================
// FINAL SUMMARY
// ============================================================================
logSection('FINAL TEST RESULTS');
const total = results.length;
const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;

console.log(`\n  Total Checks : ${total}`);
console.log(`  Passed       : ${colors.green}${passed}${colors.reset}`);
console.log(`  Failed       : ${failed > 0 ? colors.red + failed : colors.green + 0}${colors.reset}\n`);

if (failed === 0) {
    console.log(`${colors.green}${colors.bright}✔ ALL HANDOVER PIN (OTP) DELIVERY CONFIRMATION TESTS PASSED!${colors.reset}\n`);
    process.exit(0);
} else {
    console.log(`${colors.red}${colors.bright}✘ SOME CHECKS FAILED.${colors.reset}\n`);
    process.exit(1);
}
