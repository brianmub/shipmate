import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, StatusBar, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../utils/supabase';

export const CustomerTrackingScreen = ({ route, navigation }: any) => {
    const { orderId } = route.params;
    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(true);

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
        } catch (error: any) {
            console.error('Error fetching tracking order:', error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrder();

        const channel = supabase
            .channel(`public:tracking_${orderId}_web`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, (payload) => {
                setOrder((prev: any) => ({ ...prev, ...payload.new }));
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [orderId]);


    if (loading || !order) {
        return (
            <LinearGradient colors={['#F8FAFC', '#E2E8F0']} style={styles.safeArea}>
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#34A853" />
                </View>
            </LinearGradient>
        );
    }

    const isDelivery = order.service_type === 'delivery';
    const driverName = order.driver?.full_name || 'Assigning...';

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />

            <View style={styles.mapPlaceholder}>
                <View style={styles.placeholderContent}>
                    <Text style={styles.placeholderEmoji}>🚚</Text>
                    <Text style={styles.placeholderTitle}>Live Map Preview</Text>
                    <Text style={styles.placeholderText}>
                        Live tracking is best experienced on our mobile app.
                    </Text>
                    <View style={styles.statusBadge}>
                        <Text style={styles.statusBadgeText}>
                            Status: {order.status.replace('_', ' ').toUpperCase()}
                        </Text>
                    </View>
                </View>
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
                                    {order.status === 'in_progress' ? 'Driver is on the way' :
                                        order.status === 'accepted' ? 'Driver is heading to pickup' :
                                            order.status === 'completed' ? 'Delivered' : 'Pending'}
                                </Text>
                            </View>
                        </View>

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
    
    mapPlaceholder: {
        flex: 1,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    placeholderContent: {
        alignItems: 'center',
        maxWidth: 300,
    },
    placeholderEmoji: { fontSize: 48, marginBottom: 16 },
    placeholderTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B', textAlign: 'center', marginBottom: 8 },
    placeholderText: { fontSize: 14, color: '#64748B', textAlign: 'center', marginBottom: 20 },
    statusBadge: { backgroundColor: '#34A85322', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    statusBadgeText: { fontSize: 14, fontWeight: 'bold', color: '#34A853' },

    headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
    headerBlur: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.4)' },
    headerContent: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16,
    },
    backBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 12 },
    backTxt: { fontSize: 14, fontWeight: 'bold', color: '#334155' },
    headerText: { fontSize: 18, fontWeight: '800', color: '#0F172A' },

    bottomOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0 },
    jobDetailsPanel: {
        paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20,
        borderTopLeftRadius: 32, borderTopRightRadius: 32,
        borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,0.8)',
    },
    dragHandle: { width: 48, height: 5, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 3, alignSelf: 'center', marginBottom: 24 },
    titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    iconContainer: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    serviceIcon: { fontSize: 20 },
    jobType: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
    statusText: { fontSize: 14, color: '#34A853', fontWeight: '600' },

    driverInfoCard: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.7)', padding: 16,
        borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
        marginBottom: 20,
    },
    driverAvatar: {
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center',
        marginRight: 16,
    },
    driverAvatarText: { color: '#FFFFFF', fontSize: 20, fontWeight: 'bold' },
    driverDetails: { flex: 1 },
    driverNameLabel: { fontSize: 12, color: '#64748B', fontWeight: '500' },
    driverName: { fontSize: 18, fontWeight: '700', color: '#1E293B' },
    contactBtn: {
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: 'rgba(52, 168, 83, 0.1)', justifyContent: 'center', alignItems: 'center',
    },
    contactIcon: { fontSize: 20 },
});
