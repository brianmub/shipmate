import React, { useState, useEffect } from 'react';
import { 
    View, 
    Text, 
    TextInput, 
    StyleSheet, 
    TouchableOpacity, 
    Alert, 
    ActivityIndicator, 
    KeyboardAvoidingView, 
    Platform,
    ScrollView 
} from 'react-native';
import { supabase } from '../../utils/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

export const ForgotPasswordScreen = ({ navigation }: any) => {
    // Step: 'request' (enter email) | 'verify' (enter OTP code & new password)
    const [step, setStep] = useState<'request' | 'verify'>('request');
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);

    // Cooldown countdown timer for resend OTP
    useEffect(() => {
        let timer: any;
        if (resendCooldown > 0) {
            timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
        }
        return () => clearTimeout(timer);
    }, [resendCooldown]);

    // Step 1: Request Password Reset Code
    const handleRequestOtp = async () => {
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail) {
            Alert.alert('Required', 'Please enter your email address');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanEmail)) {
            Alert.alert('Invalid Email', 'Please enter a valid email address');
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
            if (error) throw error;

            setStep('verify');
            setResendCooldown(60);
            Alert.alert(
                'Verification Code Sent',
                `A 6-digit password reset code has been sent to ${cleanEmail}. Please check your inbox and spam folder.`
            );
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to send reset code. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Step 2: Verify Code and Update Password
    const handleVerifyAndResetPassword = async () => {
        const cleanEmail = email.trim().toLowerCase();
        const cleanOtp = otp.trim();

        if (!cleanOtp || cleanOtp.length < 6) {
            Alert.alert('Invalid Code', 'Please enter the full 6-digit verification code sent to your email.');
            return;
        }

        if (!newPassword || newPassword.length < 6) {
            Alert.alert('Weak Password', 'Your new password must be at least 6 characters long.');
            return;
        }

        if (newPassword !== confirmPassword) {
            Alert.alert('Mismatch', 'New passwords do not match. Please re-enter.');
            return;
        }

        setLoading(true);
        try {
            // 1. Verify the recovery OTP token
            const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
                email: cleanEmail,
                token: cleanOtp,
                type: 'recovery',
            });

            if (verifyError) {
                throw new Error(verifyError.message || 'Invalid or expired verification code.');
            }

            // 2. Update the user password under the recovery session
            const { error: updateError } = await supabase.auth.updateUser({
                password: newPassword,
            });

            if (updateError) {
                throw new Error(updateError.message || 'Failed to set new password.');
            }

            // 3. Inform user and return to sign in
            Alert.alert(
                'Password Reset Successfully! 🎉',
                'Your password has been updated. You can now sign in with your new password.',
                [
                    { 
                        text: 'Sign In Now', 
                        onPress: () => navigation.navigate('SignIn') 
                    }
                ]
            );
        } catch (error: any) {
            Alert.alert('Reset Failed', error.message || 'Could not verify code or update password.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <LinearGradient
            colors={['#0F2027', '#203A43', '#2C5364']}
            style={styles.container}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <ScrollView 
                    contentContainerStyle={styles.scrollContent} 
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Back Button */}
                    <TouchableOpacity 
                        style={styles.backButton}
                        onPress={() => {
                            if (step === 'verify') {
                                setStep('request');
                            } else {
                                navigation.goBack();
                            }
                        }}
                    >
                        <Ionicons name="arrow-back" size={26} color="#FFFFFF" />
                    </TouchableOpacity>

                    {/* Header */}
                    <View style={styles.headerContainer}>
                        <View style={styles.iconContainer}>
                            <Ionicons 
                                name={step === 'request' ? "key-outline" : "shield-checkmark-outline"} 
                                size={38} 
                                color="#055FEE" 
                            />
                        </View>
                        <Text style={styles.headerTitle}>
                            {step === 'request' ? 'Forgot Password?' : 'Reset Password'}
                        </Text>
                        <Text style={styles.subtext}>
                            {step === 'request' 
                                ? 'Enter your registered email to receive a 6-digit verification code.'
                                : `Enter the 6-digit code sent to ${email} along with your new password.`}
                        </Text>
                    </View>

                    {/* Form Card */}
                    <BlurView intensity={25} tint="light" style={styles.formContainer}>
                        {step === 'request' ? (
                            /* STEP 1: EMAIL INPUT */
                            <>
                                <View style={styles.inputGroup}>
                                    <Text style={styles.label}>Email Address</Text>
                                    <View style={styles.inputWrapper}>
                                        <Ionicons name="mail-outline" size={20} color="rgba(255,255,255,0.6)" style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="name@example.com"
                                            placeholderTextColor="rgba(255,255,255,0.4)"
                                            value={email}
                                            onChangeText={setEmail}
                                            autoCapitalize="none"
                                            keyboardType="email-address"
                                            selectionColor="#055FEE"
                                            editable={!loading}
                                        />
                                    </View>
                                </View>

                                <TouchableOpacity
                                    style={[styles.primaryButton, loading && styles.disabledButton]}
                                    activeOpacity={0.8}
                                    onPress={handleRequestOtp}
                                    disabled={loading}
                                >
                                    <LinearGradient
                                        colors={['#055FEE', '#5B99F2']}
                                        style={styles.gradientButton}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                    >
                                        {loading ? (
                                            <ActivityIndicator color="#fff" />
                                        ) : (
                                            <Text style={styles.primaryButtonText}>Send 6-Digit Code</Text>
                                        )}
                                    </LinearGradient>
                                </TouchableOpacity>
                            </>
                        ) : (
                            /* STEP 2: OTP & NEW PASSWORD */
                            <>
                                {/* 6-Digit Code */}
                                <View style={styles.inputGroup}>
                                    <View style={styles.labelRow}>
                                        <Text style={styles.label}>6-Digit Verification Code</Text>
                                        <TouchableOpacity 
                                            onPress={() => setStep('request')}
                                            disabled={loading}
                                        >
                                            <Text style={styles.changeEmailText}>Change email</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.inputWrapper}>
                                        <Ionicons name="keypad-outline" size={20} color="rgba(255,255,255,0.6)" style={styles.inputIcon} />
                                        <TextInput
                                            style={[styles.input, styles.otpInput]}
                                            placeholder="000000"
                                            placeholderTextColor="rgba(255,255,255,0.3)"
                                            value={otp}
                                            onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, '').slice(0, 6))}
                                            keyboardType="number-pad"
                                            maxLength={6}
                                            selectionColor="#055FEE"
                                            editable={!loading}
                                        />
                                    </View>
                                </View>

                                {/* New Password */}
                                <View style={styles.inputGroup}>
                                    <Text style={styles.label}>New Password</Text>
                                    <View style={styles.inputWrapper}>
                                        <Ionicons name="lock-closed-outline" size={20} color="rgba(255,255,255,0.6)" style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Min. 6 characters"
                                            placeholderTextColor="rgba(255,255,255,0.4)"
                                            value={newPassword}
                                            onChangeText={setNewPassword}
                                            secureTextEntry={!showPassword}
                                            autoCapitalize="none"
                                            selectionColor="#055FEE"
                                            editable={!loading}
                                        />
                                        <TouchableOpacity 
                                            onPress={() => setShowPassword(!showPassword)}
                                            style={styles.eyeIcon}
                                        >
                                            <Ionicons 
                                                name={showPassword ? "eye-off-outline" : "eye-outline"} 
                                                size={20} 
                                                color="rgba(255,255,255,0.6)" 
                                            />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {/* Confirm New Password */}
                                <View style={styles.inputGroup}>
                                    <Text style={styles.label}>Confirm New Password</Text>
                                    <View style={styles.inputWrapper}>
                                        <Ionicons name="lock-closed-outline" size={20} color="rgba(255,255,255,0.6)" style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Repeat new password"
                                            placeholderTextColor="rgba(255,255,255,0.4)"
                                            value={confirmPassword}
                                            onChangeText={setConfirmPassword}
                                            secureTextEntry={!showConfirmPassword}
                                            autoCapitalize="none"
                                            selectionColor="#055FEE"
                                            editable={!loading}
                                        />
                                        <TouchableOpacity 
                                            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                                            style={styles.eyeIcon}
                                        >
                                            <Ionicons 
                                                name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} 
                                                size={20} 
                                                color="rgba(255,255,255,0.6)" 
                                            />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {/* Submit Button */}
                                <TouchableOpacity
                                    style={[styles.primaryButton, loading && styles.disabledButton]}
                                    activeOpacity={0.8}
                                    onPress={handleVerifyAndResetPassword}
                                    disabled={loading}
                                >
                                    <LinearGradient
                                        colors={['#055FEE', '#5B99F2']}
                                        style={styles.gradientButton}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                    >
                                        {loading ? (
                                            <ActivityIndicator color="#fff" />
                                        ) : (
                                            <Text style={styles.primaryButtonText}>Set New Password</Text>
                                        )}
                                    </LinearGradient>
                                </TouchableOpacity>

                                {/* Resend Code Row */}
                                <View style={styles.resendRow}>
                                    <Text style={styles.resendText}>Didn't receive code? </Text>
                                    <TouchableOpacity 
                                        onPress={handleRequestOtp} 
                                        disabled={loading || resendCooldown > 0}
                                    >
                                        <Text style={[
                                            styles.resendButtonText, 
                                            (loading || resendCooldown > 0) && styles.resendDisabledText
                                        ]}>
                                            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}
                    </BlurView>
                </ScrollView>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: { 
        flex: 1 
    },
    keyboardView: { 
        flex: 1 
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingTop: Platform.OS === 'ios' ? 60 : 45,
        paddingBottom: 40,
    },
    backButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    headerContainer: {
        alignItems: 'center',
        marginBottom: 32,
    },
    iconContainer: {
        width: 76,
        height: 76,
        borderRadius: 38,
        backgroundColor: 'rgba(5, 95, 238, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(5, 95, 238, 0.3)',
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '800',
        color: '#FFFFFF',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtext: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
        lineHeight: 22,
        paddingHorizontal: 12,
    },
    formContainer: {
        borderRadius: 24,
        padding: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    inputGroup: { 
        marginBottom: 20 
    },
    labelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.9)',
        marginBottom: 8,
        marginLeft: 4,
    },
    changeEmailText: {
        fontSize: 12,
        color: '#38BDF8',
        fontWeight: '600',
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.25)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        paddingHorizontal: 14,
    },
    inputIcon: {
        marginRight: 10,
    },
    eyeIcon: {
        padding: 8,
    },
    input: {
        flex: 1,
        color: '#FFFFFF',
        paddingVertical: 14,
        fontSize: 16,
    },
    otpInput: {
        fontSize: 22,
        letterSpacing: 6,
        fontWeight: '700',
    },
    primaryButton: {
        borderRadius: 16,
        overflow: 'hidden',
        marginTop: 8,
        elevation: 6,
        shadowColor: '#055FEE',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
    },
    disabledButton: {
        opacity: 0.6,
    },
    gradientButton: {
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    resendRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 20,
    },
    resendText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 14,
    },
    resendButtonText: {
        color: '#38BDF8',
        fontSize: 14,
        fontWeight: '700',
    },
    resendDisabledText: {
        color: 'rgba(255,255,255,0.3)',
    },
});
