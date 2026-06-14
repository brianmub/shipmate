import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '../../utils/supabase';
import { useAuthStore } from '../../store/authStore';

export const OrderHistoryScreen = ({ navigation }: any) => {
    const { user } = useAuthStore();
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchOrders = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .eq('customer_id', user?.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setOrders(data || []);
        } catch (error) {
            console.error('Error fetching orders:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
    }, [user]);

    const renderOrderItem = ({ item }: { item: any }) => {
        const isDelivery = item.service_type === 'delivery';

        return (
            <BlurView intensity={40} tint="light" style={styles.orderCard}>
                <View style={styles.cardHeader}>
                    <View style={styles.serviceTypeRow}>
                        <View style={[styles.iconContainer, { backgroundColor: isDelivery ? 'rgba(5, 95, 238, 0.1)' : 'rgba(66, 133, 244, 0.1)' }]}>
                            <Text style={styles.serviceIcon}>{isDelivery ? '📦' : '🛒'}</Text>
                        </View>
                        <View>
                            <Text style={styles.serviceType}>
                                {isDelivery ? 'Package Delivery' : 'Errand & Shopping'}
                            </Text>
                            <Text style={styles.dateText}>
                                {new Date(item.created_at).toLocaleDateString()} at {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        </View>
                    </View>

                    <View style={[styles.statusBadge, (styles as any)[`status_${item.status}`]]}>
                        <Text style={[styles.statusText, (styles as any)[`statusText_${item.status}`]]}>
                            {item.status.toUpperCase()}
                        </Text>
                    </View>
                </View>

                <View style={styles.locationContainer}>
                    <View style={styles.locationRow}>
                        <View style={styles.timelineDot} />
                        <Text numberOfLines={1} style={styles.locationText}>
                            <Text style={styles.locationLabel}>{isDelivery ? 'Pickup: ' : 'Store: '}</Text>
                            {isDelivery ? item.pickup_address : item.errand_location}
                        </Text>
                    </View>
                    <View style={styles.timelineLine} />
                    <View style={styles.locationRow}>
                        <View style={[styles.timelineDot, styles.timelineDotEnd]} />
                        <Text numberOfLines={1} style={styles.locationText}>
                            <Text style={styles.locationLabel}>Dropoff: </Text>
                            {item.dropoff_address}
                        </Text>
                    </View>
                </View>

                <View style={styles.footerRow}>
                    <View>
                        <Text style={styles.priceLabel}>Estimated Cost</Text>
                        <Text style={styles.price}>${item.estimated_cost?.toFixed(2) || '0.00'}</Text>
                    </View>
                    {(item.status === 'pending' || item.status === 'accepted' || item.status === 'in_progress') ? (
                        <TouchableOpacity
                            style={[
                                styles.detailsButton,
                                { backgroundColor: item.status === 'pending' ? '#F59E0B' : (item.status === 'completed' || item.status === 'delivered') ? '#22C55E' : '#055FEE' }
                            ]}
                            onPress={() => navigation.navigate('CustomerTracking', { orderId: item.id })}
                        >
                            <Text style={[styles.detailsButtonText, { color: '#fff' }]}>
                                {item.status === 'pending' ? 'Find Courier' : 'Track Order'}
                            </Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity style={styles.detailsButton}>
                            <Text style={styles.detailsButtonText}>View Details</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </BlurView>
        );
    };

    return (
        <LinearGradient
            colors={['#F8FAFC', '#E2E8F0']}
            style={styles.container}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
        >
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
            <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
                <View style={styles.header}>
                    <View>
                        <Text style={styles.headerTitle}>My Orders</Text>
                        <Text style={styles.headerSubtitle}>View your request history</Text>
                    </View>
                    <TouchableOpacity onPress={fetchOrders} style={styles.refreshButton}>
                        <Text style={styles.refreshText}>↻</Text>
                    </TouchableOpacity>
                </View>

                {loading ? (
                    <View style={styles.centerContainer}>
                        <ActivityIndicator size="large" color="#055FEE" />
                    </View>
                ) : orders.length === 0 ? (
                    <View style={styles.centerContainer}>
                        <View style={styles.emptyIconCircle}>
                            <Text style={{ fontSize: 32 }}>📝</Text>
                        </View>
                        <Text style={styles.emptyTitle}>No Orders Yet</Text>
                        <Text style={styles.emptyText}>When you place a delivery or errand request, it will appear here.</Text>
                    </View>
                ) : (
                    <FlatList
                        data={orders}
                        keyExtractor={(item) => item.id}
                        renderItem={renderOrderItem}
                        contentContainerStyle={styles.listContainer}
                        showsVerticalScrollIndicator={false}
                        refreshing={loading}
                        onRefresh={fetchOrders}
                    />
                )}
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
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 24,
    },
    headerTitle: {
        fontSize: 32,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 16,
        color: '#64748B',
        marginTop: 4,
    },
    refreshButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    refreshText: {
        fontSize: 24,
        color: '#055FEE',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
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
    emptyTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1E293B',
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 15,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 24,
        paddingHorizontal: 20,
    },
    listContainer: {
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    orderCard: {
        borderRadius: 24,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.6)',
        backgroundColor: 'rgba(255,255,255,0.4)',
        overflow: 'hidden',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    serviceTypeRow: {
        flexDirection: 'row',
        alignItems: 'center',
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
    serviceType: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1E293B',
        marginBottom: 2,
    },
    dateText: {
        fontSize: 13,
        color: '#64748B',
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    status_pending: { backgroundColor: 'rgba(245, 158, 11, 0.15)' },
    status_accepted: { backgroundColor: 'rgba(59, 130, 246, 0.15)' },
    status_completed: { backgroundColor: 'rgba(34, 197, 94, 0.15)' },
    status_cancelled: { backgroundColor: 'rgba(239, 68, 68, 0.15)' },

    statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
    statusText_pending: { color: '#D97706' },
    statusText_accepted: { color: '#2563EB' },
    statusText_completed: { color: '#22C55E' },
    statusText_cancelled: { color: '#DC2626' },

    locationContainer: {
        backgroundColor: 'rgba(255,255,255,0.6)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
    },
    locationRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    timelineDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#3B82F6',
        marginRight: 12,
    },
    timelineDotEnd: {
        backgroundColor: '#10B981',
    },
    timelineLine: {
        width: 2,
        height: 16,
        backgroundColor: '#CBD5E1',
        marginLeft: 4,
        marginVertical: 4,
    },
    locationText: {
        flex: 1,
        fontSize: 14,
        color: '#334155',
        fontWeight: '500',
    },
    locationLabel: {
        color: '#64748B',
        fontWeight: '400',
    },
    footerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.05)',
        paddingTop: 16,
    },
    priceLabel: {
        fontSize: 12,
        color: '#64748B',
        marginBottom: 2,
    },
    price: {
        fontSize: 20,
        fontWeight: '800',
        color: '#055FEE',
    },
    detailsButton: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    detailsButtonText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#475569',
    },
});
