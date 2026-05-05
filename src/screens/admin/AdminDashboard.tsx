import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { orderService } from '../../services/orderService';
import { supabase } from '../../utils/supabase';

export const AdminDashboard = ({ navigation }: any) => {
    const [stats, setStats] = useState({
        totalOrders: 0,
        activeOrders: 0,
        onlineDrivers: 0,
        revenue: 0
    });
    const [loading, setLoading] = useState(true);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const { data: orders, error: ordersError } = await supabase.from('orders').select('*');
            const { data: drivers, error: driversError } = await supabase.from('users').select('*').eq('role', 'driver');

            if (ordersError || driversError) throw ordersError || driversError;

            const active = orders?.filter(o => ['accepted', 'in_progress'].includes(o.status)).length || 0;
            const revenue = orders?.filter(o => o.status === 'completed').reduce((acc, o) => acc + (o.estimated_cost || 0), 0) || 0;

            setStats({
                totalOrders: orders?.length || 0,
                activeOrders: active,
                onlineDrivers: drivers?.length || 0, // In a real app we'd check if they are 'online'
                revenue: revenue
            });
        } catch (error) {
            console.error('Error fetching admin stats:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
        
        // Subscription for real-time updates
        const channel = supabase
            .channel('admin_stats')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                fetchStats();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const StatCard = ({ title, value, icon, color }: any) => (
        <BlurView intensity={20} tint="light" style={styles.statCard}>
            <View style={[styles.iconBox, { backgroundColor: color + '20' }]}>
                <Text style={styles.statIcon}>{icon}</Text>
            </View>
            <Text style={styles.statLabel}>{title}</Text>
            <Text style={[styles.statValue, { color }]}>{value}</Text>
        </BlurView>
    );

    return (
        <LinearGradient
            colors={['#0F172A', '#1E293B']}
            style={styles.container}
        >
            <StatusBar barStyle="light-content" />
            <SafeAreaView style={styles.safeArea}>
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.headerTitle}>System Overview</Text>
                            <Text style={styles.headerSubtitle}>Real-time platform metrics</Text>
                        </View>
                        <TouchableOpacity onPress={fetchStats} style={styles.refreshBtn}>
                            <Text style={styles.refreshIcon}>↻</Text>
                        </TouchableOpacity>
                    </View>

                    {loading ? (
                        <ActivityIndicator color="#34A853" size="large" style={{ marginTop: 40 }} />
                    ) : (
                        <>
                            <View style={styles.statsGrid}>
                                <StatCard title="Active Orders" value={stats.activeOrders} icon="⚡" color="#34A853" />
                                <StatCard title="Total Orders" value={stats.totalOrders} icon="📦" color="#60A5FA" />
                            </View>

                            <View style={styles.statsGrid}>
                                <StatCard title="Total Revenue" value={`$${stats.revenue.toFixed(2)}`} icon="💰" color="#FACC15" />
                                <StatCard title="Active Drivers" value={stats.onlineDrivers} icon="🚗" color="#F87171" />
                            </View>

                            <Text style={styles.sectionTitle}>Quick Actions</Text>
                            
                            <TouchableOpacity 
                                style={styles.actionCard}
                                onPress={() => navigation.navigate('Orders')}
                            >
                                <LinearGradient
                                    colors={['rgba(52, 168, 83, 0.1)', 'rgba(52, 168, 83, 0.05)']}
                                    style={styles.actionGradient}
                                >
                                    <View style={styles.actionInfo}>
                                        <Text style={styles.actionTitle}>Order Log</Text>
                                        <Text style={styles.actionDesc}>View and manage all deliveries</Text>
                                    </View>
                                    <Text style={styles.actionArrow}>→</Text>
                                </LinearGradient>
                            </TouchableOpacity>

                            <TouchableOpacity 
                                style={styles.actionCard}
                                onPress={() => navigation.navigate('Fleet')}
                            >
                                <LinearGradient
                                    colors={['rgba(96, 165, 250, 0.1)', 'rgba(96, 165, 250, 0.05)']}
                                    style={styles.actionGradient}
                                >
                                    <View style={styles.actionInfo}>
                                        <Text style={styles.actionTitle}>Fleet Tracking</Text>
                                        <Text style={styles.actionDesc}>Live map of all active couriers</Text>
                                    </View>
                                    <Text style={styles.actionArrow}>→</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </>
                    )}

                </ScrollView>
            </SafeAreaView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    scrollContent: { padding: 24 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
    headerTitle: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
    headerSubtitle: { fontSize: 16, color: '#94A3B8' },
    refreshBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    refreshIcon: { color: '#34A853', fontSize: 24 },
    statsGrid: { flexDirection: 'row', gap: 16, marginBottom: 16 },
    statCard: { flex: 1, padding: 20, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
    iconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    statIcon: { fontSize: 18 },
    statLabel: { fontSize: 14, color: '#94A3B8', fontWeight: '500', marginBottom: 4 },
    statValue: { fontSize: 24, fontWeight: '800' },
    sectionTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginTop: 32, marginBottom: 16 },
    actionCard: { borderRadius: 20, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    actionGradient: { padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    actionInfo: { flex: 1 },
    actionTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
    actionDesc: { fontSize: 14, color: '#94A3B8' },
    actionArrow: { fontSize: 24, color: '#34A853', fontWeight: 'bold' },
});
