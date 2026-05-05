import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

// Admin Screens
import { AdminDashboard } from '../screens/admin/AdminDashboard';
import { OrderLogScreen } from '../screens/admin/OrderLogScreen';
import { FleetMapScreen } from '../screens/admin/FleetMapScreen';
import { SystemSettingsScreen } from '../screens/admin/SystemSettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const AdminTabs = () => (
    <Tab.Navigator 
        screenOptions={({ route }) => ({
            headerShown: false,
            tabBarActiveTintColor: '#34A853',
            tabBarInactiveTintColor: '#94A3B8',
            tabBarStyle: {
                backgroundColor: '#0F172A',
                borderTopWidth: 0,
                height: 60,
                paddingBottom: 10,
            },
            tabBarIcon: ({ focused, color, size }) => {
                let iconName: any;
                if (route.name === 'Dashboard') {
                    iconName = focused ? 'grid' : 'grid-outline';
                } else if (route.name === 'Orders') {
                    iconName = focused ? 'list' : 'list-outline';
                } else if (route.name === 'Fleet') {
                    iconName = focused ? 'map' : 'map-outline';
                } else if (route.name === 'Settings') {
                    iconName = focused ? 'settings' : 'settings-outline';
                }
                return <Ionicons name={iconName} size={size} color={color} />;
            },
        })}
    >
        <Tab.Screen name="Dashboard" component={AdminDashboard} />
        <Tab.Screen name="Orders" component={OrderLogScreen} />
        <Tab.Screen name="Fleet" component={FleetMapScreen} />
        <Tab.Screen name="Settings" component={SystemSettingsScreen} />
    </Tab.Navigator>
);

export const AdminNavigator = () => {
    return (
        <Stack.Navigator>
            <Stack.Screen
                name="AdminTabs"
                component={AdminTabs}
                options={{ headerShown: false }}
            />
        </Stack.Navigator>
    );
};
