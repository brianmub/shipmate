import React, { useState, useEffect, useRef } from 'react';
import { 
    View, 
    Text, 
    StyleSheet, 
    TouchableOpacity, 
    Alert, 
    TextInput, 
    ScrollView, 
    ActivityIndicator,
    Keyboard
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Region } from 'react-native-maps';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../utils/supabase';
import { useAuthStore } from '../../store/authStore';
import { locationSearchService, AddressSuggestion } from '../../services/locationSearchService';

export const MapLocationPickerScreen = ({ route, navigation }: any) => {
    const { locationType, serviceType, initialAddress } = route.params || { locationType: 'pickup', serviceType: 'delivery' };
    const { user } = useAuthStore();
    const mapRef = useRef<MapView | null>(null);

    const [region, setRegion] = useState<Region>({
        latitude: -17.8248, // Default to Harare, Zimbabwe
        longitude: 31.0530,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
    });

    const [selectedCoordinate, setSelectedCoordinate] = useState<{ latitude: number, longitude: number } | null>(null);
    const [physicalAddress, setPhysicalAddress] = useState(initialAddress || '');
    const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    
    const [recentLocations, setRecentLocations] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [locating, setLocating] = useState(false);
    const searchDebounceRef = useRef<any>(null);

    useEffect(() => {
        fetchRecentLocations();
        if (!initialAddress) {
            getCurrentLocation();
        } else {
            // Geocode initial address if given
            handleSearchSuggestions(initialAddress, false);
        }
    }, []);

    const handleSearchSuggestions = (query: string, showDropdown = true) => {
        if (searchDebounceRef.current) {
            clearTimeout(searchDebounceRef.current);
        }

        if (query.trim().length < 2) {
            setSuggestions([]);
            setShowSuggestions(false);
            setLoadingSuggestions(false);
            return;
        }

        if (showDropdown) {
            setLoadingSuggestions(true);
            setShowSuggestions(true);
        }

        searchDebounceRef.current = setTimeout(async () => {
            try {
                const results = await locationSearchService.searchAddresses(query);
                setSuggestions(results);
                if (showDropdown && results.length > 0) {
                    setShowSuggestions(true);
                }
            } catch (err) {
                console.warn('Address suggestion query error:', err);
            } finally {
                setLoadingSuggestions(false);
            }
        }, 300);
    };

    const handleSelectSuggestion = async (suggestion: AddressSuggestion) => {
        Keyboard.dismiss();
        setShowSuggestions(false);
        setPhysicalAddress(suggestion.fullAddress || suggestion.mainText);

        try {
            setLocating(true);
            const coords = await locationSearchService.resolveCoordinates(suggestion);
            setSelectedCoordinate(coords);

            const newRegion = {
                latitude: coords.latitude,
                longitude: coords.longitude,
                latitudeDelta: 0.006,
                longitudeDelta: 0.006,
            };
            setRegion(newRegion);
            mapRef.current?.animateToRegion(newRegion, 600);
        } catch (err) {
            console.warn('Could not resolve suggestion coordinates:', err);
        } finally {
            setLocating(false);
        }
    };

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
                const unique = Array.from(new Set((data as any[]).map(a => 
                    locationType === 'pickup' ? a.pickup_address : a.dropoff_address
                ))).map(address => (data as any[]).find(a => 
                    (locationType === 'pickup' ? a.pickup_address : a.dropoff_address) === address
                )).filter(Boolean);
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
                accuracy: Location.Accuracy.Balanced,
            });

            const newCoord = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
            };
            const newRegion = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                latitudeDelta: 0.006,
                longitudeDelta: 0.006,
            };
            setRegion(newRegion);
            setSelectedCoordinate(newCoord);
            mapRef.current?.animateToRegion(newRegion, 600);

            // Reverse geocode to populate address name
            try {
                const [geo] = await Location.reverseGeocodeAsync(newCoord);
                if (geo) {
                    const formatted = [geo.street, geo.name, geo.district, geo.city].filter(Boolean).join(', ');
                    if (formatted) {
                        setPhysicalAddress(formatted);
                    }
                }
            } catch (gErr) {
                console.log('Reverse geocode failed:', gErr);
            }
        } catch (error) {
            Alert.alert('Error', 'Could not retrieve current location.');
        } finally {
            setLocating(false);
        }
    };

    const handleConfirmLocation = () => {
        if (!selectedCoordinate) {
            Alert.alert('Selection Required', 'Please select a point on the map or choose a suggested address.');
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
                timestamp: Date.now() 
            },
            merge: true,
        });
    };

    const selectRecent = (loc: any) => {
        const lat = locationType === 'pickup' ? loc.pickup_latitude : loc.dropoff_latitude;
        const lng = locationType === 'pickup' ? loc.pickup_longitude : loc.dropoff_longitude;
        const addr = locationType === 'pickup' ? loc.pickup_address : loc.dropoff_address;

        if (lat && lng) {
            const newCoord = { latitude: lat, longitude: lng };
            setSelectedCoordinate(newCoord);
            setPhysicalAddress(addr);
            const newRegion = {
                latitude: lat,
                longitude: lng,
                latitudeDelta: 0.006,
                longitudeDelta: 0.006,
            };
            setRegion(newRegion);
            mapRef.current?.animateToRegion(newRegion, 600);
            setShowSuggestions(false);
        }
    };

    const getTitle = () => {
        switch (locationType) {
            case 'pickup': return 'Select Pickup Point';
            case 'dropoff': return 'Select Drop-off Destination';
            case 'store': return 'Select Store / Shop Location';
            default: return 'Select Location';
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
            <View style={styles.mapContainer}>
                <MapView
                    ref={mapRef}
                    style={styles.map}
                    region={region}
                    onRegionChangeComplete={setRegion}
                    onPress={(e: any) => {
                        setSelectedCoordinate(e.nativeEvent.coordinate);
                        setShowSuggestions(false);
                        Keyboard.dismiss();
                    }}
                    showsUserLocation={true}
                    showsMyLocationButton={false}
                >
                    {selectedCoordinate && (
                        <Marker 
                            coordinate={selectedCoordinate} 
                            draggable
                            onDragEnd={(e) => setSelectedCoordinate(e.nativeEvent.coordinate)}
                            title="Selected Location"
                            description={physicalAddress || 'Tap to confirm'}
                        />
                    )}
                </MapView>

                {/* Floating Search & Suggestion Bar */}
                <View style={styles.searchWrapper}>
                    <View style={styles.inputShadow}>
                        <Ionicons name="search" size={20} color="#055FEE" style={styles.inputIcon} />
                        <TextInput
                            style={styles.addressInput}
                            placeholder={`Type address or place (e.g. Joina City, Avondale)`}
                            placeholderTextColor="#94A3B8"
                            value={physicalAddress}
                            onChangeText={(text) => {
                                setPhysicalAddress(text);
                                handleSearchSuggestions(text, true);
                            }}
                            onFocus={() => {
                                if (suggestions.length > 0) setShowSuggestions(true);
                            }}
                            returnKeyType="search"
                        />
                        {loadingSuggestions ? (
                            <ActivityIndicator size="small" color="#055FEE" style={styles.rightActionIcon} />
                        ) : physicalAddress.length > 0 ? (
                            <TouchableOpacity 
                                onPress={() => {
                                    setPhysicalAddress('');
                                    setSuggestions([]);
                                    setShowSuggestions(false);
                                }} 
                                style={styles.rightActionIcon}
                            >
                                <Ionicons name="close-circle" size={20} color="#94A3B8" />
                            </TouchableOpacity>
                        ) : null}
                    </View>

                    {/* Autocomplete Suggestions Dropdown */}
                    {showSuggestions && suggestions.length > 0 && (
                        <View style={styles.suggestionsCard}>
                            <View style={styles.suggestionsHeader}>
                                <Text style={styles.suggestionsHeaderText}>Suggested Locations</Text>
                                <TouchableOpacity onPress={() => setShowSuggestions(false)}>
                                    <Text style={styles.suggestionsCloseText}>Close</Text>
                                </TouchableOpacity>
                            </View>
                            <ScrollView 
                                style={styles.suggestionsList} 
                                keyboardShouldPersistTaps="handled"
                                nestedScrollEnabled
                            >
                                {suggestions.map((sugg) => (
                                    <TouchableOpacity
                                        key={sugg.id}
                                        style={styles.suggestionItem}
                                        activeOpacity={0.7}
                                        onPress={() => handleSelectSuggestion(sugg)}
                                    >
                                        <View style={styles.suggestionPinBox}>
                                            <Ionicons name="location-sharp" size={18} color="#055FEE" />
                                        </View>
                                        <View style={styles.suggestionTextWrap}>
                                            <Text style={styles.suggestionMainText} numberOfLines={1}>
                                                {sugg.mainText}
                                            </Text>
                                            <Text style={styles.suggestionSubText} numberOfLines={1}>
                                                {sugg.secondaryText}
                                            </Text>
                                        </View>
                                        <Ionicons name="arrow-forward" size={16} color="#CBD5E1" />
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    )}
                </View>

                {/* GPS Location Button */}
                <TouchableOpacity 
                    style={styles.myLocationBtn} 
                    onPress={getCurrentLocation}
                    activeOpacity={0.8}
                >
                    {locating ? <ActivityIndicator color="#055FEE" /> : <Ionicons name="locate" size={24} color="#055FEE" />}
                </TouchableOpacity>
            </View>

            {/* Bottom Sheet Footer */}
            <View style={styles.footer}>
                <View style={styles.headerIndicator} />
                <Text style={styles.footerTitle}>{getTitle()}</Text>

                <View style={styles.recentSection}>
                    <Text style={styles.recentTitle}>Recent Locations</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentScroll}>
                        {loadingHistory ? (
                            <ActivityIndicator style={{ marginLeft: 20 }} />
                        ) : recentLocations.length > 0 ? (
                            recentLocations.map((loc, index) => (
                                <TouchableOpacity key={index} style={styles.recentChip} onPress={() => selectRecent(loc)}>
                                    <Ionicons name="time-outline" size={16} color="#055FEE" />
                                    <Text style={styles.recentChipText} numberOfLines={1}>
                                        {locationType === 'pickup' ? loc.pickup_address : loc.dropoff_address}
                                    </Text>
                                </TouchableOpacity>
                            ))
                        ) : (
                            <Text style={styles.noHistory}>No previous locations found</Text>
                        )}
                    </ScrollView>
                </View>

                <TouchableOpacity
                    style={[styles.confirmButton, !selectedCoordinate && styles.confirmButtonDisabled]}
                    onPress={handleConfirmLocation}
                    disabled={!selectedCoordinate}
                    activeOpacity={0.85}
                >
                    <LinearGradient colors={['#055FEE', '#5B99F2']} style={styles.btnGradient}>
                        <Ionicons name="checkmark-circle" size={20} color="#FFF" style={{ marginRight: 8 }} />
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
    searchWrapper: {
        position: 'absolute',
        top: 20,
        left: 16,
        right: 16,
        zIndex: 100,
    },
    inputShadow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 56,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
    },
    inputIcon: { marginRight: 10 },
    rightActionIcon: { marginLeft: 8, padding: 4 },
    addressInput: { flex: 1, fontSize: 15, color: '#1E293B', fontWeight: '500' },
    suggestionsCard: {
        marginTop: 8,
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        elevation: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        maxHeight: 260,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    suggestionsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: '#F8FAFC',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    suggestionsHeaderText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#64748B',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    suggestionsCloseText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#055FEE',
    },
    suggestionsList: {
        maxHeight: 210,
    },
    suggestionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F8FAFC',
    },
    suggestionPinBox: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(5, 95, 238, 0.08)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    suggestionTextWrap: {
        flex: 1,
        marginRight: 8,
    },
    suggestionMainText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 2,
    },
    suggestionSubText: {
        fontSize: 12,
        color: '#64748B',
    },
    myLocationBtn: {
        position: 'absolute',
        bottom: 24,
        right: 20,
        backgroundColor: '#FFF',
        width: 54,
        height: 54,
        borderRadius: 27,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
        zIndex: 50,
    },
    footer: { 
        backgroundColor: '#FFF', 
        borderTopLeftRadius: 28, 
        borderTopRightRadius: 28, 
        paddingBottom: 24, 
        elevation: 20, 
        shadowColor: '#000', 
        shadowOffset: { width: 0, height: -8 }, 
        shadowOpacity: 0.08, 
        shadowRadius: 12,
    },
    headerIndicator: {
        width: 40,
        height: 4,
        backgroundColor: '#E2E8F0',
        borderRadius: 2,
        alignSelf: 'center',
        marginTop: 10,
        marginBottom: 6,
    },
    footerTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0F172A',
        textAlign: 'center',
        marginTop: 4,
        marginBottom: 8,
    },
    recentSection: { paddingVertical: 12 },
    recentTitle: { fontSize: 12, fontWeight: '700', color: '#64748B', marginLeft: 24, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
    recentScroll: { paddingHorizontal: 20, gap: 10 },
    recentChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, gap: 8, maxWidth: 220 },
    recentChipText: { fontSize: 13, color: '#334155', fontWeight: '600' },
    noHistory: { marginLeft: 24, color: '#94A3B8', fontSize: 13 },
    confirmButton: { marginHorizontal: 20, marginTop: 6, borderRadius: 16, overflow: 'hidden', elevation: 6, shadowColor: '#055FEE', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10 },
    confirmButtonDisabled: { opacity: 0.5 },
    btnGradient: { height: 56, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    confirmButtonText: { color: '#FFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
});
