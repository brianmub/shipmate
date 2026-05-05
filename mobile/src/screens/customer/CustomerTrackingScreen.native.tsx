import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, StatusBar, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../utils/supabase';
import { orderService } from '../../services/orderService';
import { OfferSelectionPanel } from '../../components/OfferSelectionPanel';

export const CustomerTrackingScreen = ({ route, navigation }: any) => {
    const { orderId } = route.params;
    const [order, setOrder] = useState<any>(null);
    const [offers, setOffers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [offersLoading, setOffersLoading] = useState(false);
    const [previewDriver, setPreviewDriver] = useState<any>(null);
    const mapRef = useRef<MapView>(null);

    const fetchOrder = async () => {
        try {
            const { data, error } = await supabase
                .from('orders')
                .select(`
                    *,
                    driver:driver_id(full_name)
                `)
                .eq('id', orderId)
                .single();

            if (error) throw error;
            setOrder(data);
            
            // If order is pending, fetch offers
            if (data.status === 'pending') {
                fetchOffers();
            }
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
        } catch (error) {
            console.error('Error fetching offers:', error);
        } finally {
            setOffersLoading(false);
        }
    };

    const handleAcceptOffer = async (offer: any) => {
        setLoading(true);
        try {
            await orderService.acceptOffer(orderId, offer.id, offer.driver_id);
            Alert.alert('Courier Assigned', 'Your courier is on the way!');
            fetchOrder(); // Refresh to show driver details
        } catch (error: any) {
            Alert.alert('Error', error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrder();

        const channel = supabase
            .channel(`public:tracking_${orderId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, (payload) => {
                setOrder((prev: any) => ({ ...prev, ...payload.new }));
            })
            .subscribe();

        // Subscribe to new offers
        const offersChannel = supabase
            .channel(`public:offers_${orderId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_offers', filter: `order_id=eq.${orderId}` }, (payload) => {
                fetchOffers();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(offersChannel);
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
                    <ActivityIndicator size="large" color="#34A853" />
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

                    {/* Render Real-Time Driver Location (if assigned) */}
                    {driver_latitude && driver_longitude && (
                        <Marker
                            coordinate={{ latitude: driver_latitude, longitude: driver_longitude }}
                            title="Your Courier"
                        >
                            <View style={styles.driverMarkerOuter}>
                                <View style={styles.driverMarkerInner}>
                                    <Text style={{ fontSize: 20 }}>🚗</Text>
                                </View>
                            </View>
                        </Marker>
                    )}

                    {/* Render Preview Driver (if offer selected) */}
                    {previewDriver && order.status === 'pending' && (
                        <Marker
                            coordinate={{ 
                                latitude: previewDriver.driver_latitude, 
                                longitude: previewDriver.driver_longitude 
                            }}
                            title="Potential Courier"
                        >
                            <View style={[styles.driverMarkerOuter, { backgroundColor: 'rgba(59, 130, 246, 0.3)' }]}>
                                <View style={styles.driverMarkerInner}>
                                    <Text style={{ fontSize: 20 }}>🚛</Text>
                                </View>
                            </View>
                        </Marker>
                    )}

                    {/* Render visual line between preview driver and pickup */}
                    {previewDriver && order.status === 'pending' && pickup_latitude && pickup_longitude && (
                        <Polyline
                            coordinates={[
                                { latitude: previewDriver.driver_latitude, longitude: previewDriver.driver_longitude },
                                { latitude: parseFloat(pickup_latitude), longitude: parseFloat(pickup_longitude) }
                            ]}
                            strokeColor="#3B82F6"
                            strokeWidth={2}
                            lineDashPattern={[5, 5]}
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
                            <View style={[styles.iconContainer, { backgroundColor: isDelivery ? 'rgba(52, 168, 83, 0.1)' : 'rgba(66, 133, 244, 0.1)' }]}>
                                <Text style={styles.serviceIcon}>{isDelivery ? '📦' : '🛒'}</Text>
                            </View>
                            <View>
                                <Text style={styles.jobType}>{isDelivery ? 'Package Delivery' : 'Errand'}</Text>
                                <Text style={styles.statusText}>
                                    {order.status === 'pending' ? 'Searching for a courier...' :
                                     order.status === 'driver_assigned' ? 'Courier assigned & coming' :
                                     order.status === 'en_route_to_pickup' ? 'Heading to pickup' :
                                     order.status === 'arrived_at_pickup' ? 'Courier is at pickup' :
                                     order.status === 'picked_up' ? 'Package picked up' :
                                     order.status === 'en_route_to_delivery' ? 'Heading to you' :
                                     order.status === 'arrived_at_delivery' ? 'Courier is at destination' :
                                     order.status === 'delivered' ? 'Order Completed' : 
                                     order.status.replace(/_/g, ' ')}
                                </Text>
                            </View>
                        </View>

                        {order.status === 'pending' && (
                            <OfferSelectionPanel 
                                offers={offers} 
                                loading={offersLoading}
                                onAccept={handleAcceptOffer}
                                onSelect={(offer) => setPreviewDriver(offer)}
                            />
                        )}

                        {order.status !== 'pending' && (
                            <View style={styles.driverInfoCard}>
                                <View style={styles.driverAvatar}>
                                    <Text style={styles.driverAvatarText}>{driverName.charAt(0).toUpperCase()}</Text>
                                </View>
                                <View style={styles.driverDetails}>
                                    <Text style={styles.driverNameLabel}>Your Courier</Text>
                                    <Text style={styles.driverName}>{driverName}</Text>
                                </View>
                                <TouchableOpacity style={styles.contactBtn}>
                                    <Text style={styles.contactIcon}>📞</Text>
                                </TouchableOpacity>
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
        backgroundColor: 'rgba(52, 168, 83, 0.3)',
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
    statusText: { fontSize: 14, color: '#34A853', fontWeight: '600' },

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
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(52, 168, 83, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    contactIcon: {
        fontSize: 20,
    },
});
