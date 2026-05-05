import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuthStore } from '../../store/authStore';

import { useEffect } from 'react';
import { userService } from '../../services/userService';

export const DriverHomeScreen = ({ navigation }: any) => {
    const { user } = useAuthStore();
    const [isOnline, setIsOnline] = useState(false);
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const firstName = user?.user_metadata?.full_name?.split(' ')[0] || 'Courier';

    const fetchData = async () => {
        if (!user) return;
        try {
            setLoading(true);
            const data = await userService.getDriverProfile(user.id);
            setProfile(data);
            setIsOnline(data.is_online);
        } catch (error) {
            console.error('Error fetching driver profile:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
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
                            <Text style={styles.greetingSubtitle}>Ready for deliveries?</Text>
                        </View>

                        <BlurView intensity={20} tint="light" style={styles.toggleContainer}>
                            <Text style={[styles.statusText, isOnline ? styles.statusOnline : styles.statusOffline]}>
                                {isOnline ? 'ONLINE' : 'OFFLINE'}
                            </Text>
                            <Switch
                                trackColor={{ false: 'rgba(255,255,255,0.2)', true: '#34A853' }}
                                thumbColor={isOnline ? '#FFFFFF' : '#f4f3f4'}
                                ios_backgroundColor="rgba(255,255,255,0.2)"
                                onValueChange={toggleOnline}
                                value={isOnline}
                            />
                        </BlurView>
                    </View>

                    {!isOnline && (
                        <View style={styles.offlineWarning}>
                            <Text style={styles.warningIcon}>⚠️</Text>
                            <Text style={styles.offlineWarningText}>
                                Go online to start receiving delivery and errand requests.
                            </Text>
                        </View>
                    )}

                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Today's Snapshot</Text>
                        <TouchableOpacity onPress={() => navigation.navigate('Earnings')}>
                            <Text style={styles.viewMore}>View Details →</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.statsGrid}>
                        <BlurView intensity={20} tint="light" style={styles.statCardContainer}>
                            <Text style={styles.statLabel}>Earnings</Text>
                            <Text style={styles.statValue}>${profile?.available_balance?.toFixed(2) || '0.00'}</Text>
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
                                colors={isOnline ? ['#34A853', '#2E9348'] : ['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.1)']}
                                style={styles.jobsGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                <Text style={[styles.jobsButtonText, !isOnline && styles.jobsButtonTextOffline]}>
                                    {isOnline ? 'View Available Jobs' : 'Offline'}
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
        color: 'rgba(255,255,255,0.7)',
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
        color: '#34A853',
    },
    statusOffline: {
        color: 'rgba(255,255,255,0.5)',
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
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    viewMore: {
        fontSize: 14,
        color: '#34A853',
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
        color: 'rgba(255,255,255,0.7)',
        marginBottom: 8,
        fontWeight: '500',
    },
    statValue: {
        fontSize: 28,
        fontWeight: '800',
        color: '#34A853',
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
        shadowColor: '#34A853',
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
});
