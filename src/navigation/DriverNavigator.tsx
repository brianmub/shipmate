import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';

// Driver Screens
import { DriverHomeScreen } from '../screens/driver/DriverHomeScreen';
import { DriverJobsScreen } from '../screens/driver/DriverJobsScreen';
import { DriverProfileScreen } from '../screens/driver/DriverProfileScreen';

import { DriverOnboardingScreen } from '../screens/driver/DriverOnboardingScreen';
import { DriverActiveJobScreen } from '../screens/driver/DriverActiveJobScreen';
import { EarningsScreen } from '../screens/driver/EarningsScreen';
import { ChatScreen } from '../screens/ChatScreen';

import { useAuthStore } from '../store/authStore';
import { OnboardingNavigator } from './OnboardingNavigator';

const Drawer = createDrawerNavigator();

export const DriverNavigator = () => {
    const { verificationStatus } = useAuthStore();

    // If driver is not approved, show onboarding flow
    if (verificationStatus !== 'approved') {
        return <OnboardingNavigator />;
    }

    return (
        <Drawer.Navigator
            screenOptions={{
                headerTintColor: '#333',
                drawerActiveTintColor: '#055FEE',
                drawerActiveBackgroundColor: '#E8F5E9',
            }}
        >
            <Drawer.Screen
                name="Dashboard"
                component={DriverHomeScreen}
                options={{ title: 'Driver Dashboard' }}
            />
            <Drawer.Screen
                name="Jobs"
                component={DriverJobsScreen}
                options={{ title: 'Available Jobs' }}
            />
            <Drawer.Screen
                name="ActiveJob"
                component={DriverActiveJobScreen}
                options={{ title: 'Current Delivery' }}
            />
            <Drawer.Screen
                name="Earnings"
                component={EarningsScreen}
                options={{ title: 'My Earnings' }}
            />
            <Drawer.Screen
                name="Profile"
                component={DriverProfileScreen}
                options={{ title: 'My Profile' }}
            />
            <Drawer.Screen
                name="Chat"
                component={ChatScreen}
                options={{ 
                    title: 'Chat',
                    drawerItemStyle: { display: 'none' } // Hide from drawer menu
                }}
            />
        </Drawer.Navigator>
    );
};
