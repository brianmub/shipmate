import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, Platform, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuthStore } from '../../store/authStore';
import { useOrderStore } from '../../store/orderStore';
import { supabase } from '../../utils/supabase';
import { orderService } from '../../services/orderService';
import { Order } from '../../types';

export const CustomerHomeScreen = ({ navigation }: any) => {
    const { user } = useAuthStore();
    const { resetOrder, setServiceType } = useOrderStore();
    const [recentOrders, setRecentOrders] = React.useState<Order[]>([]);
    const [loading, setLoading] = React.useState(true);

    const firstName = user?.user_metadata?.full_name?.split(' ')[0] || 'Guest';

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .eq('customer_id', user.id)
                .order('created_at', { ascending: false })
                .limit(5);

            if (error) throw error;
            setRecentOrders(data || []);
        } catch (error) {
            console.error('Error fetching orders:', error);
        } finally {
            setLoading(false);
        }
    };

    const startNewOrder = (type: 'delivery' | 'errand') => {
        resetOrder();
        setServiceType(type);
        navigation.navigate('CreateOrder');
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending': return '#F59E0B';
            case 'delivered': return '#10B981';
            case 'cancelled': return '#EF4444';
            default: return '#3B82F6';
        }
    };

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

                    {/* Services Section */}
                    <Text style={styles.sectionTitle}>What do you need today?</Text>

                    <View style={styles.servicesGrid}>
                        <TouchableOpacity
                            style={styles.serviceCardContainer}
                            activeOpacity={0.8}
                            onPress={() => startNewOrder('delivery')}
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
                            onPress={() => startNewOrder('errand')}
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
                        <TouchableOpacity onPress={() => navigation.navigate('Orders')}>
                            <Text style={styles.seeAllText}>See All</Text>
                        </TouchableOpacity>
                    </View>

                    {loading ? (
                        <ActivityIndicator color="#055FEE" size="large" style={{ marginTop: 20 }} />
                    ) : recentOrders.length > 0 ? (
                        <View style={styles.ordersList}>
                            {recentOrders.map((order) => (
                                <TouchableOpacity 
                                    key={order.id} 
                                    style={styles.orderCard}
                                    onPress={() => navigation.navigate('CustomerTracking', { orderId: order.id })}
                                >
                                    <View style={styles.orderCardHeader}>
                                        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) + '20' }]}>
                                            <View style={[styles.statusDot, { backgroundColor: getStatusColor(order.status) }]} />
                                            <Text style={[styles.statusText, { color: getStatusColor(order.status) }]}>
                                                {order.status.replace(/_/g, ' ').toUpperCase()}
                                            </Text>
                                        </View>
                                        <Text style={styles.orderDate}>
                                            {new Date(order.created_at).toLocaleDateString()}
                                        </Text>
                                    </View>
                                    
                                    <View style={styles.addressRow}>
                                        <Text style={styles.addressIcon}>📍</Text>
                                        <Text style={styles.addressText} numberOfLines={1}>
                                            {order.pickup_address || order.errand_location}
                                        </Text>
                                    </View>
                                    
                                    <View style={styles.addressRow}>
                                        <Text style={styles.addressIcon}>🏁</Text>
                                        <Text style={styles.addressText} numberOfLines={1}>
                                            {order.dropoff_address}
                                        </Text>
                                    </View>

                                    <View style={styles.orderCardFooter}>
                                        <Text style={styles.serviceLabel}>{order.service_type === 'delivery' ? '📦 Delivery' : '🛒 Errand'}</Text>
                                        <Text style={styles.orderAmount}>${order.estimated_cost?.toFixed(2)}</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    ) : (
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
                                    onPress={() => startNewOrder('delivery')}
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
                    )}

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
        shadowColor: '#055FEE',
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
    ordersList: {
        gap: 16,
    },
    orderCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 16,
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    orderCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 6,
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    orderDate: {
        fontSize: 12,
        color: '#94A3B8',
        fontWeight: '500',
    },
    addressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    addressIcon: {
        fontSize: 14,
    },
    addressText: {
        fontSize: 14,
        color: '#334155',
        fontWeight: '500',
        flex: 1,
    },
    orderCardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
    },
    serviceLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748B',
    },
    orderAmount: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0F172A',
    },
});
