import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Modal, ActivityIndicator, StatusBar, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { WebView } from 'react-native-webview';
import { useAuthStore } from '../../store/authStore';
import { userService } from '../../services/userService';
import { paymentService } from '../../services/paymentService';
import { supabase } from '../../utils/supabase';
import { CourierWallet, WalletTransaction } from '../../types';

const ZIM_BANKS = [
    'CBZ Bank',
    'Stanbic Bank',
    'CABS',
    'FBC Bank',
    'Steward Bank',
    'Ecobank',
    'Nedbank',
    'NMB Bank',
    'BancABC'
];

export const WalletScreen = ({ navigation }: any) => {
    const { user } = useAuthStore();
    const [wallet, setWallet] = useState<CourierWallet | null>(null);
    const [availableEarnings, setAvailableEarnings] = useState<number>(0);
    const [minPayoutThreshold, setMinPayoutThreshold] = useState<number>(20.00);
    const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
    const [payoutTransactions, setPayoutTransactions] = useState<any[]>([]);
    const [selectedHistoryTab, setSelectedHistoryTab] = useState<'all' | 'float' | 'payouts'>('all');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // ClicknPay Float Top-up Modal States
    const [showTopUpModal, setShowTopUpModal] = useState(false);
    const [topUpAmount, setTopUpAmount] = useState('10.00');
    const [phoneNumber, setPhoneNumber] = useState(user?.phone || user?.user_metadata?.phone || '');
    const [submitting, setSubmitting] = useState(false);

    // ClicknPay WebView Modal States
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentUrl, setPaymentUrl] = useState('');
    const [currentClientRef, setCurrentClientRef] = useState('');
    const [verifying, setVerifying] = useState(false);

    // Float Top-up Success Screen States
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [receipt, setReceipt] = useState<{ gross: number; net: number; fee: number } | null>(null);

    // Automated Payout Modal States
    const [showPayoutModal, setShowPayoutModal] = useState(false);
    const [payoutMethod, setPayoutMethod] = useState<'ecocash' | 'innbucks' | 'bank_transfer'>('ecocash');
    const [payoutAmount, setPayoutAmount] = useState('25.00');
    const [payoutDestination, setPayoutDestination] = useState(user?.phone || user?.user_metadata?.phone || '');
    const [recipientName, setRecipientName] = useState(user?.user_metadata?.full_name || 'Courier Partner');
    const [selectedBank, setSelectedBank] = useState('CBZ Bank');
    const [bankAccountNumber, setBankAccountNumber] = useState('');
    const [bankAccountName, setBankAccountName] = useState(user?.user_metadata?.full_name || '');
    const [payoutSubmitting, setPayoutSubmitting] = useState(false);

    // Payout Receipt Modal States
    const [showPayoutSuccessModal, setShowPayoutSuccessModal] = useState(false);
    const [payoutReceipt, setPayoutReceipt] = useState<{
        reference: string;
        amount: number;
        method: string;
        destination: string;
        remainingBalance?: number;
    } | null>(null);

    const loadWalletData = async (showSpinner = true) => {
        if (!user) return;
        try {
            if (showSpinner) setLoading(true);
            const [walletData, txData, driverProfile, settingsRes, payoutTxRes] = await Promise.all([
                userService.getCourierWallet(user.id),
                userService.getWalletTransactions(user.id),
                userService.getDriverProfile(user.id),
                supabase.from('system_settings').select('min_payout_threshold').limit(1).single(),
                supabase.from('transactions').select('*').eq('driver_id', user.id).eq('type', 'payout').order('created_at', { ascending: false })
            ]);

            setWallet(walletData);
            setTransactions(txData || []);
            setAvailableEarnings(driverProfile?.available_balance || 0);

            if (settingsRes?.data?.min_payout_threshold) {
                setMinPayoutThreshold(parseFloat(settingsRes.data.min_payout_threshold));
            }

            setPayoutTransactions(payoutTxRes?.data || []);
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

    // -------------------------------------------------------------
    // TOP-UP LOGIC (CLICKNPAY)
    // -------------------------------------------------------------
    const handleSelectPreset = (amount: number) => {
        setTopUpAmount(amount.toFixed(2));
    };

    const handleInitiatePayment = async () => {
        const amountNum = parseFloat(topUpAmount);
        if (isNaN(amountNum) || amountNum < 5.00) {
            Alert.alert('Invalid Amount', 'The minimum top-up amount is $5.00 USD.');
            return;
        }

        if (!phoneNumber || phoneNumber.trim().length < 6) {
            Alert.alert('Missing Phone', 'Please enter a valid phone number for ClicknPay.');
            return;
        }

        setSubmitting(true);
        try {
            const orderRes = await paymentService.createPaymentOrder(user!.id, amountNum, phoneNumber.trim());
            
            if (orderRes.paymeURL) {
                setPaymentUrl(orderRes.paymeURL);
                setCurrentClientRef(orderRes.clientReference);
                setShowTopUpModal(false);
                setShowPaymentModal(true);
            } else {
                throw new Error('ClicknPay did not return a payment URL.');
            }
        } catch (error: any) {
            Alert.alert('Payment Order Failed', error.message || 'Could not initiate ClicknPay order. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleVerifyPayment = async () => {
        if (!currentClientRef || verifying) return;
        setVerifying(true);
        try {
            const amountNum = parseFloat(topUpAmount) || 5.00;
            const verifyRes = await paymentService.verifyPaymentStatus(user!.id, currentClientRef, amountNum);

            if (verifyRes.status === 'SUCCESS' || verifyRes.success) {
                setShowPaymentModal(false);
                setReceipt({
                    gross: verifyRes.grossAmount || amountNum,
                    fee: verifyRes.fee || 0,
                    net: verifyRes.netAmount || amountNum
                });
                setShowSuccessModal(true);
                loadWalletData(false);
            } else {
                Alert.alert(
                    'Payment Pending or Incomplete',
                    verifyRes.message || 'Payment has not been confirmed yet. If you have completed payment, please check again in a few seconds.',
                    [
                        { text: 'Check Again', onPress: () => handleVerifyPayment() },
                        { text: 'Close', style: 'cancel' }
                    ]
                );
            }
        } catch (error: any) {
            Alert.alert('Verification Error', error.message || 'Could not verify payment status.');
        } finally {
            setVerifying(false);
        }
    };

    // -------------------------------------------------------------
    // AUTOMATED PAYOUT LOGIC
    // -------------------------------------------------------------
    const handleOpenPayoutModal = () => {
        if (availableEarnings < minPayoutThreshold) {
            Alert.alert(
                'Minimum Payout Threshold',
                `A minimum balance of $${minPayoutThreshold.toFixed(2)} is required to request a payout withdrawal. Your current earnings balance is $${availableEarnings.toFixed(2)}.`
            );
            return;
        }
        setPayoutAmount(Math.min(availableEarnings, 50).toFixed(2));
        setShowPayoutModal(true);
    };

    const handleSelectPayoutPreset = (amt: number | 'max') => {
        if (amt === 'max') {
            setPayoutAmount(availableEarnings.toFixed(2));
        } else {
            setPayoutAmount(Math.min(availableEarnings, amt).toFixed(2));
        }
    };

    const handleConfirmPayout = async () => {
        const amountNum = parseFloat(payoutAmount);
        if (isNaN(amountNum) || amountNum <= 0) {
            Alert.alert('Invalid Amount', 'Please enter a valid payout amount.');
            return;
        }

        if (amountNum < minPayoutThreshold) {
            Alert.alert('Threshold Required', `The minimum payout amount is $${minPayoutThreshold.toFixed(2)} USD.`);
            return;
        }

        if (amountNum > availableEarnings) {
            Alert.alert('Insufficient Earnings', `You cannot withdraw more than your available earnings ($${availableEarnings.toFixed(2)}).`);
            return;
        }

        let destination = payoutDestination.trim();
        let bankDetails: any = null;

        if (payoutMethod === 'ecocash' || payoutMethod === 'innbucks') {
            if (!destination || destination.length < 8) {
                Alert.alert('Missing Number', `Please enter a valid ${payoutMethod === 'ecocash' ? 'EcoCash' : 'InnBucks'} mobile number.`);
                return;
            }
        } else if (payoutMethod === 'bank_transfer') {
            if (!bankAccountNumber.trim()) {
                Alert.alert('Missing Account', 'Please enter your bank account number.');
                return;
            }
            destination = `${selectedBank} • ${bankAccountNumber.trim()}`;
            bankDetails = {
                bankName: selectedBank,
                accountNumber: bankAccountNumber.trim(),
                accountName: bankAccountName.trim() || recipientName
            };
        }

        setPayoutSubmitting(true);
        try {
            const res = await userService.requestAutomatedPayout({
                courierId: user!.id,
                amount: amountNum,
                payoutMethod: payoutMethod,
                destinationAccount: destination,
                recipientName: recipientName,
                bankDetails: bankDetails
            });

            setShowPayoutModal(false);
            setPayoutReceipt({
                reference: res.payoutReference || `PO-${Date.now()}`,
                amount: amountNum,
                method: payoutMethod,
                destination: destination,
                remainingBalance: res.remainingBalance
            });
            setShowPayoutSuccessModal(true);
            loadWalletData(false);
        } catch (err: any) {
            Alert.alert('Payout Failed', err.message || 'Unable to process automated payout. Please try again.');
        } finally {
            setPayoutSubmitting(false);
        }
    };

    // -------------------------------------------------------------
    // HELPERS
    // -------------------------------------------------------------
    const getTransactionIcon = (type: string) => {
        switch (type) {
            case 'topup': return '💳';
            case 'commission_deduction': return '⚡';
            case 'promo_credit': return '🎁';
            case 'payout': return '💸';
            default: return '💵';
        }
    };

    const getTransactionTitle = (type: string, method?: string) => {
        switch (type) {
            case 'topup': return 'ClicknPay Float Top-Up';
            case 'commission_deduction': return 'Platform Job Commission';
            case 'promo_credit': return 'Founder Promotion Credit';
            case 'payout': 
                if (method === 'ecocash') return 'EcoCash Payout Withdrawal';
                if (method === 'innbucks') return 'InnBucks Payout Withdrawal';
                if (method === 'bank_transfer') return 'Bank Transfer Payout';
                return 'Earnings Payout Withdrawal';
            default: return 'Transaction';
        }
    };

    const getTransactionColor = (type: string) => {
        switch (type) {
            case 'topup': return '#34D399';
            case 'commission_deduction': return '#FB7185';
            case 'promo_credit': return '#60A5FA';
            case 'payout': return '#F87171';
            default: return '#94A3B8';
        }
    };

    const formatDateTime = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + 
               date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    };

    // Combined & filtered transaction lists
    const allUnifiedTransactions = [
        ...transactions.map(t => ({ ...t, source: 'float' })),
        ...payoutTransactions.map(p => ({
            id: p.id,
            courier_id: p.driver_id,
            type: 'payout',
            amount: p.amount,
            net_amount: p.amount,
            created_at: p.created_at,
            method: p.payout_method,
            destination: p.payout_destination,
            reference: p.payout_reference,
            source: 'earnings'
        }))
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const filteredTransactions = allUnifiedTransactions.filter(item => {
        if (selectedHistoryTab === 'float') return item.source === 'float';
        if (selectedHistoryTab === 'payouts') return item.source === 'earnings';
        return true;
    });

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
                        <Text style={styles.headerTitle}>Courier Financial Hub</Text>
                        <Text style={styles.headerSubtitle}>Manage your prepaid float & cash out earnings</Text>
                    </View>

                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#055FEE" />
                            <Text style={styles.loadingText}>Fetching wallet & earnings...</Text>
                        </View>
                    ) : (
                        <>
                            {/* DUAL BALANCE SECTION */}
                            <View style={styles.balanceCardsContainer}>
                                
                                {/* 1. TRIP EARNINGS / CASHOUT CARD */}
                                <BlurView intensity={35} tint="light" style={styles.earningsCard}>
                                    <View style={styles.cardHeader}>
                                        <View style={styles.badgeRow}>
                                            <Text style={styles.earningsCardLabel}>TRIP EARNINGS</Text>
                                            <View style={styles.statusWithdrawable}>
                                                <Text style={styles.statusWithdrawableText}>✓ CASHOUT READY</Text>
                                            </View>
                                        </View>
                                    </View>
                                    <View style={styles.balanceRow}>
                                        <Text style={styles.earningsBalanceValue}>
                                            ${availableEarnings.toFixed(2)}
                                        </Text>
                                        <Text style={styles.balanceCurrency}>USD</Text>
                                    </View>
                                    <Text style={styles.earningsSubText}>
                                        Available for instant EcoCash, InnBucks, or Bank transfer.
                                    </Text>

                                    <TouchableOpacity 
                                        style={styles.payoutButtonContainer}
                                        activeOpacity={0.85}
                                        onPress={handleOpenPayoutModal}
                                    >
                                        <LinearGradient
                                            colors={['#10B981', '#059669']}
                                            style={styles.payoutGradient}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                        >
                                            <Text style={styles.payoutButtonText}>💸 Request Payout</Text>
                                        </LinearGradient>
                                    </TouchableOpacity>
                                </BlurView>

                                {/* 2. PREPAID FLOAT CARD (COMMISSIONS) */}
                                <BlurView intensity={25} tint="light" style={styles.balanceCard}>
                                    <View style={styles.cardHeader}>
                                        <View style={styles.badgeRow}>
                                            <Text style={styles.cardLabel}>PREPAID FLOAT BALANCE</Text>
                                            <View style={[
                                                styles.statusBadge, 
                                                wallet?.status === 'locked' ? styles.statusLocked : styles.statusActive
                                            ]}>
                                                <Text style={styles.statusText}>
                                                    {wallet?.status === 'locked' ? '🔒 LOCKED' : '✓ ACTIVE'}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                    <View style={styles.balanceRow}>
                                        <Text style={styles.balanceValue}>
                                            ${wallet?.balance !== undefined ? wallet.balance.toFixed(2) : '0.00'}
                                        </Text>
                                        <Text style={styles.balanceCurrency}>USD</Text>
                                    </View>

                                    {wallet?.status === 'locked' ? (
                                        <View style={styles.lockedAlert}>
                                            <Text style={styles.lockedAlertText}>
                                                ⚠️ Balance below $0.25 lockout threshold. Top up to accept delivery orders.
                                            </Text>
                                        </View>
                                    ) : (
                                        <Text style={styles.floatSubText}>
                                            Used to automatically deduct 13-15% platform trip commission.
                                        </Text>
                                    )}

                                    <TouchableOpacity 
                                        style={styles.topUpButtonContainer}
                                        activeOpacity={0.85}
                                        onPress={() => setShowTopUpModal(true)}
                                    >
                                        <LinearGradient
                                            colors={['#055FEE', '#5B99F2']}
                                            style={styles.topUpGradient}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                        >
                                            <Text style={styles.topUpButtonText}>💳 Top Up Float (ClicknPay)</Text>
                                        </LinearGradient>
                                    </TouchableOpacity>
                                </BlurView>
                            </View>

                            {/* TRANSACTIONS LEDGER & TABS */}
                            <View style={styles.historySection}>
                                <View style={styles.historyHeaderRow}>
                                    <Text style={styles.sectionTitle}>Financial Activity</Text>
                                    <View style={styles.tabsContainer}>
                                        <TouchableOpacity 
                                            style={[styles.tabButton, selectedHistoryTab === 'all' && styles.activeTabButton]}
                                            onPress={() => setSelectedHistoryTab('all')}
                                        >
                                            <Text style={[styles.tabText, selectedHistoryTab === 'all' && styles.activeTabText]}>All</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity 
                                            style={[styles.tabButton, selectedHistoryTab === 'payouts' && styles.activeTabButton]}
                                            onPress={() => setSelectedHistoryTab('payouts')}
                                        >
                                            <Text style={[styles.tabText, selectedHistoryTab === 'payouts' && styles.activeTabText]}>Payouts</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity 
                                            style={[styles.tabButton, selectedHistoryTab === 'float' && styles.activeTabButton]}
                                            onPress={() => setSelectedHistoryTab('float')}
                                        >
                                            <Text style={[styles.tabText, selectedHistoryTab === 'float' && styles.activeTabText]}>Float</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {filteredTransactions.length === 0 ? (
                                    <BlurView intensity={10} tint="light" style={styles.emptyHistory}>
                                        <Text style={styles.emptyHistoryText}>No transactions recorded in this view.</Text>
                                    </BlurView>
                                ) : (
                                    filteredTransactions.map((tx: any) => (
                                        <BlurView key={tx.id} intensity={15} tint="light" style={styles.txCard}>
                                            <View style={styles.txRow}>
                                                <View style={styles.txIconContainer}>
                                                    <Text style={styles.txIcon}>{getTransactionIcon(tx.type)}</Text>
                                                </View>
                                                <View style={styles.txDetails}>
                                                    <Text style={styles.txTitle}>{getTransactionTitle(tx.type, tx.method)}</Text>
                                                    <Text style={styles.txTime}>{formatDateTime(tx.created_at)}</Text>
                                                    {tx.destination && (
                                                        <Text style={styles.txDestination}>Dest: {tx.destination}</Text>
                                                    )}
                                                </View>
                                                <View style={styles.txAmountContainer}>
                                                    <Text style={[
                                                        styles.txAmount, 
                                                        { color: getTransactionColor(tx.type) }
                                                    ]}>
                                                        {tx.type === 'commission_deduction' || tx.type === 'payout' ? '-' : '+'}
                                                        ${tx.type === 'topup' && tx.net_amount !== null ? tx.net_amount.toFixed(2) : tx.amount.toFixed(2)}
                                                    </Text>
                                                    {tx.type === 'topup' && tx.net_amount !== null && (
                                                        <Text style={styles.txGrossText}>Paid: ${tx.amount.toFixed(2)}</Text>
                                                    )}
                                                    {tx.type === 'payout' && (
                                                        <Text style={styles.txDisbursedBadge}>COMPLETED</Text>
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

            {/* ------------------------------------------------------------- */}
            {/* 1. AUTOMATED PAYOUT MODAL */}
            {/* ------------------------------------------------------------- */}
            <Modal
                visible={showPayoutModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowPayoutModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <BlurView intensity={95} tint="dark" style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.modalTitle}>Request Payout</Text>
                                <Text style={styles.modalSubtitle}>Available Earnings: ${availableEarnings.toFixed(2)}</Text>
                            </View>
                            <TouchableOpacity onPress={() => setShowPayoutModal(false)} style={styles.closeModalButton}>
                                <Text style={styles.closeModalText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} style={styles.modalForm}>
                            {/* Provider Selection */}
                            <Text style={styles.inputLabel}>Select Disbursement Method</Text>
                            <View style={styles.methodsRow}>
                                <TouchableOpacity 
                                    style={[styles.methodCard, payoutMethod === 'ecocash' && styles.methodCardActive]}
                                    onPress={() => setPayoutMethod('ecocash')}
                                >
                                    <Text style={styles.methodIcon}>📱</Text>
                                    <Text style={[styles.methodTitle, payoutMethod === 'ecocash' && styles.methodTitleActive]}>EcoCash</Text>
                                    <Text style={styles.methodBadge}>Instant</Text>
                                </TouchableOpacity>

                                <TouchableOpacity 
                                    style={[styles.methodCard, payoutMethod === 'innbucks' && styles.methodCardActive]}
                                    onPress={() => setPayoutMethod('innbucks')}
                                >
                                    <Text style={styles.methodIcon}>🏪</Text>
                                    <Text style={[styles.methodTitle, payoutMethod === 'innbucks' && styles.methodTitleActive]}>InnBucks</Text>
                                    <Text style={styles.methodBadge}>Instant</Text>
                                </TouchableOpacity>

                                <TouchableOpacity 
                                    style={[styles.methodCard, payoutMethod === 'bank_transfer' && styles.methodCardActive]}
                                    onPress={() => setPayoutMethod('bank_transfer')}
                                >
                                    <Text style={styles.methodIcon}>🏦</Text>
                                    <Text style={[styles.methodTitle, payoutMethod === 'bank_transfer' && styles.methodTitleActive]}>Bank</Text>
                                    <Text style={styles.methodBadge}>ZIPIT / RTGS</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Destination Fields */}
                            {payoutMethod === 'bank_transfer' ? (
                                <>
                                    <Text style={styles.inputLabel}>Select Bank</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bankPillsScroll}>
                                        {ZIM_BANKS.map((b) => (
                                            <TouchableOpacity 
                                                key={b} 
                                                style={[styles.bankPill, selectedBank === b && styles.bankPillActive]}
                                                onPress={() => setSelectedBank(b)}
                                            >
                                                <Text style={[styles.bankPillText, selectedBank === b && styles.bankPillTextActive]}>{b}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>

                                    <Text style={styles.inputLabel}>Account Number</Text>
                                    <TextInput
                                        style={styles.cardInput}
                                        value={bankAccountNumber}
                                        onChangeText={setBankAccountNumber}
                                        keyboardType="number-pad"
                                        placeholder="e.g. 9140001234567"
                                        placeholderTextColor="#64748B"
                                    />

                                    <Text style={styles.inputLabel}>Account Holder Name</Text>
                                    <TextInput
                                        style={styles.cardInput}
                                        value={bankAccountName}
                                        onChangeText={setBankAccountName}
                                        placeholder="Account Holder Full Name"
                                        placeholderTextColor="#64748B"
                                    />
                                </>
                            ) : (
                                <>
                                    <Text style={styles.inputLabel}>
                                        {payoutMethod === 'ecocash' ? 'EcoCash Number (077X / 078X)' : 'InnBucks Registered Phone'}
                                    </Text>
                                    <TextInput
                                        style={styles.cardInput}
                                        value={payoutDestination}
                                        onChangeText={setPayoutDestination}
                                        keyboardType="phone-pad"
                                        placeholder="e.g. 0771234567"
                                        placeholderTextColor="#64748B"
                                    />
                                    <Text style={styles.inputLabel}>Recipient Name</Text>
                                    <TextInput
                                        style={styles.cardInput}
                                        value={recipientName}
                                        onChangeText={setRecipientName}
                                        placeholder="Driver Full Name"
                                        placeholderTextColor="#64748B"
                                    />
                                </>
                            )}

                            {/* Payout Amount */}
                            <Text style={styles.inputLabel}>Withdrawal Amount (USD)</Text>
                            <TextInput
                                style={styles.modalInput}
                                value={payoutAmount}
                                onChangeText={setPayoutAmount}
                                keyboardType="decimal-pad"
                                placeholder="25.00"
                                selectionColor="#10B981"
                                placeholderTextColor="#94A3B8"
                            />

                            {/* Preset Buttons */}
                            <View style={styles.presetsRow}>
                                {[25, 50, 100].map((amt) => (
                                    <TouchableOpacity 
                                        key={amt} 
                                        style={styles.presetBadge}
                                        onPress={() => handleSelectPayoutPreset(amt)}
                                    >
                                        <Text style={styles.presetText}>${amt}</Text>
                                    </TouchableOpacity>
                                ))}
                                <TouchableOpacity 
                                    style={[styles.presetBadge, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}
                                    onPress={() => handleSelectPayoutPreset('max')}
                                >
                                    <Text style={[styles.presetText, { color: '#34D399', fontWeight: '800' }]}>Max</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.payoutSummaryBox}>
                                <View style={styles.summaryRow}>
                                    <Text style={styles.summaryLabel}>Minimum Threshold:</Text>
                                    <Text style={styles.summaryValue}>${minPayoutThreshold.toFixed(2)}</Text>
                                </View>
                                <View style={styles.summaryRow}>
                                    <Text style={styles.summaryLabel}>Estimated Transfer Fee:</Text>
                                    <Text style={styles.summaryValueFree}>$0.00 (Free)</Text>
                                </View>
                                <View style={styles.summaryRow}>
                                    <Text style={styles.summaryLabel}>Net Disbursed:</Text>
                                    <Text style={styles.summaryValueHighlight}>${(parseFloat(payoutAmount) || 0).toFixed(2)}</Text>
                                </View>
                            </View>

                            <TouchableOpacity 
                                style={[styles.payoutSubmitButton, payoutSubmitting && styles.disabledButton]}
                                activeOpacity={0.8}
                                onPress={handleConfirmPayout}
                                disabled={payoutSubmitting}
                            >
                                <LinearGradient
                                    colors={['#10B981', '#059669']}
                                    style={styles.payoutSubmitGradient}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                >
                                    {payoutSubmitting ? (
                                        <ActivityIndicator color="#FFFFFF" />
                                    ) : (
                                        <Text style={styles.payoutSubmitButtonText}>Confirm & Disburse Now</Text>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>

                            <Text style={styles.clicknpayNotice}>
                                Disbursements are automated directly to your destination mobile wallet or bank account.
                            </Text>
                        </ScrollView>
                    </BlurView>
                </View>
            </Modal>

            {/* ------------------------------------------------------------- */}
            {/* 2. AUTOMATED PAYOUT SUCCESS RECEIPT MODAL */}
            {/* ------------------------------------------------------------- */}
            <Modal
                visible={showPayoutSuccessModal}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setShowPayoutSuccessModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <BlurView intensity={90} tint="dark" style={styles.successModalContent}>
                        <View style={styles.successIconCircle}>
                            <Text style={styles.successCheckmark}>✓</Text>
                        </View>
                        <Text style={styles.successTitle}>Payout Disbursed!</Text>
                        <Text style={styles.successSub}>
                            Funds have been sent to your {payoutReceipt?.method?.toUpperCase()} account.
                        </Text>

                        <View style={styles.receiptBox}>
                            <View style={styles.receiptRow}>
                                <Text style={styles.receiptLabel}>Disbursed Amount</Text>
                                <Text style={styles.receiptValueBold}>${payoutReceipt?.amount.toFixed(2)} USD</Text>
                            </View>
                            <View style={styles.receiptRow}>
                                <Text style={styles.receiptLabel}>Method</Text>
                                <Text style={styles.receiptValue}>{payoutReceipt?.method?.toUpperCase()}</Text>
                            </View>
                            <View style={styles.receiptRow}>
                                <Text style={styles.receiptLabel}>Destination</Text>
                                <Text style={styles.receiptValue}>{payoutReceipt?.destination}</Text>
                            </View>
                            <View style={styles.receiptRow}>
                                <Text style={styles.receiptLabel}>Reference</Text>
                                <Text style={styles.receiptValueMono}>{payoutReceipt?.reference}</Text>
                            </View>
                        </View>

                        <TouchableOpacity 
                            style={styles.receiptDoneButton}
                            onPress={() => setShowPayoutSuccessModal(false)}
                        >
                            <Text style={styles.receiptDoneText}>Done</Text>
                        </TouchableOpacity>
                    </BlurView>
                </View>
            </Modal>

            {/* ------------------------------------------------------------- */}
            {/* 3. CLICKNPAY TOP-UP SETUP MODAL */}
            {/* ------------------------------------------------------------- */}
            <Modal
                visible={showTopUpModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowTopUpModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <BlurView intensity={90} tint="dark" style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Top Up Float with ClicknPay</Text>
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

                            <Text style={styles.inputLabel}>Phone Number for Payment</Text>
                            <TextInput
                                style={styles.cardInput}
                                value={phoneNumber}
                                onChangeText={setPhoneNumber}
                                keyboardType="phone-pad"
                                placeholder="+263 77 123 4567"
                                placeholderTextColor="#64748B"
                            />

                            <TouchableOpacity 
                                style={[styles.topUpSubmitButton, submitting && styles.disabledButton]}
                                activeOpacity={0.8}
                                onPress={handleInitiatePayment}
                                disabled={submitting}
                            >
                                <LinearGradient
                                    colors={['#055FEE', '#5B99F2']}
                                    style={styles.topUpSubmitGradient}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                >
                                    {submitting ? (
                                        <ActivityIndicator color="#FFFFFF" />
                                    ) : (
                                        <Text style={styles.topUpSubmitButtonText}>Proceed to ClicknPay Checkout</Text>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>

                            <Text style={styles.clicknpayNotice}>
                                ClicknPay secure payment gateway will open to complete the transaction.
                            </Text>
                        </ScrollView>
                    </BlurView>
                </View>
            </Modal>

            {/* ------------------------------------------------------------- */}
            {/* 4. CLICKNPAY WEBVIEW CHECKOUT MODAL */}
            {/* ------------------------------------------------------------- */}
            <Modal
                visible={showPaymentModal}
                animationType="slide"
                transparent={false}
                onRequestClose={() => {
                    Alert.alert(
                        'Cancel Payment?',
                        'Are you sure you want to close the checkout session?',
                        [
                            { text: 'No', style: 'cancel' },
                            { text: 'Yes, Close', onPress: () => setShowPaymentModal(false) }
                        ]
                    );
                }}
            >
                <SafeAreaView style={styles.webViewContainer} edges={['top', 'left', 'right']}>
                    <View style={styles.webViewHeader}>
                        <TouchableOpacity onPress={() => setShowPaymentModal(false)} style={styles.webCloseBtn}>
                            <Text style={styles.webCloseText}>Close</Text>
                        </TouchableOpacity>
                        <Text style={styles.webTitle}>ClicknPay Secure Checkout</Text>
                        <View style={{ width: 50 }} />
                    </View>

                    {paymentUrl ? (
                        <WebView
                            source={{ uri: paymentUrl }}
                            style={styles.webView}
                            startInLoadingState={true}
                            renderLoading={() => (
                                <View style={styles.webLoadingOverlay}>
                                    <ActivityIndicator size="large" color="#055FEE" />
                                    <Text style={styles.webLoadingText}>Loading ClicknPay Secure Portal...</Text>
                                </View>
                            )}
                            onNavigationStateChange={(navState) => {
                                if (navState.url.includes('payment-return') || navState.url.includes('status=SUCCESS')) {
                                    handleVerifyPayment();
                                }
                            }}
                        />
                    ) : null}

                    <View style={styles.webViewFooter}>
                        <TouchableOpacity 
                            style={styles.verifyPaymentButton}
                            onPress={handleVerifyPayment}
                            disabled={verifying}
                        >
                            <LinearGradient
                                colors={['#10B981', '#059669']}
                                style={styles.verifyGradient}
                            >
                                {verifying ? (
                                    <ActivityIndicator color="#FFF" size="small" />
                                ) : (
                                    <Text style={styles.verifyPaymentText}>I Have Paid • Verify Now</Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </Modal>

            {/* ------------------------------------------------------------- */}
            {/* 5. FLOAT TOP-UP SUCCESS RECEIPT MODAL */}
            {/* ------------------------------------------------------------- */}
            <Modal
                visible={showSuccessModal}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setShowSuccessModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <BlurView intensity={90} tint="dark" style={styles.successModalContent}>
                        <View style={styles.successIconCircle}>
                            <Text style={styles.successCheckmark}>✓</Text>
                        </View>
                        <Text style={styles.successTitle}>Top-up Successful!</Text>
                        <Text style={styles.successSub}>Your Mate float balance has been credited.</Text>

                        <View style={styles.receiptBox}>
                            <View style={styles.receiptRow}>
                                <Text style={styles.receiptLabel}>Gross Paid</Text>
                                <Text style={styles.receiptValue}>${receipt?.gross.toFixed(2)} USD</Text>
                            </View>
                            <View style={styles.receiptRow}>
                                <Text style={styles.receiptLabel}>Processing Fee</Text>
                                <Text style={styles.receiptValue}>-${receipt?.fee.toFixed(2)} USD</Text>
                            </View>
                            <View style={styles.dividerLight} />
                            <View style={styles.receiptRow}>
                                <Text style={styles.receiptLabelBold}>Net Credited</Text>
                                <Text style={styles.receiptValueBold}>+${receipt?.net.toFixed(2)} USD</Text>
                            </View>
                        </View>

                        <TouchableOpacity 
                            style={styles.receiptDoneButton}
                            onPress={() => setShowSuccessModal(false)}
                        >
                            <Text style={styles.receiptDoneText}>Done</Text>
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
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 40 : 20,
        paddingBottom: 40,
    },
    header: {
        marginBottom: 20,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 14,
        color: '#94A3B8',
        marginTop: 4,
    },
    loadingContainer: {
        paddingVertical: 60,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        color: '#94A3B8',
        marginTop: 12,
        fontSize: 14,
    },
    balanceCardsContainer: {
        gap: 16,
        marginBottom: 24,
    },
    earningsCard: {
        borderRadius: 24,
        padding: 22,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.35)',
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        overflow: 'hidden',
    },
    earningsCardLabel: {
        fontSize: 12,
        fontWeight: '800',
        color: '#34D399',
        letterSpacing: 0.8,
    },
    statusWithdrawable: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
    },
    statusWithdrawableText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#34D399',
    },
    earningsBalanceValue: {
        fontSize: 38,
        fontWeight: '900',
        color: '#FFFFFF',
    },
    earningsSubText: {
        fontSize: 12,
        color: '#A7F3D0',
        marginTop: 6,
        marginBottom: 16,
    },
    payoutButtonContainer: {
        borderRadius: 14,
        overflow: 'hidden',
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    payoutGradient: {
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    payoutButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    balanceCard: {
        borderRadius: 24,
        padding: 22,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        overflow: 'hidden',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    badgeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
    },
    cardLabel: {
        fontSize: 12,
        fontWeight: '800',
        color: '#94A3B8',
        letterSpacing: 0.8,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
    },
    statusActive: {
        backgroundColor: 'rgba(52, 211, 153, 0.15)',
    },
    statusLocked: {
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
    },
    statusText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    balanceRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    balanceValue: {
        fontSize: 34,
        fontWeight: '900',
        color: '#FFFFFF',
    },
    balanceCurrency: {
        fontSize: 16,
        fontWeight: '700',
        color: '#64748B',
        marginLeft: 8,
    },
    floatSubText: {
        fontSize: 12,
        color: '#94A3B8',
        marginTop: 6,
        marginBottom: 16,
    },
    lockedAlert: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        borderRadius: 12,
        padding: 10,
        marginTop: 8,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.3)',
    },
    lockedAlertText: {
        color: '#FCA5A5',
        fontSize: 12,
        fontWeight: '600',
        lineHeight: 18,
    },
    topUpButtonContainer: {
        borderRadius: 14,
        overflow: 'hidden',
    },
    topUpGradient: {
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    topUpButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    historySection: {
        marginTop: 8,
    },
    historyHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: -0.3,
    },
    tabsContainer: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
        padding: 3,
    },
    tabButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 9,
    },
    activeTabButton: {
        backgroundColor: '#055FEE',
    },
    tabText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#94A3B8',
    },
    activeTabText: {
        color: '#FFFFFF',
    },
    emptyHistory: {
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
    },
    emptyHistoryText: {
        color: '#64748B',
        fontSize: 14,
    },
    txCard: {
        borderRadius: 18,
        padding: 16,
        marginBottom: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    txRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    txIconContainer: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    txIcon: {
        fontSize: 18,
    },
    txDetails: {
        flex: 1,
    },
    txTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    txTime: {
        fontSize: 11,
        color: '#64748B',
        marginTop: 2,
    },
    txDestination: {
        fontSize: 10,
        color: '#34D399',
        marginTop: 2,
        fontWeight: '600',
    },
    txAmountContainer: {
        alignItems: 'flex-end',
    },
    txAmount: {
        fontSize: 15,
        fontWeight: '800',
    },
    txGrossText: {
        fontSize: 10,
        color: '#64748B',
        marginTop: 2,
    },
    txDisbursedBadge: {
        fontSize: 9,
        fontWeight: '800',
        color: '#34D399',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        marginTop: 3,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        padding: 24,
        backgroundColor: '#16222F',
        maxHeight: '90%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    modalSubtitle: {
        fontSize: 12,
        color: '#34D399',
        fontWeight: '700',
        marginTop: 2,
    },
    closeModalButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeModalText: {
        color: '#94A3B8',
        fontSize: 14,
        fontWeight: 'bold',
    },
    modalForm: {
        marginBottom: 10,
    },
    inputLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#94A3B8',
        marginTop: 12,
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    methodsRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 10,
    },
    methodCard: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        alignItems: 'center',
    },
    methodCardActive: {
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
    },
    methodIcon: {
        fontSize: 22,
        marginBottom: 4,
    },
    methodTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#94A3B8',
    },
    methodTitleActive: {
        color: '#FFFFFF',
    },
    methodBadge: {
        fontSize: 9,
        fontWeight: '700',
        color: '#34D399',
        marginTop: 2,
    },
    bankPillsScroll: {
        flexDirection: 'row',
        marginBottom: 10,
    },
    bankPill: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        marginRight: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    bankPillActive: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        borderColor: '#10B981',
    },
    bankPillText: {
        fontSize: 12,
        color: '#94A3B8',
        fontWeight: '600',
    },
    bankPillTextActive: {
        color: '#FFFFFF',
        fontWeight: '800',
    },
    cardInput: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        padding: 14,
        color: '#FFFFFF',
        fontSize: 15,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    modalInput: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        padding: 14,
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '800',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    presetsRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 10,
        marginBottom: 14,
    },
    presetBadge: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    presetText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 13,
    },
    payoutSummaryBox: {
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        borderRadius: 14,
        padding: 14,
        marginVertical: 10,
        gap: 8,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    summaryLabel: {
        color: '#94A3B8',
        fontSize: 12,
    },
    summaryValue: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
    summaryValueFree: {
        color: '#34D399',
        fontSize: 12,
        fontWeight: '700',
    },
    summaryValueHighlight: {
        color: '#34D399',
        fontSize: 16,
        fontWeight: '900',
    },
    payoutSubmitButton: {
        borderRadius: 14,
        overflow: 'hidden',
        marginTop: 12,
    },
    payoutSubmitGradient: {
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    payoutSubmitButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    topUpSubmitButton: {
        borderRadius: 14,
        overflow: 'hidden',
        marginTop: 16,
    },
    topUpSubmitGradient: {
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    topUpSubmitButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },
    disabledButton: {
        opacity: 0.6,
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        marginVertical: 14,
    },
    dividerLight: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        marginVertical: 8,
    },
    clicknpayNotice: {
        fontSize: 11,
        color: '#64748B',
        textAlign: 'center',
        marginTop: 12,
        lineHeight: 16,
    },
    successModalContent: {
        marginHorizontal: 24,
        borderRadius: 24,
        padding: 24,
        backgroundColor: '#1E293B',
        alignItems: 'center',
        marginBottom: 'auto',
        marginTop: 'auto',
    },
    successIconCircle: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#10B981',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    successCheckmark: {
        color: '#FFFFFF',
        fontSize: 32,
        fontWeight: '900',
    },
    successTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    successSub: {
        fontSize: 13,
        color: '#94A3B8',
        textAlign: 'center',
        marginTop: 6,
        marginBottom: 18,
    },
    receiptBox: {
        width: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.25)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        gap: 10,
    },
    receiptRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    receiptLabel: {
        fontSize: 13,
        color: '#94A3B8',
    },
    receiptLabelBold: {
        fontSize: 14,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    receiptValue: {
        fontSize: 13,
        color: '#FFFFFF',
        fontWeight: '600',
    },
    receiptValueBold: {
        fontSize: 15,
        fontWeight: '800',
        color: '#34D399',
    },
    receiptValueMono: {
        fontSize: 11,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        color: '#38BDF8',
        fontWeight: '700',
    },
    receiptDoneButton: {
        width: '100%',
        paddingVertical: 14,
        borderRadius: 14,
        backgroundColor: '#055FEE',
        alignItems: 'center',
    },
    receiptDoneText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },
    webViewContainer: {
        flex: 1,
        backgroundColor: '#0F172A',
    },
    webViewHeader: {
        height: 50,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    },
    webCloseBtn: {
        paddingVertical: 6,
        paddingHorizontal: 10,
    },
    webCloseText: {
        color: '#EF4444',
        fontSize: 15,
        fontWeight: '700',
    },
    webTitle: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
    webView: {
        flex: 1,
    },
    webLoadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#0F172A',
        alignItems: 'center',
        justifyContent: 'center',
    },
    webLoadingText: {
        color: '#94A3B8',
        marginTop: 12,
        fontSize: 14,
    },
    webViewFooter: {
        padding: 16,
        backgroundColor: '#0F172A',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.1)',
    },
    verifyPaymentButton: {
        borderRadius: 14,
        overflow: 'hidden',
    },
    verifyGradient: {
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    verifyPaymentText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },
});
