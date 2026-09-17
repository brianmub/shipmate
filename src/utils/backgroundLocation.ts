import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { orderService } from '../services/orderService';
import { Platform } from 'react-native';

export const COURIER_LOCATION_TASK = 'COURIER_BACKGROUND_LOCATION_TRACKING';
const ACTIVE_JOB_STORAGE_KEY = '@shipmate_active_tracking_job';

// In-memory reference for the active job being tracked
let activeTrackingJobId: string | null = null;

/**
 * Set or clear the active job ID for background tracking
 */
export async function setActiveTrackingJobId(jobId: string | null) {
    activeTrackingJobId = jobId;
    try {
        if (jobId) {
            await AsyncStorage.setItem(ACTIVE_JOB_STORAGE_KEY, jobId);
        } else {
            await AsyncStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
        }
    } catch (e) {
        console.error('Error persisting active tracking job id:', e);
    }
}

/**
 * Define the global TaskManager background location task.
 * Note: Must be executed at bundle root so the native runtime can locate it when waking up in the background.
 */
TaskManager.defineTask(COURIER_LOCATION_TASK, async ({ data, error }: any) => {
    if (error) {
        console.error('[BackgroundLocation] Task error:', error.message);
        return;
    }

    if (data) {
        const { locations } = data;
        if (!locations || locations.length === 0) return;

        const latestLocation = locations[locations.length - 1];
        const { latitude, longitude } = latestLocation.coords;

        // Resolve active job ID from memory or AsyncStorage
        let jobId = activeTrackingJobId;
        if (!jobId) {
            try {
                jobId = await AsyncStorage.getItem(ACTIVE_JOB_STORAGE_KEY);
            } catch (storageErr) {
                console.error('[BackgroundLocation] Failed to read active job from storage:', storageErr);
            }
        }

        if (jobId) {
            try {
                await orderService.updateDriverLocation(jobId, latitude, longitude);
            } catch (err: any) {
                console.error('[BackgroundLocation] Failed to push location to Supabase:', err?.message);
            }
        }
    }
});

/**
 * Start background location tracking for a courier on an active job.
 */
export async function startCourierBackgroundLocation(jobId: string): Promise<{ success: boolean; error?: string }> {
    if (Platform.OS === 'web') {
        return { success: false, error: 'Background location is not supported on web.' };
    }

    try {
        // 1. Request Foreground Permissions first
        const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
        if (fgStatus !== 'granted') {
            return { success: false, error: 'FOREGROUND_PERMISSION_DENIED' };
        }

        // 2. Request Background Permissions
        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
        if (bgStatus !== 'granted') {
            return { success: false, error: 'BACKGROUND_PERMISSION_DENIED' };
        }

        // 3. Persist active job ID
        await setActiveTrackingJobId(jobId);

        // 4. Check if task is already running
        const isRegistered = await Location.hasStartedLocationUpdatesAsync(COURIER_LOCATION_TASK);
        if (isRegistered) {
            return { success: true };
        }

        // 5. Start location updates with background and foreground service options
        await Location.startLocationUpdatesAsync(COURIER_LOCATION_TASK, {
            accuracy: Location.Accuracy.High,
            timeInterval: 10000,
            distanceInterval: 10,
            deferredUpdatesInterval: 10000,
            deferredUpdatesDistance: 10,
            foregroundService: {
                notificationTitle: "Shipmate Courier Active",
                notificationBody: "Sharing live GPS location for turn-by-turn navigation.",
                notificationColor: "#055FEE",
            },
            pausesUpdatesAutomatically: false,
            showsBackgroundLocationIndicator: true,
        });

        return { success: true };
    } catch (err: any) {
        console.error('[BackgroundLocation] Error starting tracking:', err?.message);
        return { success: false, error: err?.message || 'UNKNOWN_ERROR' };
    }
}

/**
 * Stop background location tracking.
 */
export async function stopCourierBackgroundLocation(): Promise<void> {
    if (Platform.OS === 'web') return;

    try {
        await setActiveTrackingJobId(null);
        const isRegistered = await Location.hasStartedLocationUpdatesAsync(COURIER_LOCATION_TASK);
        if (isRegistered) {
            await Location.stopLocationUpdatesAsync(COURIER_LOCATION_TASK);
        }
    } catch (err: any) {
        console.error('[BackgroundLocation] Error stopping tracking:', err?.message);
    }
}

/**
 * Check if background location tracking is currently active.
 */
export async function isCourierBackgroundLocationActive(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    try {
        return await Location.hasStartedLocationUpdatesAsync(COURIER_LOCATION_TASK);
    } catch {
        return false;
    }
}
