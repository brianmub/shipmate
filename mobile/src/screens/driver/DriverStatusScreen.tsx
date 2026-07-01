import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { userService } from '../../services/userService';

export const DriverStatusScreen = () => {
    const { verificationStatus, setVerificationStatus, signOut, user } = useAuthStore();
    const [refreshing, setRefreshing] = useState(false);

    const handleRefresh = async () => {
        if (!user) return;
        try {
            setRefreshing(true);
            const status = await userService.getDriverStatus(user.id);
            setVerificationStatus(status as any);
            if (status === 'approved') {
                Alert.alert('Congratulations! 🎉', 'Your application has been approved. Welcome to ShipMate!');
            } else {
                Alert.alert('Status Update', `Your current application status is: ${status?.toUpperCase()}`);
            }
        } catch (error: any) {
            Alert.alert('Refresh Failed', error.message);
        } finally {
            setRefreshing(false);
        }
    };

    const getStatusContent = () => {
        switch (verificationStatus) {
            case 'rejected':
                return {
                    icon: 'alert-circle-outline',
                    iconColor: '#EF4444',
                    title: 'Application Declined',
                    description: 'Unfortunately, your driver application has been reviewed and declined. Please contact our courier support team to appeal this decision.',
                };
            case 'suspended':
                return {
                    icon: 'lock-closed-outline',
                    iconColor: '#F43F5E',
                    title: 'Account Suspended',
                    description: 'Your courier account has been suspended due to activity violating our platform service policies. Contact support for assistance.',
                };
            case 'pending':
            default:
                return {
                    icon: 'time-outline',
                    iconColor: '#F59E0B',
                    title: 'Application Under Review',
                    description: 'Our administration team is currently verifying your documents and AI pre-screening report. We will send you a push notification as soon as your account is approved.',
                };
        }
    };

    const content = getStatusContent();

    return (
        <LinearGradient colors={['#0F172A', '#1E293B']} style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <Text style={styles.brandTitle}>ShipMate</Text>
                    <Text style={styles.brandSubtitle}>Courier Network</Text>
                </View>

                <View style={styles.cardContainer}>
                    <View style={styles.glassCard}>
                        <View style={[styles.iconContainer, { backgroundColor: `${content.iconColor}15` }]}>
                            <Ionicons name={content.icon as any} size={48} color={content.iconColor} />
                        </View>

                        <Text style={styles.cardTitle}>{content.title}</Text>
                        <Text style={styles.cardDescription}>{content.description}</Text>

                        <TouchableOpacity 
                            style={styles.refreshBtn} 
                            onPress={handleRefresh}
                            disabled={refreshing}
                        >
                            {refreshing ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <>
                                    <Ionicons name="refresh-outline" size={20} color="#FFF" style={styles.btnIcon} />
                                    <Text style={styles.refreshTxt}>Check Status</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                <TouchableOpacity style={styles.logoutBtn} onPress={signOut}>
                    <Ionicons name="log-out-outline" size={18} color="#94A3B8" />
                    <Text style={styles.logoutTxt}>Sign Out</Text>
                </TouchableOpacity>
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
        justifyContent: 'space-between',
        padding: 24,
    },
    header: {
        alignItems: 'center',
        marginTop: 40,
    },
    brandTitle: {
        fontSize: 32,
        fontWeight: '900',
        color: '#FFF',
        letterSpacing: -1,
    },
    brandSubtitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#055FEE',
        textTransform: 'uppercase',
        letterSpacing: 2,
        marginTop: 4,
    },
    cardContainer: {
        flex: 1,
        justifyContent: 'center',
        marginVertical: 20,
    },
    glassCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 32,
        padding: 32,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.07)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 5,
    },
    iconContainer: {
        width: 96,
        height: 96,
        borderRadius: 48,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    cardTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#FFF',
        textAlign: 'center',
        marginBottom: 16,
    },
    cardDescription: {
        fontSize: 14,
        color: '#94A3B8',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 32,
        paddingHorizontal: 10,
    },
    refreshBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#055FEE',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 16,
        width: '100%',
        shadowColor: '#055FEE',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 3,
    },
    btnIcon: {
        marginRight: 8,
    },
    refreshTxt: {
        color: '#FFF',
        fontSize: 15,
        fontWeight: '700',
    },
    logoutBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        alignSelf: 'center',
        marginBottom: 20,
    },
    logoutTxt: {
        color: '#94A3B8',
        fontSize: 15,
        fontWeight: '600',
    },
});
