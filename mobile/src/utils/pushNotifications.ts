import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const CACHED_PUSH_TOKEN_KEY = '@shipmate_device_push_token';

// Global notification handler config
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

/**
 * Configure Android notification channels for normal alerts and high-priority incoming calls
 */
export async function setupNotificationChannelsAsync() {
    if (Platform.OS !== 'android') return;

    try {
        // 1. General notifications channel (messages, order updates, promotions)
        await Notifications.setNotificationChannelAsync('default', {
            name: 'General Notifications',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            sound: 'default',
            lightColor: '#055FEE',
            enableLights: true,
            enableVibrate: true,
            showBadge: true,
        });

        // 2. Dedicated incoming call channel (inDrive/Bolt style ringing alerts)
        await Notifications.setNotificationChannelAsync('incoming-calls', {
            name: 'Incoming Calls',
            description: 'Loud ringing and vibration alerts for in-app calls between customer and courier',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 600, 300, 600, 300, 1000],
            sound: 'default',
            lightColor: '#10B981',
            enableLights: true,
            enableVibrate: true,
            showBadge: true,
            bypassDnd: true,
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });
    } catch (err) {
        console.warn('Could not set up Android notification channels:', err);
    }
}

/**
 * Prompt for push notification permissions on initial app launch
 * Caches token locally so it can immediately be bound once user signs in or registers
 */
export async function requestNotificationPermissionsOnLaunch(): Promise<string | null> {
    try {
        await setupNotificationChannelsAsync();

        if (Platform.OS === 'web') return null;

        if (Device.isDevice) {
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;

            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }

            if (finalStatus !== 'granted') {
                console.log('Push notification permission was not granted on initial launch.');
                return null;
            }

            const projectId =
                Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

            if (!projectId) {
                console.warn('Project ID not found in app config. Skipping token generation.');
                return null;
            }

            const token = (
                await Notifications.getExpoPushTokenAsync({
                    projectId,
                })
            ).data;

            if (token) {
                await AsyncStorage.setItem(CACHED_PUSH_TOKEN_KEY, token);
                console.log('Push token acquired on launch and cached:', token);
            }

            return token;
        } else {
            console.log('Push notifications require a physical device or push simulator build.');
            return null;
        }
    } catch (err) {
        console.warn('Error requesting notification permissions on launch:', err);
        return null;
    }
}

/**
 * Register and bind push token to the user record in Supabase
 * Works universally for BOTH customer and driver (Mate) roles
 */
export async function registerForPushNotificationsAsync(userId: string): Promise<string | null> {
    try {
        if (Platform.OS === 'web' || !userId) return null;

        // Ensure channels are active
        await setupNotificationChannelsAsync();

        let token: string | null = await AsyncStorage.getItem(CACHED_PUSH_TOKEN_KEY);

        if (Device.isDevice) {
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;

            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }

            if (finalStatus !== 'granted') {
                console.log('Failed to get permissions for push notification');
                return null;
            }

            const projectId =
                Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

            if (!projectId) {
                console.warn('Project ID not found. Skipping push notification registration.');
                return null;
            }

            token = (
                await Notifications.getExpoPushTokenAsync({
                    projectId,
                })
            ).data;

            if (token) {
                await AsyncStorage.setItem(CACHED_PUSH_TOKEN_KEY, token);
            }
        }

        // Store token against user record in Supabase
        if (token && userId) {
            const { error } = await supabase
                .from('users')
                .update({ expo_push_token: token })
                .eq('id', userId);

            if (error) {
                console.error('Error saving push token to Supabase for user', userId, error);
            } else {
                console.log('Successfully saved push token for user:', userId, token);
            }
        }

        return token;
    } catch (err) {
        console.warn('Notification registration failed:', err);
        return null;
    }
}

/**
 * Listen for foreground notification delivery (when the app is active)
 */
export function setupForegroundNotificationListener(
    onReceive: (notification: Notifications.Notification) => void
) {
    const subscription = Notifications.addNotificationReceivedListener(notification => {
        onReceive(notification);
    });

    return () => {
        subscription.remove();
    };
}

/**
 * Listen for notification response interactions (e.g. user tapping notification card from background/killed state)
 */
export function setupNotificationResponseListener(onNotificationClick: (data: any) => void) {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
        const data = response.notification.request.content.data;
        if (data && onNotificationClick) {
            onNotificationClick(data);
        }
    });

    return () => {
        subscription.remove();
    };
}
