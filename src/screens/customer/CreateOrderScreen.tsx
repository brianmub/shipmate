import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, StatusBar, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { orderService } from '../../services/orderService';
import { useAuthStore } from '../../store/authStore';
import * as ImagePicker from 'expo-image-picker';
import { aiService } from '../../services/aiService';
import { userService } from '../../services/userService';

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

    // AI scanning states
    const [packageImage, setPackageImage] = useState<string | null>(null);
    const [aiEstimate, setAiEstimate] = useState<string>('');
    const [isScanning, setIsScanning] = useState(false);

    // Pricing States
    const [estimatedCost, setEstimatedCost] = useState(12.50);
    const [pricingSettings, setPricingSettings] = useState<{ base_delivery_fee: number; per_km_rate: number } | null>(null);

    // Fetch settings on load
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const data = await userService.getSystemSettings();
                if (data) {
                    setPricingSettings({
                        base_delivery_fee: parseFloat(data.base_delivery_fee || '5.00'),
                        per_km_rate: parseFloat(data.per_km_rate || '1.50')
                    });
                }
            } catch (err) {
                console.error('Failed to load system settings for pricing:', err);
            }
        };
        fetchSettings();
    }, []);

    // Calculate price dynamically when coords change
    useEffect(() => {
        const baseFee = pricingSettings?.base_delivery_fee ?? 5.00;
        const perKmRate = pricingSettings?.per_km_rate ?? 1.50;

        const startCoords = isDelivery ? pickupCoords : errandCoords;
        const endCoords = dropoffCoords;

        if (startCoords && endCoords) {
            // Calculate Haversine distance
            const R = 6371; // Earth radius in km
            const dLat = (endCoords.latitude - startCoords.latitude) * Math.PI / 180;
            const dLon = (endCoords.longitude - startCoords.longitude) * Math.PI / 180;
            const a = 
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(startCoords.latitude * Math.PI / 180) * Math.cos(endCoords.latitude * Math.PI / 180) * 
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distance = R * c;

            // Compute fee: base fee + (distance * per km rate)
            const calculatedCost = baseFee + (distance * perKmRate);
            setEstimatedCost(Math.round(calculatedCost * 100) / 100);
        } else {
            // Default base fee if coordinates are not fully selected
            setEstimatedCost(baseFee);
        }
    }, [pickupCoords, dropoffCoords, errandCoords, serviceType, pricingSettings]);

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

    const handleScanPackage = async () => {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.status !== 'granted') {
            if (Platform.OS === 'web') alert('Camera access is required to scan your package.');
            else Alert.alert('Permission Denied', 'Camera access is required to scan your package.');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.5,
            base64: true,
        });

        if (!result.canceled) {
            setPackageImage(result.assets[0].uri);
            performAIScan(result.assets[0].base64 || undefined);
        }
    };

    const performAIScan = async (base64Image?: string) => {
        if (!base64Image) {
            if (Platform.OS === 'web') alert('No image data captured.');
            else Alert.alert('Scan Error', 'No image data captured.');
            return;
        }
        setIsScanning(true);
        try {
            const result = await aiService.classifyPackage(base64Image);
            setAiEstimate(result.size_category);
            
            // Auto-populate dimensions in the description text field
            setPackageDescription((prev: string) => {
                const prefix = `[AI Dimensions: ${result.dimensions} | Est. Weight: ${result.estimated_weight}]`;
                return prev ? `${prefix}\n${prev}` : prefix;
            });

            const title = 'AI Analysis Complete';
            const msg = `Our AI detected a ${result.size_category} (${result.dimensions}, ${result.estimated_weight}). We've updated your vehicle recommendation.`;
            if (Platform.OS === 'web') alert(`${title}: ${msg}`);
            else Alert.alert(title, msg);
        } catch (error: any) {
            console.error('Gemini classification error:', error);
            if (Platform.OS === 'web') alert('We couldn\'t classify the package automatically. Defaulting to standard categories.');
            else Alert.alert(
                'AI Scan Error', 
                'We couldn\'t classify the package automatically. Defaulting to standard categories.'
            );
            setAiEstimate('Medium Box');
        } finally {
            setIsScanning(false);
        }
    };

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

            const order = await orderService.createOrder({
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
                package_image_url: packageImage,
                ai_size_estimate: aiEstimate,
                estimated_cost: estimatedCost
            });

            // Reset local states
            setPickupAddress('');
            setPickupCoords(null);
            setDropoffAddress('');
            setDropoffCoords(null);
            setPackageDescription('');
            setPackageImage(null);
            setAiEstimate('');
            setEstimatedCost(pricingSettings?.base_delivery_fee ?? 5.00);

            const title = "Order Confirmed";
            const msg = "Your request has been placed and is waiting for a courier!";
            if (Platform.OS === 'web') {
                alert(`${title}: ${msg}`);
                navigation.navigate('CustomerTracking', { orderId: order.id });
            } else {
                Alert.alert(
                    title,
                    msg,
                    [{ text: "OK", onPress: () => navigation.navigate('CustomerTracking', { orderId: order.id }) }]
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
                                        <Text style={styles.sectionIcon}>📷</Text>
                                        <Text style={styles.sectionTitle}>Vision AI Scan</Text>
                                    </View>
                                    <Text style={styles.label}>Verify your package size for the driver</Text>
                                    
                                    <TouchableOpacity 
                                        style={styles.scanButton}
                                        onPress={handleScanPackage}
                                        disabled={isScanning}
                                    >
                                        <LinearGradient
                                            colors={['#0F172A', '#1E293B']}
                                            style={styles.scanGradient}
                                        >
                                            <Text style={styles.scanIcon}>📸</Text>
                                            <Text style={styles.scanText}>
                                                {packageImage ? 'Retake Photo' : 'Scan Package with AI'}
                                            </Text>
                                        </LinearGradient>
                                    </TouchableOpacity>

                                    {isScanning && (
                                        <View style={styles.scanningContainer}>
                                            <ActivityIndicator color="#34A853" />
                                            <Text style={styles.scanningText}>AI Analyzing Package...</Text>
                                        </View>
                                    )}

                                    {packageImage && !isScanning && (
                                        <View style={styles.previewContainer}>
                                            <Image source={{ uri: packageImage }} style={styles.imagePreview} />
                                            <BlurView intensity={80} tint="dark" style={styles.aiBadge}>
                                                <Text style={styles.aiBadgeLabel}>AI DETECTED:</Text>
                                                <Text style={styles.aiBadgeValue}>{aiEstimate || 'Calculating...'}</Text>
                                            </BlurView>
                                        </View>
                                    )}

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
                                <Text style={styles.summaryTitle}>${estimatedCost.toFixed(2)}</Text>
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
    scanButton: {
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 16,
    },
    scanGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        gap: 12,
    },
    scanIcon: {
        fontSize: 20,
    },
    scanText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 15,
    },
    scanningContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(52, 168, 83, 0.1)',
        padding: 16,
        borderRadius: 16,
        marginBottom: 16,
        gap: 12,
        borderWidth: 1,
        borderColor: 'rgba(52, 168, 83, 0.3)',
    },
    scanningText: {
        color: '#34A853',
        fontWeight: '600',
    },
    previewContainer: {
        width: '100%',
        height: 200,
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    imagePreview: {
        width: '100%',
        height: '100%',
    },
    aiBadge: {
        position: 'absolute',
        bottom: 12,
        left: 12,
        right: 12,
        padding: 12,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        overflow: 'hidden',
    },
    aiBadgeLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1,
    },
    aiBadgeValue: {
        color: '#34A853',
        fontWeight: '900',
        fontSize: 14,
    },
});
