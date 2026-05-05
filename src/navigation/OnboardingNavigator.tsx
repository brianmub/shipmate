import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { PersonalDetailsScreen } from '../screens/driver/onboarding/PersonalDetailsScreen';
import { DocumentUploadScreen } from '../screens/driver/onboarding/DocumentUploadScreen';
import { VehicleDetailsScreen } from '../screens/driver/onboarding/VehicleDetailsScreen';
import { VehiclePhotosScreen } from '../screens/driver/onboarding/VehiclePhotosScreen';

const Stack = createNativeStackNavigator();

export const OnboardingNavigator = () => {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="PersonalDetails" component={PersonalDetailsScreen} />
            <Stack.Screen name="DocumentUpload" component={DocumentUploadScreen} />
            <Stack.Screen name="VehicleDetails" component={VehicleDetailsScreen} />
            <Stack.Screen name="VehiclePhotos" component={VehiclePhotosScreen} />
        </Stack.Navigator>
    );
};
