import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuthStore } from '../store/authStore';

// Navigators
import { CustomerNavigator } from './CustomerNavigator';
import { DriverNavigator } from './DriverNavigator';
import { AdminNavigator } from './AdminNavigator';

// Screens
import { WelcomeScreen } from '../screens/auth/WelcomeScreen';
import { SignInScreen } from '../screens/auth/SignInScreen';
import { SignUpScreen } from '../screens/auth/SignUpScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';

const Stack = createNativeStackNavigator();

// Auth Stack
const AuthStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
);

import { useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { userService } from '../services/userService';

export const RootNavigator = () => {
    const { session, role, setVerificationStatus } = useAuthStore();

    useEffect(() => {
        if (session && role === 'driver') {
            fetchDriverStatus();
        }
    }, [session, role]);

    const fetchDriverStatus = async () => {
        try {
            const status = await userService.getDriverStatus(session!.user.id);
            setVerificationStatus(status as any);
        } catch (error) {
            console.error('Error fetching driver status:', error);
        }
    };

    return (
        <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {!session ? (
                    <Stack.Screen name="Auth" component={AuthStack} />
                ) : role === 'customer' ? (
                    <Stack.Screen name="CustomerApp" component={CustomerNavigator} />
                ) : role === 'driver' ? (
                    <Stack.Screen name="DriverApp" component={DriverNavigator} />
                ) : role === 'admin' ? (
                    <Stack.Screen name="AdminApp" component={AdminNavigator} />
                ) : (
                    <Stack.Screen name="Auth" component={AuthStack} />
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
};
