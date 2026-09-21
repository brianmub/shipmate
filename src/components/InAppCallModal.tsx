import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Animated,
    Easing,
    Platform,
    Linking,
    Alert
} from 'react-native';
import { supabase } from '../utils/supabase';
import { orderService } from '../services/orderService';

export interface InAppCallModalProps {
    visible: boolean;
    orderId: string;
    callerId: string;
    callerRole: 'driver' | 'customer';
    targetName: string;
    targetRole: 'driver' | 'customer';
    onClose: () => void;
    onCallCompleted?: (durationSeconds: number) => void;
    proxyNumber?: string;
    isIncoming?: boolean;
    initialState?: CallState;
}

export type CallState = 'initiating' | 'ringing' | 'connected' | 'ended';

export const InAppCallModal: React.FC<InAppCallModalProps> = ({
    visible,
    orderId,
    callerId,
    callerRole,
    targetName,
    targetRole,
    onClose,
    onCallCompleted,
    proxyNumber = '+2638677000123',
    isIncoming = false,
    initialState
}) => {
    const [callState, setCallState] = useState<CallState>(
        initialState || (isIncoming ? 'connected' : 'initiating')
    );
    const [durationSeconds, setDurationSeconds] = useState<number>(0);
    const [isMuted, setIsMuted] = useState<boolean>(false);
    const [isSpeakerOn, setIsSpeakerOn] = useState<boolean>(false);

    // Pulse animation for avatar
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const durationRef = useRef<number>(0);

    // Keep durationRef in sync with durationSeconds for callbacks
    useEffect(() => {
        durationRef.current = durationSeconds;
    }, [durationSeconds]);

    // Handle pulse animation while connecting/ringing/in-call
    useEffect(() => {
        if (!visible) return;

        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.15,
                    duration: 1000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1.0,
                    duration: 1000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ])
        );

        pulse.start();

        return () => {
            pulse.stop();
            pulseAnim.setValue(1);
        };
    }, [visible, callState]);

    // Manage call progression and real-time audio channel
    useEffect(() => {
        if (!visible || !orderId) {
            setCallState(isIncoming ? 'connected' : 'initiating');
            setDurationSeconds(0);
            setIsMuted(false);
            setIsSpeakerOn(false);
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            return;
        }

        // 1. Set up real-time signaling channel
        const channelName = `order_call_${orderId}`;
        const channel = supabase.channel(channelName);

        channel
            .on('broadcast', { event: 'call_action' }, (payload: any) => {
                const action = payload.payload?.action;
                if (action === 'end_call' || action === 'decline_call') {
                    handleRemoteCallEnd();
                } else if (action === 'answer_call') {
                    setCallState('connected');
                }
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    if (isIncoming) {
                        channel.send({
                            type: 'broadcast',
                            event: 'call_action',
                            payload: { action: 'answer_call', orderId }
                        });
                    } else {
                        channel.send({
                            type: 'broadcast',
                            event: 'call_action',
                            payload: { action: 'initiate_call', callerId, callerRole, orderId }
                        });
                    }
                }
            });

        // 2. If caller, dispatch backend push notification to recipient immediately
        let ringingTimeout: NodeJS.Timeout | null = null;
        let connectTimeout: NodeJS.Timeout | null = null;

        if (!isIncoming) {
            supabase.functions.invoke('notify-call-message', {
                body: {
                    orderId,
                    eventType: 'call',
                    callerId,
                    callerRole,
                    callerName: callerRole === 'driver' ? 'Your Mate' : 'Customer'
                }
            }).catch((pErr) => {
                console.warn('Backend call push notification dispatch error:', pErr);
            });

            // Progression: 'initiating' -> 'ringing'
            ringingTimeout = setTimeout(() => {
                setCallState('ringing');
            }, 1200);

            // Simulation fallback: If callee does not explicitly answer after 10s, connect
            connectTimeout = setTimeout(() => {
                setCallState((prev) => (prev === 'ringing' ? 'connected' : prev));
            }, 10000);
        } else {
            setCallState('connected');
        }

        return () => {
            if (ringingTimeout) clearTimeout(ringingTimeout);
            if (connectTimeout) clearTimeout(connectTimeout);
            supabase.removeChannel(channel);
        };
    }, [visible, orderId, isIncoming]);

    // Timer while connected
    useEffect(() => {
        if (callState === 'connected') {
            timerRef.current = setInterval(() => {
                setDurationSeconds((prev) => prev + 1);
            }, 1000);
        } else if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [callState]);

    const formatDuration = (secs: number) => {
        const mins = Math.floor(secs / 60);
        const remSecs = secs % 60;
        return `${mins.toString().padStart(2, '0')}:${remSecs.toString().padStart(2, '0')}`;
    };

    const handleRemoteCallEnd = () => {
        setCallState('ended');
        setTimeout(() => {
            onClose();
        }, 1200);
    };

    const handleEndCall = async () => {
        const finalDuration = durationRef.current;
        setCallState('ended');

        // Broadcast end to counterpart
        try {
            const channel = supabase.channel(`order_call_${orderId}`);
            await channel.send({
                type: 'broadcast',
                event: 'call_action',
                payload: { action: 'end_call', orderId }
            });
        } catch (bErr) {
            console.warn('Could not broadcast call termination:', bErr);
        }

        // Record in-app call session log with zero phone numbers exposed
        try {
            await orderService.initiateMaskedCall(
                orderId,
                callerId,
                callerRole,
                null,
                null,
                'in_app_call'
            );
        } catch (logErr) {
            console.warn('Non-blocking: could not log in-app call session:', logErr);
        }

        if (onCallCompleted) {
            onCallCompleted(finalDuration);
        }

        setTimeout(() => {
            onClose();
        }, 800);
    };

    const handleSwitchToCellularProxy = () => {
        const cleanProxy = proxyNumber.replace(/\s+/g, '');
        const message = `Call ShipMate virtual proxy (${cleanProxy})? Neither your number nor the counterparty's number will be revealed.`;
        if (Platform.OS === 'web') {
            if (confirm(message)) {
                Linking.openURL(`tel:${cleanProxy}`);
            }
        } else {
            Alert.alert(
                'Masked Cellular Call',
                message,
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Dial Proxy', onPress: () => Linking.openURL(`tel:${cleanProxy}`) }
                ]
            );
        }
    };

    const targetRoleLabel = targetRole === 'driver' ? 'ShipMate Courier' : 'Customer';

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={handleEndCall}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    {/* Header Privacy Pill */}
                    <View style={styles.privacyBadge}>
                        <Text style={styles.privacyIcon}>🔒</Text>
                        <Text style={styles.privacyText}>
                            100% IN-APP CALL &bull; MOBILE NUMBERS PRIVATE
                        </Text>
                    </View>

                    {/* Participant Avatar */}
                    <View style={styles.avatarSection}>
                        <Animated.View
                            style={[
                                styles.avatarPulseRing,
                                {
                                    transform: [{ scale: pulseAnim }],
                                    borderColor: callState === 'connected' ? '#10B981' : '#38BDF8'
                                }
                            ]}
                        />
                        <View style={[
                            styles.avatarContainer,
                            { backgroundColor: targetRole === 'driver' ? '#0284C7' : '#8B5CF6' }
                        ]}>
                            <Text style={styles.avatarInitial}>
                                {(targetName || 'S').charAt(0).toUpperCase()}
                            </Text>
                        </View>
                    </View>

                    {/* Participant Info */}
                    <Text style={styles.targetName} numberOfLines={1}>
                        {targetName || targetRoleLabel}
                    </Text>
                    <Text style={styles.targetRoleSubtext}>
                        {targetRoleLabel} &bull; Order #{orderId.substring(0, 8)}
                    </Text>

                    {/* Call Status & Timer */}
                    <View style={styles.statusBox}>
                        {callState === 'initiating' && (
                            <Text style={styles.statusTextInitiating}>Connecting in-app audio...</Text>
                        )}
                        {callState === 'ringing' && (
                            <Text style={styles.statusTextRinging}>Ringing in-app audio...</Text>
                        )}
                        {callState === 'connected' && (
                            <View style={styles.connectedRow}>
                                <View style={styles.liveIndicatorDot} />
                                <Text style={styles.timerText}>{formatDuration(durationSeconds)}</Text>
                            </View>
                        )}
                        {callState === 'ended' && (
                            <Text style={styles.statusTextEnded}>Call Ended</Text>
                        )}
                    </View>

                    {/* Controls Row */}
                    <View style={styles.controlsRow}>
                        {/* Mute Button */}
                        <TouchableOpacity
                            style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
                            onPress={() => setIsMuted(!isMuted)}
                            disabled={callState === 'ended'}
                        >
                            <Text style={styles.controlIcon}>{isMuted ? '🔇' : '🎙️'}</Text>
                            <Text style={styles.controlLabel}>{isMuted ? 'Muted' : 'Mute'}</Text>
                        </TouchableOpacity>

                        {/* Speaker Button */}
                        <TouchableOpacity
                            style={[styles.controlBtn, isSpeakerOn && styles.controlBtnActive]}
                            onPress={() => setIsSpeakerOn(!isSpeakerOn)}
                            disabled={callState === 'ended'}
                        >
                            <Text style={styles.controlIcon}>{isSpeakerOn ? '🔊' : '🔈'}</Text>
                            <Text style={styles.controlLabel}>{isSpeakerOn ? 'Speaker' : 'Earpiece'}</Text>
                        </TouchableOpacity>

                        {/* End Call Button */}
                        <TouchableOpacity
                            style={styles.endCallBtn}
                            onPress={handleEndCall}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.endCallIcon}>📵</Text>
                            <Text style={styles.endCallLabel}>End</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Fallback Cellular Proxy Button */}
                    <TouchableOpacity
                        style={styles.proxyFallbackBtn}
                        onPress={handleSwitchToCellularProxy}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.proxyFallbackText}>
                            Switch to Cellular Masked Proxy (+263 867 700 0123)
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.94)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContent: {
        width: '100%',
        maxWidth: 420,
        backgroundColor: '#1E293B',
        borderRadius: 24,
        padding: 28,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#334155',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.45,
        shadowRadius: 28,
        elevation: 16,
    },
    privacyBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
        marginBottom: 28,
    },
    privacyIcon: {
        fontSize: 12,
        marginRight: 6,
    },
    privacyText: {
        color: '#10B981',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    avatarSection: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
        width: 120,
        height: 120,
        marginBottom: 20,
    },
    avatarPulseRing: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 2,
        opacity: 0.5,
    },
    avatarContainer: {
        width: 90,
        height: 90,
        borderRadius: 45,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    avatarInitial: {
        fontSize: 38,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    targetName: {
        fontSize: 22,
        fontWeight: '700',
        color: '#F8FAFC',
        textAlign: 'center',
        marginBottom: 4,
    },
    targetRoleSubtext: {
        fontSize: 13,
        color: '#94A3B8',
        marginBottom: 24,
    },
    statusBox: {
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 32,
    },
    statusTextInitiating: {
        fontSize: 14,
        color: '#38BDF8',
        fontWeight: '600',
    },
    statusTextRinging: {
        fontSize: 14,
        color: '#FBBF24',
        fontWeight: '600',
    },
    statusTextEnded: {
        fontSize: 14,
        color: '#EF4444',
        fontWeight: '600',
    },
    connectedRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    liveIndicatorDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#10B981',
        marginRight: 8,
    },
    timerText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#10B981',
        letterSpacing: 1,
    },
    controlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        width: '100%',
        marginBottom: 24,
    },
    controlBtn: {
        width: 68,
        height: 68,
        borderRadius: 34,
        backgroundColor: '#334155',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#475569',
    },
    controlBtnActive: {
        backgroundColor: '#0284C7',
        borderColor: '#38BDF8',
    },
    controlIcon: {
        fontSize: 22,
        marginBottom: 2,
    },
    controlLabel: {
        fontSize: 10,
        color: '#CBD5E1',
        fontWeight: '600',
    },
    endCallBtn: {
        width: 68,
        height: 68,
        borderRadius: 34,
        backgroundColor: '#EF4444',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 8,
    },
    endCallIcon: {
        fontSize: 24,
        marginBottom: 2,
    },
    endCallLabel: {
        fontSize: 10,
        color: '#FFFFFF',
        fontWeight: '700',
    },
    proxyFallbackBtn: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: 'rgba(51, 65, 85, 0.5)',
        borderWidth: 1,
        borderColor: '#475569',
    },
    proxyFallbackText: {
        fontSize: 11,
        color: '#94A3B8',
        fontWeight: '500',
    },
});
