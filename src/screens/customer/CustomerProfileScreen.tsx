import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { userService } from '../../services/userService';
import { supabase } from '../../utils/supabase';
import { DeleteAccountModal } from '../../components/DeleteAccountModal';

export const CustomerProfileScreen = () => {
    const { signOut, user } = useAuthStore();
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const displayName = profile?.full_name || user?.user_metadata?.full_name || 'Customer';
    const displayEmail = user?.email || profile?.phone || 'Account Member';
    const initials = displayName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() || 'CU';

    const loadProfile = async () => {
        if (!user) return;
        try {
            setLoading(true);
            const data = await userService.getUserProfile(user.id);
            setProfile(data);
        } catch (error) {
            console.error('Error fetching customer profile:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProfile();
    }, [user?.id]);

    const handleConfirmDelete = async () => {
        if (!user) return;
        try {
            setDeleting(true);
            await userService.deleteAccount(user.id);
            setShowDeleteModal(false);
            
            Alert.alert(
                'Account Deleted',
                'Your Shipmate account and personal data have been permanently wiped.',
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

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                <Text style={styles.header}>Profile</Text>

                <View style={styles.profileCard}>
                    <View style={styles.avatarContainer}>
                        <Text style={styles.avatarText}>{initials}</Text>
                    </View>
                    <View style={styles.infoContainer}>
                        <Text style={styles.nameText}>{displayName}</Text>
                        <Text style={styles.emailText}>{displayEmail}</Text>
                        <View style={styles.badgeContainer}>
                            <Text style={styles.badgeText}>Customer</Text>
                        </View>
                    </View>
                </View>

                {/* Settings Group */}
                <View style={styles.settingsGroup}>
                    <TouchableOpacity style={styles.settingItem} activeOpacity={0.7}>
                        <Text style={styles.settingIcon}>📍</Text>
                        <Text style={styles.settingText}>Saved Addresses</Text>
                        <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.settingItem} activeOpacity={0.7}>
                        <Text style={styles.settingIcon}>💳</Text>
                        <Text style={styles.settingText}>Payment Methods</Text>
                        <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.settingItem} activeOpacity={0.7}>
                        <Text style={styles.settingIcon}>🔔</Text>
                        <Text style={styles.settingText}>Notifications</Text>
                        <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>
                </View>

                {/* Account Management & Apple Guideline 5.1.1(v) Compliance */}
                <View style={styles.dangerGroup}>
                    <Text style={styles.dangerGroupTitle}>Account Management</Text>
                    <View style={styles.dangerCard}>
                        <TouchableOpacity
                            style={styles.deleteItem}
                            activeOpacity={0.7}
                            onPress={() => setShowDeleteModal(true)}
                        >
                            <View style={styles.deleteIconBox}>
                                <Text style={styles.deleteIcon}>🗑️</Text>
                            </View>
                            <View style={styles.deleteTextWrapper}>
                                <Text style={styles.deleteTitle}>Delete Account & Wipe Data</Text>
                                <Text style={styles.deleteSubtitle}>Permanently remove your profile, data & login credentials</Text>
                            </View>
                            <Text style={styles.chevronDanger}>›</Text>
                        </TouchableOpacity>
                    </View>
                </View>

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

                <Text style={styles.versionText}>Shipmate Version 2.0.3</Text>
            </ScrollView>

            <DeleteAccountModal
                visible={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirmDelete={handleConfirmDelete}
                userRole="customer"
                deleting={deleting}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    scrollContent: {
        paddingBottom: 40,
    },
    header: {
        fontSize: 28,
        fontWeight: '800',
        marginBottom: 16,
        color: '#0F172A',
        paddingHorizontal: 24,
        paddingTop: 16,
        letterSpacing: -0.5,
    },
    profileCard: {
        backgroundColor: '#FFFFFF',
        flexDirection: 'row',
        padding: 24,
        marginBottom: 24,
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
        alignItems: 'center',
    },
    avatarContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#055FEE',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    avatarText: {
        color: '#FFFFFF',
        fontSize: 24,
        fontWeight: '800',
    },
    infoContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    nameText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 2,
    },
    emailText: {
        fontSize: 13,
        color: '#64748B',
        marginBottom: 8,
    },
    badgeContainer: {
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 6,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    badgeText: {
        color: '#1D4ED8',
        fontSize: 11,
        fontWeight: '700',
    },
    settingsGroup: {
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
        marginBottom: 24,
    },
    settingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    settingIcon: {
        fontSize: 18,
        marginRight: 16,
    },
    settingText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1E293B',
        flex: 1,
    },
    chevron: {
        fontSize: 20,
        color: '#94A3B8',
        fontWeight: '400',
    },
    dangerGroup: {
        paddingHorizontal: 24,
        marginBottom: 28,
    },
    dangerGroupTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#64748B',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    dangerCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#FEE2E2',
        overflow: 'hidden',
    },
    deleteItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#FEF2F2',
    },
    deleteIconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#FEE2E2',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    deleteIcon: {
        fontSize: 18,
    },
    deleteTextWrapper: {
        flex: 1,
    },
    deleteTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#DC2626',
        marginBottom: 2,
    },
    deleteSubtitle: {
        fontSize: 11,
        color: '#991B1B',
        lineHeight: 15,
    },
    chevronDanger: {
        fontSize: 20,
        color: '#EF4444',
        fontWeight: '400',
    },
    logoutButton: {
        backgroundColor: '#FFFFFF',
        paddingVertical: 16,
        marginHorizontal: 24,
        borderRadius: 14,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#CBD5E1',
        marginBottom: 16,
    },
    logoutButtonText: {
        color: '#475569',
        fontSize: 15,
        fontWeight: '700',
    },
    versionText: {
        textAlign: 'center',
        fontSize: 12,
        color: '#94A3B8',
        fontWeight: '500',
    },
});
