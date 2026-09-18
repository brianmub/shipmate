import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { locationSearchService, AddressSuggestion } from '../../services/locationSearchService';

export const MapLocationPickerScreen = ({ route, navigation }: any) => {
    const { locationType, serviceType, initialAddress } = route.params || { locationType: 'pickup' };

    const [addressQuery, setAddressQuery] = useState(initialAddress || '');
    const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
    const [selectedSuggestion, setSelectedSuggestion] = useState<AddressSuggestion | null>(null);
    const [loading, setLoading] = useState(false);

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

    const handleSelectSuggestion = (sugg: AddressSuggestion) => {
        setSelectedSuggestion(sugg);
        setAddressQuery(sugg.fullAddress);
        setSuggestions([]);
    };

    const handleConfirmLocation = async () => {
        let lat = -17.8248;
        let lng = 31.0530;
        let finalAddr = addressQuery.trim() || 'Harare CBD, Zimbabwe';

        if (selectedSuggestion) {
            const resolved = await locationSearchService.resolveCoordinates(selectedSuggestion);
            lat = resolved.latitude;
            lng = resolved.longitude;
            finalAddr = selectedSuggestion.fullAddress;
        } else if (addressQuery.trim()) {
            const dummySugg: AddressSuggestion = {
                id: 'custom',
                mainText: addressQuery,
                secondaryText: 'Zimbabwe',
                fullAddress: addressQuery,
            };
            const resolved = await locationSearchService.resolveCoordinates(dummySugg);
            lat = resolved.latitude;
            lng = resolved.longitude;
        }

        const selectedCoordinate = { latitude: lat, longitude: lng };

        navigation.navigate({
            name: 'CreateOrder',
            params: {
                selectedCoordinate,
                selectedAddress: finalAddr,
                locationType,
                serviceType,
                timestamp: Date.now()
            },
            merge: true,
        });
    };

    const getTitle = () => {
        switch (locationType) {
            case 'pickup': return 'Select Pickup Location';
            case 'dropoff': return 'Select Drop-off Destination';
            case 'store': return 'Select Store / Shop Location';
            default: return 'Select Location';
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>{getTitle()}</Text>
                <Text style={styles.subTitle}>Search address or select popular landmark</Text>
            </View>

            <View style={styles.content}>
                <View style={styles.inputCard}>
                    <Ionicons name="search" size={20} color="#055FEE" style={{ marginRight: 10 }} />
                    <TextInput
                        style={styles.textInput}
                        placeholder="Search address (e.g. Joina City, Avondale, Borrowdale)"
                        placeholderTextColor="#94A3B8"
                        value={addressQuery}
                        onChangeText={handleSearch}
                    />
                    {loading && <ActivityIndicator size="small" color="#055FEE" />}
                </View>

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
                                    <Ionicons name="location" size={18} color="#055FEE" style={{ marginRight: 10 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.mainText}>{s.mainText}</Text>
                                        <Text style={styles.subText}>{s.secondaryText}</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                <View style={styles.previewBox}>
                    <Text style={styles.previewLabel}>Current Address Selection:</Text>
                    <Text style={styles.previewAddress}>
                        {addressQuery.trim() ? addressQuery : 'None selected yet'}
                    </Text>
                </View>
            </View>

            <View style={styles.footer}>
                <TouchableOpacity
                    style={styles.confirmButton}
                    onPress={handleConfirmLocation}
                >
                    <Text style={styles.confirmButtonText}>Confirm This Location</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: { padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
    headerTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
    subTitle: { fontSize: 14, color: '#64748B', marginTop: 4 },
    content: { flex: 1, padding: 20 },
    inputCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderRadius: 12,
        paddingHorizontal: 16,
        height: 52,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginBottom: 16,
    },
    textInput: { flex: 1, fontSize: 15, color: '#0F172A' },
    suggestionsContainer: {
        backgroundColor: '#FFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: 12,
        maxHeight: 280,
        marginBottom: 16,
    },
    suggestionsTitle: { fontSize: 12, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: 8 },
    suggestionsScroll: { maxHeight: 220 },
    suggestionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    mainText: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
    subText: { fontSize: 12, color: '#64748B' },
    previewBox: { backgroundColor: '#F1F5F9', padding: 16, borderRadius: 12 },
    previewLabel: { fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 4 },
    previewAddress: { fontSize: 15, fontWeight: '700', color: '#055FEE' },
    footer: { padding: 20, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
    confirmButton: { backgroundColor: '#055FEE', padding: 16, borderRadius: 12, alignItems: 'center' },
    confirmButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
