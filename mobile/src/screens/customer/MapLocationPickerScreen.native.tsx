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
    Keyboard,
    Platform
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Region } from 'react-native-maps';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../utils/supabase';
import { useAuthStore } from '../../store/authStore';
import { locationSearchService, AddressSuggestion } from '../../services/locationSearchService';

export const MapLocationPickerScreen = ({ route, navigation }: any) => {
    const insets = useSafeAreaInsets();
    const { locationType, serviceType, initialAddress, initialCoordinate } = route.params || { 
        locationType: 'pickup', 
        serviceType: 'delivery' 
    };
    const { user } = useAuthStore();
    const mapRef = useRef<MapView | null>(null);

    // Default Harare CBD coordinates
    const HARARE_DEFAULT = {
        latitude: -17.8248,
        longitude: 31.0530,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
    };

    const [region, setRegion] = useState<Region>(HARARE_DEFAULT);
    const [selectedCoordinate, setSelectedCoordinate] = useState<{ latitude: number, longitude: number } | null>(
        initialCoordinate || null
    );
    const [physicalAddress, setPhysicalAddress] = useState(initialAddress || '');
    const [addressMain, setAddressMain] = useState('');
    const [addressSub, setAddressSub] = useState('');
    const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
    const [isDraggingPin, setIsDraggingPin] = useState(false);

    // Search bar & autocomplete state
    const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // History & location state
    const [recentLocations, setRecentLocations] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [locating, setLocating] = useState(false);
    const [permissionDenied, setPermissionDenied] = useState(false);

    const searchDebounceRef = useRef<any>(null);
    const reverseGeocodeDebounceRef = useRef<any>(null);

    useEffect(() => {
        fetchRecentLocations();

        if (initialCoordinate && initialCoordinate.latitude && initialCoordinate.longitude) {
            // Initial coordinate provided (e.g. editing an existing pinned location)
            const targetRegion = {
                latitude: initialCoordinate.latitude,
                longitude: initialCoordinate.longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
            };
            setRegion(targetRegion);
            setSelectedCoordinate(initialCoordinate);
            mapRef.current?.animateToRegion(targetRegion, 500);

            if (!initialAddress) {
                performReverseGeocode(initialCoordinate.latitude, initialCoordinate.longitude);
            } else {
                setAddressMain(initialAddress.split(',')[0] || initialAddress);
                setAddressSub(initialAddress.split(',').slice(1).join(',').trim() || 'Harare, Zimbabwe');
            }
        } else {
            // Auto-center on customer's current GPS location on screen load (inDrive/Bolt default)
            getCurrentLocation();
        }
    }, []);

    /**
     * Auto-center on customer's live GPS position and drop the pin there
     */
    const getCurrentLocation = async () => {
        try {
            setLocating(true);
            setPermissionDenied(false);

            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setPermissionDenied(true);
                // Fall back to Harare CBD default
                const fallbackCoord = { latitude: HARARE_DEFAULT.latitude, longitude: HARARE_DEFAULT.longitude };
                setSelectedCoordinate(fallbackCoord);
                setRegion(HARARE_DEFAULT);
                mapRef.current?.animateToRegion(HARARE_DEFAULT, 600);
                performReverseGeocode(fallbackCoord.latitude, fallbackCoord.longitude);
                return;
            }

            let location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
            });

            const newCoord = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
            };
            const newRegion = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
            };

            setRegion(newRegion);
            setSelectedCoordinate(newCoord);
            mapRef.current?.animateToRegion(newRegion, 600);

            // Immediately reverse-geocode the live GPS location
            performReverseGeocode(newCoord.latitude, newCoord.longitude);
        } catch (error) {
            console.warn('Could not retrieve current location:', error);
            const fallbackCoord = { latitude: HARARE_DEFAULT.latitude, longitude: HARARE_DEFAULT.longitude };
            setSelectedCoordinate(fallbackCoord);
            setRegion(HARARE_DEFAULT);
            mapRef.current?.animateToRegion(HARARE_DEFAULT, 600);
            performReverseGeocode(fallbackCoord.latitude, fallbackCoord.longitude);
        } finally {
            setLocating(false);
        }
    };

    /**
     * Reverse-geocode coordinates into readable address label with 300ms debounce
     */
    const performReverseGeocode = (latitude: number, longitude: number) => {
        if (reverseGeocodeDebounceRef.current) {
            clearTimeout(reverseGeocodeDebounceRef.current);
        }

        setIsReverseGeocoding(true);

        reverseGeocodeDebounceRef.current = setTimeout(async () => {
            try {
                const res = await locationSearchService.reverseGeocode(latitude, longitude);
                if (res) {
                    setPhysicalAddress(res.fullAddress);
                    setAddressMain(res.mainText);
                    setAddressSub(res.secondaryText);
                }
            } catch (err) {
                console.warn('Reverse geocode error:', err);
                const coordStr = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
                setPhysicalAddress(`Location at ${coordStr}`);
                setAddressMain(`Pin (${coordStr})`);
                setAddressSub('Harare, Zimbabwe');
            } finally {
                setIsReverseGeocoding(false);
            }
        }, 300);
    };

    /**
     * Handle pin movement (from drag or map tap)
     */
    const handleCoordinateChange = (coordinate: { latitude: number; longitude: number }) => {
        setSelectedCoordinate(coordinate);
        performReverseGeocode(coordinate.latitude, coordinate.longitude);
    };

    /**
     * Search bar autocomplete logic
     */
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

    /**
     * Handle selecting an autocomplete suggestion
     */
    const handleSelectSuggestion = async (suggestion: AddressSuggestion) => {
        Keyboard.dismiss();
        setShowSuggestions(false);
        setPhysicalAddress(suggestion.fullAddress || suggestion.mainText);
        setAddressMain(suggestion.mainText);
        setAddressSub(suggestion.secondaryText || 'Harare, Zimbabwe');

        try {
            setLocating(true);
            const coords = await locationSearchService.resolveCoordinates(suggestion);
            setSelectedCoordinate(coords);

            const newRegion = {
                latitude: coords.latitude,
                longitude: coords.longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
            };
            setRegion(newRegion);
            mapRef.current?.animateToRegion(newRegion, 600);
        } catch (err) {
            console.warn('Could not resolve suggestion coordinates:', err);
        } finally {
            setLocating(false);
        }
    };

    /**
     * Fetch user recent locations
     */
    const fetchRecentLocations = async () => {
        if (!user) return;
        setLoadingHistory(true);
        try {
            const { data } = await supabase
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

    const selectRecent = (loc: any) => {
        const lat = locationType === 'pickup' ? loc.pickup_latitude : loc.dropoff_latitude;
        const lng = locationType === 'pickup' ? loc.pickup_longitude : loc.dropoff_longitude;
        const addr = locationType === 'pickup' ? loc.pickup_address : loc.dropoff_address;

        if (lat && lng) {
            const newCoord = { latitude: lat, longitude: lng };
            setSelectedCoordinate(newCoord);
            setPhysicalAddress(addr);
            setAddressMain(addr.split(',')[0] || addr);
            setAddressSub(addr.split(',').slice(1).join(',').trim() || 'Harare, Zimbabwe');

            const newRegion = {
                latitude: lat,
                longitude: lng,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
            };
            setRegion(newRegion);
            mapRef.current?.animateToRegion(newRegion, 600);
            setShowSuggestions(false);
        }
    };

    /**
     * Confirm selected location and navigate back to CreateOrderScreen
     */
    const handleConfirmLocation = () => {
        if (!selectedCoordinate) {
            Alert.alert('Selection Required', 'Please drag the pin to your location or choose an address.');
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

    const getModeMeta = () => {
        switch (locationType) {
            case 'pickup': 
                return {
                    title: 'Select Pickup Point',
                    badge: 'PICK-UP POINT',
                    pinLabel: 'Pick-up here',
                    color: '#10B981',
                    icon: 'location'
                };
            case 'dropoff': 
                return {
                    title: 'Select Drop-off Destination',
                    badge: 'DROP-OFF DESTINATION',
                    pinLabel: 'Drop-off here',
                    color: '#055FEE',
                    icon: 'flag'
                };
            case 'store': 
                return {
                    title: 'Select Store / Shop Location',
                    badge: 'STORE LOCATION',
                    pinLabel: 'Store here',
                    color: '#8B5CF6',
                    icon: 'business'
                };
            default: 
                return {
                    title: 'Select Location',
                    badge: 'LOCATION',
                    pinLabel: 'Set pin here',
                    color: '#055FEE',
                    icon: 'location'
                };
        }
    };

    const mode = getModeMeta();

    return (
        <SafeAreaView style={styles.container} edges={['left', 'right']}>
            <View style={styles.mapContainer}>
                <MapView
                    ref={mapRef}
                    style={styles.map}
                    region={region}
                    onRegionChangeComplete={(r: any) => {
                        // Keep track of region
                        setRegion(r);
                    }}
                    onPress={(e: any) => {
                        handleCoordinateChange(e.nativeEvent.coordinate);
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
                            anchor={{ x: 0.5, y: 1.0 }}
                            onDragStart={() => setIsDraggingPin(true)}
                            onDragEnd={(e) => {
                                setIsDraggingPin(false);
                                handleCoordinateChange(e.nativeEvent.coordinate);
                            }}
                            title={mode.pinLabel}
                            description={addressMain || physicalAddress || 'Drag to fine-tune'}
                        >
                            {/* inDrive / Bolt Style Floating Pin View */}
                            <View style={styles.pinWrapper}>
                                <View style={[styles.pinCallout, { borderColor: mode.color }, isDraggingPin && styles.pinCalloutDragging]}>
                                    <View style={[styles.pinCalloutDot, { backgroundColor: mode.color }]} />
                                    <Text style={styles.pinCalloutText}>{mode.pinLabel}</Text>
                                </View>
                                <View style={[styles.pinHead, { backgroundColor: mode.color }]}>
                                    <Ionicons name={mode.icon as any} size={18} color="#FFFFFF" />
                                </View>
                                <View style={[styles.pinStem, { borderTopColor: mode.color }]} />
                                <View style={styles.pinShadow} />
                            </View>
                        </Marker>
                    )}
                </MapView>

                {/* Floating Search Bar with Autocomplete */}
                <View style={styles.searchWrapper}>
                    <View style={styles.inputShadow}>
                        <Ionicons name="search" size={20} color={mode.color} style={styles.inputIcon} />
                        <TextInput
                            style={styles.addressInput}
                            placeholder="Type address or place (e.g. Joina City, Avondale)"
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
                            <ActivityIndicator size="small" color={mode.color} style={styles.rightActionIcon} />
                        ) : physicalAddress.length > 0 ? (
                            <TouchableOpacity 
                                onPress={() => {
                                    setPhysicalAddress('');
                                    setAddressMain('');
                                    setAddressSub('');
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
                                <Text style={styles.suggestionsHeaderText}>Suggested Places in Zimbabwe</Text>
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
                                        <View style={[styles.suggestionPinBox, { backgroundColor: `${mode.color}15` }]}>
                                            <Ionicons name="location-sharp" size={18} color={mode.color} />
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

                    {/* Permission Denied Notice Banner */}
                    {permissionDenied && (
                        <View style={styles.permissionBanner}>
                            <Ionicons name="alert-circle" size={16} color="#B45309" />
                            <Text style={styles.permissionBannerText}>
                                Location access disabled. Drag pin or search address to locate.
                            </Text>
                        </View>
                    )}
                </View>

                {/* "Locate Me" Live GPS FAB */}
                <TouchableOpacity 
                    style={styles.myLocationBtn} 
                    onPress={getCurrentLocation}
                    activeOpacity={0.8}
                >
                    {locating ? (
                        <ActivityIndicator color={mode.color} size="small" />
                    ) : (
                        <Ionicons name="locate" size={24} color={mode.color} />
                    )}
                </TouchableOpacity>
            </View>

            {/* inDrive / Bolt Bottom Sheet Details & Confirmation */}
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 12, 20) }]}>
                <View style={styles.headerIndicator} />

                {/* Mode Tag & Status */}
                <View style={styles.badgeRow}>
                    <View style={[styles.modeBadge, { backgroundColor: `${mode.color}15`, borderColor: `${mode.color}30` }]}>
                        <Ionicons name={mode.icon as any} size={12} color={mode.color} style={{ marginRight: 4 }} />
                        <Text style={[styles.modeBadgeText, { color: mode.color }]}>{mode.badge}</Text>
                    </View>

                    {selectedCoordinate && (
                        <Text style={styles.coordSubPill}>
                            {selectedCoordinate.latitude.toFixed(5)}, {selectedCoordinate.longitude.toFixed(5)}
                        </Text>
                    )}
                </View>

                {/* Selected Address Display Card */}
                <View style={styles.addressDisplayCard}>
                    {isReverseGeocoding ? (
                        <View style={styles.loadingAddressRow}>
                            <ActivityIndicator size="small" color={mode.color} style={{ marginRight: 8 }} />
                            <Text style={styles.loadingAddressText}>Locating address label…</Text>
                        </View>
                    ) : (
                        <View>
                            <Text style={styles.addressMainTitle} numberOfLines={1}>
                                {addressMain || physicalAddress || 'Move pin to your exact spot'}
                            </Text>
                            <Text style={styles.addressSubTitle} numberOfLines={1}>
                                {addressSub || 'Drag pin or tap map to fine-tune building entrance'}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Helper Tip */}
                <View style={styles.tipRow}>
                    <Ionicons name="finger-print-outline" size={14} color="#64748B" style={{ marginRight: 6 }} />
                    <Text style={styles.tipText}>
                        Drag the pin or tap anywhere on the map to pinpoint your exact gate.
                    </Text>
                </View>

                {/* Recent Locations Chips */}
                {recentLocations.length > 0 && (
                    <View style={styles.recentSection}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentScroll}>
                            {recentLocations.map((loc, index) => (
                                <TouchableOpacity key={index} style={styles.recentChip} onPress={() => selectRecent(loc)}>
                                    <Ionicons name="time-outline" size={14} color={mode.color} />
                                    <Text style={styles.recentChipText} numberOfLines={1}>
                                        {locationType === 'pickup' ? loc.pickup_address : loc.dropoff_address}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Confirm Location Button */}
                <TouchableOpacity
                    style={[styles.confirmButton, !selectedCoordinate && styles.confirmButtonDisabled]}
                    onPress={handleConfirmLocation}
                    disabled={!selectedCoordinate || isReverseGeocoding}
                    activeOpacity={0.85}
                >
                    <LinearGradient 
                        colors={mode.color === '#10B981' ? ['#10B981', '#059669'] : ['#055FEE', '#5B99F2']} 
                        style={styles.btnGradient}
                    >
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

    // Floating Search Bar
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
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 54,
        elevation: 10,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
    },
    inputIcon: { marginRight: 10 },
    rightActionIcon: { marginLeft: 8, padding: 4 },
    addressInput: { flex: 1, fontSize: 15, color: '#1E293B', fontWeight: '600' },

    // Autocomplete Suggestions
    suggestionsCard: {
        marginTop: 8,
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        elevation: 12,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        maxHeight: 250,
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
        fontSize: 11,
        fontWeight: '700',
        color: '#64748B',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    suggestionsCloseText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#055FEE',
    },
    suggestionsList: {
        maxHeight: 200,
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

    permissionBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEF3C7',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginTop: 8,
        borderWidth: 1,
        borderColor: '#FDE68A',
        gap: 6,
    },
    permissionBannerText: {
        fontSize: 12,
        color: '#92400E',
        fontWeight: '600',
        flex: 1,
    },

    // inDrive Custom Floating Pin Marker
    pinWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 140,
        height: 90,
    },
    pinCallout: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0F172A',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 1.5,
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        marginBottom: 4,
    },
    pinCalloutDragging: {
        transform: [{ scale: 1.08 }, { translateY: -4 }],
    },
    pinCalloutDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 6,
    },
    pinCalloutText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
    pinHead: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
    },
    pinStem: {
        width: 0,
        height: 0,
        backgroundColor: 'transparent',
        borderStyle: 'solid',
        borderLeftWidth: 5,
        borderRightWidth: 5,
        borderTopWidth: 8,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
    },
    pinShadow: {
        width: 14,
        height: 4,
        borderRadius: 7,
        backgroundColor: 'rgba(0, 0, 0, 0.25)',
        marginTop: 2,
    },

    // Floating "Locate Me" Button
    myLocationBtn: {
        position: 'absolute',
        bottom: 20,
        right: 18,
        backgroundColor: '#FFFFFF',
        width: 52,
        height: 52,
        borderRadius: 26,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 8,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
        zIndex: 50,
    },

    // Bottom Sheet Footer
    footer: { 
        backgroundColor: '#FFFFFF', 
        borderTopLeftRadius: 28, 
        borderTopRightRadius: 28, 
        paddingHorizontal: 20,
        paddingBottom: 20, 
        elevation: 20, 
        shadowColor: '#0F172A', 
        shadowOffset: { width: 0, height: -8 }, 
        shadowOpacity: 0.1, 
        shadowRadius: 16,
    },
    headerIndicator: {
        width: 44,
        height: 4,
        backgroundColor: '#E2E8F0',
        borderRadius: 2,
        alignSelf: 'center',
        marginTop: 10,
        marginBottom: 12,
    },
    badgeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    modeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
    },
    modeBadgeText: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    coordSubPill: {
        fontSize: 11,
        color: '#94A3B8',
        fontWeight: '600',
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },

    // Address Display Card
    addressDisplayCard: {
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginBottom: 8,
    },
    loadingAddressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
    },
    loadingAddressText: {
        fontSize: 14,
        color: '#64748B',
        fontWeight: '600',
    },
    addressMainTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 2,
    },
    addressSubTitle: {
        fontSize: 13,
        color: '#64748B',
        fontWeight: '500',
    },

    tipRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        paddingHorizontal: 4,
    },
    tipText: {
        fontSize: 12,
        color: '#64748B',
        flex: 1,
        lineHeight: 16,
    },

    recentSection: { 
        marginBottom: 12,
    },
    recentScroll: { 
        gap: 8,
    },
    recentChip: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: '#F1F5F9', 
        paddingHorizontal: 12, 
        paddingVertical: 7, 
        borderRadius: 12, 
        gap: 6, 
        maxWidth: 220 
    },
    recentChipText: { 
        fontSize: 12, 
        color: '#334155', 
        fontWeight: '600' 
    },

    confirmButton: { 
        borderRadius: 16, 
        overflow: 'hidden', 
        elevation: 6, 
        shadowColor: '#055FEE', 
        shadowOffset: { width: 0, height: 4 }, 
        shadowOpacity: 0.25, 
        shadowRadius: 10 
    },
    confirmButtonDisabled: { 
        opacity: 0.5 
    },
    btnGradient: { 
        height: 54, 
        flexDirection: 'row', 
        justifyContent: 'center', 
        alignItems: 'center' 
    },
    confirmButtonText: { 
        color: '#FFFFFF', 
        fontSize: 16, 
        fontWeight: '800', 
        letterSpacing: 0.3 
    },
});
