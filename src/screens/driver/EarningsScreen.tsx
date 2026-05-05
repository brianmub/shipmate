import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { userService } from '../../services/userService';

export const EarningsScreen = ({ navigation }: any) => {
    const { user } = useAuthStore();
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        if (!user) return;
        try {
            setLoading(true);
            const data = await userService.getDriverProfile(user.id);
            setProfile(data);
        } catch (error: any) {
            Alert.alert('Error', error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    if (loading) {
        return <View style={styles.center}><ActivityIndicator color="#34A853" /></View>;
    }

    return (
        <LinearGradient colors={['#0F172A', '#1E293B']} style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Earnings</Text>
                    <TouchableOpacity onPress={fetchData}>
                        <Ionicons name="refresh" size={20} color="#FFF" />
                    </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={styles.content}>
                    <View style={styles.balanceCard}>
                        <Text style={styles.balanceLabel}>Available Balance</Text>
                        <Text style={styles.balanceValue}>${profile?.available_balance?.toFixed(2) || '0.00'}</Text>
                        <TouchableOpacity style={styles.payoutBtn}>
                            <Text style={styles.payoutTxt}>Request Payout</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.statsGrid}>
                        <View style={styles.miniCard}>
                            <Text style={styles.miniLabel}>Total Earnings</Text>
                            <Text style={styles.miniValue}>${profile?.total_earnings?.toFixed(2)}</Text>
                        </View>
                        <View style={styles.miniCard}>
                            <Text style={styles.miniLabel}>Fees Paid</Text>
                            <Text style={styles.miniValue}>${profile?.platform_fees_paid?.toFixed(2)}</Text>
                        </View>
                    </View>

                    <View style={styles.statsGrid}>
                        <View style={styles.miniCard}>
                            <Text style={styles.miniLabel}>Completed</Text>
                            <Text style={styles.miniValue}>{profile?.completed_deliveries}</Text>
                        </View>
                        <View style={styles.miniCard}>
                            <Text style={styles.miniLabel}>Avg. Rating</Text>
                            <Text style={styles.miniValue}>{profile?.average_rating} ⭐</Text>
                        </View>
                    </View>

                    <Text style={styles.sectionTitle}>Recent Activity</Text>
                    <View style={styles.activityList}>
                        <Text style={styles.emptyText}>No recent payouts or adjustments found.</Text>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A' },
    safeArea: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
    backBtn: { padding: 8 },
    headerTitle: { fontSize: 20, fontWeight: '800', color: '#FFF' },
    content: { padding: 20 },
    balanceCard: { backgroundColor: '#34A853', borderRadius: 24, padding: 32, alignItems: 'center', marginBottom: 24 },
    balanceLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 16, marginBottom: 8 },
    balanceValue: { color: '#FFF', fontSize: 48, fontWeight: '900', marginBottom: 24 },
    payoutBtn: { backgroundColor: '#FFF', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 12 },
    payoutTxt: { color: '#34A853', fontWeight: '700' },
    statsGrid: { flexDirection: 'row', gap: 16, marginBottom: 16 },
    miniCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    miniLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 4 },
    miniValue: { color: '#FFF', fontSize: 20, fontWeight: '700' },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: '#FFF', marginTop: 24, marginBottom: 16 },
    activityList: { gap: 12 },
    emptyText: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 20 }
});
