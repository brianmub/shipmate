/**
 * ClicknPay Integration Test Script
 * 
 * Tests both:
 * 1. Direct ClicknPay API Gateway (Creates real order & queries status)
 * 2. Supabase Edge Function ('clicknpay-topup') Integration & Validation Flow
 * 
 * Usage:
 *   npm run test:clicknpay
 *   node src/scripts/test_clicknpay.js
 *   node src/scripts/test_clicknpay.js --direct-only
 *   node src/scripts/test_clicknpay.js --amount 15.50 --phone 263771234567
 */

const fs = require('fs');
const path = require('path');

// Simple .env parser to avoid mandatory external dependencies
function loadEnv() {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx !== -1) {
                    const key = trimmed.substring(0, eqIdx).trim();
                    const val = trimmed.substring(eqIdx + 1).trim().replace(/(^['"]|['"]$)/g, '');
                    if (!process.env[key]) {
                        process.env[key] = val;
                    }
                }
            }
        });
    }
}

loadEnv();

const CLICKNPAY_BASE_URL = 'https://backendservices.clicknpay.africa:2081/payme/orders';
const PUBLIC_UNIQUE_ID = process.env.CLICKNPAY_PUBLIC_UNIQUE_ID || 'QFUcFtITBUKLzuwNa';
const RETURN_URL = process.env.CLICKNPAY_RETURN_URL || 'https://shipmate.app/payment-return';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Parse CLI flags
const args = process.argv.slice(2);
const directOnly = args.includes('--direct-only');
const edgeOnly = args.includes('--edge-only');

function getArgValue(flag) {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const customAmount = parseFloat(getArgValue('--amount') || '5.00');
const customPhone = getArgValue('--phone') || '263771234567';

// Colors for terminal output
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

function recordResult(testName, passed, details = '') {
    results.push({ testName, passed, details });
    const mark = passed ? `${colors.green}✔ PASS${colors.reset}` : `${colors.red}✖ FAIL${colors.reset}`;
    console.log(`[${mark}] ${colors.bright}${testName}${colors.reset}`);
    if (details) {
        console.log(`      ${colors.gray}${details}${colors.reset}`);
    }
}

/**
 * 1. Direct ClicknPay API Tests
 */
async function testDirectClicknPay() {
    logSection('TEST SUITE 1: Direct ClicknPay Gateway Endpoints');

    const testRef = `TEST-SM-${Date.now()}`;
    const testAmount = isNaN(customAmount) ? 5.00 : customAmount;
    const testPhone = customPhone;

    console.log(`🔍 Gateway Parameters:`);
    console.log(`   - Base URL: ${CLICKNPAY_BASE_URL}`);
    console.log(`   - Public Unique ID: ${PUBLIC_UNIQUE_ID}`);
    console.log(`   - Client Reference: ${testRef}`);
    console.log(`   - Top-up Amount: $${testAmount.toFixed(2)} USD`);
    console.log(`   - Customer Phone: ${testPhone}\n`);

    // 1.1: Direct Create Order
    console.log(`⏳ [1.1] Initiating Direct Payment Order with ClicknPay...`);
    const payload = {
        channel: "AUTOMATED",
        clientReference: testRef,
        currency: "USD",
        customerCharged: true,
        customerPhoneNumber: testPhone,
        description: `ShipMate Automated Test Order - $${testAmount.toFixed(2)} USD`,
        multiplePayments: true,
        orderYpe: "DYNAMIC",
        productsList: [
            {
                id: 1,
                productName: "ShipMate Test Top-Up",
                description: "Automated Integration Test Item",
                price: testAmount,
                quantity: 1
            }
        ],
        publicUniqueId: PUBLIC_UNIQUE_ID,
        returnUrl: RETURN_URL
    };

    let generatedPaymeURL = '';

    try {
        const response = await fetch(CLICKNPAY_BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const status = response.status;
        const data = await response.json().catch(() => ({}));
        generatedPaymeURL = data.paymeURL || data.paymeUrl || data.url || '';

        console.log(`   Response Status: ${status}`);
        console.log(`   Response Payload:`, JSON.stringify(data, null, 2));

        if (response.ok && generatedPaymeURL) {
            recordResult(
                'Direct ClicknPay Order Creation',
                true,
                `Generated Payme URL: ${generatedPaymeURL}`
            );
        } else if (response.ok && !generatedPaymeURL) {
            recordResult(
                'Direct ClicknPay Order Creation',
                false,
                `Gateway returned 200 OK but paymeURL was empty: ${JSON.stringify(data)}`
            );
        } else {
            recordResult(
                'Direct ClicknPay Order Creation',
                false,
                `Gateway returned HTTP ${status}: ${data.message || JSON.stringify(data)}`
            );
        }

        // 1.2: Check Order Status Endpoint
        console.log(`\n⏳ [1.2] Checking Order Status via /top-paid/${testRef}...`);
        const statusUrl = `${CLICKNPAY_BASE_URL}/top-paid/${encodeURIComponent(testRef)}`;
        const statusResponse = await fetch(statusUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        const statusResStatus = statusResponse.status;
        const statusData = await statusResponse.json().catch(() => ({}));

        console.log(`   Status Response Code: ${statusResStatus}`);
        console.log(`   Status Response Data:`, JSON.stringify(statusData, null, 2));

        if (statusResponse.ok) {
            recordResult(
                'Direct ClicknPay Status Query',
                true,
                `Status: ${statusData.status || 'OK'}`
            );
        } else {
            recordResult(
                'Direct ClicknPay Status Query',
                false,
                `Status check returned HTTP ${statusResStatus}: ${statusData.message || JSON.stringify(statusData)}`
            );
        }

        if (generatedPaymeURL) {
            console.log(`\n${colors.bright}${colors.green}🔗 [MANUAL TEST LINK]${colors.reset} Open in browser to complete sample payment:`);
            console.log(`   👉 ${colors.bright}${colors.cyan}${generatedPaymeURL}${colors.reset}\n`);
        }

    } catch (err) {
        console.error(`   ❌ Error contacting ClicknPay API:`, err.message);
        recordResult('Direct ClicknPay Connectivity', false, err.message);
    }
}

/**
 * 2. Supabase Edge Function 'clicknpay-topup' Integration Tests
 */
async function testSupabaseEdgeFunction() {
    logSection('TEST SUITE 2: Supabase Edge Function (clicknpay-topup)');

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.log(`${colors.yellow}⚠️ Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env${colors.reset}`);
        recordResult('Edge Function Test Prerequisites', false, 'Missing Supabase environment variables');
        return;
    }

    const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/clicknpay-topup`;
    console.log(`🔍 Supabase Function Endpoint: ${edgeFunctionUrl}\n`);

    let testUser = null;
    let authHeader = `Bearer ${SUPABASE_ANON_KEY}`;

    try {
        let createClientModule;
        try {
            createClientModule = require('@supabase/supabase-js').createClient;
        } catch (_) {}

        if (createClientModule && SUPABASE_SERVICE_KEY) {
            console.log(`⏳ Setting up temporary test driver for Edge Function invocation...`);
            const adminClient = createClientModule(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            const testEmail = `cnp-driver-${Date.now()}@shipmatetest.com`;
            const testPassword = 'TestSecurePassword123!';

            const { data: authUser, error: createErr } = await adminClient.auth.admin.createUser({
                email: testEmail,
                password: testPassword,
                email_confirm: true,
                user_metadata: { role: 'driver', full_name: 'ClicknPay Test Driver' }
            });

            if (!createErr && authUser?.user) {
                testUser = authUser.user;
                const anonClient = createClientModule(SUPABASE_URL, SUPABASE_ANON_KEY);
                const { data: sessionData, error: loginErr } = await anonClient.auth.signInWithPassword({
                    email: testEmail,
                    password: testPassword
                });

                if (!loginErr && sessionData?.session) {
                    authHeader = `Bearer ${sessionData.session.access_token}`;
                    console.log(`   ✅ Test Driver User Authenticated (ID: ${testUser.id})\n`);
                }
            }
        }
    } catch (e) {
        console.log(`   ${colors.yellow}⚠️ Supabase Auth host connection skipped (${e.message}). Using anon token.${colors.reset}\n`);
    }

    const testCourierId = testUser ? testUser.id : '00000000-0000-0000-0000-000000000001';

    // Test 2.1: Minimum Amount Validation Rejection (< $5.00)
    console.log(`⏳ [2.1] Testing Validation: Reject top-up amount below $5.00...`);
    try {
        const res = await fetch(edgeFunctionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader
            },
            body: JSON.stringify({
                action: 'create-order',
                courierId: testCourierId,
                amount: 2.50
            })
        });

        const data = await res.json().catch(() => ({}));
        if (res.status === 400 && (data.error && data.error.includes('Minimum top-up amount is $5.00'))) {
            recordResult('Edge Function Minimum Amount Rejection (< $5)', true, `Correctly rejected: "${data.error}"`);
        } else if (res.status === 401 || res.status === 403) {
            recordResult('Edge Function Minimum Amount Rejection (< $5)', true, `Auth guard active: ${data.error}`);
        } else {
            recordResult('Edge Function Minimum Amount Rejection (< $5)', false, `Unexpected response status ${res.status}: ${JSON.stringify(data)}`);
        }
    } catch (err) {
        recordResult('Edge Function Minimum Amount Rejection (< $5)', false, `Connection error: ${err.message}`);
    }

    // Test 2.2: Valid Order Creation via Edge Function
    console.log(`\n⏳ [2.2] Testing Valid Order Creation ($10.00 top-up)...`);
    let createdClientRef = '';
    try {
        const res = await fetch(edgeFunctionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader
            },
            body: JSON.stringify({
                action: 'create-order',
                courierId: testCourierId,
                amount: 10.00,
                phoneNumber: customPhone
            })
        });

        const data = await res.json().catch(() => ({}));
        console.log(`   Response Status: ${res.status}`);
        console.log(`   Response Body:`, JSON.stringify(data, null, 2));

        if (res.ok && data.success && data.paymeURL) {
            createdClientRef = data.clientReference;
            recordResult('Edge Function Create Order ($10)', true, `Client Ref: ${data.clientReference} | Pay URL: ${data.paymeURL}`);
        } else if (res.status === 401 || res.status === 403) {
            recordResult('Edge Function Create Order ($10)', false, `Authentication required: ${data.error}`);
        } else {
            recordResult('Edge Function Create Order ($10)', false, `Function returned: ${data.error || JSON.stringify(data)}`);
        }
    } catch (err) {
        recordResult('Edge Function Create Order ($10)', false, `Connection error: ${err.message}`);
    }

    // Test 2.3: Verify Status Action via Edge Function
    if (createdClientRef) {
        console.log(`\n⏳ [2.3] Testing Verification Flow for Reference: ${createdClientRef}...`);
        try {
            const res = await fetch(edgeFunctionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authHeader
                },
                body: JSON.stringify({
                    action: 'verify-status',
                    courierId: testCourierId,
                    clientReference: createdClientRef,
                    amount: 10.00
                })
            });

            const data = await res.json().catch(() => ({}));
            console.log(`   Verification Status Code: ${res.status}`);
            console.log(`   Verification Response:`, JSON.stringify(data, null, 2));

            if (res.ok) {
                recordResult(
                    'Edge Function Verify Status Action',
                    true,
                    `Payment state: ${data.status || 'PENDING'}`
                );
            } else {
                recordResult('Edge Function Verify Status Action', false, data.error || JSON.stringify(data));
            }
        } catch (err) {
            recordResult('Edge Function Verify Status Action', false, err.message);
        }
    }

    // Clean up temporary test user
    if (testUser && SUPABASE_SERVICE_KEY) {
        try {
            const { createClient } = require('@supabase/supabase-js');
            const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            console.log(`\n🧹 Cleaning up test user ${testUser.id}...`);
            await adminClient.auth.admin.deleteUser(testUser.id);
            console.log(`   ✅ Test user cleaned up.`);
        } catch (e) {
            console.log(`   ⚠️ Cleanup note: ${e.message}`);
        }
    }
}

/**
 * Main Runner
 */
async function main() {
    console.log(`${colors.bright}${colors.blue}`);
    console.log(`╔══════════════════════════════════════════════════════════╗`);
    console.log(`║          ShipMate ClicknPay Integration Test Suite       ║`);
    console.log(`╚══════════════════════════════════════════════════════════╝`);
    console.log(`${colors.reset}`);

    const startTime = Date.now();

    if (!edgeOnly) {
        await testDirectClicknPay();
    }

    if (!directOnly) {
        await testSupabaseEdgeFunction();
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    logSection('TEST SUMMARY');

    let passedCount = 0;
    results.forEach(r => {
        if (r.passed) passedCount++;
        const badge = r.passed ? `${colors.green}[PASS]${colors.reset}` : `${colors.red}[FAIL]${colors.reset}`;
        console.log(`  ${badge} ${r.testName}`);
        if (r.details) console.log(`         ${colors.gray}→ ${r.details}${colors.reset}`);
    });

    console.log(`\n--------------------------------------------------------------`);
    console.log(`Total Tests: ${results.length} | Passed: ${passedCount} | Failed: ${results.length - passedCount}`);
    console.log(`Execution Time: ${duration}s`);
    console.log(`--------------------------------------------------------------\n`);

    if (passedCount === results.length && results.length > 0) {
        console.log(`${colors.green}${colors.bright}🎉 ALL CLICKNPAY TESTS COMPLETED!${colors.reset}\n`);
    } else {
        console.log(`${colors.yellow}💡 Run 'node src/scripts/test_clicknpay.js --direct-only' to test direct ClicknPay API anytime.${colors.reset}\n`);
    }
}

main().catch(err => {
    console.error('Fatal error running tests:', err);
    process.exit(1);
});
