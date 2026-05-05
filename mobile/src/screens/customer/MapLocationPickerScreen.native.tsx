import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Region } from 'react-native-maps';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../utils/supabase';
import { useAuthStore } from '../../store/authStore';

export const MapLocationPickerScreen = ({ route, navigation }: any) => {
    const { locationType, serviceType } = route.params || { locationType: 'pickup', serviceType: 'delivery' };
    const { user } = useAuthStore();

    const [region, setRegion] = useState<Region>({
        latitude: -17.8248, // Default to Harare, Zimbabwe
        longitude: 31.0530,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
    });

    const [selectedCoordinate, setSelectedCoordinate] = useState<{ latitude: number, longitude: number } | null>(null);
    const [physicalAddress, setPhysicalAddress] = useState('');
    const [recentLocations, setRecentLocations] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [locating, setLocating] = useState(false);
    const [searchTimeout, setSearchTimeout] = useState<any>(null);

    useEffect(() => {
        fetchRecentLocations();
        getCurrentLocation();
    }, []);

    // AUTO-ZOOM AS YOU TYPE LOGIC
    useEffect(() => {
        if (physicalAddress.length > 3) {
            if (searchTimeout) clearTimeout(searchTimeout);
            
            const timeout = setTimeout(async () => {
                try {
                    const results = await Location.geocodeAsync(physicalAddress);
                    if (results.length > 0) {
                        const { latitude, longitude } = results[0];
                        const newCoord = { latitude, longitude };
                        
                        // Zoom the map to the found location
                        setRegion({
                            latitude,
                            longitude,
                            latitudeDelta: 0.005,
                            longitudeDelta: 0.005,
                        });
                        
                        // Update the pin
                        setSelectedCoordinate(newCoord);
                    }
                } catch (error) {
                    console.log('Geocoding error:', error);
                }
            }, 1000); // Wait 1s after user stops typing
            
            setSearchTimeout(timeout);
        }
    }, [physicalAddress]);

    const fetchRecentLocations = async () => {
        if (!user) return;
        setLoadingHistory(true);
        try {
            const { data, error } = await supabase
                .from('orders')
                .select(locationType === 'pickup' ? 'pickup_address, pickup_latitude, pickup_longitude' : 'dropoff_address, dropoff_latitude, dropoff_longitude')
                .eq('customer_id', user.id)
                .order('created_at', { ascending: false })
                .limit(5);

            if (data) {
                const unique = Array.from(new Set(data.map(a => 
                    locationType === 'pickup' ? a.pickup_address : a.dropoff_address
                ))).map(address => data.find(a => 
                    (locationType === 'pickup' ? a.pickup_address : a.dropoff_address) === address
                ));
                setRecentLocations(unique);
            }
        } catch (error) {
            console.error('Error fetching history:', error);
        } finally {
            setLoadingHistory(false);
        }
    };

    const getCurrentLocation = async () => {
        try {
            setLocating(true);
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Allow location access to pin your current position.');
                return;
            }

            let location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.BestForNavigation,
            });

            const newRegion = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
            };
            setRegion(newRegion);
            setSelectedCoordinate({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
            });
        } catch (error) {
            Alert.alert('Error', 'Could not get current location');
        } finally {
            setLocating(false);
        }
    };

    const handleConfirmLocation = () => {
        if (!selectedCoordinate) {
            Alert.alert('Selection Required', 'Please select a point on the map.');
            return;
        }

        const finalAddress = physicalAddress.trim() 
            ? physicalAddress.trim() 
            : `${selectedCoordinate.latitude.toFixed(5)}, ${selectedCoordinate.longitude.toFixed(5)}`;

        navigation.navigate({
            name: 'CreateOrder',
            params: {
                selectedCoordinate,
                selectedAddress: finalAddress,
                locationType,
                serviceType,
                // Ensure we explicitly return the current state to prevent any reset
                timestamp: Date.now() 
            },
            merge: true,
        });
    };

    const selectRecent = (loc: any) => {
        const lat = locationType === 'pickup' ? loc.pickup_latitude : loc.dropoff_latitude;
        const lng = locationType === 'pickup' ? loc.pickup_longitude : loc.dropoff_longitude;
        const addr = locationType === 'pickup' ? loc.pickup_address : loc.dropoff_address;

        const newCoord = { latitude: lat, longitude: lng };
        setSelectedCoordinate(newCoord);
        setPhysicalAddress(addr);
        setRegion({
            ...region,
            latitude: lat,
            longitude: lng,
        });
    };

    return (
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
            <View style={styles.mapContainer}>
                <MapView
                    style={styles.map}
                    region={region}
                    onRegionChangeComplete={setRegion}
                    onPress={(e) => setSelectedCoordinate(e.nativeEvent.coordinate)}
                    showsUserLocation={true}
                    showsMyLocationButton={false}
                >
                    {selectedCoordinate && (
                        <Marker 
                            coordinate={selectedCoordinate} 
                            draggable
                            onDragEnd={(e) => setSelectedCoordinate(e.nativeEvent.coordinate)}
                        />
                    )}
                </MapView>

                <TouchableOpacity 
                    style={styles.myLocationBtn} 
                    onPress={getCurrentLocation}
                    activeOpacity={0.8}
                >
                    {locating ? <ActivityIndicator color="#34A853" /> : <Ionicons name="locate" size={24} color="#34A853" />}
                </TouchableOpacity>

                <View style={styles.addressInputContainer}>
                    <View style={styles.inputShadow}>
                        <TextInput
                            style={styles.addressInput}
                            placeholder="Enter specific address (e.g. House #5)"
                            placeholderTextColor="#94A3B8"
                            value={physicalAddress}
                            onChangeText={setPhysicalAddress}
                        />
                        <Ionicons name="location" size={20} color="#34A853" style={styles.inputIcon} />
                    </View>
                </View>
            </View>

            <View style={styles.footer}>
                <View style={styles.recentSection}>
                    <Text style={styles.recentTitle}>Recent Locations</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentScroll}>
                        {loadingHistory ? (
                            <ActivityIndicator style={{ marginLeft: 20 }} />
                        ) : recentLocations.length > 0 ? (
                            recentLocations.map((loc, index) => (
                                <TouchableOpacity key={index} style={styles.recentChip} onPress={() => selectRecent(loc)}>
                                    <Ionicons name="time-outline" size={16} color="#64748B" />
                                    <Text style={styles.recentChipText} numberOfLines={1}>
                                        {locationType === 'pickup' ? loc.pickup_address : loc.dropoff_address}
                                    </Text>
                                </TouchableOpacity>
                            ))
                        ) : (
                            <Text style={styles.noHistory}>No recent locations found</Text>
                        )}
                    </ScrollView>
                </View>

                <TouchableOpacity
                    style={[styles.confirmButton, !selectedCoordinate && styles.confirmButtonDisabled]}
                    onPress={handleConfirmLocation}
                    disabled={!selectedCoordinate}
                >
                    <LinearGradient colors={['#34A853', '#2E9348']} style={styles.btnGradient}>
                        <Text style={styles.confirmButtonText}>Confirm This Location</Text>
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    mapContainer: { flex: 1, position: 'relative' },
    map: { width: '100%', height: '100%' },
    myLocationBtn: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        backgroundColor: '#FFF',
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
    },
    addressInputContainer: {
        position: 'absolute',
        top: 20,
        left: 20,
        right: 20,
    },
    inputShadow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 56,
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
    },
    inputIcon: { marginRight: 12 },
    addressInput: { flex: 1, fontSize: 16, color: '#1E293B', fontWeight: '500' },
    footer: { backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingBottom: 24, elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.05, shadowRadius: 10 },
    recentSection: { paddingVertical: 20 },
    recentTitle: { fontSize: 14, fontWeight: '700', color: '#475569', marginLeft: 24, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
    recentScroll: { paddingHorizontal: 20, gap: 12 },
    recentChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, gap: 8, maxWidth: 200 },
    recentChipText: { fontSize: 14, color: '#475569', fontWeight: '600' },
    noHistory: { marginLeft: 24, color: '#94A3B8', fontSize: 14 },
    confirmButton: { marginHorizontal: 24, borderRadius: 16, overflow: 'hidden', elevation: 8, shadowColor: '#34A853', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12 },
    confirmButtonDisabled: { opacity: 0.5 },
    btnGradient: { height: 60, justifyContent: 'center', alignItems: 'center' },
    confirmButtonText: { color: '#FFF', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
});
