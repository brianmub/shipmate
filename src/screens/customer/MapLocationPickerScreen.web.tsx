import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { locationSearchService, AddressSuggestion } from '../../services/locationSearchService';

export const MapLocationPickerScreen = ({ route, navigation }: any) => {
    const { locationType, serviceType, initialAddress, initialCoordinate } = route.params || { 
        locationType: 'pickup',
        serviceType: 'delivery'
    };

    const HARARE_DEFAULT = { latitude: -17.8248, longitude: 31.0530 };

    const [addressQuery, setAddressQuery] = useState(initialAddress || '');
    const [selectedCoordinate, setSelectedCoordinate] = useState<{ latitude: number; longitude: number }>(
        initialCoordinate || HARARE_DEFAULT
    );
    const [addressMain, setAddressMain] = useState('');
    const [addressSub, setAddressSub] = useState('');
    const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
    const [selectedSuggestion, setSelectedSuggestion] = useState<AddressSuggestion | null>(null);
    const [loading, setLoading] = useState(false);
    const [locatingGps, setLocatingGps] = useState(false);
    const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);

    useEffect(() => {
        if (initialCoordinate && initialCoordinate.latitude && initialCoordinate.longitude) {
            setSelectedCoordinate(initialCoordinate);
            reverseGeocodeCoords(initialCoordinate.latitude, initialCoordinate.longitude);
        } else if (!initialAddress) {
            // Auto-detect browser GPS on load
            getCurrentBrowserLocation();
        } else {
            setAddressMain(initialAddress.split(',')[0] || initialAddress);
            setAddressSub(initialAddress.split(',').slice(1).join(',').trim() || 'Harare, Zimbabwe');
        }
    }, []);

    const reverseGeocodeCoords = async (lat: number, lng: number) => {
        setIsReverseGeocoding(true);
        try {
            const res = await locationSearchService.reverseGeocode(lat, lng);
            if (res) {
                setAddressQuery(res.fullAddress);
                setAddressMain(res.mainText);
                setAddressSub(res.secondaryText);
            }
        } catch (err) {
            console.warn('Web reverse geocode error:', err);
        } finally {
            setIsReverseGeocoding(false);
        }
    };

    const getCurrentBrowserLocation = () => {
        if (typeof window !== 'undefined' && 'geolocation' in navigator) {
            setLocatingGps(true);
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const coords = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                    };
                    setSelectedCoordinate(coords);
                    await reverseGeocodeCoords(coords.latitude, coords.longitude);
                    setLocatingGps(false);
                },
                (error) => {
                    console.warn('Browser geolocation error:', error.message);
                    setLocatingGps(false);
                    // Default to Harare CBD
                    setSelectedCoordinate(HARARE_DEFAULT);
                    reverseGeocodeCoords(HARARE_DEFAULT.latitude, HARARE_DEFAULT.longitude);
                },
                { enableHighAccuracy: true, timeout: 8000 }
            );
        } else {
            setSelectedCoordinate(HARARE_DEFAULT);
            reverseGeocodeCoords(HARARE_DEFAULT.latitude, HARARE_DEFAULT.longitude);
        }
    };

    const handleSearch = async (text: string) => {
        setAddressQuery(text);
        if (text.trim().length < 2) {
            setSuggestions([]);
            return;
        }
        setLoading(true);
        try {
            const res = await locationSearchService.searchAddresses(text);
            setSuggestions(res);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectSuggestion = async (sugg: AddressSuggestion) => {
        setSelectedSuggestion(sugg);
        setAddressQuery(sugg.fullAddress);
        setAddressMain(sugg.mainText);
        setAddressSub(sugg.secondaryText || 'Harare, Zimbabwe');
        setSuggestions([]);

        try {
            const resolved = await locationSearchService.resolveCoordinates(sugg);
            setSelectedCoordinate(resolved);
        } catch (err) {
            console.warn('Could not resolve suggestion coords:', err);
        }
    };

    const handleConfirmLocation = async () => {
        let lat = selectedCoordinate.latitude;
        let lng = selectedCoordinate.longitude;
        let finalAddr = addressQuery.trim() || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

        if (selectedSuggestion) {
            const resolved = await locationSearchService.resolveCoordinates(selectedSuggestion);
            lat = resolved.latitude;
            lng = resolved.longitude;
            finalAddr = selectedSuggestion.fullAddress;
        }

        navigation.navigate({
            name: 'CreateOrder',
            params: {
                selectedCoordinate: { latitude: lat, longitude: lng },
                selectedAddress: finalAddr,
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
                    title: 'Select Pickup Location',
                    badge: 'PICK-UP POINT',
                    color: '#10B981',
                    icon: 'location'
                };
            case 'dropoff':
                return {
                    title: 'Select Drop-off Destination',
                    badge: 'DROP-OFF DESTINATION',
                    color: '#055FEE',
                    icon: 'flag'
                };
            case 'store':
                return {
                    title: 'Select Store / Shop Location',
                    badge: 'STORE LOCATION',
                    color: '#8B5CF6',
                    icon: 'business'
                };
            default:
                return {
                    title: 'Select Location',
                    badge: 'LOCATION',
                    color: '#055FEE',
                    icon: 'location'
                };
        }
    };

    const mode = getModeMeta();

    return (
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
            <View style={styles.header}>
                <View style={[styles.badge, { backgroundColor: `${mode.color}15`, borderColor: `${mode.color}30` }]}>
                    <Ionicons name={mode.icon as any} size={12} color={mode.color} style={{ marginRight: 4 }} />
                    <Text style={[styles.badgeText, { color: mode.color }]}>{mode.badge}</Text>
                </View>
                <Text style={styles.headerTitle}>{mode.title}</Text>
                <Text style={styles.subTitle}>Fine-tune your location or search popular landmarks across Zimbabwe</Text>
            </View>

            <View style={styles.content}>
                {/* Search Bar */}
                <View style={styles.inputCard}>
                    <Ionicons name="search" size={20} color={mode.color} style={{ marginRight: 10 }} />
                    <TextInput
                        style={styles.textInput}
                        placeholder="Search address (e.g. Joina City, Avondale, Borrowdale)"
                        placeholderTextColor="#94A3B8"
                        value={addressQuery}
                        onChangeText={handleSearch}
                    />
                    {loading && <ActivityIndicator size="small" color={mode.color} />}
                </View>

                {/* Quick Live GPS Button */}
                <TouchableOpacity 
                    style={styles.gpsButton} 
                    onPress={getCurrentBrowserLocation}
                    activeOpacity={0.8}
                >
                    {locatingGps ? (
                        <ActivityIndicator size="small" color="#055FEE" style={{ marginRight: 8 }} />
                    ) : (
                        <Ionicons name="locate" size={18} color="#055FEE" style={{ marginRight: 8 }} />
                    )}
                    <Text style={styles.gpsButtonText}>
                        {locatingGps ? 'Locating your browser GPS…' : '📍 Auto-detect My Live Location'}
                    </Text>
                </TouchableOpacity>

                {/* Suggestions List */}
                {suggestions.length > 0 && (
                    <View style={styles.suggestionsContainer}>
                        <Text style={styles.suggestionsTitle}>Address Suggestions</Text>
                        <ScrollView style={styles.suggestionsScroll}>
                            {suggestions.map((s) => (
                                <TouchableOpacity
                                    key={s.id}
                                    style={styles.suggestionRow}
                                    onPress={() => handleSelectSuggestion(s)}
                                >
                                    <Ionicons name="location" size={18} color={mode.color} style={{ marginRight: 10 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.mainText}>{s.mainText}</Text>
                                        <Text style={styles.subText}>{s.secondaryText}</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Selected Location Preview Card */}
                <View style={styles.previewBox}>
                    <View style={styles.previewHeaderRow}>
                        <Text style={styles.previewLabel}>Pinned Location Coordinates:</Text>
                        <Text style={styles.coordText}>
                            {selectedCoordinate.latitude.toFixed(5)}, {selectedCoordinate.longitude.toFixed(5)}
                        </Text>
                    </View>

                    {isReverseGeocoding ? (
                        <View style={styles.loadingRow}>
                            <ActivityIndicator size="small" color={mode.color} style={{ marginRight: 8 }} />
                            <Text style={styles.loadingText}>Locating address label…</Text>
                        </View>
                    ) : (
                        <View style={{ marginTop: 6 }}>
                            <Text style={styles.previewAddress}>
                                {addressMain || addressQuery || 'Harare Central, Zimbabwe'}
                            </Text>
                            {addressSub ? (
                                <Text style={styles.previewSubAddress}>{addressSub}</Text>
                            ) : null}
                        </View>
                    )}
                </View>
            </View>

            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.confirmButton, { backgroundColor: mode.color }]}
                    onPress={handleConfirmLocation}
                >
                    <Ionicons name="checkmark-circle" size={20} color="#FFF" style={{ marginRight: 8 }} />
                    <Text style={styles.confirmButtonText}>Confirm This Location</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: { padding: 20, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        borderWidth: 1,
        marginBottom: 8,
    },
    badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
    headerTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
    subTitle: { fontSize: 13, color: '#64748B', marginTop: 4 },
    content: { flex: 1, padding: 20 },
    inputCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
    },
    textInput: { flex: 1, fontSize: 15, color: '#1E293B', outlineStyle: 'none' as any },
    gpsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#EFF6FF',
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
        marginTop: 12,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    gpsButtonText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1D4ED8',
    },
    suggestionsContainer: {
        marginTop: 12,
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        overflow: 'hidden',
        maxHeight: 220,
    },
    suggestionsTitle: {
        fontSize: 11,
        fontWeight: '700',
        color: '#64748B',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: '#F8FAFC',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    suggestionsScroll: { maxHeight: 180 },
    suggestionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F8FAFC',
    },
    mainText: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
    subText: { fontSize: 12, color: '#64748B', marginTop: 1 },
    previewBox: {
        marginTop: 16,
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    previewHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    previewLabel: { fontSize: 12, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' },
    coordText: { fontSize: 12, fontWeight: '600', color: '#055FEE', fontFamily: 'monospace' },
    loadingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    loadingText: { fontSize: 13, color: '#64748B', fontWeight: '500' },
    previewAddress: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
    previewSubAddress: { fontSize: 13, color: '#64748B', marginTop: 2 },
    footer: {
        padding: 20,
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
    },
    confirmButton: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        height: 52,
        borderRadius: 14,
    },
    confirmButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
});
