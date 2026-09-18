import React, { useState, useEffect, useRef } from 'react';
import { 
    View, 
    Text, 
    TextInput, 
    StyleSheet, 
    ScrollView, 
    TouchableOpacity, 
    Alert, 
    ActivityIndicator, 
    KeyboardAvoidingView, 
    Platform, 
    StatusBar, 
    Image, 
    Modal,
    Keyboard
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { useOrderStore } from '../../store/orderStore';
import { orderService } from '../../services/orderService';
import * as ImagePicker from 'expo-image-picker';
import { aiService } from '../../services/aiService';
import { userService } from '../../services/userService';
import { supabase } from '../../utils/supabase';
import { PaymentMethod } from '../../types';
import { locationSearchService, AddressSuggestion } from '../../services/locationSearchService';

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

    // Wizard Step: 1 = Route & Package, 2 = Recipient, 3 = Payment & Fare
    const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

    // AI States
    const [isScanning, setIsScanning] = useState(false);
    const [errandSuggestions, setErrandSuggestions] = useState<string[]>([]);

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

    // Inline Address Suggestion States
    const [activeAddressField, setActiveAddressField] = useState<'pickup' | 'dropoff' | 'errand' | null>(null);
    const [inlineSuggestions, setInlineSuggestions] = useState<AddressSuggestion[]>([]);
    const [loadingInlineSuggestions, setLoadingInlineSuggestions] = useState(false);
    const inlineSearchDebounce = useRef<any>(null);

    // Cancellation Debt States
    const [unsettledDebt, setUnsettledDebt] = useState<number>(0);
    const [debtModalVisible, setDebtModalVisible] = useState(false);
    const [settlingDebt, setSettlingDebt] = useState(false);
    const [debtPaymentMethod, setDebtPaymentMethod] = useState<'ecocash' | 'innbucks'>('ecocash');
    const [debtPaymentPhone, setDebtPaymentPhone] = useState('');

    // Payment Selection State
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash_on_delivery');
    const [paymentPhone, setPaymentPhone] = useState(user?.phone || user?.user_metadata?.phone || '');

    // Auth & Loading State
    const [loading, setLoading] = useState(false);
    const [stepErrors, setStepErrors] = useState<{ [key: string]: string }>({});

    const isDelivery = serviceType === 'delivery';

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
            setActiveAddressField(null);
            setInlineSuggestions([]);
        }
    }, [route.params?.timestamp]);

    // Fetch system settings on load
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
            const R = 6371; // Earth radius in km
            const dLat = (endCoords.latitude - startCoords.latitude) * Math.PI / 180;
            const dLon = (endCoords.longitude - startCoords.longitude) * Math.PI / 180;
            const a = 
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(startCoords.latitude * Math.PI / 180) * Math.cos(endCoords.latitude * Math.PI / 180) * 
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distance = R * c;

            const calculatedCost = baseFee + (distance * perKmRate);
            setEstimatedCost(Math.round(calculatedCost * 100) / 100);
        } else {
            setEstimatedCost(baseFee);
        }
    }, [pickupCoords, dropoffCoords, errandCoords, serviceType, pricingSettings]);

    // Sync custom bid with estimated cost updates
    useEffect(() => {
        setBidPrice(estimatedCost.toFixed(2));
    }, [estimatedCost]);

    const adjustBid = (amount: number) => {
        const current = parseFloat(bidPrice) || estimatedCost;
        const next = Math.max(0.50, current + amount);
        setBidPrice(next.toFixed(2));
    };

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
        } else if (loc.includes('grocery') || loc.includes('supermarket') || loc.includes('spar') || loc.includes('pick n pay') || loc.includes('ok')) {
            items = ['Milk (2L)', 'Fresh Bread', 'Eggs (Dozen)', 'Bottled Water', 'Snacks'];
        } else if (loc.includes('fast food') || loc.includes('pizza') || loc.includes('burger') || loc.includes('chicken') || loc.includes('kfc')) {
            items = ['Combo Meal', 'Extra Fries', 'Large Soda', 'Napkins', 'Sauces'];
        } else if (loc.includes('office') || loc.includes('stationery') || loc.includes('print')) {
            items = ['A4 Paper', 'Ink Cartridge', 'Pens/Markers', 'Envelopes', 'Notebooks'];
        } else {
            items = ['General Pickup', 'Document Drop', 'Urgent Delivery', 'Small Package'];
        }
        setErrandSuggestions(items);
    };

    const addSuggestionToErrand = (item: string) => {
        const currentList = (errandList || '').trim();
        const newList = currentList ? `${currentList}\n- ${item}` : `- ${item}`;
        setErrandInstructions(newList);
    };

    // Live address search suggestions inline
    const handleInlineAddressSearch = (text: string, field: 'pickup' | 'dropoff' | 'errand') => {
        setActiveAddressField(field);

        if (field === 'pickup') setPickup(text, null);
        else if (field === 'dropoff') setDropoff(text, null);
        else if (field === 'errand') setErrand(text, null);

        if (inlineSearchDebounce.current) clearTimeout(inlineSearchDebounce.current);

        if (text.trim().length < 2) {
            setInlineSuggestions([]);
            setLoadingInlineSuggestions(false);
            return;
        }

        setLoadingInlineSuggestions(true);
        inlineSearchDebounce.current = setTimeout(async () => {
            try {
                const results = await locationSearchService.searchAddresses(text);
                setInlineSuggestions(results);
            } catch (err) {
                console.warn('Inline address search err:', err);
            } finally {
                setLoadingInlineSuggestions(false);
            }
        }, 300);
    };

    const selectInlineSuggestion = async (sugg: AddressSuggestion, field: 'pickup' | 'dropoff' | 'errand') => {
        Keyboard.dismiss();
        setLoadingInlineSuggestions(true);
        try {
            const coords = await locationSearchService.resolveCoordinates(sugg);
            if (field === 'pickup') {
                setPickup(sugg.fullAddress, coords);
            } else if (field === 'dropoff') {
                setDropoff(sugg.fullAddress, coords);
            } else if (field === 'errand') {
                setErrand(sugg.fullAddress, coords);
            }
        } catch (e) {
            console.warn(e);
        } finally {
            setLoadingInlineSuggestions(false);
            setInlineSuggestions([]);
            setActiveAddressField(null);
        }
    };

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
            const prefix = `[AI Dimensions: ${result.dimensions} | Est. Weight: ${result.estimated_weight}]`;
            const newDesc = packageDescription ? `${prefix}\n${packageDescription}` : prefix;
            setPackageDesc(newDesc);

            Alert.alert(
                'AI Analysis Complete', 
                `Our AI detected a ${result.size_category} (${result.dimensions}, ${result.estimated_weight}). We've updated your vehicle recommendation.`
            );
        } catch (error: any) {
            console.error('Gemini classification error:', error);
            setAIEstimate('Medium Box');
        } finally {
            setIsScanning(false);
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
            const { data: voucher, error } = await supabase
                .from('vouchers')
                .select('*')
                .eq('code', cleanCode)
                .eq('is_active', true)
                .single();

            if (error || !voucher) {
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

            const minAmount = parseFloat(voucher.min_order_amount || '4.00');
            if (currentFare < minAmount) {
                setPromoMessage({ text: `Requires minimum order of $${minAmount.toFixed(2)}`, isError: true });
                return;
            }

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

    // Step Validation
    const validateStep1 = () => {
        const errors: { [key: string]: string } = {};
        if (isDelivery) {
            if (!pickupAddress || pickupAddress.trim().length === 0) {
                errors.pickup = 'Please provide a pickup address or pin on map';
            }
        } else {
            if (!errandLocation || errandLocation.trim().length === 0) {
                errors.errand = 'Please specify the store or errand location';
            }
        }
        if (!dropoffAddress || dropoffAddress.trim().length === 0) {
            errors.dropoff = 'Please provide a drop-off delivery address';
        }
        setStepErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const validateStep2 = () => {
        const errors: { [key: string]: string } = {};
        if (!isRecipientSelf) {
            if (!recipientName.trim()) {
                errors.recipientName = 'Recipient name is required';
            }
            if (!recipientPhone.trim() || recipientPhone.trim().length < 6) {
                errors.recipientPhone = 'Valid recipient phone number is required';
            }
        }
        if (enableSmsUpdates) {
            const phoneForSms = !isRecipientSelf ? recipientPhone : (paymentPhone || user?.phone || user?.user_metadata?.phone);
            if (!phoneForSms || phoneForSms.trim().length < 6) {
                errors.smsPhone = 'A valid phone number is required to receive SMS updates';
            }
        }
        setStepErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleNextStep = () => {
        if (currentStep === 1) {
            if (!validateStep1()) {
                Alert.alert('Incomplete Route', 'Please fill in both pickup and drop-off points to continue.');
                return;
            }
            setCurrentStep(2);
        } else if (currentStep === 2) {
            if (!validateStep2()) {
                Alert.alert('Recipient Details Needed', 'Please complete the recipient phone and name.');
                return;
            }
            setCurrentStep(3);
        }
    };

    const handlePrevStep = () => {
        if (currentStep === 3) setCurrentStep(2);
        else if (currentStep === 2) setCurrentStep(1);
    };

    const handlePlaceOrder = async () => {
        if (!validateStep1() || !validateStep2()) {
            Alert.alert('Missing Details', 'Please review previous steps before confirming.');
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

        if ((paymentMethod === 'ecocash' || paymentMethod === 'innbucks') && (!paymentPhone || paymentPhone.trim().length < 6)) {
            Alert.alert('Missing Mobile Number', `Please enter a valid ${paymentMethod === 'ecocash' ? 'EcoCash' : 'InnBucks'} mobile number.`);
            return;
        }

        setLoading(true);
        try {
            if (!user) throw new Error("No user session found");

            const grossAmount = offerAmount;
            const discountAmount = appliedVoucher ? Math.min(appliedVoucher.discount, grossAmount) : 0;
            const smsAddonFee = enableSmsUpdates ? smsFee : 0;
            const finalPayable = Math.max(0.50, Math.round((grossAmount - discountAmount + smsAddonFee) * 100) / 100);

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
            setCurrentStep(1);
            
            Alert.alert(
                "Order Confirmed! 🚀", 
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
            setPickup('Joina City, Jason Moyo Ave, Harare', { latitude: -17.8312, longitude: 31.0494 });
            setDropoff('Sam Levy\'s Village, Borrowdale, Harare', { latitude: -17.7558, longitude: 31.0858 });
            setPackageDesc('Office Documents and Electronics');
        } else {
            setErrand('Avondale Shopping Centre, Harare', { latitude: -17.7981, longitude: 31.0396 });
            setDropoff('Westgate Shopping Mall, Harare', { latitude: -17.7667, longitude: 30.9744 });
            setErrandInstructions('- Milk\n- Bread\n- Painkillers from pharmacy');
        }
        setIsRecipientSelf(false);
        setRecipientName('Tendai Moyo');
        setRecipientPhone('+263772987654');
        setRecipientNotes('Ring buzzer 4B at security gate');
        setEnableSmsUpdates(true);
        setStepErrors({});
    };

    const currentFare = parseFloat(bidPrice) || estimatedCost;
    const currentDiscount = appliedVoucher ? Math.min(appliedVoucher.discount, currentFare) : 0;
    const currentSmsFee = enableSmsUpdates ? smsFee : 0;
    const currentTotalPayable = Math.max(0.50, Math.round((currentFare - currentDiscount + currentSmsFee) * 100) / 100);

    return (
        <LinearGradient colors={['#F8FAFC', '#EFF6FF']} style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
            <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>

                    {/* Compact Top Header & Service Selector */}
                    <View style={styles.topHeader}>
                        <View style={styles.headerTitleRow}>
                            <View>
                                <Text style={styles.screenTitle}>
                                    {isDelivery ? 'Send Package' : 'Run Errand'}
                                </Text>
                                <Text style={styles.screenSubTitle}>
                                    Step {currentStep} of 3 • {currentStep === 1 ? 'Route & Package' : currentStep === 2 ? 'Recipient Details' : 'Payment & Confirm'}
                                </Text>
                            </View>
                            {/* Service Toggle */}
                            <View style={styles.servicePillContainer}>
                                <TouchableOpacity
                                    style={[styles.servicePill, isDelivery && styles.servicePillActive]}
                                    onPress={() => setServiceType('delivery')}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.servicePillText, isDelivery && styles.servicePillTextActive]}>
                                        📦 Delivery
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.servicePill, !isDelivery && styles.servicePillActive]}
                                    onPress={() => setServiceType('errand')}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.servicePillText, !isDelivery && styles.servicePillTextActive]}>
                                        🛒 Errand
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Modern Stepper Header */}
                        <View style={styles.stepperContainer}>
                            {/* Step 1 */}
                            <TouchableOpacity 
                                style={styles.stepItem} 
                                onPress={() => setCurrentStep(1)}
                                activeOpacity={0.7}
                            >
                                <View style={[styles.stepCircle, currentStep === 1 ? styles.stepCircleActive : currentStep > 1 ? styles.stepCircleCompleted : styles.stepCircleInactive]}>
                                    {currentStep > 1 ? (
                                        <Ionicons name="checkmark" size={16} color="#FFF" />
                                    ) : (
                                        <Text style={[styles.stepNumber, currentStep === 1 && styles.stepNumberActive]}>1</Text>
                                    )}
                                </View>
                                <Text style={[styles.stepLabel, currentStep === 1 && styles.stepLabelActive]}>Route</Text>
                            </TouchableOpacity>

                            <View style={[styles.stepLine, currentStep >= 2 && styles.stepLineActive]} />

                            {/* Step 2 */}
                            <TouchableOpacity 
                                style={styles.stepItem} 
                                onPress={() => { if (validateStep1()) setCurrentStep(2); }}
                                activeOpacity={0.7}
                            >
                                <View style={[styles.stepCircle, currentStep === 2 ? styles.stepCircleActive : currentStep > 2 ? styles.stepCircleCompleted : styles.stepCircleInactive]}>
                                    {currentStep > 2 ? (
                                        <Ionicons name="checkmark" size={16} color="#FFF" />
                                    ) : (
                                        <Text style={[styles.stepNumber, currentStep === 2 && styles.stepNumberActive]}>2</Text>
                                    )}
                                </View>
                                <Text style={[styles.stepLabel, currentStep === 2 && styles.stepLabelActive]}>Recipient</Text>
                            </TouchableOpacity>

                            <View style={[styles.stepLine, currentStep >= 3 && styles.stepLineActive]} />

                            {/* Step 3 */}
                            <TouchableOpacity 
                                style={styles.stepItem} 
                                onPress={() => { if (validateStep1() && validateStep2()) setCurrentStep(3); }}
                                activeOpacity={0.7}
                            >
                                <View style={[styles.stepCircle, currentStep === 3 ? styles.stepCircleActive : styles.stepCircleInactive]}>
                                    <Text style={[styles.stepNumber, currentStep === 3 && styles.stepNumberActive]}>3</Text>
                                </View>
                                <Text style={[styles.stepLabel, currentStep === 3 && styles.stepLabelActive]}>Payment</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Unsettled Debt Warning Banner */}
                    {unsettledDebt > 0 && (
                        <View style={styles.debtBanner}>
                            <View style={styles.debtBannerTop}>
                                <Text style={styles.debtBannerIcon}>⚠️</Text>
                                <View style={styles.debtBannerTextWrap}>
                                    <Text style={styles.debtBannerTitle}>Unsettled Cancellation Fee (${unsettledDebt.toFixed(2)})</Text>
                                    <Text style={styles.debtBannerDesc}>
                                        Outstanding cancellation balance must be cleared before dispatching your Mate.
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity
                                style={styles.debtBannerActionBtn}
                                activeOpacity={0.8}
                                onPress={() => setDebtModalVisible(true)}
                            >
                                <Text style={styles.debtBannerActionText}>Clear Balance Now</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Main Scrollable Step Form Body */}
                    <ScrollView 
                        contentContainerStyle={styles.scrollContent} 
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        {/* ========================================================================= */}
                        {/* STEP 1: ROUTE & PACKAGE DETAILS                                           */}
                        {/* ========================================================================= */}
                        {currentStep === 1 && (
                            <View style={styles.stepFormCard}>
                                <View style={styles.sectionHeaderRow}>
                                    <View style={styles.sectionHeaderIcon}>
                                        <Ionicons name="navigate-circle" size={24} color="#055FEE" />
                                    </View>
                                    <View>
                                        <Text style={styles.sectionTitleText}>Pick Up & Destination</Text>
                                        <Text style={styles.sectionSubtitleText}>Enter addresses or select on map with suggestions</Text>
                                    </View>
                                </View>

                                {isDelivery ? (
                                    <>
                                        {/* Pickup Address Input */}
                                        <View style={styles.inputGroup}>
                                            <View style={styles.inputLabelRow}>
                                                <Text style={styles.fieldLabel}>📍 PICKUP POINT</Text>
                                                {pickupCoords && <Text style={styles.pinnedBadge}>✓ Coordinates Pinned</Text>}
                                            </View>
                                            <View style={[styles.addressInputRow, stepErrors.pickup ? styles.inputRowError : null]}>
                                                <Ionicons name="search" size={18} color="#055FEE" style={{ marginRight: 8 }} />
                                                <TextInput
                                                    style={styles.addressInputField}
                                                    placeholder="Type pickup place (e.g. Joina City, Avondale)"
                                                    placeholderTextColor="#94A3B8"
                                                    value={pickupAddress}
                                                    onChangeText={(t) => handleInlineAddressSearch(t, 'pickup')}
                                                    onFocus={() => setActiveAddressField('pickup')}
                                                />
                                                <TouchableOpacity
                                                    style={styles.mapPinButton}
                                                    activeOpacity={0.7}
                                                    onPress={() => navigation.navigate('MapLocationPicker', { 
                                                        locationType: 'pickup', 
                                                        serviceType,
                                                        initialAddress: pickupAddress 
                                                    })}
                                                >
                                                    <Ionicons name="map" size={16} color="#055FEE" />
                                                    <Text style={styles.mapPinButtonText}>Map</Text>
                                                </TouchableOpacity>
                                            </View>
                                            {stepErrors.pickup && <Text style={styles.fieldErrorText}>{stepErrors.pickup}</Text>}

                                            {/* Pickup Inline Autocomplete Dropdown */}
                                            {activeAddressField === 'pickup' && inlineSuggestions.length > 0 && (
                                                <View style={styles.inlineDropdownCard}>
                                                    {inlineSuggestions.map((s) => (
                                                        <TouchableOpacity
                                                            key={s.id}
                                                            style={styles.inlineSuggestionItem}
                                                            onPress={() => selectInlineSuggestion(s, 'pickup')}
                                                        >
                                                            <Ionicons name="location" size={16} color="#055FEE" style={{ marginRight: 8 }} />
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={styles.inlineMainText}>{s.mainText}</Text>
                                                                <Text style={styles.inlineSubText}>{s.secondaryText}</Text>
                                                            </View>
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>
                                            )}
                                        </View>

                                        {/* Drop-off Address Input */}
                                        <View style={styles.inputGroup}>
                                            <View style={styles.inputLabelRow}>
                                                <Text style={styles.fieldLabel}>🏁 DROP-OFF DESTINATION</Text>
                                                {dropoffCoords && <Text style={styles.pinnedBadge}>✓ Coordinates Pinned</Text>}
                                            </View>
                                            <View style={[styles.addressInputRow, stepErrors.dropoff ? styles.inputRowError : null]}>
                                                <Ionicons name="search" size={18} color="#10B981" style={{ marginRight: 8 }} />
                                                <TextInput
                                                    style={styles.addressInputField}
                                                    placeholder="Type destination (e.g. Sam Levy's Village)"
                                                    placeholderTextColor="#94A3B8"
                                                    value={dropoffAddress}
                                                    onChangeText={(t) => handleInlineAddressSearch(t, 'dropoff')}
                                                    onFocus={() => setActiveAddressField('dropoff')}
                                                />
                                                <TouchableOpacity
                                                    style={styles.mapPinButton}
                                                    activeOpacity={0.7}
                                                    onPress={() => navigation.navigate('MapLocationPicker', { 
                                                        locationType: 'dropoff', 
                                                        serviceType,
                                                        initialAddress: dropoffAddress 
                                                    })}
                                                >
                                                    <Ionicons name="map" size={16} color="#055FEE" />
                                                    <Text style={styles.mapPinButtonText}>Map</Text>
                                                </TouchableOpacity>
                                            </View>
                                            {stepErrors.dropoff && <Text style={styles.fieldErrorText}>{stepErrors.dropoff}</Text>}

                                            {/* Dropoff Inline Autocomplete Dropdown */}
                                            {activeAddressField === 'dropoff' && inlineSuggestions.length > 0 && (
                                                <View style={styles.inlineDropdownCard}>
                                                    {inlineSuggestions.map((s) => (
                                                        <TouchableOpacity
                                                            key={s.id}
                                                            style={styles.inlineSuggestionItem}
                                                            onPress={() => selectInlineSuggestion(s, 'dropoff')}
                                                        >
                                                            <Ionicons name="location" size={16} color="#10B981" style={{ marginRight: 8 }} />
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={styles.inlineMainText}>{s.mainText}</Text>
                                                                <Text style={styles.inlineSubText}>{s.secondaryText}</Text>
                                                            </View>
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>
                                            )}
                                        </View>

                                        {/* Package Description & Vision AI Scan */}
                                        <View style={styles.packageCard}>
                                            <View style={styles.packageHeaderRow}>
                                                <Text style={styles.fieldLabel}>📦 PACKAGE DESCRIPTION</Text>
                                                <TouchableOpacity 
                                                    style={styles.aiScanMiniBtn}
                                                    onPress={handleScanPackage}
                                                    disabled={isScanning}
                                                    activeOpacity={0.7}
                                                >
                                                    <Ionicons name="scan" size={14} color="#055FEE" />
                                                    <Text style={styles.aiScanMiniBtnText}>Vision AI Scan</Text>
                                                </TouchableOpacity>
                                            </View>

                                            <TextInput
                                                style={styles.packageTextInput}
                                                placeholder="Describe package (e.g. Small box, legal documents, electronics)"
                                                placeholderTextColor="#94A3B8"
                                                value={packageDescription}
                                                onChangeText={setPackageDesc}
                                                multiline
                                            />

                                            {isScanning && (
                                                <View style={styles.scanningBox}>
                                                    <ActivityIndicator size="small" color="#055FEE" />
                                                    <Text style={styles.scanningLabel}>Gemini AI analyzing dimensions & size...</Text>
                                                </View>
                                            )}

                                            {packageImage && !isScanning && (
                                                <View style={styles.packagePreviewRow}>
                                                    <Image source={{ uri: packageImage }} style={styles.packageThumb} />
                                                    <View style={styles.aiResultPill}>
                                                        <Text style={styles.aiResultTag}>AI SIZE ESTIMATE</Text>
                                                        <Text style={styles.aiResultValue}>{aiEstimate || 'Standard Package'}</Text>
                                                    </View>
                                                </View>
                                            )}
                                        </View>
                                    </>
                                ) : (
                                    /* ERRAND MODE */
                                    <>
                                        {/* Store / Errand Location */}
                                        <View style={styles.inputGroup}>
                                            <View style={styles.inputLabelRow}>
                                                <Text style={styles.fieldLabel}>🛒 STORE / ERRAND LOCATION</Text>
                                                {errandCoords && <Text style={styles.pinnedBadge}>✓ Coordinates Pinned</Text>}
                                            </View>
                                            <View style={[styles.addressInputRow, stepErrors.errand ? styles.inputRowError : null]}>
                                                <Ionicons name="basket" size={18} color="#055FEE" style={{ marginRight: 8 }} />
                                                <TextInput
                                                    style={styles.addressInputField}
                                                    placeholder="Store name or location (e.g. Avondale Spar)"
                                                    placeholderTextColor="#94A3B8"
                                                    value={errandLocation}
                                                    onChangeText={(t) => handleInlineAddressSearch(t, 'errand')}
                                                    onFocus={() => setActiveAddressField('errand')}
                                                />
                                                <TouchableOpacity
                                                    style={styles.mapPinButton}
                                                    activeOpacity={0.7}
                                                    onPress={() => navigation.navigate('MapLocationPicker', { 
                                                        locationType: 'store', 
                                                        serviceType,
                                                        initialAddress: errandLocation 
                                                    })}
                                                >
                                                    <Ionicons name="map" size={16} color="#055FEE" />
                                                    <Text style={styles.mapPinButtonText}>Map</Text>
                                                </TouchableOpacity>
                                            </View>
                                            {stepErrors.errand && <Text style={styles.fieldErrorText}>{stepErrors.errand}</Text>}

                                            {/* Store Inline Dropdown */}
                                            {activeAddressField === 'errand' && inlineSuggestions.length > 0 && (
                                                <View style={styles.inlineDropdownCard}>
                                                    {inlineSuggestions.map((s) => (
                                                        <TouchableOpacity
                                                            key={s.id}
                                                            style={styles.inlineSuggestionItem}
                                                            onPress={() => selectInlineSuggestion(s, 'errand')}
                                                        >
                                                            <Ionicons name="business" size={16} color="#055FEE" style={{ marginRight: 8 }} />
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={styles.inlineMainText}>{s.mainText}</Text>
                                                                <Text style={styles.inlineSubText}>{s.secondaryText}</Text>
                                                            </View>
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>
                                            )}
                                        </View>

                                        {/* Drop-off Delivery Address */}
                                        <View style={styles.inputGroup}>
                                            <View style={styles.inputLabelRow}>
                                                <Text style={styles.fieldLabel}>🏁 YOUR DELIVERY ADDRESS</Text>
                                                {dropoffCoords && <Text style={styles.pinnedBadge}>✓ Coordinates Pinned</Text>}
                                            </View>
                                            <View style={[styles.addressInputRow, stepErrors.dropoff ? styles.inputRowError : null]}>
                                                <Ionicons name="home" size={18} color="#10B981" style={{ marginRight: 8 }} />
                                                <TextInput
                                                    style={styles.addressInputField}
                                                    placeholder="Where should courier bring your items?"
                                                    placeholderTextColor="#94A3B8"
                                                    value={dropoffAddress}
                                                    onChangeText={(t) => handleInlineAddressSearch(t, 'dropoff')}
                                                    onFocus={() => setActiveAddressField('dropoff')}
                                                />
                                                <TouchableOpacity
                                                    style={styles.mapPinButton}
                                                    activeOpacity={0.7}
                                                    onPress={() => navigation.navigate('MapLocationPicker', { 
                                                        locationType: 'dropoff', 
                                                        serviceType,
                                                        initialAddress: dropoffAddress 
                                                    })}
                                                >
                                                    <Ionicons name="map" size={16} color="#055FEE" />
                                                    <Text style={styles.mapPinButtonText}>Map</Text>
                                                </TouchableOpacity>
                                            </View>
                                            {stepErrors.dropoff && <Text style={styles.fieldErrorText}>{stepErrors.dropoff}</Text>}
                                        </View>

                                        {/* Shopping List & Smart AI Chips */}
                                        <View style={styles.packageCard}>
                                            <Text style={styles.fieldLabel}>📝 SHOPPING LIST / INSTRUCTIONS</Text>
                                            
                                            {errandSuggestions.length > 0 && (
                                                <View style={styles.chipsWrap}>
                                                    <Text style={styles.chipsTitle}>Smart Suggestions:</Text>
                                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
                                                        {errandSuggestions.map((item, idx) => (
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
                                                style={styles.packageTextInput}
                                                placeholder="What should courier purchase or pick up?"
                                                placeholderTextColor="#94A3B8"
                                                value={errandList}
                                                onChangeText={setErrandInstructions}
                                                multiline
                                            />
                                        </View>
                                    </>
                                )}
                            </View>
                        )}

                        {/* ========================================================================= */}
                        {/* STEP 2: RECIPIENT & NOTIFICATION SETTINGS                                 */}
                        {/* ========================================================================= */}
                        {currentStep === 2 && (
                            <View style={styles.stepFormCard}>
                                <View style={styles.sectionHeaderRow}>
                                    <View style={styles.sectionHeaderIcon}>
                                        <Ionicons name="person-circle" size={24} color="#055FEE" />
                                    </View>
                                    <View>
                                        <Text style={styles.sectionTitleText}>Recipient & Contact</Text>
                                        <Text style={styles.sectionSubtitleText}>Specify who receives the package upon arrival</Text>
                                    </View>
                                </View>

                                {/* Self vs Someone Else Selector */}
                                <View style={styles.recipientToggleRow}>
                                    <TouchableOpacity
                                        style={[styles.recipientToggleBtn, isRecipientSelf && styles.recipientToggleBtnActive]}
                                        onPress={() => setIsRecipientSelf(true)}
                                        activeOpacity={0.8}
                                    >
                                        <Ionicons name="person" size={16} color={isRecipientSelf ? '#055FEE' : '#64748B'} style={{ marginRight: 6 }} />
                                        <Text style={[styles.recipientToggleText, isRecipientSelf && styles.recipientToggleTextActive]}>
                                            I'll Receive It
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.recipientToggleBtn, !isRecipientSelf && styles.recipientToggleBtnActive]}
                                        onPress={() => setIsRecipientSelf(false)}
                                        activeOpacity={0.8}
                                    >
                                        <Ionicons name="people" size={16} color={!isRecipientSelf ? '#055FEE' : '#64748B'} style={{ marginRight: 6 }} />
                                        <Text style={[styles.recipientToggleText, !isRecipientSelf && styles.recipientToggleTextActive]}>
                                            Someone Else
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                {isRecipientSelf ? (
                                    <View style={styles.selfContactCard}>
                                        <Ionicons name="checkmark-circle" size={20} color="#10B981" style={{ marginRight: 10 }} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.selfContactTitle}>Direct Customer Delivery</Text>
                                            <Text style={styles.selfContactDesc}>
                                                Courier will call you directly at: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{user?.phone || user?.user_metadata?.phone || 'Your account phone'}</Text>
                                            </Text>
                                        </View>
                                    </View>
                                ) : (
                                    <View style={styles.otherRecipientBox}>
                                        <View style={styles.inputGroup}>
                                            <Text style={styles.fieldLabel}>RECIPIENT FULL NAME *</Text>
                                            <TextInput
                                                style={[styles.textInput, stepErrors.recipientName ? styles.inputError : null]}
                                                placeholder="e.g. Tendai Moyo"
                                                placeholderTextColor="#94A3B8"
                                                value={recipientName}
                                                onChangeText={setRecipientName}
                                            />
                                            {stepErrors.recipientName && <Text style={styles.fieldErrorText}>{stepErrors.recipientName}</Text>}
                                        </View>

                                        <View style={styles.inputGroup}>
                                            <Text style={styles.fieldLabel}>RECIPIENT MOBILE NUMBER *</Text>
                                            <TextInput
                                                style={[styles.textInput, stepErrors.recipientPhone ? styles.inputError : null]}
                                                placeholder="e.g. +263 77 123 4567"
                                                placeholderTextColor="#94A3B8"
                                                value={recipientPhone}
                                                onChangeText={setRecipientPhone}
                                                keyboardType="phone-pad"
                                            />
                                            {stepErrors.recipientPhone && <Text style={styles.fieldErrorText}>{stepErrors.recipientPhone}</Text>}
                                        </View>

                                        <View style={styles.inputGroup}>
                                            <Text style={styles.fieldLabel}>GATE / SECURITY INSTRUCTIONS</Text>
                                            <TextInput
                                                style={[styles.textInput, { height: 70, textAlignVertical: 'top' }]}
                                                placeholder="e.g. Gate code #4021, buzz Flat 2B, or call upon arrival"
                                                placeholderTextColor="#94A3B8"
                                                value={recipientNotes}
                                                onChangeText={setRecipientNotes}
                                                multiline
                                            />
                                        </View>
                                    </View>
                                )}

                                {/* SMS & WhatsApp Alerts Option */}
                                <View style={styles.smsAlertsSection}>
                                    <View style={styles.smsHeader}>
                                        <View style={styles.smsHeaderLeft}>
                                            <Ionicons name="chatbubbles" size={20} color="#055FEE" style={{ marginRight: 8 }} />
                                            <Text style={styles.smsTitle}>Live SMS & WhatsApp Alerts</Text>
                                        </View>
                                        <View style={styles.smsFeeBadge}>
                                            <Text style={styles.smsFeeText}>+${smsFee.toFixed(2)} USD</Text>
                                        </View>
                                    </View>
                                    <Text style={styles.smsDesc}>
                                        Sends direct SMS & WhatsApp milestone arrival pings to the recipient when courier is approaching their gate.
                                    </Text>
                                    
                                    <TouchableOpacity
                                        style={[styles.smsOptionCard, enableSmsUpdates && styles.smsOptionCardActive]}
                                        onPress={() => setEnableSmsUpdates(!enableSmsUpdates)}
                                        activeOpacity={0.8}
                                    >
                                        <View style={[styles.checkboxCircle, enableSmsUpdates && styles.checkboxCircleActive]}>
                                            {enableSmsUpdates && <Ionicons name="checkmark" size={14} color="#FFF" />}
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.smsOptionTitle, enableSmsUpdates && styles.smsOptionTitleActive]}>
                                                {enableSmsUpdates ? '✓ SMS & WhatsApp Alerts Enabled' : 'Enable Gate Arrival Alerts'}
                                            </Text>
                                            <Text style={styles.smsOptionSub}>
                                                {enableSmsUpdates ? `Added to your delivery total (+$${smsFee.toFixed(2)})` : `In-app tracking is always 100% free`}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {/* ========================================================================= */}
                        {/* STEP 3: PAYMENT & FARE REVIEW                                             */}
                        {/* ========================================================================= */}
                        {currentStep === 3 && (
                            <View style={styles.stepFormCard}>
                                <View style={styles.sectionHeaderRow}>
                                    <View style={styles.sectionHeaderIcon}>
                                        <Ionicons name="card" size={24} color="#055FEE" />
                                    </View>
                                    <View>
                                        <Text style={styles.sectionTitleText}>Payment & Fare</Text>
                                        <Text style={styles.sectionSubtitleText}>Review fare, adjust offer and select payment method</Text>
                                    </View>
                                </View>

                                {/* Custom Offer Price / Bid */}
                                <View style={styles.bidCard}>
                                    <View style={styles.bidHeader}>
                                        <Text style={styles.fieldLabel}>YOUR OFFER PRICE (USD)</Text>
                                        <Text style={styles.bidHint}>Estimated: ${estimatedCost.toFixed(2)}</Text>
                                    </View>
                                    <View style={styles.bidControlsRow}>
                                        <TouchableOpacity 
                                            style={styles.bidAdjustBtn} 
                                            onPress={() => adjustBid(-1.00)}
                                            activeOpacity={0.7}
                                        >
                                            <Ionicons name="remove" size={20} color="#0F172A" />
                                        </TouchableOpacity>
                                        <View style={styles.bidDisplayWrap}>
                                            <Text style={styles.currencyPrefix}>$</Text>
                                            <TextInput
                                                style={styles.bidAmountInput}
                                                value={bidPrice}
                                                onChangeText={setBidPrice}
                                                keyboardType="decimal-pad"
                                                selectTextOnFocus
                                            />
                                        </View>
                                        <TouchableOpacity 
                                            style={styles.bidAdjustBtn} 
                                            onPress={() => adjustBid(1.00)}
                                            activeOpacity={0.7}
                                        >
                                            <Ionicons name="add" size={20} color="#0F172A" />
                                        </TouchableOpacity>
                                    </View>
                                    <Text style={styles.bidNote}>Mates accept competitive offers faster!</Text>
                                </View>

                                {/* Voucher / Promo Code Input */}
                                <View style={styles.promoBox}>
                                    <View style={styles.promoInputRow}>
                                        <Ionicons name="pricetag" size={16} color="#055FEE" style={{ marginRight: 8 }} />
                                        <TextInput
                                            style={styles.promoInputField}
                                            placeholder="Promo code (e.g. WELCOME263)"
                                            placeholderTextColor="#94A3B8"
                                            value={promoCodeInput}
                                            onChangeText={(t) => { setPromoCodeInput(t.toUpperCase()); setPromoMessage(null); }}
                                            editable={!appliedVoucher}
                                            autoCapitalize="characters"
                                        />
                                        {appliedVoucher ? (
                                            <TouchableOpacity style={styles.promoRemoveButton} onPress={handleRemovePromo}>
                                                <Text style={styles.promoRemoveText}>Remove</Text>
                                            </TouchableOpacity>
                                        ) : (
                                            <TouchableOpacity 
                                                style={styles.promoApplyButton} 
                                                onPress={handleApplyPromo}
                                                disabled={validatingPromo}
                                            >
                                                {validatingPromo ? (
                                                    <ActivityIndicator size="small" color="#FFF" />
                                                ) : (
                                                    <Text style={styles.promoApplyText}>Apply</Text>
                                                )}
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                    {promoMessage && (
                                        <Text style={[styles.promoFeedback, promoMessage.isError ? styles.promoFeedbackError : styles.promoFeedbackSuccess]}>
                                            {promoMessage.text}
                                        </Text>
                                    )}
                                </View>

                                {/* Payment Method Selection */}
                                <View style={styles.paymentSection}>
                                    <Text style={styles.fieldLabel}>SELECT PAYMENT METHOD</Text>
                                    <View style={styles.paymentMethodsGrid}>
                                        {/* Cash on Delivery */}
                                        <TouchableOpacity
                                            style={[styles.paymentMethodCard, paymentMethod === 'cash_on_delivery' && styles.paymentMethodCardActive]}
                                            onPress={() => setPaymentMethod('cash_on_delivery')}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={styles.paymentMethodIcon}>💵</Text>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.paymentMethodTitle, paymentMethod === 'cash_on_delivery' && styles.paymentMethodTitleActive]}>
                                                    Cash on Delivery
                                                </Text>
                                                <Text style={styles.paymentMethodSubtitle}>Pay cash USD / ZiG to courier</Text>
                                            </View>
                                            <View style={[styles.radioCircle, paymentMethod === 'cash_on_delivery' && styles.radioCircleActive]}>
                                                {paymentMethod === 'cash_on_delivery' && <View style={styles.radioDot} />}
                                            </View>
                                        </TouchableOpacity>

                                        {/* EcoCash */}
                                        <TouchableOpacity
                                            style={[styles.paymentMethodCard, paymentMethod === 'ecocash' && styles.paymentMethodCardActive]}
                                            onPress={() => setPaymentMethod('ecocash')}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={styles.paymentMethodIcon}>📱</Text>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.paymentMethodTitle, paymentMethod === 'ecocash' && styles.paymentMethodTitleActive]}>
                                                    EcoCash Mobile Money
                                                </Text>
                                                <Text style={styles.paymentMethodSubtitle}>Instant USSD push prompt</Text>
                                            </View>
                                            <View style={[styles.radioCircle, paymentMethod === 'ecocash' && styles.radioCircleActive]}>
                                                {paymentMethod === 'ecocash' && <View style={styles.radioDot} />}
                                            </View>
                                        </TouchableOpacity>

                                        {/* InnBucks */}
                                        <TouchableOpacity
                                            style={[styles.paymentMethodCard, paymentMethod === 'innbucks' && styles.paymentMethodCardActive]}
                                            onPress={() => setPaymentMethod('innbucks')}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={styles.paymentMethodIcon}>⚡</Text>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.paymentMethodTitle, paymentMethod === 'innbucks' && styles.paymentMethodTitleActive]}>
                                                    InnBucks Digital
                                                </Text>
                                                <Text style={styles.paymentMethodSubtitle}>Pay via registered InnBucks number</Text>
                                            </View>
                                            <View style={[styles.radioCircle, paymentMethod === 'innbucks' && styles.radioCircleActive]}>
                                                {paymentMethod === 'innbucks' && <View style={styles.radioDot} />}
                                            </View>
                                        </TouchableOpacity>
                                    </View>

                                    {/* Mobile Number Prompt for Digital Payments */}
                                    {(paymentMethod === 'ecocash' || paymentMethod === 'innbucks') && (
                                        <View style={styles.digitalPhonePrompt}>
                                            <Text style={styles.fieldLabel}>
                                                {paymentMethod === 'ecocash' ? 'ECOCASH NUMBER *' : 'INNBUCKS REGISTERED MOBILE *'}
                                            </Text>
                                            <TextInput
                                                style={styles.textInput}
                                                placeholder="e.g. 0772123456"
                                                placeholderTextColor="#94A3B8"
                                                value={paymentPhone}
                                                onChangeText={setPaymentPhone}
                                                keyboardType="phone-pad"
                                            />
                                        </View>
                                    )}
                                </View>

                                {/* Cost Breakdown Summary */}
                                <View style={styles.breakdownCard}>
                                    <View style={styles.breakdownRow}>
                                        <Text style={styles.breakdownLabel}>Subtotal Fare</Text>
                                        <Text style={styles.breakdownValue}>${currentFare.toFixed(2)}</Text>
                                    </View>
                                    {appliedVoucher && (
                                        <View style={styles.breakdownRow}>
                                            <Text style={[styles.breakdownLabel, { color: '#10B981', fontWeight: '700' }]}>
                                                Promo ({appliedVoucher.code})
                                            </Text>
                                            <Text style={[styles.breakdownValue, { color: '#10B981', fontWeight: '800' }]}>
                                                -${currentDiscount.toFixed(2)}
                                            </Text>
                                        </View>
                                    )}
                                    {enableSmsUpdates && (
                                        <View style={styles.breakdownRow}>
                                            <Text style={styles.breakdownLabel}>SMS Arrival Alerts</Text>
                                            <Text style={styles.breakdownValue}>+${smsFee.toFixed(2)}</Text>
                                        </View>
                                    )}
                                    <View style={styles.breakdownDivider} />
                                    <View style={styles.breakdownRow}>
                                        <Text style={styles.breakdownTotalLabel}>Total to Pay</Text>
                                        <Text style={styles.breakdownTotalValue}>${currentTotalPayable.toFixed(2)} USD</Text>
                                    </View>
                                </View>
                            </View>
                        )}

                        {/* Web Testing Helper Button */}
                        {Platform.OS === 'web' && (
                            <TouchableOpacity style={styles.mockBtn} onPress={handleFillMockData} activeOpacity={0.7}>
                                <Text style={styles.mockBtnText}>🧪 Auto-Fill Demo Data (Testing)</Text>
                            </TouchableOpacity>
                        )}

                    </ScrollView>

                    {/* ========================================================================= */}
                    {/* STICKY BOTTOM ACTION BAR                                                  */}
                    {/* ========================================================================= */}
                    <View style={styles.bottomBar}>
                        <View style={styles.bottomBarFarePreview}>
                            <Text style={styles.bottomFareLabel}>Total Fare</Text>
                            <Text style={styles.bottomFareValue}>${currentTotalPayable.toFixed(2)}</Text>
                        </View>

                        <View style={styles.bottomBarButtonsRow}>
                            {currentStep > 1 && (
                                <TouchableOpacity 
                                    style={styles.backButton} 
                                    onPress={handlePrevStep}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons name="arrow-back" size={20} color="#0F172A" />
                                </TouchableOpacity>
                            )}

                            {currentStep < 3 ? (
                                <TouchableOpacity 
                                    style={styles.nextButton} 
                                    onPress={handleNextStep}
                                    activeOpacity={0.85}
                                >
                                    <LinearGradient colors={['#055FEE', '#2563EB']} style={styles.nextGradient}>
                                        <Text style={styles.nextButtonText}>
                                            {currentStep === 1 ? 'Continue to Recipient →' : 'Continue to Payment →'}
                                        </Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity 
                                    style={styles.confirmButton} 
                                    onPress={handlePlaceOrder}
                                    disabled={loading}
                                    activeOpacity={0.85}
                                >
                                    <LinearGradient colors={['#10B981', '#059669']} style={styles.nextGradient}>
                                        {loading ? (
                                            <ActivityIndicator color="#FFF" />
                                        ) : (
                                            <>
                                                <Ionicons name="rocket" size={18} color="#FFF" style={{ marginRight: 6 }} />
                                                <Text style={styles.nextButtonText}>Confirm & Find Mate</Text>
                                            </>
                                        )}
                                    </LinearGradient>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {/* Cancellation Debt Clearance Modal */}
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
                                        <Ionicons name="close-circle" size={24} color="#94A3B8" />
                                    </TouchableOpacity>
                                </View>

                                <Text style={styles.debtModalAmount}>
                                    ${unsettledDebt.toFixed(2)} <Text style={styles.debtModalCurrency}>USD</Text>
                                </Text>
                                <Text style={styles.debtModalExplainer}>
                                    Incurred from a previous courier cancellation based on distance traveled. Clearing this settles your account immediately.
                                </Text>

                                <Text style={styles.fieldLabel}>Select Payment Method:</Text>
                                <View style={styles.debtPaymentOptions}>
                                    <TouchableOpacity
                                        style={[styles.debtProviderBtn, debtPaymentMethod === 'ecocash' && styles.debtProviderBtnActive]}
                                        onPress={() => setDebtPaymentMethod('ecocash')}
                                    >
                                        <Text style={[styles.debtProviderText, debtPaymentMethod === 'ecocash' && styles.debtProviderTextActive]}>
                                            📱 EcoCash
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.debtProviderBtn, debtPaymentMethod === 'innbucks' && styles.debtProviderBtnActive]}
                                        onPress={() => setDebtPaymentMethod('innbucks')}
                                    >
                                        <Text style={[styles.debtProviderText, debtPaymentMethod === 'innbucks' && styles.debtProviderTextActive]}>
                                            ⚡ InnBucks
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                <Text style={styles.fieldLabel}>Mobile Number:</Text>
                                <TextInput
                                    style={styles.textInput}
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

                </KeyboardAvoidingView>
            </SafeAreaView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    keyboardView: { flex: 1 },
    topHeader: {
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 36 : 14,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 3,
    },
    headerTitleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    screenTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: -0.4,
    },
    screenSubTitle: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '500',
        marginTop: 2,
    },
    servicePillContainer: {
        flexDirection: 'row',
        backgroundColor: '#F1F5F9',
        borderRadius: 20,
        padding: 3,
    },
    servicePill: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 16,
    },
    servicePillActive: {
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 1,
    },
    servicePillText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748B',
    },
    servicePillTextActive: {
        color: '#055FEE',
        fontWeight: '700',
    },
    stepperContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
    },
    stepItem: {
        alignItems: 'center',
    },
    stepCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 4,
    },
    stepCircleActive: {
        backgroundColor: '#055FEE',
        shadowColor: '#055FEE',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.35,
        shadowRadius: 5,
        elevation: 4,
    },
    stepCircleCompleted: {
        backgroundColor: '#10B981',
    },
    stepCircleInactive: {
        backgroundColor: '#E2E8F0',
    },
    stepNumber: {
        fontSize: 13,
        fontWeight: '700',
        color: '#64748B',
    },
    stepNumberActive: {
        color: '#FFFFFF',
    },
    stepLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: '#94A3B8',
    },
    stepLabelActive: {
        color: '#055FEE',
        fontWeight: '700',
    },
    stepLine: {
        flex: 1,
        height: 2,
        backgroundColor: '#E2E8F0',
        marginHorizontal: 8,
        marginBottom: 16,
    },
    stepLineActive: {
        backgroundColor: '#10B981',
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 110,
    },
    stepFormCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 18,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 18,
    },
    sectionHeaderIcon: {
        marginRight: 12,
    },
    sectionTitleText: {
        fontSize: 16,
        fontWeight: '800',
        color: '#0F172A',
    },
    sectionSubtitleText: {
        fontSize: 12,
        color: '#64748B',
        marginTop: 2,
    },
    inputGroup: {
        marginBottom: 16,
    },
    inputLabelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    fieldLabel: {
        fontSize: 11,
        fontWeight: '800',
        color: '#475569',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    pinnedBadge: {
        fontSize: 11,
        fontWeight: '700',
        color: '#10B981',
        backgroundColor: '#D1FAE5',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    addressInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        paddingHorizontal: 12,
        height: 50,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    inputRowError: {
        borderColor: '#EF4444',
        backgroundColor: '#FEF2F2',
    },
    addressInputField: {
        flex: 1,
        fontSize: 14,
        color: '#0F172A',
        fontWeight: '500',
    },
    mapPinButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        gap: 4,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    mapPinButtonText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#055FEE',
    },
    inlineDropdownCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        marginTop: 6,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
        maxHeight: 180,
    },
    inlineSuggestionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#F8FAFC',
    },
    inlineMainText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#0F172A',
    },
    inlineSubText: {
        fontSize: 11,
        color: '#64748B',
    },
    fieldErrorText: {
        fontSize: 11,
        color: '#EF4444',
        marginTop: 4,
        fontWeight: '600',
    },
    packageCard: {
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginTop: 4,
    },
    packageHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    aiScanMiniBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
        gap: 4,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    aiScanMiniBtnText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#055FEE',
    },
    packageTextInput: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 12,
        fontSize: 14,
        color: '#0F172A',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        minHeight: 65,
        textAlignVertical: 'top',
    },
    scanningBox: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        gap: 8,
    },
    scanningLabel: {
        fontSize: 12,
        color: '#055FEE',
        fontWeight: '600',
    },
    packagePreviewRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        gap: 12,
    },
    packageThumb: {
        width: 50,
        height: 50,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#CBD5E1',
    },
    aiResultPill: {
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    aiResultTag: {
        fontSize: 10,
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 0.5,
    },
    aiResultValue: {
        fontSize: 13,
        fontWeight: '800',
        color: '#055FEE',
    },
    chipsWrap: {
        marginBottom: 10,
    },
    chipsTitle: {
        fontSize: 11,
        fontWeight: '700',
        color: '#64748B',
        marginBottom: 6,
    },
    chipsScroll: {
        gap: 8,
    },
    suggestionChip: {
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    suggestionChipText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#055FEE',
    },
    recipientToggleRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 16,
    },
    recipientToggleBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: '#F1F5F9',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    recipientToggleBtnActive: {
        backgroundColor: '#EFF6FF',
        borderColor: '#055FEE',
    },
    recipientToggleText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748B',
    },
    recipientToggleTextActive: {
        color: '#055FEE',
        fontWeight: '700',
    },
    selfContactCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F0FDF4',
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#BBF7D0',
        marginBottom: 18,
    },
    selfContactTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#166534',
        marginBottom: 2,
    },
    selfContactDesc: {
        fontSize: 12,
        color: '#334155',
    },
    otherRecipientBox: {
        marginBottom: 14,
    },
    textInput: {
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        paddingHorizontal: 14,
        height: 48,
        fontSize: 14,
        color: '#0F172A',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginTop: 4,
    },
    inputError: {
        borderColor: '#EF4444',
        backgroundColor: '#FEF2F2',
    },
    smsAlertsSection: {
        backgroundColor: '#F8FAFC',
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginTop: 6,
    },
    smsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    smsHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    smsTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: '#0F172A',
    },
    smsFeeBadge: {
        backgroundColor: '#FEF3C7',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    smsFeeText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#B45309',
    },
    smsDesc: {
        fontSize: 12,
        color: '#64748B',
        lineHeight: 16,
        marginBottom: 12,
    },
    smsOptionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        gap: 10,
    },
    smsOptionCardActive: {
        borderColor: '#10B981',
        backgroundColor: '#F0FDF4',
    },
    checkboxCircle: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: '#CBD5E1',
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxCircleActive: {
        backgroundColor: '#10B981',
        borderColor: '#10B981',
    },
    smsOptionTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1E293B',
    },
    smsOptionTitleActive: {
        color: '#047857',
    },
    smsOptionSub: {
        fontSize: 11,
        color: '#64748B',
    },
    bidCard: {
        backgroundColor: '#F8FAFC',
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginBottom: 16,
    },
    bidHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    bidHint: {
        fontSize: 12,
        fontWeight: '700',
        color: '#055FEE',
    },
    bidControlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        marginVertical: 4,
    },
    bidAdjustBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#CBD5E1',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 1,
    },
    bidDisplayWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: '#055FEE',
    },
    currencyPrefix: {
        fontSize: 22,
        fontWeight: '800',
        color: '#055FEE',
        marginRight: 4,
    },
    bidAmountInput: {
        fontSize: 24,
        fontWeight: '800',
        color: '#0F172A',
        minWidth: 70,
        textAlign: 'center',
    },
    bidNote: {
        fontSize: 11,
        color: '#64748B',
        textAlign: 'center',
        marginTop: 6,
    },
    promoBox: {
        marginBottom: 16,
    },
    promoInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 48,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    promoInputField: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
        color: '#0F172A',
    },
    promoApplyButton: {
        backgroundColor: '#055FEE',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    promoApplyText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '700',
    },
    promoRemoveButton: {
        backgroundColor: '#EF4444',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
    },
    promoRemoveText: {
        color: '#FFF',
        fontSize: 11,
        fontWeight: '700',
    },
    promoFeedback: {
        fontSize: 11,
        marginTop: 4,
        marginLeft: 4,
        fontWeight: '600',
    },
    promoFeedbackSuccess: {
        color: '#10B981',
    },
    promoFeedbackError: {
        color: '#EF4444',
    },
    paymentSection: {
        marginBottom: 16,
    },
    paymentMethodsGrid: {
        gap: 10,
        marginTop: 8,
    },
    paymentMethodCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        padding: 12,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
    },
    paymentMethodCardActive: {
        borderColor: '#055FEE',
        backgroundColor: '#EFF6FF',
    },
    paymentMethodIcon: {
        fontSize: 22,
        marginRight: 12,
    },
    paymentMethodTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1E293B',
    },
    paymentMethodTitleActive: {
        color: '#055FEE',
    },
    paymentMethodSubtitle: {
        fontSize: 11,
        color: '#64748B',
    },
    radioCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#CBD5E1',
        justifyContent: 'center',
        alignItems: 'center',
    },
    radioCircleActive: {
        borderColor: '#055FEE',
    },
    radioDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#055FEE',
    },
    digitalPhonePrompt: {
        marginTop: 12,
    },
    breakdownCard: {
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        padding: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    breakdownRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    breakdownLabel: {
        fontSize: 13,
        color: '#64748B',
        fontWeight: '500',
    },
    breakdownValue: {
        fontSize: 13,
        fontWeight: '700',
        color: '#0F172A',
    },
    breakdownDivider: {
        height: 1,
        backgroundColor: '#E2E8F0',
        marginVertical: 8,
    },
    breakdownTotalLabel: {
        fontSize: 15,
        fontWeight: '800',
        color: '#0F172A',
    },
    breakdownTotalValue: {
        fontSize: 18,
        fontWeight: '800',
        color: '#055FEE',
    },
    mockBtn: {
        backgroundColor: '#F1F5F9',
        padding: 12,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 16,
        borderWidth: 1,
        borderColor: '#CBD5E1',
    },
    mockBtnText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#475569',
    },
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#FFFFFF',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'ios' ? 28 : 16,
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 8,
    },
    bottomBarFarePreview: {
        marginRight: 12,
    },
    bottomFareLabel: {
        fontSize: 11,
        color: '#64748B',
        fontWeight: '600',
    },
    bottomFareValue: {
        fontSize: 20,
        fontWeight: '900',
        color: '#0F172A',
    },
    bottomBarButtonsRow: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 10,
    },
    backButton: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    nextButton: {
        flex: 1,
        maxWidth: 220,
        borderRadius: 14,
        overflow: 'hidden',
    },
    confirmButton: {
        flex: 1,
        maxWidth: 220,
        borderRadius: 14,
        overflow: 'hidden',
    },
    nextGradient: {
        height: 48,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    nextButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '800',
    },
    debtBanner: {
        backgroundColor: '#FFFBEB',
        borderWidth: 1.5,
        borderColor: '#F59E0B',
        borderRadius: 14,
        padding: 12,
        marginHorizontal: 16,
        marginTop: 12,
    },
    debtBannerTop: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    debtBannerIcon: {
        fontSize: 20,
        marginRight: 8,
    },
    debtBannerTextWrap: {
        flex: 1,
    },
    debtBannerTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: '#92400E',
    },
    debtBannerDesc: {
        fontSize: 11,
        color: '#B45309',
        marginTop: 2,
    },
    debtBannerActionBtn: {
        backgroundColor: '#F59E0B',
        paddingVertical: 6,
        borderRadius: 8,
        alignItems: 'center',
    },
    debtBannerActionText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    debtModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    debtModalCard: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
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
    debtModalAmount: {
        fontSize: 32,
        fontWeight: '900',
        color: '#F59E0B',
        textAlign: 'center',
        marginVertical: 8,
    },
    debtModalCurrency: {
        fontSize: 16,
        color: '#64748B',
    },
    debtModalExplainer: {
        fontSize: 13,
        color: '#64748B',
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 18,
    },
    debtPaymentOptions: {
        flexDirection: 'row',
        gap: 12,
        marginVertical: 10,
    },
    debtProviderBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
    },
    debtProviderBtnActive: {
        backgroundColor: '#EFF6FF',
        borderColor: '#055FEE',
    },
    debtProviderText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748B',
    },
    debtProviderTextActive: {
        color: '#055FEE',
        fontWeight: '800',
    },
    debtSettleBtn: {
        backgroundColor: '#10B981',
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
        marginTop: 16,
    },
    debtSettleBtnText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },
});
