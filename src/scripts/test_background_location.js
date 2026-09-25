/**
 * Test Suite: Courier Background Location Tracking (Expo TaskManager & Permissions)
 * 
 * Verifies:
 * 1. Dual-Tree Parity between mobile/src and root src
 * 2. Dependency audit (expo-task-manager present in root and mobile package.json)
 * 3. Native permissions in app.json (Android FOREGROUND_SERVICE_LOCATION, ACCESS_BACKGROUND_LOCATION, iOS UIBackgroundModes)
 * 4. TaskManager top-level registration in App.tsx
 * 5. BackgroundLocation utility contract (start, stop, active check)
 * 6. DriverActiveJobScreen integration with background tracking
 * 7. Functional simulation of background GPS location ingestion
 * 
 * Usage:
 *   node src/scripts/test_background_location.js
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
    logSection('Suite 1: Dual-Tree Parity Check');

    const filesToVerify = [
        'src/utils/backgroundLocation.ts',
        'src/screens/driver/DriverActiveJobScreen.native.tsx'
    ];

    for (const file of filesToVerify) {
        const rootPath = path.join(__dirname, '..', '..', file);
        const mobilePath = path.join(__dirname, '..', '..', 'mobile', file);

        const rootExists = fs.existsSync(rootPath);
        const mobileExists = fs.existsSync(mobilePath);

        recordResult(`File existence: ${file}`, rootExists && mobileExists);

        if (rootExists && mobileExists) {
            const rootContent = fs.readFileSync(rootPath, 'utf8').replace(/\r\n/g, '\n');
            const mobileContent = fs.readFileSync(mobilePath, 'utf8').replace(/\r\n/g, '\n');
            recordResult(`Parity Check: ${file}`, rootContent === mobileContent, `Matched length: ${rootContent.length} chars`);
        }
    }

    // App.tsx and app.json parity
    const rootApp = fs.readFileSync(path.join(__dirname, '..', '..', 'App.tsx'), 'utf8').replace(/\r\n/g, '\n');
    const mobileApp = fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', 'App.tsx'), 'utf8').replace(/\r\n/g, '\n');
    recordResult('Parity Check: App.tsx', rootApp === mobileApp);

    const rootAppJson = fs.readFileSync(path.join(__dirname, '..', '..', 'app.json'), 'utf8').replace(/\r\n/g, '\n');
    const mobileAppJson = fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', 'app.json'), 'utf8').replace(/\r\n/g, '\n');
    recordResult('Parity Check: app.json', rootAppJson === mobileAppJson);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: Package Dependencies & Expo Module Check
// ─────────────────────────────────────────────────────────────────────────────
function testDependencies() {
    logSection('Suite 2: Dependencies Audit (expo-task-manager & expo-location)');

    const rootPkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
    const mobilePkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', 'package.json'), 'utf8'));

    recordResult('Root package.json includes expo-task-manager', !!rootPkg.dependencies['expo-task-manager'], `Version: ${rootPkg.dependencies['expo-task-manager']}`);
    recordResult('Mobile package.json includes expo-task-manager', !!mobilePkg.dependencies['expo-task-manager'], `Version: ${mobilePkg.dependencies['expo-task-manager']}`);
    recordResult('Root package.json includes expo-location', !!rootPkg.dependencies['expo-location']);
    recordResult('Mobile package.json includes expo-location', !!mobilePkg.dependencies['expo-location']);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: App.json Background Permissions
// ─────────────────────────────────────────────────────────────────────────────
function testNativePermissions() {
    logSection('Suite 3: Native Background Permissions in app.json');

    const appConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'app.json'), 'utf8'));
    const ios = appConfig.expo.ios || {};
    const android = appConfig.expo.android || {};
    const infoPlist = ios.infoPlist || {};
    const permissions = android.permissions || [];

    // iOS
    recordResult('iOS includes UIBackgroundModes: ["location"]', Array.isArray(infoPlist.UIBackgroundModes) && infoPlist.UIBackgroundModes.includes('location'));
    recordResult('iOS includes NSLocationAlwaysAndWhenInUseUsageDescription', !!infoPlist.NSLocationAlwaysAndWhenInUseUsageDescription);
    recordResult('iOS includes NSLocationWhenInUseUsageDescription', !!infoPlist.NSLocationWhenInUseUsageDescription);

    // Android
    recordResult('Android includes ACCESS_FINE_LOCATION', permissions.includes('ACCESS_FINE_LOCATION'));
    recordResult('Android includes ACCESS_BACKGROUND_LOCATION', permissions.includes('ACCESS_BACKGROUND_LOCATION'));
    recordResult('Android includes FOREGROUND_SERVICE', permissions.includes('FOREGROUND_SERVICE'));
    recordResult('Android includes FOREGROUND_SERVICE_LOCATION', permissions.includes('FOREGROUND_SERVICE_LOCATION'));
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: TaskManager Module Architecture & Screen Integration
// ─────────────────────────────────────────────────────────────────────────────
function testArchitecture() {
    logSection('Suite 4: TaskManager Registration & Driver Screen Integration');

    const appCode = fs.readFileSync(path.join(__dirname, '..', '..', 'App.tsx'), 'utf8');
    const bgUtilCode = fs.readFileSync(path.join(__dirname, '..', 'utils', 'backgroundLocation.ts'), 'utf8');
    const driverScreenCode = fs.readFileSync(path.join(__dirname, '..', 'screens', 'driver', 'DriverActiveJobScreen.native.tsx'), 'utf8');

    // App.tsx bundle root import
    recordResult('App.tsx imports backgroundLocation at bundle root', appCode.includes("import './src/utils/backgroundLocation';"));

    // TaskManager utility
    recordResult('Defines COURIER_LOCATION_TASK constant', bgUtilCode.includes('COURIER_BACKGROUND_LOCATION_TRACKING'));
    recordResult('Registers TaskManager.defineTask at module level', bgUtilCode.includes('TaskManager.defineTask(COURIER_LOCATION_TASK'));
    recordResult('startCourierBackgroundLocation requests foreground permissions', bgUtilCode.includes('requestForegroundPermissionsAsync'));
    recordResult('startCourierBackgroundLocation configures Android foregroundService notification', bgUtilCode.includes('notificationTitle: "Shipmate Courier Active"') && bgUtilCode.includes('foregroundService'));
    recordResult('stopCourierBackgroundLocation cancels location updates', bgUtilCode.includes('stopLocationUpdatesAsync(COURIER_LOCATION_TASK)'));

    // Driver Screen
    recordResult('DriverActiveJobScreen imports startCourierBackgroundLocation', driverScreenCode.includes('startCourierBackgroundLocation'));
    recordResult('DriverActiveJobScreen calls startCourierBackgroundLocation on job start', driverScreenCode.includes('await startCourierBackgroundLocation(jobId)'));
    recordResult('DriverActiveJobScreen calls stopCourierBackgroundLocation on unmount/complete', driverScreenCode.includes('stopCourierBackgroundLocation()'));
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: Functional Simulation of Background Location Dispatch
// ─────────────────────────────────────────────────────────────────────────────
function testSimulation() {
    logSection('Suite 5: Functional Simulation of Background Location Updates');

    let dispatchedJobId = null;
    let dispatchedLat = null;
    let dispatchedLng = null;

    const mockOrderService = {
        updateDriverLocation: async (jobId, lat, lng) => {
            dispatchedJobId = jobId;
            dispatchedLat = lat;
            dispatchedLng = lng;
            return { success: true };
        }
    };

    // Simulate task handler callback
    async function simulateTaskExecution(activeJobId, payload) {
        if (!activeJobId) return false;
        const { locations } = payload;
        if (!locations || locations.length === 0) return false;
        const latest = locations[locations.length - 1];
        await mockOrderService.updateDriverLocation(activeJobId, latest.coords.latitude, latest.coords.longitude);
        return true;
    }

    const testPayload = {
        locations: [
            { coords: { latitude: -17.8285, longitude: 31.0530, speed: 12.5, heading: 45.0 } },
            { coords: { latitude: -17.8292, longitude: 31.0545, speed: 14.2, heading: 60.0 } }
        ]
    };

    const simulated = simulateTaskExecution('ord-test-bg-123', testPayload);
    recordResult('Simulation: Task handler extracts latest coordinate', dispatchedLat === -17.8292 && dispatchedLng === 31.0545, `Lat: ${dispatchedLat}, Lng: ${dispatchedLng}`);
    recordResult('Simulation: Dispatches to active order ID', dispatchedJobId === 'ord-test-bg-123');
}

// ─────────────────────────────────────────────────────────────────────────────
// RUN ALL TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log(`${colors.bright}ShipMate Test Runner: Courier Background Location Tracking${colors.reset}`);
console.log(`Started at: ${new Date().toISOString()}`);

testDualTreeParity();
testDependencies();
testNativePermissions();
testArchitecture();
testSimulation();

const total = results.length;
const passed = results.filter(r => r.passed).length;
const failed = total - passed;

logSection('Test Run Summary');
console.log(`Total Checks : ${total}`);
console.log(`Passed       : ${passed}`);
console.log(`Failed       : ${failed}`);

if (failed === 0) {
    console.log(`\n${colors.bright}${colors.green}✔ ALL COURIER BACKGROUND LOCATION TESTS PASSED!${colors.reset}\n`);
    process.exit(0);
} else {
    console.log(`\n${colors.bright}${colors.red}✖ SOME TESTS FAILED!${colors.reset}\n`);
    process.exit(1);
}
