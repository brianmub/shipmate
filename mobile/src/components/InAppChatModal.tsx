import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Modal,
    Keyboard
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../store/authStore';
import { chatService, ChatMessage } from '../services/chatService';

export interface InAppChatModalProps {
    visible: boolean;
    orderId: string;
    recipientName: string;
    recipientPhone?: string;
    onClose: () => void;
    onOpenCall?: () => void;
}

export const InAppChatModal: React.FC<InAppChatModalProps> = ({
    visible,
    orderId,
    recipientName,
    recipientPhone,
    onClose,
    onOpenCall
}) => {
    const { user } = useAuthStore();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);

    const flatListRef = useRef<FlatList>(null);

    const quickReplies = [
        "🚪 Please leave at the door",
        "🏢 Gate code / Apt details",
        "👋 Coming down right now",
        "🛡️ Leave with security/reception",
        "📞 Please call when outside"
    ];

    const handleQuickReply = (text: string) => {
        setInputText(text);
    };

    useEffect(() => {
        if (!visible || !orderId) {
            setLoading(false);
            return;
        }

        setLoading(true);

        const fetchMessages = async () => {
            try {
                const history = await chatService.getMessages(orderId);
                setMessages(history);
                if (user) {
                    chatService.markAsRead(orderId, user.id);
                }
            } catch (error) {
                console.error('Error loading chat messages in modal:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchMessages();

        // Real-time subscription
        const subscription = chatService.subscribeToChat(orderId, (payload) => {
            if (payload.new) {
                setMessages((prev) => {
                    if (prev.some((msg) => msg.id === payload.new.id)) return prev;
                    return [...prev, payload.new];
                });
                if (user && payload.new.sender_id !== user.id) {
                    chatService.markAsRead(orderId, user.id);
                }
            }
        });

        return () => {
            if (subscription) {
                subscription.unsubscribe();
            }
        };
    }, [visible, orderId, user?.id]);

    // Auto-scroll when messages update
    useEffect(() => {
        if (messages.length > 0 && !loading && visible) {
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [messages, loading, visible]);

    const handleSend = async () => {
        if (!inputText.trim() || !user || !orderId) return;

        const textToSend = inputText.trim();
        setInputText('');
        setSending(true);

        try {
            await chatService.sendMessage(orderId, user.id, textToSend);
        } catch (error) {
            console.error('Failed to send message in chat modal:', error);
            setInputText(textToSend);
        } finally {
            setSending(false);
        }
    };

    const renderMessage = ({ item }: { item: ChatMessage }) => {
        const isMyMessage = item.sender_id === user?.id;

        return (
            <View style={[
                styles.messageRow,
                isMyMessage ? styles.myMessageRow : styles.otherMessageRow
            ]}>
                {!isMyMessage && (
                    <View style={styles.senderAvatar}>
                        <Text style={styles.senderAvatarText}>
                            {recipientName ? recipientName.charAt(0).toUpperCase() : 'M'}
                        </Text>
                    </View>
                )}
                <View style={[
                    styles.messageBubble,
                    isMyMessage ? styles.myMessageBubble : styles.otherMessageBubble
                ]}>
                    <Text style={[
                        styles.messageText,
                        isMyMessage ? styles.myMessageText : styles.otherMessageText
                    ]}>
                        {item.content}
                    </Text>
                    <Text style={[
                        styles.timestampText,
                        isMyMessage ? styles.myTimestampText : styles.otherTimestampText
                    ]}>
                        {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                {/* Dismissible transparent backdrop - map visible behind */}
                <TouchableOpacity
                    style={styles.backdropTouch}
                    activeOpacity={1}
                    onPress={onClose}
                />

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.sheetContainer}
                >
                    <View style={styles.sheetContent}>
                        {/* Drag Handle */}
                        <View style={styles.dragHandleContainer}>
                            <View style={styles.dragHandle} />
                        </View>

                        {/* Sheet Header */}
                        <View style={styles.header}>
                            <View style={styles.mateInfo}>
                                <View style={styles.avatar}>
                                    <Text style={styles.avatarText}>
                                        {recipientName ? recipientName.charAt(0).toUpperCase() : 'M'}
                                    </Text>
                                </View>
                                <View>
                                    <Text style={styles.mateName} numberOfLines={1}>
                                        {recipientName || 'Your Mate'}
                                    </Text>
                                    <View style={styles.statusRow}>
                                        <View style={styles.onlineDot} />
                                        <Text style={styles.statusText}>Live on Trip</Text>
                                    </View>
                                </View>
                            </View>

                            <View style={styles.headerActions}>
                                {onOpenCall && (
                                    <TouchableOpacity
                                        style={styles.callButton}
                                        onPress={() => {
                                            onClose();
                                            onOpenCall();
                                        }}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={styles.callButtonIcon}>📞</Text>
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                    style={styles.closeButton}
                                    onPress={onClose}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.closeButtonText}>✕</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Message Feed */}
                        {loading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#055FEE" />
                                <Text style={styles.loadingText}>Connecting to chat...</Text>
                            </View>
                        ) : (
                            <FlatList
                                ref={flatListRef}
                                data={messages}
                                renderItem={renderMessage}
                                keyExtractor={(item) => item.id}
                                contentContainerStyle={styles.messagesList}
                                showsVerticalScrollIndicator={false}
                                ListEmptyComponent={
                                    <View style={styles.emptyContainer}>
                                        <Text style={styles.emptyIcon}>💬</Text>
                                        <Text style={styles.emptyTitle}>In-Trip Chat</Text>
                                        <Text style={styles.emptySubtitle}>
                                            Chat directly with your Mate without leaving the tracking map.
                                        </Text>
                                    </View>
                                }
                            />
                        )}

                        {/* Quick Replies */}
                        <View style={styles.quickRepliesContainer}>
                            <FlatList
                                horizontal
                                data={quickReplies}
                                keyExtractor={(item, index) => index.toString()}
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.quickRepliesList}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={styles.quickReplyChip}
                                        onPress={() => handleQuickReply(item)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.quickReplyText}>{item}</Text>
                                    </TouchableOpacity>
                                )}
                            />
                        </View>

                        {/* Input Row */}
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder="Message your Mate..."
                                placeholderTextColor="#94A3B8"
                                value={inputText}
                                onChangeText={setInputText}
                                multiline
                                maxLength={500}
                            />
                            <TouchableOpacity
                                style={[
                                    styles.sendButton,
                                    (!inputText.trim() || sending) && styles.sendButtonDisabled
                                ]}
                                onPress={handleSend}
                                disabled={!inputText.trim() || sending}
                                activeOpacity={0.8}
                            >
                                <LinearGradient
                                    colors={inputText.trim() && !sending ? ['#055FEE', '#5B99F2'] : ['#E2E8F0', '#CBD5E1']}
                                    style={styles.sendButtonGradient}
                                >
                                    {sending ? (
                                        <ActivityIndicator size="small" color="#FFFFFF" />
                                    ) : (
                                        <Text style={styles.sendButtonText}>➔</Text>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        justifyContent: 'flex-end',
    },
    backdropTouch: {
        flex: 1,
    },
    sheetContainer: {
        maxHeight: '82%',
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
        elevation: 20,
    },
    sheetContent: {
        paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    },
    dragHandleContainer: {
        alignItems: 'center',
        paddingVertical: 10,
    },
    dragHandle: {
        width: 44,
        height: 5,
        borderRadius: 3,
        backgroundColor: '#CBD5E1',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    mateInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#055FEE',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        shadowColor: '#055FEE',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
    },
    avatarText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    mateName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0F172A',
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },
    onlineDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#10B981',
        marginRight: 6,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '500',
        color: '#64748B',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    callButton: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: '#EFF6FF',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#DBEAFE',
    },
    callButtonIcon: {
        fontSize: 18,
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#64748B',
    },
    loadingContainer: {
        height: 250,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        marginTop: 10,
        fontSize: 13,
        color: '#64748B',
    },
    messagesList: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        minHeight: 220,
        maxHeight: 320,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 36,
    },
    emptyIcon: {
        fontSize: 36,
        marginBottom: 8,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 4,
    },
    emptySubtitle: {
        fontSize: 13,
        color: '#64748B',
        textAlign: 'center',
        paddingHorizontal: 24,
    },
    messageRow: {
        flexDirection: 'row',
        marginBottom: 10,
        alignItems: 'flex-end',
    },
    myMessageRow: {
        justifyContent: 'flex-end',
    },
    otherMessageRow: {
        justifyContent: 'flex-start',
    },
    senderAvatar: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: '#E2E8F0',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
        marginBottom: 2,
    },
    senderAvatarText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#475569',
    },
    messageBubble: {
        maxWidth: '75%',
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 16,
    },
    myMessageBubble: {
        backgroundColor: '#055FEE',
        borderBottomRightRadius: 4,
    },
    otherMessageBubble: {
        backgroundColor: '#F1F5F9',
        borderBottomLeftRadius: 4,
    },
    messageText: {
        fontSize: 14,
        lineHeight: 19,
    },
    myMessageText: {
        color: '#FFFFFF',
    },
    otherMessageText: {
        color: '#0F172A',
    },
    timestampText: {
        fontSize: 10,
        marginTop: 4,
        alignSelf: 'flex-end',
    },
    myTimestampText: {
        color: 'rgba(255, 255, 255, 0.7)',
    },
    otherTimestampText: {
        color: '#94A3B8',
    },
    quickRepliesContainer: {
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: '#F8FAFC',
    },
    quickRepliesList: {
        paddingHorizontal: 16,
        gap: 8,
    },
    quickReplyChip: {
        backgroundColor: '#F8FAFC',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    quickReplyText: {
        fontSize: 12,
        color: '#334155',
        fontWeight: '500',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    input: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 22,
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 14,
        color: '#0F172A',
        maxHeight: 90,
        marginRight: 10,
    },
    sendButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        overflow: 'hidden',
    },
    sendButtonDisabled: {
        opacity: 0.6,
    },
    sendButtonGradient: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
});
