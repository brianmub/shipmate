import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export async function registerForPushNotificationsAsync(userId: string) {
    try {
        let token;

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#FF231F7C',
            });
        }

        if (Device.isDevice) {
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;

            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }

            if (finalStatus !== 'granted') {
                console.log('Failed to get push token for push notification!');
                return;
            }

            const projectId =
                Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

            if (!projectId) {
                console.warn('Project ID not found. Skipping push notification registration.');
                return;
            }

            token = (
                await Notifications.getExpoPushTokenAsync({
                    projectId,
                })
            ).data;

            // If we successfully generated a token, save it to the user's profile in Supabase
            if (token && userId) {
                const { error } = await supabase
                    .from('users')
                    .update({ expo_push_token: token })
                    .eq('id', userId);

                if (error) {
                    console.error('Error saving push token to Supabase:', error);
                } else {
                    console.log('Successfully saved push token for user:', userId);
                }
            }
        } else {
            console.log('Must use physical device for Push Notifications');
        }

        return token;
    } catch (err) {
        console.warn('Notification registration failed silently:', err);
        return null;
    }
}
