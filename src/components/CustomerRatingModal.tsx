import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    TouchableWithoutFeedback,
    Keyboard
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

interface CustomerRatingModalProps {
    visible: boolean;
    onClose: () => void;
    onSubmit: (rating: number, feedback: string) => Promise<void>;
    driverName?: string;
    submitting?: boolean;
}

export const CustomerRatingModal: React.FC<CustomerRatingModalProps> = ({
    visible,
    onClose,
    onSubmit,
    driverName = 'your Mate',
    submitting = false,
}) => {
    const [rating, setRating] = useState<number>(5);
    const [feedback, setFeedback] = useState<string>('');

    const ratingDescriptions: Record<number, string> = {
        5: 'Outstanding Service! 🚀',
        4: 'Great & Punctual 👍',
        3: 'Good Experience 👌',
        2: 'Needs Improvement 👎',
        1: 'Poor Delivery ⚠️',
    };

    const handleConfirm = async () => {
        await onSubmit(rating, feedback.trim());
    };

    const handleSkip = async () => {
        await onSubmit(5, ''); // Default 5 stars on skip
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.overlay}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        style={styles.centeredView}
                    >
                        <BlurView intensity={Platform.OS === 'ios' ? 40 : 100} tint="dark" style={styles.modalCard}>
                            {/* Header Icon */}
                            <View style={styles.iconCircle}>
                                <Text style={styles.headerEmoji}>⭐</Text>
                            </View>

                            <Text style={styles.title}>Rate Your Delivery</Text>
                            <Text style={styles.subtitle}>
                                How was your experience with <Text style={styles.driverHighlight}>{driverName}</Text>?
                            </Text>

                            {/* Stars Picker */}
                            <View style={styles.starsContainer}>
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <TouchableOpacity
                                        key={star}
                                        activeOpacity={0.7}
                                        onPress={() => setRating(star)}
                                        style={styles.starButton}
                                    >
                                        <Text style={[styles.starIcon, rating >= star ? styles.starFilled : styles.starEmpty]}>
                                            ★
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Label for current rating */}
                            <Text style={styles.ratingDescriptor}>
                                {ratingDescriptions[rating]}
                            </Text>

                            {/* Optional Feedback Input */}
                            <View style={styles.inputContainer}>
                                <TextInput
                                    style={styles.feedbackInput}
                                    placeholder="Leave a compliment or notes for your Mate..."
                                    placeholderTextColor="rgba(255, 255, 255, 0.4)"
                                    multiline
                                    numberOfLines={3}
                                    value={feedback}
                                    onChangeText={setFeedback}
                                    maxLength={240}
                                />
                            </View>

                            {/* Submit Button */}
                            <TouchableOpacity
                                style={styles.submitButton}
                                activeOpacity={0.8}
                                onPress={handleConfirm}
                                disabled={submitting}
                            >
                                <LinearGradient
                                    colors={['#10B981', '#059669']}
                                    style={styles.submitGradient}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                >
                                    {submitting ? (
                                        <ActivityIndicator color="#FFFFFF" size="small" />
                                    ) : (
                                        <Text style={styles.submitButtonText}>Submit Rating & Finish</Text>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>

                            {/* Skip button */}
                            <TouchableOpacity
                                style={styles.skipButton}
                                activeOpacity={0.6}
                                onPress={handleSkip}
                                disabled={submitting}
                            >
                                <Text style={styles.skipButtonText}>Skip for now</Text>
                            </TouchableOpacity>
                        </BlurView>
                    </KeyboardAvoidingView>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    centeredView: {
        width: '100%',
        maxWidth: 380,
    },
    modalCard: {
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
        overflow: 'hidden',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
    },
    iconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(251, 191, 36, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(251, 191, 36, 0.3)',
    },
    headerEmoji: {
        fontSize: 30,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: 6,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
        textAlign: 'center',
        marginBottom: 20,
    },
    driverHighlight: {
        color: '#60A5FA',
        fontWeight: '600',
    },
    starsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
    },
    starButton: {
        paddingHorizontal: 6,
        paddingVertical: 4,
    },
    starIcon: {
        fontSize: 38,
    },
    starFilled: {
        color: '#FBBF24',
    },
    starEmpty: {
        color: 'rgba(255, 255, 255, 0.2)',
    },
    ratingDescriptor: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FBBF24',
        marginBottom: 16,
        textAlign: 'center',
    },
    inputContainer: {
        width: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.07)',
        borderRadius: 14,
        padding: 12,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    feedbackInput: {
        color: '#FFFFFF',
        fontSize: 14,
        minHeight: 60,
        textAlignVertical: 'top',
    },
    submitButton: {
        width: '100%',
        borderRadius: 14,
        overflow: 'hidden',
        marginBottom: 12,
    },
    submitGradient: {
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    submitButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
    },
    skipButton: {
        paddingVertical: 6,
    },
    skipButtonText: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 13,
        fontWeight: '500',
    },
});
