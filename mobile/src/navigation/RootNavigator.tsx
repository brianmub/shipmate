import React, { useEffect } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuthStore } from '../store/authStore';

// Navigators
import { CustomerNavigator } from './CustomerNavigator';
import { DriverNavigator } from './DriverNavigator';

// Screens
import { WelcomeScreen } from '../screens/auth/WelcomeScreen';
import { SignInScreen } from '../screens/auth/SignInScreen';
import { SignUpScreen } from '../screens/auth/SignUpScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { userService } from '../services/userService';
import { registerForPushNotificationsAsync, setupNotificationResponseListener } from '../utils/pushNotifications';

const Stack = createNativeStackNavigator();
export const navigationRef = createNavigationContainerRef<any>();

// Auth Stack
const AuthStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
);

export const RootNavigator = () => {
    const { session, role, setVerificationStatus, setRejectionReason } = useAuthStore();

    useEffect(() => {
        if (session && role === 'driver') {
            fetchDriverStatus();
            // Ensure push token is active for priority dispatches
            registerForPushNotificationsAsync(session.user.id);
        }
    }, [session, role]);

    useEffect(() => {
        // Deep link listener for notification taps
        const unsubscribe = setupNotificationResponseListener((data) => {
            if (data?.type === 'PRIORITY_OFFER' && data?.orderId) {
                if (navigationRef.isReady()) {
                    navigationRef.navigate('DriverApp', {
                        screen: 'ActiveJob',
                        params: { orderId: data.orderId, isPriority: data.isPlatinumPriority }
                    });
                }
            }
        });

        return () => {
            unsubscribe();
        };
    }, [role]);

    const fetchDriverStatus = async () => {
        try {
            const details = await userService.getDriverVerificationDetails(session!.user.id);
            setVerificationStatus(details.status as any);
            setRejectionReason(details.rejectionReason);
        } catch (error) {
            console.error('Error fetching driver status:', error);
        }
    };

    return (
        <NavigationContainer ref={navigationRef}>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {!session ? (
                    <Stack.Screen name="Auth" component={AuthStack} />
                ) : role === 'customer' ? (
                    <Stack.Screen name="CustomerApp" component={CustomerNavigator} />
                ) : role === 'driver' ? (
                    <Stack.Screen name="DriverApp" component={DriverNavigator} />
                ) : (
                    <Stack.Screen name="Auth" component={AuthStack} />
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
};
