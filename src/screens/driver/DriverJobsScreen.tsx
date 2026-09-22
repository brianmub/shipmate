import React, { useEffect, useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    StatusBar,
    Platform,
    AppState,
    AppStateStatus,
    Switch,
    Modal,
    Dimensions,
    Vibration
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';

import { orderService } from '../../services/orderService';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../utils/supabase';
import { JobOfferModal } from '../../components/JobOfferModal';
import { userService } from '../../services/userService';
import { DriverTier } from '../../types';
import { requestNotificationPermissionsOnLaunch } from '../../utils/pushNotifications';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Default fallback coordinates (Harare, Zimbabwe) if GPS is pending or permission denied
const DEFAULT_COORDS = {
    latitude: -17.8252,
    longitude: 31.0335,
    latitudeDelta: 0.04,
    longitudeDelta: 0.04,
};

const darkMapStyle = [
    { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
    { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] }
];

export const DriverJobsScreen = ({ navigation, route }: any) => {
    const { user } = useAuthStore();
    const [jobs, setJobs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isVerified, setIsVerified] = useState<boolean | null>(null);
    const [walletStatus, setWalletStatus] = useState<string>('active');
    const [walletBalance, setWalletBalance] = useState<number | null>(null);
    const [driverTier, setDriverTier] = useState<DriverTier>('standard');
    const [isOnline, setIsOnline] = useState<boolean>(true);

    const isLockedOut = (walletBalance !== null && walletBalance <= 0.25) || walletStatus === 'locked';
    const isLowBalance = !isLockedOut && walletBalance !== null && walletBalance <= 3.00;

    const isOnlineRef = useRef(isOnline);
    isOnlineRef.current = isOnline;
    const walletBalanceRef = useRef(walletBalance);
    walletBalanceRef.current = walletBalance;
    const walletStatusRef = useRef(walletStatus);
    walletStatusRef.current = walletStatus;
    const driverTierRef = useRef(driverTier);
    driverTierRef.current = driverTier;
    const isLockedOutRef = useRef(isLockedOut);
    isLockedOutRef.current = isLockedOut;

    const [currentTime, setCurrentTime] = useState(Date.now());
    const [selectedJob, setSelectedJob] = useState<any>(null);
    const [offerModalVisible, setOfferModalVisible] = useState(false);
    const [acceptingId, setAcceptingId] = useState<string | null>(null);
    const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
    const [declinedJobIds, setDeclinedJobIds] = useState<string[]>([]);

    // View mode: 'map' is the default so the live map is visible immediately on launch
    const [viewMode, setViewMode] = useState<'map' | 'list'>('map');

    // Live GPS Location
    const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number; heading?: number } | null>(null);
    const [locationPermissionGranted, setLocationPermissionGranted] = useState<boolean>(false);
    const mapRef = useRef<MapView | null>(null);
    const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
    const locationHeartbeatRef = useRef<any>(null);

    // Incoming Realtime Job Offer Modal
    const [incomingOrder, setIncomingOrder] = useState<any>(null);
    const [acceptingIncoming, setAcceptingIncoming] = useState(false);

    // Notification Permission Prompt
    const [hasNotificationPermission, setHasNotificationPermission] = useState<boolean>(true);
    const [dismissedNotificationBanner, setDismissedNotificationBanner] = useState<boolean>(false);

    const activeChannelRef = useRef<any>(null);

    // 1. Initial Notification Permission Check
    useEffect(() => {
        const checkNotifications = async () => {
            if (Platform.OS === 'web') return;
            try {
                const { status } = await Notifications.getPermissionsAsync();
                setHasNotificationPermission(status === 'granted');
            } catch (err) {
                console.warn('Notification permission check error:', err);
            }
        };
        checkNotifications();
    }, []);

    const handleEnableNotifications = async () => {
        const token = await requestNotificationPermissionsOnLaunch();
        if (token) {
            setHasNotificationPermission(true);
            if (user?.id) {
                userService.updatePushToken(user.id, token).catch(() => {});
            }
            Alert.alert('Notifications Enabled', 'You will now receive sound and banner alerts for new delivery requests!');
        } else {
            Alert.alert(
                'Permission Notice',
                'Please enable notifications for ShipMate in your device settings to receive instant job alerts.'
            );
        }
    };

    // 2. Fetch Driver Profile & Online Status
    const fetchDriverOnlineStatus = async () => {
        if (!user) return;
        try {
            const profile = await userService.getDriverProfile(user.id);
            if (profile) {
                const locked = (walletBalance !== null && walletBalance <= 0.25) || walletStatus === 'locked';
                if (locked) {
                    setIsOnline(false);
                    if (profile.is_online) {
                        await userService.toggleOnlineStatus(user.id, false);
                    }
                } else {
                    setIsOnline(profile.is_online ?? true);
                }
            }
        } catch (err) {
            console.error('Error fetching driver online status:', err);
        }
    };

    // 3. Online/Offline Toggle Handler
    const toggleOnlineStatus = async () => {
        if (isLockedOut) {
            Alert.alert(
                'Wallet Locked Out',
                `Your float balance ($${walletBalance !== null ? walletBalance.toFixed(2) : '0.00'}) is below the $0.25 minimum. Please top up your wallet via ClicknPay to go online.`,
                [
                    { text: 'Top Up Wallet', onPress: () => navigation.navigate('Wallet') },
                    { text: 'Cancel', style: 'cancel' }
                ]
            );
            setIsOnline(false);
            return;
        }

        const nextState = !isOnline;
        setIsOnline(nextState);

        try {
            let lat = driverLocation?.latitude;
            let lng = driverLocation?.longitude;
            let heading = driverLocation?.heading ?? 0;

            if (nextState && Platform.OS !== 'web' && (!lat || !lng)) {
                try {
                    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                    if (loc?.coords) {
                        lat = loc.coords.latitude;
                        lng = loc.coords.longitude;
                        heading = loc.coords.heading ?? 0;
                        setDriverLocation({ latitude: lat, longitude: lng, heading });
                    }
                } catch (locErr) {
                    console.warn('Could not fetch immediate position on toggle online:', locErr);
                }
            }

            await userService.toggleOnlineStatus(user!.id, nextState, lat, lng);
            if (nextState && lat !== undefined && lng !== undefined) {
                await userService.updateDriverLocation(user!.id, lat, lng, heading);
            }
        } catch (err) {
            setIsOnline(!nextState); // Rollback on error
            console.error('Error toggling driver online status:', err);
        }
    };

    // 4. Deep link or notification target: focus and open offer sheet for target job
    useEffect(() => {
        const targetOrderId = route?.params?.orderId;
        if (targetOrderId && jobs.length > 0) {
            const targetJob = jobs.find(j => j.id === targetOrderId);
            if (targetJob) {
                setExpandedJobId(targetOrderId);
                setSelectedJob(targetJob);
                setOfferModalVisible(true);
                // Center map on target job pickup if available
                if (targetJob.pickup_latitude && targetJob.pickup_longitude && mapRef.current) {
                    mapRef.current.animateToRegion({
                        latitude: targetJob.pickup_latitude,
                        longitude: targetJob.pickup_longitude,
                        latitudeDelta: 0.02,
                        longitudeDelta: 0.02,
                    }, 800);
                }
            }
        }
    }, [route?.params?.orderId, jobs]);

    // 5. Active viewer presence channel
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

    // 6. Verification and Wallet Checks
    const checkVerificationStatus = async () => {
        try {
            const { data, error } = await supabase
                .from('drivers')
                .select('is_identity_verified, last_verification_at')
                .eq('id', user?.id)
                .single();

            if (error) throw error;
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
                if (bal <= 0.25 || walletData.status === 'locked') {
                    setIsOnline(false);
                    userService.toggleOnlineStatus(user.id, false).catch(() => {});
                }
            }
        } catch (error) {
            console.error('Error checking wallet status:', error);
        }
    };

    // 7. AppState listener: re-verify on app resume / returning to foreground
    useEffect(() => {
        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            if (nextAppState === 'active') {
                checkWalletStatus();
                fetchPendingJobs();
                fetchDriverOnlineStatus();
                syncDriverGpsLocation();
            }
        };
        const subscription = AppState.addEventListener('change', handleAppStateChange);
        return () => {
            subscription.remove();
        };
    }, [user?.id]);

    // 8. Real-time wallet listener
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
                    if (newBal <= 0.25 || newStat === 'locked') {
                        setIsOnline(false);
                        userService.toggleOnlineStatus(user.id, false).catch(() => {});
                    }
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

    const fetchPendingJobs = async (tierOverride?: DriverTier, showLoading: boolean = false) => {
        try {
            if (showLoading) setLoading(true);
            const tier = tierOverride || driverTierRef.current || driverTier;
            const data = await orderService.getAvailableJobs(tier);
            setJobs(data || []);
        } catch (error: any) {
            console.error('Error fetching jobs:', error.message);
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    // 9. Live GPS Location Tracking & Map Centering
    const syncDriverGpsLocation = async () => {
        if (Platform.OS === 'web') {
            if (typeof navigator !== 'undefined' && navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        const coords = {
                            latitude: pos.coords.latitude,
                            longitude: pos.coords.longitude,
                            heading: pos.coords.heading ?? 0,
                        };
                        setDriverLocation(coords);
                        setLocationPermissionGranted(true);
                        mapRef.current?.animateToRegion({
                            latitude: coords.latitude,
                            longitude: coords.longitude,
                            latitudeDelta: 0.04,
                            longitudeDelta: 0.04,
                        }, 500);
                        if (user?.id && isOnlineRef.current) {
                            userService.updateDriverLocation(user.id, coords.latitude, coords.longitude, coords.heading ?? 0).catch(() => {});
                        }
                    },
                    (err) => console.warn('Web geolocation warning:', err),
                    { enableHighAccuracy: true, timeout: 8000 }
                );
            }
            return;
        }

        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                setLocationPermissionGranted(true);

                // 1. Instant fix from cached last-known position so map opens immediately on driver
                const lastKnown = await Location.getLastKnownPositionAsync().catch(() => null);
                if (lastKnown?.coords) {
                    const cachedCoords = {
                        latitude: lastKnown.coords.latitude,
                        longitude: lastKnown.coords.longitude,
                        heading: lastKnown.coords.heading ?? 0,
                    };
                    setDriverLocation(cachedCoords);
                    mapRef.current?.animateToRegion({
                        latitude: cachedCoords.latitude,
                        longitude: cachedCoords.longitude,
                        latitudeDelta: 0.04,
                        longitudeDelta: 0.04,
                    }, 350);
                }

                // 2. High-accuracy real-time GPS fix
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                if (loc?.coords) {
                    const coords = {
                        latitude: loc.coords.latitude,
                        longitude: loc.coords.longitude,
                        heading: loc.coords.heading ?? 0,
                    };
                    setDriverLocation(coords);

                    // Animate map camera smoothly to Mate's current GPS position
                    mapRef.current?.animateToRegion({
                        latitude: coords.latitude,
                        longitude: coords.longitude,
                        latitudeDelta: 0.04,
                        longitudeDelta: 0.04,
                    }, 600);

                    if (user && isOnlineRef.current) {
                        userService.updateDriverLocation(user.id, coords.latitude, coords.longitude, coords.heading ?? 0).catch(() => {});
                    }
                }
            } else {
                setLocationPermissionGranted(false);
            }
        } catch (err) {
            console.warn('Error acquiring driver GPS location:', err);
        }
    };

    // Location watch subscription & periodic heartbeat
    useEffect(() => {
        syncDriverGpsLocation();

        let mounted = true;
        if (Platform.OS !== 'web') {
            Location.requestForegroundPermissionsAsync().then(({ status }) => {
                if (!mounted || status !== 'granted') return;
                Location.watchPositionAsync(
                    {
                        accuracy: Location.Accuracy.Balanced,
                        timeInterval: 15000,
                        distanceInterval: 15
                    },
                    (loc) => {
                        if (loc?.coords && mounted) {
                            const newCoords = {
                                latitude: loc.coords.latitude,
                                longitude: loc.coords.longitude,
                                heading: loc.coords.heading ?? 0
                            };
                            setDriverLocation(newCoords);
                            if (user && isOnline) {
                                userService.updateDriverLocation(user.id, newCoords.latitude, newCoords.longitude, newCoords.heading ?? 0).catch(() => {});
                            }
                        }
                    }
                ).then((sub) => {
                    if (mounted) {
                        locationSubscriptionRef.current = sub;
                    } else {
                        sub.remove();
                    }
                }).catch((err) => console.warn('watchPositionAsync warning:', err));
            });
        }

        // Heartbeat backup every 20 seconds while online
        locationHeartbeatRef.current = setInterval(() => {
            if (isOnline && user && driverLocation) {
                userService.updateDriverLocation(user.id, driverLocation.latitude, driverLocation.longitude, driverLocation.heading ?? 0).catch(() => {});
            }
        }, 20000);

        return () => {
            mounted = false;
            if (locationSubscriptionRef.current) {
                locationSubscriptionRef.current.remove();
                locationSubscriptionRef.current = null;
            }
            if (locationHeartbeatRef.current) {
                clearInterval(locationHeartbeatRef.current);
                locationHeartbeatRef.current = null;
            }
        };
    }, [isOnline, user?.id]);

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
            setIncomingOrder(null);
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

    // 10. Load screen data on mount & focus + Realtime order listening
    useEffect(() => {
        let mounted = true;

        const loadScreenData = async (showLoading = false) => {
            checkVerificationStatus();
            checkWalletStatus();
            fetchDriverOnlineStatus();
            const tier = await checkDriverTier();
            await fetchPendingJobs(tier, showLoading);
        };

        // Load initially; only show spinner if we have no jobs yet
        loadScreenData(jobs.length === 0);

        const unsubscribeFocus = navigation.addListener('focus', () => {
            loadScreenData(false);
            syncDriverGpsLocation();
        });

        // Unique channel name per mount so connections never conflict
        const channelName = `driver_jobs_orders_${user?.id || 'courier'}_${Date.now()}`;
        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                (payload: any) => {
                    if (!mounted) return;

                    // 1. Zero-latency instant state update on customer actions
                    if (payload.eventType === 'INSERT') {
                        const newJob = payload.new;
                        if (newJob && newJob.status === 'pending') {
                            setJobs((prevJobs) => {
                                if (prevJobs.some((j) => j.id === newJob.id)) return prevJobs;
                                return [newJob, ...prevJobs];
                            });

                            // Tactile haptic vibration for incoming customer order
                            try {
                                Vibration.vibrate([0, 300, 150, 300]);
                            } catch (_) {}

                            // If driver is online & float is active, open incoming offer sheet
                            if (isOnlineRef.current && !isLockedOutRef.current) {
                                setIncomingOrder(newJob);
                            }
                        }
                    } else if (payload.eventType === 'UPDATE') {
                        const updatedJob = payload.new;
                        if (updatedJob) {
                            if (updatedJob.status !== 'pending') {
                                // Order was claimed by another driver, cancelled by customer, or completed
                                setJobs((prevJobs) => prevJobs.filter((j) => j.id !== updatedJob.id));
                                setIncomingOrder((prev: any) => (prev?.id === updatedJob.id ? null : prev));
                                setSelectedJob((prev: any) => (prev?.id === updatedJob.id ? null : prev));
                            } else {
                                // Order updated while still pending (e.g. fare/notes changed)
                                setJobs((prevJobs) => prevJobs.map((j) => (j.id === updatedJob.id ? updatedJob : j)));
                                setIncomingOrder((prev: any) => (prev?.id === updatedJob.id ? updatedJob : prev));
                                setSelectedJob((prev: any) => (prev?.id === updatedJob.id ? updatedJob : prev));
                            }
                        }
                    } else if (payload.eventType === 'DELETE') {
                        const deletedId = payload.old?.id;
                        if (deletedId) {
                            setJobs((prevJobs) => prevJobs.filter((j) => j.id !== deletedId));
                            setIncomingOrder((prev: any) => (prev?.id === deletedId ? null : prev));
                            setSelectedJob((prev: any) => (prev?.id === deletedId ? null : prev));
                        }
                    }

                    // 2. Silent non-blocking background sync to reconcile
                    fetchPendingJobs(undefined, false);
                }
            )
            .subscribe();

        // Active background polling heartbeat every 6 seconds as a reliable backup
        const pollInterval = setInterval(() => {
            if (mounted) {
                fetchPendingJobs(undefined, false);
            }
        }, 6000);

        return () => {
            mounted = false;
            unsubscribeFocus();
            clearInterval(pollInterval);
            supabase.removeChannel(channel);
        };
    }, [navigation, user?.id]);

    // Recenter map on Mate's current GPS location
    const handleRecenterOnMe = () => {
        if (driverLocation && mapRef.current) {
            mapRef.current.animateToRegion({
                latitude: driverLocation.latitude,
                longitude: driverLocation.longitude,
                latitudeDelta: 0.04,
                longitudeDelta: 0.04,
            }, 500);
        } else {
            syncDriverGpsLocation();
        }
    };

    const visibleJobs = jobs.filter(job => !declinedJobIds.includes(job.id));

    // Render individual Job Card
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
                    onPress={() => {
                        setExpandedJobId(isExpanded ? null : item.id);
                        if (item.pickup_latitude && item.pickup_longitude && mapRef.current) {
                            mapRef.current.animateToRegion({
                                latitude: item.pickup_latitude,
                                longitude: item.pickup_longitude,
                                latitudeDelta: 0.02,
                                longitudeDelta: 0.02,
                            }, 500);
                        }
                    }}
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
                        <Text style={styles.distanceText}>📍 Nearby pickup</Text>
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

    const initialMapRegion = driverLocation
        ? {
              latitude: driverLocation.latitude,
              longitude: driverLocation.longitude,
              latitudeDelta: 0.04,
              longitudeDelta: 0.04,
          }
        : DEFAULT_COORDS;

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

            {/* LIVE MAP BACKGROUND (Centered on Mate's current GPS location) */}
            <MapView
                ref={mapRef}
                provider={PROVIDER_GOOGLE}
                style={StyleSheet.absoluteFillObject}
                initialRegion={initialMapRegion}
                showsUserLocation={false}
                showsCompass={false}
                showsMyLocationButton={false}
                customMapStyle={darkMapStyle}
            >
                {/* Driver's Current GPS Marker */}
                {driverLocation && (
                    <>
                        <Circle
                            center={{ latitude: driverLocation.latitude, longitude: driverLocation.longitude }}
                            radius={150}
                            fillColor="rgba(5, 95, 238, 0.15)"
                            strokeColor="rgba(5, 95, 238, 0.4)"
                            strokeWidth={1.5}
                        />
                        <Marker
                            coordinate={{ latitude: driverLocation.latitude, longitude: driverLocation.longitude }}
                            anchor={{ x: 0.5, y: 0.5 }}
                            title="You (Courier GPS)"
                        >
                            <View style={styles.driverPinOuter}>
                                <View style={styles.driverPinInner}>
                                    <Ionicons name="navigate" size={16} color="#FFFFFF" />
                                </View>
                            </View>
                        </Marker>
                    </>
                )}

                {/* Available Job Markers Plotted on Live Map */}
                {isOnline && visibleJobs.map((job) => {
                    const lat = job.pickup_latitude;
                    const lng = job.pickup_longitude;
                    if (!lat || !lng) return null;

                    const isDelivery = job.service_type === 'delivery';

                    return (
                        <Marker
                            key={job.id}
                            coordinate={{ latitude: lat, longitude: lng }}
                            onPress={() => {
                                setSelectedJob(job);
                                setExpandedJobId(job.id);
                            }}
                        >
                            <View style={styles.jobMarkerPill}>
                                <Text style={styles.jobMarkerIcon}>{isDelivery ? '📦' : '🛒'}</Text>
                                <Text style={styles.jobMarkerFare}>${job.estimated_cost?.toFixed(2) || '0.00'}</Text>
                            </View>
                        </Marker>
                    );
                })}
            </MapView>

            {/* TOP HEADER CONTROLS (Drawer Menu, Online/Offline Toggle, Refresh) */}
            <SafeAreaView style={styles.topSafeArea} edges={['top', 'left', 'right']}>
                <View style={styles.topHeaderCard}>
                    {/* Drawer Toggle Button */}
                    <TouchableOpacity
                        style={styles.headerIconButton}
                        onPress={() => navigation.openDrawer()}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="menu" size={24} color="#0F172A" />
                    </TouchableOpacity>

                    {/* Online / Offline Status Toggle Switch */}
                    <View style={styles.togglePillContainer}>
                        {isLockedOut ? (
                            <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => {
                                    Alert.alert(
                                        'Wallet Locked Out',
                                        `Your float balance ($${walletBalance !== null ? walletBalance.toFixed(2) : '0.00'}) is below the $0.25 minimum threshold. Top up with ClicknPay to go online.`,
                                        [
                                            { text: 'Top Up Now', onPress: () => navigation.navigate('Wallet') },
                                            { text: 'Cancel', style: 'cancel' }
                                        ]
                                    );
                                }}
                                style={styles.lockedPill}
                            >
                                <Text style={styles.lockedPillText}>LOCKED</Text>
                                <Ionicons name="lock-closed" size={14} color="#EF4444" style={{ marginLeft: 4 }} />
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.toggleWrapper}>
                                <View style={[styles.statusDot, isOnline ? styles.statusDotOnline : styles.statusDotOffline]} />
                                <Text style={[styles.toggleStatusText, isOnline ? styles.toggleTextOnline : styles.toggleTextOffline]}>
                                    {isOnline ? 'ONLINE' : 'OFFLINE'}
                                </Text>
                                <Switch
                                    trackColor={{ false: '#CBD5E1', true: '#055FEE' }}
                                    thumbColor="#FFFFFF"
                                    ios_backgroundColor="#CBD5E1"
                                    onValueChange={toggleOnlineStatus}
                                    value={isOnline}
                                />
                            </View>
                        )}
                    </View>

                    {/* View Switcher (Map / List) */}
                    <TouchableOpacity
                        style={[styles.headerIconButton, viewMode === 'list' && styles.headerIconButtonActive]}
                        onPress={() => setViewMode(prev => prev === 'map' ? 'list' : 'map')}
                        activeOpacity={0.8}
                    >
                        <Ionicons name={viewMode === 'map' ? 'list' : 'map'} size={22} color={viewMode === 'list' ? '#FFFFFF' : '#0F172A'} />
                    </TouchableOpacity>
                </View>

                {/* Live Radar Listening Indicator */}
                {isOnline && !isLockedOut && (
                    <View style={styles.listeningRadarBanner}>
                        <View style={styles.radarPulseDot}>
                            <View style={styles.radarInnerDot} />
                        </View>
                        <Text style={styles.listeningRadarText}>
                            LIVE RADAR ACTIVE • LISTENING TO CUSTOMERS
                        </Text>
                    </View>
                )}

                {/* Low Float Warning Banner */}
                {isLowBalance && (
                    <TouchableOpacity
                        style={styles.lowBalanceWarning}
                        activeOpacity={0.85}
                        onPress={() => navigation.navigate('Wallet')}
                    >
                        <Ionicons name="warning" size={16} color="#F59E0B" style={{ marginRight: 6 }} />
                        <Text style={styles.lowBalanceText}>
                            Low Float: ${walletBalance?.toFixed(2)}. Top up soon to avoid lockout.
                        </Text>
                        <Ionicons name="chevron-forward" size={14} color="#F59E0B" />
                    </TouchableOpacity>
                )}

                {/* Notification Permission Reminder Banner */}
                {!hasNotificationPermission && !dismissedNotificationBanner && (
                    <View style={styles.notificationPromptBanner}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                            <Ionicons name="notifications-outline" size={18} color="#055FEE" style={{ marginRight: 8 }} />
                            <Text style={styles.notificationPromptText} numberOfLines={2}>
                                Turn on notifications to receive job offer alerts
                            </Text>
                        </View>
                        <TouchableOpacity style={styles.enableNotifBtn} onPress={handleEnableNotifications}>
                            <Text style={styles.enableNotifBtnTxt}>Enable</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={{ marginLeft: 8 }} onPress={() => setDismissedNotificationBanner(true)}>
                            <Ionicons name="close" size={18} color="#64748B" />
                        </TouchableOpacity>
                    </View>
                )}

                {/* Offline Mode Floating Alert */}
                {!isOnline && (
                    <View style={styles.offlineNoticeBanner}>
                        <Ionicons name="pause-circle" size={18} color="#EF4444" style={{ marginRight: 6 }} />
                        <Text style={styles.offlineNoticeText}>You are currently OFFLINE. Toggle ONLINE to receive delivery requests.</Text>
                    </View>
                )}
            </SafeAreaView>

            {/* FLOATING GPS RE-CENTER BUTTON */}
            {viewMode === 'map' && (
                <TouchableOpacity
                    style={styles.recenterButton}
                    onPress={handleRecenterOnMe}
                    activeOpacity={0.8}
                >
                    <Ionicons name="locate" size={24} color="#055FEE" />
                </TouchableOpacity>
            )}

            {/* CONDITIONAL BOTTOM DRAWER / LIST VIEW */}
            {viewMode === 'list' ? (
                <SafeAreaView style={styles.fullListSafeArea} edges={['bottom', 'left', 'right']}>
                    <View style={styles.fullListHeader}>
                        <Text style={styles.fullListTitle}>Available Jobs ({visibleJobs.length})</Text>
                        <TouchableOpacity onPress={() => fetchPendingJobs()} style={styles.refreshListBtn}>
                            <Ionicons name="reload" size={18} color="#055FEE" />
                        </TouchableOpacity>
                    </View>

                    {isVerified === false ? (
                        <View style={styles.centerContainer}>
                            <BlurView intensity={20} tint="light" style={styles.securityCard}>
                                <Text style={{ fontSize: 32 }}>🛡️</Text>
                                <Text style={styles.securityTitle}>Identity Verification Required</Text>
                                <Text style={styles.securityText}>Please complete a quick selfie check before viewing jobs.</Text>
                                <TouchableOpacity style={styles.verifyBtnContainer} onPress={() => navigation.navigate('SecurityCheck')}>
                                    <LinearGradient colors={['#055FEE', '#5B99F2']} style={styles.verifyBtn}>
                                        <Text style={styles.verifyBtnText}>Start Security Check</Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            </BlurView>
                        </View>
                    ) : isLockedOut ? (
                        <View style={styles.centerContainer}>
                            <BlurView intensity={20} tint="light" style={styles.securityCard}>
                                <Text style={{ fontSize: 32 }}>🔒</Text>
                                <Text style={styles.securityTitle}>Wallet Locked Out</Text>
                                <Text style={styles.securityText}>Float balance is below $0.25. Please top up via ClicknPay.</Text>
                                <TouchableOpacity style={styles.verifyBtnContainer} onPress={() => navigation.navigate('Wallet')}>
                                    <LinearGradient colors={['#055FEE', '#5B99F2']} style={styles.verifyBtn}>
                                        <Text style={styles.verifyBtnText}>Top Up via ClicknPay</Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            </BlurView>
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
                </SafeAreaView>
            ) : (
                /* BOTTOM MAP DRAWER / JOB CAROUSEL */
                <View style={styles.bottomDrawerContainer}>
                    {visibleJobs.length > 0 && isOnline ? (
                        <View style={styles.bottomDrawerWrapper}>
                            <View style={styles.bottomDrawerHeaderRow}>
                                <Text style={styles.bottomDrawerTitle}>
                                    ⚡ {visibleJobs.length} {visibleJobs.length === 1 ? 'Job Available Nearby' : 'Jobs Available Nearby'}
                                </Text>
                                <TouchableOpacity onPress={() => setViewMode('list')}>
                                    <Text style={styles.bottomDrawerViewAll}>View All List →</Text>
                                </TouchableOpacity>
                            </View>
                            <FlatList
                                horizontal
                                data={visibleJobs}
                                keyExtractor={(item) => item.id}
                                renderItem={({ item }) => {
                                    const isDelivery = item.service_type === 'delivery';
                                    return (
                                        <TouchableOpacity
                                            style={styles.bottomJobCard}
                                            activeOpacity={0.9}
                                            onPress={() => {
                                                setSelectedJob(item);
                                                if (item.pickup_latitude && item.pickup_longitude && mapRef.current) {
                                                    mapRef.current.animateToRegion({
                                                        latitude: item.pickup_latitude,
                                                        longitude: item.pickup_longitude,
                                                        latitudeDelta: 0.02,
                                                        longitudeDelta: 0.02,
                                                    }, 500);
                                                }
                                            }}
                                        >
                                            <View style={styles.bottomJobCardHeader}>
                                                <Text style={styles.bottomJobType}>
                                                    {isDelivery ? '📦 Package Delivery' : '🛒 Errand'}
                                                </Text>
                                                <Text style={styles.bottomJobFare}>
                                                    ${item.estimated_cost?.toFixed(2) || '0.00'}
                                                </Text>
                                            </View>
                                            <Text style={styles.bottomJobAddress} numberOfLines={1}>
                                                📍 {item.pickup_address || item.errand_location || 'Pickup location'}
                                            </Text>
                                            <View style={styles.bottomJobActions}>
                                                <TouchableOpacity
                                                    style={styles.bottomBidBtn}
                                                    onPress={() => {
                                                        setSelectedJob(item);
                                                        setOfferModalVisible(true);
                                                    }}
                                                >
                                                    <Text style={styles.bottomBidBtnText}>Bid</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={styles.bottomAcceptBtn}
                                                    onPress={() => handleAcceptDirectly(item)}
                                                >
                                                    <Text style={styles.bottomAcceptBtnText}>Accept</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                }}
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                            />
                        </View>
                    ) : (
                        <View style={styles.bottomEmptyPill}>
                            <View style={styles.bottomEmptyListeningRow}>
                                {isOnline && !isLockedOut && (
                                    <View style={styles.radarPulseDot}>
                                        <View style={styles.radarInnerDot} />
                                    </View>
                                )}
                                <Text style={styles.bottomEmptyPillText}>
                                    {!isOnline
                                        ? '🔴 You are offline. Toggle ONLINE above to receive customer requests.'
                                        : '🟢 Live Radar Active — Listening for customer requests in your area...'}
                                </Text>
                            </View>
                        </View>
                    )}
                </View>
            )}

            {/* OVERLAYING INCOMING JOB OFFER MODAL */}
            <Modal
                visible={!!incomingOrder}
                transparent
                animationType="slide"
                onRequestClose={() => setIncomingOrder(null)}
            >
                <View style={styles.incomingModalBackdrop}>
                    <View style={styles.incomingCard}>
                        <View style={styles.incomingHeader}>
                            <View style={styles.incomingBadge}>
                                <Text style={styles.incomingBadgePulse}>🚨</Text>
                                <Text style={styles.incomingBadgeText}>NEW DELIVERY REQUEST</Text>
                            </View>
                            <TouchableOpacity onPress={() => setIncomingOrder(null)} style={styles.incomingCloseBtn}>
                                <Text style={styles.incomingCloseTxt}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.incomingFareRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.incomingServiceType}>
                                    {incomingOrder?.service_type === 'delivery' ? '📦 Package Delivery' : '🛒 Errand Request'}
                                </Text>
                                <Text style={styles.incomingPaymentMethod}>
                                    {incomingOrder?.payment_method === 'cash_on_delivery' ? '💵 Cash on Delivery' : '💳 Digital Payment'}
                                </Text>
                            </View>
                            <View style={styles.incomingFareBadge}>
                                <Text style={styles.incomingFareAmount}>${parseFloat(incomingOrder?.estimated_cost || 0).toFixed(2)}</Text>
                                <Text style={styles.incomingFareLabel}>USD</Text>
                            </View>
                        </View>

                        <View style={styles.incomingRouteBox}>
                            <View style={styles.incomingRouteItem}>
                                <Text style={styles.incomingRouteIcon}>📍</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.incomingRouteLabel}>PICKUP</Text>
                                    <Text style={styles.incomingRouteVal} numberOfLines={2}>
                                        {incomingOrder?.pickup_address || incomingOrder?.errand_location || 'Specified pickup location'}
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.incomingRouteDivider} />
                            <View style={styles.incomingRouteItem}>
                                <Text style={styles.incomingRouteIcon}>🏁</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.incomingRouteLabel}>DROPOFF</Text>
                                    <Text style={styles.incomingRouteVal} numberOfLines={2}>
                                        {incomingOrder?.dropoff_address || 'Specified dropoff location'}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.incomingActions}>
                            <TouchableOpacity
                                style={styles.incomingAcceptBtn}
                                onPress={() => handleAcceptDirectly(incomingOrder)}
                                disabled={acceptingIncoming}
                                activeOpacity={0.8}
                            >
                                <LinearGradient
                                    colors={['#055FEE', '#5B99F2']}
                                    style={styles.incomingAcceptGradient}
                                >
                                    {acceptingIncoming ? (
                                        <ActivityIndicator color="#FFF" size="small" />
                                    ) : (
                                        <Text style={styles.incomingAcceptTxt}>✓ Accept Job Now</Text>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>

                            <View style={styles.incomingSecondaryRow}>
                                <TouchableOpacity
                                    style={styles.incomingViewBtn}
                                    onPress={() => {
                                        const orderToBid = incomingOrder;
                                        setIncomingOrder(null);
                                        setSelectedJob(orderToBid);
                                        setOfferModalVisible(true);
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.incomingViewTxt}>View Details / Bid →</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.incomingDeclineBtn}
                                    onPress={() => setIncomingOrder(null)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.incomingDeclineTxt}>Decline</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* CUSTOM BID / JOB OFFER SHEET */}
            <JobOfferModal
                visible={offerModalVisible}
                onClose={() => setOfferModalVisible(false)}
                order={selectedJob}
                onOfferSubmitted={fetchPendingJobs}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F172A',
    },
    topSafeArea: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        paddingHorizontal: 16,
    },
    topHeaderCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: 20,
        paddingVertical: 10,
        paddingHorizontal: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 6,
    },
    headerIconButton: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerIconButtonActive: {
        backgroundColor: '#055FEE',
    },
    togglePillContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    toggleWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        paddingVertical: 4,
        paddingHorizontal: 12,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 6,
    },
    statusDotOnline: {
        backgroundColor: '#10B981',
    },
    statusDotOffline: {
        backgroundColor: '#EF4444',
    },
    toggleStatusText: {
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: 0.5,
        marginRight: 8,
    },
    toggleTextOnline: {
        color: '#055FEE',
    },
    toggleTextOffline: {
        color: '#64748B',
    },
    lockedPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: 20,
    },
    lockedPillText: {
        color: '#EF4444',
        fontSize: 13,
        fontWeight: '800',
    },
    lowBalanceWarning: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEF3C7',
        borderRadius: 14,
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginTop: 8,
        borderWidth: 1,
        borderColor: '#FDE68A',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 3,
    },
    lowBalanceText: {
        flex: 1,
        color: '#92400E',
        fontSize: 12,
        fontWeight: '600',
    },
    notificationPromptBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#EFF6FF',
        borderRadius: 14,
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginTop: 8,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    notificationPromptText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#1E40AF',
    },
    enableNotifBtn: {
        backgroundColor: '#055FEE',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
    },
    enableNotifBtnTxt: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
    offlineNoticeBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.88)',
        borderRadius: 14,
        paddingVertical: 8,
        paddingHorizontal: 14,
        marginTop: 8,
    },
    offlineNoticeText: {
        color: '#F8FAFC',
        fontSize: 12,
        fontWeight: '600',
    },
    driverPinOuter: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(5, 95, 238, 0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    driverPinInner: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: '#055FEE',
        borderWidth: 2,
        borderColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 4,
    },
    jobMarkerPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#10B981',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 18,
        borderWidth: 2,
        borderColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 6,
    },
    jobMarkerIcon: {
        fontSize: 14,
        marginRight: 4,
    },
    jobMarkerFare: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '800',
    },
    recenterButton: {
        position: 'absolute',
        right: 18,
        bottom: 180,
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
        elevation: 6,
        zIndex: 40,
    },
    bottomDrawerContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
    },
    bottomDrawerWrapper: {
        backgroundColor: 'rgba(255, 255, 255, 0.96)',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingTop: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
        elevation: 10,
    },
    bottomDrawerHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginBottom: 12,
    },
    bottomDrawerTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#0F172A',
    },
    bottomDrawerViewAll: {
        fontSize: 13,
        fontWeight: '700',
        color: '#055FEE',
    },
    bottomJobCard: {
        width: SCREEN_WIDTH * 0.78,
        backgroundColor: '#F8FAFC',
        borderRadius: 18,
        padding: 14,
        marginRight: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    bottomJobCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    bottomJobType: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1E293B',
    },
    bottomJobFare: {
        fontSize: 18,
        fontWeight: '800',
        color: '#055FEE',
    },
    bottomJobAddress: {
        fontSize: 13,
        color: '#64748B',
        marginBottom: 12,
    },
    bottomJobActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    bottomBidBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: 'rgba(5, 95, 238, 0.1)',
        alignItems: 'center',
    },
    bottomBidBtnText: {
        color: '#055FEE',
        fontWeight: '700',
        fontSize: 13,
    },
    bottomAcceptBtn: {
        flex: 1.2,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: '#10B981',
        alignItems: 'center',
    },
    bottomAcceptBtnText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 13,
    },
    listeningRadarBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ECFDF5',
        borderColor: '#A7F3D0',
        borderWidth: 1,
        paddingVertical: 7,
        paddingHorizontal: 14,
        borderRadius: 20,
        alignSelf: 'center',
        marginTop: 10,
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
        elevation: 2,
    },
    listeningRadarText: {
        color: '#047857',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    radarPulseDot: {
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: 'rgba(16, 185, 129, 0.25)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    radarInnerDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#10B981',
    },
    bottomEmptyPill: {
        marginHorizontal: 20,
        marginBottom: 20,
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        borderRadius: 20,
        paddingVertical: 12,
        paddingHorizontal: 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
        elevation: 6,
    },
    bottomEmptyListeningRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    bottomEmptyPillText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
    },
    fullListSafeArea: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        marginTop: 80,
    },
    fullListHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    fullListTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#0F172A',
    },
    refreshListBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#E2E8F0',
        alignItems: 'center',
        justifyContent: 'center',
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
        backgroundColor: 'rgba(255,255,255,0.6)',
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
    headerRight: {
        alignItems: 'flex-end',
    },
    chevronIcon: {
        fontSize: 12,
        color: '#64748B',
        marginTop: 2,
    },
    cardBadgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    distanceText: {
        fontSize: 13,
        color: '#64748B',
        fontWeight: '600',
    },
    jobPaymentBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    jobPaymentBadgeCod: {
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
    },
    jobPaymentBadgeDigital: {
        backgroundColor: 'rgba(5, 95, 238, 0.12)',
    },
    jobPaymentBadgeText: {
        fontSize: 12,
        fontWeight: '700',
    },
    jobPaymentBadgeTextCod: {
        color: '#059669',
    },
    jobPaymentBadgeTextDigital: {
        color: '#055FEE',
    },
    locationContainer: {
        backgroundColor: 'rgba(255,255,255,0.8)',
        borderRadius: 16,
        padding: 14,
        marginBottom: 16,
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
        marginRight: 10,
    },
    timelineDotEnd: {
        backgroundColor: '#10B981',
    },
    timelineLine: {
        width: 2,
        height: 14,
        backgroundColor: '#CBD5E1',
        marginLeft: 4,
        marginVertical: 2,
    },
    locationText: {
        flex: 1,
        fontSize: 13,
        color: '#334155',
        fontWeight: '500',
    },
    locationLabel: {
        color: '#64748B',
        fontWeight: '600',
    },
    expandedDetails: {
        marginTop: 8,
        paddingTop: 10,
    },
    expandedSeparator: {
        height: 1,
        backgroundColor: '#E2E8F0',
        marginBottom: 10,
    },
    detailsLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#64748B',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    detailsValue: {
        fontSize: 14,
        color: '#1E293B',
        lineHeight: 20,
    },
    viewingIndicatorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
    },
    viewingIndicatorDot: {
        fontSize: 8,
        marginRight: 6,
    },
    viewingIndicatorText: {
        fontSize: 12,
        color: '#059669',
        fontWeight: '600',
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 12,
    },
    rejectButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.8)',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    rejectText: {
        color: '#64748B',
        fontWeight: '700',
        fontSize: 14,
    },
    bidButton: {
        flex: 1.3,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(5, 95, 238, 0.1)',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(5, 95, 238, 0.2)',
    },
    bidButtonText: {
        color: '#055FEE',
        fontWeight: '700',
        fontSize: 14,
    },
    acceptButtonContainer: {
        flex: 1.5,
        borderRadius: 12,
        overflow: 'hidden',
    },
    acceptGradient: {
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    acceptText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 15,
    },
    priorityPillContainer: {
        marginBottom: 10,
    },
    priorityPill: {
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 8,
        alignSelf: 'flex-start',
    },
    priorityPillText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '800',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    securityCard: {
        borderRadius: 24,
        padding: 28,
        width: '100%',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(176, 106, 40, 0.3)',
        backgroundColor: 'rgba(255,255,255,0.7)',
    },
    securityTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
        marginTop: 12,
        marginBottom: 6,
        textAlign: 'center',
    },
    securityText: {
        fontSize: 14,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 20,
    },
    verifyBtnContainer: {
        width: '100%',
        borderRadius: 14,
        overflow: 'hidden',
    },
    verifyBtn: {
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    verifyBtnText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 15,
    },
    emptyIconCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1E293B',
        marginBottom: 6,
    },
    emptyText: {
        fontSize: 14,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 22,
    },
    // Incoming Order Modal Styles
    incomingModalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        justifyContent: 'flex-end',
        padding: 16,
    },
    incomingCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 28,
        padding: 22,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 10,
    },
    incomingHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    incomingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    incomingBadgePulse: {
        fontSize: 14,
        marginRight: 6,
    },
    incomingBadgeText: {
        color: '#DC2626',
        fontWeight: '800',
        fontSize: 12,
        letterSpacing: 0.5,
    },
    incomingCloseBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    incomingCloseTxt: {
        fontSize: 16,
        color: '#64748B',
        fontWeight: '700',
    },
    incomingFareRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        backgroundColor: '#F8FAFC',
        padding: 14,
        borderRadius: 16,
    },
    incomingServiceType: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0F172A',
    },
    incomingPaymentMethod: {
        fontSize: 13,
        color: '#64748B',
        marginTop: 2,
    },
    incomingFareBadge: {
        alignItems: 'flex-end',
    },
    incomingFareAmount: {
        fontSize: 24,
        fontWeight: '800',
        color: '#055FEE',
    },
    incomingFareLabel: {
        fontSize: 11,
        color: '#64748B',
        fontWeight: '700',
    },
    incomingRouteBox: {
        backgroundColor: '#F1F5F9',
        borderRadius: 16,
        padding: 14,
        marginBottom: 18,
    },
    incomingRouteItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    incomingRouteIcon: {
        fontSize: 16,
        marginRight: 10,
        marginTop: 2,
    },
    incomingRouteLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: '#94A3B8',
        letterSpacing: 0.5,
    },
    incomingRouteVal: {
        fontSize: 13,
        fontWeight: '600',
        color: '#1E293B',
        marginTop: 2,
    },
    incomingRouteDivider: {
        height: 1,
        backgroundColor: '#E2E8F0',
        marginVertical: 10,
        marginLeft: 26,
    },
    incomingActions: {
        gap: 10,
    },
    incomingAcceptBtn: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    incomingAcceptGradient: {
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    incomingAcceptTxt: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    incomingSecondaryRow: {
        flexDirection: 'row',
        gap: 10,
    },
    incomingViewBtn: {
        flex: 1.5,
        backgroundColor: '#F1F5F9',
        paddingVertical: 13,
        borderRadius: 14,
        alignItems: 'center',
    },
    incomingViewTxt: {
        color: '#055FEE',
        fontWeight: '700',
        fontSize: 14,
    },
    incomingDeclineBtn: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        paddingVertical: 13,
        borderRadius: 14,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    incomingDeclineTxt: {
        color: '#64748B',
        fontWeight: '700',
        fontSize: 14,
    },
});
