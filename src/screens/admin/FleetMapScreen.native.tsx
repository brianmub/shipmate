import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { BlurView } from 'expo-blur';
import { supabase } from '../../utils/supabase';
import { orderService } from '../../services/orderService';

export const FleetMapScreen = () => {
    const [activeOrders, setActiveOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const mapRef = useRef<MapView>(null);

    const fetchActiveFleet = async () => {
        try {
            const { data, error } = await supabase
                .from('orders')
                .select(`
                    *,
                    driver:driver_id(full_name)
                `)
                .in('status', ['accepted', 'in_progress']);

            if (error) throw error;
            setActiveOrders(data || []);
        } catch (error) {
            console.error('Error fetching fleet:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchActiveFleet();

        // Subscribe to all order updates for real-time movement
        const channel = supabase
            .channel('fleet_tracking')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
                fetchActiveFleet();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator color="#055FEE" size="large" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />
            
            <MapView
                ref={mapRef}
                style={styles.map}
                initialRegion={{
                    latitude: -17.8248, // Default to Harare or some central point if no data
                    longitude: 31.0530,
                    latitudeDelta: 0.1,
                    longitudeDelta: 0.1,
                }}
            >
                {activeOrders.map((order) => (
                    <React.Fragment key={order.id}>
                        {/* Driver Marker */}
                        {order.driver_latitude && order.driver_longitude && (
                            <Marker
                                coordinate={{
                                    latitude: order.driver_latitude,
                                    longitude: order.driver_longitude
                                }}
                                title={`Driver: ${order.driver?.full_name || 'Unknown'}`}
                                description={`Order #${order.id.slice(0, 5)} - ${order.status}`}
                            >
                                <View style={styles.driverMarkerOuter}>
                                    <View style={styles.driverMarkerInner}>
                                        <Text style={{ fontSize: 16 }}>🚗</Text>
                                    </View>
                                </View>
                            </Marker>
                        )}

                        {/* Destination Marker */}
                        {order.dropoff_latitude && order.dropoff_longitude && (
                            <Marker
                                coordinate={{
                                    latitude: parseFloat(order.dropoff_latitude),
                                    longitude: parseFloat(order.dropoff_longitude)
                                }}
                                pinColor="#10B981"
                                title="Destination"
                            />
                        )}

                        {/* Connection Line */}
                        {order.driver_latitude && order.dropoff_latitude && (
                            <Polyline
                                coordinates={[
                                    { latitude: order.driver_latitude, longitude: order.driver_longitude },
                                    { latitude: parseFloat(order.dropoff_latitude), longitude: parseFloat(order.dropoff_longitude) }
                                ]}
                                strokeColor="#055FEE"
                                strokeWidth={2}
                                lineDashPattern={[5, 5]}
                            />
                        )}
                    </React.Fragment>
                ))}
            </MapView>

            <View style={styles.headerOverlay}>
                <BlurView intensity={80} tint="light" style={styles.headerBlur}>
                    <SafeAreaView edges={['top']}>
                        <View style={styles.headerContent}>
                            <Text style={styles.headerTitle}>Fleet Tracking</Text>
                            <Text style={styles.headerSubtitle}>{activeOrders.length} Active Couriers</Text>
                        </View>
                    </SafeAreaView>
                </BlurView>
            </View>

            <View style={styles.legendOverlay}>
                <BlurView intensity={80} tint="light" style={styles.legendBlur}>
                    <View style={styles.legendItem}>
                        <View style={[styles.dot, { backgroundColor: '#055FEE' }]} />
                        <Text style={styles.legendText}>Active Driver</Text>
                    </View>
                    <View style={styles.legendItem}>
                        <View style={[styles.dot, { backgroundColor: '#10B981' }]} />
                        <Text style={styles.legendText}>Drop-off Point</Text>
                    </View>
                </BlurView>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    map: { width: '100%', height: '100%' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
    headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
    headerBlur: { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
    headerContent: { padding: 20, paddingTop: Platform.OS === 'android' ? 20 : 10 },
    headerTitle: { fontSize: 24, fontWeight: '800', color: '#0F172A' },
    headerSubtitle: { fontSize: 14, color: '#64748B', marginTop: 4 },
    driverMarkerOuter: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(176, 106, 40, 0.3)', justifyContent: 'center', alignItems: 'center' },
    driverMarkerInner: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    legendOverlay: { position: 'absolute', bottom: 40, right: 20 },
    legendBlur: { padding: 12, borderRadius: 16, gap: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', overflow: 'hidden' },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 12, fontWeight: '600', color: '#334155' },
});
