import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { orderService } from '../../services/orderService';
import { Order } from '../../types';

export const OrderLogScreen = () => {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchAllOrders = async () => {
        try {
            setLoading(true);
            const data = await orderService.getAllOrders();
            setOrders(data || []);
        } catch (error) {
            console.error('Error fetching order log:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllOrders();
    }, []);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return '#055FEE';
            case 'in_progress': return '#60A5FA';
            case 'accepted': return '#FACC15';
            case 'pending': return '#F87171';
            default: return '#94A3B8';
        }
    };

    const renderOrderItem = ({ item }: { item: any }) => (
        <BlurView intensity={20} tint="light" style={styles.orderCard}>
            <View style={styles.orderHeader}>
                <View>
                    <Text style={styles.orderId}>Order #{item.id.slice(0, 8).toUpperCase()}</Text>
                    <Text style={styles.orderDate}>{new Date(item.created_at).toLocaleString()}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                        {item.status.toUpperCase()}
                    </Text>
                </View>
            </View>

            <View style={styles.orderBody}>
                <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Customer:</Text>
                    <Text style={styles.infoValue}>{item.customer?.full_name || 'Anonymous'}</Text>
                </View>
                <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Driver:</Text>
                    <Text style={styles.infoValue}>{item.driver?.full_name || 'Unassigned'}</Text>
                </View>
                <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Route:</Text>
                    <Text style={styles.infoValue} numberOfLines={1}>
                        {item.pickup_address || item.errand_location} → {item.dropoff_address}
                    </Text>
                </View>
            </View>

            <View style={styles.orderFooter}>
                <Text style={styles.serviceType}>
                    {item.service_type === 'delivery' ? '📦 Delivery' : '🛒 Errand'}
                </Text>
                <Text style={styles.cost}>${item.estimated_cost?.toFixed(2)}</Text>
            </View>
        </BlurView>
    );

    return (
        <LinearGradient colors={['#0F172A', '#1E293B']} style={styles.container}>
            <StatusBar barStyle="light-content" />
            <SafeAreaView style={styles.safeArea} edges={['top']}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Order Log</Text>
                    <TouchableOpacity onPress={fetchAllOrders} style={styles.refreshBtn}>
                        <Text style={styles.refreshIcon}>↻</Text>
                    </TouchableOpacity>
                </View>

                {loading ? (
                    <View style={styles.center}>
                        <ActivityIndicator color="#055FEE" size="large" />
                    </View>
                ) : (
                    <FlatList
                        data={orders}
                        keyExtractor={(item) => item.id}
                        renderItem={renderOrderItem}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </SafeAreaView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 20 },
    headerTitle: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
    refreshBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    refreshIcon: { color: '#055FEE', fontSize: 20 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    listContent: { padding: 20 },
    orderCard: { borderRadius: 24, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
    orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    orderId: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
    orderDate: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
    statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
    statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    orderBody: { gap: 8, marginBottom: 16 },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
    infoLabel: { fontSize: 14, color: '#94A3B8' },
    infoValue: { fontSize: 14, color: '#FFFFFF', fontWeight: '500', flex: 1, textAlign: 'right', marginLeft: 16 },
    orderFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
    serviceType: { fontSize: 14, color: '#94A3B8', fontWeight: '600' },
    cost: { fontSize: 18, fontWeight: '800', color: '#055FEE' },
});
