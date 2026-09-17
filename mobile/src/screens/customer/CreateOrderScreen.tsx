import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, StatusBar, Image, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuthStore } from '../../store/authStore';
import { useOrderStore } from '../../store/orderStore';
import { orderService } from '../../services/orderService';
import * as ImagePicker from 'expo-image-picker';
import { aiService } from '../../services/aiService';
import { userService } from '../../services/userService';
import { supabase } from '../../utils/supabase';
import { PaymentMethod } from '../../types';

export const CreateOrderScreen = ({ route, navigation }: any) => {
    const { 
        pickupAddress, setPickup,
        dropoffAddress, setDropoff,
        pickupCoords, dropoffCoords,
        packageDescription, setPackageDesc,
        packageImage, setPackageImage,
        aiEstimate, setAIEstimate,
        errandLocation, setErrand,
        errandCoords, errandList, setErrandInstructions,
        serviceType, setServiceType,
        resetOrder
    } = useOrderStore();
    const { user } = useAuthStore();

    // AI States
    const [isScanning, setIsScanning] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);

    // Pricing States
    const [estimatedCost, setEstimatedCost] = useState(12.50);
    const [pricingSettings, setPricingSettings] = useState<{ base_delivery_fee: number; per_km_rate: number } | null>(null);
    const [bidPrice, setBidPrice] = useState<string>('12.50');

    // Voucher & Promo States
    const [promoCodeInput, setPromoCodeInput] = useState('');
    const [appliedVoucher, setAppliedVoucher] = useState<{
        code: string;
        discount: number;
        description: string;
    } | null>(null);
    const [validatingPromo, setValidatingPromo] = useState(false);
    const [promoMessage, setPromoMessage] = useState<{ text: string; isError: boolean } | null>(null);

    // Recipient Contact & Opt-in SMS Notification States
    const [isRecipientSelf, setIsRecipientSelf] = useState(true);
    const [recipientName, setRecipientName] = useState('');
    const [recipientPhone, setRecipientPhone] = useState('');
    const [recipientNotes, setRecipientNotes] = useState('');
    const [enableSmsUpdates, setEnableSmsUpdates] = useState(false);
    const [smsFee, setSmsFee] = useState(0.25);

    // Cancellation Debt States
    const [unsettledDebt, setUnsettledDebt] = useState<number>(0);
    const [debtModalVisible, setDebtModalVisible] = useState(false);
    const [settlingDebt, setSettlingDebt] = useState(false);
    const [debtPaymentMethod, setDebtPaymentMethod] = useState<'ecocash' | 'innbucks'>('ecocash');
    const [debtPaymentPhone, setDebtPaymentPhone] = useState('');

    useEffect(() => {
        if (user?.id) {
            checkCustomerDebt(user.id);
            setDebtPaymentPhone(user.phone || user.user_metadata?.phone || '');
        }
    }, [user?.id]);

    const checkCustomerDebt = async (customerId: string) => {
        try {
            const { totalDebt } = await orderService.getCustomerUnsettledDebt(customerId);
            setUnsettledDebt(totalDebt);
        } catch (err) {
            console.warn('Error checking customer debt:', err);
        }
    };

    const handleSettleDebt = async () => {
        if (!user?.id) return;
        if (!debtPaymentPhone || debtPaymentPhone.trim().length < 6) {
            Alert.alert('Phone Number Required', 'Please enter a valid phone number for payment.');
            return;
        }
        setSettlingDebt(true);
        try {
            const paymentRef = `DEBT-${Date.now()}`;
            await orderService.settleCancellationDebt(user.id, debtPaymentMethod, paymentRef);
            setUnsettledDebt(0);
            setDebtModalVisible(false);
            Alert.alert('Balance Cleared! 🎉', 'Your cancellation balance has been settled. You can now post new deliveries.');
        } catch (err: any) {
            Alert.alert('Payment Error', err?.message || 'Failed to clear cancellation balance.');
        } finally {
            setSettlingDebt(false);
        }
    };

    const handleApplyPromo = async () => {
        const cleanCode = promoCodeInput.trim().toUpperCase();
        if (!cleanCode) {
            setPromoMessage({ text: 'Please enter a promo code', isError: true });
            return;
        }

        const currentFare = parseFloat(bidPrice) || estimatedCost;
        setValidatingPromo(true);
        setPromoMessage(null);

        try {
            // 1. Query vouchers table for active voucher
            const { data: voucher, error } = await supabase
                .from('vouchers')
                .select('*')
                .eq('code', cleanCode)
                .eq('is_active', true)
                .single();

            if (error || !voucher) {
                // Fallback client check for default WELCOME263
                if (cleanCode === 'WELCOME263') {
                    if (currentFare < 4.00) {
                        setPromoMessage({ text: 'Requires minimum order of $4.00', isError: true });
                        return;
                    }
                    setAppliedVoucher({
                        code: 'WELCOME263',
                        discount: 2.00,
                        description: '$2.00 OFF Welcome Voucher'
                    });
                    setPromoMessage({ text: '✓ $2.00 Welcome Voucher applied!', isError: false });
                    return;
                }
                setPromoMessage({ text: 'Invalid or expired promo code', isError: true });
                return;
            }

            // 2. Validate minimum order amount
            const minAmount = parseFloat(voucher.min_order_amount || '4.00');
            if (currentFare < minAmount) {
                setPromoMessage({ text: `Requires minimum order of $${minAmount.toFixed(2)}`, isError: true });
                return;
            }

            // 3. Check if user already redeemed this voucher
            if (user) {
                const { data: redemption } = await supabase
                    .from('voucher_redemptions')
                    .select('id')
                    .eq('voucher_id', voucher.id)
                    .eq('user_id', user.id)
                    .single();

                if (redemption) {
                    setPromoMessage({ text: 'You have already redeemed this voucher', isError: true });
                    return;
                }
            }

            const discountVal = voucher.discount_type === 'percentage'
                ? Math.round((currentFare * (parseFloat(voucher.discount_value) / 100)) * 100) / 100
                : parseFloat(voucher.discount_value);

            setAppliedVoucher({
                code: voucher.code,
                discount: discountVal,
                description: voucher.description || `$${discountVal.toFixed(2)} OFF`
            });
            setPromoMessage({ text: `✓ ${voucher.code} applied! (-$${discountVal.toFixed(2)})`, isError: false });
        } catch (err: any) {
            console.error('Error validating promo code:', err);
            setPromoMessage({ text: 'Could not validate promo code', isError: true });
        } finally {
            setValidatingPromo(false);
        }
    };

    const handleRemovePromo = () => {
        setAppliedVoucher(null);
        setPromoCodeInput('');
        setPromoMessage(null);
    };

    // Sync custom bid with estimated cost updates
    useEffect(() => {
        setBidPrice(estimatedCost.toFixed(2));
    }, [estimatedCost]);

    const adjustBid = (amount: number) => {
        const current = parseFloat(bidPrice) || estimatedCost;
        const next = Math.max(0.50, current + amount);
        setBidPrice(next.toFixed(2));
    };

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
                    if (data.sms_notification_fee !== undefined && data.sms_notification_fee !== null) {
                        setSmsFee(parseFloat(data.sms_notification_fee) || 0.25);
                    }
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

    // Auth & Loading State
    const [loading, setLoading] = useState(false);
    const [showErrors, setShowErrors] = useState(false);

    // Payment Selection State
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash_on_delivery');
    const [paymentPhone, setPaymentPhone] = useState(user?.phone || user?.user_metadata?.phone || '');

    const isDelivery = serviceType === 'delivery';

    // Smart Errand Assistant Logic
    useEffect(() => {
        if (errandLocation) {
            generateSmartSuggestions(errandLocation);
        }
    }, [errandLocation]);

    const generateSmartSuggestions = (location: string) => {
        const loc = (location || '').toLowerCase();
        let items: string[] = [];
        
        if (loc.includes('pharmacy') || loc.includes('chemist') || loc.includes('med')) {
            items = ['Painkillers', 'Vitamins', 'First Aid Kit', 'Prescription', 'Face Masks'];
        } else if (loc.includes('grocery') || loc.includes('supermarket') || loc.includes('spar') || loc.includes('pick n pay')) {
            items = ['Milk (2L)', 'Fresh Bread', 'Eggs (Dozen)', 'Bottled Water', 'Snacks'];
        } else if (loc.includes('fast food') || loc.includes('pizza') || loc.includes('burger') || loc.includes('chicken')) {
            items = ['Combo Meal', 'Extra Fries', 'Large Soda', 'Napkins', 'Condiments'];
        } else if (loc.includes('office') || loc.includes('stationery') || loc.includes('print')) {
            items = ['A4 Paper', 'Ink Cartridge', 'Pens/Markers', 'Envelopes', 'Folders'];
        } else {
            items = ['General Pickup', 'Document Drop', 'Urgent Delivery', 'Small Package'];
        }
        setSuggestions(items);
    };

    const addSuggestionToErrand = (item: string) => {
        const currentList = (errandList || '').trim();
        const newList = currentList ? `${currentList}\n- ${item}` : `- ${item}`;
        setErrandInstructions(newList);
    };

    // Initialize service type from route if provided
    useEffect(() => {
        if (route.params?.serviceType) {
            setServiceType(route.params.serviceType);
        }
    }, [route.params?.serviceType]);

    // Handle incoming parameters from MapLocationPicker
    useEffect(() => {
        const { selectedCoordinate, selectedAddress, locationType, timestamp } = route.params || {};
        
        if (selectedCoordinate && selectedAddress && locationType && timestamp) {
            switch (locationType) {
                case 'pickup':
                    setPickup(selectedAddress, selectedCoordinate);
                    break;
                case 'dropoff':
                    setDropoff(selectedAddress, selectedCoordinate);
                    break;
                case 'store':
                    setErrand(selectedAddress, selectedCoordinate);
                    break;
            }
        }
    }, [route.params?.timestamp]);

    const handleScanPackage = async () => {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.status !== 'granted') {
            Alert.alert('Permission Denied', 'Camera access is required to scan your package.');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
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
            Alert.alert('Scan Error', 'No image data captured.');
            return;
        }
        setIsScanning(true);
        try {
            const result = await aiService.classifyPackage(base64Image);
            setAIEstimate(result.size_category);
            
            // Auto-populate dimensions in the description text field
            const prefix = `[AI Dimensions: ${result.dimensions} | Est. Weight: ${result.estimated_weight}]`;
            const newDesc = packageDescription ? `${prefix}\n${packageDescription}` : prefix;
            setPackageDesc(newDesc);

            Alert.alert(
                'AI Analysis Complete', 
                `Our AI detected a ${result.size_category} (${result.dimensions}, ${result.estimated_weight}). We've updated your vehicle recommendation.`
            );
        } catch (error: any) {
            console.error('Gemini classification error:', error);
            Alert.alert(
                'AI Scan Error', 
                'We couldn\'t classify the package automatically. Defaulting to standard categories.'
            );
            setAIEstimate('Medium Box');
        } finally {
            setIsScanning(false);
        }
    };

    const handlePlaceOrder = async () => {
        const hasPickup = isDelivery ? !!pickupAddress : !!errandLocation;
        const hasDropoff = !!dropoffAddress;

        if (!hasDropoff || !hasPickup) {
            setShowErrors(true);
            Alert.alert('Missing Fields', 'Please select both pickup and drop-off locations on the map.');
            return;
        }

        const offerAmount = parseFloat(bidPrice);
        if (isNaN(offerAmount) || offerAmount <= 0) {
            Alert.alert('Invalid Offer Price', 'Please enter a valid offer price before placing the order.');
            return;
        }

        if (unsettledDebt > 0) {
            Alert.alert(
                'Outstanding Balance',
                `You have an unsettled cancellation balance of $${unsettledDebt.toFixed(2)} USD from a previous delivery. Please clear this balance before requesting a new Mate.`,
                [
                    { text: 'Clear Balance Now', onPress: () => setDebtModalVisible(true) },
                    { text: 'Cancel', style: 'cancel' }
                ]
            );
            return;
        }

        setLoading(true);
        setShowErrors(false);
        try {
            if (!user) throw new Error("No user session found");

            const grossAmount = offerAmount;
            const discountAmount = appliedVoucher ? Math.min(appliedVoucher.discount, grossAmount) : 0;
            const smsAddonFee = enableSmsUpdates ? smsFee : 0;
            const finalPayable = Math.max(0.50, Math.round((grossAmount - discountAmount + smsAddonFee) * 100) / 100);

            if ((paymentMethod === 'ecocash' || paymentMethod === 'innbucks') && (!paymentPhone || paymentPhone.trim().length < 6)) {
                Alert.alert('Missing Mobile Number', `Please enter a valid ${paymentMethod === 'ecocash' ? 'EcoCash' : 'InnBucks'} mobile number.`);
                setLoading(false);
                return;
            }

            if (enableSmsUpdates) {
                const phoneForSms = !isRecipientSelf ? recipientPhone : (paymentPhone || user?.phone || user?.user_metadata?.phone);
                if (!phoneForSms || phoneForSms.trim().length < 6) {
                    Alert.alert('Mobile Number Required', 'Please enter a valid phone number for the recipient to receive SMS & WhatsApp milestone updates.');
                    setLoading(false);
                    return;
                }
            }

            const isCod = paymentMethod === 'cash_on_delivery';
            const cashToCollect = isCod ? finalPayable : 0.00;
            const paymentStatus = isCod ? 'unpaid' : 'paid';

            const createdOrder = await orderService.createOrder({
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
                estimated_cost: finalPayable,
                gross_amount: grossAmount,
                discount_amount: discountAmount,
                promo_code: appliedVoucher?.code || null,
                payment_method: paymentMethod,
                payment_status: paymentStatus,
                cash_to_collect: cashToCollect,
                payment_phone: paymentPhone ? paymentPhone.trim() : null,
                recipient_name: !isRecipientSelf && recipientName.trim() ? recipientName.trim() : (user?.user_metadata?.name || user?.email || 'Customer'),
                recipient_phone: !isRecipientSelf && recipientPhone.trim() ? recipientPhone.trim() : (paymentPhone || user?.phone || user?.user_metadata?.phone || null),
                recipient_notes: recipientNotes.trim() ? recipientNotes.trim() : null,
                sms_notifications_enabled: enableSmsUpdates,
                sms_notification_fee: smsAddonFee
            });

            // Record voucher redemption in background
            if (appliedVoucher && discountAmount > 0) {
                try {
                    const { data: vRecord } = await supabase
                        .from('vouchers')
                        .select('id')
                        .eq('code', appliedVoucher.code)
                        .single();

                    if (vRecord) {
                        await supabase.from('voucher_redemptions').insert([{
                            voucher_id: vRecord.id,
                            user_id: user.id,
                            order_id: createdOrder.id,
                            discount_applied: discountAmount
                        }]);
                    }
                } catch (vErr) {
                    console.warn('Non-blocking: could not record voucher redemption:', vErr);
                }
            }

            resetOrder();
            setIsRecipientSelf(true);
            setRecipientName('');
            setRecipientPhone('');
            setRecipientNotes('');
            setEnableSmsUpdates(false);
            setPaymentMethod('cash_on_delivery');
            setPaymentPhone(user?.phone || user?.user_metadata?.phone || '');
            setAppliedVoucher(null);
            setPromoCodeInput('');
            setPromoMessage(null);
            setEstimatedCost(pricingSettings?.base_delivery_fee ?? 5.00);
            setBidPrice((pricingSettings?.base_delivery_fee ?? 5.00).toFixed(2));
            
            Alert.alert(
                "Order Confirmed", 
                "Your request has been placed and is waiting for your Mate!", 
                [{ 
                    text: "Track Order", 
                    onPress: () => navigation.navigate('CustomerTracking', { orderId: createdOrder.id }) 
                }]
            );
        } catch (error: any) {
            Alert.alert("Order Error", error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleFillMockData = () => {
        if (isDelivery) {
            setPickup('123 Green Ave, Silicon Valley', { latitude: 37.78825, longitude: -122.4324 });
            setDropoff('456 Blue Blvd, San Francisco', { latitude: 37.8000, longitude: -122.4200 });
            setPackageDesc('Large Parcel with Electronics');
        } else {
            setErrand('Whole Foods Market, SOMA', { latitude: 37.7700, longitude: -122.4000 });
            setDropoff('My Apartment, 789 Red St', { latitude: 37.7800, longitude: -122.4100 });
            setErrandInstructions('- Milk\n- Bread\n- Fresh Apples');
        }
        setIsRecipientSelf(false);
        setRecipientName('Farai Gumbo');
        setRecipientPhone('+263772987654');
        setRecipientNotes('Ring buzzer 4B at the front security gate');
        setEnableSmsUpdates(true);
        setShowErrors(false);
    };

    const currentFare = parseFloat(bidPrice) || estimatedCost;
    const currentDiscount = appliedVoucher ? Math.min(appliedVoucher.discount, currentFare) : 0;
    const currentSmsFee = enableSmsUpdates ? smsFee : 0;
    const currentTotalPayable = Math.max(0.50, Math.round((currentFare - currentDiscount + currentSmsFee) * 100) / 100);

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

                        {unsettledDebt > 0 && (
                            <View style={styles.debtBanner}>
                                <View style={styles.debtBannerTop}>
                                    <Text style={styles.debtBannerIcon}>⚠️</Text>
                                    <View style={styles.debtBannerTextWrap}>
                                        <Text style={styles.debtBannerTitle}>Unsettled Cancellation Fee</Text>
                                        <Text style={styles.debtBannerDesc}>
                                            You have an outstanding balance of ${unsettledDebt.toFixed(2)} USD from a previous cancellation. Please clear this to post a new request.
                                        </Text>
                                    </View>
                                </View>
                                <TouchableOpacity
                                    style={styles.debtBannerActionBtn}
                                    activeOpacity={0.8}
                                    onPress={() => setDebtModalVisible(true)}
                                >
                                    <Text style={styles.debtBannerActionText}>Clear Balance (${unsettledDebt.toFixed(2)})</Text>
                                </TouchableOpacity>
                            </View>
                        )}

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
                                        onPress={() => navigation.navigate('MapLocationPicker', { locationType: 'pickup', serviceType })}
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
                                        onPress={() => navigation.navigate('MapLocationPicker', { locationType: 'dropoff', serviceType })}
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
                                    <Text style={styles.label}>Verify your package size for your Mate</Text>
                                    
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
                                            <ActivityIndicator color="#055FEE" />
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
                                        onChangeText={setPackageDesc}
                                        multiline
                                        selectionColor="#055FEE"
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
                                        onPress={() => navigation.navigate('MapLocationPicker', { locationType: 'store', serviceType })}
                                    >
                                        <Text style={errandLocation ? styles.inputText : styles.placeholderText}>
                                            {errandLocation || "Tap to select store on map"}
                                        </Text>
                                    </TouchableOpacity>

                                    <View style={styles.divider} />

                                    <Text style={styles.label}>Shopping List / Instructions</Text>
                                    
                                    {suggestions.length > 0 && (
                                        <View style={styles.suggestionsWrapper}>
                                            <Text style={styles.suggestionTitle}>AI SUGGESTIONS:</Text>
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionsScroll}>
                                                {suggestions.map((item, idx) => (
                                                    <TouchableOpacity 
                                                        key={idx} 
                                                        style={styles.suggestionChip}
                                                        onPress={() => addSuggestionToErrand(item)}
                                                    >
                                                        <Text style={styles.suggestionChipText}>+ {item}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </ScrollView>
                                        </View>
                                    )}

                                    <TextInput
                                        style={[styles.input, styles.textArea]}
                                        placeholder="What do you need us to buy or do?"
                                        placeholderTextColor="#94A3B8"
                                        value={errandList}
                                        onChangeText={setErrandInstructions}
                                        multiline
                                        selectionColor="#055FEE"
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
                                        onPress={() => navigation.navigate('MapLocationPicker', { locationType: 'dropoff', serviceType })}
                                    >
                                        <Text style={dropoffAddress ? styles.inputText : styles.placeholderText}>
                                            {dropoffAddress || "Tap to drop-off on map"}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </BlurView>

                        {/* Recipient Details Card */}
                        <BlurView intensity={20} tint="light" style={styles.formCard}>
                            <View style={styles.formSection}>
                                <View style={styles.sectionHeader}>
                                    <Text style={styles.sectionIcon}>👤</Text>
                                    <Text style={styles.sectionTitle}>Recipient & Delivery Contact</Text>
                                </View>
                                <Text style={styles.paymentSubTitle}>Who will receive this package upon arrival?</Text>

                                <View style={styles.tabToggleRow}>
                                    <TouchableOpacity
                                        style={[styles.tabToggleButton, isRecipientSelf && styles.tabToggleButtonActive]}
                                        onPress={() => setIsRecipientSelf(true)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.tabToggleText, isRecipientSelf && styles.tabToggleTextActive]}>
                                            🙋 I'll Receive It
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.tabToggleButton, !isRecipientSelf && styles.tabToggleButtonActive]}
                                        onPress={() => setIsRecipientSelf(false)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.tabToggleText, !isRecipientSelf && styles.tabToggleTextActive]}>
                                            👥 Someone Else
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                {!isRecipientSelf ? (
                                    <View style={styles.recipientFieldsWrap}>
                                        <Text style={styles.label}>Recipient's Full Name</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="e.g. Tendai Moyo"
                                            placeholderTextColor="#94A3B8"
                                            value={recipientName}
                                            onChangeText={setRecipientName}
                                            selectionColor="#055FEE"
                                        />

                                        <Text style={[styles.label, { marginTop: 12 }]}>Recipient's Phone Number</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="e.g. +263 77 123 4567"
                                            placeholderTextColor="#94A3B8"
                                            value={recipientPhone}
                                            onChangeText={setRecipientPhone}
                                            keyboardType="phone-pad"
                                            selectionColor="#055FEE"
                                        />

                                        <Text style={[styles.label, { marginTop: 12 }]}>Gate / Delivery Instructions</Text>
                                        <TextInput
                                            style={[styles.input, { height: 75, textAlignVertical: 'top' }]}
                                            placeholder="e.g. Gate code #4021, buzz 2B, or call upon arrival"
                                            placeholderTextColor="#94A3B8"
                                            value={recipientNotes}
                                            onChangeText={setRecipientNotes}
                                            multiline
                                            selectionColor="#055FEE"
                                        />
                                    </View>
                                ) : (
                                    <View style={styles.selfRecipientInfo}>
                                        <Text style={styles.selfRecipientInfoText}>
                                            ✓ Courier will contact you directly at: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{user?.phone || user?.user_metadata?.phone || 'Your registered account'}</Text>
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </BlurView>

                        {/* Opt-in SMS & WhatsApp Alerts Card */}
                        <BlurView intensity={20} tint="light" style={styles.formCard}>
                            <View style={styles.formSection}>
                                <View style={styles.sectionHeader}>
                                    <Text style={styles.sectionIcon}>📲</Text>
                                    <Text style={styles.sectionTitle}>Live SMS & WhatsApp Alerts</Text>
                                </View>
                                
                                <View style={styles.smsHeaderRow}>
                                    <View style={styles.smsPricePill}>
                                        <Text style={styles.smsPricePillText}>+${smsFee.toFixed(2)} USD</Text>
                                    </View>
                                    <Text style={styles.smsTagFreeBadge}>In-App Tracking is 100% FREE</Text>
                                </View>
                                
                                <Text style={styles.smsExplainerText}>
                                    Push notifications and live map tracking are always free. If your recipient doesn't have the ShipMate app or has mobile data turned off, opt in for automatic SMS and WhatsApp arrival alerts at their gate!
                                </Text>

                                <TouchableOpacity
                                    style={[styles.smsToggleCard, enableSmsUpdates && styles.smsToggleCardActive]}
                                    activeOpacity={0.8}
                                    onPress={() => setEnableSmsUpdates(!enableSmsUpdates)}
                                >
                                    <View style={styles.smsToggleRow}>
                                        <View style={[styles.smsCheckbox, enableSmsUpdates && styles.smsCheckboxActive]}>
                                            {enableSmsUpdates && <Text style={styles.smsCheckmark}>✓</Text>}
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.smsToggleTitle, enableSmsUpdates && styles.smsToggleTitleActive]}>
                                                {enableSmsUpdates ? '✓ SMS & WhatsApp Alerts Enabled' : 'Opt In for SMS & WhatsApp Alerts'}
                                            </Text>
                                            <Text style={styles.smsToggleDesc}>
                                                {enableSmsUpdates 
                                                    ? `Direct telco SMS & WhatsApp alerts will ping the recipient (+ $${smsFee.toFixed(2)})`
                                                    : `Only +$${smsFee.toFixed(2)} USD added to your delivery total`}
                                            </Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            </View>
                        </BlurView>

                        {/* Payment Method Selector Card */}
                        <BlurView intensity={20} tint="light" style={styles.formCard}>
                            <View style={styles.formSection}>
                                <View style={styles.sectionHeader}>
                                    <Text style={styles.sectionIcon}>💳</Text>
                                    <Text style={styles.sectionTitle}>Payment Method</Text>
                                </View>
                                <Text style={styles.paymentSubTitle}>Choose how you want to settle this delivery</Text>

                                <View style={styles.paymentOptionsGrid}>
                                    {/* Cash on Delivery */}
                                    <TouchableOpacity
                                        style={[styles.paymentOptionCard, paymentMethod === 'cash_on_delivery' && styles.paymentOptionCardActive]}
                                        activeOpacity={0.7}
                                        onPress={() => setPaymentMethod('cash_on_delivery')}
                                    >
                                        <View style={styles.paymentOptionContent}>
                                            <Text style={styles.paymentOptionEmoji}>💵</Text>
                                            <View style={styles.paymentOptionTextWrap}>
                                                <Text style={[styles.paymentOptionTitle, paymentMethod === 'cash_on_delivery' && styles.paymentOptionTitleActive]}>
                                                    Cash on Delivery
                                                </Text>
                                                <Text style={styles.paymentOptionDesc}>Pay physical USD/ZiG cash directly to courier</Text>
                                            </View>
                                            <View style={[styles.paymentRadio, paymentMethod === 'cash_on_delivery' && styles.paymentRadioActive]}>
                                                {paymentMethod === 'cash_on_delivery' && <View style={styles.paymentRadioDot} />}
                                            </View>
                                        </View>
                                    </TouchableOpacity>

                                    {/* EcoCash Mobile Money */}
                                    <TouchableOpacity
                                        style={[styles.paymentOptionCard, paymentMethod === 'ecocash' && styles.paymentOptionCardActive]}
                                        activeOpacity={0.7}
                                        onPress={() => setPaymentMethod('ecocash')}
                                    >
                                        <View style={styles.paymentOptionContent}>
                                            <Text style={styles.paymentOptionEmoji}>📱</Text>
                                            <View style={styles.paymentOptionTextWrap}>
                                                <Text style={[styles.paymentOptionTitle, paymentMethod === 'ecocash' && styles.paymentOptionTitleActive]}>
                                                    EcoCash
                                                </Text>
                                                <Text style={styles.paymentOptionDesc}>Instant mobile money payment prompt</Text>
                                            </View>
                                            <View style={[styles.paymentRadio, paymentMethod === 'ecocash' && styles.paymentRadioActive]}>
                                                {paymentMethod === 'ecocash' && <View style={styles.paymentRadioDot} />}
                                            </View>
                                        </View>
                                    </TouchableOpacity>

                                    {/* InnBucks */}
                                    <TouchableOpacity
                                        style={[styles.paymentOptionCard, paymentMethod === 'innbucks' && styles.paymentOptionCardActive]}
                                        activeOpacity={0.7}
                                        onPress={() => setPaymentMethod('innbucks')}
                                    >
                                        <View style={styles.paymentOptionContent}>
                                            <Text style={styles.paymentOptionEmoji}>⚡</Text>
                                            <View style={styles.paymentOptionTextWrap}>
                                                <Text style={[styles.paymentOptionTitle, paymentMethod === 'innbucks' && styles.paymentOptionTitleActive]}>
                                                    InnBucks
                                                </Text>
                                                <Text style={styles.paymentOptionDesc}>Direct payment from InnBucks account</Text>
                                            </View>
                                            <View style={[styles.paymentRadio, paymentMethod === 'innbucks' && styles.paymentRadioActive]}>
                                                {paymentMethod === 'innbucks' && <View style={styles.paymentRadioDot} />}
                                            </View>
                                        </View>
                                    </TouchableOpacity>

                                    {/* Card */}
                                    <TouchableOpacity
                                        style={[styles.paymentOptionCard, paymentMethod === 'card' && styles.paymentOptionCardActive]}
                                        activeOpacity={0.7}
                                        onPress={() => setPaymentMethod('card')}
                                    >
                                        <View style={styles.paymentOptionContent}>
                                            <Text style={styles.paymentOptionEmoji}>💳</Text>
                                            <View style={styles.paymentOptionTextWrap}>
                                                <Text style={[styles.paymentOptionTitle, paymentMethod === 'card' && styles.paymentOptionTitleActive]}>
                                                    Card / Online
                                                </Text>
                                                <Text style={styles.paymentOptionDesc}>Pay securely with Visa or Mastercard</Text>
                                            </View>
                                            <View style={[styles.paymentRadio, paymentMethod === 'card' && styles.paymentRadioActive]}>
                                                {paymentMethod === 'card' && <View style={styles.paymentRadioDot} />}
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                </View>

                                {/* Mobile Money Phone Input */}
                                {(paymentMethod === 'ecocash' || paymentMethod === 'innbucks') && (
                                    <View style={styles.paymentPhoneBox}>
                                        <Text style={styles.label}>
                                            {paymentMethod === 'ecocash' ? 'EcoCash Phone Number' : 'InnBucks Registered Mobile'}
                                        </Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="e.g. 0772123456"
                                            placeholderTextColor="#94A3B8"
                                            value={paymentPhone}
                                            onChangeText={setPaymentPhone}
                                            keyboardType="phone-pad"
                                            selectionColor="#055FEE"
                                        />
                                    </View>
                                )}
                            </View>
                        </BlurView>

                        <View style={styles.summarySection}>
                            {/* Promo Code Input Section */}
                            <View style={styles.promoSection}>
                                <Text style={styles.promoTitle}>🎁 Have a Promo Code?</Text>
                                <View style={styles.promoRow}>
                                    <TextInput
                                        style={styles.promoInput}
                                        value={promoCodeInput}
                                        onChangeText={(text) => {
                                            setPromoCodeInput(text.toUpperCase());
                                            setPromoMessage(null);
                                        }}
                                        placeholder="e.g. WELCOME263"
                                        placeholderTextColor="#94A3B8"
                                        autoCapitalize="characters"
                                        editable={!appliedVoucher}
                                    />
                                    {appliedVoucher ? (
                                        <TouchableOpacity 
                                            style={styles.promoRemoveBtn} 
                                            onPress={handleRemovePromo}
                                        >
                                            <Text style={styles.promoRemoveBtnText}>Remove</Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <TouchableOpacity 
                                            style={styles.promoApplyBtn} 
                                            onPress={handleApplyPromo}
                                            disabled={validatingPromo}
                                        >
                                            {validatingPromo ? (
                                                <ActivityIndicator size="small" color="#FFFFFF" />
                                            ) : (
                                                <Text style={styles.promoApplyBtnText}>Apply</Text>
                                            )}
                                        </TouchableOpacity>
                                    )}
                                </View>

                                {promoMessage && (
                                    <Text style={[styles.promoMessageText, promoMessage.isError ? styles.promoErrorText : styles.promoSuccessText]}>
                                        {promoMessage.text}
                                    </Text>
                                )}
                            </View>

                            <View style={styles.bidDivider} />

                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Estimated Cost:</Text>
                                <Text style={styles.summaryTitle}>${estimatedCost.toFixed(2)}</Text>
                            </View>

                            <View style={styles.bidSection}>
                                <View style={styles.bidHeaderRow}>
                                    <Text style={styles.bidLabel}>Your Offer Price ($):</Text>
                                    <Text style={styles.bidHint}>Adjust to match your budget</Text>
                                </View>
                                <View style={styles.bidContainer}>
                                    <TouchableOpacity 
                                        style={styles.bidAdjustButton}
                                        onPress={() => adjustBid(-1.00)}
                                    >
                                        <Text style={styles.bidAdjustButtonText}>-</Text>
                                    </TouchableOpacity>
                                    
                                    <TextInput
                                        style={styles.bidInput}
                                        value={bidPrice}
                                        onChangeText={setBidPrice}
                                        keyboardType="decimal-pad"
                                        placeholder={estimatedCost.toFixed(2)}
                                        selectionColor="#055FEE"
                                    />
                                    
                                    <TouchableOpacity 
                                        style={styles.bidAdjustButton}
                                        onPress={() => adjustBid(1.00)}
                                    >
                                        <Text style={styles.bidAdjustButtonText}>+</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {appliedVoucher && (
                                <>
                                    <View style={styles.bidDivider} />
                                    <View style={styles.summaryRow}>
                                        <Text style={styles.summaryLabel}>Subtotal Fare:</Text>
                                        <Text style={styles.summaryText}>${currentFare.toFixed(2)}</Text>
                                    </View>
                                    <View style={styles.summaryRow}>
                                        <Text style={[styles.summaryLabel, { color: '#10B981', fontWeight: '700' }]}>
                                            Voucher ({appliedVoucher.code}):
                                        </Text>
                                        <Text style={[styles.summaryText, { color: '#10B981', fontWeight: '800' }]}>
                                            -${currentDiscount.toFixed(2)}
                                        </Text>
                                    </View>
                                </>
                            )}

                            {enableSmsUpdates && (
                                <>
                                    {!appliedVoucher && <View style={styles.bidDivider} />}
                                    <View style={styles.summaryRow}>
                                        <Text style={[styles.summaryLabel, { color: '#055FEE', fontWeight: '600' }]}>
                                            📲 SMS & WhatsApp Add-on:
                                        </Text>
                                        <Text style={[styles.summaryText, { color: '#055FEE', fontWeight: '700' }]}>
                                            +${smsFee.toFixed(2)}
                                        </Text>
                                    </View>
                                </>
                            )}

                            <View style={styles.bidDivider} />

                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Total to Pay:</Text>
                                <Text style={[styles.summaryTitle, { color: appliedVoucher ? '#10B981' : '#055FEE' }]}>
                                    ${currentTotalPayable.toFixed(2)}
                                </Text>
                            </View>

                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Payment Method:</Text>
                                <Text style={[styles.summaryText, { fontWeight: '700', color: paymentMethod === 'cash_on_delivery' ? '#D97706' : '#055FEE' }]}>
                                    {paymentMethod === 'cash_on_delivery' 
                                        ? '💵 Cash on Delivery' 
                                        : paymentMethod === 'ecocash'
                                        ? '📱 EcoCash Mobile Money'
                                        : paymentMethod === 'innbucks'
                                        ? '⚡ InnBucks Digital'
                                        : '💳 Card Payment'}
                                </Text>
                            </View>

                            {/* Payment Directive Banner for Customer */}
                            <View style={[styles.customerPaymentBanner, paymentMethod === 'cash_on_delivery' ? styles.customerPaymentBannerCod : styles.customerPaymentBannerDigital]}>
                                <Text style={styles.customerPaymentBannerIcon}>
                                    {paymentMethod === 'cash_on_delivery' ? '💵' : '✅'}
                                </Text>
                                <View style={styles.customerPaymentBannerTextWrap}>
                                    <Text style={[styles.customerPaymentBannerTitle, paymentMethod === 'cash_on_delivery' ? styles.customerPaymentBannerTitleCod : styles.customerPaymentBannerTitleDigital]}>
                                        {paymentMethod === 'cash_on_delivery' ? 'Prepare Cash for Courier' : 'Digital Payment Selected'}
                                    </Text>
                                    <Text style={styles.customerPaymentBannerDesc}>
                                        {paymentMethod === 'cash_on_delivery'
                                            ? `Please have $${currentTotalPayable.toFixed(2)} USD ready for your courier upon delivery.`
                                            : 'Payment is processed digitally. Do NOT give physical cash to your courier.'}
                                    </Text>
                                </View>
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
                                colors={['#055FEE', '#5B99F2']}
                                style={styles.submitGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#FFFFFF" />
                                ) : (
                                    <Text style={styles.submitButtonText}>Confirm & Find your Mate</Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>

                    </ScrollView>
                </KeyboardAvoidingView>

                {/* Debt Clearance Modal */}
                <Modal
                    visible={debtModalVisible}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setDebtModalVisible(false)}
                >
                    <View style={styles.debtModalOverlay}>
                        <View style={styles.debtModalCard}>
                            <View style={styles.debtModalHeader}>
                                <Text style={styles.debtModalTitle}>Clear Outstanding Balance</Text>
                                <TouchableOpacity onPress={() => setDebtModalVisible(false)}>
                                    <Text style={styles.debtModalClose}>✕</Text>
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.debtModalAmount}>
                                ${unsettledDebt.toFixed(2)} <Text style={styles.debtModalCurrency}>USD</Text>
                            </Text>
                            <Text style={styles.debtModalExplainer}>
                                This fee was incurred from a previous courier cancellation based on distance traveled. Clearing this settles your account immediately.
                            </Text>

                            <Text style={styles.debtPaymentLabel}>Select Mobile Money Provider:</Text>
                            <View style={styles.debtPaymentOptions}>
                                <TouchableOpacity
                                    style={[styles.debtProviderBtn, debtPaymentMethod === 'ecocash' && styles.debtProviderBtnActive]}
                                    onPress={() => setDebtPaymentMethod('ecocash')}
                                >
                                    <Text style={[styles.debtProviderText, debtPaymentMethod === 'ecocash' && styles.debtProviderTextActive]}>📱 EcoCash</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.debtProviderBtn, debtPaymentMethod === 'innbucks' && styles.debtProviderBtnActive]}
                                    onPress={() => setDebtPaymentMethod('innbucks')}
                                >
                                    <Text style={[styles.debtProviderText, debtPaymentMethod === 'innbucks' && styles.debtProviderTextActive]}>⚡ InnBucks</Text>
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.debtPaymentLabel}>Mobile Number:</Text>
                            <TextInput
                                style={styles.debtPhoneInput}
                                placeholder="e.g. 0771234567"
                                placeholderTextColor="#94A3B8"
                                value={debtPaymentPhone}
                                onChangeText={setDebtPaymentPhone}
                                keyboardType="phone-pad"
                            />

                            <TouchableOpacity
                                style={styles.debtSettleBtn}
                                onPress={handleSettleDebt}
                                disabled={settlingDebt}
                            >
                                {settlingDebt ? (
                                    <ActivityIndicator color="#FFFFFF" />
                                ) : (
                                    <Text style={styles.debtSettleBtnText}>Pay & Clear ${unsettledDebt.toFixed(2)} USD</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
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
    debtBanner: {
        backgroundColor: '#FFFBEB',
        borderWidth: 1.5,
        borderColor: '#F59E0B',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
    },
    debtBannerTop: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 12,
    },
    debtBannerIcon: {
        fontSize: 24,
    },
    debtBannerTextWrap: {
        flex: 1,
    },
    debtBannerTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#92400E',
        marginBottom: 4,
    },
    debtBannerDesc: {
        fontSize: 13,
        color: '#B45309',
        lineHeight: 18,
    },
    debtBannerActionBtn: {
        backgroundColor: '#D97706',
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    debtBannerActionText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
    debtModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        padding: 24,
    },
    debtModalCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 10,
    },
    debtModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    debtModalTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
    },
    debtModalClose: {
        fontSize: 20,
        color: '#94A3B8',
        fontWeight: '700',
    },
    debtModalAmount: {
        fontSize: 36,
        fontWeight: '900',
        color: '#DC2626',
        textAlign: 'center',
        marginBottom: 8,
    },
    debtModalCurrency: {
        fontSize: 18,
        fontWeight: '600',
        color: '#64748B',
    },
    debtModalExplainer: {
        fontSize: 13,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 20,
    },
    debtPaymentLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#334155',
        marginBottom: 8,
    },
    debtPaymentOptions: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    debtProviderBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
    },
    debtProviderBtnActive: {
        borderColor: '#055FEE',
        backgroundColor: '#EFF6FF',
    },
    debtProviderText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#64748B',
    },
    debtProviderTextActive: {
        color: '#055FEE',
    },
    debtPhoneInput: {
        backgroundColor: '#F8FAFC',
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 15,
        color: '#0F172A',
        marginBottom: 24,
    },
    debtSettleBtn: {
        backgroundColor: '#055FEE',
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
    },
    debtSettleBtnText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '800',
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
        color: '#055FEE',
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
        borderColor: 'rgba(176, 106, 40, 0.3)',
        shadowColor: '#055FEE',
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
        color: '#055FEE',
    },
    summaryText: {
        fontSize: 15,
        color: '#0F172A',
        fontWeight: '600',
    },
    submitButtonContainer: {
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#055FEE',
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
        color: '#0F172A',
        fontSize: 16,
        fontWeight: 'bold',
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
        backgroundColor: 'rgba(5, 95, 238, 0.1)',
        padding: 16,
        borderRadius: 16,
        marginBottom: 16,
        gap: 12,
        borderWidth: 1,
        borderColor: 'rgba(176, 106, 40, 0.3)',
    },
    scanningText: {
        color: '#055FEE',
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
        color: '#055FEE',
        fontWeight: '900',
        fontSize: 14,
    },
    suggestionsWrapper: {
        marginBottom: 12,
    },
    suggestionTitle: {
        fontSize: 10,
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 1,
        marginBottom: 8,
        marginLeft: 4,
    },
    suggestionsScroll: {
        gap: 8,
        paddingBottom: 4,
    },
    suggestionChip: {
        backgroundColor: 'rgba(5, 95, 238, 0.1)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(176, 106, 40, 0.3)',
    },
    suggestionChipText: {
        color: '#055FEE',
        fontSize: 13,
        fontWeight: '600',
    },
    bidSection: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.05)',
    },
    bidHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    bidLabel: {
        fontSize: 15,
        fontWeight: '700',
        color: '#475569',
    },
    bidHint: {
        fontSize: 11,
        color: '#94A3B8',
        fontWeight: '600',
    },
    bidContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.05)',
        paddingHorizontal: 8,
        paddingVertical: 6,
    },
    bidAdjustButton: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.05)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    bidAdjustButtonText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#055FEE',
    },
    bidInput: {
        flex: 1,
        textAlign: 'center',
        fontSize: 20,
        fontWeight: '800',
        color: '#055FEE',
        paddingVertical: 8,
    },
    bidDivider: {
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.05)',
        marginVertical: 16,
    },
    promoSection: {
        marginBottom: 16,
    },
    promoTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#334155',
        marginBottom: 8,
        marginLeft: 2,
    },
    promoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    promoInput: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 14,
        fontWeight: '700',
        color: '#0F172A',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.08)',
        letterSpacing: 1,
    },
    promoApplyBtn: {
        backgroundColor: '#055FEE',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    promoApplyBtnText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 13,
    },
    promoRemoveBtn: {
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    promoRemoveBtnText: {
        color: '#EF4444',
        fontWeight: '700',
        fontSize: 12,
    },
    promoMessageText: {
        fontSize: 12,
        fontWeight: '600',
        marginTop: 6,
        marginLeft: 4,
    },
    promoErrorText: {
        color: '#EF4444',
    },
    promoSuccessText: {
        color: '#10B981',
    },
    // Payment Method Styles
    paymentSubTitle: {
        fontSize: 13,
        color: '#64748B',
        marginBottom: 14,
        fontWeight: '500',
    },
    paymentOptionsGrid: {
        gap: 10,
        marginBottom: 8,
    },
    paymentOptionCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 14,
        borderWidth: 1.5,
        borderColor: 'rgba(0,0,0,0.06)',
    },
    paymentOptionCardActive: {
        borderColor: '#055FEE',
        backgroundColor: '#F0F7FF',
    },
    paymentOptionContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    paymentOptionEmoji: {
        fontSize: 24,
        marginRight: 12,
    },
    paymentOptionTextWrap: {
        flex: 1,
    },
    paymentOptionTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1E293B',
        marginBottom: 2,
    },
    paymentOptionTitleActive: {
        color: '#055FEE',
    },
    paymentOptionDesc: {
        fontSize: 12,
        color: '#64748B',
    },
    paymentRadio: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#CBD5E1',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
    paymentRadioActive: {
        borderColor: '#055FEE',
    },
    paymentRadioDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#055FEE',
    },
    paymentPhoneBox: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.06)',
    },
    customerPaymentBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 16,
        marginTop: 16,
        gap: 12,
    },
    customerPaymentBannerCod: {
        backgroundColor: '#FEF3C7',
        borderWidth: 1,
        borderColor: '#F59E0B',
    },
    customerPaymentBannerDigital: {
        backgroundColor: '#ECFDF5',
        borderWidth: 1,
        borderColor: '#10B981',
    },
    customerPaymentBannerIcon: {
        fontSize: 24,
    },
    customerPaymentBannerTextWrap: {
        flex: 1,
    },
    customerPaymentBannerTitle: {
        fontSize: 14,
        fontWeight: '800',
        marginBottom: 2,
    },
    customerPaymentBannerTitleCod: {
        color: '#B45309',
    },
    customerPaymentBannerTitleDigital: {
        color: '#065F46',
    },
    customerPaymentBannerDesc: {
        fontSize: 12,
        color: '#475569',
        lineHeight: 16,
    },
    // Recipient Selector Styles
    tabToggleRow: {
        flexDirection: 'row',
        backgroundColor: '#F1F5F9',
        borderRadius: 14,
        padding: 4,
        marginBottom: 16,
        gap: 6,
    },
    tabToggleButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tabToggleButtonActive: {
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 1,
    },
    tabToggleText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748B',
    },
    tabToggleTextActive: {
        color: '#055FEE',
        fontWeight: '700',
    },
    recipientFieldsWrap: {
        gap: 4,
    },
    selfRecipientInfo: {
        backgroundColor: 'rgba(5, 95, 238, 0.06)',
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(5, 95, 238, 0.15)',
    },
    selfRecipientInfoText: {
        fontSize: 13,
        color: '#334155',
        lineHeight: 18,
    },
    // SMS & WhatsApp Opt-in Card Styles
    smsHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
        flexWrap: 'wrap',
        gap: 8,
    },
    smsPricePill: {
        backgroundColor: '#FEF3C7',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#FDE68A',
    },
    smsPricePillText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#B45309',
    },
    smsTagFreeBadge: {
        fontSize: 11,
        fontWeight: '700',
        color: '#059669',
        backgroundColor: '#D1FAE5',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    smsExplainerText: {
        fontSize: 12,
        color: '#64748B',
        lineHeight: 17,
        marginBottom: 14,
    },
    smsToggleCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 14,
        borderWidth: 1.5,
        borderColor: 'rgba(0,0,0,0.06)',
    },
    smsToggleCardActive: {
        borderColor: '#10B981',
        backgroundColor: '#F0FDF4',
    },
    smsToggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    smsCheckbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#CBD5E1',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
    },
    smsCheckboxActive: {
        borderColor: '#10B981',
        backgroundColor: '#10B981',
    },
    smsCheckmark: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '900',
    },
    smsToggleTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1E293B',
        marginBottom: 2,
    },
    smsToggleTitleActive: {
        color: '#047857',
    },
    smsToggleDesc: {
        fontSize: 12,
        color: '#64748B',
    },
});
