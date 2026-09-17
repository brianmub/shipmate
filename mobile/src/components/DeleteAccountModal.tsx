import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ActivityIndicator,
    Platform,
    TouchableWithoutFeedback,
    ScrollView
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

interface DeleteAccountModalProps {
    visible: boolean;
    onClose: () => void;
    onConfirmDelete: () => Promise<void>;
    userRole?: 'customer' | 'driver';
    deleting?: boolean;
}

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({
    visible,
    onClose,
    onConfirmDelete,
    userRole = 'customer',
    deleting = false,
}) => {
    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={deleting ? undefined : onClose}
        >
            <TouchableWithoutFeedback onPress={deleting ? undefined : onClose}>
                <View style={styles.overlay}>
                    <TouchableWithoutFeedback>
                        <View style={styles.modalCardWrapper}>
                            <BlurView intensity={Platform.OS === 'ios' ? 40 : 100} tint="dark" style={styles.modalCard}>
                                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                                    {/* Danger Icon Badge */}
                                    <View style={styles.iconCircle}>
                                        <Text style={styles.headerEmoji}>🗑️</Text>
                                    </View>

                                    <Text style={styles.title}>Delete Account & Data</Text>
                                    <Text style={styles.subtitle}>
                                        This action is permanent and cannot be undone. Read the policy details below before confirming.
                                    </Text>

                                    {/* Information Card complying with Apple App Store Guideline 5.1.1(v) */}
                                    <View style={styles.disclosureBox}>
                                        <View style={styles.bulletRow}>
                                            <Text style={styles.bulletIcon}>🛡️</Text>
                                            <View style={styles.bulletTextWrap}>
                                                <Text style={styles.bulletTitle}>Personal Profile Erased</Text>
                                                <Text style={styles.bulletDesc}>
                                                    Your name, phone number, push tokens, and login credentials will be permanently purged.
                                                </Text>
                                            </View>
                                        </View>

                                        <View style={styles.bulletDivider} />

                                        <View style={styles.bulletRow}>
                                            <Text style={styles.bulletIcon}>🔒</Text>
                                            <View style={styles.bulletTextWrap}>
                                                <Text style={styles.bulletTitle}>Sessions Revoked</Text>
                                                <Text style={styles.bulletDesc}>
                                                    You will be signed out immediately and unable to access your {userRole === 'driver' ? 'courier' : 'customer'} account again.
                                                </Text>
                                            </View>
                                        </View>

                                        <View style={styles.bulletDivider} />

                                        <View style={styles.bulletRow}>
                                            <Text style={styles.bulletIcon}>🧾</Text>
                                            <View style={styles.bulletTextWrap}>
                                                <Text style={styles.bulletTitle}>Anonymized Financial Receipts</Text>
                                                <Text style={styles.bulletDesc}>
                                                    Completed order history and receipts will be anonymized for statutory tax and financial compliance.
                                                </Text>
                                            </View>
                                        </View>

                                        <View style={styles.bulletDivider} />

                                        <View style={styles.bulletRow}>
                                            <Text style={styles.bulletIcon}>⚠️</Text>
                                            <View style={styles.bulletTextWrap}>
                                                <Text style={styles.bulletTitle}>Active Order Protection</Text>
                                                <Text style={styles.bulletDesc}>
                                                    If you have any active in-flight orders, they must be completed or cancelled first.
                                                </Text>
                                            </View>
                                        </View>
                                    </View>

                                    {/* Action Buttons */}
                                    <TouchableOpacity
                                        style={styles.deleteButton}
                                        activeOpacity={0.8}
                                        onPress={onConfirmDelete}
                                        disabled={deleting}
                                    >
                                        <LinearGradient
                                            colors={['#EF4444', '#B91C1C']}
                                            style={styles.deleteGradient}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                        >
                                            {deleting ? (
                                                <ActivityIndicator color="#FFFFFF" size="small" />
                                            ) : (
                                                <Text style={styles.deleteButtonText}>Permanently Delete Account</Text>
                                            )}
                                        </LinearGradient>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.cancelButton}
                                        activeOpacity={0.7}
                                        onPress={onClose}
                                        disabled={deleting}
                                    >
                                        <Text style={styles.cancelButtonText}>Cancel & Keep Account</Text>
                                    </TouchableOpacity>
                                </ScrollView>
                            </BlurView>
                        </View>
                    </TouchableWithoutFeedback>
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
    modalCardWrapper: {
        width: '100%',
        maxWidth: 420,
        maxHeight: '90%',
    },
    modalCard: {
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.3)',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
    },
    scrollContent: {
        padding: 24,
        alignItems: 'center',
    },
    iconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    headerEmoji: {
        fontSize: 30,
    },
    title: {
        fontSize: 22,
        fontWeight: '800',
        color: '#FFFFFF',
        textAlign: 'center',
        marginBottom: 8,
        letterSpacing: -0.3,
    },
    subtitle: {
        fontSize: 13,
        color: '#94A3B8',
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 20,
        paddingHorizontal: 8,
    },
    disclosureBox: {
        width: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        marginBottom: 24,
    },
    bulletRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 4,
    },
    bulletIcon: {
        fontSize: 18,
        marginRight: 12,
        marginTop: 1,
    },
    bulletTextWrap: {
        flex: 1,
    },
    bulletTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#F1F5F9',
        marginBottom: 2,
    },
    bulletDesc: {
        fontSize: 12,
        color: '#94A3B8',
        lineHeight: 16,
    },
    bulletDivider: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        marginVertical: 10,
    },
    deleteButton: {
        width: '100%',
        height: 52,
        borderRadius: 14,
        overflow: 'hidden',
        marginBottom: 12,
    },
    deleteGradient: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    deleteButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    cancelButton: {
        paddingVertical: 10,
        paddingHorizontal: 20,
    },
    cancelButtonText: {
        color: '#94A3B8',
        fontSize: 14,
        fontWeight: '600',
    },
});
