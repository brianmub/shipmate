import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, StatusBar, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { orderService } from '../../services/orderService';

import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../utils/supabase';
import { ProofOfDeliveryModal } from '../../components/ProofOfDeliveryModal';
import { OrderStatus } from '../../types';

export const DriverActiveJobScreen = ({ navigation }: any) => {
    const { user } = useAuthStore();
    const [activeJob, setActiveJob] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [driverLocation, setDriverLocation] = useState<Location.LocationObject | null>(null);
    const [podVisible, setPodVisible] = useState(false);
    const locationSubscription = useRef<Location.LocationSubscription | null>(null);

    const fetchActiveJob = async () => {
        if (!user) return;
        try {
            setLoading(true);
            const data = await orderService.getActiveDriverJob(user.id);
            setActiveJob(data || null);
        } catch (error: any) {
            console.error('Error fetching active job:', error.message);
        } finally {
            setLoading(false);
        }
    };

    const startLocationTracking = async (jobId: string) => {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission to access location was denied');
            return;
        }

        locationSubscription.current = await Location.watchPositionAsync(
            {
                accuracy: Location.Accuracy.High,
                timeInterval: 10000,
                distanceInterval: 10,
            },
            async (location) => {
                setDriverLocation(location);
                // Push to Supabase via service
                try {
                    await orderService.updateDriverLocation(jobId, location.coords.latitude, location.coords.longitude);
                } catch (error) {
                    console.error("Error updating location:", error);
                }
            }
        );
    };

    const stopLocationTracking = () => {
        if (locationSubscription.current) {
            locationSubscription.current.remove();
            locationSubscription.current = null;
        }
    };

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            fetchActiveJob();
        });

        // Setup realtime subscription
        const channel = supabase
            .channel('public:driver_active_job')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `driver_id=eq.${user?.id}` }, () => {
                fetchActiveJob();
            })
            .subscribe();

        return () => {
            unsubscribe();
            stopLocationTracking();
            supabase.removeChannel(channel);
        };
    }, [user, navigation]);

    // Start/stop tracking based on activeJob
    useEffect(() => {
        if (activeJob) {
            startLocationTracking(activeJob.id);
        } else {
            stopLocationTracking();
        }
    }, [activeJob?.id]);

    const getNextStatus = (currentStatus: OrderStatus): OrderStatus | null => {
        const flow: OrderStatus[] = [
            'driver_assigned',
            'en_route_to_pickup',
            'arrived_at_pickup',
            'picked_up',
            'en_route_to_delivery',
            'arrived_at_delivery',
            'delivered'
        ];
        const currentIndex = flow.indexOf(currentStatus);
        if (currentIndex !== -1 && currentIndex < flow.length - 1) {
            return flow[currentIndex + 1];
        }
        return null;
    };

    const getButtonText = (status: OrderStatus) => {
        switch (status) {
            case 'driver_assigned': return 'Start En Route to Pickup';
            case 'en_route_to_pickup': return 'Arrived at Pickup';
            case 'arrived_at_pickup': return 'Package Collected';
            case 'picked_up': return 'Start En Route to Delivery';
            case 'en_route_to_delivery': return 'Arrived at Delivery';
            case 'arrived_at_delivery': return 'Complete Delivery';
            default: return 'Next Step';
        }
    };

    const handleNextStep = async () => {
        if (!activeJob) return;

        const nextStatus = getNextStatus(activeJob.status);
        
        if (activeJob.status === 'arrived_at_delivery') {
            setPodVisible(true);
            return;
        }

        if (nextStatus) {
            try {
                setLoading(true);
                await orderService.updateOrderStatus(activeJob.id, nextStatus);
                // Status will update via realtime subscription
            } catch (error: any) {
                Alert.alert("Error", error.message);
            } finally {
                setLoading(false);
            }
        }
    };

    const handlePodComplete = async (proof: { signatureUrl: string; photoUrl: string }) => {
        try {
            setLoading(true);
            await orderService.updateOrderStatus(activeJob.id, 'delivered');
            setPodVisible(false);
            Alert.alert("Job Completed!", "Great work! You have completed this delivery.");
            stopLocationTracking();
            setActiveJob(null);
            navigation.navigate('Jobs');
        } catch (error: any) {
            Alert.alert("Error", error.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading && !activeJob) {
        return (
            <LinearGradient colors={['#F8FAFC', '#E2E8F0']} style={styles.safeArea}>
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#34A853" />
                </View>
            </LinearGradient>
        );
    }

    if (!activeJob) {
        return (
            <LinearGradient colors={['#F8FAFC', '#E2E8F0']} style={styles.safeArea}>
                <View style={styles.centerContainer}>
                    <View style={styles.emptyIconCircle}>
                        <Text style={{ fontSize: 32 }}>💤</Text>
                    </View>
                    <Text style={styles.emptyTitle}>No Active Jobs</Text>
                    <Text style={styles.emptyText}>You don't have any ongoing deliveries right now.</Text>
                    <TouchableOpacity
                        style={styles.navigateButtonContainer}
                        activeOpacity={0.8}
                        onPress={() => navigation.navigate('Jobs')}
                    >
                        <LinearGradient
                            colors={['#34A853', '#2E9348']}
                            style={styles.navigateGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                        >
                            <Text style={styles.navigateButtonText}>Find Jobs</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </LinearGradient>
        );
    }

    const { pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude } = activeJob;

    // Determine initial region. Fallback to a default
    const initLat = parseFloat(pickup_latitude || dropoff_latitude || "37.78825");
    const initLng = parseFloat(pickup_longitude || dropoff_longitude || "-122.4324");

    const initialRegion = {
        latitude: isNaN(initLat) ? 37.78825 : initLat,
        longitude: isNaN(initLng) ? -122.4324 : initLng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
    };

    const isDelivery = activeJob.service_type === 'delivery';

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
            <View style={styles.mapContainer}>
                <MapView
                    style={styles.map}
                    initialRegion={initialRegion}
                    showsUserLocation={true}
                    showsMyLocationButton={false}
                >
                    {pickup_latitude && pickup_longitude && !isNaN(parseFloat(pickup_latitude)) && (
                        <Marker
                            coordinate={{ latitude: parseFloat(pickup_latitude), longitude: parseFloat(pickup_longitude) }}
                            title="Pickup"
                            pinColor="#3B82F6"
                        />
                    )}
                    {dropoff_latitude && dropoff_longitude && !isNaN(parseFloat(dropoff_latitude)) && (
                        <Marker
                            coordinate={{ latitude: parseFloat(dropoff_latitude), longitude: parseFloat(dropoff_longitude) }}
                            title="Dropoff"
                            pinColor="#10B981"
                        />
                    )}
                    {pickup_latitude && pickup_longitude && dropoff_latitude && dropoff_longitude && (
                        <Polyline
                            coordinates={[
                                { latitude: parseFloat(pickup_latitude), longitude: parseFloat(pickup_longitude) },
                                { latitude: parseFloat(dropoff_latitude), longitude: parseFloat(dropoff_longitude) }
                            ]}
                            strokeColor="#3B82F6"
                            strokeWidth={4}
                            lineDashPattern={[10, 10]}
                        />
                    )}
                </MapView>
            </View>

            <View style={styles.headerOverlay}>
                <BlurView intensity={40} tint="light" style={styles.headerBlur}>
                    <SafeAreaView edges={['top']}>
                        <View style={styles.headerContent}>
                            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                                <Text style={styles.backTxt}>← Back</Text>
                            </TouchableOpacity>
                            <Text style={styles.headerText}>Active Order</Text>
                            <View style={{ width: 60 }} />
                        </View>
                    </SafeAreaView>
                </BlurView>
            </View>

            <View style={styles.bottomOverlay}>
                <BlurView intensity={50} tint="light" style={styles.jobDetailsPanel}>
                    <SafeAreaView edges={['bottom']}>
                        <View style={styles.dragHandle} />

                        <View style={styles.titleRow}>
                            <View style={[styles.iconContainer, { backgroundColor: isDelivery ? 'rgba(52, 168, 83, 0.1)' : 'rgba(66, 133, 244, 0.1)' }]}>
                                <Text style={styles.serviceIcon}>{isDelivery ? '📦' : '🛒'}</Text>
                            </View>
                            <Text style={styles.jobType}>Current {isDelivery ? 'Delivery' : 'Errand'}</Text>
                        </View>

                        <View style={styles.locationContainer}>
                            <View style={styles.locationRow}>
                                <View style={styles.timelineDot} />
                                <Text style={styles.locationText} numberOfLines={2}>
                                    <Text style={styles.locationLabel}>From: </Text>
                                    {activeJob.pickup_address || activeJob.errand_location || 'Pickup Location'}
                                </Text>
                            </View>
                            <View style={styles.timelineLine} />
                            <View style={styles.locationRow}>
                                <View style={[styles.timelineDot, styles.timelineDotEnd]} />
                                <Text style={styles.locationText} numberOfLines={2}>
                                    <Text style={styles.locationLabel}>To: </Text>
                                    {activeJob.dropoff_address || 'Dropoff Location'}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.statusBadge}>
                            <Text style={styles.statusLabel}>Current Status: </Text>
                            <Text style={styles.statusValue}>{activeJob.status.replace(/_/g, ' ').toUpperCase()}</Text>
                        </View>

                        <TouchableOpacity
                            style={styles.completeButtonContainer}
                            activeOpacity={0.8}
                            onPress={handleNextStep}
                            disabled={loading}
                        >
                            <LinearGradient
                                colors={['#34A853', '#2E9348']}
                                style={styles.completeGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#FFFFFF" />
                                ) : (
                                    <Text style={styles.completeButtonText}>{getButtonText(activeJob.status)}</Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>

                        <ProofOfDeliveryModal 
                            visible={podVisible}
                            onClose={() => setPodVisible(false)}
                            onComplete={handlePodComplete}
                            orderId={activeJob.id}
                        />
                    </SafeAreaView>
                </BlurView>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    safeArea: { flex: 1 },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    emptyTitle: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginBottom: 8, letterSpacing: -0.5 },
    emptyText: { fontSize: 16, color: '#64748B', textAlign: 'center', marginBottom: 32 },
    emptyIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    navigateButtonContainer: {
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#34A853',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
        paddingHorizontal: 32,
    },
    navigateGradient: {
        paddingVertical: 16,
        paddingHorizontal: 32,
        alignItems: 'center',
    },
    navigateButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    mapContainer: { ...StyleSheet.absoluteFillObject },
    map: { width: '100%', height: '100%' },
    headerOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
    },
    headerBlur: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.4)',
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 20 : 10,
        paddingBottom: 16,
    },
    backBtn: {
        padding: 8,
        backgroundColor: 'rgba(255,255,255,0.6)',
        borderRadius: 12,
    },
    backTxt: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#334155',
    },
    headerText: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
    },
    bottomOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
    },
    jobDetailsPanel: {
        paddingHorizontal: 24,
        paddingTop: 12,
        paddingBottom: 20,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        borderWidth: 1,
        borderBottomWidth: 0,
        borderColor: 'rgba(255,255,255,0.8)',
        overflow: 'hidden',
    },
    dragHandle: {
        width: 48,
        height: 5,
        backgroundColor: 'rgba(0,0,0,0.1)',
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: 24,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    serviceIcon: {
        fontSize: 20,
    },
    jobType: { fontSize: 24, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
    locationContainer: {
        backgroundColor: 'rgba(255,255,255,0.6)',
        padding: 16,
        borderRadius: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
    },
    locationRow: { flexDirection: 'row', alignItems: 'flex-start' },
    timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#3B82F6', marginRight: 12, marginTop: 4 },
    timelineDotEnd: { backgroundColor: '#10B981' },
    timelineLine: { height: 24, width: 2, backgroundColor: '#CBD5E1', marginLeft: 4, marginVertical: 2 },
    locationText: { flex: 1, fontSize: 15, color: '#0F172A', fontWeight: '500', lineHeight: 20 },
    locationLabel: { color: '#64748B', fontWeight: '400' },
    completeButtonContainer: {
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#34A853',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
        marginBottom: Platform.OS === 'ios' ? 0 : 20,
    },
    completeGradient: {
        paddingVertical: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    completeButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold', letterSpacing: 0.5 },
    statusBadge: {
        flexDirection: 'row',
        backgroundColor: 'rgba(52, 168, 83, 0.1)',
        padding: 12,
        borderRadius: 12,
        marginBottom: 20,
        justifyContent: 'center',
    },
    statusLabel: { fontSize: 14, color: '#475569', fontWeight: '600' },
    statusValue: { fontSize: 14, color: '#34A853', fontWeight: '800' },
});
