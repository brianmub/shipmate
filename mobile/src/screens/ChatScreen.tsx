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
    Linking, 
    StatusBar, 
    Keyboard,
    Alert 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuthStore } from '../store/authStore';
import { chatService, ChatMessage } from '../services/chatService';

export const ChatScreen = ({ route, navigation }: any) => {
    const { orderId, recipientName, recipientPhone } = route.params || {};
    const { user } = useAuthStore();
    
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    
    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
        if (!orderId) {
            setLoading(false);
            return;
        }

        const fetchMessages = async () => {
            try {
                const history = await chatService.getMessages(orderId);
                setMessages(history);
            } catch (error) {
                console.error('Error loading chat messages:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchMessages();

        // Subscribe to real-time additions
        const subscription = chatService.subscribeToChat(orderId, (payload) => {
            if (payload.new) {
                setMessages((prev) => {
                    // Avoid duplicate inserts
                    if (prev.some((msg) => msg.id === payload.new.id)) return prev;
                    return [...prev, payload.new];
                });
            }
        });

        return () => {
            if (subscription) {
                subscription.unsubscribe();
            }
        };
    }, [orderId]);

    // Scroll to bottom when messages load or update
    useEffect(() => {
        if (messages.length > 0 && !loading) {
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [messages, loading]);

    const handleSend = async () => {
        if (!inputText.trim() || !user || !orderId) return;

        const textToSend = inputText.trim();
        setInputText('');
        setSending(true);

        try {
            await chatService.sendMessage(orderId, user.id, textToSend);
        } catch (error) {
            console.error('Failed to send message:', error);
            setInputText(textToSend); // Restore text on failure
        } finally {
            setSending(false);
        }
    };

    const handleCall = async () => {
        if (recipientPhone) {
            const url = `tel:${recipientPhone}`;
            try {
                const supported = await Linking.canOpenURL(url);
                if (supported) {
                    await Linking.openURL(url);
                } else {
                    Alert.alert('Error', 'Calling is not supported on this device.');
                }
            } catch (error) {
                Alert.alert('Error', 'Unable to initiate call.');
            }
        }
    };

    const renderMessageItem = ({ item }: { item: ChatMessage }) => {
        const isMe = item.sender_id === user?.id;
        const time = item.created_at 
            ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '';

        return (
            <View style={[styles.messageRow, isMe ? styles.myMessageRow : styles.theirMessageRow]}>
                {!isMe && (
                    <View style={styles.avatarCircleSmall}>
                        <Text style={styles.avatarTextSmall}>
                            {recipientName?.charAt(0).toUpperCase() || '?'}
                        </Text>
                    </View>
                )}
                <View style={[styles.bubble, isMe ? styles.myBubble : styles.theirBubble]}>
                    <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.theirMessageText]}>
                        {item.message_text}
                    </Text>
                    <Text style={[styles.timestampText, isMe ? styles.myTimestampText : styles.theirTimestampText]}>
                        {time}
                    </Text>
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
            <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.keyboardView}
                >
                    {/* Header */}
                    <BlurView intensity={40} tint="light" style={styles.headerBlur}>
                        <View style={styles.headerContent}>
                            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                                <Text style={styles.backTxt}>← Back</Text>
                            </TouchableOpacity>
                            
                            <View style={styles.recipientInfo}>
                                <View style={styles.avatarCircle}>
                                    <Text style={styles.avatarText}>
                                        {recipientName?.charAt(0).toUpperCase() || '?'}
                                    </Text>
                                </View>
                                <View>
                                    <Text style={styles.recipientNameText} numberOfLines={1}>{recipientName || 'Courier'}</Text>
                                    <Text style={styles.recipientStatusText}>Online</Text>
                                </View>
                            </View>

                            {recipientPhone ? (
                                <TouchableOpacity onPress={handleCall} style={styles.callBtn}>
                                    <Text style={styles.callIcon}>📞</Text>
                                </TouchableOpacity>
                            ) : (
                                <View style={{ width: 44 }} />
                            )}
                        </View>
                    </BlurView>

                    {/* Messages Body */}
                    {loading ? (
                        <View style={styles.centerContainer}>
                            <ActivityIndicator size="large" color="#055FEE" />
                        </View>
                    ) : (
                        <FlatList
                            ref={flatListRef}
                            data={messages}
                            keyExtractor={(item) => item.id}
                            renderItem={renderMessageItem}
                            contentContainerStyle={styles.messageList}
                            showsVerticalScrollIndicator={false}
                            onContentSizeChange={() => {
                                if (messages.length > 0) {
                                    flatListRef.current?.scrollToEnd({ animated: true });
                                }
                            }}
                        />
                    )}

                    {/* Input Bar */}
                    <BlurView intensity={50} tint="light" style={styles.inputContainer}>
                        <TextInput
                            style={styles.textInput}
                            placeholder="Type a message..."
                            placeholderTextColor="#94A3B8"
                            value={inputText}
                            onChangeText={setInputText}
                            multiline
                            selectionColor="#055FEE"
                        />
                        <TouchableOpacity 
                            style={[styles.sendBtn, !inputText.trim() ? styles.sendBtnDisabled : null]}
                            onPress={handleSend}
                            disabled={!inputText.trim() || sending}
                        >
                            <LinearGradient
                                colors={['#055FEE', '#5B99F2']}
                                style={styles.sendGradient}
                            >
                                <Text style={styles.sendIcon}>➔</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </BlurView>
                </KeyboardAvoidingView>
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
    keyboardView: {
        flex: 1,
    },
    headerBlur: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.4)',
        zIndex: 10,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    backBtn: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(255,255,255,0.6)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.02)',
    },
    backTxt: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#334155',
    },
    recipientInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginLeft: 16,
        gap: 12,
    },
    avatarCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#0F172A',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    recipientNameText: {
        fontSize: 16,
        fontWeight: '800',
        color: '#0F172A',
    },
    recipientStatusText: {
        fontSize: 12,
        color: '#22C55E',
        fontWeight: '600',
        marginTop: 1,
    },
    callBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(5, 95, 238, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(5, 95, 238, 0.15)',
    },
    callIcon: {
        fontSize: 18,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    messageList: {
        paddingHorizontal: 16,
        paddingVertical: 20,
        gap: 16,
    },
    messageRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 8,
        maxWidth: '80%',
    },
    myMessageRow: {
        alignSelf: 'flex-end',
    },
    theirMessageRow: {
        alignSelf: 'flex-start',
    },
    avatarCircleSmall: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#64748B',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarTextSmall: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: 'bold',
    },
    bubble: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 4,
        elevation: 1,
    },
    myBubble: {
        backgroundColor: '#055FEE',
        borderBottomRightRadius: 4,
    },
    theirBubble: {
        backgroundColor: '#FFFFFF',
        borderBottomLeftRadius: 4,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.03)',
    },
    messageText: {
        fontSize: 15,
        lineHeight: 20,
    },
    myMessageText: {
        color: '#FFFFFF',
        fontWeight: '500',
    },
    theirMessageText: {
        color: '#1E293B',
        fontWeight: '500',
    },
    timestampText: {
        fontSize: 10,
        marginTop: 4,
        alignSelf: 'flex-end',
    },
    myTimestampText: {
        color: 'rgba(255,255,255,0.7)',
    },
    theirTimestampText: {
        color: '#94A3B8',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.4)',
        gap: 12,
        backgroundColor: 'rgba(255,255,255,0.5)',
    },
    textInput: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 15,
        maxHeight: 100,
        color: '#0F172A',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
    },
    sendBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#055FEE',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    sendBtnDisabled: {
        opacity: 0.5,
    },
    sendGradient: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendIcon: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: 'bold',
    },
});
