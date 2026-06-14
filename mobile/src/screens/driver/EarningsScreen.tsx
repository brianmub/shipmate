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
    const [transactions, setTransactions] = useState<any[]>([]);
    const [settings, setSettings] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        if (!user) return;
        try {
            setLoading(true);
            const driverProfile = await userService.getDriverProfile(user.id);
            setProfile(driverProfile);

            // Fetch transaction history
            const txs = await userService.getTransactions(user.id);
            setTransactions(txs || []);

            // Fetch platform settings
            const sysSettings = await userService.getSystemSettings();
            setSettings(sysSettings);
        } catch (error: any) {
            Alert.alert('Error Loading Earnings', error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleRequestPayout = () => {
        if (!profile) return;
        const available = profile.available_balance || 0;
        const threshold = settings?.min_payout_threshold || 20.00;

        if (available < threshold) {
            Alert.alert(
                'Payout Request Denied',
                `Minimum payout threshold is $${threshold.toFixed(2)}. Your current balance is $${available.toFixed(2)}.`
            );
            return;
        }

        Alert.alert(
            'Confirm Payout Request',
            `Would you like to withdraw your full available balance of $${available.toFixed(2)}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Withdraw',
                    onPress: async () => {
                        try {
                            setLoading(true);
                            await userService.requestPayout(user!.id, available);
                            Alert.alert('Success', `Your payout withdrawal of $${available.toFixed(2)} has been successfully completed!`);
                            fetchData();
                        } catch (err: any) {
                            Alert.alert('Payout Failed', err.message);
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    if (loading && !profile) {
        return <View style={styles.center}><ActivityIndicator color="#34A853" size="large" /></View>;
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

                <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                    <View style={styles.balanceCard}>
                        <Text style={styles.balanceLabel}>Available Balance</Text>
                        <Text style={styles.balanceValue}>${profile?.available_balance?.toFixed(2) || '0.00'}</Text>
                        <TouchableOpacity style={styles.payoutBtn} onPress={handleRequestPayout} disabled={loading}>
                            <Text style={styles.payoutTxt}>Request Payout</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.statsGrid}>
                        <View style={styles.miniCard}>
                            <Text style={styles.miniLabel}>Total Earnings</Text>
                            <Text style={styles.miniValue}>${profile?.total_earnings?.toFixed(2) || '0.00'}</Text>
                        </View>
                        <View style={styles.miniCard}>
                            <Text style={styles.miniLabel}>Fees Paid</Text>
                            <Text style={styles.miniValue}>${profile?.platform_fees_paid?.toFixed(2) || '0.00'}</Text>
                        </View>
                    </View>

                    <View style={styles.statsGrid}>
                        <View style={styles.miniCard}>
                            <Text style={styles.miniLabel}>Completed</Text>
                            <Text style={styles.miniValue}>{profile?.completed_deliveries || 0}</Text>
                        </View>
                        <View style={styles.miniCard}>
                            <Text style={styles.miniLabel}>Avg. Rating</Text>
                            <Text style={styles.miniValue}>{profile?.average_rating || '5.0'} ⭐</Text>
                        </View>
                    </View>

                    <Text style={styles.sectionTitle}>Recent Activity</Text>
                    <View style={styles.activityList}>
                        {transactions.length > 0 ? (
                            transactions.map((tx: any) => (
                                <View key={tx.id} style={styles.txRow}>
                                    <View style={styles.txLeft}>
                                        <View style={[
                                            styles.txIconContainer, 
                                            { backgroundColor: tx.type === 'payout' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(52, 168, 83, 0.1)' }
                                        ]}>
                                            <Ionicons 
                                                name={tx.type === 'payout' ? "arrow-up" : "arrow-down"} 
                                                size={18} 
                                                color={tx.type === 'payout' ? "#EF4444" : "#34A853"} 
                                            />
                                        </View>
                                        <View style={{ marginLeft: 12 }}>
                                            <Text style={styles.txType}>
                                                {tx.type === 'payout' ? 'Payout Withdrawal' : 'Job Earnings'}
                                            </Text>
                                            <Text style={styles.txDate}>
                                                {new Date(tx.created_at).toLocaleDateString('en-US', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric'
                                                })}
                                            </Text>
                                        </View>
                                    </View>
                                    <Text style={[
                                        styles.txAmount, 
                                        { color: tx.type === 'payout' ? "#EF4444" : "#34A853" }
                                    ]}>
                                        {tx.type === 'payout' ? '-' : '+'}${tx.amount.toFixed(2)}
                                    </Text>
                                </View>
                            ))
                        ) : (
                            <Text style={styles.emptyText}>No recent payouts or adjustments found.</Text>
                        )}
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
    emptyText: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 20 },
    txRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        padding: 16,
        borderRadius: 16,
        marginBottom: 10,
    },
    txLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    txIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    txType: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '700',
    },
    txDate: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11,
        marginTop: 2,
    },
    txAmount: {
        fontSize: 16,
        fontWeight: '800',
    },
});
