import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuthStore } from '../../store/authStore';
import { userService } from '../../services/userService';
import { supabase } from '../../utils/supabase';
import { DeleteAccountModal } from '../../components/DeleteAccountModal';

export const DriverProfileScreen = ({ navigation }: any) => {
    const { user, signOut } = useAuthStore();
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const fullName = user?.user_metadata?.full_name || 'Courier';
    const initals = fullName.split(' ').map((n: string) => n[0]).join('').substring(0, 2);

    const loadProfile = async () => {
        if (!user) return;
        try {
            setLoading(true);
            const data = await userService.getDriverProfile(user.id);
            setProfile(data);
        } catch (error) {
            console.error('Error fetching driver profile:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProfile();
        const unsubscribe = navigation.addListener('focus', () => {
            loadProfile();
        });
        return unsubscribe;
    }, [navigation, user]);

    const handleConfirmDelete = async () => {
        if (!user) return;
        try {
            setDeleting(true);
            await userService.deleteAccount(user.id);
            setShowDeleteModal(false);

            Alert.alert(
                'Account Deleted',
                'Your Shipmate courier account and personal data have been permanently wiped.',
                [
                    {
                        text: 'OK',
                        onPress: async () => {
                            await supabase.auth.signOut();
                            signOut();
                        }
                    }
                ]
            );
        } catch (err: any) {
            Alert.alert('Deletion Failed', err?.message || 'Could not delete account. Please try again.');
        } finally {
            setDeleting(false);
        }
    };

    const isPlatinum = profile?.tier === 'platinum';

    return (
        <LinearGradient
            colors={['#0F2027', '#203A43', '#2C5364']}
            style={styles.container}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
        >
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
            <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Profile</Text>
                    </View>

                    {/* Profile Card */}
                    <BlurView intensity={20} tint="light" style={styles.profileCard}>
                        <LinearGradient
                            colors={isPlatinum ? ['#7C3AED', '#4F46E5'] : ['#055FEE', '#5B99F2']}
                            style={styles.avatarGradient}
                        >
                            <Text style={styles.avatarText}>{initals.toUpperCase()}</Text>
                        </LinearGradient>

                        <View style={styles.infoContainer}>
                            <Text style={styles.nameText}>{fullName}</Text>
                            <View style={styles.badgesRow}>
                                <View style={styles.badgeContainer}>
                                    <Text style={styles.badgeIcon}>✓</Text>
                                    <Text style={styles.badgeText}>Approved Mate</Text>
                                </View>

                                {isPlatinum ? (
                                    <LinearGradient
                                        colors={['#7C3AED', '#4F46E5']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={styles.tierBadge}
                                    >
                                        <Text style={styles.tierBadgeText}>🏆 Platinum</Text>
                                    </LinearGradient>
                                ) : (
                                    <View style={styles.standardTierBadge}>
                                        <Text style={styles.standardTierBadgeText}>🚗 Standard</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    </BlurView>

                    {/* Platinum Performance Dashboard Card */}
                    <View style={styles.metricsContainer}>
                        <View style={styles.metricsHeaderRow}>
                            <Text style={styles.sectionTitle}>Performance & Tier Standing</Text>
                            {isPlatinum ? (
                                <View style={styles.priorityActivePill}>
                                    <Text style={styles.priorityActivePillText}>⚡ 30s Early Access Active</Text>
                                </View>
                            ) : null}
                        </View>

                        <BlurView intensity={25} tint="light" style={styles.metricsCard}>
                            <View style={styles.metricsGrid}>
                                {/* 1. Rating */}
                                <View style={styles.metricItem}>
                                    <Text style={styles.metricLabel}>Rating</Text>
                                    <Text style={styles.metricValue}>
                                        {profile?.average_rating ? Number(profile.average_rating).toFixed(2) : '5.00'} ⭐
                                    </Text>
                                    <Text style={styles.metricGoal}>Goal: ≥ 4.85</Text>
                                </View>

                                {/* 2. Completed Jobs */}
                                <View style={styles.metricItem}>
                                    <Text style={styles.metricLabel}>Job Volume</Text>
                                    <Text style={styles.metricValue}>
                                        {profile?.completed_deliveries || 0}
                                    </Text>
                                    <Text style={styles.metricGoal}>Goal: ≥ 50 trips</Text>
                                </View>

                                {/* 3. Completion Rate */}
                                <View style={styles.metricItem}>
                                    <Text style={styles.metricLabel}>Completion</Text>
                                    <Text style={styles.metricValue}>
                                        {profile?.completion_rate ? `${Number(profile.completion_rate).toFixed(0)}%` : '100%'}
                                    </Text>
                                    <Text style={styles.metricGoal}>Goal: ≥ 95%</Text>
                                </View>

                                {/* 4. Acceptance Rate */}
                                <View style={styles.metricItem}>
                                    <Text style={styles.metricLabel}>Acceptance</Text>
                                    <Text style={styles.metricValue}>
                                        {profile?.acceptance_rate ? `${Number(profile.acceptance_rate).toFixed(0)}%` : '100%'}
                                    </Text>
                                    <Text style={styles.metricGoal}>Goal: ≥ 80%</Text>
                                </View>

                                {/* 5. On-Time Rate */}
                                <View style={styles.metricItem}>
                                    <Text style={styles.metricLabel}>On-Time</Text>
                                    <Text style={styles.metricValue}>
                                        {profile?.on_time_rate ? `${Number(profile.on_time_rate).toFixed(0)}%` : '100%'}
                                    </Text>
                                    <Text style={styles.metricGoal}>Goal: ≥ 90%</Text>
                                </View>

                                {/* 6. Identity & Wallet */}
                                <View style={styles.metricItem}>
                                    <Text style={styles.metricLabel}>Wallet & ID</Text>
                                    <Text style={[styles.metricValue, { fontSize: 13, color: '#4ADE80' }]}>
                                        {profile?.is_identity_verified ? 'Verified ✓' : 'Pending ID'}
                                    </Text>
                                    <Text style={styles.metricGoal}>Goal: In Good Standing</Text>
                                </View>
                            </View>

                            <View style={styles.perkNoteBox}>
                                <Text style={styles.perkNoteText}>
                                    {isPlatinum
                                        ? '🎉 You have Platinum Priority! You receive exclusive 30-second early access to all incoming customer delivery requests.'
                                        : '💡 Reach 50+ deliveries, 4.85★ rating, and 95% completion to earn Platinum and receive 30s early access on new jobs.'}
                                </Text>
                            </View>
                        </BlurView>
                    </View>

                    {/* Settings Group */}
                    <View style={styles.settingsGroupContainer}>
                        <Text style={styles.sectionTitle}>Settings & Preferences</Text>

                        <BlurView intensity={20} tint="light" style={styles.settingsGroup}>
                            <TouchableOpacity
                                style={styles.settingItem}
                                activeOpacity={0.7}
                                onPress={() => navigation.navigate('DriverOnboarding')}
                            >
                                <View style={[styles.settingIconContainer, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                                    <Text style={styles.settingIcon}>📄</Text>
                                </View>
                                <Text style={styles.settingText}>Verification Documents</Text>
                                <Text style={styles.chevron}>›</Text>
                            </TouchableOpacity>

                            <View style={styles.divider} />

                            <TouchableOpacity 
                                style={styles.settingItem} 
                                activeOpacity={0.7}
                                onPress={() => navigation.navigate('Wallet')}
                            >
                                <View style={[styles.settingIconContainer, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                                    <Text style={styles.settingIcon}>💰</Text>
                                </View>
                                <Text style={styles.settingText}>Earnings & Wallet</Text>
                                <Text style={styles.chevron}>›</Text>
                            </TouchableOpacity>

                            <View style={styles.divider} />

                            <TouchableOpacity 
                                style={styles.settingItem} 
                                activeOpacity={0.7}
                                onPress={() => navigation.navigate('SecurityCheck')}
                            >
                                <View style={[styles.settingIconContainer, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                                    <Text style={styles.settingIcon}>🛡️</Text>
                                </View>
                                <Text style={styles.settingText}>Security Check</Text>
                                <Text style={styles.chevron}>›</Text>
                            </TouchableOpacity>

                            <View style={styles.divider} />

                            <TouchableOpacity 
                                style={styles.settingItem} 
                                activeOpacity={0.7}
                                onPress={() => setShowDeleteModal(true)}
                            >
                                <View style={[styles.settingIconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.25)' }]}>
                                    <Text style={styles.settingIcon}>🗑️</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.settingText, { color: '#FCA5A5' }]}>Delete Account & Data</Text>
                                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>
                                        Permanent profile & credentials removal
                                    </Text>
                                </View>
                                <Text style={[styles.chevron, { color: '#EF4444' }]}>›</Text>
                            </TouchableOpacity>
                        </BlurView>
                    </View>

                    <View style={styles.logoutContainer}>
                        <TouchableOpacity
                            style={styles.logoutButton}
                            activeOpacity={0.8}
                            onPress={async () => {
                                await supabase.auth.signOut();
                                signOut();
                            }}
                        >
                            <Text style={styles.logoutButtonText}>Sign Out</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SafeAreaView>

            <DeleteAccountModal
                visible={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirmDelete={handleConfirmDelete}
                userRole="driver"
                deleting={deleting}
            />
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
    scrollContent: {
        paddingHorizontal: 24,
        paddingBottom: 40,
    },
    header: {
        paddingTop: Platform.OS === 'android' ? 30 : 16,
        paddingBottom: 20,
    },
    headerTitle: {
        fontSize: 32,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: -0.5,
    },
    profileCard: {
        flexDirection: 'row',
        padding: 20,
        marginBottom: 24,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        overflow: 'hidden',
    },
    avatarGradient: {
        width: 68,
        height: 68,
        borderRadius: 34,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
        shadowColor: '#055FEE',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    avatarText: {
        color: '#FFFFFF',
        fontSize: 26,
        fontWeight: '800',
    },
    infoContainer: {
        justifyContent: 'center',
        flex: 1,
    },
    nameText: {
        fontSize: 22,
        fontWeight: '800',
        color: '#FFFFFF',
        marginBottom: 8,
        letterSpacing: -0.5,
    },
    badgesRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
    },
    badgeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    badgeIcon: {
        color: '#4ADE80',
        fontSize: 11,
        marginRight: 4,
        fontWeight: 'bold',
    },
    badgeText: {
        color: '#4ADE80',
        fontSize: 11,
        fontWeight: '700',
    },
    tierBadge: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
    },
    tierBadgeText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
    standardTierBadge: {
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    standardTierBadgeText: {
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: 11,
        fontWeight: '600',
    },
    metricsContainer: {
        marginBottom: 28,
    },
    metricsHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        flexWrap: 'wrap',
        gap: 8,
    },
    priorityActivePill: {
        backgroundColor: 'rgba(124, 58, 237, 0.3)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(124, 58, 237, 0.6)',
    },
    priorityActivePillText: {
        color: '#C4B5FD',
        fontSize: 11,
        fontWeight: '700',
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#FFFFFF',
        letterSpacing: -0.3,
    },
    metricsCard: {
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        padding: 16,
        overflow: 'hidden',
    },
    metricsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: 14,
    },
    metricItem: {
        width: '31%',
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderRadius: 14,
        padding: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    metricLabel: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.6)',
        fontWeight: '600',
        marginBottom: 4,
    },
    metricValue: {
        fontSize: 15,
        fontWeight: '800',
        color: '#FFFFFF',
        marginBottom: 2,
    },
    metricGoal: {
        fontSize: 9,
        color: 'rgba(255, 255, 255, 0.4)',
        fontWeight: '500',
    },
    perkNoteBox: {
        marginTop: 14,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    perkNoteText: {
        color: 'rgba(255, 255, 255, 0.85)',
        fontSize: 12,
        lineHeight: 18,
        fontWeight: '500',
    },
    settingsGroupContainer: {
        marginBottom: 28,
    },
    settingsGroup: {
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        overflow: 'hidden',
        marginTop: 12,
    },
    settingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 20,
    },
    settingIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    settingIcon: {
        fontSize: 20,
    },
    settingText: {
        flex: 1,
        fontSize: 16,
        color: '#FFFFFF',
        fontWeight: '500',
    },
    chevron: {
        fontSize: 24,
        color: 'rgba(255,255,255,0.4)',
        fontWeight: '300',
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginLeft: 76,
    },
    logoutContainer: {
        marginTop: 8,
        marginBottom: 20,
    },
    logoutButton: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        padding: 16,
        borderRadius: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.3)',
    },
    logoutButtonText: {
        color: '#F87171',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
});
