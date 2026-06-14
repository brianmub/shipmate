import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../utils/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

export const SignUpScreen = ({ navigation }: any) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [fullName, setFullName] = useState('');
    const [role, setRoleSelection] = useState<'customer' | 'driver'>('customer');
    const [loading, setLoading] = useState(false);

    const { setSession, setRole, setUser } = useAuthStore();

    const handleSignUp = async () => {
        console.log("Starting signup process for:", email);
        if (!email || !password || !fullName) {
            const msg = 'Please fill in all fields';
            if (Platform.OS === 'web') alert(msg);
            else Alert.alert('Error', msg);
            return;
        }

        setLoading(true);
        try {
            console.log("Calling supabase.auth.signUp...");
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName,
                        role: role
                    }
                }
            });

            if (error) {
                console.error("Supabase signup error:", error);
                throw error;
            }

            console.log("Signup successful, data:", data);

            if (data.session) {
                console.log("Session found, logging in user...");
                setRole(role);
                setSession(data.session);
                setUser(data.user);
            } else {
                console.log("No session found (likely needs email confirmation)");
                const title = 'Check your email';
                const msg = 'We sent you a confirmation link. Please check your inbox before signing in.';
                if (Platform.OS === 'web') alert(`${title}: ${msg}`);
                else Alert.alert(title, msg);
                navigation.navigate('SignIn');
            }

        } catch (error: any) {
            console.error("Caught signup error:", error.message);
            if (Platform.OS === 'web') alert(`Sign Up Error: ${error.message}`);
            else Alert.alert('Sign Up Error', error.message);
        } finally {
            setLoading(false);
            console.log("Signup process finished");
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
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} bounces={false}>

                    <View style={styles.headerContainer}>
                        <Text style={styles.headerTitle}>Create Account</Text>
                        <Text style={styles.subtext}>Join ShipMate to get started</Text>
                    </View>

                    <BlurView intensity={20} tint="light" style={styles.formContainer}>

                        <View style={styles.roleContainer}>
                            <TouchableOpacity
                                style={[styles.roleButton, role === 'customer' && styles.roleButtonActive]}
                                onPress={() => setRoleSelection('customer')}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.roleText, role === 'customer' && styles.roleTextActive]}>Customer</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.roleButton, role === 'driver' && styles.roleButtonActive]}
                                onPress={() => setRoleSelection('driver')}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.roleText, role === 'driver' && styles.roleTextActive]}>Driver / Courier</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Full Name</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="John Doe"
                                placeholderTextColor="rgba(255,255,255,0.5)"
                                value={fullName}
                                onChangeText={setFullName}
                                autoCapitalize="words"
                                selectionColor="#055FEE"
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Email address</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="name@example.com"
                                placeholderTextColor="rgba(255,255,255,0.5)"
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                                selectionColor="#055FEE"
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Password</Text>
                            <View style={styles.passwordContainer}>
                                <TextInput
                                    style={styles.passwordInput}
                                    placeholder="Create a password"
                                    placeholderTextColor="rgba(255,255,255,0.5)"
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!showPassword}
                                    selectionColor="#055FEE"
                                />
                                <TouchableOpacity 
                                    style={styles.eyeIcon} 
                                    onPress={() => setShowPassword(!showPassword)}
                                >
                                    <Ionicons 
                                        name={showPassword ? "eye-off-outline" : "eye-outline"} 
                                        size={22} 
                                        color="rgba(255,255,255,0.6)" 
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <Text style={styles.termsText}>
                            By signing up, you agree to our Terms of Service and Privacy Policy.
                        </Text>

                        <TouchableOpacity
                            style={styles.primaryButton}
                            activeOpacity={0.8}
                            onPress={handleSignUp}
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
                                    <Text style={styles.primaryButtonText}>Sign Up</Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>

                        <View style={styles.footer}>
                            <Text style={styles.footerText}>Already have an account? </Text>
                            <TouchableOpacity onPress={() => navigation.navigate('SignIn')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <Text style={styles.footerLink}>Sign In</Text>
                            </TouchableOpacity>
                        </View>
                    </BlurView>
                </ScrollView>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingTop: 60,
        paddingBottom: 40,
    },
    headerContainer: {
        marginBottom: 30,
    },
    headerTitle: {
        fontSize: 36,
        fontWeight: '800',
        color: '#FFFFFF',
        marginBottom: 8,
        letterSpacing: 0.5,
    },
    subtext: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.8)',
    },
    formContainer: {
        borderRadius: 24,
        padding: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    roleContainer: {
        flexDirection: 'row',
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 12,
        padding: 4,
        marginBottom: 24,
    },
    roleButton: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: 8,
    },
    roleButtonActive: {
        backgroundColor: '#055FEE',
        shadowColor: '#055FEE',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 3,
    },
    roleText: {
        fontWeight: '600',
        color: 'rgba(255,255,255,0.6)',
    },
    roleTextActive: {
        color: '#FFFFFF',
    },
    inputGroup: {
        marginBottom: 20,
    },
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
    passwordContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    passwordInput: {
        flex: 1,
        color: '#FFFFFF',
        paddingHorizontal: 16,
        paddingVertical: 16,
        fontSize: 16,
    },
    eyeIcon: {
        paddingHorizontal: 16,
    },
    termsText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 24,
        textAlign: 'center',
        lineHeight: 18,
    },
    primaryButton: {
        borderRadius: 16,
        overflow: 'hidden',
        elevation: 6,
        shadowColor: '#055FEE',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        marginBottom: 24,
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
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    footerText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
    },
    footerLink: {
        color: '#055FEE',
        fontWeight: 'bold',
        fontSize: 14,
    },
});
