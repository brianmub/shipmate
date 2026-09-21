import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    TouchableOpacity,
    StatusBar,
    Modal,
    ScrollView,
    Image,
    Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '../../utils/supabase';
import { useAuthStore } from '../../store/authStore';

const ACTIVE_TRIP_STATUSES = [
    'pending',
    'driver_assigned',
    'en_route_to_pickup',
    'arrived_at_pickup',
    'picked_up',
    'en_route_to_delivery',
    'arrived_at_delivery',
    'in_delivery',
    'en_route',
    'arrived',
    'accepted',
    'in_progress'
];

export const OrderHistoryScreen = ({ navigation }: any) => {
    const { user } = useAuthStore();
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

    const fetchOrders = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('orders')
                .select(`
                    *,
                    driver:driver_id(full_name, phone)
                `)
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

    const getStatusBadgeStyle = (status: string) => {
        if (ACTIVE_TRIP_STATUSES.includes(status)) {
            if (status === 'pending') return styles.status_pending;
            return styles.status_accepted;
        }
        if (status === 'completed' || status === 'delivered') return styles.status_completed;
        if (status === 'cancelled') return styles.status_cancelled;
        return styles.status_pending;
    };

    const getStatusTextStyle = (status: string) => {
        if (ACTIVE_TRIP_STATUSES.includes(status)) {
            if (status === 'pending') return styles.statusText_pending;
            return styles.statusText_accepted;
        }
        if (status === 'completed' || status === 'delivered') return styles.statusText_completed;
        if (status === 'cancelled') return styles.statusText_cancelled;
        return styles.statusText_pending;
    };

    const formatStatusLabel = (status: string) => {
        return status ? status.replace(/_/g, ' ').toUpperCase() : 'UNKNOWN';
    };

    const renderOrderItem = ({ item }: { item: any }) => {
        const isDelivery = item.service_type === 'delivery';
        const isActive = ACTIVE_TRIP_STATUSES.includes(item.status);

        return (
            <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => {
                    if (isActive) {
                        navigation.navigate('CustomerTracking', { orderId: item.id });
                    } else {
                        setSelectedOrder(item);
                    }
                }}
            >
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

                        <View style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>
                            <Text style={[styles.statusText, getStatusTextStyle(item.status)]}>
                                {formatStatusLabel(item.status)}
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
                            <Text style={styles.price}>${parseFloat(item.estimated_cost || 0).toFixed(2)}</Text>
                        </View>
                        {isActive ? (
                            <TouchableOpacity
                                style={[
                                    styles.detailsButton,
                                    { backgroundColor: item.status === 'pending' ? '#F59E0B' : '#055FEE' }
                                ]}
                                onPress={() => navigation.navigate('CustomerTracking', { orderId: item.id })}
                            >
                                <Text style={[styles.detailsButtonText, { color: '#fff' }]}>
                                    {item.status === 'pending' ? 'Find Mate' : 'Track Live Order'}
                                </Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={styles.detailsButton}
                                onPress={() => setSelectedOrder(item)}
                            >
                                <Text style={styles.detailsButtonText}>View Details</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </BlurView>
            </TouchableOpacity>
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

            {/* Interactive Order Details Modal */}
            <Modal
                visible={selectedOrder !== null}
                transparent
                animationType="slide"
                onRequestClose={() => setSelectedOrder(null)}
            >
                <View style={styles.modalOverlay}>
                    <TouchableOpacity
                        style={styles.modalBackdrop}
                        activeOpacity={1}
                        onPress={() => setSelectedOrder(null)}
                    />
                    <View style={styles.detailsSheet}>
                        <View style={styles.dragHandleWrap}>
                            <View style={styles.dragHandle} />
                        </View>

                        {selectedOrder && (
                            <ScrollView
                                contentContainerStyle={styles.detailsContent}
                                showsVerticalScrollIndicator={false}
                            >
                                {/* Header */}
                                <View style={styles.detailsHeader}>
                                    <View>
                                        <Text style={styles.detailsTitle}>
                                            {selectedOrder.service_type === 'delivery' ? 'Package Delivery' : 'Errand & Shopping'}
                                        </Text>
                                        <Text style={styles.detailsSubtitle}>
                                            Order ID: #{selectedOrder.id.slice(0, 8)}
                                        </Text>
                                    </View>
                                    <View style={[styles.statusBadge, getStatusBadgeStyle(selectedOrder.status)]}>
                                        <Text style={[styles.statusText, getStatusTextStyle(selectedOrder.status)]}>
                                            {formatStatusLabel(selectedOrder.status)}
                                        </Text>
                                    </View>
                                </View>

                                {/* Addresses Section */}
                                <View style={styles.sectionCard}>
                                    <Text style={styles.sectionTitle}>Route Details</Text>
                                    <View style={styles.locationContainer}>
                                        <View style={styles.locationRow}>
                                            <View style={styles.timelineDot} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.locationLabel}>
                                                    {selectedOrder.service_type === 'delivery' ? 'Pickup Location' : 'Store Location'}
                                                </Text>
                                                <Text style={styles.locationTextBold}>
                                                    {selectedOrder.service_type === 'delivery' ? selectedOrder.pickup_address : selectedOrder.errand_location}
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={styles.timelineLine} />
                                        <View style={styles.locationRow}>
                                            <View style={[styles.timelineDot, styles.timelineDotEnd]} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.locationLabel}>Delivery Destination</Text>
                                                <Text style={styles.locationTextBold}>
                                                    {selectedOrder.dropoff_address}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                </View>

                                {/* Package / Errand Details */}
                                <View style={styles.sectionCard}>
                                    <Text style={styles.sectionTitle}>Item & Recipient</Text>
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Description:</Text>
                                        <Text style={styles.detailValue}>
                                            {selectedOrder.package_description || selectedOrder.errand_items || 'Standard package'}
                                        </Text>
                                    </View>
                                    {selectedOrder.recipient_name && (
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>Recipient Name:</Text>
                                            <Text style={styles.detailValue}>{selectedOrder.recipient_name}</Text>
                                        </View>
                                    )}
                                    {selectedOrder.recipient_phone && (
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>Recipient Phone:</Text>
                                            <Text style={styles.detailValue}>{selectedOrder.recipient_phone}</Text>
                                        </View>
                                    )}
                                </View>

                                {/* Handover PIN if recorded */}
                                {Boolean(selectedOrder.handover_pin) && (
                                    <View style={styles.pinCard}>
                                        <View style={styles.pinHeader}>
                                            <Text style={styles.pinTitle}>Handover PIN (OTP)</Text>
                                            <Text style={styles.pinSubtitle}>
                                                {selectedOrder.pin_verified_at ? 'Verified on Handover ✅' : 'Unique 4-digit code'}
                                            </Text>
                                        </View>
                                        <View style={styles.pinDisplayRow}>
                                            {selectedOrder.handover_pin.split('').map((digit: string, idx: number) => (
                                                <View key={idx} style={styles.pinDigitBox}>
                                                    <Text style={styles.pinDigitText}>{digit}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                )}

                                {/* Courier Details */}
                                {selectedOrder.driver && (
                                    <View style={styles.sectionCard}>
                                        <Text style={styles.sectionTitle}>Assigned Mate</Text>
                                        <View style={styles.mateRow}>
                                            <View style={styles.mateAvatar}>
                                                <Text style={styles.mateAvatarText}>
                                                    {selectedOrder.driver.full_name?.charAt(0) || 'M'}
                                                </Text>
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.mateName}>{selectedOrder.driver.full_name || 'Your Mate'}</Text>
                                                {selectedOrder.driver.phone && (
                                                    <Text style={styles.matePhone}>{selectedOrder.driver.phone}</Text>
                                                )}
                                            </View>
                                        </View>
                                    </View>
                                )}

                                {/* Payment Breakdown */}
                                <View style={styles.sectionCard}>
                                    <Text style={styles.sectionTitle}>Payment & Fare</Text>
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Estimated Cost:</Text>
                                        <Text style={styles.detailPrice}>
                                            ${parseFloat(selectedOrder.estimated_cost || 0).toFixed(2)} USD
                                        </Text>
                                    </View>
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Payment Method:</Text>
                                        <Text style={styles.detailValue}>
                                            {selectedOrder.payment_method === 'cash_on_delivery'
                                                ? '💵 Cash on Delivery'
                                                : `💳 ${selectedOrder.payment_method?.toUpperCase() || 'DIGITAL'}`}
                                        </Text>
                                    </View>
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Date Created:</Text>
                                        <Text style={styles.detailValue}>
                                            {new Date(selectedOrder.created_at).toLocaleString()}
                                        </Text>
                                    </View>
                                </View>

                                {/* Delivery Proof Photo if available */}
                                {selectedOrder.delivery_photo_url && (
                                    <View style={styles.sectionCard}>
                                        <Text style={styles.sectionTitle}>Proof of Delivery</Text>
                                        <Image
                                            source={{ uri: selectedOrder.delivery_photo_url }}
                                            style={styles.deliveryProofImg}
                                            resizeMode="cover"
                                        />
                                    </View>
                                )}

                                {/* Dismiss Button */}
                                <TouchableOpacity
                                    style={styles.closeDetailsBtn}
                                    activeOpacity={0.8}
                                    onPress={() => setSelectedOrder(null)}
                                >
                                    <LinearGradient
                                        colors={['#055FEE', '#5B99F2']}
                                        style={styles.closeDetailsGradient}
                                    >
                                        <Text style={styles.closeDetailsText}>Close Details</Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>
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
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 20,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 14,
        color: '#64748B',
        marginTop: 2,
    },
    refreshButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    refreshText: {
        fontSize: 18,
        color: '#055FEE',
        fontWeight: 'bold',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
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
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#334155',
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 14,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 20,
    },
    listContainer: {
        paddingHorizontal: 20,
        paddingBottom: 40,
        gap: 16,
    },
    orderCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.8)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    serviceTypeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 10,
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
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
    },
    status_pending: { backgroundColor: 'rgba(245, 158, 11, 0.15)' },
    status_accepted: { backgroundColor: 'rgba(5, 95, 238, 0.15)' },
    status_completed: { backgroundColor: 'rgba(34, 197, 94, 0.15)' },
    status_cancelled: { backgroundColor: 'rgba(239, 68, 68, 0.15)' },

    statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
    statusText_pending: { color: '#D97706' },
    statusText_accepted: { color: '#055FEE' },
    statusText_completed: { color: '#22C55E' },
    statusText_cancelled: { color: '#DC2626' },

    locationContainer: {
        backgroundColor: 'rgba(255,255,255,0.6)',
        borderRadius: 16,
        padding: 14,
        marginBottom: 16,
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
        height: 14,
        backgroundColor: '#CBD5E1',
        marginLeft: 4,
        marginVertical: 4,
    },
    locationText: {
        flex: 1,
        fontSize: 13,
        color: '#334155',
        fontWeight: '500',
    },
    locationTextBold: {
        fontSize: 14,
        fontWeight: '600',
        color: '#0F172A',
        marginTop: 2,
    },
    locationLabel: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '500',
    },
    footerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.05)',
        paddingTop: 14,
    },
    priceLabel: {
        fontSize: 12,
        color: '#64748B',
        marginBottom: 2,
    },
    price: {
        fontSize: 19,
        fontWeight: '800',
        color: '#055FEE',
    },
    detailsButton: {
        paddingVertical: 9,
        paddingHorizontal: 16,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    detailsButtonText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#475569',
    },

    // Details Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
        justifyContent: 'flex-end',
    },
    modalBackdrop: {
        flex: 1,
    },
    detailsSheet: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        maxHeight: '85%',
        paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    },
    dragHandleWrap: {
        alignItems: 'center',
        paddingVertical: 10,
    },
    dragHandle: {
        width: 44,
        height: 5,
        borderRadius: 3,
        backgroundColor: '#CBD5E1',
    },
    detailsContent: {
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    detailsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 18,
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    detailsTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#0F172A',
    },
    detailsSubtitle: {
        fontSize: 13,
        color: '#64748B',
        marginTop: 2,
    },
    sectionCard: {
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        padding: 16,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#334155',
        marginBottom: 12,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 4,
    },
    detailLabel: {
        fontSize: 13,
        color: '#64748B',
    },
    detailValue: {
        fontSize: 13,
        fontWeight: '600',
        color: '#0F172A',
        maxWidth: '65%',
        textAlign: 'right',
    },
    detailPrice: {
        fontSize: 16,
        fontWeight: '800',
        color: '#055FEE',
    },
    pinCard: {
        backgroundColor: '#EFF6FF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    pinHeader: {
        marginBottom: 10,
    },
    pinTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1E40AF',
    },
    pinSubtitle: {
        fontSize: 12,
        color: '#3B82F6',
        marginTop: 2,
    },
    pinDisplayRow: {
        flexDirection: 'row',
        gap: 8,
    },
    pinDigitBox: {
        width: 42,
        height: 48,
        borderRadius: 10,
        backgroundColor: '#FFFFFF',
        borderWidth: 1.5,
        borderColor: '#055FEE',
        alignItems: 'center',
        justifyContent: 'center',
    },
    pinDigitText: {
        fontSize: 20,
        fontWeight: '800',
        color: '#055FEE',
    },
    mateRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    mateAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#055FEE',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    mateAvatarText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    mateName: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0F172A',
    },
    matePhone: {
        fontSize: 13,
        color: '#64748B',
        marginTop: 2,
    },
    deliveryProofImg: {
        width: '100%',
        height: 180,
        borderRadius: 12,
    },
    closeDetailsBtn: {
        marginTop: 10,
        borderRadius: 16,
        overflow: 'hidden',
    },
    closeDetailsGradient: {
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeDetailsText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#FFFFFF',
    },
});
