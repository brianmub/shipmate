import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { orderService } from '../../services/orderService';

export const CreateOrderScreen = ({ route, navigation }: any) => {
    const { serviceType } = route.params || { serviceType: 'delivery' };
    const isDelivery = serviceType === 'delivery';

    // Auth & Loading State
    const { user } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [showErrors, setShowErrors] = useState(false);

    // Form State
    const [pickupAddress, setPickupAddress] = useState('');
    const [pickupCoords, setPickupCoords] = useState<{ latitude: number, longitude: number } | null>(null);
    const [dropoffAddress, setDropoffAddress] = useState('');
    const [dropoffCoords, setDropoffCoords] = useState<{ latitude: number, longitude: number } | null>(null);
    const [packageDescription, setPackageDescription] = useState('');

    const [errandLocation, setErrandLocation] = useState('');
    const [errandCoords, setErrandCoords] = useState<{ latitude: number, longitude: number } | null>(null);
    const [errandList, setErrandList] = useState('');

    // Handle incoming parameters from MapLocationPicker
    useEffect(() => {
        if (route.params?.selectedCoordinate && route.params?.selectedAddress) {
            const { locationType, selectedAddress, selectedCoordinate } = route.params;
            
            switch (locationType) {
                case 'pickup':
                    setPickupAddress(selectedAddress);
                    setPickupCoords(selectedCoordinate);
                    break;
                case 'dropoff':
                    setDropoffAddress(selectedAddress);
                    setDropoffCoords(selectedCoordinate);
                    break;
                case 'store':
                    setErrandLocation(selectedAddress);
                    setErrandCoords(selectedCoordinate);
                    break;
            }

            // Clear the params so they aren't re-consumed if the screen re-renders
            navigation.setParams({
                selectedCoordinate: undefined,
                selectedAddress: undefined,
                locationType: undefined
            });
        }
    }, [route.params]);

    const handlePlaceOrder = async () => {
        if (!dropoffAddress || (isDelivery && !pickupAddress) || (!isDelivery && !errandLocation)) {
            setShowErrors(true);
            Alert.alert('Missing Fields', 'Please fill out all required location details.');
            return;
        }

        setLoading(true);
        setShowErrors(false);
        try {
            if (!user) throw new Error("No user session found");

            await orderService.createOrder({
                customer_id: user.id,
                service_type: serviceType,
                status: 'pending',
                pickup_address: isDelivery ? pickupAddress : null,
                pickup_latitude: isDelivery ? pickupCoords?.latitude : null,
                pickup_longitude: isDelivery ? pickupCoords?.longitude : null,
                dropoff_address: dropoffAddress,
                dropoff_latitude: dropoffCoords?.latitude,
                dropoff_longitude: dropoffCoords?.longitude,
                errand_location: !isDelivery ? errandLocation : null,
                errand_instructions: !isDelivery ? errandList : null,
                package_description: isDelivery ? packageDescription : null,
                estimated_cost: 12.50
            });

            const title = "Order Confirmed";
            const msg = "Your request has been placed and is waiting for a courier!";
            if (Platform.OS === 'web') {
                alert(`${title}: ${msg}`);
                navigation.navigate('Home');
            } else {
                Alert.alert(
                    title,
                    msg,
                    [{ text: "OK", onPress: () => navigation.navigate('Home') }]
                );
            }
        } catch (error: any) {
            if (Platform.OS === 'web') alert(`Order Error: ${error.message}`);
            else Alert.alert("Order Error", error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleFillMockData = () => {
        if (isDelivery) {
            setPickupAddress('123 Green Ave, Silicon Valley');
            setPickupCoords({ latitude: 37.78825, longitude: -122.4324 });
            setDropoffAddress('456 Blue Blvd, San Francisco');
            setDropoffCoords({ latitude: 37.8000, longitude: -122.4200 });
            setPackageDescription('Large Parcel with Electronics');
        } else {
            setErrandLocation('Whole Foods Market, SOMA');
            setErrandCoords({ latitude: 37.7700, longitude: -122.4000 });
            setDropoffAddress('My Apartment, 789 Red St');
            setDropoffCoords({ latitude: 37.7800, longitude: -122.4100 });
            setErrandList('Milk, Bread, Fresh Apples');
        }
        setShowErrors(false);
    };

    return (
        <LinearGradient
            colors={['#F8FAFC', '#E2E8F0']}
            style={styles.container}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
        >
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
            <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.keyboardView}
                >
                    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                        <View style={styles.headerContainer}>
                            <Text style={styles.header}>New {isDelivery ? 'Delivery' : 'Errand'}</Text>
                            <Text style={styles.subHeader}>Fill out the details below</Text>
                        </View>

                        <BlurView intensity={20} tint="light" style={styles.formCard}>
                            {isDelivery ? (
                                <View style={styles.formSection}>
                                    <View style={styles.sectionHeader}>
                                        <Text style={styles.sectionIcon}>📍</Text>
                                        <Text style={styles.sectionTitle}>Pickup Details</Text>
                                    </View>
                                    <Text style={styles.label}>Pickup Address</Text>
                                    <TouchableOpacity
                                        style={[styles.inputButton, showErrors && !pickupAddress ? styles.errorInput : null]}
                                        activeOpacity={0.7}
                                        onPress={() => navigation.navigate('MapLocationPicker', { locationType: 'pickup' })}
                                    >
                                        <Text style={pickupAddress ? styles.inputText : styles.placeholderText}>
                                            {pickupAddress || "Tap to select pickup on map"}
                                        </Text>
                                    </TouchableOpacity>

                                    <View style={styles.divider} />

                                    <View style={styles.sectionHeader}>
                                        <Text style={styles.sectionIcon}>🏁</Text>
                                        <Text style={styles.sectionTitle}>Drop-off Details</Text>
                                    </View>
                                    <Text style={styles.label}>Drop-off Address</Text>
                                    <TouchableOpacity
                                        style={[styles.inputButton, showErrors && !dropoffAddress ? styles.errorInput : null]}
                                        activeOpacity={0.7}
                                        onPress={() => navigation.navigate('MapLocationPicker', { locationType: 'dropoff' })}
                                    >
                                        <Text style={dropoffAddress ? styles.inputText : styles.placeholderText}>
                                            {dropoffAddress || "Tap to select drop-off on map"}
                                        </Text>
                                    </TouchableOpacity>

                                    <View style={styles.divider} />

                                    <View style={styles.sectionHeader}>
                                        <Text style={styles.sectionIcon}>📦</Text>
                                        <Text style={styles.sectionTitle}>Package Details</Text>
                                    </View>
                                    <Text style={styles.label}>What are we delivering?</Text>
                                    <TextInput
                                        style={[styles.input, styles.textArea]}
                                        placeholder="Describe the package (e.g., Documents, Electronics)"
                                        placeholderTextColor="#94A3B8"
                                        value={packageDescription}
                                        onChangeText={setPackageDescription}
                                        multiline
                                        selectionColor="#34A853"
                                    />
                                </View>
                            ) : (
                                <View style={styles.formSection}>
                                    <View style={styles.sectionHeader}>
                                        <Text style={styles.sectionIcon}>🛒</Text>
                                        <Text style={styles.sectionTitle}>Errand Details</Text>
                                    </View>
                                    <Text style={styles.label}>Store / Location</Text>
                                    <TouchableOpacity
                                        style={[styles.inputButton, showErrors && !errandLocation ? styles.errorInput : null]}
                                        activeOpacity={0.7}
                                        onPress={() => navigation.navigate('MapLocationPicker', { locationType: 'store' })}
                                    >
                                        <Text style={errandLocation ? styles.inputText : styles.placeholderText}>
                                            {errandLocation || "Tap to select store on map"}
                                        </Text>
                                    </TouchableOpacity>

                                    <View style={styles.divider} />

                                    <Text style={styles.label}>Shopping List / Instructions</Text>
                                    <TextInput
                                        style={[styles.input, styles.textArea]}
                                        placeholder="What do you need us to buy or do?"
                                        placeholderTextColor="#94A3B8"
                                        value={errandList}
                                        onChangeText={setErrandList}
                                        multiline
                                        selectionColor="#34A853"
                                    />

                                    <View style={styles.divider} />

                                    <View style={styles.sectionHeader}>
                                        <Text style={styles.sectionIcon}>🏁</Text>
                                        <Text style={styles.sectionTitle}>Delivery Details</Text>
                                    </View>
                                    <Text style={styles.label}>Delivery Address</Text>
                                    <TouchableOpacity
                                        style={[styles.inputButton, showErrors && !dropoffAddress ? styles.errorInput : null]}
                                        activeOpacity={0.7}
                                        onPress={() => navigation.navigate('MapLocationPicker', { locationType: 'dropoff' })}
                                    >
                                        <Text style={dropoffAddress ? styles.inputText : styles.placeholderText}>
                                            {dropoffAddress || "Tap to drop-off on map"}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </BlurView>

                        <View style={styles.summarySection}>
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Estimated Cost:</Text>
                                <Text style={styles.summaryTitle}>$12.50</Text>
                            </View>
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Payment Method:</Text>
                                <Text style={styles.summaryText}>Cash on Delivery</Text>
                            </View>
                        </View>

                        {Platform.OS === 'web' && (
                            <TouchableOpacity
                                style={styles.mockButton}
                                activeOpacity={0.7}
                                onPress={handleFillMockData}
                            >
                                <Text style={styles.mockButtonText}>Fill Mock Data (Testing)</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={styles.submitButtonContainer}
                            activeOpacity={0.8}
                            onPress={handlePlaceOrder}
                            disabled={loading}
                        >
                            <LinearGradient
                                colors={['#34A853', '#2E9348']}
                                style={styles.submitGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#FFFFFF" />
                                ) : (
                                    <Text style={styles.submitButtonText}>Confirm & Find Driver</Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>

                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
    },
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingTop: Platform.OS === 'android' ? 40 : 20,
        paddingBottom: 40,
    },
    headerContainer: {
        marginBottom: 24,
    },
    header: {
        fontSize: 32,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: -0.5,
        marginBottom: 4,
    },
    subHeader: {
        fontSize: 16,
        color: '#64748B',
    },
    formCard: {
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.6)',
        backgroundColor: 'rgba(255,255,255,0.4)',
        overflow: 'hidden',
        marginBottom: 24,
    },
    formSection: {
        flex: 1,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionIcon: {
        fontSize: 20,
        marginRight: 8,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#34A853',
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.05)',
        marginVertical: 24,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#334155',
        marginBottom: 8,
        marginLeft: 4,
    },
    input: {
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderRadius: 16,
        fontSize: 16,
        color: '#0F172A',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 4,
        elevation: 1,
    },
    inputButton: {
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 4,
        elevation: 1,
    },
    inputText: {
        fontSize: 16,
        color: '#0F172A',
        fontWeight: '500',
    },
    placeholderText: {
        fontSize: 16,
        color: '#94A3B8',
    },
    textArea: {
        height: 120,
        textAlignVertical: 'top',
    },
    errorInput: {
        borderColor: '#EF4444',
        borderWidth: 1.5,
    },
    summarySection: {
        backgroundColor: '#FFFFFF',
        padding: 20,
        borderRadius: 20,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(52, 168, 83, 0.2)',
        shadowColor: '#34A853',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    summaryLabel: {
        fontSize: 15,
        color: '#64748B',
        fontWeight: '500',
    },
    summaryTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#34A853',
    },
    summaryText: {
        fontSize: 15,
        color: '#0F172A',
        fontWeight: '600',
    },
    submitButtonContainer: {
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#34A853',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 6,
        marginBottom: 20,
    },
    submitGradient: {
        paddingVertical: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    submitButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    mockButton: {
        backgroundColor: '#F1F5F9',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#CBD5E1',
    },
    mockButtonText: {
        color: '#475569',
        fontSize: 15,
        fontWeight: '600',
    },
});
