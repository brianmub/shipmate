import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

// Customer Screens
import { CustomerHomeScreen } from '../screens/customer/CustomerHomeScreen';
import { OrderHistoryScreen } from '../screens/customer/OrderHistoryScreen';
import { CustomerProfileScreen } from '../screens/customer/CustomerProfileScreen';
import { CreateOrderScreen } from '../screens/customer/CreateOrderScreen';

import { MapLocationPickerScreen } from '../screens/customer/MapLocationPickerScreen';
import { CustomerTrackingScreen } from '../screens/customer/CustomerTrackingScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Tabs for main screens
const CustomerTabs = () => (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: '#0056D2' }}>
        <Tab.Screen name="Home" component={CustomerHomeScreen} options={{ tabBarIcon: () => <></> }} />
        <Tab.Screen name="Orders" component={OrderHistoryScreen} options={{ tabBarIcon: () => <></> }} />
        <Tab.Screen name="Profile" component={CustomerProfileScreen} options={{ tabBarIcon: () => <></> }} />
    </Tab.Navigator>
);

// Stack to hold tabs AND nested screens like CreateOrder
export const CustomerNavigator = () => {
    return (
        <Stack.Navigator>
            <Stack.Screen
                name="CustomerTabs"
                component={CustomerTabs}
                options={{ headerShown: false }}
            />
            <Stack.Screen
                name="CreateOrder"
                component={CreateOrderScreen}
                options={{ title: 'Create Order' }}
            />
            <Stack.Screen
                name="MapLocationPicker"
                component={MapLocationPickerScreen}
                options={{ title: 'Select Location' }}
            />
            <Stack.Screen
                name="CustomerTracking"
                component={CustomerTrackingScreen}
                options={{ headerShown: false }}
            />
        </Stack.Navigator>
    );
};
