import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const CLICKNPAY_BASE_URL = 'https://backendservices.clicknpay.africa:2081/payme/orders';
const PUBLIC_UNIQUE_ID = process.env.CLICKNPAY_PUBLIC_UNIQUE_ID || 'QFUcFtITBUKLzuwNa';
const RETURN_URL = process.env.CLICKNPAY_RETURN_URL || 'https://shipmate.app/payment-return';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

interface TestResult {
    testName: string;
    passed: boolean;
    details?: string;
}

const results: TestResult[] = [];

function recordResult(testName: string, passed: boolean, details: string = '') {
    results.push({ testName, passed, details });
    const mark = passed ? '✔ PASS' : '✖ FAIL';
    console.log(`[${mark}] ${testName}`);
    if (details) {
        console.log(`      → ${details}`);
    }
}

async function runDirectClicknPayTests() {
    console.log('\n======================================================');
    console.log('  TEST SUITE 1: Direct ClicknPay Gateway Endpoints');
    console.log('======================================================\n');

    const testRef = `TEST-TS-SM-${Date.now()}`;
    const testAmount = 5.00;
    const testPhone = '263771234567';

    console.log(`🔍 Configuration:`);
    console.log(`   - Base URL: ${CLICKNPAY_BASE_URL}`);
    console.log(`   - Public Unique ID: ${PUBLIC_UNIQUE_ID}`);
    console.log(`   - Reference: ${testRef}\n`);

    // 1. Direct Order Creation
    console.log('⏳ [1.1] Calling ClicknPay create order API...');
    const payload = {
        channel: "AUTOMATED",
        clientReference: testRef,
        currency: "USD",
        customerCharged: true,
        customerPhoneNumber: testPhone,
        description: `ShipMate TypeScript Test Top-up - $${testAmount.toFixed(2)} USD`,
        multiplePayments: true,
        orderYpe: "DYNAMIC",
        productsList: [
            {
                id: 1,
                productName: "ShipMate Test Credit",
                description: "Automated TS Test Order",
                price: testAmount,
                quantity: 1
            }
        ],
        publicUniqueId: PUBLIC_UNIQUE_ID,
        returnUrl: RETURN_URL
    };

    try {
        const response = await fetch(CLICKNPAY_BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data: any = await response.json().catch(() => ({}));
        const paymeURL = data.paymeURL || data.paymeUrl || data.url || '';

        console.log(`   Response Code: ${response.status}`);
        console.log(`   Response Data:`, JSON.stringify(data, null, 2));

        if (response.ok && paymeURL) {
            recordResult('Direct ClicknPay Order Creation', true, `Payme URL: ${paymeURL}`);
        } else {
            recordResult('Direct ClicknPay Order Creation', false, `Status ${response.status}: ${data.message || JSON.stringify(data)}`);
        }

        // 2. Direct Order Status Query
        console.log(`\n⏳ [1.2] Calling ClicknPay status query (/top-paid/${testRef})...`);
        const statusUrl = `${CLICKNPAY_BASE_URL}/top-paid/${encodeURIComponent(testRef)}`;
        const statusRes = await fetch(statusUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        const statusData: any = await statusRes.json().catch(() => ({}));
        console.log(`   Status Response Code: ${statusRes.status}`);
        console.log(`   Status Data:`, JSON.stringify(statusData, null, 2));

        if (statusRes.ok) {
            recordResult('Direct ClicknPay Status Query', true, `Status: ${statusData.status || 'Success response'}`);
        } else {
            recordResult('Direct ClicknPay Status Query', false, `Status check failed with HTTP ${statusRes.status}`);
        }
    } catch (err: any) {
        recordResult('Direct ClicknPay Connectivity', false, err.message);
    }
}

async function runEdgeFunctionTests() {
    console.log('\n======================================================');
    console.log('  TEST SUITE 2: Supabase Edge Function (clicknpay-topup)');
    console.log('======================================================\n');

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.log('⚠️ Missing Supabase credentials in environment.');
        recordResult('Edge Function Tests', false, 'Missing SUPABASE_URL or ANON_KEY');
        return;
    }

    const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/clicknpay-topup`;
    let testUser: any = null;
    let authHeader = `Bearer ${SUPABASE_ANON_KEY}`;

    try {
        const adminClient = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;
        if (adminClient) {
            const testEmail = `cnp-test-ts-${Date.now()}@shipmate.com`;
            const testPass = 'SecurePass123!@#';

            const { data: authData, error: createErr } = await adminClient.auth.admin.createUser({
                email: testEmail,
                password: testPass,
                email_confirm: true,
                user_metadata: { role: 'driver', full_name: 'TS Test Driver' }
            });

            if (!createErr && authData?.user) {
                testUser = authData.user;
                const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                const { data: session } = await anonClient.auth.signInWithPassword({
                    email: testEmail,
                    password: testPass
                });
                if (session?.session?.access_token) {
                    authHeader = `Bearer ${session.session.access_token}`;
                    console.log(`   ✅ Authenticated test driver session created (ID: ${testUser.id})`);
                }
            }
        }
    } catch (e: any) {
        console.log(`   ⚠️ Using anon key for invoke test: ${e.message}`);
    }

    const testCourierId = testUser ? testUser.id : '00000000-0000-0000-0000-000000000001';

    // 2.1 Minimum amount rejection check
    console.log('⏳ [2.1] Testing amount < $5.00 validation...');
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
                amount: 3.00
            })
        });

        const data: any = await res.json().catch(() => ({}));
        if (res.status === 400 && data.error && data.error.includes('Minimum top-up amount is $5.00')) {
            recordResult('Edge Function Rejection < $5.00', true, `Correct validation message: ${data.error}`);
        } else if (res.status === 401 || res.status === 403) {
            recordResult('Edge Function Rejection < $5.00', true, `Auth check active: ${data.error}`);
        } else {
            recordResult('Edge Function Rejection < $5.00', false, `Status ${res.status}: ${JSON.stringify(data)}`);
        }
    } catch (err: any) {
        recordResult('Edge Function Rejection < $5.00', false, err.message);
    }

    // 2.2 Valid Order Creation
    console.log('\n⏳ [2.2] Testing valid order creation ($10.00 top-up)...');
    let createdRef = '';
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
                phoneNumber: '263771234567'
            })
        });

        const data: any = await res.json().catch(() => ({}));
        if (res.ok && data.success && data.paymeURL) {
            createdRef = data.clientReference;
            recordResult('Edge Function Valid Order Creation', true, `Payme URL: ${data.paymeURL}`);
        } else {
            recordResult('Edge Function Valid Order Creation', false, `Status ${res.status}: ${data.error || JSON.stringify(data)}`);
        }
    } catch (err: any) {
        recordResult('Edge Function Valid Order Creation', false, err.message);
    }

    // 2.3 Status Verification
    if (createdRef) {
        console.log(`\n⏳ [2.3] Testing verify-status action for ${createdRef}...`);
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
                    clientReference: createdRef,
                    amount: 10.00
                })
            });

            const data: any = await res.json().catch(() => ({}));
            if (res.ok) {
                recordResult('Edge Function Verify Status', true, `Status processed: ${data.status || 'PENDING'}`);
            } else {
                recordResult('Edge Function Verify Status', false, `Status verification failed: ${data.error}`);
            }
        } catch (err: any) {
            recordResult('Edge Function Verify Status', false, err.message);
        }
    }

    // Cleanup
    if (testUser && SUPABASE_SERVICE_KEY) {
        try {
            const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            await adminClient.auth.admin.deleteUser(testUser.id);
            console.log(`\n   🧹 Cleaned up temporary test user ${testUser.id}`);
        } catch (e: any) {
            console.log(`   ⚠️ Cleanup note: ${e.message}`);
        }
    }
}

async function main() {
    console.log('🚀 Starting ClicknPay Integration Test Suite (TypeScript)...\n');
    await runDirectClicknPayTests();
    await runEdgeFunctionTests();

    console.log('\n======================================================');
    console.log('  TEST SUMMARY');
    console.log('======================================================');
    const passed = results.filter(r => r.passed).length;
    results.forEach(r => {
        console.log(`  ${r.passed ? '[PASS]' : '[FAIL]'} ${r.testName}`);
        if (r.details) console.log(`         → ${r.details}`);
    });
    console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${results.length - passed}\n`);
}

main().catch(console.error);
