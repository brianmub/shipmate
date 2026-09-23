import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { supabase } from '../utils/supabase';
import { orderService } from '../services/orderService';
import { useAuthStore } from '../store/authStore';

interface JobOfferModalProps {
    visible: boolean;
    onClose: () => void;
    order: any;
    onOfferSubmitted: () => void;
    presenceChannel?: any;
}

export const JobOfferModal = ({ visible, onClose, order, onOfferSubmitted, presenceChannel }: JobOfferModalProps) => {
    const { user } = useAuthStore();
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [calculatingETA, setCalculatingETA] = useState(false);
    const [calculatedETA, setCalculatedETA] = useState<number | null>(null);
    const [driverCoords, setDriverCoords] = useState<{ lat: number, lng: number } | null>(null);

    const minAmount = order?.estimated_cost || 0;

    // Pre-populate amount when modal opens
    useEffect(() => {
        if (visible && minAmount > 0) {
            setAmount(minAmount.toFixed(2));
        }
    }, [visible, minAmount]);

    // Calculate ETA automatically based on location
    useEffect(() => {
        if (visible && order) {
            calculateAutoETA();
        }
    }, [visible, order]);

    const calculateAutoETA = async () => {
        setCalculatingETA(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission denied', 'Allow location access to calculate ETA.');
                return;
            }

            const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const dLat = location.coords.latitude;
            const dLng = location.coords.longitude;
            setDriverCoords({ lat: dLat, lng: dLng });

            // Simple distance-based ETA (Haversine-ish)
            // pLat/pLng are the pickup coordinates
            const pLat = parseFloat(order.pickup_latitude || order.errand_location_lat || dLat);
            const pLng = parseFloat(order.pickup_longitude || order.errand_location_lng || dLng);

            // Calculate distance in km (rough)
            const R = 6371; // Earth radius in km
            const dLatRad = (pLat - dLat) * Math.PI / 180;
            const dLngRad = (pLng - dLng) * Math.PI / 180;
            const a = Math.sin(dLatRad / 2) * Math.sin(dLatRad / 2) +
                      Math.cos(dLat * Math.PI / 180) * Math.cos(pLat * Math.PI / 180) *
                      Math.sin(dLngRad / 2) * Math.sin(dLngRad / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distance = R * c;

            // Heuristic: 3 minutes per KM + 2 mins prep time
            const eta = Math.round((distance * 3) + 2);
            setCalculatedETA(Math.max(5, eta)); // Min 5 mins
        } catch (error) {
            console.error('ETA Calculation error:', error);
            setCalculatedETA(10); // Fallback
        } finally {
            setCalculatingETA(false);
        }
    };

    const handleSubmit = async () => {
        const offerAmount = parseFloat(amount);

        // Step 4 Validation: reject if amount <= 0
        if (isNaN(offerAmount) || offerAmount <= 0) {
            Alert.alert('Invalid Amount', 'Offer must be greater than $0.00');
            return;
        }

        if (offerAmount < minAmount) {
            Alert.alert('Invalid Amount', `Offer must be at least $${minAmount.toFixed(2)}`);
            return;
        }

        // Step 4 Validation: reject if request has expired
        if (order?.expires_at && new Date(order.expires_at).getTime() <= Date.now()) {
            Alert.alert('Request Expired', 'This request has expired and is no longer accepting bids.');
            return;
        }

        if (!driverCoords || !calculatedETA) {
            Alert.alert('Error', 'Unable to determine your location. Please try again.');
            return;
        }

        setLoading(true);
        try {
            const requestId = order.id;
            const mateId = user!.id;

            // 1. Instant Realtime Broadcast on the request channel (send first for responsiveness)
            const targetChannel = presenceChannel || supabase.channel(`request:${requestId}`);
            try {
                targetChannel.send({
                    type: 'broadcast',
                    event: 'bid',
                    payload: {
                        mate_id: mateId,
                        amount: offerAmount,
                        request_id: requestId,
                        driver_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Courier',
                        driver_avatar: user?.user_metadata?.avatar_url || null,
                        pickup_time_estimate: calculatedETA,
                        driver_latitude: driverCoords.lat,
                        driver_longitude: driverCoords.lng,
                    },
                });
            } catch (broadcastErr) {
                console.warn('Realtime bid broadcast warning:', broadcastErr);
            }

            // 2. Fire-and-forget insert into bids table for persistence/audit (non-blocking)
            supabase
                .from('bids')
                .insert({
                    request_id: requestId,
                    mate_id: mateId,
                    amount: offerAmount,
                })
                .then(({ error }: any) => {
                    if (error) {
                        console.warn('Bids table persistence note:', error.message);
                    }
                })
                .catch((err: any) => console.warn('Bids insert error:', err));

            // 3. Also invoke legacy orderService.submitOffer for orders compatibility
            try {
                await orderService.submitOffer(
                    requestId,
                    mateId,
                    offerAmount,
                    calculatedETA,
                    driverCoords.lat,
                    driverCoords.lng
                );
            } catch (legacyErr: any) {
                console.warn('Legacy submitOffer note:', legacyErr.message);
            }

            Alert.alert('Offer Submitted', 'Your offer has been sent to the customer!');
            onOfferSubmitted();
            onClose();
        } catch (error: any) {
            Alert.alert('Error', error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.centeredView}
            >
                <BlurView intensity={30} tint="dark" style={styles.blurContainer}>
                    <View style={styles.modalView}>
                        <View style={styles.header}>
                            <Text style={styles.modalTitle}>Make an Offer</Text>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <Text style={styles.closeBtnText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Payment Method Indicator Pill */}
                        <View style={[
                            styles.paymentMethodPill,
                            order?.payment_method === 'cash_on_delivery' 
                                ? styles.paymentMethodPillCod 
                                : styles.paymentMethodPillDigital
                        ]}>
                            <Text style={styles.paymentMethodPillIcon}>
                                {order?.payment_method === 'cash_on_delivery' ? '💵' : '✅'}
                            </Text>
                            <Text style={[
                                styles.paymentMethodPillText,
                                order?.payment_method === 'cash_on_delivery' 
                                    ? styles.paymentMethodPillTextCod 
                                    : styles.paymentMethodPillTextDigital
                            ]}>
                                {order?.payment_method === 'cash_on_delivery' 
                                    ? 'Cash on Delivery (Collect Cash)' 
                                    : `Paid Digitally (${(order?.payment_method || 'Online').toUpperCase()})`}
                            </Text>
                        </View>

                        <View style={styles.infoRow}>
                            <View>
                                <Text style={styles.infoLabel}>Platform Fee:</Text>
                                <Text style={styles.infoValue}>${minAmount.toFixed(2)}</Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={styles.infoLabel}>Auto-Calculated ETA:</Text>
                                {calculatingETA ? (
                                    <ActivityIndicator size="small" color="#055FEE" />
                                ) : (
                                    <Text style={styles.infoValue}>{calculatedETA} mins</Text>
                                )}
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Your Offer Amount ($)</Text>
                            <TextInput
                                style={styles.input}
                                placeholder={`Min: $${minAmount.toFixed(2)}`}
                                placeholderTextColor="rgba(255,255,255,0.4)"
                                keyboardType="decimal-pad"
                                value={amount}
                                onChangeText={setAmount}
                                autoFocus
                            />
                            <Text style={styles.helperText}>Offer must be equal or higher than platform fee.</Text>
                        </View>

                        <TouchableOpacity 
                            style={styles.submitBtnContainer}
                            onPress={handleSubmit}
                            disabled={loading || calculatingETA}
                        >
                            <LinearGradient
                                colors={['#055FEE', '#5B99F2']}
                                style={styles.submitBtn}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#FFFFFF" />
                                ) : (
                                    <Text style={styles.submitBtnText}>Submit My Offer</Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </BlurView>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    centeredView: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    blurContainer: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalView: {
        backgroundColor: '#1E293B',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 32,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: -0.5,
    },
    closeBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeBtnText: {
        color: '#FFFFFF',
        fontSize: 16,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: 'rgba(5, 95, 238, 0.1)',
        borderRadius: 16,
        marginBottom: 24,
    },
    infoLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        fontWeight: '500',
    },
    infoValue: {
        color: '#055FEE',
        fontSize: 16,
        fontWeight: 'bold',
    },
    inputGroup: {
        marginBottom: 20,
    },
    inputLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        marginBottom: 8,
        fontWeight: '500',
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 16,
        color: '#FFFFFF',
        fontSize: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    helperText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 8,
        fontStyle: 'italic',
    },
    submitBtnContainer: {
        marginTop: 12,
        borderRadius: 16,
        overflow: 'hidden',
    },
    submitBtn: {
        paddingVertical: 18,
        alignItems: 'center',
    },
    submitBtnText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    // Payment Method Indicator Styles
    paymentMethodPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        marginBottom: 16,
        gap: 8,
    },
    paymentMethodPillCod: {
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        borderWidth: 1,
        borderColor: '#F59E0B',
    },
    paymentMethodPillDigital: {
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        borderWidth: 1,
        borderColor: '#10B981',
    },
    paymentMethodPillIcon: {
        fontSize: 16,
    },
    paymentMethodPillText: {
        fontSize: 13,
        fontWeight: '700',
    },
    paymentMethodPillTextCod: {
        color: '#FCD34D',
    },
    paymentMethodPillTextDigital: {
        color: '#6EE7B7',
    },
});
