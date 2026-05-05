import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuthStore } from '../../store/authStore';

export const CustomerHomeScreen = ({ navigation }: any) => {
    const { user } = useAuthStore();
    const firstName = user?.user_metadata?.full_name?.split(' ')[0] || 'Guest';

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
                                colors={['#34A853', '#2E9348']}
                                style={styles.avatarGradient}
                            >
                                <Text style={styles.avatarText}>{firstName.charAt(0)}</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>

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
                                <View style={[styles.iconContainer, { backgroundColor: 'rgba(52, 168, 83, 0.1)' }]}>
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
                                    colors={['#34A853', '#2E9348']}
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
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingTop: Platform.OS === 'android' ? 40 : 20,
        paddingBottom: 40,
    },
    headerContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 32,
    },
    greeting: {
        fontSize: 16,
        color: '#64748B',
        fontWeight: '500',
        marginBottom: 4,
    },
    name: {
        fontSize: 32,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: -0.5,
    },
    profileAvatar: {
        shadowColor: '#34A853',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    avatarGradient: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: 'bold',
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 16,
        color: '#1E293B',
        letterSpacing: -0.5,
    },
    servicesGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 32,
        gap: 16,
    },
    serviceCardContainer: {
        flex: 1,
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 5,
    },
    serviceCard: {
        borderRadius: 20,
        padding: 20,
        alignItems: 'flex-start',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.8)',
        height: 180,
    },
    iconContainer: {
        width: 56,
        height: 56,
        borderRadius: 28,
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
        color: '#34A853',
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
        shadowColor: '#34A853',
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
