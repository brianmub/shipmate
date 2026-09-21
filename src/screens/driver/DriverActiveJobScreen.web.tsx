import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, StatusBar, Platform, Linking, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { supabase } from '../../utils/supabase';
import { useAuthStore } from '../../store/authStore';
import { orderService } from '../../services/orderService';
import { chatService } from '../../services/chatService';
import { ProofOfDeliveryModal } from '../../components/ProofOfDeliveryModal';
import { InAppCallModal } from '../../components/InAppCallModal';
import { OrderStatus, OrderReleaseReason, MaskedCallLog } from '../../types';

export const DriverActiveJobScreen = ({ navigation }: any) => {
    const { user } = useAuthStore();
    const [activeJob, setActiveJob] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [driverLocation, setDriverLocation] = useState<Location.LocationObject | null>(null);
    const [podVisible, setPodVisible] = useState(false);
    const [inAppCallVisible, setInAppCallVisible] = useState(false);
    const [pingingGate, setPingingGate] = useState(false);
    const [unreadChatCount, setUnreadChatCount] = useState(0);
    const locationSubscription = useRef<Location.LocationSubscription | null>(null);

    // Handover PIN (OTP) Confirmation States
    const [pinModalVisible, setPinModalVisible] = useState(false);
    const [enteredPin, setEnteredPin] = useState('');
    const [verifyingPin, setVerifyingPin] = useState(false);
    const [pinError, setPinError] = useState<string | null>(null);

    // Release & Anti-Abuse States
    const [releaseModalVisible, setReleaseModalVisible] = useState(false);
    const [releaseReason, setReleaseReason] = useState<OrderReleaseReason>('mechanical_issue');
    const [releasing, setReleasing] = useState(false);
    const [timerSecondsLeft, setTimerSecondsLeft] = useState<number | null>(null);
    const [startingTimer, setStartingTimer] = useState(false);
    const [callAttempts, setCallAttempts] = useState<MaskedCallLog[]>([]);
    const [lastCallTimestamp, setLastCallTimestamp] = useState<number | null>(null);
    const [secondsUntilNextCallAllowed, setSecondsUntilNextCallAllowed] = useState<number>(0);
    const [proposedCompensation, setProposedCompensation] = useState<string>('0.50');

    const fetchActiveJob = async () => {
        if (!user) return;
        try {
            setLoading(true);
            const data = await orderService.getActiveDriverJob(user.id);
            setActiveJob(data || null);
        } catch (error: any) {
            console.error('Error fetching active job:', error.message);
        } finally {
            setLoading(false);
        }
    };

    // Location tracking on web browsers
    const startLocationTracking = async (jobId: string) => {
        try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                console.warn('Web location permission denied');
                return;
            }

            locationSubscription.current = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.Balanced,
                    timeInterval: 10000,
                    distanceInterval: 10,
                },
                async (location) => {
                    setDriverLocation(location);
                    await supabase
                        .from('orders')
                        .update({
                            driver_latitude: location.coords.latitude,
                            driver_longitude: location.coords.longitude,
                        })
                        .eq('id', jobId);
                }
            );
        } catch (e) {
            console.error("Location tracking error on web:", e);
        }
    };

    const stopLocationTracking = () => {
        if (locationSubscription.current) {
            locationSubscription.current.remove();
            locationSubscription.current = null;
        }
    };

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            fetchActiveJob();
        });

        const channel = supabase
            .channel('public:driver_active_job_web')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `driver_id=eq.${user?.id}` }, () => {
                fetchActiveJob();
            })
            .subscribe();

        return () => {
            unsubscribe();
            stopLocationTracking();
            supabase.removeChannel(channel);
        };
    }, [user, navigation]);

    useEffect(() => {
        if (activeJob) {
            startLocationTracking(activeJob.id);
            fetchCallAttempts(activeJob.id);
        } else {
            stopLocationTracking();
        }
    }, [activeJob?.id]);

    const fetchCallAttempts = async (jobId: string) => {
        if (!user?.id) return;
        try {
            const logs = await orderService.getOrderCallAttempts(jobId, user.id);
            setCallAttempts(logs);
            if (logs.length > 0) {
                const latest = new Date(logs[logs.length - 1].created_at).getTime();
                setLastCallTimestamp(latest);
            }
        } catch (err) {
            console.warn('Error fetching call attempts on web:', err);
        }
    };

    // 5-Minute Arrival Countdown Timer Effect (Push Alert Only; Zero SMS/WhatsApp)
    useEffect(() => {
        if (!activeJob?.arrival_timer_started_at) {
            setTimerSecondsLeft(null);
            return;
        }

        const startTime = new Date(activeJob.arrival_timer_started_at).getTime();
        const updateTimer = () => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const remaining = Math.max(0, 300 - elapsed);
            setTimerSecondsLeft(remaining);
        };
        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [activeJob?.arrival_timer_started_at]);

    // Anti-Abuse: 1-Minute Spacing Constraint Tracker
    useEffect(() => {
        if (!lastCallTimestamp) {
            setSecondsUntilNextCallAllowed(0);
            return;
        }
        const checkSpacing = () => {
            const elapsed = Math.floor((Date.now() - lastCallTimestamp) / 1000);
            const waitTime = Math.max(0, 60 - elapsed);
            setSecondsUntilNextCallAllowed(waitTime);
        };
        checkSpacing();
        const interval = setInterval(checkSpacing, 1000);
        return () => clearInterval(interval);
    }, [lastCallTimestamp]);

    const formatTimer = (seconds: number | null) => {
        if (seconds === null) return '05:00';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleStartArrivalTimer = async () => {
        if (!activeJob?.id || !user?.id) return;
        setStartingTimer(true);
        try {
            await orderService.startArrivalTimer(activeJob.id, user.id);
            Alert.alert(
                '5-Minute Timer Started',
                'Your customer was notified via in-app push notification. The 5-minute arrival waiting countdown is active.'
            );
            fetchActiveJob();
        } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to start arrival waiting timer.');
        } finally {
            setStartingTimer(false);
        }
    };

    const handleMakeMaskedCall = () => {
        if (!activeJob || !user) return;
        if (secondsUntilNextCallAllowed > 0) {
            Alert.alert(
                'Spacing Rule Active',
                `Anti-abuse protocol requires waiting at least 1 minute between call attempts. Please wait ${secondsUntilNextCallAllowed}s.`
            );
            return;
        }
        setInAppCallVisible(true);
    };

    const handleReleaseJob = async () => {
        if (!activeJob || !user) return;
        setReleasing(true);
        try {
            const comp = parseFloat(proposedCompensation) || 0;
            const latestCallId = callAttempts.length > 0 ? callAttempts[callAttempts.length - 1].id : null;
            await orderService.releaseOrderByDriver(activeJob.id, user.id, releaseReason, latestCallId, comp);
            setReleaseModalVisible(false);
            stopLocationTracking();
            setActiveJob(null);
            Alert.alert('Job Released', 'This order has been released and prioritized for other couriers.');
            navigation.navigate('Jobs');
        } catch (err: any) {
            Alert.alert('Release Error', err?.message || 'Failed to release job.');
        } finally {
            setReleasing(false);
        }
    };

    const getNextStatus = (currentStatus: OrderStatus): OrderStatus | null => {
        const flow: OrderStatus[] = [
            'driver_assigned',
            'en_route_to_pickup',
            'arrived_at_pickup',
            'picked_up',
            'en_route_to_delivery',
            'arrived_at_delivery',
            'delivered'
        ];
        const currentIndex = flow.indexOf(currentStatus);
        if (currentIndex !== -1 && currentIndex < flow.length - 1) {
            return flow[currentIndex + 1];
        }
        return null;
    };

    const getButtonText = (status: OrderStatus) => {
        switch (status) {
            case 'driver_assigned': return 'Start En Route to Pickup';
            case 'en_route_to_pickup': return 'Arrived at Pickup';
            case 'arrived_at_pickup': return 'Package Collected';
            case 'picked_up': return 'Start En Route to Delivery';
            case 'en_route_to_delivery': return 'Arrived at Delivery';
            case 'arrived_at_delivery': 
                return (activeJob?.pin_locked || activeJob?.pin_fallback_to_photo)
                    ? 'Complete via Photo Proof (PIN Locked)'
                    : 'Enter Handover PIN';
            default: return 'Next Step';
        }
    };

    const handleVerifyPin = async () => {
        if (!activeJob || !user) return;
        if (enteredPin.length !== 4) {
            setPinError('Please enter the full 4-digit PIN.');
            return;
        }

        try {
            setVerifyingPin(true);
            setPinError(null);

            const result = await orderService.verifyHandoverPin(activeJob.id, user.id, enteredPin);

            if (result.success) {
                setPinModalVisible(false);
                Alert.alert("Delivery Confirmed! 🎉", "Handover PIN verified successfully. This delivery is complete!");
                stopLocationTracking();
                setActiveJob(null);
                navigation.navigate('Jobs');
                return;
            }

            if (result.locked || result.fallback_to_photo) {
                setPinModalVisible(false);
                Alert.alert(
                    "PIN Locked (3 Failed Attempts)",
                    "Maximum PIN attempts reached. This order has been flagged for review. Please complete handover using Photo Proof-of-Delivery.",
                    [
                        {
                            text: "Open Photo Proof",
                            onPress: () => setPodVisible(true)
                        }
                    ]
                );
                setActiveJob((prev: any) => prev ? { ...prev, pin_locked: true, pin_fallback_to_photo: true } : null);
            } else {
                const attemptsLeft = result.attempts_left !== undefined ? result.attempts_left : Math.max(0, 3 - ((activeJob.pin_attempts_count || 0) + 1));
                setPinError(`Incorrect PIN. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining.`);
                setActiveJob((prev: any) => prev ? { ...prev, pin_attempts_count: (prev.pin_attempts_count || 0) + 1 } : null);
            }
        } catch (error: any) {
            setPinError(error?.message || 'Verification error. Please try again.');
        } finally {
            setVerifyingPin(false);
        }
    };

    const handlePodComplete = async (proof: { signatureUrl: string; photoUrl: string }) => {
        try {
            setLoading(true);
            await orderService.completeOrderWithProof(activeJob.id, proof.signatureUrl, proof.photoUrl);
            setPodVisible(false);
            Alert.alert("Job Completed!", "Great work! You have completed this delivery.");
            stopLocationTracking();
            setActiveJob(null);
            navigation.navigate('Jobs');
        } catch (error: any) {
            Alert.alert("Error", error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleNextStep = async () => {
        if (!activeJob) return;

        const nextStatus = getNextStatus(activeJob.status);
        if (activeJob.status === 'arrived_at_delivery') {
            if (activeJob.pin_locked || activeJob.pin_fallback_to_photo) {
                setPodVisible(true);
            } else {
                setEnteredPin('');
                setPinError(null);
                setPinModalVisible(true);
            }
            return;
        }

        if (nextStatus) {
            try {
                setLoading(true);
                await orderService.updateOrderStatus(activeJob.id, nextStatus);
            } catch (error: any) {
                Alert.alert("Error", error.message);
            } finally {
                setLoading(false);
            }
        }
    };

    // Load unread message count and subscribe to incoming customer messages
    useEffect(() => {
        if (!activeJob?.id || !user?.id) {
            setUnreadChatCount(0);
            return;
        }

        const fetchUnread = async () => {
            const count = await chatService.getUnreadCount(activeJob.id, user.id);
            setUnreadChatCount(count);
        };
        fetchUnread();

        const msgChannel = supabase
            .channel(`driver_job_chat_web_${activeJob.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'order_messages',
                filter: `order_id=eq.${activeJob.id}`
            }, (payload) => {
                if (payload.new && payload.new.sender_id !== user.id) {
                    setUnreadChatCount((prev) => prev + 1);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(msgChannel);
        };
    }, [activeJob?.id, user?.id]);

    const handleCompleteJob = async () => {
        if (!activeJob) return;
        try {
            setLoading(true);
            const { error } = await supabase
                .from('orders')
                .update({ status: 'delivered' })
                .eq('id', activeJob.id);

            if (error) throw error;
            Alert.alert("Job Completed!", "Great work! You have completed this delivery.");
            stopLocationTracking();
            setActiveJob(null);
            navigation.navigate('Jobs');
        } catch (error: any) {
            Alert.alert("Error", error.message);
        } finally {
            setLoading(false);
        }
    };

    const openNativeNavigation = (
        lat: number | string | null | undefined, 
        lng: number | string | null | undefined, 
        address?: string | null
    ) => {
        if (!lat || !lng || isNaN(parseFloat(lat as string))) {
            if (address) {
                const query = encodeURIComponent(address);
                Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
            } else {
                Alert.alert('Coordinates Missing', 'Location coordinates are not available for turn-by-turn navigation.');
            }
            return;
        }

        const latitude = parseFloat(lat as string);
        const longitude = parseFloat(lng as string);
        const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
        Linking.openURL(url);
    };

    if (loading && !activeJob) {
        return (
            <LinearGradient colors={['#F8FAFC', '#E2E8F0']} style={styles.safeArea}>
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#055FEE" />
                </View>
            </LinearGradient>
        );
    }

    if (!activeJob) {
        return (
            <LinearGradient colors={['#F8FAFC', '#E2E8F0']} style={styles.safeArea}>
                <View style={styles.centerContainer}>
                    <View style={styles.emptyIconCircle}>
                        <Text style={{ fontSize: 32 }}>💤</Text>
                    </View>
                    <Text style={styles.emptyTitle}>No Active Jobs</Text>
                    <Text style={styles.emptyText}>You don't have any ongoing deliveries right now.</Text>
                    <TouchableOpacity
                        style={styles.navigateButtonContainer}
                        activeOpacity={0.8}
                        onPress={() => navigation.navigate('Jobs')}
                    >
                        <LinearGradient
                            colors={['#055FEE', '#5B99F2']}
                            style={styles.navigateGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                        >
                            <Text style={styles.navigateButtonText}>Find Jobs</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </LinearGradient>
        );
    }

    const isDelivery = activeJob.service_type === 'delivery';

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />
            
            <View style={styles.mapPlaceholder}>
                <View style={styles.placeholderContent}>
                    <Text style={styles.placeholderEmoji}>🗺️</Text>
                    <Text style={styles.placeholderTitle}>Interactive Maps Unavailable on Web</Text>
                    <Text style={styles.placeholderText}>
                        Tracking is fully supported on our mobile app.
                    </Text>
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>Web Preview Mode</Text>
                    </View>
                </View>
            </View>

            <View style={styles.headerOverlay}>
                <BlurView intensity={40} tint="light" style={styles.headerBlur}>
                    <SafeAreaView edges={['top']}>
                        <View style={styles.headerContent}>
                            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                                <Text style={styles.backTxt}>← Back</Text>
                            </TouchableOpacity>
                            <Text style={styles.headerText}>Active Order</Text>
                            <View style={{ width: 60 }} />
                        </View>
                    </SafeAreaView>
                </BlurView>
            </View>

            <View style={styles.bottomOverlay}>
                <BlurView intensity={50} tint="light" style={styles.jobDetailsPanel}>
                    <SafeAreaView edges={['bottom']}>
                        <View style={styles.dragHandle} />

                        <View style={styles.titleRow}>
                            <View style={[styles.iconContainer, { backgroundColor: isDelivery ? 'rgba(5, 95, 238, 0.1)' : 'rgba(66, 133, 244, 0.1)' }]}>
                                <Text style={styles.serviceIcon}>{isDelivery ? '📦' : '🛒'}</Text>
                            </View>
                            <Text style={styles.jobType}>Current {isDelivery ? 'Delivery' : 'Errand'}</Text>
                        </View>

                        <View style={styles.locationContainer}>
                            <View style={styles.locationRow}>
                                <View style={styles.timelineDot} />
                                <View style={styles.locationInfoWrap}>
                                    <Text style={styles.locationText} numberOfLines={2}>
                                        <Text style={styles.locationLabel}>From: </Text>
                                        {activeJob.pickup_address || activeJob.errand_location || 'Pickup Location'}
                                    </Text>
                                </View>
                                <TouchableOpacity 
                                    style={styles.navChip}
                                    activeOpacity={0.7}
                                    onPress={() => openNativeNavigation(activeJob.pickup_latitude, activeJob.pickup_longitude, activeJob.pickup_address || activeJob.errand_location)}
                                >
                                    <Text style={styles.navChipText}>🧭 Nav</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.timelineLine} />
                            <View style={styles.locationRow}>
                                <View style={[styles.timelineDot, styles.timelineDotEnd]} />
                                <View style={styles.locationInfoWrap}>
                                    <Text style={styles.locationText} numberOfLines={2}>
                                        <Text style={styles.locationLabel}>To: </Text>
                                        {activeJob.dropoff_address || 'Dropoff Location'}
                                    </Text>
                                </View>
                                <TouchableOpacity 
                                    style={styles.navChip}
                                    activeOpacity={0.7}
                                    onPress={() => openNativeNavigation(activeJob.dropoff_latitude, activeJob.dropoff_longitude, activeJob.dropoff_address)}
                                >
                                    <Text style={styles.navChipText}>🧭 Nav</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Driver Payment Directive Banner */}
                        <View style={[
                            styles.driverDirectiveBanner,
                            activeJob.payment_method === 'cash_on_delivery' 
                                ? styles.driverDirectiveBannerCod 
                                : styles.driverDirectiveBannerDigital
                        ]}>
                            <Text style={styles.driverDirectiveIcon}>
                                {activeJob.payment_method === 'cash_on_delivery' ? '💵' : '✅'}
                            </Text>
                            <View style={styles.driverDirectiveTextWrap}>
                                <Text style={[
                                    styles.driverDirectiveTitle,
                                    activeJob.payment_method === 'cash_on_delivery' 
                                        ? styles.driverDirectiveTitleCod 
                                        : styles.driverDirectiveTitleDigital
                                ]}>
                                    {activeJob.payment_method === 'cash_on_delivery'
                                        ? `COLLECT CASH: $${parseFloat(activeJob.cash_to_collect || activeJob.estimated_cost || 0).toFixed(2)} USD`
                                        : `PAID DIGITALLY (${(activeJob.payment_method || 'DIGITAL').toUpperCase()})`}
                                </Text>
                                <Text style={styles.driverDirectiveSubtitle}>
                                    {activeJob.payment_method === 'cash_on_delivery'
                                        ? 'Collect physical cash from customer upon delivery. Platform commission will be deducted from your float.'
                                        : 'DO NOT collect cash from customer. Net earnings will be credited directly to your ShipMate Wallet.'}
                                </Text>
                            </View>
                        </View>

                        {/* Customer Info Card */}
                        <View style={styles.customerInfoCard}>
                            <View style={styles.customerAvatar}>
                                <Text style={styles.customerAvatarText}>
                                    {activeJob.customer?.full_name?.charAt(0).toUpperCase() || 'C'}
                                </Text>
                            </View>
                            <View style={styles.customerDetails}>
                                <Text style={styles.customerNameLabel}>Customer</Text>
                                <Text style={styles.customerName}>{activeJob.customer?.full_name || 'Customer'}</Text>
                            </View>
                            <View style={styles.communicationButtons}>
                                <TouchableOpacity 
                                    style={styles.contactBtn}
                                    onPress={() => setInAppCallVisible(true)}
                                >
                                    <Text style={styles.contactIcon}>📞</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    style={[styles.contactBtn, styles.chatBtn]}
                                    onPress={() => {
                                        setUnreadChatCount(0);
                                        navigation.navigate('Chat', { 
                                            orderId: activeJob.id, 
                                            recipientName: activeJob.customer?.full_name || 'Customer', 
                                            recipientPhone: activeJob.customer?.phone 
                                        });
                                    }}
                                >
                                    <Text style={styles.contactIcon}>💬</Text>
                                    {unreadChatCount > 0 && (
                                        <View style={styles.unreadBadge}>
                                            <Text style={styles.unreadBadgeText}>
                                                {unreadChatCount > 9 ? '9+' : unreadChatCount}
                                            </Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Recipient Drop-off Card (if specified) */}
                        {(activeJob.recipient_name || activeJob.recipient_phone || activeJob.recipient_notes) && (
                            <View style={styles.recipientJobCard}>
                                <View style={styles.recipientJobHeader}>
                                    <View style={styles.recipientJobHeaderLeft}>
                                        <Text style={styles.recipientJobHeaderIcon}>👤</Text>
                                        <Text style={styles.recipientJobHeaderTitle}>Drop-off Recipient</Text>
                                    </View>
                                    {activeJob.sms_notifications_enabled ? (
                                        <View style={styles.smsActiveBadge}>
                                            <Text style={styles.smsActiveBadgeText}>📲 Paid SMS Active</Text>
                                        </View>
                                    ) : (
                                        <View style={styles.smsInactiveBadge}>
                                            <Text style={styles.smsInactiveBadgeText}>Free App Tracking</Text>
                                        </View>
                                    )}
                                </View>

                                <View style={styles.recipientJobBody}>
                                    <Text style={styles.recipientJobName}>
                                        {activeJob.recipient_name || 'Designated Recipient'}
                                    </Text>
                                    {activeJob.recipient_notes && (
                                        <View style={styles.recipientNotesWrap}>
                                            <Text style={styles.recipientNotesLabel}>Gate / Delivery Note:</Text>
                                            <Text style={styles.recipientNotesText}>{activeJob.recipient_notes}</Text>
                                        </View>
                                    )}
                                </View>

                                <View style={styles.recipientActionButtonsRow}>
                                    {activeJob.recipient_phone && (
                                        <TouchableOpacity
                                            style={styles.recipientCallBtn}
                                            activeOpacity={0.7}
                                            onPress={() => setInAppCallVisible(true)}
                                        >
                                            <Text style={styles.recipientCallBtnIcon}>📞</Text>
                                            <Text style={styles.recipientCallBtnText}>Call In-App</Text>
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity
                                        style={[styles.recipientSmsBtn, pingingGate && { opacity: 0.6 }]}
                                        activeOpacity={0.7}
                                        disabled={pingingGate}
                                        onPress={async () => {
                                            try {
                                                setPingingGate(true);
                                                const arrivalMsg = `Hi ${activeJob.recipient_name || 'there'}! I'm your ShipMate courier. I have arrived outside at your gate / door with your order.`;
                                                await chatService.sendMessage(activeJob.id, user.id, arrivalMsg);
                                                alert('Arrival ping sent to customer via in-app chat! 🔔');
                                            } catch (err: any) {
                                                console.warn('Arrival ping error:', err);
                                                alert('Notice: in-app arrival alert dispatched.');
                                            } finally {
                                                setPingingGate(false);
                                            }
                                        }}
                                    >
                                        <Text style={styles.recipientSmsBtnIcon}>🔔</Text>
                                        <Text style={styles.recipientSmsBtnText}>{pingingGate ? 'Pinging...' : 'Ping Gate Arrival'}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {/* 1-Tap Quick Turn-by-Turn GPS Navigation Intent */}
                        <TouchableOpacity
                            style={styles.turnByTurnButton}
                            activeOpacity={0.8}
                            onPress={() => {
                                const isHeadingToPickup = activeJob.status === 'driver_assigned' || activeJob.status === 'en_route_to_pickup';
                                if (isHeadingToPickup) {
                                    openNativeNavigation(activeJob.pickup_latitude, activeJob.pickup_longitude, activeJob.pickup_address || activeJob.errand_location);
                                } else {
                                    openNativeNavigation(activeJob.dropoff_latitude, activeJob.dropoff_longitude, activeJob.dropoff_address);
                                }
                            }}
                        >
                            <LinearGradient
                                colors={['#1E293B', '#0F172A']}
                                style={styles.turnByTurnGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                <Text style={styles.turnByTurnIcon}>🗺️</Text>
                                <Text style={styles.turnByTurnText}>
                                    {(activeJob.status === 'driver_assigned' || activeJob.status === 'en_route_to_pickup')
                                        ? 'Start Turn-by-Turn to Pickup'
                                        : 'Start Turn-by-Turn to Drop-off'}
                                </Text>
                                <Text style={styles.turnByTurnArrow}>↗</Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.completeButtonContainer}
                            activeOpacity={0.8}
                            onPress={handleNextStep}
                            disabled={loading}
                        >
                            <LinearGradient
                                colors={['#055FEE', '#5B99F2']}
                                style={styles.completeGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#FFFFFF" />
                                ) : (
                                    <Text style={styles.completeButtonText}>{getButtonText(activeJob.status)}</Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Arrival Waiting Timer Trigger (When at delivery pin) */}
                        {(activeJob.status === 'arrived_at_delivery' || activeJob.status === 'arrived') && (
                            !activeJob.arrival_timer_started_at ? (
                                <TouchableOpacity
                                    style={styles.arrivalTimerTriggerBtn}
                                    onPress={handleStartArrivalTimer}
                                    disabled={startingTimer}
                                >
                                    {startingTimer ? (
                                        <ActivityIndicator color="#FFFFFF" />
                                    ) : (
                                        <Text style={styles.arrivalTimerTriggerText}>
                                            ⏳ Start 5-Min Waiting Timer (Push Alert Only)
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            ) : (
                                <View style={styles.arrivalTimerActiveBox}>
                                    <Text style={styles.arrivalTimerActiveIcon}>⏳</Text>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.arrivalTimerActiveTitle}>Customer Waiting Timer Active</Text>
                                        <Text style={styles.arrivalTimerActiveSubtitle}>
                                            Push alert sent to customer (zero SMS/WhatsApp).
                                        </Text>
                                    </View>
                                    <Text style={styles.arrivalTimerClock}>{formatTimer(timerSecondsLeft)}</Text>
                                </View>
                            )
                        )}

                        {/* Release Job Trigger Button */}
                        <TouchableOpacity
                            style={styles.releaseOrderTriggerBtn}
                            activeOpacity={0.7}
                            onPress={() => setReleaseModalVisible(true)}
                        >
                            <Text style={styles.releaseOrderTriggerText}>Release Job (Issue / No-Show)</Text>
                        </TouchableOpacity>

                        <ProofOfDeliveryModal 
                            visible={podVisible}
                            onClose={() => setPodVisible(false)}
                            onComplete={handlePodComplete}
                            orderId={activeJob.id}
                        />

                        {activeJob && user && (
                            <InAppCallModal
                                visible={inAppCallVisible}
                                orderId={activeJob.id}
                                callerId={user.id}
                                callerRole="driver"
                                targetName={activeJob.customer?.full_name || 'Customer'}
                                targetRole="customer"
                                onClose={() => setInAppCallVisible(false)}
                                onCallCompleted={() => {
                                    setLastCallTimestamp(Date.now());
                                    fetchCallAttempts(activeJob.id);
                                }}
                            />
                        )}
                    </SafeAreaView>
                </BlurView>
            </View>

            {/* Handover PIN (OTP) Confirmation Modal */}
            <Modal
                visible={pinModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setPinModalVisible(false)}
            >
                <KeyboardAvoidingView 
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
                    style={styles.pinModalOverlay}
                >
                    <View style={styles.pinModalContainer}>
                        <View style={styles.pinModalHeader}>
                            <View style={styles.pinModalIconCircle}>
                                <Text style={styles.pinModalIcon}>🔐</Text>
                            </View>
                            <Text style={styles.pinModalTitle}>Delivery Handover PIN</Text>
                            <Text style={styles.pinModalSubtitle}>
                                Ask the customer or recipient for the 4-digit PIN persistently displayed on their Shipmate app.
                            </Text>
                        </View>

                        {/* 4-Digit Display Input */}
                        <View style={styles.pinInputWrap}>
                            <TextInput
                                style={styles.pinHiddenInput}
                                keyboardType="number-pad"
                                maxLength={4}
                                value={enteredPin}
                                onChangeText={(val) => {
                                    const clean = val.replace(/[^0-9]/g, '');
                                    setEnteredPin(clean);
                                    if (pinError) setPinError(null);
                                }}
                                autoFocus={true}
                            />
                            <View style={styles.pinBoxesRow}>
                                {[0, 1, 2, 3].map((index) => {
                                    const char = enteredPin[index] || '';
                                    const isFocused = enteredPin.length === index;
                                    return (
                                        <View 
                                            key={index} 
                                            style={[
                                                styles.pinBox,
                                                isFocused && styles.pinBoxFocused,
                                                Boolean(char) && styles.pinBoxFilled,
                                                Boolean(pinError) && styles.pinBoxError
                                            ]}
                                        >
                                            <Text style={styles.pinBoxText}>{char}</Text>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>

                        {/* Error & Remaining Attempts Warning */}
                        {pinError && (
                            <View style={styles.pinErrorBanner}>
                                <Text style={styles.pinErrorIcon}>⚠️</Text>
                                <Text style={styles.pinErrorText}>{pinError}</Text>
                            </View>
                        )}

                        {/* Anti-Abuse Lockout Notice */}
                        <Text style={styles.pinAttemptNote}>
                            {activeJob.pin_attempts_count && activeJob.pin_attempts_count > 0 
                                ? `Attempts used: ${activeJob.pin_attempts_count}/3. Lockout triggers photo proof.`
                                : 'Maximum 3 attempts. Lockout triggers photo proof fallback.'}
                        </Text>

                        {/* Masked Call Proxy Button */}
                        <TouchableOpacity 
                            style={[styles.pinMaskedCallBtn, secondsUntilNextCallAllowed > 0 && styles.pinMaskedCallBtnDisabled]} 
                            onPress={handleMakeMaskedCall}
                            disabled={secondsUntilNextCallAllowed > 0}
                        >
                            <Text style={styles.pinMaskedCallBtnText}>
                                {secondsUntilNextCallAllowed > 0 
                                    ? `Wait ${secondsUntilNextCallAllowed}s for next call` 
                                    : '📞 Call Customer for PIN (In-App Call)'}
                            </Text>
                        </TouchableOpacity>

                        {/* Actions */}
                        <View style={styles.pinModalActionsRow}>
                            <TouchableOpacity 
                                style={styles.pinCancelBtn}
                                onPress={() => {
                                    setPinModalVisible(false);
                                    setEnteredPin('');
                                    setPinError(null);
                                }}
                                disabled={verifyingPin}
                            >
                                <Text style={styles.pinCancelBtnText}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity 
                                style={[
                                    styles.pinVerifyBtn, 
                                    (enteredPin.length !== 4 || verifyingPin) && styles.pinVerifyBtnDisabled
                                ]}
                                onPress={handleVerifyPin}
                                disabled={enteredPin.length !== 4 || verifyingPin}
                            >
                                {verifyingPin ? (
                                    <ActivityIndicator color="#FFFFFF" size="small" />
                                ) : (
                                    <Text style={styles.pinVerifyBtnText}>Verify & Complete</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Release Job Modal with Strict Anti-Abuse Protocol */}
            <Modal
                visible={releaseModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setReleaseModalVisible(false)}
            >
                <View style={styles.releaseModalOverlay}>
                    <View style={styles.releaseModalCard}>
                        <View style={styles.releaseModalHeader}>
                            <Text style={styles.releaseModalTitle}>Release Active Job</Text>
                            <TouchableOpacity onPress={() => setReleaseModalVisible(false)}>
                                <Text style={styles.releaseModalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.releaseModalSubtitle}>
                            Releasing returns this order to the dispatch pool with priority. Select a verified reason:
                        </Text>

                        {/* Fixed Enum Reasons */}
                        <TouchableOpacity
                            style={[styles.reasonCard, releaseReason === 'mechanical_issue' && styles.reasonCardActive]}
                            onPress={() => setReleaseReason('mechanical_issue')}
                        >
                            <View style={styles.reasonCardTop}>
                                <Text style={styles.reasonCardTitle}>🔧 Mechanical Issue / Breakdown</Text>
                                <Text style={styles.reasonPenaltyText}>-0.05 rating</Text>
                            </View>
                            <Text style={styles.reasonCardDesc}>Vehicle puncture, accident, or physical breakdown.</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.reasonCard, releaseReason === 'store_closed' && styles.reasonCardActive]}
                            onPress={() => setReleaseReason('store_closed')}
                        >
                            <View style={styles.reasonCardTop}>
                                <Text style={styles.reasonCardTitle}>🏪 Store / Pickup Closed</Text>
                                <Text style={styles.reasonPenaltyText}>-0.15 rating</Text>
                            </View>
                            <Text style={styles.reasonCardDesc}>Merchant or pickup location was locked or closed. (Requires at least 1 verified call attempt).</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.reasonCard, releaseReason === 'customer_no_show' && styles.reasonCardActive]}
                            onPress={() => setReleaseReason('customer_no_show')}
                        >
                            <View style={styles.reasonCardTop}>
                                <Text style={styles.reasonCardTitle}>🚪 Customer No-Show at Gate</Text>
                                <Text style={styles.reasonPenaltyText}>Protected Anti-Abuse</Text>
                            </View>
                            <Text style={styles.reasonCardDesc}>Customer unreachable at delivery gate after 5-min timer & 3 calls.</Text>
                        </TouchableOpacity>

                        {/* Anti-Abuse Checklist for customer_no_show */}
                        {releaseReason === 'customer_no_show' && (
                            <View style={styles.antiAbuseBox}>
                                <Text style={styles.antiAbuseTitle}>Anti-Abuse Verification Checklist:</Text>
                                
                                <View style={styles.checkRow}>
                                    <Text style={styles.checkIcon}>
                                        {(activeJob.status === 'arrived_at_delivery' || activeJob.status === 'arrived') ? '✅' : '❌'}
                                    </Text>
                                    <Text style={styles.checkText}>Arrived at delivery location pin</Text>
                                </View>

                                <View style={styles.checkRow}>
                                    <Text style={styles.checkIcon}>
                                        {(activeJob.arrival_timer_started_at && timerSecondsLeft === 0) ? '✅' : '⏳'}
                                    </Text>
                                    <Text style={styles.checkText}>
                                        5-Minute Arrival Waiting Timer completed {timerSecondsLeft !== null && timerSecondsLeft > 0 ? `(${formatTimer(timerSecondsLeft)} left)` : ''}
                                    </Text>
                                </View>

                                <View style={styles.checkRow}>
                                    <Text style={styles.checkIcon}>
                                        {callAttempts.length >= 3 ? '✅' : '📞'}
                                    </Text>
                                    <Text style={styles.checkText}>
                                        {"3 Masked-Calls spaced >= 1 min apart ("}{callAttempts.length}{"/3 placed)"}
                                    </Text>
                                </View>

                                {/* Quick Masked Call Action Button */}
                                <TouchableOpacity
                                    style={[styles.quickCallBtn, secondsUntilNextCallAllowed > 0 && styles.quickCallBtnDisabled]}
                                    onPress={handleMakeMaskedCall}
                                    disabled={secondsUntilNextCallAllowed > 0}
                                >
                                    <Text style={styles.quickCallBtnText}>
                                        {secondsUntilNextCallAllowed > 0
                                            ? `Wait ${secondsUntilNextCallAllowed}s for next call attempt`
                                            : '📞 Call Customer via In-App Audio (Masked)'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Proposed Compensation Input */}
                        <View style={styles.compensationInputWrap}>
                            <Text style={styles.compensationInputLabel}>
                                Proposed Trip Compensation ($ USD for {(activeJob?.cumulative_distance_km || 0).toFixed(1)} km traveled):
                            </Text>
                            <TextInput
                                style={styles.compensationTextInput}
                                keyboardType="numeric"
                                value={proposedCompensation}
                                onChangeText={setProposedCompensation}
                                placeholder="0.50"
                                placeholderTextColor="#94A3B8"
                            />
                        </View>

                        {/* Release Actions */}
                        <View style={styles.releaseModalActions}>
                            <TouchableOpacity
                                style={styles.releaseCancelBtn}
                                onPress={() => setReleaseModalVisible(false)}
                            >
                                <Text style={styles.releaseCancelText}>Keep Job</Text>
                            </TouchableOpacity>

                            {(() => {
                                const isNoShow = releaseReason === 'customer_no_show';
                                const isStoreClosed = releaseReason === 'store_closed';
                                const isAtPin = activeJob.status === 'arrived_at_delivery' || activeJob.status === 'arrived';
                                const timerDone = activeJob.arrival_timer_started_at && timerSecondsLeft === 0;
                                const has3Calls = callAttempts.length >= 3;
                                const has1Call = callAttempts.length >= 1;

                                const isBlocked = (isNoShow && (!isAtPin || !timerDone || !has3Calls)) || (isStoreClosed && !has1Call);

                                return (
                                    <TouchableOpacity
                                        style={[styles.releaseConfirmBtn, isBlocked && styles.releaseConfirmBtnBlocked]}
                                        onPress={handleReleaseJob}
                                        disabled={isBlocked || releasing}
                                    >
                                        {releasing ? (
                                            <ActivityIndicator color="#FFFFFF" />
                                        ) : (
                                            <Text style={styles.releaseConfirmText}>
                                                {isBlocked ? 'Protocol Incomplete' : 'Confirm Release'}
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                );
                            })()}
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    safeArea: { flex: 1 },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    emptyTitle: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
    emptyText: { fontSize: 16, color: '#64748B', textAlign: 'center', marginBottom: 32 },
    emptyIconCircle: {
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
        marginBottom: 20, elevation: 2,
    },
    navigateButtonContainer: { borderRadius: 16, overflow: 'hidden' },
    navigateGradient: { paddingVertical: 16, paddingHorizontal: 32, alignItems: 'center' },
    navigateButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    
    mapPlaceholder: {
        flex: 1,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    placeholderContent: {
        alignItems: 'center',
        maxWidth: 300,
    },
    placeholderEmoji: { fontSize: 48, marginBottom: 16 },
    placeholderTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B', textAlign: 'center', marginBottom: 8 },
    placeholderText: { fontSize: 14, color: '#64748B', textAlign: 'center', marginBottom: 20 },
    badge: { backgroundColor: '#E2E8F0', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99 },
    badgeText: { fontSize: 12, fontWeight: '600', color: '#475569' },

    headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
    headerBlur: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.4)' },
    headerContent: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16,
    },
    backBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 12 },
    backTxt: { fontSize: 14, fontWeight: 'bold', color: '#334155' },
    headerText: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
    
    bottomOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0 },
    jobDetailsPanel: {
        paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20,
        borderTopLeftRadius: 32, borderTopRightRadius: 32,
        borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,0.8)',
    },
    dragHandle: { width: 48, height: 5, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 3, alignSelf: 'center', marginBottom: 24 },
    titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    iconContainer: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    serviceIcon: { fontSize: 20 },
    jobType: { fontSize: 24, fontWeight: '800', color: '#0F172A' },
    locationContainer: {
        backgroundColor: 'rgba(255,255,255,0.6)', padding: 16,
        borderRadius: 16, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
    },
    locationRow: { flexDirection: 'row', alignItems: 'flex-start' },
    timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#3B82F6', marginRight: 12, marginTop: 4 },
    timelineDotEnd: { backgroundColor: '#10B981' },
    timelineLine: { height: 24, width: 2, backgroundColor: '#CBD5E1', marginLeft: 4, marginVertical: 2 },
    locationText: { flex: 1, fontSize: 15, color: '#0F172A', fontWeight: '500' },
    locationLabel: { color: '#64748B', fontWeight: '400' },
    customerInfoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.7)',
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.5)',
        marginBottom: 20,
    },
    customerAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#0F172A',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    customerAvatarText: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: 'bold',
    },
    customerDetails: {
        flex: 1,
    },
    customerNameLabel: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '500',
    },
    customerName: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1E293B',
    },
    contactBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#055FEE',
        justifyContent: 'center',
        alignItems: 'center',
    },
    communicationButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    chatBtn: {
        backgroundColor: '#22C55E',
    },
    contactIcon: {
        fontSize: 20,
    },
    unreadBadge: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: '#EF4444',
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
        borderWidth: 1.5,
        borderColor: '#FFFFFF',
    },
    unreadBadgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '800',
    },
    completeButtonContainer: { borderRadius: 16, overflow: 'hidden', marginBottom: 20 },
    completeGradient: { paddingVertical: 18, alignItems: 'center' },
    completeButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    locationInfoWrap: {
        flex: 1,
    },
    navChip: {
        backgroundColor: '#EFF6FF',
        borderWidth: 1,
        borderColor: '#3B82F6',
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 5,
        marginLeft: 8,
    },
    navChipText: {
        color: '#1D4ED8',
        fontSize: 12,
        fontWeight: '700',
    },
    driverDirectiveBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 14,
        marginVertical: 10,
        gap: 10,
    },
    driverDirectiveBannerCod: {
        backgroundColor: '#FEF3C7',
        borderWidth: 1.5,
        borderColor: '#F59E0B',
    },
    driverDirectiveBannerDigital: {
        backgroundColor: '#ECFDF5',
        borderWidth: 1.5,
        borderColor: '#10B981',
    },
    driverDirectiveIcon: {
        fontSize: 22,
    },
    driverDirectiveTextWrap: {
        flex: 1,
    },
    driverDirectiveTitle: {
        fontSize: 14,
        fontWeight: '900',
        marginBottom: 2,
        letterSpacing: 0.5,
    },
    driverDirectiveTitleCod: {
        color: '#92400E',
    },
    driverDirectiveTitleDigital: {
        color: '#065F46',
    },
    driverDirectiveSubtitle: {
        fontSize: 11,
        color: '#475569',
        lineHeight: 15,
        fontWeight: '500',
    },
    turnByTurnButton: {
        borderRadius: 14,
        overflow: 'hidden',
        marginBottom: 10,
    },
    turnByTurnGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 13,
        paddingHorizontal: 16,
        gap: 8,
    },
    turnByTurnIcon: {
        fontSize: 18,
    },
    turnByTurnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
    turnByTurnArrow: {
        color: '#60A5FA',
        fontSize: 16,
        fontWeight: '900',
    },
    // Recipient Job Card Styles
    recipientJobCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 2,
    },
    recipientJobHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    recipientJobHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    recipientJobHeaderIcon: {
        fontSize: 16,
    },
    recipientJobHeaderTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#64748B',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    smsActiveBadge: {
        backgroundColor: '#D1FAE5',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    smsActiveBadgeText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#059669',
    },
    smsInactiveBadge: {
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    smsInactiveBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#64748B',
    },
    recipientJobBody: {
        marginBottom: 12,
    },
    recipientJobName: {
        fontSize: 16,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 4,
    },
    recipientNotesWrap: {
        backgroundColor: '#FEF3C7',
        padding: 8,
        borderRadius: 8,
        marginTop: 4,
    },
    recipientNotesLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: '#B45309',
        textTransform: 'uppercase',
    },
    recipientNotesText: {
        fontSize: 12,
        color: '#78350F',
        fontWeight: '500',
        marginTop: 2,
    },
    recipientActionButtonsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    recipientCallBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F1F5F9',
        paddingVertical: 10,
        borderRadius: 10,
        gap: 6,
        borderWidth: 1,
        borderColor: '#CBD5E1',
    },
    recipientCallBtnIcon: {
        fontSize: 14,
    },
    recipientCallBtnText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#1E293B',
    },
    recipientSmsBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#EFF6FF',
        paddingVertical: 10,
        borderRadius: 10,
        gap: 6,
        borderWidth: 1,
        borderColor: '#93C5FD',
    },
    recipientSmsBtnIcon: {
        fontSize: 14,
    },
    recipientSmsBtnText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#1D4ED8',
    },
    // Arrival Waiting Timer Styles (Push Only)
    arrivalTimerTriggerBtn: {
        backgroundColor: '#F59E0B',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
        cursor: 'pointer',
    },
    arrivalTimerTriggerText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
    arrivalTimerActiveBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEF3C7',
        borderWidth: 1.5,
        borderColor: '#F59E0B',
        borderRadius: 14,
        padding: 12,
        marginBottom: 10,
        gap: 10,
    },
    arrivalTimerActiveIcon: {
        fontSize: 22,
    },
    arrivalTimerActiveTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: '#92400E',
    },
    arrivalTimerActiveSubtitle: {
        fontSize: 11,
        color: '#B45309',
        marginTop: 2,
    },
    arrivalTimerClock: {
        fontSize: 16,
        fontWeight: '900',
        color: '#B45309',
    },
    // Release Job Trigger Button
    releaseOrderTriggerBtn: {
        alignItems: 'center',
        paddingVertical: 10,
        marginBottom: 8,
        cursor: 'pointer',
    },
    releaseOrderTriggerText: {
        color: '#EF4444',
        fontSize: 13,
        fontWeight: '700',
        textDecorationLine: 'underline',
    },
    // Release Modal Styles
    releaseModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    releaseModalCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 24,
        maxWidth: 480,
        width: '100%',
        maxHeight: '90%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 10,
    },
    releaseModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    releaseModalTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#0F172A',
    },
    releaseModalClose: {
        fontSize: 20,
        color: '#64748B',
        fontWeight: '700',
        padding: 4,
        cursor: 'pointer',
    },
    releaseModalSubtitle: {
        fontSize: 13,
        color: '#64748B',
        lineHeight: 18,
        marginBottom: 16,
    },
    reasonCard: {
        backgroundColor: '#F8FAFC',
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        borderRadius: 14,
        padding: 12,
        marginBottom: 10,
        cursor: 'pointer',
    },
    reasonCardActive: {
        borderColor: '#EF4444',
        backgroundColor: '#FEF2F2',
    },
    reasonCardTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    reasonCardTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: '#0F172A',
    },
    reasonPenaltyText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#EF4444',
    },
    reasonCardDesc: {
        fontSize: 12,
        color: '#64748B',
        lineHeight: 16,
    },
    // Anti-Abuse Box
    antiAbuseBox: {
        backgroundColor: '#FFFBEB',
        borderWidth: 1,
        borderColor: '#FDE68A',
        borderRadius: 14,
        padding: 12,
        marginBottom: 12,
    },
    antiAbuseTitle: {
        fontSize: 12,
        fontWeight: '800',
        color: '#92400E',
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    checkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
        gap: 8,
    },
    checkIcon: {
        fontSize: 13,
    },
    checkText: {
        fontSize: 12,
        color: '#451A03',
        fontWeight: '600',
        flex: 1,
    },
    quickCallBtn: {
        backgroundColor: '#055FEE',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        alignItems: 'center',
        marginTop: 6,
        cursor: 'pointer',
    },
    quickCallBtnDisabled: {
        backgroundColor: '#94A3B8',
        cursor: 'not-allowed' as any,
    },
    quickCallBtnText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '800',
    },
    // Compensation Input
    compensationInputWrap: {
        backgroundColor: '#F1F5F9',
        padding: 12,
        borderRadius: 12,
        marginBottom: 16,
    },
    compensationInputLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#334155',
        marginBottom: 6,
    },
    compensationTextInput: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#CBD5E1',
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        fontSize: 15,
        fontWeight: '800',
        color: '#0F172A',
    },
    releaseModalActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 6,
    },
    releaseCancelBtn: {
        flex: 1,
        backgroundColor: '#F1F5F9',
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
    },
    releaseCancelText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#475569',
    },
    releaseConfirmBtn: {
        flex: 1.5,
        backgroundColor: '#EF4444',
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
    },
    releaseConfirmBtnBlocked: {
        backgroundColor: '#CBD5E1',
        cursor: 'not-allowed' as any,
    },
    releaseConfirmText: {
        fontSize: 14,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    // Handover PIN Modal Styles
    pinModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    pinModalContainer: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 8,
    },
    pinModalHeader: {
        alignItems: 'center',
        marginBottom: 20,
    },
    pinModalIconCircle: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    pinModalIcon: {
        fontSize: 26,
    },
    pinModalTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 6,
        textAlign: 'center',
    },
    pinModalSubtitle: {
        fontSize: 13,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 18,
    },
    pinInputWrap: {
        width: '100%',
        alignItems: 'center',
        marginVertical: 12,
        position: 'relative',
    },
    pinHiddenInput: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        opacity: 0.01,
        zIndex: 10,
    },
    pinBoxesRow: {
        flexDirection: 'row',
        gap: 12,
        justifyContent: 'center',
    },
    pinBox: {
        width: 52,
        height: 60,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: '#E2E8F0',
        backgroundColor: '#F8FAFC',
        justifyContent: 'center',
        alignItems: 'center',
    },
    pinBoxFocused: {
        borderColor: '#055FEE',
        backgroundColor: '#FFFFFF',
    },
    pinBoxFilled: {
        borderColor: '#055FEE',
        backgroundColor: '#EFF6FF',
    },
    pinBoxError: {
        borderColor: '#EF4444',
        backgroundColor: '#FEF2F2',
    },
    pinBoxText: {
        fontSize: 26,
        fontWeight: '800',
        color: '#0F172A',
    },
    pinErrorBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#FEF2F2',
        borderWidth: 1,
        borderColor: '#FCA5A5',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginTop: 10,
        width: '100%',
    },
    pinErrorIcon: {
        fontSize: 14,
    },
    pinErrorText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#DC2626',
        flex: 1,
    },
    pinAttemptNote: {
        fontSize: 11,
        color: '#94A3B8',
        textAlign: 'center',
        marginTop: 8,
        fontWeight: '500',
    },
    pinMaskedCallBtn: {
        width: '100%',
        backgroundColor: '#F1F5F9',
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
        marginTop: 14,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#CBD5E1',
        cursor: 'pointer' as any,
    },
    pinMaskedCallBtnDisabled: {
        opacity: 0.6,
        cursor: 'not-allowed' as any,
    },
    pinMaskedCallBtnText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#334155',
    },
    pinModalActionsRow: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
        marginTop: 20,
    },
    pinCancelBtn: {
        flex: 1,
        backgroundColor: '#F1F5F9',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        cursor: 'pointer' as any,
    },
    pinCancelBtnText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#475569',
    },
    pinVerifyBtn: {
        flex: 2,
        backgroundColor: '#055FEE',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer' as any,
    },
    pinVerifyBtnDisabled: {
        backgroundColor: '#93C5FD',
        cursor: 'not-allowed' as any,
    },
    pinVerifyBtnText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#FFFFFF',
    },
});
