/**
 * Test Suite: Customer Live Tracking Map Lock & In-Map Overlays
 * 
 * Verifies:
 * 1. orderService.getActiveCustomerOrder queries all active statuses.
 * 2. RootNavigator.tsx locks customer onto live tracking map on launch & background resume.
 * 3. In-app message & call notification deep links route to CustomerTracking with overlay params.
 * 4. CustomerHomeScreen.tsx auto-redirects on focus and renders active trip banner.
 * 5. CustomerTrackingScreen (.native & .web) intercepts beforeRemove and BackHandler during active trips.
 * 6. In-App Chat, In-App Call, Arrival Banners, and OTP PIN render as persistent overlays over live map.
 * 7. OrderHistoryScreen.tsx "View Details" bug fix and active order live tracking navigation.
 * 8. 100% dual-tree parity between src/ and mobile/src/.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passedTests = 0;
let totalTests = 0;

function test(description, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`  ✅ PASS: ${description}`);
    } catch (err) {
        console.error(`  ❌ FAIL: ${description}`);
        console.error(`     Error: ${err.message}`);
    }
}

console.log('🧪 Starting Customer Live Tracking Map Lock Test Suite...\n');

const ROOT_DIR = path.resolve(__dirname, '../..');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const MOBILE_SRC_DIR = path.join(ROOT_DIR, 'mobile', 'src');

// -------------------------------------------------------------
// Group 1: orderService.getActiveCustomerOrder
// -------------------------------------------------------------
console.log('📦 Group 1: orderService.getActiveCustomerOrder query');

test('orderService has getActiveCustomerOrder querying active statuses in src/', () => {
    const content = fs.readFileSync(path.join(SRC_DIR, 'services', 'orderService.ts'), 'utf8');
    assert.ok(content.includes('getActiveCustomerOrder(customerId: string)'), 'Should define getActiveCustomerOrder');
    assert.ok(content.includes("'driver_assigned'"), 'Should check driver_assigned');
    assert.ok(content.includes("'en_route_to_pickup'"), 'Should check en_route_to_pickup');
    assert.ok(content.includes("'arrived_at_pickup'"), 'Should check arrived_at_pickup');
    assert.ok(content.includes("'picked_up'"), 'Should check picked_up');
    assert.ok(content.includes("'en_route_to_delivery'"), 'Should check en_route_to_delivery');
    assert.ok(content.includes("'arrived_at_delivery'"), 'Should check arrived_at_delivery');
    assert.ok(content.includes("'in_progress'"), 'Should check in_progress');
});

test('orderService has getActiveCustomerOrder in mobile/src/', () => {
    const content = fs.readFileSync(path.join(MOBILE_SRC_DIR, 'services', 'orderService.ts'), 'utf8');
    assert.ok(content.includes('getActiveCustomerOrder(customerId: string)'), 'Should define getActiveCustomerOrder in mobile');
    assert.ok(content.includes("'driver_assigned'"), 'Should check driver_assigned in mobile');
});

// -------------------------------------------------------------
// Group 2: RootNavigator Customer Lock & Overlay Deep Linking
// -------------------------------------------------------------
console.log('\n🧭 Group 2: RootNavigator Customer Lock & Deep Linking');

test('RootNavigator checks active customer trip on initial launch in src/', () => {
    const content = fs.readFileSync(path.join(SRC_DIR, 'navigation', 'RootNavigator.tsx'), 'utf8');
    assert.ok(content.includes('orderService.getActiveCustomerOrder'), 'Should call getActiveCustomerOrder');
    assert.ok(content.includes("role === 'customer'"), 'Should check customer role');
    assert.ok(content.includes("screen: 'CustomerTracking'"), 'Should navigate to CustomerTracking');
});

test('RootNavigator checks active customer trip on AppState resume in src/', () => {
    const content = fs.readFileSync(path.join(SRC_DIR, 'navigation', 'RootNavigator.tsx'), 'utf8');
    assert.ok(content.includes("nextState === 'active'"), 'Should listen for active state');
    assert.ok(content.includes("currentRoute !== 'CustomerTracking'"), 'Should check if already on CustomerTracking');
    assert.ok(content.includes("params: { orderId: activeOrder.id }"), 'Should pass orderId');
});

test('RootNavigator routes in-app message notifications to CustomerTracking with openChat: true in src/', () => {
    const content = fs.readFileSync(path.join(SRC_DIR, 'navigation', 'RootNavigator.tsx'), 'utf8');
    // Notification listener
    assert.ok(content.includes("data.type === 'in_app_message'"), 'Should handle in_app_message');
    assert.ok(content.includes("screen: 'CustomerTracking'"), 'Should route customer to CustomerTracking');
    assert.ok(content.includes("openChat: true"), 'Should pass openChat: true');
    // Banner tap handler
    assert.ok(content.includes("handleBannerOpenMessage"), 'Should have handleBannerOpenMessage');
});

// -------------------------------------------------------------
// Group 3: CustomerHomeScreen Active Trip Detection & Banner
// -------------------------------------------------------------
console.log('\n🏠 Group 3: CustomerHomeScreen Active Trip Detection & Banner');

test('CustomerHomeScreen uses useFocusEffect to check active trip on focus in src/', () => {
    const content = fs.readFileSync(path.join(SRC_DIR, 'screens', 'customer', 'CustomerHomeScreen.tsx'), 'utf8');
    assert.ok(content.includes('useFocusEffect'), 'Should import useFocusEffect');
    assert.ok(content.includes('orderService.getActiveCustomerOrder'), 'Should check active trip');
    assert.ok(content.includes("navigation.navigate('CustomerTracking', { orderId: active.id })"), 'Should auto-navigate to tracking');
});

test('CustomerHomeScreen renders persistent active trip banner with CTA in src/', () => {
    const content = fs.readFileSync(path.join(SRC_DIR, 'screens', 'customer', 'CustomerHomeScreen.tsx'), 'utf8');
    assert.ok(content.includes('activeTripBannerContainer'), 'Should render active trip banner container');
    assert.ok(content.includes('TRIP IN PROGRESS'), 'Should show TRIP IN PROGRESS badge');
    assert.ok(content.includes('Return to Live Tracking Map'), 'Should show Return to Live Tracking Map CTA');
});

// -------------------------------------------------------------
// Group 4: CustomerTrackingScreen (.native & .web) Lock & Overlays
// -------------------------------------------------------------
console.log('\n🗺️ Group 4: CustomerTrackingScreen Lock & Overlays');

test('CustomerTrackingScreen.native defines ACTIVE_TRIP_STATUSES and locks navigation with beforeRemove', () => {
    const content = fs.readFileSync(path.join(SRC_DIR, 'screens', 'customer', 'CustomerTrackingScreen.native.tsx'), 'utf8');
    assert.ok(content.includes('export const ACTIVE_TRIP_STATUSES = ['), 'Should export ACTIVE_TRIP_STATUSES');
    assert.ok(content.includes("navigation.addListener('beforeRemove'"), 'Should attach beforeRemove listener');
    assert.ok(content.includes('e.preventDefault()'), 'Should prevent leaving tracking map mid-trip');
    assert.ok(content.includes('BackHandler.addEventListener'), 'Should intercept Android hardware back press');
});

test('CustomerTrackingScreen.native renders locked TRIP ACTIVE badge in header overlay', () => {
    const content = fs.readFileSync(path.join(SRC_DIR, 'screens', 'customer', 'CustomerTrackingScreen.native.tsx'), 'utf8');
    assert.ok(content.includes('activeTripLockedBadge'), 'Should have activeTripLockedBadge style');
    assert.ok(content.includes('TRIP ACTIVE'), 'Should display TRIP ACTIVE text');
    assert.ok(content.includes('livePulseDot'), 'Should render livePulseDot');
});

test('CustomerTrackingScreen.native integrates InAppChatModal overlay instead of full-screen Chat', () => {
    const content = fs.readFileSync(path.join(SRC_DIR, 'screens', 'customer', 'CustomerTrackingScreen.native.tsx'), 'utf8');
    assert.ok(content.includes("import { InAppChatModal } from '../../components/InAppChatModal'"), 'Should import InAppChatModal');
    assert.ok(content.includes('setInAppChatVisible(true)'), 'Chat button should toggle inAppChatVisible');
    assert.ok(content.includes('<InAppChatModal'), 'Should render InAppChatModal');
    assert.ok(!content.includes("navigation.navigate('Chat'"), 'Should not navigate away to separate Chat screen');
});

test('CustomerTrackingScreen.native displays pickup & gate milestone arrival banners', () => {
    const content = fs.readFileSync(path.join(SRC_DIR, 'screens', 'customer', 'CustomerTrackingScreen.native.tsx'), 'utf8');
    assert.ok(content.includes("order.status === 'arrived_at_pickup'"), 'Should handle arrived_at_pickup banner');
    assert.ok(content.includes('Your Mate Has Arrived at Pickup!'), 'Should show pickup arrival title');
    assert.ok(content.includes("order.status === 'arrived_at_delivery'"), 'Should handle arrived_at_delivery banner');
    assert.ok(content.includes('Your Mate is Outside at the Gate!'), 'Should show gate arrival title');
});

test('CustomerTrackingScreen.native displays handover PIN prominently', () => {
    const content = fs.readFileSync(path.join(SRC_DIR, 'screens', 'customer', 'CustomerTrackingScreen.native.tsx'), 'utf8');
    assert.ok(content.includes('handoverPinCard'), 'Should have handoverPinCard');
    assert.ok(content.includes('Delivery Handover PIN'), 'Should show Delivery Handover PIN');
    assert.ok(content.includes('handoverPinDigitsRow'), 'Should render 4-digit display');
});

test('CustomerTrackingScreen.web has trip lock, InAppChatModal, and milestone banners', () => {
    const content = fs.readFileSync(path.join(SRC_DIR, 'screens', 'customer', 'CustomerTrackingScreen.web.tsx'), 'utf8');
    assert.ok(content.includes('ACTIVE_TRIP_STATUSES'), 'Should have ACTIVE_TRIP_STATUSES');
    assert.ok(content.includes("navigation.addListener('beforeRemove'"), 'Should have beforeRemove listener');
    assert.ok(content.includes('InAppChatModal'), 'Should have InAppChatModal');
    assert.ok(content.includes("order.status === 'arrived_at_pickup'"), 'Should have pickup arrival banner');
});

// -------------------------------------------------------------
// Group 5: InAppChatModal Component
// -------------------------------------------------------------
console.log('\n💬 Group 5: InAppChatModal Component');

test('InAppChatModal component exists in src/components/', () => {
    const filePath = path.join(SRC_DIR, 'components', 'InAppChatModal.tsx');
    assert.ok(fs.existsSync(filePath), 'InAppChatModal.tsx should exist in src/');
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(content.includes('export const InAppChatModal'), 'Should export InAppChatModal');
    assert.ok(content.includes('chatService.getMessages'), 'Should fetch messages');
    assert.ok(content.includes('chatService.subscribeToChat'), 'Should subscribe to real-time chat');
    assert.ok(content.includes('quickReplies'), 'Should provide quick delivery replies');
    assert.ok(content.includes('onOpenCall'), 'Should allow opening call from chat');
});

// -------------------------------------------------------------
// Group 6: OrderHistoryScreen "View Details" Fix & Live Tracking
// -------------------------------------------------------------
console.log('\n📜 Group 6: OrderHistoryScreen "View Details" Fix & Live Tracking');

test('OrderHistoryScreen handles all active trip statuses and routes to CustomerTracking', () => {
    const content = fs.readFileSync(path.join(SRC_DIR, 'screens', 'customer', 'OrderHistoryScreen.tsx'), 'utf8');
    assert.ok(content.includes('ACTIVE_TRIP_STATUSES'), 'Should define ACTIVE_TRIP_STATUSES');
    assert.ok(content.includes("'driver_assigned'"), 'Should include driver_assigned');
    assert.ok(content.includes("'en_route_to_pickup'"), 'Should include en_route_to_pickup');
    assert.ok(content.includes("'arrived_at_pickup'"), 'Should include arrived_at_pickup');
    assert.ok(content.includes("navigation.navigate('CustomerTracking', { orderId: item.id })"), 'Active orders should navigate to CustomerTracking');
    assert.ok(content.includes('Track Live Order'), 'Should show Track Live Order text');
});

test('OrderHistoryScreen fixes View Details button with interactive modal', () => {
    const content = fs.readFileSync(path.join(SRC_DIR, 'screens', 'customer', 'OrderHistoryScreen.tsx'), 'utf8');
    assert.ok(content.includes('onPress={() => setSelectedOrder(item)}'), 'View Details must have onPress handler');
    assert.ok(content.includes('selectedOrder !== null'), 'Should render modal when selectedOrder is set');
    assert.ok(content.includes('Route Details'), 'Should display route details in modal');
    assert.ok(content.includes('Payment & Fare'), 'Should display payment & fare breakdown');
    assert.ok(content.includes('Handover PIN'), 'Should display handover PIN if available');
});

// -------------------------------------------------------------
// Group 7: 100% Dual-Tree Parity
// -------------------------------------------------------------
console.log('\n🔄 Group 7: 100% Dual-Tree Parity (src/ vs mobile/src/)');

const parityFiles = [
    'services/orderService.ts',
    'navigation/RootNavigator.tsx',
    'components/InAppChatModal.tsx',
    'screens/customer/CustomerHomeScreen.tsx',
    'screens/customer/CustomerTrackingScreen.native.tsx',
    'screens/customer/CustomerTrackingScreen.web.tsx',
    'screens/customer/OrderHistoryScreen.tsx'
];

parityFiles.forEach((file) => {
    test(`Dual-tree byte parity: ${file}`, () => {
        const srcPath = path.join(SRC_DIR, file);
        const mobPath = path.join(MOBILE_SRC_DIR, file);
        assert.ok(fs.existsSync(srcPath), `${srcPath} must exist`);
        assert.ok(fs.existsSync(mobPath), `${mobPath} must exist`);
        const srcBuf = fs.readFileSync(srcPath);
        const mobBuf = fs.readFileSync(mobPath);
        assert.strictEqual(
            srcBuf.toString('utf8').replace(/\r\n/g, '\n'),
            mobBuf.toString('utf8').replace(/\r\n/g, '\n'),
            `${file} must have 100% identical contents between src/ and mobile/src/`
        );
    });
});

console.log(`\n========================================`);
console.log(`Test Results: ${passedTests}/${totalTests} passed`);
console.log(`========================================\n`);

if (passedTests !== totalTests) {
    process.exit(1);
} else {
    process.exit(0);
}
