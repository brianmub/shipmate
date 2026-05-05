import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const MapLocationPickerScreen = ({ route, navigation }: any) => {
    const { locationType } = route.params || { locationType: 'pickup' };

    const handleConfirmLocation = () => {
        // Mock coordinates for web with slight randomization to ensure parameter change detection
        const lat = 37.78825 + (Math.random() - 0.5) * 0.01;
        const lng = -122.4324 + (Math.random() - 0.5) * 0.01;
        
        const selectedCoordinate = { latitude: lat, longitude: lng };
        const mockedAddress = `Web Mock Address (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

        navigation.navigate({
            name: 'CreateOrder',
            params: {
                selectedCoordinate,
                selectedAddress: mockedAddress,
                locationType
            },
            merge: true,
        });
    };

    const getTitle = () => {
        switch (locationType) {
            case 'pickup': return 'Select Pickup Location';
            case 'dropoff': return 'Select Drop-off Location';
            case 'store': return 'Select Store Location';
            default: return 'Select Location';
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>{getTitle()}</Text>
                <Text style={styles.subTitle}>[Web Map Placeholder]</Text>
            </View>

            <View style={styles.mapContainer}>
                <View style={styles.webPlaceholder}>
                    <Text style={styles.placeholderText}>Interactive maps are currently disabled on web.</Text>
                    <Text style={styles.placeholderSubText}>Please use a mobile device for full map functionality.</Text>
                </View>
            </View>

            <View style={styles.footer}>
                <TouchableOpacity
                    style={styles.confirmButton}
                    onPress={handleConfirmLocation}
                >
                    <Text style={styles.confirmButtonText}>Confirm Mock Location</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
    },
    subTitle: {
        fontSize: 14,
        color: '#666',
        marginTop: 4,
    },
    mapContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f9f9f9',
    },
    webPlaceholder: {
        alignItems: 'center',
        padding: 20,
    },
    placeholderText: {
        fontSize: 16,
        color: '#333',
        fontWeight: '500',
        textAlign: 'center',
    },
    placeholderSubText: {
        fontSize: 14,
        color: '#888',
        marginTop: 8,
        textAlign: 'center',
    },
    footer: {
        padding: 24,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#eee',
    },
    confirmButton: {
        backgroundColor: '#0056D2',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
    },
    confirmButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
