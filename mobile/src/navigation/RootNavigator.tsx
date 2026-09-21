import React, { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
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
import { orderService } from '../services/orderService';
import {
    registerForPushNotificationsAsync,
    requestNotificationPermissionsOnLaunch,
    setupNotificationResponseListener
} from '../utils/pushNotifications';
import { InAppNotificationBanner, IncomingCallData, IncomingMessageData } from '../components/InAppNotificationBanner';

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
    const { session, role, setVerificationStatus } = useAuthStore();

    // 1. Prompt for push permissions on first launch and cache device token
    useEffect(() => {
        requestNotificationPermissionsOnLaunch();
    }, []);

    // 2. Register push token for ANY authenticated user (both Customer and Driver)
    useEffect(() => {
        if (session?.user?.id) {
            registerForPushNotificationsAsync(session.user.id);
            if (role === 'driver') {
                fetchDriverStatus();
            }
        }
    }, [session, role]);

    // 3. Deep link listener for notification taps (backgrounded & killed app states)
    useEffect(() => {
        const unsubscribe = setupNotificationResponseListener((data) => {
            if (!data || !navigationRef.isReady()) return;

            if (data.type === 'in_app_call') {
                if (role === 'driver') {
                    navigationRef.navigate('DriverApp', {
                        screen: 'ActiveJob',
                        params: {
                            orderId: data.orderId,
                            openCall: true,
                            isIncoming: true,
                            callerName: data.callerName,
                            callerRole: data.callerRole
                        }
                    });
                } else {
                    navigationRef.navigate('CustomerApp', {
                        screen: 'CustomerTracking',
                        params: {
                            orderId: data.orderId,
                            openCall: true,
                            isIncoming: true,
                            callerName: data.callerName,
                            callerRole: data.callerRole
                        }
                    });
                }
            } else if (data.type === 'in_app_message') {
                if (role === 'driver') {
                    navigationRef.navigate('DriverApp', {
                        screen: 'Chat',
                        params: {
                            orderId: data.orderId,
                            recipientName: data.senderName
                        }
                    });
                } else {
                    navigationRef.navigate('CustomerApp', {
                        screen: 'CustomerTracking',
                        params: {
                            orderId: data.orderId,
                            openChat: true,
                            recipientName: data.senderName
                        }
                    });
                }
            } else if (data.screen === 'CustomerTracking' && data.orderId) {
                navigationRef.navigate('CustomerApp', {
                    screen: 'CustomerTracking',
                    params: { orderId: data.orderId }
                });
            } else if (data.orderId && role === 'driver') {
                navigationRef.navigate('DriverApp', {
                    screen: 'Jobs',
                    params: { orderId: data.orderId, isPriority: data.isPlatinumPriority }
                });
            }
        });

        return () => {
            unsubscribe();
        };
    }, [role]);

    // 4. Background resume listener: ensure authenticated Mate returns to / stays on Available Jobs, and Customer locks onto live tracking map during active trip
    useEffect(() => {
        const handleAppStateChange = async (nextState: AppStateStatus) => {
            if (nextState === 'active' && session?.user?.id) {
                if (role === 'driver') {
                    fetchDriverStatus();
                    requestNotificationPermissionsOnLaunch();
                    registerForPushNotificationsAsync(session.user.id);

                    if (navigationRef.isReady()) {
                        const currentRoute = navigationRef.getCurrentRoute()?.name;
                        // Do not redirect away if courier is actively executing an in-progress delivery, chatting, or completing security check
                        if (currentRoute !== 'ActiveJob' && currentRoute !== 'Chat' && currentRoute !== 'SecurityCheck') {
                            navigationRef.navigate('DriverApp', { screen: 'Jobs' });
                        }
                    }
                } else if (role === 'customer') {
                    requestNotificationPermissionsOnLaunch();
                    registerForPushNotificationsAsync(session.user.id);

                    try {
                        const activeOrder = await orderService.getActiveCustomerOrder(session.user.id);
                        if (activeOrder && navigationRef.isReady()) {
                            const currentRoute = navigationRef.getCurrentRoute()?.name;
                            if (currentRoute !== 'CustomerTracking') {
                                navigationRef.navigate('CustomerApp', {
                                    screen: 'CustomerTracking',
                                    params: { orderId: activeOrder.id }
                                });
                            }
                        }
                    } catch (err) {
                        console.warn('Error checking active customer order on resume:', err);
                    }
                }
            }
        };

        const sub = AppState.addEventListener('change', handleAppStateChange);
        return () => sub.remove();
    }, [session?.user?.id, role]);

    // 5. Initial launch check for customer with an active accepted trip
    useEffect(() => {
        if (session?.user?.id && role === 'customer') {
            orderService.getActiveCustomerOrder(session.user.id).then((activeOrder) => {
                if (activeOrder && navigationRef.isReady()) {
                    navigationRef.navigate('CustomerApp', {
                        screen: 'CustomerTracking',
                        params: { orderId: activeOrder.id }
                    });
                }
            }).catch((err) => console.warn('Could not check active customer order on launch:', err));
        }
    }, [session?.user?.id, role]);

    const fetchDriverStatus = async () => {
        try {
            if (!session?.user?.id) return;
            const status = await userService.getDriverStatus(session.user.id);
            setVerificationStatus(status as any);
        } catch (error) {
            console.error('Error fetching driver status:', error);
        }
    };

    // Handler when user taps Answer on the foreground call banner
    const handleBannerAnswerCall = (callData: IncomingCallData) => {
        if (!navigationRef.isReady() || !callData?.orderId) return;

        if (role === 'driver') {
            navigationRef.navigate('DriverApp', {
                screen: 'ActiveJob',
                params: {
                    orderId: callData.orderId,
                    openCall: true,
                    isIncoming: true,
                    callerName: callData.callerName,
                    callerRole: callData.callerRole
                }
            });
        } else {
            navigationRef.navigate('CustomerApp', {
                screen: 'CustomerTracking',
                params: {
                    orderId: callData.orderId,
                    openCall: true,
                    isIncoming: true,
                    callerName: callData.callerName,
                    callerRole: callData.callerRole
                }
            });
        }
    };

    // Handler when user taps message toast
    const handleBannerOpenMessage = (msgData: IncomingMessageData) => {
        if (!navigationRef.isReady() || !msgData?.orderId) return;

        if (role === 'driver') {
            navigationRef.navigate('DriverApp', {
                screen: 'Chat',
                params: {
                    orderId: msgData.orderId,
                    recipientName: msgData.senderName,
                    recipientRole: msgData.senderRole
                }
            });
        } else {
            navigationRef.navigate('CustomerApp', {
                screen: 'CustomerTracking',
                params: {
                    orderId: msgData.orderId,
                    openChat: true,
                    recipientName: msgData.senderName,
                    recipientRole: msgData.senderRole
                }
            });
        }
    };

    return (
        <NavigationContainer ref={navigationRef}>
            <InAppNotificationBanner
                currentUserId={session?.user?.id}
                onAnswerCall={handleBannerAnswerCall}
                onOpenMessage={handleBannerOpenMessage}
            />
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
