import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Vibration,
    Platform,
    PanResponder,
    SafeAreaView
} from 'react-native';
import { setupForegroundNotificationListener } from '../utils/pushNotifications';
import { supabase } from '../utils/supabase';

export interface IncomingCallData {
    type: 'in_app_call';
    orderId: string;
    callerId: string;
    callerName: string;
    callerRole: 'driver' | 'customer';
    recipientRole?: 'driver' | 'customer';
    channelName?: string;
}

export interface IncomingMessageData {
    type: 'in_app_message';
    orderId: string;
    senderId: string;
    senderName: string;
    senderRole: 'driver' | 'customer';
    recipientRole?: 'driver' | 'customer';
    messageText: string;
}

export interface InAppNotificationBannerProps {
    onAnswerCall?: (data: IncomingCallData) => void;
    onDeclineCall?: (data: IncomingCallData) => void;
    onOpenMessage?: (data: IncomingMessageData) => void;
    currentUserId?: string | null;
}

export const InAppNotificationBanner: React.FC<InAppNotificationBannerProps> = ({
    onAnswerCall,
    onDeclineCall,
    onOpenMessage,
    currentUserId
}) => {
    const [callNotification, setCallNotification] = useState<IncomingCallData | null>(null);
    const [messageNotification, setMessageNotification] = useState<IncomingMessageData | null>(null);

    const slideAnim = useRef(new Animated.Value(-200)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
    const autoDismissTimer = useRef<NodeJS.Timeout | null>(null);

    // Slide down when notification arrives
    const showBanner = () => {
        Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
            tension: 50
        }).start();
    };

    // Slide up when notification is dismissed
    const hideBanner = (callback?: () => void) => {
        Animated.timing(slideAnim, {
            toValue: -220,
            duration: 250,
            useNativeDriver: true
        }).start(() => {
            if (callback) callback();
        });
    };

    // Start inDrive/Bolt style ringing vibration pattern
    const startCallRingingVibration = () => {
        if (Platform.OS !== 'web') {
            // Pattern: wait 0ms, buzz 600ms, pause 300ms, buzz 600ms, pause 300ms, pause 1000ms, repeat
            Vibration.vibrate([0, 600, 300, 600, 300, 1000], true);
        }

        // Pulse avatar ring animation
        pulseLoop.current = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.25,
                    duration: 600,
                    useNativeDriver: true
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1.0,
                    duration: 600,
                    useNativeDriver: true
                })
            ])
        );
        pulseLoop.current.start();
    };

    const stopCallRingingVibration = () => {
        if (Platform.OS !== 'web') {
            Vibration.cancel();
        }
        if (pulseLoop.current) {
            pulseLoop.current.stop();
            pulseAnim.setValue(1);
        }
    };

    // Foreground Push Notification Listener
    useEffect(() => {
        const unsubscribe = setupForegroundNotificationListener((notification) => {
            const data = notification.request.content.data;
            if (!data) return;

            if (data.type === 'in_app_call') {
                handleIncomingCall(data as unknown as IncomingCallData);
            } else if (data.type === 'in_app_message') {
                handleIncomingMessage(data as unknown as IncomingMessageData);
            }
        });

        return () => {
            unsubscribe();
            stopCallRingingVibration();
            if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current);
        };
    }, []);

    // Also listen for real-time signaling broadcasts if user has active session
    useEffect(() => {
        if (!currentUserId) return;

        const userChannel = supabase.channel(`user_alerts_${currentUserId}`);
        userChannel
            .on('broadcast', { event: 'incoming_call' }, (payload: any) => {
                if (payload.payload) {
                    handleIncomingCall(payload.payload as IncomingCallData);
                }
            })
            .on('broadcast', { event: 'incoming_message' }, (payload: any) => {
                if (payload.payload) {
                    handleIncomingMessage(payload.payload as IncomingMessageData);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(userChannel);
        };
    }, [currentUserId]);

    const handleIncomingCall = (data: IncomingCallData) => {
        // Clear existing message toast if any
        if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current);
        setMessageNotification(null);

        setCallNotification(data);
        showBanner();
        startCallRingingVibration();

        // 30 seconds auto-dismiss for calls if not answered
        autoDismissTimer.current = setTimeout(() => {
            handleDeclineCall();
        }, 30000);
    };

    const handleIncomingMessage = (data: IncomingMessageData) => {
        // If an active call banner is already ringing, do not override it
        if (callNotification) return;

        if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current);
        setMessageNotification(data);
        showBanner();

        if (Platform.OS !== 'web') {
            Vibration.vibrate(200); // Gentle message buzz
        }

        // 6 seconds auto-dismiss for message toast
        autoDismissTimer.current = setTimeout(() => {
            hideBanner(() => setMessageNotification(null));
        }, 6000);
    };

    const handleAnswerCall = () => {
        if (!callNotification) return;
        stopCallRingingVibration();
        if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current);

        const callData = callNotification;
        hideBanner(() => {
            setCallNotification(null);
            if (onAnswerCall) {
                onAnswerCall(callData);
            }
        });
    };

    const handleDeclineCall = () => {
        if (!callNotification) return;
        stopCallRingingVibration();
        if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current);

        const callData = callNotification;

        // Broadcast decline to counterpart
        try {
            const channel = supabase.channel(callData.channelName || `order_call_${callData.orderId}`);
            channel.send({
                type: 'broadcast',
                event: 'call_action',
                payload: { action: 'decline_call', orderId: callData.orderId }
            });
        } catch (err) {
            console.warn('Could not broadcast call decline:', err);
        }

        hideBanner(() => {
            setCallNotification(null);
            if (onDeclineCall) {
                onDeclineCall(callData);
            }
        });
    };

    const handleTapMessage = () => {
        if (!messageNotification) return;
        if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current);

        const msgData = messageNotification;
        hideBanner(() => {
            setMessageNotification(null);
            if (onOpenMessage) {
                onOpenMessage(msgData);
            }
        });
    };

    if (!callNotification && !messageNotification) {
        return null;
    }

    return (
        <Animated.View
            style={[
                styles.container,
                { transform: [{ translateY: slideAnim }] }
            ]}
            pointerEvents="box-none"
        >
            <SafeAreaView style={styles.safeArea}>
                {/* 1. INCOMING CALL BANNER */}
                {callNotification && (
                    <View style={styles.callBannerCard}>
                        <View style={styles.callLeftSection}>
                            <View style={styles.callAvatarWrapper}>
                                <Animated.View
                                    style={[
                                        styles.callPulseRing,
                                        { transform: [{ scale: pulseAnim }] }
                                    ]}
                                />
                                <View style={styles.callAvatarBadge}>
                                    <Text style={styles.callAvatarText}>
                                        {(callNotification.callerName || 'M').charAt(0).toUpperCase()}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.callInfoSection}>
                                <View style={styles.callLivePill}>
                                    <View style={styles.callLiveDot} />
                                    <Text style={styles.callLiveText}>INCOMING AUDIO CALL</Text>
                                </View>
                                <Text style={styles.callNameText} numberOfLines={1}>
                                    {callNotification.callerName}
                                </Text>
                                <Text style={styles.callOrderSubtext}>
                                    {callNotification.callerRole === 'driver' ? 'ShipMate Courier' : 'Customer'} &bull; #{callNotification.orderId.substring(0, 8)}
                                </Text>
                            </View>
                        </View>

                        {/* Call Action Controls */}
                        <View style={styles.callActionRow}>
                            <TouchableOpacity
                                style={[styles.callActionBtn, styles.callDeclineBtn]}
                                onPress={handleDeclineCall}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.callActionIcon}>📵</Text>
                                <Text style={styles.callActionLabel}>Decline</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.callActionBtn, styles.callAnswerBtn]}
                                onPress={handleAnswerCall}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.callActionIcon}>📞</Text>
                                <Text style={styles.callActionLabel}>Answer</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* 2. INCOMING MESSAGE TOAST BANNER */}
                {messageNotification && !callNotification && (
                    <TouchableOpacity
                        style={styles.messageToastCard}
                        onPress={handleTapMessage}
                        activeOpacity={0.9}
                    >
                        <View style={styles.messageIconBadge}>
                            <Text style={styles.messageIconText}>💬</Text>
                        </View>

                        <View style={styles.messageInfoSection}>
                            <View style={styles.messageHeaderRow}>
                                <Text style={styles.messageSenderText} numberOfLines={1}>
                                    {messageNotification.senderName}
                                </Text>
                                <Text style={styles.messageTimeText}>Just now</Text>
                            </View>
                            <Text style={styles.messageBodyText} numberOfLines={2}>
                                {messageNotification.messageText || 'Sent a new message.'}
                            </Text>
                            <Text style={styles.messageActionHint}>Tap to reply</Text>
                        </View>

                        <TouchableOpacity
                            style={styles.messageCloseBtn}
                            onPress={() => hideBanner(() => setMessageNotification(null))}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        >
                            <Text style={styles.messageCloseIcon}>✕</Text>
                        </TouchableOpacity>
                    </TouchableOpacity>
                )}
            </SafeAreaView>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        elevation: 99999,
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'android' ? 12 : 6,
    },
    safeArea: {
        width: '100%',
        alignItems: 'center',
    },
    // CALL BANNER STYLES
    callBannerCard: {
        width: '100%',
        maxWidth: 480,
        backgroundColor: '#0F172A',
        borderRadius: 20,
        padding: 16,
        borderWidth: 1.5,
        borderColor: '#10B981',
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 18,
        elevation: 16,
    },
    callLeftSection: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
    },
    callAvatarWrapper: {
        position: 'relative',
        width: 52,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    callPulseRing: {
        position: 'absolute',
        width: 52,
        height: 52,
        borderRadius: 26,
        borderWidth: 2,
        borderColor: '#10B981',
        opacity: 0.7,
    },
    callAvatarBadge: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#055FEE',
        alignItems: 'center',
        justifyContent: 'center',
    },
    callAvatarText: {
        fontSize: 20,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    callInfoSection: {
        flex: 1,
    },
    callLivePill: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 2,
    },
    callLiveDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#10B981',
        marginRight: 6,
    },
    callLiveText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#10B981',
        letterSpacing: 0.5,
    },
    callNameText: {
        fontSize: 17,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    callOrderSubtext: {
        fontSize: 12,
        color: '#94A3B8',
        marginTop: 1,
    },
    callActionRow: {
        flexDirection: 'row',
        gap: 12,
    },
    callActionBtn: {
        flex: 1,
        flexDirection: 'row',
        height: 46,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 4,
    },
    callDeclineBtn: {
        backgroundColor: '#EF4444',
    },
    callAnswerBtn: {
        backgroundColor: '#10B981',
    },
    callActionIcon: {
        fontSize: 18,
        marginRight: 8,
    },
    callActionLabel: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
    },
    // MESSAGE TOAST STYLES
    messageToastCard: {
        width: '100%',
        maxWidth: 480,
        backgroundColor: '#1E293B',
        borderRadius: 16,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#38BDF8',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 12,
    },
    messageIconBadge: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: 'rgba(56, 189, 248, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    messageIconText: {
        fontSize: 20,
    },
    messageInfoSection: {
        flex: 1,
    },
    messageHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 2,
    },
    messageSenderText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    messageTimeText: {
        fontSize: 11,
        color: '#64748B',
    },
    messageBodyText: {
        fontSize: 13,
        color: '#CBD5E1',
        lineHeight: 18,
    },
    messageActionHint: {
        fontSize: 11,
        color: '#38BDF8',
        fontWeight: '600',
        marginTop: 3,
    },
    messageCloseBtn: {
        padding: 6,
        marginLeft: 8,
    },
    messageCloseIcon: {
        fontSize: 14,
        color: '#94A3B8',
        fontWeight: 'bold',
    },
});
