import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Region } from 'react-native-maps';

export const MapLocationPickerScreen = ({ route, navigation }: any) => {
    const { locationType } = route.params || { locationType: 'pickup' }; // 'pickup', 'dropoff', or 'store'

    // Default to a central location, e.g., a city center
    const [region, setRegion] = useState<Region>({
        latitude: 37.78825,
        longitude: -122.4324,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
    });

    const [selectedCoordinate, setSelectedCoordinate] = useState<{ latitude: number, longitude: number } | null>(null);

    const handleMapPress = (e: any) => {
        setSelectedCoordinate(e.nativeEvent.coordinate);
    };

    const handleConfirmLocation = () => {
        if (!selectedCoordinate) {
            Alert.alert('No Location Selected', 'Please tap on the map to select a location.');
            return;
        }

        // In a real app we would reverse geocode the coordinate to get an address string.
        // For now we'll mock an address based on coordinates
        const mockedAddress = `${selectedCoordinate.latitude.toFixed(4)}, ${selectedCoordinate.longitude.toFixed(4)}`;

        // Pass the data back to the previous screen (CreateOrderScreen)
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
                <Text style={styles.subTitle}>Tap on the map to place a pin</Text>
            </View>

            <View style={styles.mapContainer}>
                <MapView
                    style={styles.map}
                    initialRegion={region}
                    onPress={handleMapPress}
                    showsUserLocation={true}
                >
                    {selectedCoordinate && (
                        <Marker coordinate={selectedCoordinate} />
                    )}
                </MapView>
            </View>

            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.confirmButton, !selectedCoordinate && styles.confirmButtonDisabled]}
                    onPress={handleConfirmLocation}
                    disabled={!selectedCoordinate}
                >
                    <Text style={styles.confirmButtonText}>Confirm Location</Text>
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
        backgroundColor: '#fff',
        zIndex: 1, // Ensure shadow/border shows over map
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
    },
    map: {
        width: '100%',
        height: '100%',
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
    confirmButtonDisabled: {
        backgroundColor: '#cccccc',
    },
    confirmButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
