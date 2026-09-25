import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

export const CourierRequirementsScreen = ({ navigation }: any) => {
    const insets = useSafeAreaInsets();
    const requirements = [
        {
            icon: 'card-outline',
            title: 'National Identity Document',
            desc: 'Valid Zimbabwean metal or plastic National ID card. You will need clear photos of both the front and back.',
            badge: 'Required',
            badgeColor: '#3B82F6',
        },
        {
            icon: 'car-sport-outline',
            title: "Driver's License",
            desc: "Valid Class 2 or Class 4 driver's license matching your delivery vehicle. Both front and back photos required.",
            badge: 'Required',
            badgeColor: '#3B82F6',
        },
        {
            icon: 'camera-outline',
            title: 'Vehicle Details & 4-Angle Photos',
            desc: 'Make, model, year, license plate, and 4 exterior inspection photos (Front, Rear, Left, and Right profiles).',
            badge: 'Required',
            badgeColor: '#3B82F6',
        },
        {
            icon: 'chatbubbles-outline',
            title: 'Quick AI Pre-Screening Chat',
            desc: 'A 2-minute, 5-question automated chat about your experience, delivery corridors, and parcel safety handling.',
            badge: '2 Mins',
            badgeColor: '#10B981',
        },
    ];

    return (
        <LinearGradient
            colors={['#0F2027', '#203A43', '#2C5364']}
            style={styles.container}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
        >
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
            <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
                <ScrollView 
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 + insets.bottom }]} 
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.fleetBadge}>
                            <Ionicons name="shield-checkmark" size={14} color="#38BDF8" style={{ marginRight: 6 }} />
                            <Text style={styles.fleetBadgeText}>COURIER FLEET ONBOARDING</Text>
                        </View>
                        <Text style={styles.title}>Approval Requirements</Text>
                        <Text style={styles.subtitle}>
                            Welcome to ShipMate! Review the checklist below before starting your application to get approved quickly.
                        </Text>
                    </View>

                    {/* Turnaround Time Banner */}
                    <BlurView intensity={20} tint="light" style={styles.turnaroundCard}>
                        <View style={styles.turnaroundIconCircle}>
                            <Ionicons name="flash" size={22} color="#F59E0B" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.turnaroundTitle}>Fast 24-Hour Review</Text>
                            <Text style={styles.turnaroundDesc}>
                                Applications with clear photos and valid documents are typically reviewed and approved within 24 hours.
                            </Text>
                        </View>
                    </BlurView>

                    {/* Requirements List */}
                    <View style={styles.requirementsList}>
                        <Text style={styles.sectionHeaderTitle}>REQUIRED DOCUMENTATION</Text>

                        {requirements.map((req, idx) => (
                            <BlurView key={idx} intensity={25} tint="light" style={styles.reqCard}>
                                <View style={styles.reqCardHeader}>
                                    <View style={styles.iconCircle}>
                                        <Ionicons name={req.icon as any} size={22} color="#38BDF8" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <View style={styles.reqTitleRow}>
                                            <Text style={styles.reqTitle}>{req.title}</Text>
                                            <View style={[styles.reqBadge, { backgroundColor: `${req.badgeColor}25`, borderColor: `${req.badgeColor}50` }]}>
                                                <Text style={[styles.reqBadgeText, { color: req.badgeColor }]}>{req.badge}</Text>
                                            </View>
                                        </View>
                                        <Text style={styles.reqDesc}>{req.desc}</Text>
                                    </View>
                                </View>
                            </BlurView>
                        ))}
                    </View>

                    {/* Preparation Tips */}
                    <BlurView intensity={15} tint="light" style={styles.tipsCard}>
                        <View style={styles.tipRow}>
                            <Ionicons name="sunny-outline" size={18} color="#FBBF24" style={{ marginRight: 8, marginTop: 2 }} />
                            <Text style={styles.tipText}>Take photos in a well-lit area without camera glare or blurry text.</Text>
                        </View>
                        <View style={styles.tipRow}>
                            <Ionicons name="document-text-outline" size={18} color="#38BDF8" style={{ marginRight: 8, marginTop: 2 }} />
                            <Text style={styles.tipText}>Make sure all four corners of your ID and license are clearly visible.</Text>
                        </View>
                        <View style={styles.tipRow}>
                            <Ionicons name="shield-outline" size={18} color="#34D399" style={{ marginRight: 8, marginTop: 2 }} />
                            <Text style={styles.tipText}>Your documents are encrypted and kept strictly confidential.</Text>
                        </View>
                    </BlurView>
                </ScrollView>

                {/* Bottom Sticky Action Button */}
                <View style={[styles.footerContainer, { paddingBottom: Math.max(insets.bottom + 12, 16) }]}>
                    <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => navigation.navigate('PersonalDetails')}
                        activeOpacity={0.85}
                    >
                        <LinearGradient
                            colors={['#055FEE', '#5B99F2']}
                            style={styles.actionGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                        >
                            <Text style={styles.actionBtnText}>Begin Application</Text>
                            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" style={{ marginLeft: 8 }} />
                        </LinearGradient>
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
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 40 : 16,
        paddingBottom: 100,
    },
    header: {
        marginBottom: 20,
    },
    fleetBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(56, 189, 248, 0.15)',
        borderColor: 'rgba(56, 189, 248, 0.35)',
        borderWidth: 1,
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 20,
        marginBottom: 12,
    },
    fleetBadgeText: {
        color: '#38BDF8',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: -0.5,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        color: '#94A3B8',
        lineHeight: 20,
    },
    turnaroundCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderColor: 'rgba(245, 158, 11, 0.3)',
        borderWidth: 1,
        borderRadius: 20,
        padding: 16,
        marginBottom: 24,
        overflow: 'hidden',
    },
    turnaroundIconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(245, 158, 11, 0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    turnaroundTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#FCD34D',
        marginBottom: 2,
    },
    turnaroundDesc: {
        fontSize: 12,
        color: '#E2E8F0',
        lineHeight: 17,
    },
    requirementsList: {
        marginBottom: 20,
    },
    sectionHeaderTitle: {
        fontSize: 11,
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 1,
        marginBottom: 12,
        marginLeft: 4,
    },
    reqCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderColor: 'rgba(255, 255, 255, 0.09)',
        borderWidth: 1,
        borderRadius: 20,
        padding: 16,
        marginBottom: 12,
        overflow: 'hidden',
    },
    reqCardHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    iconCircle: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: 'rgba(56, 189, 248, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
        marginTop: 2,
    },
    reqTitleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    reqTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#FFFFFF',
        flex: 1,
        marginRight: 8,
    },
    reqBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
        borderWidth: 1,
    },
    reqBadgeText: {
        fontSize: 10,
        fontWeight: '800',
    },
    reqDesc: {
        fontSize: 12,
        color: '#94A3B8',
        lineHeight: 18,
    },
    tipsCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderColor: 'rgba(255, 255, 255, 0.06)',
        borderWidth: 1,
        borderRadius: 18,
        padding: 16,
        marginBottom: 16,
        overflow: 'hidden',
        gap: 10,
    },
    tipRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    tipText: {
        color: '#CBD5E1',
        fontSize: 12,
        lineHeight: 17,
        flex: 1,
    },
    footerContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 20,
        paddingBottom: 16,
        paddingTop: 12,
        backgroundColor: 'rgba(15, 32, 39, 0.95)',
        borderTopWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    actionBtn: {
        borderRadius: 18,
        overflow: 'hidden',
        shadowColor: '#055FEE',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 8,
    },
    actionGradient: {
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionBtnText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '800',
    },
});
