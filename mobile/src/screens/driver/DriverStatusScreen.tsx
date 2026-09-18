import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { userService } from '../../services/userService';

export const DriverStatusScreen = () => {
    const { verificationStatus, setVerificationStatus, rejectionReason, setRejectionReason, signOut, user } = useAuthStore();
    const [refreshing, setRefreshing] = useState(false);

    const handleRefresh = async () => {
        if (!user) return;
        try {
            setRefreshing(true);
            const details = await userService.getDriverVerificationDetails(user.id);
            setVerificationStatus(details.status as any);
            setRejectionReason(details.rejectionReason);
            if (details.status === 'approved') {
                Alert.alert('Congratulations! 🎉', 'Your application has been approved. Welcome to ShipMate!');
            } else if (details.status === 'rejected') {
                Alert.alert('Action Required', 'Your application requires updates. Please review the admin instructions below.');
            } else {
                Alert.alert('Status Update', `Your current application status is: ${details.status?.toUpperCase()}`);
            }
        } catch (error: any) {
            Alert.alert('Refresh Failed', error.message);
        } finally {
            setRefreshing(false);
        }
    };

    const handleFixAndResubmit = () => {
        // Switch to onboarding view so driver can re-upload photos and update details
        setVerificationStatus('onboarding');
    };

    const getStatusContent = () => {
        switch (verificationStatus) {
            case 'rejected':
                return {
                    icon: 'alert-circle-outline',
                    iconColor: '#EF4444',
                    title: 'Application Needs Updates',
                    description: 'Our administration team reviewed your application, but some documents or information need to be corrected before your account can be approved.',
                };
            case 'suspended':
                return {
                    icon: 'lock-closed-outline',
                    iconColor: '#F43F5E',
                    title: 'Account Suspended',
                    description: 'Your Mate account has been suspended due to activity violating our platform service policies. Contact support for assistance.',
                };
            case 'pending':
            default:
                return {
                    icon: 'time-outline',
                    iconColor: '#F59E0B',
                    title: 'Application Under Review',
                    description: 'Our administration team is currently verifying your documents and vehicle inspection photos. We will notify you as soon as your account is approved.',
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
                    <Text style={styles.brandSubtitle}>Mate Network</Text>
                </View>

                <View style={styles.cardContainer}>
                    <View style={styles.glassCard}>
                        <View style={[styles.iconContainer, { backgroundColor: `${content.iconColor}15` }]}>
                            <Ionicons name={content.icon as any} size={48} color={content.iconColor} />
                        </View>

                        <Text style={styles.cardTitle}>{content.title}</Text>
                        <Text style={styles.cardDescription}>{content.description}</Text>

                        {/* Admin Feedback Box for Disapproved / Fix Required Applications */}
                        {verificationStatus === 'rejected' && (
                            <View style={styles.feedbackContainer}>
                                <View style={styles.feedbackHeader}>
                                    <Ionicons name="chatbubble-ellipses-outline" size={16} color="#EF4444" />
                                    <Text style={styles.feedbackTitle}>WHY APPLICATION WAS NOT APPROVED</Text>
                                </View>
                                <Text style={styles.feedbackBody}>
                                    {rejectionReason || 'Some documents or details were incomplete or unclear. Please re-upload clear photos.'}
                                </Text>
                                <Text style={styles.feedbackHint}>
                                    Tap "Update Documents & Resubmit" below to fix this reason and resubmit for approval.
                                </Text>
                            </View>
                        )}

                        {/* Action buttons */}
                        <View style={styles.actionsContainer}>
                            {verificationStatus === 'rejected' && (
                                <TouchableOpacity 
                                    style={styles.fixButton} 
                                    onPress={handleFixAndResubmit}
                                >
                                    <Ionicons name="cloud-upload-outline" size={20} color="#FFF" style={styles.btnIcon} />
                                    <Text style={styles.fixButtonText}>Update Documents & Resubmit</Text>
                                </TouchableOpacity>
                            )}

                            <TouchableOpacity 
                                style={[styles.refreshBtn, verificationStatus === 'rejected' && styles.refreshBtnSecondary]} 
                                onPress={handleRefresh}
                                disabled={refreshing}
                            >
                                {refreshing ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <>
                                        <Ionicons name="refresh-outline" size={20} color={verificationStatus === 'rejected' ? '#94A3B8' : '#FFF'} style={styles.btnIcon} />
                                        <Text style={[styles.refreshTxt, verificationStatus === 'rejected' && styles.refreshTxtSecondary]}>
                                            Check Status
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
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
    refreshBtnSecondary: {
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        shadowOpacity: 0,
    },
    btnIcon: {
        marginRight: 8,
    },
    refreshTxt: {
        color: '#FFF',
        fontSize: 15,
        fontWeight: '700',
    },
    refreshTxtSecondary: {
        color: '#CBD5E1',
    },
    feedbackContainer: {
        width: '100%',
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.25)',
        borderRadius: 20,
        padding: 16,
        marginBottom: 24,
    },
    feedbackHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
    },
    feedbackTitle: {
        fontSize: 11,
        fontWeight: '900',
        color: '#EF4444',
        letterSpacing: 0.5,
    },
    feedbackBody: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FECACA',
        lineHeight: 20,
        marginBottom: 8,
    },
    feedbackHint: {
        fontSize: 12,
        color: '#94A3B8',
        lineHeight: 16,
    },
    actionsContainer: {
        width: '100%',
        gap: 12,
    },
    fixButton: {
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
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    fixButtonText: {
        color: '#FFF',
        fontSize: 15,
        fontWeight: '800',
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
