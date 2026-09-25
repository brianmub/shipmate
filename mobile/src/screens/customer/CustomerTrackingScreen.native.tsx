import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, StatusBar, Platform, Linking, Alert, Image, Modal, TextInput, BackHandler, AppState, AppStateStatus, Animated, Dimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, Circle } from 'react-native-maps';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { supabase } from '../../utils/supabase';
import { OfferSelectionPanel } from '../../components/OfferSelectionPanel';
import { CustomerRatingModal } from '../../components/CustomerRatingModal';
import { InAppCallModal } from '../../components/InAppCallModal';
import { InAppChatModal } from '../../components/InAppChatModal';
import { orderService } from '../../services/orderService';
import { useAuthStore } from '../../store/authStore';
import { chatService } from '../../services/chatService';

export const ACTIVE_TRIP_STATUSES = [
    'driver_assigned',
    'en_route_to_pickup',
    'arrived_at_pickup',
    'picked_up',
    'en_route_to_delivery',
    'arrived_at_delivery',
    'in_delivery',
    'en_route',
    'arrived',
    'accepted',
    'in_progress'
];

export const CustomerTrackingScreen = ({ route, navigation }: any) => {
    const insets = useSafeAreaInsets();
    const { orderId } = route.params;
    const { user } = useAuthStore();
    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [inAppCallVisible, setInAppCallVisible] = useState(false);
    const [isIncomingCall, setIsIncomingCall] = useState(false);
    const [inAppChatVisible, setInAppChatVisible] = useState(false);

    // Draggable BottomSheet Snap Points & Animated Pulsing State
    const snapPoints = useMemo(() => ['12%', '45%', '85%'], []);
    const bottomSheetRef = useRef<BottomSheet>(null);
    const [sheetIndex, setSheetIndex] = useState(0);
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        const isSearchingState = !order || order.status === 'pending' || order.status === 'searching';
        if (isSearchingState) {
            const animation = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.6,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                ])
            );
            animation.start();
            return () => animation.stop();
        }
    }, [order?.status]);

    // Watch for deep-linked / in-app banner incoming call triggers
    useEffect(() => {
        if (route?.params?.openCall) {
            setIsIncomingCall(!!route.params.isIncoming);
            setInAppCallVisible(true);
        }
    }, [route?.params?.openCall, route?.params?.isIncoming]);

    // Watch for deep-linked / in-app message triggers
    useEffect(() => {
        if (route?.params?.openChat) {
            setInAppChatVisible(true);
        }
    }, [route?.params?.openChat]);

    // Intercept hardware back button on Android during active trip to prevent leaving map
    useEffect(() => {
        const onBackPress = () => {
            if (order && ACTIVE_TRIP_STATUSES.includes(order.status)) {
                Alert.alert(
                    "Trip in Progress",
                    "Your Mate is actively on this delivery. The live tracking map remains active until completion."
                );
                return true;
            }
            return false;
        };

        const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => sub.remove();
    }, [order?.status]);

    // Lock customer on tracking map: intercept React Navigation beforeRemove during active trip
    useEffect(() => {
        const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
            if (order && ACTIVE_TRIP_STATUSES.includes(order.status)) {
                e.preventDefault();
                Alert.alert(
                    "Trip in Progress",
                    "Your Mate is actively handling this delivery. The live map remains your persistent base view until completed or cancelled."
                );
            }
        });
        return unsubscribe;
    }, [navigation, order?.status]);

    const [viewingCouriers, setViewingCouriers] = useState<any[]>([]);
    const [liveBids, setLiveBids] = useState<any[]>([]);
    const [offers, setOffers] = useState<any[]>([]);
    const [offersLoading, setOffersLoading] = useState(false);
    const [acknowledging, setAcknowledging] = useState(false);
    const [showRatingModal, setShowRatingModal] = useState(false);
    const [ratingDismissed, setRatingDismissed] = useState(false);
    const autoPromptedRatingRef = useRef(false);
    const [unreadChatCount, setUnreadChatCount] = useState(0);
    const [driverHeading, setDriverHeading] = useState(0);
    const [animatedDriverCoord, setAnimatedDriverCoord] = useState<{ latitude: number; longitude: number } | null>(null);
    const mapRef = useRef<MapView>(null);
    const animFrameRef = useRef<number | null>(null);
    const prevCoordRef = useRef<{ latitude: number; longitude: number } | null>(null);
    const presenceChannelRef = useRef<any>(null);

    // Nearby Available Mates & inDrive Matchmaking States
    const [nearbyDrivers, setNearbyDrivers] = useState<any[]>([]);
    const [searchElapsedSeconds, setSearchElapsedSeconds] = useState(0);
    const [searchRadiusKm, setSearchRadiusKm] = useState(5);
    const [searchPhase, setSearchPhase] = useState<'scanning' | 'expanding' | 'wide' | 'timeout'>('scanning');
    const [boostingOffer, setBoostingOffer] = useState(false);

    // Cancellation & Release & Timer States
    const [cancelModalVisible, setCancelModalVisible] = useState(false);
    const [cancelReason, setCancelReason] = useState('Changed my mind');
    const [cancelling, setCancelling] = useState(false);
    const [timerSecondsLeft, setTimerSecondsLeft] = useState<number | null>(null);
    const [disputeModalVisible, setDisputeModalVisible] = useState(false);
    const [disputeReason, setDisputeReason] = useState('');
    const [submittingDispute, setSubmittingDispute] = useState(false);
    const [acceptingCompensation, setAcceptingCompensation] = useState(false);

    const fetchOrder = async () => {
        try {
            const { data, error } = await supabase
                .from('orders')
                .select(`
                    *,
                    driver:driver_id(full_name, phone)
                `)
                .eq('id', orderId)
                .single();

            if (error) throw error;

            // Defensive resolution of driver phone if null
            if (data && data.driver_id && (!data.driver?.phone || !data.driver_phone)) {
                let dPhone = data.driver_phone || data.driver?.phone || null;
                if (!dPhone) {
                    try {
                        const { data: dProfile } = await supabase
                            .from('drivers')
                            .select('emergency_contact_phone')
                            .eq('id', data.driver_id)
                            .single();
                        dPhone = dProfile?.emergency_contact_phone || null;
                    } catch (dErr) {
                        console.warn('Non-blocking: could not fetch driver emergency phone:', dErr);
                    }
                }
                if (!data.driver) {
                    data.driver = { full_name: 'Your Mate', phone: dPhone };
                } else if (!data.driver.phone) {
                    data.driver.phone = dPhone;
                }
                if (!data.driver_phone) {
                    data.driver_phone = dPhone;
                }
            }

            setOrder(data);
        } catch (error: any) {
            console.error('Error fetching tracking order:', error.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchOffers = async () => {
        setOffersLoading(true);
        try {
            const data = await orderService.getOrderOffers(orderId);
            setOffers(data || []);
        } catch (error: any) {
            console.error('Error fetching offers:', error.message);
        } finally {
            setOffersLoading(false);
        }
    };

    const fetchNearbyDrivers = async (radius: number = searchRadiusKm) => {
        if (!orderId) return;
        const lat = parseFloat(order?.pickup_latitude || order?.dropoff_latitude || "-17.8248");
        const lng = parseFloat(order?.pickup_longitude || order?.dropoff_longitude || "31.0530");
        try {
            const drivers = await orderService.getNearbyDrivers(lat, lng, radius);
            setNearbyDrivers(drivers || []);
        } catch (err) {
            console.warn('Error fetching nearby drivers:', err);
        }
    };

    const handleRetrySearch = () => {
        setSearchElapsedSeconds(0);
        setSearchPhase('scanning');
        setSearchRadiusKm(15);
        fetchNearbyDrivers(15);
    };

    const handleBoostOffer = async (amount: number) => {
        if (!order) return;
        try {
            setBoostingOffer(true);
            await orderService.boostOrderOffer(order.id, amount);
            Alert.alert("Offer Boosted! 🚀", `Added +$${amount.toFixed(2)} USD tip. Nearby Mates have been alerted with the updated price!`);
            fetchOrder();
            setSearchElapsedSeconds((prev) => Math.max(0, prev - 25));
        } catch (err: any) {
            Alert.alert("Error", err.message || "Failed to boost offer");
        } finally {
            setBoostingOffer(false);
        }
    };

    const handleAcceptOffer = async (offer: any) => {
        try {
            setLoading(true);
            const mateId = offer.driver_id || offer.driver?.id || offer.mate_id;
            const acceptedAmount = Number(offer.offer_amount || offer.amount);

            // Step 5: Atomic Accept via Edge Function
            const { data, error } = await supabase.functions.invoke('accept-request', {
                body: {
                    request_id: orderId,
                    mate_id: mateId,
                    accepted_amount: acceptedAmount,
                },
            });

            // Handle 409 Conflict path
            if (error) {
                let errorMsg = error.message;
                try {
                    if (error.context && typeof error.context.json === 'function') {
                        const errJson = await error.context.json();
                        if (errJson?.error) errorMsg = errJson.error;
                    }
                } catch (_) {}

                if (error.status === 409 || errorMsg?.includes('unavailable') || errorMsg?.includes('REQUEST_ALREADY_ACCEPTED_OR_EXPIRED')) {
                    if (presenceChannelRef.current && errorMsg?.includes('REQUEST_ALREADY_ACCEPTED_OR_EXPIRED')) {
                        console.log(`[RealtimeLifecycle:UNSUBSCRIBE] request:${orderId} (app: customer, reason: request_conflict_expired)`);
                        supabase.removeChannel(presenceChannelRef.current);
                        presenceChannelRef.current = null;
                    }
                    Alert.alert(
                        "Courier Unavailable",
                        "This driver just became unavailable, please pick another."
                    );
                    setLiveBids((prev) => prev.filter((b) => b.mate_id !== mateId));
                    setOffers((prev) => prev.filter((o) => (o.driver_id || o.driver?.id) !== mateId));
                    return;
                }

                // Fallback for legacy order_offers
                console.warn('accept-request edge function error:', error.message);
                try {
                    await orderService.acceptOffer(orderId, offer.id, mateId);
                    Alert.alert("Success", "Mate assigned successfully! They are on their way.");
                    fetchOrder();
                    return;
                } catch (legacyErr: any) {
                    Alert.alert("Error", errorMsg || legacyErr.message);
                    return;
                }
            }

            if (data?.success) {
                // Step 6: Immediately tear down presence channel on assignment success
                if (presenceChannelRef.current) {
                    console.log(`[RealtimeLifecycle:UNSUBSCRIBE] request:${orderId} (app: customer, reason: request_accepted_success)`);
                    supabase.removeChannel(presenceChannelRef.current);
                    presenceChannelRef.current = null;
                }
                Alert.alert(
                    "Offer Confirmed! 🎉",
                    `${data.mate?.full_name || 'Courier'} has been assigned to your delivery.`
                );
                setOrder((prev: any) => prev ? ({
                    ...prev,
                    status: 'driver_assigned',
                    driver_id: mateId,
                    driver: data.mate || prev.driver,
                    accepted_amount: acceptedAmount,
                }) : prev);
                fetchOrder();
            } else if (data?.code === 'REQUEST_ALREADY_ACCEPTED_OR_EXPIRED') {
                Alert.alert(
                    "Courier Unavailable",
                    "This driver just became unavailable, please pick another."
                );
                setLiveBids((prev) => prev.filter((b) => b.mate_id !== mateId));
                setOffers((prev) => prev.filter((o) => (o.driver_id || o.driver?.id) !== mateId));
            }
        } catch (error: any) {
            Alert.alert("Error", error.message);
        } finally {
            setLoading(false);
        }
    };

    // Combine standard order offers with real-time live counter-offer bids (Step 4)
    const combinedOffers = useMemo(() => {
        const result = [...offers];

        liveBids.forEach((bid) => {
            const existingIdx = result.findIndex(
                (o) => o.driver_id === bid.mate_id || o.driver?.id === bid.mate_id
            );

            const formattedBidOffer = {
                id: `live_bid_${bid.mate_id}`,
                order_id: orderId,
                driver_id: bid.mate_id,
                offer_amount: Number(bid.amount),
                pickup_time_estimate: bid.pickup_time_estimate || bid.eta || 10,
                driver_latitude: bid.driver_latitude,
                driver_longitude: bid.driver_longitude,
                status: 'pending',
                is_live_bid: true,
                driver: {
                    id: bid.mate_id,
                    full_name: bid.driver_name || 'Courier',
                    avatar_url: bid.driver_avatar || null,
                    average_rating: 5.0,
                    tier: 'standard',
                },
            };

            if (existingIdx >= 0) {
                // Upsert: latest bid replaces earlier offer
                result[existingIdx] = { ...result[existingIdx], ...formattedBidOffer };
            } else {
                result.unshift(formattedBidOffer);
            }
        });

        return result;
    }, [offers, liveBids, orderId]);

    const handleAcknowledgeDelivery = () => {
        setShowRatingModal(true);
    };

    const handleRatingSubmit = async (rating: number, feedback: string) => {
        try {
            setAcknowledging(true);
            await orderService.acknowledgeDelivery(orderId, rating, feedback);
            setShowRatingModal(false);
            setRatingDismissed(true);
            Alert.alert("Thank You!", "Your rating has been submitted and delivery acknowledged.");
            fetchOrder();
        } catch (error: any) {
            Alert.alert("Error", error.message || "Failed to acknowledge delivery.");
        } finally {
            setAcknowledging(false);
        }
    };

    // Auto-prompt rating modal on final handover delivery completion
    useEffect(() => {
        if (!order) return;
        const isFinished = order.status === 'completed' || order.status === 'delivered';
        const isNotAcknowledged = !order.customer_acknowledged && !order.customer_rating;

        if (isFinished && isNotAcknowledged && !autoPromptedRatingRef.current && !ratingDismissed) {
            autoPromptedRatingRef.current = true;
            const timer = setTimeout(() => {
                setShowRatingModal(true);
            }, 400);
            return () => clearTimeout(timer);
        }
    }, [order?.status, order?.customer_acknowledged, order?.customer_rating, ratingDismissed]);

    const getCancellationFee = (km: number = 0) => {
        if (km < 0.5) return 0;
        if (km <= 1.0) return 0.50;
        return Math.round(km * 0.25 * 100) / 100;
    };

    const formatTimer = (seconds: number | null) => {
        if (seconds === null) return '05:00';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // 5-Minute Arrival Countdown Timer (Push Alert Only; Zero SMS/WhatsApp)
    useEffect(() => {
        if (!order?.arrival_timer_started_at && order?.status !== 'arrived_at_delivery') {
            setTimerSecondsLeft(null);
            return;
        }

        const startTime = order.arrival_timer_started_at ? new Date(order.arrival_timer_started_at).getTime() : Date.now();
        const updateTimer = () => {
            const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            const remaining = Math.max(0, 300 - elapsedSeconds);
            setTimerSecondsLeft(remaining);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [order?.arrival_timer_started_at, order?.status]);

    const handleConfirmCancel = async () => {
        if (!order || !user) return;
        setCancelling(true);
        try {
            // Step 6: Immediately tear down presence channel on manual cancellation
            if (presenceChannelRef.current) {
                console.log(`[RealtimeLifecycle:UNSUBSCRIBE] request:${orderId} (app: customer, reason: manual_cancellation)`);
                supabase.removeChannel(presenceChannelRef.current);
                presenceChannelRef.current = null;
            }
            const result = await orderService.cancelOrderByCustomer(order.id, user.id, cancelReason);
            setCancelModalVisible(false);
            const fee = result?.cancellation_fee || 0;
            if (fee > 0) {
                Alert.alert(
                    'Order Cancelled',
                    `Your order was cancelled. A fee of $${fee.toFixed(2)} USD for courier distance has been recorded.`,
                    [{ text: 'OK', onPress: () => navigation.navigate('CustomerTabs') }]
                );
            } else {
                Alert.alert('Order Cancelled', 'Your order was cancelled free of charge.', [
                    { text: 'OK', onPress: () => navigation.navigate('CustomerTabs') }
                ]);
            }
            fetchOrder();
        } catch (err: any) {
            Alert.alert('Cancellation Error', err?.message || 'Failed to cancel order.');
        } finally {
            setCancelling(false);
        }
    };

    const handleAcceptCompensation = async () => {
        if (!order || !user) return;
        setAcceptingCompensation(true);
        try {
            await orderService.respondToReleaseCompensation(order.id, user.id, true);
            Alert.alert('Compensation Accepted', 'The courier compensation was approved. Your order has been re-opened for bids.');
            fetchOrder();
        } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to accept compensation.');
        } finally {
            setAcceptingCompensation(false);
        }
    };

    const handleDisputeCompensation = async () => {
        if (!order || !user) return;
        if (!disputeReason.trim()) {
            Alert.alert('Reason Required', 'Please provide a brief reason for disputing this release compensation.');
            return;
        }
        setSubmittingDispute(true);
        try {
            await orderService.respondToReleaseCompensation(order.id, user.id, false, disputeReason.trim());
            setDisputeModalVisible(false);
            Alert.alert('Dispute Logged', 'This delivery has been marked as Disputed. Our support team will review courier trip logs.');
            fetchOrder();
        } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to submit dispute.');
        } finally {
            setSubmittingDispute(false);
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'driver_assigned': return 'Mate assigned';
            case 'en_route_to_pickup': return 'Mate heading to pickup';
            case 'arrived_at_pickup': return 'Mate arrived at pickup';
            case 'picked_up': return 'Package collected';
            case 'en_route_to_delivery': return 'Mate heading to delivery';
            case 'arrived_at_delivery': return 'Mate arrived at delivery';
            case 'delivered': return order.customer_acknowledged ? 'Delivery Completed' : 'Delivered - Pending Confirmation';
            case 'completed': return 'Delivery Completed';
            case 'cancelled': return 'Cancelled';
            case 'disputed': return '⚠️ Disputed';
            case 'failed': return 'Failed';
            default: return 'Pending';
        }
    };

    useEffect(() => {
        fetchOrder();
        fetchOffers();
        fetchNearbyDrivers(5);

        const channel = supabase
            .channel(`public:tracking_${orderId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, (payload) => {
                if (payload.new?.driver_id && (!order?.driver_id || !order?.driver?.phone)) {
                    fetchOrder();
                } else {
                    setOrder((prev: any) => ({ ...prev, ...payload.new }));
                }
            })
            .subscribe();

        const offersChannel = supabase
            .channel(`public:offers_${orderId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_offers', filter: `order_id=eq.${orderId}` }, (payload) => {
                fetchOffers();
            })
            .subscribe();

        // Listen for online driver location updates
        const driversChannel = supabase
            .channel(`public:drivers_tracking_${orderId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
                fetchNearbyDrivers(searchRadiusKm);
            })
            .subscribe();

        // inDrive-style progressive matchmaking timer
        const timer = setInterval(() => {
            setSearchElapsedSeconds((prev) => {
                const next = prev + 1;
                if (next >= 60) {
                    setSearchPhase('timeout');
                    setSearchRadiusKm(25);
                    // Step 6: Teardown channel when matchmaking reaches timeout
                    if (presenceChannelRef.current) {
                        console.log(`[RealtimeLifecycle:UNSUBSCRIBE] request:${orderId} (app: customer, reason: search_timeout_expired)`);
                        supabase.removeChannel(presenceChannelRef.current);
                        presenceChannelRef.current = null;
                    }
                } else if (next >= 35) {
                    setSearchPhase('wide');
                    setSearchRadiusKm(20);
                } else if (next >= 15) {
                    setSearchPhase('expanding');
                    setSearchRadiusKm(10);
                } else {
                    setSearchPhase('scanning');
                    setSearchRadiusKm(5);
                }
                return next;
            });
        }, 1000);

        // Polling interval to refresh nearby Mates every 10 seconds
        const pollInterval = setInterval(() => {
            fetchNearbyDrivers(searchRadiusKm);
        }, 10000);

        return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(offersChannel);
            supabase.removeChannel(driversChannel);
            clearInterval(timer);
            clearInterval(pollInterval);
        };
    }, [orderId, searchRadiusKm]);

    // Dedicated Presence & Live Bidding Channel Lifecycle (Step 6)
    useEffect(() => {
        if (!orderId) return;

        const isSearching = !order || order.status === 'searching' || order.status === 'pending';
        if (!isSearching) {
            if (presenceChannelRef.current) {
                console.log(`[RealtimeLifecycle:UNSUBSCRIBE] request:${orderId} (app: customer, reason: status_not_searching)`);
                supabase.removeChannel(presenceChannelRef.current);
                presenceChannelRef.current = null;
            }
            return;
        }

        if (presenceChannelRef.current) {
            console.log(`[RealtimeLifecycle:UNSUBSCRIBE] request:${orderId} (app: customer, reason: refreshing_subscription)`);
            supabase.removeChannel(presenceChannelRef.current);
            presenceChannelRef.current = null;
        }

        console.log(`[RealtimeLifecycle:SUBSCRIBE] request:${orderId} (app: customer, reason: mount_searching)`);
        const channel = supabase.channel(`request:${orderId}`);
        presenceChannelRef.current = channel;

        const syncViewersFromPresence = (targetChannel: any) => {
            if (!targetChannel) return;
            const state = targetChannel.presenceState();
            const viewers: any[] = [];
            (Object.values(state) as any[]).forEach((presences: any[]) => {
                presences.forEach((presence: any) => {
                    viewers.push({
                        id: presence.mate_id || presence.presence_ref,
                        full_name: presence.name || 'Courier',
                        avatar_url: presence.avatar_url || null,
                    });
                });
            });
            const uniqueViewers = viewers.filter(
                (v, index, self) => self.findIndex((t) => t.id === v.id) === index
            );
            setViewingCouriers(uniqueViewers);
        };

        channel
            .on('presence', { event: 'sync' }, () => {
                syncViewersFromPresence(channel);
            })
            .on('broadcast', { event: 'bid' }, ({ payload }) => {
                if (!payload || !payload.mate_id) return;
                const bidAmount = Number(payload.amount);
                if (isNaN(bidAmount) || bidAmount <= 0) return;
                if (order?.expires_at && new Date(order.expires_at).getTime() <= Date.now()) return;

                setLiveBids((prevBids) => {
                    const existingIdx = prevBids.findIndex((b) => b.mate_id === payload.mate_id);
                    const newBidEntry = {
                        ...payload,
                        amount: bidAmount,
                        updated_at: Date.now(),
                    };
                    if (existingIdx >= 0) {
                        const updated = [...prevBids];
                        updated[existingIdx] = newBidEntry;
                        return updated;
                    }
                    return [...prevBids, newBidEntry];
                });
            })
            .subscribe();

        const unsubscribeBlur = navigation?.addListener ? navigation.addListener('blur', () => {
            if (presenceChannelRef.current) {
                console.log(`[RealtimeLifecycle:UNSUBSCRIBE] request:${orderId} (app: customer, reason: navigation_blur)`);
                supabase.removeChannel(presenceChannelRef.current);
                presenceChannelRef.current = null;
            }
        }) : undefined;

        const unsubscribeBeforeRemove = navigation?.addListener ? navigation.addListener('beforeRemove', () => {
            if (presenceChannelRef.current) {
                console.log(`[RealtimeLifecycle:UNSUBSCRIBE] request:${orderId} (app: customer, reason: navigation_before_remove)`);
                supabase.removeChannel(presenceChannelRef.current);
                presenceChannelRef.current = null;
            }
        }) : undefined;

        const appStateSub = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
            if (nextAppState === 'active' && presenceChannelRef.current) {
                // Step 7: Re-sync presenceState on resume from background rather than trusting stale in-memory state
                syncViewersFromPresence(presenceChannelRef.current);
            }
        });

        return () => {
            if (unsubscribeBlur) unsubscribeBlur();
            if (unsubscribeBeforeRemove) unsubscribeBeforeRemove();
            if (appStateSub?.remove) appStateSub.remove();
            if (presenceChannelRef.current) {
                console.log(`[RealtimeLifecycle:UNSUBSCRIBE] request:${orderId} (app: customer, reason: unmount)`);
                supabase.removeChannel(presenceChannelRef.current);
                presenceChannelRef.current = null;
            }
        };
    }, [orderId, order?.status]);

    const calculateBearing = (startLat: number, startLng: number, destLat: number, destLng: number): number => {
        const startLatRad = (startLat * Math.PI) / 180;
        const startLngRad = (startLng * Math.PI) / 180;
        const destLatRad = (destLat * Math.PI) / 180;
        const destLngRad = (destLng * Math.PI) / 180;

        const y = Math.sin(destLngRad - startLngRad) * Math.cos(destLatRad);
        const x = Math.cos(startLatRad) * Math.sin(destLatRad) -
                  Math.sin(startLatRad) * Math.cos(destLatRad) * Math.cos(destLngRad - startLngRad);
        const brng = (Math.atan2(y, x) * 180) / Math.PI;
        return (brng + 360) % 360;
    };

    // Load initial unread message count and subscribe to incoming messages
    useEffect(() => {
        if (!orderId || !user) return;
        
        const fetchUnread = async () => {
            const count = await chatService.getUnreadCount(orderId, user.id);
            setUnreadChatCount(count);
        };
        fetchUnread();

        const msgChannel = supabase
            .channel(`tracking_chat_badge_${orderId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'order_messages',
                filter: `order_id=eq.${orderId}`
            }, (payload) => {
                if (payload.new && payload.new.sender_id !== user.id) {
                    setUnreadChatCount((prev) => prev + 1);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(msgChannel);
        };
    }, [orderId, user?.id]);

    // Animate driver marker smoothly with bearing calculation and camera pan
    useEffect(() => {
        const newLat = order?.driver_latitude ? parseFloat(order.driver_latitude) : null;
        const newLng = order?.driver_longitude ? parseFloat(order.driver_longitude) : null;

        if (newLat === null || newLng === null || isNaN(newLat) || isNaN(newLng)) {
            return;
        }

        if (!prevCoordRef.current) {
            prevCoordRef.current = { latitude: newLat, longitude: newLng };
            setAnimatedDriverCoord({ latitude: newLat, longitude: newLng });
            if (mapRef.current) {
                mapRef.current.animateToRegion({
                    latitude: newLat,
                    longitude: newLng,
                    latitudeDelta: 0.02,
                    longitudeDelta: 0.02,
                }, 1000);
            }
            return;
        }

        const startLat = prevCoordRef.current.latitude;
        const startLng = prevCoordRef.current.longitude;

        if (Math.abs(startLat - newLat) < 0.00001 && Math.abs(startLng - newLng) < 0.00001) {
            return;
        }

        const heading = calculateBearing(startLat, startLng, newLat, newLng);
        setDriverHeading(heading);

        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
        }

        const startTime = Date.now();
        const duration = 1500;

        const animateGlide = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 3);

            const currentLat = startLat + (newLat - startLat) * easeProgress;
            const currentLng = startLng + (newLng - startLng) * easeProgress;

            setAnimatedDriverCoord({ latitude: currentLat, longitude: currentLng });

            if (progress < 1) {
                animFrameRef.current = requestAnimationFrame(animateGlide);
            } else {
                prevCoordRef.current = { latitude: newLat, longitude: newLng };
            }
        };

        animFrameRef.current = requestAnimationFrame(animateGlide);

        if (mapRef.current) {
            mapRef.current.animateToRegion({
                latitude: newLat,
                longitude: newLng,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
            }, 1000);
        }

        return () => {
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
            }
        };
    }, [order?.driver_latitude, order?.driver_longitude]);


    if (loading || !order) {
        return (
            <LinearGradient colors={['#F8FAFC', '#E2E8F0']} style={styles.safeArea}>
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#055FEE" />
                </View>
            </LinearGradient>
        );
    }

    const { pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude, driver_latitude, driver_longitude } = order;

    const initLat = parseFloat(pickup_latitude || dropoff_latitude || "-17.8248");
    const initLng = parseFloat(pickup_longitude || dropoff_longitude || "31.0530");

    const initialRegion = {
        latitude: isNaN(initLat) ? -17.8248 : initLat,
        longitude: isNaN(initLng) ? 31.0530 : initLng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
    };

    const isDelivery = order.service_type === 'delivery';
    const driverName = order.driver?.full_name || 'Assigning...';
    const isSearching = order && (order.status === 'pending' || order.status === 'searching');

    const collapsedStatusText = useMemo(() => {
        if (!order) return 'Loading...';
        if (isSearching) {
            const mateCount = nearbyDrivers.length;
            if (mateCount > 0) {
                return `Searching · ${mateCount} ${mateCount === 1 ? 'Mate' : 'Mates'} active`;
            }
            if (viewingCouriers.length > 0) {
                return `Searching · ${viewingCouriers.length} ${viewingCouriers.length === 1 ? 'Mate' : 'Mates'} reviewing`;
            }
            return 'Searching · Scanning zone';
        }
        if (order.status === 'driver_assigned') {
            return `${driverName} assigned`;
        }
        if (order.status === 'en_route_to_pickup') {
            return `${driverName} en route to pickup`;
        }
        if (order.status === 'arrived_at_pickup') {
            return `${driverName} arrived at pickup`;
        }
        if (order.status === 'picked_up' || order.status === 'en_route_to_delivery') {
            return `${driverName} delivering package`;
        }
        if (order.status === 'arrived_at_delivery') {
            return `${driverName} outside at gate`;
        }
        if (order.status === 'delivered' || order.status === 'completed') {
            return 'Delivery Completed';
        }
        return getStatusLabel(order.status);
    }, [order, isSearching, nearbyDrivers.length, viewingCouriers.length, driverName]);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

            <View style={styles.mapContainer}>
                <MapView
                    ref={mapRef}
                    style={styles.map}
                    initialRegion={initialRegion}
                >
                    {pickup_latitude && pickup_longitude && !isNaN(parseFloat(pickup_latitude)) && (
                        <Marker
                            coordinate={{ latitude: parseFloat(pickup_latitude), longitude: parseFloat(pickup_longitude) }}
                            title="Pickup"
                            pinColor="#3B82F6"
                        />
                    )}
                    {dropoff_latitude && dropoff_longitude && !isNaN(parseFloat(dropoff_latitude)) && (
                        <Marker
                            coordinate={{ latitude: parseFloat(dropoff_latitude), longitude: parseFloat(dropoff_longitude) }}
                            title="Dropoff"
                            pinColor="#10B981"
                        />
                    )}
                    {/* Render visual line between pickup and dropoff */}
                    {pickup_latitude && pickup_longitude && dropoff_latitude && dropoff_longitude && (
                        <Polyline
                            coordinates={[
                                { latitude: parseFloat(pickup_latitude), longitude: parseFloat(pickup_longitude) },
                                { latitude: parseFloat(dropoff_latitude), longitude: parseFloat(dropoff_longitude) }
                            ]}
                            strokeColor="#94A3B8"
                            strokeWidth={3}
                            lineDashPattern={[5, 10]}
                        />
                    )}

                    {/* Render Real-Time Interpolated Driver Location */}
                    {(animatedDriverCoord || (driver_latitude && driver_longitude)) && (
                        <Marker
                            coordinate={animatedDriverCoord || { latitude: parseFloat(driver_latitude), longitude: parseFloat(driver_longitude) }}
                            title="Driver"
                            anchor={{ x: 0.5, y: 0.5 }}
                            flat={true}
                        >
                            <View style={styles.driverMarkerOuter}>
                                <View style={[styles.driverMarkerInner, { transform: [{ rotate: `${driverHeading}deg` }] }]}>
                                    <Text style={{ fontSize: 20 }}>🚗</Text>
                                </View>
                            </View>
                        </Marker>
                    )}

                    {/* Render Driver Bid/Offer Locations on the map */}
                    {order.status === 'pending' && combinedOffers.map((offer) => (
                        offer.driver_latitude && offer.driver_longitude && (
                            <Marker
                                key={offer.id}
                                coordinate={{ latitude: offer.driver_latitude, longitude: offer.driver_longitude }}
                                title={offer.driver?.full_name}
                                description={`Offer: $${offer.offer_amount.toFixed(2)}`}
                            >
                                <View style={styles.driverMarkerOuter}>
                                    <View style={[styles.driverMarkerInner, { backgroundColor: '#F59E0B' }]}>
                                        <Text style={{ fontSize: 16 }}>🚗</Text>
                                    </View>
                                </View>
                            </Marker>
                        )
                    ))}

                    {/* Render Nearby Available Mates on the Map */}
                    {order.status === 'pending' && nearbyDrivers.map((driver) => (
                        driver.current_latitude && driver.current_longitude && (
                            <Marker
                                key={`nearby-${driver.id}`}
                                coordinate={{ latitude: driver.current_latitude, longitude: driver.current_longitude }}
                                title={driver.full_name || 'Online Mate'}
                                description={`${driver.vehicle_model || driver.vehicle_type || 'Courier'} • ${driver.distance_km ? `${driver.distance_km} km away` : 'Active'}`}
                            >
                                <View style={styles.nearbyMateMarkerOuter}>
                                    <View style={styles.nearbyMateMarkerInner}>
                                        <Text style={{ fontSize: 16 }}>{driver.vehicle_type === 'motorcycle' ? '🏍️' : '🚗'}</Text>
                                    </View>
                                    <View style={styles.nearbyMateBadge}>
                                        <Text style={styles.nearbyMateBadgeText}>{driver.full_name?.split(' ')[0] || 'Mate'}</Text>
                                    </View>
                                </View>
                            </Marker>
                        )
                    ))}

                    {/* Progressive Search Radius Circle on Map */}
                    {order.status === 'pending' && (pickup_latitude || dropoff_latitude) && (
                        <Circle
                            center={{
                                latitude: parseFloat(pickup_latitude || dropoff_latitude || "-17.8248"),
                                longitude: parseFloat(pickup_longitude || dropoff_longitude || "31.0530")
                            }}
                            radius={searchRadiusKm * 1000}
                            strokeColor="rgba(5, 95, 238, 0.45)"
                            strokeWidth={1.5}
                            fillColor="rgba(5, 95, 238, 0.06)"
                        />
                    )}
                </MapView>
            </View>

            <View style={styles.headerOverlay}>
                <BlurView intensity={40} tint="light" style={styles.headerBlur}>
                    <SafeAreaView edges={['top']}>
                        <View style={styles.headerContent}>
                            {order && ACTIVE_TRIP_STATUSES.includes(order.status) ? (
                                <View style={styles.activeTripLockedBadge}>
                                    <View style={styles.livePulseDot} />
                                    <Text style={styles.activeTripLockedText}>TRIP ACTIVE</Text>
                                </View>
                            ) : (
                                <TouchableOpacity onPress={() => navigation.navigate('CustomerTabs')} style={styles.backBtn}>
                                    <Text style={styles.backTxt}>← Back</Text>
                                </TouchableOpacity>
                            )}
                            <Text style={styles.headerText}>Live Tracking</Text>
                            <View style={{ width: 60 }} />
                        </View>
                    </SafeAreaView>
                </BlurView>
            </View>

            {/* DRAGGABLE RIDE-HAILING BOTTOM SHEET */}
            <BottomSheet
                ref={bottomSheetRef}
                index={0}
                snapPoints={snapPoints}
                onChange={(idx) => setSheetIndex(idx)}
                enablePanDownToClose={false}
                handleIndicatorStyle={styles.bottomSheetIndicator}
                backgroundStyle={styles.bottomSheetBackground}
            >
                <BottomSheetScrollView 
                    contentContainerStyle={[styles.bottomSheetScrollContent, { paddingBottom: Math.max(insets.bottom + 20, 24) }]}
                    showsVerticalScrollIndicator={false}
                >
                    {/* 1. COLLAPSED BAR (12% snap point - always visible, tap/swipe to toggle) */}
                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                            const next = sheetIndex === 0 ? 1 : sheetIndex === 1 ? 2 : 0;
                            bottomSheetRef.current?.snapToIndex(next);
                        }}
                        style={styles.collapsedHeaderBar}
                    >
                        <View style={styles.collapsedStatusRow}>
                            <View style={styles.pulseContainer}>
                                {isSearching ? (
                                    <>
                                        <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]} />
                                        <View style={[styles.statusDot, styles.statusDotSearching]} />
                                    </>
                                ) : (
                                    <View style={[styles.statusDot, styles.statusDotActive]} />
                                )}
                            </View>
                            <View style={styles.collapsedStatusTextCol}>
                                <Text style={styles.collapsedStatusTitle} numberOfLines={1}>
                                    {collapsedStatusText}
                                </Text>
                                <Text style={styles.collapsedStatusSubtitle} numberOfLines={1}>
                                    {isSearching
                                        ? `${searchRadiusKm} km radar · Tap to view details`
                                        : `${isDelivery ? 'Package Delivery' : 'Errand'} · Tap to expand`}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.collapsedPriceBadge}>
                            <Text style={styles.collapsedPriceValue}>
                                ${parseFloat(order.estimated_cost || 0).toFixed(2)}
                            </Text>
                            <Text style={styles.collapsedPriceCurrency}>USD</Text>
                        </View>
                    </TouchableOpacity>

                    {/* 2. MID-STATE CONTENT (45% snap point): SCANNABLE ROWS */}
                    <View style={styles.midContentContainer}>
                        {/* Scannable Row 1: Payment Method */}
                        <View style={styles.scannableRow}>
                            <View style={[styles.scannableIconWrapper, order.payment_method === 'cash_on_delivery' ? styles.codIconBg : styles.digitalIconBg]}>
                                <Ionicons 
                                    name={order.payment_method === 'cash_on_delivery' ? 'cash-outline' : 'card-outline'} 
                                    size={18} 
                                    color={order.payment_method === 'cash_on_delivery' ? '#B45309' : '#055FEE'} 
                                />
                            </View>
                            <View style={styles.scannableTextCol}>
                                <Text style={styles.scannableLabel}>Payment</Text>
                                <Text style={styles.scannableValue}>
                                    {order.payment_method === 'cash_on_delivery' 
                                        ? `Cash on Delivery · $${parseFloat(order.estimated_cost || 0).toFixed(2)} USD` 
                                        : `Paid Digitally (${order.payment_method?.toUpperCase() || 'Card'})`}
                                </Text>
                            </View>
                        </View>

                        {/* Scannable Row 2: Recipient Details */}
                        {order.recipient_name && order.recipient_name !== 'Customer' && (
                            <View style={styles.scannableRow}>
                                <View style={styles.scannableIconWrapper}>
                                    <Ionicons name="person-outline" size={18} color="#055FEE" />
                                </View>
                                <View style={styles.scannableTextCol}>
                                    <Text style={styles.scannableLabel}>Recipient</Text>
                                    <Text style={styles.scannableValue}>
                                        {order.recipient_name} {order.sms_notifications_enabled ? '· 📲 SMS Active' : ''}
                                    </Text>
                                </View>
                            </View>
                        )}

                        {/* Scannable Row 3: Radar Search Progress (while searching) */}
                        {isSearching && (
                            <View style={styles.searchRadiusCard}>
                                <View style={styles.scannableRowNoBorder}>
                                    <View style={styles.scannableIconWrapper}>
                                        <Ionicons name="radio-outline" size={18} color="#055FEE" />
                                    </View>
                                    <View style={styles.scannableTextCol}>
                                        <Text style={styles.scannableLabel}>Radar Search</Text>
                                        <Text style={styles.scannableValue}>
                                            {searchRadiusKm} km zone · {viewingCouriers.length > 0 ? `${viewingCouriers.length} Mates viewing` : `${nearbyDrivers.length} Mates nearby`}
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.searchProgressBarTrack}>
                                    <View 
                                        style={[
                                            styles.searchProgressBarFill, 
                                            { 
                                                width: `${Math.min(100, Math.round((searchElapsedSeconds / 60) * 100))}%`,
                                                backgroundColor: searchPhase === 'wide' ? '#8B5CF6' : searchPhase === 'expanding' ? '#055FEE' : '#F59E0B'
                                            }
                                        ]} 
                                    />
                                </View>
                            </View>
                        )}

                        {/* Driver Quick Card (when assigned) */}
                        {order.driver_id && order.status !== 'pending' && (
                            <View style={styles.driverQuickCard}>
                                <View style={styles.driverAvatar}>
                                    <Text style={styles.driverAvatarText}>{driverName.charAt(0).toUpperCase()}</Text>
                                </View>
                                <View style={styles.driverDetails}>
                                    <Text style={styles.driverNameLabel}>Assigned Mate</Text>
                                    <Text style={styles.driverName}>{driverName}</Text>
                                </View>
                                <View style={styles.communicationButtons}>
                                    <TouchableOpacity 
                                        style={styles.contactBtn}
                                        onPress={() => setInAppCallVisible(true)}
                                    >
                                        <Ionicons name="call" size={20} color="#FFFFFF" />
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={[styles.contactBtn, styles.chatBtn]}
                                        onPress={() => {
                                            setUnreadChatCount(0);
                                            setInAppChatVisible(true);
                                        }}
                                    >
                                        <Ionicons name="chatbubble-ellipses" size={20} color="#FFFFFF" />
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
                        )}

                        {/* Incoming Bids / Offers Panel */}
                        {order.status === 'pending' && (
                            <OfferSelectionPanel 
                                offers={combinedOffers}
                                onAccept={handleAcceptOffer}
                                onSelect={(offer) => {
                                    if (offer.driver_latitude && offer.driver_longitude && mapRef.current) {
                                        mapRef.current.animateToRegion({
                                            latitude: offer.driver_latitude,
                                            longitude: offer.driver_longitude,
                                            latitudeDelta: 0.02,
                                            longitudeDelta: 0.02,
                                        }, 1000);
                                    }
                                }}
                                loading={offersLoading}
                            />
                        )}
                    </View>

                    {/* 3. EXPANDED CONTENT (85% snap point): SURGE BOOST, PIN, PROOF, CANCEL */}
                    <View style={styles.expandedContentContainer}>
                        {/* Surge Tip Boost Chips (when searching) */}
                        {isSearching && (
                            <View style={styles.surgeBoostCard}>
                                <View style={styles.surgeBoostHeader}>
                                    <Text style={styles.surgeBoostTitle}>⚡ Surge Tip (Fast Priority Dispatch)</Text>
                                    <Text style={styles.surgeBoostSubtitle}>Tip your Mate to prioritize your order:</Text>
                                </View>
                                <View style={styles.boostChipsRow}>
                                    <TouchableOpacity 
                                        style={styles.boostChip} 
                                        onPress={() => handleBoostOffer(0.50)}
                                        disabled={boostingOffer}
                                    >
                                        <Text style={styles.boostChipText}>+$0.50</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={styles.boostChip} 
                                        onPress={() => handleBoostOffer(1.00)}
                                        disabled={boostingOffer}
                                    >
                                        <Text style={styles.boostChipText}>+$1.00</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={styles.boostChip} 
                                        onPress={() => handleBoostOffer(2.00)}
                                        disabled={boostingOffer}
                                    >
                                        <Text style={styles.boostChipText}>+$2.00</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {/* Handover Delivery PIN (OTP) */}
                        {Boolean(order.handover_pin) && order.status !== 'cancelled' && (
                            <View style={[
                                styles.handoverPinCard,
                                order.pin_locked ? styles.handoverPinCardLocked : 
                                (order.status === 'completed' || order.pin_verified_at) ? styles.handoverPinCardVerified : 
                                styles.handoverPinCardActive
                            ]}>
                                <View style={styles.handoverPinHeaderRow}>
                                    <View style={styles.handoverPinTitleGroup}>
                                        <Text style={styles.handoverPinIcon}>
                                            {(order.status === 'completed' || order.pin_verified_at) ? '✅' : order.pin_locked ? '⚠️' : '🔐'}
                                        </Text>
                                        <View>
                                            <Text style={styles.handoverPinTitle}>Delivery Handover PIN</Text>
                                            <Text style={styles.handoverPinSubtitle}>
                                                {(order.status === 'completed' || order.pin_verified_at) 
                                                    ? 'Verified & Handover Completed' 
                                                    : order.pin_locked 
                                                        ? 'PIN Locked (Photo Fallback Active)' 
                                                        : 'Share with courier only upon arrival'}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={[
                                        styles.handoverPinBadge,
                                        (order.status === 'completed' || order.pin_verified_at) ? styles.handoverPinBadgeVerified :
                                        order.pin_locked ? styles.handoverPinBadgeLocked :
                                        styles.handoverPinBadgeActive
                                    ]}>
                                        <Text style={[
                                            styles.handoverPinBadgeText,
                                            (order.status === 'completed' || order.pin_verified_at) ? styles.handoverPinBadgeTextVerified :
                                            order.pin_locked ? styles.handoverPinBadgeTextLocked :
                                            styles.handoverPinBadgeTextActive
                                        ]}>
                                            {(order.status === 'completed' || order.pin_verified_at) ? 'VERIFIED' : order.pin_locked ? 'LOCKED' : 'ACTIVE PIN'}
                                        </Text>
                                    </View>
                                </View>

                                {/* 4-Digit Display */}
                                <View style={styles.handoverPinDigitsRow}>
                                    {order.handover_pin!.split('').map((digit: string, idx: number) => (
                                        <View key={idx} style={[
                                            styles.handoverPinDigitBox,
                                            order.pin_locked && styles.handoverPinDigitBoxLocked,
                                            (order.status === 'completed' || order.pin_verified_at) && styles.handoverPinDigitBoxVerified
                                        ]}>
                                            <Text style={[
                                                styles.handoverPinDigitText,
                                                order.pin_locked && styles.handoverPinDigitTextLocked,
                                                (order.status === 'completed' || order.pin_verified_at) && styles.handoverPinDigitTextVerified
                                            ]}>
                                                {digit}
                                            </Text>
                                        </View>
                                    ))}
                                </View>

                                <Text style={styles.handoverPinHelperText}>
                                    {order.pin_locked 
                                        ? 'PIN entry locked after 3 failed attempts. Your courier will complete delivery via Photo Proof-of-Delivery.' 
                                        : (order.status === 'completed' || order.pin_verified_at)
                                            ? 'Package handover was successfully verified with this code.'
                                            : 'Give this 4-digit code to your Mate when they hand over your package. Zero SMS fees.'}
                                </Text>
                            </View>
                        )}

                        {/* Milestone Arrival Banners */}
                        {order.status === 'arrived_at_pickup' && (
                            <View style={styles.gateArrivalBanner}>
                                <View style={styles.gateArrivalTopRow}>
                                    <Text style={styles.gateArrivalIcon}>🔔</Text>
                                    <View style={styles.gateArrivalTextWrap}>
                                        <Text style={styles.gateArrivalTitle}>Your Mate Has Arrived at Pickup!</Text>
                                        <Text style={styles.gateArrivalDesc}>
                                            Courier is at the pickup location collecting your package now.
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        )}

                        {(order.status === 'arrived_at_delivery' || order.status === 'arrived' || order.arrival_timer_started_at) && (
                            <View style={styles.gateArrivalBanner}>
                                <View style={styles.gateArrivalTopRow}>
                                    <Text style={styles.gateArrivalIcon}>🔔</Text>
                                    <View style={styles.gateArrivalTextWrap}>
                                        <Text style={styles.gateArrivalTitle}>Your Mate is Outside at the Gate!</Text>
                                        <Text style={styles.gateArrivalDesc}>
                                            {order.recipient_name && order.recipient_name !== 'Customer' 
                                                ? `Courier has arrived for recipient ${order.recipient_name}. Please meet them outside.`
                                                : 'Your courier has arrived at your delivery address. Please meet them outside.'}
                                        </Text>
                                    </View>
                                </View>
                                {timerSecondsLeft !== null && (
                                    <View style={styles.timerCountdownRow}>
                                        <Text style={styles.timerCountdownIcon}>⏳</Text>
                                        <Text style={styles.timerCountdownText}>
                                            Waiting Timer: <Text style={styles.timerCountdownClock}>{formatTimer(timerSecondsLeft)}</Text> remaining
                                        </Text>
                                    </View>
                                )}
                            </View>
                        )}

                        {/* Dispute Status Banner */}
                        {order.status === 'disputed' && (
                            <View style={styles.disputeBanner}>
                                <Text style={styles.disputeBannerIcon}>⚠️</Text>
                                <View style={styles.disputeBannerTextWrap}>
                                    <Text style={styles.disputeBannerTitle}>Order in Dispute</Text>
                                    <Text style={styles.disputeBannerDesc}>
                                        A dispute has been logged regarding courier release/compensation. ShipMate Support is reviewing the GPS and call records.
                                    </Text>
                                </View>
                            </View>
                        )}

                        {/* Proposed Release Compensation Decision Card */}
                        {order.pending_release_compensation > 0 && order.pending_release_driver_id && (
                            <View style={styles.compensationCard}>
                                <View style={styles.compensationHeaderRow}>
                                    <Text style={styles.compensationIcon}>💰</Text>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.compensationTitle}>Courier Compensation Request</Text>
                                        <Text style={styles.compensationSubtitle}>
                                            Your previous Mate traveled {(order.cumulative_distance_km || 0).toFixed(1)} km before releasing this order and requested ${parseFloat(order.pending_release_compensation).toFixed(2)} USD compensation.
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.compensationActions}>
                                    <TouchableOpacity
                                        style={styles.compensationAcceptBtn}
                                        onPress={handleAcceptCompensation}
                                        disabled={acceptingCompensation}
                                    >
                                        {acceptingCompensation ? (
                                            <ActivityIndicator color="#FFFFFF" />
                                        ) : (
                                            <Text style={styles.compensationAcceptText}>
                                                Accept (${parseFloat(order.pending_release_compensation).toFixed(2)})
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.compensationDisputeBtn}
                                        onPress={() => setDisputeModalVisible(true)}
                                        disabled={acceptingCompensation}
                                    >
                                        <Text style={styles.compensationDisputeText}>Dispute</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {/* Delivery Completed / Proof Acknowledgement */}
                        {(order.status === 'delivered' || order.status === 'completed') && (
                            <View style={styles.acknowledgementContainer}>
                                <Text style={styles.acknowledgementHeader}>
                                    {order.status === 'completed' ? 'Delivery Confirmed! 🎉' : 'Package Delivered! 📦'}
                                </Text>
                                <Text style={styles.acknowledgementSubheader}>
                                    {order.status === 'completed' 
                                        ? 'Thank you for confirming. Your delivery is complete.' 
                                        : 'Please verify the delivery proof below to confirm receipt.'}
                                </Text>

                                <View style={styles.proofRow}>
                                    {order.delivery_photo_url && (
                                        <View style={styles.proofCol}>
                                            <Text style={styles.proofLabel}>Photo Proof</Text>
                                            <TouchableOpacity 
                                                activeOpacity={0.9} 
                                                onPress={() => {
                                                    Alert.alert("Delivery Photo", "Photo taken at delivery spot.");
                                                }}
                                                style={styles.proofImageWrapper}
                                            >
                                                <Image 
                                                    source={{ uri: order.delivery_photo_url }} 
                                                    style={styles.proofImage} 
                                                />
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    {order.delivery_signature_url && (
                                        <View style={styles.proofCol}>
                                            <Text style={styles.proofLabel}>Recipient Signature</Text>
                                            <View style={styles.proofSignatureWrapper}>
                                                <Image 
                                                    source={{ uri: order.delivery_signature_url }} 
                                                    style={styles.proofSignature} 
                                                    resizeMode="contain"
                                                />
                                            </View>
                                        </View>
                                    )}
                                </View>

                                {((order.status === 'delivered' || order.status === 'completed') && !order.customer_acknowledged) ? (
                                    <TouchableOpacity
                                        style={styles.acknowledgeButtonContainer}
                                        activeOpacity={0.8}
                                        onPress={handleAcknowledgeDelivery}
                                        disabled={acknowledging}
                                    >
                                        <LinearGradient
                                            colors={['#10B981', '#059669']}
                                            style={styles.acknowledgeGradient}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                        >
                                            {acknowledging ? (
                                                <ActivityIndicator color="#FFFFFF" />
                                            ) : (
                                                <Text style={styles.acknowledgeButtonText}>⭐ Rate Your Delivery Experience</Text>
                                            )}
                                        </LinearGradient>
                                    </TouchableOpacity>
                                ) : (
                                    <TouchableOpacity
                                        style={styles.doneButtonContainer}
                                        activeOpacity={0.8}
                                        onPress={() => navigation.navigate('CustomerTabs')}
                                    >
                                        <LinearGradient
                                            colors={['#055FEE', '#5B99F2']}
                                            style={styles.doneGradient}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                        >
                                            <Text style={styles.doneButtonText}>Return to Home</Text>
                                        </LinearGradient>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}

                        {/* Cancel Order Action Button */}
                        {order.status !== 'completed' && order.status !== 'delivered' && order.status !== 'cancelled' && order.status !== 'disputed' && (
                            <TouchableOpacity
                                style={styles.cancelOrderTriggerBtn}
                                activeOpacity={0.7}
                                onPress={() => setCancelModalVisible(true)}
                            >
                                <Text style={styles.cancelOrderTriggerText}>Cancel Order</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </BottomSheetScrollView>
            </BottomSheet>

            <CustomerRatingModal
                visible={showRatingModal}
                onClose={() => {
                    setShowRatingModal(false);
                    setRatingDismissed(true);
                }}
                onSubmit={handleRatingSubmit}
                driverName={driverName}
                submitting={acknowledging}
            />

            {order && user && (
                <InAppCallModal
                    visible={inAppCallVisible}
                    orderId={order.id}
                    callerId={user.id}
                    callerRole="customer"
                    targetName={driverName}
                    targetRole="driver"
                    isIncoming={isIncomingCall}
                    onClose={() => {
                        setInAppCallVisible(false);
                        setIsIncomingCall(false);
                    }}
                />
            )}

            {order && (
                <InAppChatModal
                    visible={inAppChatVisible}
                    orderId={order.id}
                    recipientName={driverName}
                    recipientPhone={order?.driver?.phone}
                    onClose={() => setInAppChatVisible(false)}
                    onOpenCall={() => setInAppCallVisible(true)}
                />
            )}

            {/* Cancel Order Modal with Distance-Based Fee Preview */}
            <Modal
                visible={cancelModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setCancelModalVisible(false)}
            >
                <View style={styles.cancelModalOverlay}>
                    <View style={styles.cancelModalCard}>
                        <View style={styles.cancelModalHeader}>
                            <Text style={styles.cancelModalTitle}>Cancel Delivery Request?</Text>
                            <TouchableOpacity onPress={() => setCancelModalVisible(false)}>
                                <Text style={styles.cancelModalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Fee Breakdown Box */}
                        <View style={styles.cancelFeeBox}>
                            <View style={styles.cancelFeeRow}>
                                <Text style={styles.cancelFeeLabel}>Courier Traveled:</Text>
                                <Text style={styles.cancelFeeValue}>{(order?.cumulative_distance_km || 0).toFixed(1)} km</Text>
                            </View>
                            <View style={styles.cancelFeeDivider} />
                            <View style={styles.cancelFeeRow}>
                                <Text style={styles.cancelFeeTotalLabel}>Cancellation Fee:</Text>
                                <Text style={styles.cancelFeeTotalValue}>
                                    ${getCancellationFee(order?.cumulative_distance_km || 0).toFixed(2)} USD
                                </Text>
                            </View>
                        </View>

                        <Text style={styles.cancelFeeExplainer}>
                            {((order?.cumulative_distance_km || 0) < 0.5)
                                ? '✓ Free cancellation: Courier has moved less than 0.5 km.'
                                : ((order?.cumulative_distance_km || 0) <= 1.0)
                                ? 'Flat $0.50 USD fee to compensate the courier for fuel and dispatch.'
                                : `$0.25/km fee ($${getCancellationFee(order?.cumulative_distance_km || 0).toFixed(2)} USD) credited directly to your courier.'`}
                        </Text>

                        <Text style={styles.cancelReasonLabel}>Select Reason:</Text>
                        {['Changed my mind', 'Courier taking too long', 'Found alternative', 'Other reason'].map((r) => (
                            <TouchableOpacity
                                key={r}
                                style={[styles.cancelReasonOption, cancelReason === r && styles.cancelReasonOptionActive]}
                                onPress={() => setCancelReason(r)}
                            >
                                <Text style={[styles.cancelReasonOptionText, cancelReason === r && styles.cancelReasonOptionTextActive]}>
                                    {cancelReason === r ? '● ' : '○ '} {r}
                                </Text>
                            </TouchableOpacity>
                        ))}

                        <View style={styles.cancelModalActions}>
                            <TouchableOpacity
                                style={styles.cancelKeepBtn}
                                onPress={() => setCancelModalVisible(false)}
                            >
                                <Text style={styles.cancelKeepText}>Keep Delivery</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.cancelConfirmBtn}
                                onPress={handleConfirmCancel}
                                disabled={cancelling}
                            >
                                {cancelling ? (
                                    <ActivityIndicator color="#FFFFFF" />
                                ) : (
                                    <Text style={styles.cancelConfirmText}>
                                        Cancel (${getCancellationFee(order?.cumulative_distance_km || 0).toFixed(2)})
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Dispute Compensation Modal */}
            <Modal
                visible={disputeModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setDisputeModalVisible(false)}
            >
                <View style={styles.cancelModalOverlay}>
                    <View style={styles.cancelModalCard}>
                        <View style={styles.cancelModalHeader}>
                            <Text style={styles.cancelModalTitle}>Dispute Release Compensation</Text>
                            <TouchableOpacity onPress={() => setDisputeModalVisible(false)}>
                                <Text style={styles.cancelModalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.cancelFeeExplainer}>
                            Please explain why this compensation request should not be granted. Our support team will investigate the trip telemetry and resolve the dispute.
                        </Text>
                        <TextInput
                            style={styles.disputeInput}
                            placeholder="e.g. Courier never arrived at pickup location or called me..."
                            placeholderTextColor="#94A3B8"
                            value={disputeReason}
                            onChangeText={setDisputeReason}
                            multiline
                            numberOfLines={3}
                        />
                        <TouchableOpacity
                            style={styles.submitDisputeBtn}
                            onPress={handleDisputeCompensation}
                            disabled={submittingDispute}
                        >
                            {submittingDispute ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <Text style={styles.submitDisputeBtnText}>Submit Dispute to Support</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    safeArea: { flex: 1 },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    mapContainer: { ...StyleSheet.absoluteFillObject },
    map: { width: '100%', height: '100%' },
    headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
    headerBlur: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.4)' },
    headerContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 20 : 10, paddingBottom: 16 },
    activeTripLockedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: '#EFF6FF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    livePulseDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#10B981',
        marginRight: 6,
    },
    activeTripLockedText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#055FEE',
        letterSpacing: 0.5,
    },
    backBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 12 },
    backTxt: { fontSize: 14, fontWeight: 'bold', color: '#334155' },
    headerText: { fontSize: 18, fontWeight: '800', color: '#0F172A' },

    driverMarkerOuter: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(176, 106, 40, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    driverMarkerInner: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },

    // Bottom Sheet Styling (Uber / Bolt / inDrive UX)
    bottomSheetBackground: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 16,
    },
    bottomSheetIndicator: {
        width: 36,
        height: 4,
        backgroundColor: '#CBD5E1',
        borderRadius: 2,
    },
    bottomSheetScrollContent: {
        paddingHorizontal: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    },

    // 12% Collapsed Bar
    collapsedHeaderBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    collapsedStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 12,
    },
    pulseContainer: {
        width: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    pulseCircle: {
        position: 'absolute',
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'rgba(5, 95, 238, 0.25)',
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    statusDotSearching: {
        backgroundColor: '#055FEE',
    },
    statusDotActive: {
        backgroundColor: '#10B981',
    },
    collapsedStatusTextCol: {
        flex: 1,
    },
    collapsedStatusTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: -0.2,
    },
    collapsedStatusSubtitle: {
        fontSize: 12,
        fontWeight: '500',
        color: '#64748B',
        marginTop: 1,
    },
    collapsedPriceBadge: {
        alignItems: 'flex-end',
        backgroundColor: '#F8FAFC',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    collapsedPriceValue: {
        fontSize: 15,
        fontWeight: '800',
        color: '#0F172A',
    },
    collapsedPriceCurrency: {
        fontSize: 10,
        fontWeight: '700',
        color: '#64748B',
    },

    // 45% Mid-State Content
    midContentContainer: {
        marginTop: 14,
    },
    scannableRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    scannableRowNoBorder: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    scannableIconWrapper: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    codIconBg: {
        backgroundColor: '#FEF3C7',
    },
    digitalIconBg: {
        backgroundColor: '#ECFDF5',
    },
    scannableTextCol: {
        flex: 1,
    },
    scannableLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: '#64748B',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    scannableValue: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1E293B',
        marginTop: 2,
    },
    searchRadiusCard: {
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        padding: 12,
        marginVertical: 8,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    driverQuickCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginVertical: 10,
    },

    // 85% Expanded Content
    expandedContentContainer: {
        marginTop: 8,
    },
    surgeBoostCard: {
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    surgeBoostHeader: {
        marginBottom: 8,
    },
    surgeBoostTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: '#0F172A',
    },
    surgeBoostSubtitle: {
        fontSize: 11,
        fontWeight: '500',
        color: '#64748B',
        marginTop: 2,
    },

    bottomOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0 },
    jobDetailsPanel: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20, borderTopLeftRadius: 32, borderTopRightRadius: 32, borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,0.8)', overflow: 'hidden' },
    dragHandle: { width: 48, height: 5, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 3, alignSelf: 'center', marginBottom: 24 },
    titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    iconContainer: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    serviceIcon: { fontSize: 20 },
    jobType: { fontSize: 20, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
    statusText: { fontSize: 14, fontWeight: '600' },

    driverInfoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.7)',
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.5)',
        marginBottom: Platform.OS === 'ios' ? 0 : 20,
    },
    driverAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#0F172A',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    driverAvatarText: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: 'bold',
    },
    driverDetails: {
        flex: 1,
    },
    driverNameLabel: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '500',
    },
    driverName: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1E293B',
    },
    contactBtn: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: '#055FEE', // Solid primary blue for calling
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#055FEE',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 4,
    },
    communicationButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    chatBtn: {
        backgroundColor: '#22C55E', // Solid green for chat
        shadowColor: '#22C55E',
    },
    contactIcon: {
        fontSize: 22,
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
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 3,
        elevation: 4,
    },
    unreadBadgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '800',
    },

    viewersCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)',
        marginBottom: Platform.OS === 'ios' ? 0 : 20,
        shadowColor: '#F59E0B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    viewersHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    viewersTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#D97706',
    },
    viewersSubtitle: {
        fontSize: 13,
        color: '#64748B',
        marginBottom: 12,
        lineHeight: 18,
    },
    viewersSeparator: {
        height: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
        marginBottom: 12,
    },
    viewingCountText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#475569',
        marginBottom: 8,
    },
    courierRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        padding: 10,
        borderRadius: 12,
        marginBottom: 6,
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.02)',
    },
    courierAvatarSmall: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#F59E0B',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    courierAvatarSmallText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: 'bold',
    },
    courierNameText: {
        fontSize: 13,
        color: '#1E293B',
        fontWeight: '500',
    },
    waitingText: {
        fontSize: 13,
        color: '#94A3B8',
        fontStyle: 'italic',
        textAlign: 'center',
        paddingVertical: 8,
    },
    acknowledgementContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.2)',
        marginBottom: Platform.OS === 'ios' ? 0 : 20,
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    acknowledgementHeader: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
        textAlign: 'center',
        marginBottom: 4,
    },
    acknowledgementSubheader: {
        fontSize: 13,
        color: '#64748B',
        textAlign: 'center',
        marginBottom: 16,
        lineHeight: 18,
    },
    proofRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 20,
    },
    proofCol: {
        flex: 1,
    },
    proofLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748B',
        marginBottom: 6,
        textAlign: 'center',
    },
    proofImageWrapper: {
        height: 100,
        backgroundColor: '#F1F5F9',
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    proofImage: {
        width: '100%',
        height: '100%',
    },
    proofSignatureWrapper: {
        height: 100,
        backgroundColor: '#F1F5F9',
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 8,
    },
    proofSignature: {
        width: '100%',
        height: '100%',
    },
    acknowledgeButtonContainer: {
        borderRadius: 14,
        overflow: 'hidden',
    },
    acknowledgeGradient: {
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    acknowledgeButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
    },
    doneButtonContainer: {
        borderRadius: 14,
        overflow: 'hidden',
    },
    doneGradient: {
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    doneButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
    },
    // Payment Directive Styles
    trackingPaymentCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 14,
        marginVertical: 10,
        gap: 10,
    },
    trackingPaymentCardCod: {
        backgroundColor: '#FEF3C7',
        borderWidth: 1,
        borderColor: '#F59E0B',
    },
    trackingPaymentCardDigital: {
        backgroundColor: '#ECFDF5',
        borderWidth: 1,
        borderColor: '#10B981',
    },
    trackingPaymentIcon: {
        fontSize: 22,
    },
    trackingPaymentTextWrap: {
        flex: 1,
    },
    trackingPaymentHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 2,
    },
    trackingPaymentTitle: {
        fontSize: 13,
        fontWeight: '800',
    },
    trackingPaymentTitleCod: {
        color: '#B45309',
    },
    trackingPaymentTitleDigital: {
        color: '#065F46',
    },
    trackingPaymentAmount: {
        fontSize: 14,
        fontWeight: '800',
    },
    trackingPaymentAmountCod: {
        color: '#B45309',
    },
    trackingPaymentAmountDigital: {
        color: '#065F46',
    },
    trackingPaymentDesc: {
        fontSize: 12,
        color: '#475569',
        lineHeight: 16,
    },
    // Handover Delivery PIN Styles
    handoverPinCard: {
        borderRadius: 16,
        padding: 14,
        marginVertical: 10,
        borderWidth: 1.5,
    },
    handoverPinCardActive: {
        backgroundColor: '#F0F7FF',
        borderColor: '#055FEE',
    },
    handoverPinCardLocked: {
        backgroundColor: '#FEF2F2',
        borderColor: '#EF4444',
    },
    handoverPinCardVerified: {
        backgroundColor: '#ECFDF5',
        borderColor: '#10B981',
    },
    handoverPinHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    handoverPinTitleGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    handoverPinIcon: {
        fontSize: 20,
    },
    handoverPinTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: '#0F172A',
    },
    handoverPinSubtitle: {
        fontSize: 11,
        fontWeight: '600',
        color: '#64748B',
    },
    handoverPinBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    handoverPinBadgeActive: {
        backgroundColor: '#055FEE1A',
    },
    handoverPinBadgeLocked: {
        backgroundColor: '#EF444420',
    },
    handoverPinBadgeVerified: {
        backgroundColor: '#10B98120',
    },
    handoverPinBadgeText: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    handoverPinBadgeTextActive: {
        color: '#055FEE',
    },
    handoverPinBadgeTextLocked: {
        color: '#EF4444',
    },
    handoverPinBadgeTextVerified: {
        color: '#10B981',
    },
    handoverPinDigitsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
        marginVertical: 8,
    },
    handoverPinDigitBox: {
        width: 48,
        height: 54,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        borderWidth: 1.5,
        borderColor: '#055FEE',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#055FEE',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
    },
    handoverPinDigitBoxLocked: {
        borderColor: '#EF4444',
        backgroundColor: '#FEE2E2',
    },
    handoverPinDigitBoxVerified: {
        borderColor: '#10B981',
        backgroundColor: '#D1FAE5',
    },
    handoverPinDigitText: {
        fontSize: 26,
        fontWeight: '900',
        color: '#055FEE',
        letterSpacing: 1,
    },
    handoverPinDigitTextLocked: {
        color: '#EF4444',
    },
    handoverPinDigitTextVerified: {
        color: '#047857',
    },
    handoverPinHelperText: {
        fontSize: 11,
        color: '#64748B',
        textAlign: 'center',
        marginTop: 4,
        lineHeight: 15,
        fontWeight: '500',
    },
    gateArrivalBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EFF6FF',
        borderWidth: 1.5,
        borderColor: '#3B82F6',
        padding: 14,
        borderRadius: 16,
        marginVertical: 10,
        gap: 12,
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 3,
    },
    gateArrivalIcon: {
        fontSize: 26,
    },
    gateArrivalTextWrap: {
        flex: 1,
    },
    gateArrivalTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#1D4ED8',
        marginBottom: 2,
    },
    gateArrivalDesc: {
        fontSize: 12,
        color: '#1E40AF',
        lineHeight: 16,
    },
    recipientInfoPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        marginBottom: 8,
        gap: 6,
    },
    recipientPillIcon: {
        fontSize: 14,
    },
    recipientPillText: {
        fontSize: 12,
        color: '#475569',
    },
    gateArrivalTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    timerCountdownRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#DBEAFE',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginTop: 10,
        gap: 8,
    },
    timerCountdownIcon: {
        fontSize: 18,
    },
    timerCountdownText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1E40AF',
    },
    timerCountdownClock: {
        fontSize: 16,
        fontWeight: '900',
        color: '#1D4ED8',
    },
    disputeBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEF2F2',
        borderWidth: 1.5,
        borderColor: '#EF4444',
        padding: 14,
        borderRadius: 16,
        marginVertical: 10,
        gap: 12,
    },
    disputeBannerIcon: {
        fontSize: 24,
    },
    disputeBannerTextWrap: {
        flex: 1,
    },
    disputeBannerTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#991B1B',
        marginBottom: 2,
    },
    disputeBannerDesc: {
        fontSize: 12,
        color: '#B91C1C',
        lineHeight: 16,
    },
    compensationCard: {
        backgroundColor: '#F0FDF4',
        borderWidth: 1.5,
        borderColor: '#22C55E',
        borderRadius: 16,
        padding: 14,
        marginVertical: 10,
    },
    compensationHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 10,
    },
    compensationIcon: {
        fontSize: 22,
    },
    compensationTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#166534',
        marginBottom: 2,
    },
    compensationSubtitle: {
        fontSize: 12,
        color: '#15803D',
        lineHeight: 16,
    },
    compensationActions: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 4,
    },
    compensationAcceptBtn: {
        flex: 1,
        backgroundColor: '#16A34A',
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: 'center',
    },
    compensationAcceptText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '800',
    },
    compensationDisputeBtn: {
        flex: 1,
        backgroundColor: '#FEE2E2',
        borderWidth: 1,
        borderColor: '#EF4444',
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: 'center',
    },
    compensationDisputeText: {
        color: '#B91C1C',
        fontSize: 13,
        fontWeight: '700',
    },
    reopenJobCard: {
        backgroundColor: '#F5F3FF',
        borderWidth: 1.5,
        borderColor: '#8B5CF6',
        borderRadius: 18,
        padding: 16,
        marginBottom: 12,
    },
    reopenBadgeWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#EDE9FE',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        alignSelf: 'flex-start',
        marginBottom: 8,
    },
    reopenBadgeIcon: {
        fontSize: 14,
    },
    reopenBadgeText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#6D28D9',
        letterSpacing: 0.5,
    },
    reopenTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#4C1D95',
        marginBottom: 4,
    },
    reopenDesc: {
        fontSize: 13,
        color: '#5B21B6',
        lineHeight: 18,
    },
    cancelOrderTriggerBtn: {
        marginTop: 12,
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: 12,
        backgroundColor: '#FEE2E2',
        borderWidth: 1,
        borderColor: '#FCA5A5',
    },
    cancelOrderTriggerText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#DC2626',
    },
    cancelModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        padding: 20,
    },
    cancelModalCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 24,
    },
    cancelModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    cancelModalTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
    },
    cancelModalClose: {
        fontSize: 20,
        color: '#94A3B8',
        fontWeight: '700',
    },
    cancelFeeBox: {
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        padding: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginBottom: 12,
    },
    cancelFeeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    cancelFeeLabel: {
        fontSize: 14,
        color: '#64748B',
    },
    cancelFeeValue: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0F172A',
    },
    cancelFeeDivider: {
        height: 1,
        backgroundColor: '#E2E8F0',
        marginVertical: 10,
    },
    cancelFeeTotalLabel: {
        fontSize: 15,
        fontWeight: '800',
        color: '#0F172A',
    },
    cancelFeeTotalValue: {
        fontSize: 18,
        fontWeight: '900',
        color: '#DC2626',
    },
    cancelFeeExplainer: {
        fontSize: 12,
        color: '#64748B',
        lineHeight: 16,
        marginBottom: 16,
    },
    cancelReasonLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#334155',
        marginBottom: 8,
    },
    cancelReasonOption: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginBottom: 8,
        backgroundColor: '#F8FAFC',
    },
    cancelReasonOptionActive: {
        borderColor: '#DC2626',
        backgroundColor: '#FEF2F2',
    },
    cancelReasonOptionText: {
        fontSize: 13,
        color: '#475569',
    },
    cancelReasonOptionTextActive: {
        color: '#DC2626',
        fontWeight: '700',
    },
    cancelModalActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 16,
    },
    cancelKeepBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: '#CBD5E1',
        alignItems: 'center',
    },
    cancelKeepText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#475569',
    },
    cancelConfirmBtn: {
        flex: 1.2,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#DC2626',
        alignItems: 'center',
    },
    cancelConfirmText: {
        fontSize: 14,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    disputeInput: {
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        borderRadius: 12,
        padding: 12,
        fontSize: 14,
        color: '#0F172A',
        backgroundColor: '#F8FAFC',
        textAlignVertical: 'top',
        marginBottom: 16,
    },
    submitDisputeBtn: {
        backgroundColor: '#EF4444',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    submitDisputeBtnText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },
    // Nearby Mates & Matchmaking Styles
    nearbyMateMarkerOuter: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    nearbyMateMarkerInner: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: '#055FEE',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2.5,
        borderColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    nearbyMateBadge: {
        backgroundColor: '#0F172A',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
        marginTop: 2,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    nearbyMateBadgeText: {
        color: '#FFFFFF',
        fontSize: 9,
        fontWeight: '700',
    },
    searchProgressBarTrack: {
        height: 4,
        backgroundColor: '#E2E8F0',
        borderRadius: 2,
        marginTop: 10,
        overflow: 'hidden',
    },
    searchProgressBarFill: {
        height: '100%',
        borderRadius: 2,
    },
    quickTipBanner: {
        marginTop: 12,
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        padding: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    quickTipText: {
        fontSize: 12,
        color: '#475569',
        marginBottom: 8,
    },
    quickTipChips: {
        flexDirection: 'row',
        gap: 8,
    },
    quickTipBtn: {
        backgroundColor: '#055FEE',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    quickTipBtnText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
    timeoutCard: {
        backgroundColor: '#FFFBEB',
        borderRadius: 18,
        padding: 16,
        borderWidth: 1.5,
        borderColor: '#FDE68A',
        marginBottom: 8,
    },
    timeoutHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 12,
    },
    timeoutIcon: {
        fontSize: 24,
    },
    timeoutTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#92400E',
        marginBottom: 3,
    },
    timeoutSubtitle: {
        fontSize: 12,
        color: '#B45309',
        lineHeight: 16,
    },
    boostLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#78350F',
        marginBottom: 8,
    },
    boostChipsRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 14,
    },
    boostChip: {
        flex: 1,
        backgroundColor: '#F59E0B',
        borderRadius: 10,
        paddingVertical: 8,
        alignItems: 'center',
        shadowColor: '#F59E0B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 2,
    },
    boostChipText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '800',
    },
    timeoutActionsRow: {
        flexDirection: 'row',
        gap: 10,
    },
    timeoutRetryBtn: {
        flex: 1.6,
        backgroundColor: '#055FEE',
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
    },
    timeoutRetryText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
    timeoutCancelBtn: {
        flex: 1,
        backgroundColor: '#F1F5F9',
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#CBD5E1',
    },
    timeoutCancelText: {
        color: '#DC2626',
        fontSize: 13,
        fontWeight: '700',
    },
    // Live Presence Viewer Styles
    presenceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 12,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
    },
    presenceIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    presenceDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    presenceText: {
        fontSize: 13,
        color: '#334155',
        fontWeight: '600',
        flex: 1,
    },
    avatarStack: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 8,
    },
    avatarCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#E0E7FF',
        borderWidth: 2,
        borderColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    avatarImage: {
        width: 28,
        height: 28,
        borderRadius: 14,
    },
    avatarInitial: {
        fontSize: 13,
        fontWeight: '700',
        color: '#4F46E5',
    },
    avatarOverflow: {
        backgroundColor: '#1E293B',
    },
    avatarOverflowText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#FFFFFF',
    },
});

