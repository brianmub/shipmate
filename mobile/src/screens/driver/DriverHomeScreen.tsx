import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, TouchableOpacity, StatusBar, Platform, Alert } from 'react-native';
import MapView, { Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuthStore } from '../../store/authStore';

import { useEffect } from 'react';
import { userService } from '../../services/userService';

const darkMapStyle = [
    {
        "elementType": "geometry",
        "stylers": [{ "color": "#242f3e" }]
    },
    {
        "elementType": "labels.text.fill",
        "stylers": [{ "color": "#746855" }]
    },
    {
        "elementType": "labels.text.stroke",
        "stylers": [{ "color": "#242f3e" }]
    },
    {
        "featureType": "administrative.locality",
        "elementType": "labels.text.fill",
        "stylers": [{ "color": "#d59563" }]
    },
    {
        "featureType": "road",
        "elementType": "geometry",
        "stylers": [{ "color": "#38414e" }]
    },
    {
        "featureType": "road",
        "elementType": "geometry.stroke",
        "stylers": [{ "color": "#212a37" }]
    },
    {
        "featureType": "road",
        "elementType": "labels.text.fill",
        "stylers": [{ "color": "#9ca5b3" }]
    },
    {
        "featureType": "water",
        "elementType": "geometry",
        "stylers": [{ "color": "#17263c" }]
    }
];

export const DriverHomeScreen = ({ navigation }: any) => {
    const { user, verificationStatus } = useAuthStore();
    const [isOnline, setIsOnline] = useState(true);
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Heatmap / Hot Zone State
    const [hotZones, setHotZones] = useState<any[]>([]);

    const generateHotZones = () => {
        // Mock data for demand hot zones around a central point (Silicon Valley mock)
        const zones = [
            { id: 1, latitude: 37.78825, longitude: -122.4324, radius: 800, intensity: 'high' },
            { id: 2, latitude: 37.7749, longitude: -122.4194, radius: 1200, intensity: 'medium' },
            { id: 3, latitude: 37.7950, longitude: -122.4000, radius: 600, intensity: 'high' },
            { id: 4, latitude: 37.7500, longitude: -122.4400, radius: 1500, intensity: 'low' },
        ];
        setHotZones(zones);
    };

    const isApproved = verificationStatus === 'approved';
    const isPending = verificationStatus === 'pending';
    const isRejected = verificationStatus === 'rejected';

    const firstName = user?.user_metadata?.full_name?.split(' ')[0] || 'Courier';

    const fetchData = async () => {
        if (!user) return;
        try {
            setLoading(true);
            const data = await userService.getDriverProfile(user.id);
            setProfile(data);
            setIsOnline(data.is_online ?? true);
        } catch (error) {
            console.error('Error fetching driver profile:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        generateHotZones();
    }, []);

    const toggleOnline = async () => {
        const nextState = !isOnline;
        setIsOnline(nextState);
        try {
            await userService.toggleOnlineStatus(user!.id, nextState);
        } catch (error) {
            setIsOnline(!nextState); // Rollback on error
            console.error('Error toggling status:', error);
        }
    };

    return (
        <LinearGradient
            colors={['#0F2027', '#203A43', '#2C5364']}
            style={styles.container}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
        >
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
            <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                    <View style={styles.header}>
                        <View>
                            <Text style={styles.greetingTitle}>Hello, {firstName}</Text>
                            <Text style={styles.greetingSubtitle}>
                                {isApproved ? 'Ready for deliveries?' : 'Account Status'}
                            </Text>
                        </View>

                        <BlurView intensity={20} tint="light" style={styles.toggleContainer}>
                            <Text style={[styles.statusText, isOnline ? styles.statusOnline : styles.statusOffline]}>
                                {isOnline ? 'ONLINE' : 'OFFLINE'}
                            </Text>
                            <Switch
                                trackColor={{ false: 'rgba(255,255,255,0.2)', true: '#055FEE' }}
                                thumbColor={isOnline ? '#FFFFFF' : '#f4f3f4'}
                                ios_backgroundColor="rgba(255,255,255,0.2)"
                                onValueChange={toggleOnline}
                                value={isOnline}
                            />
                        </BlurView>
                    </View>

                    {/* PREDICTIVE HEATMAP SECTION */}
                    <View style={styles.mapCard}>
                        <View style={styles.mapHeader}>
                            <Text style={styles.mapTitle}>Live Demand Heatmap</Text>
                            <View style={styles.liveBadge}>
                                <View style={styles.liveDot} />
                                <Text style={styles.liveText}>PREDICTIVE AI</Text>
                            </View>
                        </View>
                        
                        <View style={styles.mapWrapper}>
                            <MapView
                                provider={PROVIDER_GOOGLE}
                                style={styles.map}
                                initialRegion={{
                                    latitude: 37.78825,
                                    longitude: -122.4324,
                                    latitudeDelta: 0.05,
                                    longitudeDelta: 0.05,
                                }}
                                customMapStyle={darkMapStyle}
                            >
                                {hotZones.map(zone => (
                                    <Circle
                                        key={zone.id}
                                        center={{ latitude: zone.latitude, longitude: zone.longitude }}
                                        radius={zone.radius}
                                        fillColor={
                                            zone.intensity === 'high' ? 'rgba(239, 68, 68, 0.4)' :
                                            zone.intensity === 'medium' ? 'rgba(245, 158, 11, 0.4)' :
                                            'rgba(234, 179, 8, 0.4)'
                                        }
                                        strokeColor={
                                            zone.intensity === 'high' ? 'rgba(239, 68, 68, 0.6)' :
                                            zone.intensity === 'medium' ? 'rgba(245, 158, 11, 0.6)' :
                                            'rgba(234, 179, 8, 0.6)'
                                        }
                                        strokeWidth={2}
                                    />
                                ))}
                            </MapView>
                            
                            {!isOnline && (
                                <BlurView intensity={80} tint="dark" style={styles.mapOverlay}>
                                    <Text style={styles.mapOverlayText}>Go Online to see Live Demand</Text>
                                </BlurView>
                            )}
                        </View>
                        
                        <View style={styles.mapFooter}>
                            <Text style={styles.mapFooterText}>
                                {isOnline ? "High demand detected in Downtown SOMA" : "Historical demand data shown"}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Today's Snapshot</Text>
                        <TouchableOpacity onPress={() => navigation.navigate('Earnings')}>
                            <Text style={styles.viewMore}>View Details →</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.statsGrid}>
                        <BlurView intensity={20} tint="light" style={styles.statCardContainer}>
                            <Text style={styles.statLabel}>Earnings</Text>
                            <Text style={[styles.statValue, styles.earningsValue]}>${profile?.available_balance?.toFixed(2) || '0.00'}</Text>
                        </BlurView>
                        <BlurView intensity={20} tint="light" style={styles.statCardContainer}>
                            <Text style={styles.statLabel}>Deliveries</Text>
                            <Text style={styles.statValue}>{profile?.completed_deliveries || 0}</Text>
                        </BlurView>
                    </View>

                    <View style={styles.statsGrid}>
                        <BlurView intensity={20} tint="light" style={styles.statCardContainer}>
                            <Text style={styles.statLabel}>Rating</Text>
                            <View style={styles.row}>
                                <Text style={styles.statValue}>{profile?.average_rating || '5.0'}</Text>
                                <Text style={{ marginLeft: 4, fontSize: 16 }}>⭐</Text>
                            </View>
                        </BlurView>
                        <BlurView intensity={20} tint="light" style={styles.statCardContainer}>
                            <Text style={styles.statLabel}>Radius</Text>
                            <Text style={styles.statValue}>{profile?.working_radius_km || 10}km</Text>
                        </BlurView>
                    </View>

                    <View style={styles.jobsSection}>
                        <Text style={styles.sectionTitle}>Job Queue</Text>
                        <TouchableOpacity
                            style={styles.jobsButtonContainer}
                            activeOpacity={0.8}
                            onPress={() => navigation.navigate('Jobs')}
                            disabled={!isOnline}
                        >
                            <LinearGradient
                                colors={isOnline ? ['#055FEE', '#5B99F2'] : ['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.1)']}
                                style={styles.jobsGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                <Text style={[styles.jobsButtonText, !isOnline && styles.jobsButtonTextOffline]}>
                                    {isOnline ? 'View Available Jobs' : 'Go Online to View Jobs'}
                                </Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>

                </ScrollView>
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
    scrollContent: {
        paddingHorizontal: 24,
        paddingTop: Platform.OS === 'android' ? 60 : 20,
        paddingBottom: 40,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 32,
    },
    greetingTitle: {
        fontSize: 32,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: -0.5,
        marginBottom: 4,
    },
    greetingSubtitle: {
        fontSize: 16,
        color: '#E2E8F0',
    },
    toggleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    statusText: {
        marginRight: 8,
        fontWeight: 'bold',
        fontSize: 13,
        letterSpacing: 0.5,
    },
    statusOnline: {
        color: '#10B981',
    },
    statusOffline: {
        color: '#E2E8F0',
    },
    offlineWarning: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.4)',
        marginBottom: 32,
    },
    warningIcon: {
        fontSize: 20,
        marginRight: 12,
    },
    offlineWarningText: {
        flex: 1,
        color: '#FCD34D',
        fontSize: 14,
        fontWeight: '500',
        lineHeight: 20,
    },
    pendingBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(5, 95, 238, 0.15)',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(5, 95, 238, 0.4)',
        marginBottom: 32,
    },
    pendingText: {
        flex: 1,
        color: '#86EFAC',
        fontSize: 14,
        fontWeight: '500',
        lineHeight: 20,
    },
    rejectedBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.4)',
        marginBottom: 32,
    },
    rejectedText: {
        flex: 1,
        color: '#FCA5A5',
        fontSize: 14,
        fontWeight: '500',
        lineHeight: 20,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    viewMore: {
        fontSize: 14,
        color: '#055FEE',
        fontWeight: '600',
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#FFFFFF',
        letterSpacing: -0.5,
    },
    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
        gap: 16,
    },
    statCardContainer: {
        flex: 1,
        padding: 24,
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    statLabel: {
        fontSize: 14,
        color: '#CBD5E1',
        marginBottom: 8,
        fontWeight: '600',
    },
    statValue: {
        fontSize: 28,
        fontWeight: '800',
        color: '#38BDF8',
    },
    earningsValue: {
        color: '#34D399',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    jobsSection: {
        marginTop: 24,
    },
    jobsButtonContainer: {
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#055FEE',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    jobsGradient: {
        paddingVertical: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    jobsButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    jobsButtonTextOffline: {
        color: 'rgba(255,255,255,0.5)',
    },
    mapCard: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        marginBottom: 32,
    },
    mapHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
    },
    mapTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    liveBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(176, 106, 40, 0.3)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    liveDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#055FEE',
        marginRight: 6,
    },
    liveText: {
        color: '#055FEE',
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1,
    },
    mapWrapper: {
        width: '100%',
        height: 250,
    },
    map: {
        ...StyleSheet.absoluteFillObject,
    },
    mapOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    mapOverlayText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 16,
        textAlign: 'center',
        paddingHorizontal: 40,
    },
    mapFooter: {
        padding: 12,
        backgroundColor: 'rgba(0,0,0,0.2)',
    },
    mapFooterText: {
        color: '#94A3B8',
        fontSize: 12,
        textAlign: 'center',
    },
});
