import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../../utils/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

export const ForgotPasswordScreen = ({ navigation }: any) => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);

    const handleResetPassword = async () => {
        if (!email) {
            Alert.alert('Error', 'Please enter your email address');
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: 'shipmate://reset-password',
            });

            if (error) throw error;

            Alert.alert(
                'Check your email',
                'We have sent a password reset link to your email address.',
                [{ text: 'OK', onPress: () => navigation.goBack() }]
            );
        } catch (error: any) {
            Alert.alert('Reset Error', error.message);
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
                <View style={styles.content}>
                    <TouchableOpacity 
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                    >
                        <Ionicons name="arrow-back" size={28} color="#FFFFFF" />
                    </TouchableOpacity>

                    <View style={styles.headerContainer}>
                        <View style={styles.iconContainer}>
                            <Ionicons name="key-outline" size={40} color="#34A853" />
                        </View>
                        <Text style={styles.headerTitle}>Forgot Password?</Text>
                        <Text style={styles.subtext}>Enter your email to receive reset instructions</Text>
                    </View>

                    <BlurView intensity={20} tint="light" style={styles.formContainer}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Email Address</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="name@example.com"
                                placeholderTextColor="rgba(255,255,255,0.5)"
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                                selectionColor="#34A853"
                            />
                        </View>

                        <TouchableOpacity
                            style={styles.primaryButton}
                            activeOpacity={0.8}
                            onPress={handleResetPassword}
                            disabled={loading}
                        >
                            <LinearGradient
                                colors={['#34A853', '#2E9348']}
                                style={styles.gradientButton}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.primaryButtonText}>Send Reset Link</Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    </BlurView>
                </View>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    keyboardView: { flex: 1 },
    content: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 60,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        marginBottom: 40,
    },
    headerContainer: {
        alignItems: 'center',
        marginBottom: 40,
    },
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(52, 168, 83, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(52, 168, 83, 0.3)',
    },
    headerTitle: {
        fontSize: 32,
        fontWeight: '800',
        color: '#FFFFFF',
        marginBottom: 12,
        textAlign: 'center',
    },
    subtext: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
        lineHeight: 24,
    },
    formContainer: {
        borderRadius: 24,
        padding: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    inputGroup: { marginBottom: 24 },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.9)',
        marginBottom: 8,
        marginLeft: 4,
    },
    input: {
        backgroundColor: 'rgba(0,0,0,0.2)',
        color: '#FFFFFF',
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderRadius: 16,
        fontSize: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    primaryButton: {
        borderRadius: 16,
        overflow: 'hidden',
        elevation: 6,
        shadowColor: '#34A853',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
    },
    gradientButton: {
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
});
