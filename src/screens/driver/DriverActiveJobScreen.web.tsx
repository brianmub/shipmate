import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, StatusBar, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { supabase } from '../../utils/supabase';
import { useAuthStore } from '../../store/authStore';

export const DriverActiveJobScreen = ({ navigation }: any) => {
    const { user } = useAuthStore();
    const [activeJob, setActiveJob] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [driverLocation, setDriverLocation] = useState<Location.LocationObject | null>(null);
    const locationSubscription = useRef<Location.LocationSubscription | null>(null);

    const fetchActiveJob = async () => {
        if (!user) return;
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .eq('driver_id', user.id)
                .in('status', ['accepted', 'in_progress'])
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            setActiveJob(data || null);
        } catch (error: any) {
            console.error('Error fetching active job:', error.message);
        } finally {
            setLoading(false);
        }
    };

    // Location tracking is usually limited on web browsers compared to native, 
    // but we can keep the logic or just disable it for web if needed.
    const startLocationTracking = async (jobId: string) => {
        // Web location permissions
        try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                console.warn('Web location permission denied');
                return;
            }

            locationSubscription.current = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.Balanced,
                    timeInterval: 10000,
                    distanceInterval: 10,
                },
                async (location) => {
                    setDriverLocation(location);
                    await supabase
                        .from('orders')
                        .update({
                            driver_latitude: location.coords.latitude,
                            driver_longitude: location.coords.longitude,
                        })
                        .eq('id', jobId);
                }
            );
        } catch (e) {
            console.error("Location tracking error on web:", e);
        }
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

        const channel = supabase
            .channel('public:driver_active_job_web')
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

    useEffect(() => {
        if (activeJob) {
            startLocationTracking(activeJob.id);
        } else {
            stopLocationTracking();
        }
    }, [activeJob?.id]);

    const handleCompleteJob = async () => {
        if (!activeJob) return;
        try {
            setLoading(true);
            const { error } = await supabase
                .from('orders')
                .update({ status: 'completed' })
                .eq('id', activeJob.id);

            if (error) throw error;
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

    const isDelivery = activeJob.service_type === 'delivery';

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />
            
            <View style={styles.mapPlaceholder}>
                <View style={styles.placeholderContent}>
                    <Text style={styles.placeholderEmoji}>🗺️</Text>
                    <Text style={styles.placeholderTitle}>Interactive Maps Unavailable on Web</Text>
                    <Text style={styles.placeholderText}>
                        Tracking is fully supported on our mobile app.
                    </Text>
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>Web Preview Mode</Text>
                    </View>
                </View>
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

                        <TouchableOpacity
                            style={styles.completeButtonContainer}
                            activeOpacity={0.8}
                            onPress={handleCompleteJob}
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
                                    <Text style={styles.completeButtonText}>Complete Delivery</Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
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
    emptyTitle: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
    emptyText: { fontSize: 16, color: '#64748B', textAlign: 'center', marginBottom: 32 },
    emptyIconCircle: {
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
        marginBottom: 20, elevation: 2,
    },
    navigateButtonContainer: { borderRadius: 16, overflow: 'hidden' },
    navigateGradient: { paddingVertical: 16, paddingHorizontal: 32, alignItems: 'center' },
    navigateButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    
    mapPlaceholder: {
        flex: 1,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    placeholderContent: {
        alignItems: 'center',
        maxWidth: 300,
    },
    placeholderEmoji: { fontSize: 48, marginBottom: 16 },
    placeholderTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B', textAlign: 'center', marginBottom: 8 },
    placeholderText: { fontSize: 14, color: '#64748B', textAlign: 'center', marginBottom: 20 },
    badge: { backgroundColor: '#E2E8F0', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99 },
    badgeText: { fontSize: 12, fontWeight: '600', color: '#475569' },

    headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
    headerBlur: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.4)' },
    headerContent: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16,
    },
    backBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 12 },
    backTxt: { fontSize: 14, fontWeight: 'bold', color: '#334155' },
    headerText: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
    
    bottomOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0 },
    jobDetailsPanel: {
        paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20,
        borderTopLeftRadius: 32, borderTopRightRadius: 32,
        borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,0.8)',
    },
    dragHandle: { width: 48, height: 5, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 3, alignSelf: 'center', marginBottom: 24 },
    titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    iconContainer: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    serviceIcon: { fontSize: 20 },
    jobType: { fontSize: 24, fontWeight: '800', color: '#0F172A' },
    locationContainer: {
        backgroundColor: 'rgba(255,255,255,0.6)', padding: 16,
        borderRadius: 16, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
    },
    locationRow: { flexDirection: 'row', alignItems: 'flex-start' },
    timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#3B82F6', marginRight: 12, marginTop: 4 },
    timelineDotEnd: { backgroundColor: '#10B981' },
    timelineLine: { height: 24, width: 2, backgroundColor: '#CBD5E1', marginLeft: 4, marginVertical: 2 },
    locationText: { flex: 1, fontSize: 15, color: '#0F172A', fontWeight: '500' },
    locationLabel: { color: '#64748B', fontWeight: '400' },
    completeButtonContainer: { borderRadius: 16, overflow: 'hidden', marginBottom: 20 },
    completeGradient: { paddingVertical: 18, alignItems: 'center' },
    completeButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
