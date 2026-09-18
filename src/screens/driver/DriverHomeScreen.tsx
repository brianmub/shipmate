import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, TouchableOpacity, StatusBar, Platform, Alert, Modal, ActivityIndicator, Linking, Image } from 'react-native';
import MapView, { Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';

import { useEffect } from 'react';
import { userService } from '../../services/userService';
import { orderService } from '../../services/orderService';
import { supabase } from '../../utils/supabase';

const darkMapStyle = [
    {
        "elementType": "geometry",
        "stylers": [{ "color": "#242f3e" }]
    },
    {
        "elementType": "labels.text.fill",
        "stylers": [{ "color": "#746855" }]
    },
    {
        "elementType": "labels.text.stroke",
        "stylers": [{ "color": "#242f3e" }]
    },
    {
        "featureType": "administrative.locality",
        "elementType": "labels.text.fill",
        "stylers": [{ "color": "#d59563" }]
    },
    {
        "featureType": "road",
        "elementType": "geometry",
        "stylers": [{ "color": "#38414e" }]
    },
    {
        "featureType": "road",
        "elementType": "geometry.stroke",
        "stylers": [{ "color": "#212a37" }]
    },
    {
        "featureType": "road",
        "elementType": "labels.text.fill",
        "stylers": [{ "color": "#9ca5b3" }]
    },
    {
        "featureType": "water",
        "elementType": "geometry",
        "stylers": [{ "color": "#17263c" }]
    }
];

export const DriverHomeScreen = ({ navigation }: any) => {
    const { user, verificationStatus, setVerificationStatus } = useAuthStore();
    const [isOnline, setIsOnline] = useState(true);
    const [profile, setProfile] = useState<any>(null);
    const [walletBalance, setWalletBalance] = useState<number | null>(null);
    const [walletStatus, setWalletStatus] = useState<string>('active');
    const [loading, setLoading] = useState(true);
    const [selectedTutorialVideo, setSelectedTutorialVideo] = useState<any>(null);

    const tutorialVideos = [
        {
            id: 'orders-nav',
            title: 'App Navigation & Accepting Jobs',
            duration: '2 min guide',
            icon: 'navigate-circle',
            color: '#3B82F6',
            desc: 'Learn how live customer requests appear on your screen, how to accept or counter-bid with custom fares, and how turn-by-turn navigation guides you to pickup and drop-off.',
            steps: [
                '1. Toggle ONLINE when ready to work once approved.',
                '2. Incoming orders will ping your screen with pickup distance and estimated fare.',
                '3. Tap "Accept Job Now" or "View & Bid" to submit an offer with custom ETA.',
                '4. Follow GPS directions on the map to reach the pickup location promptly.'
            ]
        },
        {
            id: 'handover-pin',
            title: 'Handover PIN & Delivery Verification',
            duration: '1.5 min guide',
            icon: 'key-outline',
            color: '#10B981',
            desc: 'Every ShipMate delivery comes with a secure 4-digit Handover PIN. Collecting this PIN from the recipient guarantees that the package was handed over securely and triggers your payout.',
            steps: [
                '1. Greet the recipient at their door or delivery gate.',
                '2. Ask the recipient for their 4-digit Delivery Handover PIN.',
                '3. Enter the 4 digits in your app to confirm handover and release funds.',
                '4. If recipient PIN is unavailable, use the photo drop-off fallback with recipient signature.'
            ]
        },
        {
            id: 'corridors-earnings',
            title: 'Maximizing Earnings in High-Demand Corridors',
            duration: '3 min guide',
            icon: 'trending-up',
            color: '#F59E0B',
            desc: 'Understand Harare, Bulawayo, and regional corridor demand patterns, Cash-on-Delivery collections, and how to maintain high ratings for Platinum tier access.',
            steps: [
                '1. High demand occurs during lunch (11:30 AM - 2:00 PM) and evening rush (4:30 PM - 7:30 PM).',
                '2. Keep a $10–$20 USD cash float for Cash-on-Delivery orders to make exact change.',
                '3. Maintain ratings above 4.8★ to unlock 30-second early access to high-value orders.'
            ]
        }
    ];

    // Heatmap / Hot Zone State
    const [hotZones, setHotZones] = useState<any[]>([]);

    const generateHotZones = () => {
        // Mock data for demand hot zones around a central point (Silicon Valley mock)
        const zones = [
            { id: 1, latitude: 37.78825, longitude: -122.4324, radius: 800, intensity: 'high' },
            { id: 2, latitude: 37.7749, longitude: -122.4194, radius: 1200, intensity: 'medium' },
            { id: 3, latitude: 37.7950, longitude: -122.4000, radius: 600, intensity: 'high' },
            { id: 4, latitude: 37.7500, longitude: -122.4400, radius: 1500, intensity: 'low' },
        ];
        setHotZones(zones);
    };

    const isApproved = verificationStatus === 'approved';
    const isPending = verificationStatus === 'pending';
    const isRejected = verificationStatus === 'rejected';

    const firstName = user?.user_metadata?.full_name?.split(' ')[0] || 'Courier';

    const fetchData = async () => {
        if (!user) return;
        try {
            setLoading(true);
            const data = await userService.getDriverProfile(user.id);
            setProfile(data);

            const walletData = await userService.getCourierWallet(user.id);
            if (walletData) {
                setWalletBalance(walletData.balance);
                setWalletStatus(walletData.status);
                if (walletData.status === 'locked') {
                    setIsOnline(false);
                    if (data.is_online) {
                        await userService.toggleOnlineStatus(user.id, false);
                    }
                } else {
                    setIsOnline(data.is_online ?? true);
                }
            } else {
                setIsOnline(data.is_online ?? true);
            }
        } catch (error) {
            console.error('Error fetching driver profile:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        generateHotZones();
        const unsubscribe = navigation.addListener('focus', () => {
            fetchData();
        });
        return unsubscribe;
    }, [navigation]);

    const [pendingJobsCount, setPendingJobsCount] = useState(0);
    const [incomingOrder, setIncomingOrder] = useState<any>(null);
    const [acceptingIncoming, setAcceptingIncoming] = useState(false);

    const fetchPendingCount = async () => {
        try {
            const jobs = await orderService.getAvailableJobs();
            setPendingJobsCount(jobs?.length || 0);
        } catch (err) {
            console.warn('Could not fetch pending jobs count:', err);
        }
    };

    useEffect(() => {
        fetchPendingCount();

        // Real-time listener for incoming orders
        const channel = supabase
            .channel('public:driver_home_orders')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
                fetchPendingCount();
                if (payload.eventType === 'INSERT' && payload.new && payload.new.status === 'pending') {
                    if (isOnline) {
                        setIncomingOrder(payload.new);
                    }
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [isOnline]);

    // Real-time listener for driver verification changes (e.g. when approved by admin in web panel)
    useEffect(() => {
        if (!user) return;

        const driverChannel = supabase
            .channel(`public:driver_status_${user.id}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'drivers',
                filter: `id=eq.${user.id}`
            }, (payload) => {
                if (payload.new && payload.new.verification_status) {
                    setVerificationStatus(payload.new.verification_status as any);
                    if (payload.new.verification_status === 'approved') {
                        setIsOnline(true);
                        Alert.alert('🎉 Congratulations!', 'Your Courier Application has been approved by Fleet Admin! You can now go online and begin accepting orders.');
                    }
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(driverChannel);
        };
    }, [user?.id]);

    const handleAcceptIncoming = async () => {
        if (!incomingOrder || !user) return;
        try {
            setAcceptingIncoming(true);
            const { error } = await supabase
                .from('orders')
                .update({
                    status: 'driver_assigned',
                    driver_id: user.id,
                    updated_at: new Date().toISOString()
                })
                .eq('id', incomingOrder.id);

            if (error) throw error;

            setIncomingOrder(null);
            Alert.alert(
                "Job Accepted",
                "You have accepted this job! Please proceed to the pickup location.",
                [{ text: "Go to Active Job", onPress: () => navigation.navigate('ActiveJob') }]
            );
        } catch (err: any) {
            Alert.alert("Error", err.message || "Failed to accept job");
        } finally {
            setAcceptingIncoming(false);
        }
    };

    const toggleOnline = async () => {
        if (walletStatus === 'locked') {
            Alert.alert('Wallet Locked', `Your wallet is locked due to low balance ($${walletBalance?.toFixed(2) || '0.00'}). Please top up your wallet to go online.`);
            setIsOnline(false);
            return;
        }
        const nextState = !isOnline;
        setIsOnline(nextState);
        try {
            await userService.toggleOnlineStatus(user!.id, nextState);
        } catch (error) {
            setIsOnline(!nextState); // Rollback on error
            console.error('Error toggling status:', error);
        }
    };

    return (
        <LinearGradient
            colors={['#0F2027', '#203A43', '#2C5364']}
            style={styles.container}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
        >
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
            <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                    <View style={styles.header}>
                        <View>
                            <Text style={styles.greetingTitle}>Hello, {firstName}</Text>
                            <Text style={styles.greetingSubtitle}>
                                {isApproved ? 'Ready for deliveries?' : 'Account Verification in Progress'}
                            </Text>
                        </View>

                        {isApproved ? (
                            <BlurView intensity={20} tint="light" style={styles.toggleContainer}>
                                <Text style={[styles.statusText, isOnline ? styles.statusOnline : styles.statusOffline]}>
                                    {isOnline ? 'ONLINE' : 'OFFLINE'}
                                </Text>
                                <Switch
                                    trackColor={{ false: 'rgba(255,255,255,0.2)', true: '#055FEE' }}
                                    thumbColor={isOnline ? '#FFFFFF' : '#f4f3f4'}
                                    ios_backgroundColor="rgba(255,255,255,0.2)"
                                    onValueChange={toggleOnline}
                                    value={isOnline}
                                />
                            </BlurView>
                        ) : (
                            <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => Alert.alert('Verification in Progress', 'Your profile and vehicle details are currently under review by Fleet Admin. You will be able to go online as soon as your application is approved.')}
                            >
                                <BlurView intensity={25} tint="light" style={styles.toggleLockedContainer}>
                                    <Text style={styles.statusLockedText}>LOCKED</Text>
                                    <Ionicons name="lock-closed" size={14} color="#F59E0B" style={{ marginLeft: 5 }} />
                                </BlurView>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* PENDING VERIFICATION TOP BANNER */}
                    {!isApproved && (
                        <View style={styles.pendingReviewBanner}>
                            <View style={styles.pendingReviewHeader}>
                                <View style={styles.pendingReviewIconBadge}>
                                    <Ionicons name="time" size={22} color="#F59E0B" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <View style={styles.pendingReviewTitleRow}>
                                        <Text style={styles.pendingReviewTitle}>Application Under Review</Text>
                                        <View style={styles.pendingReviewPill}>
                                            <Text style={styles.pendingReviewPillText}>~24H REVIEW</Text>
                                        </View>
                                    </View>
                                    <Text style={styles.pendingReviewSubtitle}>
                                        Your documents and vehicle photos have been submitted. Features are currently restricted while our fleet team verifies your profile.
                                    </Text>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* COURIER ACADEMY & ORIENTATION SECTION (SHOWN WHEN PENDING) */}
                    {!isApproved && (
                        <View style={styles.academySection}>
                            <View style={styles.academyHeaderRow}>
                                <View style={styles.academyIconCircle}>
                                    <Ionicons name="school-outline" size={20} color="#38BDF8" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.academyTitle}>Courier Academy: Get Ready to Earn</Text>
                                    <Text style={styles.academySubtitle}>
                                        Learn how to navigate, verify deliveries, and maximize earnings once approved!
                                    </Text>
                                </View>
                            </View>

                            {/* Tutorial Guide Cards */}
                            <View style={styles.academyCardsWrap}>
                                {tutorialVideos.map((video) => (
                                    <TouchableOpacity
                                        key={video.id}
                                        style={styles.academyCard}
                                        activeOpacity={0.85}
                                        onPress={() => setSelectedTutorialVideo(video)}
                                    >
                                        <View style={styles.academyCardTop}>
                                            <View style={[styles.videoIconCircle, { backgroundColor: `${video.color}20` }]}>
                                                <Ionicons name={video.icon as any} size={22} color={video.color} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <View style={styles.videoTitleRow}>
                                                    <Text style={styles.videoTitle}>{video.title}</Text>
                                                    <View style={styles.videoDurationPill}>
                                                        <Ionicons name="play" size={10} color="#38BDF8" style={{ marginRight: 3 }} />
                                                        <Text style={styles.videoDurationText}>{video.duration}</Text>
                                                    </View>
                                                </View>
                                                <Text style={styles.videoDesc} numberOfLines={2}>{video.desc}</Text>
                                            </View>
                                        </View>
                                        <View style={styles.academyCardFooter}>
                                            <Text style={styles.tapToWatchText}>Tap to read guide & key steps →</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Essential Preparation Checklist */}
                            <BlurView intensity={20} tint="light" style={styles.prepChecklistCard}>
                                <Text style={styles.prepChecklistTitle}>📋 COURIER PREPARATION CHECKLIST</Text>
                                <View style={styles.prepItem}>
                                    <Ionicons name="phone-portrait-outline" size={16} color="#38BDF8" style={{ marginRight: 8, marginTop: 2 }} />
                                    <Text style={styles.prepText}>
                                        <Text style={{ fontWeight: '700', color: '#FFF' }}>Phone Mount & Charger: </Text>
                                        Keep a solid vehicle mount and charger so your phone never dies mid-delivery.
                                    </Text>
                                </View>
                                <View style={styles.prepItem}>
                                    <Ionicons name="cash-outline" size={16} color="#34D399" style={{ marginRight: 8, marginTop: 2 }} />
                                    <Text style={styles.prepText}>
                                        <Text style={{ fontWeight: '700', color: '#FFF' }}>Cash Float: </Text>
                                        Carry $10–$20 USD in small change for Cash-on-Delivery customer orders.
                                    </Text>
                                </View>
                                <View style={styles.prepItem}>
                                    <Ionicons name="star-outline" size={16} color="#FBBF24" style={{ marginRight: 8, marginTop: 2 }} />
                                    <Text style={styles.prepText}>
                                        <Text style={{ fontWeight: '700', color: '#FFF' }}>5-Star Customer Service: </Text>
                                        Always confirm parcels with the customer to maintain high ratings and unlock Platinum dispatch early access.
                                    </Text>
                                </View>
                            </BlurView>

                            {/* WhatsApp Fleet Support Button */}
                            <TouchableOpacity
                                style={styles.supportBtn}
                                activeOpacity={0.8}
                                onPress={() => Linking.openURL('https://wa.me/263773257425?text=Hi%20ShipMate%20Team%2C%20checking%20on%20my%20courier%20application%20status')}
                            >
                                <LinearGradient
                                    colors={['#10B981', '#059669']}
                                    style={styles.supportGradient}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                >
                                    <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                                    <Text style={styles.supportBtnText}>Questions? Chat with Fleet Support</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* WALLET STATUS BANNERS */}
                    {walletStatus === 'locked' && (
                        <TouchableOpacity 
                            activeOpacity={0.8}
                            onPress={() => navigation.navigate('Wallet')}
                        >
                            <View style={[styles.offlineWarning, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.4)' }]}>
                                <Text style={styles.warningIcon}>🔒</Text>
                                <Text style={[styles.offlineWarningText, { color: '#FCA5A5' }]}>
                                    Wallet Lockout: Your balance is below $0.25. Tap here to top up with ClicknPay.
                                </Text>
                            </View>
                        </TouchableOpacity>
                    )}
                    {walletStatus !== 'locked' && walletBalance !== null && walletBalance <= 3.00 && (
                        <TouchableOpacity 
                            activeOpacity={0.8}
                            onPress={() => navigation.navigate('Wallet')}
                        >
                            <View style={[styles.offlineWarning, { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.4)' }]}>
                                <Text style={styles.warningIcon}>⚠️</Text>
                                <Text style={[styles.offlineWarningText, { color: '#FCD34D' }]}>
                                    Low Wallet Balance: Your balance is ${walletBalance.toFixed(2)}. Tap here to top up with ClicknPay.
                                </Text>
                            </View>
                        </TouchableOpacity>
                    )}

                    {/* PREDICTIVE HEATMAP SECTION */}
                    <View style={styles.mapCard}>
                        <View style={styles.mapHeader}>
                            <Text style={styles.mapTitle}>Live Demand Heatmap</Text>
                            <View style={styles.liveBadge}>
                                <View style={styles.liveDot} />
                                <Text style={styles.liveText}>PREDICTIVE AI</Text>
                            </View>
                        </View>
                        
                        <View style={styles.mapWrapper}>
                            <MapView
                                provider={PROVIDER_GOOGLE}
                                style={styles.map}
                                initialRegion={{
                                    latitude: 37.78825,
                                    longitude: -122.4324,
                                    latitudeDelta: 0.05,
                                    longitudeDelta: 0.05,
                                }}
                                customMapStyle={darkMapStyle}
                            >
                                {hotZones.map(zone => (
                                    <Circle
                                        key={zone.id}
                                        center={{ latitude: zone.latitude, longitude: zone.longitude }}
                                        radius={zone.radius}
                                        fillColor={
                                            zone.intensity === 'high' ? 'rgba(239, 68, 68, 0.4)' :
                                            zone.intensity === 'medium' ? 'rgba(245, 158, 11, 0.4)' :
                                            'rgba(234, 179, 8, 0.4)'
                                        }
                                        strokeColor={
                                            zone.intensity === 'high' ? 'rgba(239, 68, 68, 0.6)' :
                                            zone.intensity === 'medium' ? 'rgba(245, 158, 11, 0.6)' :
                                            'rgba(234, 179, 8, 0.6)'
                                        }
                                        strokeWidth={2}
                                    />
                                ))}
                            </MapView>
                            
                            {!isOnline && (
                                <BlurView intensity={80} tint="dark" style={styles.mapOverlay}>
                                    <Text style={styles.mapOverlayText}>Go Online to see Live Demand</Text>
                                </BlurView>
                            )}
                        </View>
                        
                        <View style={styles.mapFooter}>
                            <Text style={styles.mapFooterText}>
                                {isOnline ? "High demand detected in Downtown SOMA" : "Historical demand data shown"}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Today's Snapshot</Text>
                        <TouchableOpacity onPress={() => navigation.navigate('Earnings')}>
                            <Text style={styles.viewMore}>View Details →</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.statsGrid}>
                        <TouchableOpacity 
                            style={{ flex: 1 }} 
                            activeOpacity={0.8} 
                            onPress={() => navigation.navigate('Wallet')}
                        >
                            <BlurView intensity={20} tint="light" style={styles.statCardContainer}>
                                <Text style={styles.statLabel}>Wallet Balance (Tap)</Text>
                                <Text style={[styles.statValue, styles.earningsValue]}>${walletBalance !== null ? walletBalance.toFixed(2) : '0.00'}</Text>
                            </BlurView>
                        </TouchableOpacity>
                        <BlurView intensity={20} tint="light" style={styles.statCardContainer}>
                            <Text style={styles.statLabel}>Deliveries</Text>
                            <Text style={styles.statValue}>{profile?.completed_deliveries || 0}</Text>
                        </BlurView>
                    </View>

                    <View style={styles.statsGrid}>
                        <BlurView intensity={20} tint="light" style={styles.statCardContainer}>
                            <Text style={styles.statLabel}>Rating</Text>
                            <View style={styles.row}>
                                <Text style={styles.statValue}>{profile?.average_rating || '5.0'}</Text>
                                <Text style={{ marginLeft: 4, fontSize: 16 }}>⭐</Text>
                            </View>
                        </BlurView>
                        <BlurView intensity={20} tint="light" style={styles.statCardContainer}>
                            <Text style={styles.statLabel}>Radius</Text>
                            <Text style={styles.statValue}>{profile?.working_radius_km || 10}km</Text>
                        </BlurView>
                    </View>

                    <View style={styles.jobsSection}>
                        <Text style={styles.sectionTitle}>Job Queue</Text>
                        <TouchableOpacity
                            style={styles.jobsButtonContainer}
                            activeOpacity={0.8}
                            onPress={() => navigation.navigate('Jobs')}
                            disabled={!isOnline || walletStatus === 'locked'}
                        >
                            <LinearGradient
                                colors={isOnline && walletStatus !== 'locked' ? (pendingJobsCount > 0 ? ['#F59E0B', '#EA580C'] : ['#055FEE', '#5B99F2']) : ['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.1)']}
                                style={styles.jobsGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                <Text style={[styles.jobsButtonText, (!isOnline || walletStatus === 'locked') && styles.jobsButtonTextOffline]}>
                                    {walletStatus === 'locked' 
                                        ? 'Locked (Low Balance)' 
                                        : isOnline 
                                            ? pendingJobsCount > 0 
                                                ? `⚡ View Available Jobs (${pendingJobsCount} New!)` 
                                                : 'View Available Jobs' 
                                            : 'Go Online to View Jobs'}
                                </Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>

                </ScrollView>

                {/* INCOMING JOB MODAL */}
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
                                    onPress={handleAcceptIncoming}
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
                                            const orderId = incomingOrder?.id;
                                            setIncomingOrder(null);
                                            navigation.navigate('Jobs', { orderId });
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

                {/* TUTORIAL GUIDE DETAILS MODAL */}
                <Modal
                    visible={!!selectedTutorialVideo}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setSelectedTutorialVideo(null)}
                >
                    <View style={styles.tutorialModalBackdrop}>
                        <View style={styles.tutorialModalCard}>
                            <View style={styles.tutorialModalHeader}>
                                <View style={[styles.tutorialModalBadge, { backgroundColor: `${selectedTutorialVideo?.color}20` }]}>
                                    <Ionicons name={selectedTutorialVideo?.icon as any} size={24} color={selectedTutorialVideo?.color} />
                                </View>
                                <TouchableOpacity 
                                    onPress={() => setSelectedTutorialVideo(null)}
                                    style={styles.incomingCloseBtn}
                                >
                                    <Text style={styles.incomingCloseTxt}>✕</Text>
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.tutorialModalTitle}>{selectedTutorialVideo?.title}</Text>
                            <Text style={styles.tutorialModalDuration}>{selectedTutorialVideo?.duration}</Text>
                            <Text style={styles.tutorialModalDesc}>{selectedTutorialVideo?.desc}</Text>

                            <View style={styles.tutorialStepsBox}>
                                <Text style={styles.tutorialModalStepsTitle}>KEY ACTION STEPS</Text>
                                {selectedTutorialVideo?.steps?.map((step: string, sIdx: number) => (
                                    <View key={sIdx} style={styles.tutorialModalStepRow}>
                                        <Text style={styles.tutorialModalStepNum}>✓</Text>
                                        <Text style={styles.tutorialModalStepText}>{step}</Text>
                                    </View>
                                ))}
                            </View>

                            <TouchableOpacity
                                style={styles.tutorialModalDoneBtn}
                                onPress={() => setSelectedTutorialVideo(null)}
                                activeOpacity={0.85}
                            >
                                <LinearGradient
                                    colors={['#055FEE', '#5B99F2']}
                                    style={styles.tutorialModalDoneGradient}
                                >
                                    <Text style={styles.tutorialModalDoneText}>Got it, thanks!</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
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
        paddingHorizontal: 24,
        paddingTop: Platform.OS === 'android' ? 60 : 20,
        paddingBottom: 40,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 32,
    },
    greetingTitle: {
        fontSize: 32,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: -0.5,
        marginBottom: 4,
    },
    greetingSubtitle: {
        fontSize: 16,
        color: '#E2E8F0',
    },
    toggleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    statusText: {
        marginRight: 8,
        fontWeight: 'bold',
        fontSize: 13,
        letterSpacing: 0.5,
    },
    statusOnline: {
        color: '#10B981',
    },
    statusOffline: {
        color: '#E2E8F0',
    },
    offlineWarning: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.4)',
        marginBottom: 32,
    },
    warningIcon: {
        fontSize: 20,
        marginRight: 12,
    },
    offlineWarningText: {
        flex: 1,
        color: '#FCD34D',
        fontSize: 14,
        fontWeight: '500',
        lineHeight: 20,
    },
    pendingBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(5, 95, 238, 0.15)',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(5, 95, 238, 0.4)',
        marginBottom: 32,
    },
    pendingText: {
        flex: 1,
        color: '#86EFAC',
        fontSize: 14,
        fontWeight: '500',
        lineHeight: 20,
    },
    rejectedBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.4)',
        marginBottom: 32,
    },
    rejectedText: {
        flex: 1,
        color: '#FCA5A5',
        fontSize: 14,
        fontWeight: '500',
        lineHeight: 20,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    viewMore: {
        fontSize: 14,
        color: '#055FEE',
        fontWeight: '600',
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#FFFFFF',
        letterSpacing: -0.5,
    },
    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
        gap: 16,
    },
    statCardContainer: {
        flex: 1,
        padding: 24,
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    statLabel: {
        fontSize: 14,
        color: '#CBD5E1',
        marginBottom: 8,
        fontWeight: '600',
    },
    statValue: {
        fontSize: 28,
        fontWeight: '800',
        color: '#38BDF8',
    },
    earningsValue: {
        color: '#34D399',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    jobsSection: {
        marginTop: 24,
    },
    jobsButtonContainer: {
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#055FEE',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    jobsGradient: {
        paddingVertical: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    jobsButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    jobsButtonTextOffline: {
        color: 'rgba(255,255,255,0.5)',
    },
    mapCard: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        marginBottom: 32,
    },
    mapHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
    },
    mapTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    liveBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(176, 106, 40, 0.3)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    liveDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#055FEE',
        marginRight: 6,
    },
    liveText: {
        color: '#055FEE',
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1,
    },
    mapWrapper: {
        width: '100%',
        height: 250,
    },
    map: {
        ...StyleSheet.absoluteFillObject,
    },
    mapOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    mapOverlayText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 16,
        textAlign: 'center',
        paddingHorizontal: 40,
    },
    mapFooter: {
        padding: 12,
        backgroundColor: 'rgba(0,0,0,0.2)',
    },
    mapFooterText: {
        color: '#94A3B8',
        fontSize: 12,
        textAlign: 'center',
    },
    // INCOMING ORDER MODAL STYLES
    incomingModalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
        padding: 16,
    },
    incomingCard: {
        backgroundColor: '#0F172A',
        borderRadius: 28,
        borderWidth: 1.5,
        borderColor: '#3B82F6',
        padding: 22,
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 20,
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
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        borderColor: 'rgba(239, 68, 68, 0.5)',
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 20,
    },
    incomingBadgePulse: {
        fontSize: 14,
        marginRight: 6,
    },
    incomingBadgeText: {
        color: '#EF4444',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    incomingCloseBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    incomingCloseTxt: {
        color: '#94A3B8',
        fontSize: 14,
        fontWeight: 'bold',
    },
    incomingFareRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 14,
        borderRadius: 18,
        marginBottom: 16,
    },
    incomingServiceType: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 2,
    },
    incomingPaymentMethod: {
        color: '#94A3B8',
        fontSize: 12,
    },
    incomingFareBadge: {
        alignItems: 'flex-end',
    },
    incomingFareAmount: {
        color: '#10B981',
        fontSize: 22,
        fontWeight: '900',
    },
    incomingFareLabel: {
        color: '#6EE7B7',
        fontSize: 10,
        fontWeight: '700',
    },
    incomingRouteBox: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        marginBottom: 20,
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
        color: '#64748B',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    incomingRouteVal: {
        color: '#E2E8F0',
        fontSize: 13,
        fontWeight: '600',
        lineHeight: 18,
    },
    incomingRouteDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginVertical: 10,
        marginLeft: 26,
    },
    incomingActions: {
        gap: 10,
    },
    incomingAcceptBtn: {
        borderRadius: 18,
        overflow: 'hidden',
    },
    incomingAcceptGradient: {
        paddingVertical: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    incomingAcceptTxt: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '800',
    },
    incomingSecondaryRow: {
        flexDirection: 'row',
        gap: 10,
    },
    incomingViewBtn: {
        flex: 2,
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.4)',
        paddingVertical: 12,
        borderRadius: 14,
        alignItems: 'center',
    },
    incomingViewTxt: {
        color: '#60A5FA',
        fontSize: 13,
        fontWeight: '700',
    },
    incomingDeclineBtn: {
        flex: 1,
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.3)',
        paddingVertical: 12,
        borderRadius: 14,
        alignItems: 'center',
    },
    incomingDeclineTxt: {
        color: '#F87171',
        fontSize: 13,
        fontWeight: '700',
    },
    // PENDING MODE & COURIER ACADEMY STYLES
    toggleLockedContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        borderColor: 'rgba(245, 158, 11, 0.35)',
        borderWidth: 1,
        overflow: 'hidden',
    },
    statusLockedText: {
        color: '#FCD34D',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    pendingReviewBanner: {
        backgroundColor: 'rgba(245, 158, 11, 0.08)',
        borderColor: 'rgba(245, 158, 11, 0.3)',
        borderWidth: 1,
        borderRadius: 22,
        padding: 16,
        marginBottom: 20,
    },
    pendingReviewHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    pendingReviewIconBadge: {
        width: 42,
        height: 42,
        borderRadius: 14,
        backgroundColor: 'rgba(245, 158, 11, 0.18)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        marginTop: 2,
    },
    pendingReviewTitleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    pendingReviewTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#FDE68A',
        flex: 1,
    },
    pendingReviewPill: {
        backgroundColor: 'rgba(245, 158, 11, 0.25)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
    },
    pendingReviewPillText: {
        color: '#FCD34D',
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    pendingReviewSubtitle: {
        fontSize: 12,
        color: '#CBD5E1',
        lineHeight: 17,
    },
    academySection: {
        marginBottom: 26,
    },
    academyHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
    },
    academyIconCircle: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: 'rgba(56, 189, 248, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    academyTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    academySubtitle: {
        fontSize: 12,
        color: '#94A3B8',
        marginTop: 2,
    },
    academyCardsWrap: {
        gap: 12,
        marginBottom: 16,
    },
    academyCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderColor: 'rgba(255, 255, 255, 0.09)',
        borderWidth: 1,
        borderRadius: 20,
        padding: 16,
    },
    academyCardTop: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    videoIconCircle: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    videoTitleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    videoTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#FFFFFF',
        flex: 1,
        marginRight: 6,
    },
    videoDurationPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(56, 189, 248, 0.15)',
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 8,
    },
    videoDurationText: {
        color: '#38BDF8',
        fontSize: 9,
        fontWeight: '800',
    },
    videoDesc: {
        fontSize: 12,
        color: '#94A3B8',
        lineHeight: 17,
    },
    academyCardFooter: {
        marginTop: 10,
        paddingTop: 8,
        borderTopWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    tapToWatchText: {
        color: '#38BDF8',
        fontSize: 11,
        fontWeight: '700',
    },
    prepChecklistCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderColor: 'rgba(255, 255, 255, 0.07)',
        borderWidth: 1,
        borderRadius: 20,
        padding: 16,
        marginBottom: 14,
        overflow: 'hidden',
        gap: 10,
    },
    prepChecklistTitle: {
        fontSize: 11,
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 0.8,
        marginBottom: 4,
    },
    prepItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    prepText: {
        fontSize: 12,
        color: '#94A3B8',
        lineHeight: 17,
        flex: 1,
    },
    supportBtn: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    supportGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    supportBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
    // TUTORIAL GUIDE MODAL STYLES
    tutorialModalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.75)',
        justifyContent: 'center',
        padding: 20,
    },
    tutorialModalCard: {
        backgroundColor: '#0F172A',
        borderRadius: 28,
        borderWidth: 1,
        borderColor: 'rgba(56, 189, 248, 0.3)',
        padding: 24,
    },
    tutorialModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    tutorialModalBadge: {
        width: 48,
        height: 48,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tutorialModalTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#FFFFFF',
        marginBottom: 4,
    },
    tutorialModalDuration: {
        fontSize: 12,
        fontWeight: '700',
        color: '#38BDF8',
        marginBottom: 10,
    },
    tutorialModalDesc: {
        fontSize: 13,
        color: '#CBD5E1',
        lineHeight: 19,
        marginBottom: 18,
    },
    tutorialStepsBox: {
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.06)',
        marginBottom: 20,
        gap: 8,
    },
    tutorialModalStepsTitle: {
        fontSize: 10,
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 0.8,
        marginBottom: 4,
    },
    tutorialModalStepRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    tutorialModalStepNum: {
        color: '#10B981',
        fontWeight: '800',
        marginRight: 8,
        marginTop: 1,
    },
    tutorialModalStepText: {
        color: '#E2E8F0',
        fontSize: 12,
        lineHeight: 17,
        flex: 1,
    },
    tutorialModalDoneBtn: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    tutorialModalDoneGradient: {
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tutorialModalDoneText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },
});
