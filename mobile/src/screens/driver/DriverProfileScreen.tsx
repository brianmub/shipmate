import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuthStore } from '../../store/authStore';

export const DriverProfileScreen = ({ navigation }: any) => {
    const { user, signOut } = useAuthStore();
    const fullName = user?.user_metadata?.full_name || 'Courier';
    const initals = fullName.split(' ').map((n: string) => n[0]).join('').substring(0, 2);

    return (
        <LinearGradient
            colors={['#0F2027', '#203A43', '#2C5364']}
            style={styles.container}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
        >
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
            <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>

                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Profile</Text>
                </View>

                {/* Profile Card */}
                <BlurView intensity={20} tint="light" style={styles.profileCard}>
                    <LinearGradient
                        colors={['#055FEE', '#5B99F2']}
                        style={styles.avatarGradient}
                    >
                        <Text style={styles.avatarText}>{initals.toUpperCase()}</Text>
                    </LinearGradient>

                    <View style={styles.infoContainer}>
                        <Text style={styles.nameText}>{fullName}</Text>
                        <View style={styles.badgeContainer}>
                            <Text style={styles.badgeIcon}>✓</Text>
                            <Text style={styles.badgeText}>Approved Courier</Text>
                        </View>
                    </View>
                </BlurView>

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

                        <TouchableOpacity style={styles.settingItem} activeOpacity={0.7}>
                            <View style={[styles.settingIconContainer, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                                <Text style={styles.settingIcon}>🚗</Text>
                            </View>
                            <Text style={styles.settingText}>Vehicle Information</Text>
                            <Text style={styles.chevron}>›</Text>
                        </TouchableOpacity>

                        <View style={styles.divider} />

                        <TouchableOpacity style={styles.settingItem} activeOpacity={0.7}>
                            <View style={[styles.settingIconContainer, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                                <Text style={styles.settingIcon}>💰</Text>
                            </View>
                            <Text style={styles.settingText}>Earnings & Withdrawals</Text>
                            <Text style={styles.chevron}>›</Text>
                        </TouchableOpacity>

                        <View style={styles.divider} />

                        <TouchableOpacity style={styles.settingItem} activeOpacity={0.7}>
                            <View style={[styles.settingIconContainer, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                                <Text style={styles.settingIcon}>⚙️</Text>
                            </View>
                            <Text style={styles.settingText}>Working Zones</Text>
                            <Text style={styles.chevron}>›</Text>
                        </TouchableOpacity>
                    </BlurView>
                </View>

                <View style={styles.logoutContainer}>
                    <TouchableOpacity
                        style={styles.logoutButton}
                        activeOpacity={0.8}
                        onPress={signOut}
                    >
                        <Text style={styles.logoutButtonText}>Sign Out</Text>
                    </TouchableOpacity>
                </View>

            </SafeAreaView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
        paddingHorizontal: 24,
    },
    header: {
        paddingTop: Platform.OS === 'android' ? 40 : 20,
        paddingBottom: 24,
    },
    headerTitle: {
        fontSize: 32,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: -0.5,
    },
    profileCard: {
        flexDirection: 'row',
        padding: 24,
        marginBottom: 32,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        overflow: 'hidden',
    },
    avatarGradient: {
        width: 72,
        height: 72,
        borderRadius: 36,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 20,
        shadowColor: '#055FEE',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    avatarText: {
        color: '#FFFFFF',
        fontSize: 28,
        fontWeight: '800',
    },
    infoContainer: {
        justifyContent: 'center',
        flex: 1,
    },
    nameText: {
        fontSize: 24,
        fontWeight: '800',
        color: '#FFFFFF',
        marginBottom: 8,
        letterSpacing: -0.5,
    },
    badgeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(176, 106, 40, 0.3)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: 'rgba(5, 95, 238, 0.4)',
    },
    badgeIcon: {
        color: '#4ADE80',
        fontSize: 12,
        marginRight: 4,
        fontWeight: 'bold',
    },
    badgeText: {
        color: '#4ADE80',
        fontSize: 12,
        fontWeight: '700',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: 16,
        letterSpacing: -0.5,
    },
    settingsGroupContainer: {
        marginBottom: 32,
    },
    settingsGroup: {
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        overflow: 'hidden',
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
        marginTop: 'auto',
        marginBottom: 40,
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
