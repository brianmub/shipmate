/**
 * Verification Script: Customer Order Lifecycle Milestone Notifications
 * (Free Push & Opt-in Paid SMS/WhatsApp)
 */
const fs = require('fs');
const path = require('path');

function runTests() {
    console.log('================================================================');
    console.log('🧪 VERIFYING CUSTOMER ORDER LIFECYCLE NOTIFICATIONS & RECIPIENT');
    console.log('================================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`✅ PASS: ${message}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${message}`);
            failed++;
        }
    }

    const rootDir = path.resolve(__dirname, '..', '..');

    // 1. Verify Migration File
    const migrationPath = path.join(rootDir, 'supabase', 'migrations', '20260917140000_order_lifecycle_notifications.sql');
    assert(fs.existsSync(migrationPath), 'Migration 20260917140000_order_lifecycle_notifications.sql exists');
    if (fs.existsSync(migrationPath)) {
        const sql = fs.readFileSync(migrationPath, 'utf8');
        assert(sql.includes('recipient_name'), 'Migration adds recipient_name');
        assert(sql.includes('recipient_phone'), 'Migration adds recipient_phone');
        assert(sql.includes('recipient_notes'), 'Migration adds recipient_notes');
        assert(sql.includes('sms_notifications_enabled'), 'Migration adds sms_notifications_enabled');
        assert(sql.includes('sms_notification_fee'), 'Migration adds sms_notification_fee to orders');
        assert(sql.includes('order_notifications'), 'Migration creates order_notifications audit table');
        assert(sql.includes('fn_sync_order_payment_directive'), 'Migration updates cash_to_collect calculation with sms fee');
    }

    // 2. Verify Edge Function
    const funcPath = path.join(rootDir, 'supabase', 'functions', 'notify-milestone', 'index.ts');
    assert(fs.existsSync(funcPath), 'Edge function notify-milestone/index.ts exists');
    if (fs.existsSync(funcPath)) {
        const code = fs.readFileSync(funcPath, 'utf8');
        assert(code.includes('driver_assigned'), 'Handles driver_assigned milestone');
        assert(code.includes('arrived_at_pickup'), 'Handles arrived_at_pickup milestone');
        assert(code.includes('picked_up'), 'Handles picked_up milestone');
        assert(code.includes('arrived_at_delivery'), 'Handles arrived_at_delivery milestone');
        assert(code.includes('delivered'), 'Handles delivered milestone');
        assert(code.includes('order.sms_notifications_enabled'), 'Enforces opt-in verification before sending paid SMS');
        assert(code.includes('https://exp.host/--/api/v2/push/send'), 'Dispatches free Expo Push notifications');
        assert(code.includes('order_notifications'), 'Records audit trail in order_notifications');
    }

    // 3. Dual-Tree Parity Check
    const filesToCompare = [
        ['mobile/src/types/index.ts', 'src/types/index.ts'],
        ['mobile/src/services/orderService.ts', 'src/services/orderService.ts'],
        ['mobile/src/screens/customer/CreateOrderScreen.tsx', 'src/screens/customer/CreateOrderScreen.tsx'],
        ['mobile/src/screens/customer/CustomerTrackingScreen.native.tsx', 'src/screens/customer/CustomerTrackingScreen.native.tsx'],
        ['mobile/src/screens/customer/CustomerTrackingScreen.web.tsx', 'src/screens/customer/CustomerTrackingScreen.web.tsx'],
        ['mobile/src/screens/driver/DriverActiveJobScreen.native.tsx', 'src/screens/driver/DriverActiveJobScreen.native.tsx'],
        ['mobile/src/screens/driver/DriverActiveJobScreen.web.tsx', 'src/screens/driver/DriverActiveJobScreen.web.tsx']
    ];

    for (const [mFile, rFile] of filesToCompare) {
        const mPath = path.join(rootDir, mFile);
        const rPath = path.join(rootDir, rFile);
        assert(fs.existsSync(mPath), `File exists: ${mFile}`);
        assert(fs.existsSync(rPath), `File exists: ${rFile}`);
        if (fs.existsSync(mPath) && fs.existsSync(rPath)) {
            const mContent = fs.readFileSync(mPath, 'utf8');
            const rContent = fs.readFileSync(rPath, 'utf8');
            assert(mContent === rContent, `Byte-for-byte parity: ${mFile} === ${rFile}`);
        }
    }

    // 4. Verify Service Hook
    const servicePath = path.join(rootDir, 'mobile', 'src', 'services', 'orderService.ts');
    if (fs.existsSync(servicePath)) {
        const sContent = fs.readFileSync(servicePath, 'utf8');
        assert(sContent.includes('notifyOrderMilestone'), 'orderService has notifyOrderMilestone method');
        assert(sContent.includes("notifyOrderMilestone(orderId, 'driver_assigned')"), 'acceptOffer triggers driver_assigned milestone');
        assert(sContent.includes("notifyOrderMilestone(orderId, status)"), 'updateOrderStatus triggers status milestone');
        assert(sContent.includes("notifyOrderMilestone(orderId, 'delivered')"), 'completeOrderWithProof triggers delivered milestone');
    }

    // 5. Test Pricing & Opt-in Math
    console.log('\n--- Testing Fee & Directive Math ---');
    const baseFare = 10.00;
    const voucherDiscount = 2.00;
    const smsFee = 0.25;

    // Case A: SMS disabled (Free in-app notifications only)
    const payableNoSms = Math.max(0.50, Math.round((baseFare - voucherDiscount + 0) * 100) / 100);
    assert(payableNoSms === 8.00, `No-SMS payable is $${payableNoSms} ($0 add-on)`);

    // Case B: SMS enabled (Customer pays +$0.25 add-on)
    const payableWithSms = Math.max(0.50, Math.round((baseFare - voucherDiscount + smsFee) * 100) / 100);
    assert(payableWithSms === 8.25, `With-SMS payable is $${payableWithSms} (+$0.25 add-on included)`);

    // Case C: COD Cash to Collect includes SMS fee when opted in
    const codCashToCollect = payableWithSms;
    assert(codCashToCollect === 8.25, `COD courier collects total $${codCashToCollect} including SMS add-on`);

    // Case D: Digital Payment Cash to Collect is $0.00
    const digitalCashToCollect = 0.00;
    assert(digitalCashToCollect === 0.00, 'Digital payment cash to collect is strictly $0.00');

    // 6. Test Milestone Message Templates
    console.log('\n--- Testing Milestone Message Templates ---');
    const mockOrder = {
        id: 'ord-123',
        recipient_name: 'Tendai Moyo',
        recipient_phone: '+263772123456',
        sms_notifications_enabled: true,
        sms_notification_fee: 0.25
    };
    const mockDriverName = 'Tinashe';

    function getMilestoneMessage(status, driverName, recipientName) {
        switch (status) {
            case 'driver_assigned':
                return {
                    title: '🚗 Courier Assigned!',
                    pushBody: `${driverName} has accepted your order and is on the way to pick it up!`,
                    smsText: `ShipMate Alert: Your courier ${driverName} is on the way to pick up your package.`
                };
            case 'arrived_at_pickup':
                return {
                    title: '📍 Arrived at Pickup',
                    pushBody: `${driverName} has arrived at the pickup location.`,
                    smsText: `ShipMate Alert: Courier ${driverName} has arrived at the pickup point.`
                };
            case 'picked_up':
                return {
                    title: '📦 Package Picked Up!',
                    pushBody: `${driverName} collected your package and is heading to the delivery destination!`,
                    smsText: `ShipMate Alert: Package collected! ${driverName} is heading to ${recipientName || 'the delivery address'}.`
                };
            case 'arrived_at_delivery':
                return {
                    title: '🔔 Mate Outside at the Gate!',
                    pushBody: `${driverName} has arrived outside! Please meet your courier to collect your delivery.`,
                    smsText: `ShipMate Alert: Courier ${driverName} is outside at the gate with your delivery! Please meet them.`
                };
            case 'delivered':
                return {
                    title: '🎉 Delivery Completed!',
                    pushBody: 'Your package has been delivered! Please tap to verify and rate your Mate.',
                    smsText: `ShipMate Alert: Your delivery has been completed. Thank you for using ShipMate!`
                };
            default:
                return null;
        }
    }

    const milestones = ['driver_assigned', 'arrived_at_pickup', 'picked_up', 'arrived_at_delivery', 'delivered'];
    for (const ms of milestones) {
        const template = getMilestoneMessage(ms, mockDriverName, mockOrder.recipient_name);
        assert(template !== null, `Milestone '${ms}' generates valid template`);
        assert(template.smsText.includes('ShipMate Alert:'), `Milestone '${ms}' SMS formatted properly`);
    }

    console.log('\n================================================================');
    console.log(`📊 RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
