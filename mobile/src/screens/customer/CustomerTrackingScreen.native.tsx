import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, StatusBar, Platform, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../utils/supabase';
import { OfferSelectionPanel } from '../../components/OfferSelectionPanel';
import { orderService } from '../../services/orderService';

export const CustomerTrackingScreen = ({ route, navigation }: any) => {
    const { orderId } = route.params;
    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [viewingCouriers, setViewingCouriers] = useState<any[]>([]);
    const [offers, setOffers] = useState<any[]>([]);
    const [offersLoading, setOffersLoading] = useState(false);
    const mapRef = useRef<MapView>(null);

    const fetchOrder = async () => {
        try {
            const { data, error } = await supabase
                .from('orders')
                .select(`
                    *,
                    driver:driver_id(full_name, phone)
                `)
                .eq('id', orderId)
                .single();

            if (error) throw error;
            setOrder(data);
        } catch (error: any) {
            console.error('Error fetching tracking order:', error.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchOffers = async () => {
        setOffersLoading(true);
        try {
            const data = await orderService.getOrderOffers(orderId);
            setOffers(data || []);
        } catch (error: any) {
            console.error('Error fetching offers:', error.message);
        } finally {
            setOffersLoading(false);
        }
    };

    const handleAcceptOffer = async (offer: any) => {
        try {
            setLoading(true);
            await orderService.acceptOffer(orderId, offer.id, offer.driver_id);
            Alert.alert("Success", "Courier hired successfully! They are on their way.");
            fetchOrder();
        } catch (error: any) {
            Alert.alert("Error", error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrder();
        fetchOffers();

        const channel = supabase
            .channel(`public:tracking_${orderId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, (payload) => {
                setOrder((prev: any) => ({ ...prev, ...payload.new }));
            })
            .subscribe();

        const offersChannel = supabase
            .channel(`public:offers_${orderId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_offers', filter: `order_id=eq.${orderId}` }, (payload) => {
                fetchOffers();
            })
            .subscribe();

        const presenceChannel = supabase.channel(`order_viewers:${orderId}`);
        presenceChannel
            .on('presence', { event: 'sync' }, () => {
                const state = presenceChannel.presenceState();
                const couriers: any[] = [];
                Object.keys(state).forEach((key) => {
                    state[key].forEach((presence: any) => {
                        if (presence.user) {
                            couriers.push(presence.user);
                        }
                    });
                });
                // Deduplicate by ID
                const uniqueCouriers = couriers.filter(
                    (c, index, self) => self.findIndex((t) => t.id === c.id) === index
                );
                setViewingCouriers(uniqueCouriers);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(offersChannel);
            supabase.removeChannel(presenceChannel);
        };
    }, [orderId]);

    // Animate map when driver location changes
    useEffect(() => {
        if (order?.driver_latitude && order?.driver_longitude && mapRef.current) {
            mapRef.current.animateToRegion({
                latitude: order.driver_latitude,
                longitude: order.driver_longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
            }, 1000);
        }
    }, [order?.driver_latitude, order?.driver_longitude]);


    if (loading || !order) {
        return (
            <LinearGradient colors={['#F8FAFC', '#E2E8F0']} style={styles.safeArea}>
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#055FEE" />
                </View>
            </LinearGradient>
        );
    }

    const { pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude, driver_latitude, driver_longitude } = order;

    const initLat = parseFloat(pickup_latitude || dropoff_latitude || "37.78825");
    const initLng = parseFloat(pickup_longitude || dropoff_longitude || "-122.4324");

    const initialRegion = {
        latitude: isNaN(initLat) ? 37.78825 : initLat,
        longitude: isNaN(initLng) ? -122.4324 : initLng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
    };

    const isDelivery = order.service_type === 'delivery';
    const driverName = order.driver?.full_name || 'Assigning...';

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

            <View style={styles.mapContainer}>
                <MapView
                    ref={mapRef}
                    style={styles.map}
                    initialRegion={initialRegion}
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
                    {/* Render visual line between pickup and dropoff */}
                    {pickup_latitude && pickup_longitude && dropoff_latitude && dropoff_longitude && (
                        <Polyline
                            coordinates={[
                                { latitude: parseFloat(pickup_latitude), longitude: parseFloat(pickup_longitude) },
                                { latitude: parseFloat(dropoff_latitude), longitude: parseFloat(dropoff_longitude) }
                            ]}
                            strokeColor="#94A3B8"
                            strokeWidth={3}
                            lineDashPattern={[5, 10]}
                        />
                    )}

                    {/* Render Real-Time Driver Location */}
                    {driver_latitude && driver_longitude && (
                        <Marker
                            coordinate={{ latitude: driver_latitude, longitude: driver_longitude }}
                            title="Driver"
                        >
                            <View style={styles.driverMarkerOuter}>
                                <View style={styles.driverMarkerInner}>
                                    <Text style={{ fontSize: 20 }}>🚗</Text>
                                </View>
                            </View>
                        </Marker>
                    )}

                    {/* Render Driver Bid/Offer Locations on the map */}
                    {order.status === 'pending' && offers.map((offer) => (
                        offer.driver_latitude && offer.driver_longitude && (
                            <Marker
                                key={offer.id}
                                coordinate={{ latitude: offer.driver_latitude, longitude: offer.driver_longitude }}
                                title={offer.driver?.full_name}
                                description={`Offer: $${offer.offer_amount.toFixed(2)}`}
                            >
                                <View style={styles.driverMarkerOuter}>
                                    <View style={[styles.driverMarkerInner, { backgroundColor: '#F59E0B' }]}>
                                        <Text style={{ fontSize: 16 }}>🚗</Text>
                                    </View>
                                </View>
                            </Marker>
                        )
                    ))}
                </MapView>
            </View>

            <View style={styles.headerOverlay}>
                <BlurView intensity={40} tint="light" style={styles.headerBlur}>
                    <SafeAreaView edges={['top']}>
                        <View style={styles.headerContent}>
                            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                                <Text style={styles.backTxt}>← Back</Text>
                            </TouchableOpacity>
                            <Text style={styles.headerText}>Live Tracking</Text>
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
                            <View style={[styles.iconContainer, { backgroundColor: isDelivery ? 'rgba(5, 95, 238, 0.1)' : 'rgba(66, 133, 244, 0.1)' }]}>
                                <Text style={styles.serviceIcon}>{isDelivery ? '📦' : '🛒'}</Text>
                            </View>
                            <View>
                                <Text style={styles.jobType}>{isDelivery ? 'Package Delivery' : 'Errand'}</Text>
                                <Text style={[styles.statusText, { color: (order.status === 'completed' || order.status === 'delivered') ? '#22C55E' : '#055FEE' }]}>
                                    {order.status === 'in_progress' ? 'Driver is on the way' :
                                        order.status === 'accepted' ? 'Driver is heading to pickup' :
                                            order.status === 'completed' ? 'Delivered' : 'Pending'}
                                </Text>
                            </View>
                        </View>

                        {order.status === 'pending' ? (
                            <View>
                                <View style={styles.viewersCard}>
                                    <View style={styles.viewersHeader}>
                                        <ActivityIndicator size="small" color="#F59E0B" style={{ marginRight: 8 }} />
                                        <Text style={styles.viewersTitle}>Searching for Couriers...</Text>
                                    </View>
                                    <Text style={styles.viewersSubtitle}>
                                        We are finding nearby drivers for your {isDelivery ? 'delivery' : 'errand'}.
                                    </Text>
                                    <View style={styles.viewersSeparator} />
                                    {viewingCouriers.length > 0 ? (
                                        <View>
                                            <Text style={styles.viewingCountText}>
                                                👀 {viewingCouriers.length} courier{viewingCouriers.length > 1 ? 's' : ''} currently viewing your offer:
                                            </Text>
                                            {viewingCouriers.map((courier) => (
                                                <View key={courier.id} style={styles.courierRow}>
                                                    <View style={styles.courierAvatarSmall}>
                                                        <Text style={styles.courierAvatarSmallText}>
                                                            {courier.full_name?.charAt(0).toUpperCase() || 'C'}
                                                        </Text>
                                                    </View>
                                                    <Text style={styles.courierNameText}>
                                                        {courier.full_name} is reviewing details
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                    ) : (
                                        <Text style={styles.waitingText}>
                                            🔍 Waiting for couriers to inspect details...
                                        </Text>
                                    )}
                                </View>

                                <OfferSelectionPanel 
                                    offers={offers}
                                    onAccept={handleAcceptOffer}
                                    onSelect={(offer) => {
                                        if (offer.driver_latitude && offer.driver_longitude && mapRef.current) {
                                            mapRef.current.animateToRegion({
                                                latitude: offer.driver_latitude,
                                                longitude: offer.driver_longitude,
                                                latitudeDelta: 0.02,
                                                longitudeDelta: 0.02,
                                            }, 1000);
                                        }
                                    }}
                                    loading={offersLoading}
                                />
                            </View>
                        ) : (
                            <View style={styles.driverInfoCard}>
                                <View style={styles.driverAvatar}>
                                    <Text style={styles.driverAvatarText}>{driverName.charAt(0).toUpperCase()}</Text>
                                </View>
                                <View style={styles.driverDetails}>
                                    <Text style={styles.driverNameLabel}>Your Courier</Text>
                                    <Text style={styles.driverName}>{driverName}</Text>
                                </View>
                                <View style={styles.communicationButtons}>
                                    <TouchableOpacity 
                                        style={styles.contactBtn}
                                        onPress={() => {
                                            if (order.driver?.phone) {
                                                Linking.openURL(`tel:${order.driver.phone}`);
                                            } else {
                                                Alert.alert('Unavailable', 'Courier phone number is not available.');
                                            }
                                        }}
                                    >
                                        <Text style={styles.contactIcon}>📞</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={[styles.contactBtn, styles.chatBtn]}
                                        onPress={() => navigation.navigate('Chat', { 
                                            orderId: order.id, 
                                            recipientName: driverName, 
                                            recipientPhone: order.driver?.phone 
                                        })}
                                    >
                                        <Text style={styles.contactIcon}>💬</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </SafeAreaView>
                </BlurView>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    safeArea: { flex: 1 },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    mapContainer: { ...StyleSheet.absoluteFillObject },
    map: { width: '100%', height: '100%' },
    headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
    headerBlur: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.4)' },
    headerContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 20 : 10, paddingBottom: 16 },
    backBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 12 },
    backTxt: { fontSize: 14, fontWeight: 'bold', color: '#334155' },
    headerText: { fontSize: 18, fontWeight: '800', color: '#0F172A' },

    driverMarkerOuter: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(176, 106, 40, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    driverMarkerInner: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },

    bottomOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0 },
    jobDetailsPanel: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20, borderTopLeftRadius: 32, borderTopRightRadius: 32, borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,0.8)', overflow: 'hidden' },
    dragHandle: { width: 48, height: 5, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 3, alignSelf: 'center', marginBottom: 24 },
    titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    iconContainer: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    serviceIcon: { fontSize: 20 },
    jobType: { fontSize: 20, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
    statusText: { fontSize: 14, fontWeight: '600' },

    driverInfoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.7)',
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.5)',
        marginBottom: Platform.OS === 'ios' ? 0 : 20,
    },
    driverAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#0F172A',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    driverAvatarText: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: 'bold',
    },
    driverDetails: {
        flex: 1,
    },
    driverNameLabel: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '500',
    },
    driverName: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1E293B',
    },
    contactBtn: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: '#055FEE', // Solid primary blue for calling
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#055FEE',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 4,
    },
    communicationButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    chatBtn: {
        backgroundColor: '#22C55E', // Solid green for chat
        shadowColor: '#22C55E',
    },
    contactIcon: {
        fontSize: 22,
    },

    viewersCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)',
        marginBottom: Platform.OS === 'ios' ? 0 : 20,
        shadowColor: '#F59E0B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    viewersHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    viewersTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#D97706',
    },
    viewersSubtitle: {
        fontSize: 13,
        color: '#64748B',
        marginBottom: 12,
        lineHeight: 18,
    },
    viewersSeparator: {
        height: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
        marginBottom: 12,
    },
    viewingCountText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#475569',
        marginBottom: 8,
    },
    courierRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        padding: 10,
        borderRadius: 12,
        marginBottom: 6,
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.02)',
    },
    courierAvatarSmall: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#F59E0B',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    courierAvatarSmallText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: 'bold',
    },
    courierNameText: {
        fontSize: 13,
        color: '#1E293B',
        fontWeight: '500',
    },
    waitingText: {
        fontSize: 13,
        color: '#94A3B8',
        fontStyle: 'italic',
        textAlign: 'center',
        paddingVertical: 8,
    },
});
