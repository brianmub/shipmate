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
    Alert 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../store/authStore';
import { supabase } from '../../../utils/supabase';
import { verificationService } from '../../../services/verificationService';

const QUESTIONS = [
    "What type of vehicle will you be using for deliveries (motorbike, car, bicycle)?",
    "Have you done delivery or courier work before? If so, where and for how long?",
    "Shipmate covers Harare, Bulawayo, and Mutare corridors. Which area(s) can you cover?",
    "If a parcel is damaged or lost during delivery, what do you think your responsibility would be?",
    "Are you available to work flexible hours, including weekends, if needed?"
];

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

export const PreScreeningChatScreen = ({ navigation }: any) => {
    const { user, setVerificationStatus } = useAuthStore();
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [currentIndex, setCurrentIndex] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
        // Start the chat by asking the first question
        setMessages([
            {
                id: 'q-0',
                role: 'assistant',
                content: QUESTIONS[0]
            }
        ]);
    }, []);

    const handleSend = () => {
        if (!inputText.trim()) return;

        const userMsg: Message = {
            id: `u-${currentIndex}`,
            role: 'user',
            content: inputText.trim()
        };

        const updatedMessages = [...messages, userMsg];
        setMessages(updatedMessages);
        setInputText('');

        const nextIndex = currentIndex + 1;

        if (nextIndex < QUESTIONS.length) {
            // Ask the next question
            setCurrentIndex(nextIndex);
            setTimeout(() => {
                setMessages(prev => [
                    ...prev,
                    {
                        id: `q-${nextIndex}`,
                        role: 'assistant',
                        content: QUESTIONS[nextIndex]
                    }
                ]);
            }, 600);
        } else {
            // Finished answering all 5 questions
            handleSubmit(updatedMessages);
        }
    };

    const handleSubmit = async (finalMessages: Message[]) => {
        if (!user) return;
        setSubmitting(true);

        try {
            // 1. Invoke the driver pre-screen Edge Function
            const formattedHistory = finalMessages.map(m => ({
                role: m.role,
                content: m.content
            }));

            console.log("Submitting chat evaluation for:", user.id);
            const { data: prescreenData, error: prescreenError } = await supabase.functions.invoke('driver-prescreen', {
                body: {
                    applicantId: user.id,
                    conversationHistory: formattedHistory
                }
            });

            if (prescreenError) throw prescreenError;

            // 2. Also trigger document verification in the background asynchronously
            const supabaseUrl = 'https://lgnhcfppovtwxtmjyfty.supabase.co';
            const idImageUrl = `${supabaseUrl}/storage/v1/object/public/verification-docs/drivers/${user.id}/national_id_front.jpg`;
            const licenseImageUrl = `${supabaseUrl}/storage/v1/object/public/verification-docs/drivers/${user.id}/license_front.jpg`;

            console.log("Triggering document verification in background...");
            supabase.functions.invoke('verify-driver-documents', {
                body: {
                    applicantId: user.id,
                    idImageUrl,
                    licenseImageUrl
                }
            }).catch(err => {
                console.error("Background document verification trigger failed:", err);
            });

            // 3. Mark the driver's status as pending in the drivers table
            await verificationService.updateDriverDetails(user.id, { verification_status: 'pending' });

            // 4. Update authStore state to trigger UI navigation transition
            setVerificationStatus('pending');

            Alert.alert(
                "Application Submitted",
                "Your details and pre-screening answers are under review. We will notify you once approved!",
                [{ text: "Awesome!", onPress: () => {
                    try {
                        navigation.navigate('Dashboard');
                    } catch (e) {
                        // State transition will navigate automatically
                    }
                }}]
            );

        } catch (error: any) {
            console.error("Screening submission failed:", error);
            Alert.alert(
                "Submission Issue",
                `We had trouble processing your screening. Let's try again. Error: ${error.message}`,
                [{ text: "Retry", onPress: () => handleSubmit(finalMessages) }]
            );
        } finally {
            setSubmitting(false);
        }
    };

    const renderMessage = ({ item }: { item: Message }) => {
        const isUser = item.role === 'user';
        return (
            <View style={[styles.messageRow, isUser ? styles.userRow : styles.assistantRow]}>
                {!isUser && (
                    <View style={styles.avatar}>
                        <Ionicons name="chatbubble-ellipses" size={16} color="#FFF" />
                    </View>
                )}
                <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
                    <Text style={[styles.messageText, isUser ? styles.userText : styles.assistantText]}>
                        {item.content}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <LinearGradient colors={['#F8FAFC', '#E2E8F0']} style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>AI Pre-Screening</Text>
                    <Text style={styles.headerSubtitle}>Question {Math.min(currentIndex + 1, QUESTIONS.length)} of {QUESTIONS.length}</Text>
                </View>

                {submitting ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#055FEE" />
                        <Text style={styles.loadingText}>Analyzing screening details...</Text>
                        <Text style={styles.loadingSubtext}>Please do not close the app.</Text>
                    </View>
                ) : (
                    <KeyboardAvoidingView 
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
                        style={styles.keyboardView}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
                    >
                        <FlatList
                            ref={flatListRef}
                            data={messages}
                            renderItem={renderMessage}
                            keyExtractor={item => item.id}
                            contentContainerStyle={styles.listContent}
                            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                        />

                        <View style={styles.inputArea}>
                            <TextInput
                                value={inputText}
                                onChangeText={setInputText}
                                placeholder="Type your answer here..."
                                placeholderTextColor="#94A3B8"
                                style={styles.input}
                                multiline
                                maxLength={200}
                            />
                            <TouchableOpacity 
                                onPress={handleSend}
                                style={[styles.sendBtn, !inputText.trim() && styles.disabledSendBtn]}
                                disabled={!inputText.trim()}
                            >
                                <Ionicons name="send" size={20} color="#FFF" />
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                )}
            </SafeAreaView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    header: { padding: 24, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#FFF' },
    headerTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
    headerSubtitle: { fontSize: 13, color: '#64748B', marginTop: 4, fontWeight: '600' },
    keyboardView: { flex: 1 },
    listContent: { padding: 24, gap: 16 },
    messageRow: { flexDirection: 'row', gap: 12, maxWidth: '80%' },
    userRow: { justifyContent: 'flex-end', alignSelf: 'flex-end' },
    assistantRow: { justifyContent: 'flex-start', alignSelf: 'flex-start' },
    avatar: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#055FEE', justifyContent: 'center', alignItems: 'center' },
    bubble: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, maxWidth: '85%' },
    userBubble: { backgroundColor: '#055FEE', borderBottomRightRadius: 4 },
    assistantBubble: { backgroundColor: '#FFF', borderTopLeftRadius: 4, borderWidth: 1, borderColor: '#E2E8F0' },
    messageText: { fontSize: 15, lineHeight: 22 },
    userText: { color: '#FFF', fontWeight: '500' },
    assistantText: { color: '#1E293B', fontWeight: '500' },
    inputArea: { flexDirection: 'row', padding: 16, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E2E8F0', alignItems: 'center', gap: 12 },
    input: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10, fontSize: 15, maxHeight: 100, color: '#0F172A', fontWeight: '500' },
    sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#055FEE', justifyContent: 'center', alignItems: 'center' },
    disabledSendBtn: { backgroundColor: '#CBD5E1' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    loadingText: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginTop: 24 },
    loadingSubtext: { fontSize: 14, color: '#64748B', marginTop: 8 }
});
