import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, StatusBar, Platform, AppState, AppStateStatus } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { orderService } from '../../services/orderService';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../utils/supabase';
import { JobOfferModal } from '../../components/JobOfferModal';
import { userService } from '../../services/userService';
import { DriverTier } from '../../types';

export const DriverJobsScreen = ({ navigation, route }: any) => {
    const { user } = useAuthStore();
    const [jobs, setJobs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isVerified, setIsVerified] = useState<boolean | null>(null);
    const [walletStatus, setWalletStatus] = useState<string>('active');
    const [walletBalance, setWalletBalance] = useState<number | null>(null);
    const [driverTier, setDriverTier] = useState<DriverTier>('standard');

    const isLockedOut = (walletBalance !== null && walletBalance <= 0.25) || walletStatus === 'locked';
    const [currentTime, setCurrentTime] = useState(Date.now());
    const [selectedJob, setSelectedJob] = useState<any>(null);
    const [offerModalVisible, setOfferModalVisible] = useState(false);
    const [acceptingId, setAcceptingId] = useState<string | null>(null);
    const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
    const [declinedJobIds, setDeclinedJobIds] = useState<string[]>([]);
    const activeChannelRef = useRef<any>(null);

    // Deep link or notification target: focus and open offer sheet for target job
    useEffect(() => {
        const targetOrderId = route?.params?.orderId;
        if (targetOrderId && jobs.length > 0) {
            const targetJob = jobs.find(j => j.id === targetOrderId);
            if (targetJob) {
                setExpandedJobId(targetOrderId);
                setSelectedJob(targetJob);
                setOfferModalVisible(true);
            }
        }
    }, [route?.params?.orderId, jobs]);

    useEffect(() => {
        if (activeChannelRef.current) {
            supabase.removeChannel(activeChannelRef.current);
            activeChannelRef.current = null;
        }

        const activeViewingJobId = offerModalVisible && selectedJob ? selectedJob.id : expandedJobId;

        if (activeViewingJobId && user) {
            const channel = supabase.channel(`order_viewers:${activeViewingJobId}`);
            activeChannelRef.current = channel;

            channel.subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.track({
                        user: {
                            id: user.id,
                            full_name: user.user_metadata?.full_name || user.email || 'Courier'
                        }
                    });
                }
            });
        }

        return () => {
            if (activeChannelRef.current) {
                supabase.removeChannel(activeChannelRef.current);
            }
        };
    }, [expandedJobId, offerModalVisible, selectedJob, user]);

    const checkVerificationStatus = async () => {
        try {
            const { data, error } = await supabase
                .from('drivers')
                .select('is_identity_verified, last_verification_at')
                .eq('id', user?.id)
                .single();

            if (error) throw error;
            
            // For now we trust the boolean, but we could also check if last_verification_at was today
            setIsVerified(data.is_identity_verified);
        } catch (error) {
            console.error('Error checking verification:', error);
            setIsVerified(false);
        }
    };

    const checkWalletStatus = async () => {
        if (!user) return;
        try {
            const walletData = await userService.getCourierWallet(user.id);
            if (walletData) {
                const bal = typeof walletData.balance === 'number' ? walletData.balance : parseFloat(walletData.balance || 0);
                setWalletStatus(walletData.status);
                setWalletBalance(bal);
            }
        } catch (error) {
            console.error('Error checking wallet status:', error);
        }
    };

    // AppState listener: re-verify wallet float on app resume / returning to foreground
    useEffect(() => {
        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            if (nextAppState === 'active') {
                checkWalletStatus();
            }
        };
        const subscription = AppState.addEventListener('change', handleAppStateChange);
        return () => {
            subscription.remove();
        };
    }, [user?.id]);

    // Real-time listener for courier wallet status changes
    useEffect(() => {
        if (!user) return;
        const walletChannel = supabase
            .channel(`public:jobs_courier_wallet_${user.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'courier_wallets',
                filter: `courier_id=eq.${user.id}`
            }, (payload: any) => {
                if (payload.new) {
                    const newBal = typeof payload.new.balance === 'number' 
                        ? payload.new.balance 
                        : parseFloat(payload.new.balance || 0);
                    const newStat = payload.new.status;
                    setWalletBalance(newBal);
                    setWalletStatus(newStat);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(walletChannel);
        };
    }, [user?.id]);

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(Date.now());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const checkDriverTier = async (): Promise<DriverTier> => {
        if (!user) return 'standard';
        try {
            const tier = await userService.getDriverTier(user.id);
            setDriverTier(tier);
            return tier;
        } catch (error) {
            console.error('Error checking driver tier:', error);
            setDriverTier('standard');
            return 'standard';
        }
    };

    const fetchPendingJobs = async (tierOverride?: DriverTier) => {
        try {
            setLoading(true);
            const tier = tierOverride || driverTier;
            const data = await orderService.getAvailableJobs(tier);
            setJobs(data || []);
        } catch (error: any) {
            console.error('Error fetching jobs:', error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeclineJob = (jobId: string) => {
        setDeclinedJobIds(prev => [...prev, jobId]);
    };

    const handleAcceptDirectly = async (job: any) => {
        if (isLockedOut) {
            Alert.alert(
                'Wallet Locked Out',
                `Your float balance is $${walletBalance !== null ? walletBalance.toFixed(2) : '0.00'}, which is at or below the $0.25 minimum threshold. Please top up your wallet via ClicknPay before accepting jobs.`,
                [
                    { text: 'Go to Wallet', onPress: () => navigation.navigate('Wallet') },
                    { text: 'Cancel', style: 'cancel' }
                ]
            );
            return;
        }
        try {
            setAcceptingId(job.id);
            // Assign the driver directly to this order
            const { data, error } = await supabase
                .from('orders')
                .update({
                    status: 'driver_assigned',
                    driver_id: user?.id,
                    updated_at: new Date().toISOString()
                })
                .eq('id', job.id)
                .select()
                .single();

            if (error) throw error;

            Alert.alert(
                "Job Accepted",
                "You have accepted this job! Please proceed to the pickup location.",
                [{ text: "Go to Active Job", onPress: () => navigation.navigate('ActiveJob') }]
            );
            fetchPendingJobs();
        } catch (error: any) {
            Alert.alert("Error", error.message);
        } finally {
            setAcceptingId(null);
        }
    };

    useEffect(() => {
        const loadScreenData = async () => {
            checkVerificationStatus();
            checkWalletStatus();
            const tier = await checkDriverTier();
            fetchPendingJobs(tier);
        };

        // Refresh when focused
        const unsubscribe = navigation.addListener('focus', () => {
            loadScreenData();
        });

        // Run initially
        loadScreenData();

        // Realtime subscription for incoming orders
        const channel = supabase
            .channel('public:orders')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                fetchPendingJobs();
            })
            .subscribe();

        return () => {
            unsubscribe();
            supabase.removeChannel(channel);
        };
    }, [navigation, user]);



    const renderJobCard = ({ item }: { item: any }) => {
        const isDelivery = item.service_type === 'delivery';
        const isExpanded = expandedJobId === item.id;
        const priorityWindowEnds = item.priority_window_ends_at ? new Date(item.priority_window_ends_at).getTime() : 0;
        const isPriorityActive = priorityWindowEnds > currentTime;
        const secondsRemaining = Math.max(0, Math.ceil((priorityWindowEnds - currentTime) / 1000));

        return (
            <BlurView intensity={40} tint="light" style={styles.cardContainer}>
                {isPriorityActive && (
                    <View style={styles.priorityPillContainer}>
                        <LinearGradient
                            colors={['#7C3AED', '#4F46E5']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.priorityPill}
                        >
                            <Text style={styles.priorityPillText}>
                                ⚡ PLATINUM EARLY ACCESS • {secondsRemaining}s LEFT
                            </Text>
                        </LinearGradient>
                    </View>
                )}

                <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setExpandedJobId(isExpanded ? null : item.id)}
                >
                    <View style={styles.cardHeader}>
                        <View style={styles.serviceTypeRow}>
                            <View style={[styles.iconContainer, { backgroundColor: isDelivery ? 'rgba(5, 95, 238, 0.1)' : 'rgba(66, 133, 244, 0.1)' }]}>
                                <Text style={styles.serviceIcon}>{isDelivery ? '📦' : '🛒'}</Text>
                            </View>
                            <Text style={styles.jobType}>
                                {isDelivery ? 'Package Delivery' : 'Errand'}
                            </Text>
                        </View>
                        <View style={styles.headerRight}>
                            <Text style={styles.earnings}>${item.estimated_cost?.toFixed(2) || '0.00'}</Text>
                            <Text style={styles.chevronIcon}>{isExpanded ? ' ▲' : ' ▼'}</Text>
                        </View>
                    </View>

                    {/* Distance and Payment Method Badges */}
                    <View style={styles.cardBadgeRow}>
                        <Text style={styles.distanceText}>📍 2.4 miles away</Text>
                        <View style={[
                            styles.jobPaymentBadge,
                            item.payment_method === 'cash_on_delivery' 
                                ? styles.jobPaymentBadgeCod 
                                : styles.jobPaymentBadgeDigital
                        ]}>
                            <Text style={[
                                styles.jobPaymentBadgeText,
                                item.payment_method === 'cash_on_delivery' 
                                    ? styles.jobPaymentBadgeTextCod 
                                    : styles.jobPaymentBadgeTextDigital
                            ]}>
                                {item.payment_method === 'cash_on_delivery' ? '💵 Cash' : '💳 Digital'}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.locationContainer}>
                        {isDelivery ? (
                            <>
                                <View style={styles.locationRow}>
                                    <View style={styles.timelineDot} />
                                    <Text style={styles.locationText} numberOfLines={1}>
                                        <Text style={styles.locationLabel}>Pickup: </Text>
                                        {item.pickup_address || 'No pickup specified'}
                                    </Text>
                                </View>
                                <View style={styles.timelineLine} />
                                <View style={styles.locationRow}>
                                    <View style={[styles.timelineDot, styles.timelineDotEnd]} />
                                    <Text style={styles.locationText} numberOfLines={1}>
                                        <Text style={styles.locationLabel}>Dropoff: </Text>
                                        {item.dropoff_address || 'No dropoff specified'}
                                    </Text>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={styles.locationRow}>
                                    <View style={styles.timelineDot} />
                                    <Text style={styles.locationText} numberOfLines={1}>
                                        <Text style={styles.locationLabel}>Store: </Text>
                                        {item.errand_location || 'Unknown store'}
                                    </Text>
                                </View>
                                <View style={styles.timelineLine} />
                                <View style={styles.locationRow}>
                                    <View style={[styles.timelineDot, styles.timelineDotEnd]} />
                                    <Text style={styles.locationText} numberOfLines={1}>
                                        <Text style={styles.locationLabel}>Dropoff: </Text>
                                        {item.dropoff_address || 'No delivery specified'}
                                    </Text>
                                </View>
                            </>
                        )}
                    </View>

                    {isExpanded && (
                        <View style={styles.expandedDetails}>
                            <View style={styles.expandedSeparator} />
                            <Text style={styles.detailsLabel}>
                                {isDelivery ? 'Package Details' : 'Errand Details / Shopping List'}
                            </Text>
                            <Text style={styles.detailsValue}>
                                {isDelivery 
                                    ? (item.package_description || 'No package description provided.') 
                                    : (item.errand_instructions || 'No shopping list or instructions provided.')}
                            </Text>
                            <View style={styles.viewingIndicatorRow}>
                                <Text style={styles.viewingIndicatorDot}>🟢</Text>
                                <Text style={styles.viewingIndicatorText}>
                                    Customer sees you are reviewing this offer
                                </Text>
                            </View>
                        </View>
                    )}
                </TouchableOpacity>

                <View style={[styles.actionRow, isExpanded ? { marginTop: 16 } : null]}>
                    <TouchableOpacity 
                        style={styles.rejectButton}
                        onPress={() => handleDeclineJob(item.id)}
                    >
                        <Text style={styles.rejectText}>Decline</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.bidButton}
                        onPress={() => {
                            setSelectedJob(item);
                            setOfferModalVisible(true);
                        }}
                    >
                        <Text style={styles.bidButtonText}>Place Bid</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.acceptButtonContainer}
                        activeOpacity={0.8}
                        onPress={() => handleAcceptDirectly(item)}
                        disabled={acceptingId === item.id}
                    >
                        <LinearGradient
                            colors={['#10B981', '#34D399']}
                            style={styles.acceptGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                        >
                            {acceptingId === item.id ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                                <Text style={styles.acceptText}>Accept</Text>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </BlurView>
        );
    };

    const visibleJobs = jobs.filter(job => !declinedJobIds.includes(job.id));

    const renderListHeader = () => {
        if (isVerified === false || isLockedOut) {
            return null;
        }

        if (driverTier === 'platinum') {
            return (
                <View style={styles.bannerOuterContainer}>
                    <LinearGradient
                        colors={['#7C3AED', '#4F46E5']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.platinumBanner}
                    >
                        <View style={styles.platinumBannerRow}>
                            <View style={styles.platinumIconCircle}>
                                <Text style={styles.platinumIconText}>🏆</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.platinumBannerTitle}>PLATINUM COURIER</Text>
                                <Text style={styles.platinumBannerSub}>30-second early priority access active for incoming requests.</Text>
                            </View>
                        </View>
                    </LinearGradient>
                </View>
            );
        }

        return (
            <View style={styles.bannerOuterContainer}>
                <View style={styles.tierPromoCard}>
                    <View style={styles.tierPromoIconCircle}>
                        <Text style={{ fontSize: 20 }}>⚡</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.tierPromoTitle}>Unlock 30s Early Job Access</Text>
                        <Text style={styles.tierPromoSub}>
                            Reach 50+ trips, 4.85★ rating, and 95% completion to earn Platinum Priority.
                        </Text>
                    </View>
                </View>
            </View>
        );
    };

    return (
        <LinearGradient
            colors={['#F8FAFC', '#E2E8F0']}
            style={styles.container}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
        >
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
            <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
                <View style={styles.header}>
                    <View>
                        <Text style={styles.headerTitle}>Available Jobs</Text>
                        <Text style={styles.headerSubtitle}>Swipe to refresh</Text>
                    </View>
                    <TouchableOpacity onPress={() => fetchPendingJobs()} style={styles.refreshButton}>
                        <Text style={styles.refreshText}>↻</Text>
                    </TouchableOpacity>
                </View>

                {renderListHeader()}

                {isVerified === false ? (
                    <View style={styles.centerContainer}>
                        <BlurView intensity={20} tint="light" style={styles.securityCard}>
                            <View style={styles.securityIconCircle}>
                                <Text style={{ fontSize: 32 }}>🛡️</Text>
                            </View>
                            <Text style={styles.securityTitle}>Identity Verification Required</Text>
                            <Text style={styles.securityText}>
                                To ensure the safety of our platform, please complete a quick selfie check before viewing available jobs.
                            </Text>
                            <TouchableOpacity 
                                style={styles.verifyBtnContainer}
                                onPress={() => navigation.navigate('SecurityCheck')}
                            >
                                <LinearGradient
                                    colors={['#055FEE', '#5B99F2']}
                                    style={styles.verifyBtn}
                                >
                                    <Text style={styles.verifyBtnText}>Start Security Check</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </BlurView>
                    </View>
                ) : isLockedOut ? (
                    <View style={styles.centerContainer}>
                        <BlurView intensity={20} tint="light" style={styles.securityCard}>
                            <View style={styles.securityIconCircle}>
                                <Text style={{ fontSize: 32 }}>🔒</Text>
                            </View>
                            <Text style={styles.securityTitle}>Wallet Locked Out</Text>
                            <Text style={styles.securityText}>
                                Your float balance is below $0.25 (${walletBalance !== null ? walletBalance.toFixed(2) : '0.00'}). Please top up your wallet with ClicknPay to resume accepting new delivery jobs.
                            </Text>
                            <TouchableOpacity 
                                style={styles.verifyBtnContainer}
                                onPress={() => navigation.navigate('Wallet')}
                            >
                                <LinearGradient
                                    colors={['#055FEE', '#5B99F2']}
                                    style={styles.verifyBtn}
                                >
                                    <Text style={styles.verifyBtnText}>Top Up via ClicknPay</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </BlurView>
                    </View>
                ) : loading ? (
                    <View style={styles.centerContainer}>
                        <ActivityIndicator size="large" color="#055FEE" />
                    </View>
                ) : visibleJobs.length === 0 ? (
                    <View style={styles.centerContainer}>
                        <View style={styles.emptyIconCircle}>
                            <Text style={{ fontSize: 32 }}>🔍</Text>
                        </View>
                        <Text style={styles.emptyTitle}>No Jobs Available</Text>
                        <Text style={styles.emptyText}>There are no pending requests right now. Hang tight!</Text>
                    </View>
                ) : (
                    <FlatList
                        data={visibleJobs}
                        keyExtractor={(item) => item.id}
                        renderItem={renderJobCard}
                        contentContainerStyle={styles.listContainer}
                        showsVerticalScrollIndicator={false}
                        refreshing={loading}
                        onRefresh={fetchPendingJobs}
                    />
                )}

                <JobOfferModal
                    visible={offerModalVisible}
                    onClose={() => setOfferModalVisible(false)}
                    order={selectedJob}
                    onOfferSubmitted={fetchPendingJobs}
                />
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
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: Platform.OS === 'android' ? 20 : 10,
        paddingBottom: 16,
    },
    headerTitle: {
        fontSize: 32,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 16,
        color: '#64748B',
        marginTop: 4,
    },
    refreshButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    refreshText: {
        fontSize: 24,
        color: '#055FEE',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    emptyIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1E293B',
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 15,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 24,
        paddingHorizontal: 20,
    },
    listContainer: {
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    cardContainer: {
        borderRadius: 24,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.6)',
        backgroundColor: 'rgba(255,255,255,0.4)',
        overflow: 'hidden',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    serviceTypeRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    serviceIcon: {
        fontSize: 20,
    },
    jobType: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1E293B',
    },
    earnings: {
        fontSize: 22,
        fontWeight: '800',
        color: '#055FEE',
    },
    distanceText: {
        fontSize: 14,
        color: '#64748B',
        fontWeight: '500',
        marginBottom: 16,
    },
    locationContainer: {
        backgroundColor: 'rgba(255,255,255,0.6)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
    },
    locationRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    timelineDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#3B82F6',
        marginRight: 12,
    },
    timelineDotEnd: {
        backgroundColor: '#10B981',
    },
    timelineLine: {
        width: 2,
        height: 16,
        backgroundColor: '#CBD5E1',
        marginLeft: 4,
        marginVertical: 4,
    },
    locationText: {
        flex: 1,
        fontSize: 14,
        color: '#334155',
        fontWeight: '500',
    },
    locationLabel: {
        color: '#64748B',
        fontWeight: '400',
    },
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
    },
    rejectButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.6)',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
    },
    rejectText: {
        color: '#64748B',
        fontWeight: '700',
        fontSize: 15,
    },
    acceptButtonContainer: {
        flex: 1.5,
        borderRadius: 14,
        overflow: 'hidden',
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    bidButton: {
        flex: 1.5,
        paddingVertical: 14,
        borderRadius: 14,
        backgroundColor: 'rgba(5, 95, 238, 0.08)',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(5, 95, 238, 0.15)',
    },
    bidButtonText: {
        color: '#055FEE',
        fontWeight: '700',
        fontSize: 15,
    },
    acceptGradient: {
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    acceptText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 16,
        letterSpacing: 0.5,
    },
    securityCard: {
        borderRadius: 32,
        padding: 32,
        width: '100%',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(176, 106, 40, 0.3)',
        backgroundColor: 'rgba(255,255,255,0.4)',
        overflow: 'hidden',
    },
    securityIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(5, 95, 238, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    securityTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#0F172A',
        textAlign: 'center',
        marginBottom: 12,
    },
    securityText: {
        fontSize: 15,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 24,
    },
    verifyBtnContainer: {
        width: '100%',
        borderRadius: 16,
        overflow: 'hidden',
    },
    verifyBtn: {
        paddingVertical: 16,
        alignItems: 'center',
    },
    verifyBtnText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    chevronIcon: {
        fontSize: 14,
        color: '#64748B',
        marginLeft: 6,
    },
    expandedDetails: {
        backgroundColor: 'rgba(255, 255, 255, 0.4)',
        borderRadius: 16,
        padding: 16,
        marginTop: 4,
    },
    expandedSeparator: {
        height: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
        marginBottom: 12,
    },
    detailsLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: '#64748B',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    detailsValue: {
        fontSize: 14,
        color: '#1E293B',
        fontWeight: '500',
        lineHeight: 20,
        marginBottom: 12,
    },
    viewingIndicatorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(5, 95, 238, 0.08)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
    },
    viewingIndicatorDot: {
        fontSize: 8,
        marginRight: 8,
    },
    viewingIndicatorText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#5B99F2',
    },
    bannerOuterContainer: {
        paddingHorizontal: 24,
        marginBottom: 12,
    },
    platinumBanner: {
        borderRadius: 16,
        padding: 14,
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 4,
    },
    platinumBannerRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    platinumIconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    platinumIconText: {
        fontSize: 18,
    },
    platinumBannerTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 0.5,
    },
    platinumBannerSub: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.85)',
        marginTop: 2,
    },
    tierPromoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: 16,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(203, 213, 225, 0.8)',
    },
    tierPromoIconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    tierPromoTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#0F172A',
    },
    tierPromoSub: {
        fontSize: 11,
        color: '#64748B',
        marginTop: 2,
    },
    priorityPillContainer: {
        marginBottom: 10,
        borderRadius: 12,
        overflow: 'hidden',
    },
    priorityPill: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    priorityPillText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    // Card Badge & Payment Styles
    cardBadgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    jobPaymentBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    jobPaymentBadgeCod: {
        backgroundColor: '#FEF3C7',
        borderWidth: 1,
        borderColor: '#F59E0B',
    },
    jobPaymentBadgeDigital: {
        backgroundColor: '#ECFDF5',
        borderWidth: 1,
        borderColor: '#10B981',
    },
    jobPaymentBadgeText: {
        fontSize: 11,
        fontWeight: '800',
    },
    jobPaymentBadgeTextCod: {
        color: '#B45309',
    },
    jobPaymentBadgeTextDigital: {
        color: '#065F46',
    },
});
