import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../../store/authStore';
import { orderService } from '../../services/orderService';

export const CustomerHomeScreen = ({ navigation }: any) => {
    const { user } = useAuthStore();
    const firstName = user?.user_metadata?.full_name?.split(' ')[0] || 'Guest';
    const [activeTrip, setActiveTrip] = useState<any>(null);

    // Auto-detect and lock onto active trip whenever Home screen is focused
    useFocusEffect(
        useCallback(() => {
            let isActive = true;

            const checkActiveTrip = async () => {
                if (!user?.id) return;
                try {
                    const active = await orderService.getActiveCustomerOrder(user.id);
                    if (isActive && active) {
                        setActiveTrip(active);
                        navigation.navigate('CustomerTracking', { orderId: active.id });
                    } else if (isActive) {
                        setActiveTrip(null);
                    }
                } catch (err) {
                    console.warn('Error checking active customer trip on HomeScreen:', err);
                }
            };

            checkActiveTrip();

            return () => {
                isActive = false;
            };
        }, [user?.id, navigation])
    );

    return (
        <LinearGradient
            colors={['#F8FAFC', '#E2E8F0']}
            style={styles.container}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
        >
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
            <SafeAreaView style={styles.safeArea}>
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                    {/* Header */}
                    <View style={styles.headerContainer}>
                        <View>
                            <Text style={styles.greeting}>Good Morning,</Text>
                            <Text style={styles.name}>{firstName}</Text>
                        </View>
                        <TouchableOpacity style={styles.profileAvatar} onPress={() => navigation.navigate('CustomerProfile')}>
                            <LinearGradient
                                colors={['#055FEE', '#5B99F2']}
                                style={styles.avatarGradient}
                            >
                                <Text style={styles.avatarText}>{firstName.charAt(0)}</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>

                    {/* Active Trip Persistent Banner (if an order is currently live) */}
                    {activeTrip && (
                        <TouchableOpacity
                            activeOpacity={0.88}
                            style={styles.activeTripBannerContainer}
                            onPress={() => navigation.navigate('CustomerTracking', { orderId: activeTrip.id })}
                        >
                            <LinearGradient
                                colors={['#055FEE', '#1E40AF']}
                                style={styles.activeTripBannerGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                <View style={styles.activeTripHeaderRow}>
                                    <View style={styles.livePulseDot} />
                                    <Text style={styles.activeTripBadge}>TRIP IN PROGRESS</Text>
                                    <Text style={styles.activeTripCost}>
                                        ${parseFloat(activeTrip.estimated_cost || 0).toFixed(2)} USD
                                    </Text>
                                </View>
                                <Text style={styles.activeTripTitle}>
                                    Your Mate is on their way! 🚀
                                </Text>
                                <Text style={styles.activeTripSubtitle} numberOfLines={1}>
                                    To: {activeTrip.dropoff_address || 'Destination'}
                                </Text>
                                <View style={styles.activeTripCtaRow}>
                                    <Text style={styles.activeTripCtaText}>Return to Live Tracking Map</Text>
                                    <Text style={styles.activeTripCtaArrow}>➔</Text>
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>
                    )}

                    {/* Services Section */}
                    <Text style={styles.sectionTitle}>What do you need today?</Text>

                    <View style={styles.servicesGrid}>
                        <TouchableOpacity
                            style={styles.serviceCardContainer}
                            activeOpacity={0.8}
                            onPress={() => navigation.navigate('CreateOrder', { serviceType: 'delivery' })}
                        >
                            <LinearGradient
                                colors={['#FFFFFF', '#F8FAFC']}
                                style={styles.serviceCard}
                            >
                                <View style={[styles.iconContainer, { backgroundColor: 'rgba(5, 95, 238, 0.1)' }]}>
                                    <Text style={styles.serviceIcon}>📦</Text>
                                </View>
                                <Text style={styles.serviceTitle}>Package Delivery</Text>
                                <Text style={styles.serviceDesc}>Send an item from A to B</Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.serviceCardContainer}
                            activeOpacity={0.8}
                            onPress={() => navigation.navigate('CreateOrder', { serviceType: 'errand' })}
                        >
                            <LinearGradient
                                colors={['#FFFFFF', '#F8FAFC']}
                                style={styles.serviceCard}
                            >
                                <View style={[styles.iconContainer, { backgroundColor: 'rgba(66, 133, 244, 0.1)' }]}>
                                    <Text style={styles.serviceIcon}>🛒</Text>
                                </View>
                                <Text style={styles.serviceTitle}>Errands & Shopping</Text>
                                <Text style={styles.serviceDesc}>We buy and deliver to you</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>

                    {/* Recent Activity */}
                    <View style={styles.activityHeader}>
                        <Text style={styles.sectionTitle}>Recent Activity</Text>
                        <TouchableOpacity onPress={() => navigation.navigate('OrderHistory')}>
                            <Text style={styles.seeAllText}>See All</Text>
                        </TouchableOpacity>
                    </View>

                    <BlurView intensity={20} tint="light" style={styles.emptyStateContainer}>
                        <View style={styles.emptyStateItem}>
                            <View style={styles.emptyIconCircle}>
                                <Text style={{ fontSize: 24 }}>📝</Text>
                            </View>
                            <Text style={styles.emptyStateText}>No recent orders</Text>
                            <Text style={styles.emptyStateSubText}>Your past deliveries will appear here</Text>

                            <TouchableOpacity
                                style={styles.emptyStateButton}
                                activeOpacity={0.8}
                                onPress={() => navigation.navigate('CreateOrder', { serviceType: 'delivery' })}
                            >
                                <LinearGradient
                                    colors={['#055FEE', '#5B99F2']}
                                    style={styles.emptyStateGradient}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                >
                                    <Text style={styles.emptyStateButtonText}>Place an Order</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </BlurView>

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
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 40,
    },
    headerContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    greeting: {
        fontSize: 14,
        fontWeight: '500',
        color: '#64748B',
    },
    name: {
        fontSize: 24,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: -0.5,
    },
    profileAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        overflow: 'hidden',
        shadowColor: '#055FEE',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    avatarGradient: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    activeTripBannerContainer: {
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 24,
        shadowColor: '#055FEE',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 6,
    },
    activeTripBannerGradient: {
        padding: 18,
    },
    activeTripHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    livePulseDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#22C55E',
        marginRight: 6,
    },
    activeTripBadge: {
        fontSize: 11,
        fontWeight: '800',
        color: '#93C5FD',
        letterSpacing: 0.5,
        flex: 1,
    },
    activeTripCost: {
        fontSize: 13,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    activeTripTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: 4,
    },
    activeTripSubtitle: {
        fontSize: 13,
        color: '#BFDBFE',
        marginBottom: 12,
    },
    activeTripCtaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        alignSelf: 'flex-start',
    },
    activeTripCtaText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#FFFFFF',
        marginRight: 6,
    },
    activeTripCtaArrow: {
        fontSize: 13,
        color: '#FFFFFF',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 16,
        letterSpacing: -0.3,
    },
    servicesGrid: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 28,
    },
    serviceCardContainer: {
        flex: 1,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
    },
    serviceCard: {
        padding: 20,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#FFFFFF',
    },
    iconContainer: {
        width: 52,
        height: 52,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    serviceIcon: {
        fontSize: 28,
    },
    serviceTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#334155',
        marginBottom: 8,
    },
    serviceDesc: {
        fontSize: 13,
        color: '#64748B',
        lineHeight: 18,
    },
    activityHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
    },
    seeAllText: {
        color: '#055FEE',
        fontWeight: '600',
        fontSize: 14,
    },
    emptyStateContainer: {
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
        backgroundColor: 'rgba(255,255,255,0.4)',
    },
    emptyStateItem: {
        padding: 32,
        alignItems: 'center',
    },
    emptyIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    emptyStateText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#334155',
        marginBottom: 8,
    },
    emptyStateSubText: {
        fontSize: 14,
        color: '#64748B',
        textAlign: 'center',
        marginBottom: 24,
    },
    emptyStateButton: {
        width: '100%',
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#055FEE',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    emptyStateGradient: {
        paddingVertical: 14,
        alignItems: 'center',
    },
    emptyStateButtonText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 16,
    },
});
