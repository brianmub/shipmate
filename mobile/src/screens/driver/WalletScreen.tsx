import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Modal, ActivityIndicator, StatusBar, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuthStore } from '../../store/authStore';
import { userService } from '../../services/userService';
import { paymentService } from '../../services/paymentService';
import { CourierWallet, WalletTransaction } from '../../types';

export const WalletScreen = ({ navigation }: any) => {
    const { user } = useAuthStore();
    const [wallet, setWallet] = useState<CourierWallet | null>(null);
    const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Top-up Modal States
    const [showTopUpModal, setShowTopUpModal] = useState(false);
    const [topUpAmount, setTopUpAmount] = useState('10.00');
    const [cardNumber, setCardNumber] = useState('4111 1111 1111 1111');
    const [cardExpiry, setCardExpiry] = useState('12/28');
    const [cardCvv, setCardCvv] = useState('123');
    const [submitting, setSubmitting] = useState(false);

    // Success Screen States
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [receipt, setReceipt] = useState<{ gross: number; net: number; fee: number } | null>(null);

    const loadWalletData = async (showSpinner = true) => {
        if (!user) return;
        try {
            if (showSpinner) setLoading(true);
            const [walletData, txData] = await Promise.all([
                userService.getCourierWallet(user.id),
                userService.getWalletTransactions(user.id)
            ]);
            setWallet(walletData);
            setTransactions(txData || []);
        } catch (error: any) {
            console.error('Error loading wallet data:', error);
            Alert.alert('Error', 'Failed to load wallet information.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadWalletData();
    }, []);

    const handleSelectPreset = (amount: number) => {
        setTopUpAmount(amount.toFixed(2));
    };

    const handleTopUpSubmit = async () => {
        const amountNum = parseFloat(topUpAmount);
        if (isNaN(amountNum) || amountNum < 5.00) {
            Alert.alert('Invalid Amount', 'The minimum top-up amount is $5.00 USD.');
            return;
        }

        if (!cardNumber || !cardExpiry || !cardCvv) {
            Alert.alert('Missing Details', 'Please fill in all card details.');
            return;
        }

        setSubmitting(true);
        try {
            const response = await paymentService.topupWallet(user!.id, amountNum);
            
            // Set receipt details for confirmation screen
            setReceipt({
                gross: response.grossAmount,
                fee: response.fee,
                net: response.netAmount
            });

            setShowTopUpModal(false);
            setShowSuccessModal(true);
            loadWalletData(false); // Reload wallet and transactions silently
        } catch (error: any) {
            Alert.alert('Payment Failed', error.message || 'Payment simulation failed. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const getTransactionIcon = (type: string) => {
        switch (type) {
            case 'topup': return '💳';
            case 'commission_deduction': return '⚡';
            case 'promo_credit': return '🎁';
            default: return '💵';
        }
    };

    const getTransactionTitle = (type: string) => {
        switch (type) {
            case 'topup': return 'ClickNPay Wallet Top-Up';
            case 'commission_deduction': return 'Platform Job Commission';
            case 'promo_credit': return 'Founder Promotion Credit';
            default: return 'Transaction';
        }
    };

    const getTransactionColor = (type: string) => {
        switch (type) {
            case 'topup': return '#34D399';
            case 'commission_deduction': return '#FB7185';
            case 'promo_credit': return '#60A5FA';
            default: return '#94A3B8';
        }
    };

    const formatDateTime = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + 
               date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
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
                <ScrollView 
                    contentContainerStyle={styles.scrollContent} 
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>My Wallet</Text>
                        <Text style={styles.headerSubtitle}>Manage your courier float balance</Text>
                    </View>

                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#055FEE" />
                            <Text style={styles.loadingText}>Fetching wallet details...</Text>
                        </View>
                    ) : (
                        <>
                            {/* Card Display */}
                            <BlurView intensity={30} tint="light" style={styles.balanceCard}>
                                <View style={styles.cardHeader}>
                                    <Text style={styles.cardLabel}>FLOAT BALANCE</Text>
                                    <View style={[
                                        styles.statusBadge, 
                                        wallet?.status === 'locked' ? styles.statusLocked : styles.statusActive
                                    ]}>
                                        <Text style={styles.statusText}>
                                            {wallet?.status === 'locked' ? '🔒 LOCKED' : '✓ ACTIVE'}
                                        </Text>
                                    </View>
                                </View>
                                <Text style={styles.balanceValue}>
                                    ${wallet?.balance !== undefined ? wallet.balance.toFixed(2) : '0.00'}
                                </Text>
                                <Text style={styles.balanceCurrency}>USD</Text>

                                {wallet?.status === 'locked' && (
                                    <View style={styles.lockedAlert}>
                                        <Text style={styles.lockedAlertText}>
                                            ⚠️ Lockout Limit reached ($0.25). Please top up your balance to receive new delivery jobs.
                                        </Text>
                                    </View>
                                )}
                            </BlurView>

                            {/* Top Up Button */}
                            <TouchableOpacity 
                                style={styles.topUpButtonContainer}
                                activeOpacity={0.8}
                                onPress={() => setShowTopUpModal(true)}
                            >
                                <LinearGradient
                                    colors={['#055FEE', '#5B99F2']}
                                    style={styles.topUpGradient}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                >
                                    <Text style={styles.topUpButtonText}>Top Up Wallet</Text>
                                </LinearGradient>
                            </TouchableOpacity>

                            {/* Transactions History */}
                            <View style={styles.historySection}>
                                <Text style={styles.sectionTitle}>Transaction History</Text>
                                {transactions.length === 0 ? (
                                    <BlurView intensity={10} tint="light" style={styles.emptyHistory}>
                                        <Text style={styles.emptyHistoryText}>No transactions recorded yet.</Text>
                                    </BlurView>
                                ) : (
                                    transactions.map((tx) => (
                                        <BlurView key={tx.id} intensity={15} tint="light" style={styles.txCard}>
                                            <View style={styles.txRow}>
                                                <View style={styles.txIconContainer}>
                                                    <Text style={styles.txIcon}>{getTransactionIcon(tx.type)}</Text>
                                                </View>
                                                <View style={styles.txDetails}>
                                                    <Text style={styles.txTitle}>{getTransactionTitle(tx.type)}</Text>
                                                    <Text style={styles.txTime}>{formatDateTime(tx.created_at)}</Text>
                                                </View>
                                                <View style={styles.txAmountContainer}>
                                                    <Text style={[
                                                        styles.txAmount, 
                                                        { color: getTransactionColor(tx.type) }
                                                    ]}>
                                                        {tx.type === 'commission_deduction' ? '-' : '+'}
                                                        ${tx.type === 'topup' && tx.net_amount !== null ? tx.net_amount.toFixed(2) : tx.amount.toFixed(2)}
                                                    </Text>
                                                    {tx.type === 'topup' && tx.net_amount !== null && (
                                                        <Text style={styles.txGrossText}>Paid: ${tx.amount.toFixed(2)}</Text>
                                                    )}
                                                </View>
                                            </View>
                                        </BlurView>
                                    ))
                                )}
                            </View>
                        </>
                    )}
                </ScrollView>
            </SafeAreaView>

            {/* ClickNPay Card top-up Modal */}
            <Modal
                visible={showTopUpModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowTopUpModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <BlurView intensity={90} tint="dark" style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Top Up with ClickNPay</Text>
                            <TouchableOpacity onPress={() => setShowTopUpModal(false)} style={styles.closeModalButton}>
                                <Text style={styles.closeModalText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} style={styles.modalForm}>
                            <Text style={styles.inputLabel}>Enter Amount (USD)</Text>
                            <TextInput
                                style={styles.modalInput}
                                value={topUpAmount}
                                onChangeText={setTopUpAmount}
                                keyboardType="decimal-pad"
                                placeholder="10.00"
                                selectionColor="#055FEE"
                                placeholderTextColor="#94A3B8"
                            />

                            {/* Preset Buttons */}
                            <View style={styles.presetsRow}>
                                {[5, 10, 20, 50].map((amt) => (
                                    <TouchableOpacity 
                                        key={amt} 
                                        style={styles.presetBadge}
                                        onPress={() => handleSelectPreset(amt)}
                                    >
                                        <Text style={styles.presetText}>${amt}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <View style={styles.divider} />

                            <Text style={styles.inputLabel}>Card Number</Text>
                            <TextInput
                                style={styles.cardInput}
                                value={cardNumber}
                                onChangeText={setCardNumber}
                                keyboardType="number-pad"
                                placeholder="4111 1111 1111 1111"
                                placeholderTextColor="#64748B"
                            />

                            <View style={styles.cardExpiryRow}>
                                <View style={{ flex: 1, marginRight: 12 }}>
                                    <Text style={styles.inputLabel}>Expiry</Text>
                                    <TextInput
                                        style={styles.cardInput}
                                        value={cardExpiry}
                                        onChangeText={setCardExpiry}
                                        placeholder="MM/YY"
                                        placeholderTextColor="#64748B"
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.inputLabel}>CVV</Text>
                                    <TextInput
                                        style={styles.cardInput}
                                        value={cardCvv}
                                        onChangeText={setCardCvv}
                                        keyboardType="number-pad"
                                        secureTextEntry
                                        placeholder="123"
                                        placeholderTextColor="#64748B"
                                    />
                                </View>
                            </View>

                            <TouchableOpacity 
                                style={[styles.topUpSubmitButton, submitting && styles.disabledButton]}
                                activeOpacity={0.8}
                                onPress={handleTopUpSubmit}
                                disabled={submitting}
                            >
                                <LinearGradient
                                    colors={['#10B981', '#059669']}
                                    style={styles.topUpSubmitGradient}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                >
                                    {submitting ? (
                                        <ActivityIndicator color="#FFFFFF" />
                                    ) : (
                                        <Text style={styles.topUpSubmitButtonText}>Authorize Payment</Text>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>

                            <Text style={styles.clicknpayNotice}>
                                ClickNPay processing fees apply. Your wallet will be credited with the Net Received amount.
                              </Text>
                        </ScrollView>
                    </BlurView>
                </View>
            </Modal>

            {/* Top-up Receipt Success Modal */}
            <Modal
                visible={showSuccessModal}
                animationType="fade"
                transparent={true}
            >
                <View style={styles.modalOverlay}>
                    <BlurView intensity={90} tint="dark" style={styles.receiptContainer}>
                        <Text style={styles.successIcon}>✓</Text>
                        <Text style={styles.successTitle}>Top-Up Successful!</Text>
                        <Text style={styles.successSubtitle}>Your payment has been processed.</Text>

                        {receipt && (
                            <View style={styles.receiptDetails}>
                                <View style={styles.receiptRow}>
                                    <Text style={styles.receiptLabel}>Paid (Gross Amount):</Text>
                                    <Text style={styles.receiptValue}>${receipt.gross.toFixed(2)}</Text>
                                </View>
                                <View style={styles.receiptRow}>
                                    <Text style={styles.receiptLabel}>ClickNPay Gateway Fee:</Text>
                                    <Text style={styles.receiptValue}>-${receipt.fee.toFixed(2)}</Text>
                                </View>
                                <View style={[styles.receiptRow, styles.receiptNetRow]}>
                                    <Text style={styles.receiptNetLabel}>Credited to Wallet:</Text>
                                    <Text style={styles.receiptNetValue}>${receipt.net.toFixed(2)}</Text>
                                </View>
                            </View>
                        )}

                        <TouchableOpacity 
                            style={styles.receiptCloseButton}
                            onPress={() => setShowSuccessModal(false)}
                        >
                            <Text style={styles.receiptCloseButtonText}>Done</Text>
                        </TouchableOpacity>
                    </BlurView>
                </View>
            </Modal>
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
        marginBottom: 24,
    },
    headerTitle: {
        fontSize: 32,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: -0.5,
        marginBottom: 4,
    },
    headerSubtitle: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.7)',
    },
    loadingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
    },
    loadingText: {
        color: '#FFFFFF',
        marginTop: 16,
        fontWeight: '600',
    },
    balanceCard: {
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        backgroundColor: 'rgba(255,255,255,0.15)',
        overflow: 'hidden',
        marginBottom: 24,
        alignItems: 'center',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        alignItems: 'center',
        marginBottom: 16,
    },
    cardLabel: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1.5,
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    statusActive: {
        backgroundColor: 'rgba(52, 211, 153, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(52, 211, 153, 0.4)',
    },
    statusLocked: {
        backgroundColor: 'rgba(244, 63, 94, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(244, 63, 94, 0.4)',
    },
    statusText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    balanceValue: {
        color: '#FFFFFF',
        fontSize: 54,
        fontWeight: '900',
        marginVertical: 8,
    },
    balanceCurrency: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 2,
    },
    lockedAlert: {
        marginTop: 20,
        backgroundColor: 'rgba(244, 63, 94, 0.15)',
        padding: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(244, 63, 94, 0.3)',
    },
    lockedAlertText: {
        color: '#FDA4AF',
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 18,
        fontWeight: '550',
    },
    topUpButtonContainer: {
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#055FEE',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
        marginBottom: 32,
    },
    topUpGradient: {
        paddingVertical: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    topUpButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    historySection: {
        width: '100%',
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#FFFFFF',
        letterSpacing: -0.5,
        marginBottom: 16,
    },
    emptyHistory: {
        borderRadius: 20,
        padding: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
    },
    emptyHistoryText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
        fontWeight: '500',
    },
    txCard: {
        borderRadius: 20,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
    },
    txRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    txIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    txIcon: {
        fontSize: 20,
    },
    txDetails: {
        flex: 1,
    },
    txTitle: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 4,
    },
    txTime: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
    },
    txAmountContainer: {
        alignItems: 'end',
    },
    txAmount: {
        fontSize: 16,
        fontWeight: '800',
    },
    txGrossText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 10,
        marginTop: 2,
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 24,
        maxHeight: '90%',
        overflow: 'hidden',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    closeModalButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeModalText: {
        color: '#FFFFFF',
        fontSize: 16,
    },
    modalForm: {
        marginBottom: Platform.OS === 'ios' ? 40 : 20,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.7)',
        marginBottom: 8,
        marginLeft: 4,
    },
    modalInput: {
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 16,
        padding: 16,
        fontSize: 28,
        fontWeight: '800',
        color: '#FFFFFF',
        textAlign: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        marginBottom: 16,
    },
    presetsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    presetBadge: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
        marginHorizontal: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    presetText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 15,
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginVertical: 16,
    },
    cardInput: {
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 16,
        padding: 16,
        fontSize: 16,
        color: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        marginBottom: 16,
    },
    cardExpiryRow: {
        flexDirection: 'row',
        marginBottom: 24,
    },
    topUpSubmitButton: {
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 16,
    },
    topUpSubmitGradient: {
        paddingVertical: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    topUpSubmitButtonText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: 'bold',
    },
    disabledButton: {
        opacity: 0.5,
    },
    clicknpayNotice: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 11,
        textAlign: 'center',
        lineHeight: 16,
        paddingHorizontal: 16,
    },
    // Receipt Styles
    receiptContainer: {
        borderRadius: 32,
        padding: 32,
        margin: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        backgroundColor: 'rgba(0,0,0,0.3)',
        overflow: 'hidden',
    },
    successIcon: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(52, 211, 153, 0.2)',
        borderWidth: 2,
        borderColor: '#34D399',
        fontSize: 32,
        textAlign: 'center',
        lineHeight: 60,
        color: '#34D399',
        fontWeight: 'bold',
        marginBottom: 20,
    },
    successTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: '#FFFFFF',
        marginBottom: 8,
    },
    successSubtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 32,
    },
    receiptDetails: {
        width: '100%',
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 20,
        padding: 20,
        marginBottom: 32,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    receiptRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    receiptLabel: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 13,
    },
    receiptValue: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '600',
    },
    receiptNetRow: {
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
        paddingTop: 12,
        marginTop: 4,
        marginBottom: 0,
    },
    receiptNetLabel: {
        color: '#34D399',
        fontSize: 15,
        fontWeight: '700',
    },
    receiptNetValue: {
        color: '#34D399',
        fontSize: 18,
        fontWeight: '800',
    },
    receiptCloseButton: {
        backgroundColor: '#055FEE',
        paddingVertical: 14,
        paddingHorizontal: 40,
        borderRadius: 16,
        width: '100%',
        alignItems: 'center',
    },
    receiptCloseButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
