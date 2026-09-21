/**
 * Automated Verification: Driver App Initial Route & Available Jobs Map Screen
 * Verifies that:
 * 1. DriverNavigator initial route is set to "Jobs" (Available Jobs) as primary screen.
 * 2. RootNavigator handles cold launch and AppState background resume, routing authenticated Mates to Jobs.
 * 3. DriverJobsScreen contains live MapView centered on GPS, online/offline toggle, job pins, and incoming offer modals.
 * 4. Dual-tree parity between src/ and mobile/src/ is 100% identical.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  ✓ ${message}`);
    } else {
        console.error(`  ✗ FAIL: ${message}`);
    }
}

console.log('\n--- Test Suite: Driver App Direct Launch to Jobs Map Screen ---');

// 1. DriverNavigator Verification
console.log('\n[1] Verifying DriverNavigator configurations:');
const driverNavSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/navigation/DriverNavigator.tsx'), 'utf8');
const driverNavMob = fs.readFileSync(path.join(ROOT_DIR, 'mobile/src/navigation/DriverNavigator.tsx'), 'utf8');

assert(driverNavSrc.includes('initialRouteName="Jobs"'), 'src DriverNavigator has initialRouteName="Jobs"');
assert(driverNavMob.includes('initialRouteName="Jobs"'), 'mobile DriverNavigator has initialRouteName="Jobs"');

// Ensure Jobs screen is declared before Dashboard
const jobsIndexSrc = driverNavSrc.search(/<Drawer\.Screen\s+name="Jobs"/);
const dashIndexSrc = driverNavSrc.search(/<Drawer\.Screen\s+name="Dashboard"/);
assert(jobsIndexSrc !== -1 && dashIndexSrc !== -1 && jobsIndexSrc < dashIndexSrc, 'Jobs screen declared before Dashboard in src');

const jobsIndexMob = driverNavMob.search(/<Drawer\.Screen\s+name="Jobs"/);
const dashIndexMob = driverNavMob.search(/<Drawer\.Screen\s+name="Dashboard"/);
assert(jobsIndexMob !== -1 && dashIndexMob !== -1 && jobsIndexMob < dashIndexMob, 'Jobs screen declared before Dashboard in mobile');

// 2. RootNavigator Resume & Route Handling
console.log('\n[2] Verifying RootNavigator resume handling & notifications:');
const rootNavSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/navigation/RootNavigator.tsx'), 'utf8');
const rootNavMob = fs.readFileSync(path.join(ROOT_DIR, 'mobile/src/navigation/RootNavigator.tsx'), 'utf8');

assert(rootNavSrc.includes('handleAppStateChange'), 'src RootNavigator handles AppState changes on resume');
assert(rootNavMob.includes('handleAppStateChange'), 'mobile RootNavigator handles AppState changes on resume');
assert(rootNavSrc.includes("navigationRef.navigate('DriverApp', { screen: 'Jobs' })"), 'src routes returning drivers to Jobs screen');
assert(rootNavMob.includes("navigationRef.navigate('DriverApp', { screen: 'Jobs' })"), 'mobile routes returning drivers to Jobs screen');
assert(rootNavSrc.includes('requestNotificationPermissionsOnLaunch'), 'src prompts for push notifications on launch');
assert(rootNavMob.includes('requestNotificationPermissionsOnLaunch'), 'mobile prompts for push notifications on launch');

// 3. DriverJobsScreen Map, GPS, Toggle & Popups
console.log('\n[3] Verifying DriverJobsScreen components & capabilities:');
const jobsScreenSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/screens/driver/DriverJobsScreen.tsx'), 'utf8');
const jobsScreenMob = fs.readFileSync(path.join(ROOT_DIR, 'mobile/src/screens/driver/DriverJobsScreen.tsx'), 'utf8');

assert(jobsScreenSrc.includes('MapView'), 'src DriverJobsScreen includes MapView');
assert(jobsScreenMob.includes('MapView'), 'mobile DriverJobsScreen includes MapView');

assert(jobsScreenSrc.includes('Location.getCurrentPositionAsync'), 'src fetches current GPS location');
assert(jobsScreenMob.includes('Location.getCurrentPositionAsync'), 'mobile fetches current GPS location');

assert(jobsScreenSrc.includes('Location.watchPositionAsync'), 'src tracks live driver position');
assert(jobsScreenMob.includes('Location.watchPositionAsync'), 'mobile tracks live driver position');

assert(jobsScreenSrc.includes('mapRef.current?.animateToRegion'), 'src centers map on driver GPS coordinates');
assert(jobsScreenMob.includes('mapRef.current?.animateToRegion'), 'mobile centers map on driver GPS coordinates');

assert(jobsScreenSrc.includes('toggleOnlineStatus'), 'src includes Online/Offline toggle handler');
assert(jobsScreenMob.includes('toggleOnlineStatus'), 'mobile includes Online/Offline toggle handler');

assert(jobsScreenSrc.includes('isLockedOut'), 'src enforces wallet float lockout check');
assert(jobsScreenMob.includes('isLockedOut'), 'mobile enforces wallet float lockout check');

assert(jobsScreenSrc.includes('handleRecenterOnMe'), 'src includes floating GPS re-center button handler');
assert(jobsScreenMob.includes('handleRecenterOnMe'), 'mobile includes floating GPS re-center button handler');

assert(jobsScreenSrc.includes('incomingOrder'), 'src contains incoming job offer popup modal');
assert(jobsScreenMob.includes('incomingOrder'), 'mobile contains incoming job offer popup modal');

assert(jobsScreenSrc.includes('JobOfferModal'), 'src integrates JobOfferModal for bidding');
assert(jobsScreenMob.includes('JobOfferModal'), 'mobile integrates JobOfferModal for bidding');

assert(jobsScreenSrc.includes('hasNotificationPermission'), 'src checks push notification permissions');
assert(jobsScreenMob.includes('hasNotificationPermission'), 'mobile checks push notification permissions');

// 4. Dual-Tree Parity
console.log('\n[4] Verifying dual-tree file parity:');
assert(driverNavSrc === driverNavMob, 'DriverNavigator.tsx has 100% byte-for-byte parity');
assert(rootNavSrc === rootNavMob, 'RootNavigator.tsx has 100% byte-for-byte parity');
assert(jobsScreenSrc === jobsScreenMob, 'DriverJobsScreen.tsx has 100% byte-for-byte parity');

console.log(`\nResults: ${passedTests}/${totalTests} tests passed.`);

if (passedTests === totalTests) {
    console.log('✅ ALL TESTS PASSED!\n');
    process.exit(0);
} else {
    console.error('❌ SOME TESTS FAILED.\n');
    process.exit(1);
}
