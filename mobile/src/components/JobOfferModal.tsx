import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { orderService } from '../services/orderService';
import { useAuthStore } from '../store/authStore';

interface JobOfferModalProps {
    visible: boolean;
    onClose: () => void;
    order: any;
    onOfferSubmitted: () => void;
}

export const JobOfferModal = ({ visible, onClose, order, onOfferSubmitted }: JobOfferModalProps) => {
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

        if (isNaN(offerAmount) || offerAmount < minAmount) {
            Alert.alert('Invalid Amount', `Offer must be at least $${minAmount.toFixed(2)}`);
            return;
        }

        if (!driverCoords || !calculatedETA) {
            Alert.alert('Error', 'Unable to determine your location. Please try again.');
            return;
        }

        setLoading(true);
        try {
            await orderService.submitOffer(
                order.id, 
                user!.id, 
                offerAmount, 
                calculatedETA, 
                driverCoords.lat, 
                driverCoords.lng
            );
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
});
