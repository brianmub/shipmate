import React, { useState, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Animated } from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../utils/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

export const SignUpScreen = ({ navigation }: any) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [fullName, setFullName] = useState('');
    const [role, setRoleSelection] = useState<'customer' | 'driver'>('customer');
    const [loading, setLoading] = useState(false);

    const toggleAnim = useRef(new Animated.Value(0)).current;

    const { setSession, setRole, setUser } = useAuthStore();

    const handleRoleChange = (newRole: 'customer' | 'driver') => {
        setRoleSelection(newRole);
        Animated.spring(toggleAnim, {
            toValue: newRole === 'customer' ? 0 : 1,
            useNativeDriver: false,
            friction: 8,
            tension: 50,
        }).start();
    };

    const getPasswordStrength = () => {
        if (!password) return { label: '', color: 'transparent', width: '0%' };
        if (password.length < 6) return { label: 'Weak', color: '#EF4444', width: '30%' };
        if (password.length < 10) return { label: 'Medium', color: '#F59E0B', width: '60%' };
        return { label: 'Strong', color: '#055FEE', width: '100%' };
    };

    const strength = getPasswordStrength();

    const handleSignUp = async () => {
        if (!email || !password || !fullName || !confirmPassword) {
            Alert.alert('Error', 'Please fill in all fields');
            return;
        }

        if (password !== confirmPassword) {
            Alert.alert('Error', 'Passwords do not match');
            return;
        }

        if (password.length < 6) {
            Alert.alert('Error', 'Password must be at least 6 characters');
            return;
        }

        setLoading(true);
        try {
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

            if (error) throw error;

            if (data.session) {
                setRole(role);
                setSession(data.session);
                setUser(data.user);
            } else {
                Alert.alert(
                    'Check your email',
                    'We sent you a confirmation link. Please check your inbox before signing in.',
                    [{ text: 'OK', onPress: () => navigation.navigate('SignIn') }]
                );
            }
        } catch (error: any) {
            Alert.alert('Sign Up Error', error.message);
        } finally {
            setLoading(false);
        }
    };

    const translateX = toggleAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [4, 150], // Adjust based on button width
    });

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
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                    <View style={styles.headerContainer}>
                        <Text style={styles.headerTitle}>Create Account</Text>
                        <Text style={styles.subtext}>Choose your role and join ShipMate</Text>
                    </View>

                    <BlurView intensity={20} tint="light" style={styles.formContainer}>
                        
                        <View style={styles.roleToggleWrapper}>
                            <Animated.View style={[styles.activeRoleBg, { transform: [{ translateX }] }]} />
                            <TouchableOpacity
                                style={styles.roleBtn}
                                onPress={() => handleRoleChange('customer')}
                                activeOpacity={1}
                            >
                                <Text style={[styles.roleBtnText, role === 'customer' && styles.activeRoleText]}>Customer</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.roleBtn}
                                onPress={() => handleRoleChange('driver')}
                                activeOpacity={1}
                            >
                                <Text style={[styles.roleBtnText, role === 'driver' && styles.activeRoleText]}>Driver</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Full Name</Text>
                            <View style={styles.inputWrapper}>
                                <Ionicons name="person-outline" size={20} color="rgba(255,255,255,0.5)" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="John Doe"
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    value={fullName}
                                    onChangeText={setFullName}
                                />
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Email Address</Text>
                            <View style={styles.inputWrapper}>
                                <Ionicons name="mail-outline" size={20} color="rgba(255,255,255,0.5)" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="name@example.com"
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    value={email}
                                    onChangeText={setEmail}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                />
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Password</Text>
                            <View style={styles.inputWrapper}>
                                <Ionicons name="lock-closed-outline" size={20} color="rgba(255,255,255,0.5)" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Minimum 6 characters"
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!showPassword}
                                />
                                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="rgba(255,255,255,0.5)" />
                                </TouchableOpacity>
                            </View>
                            
                            {password.length > 0 && (
                                <View style={styles.strengthWrapper}>
                                    <View style={styles.strengthBarContainer}>
                                        <View style={[styles.strengthBar, { width: strength.width as any, backgroundColor: strength.color }]} />
                                    </View>
                                    <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
                                </View>
                            )}
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Confirm Password</Text>
                            <View style={styles.inputWrapper}>
                                <Ionicons name="lock-closed-outline" size={20} color="rgba(255,255,255,0.5)" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Re-type password"
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    secureTextEntry={!showPassword}
                                />
                            </View>
                        </View>

                        <TouchableOpacity
                            style={styles.primaryButton}
                            onPress={handleSignUp}
                            disabled={loading}
                        >
                            <LinearGradient
                                colors={['#055FEE', '#5B99F2']}
                                style={styles.gradientButton}
                            >
                                {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Create Account</Text>}
                            </LinearGradient>
                        </TouchableOpacity>

                        <View style={styles.footer}>
                            <Text style={styles.footerText}>Already have an account? </Text>
                            <TouchableOpacity onPress={() => navigation.navigate('SignIn')}>
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
    container: { flex: 1 },
    keyboardView: { flex: 1 },
    scrollContent: { paddingHorizontal: 24, paddingVertical: 60 },
    headerContainer: { marginBottom: 32 },
    headerTitle: { fontSize: 36, fontWeight: '800', color: '#FFF', marginBottom: 8 },
    subtext: { fontSize: 16, color: 'rgba(255,255,255,0.7)' },
    formContainer: { borderRadius: 32, padding: 24, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    
    roleToggleWrapper: {
        flexDirection: 'row',
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 20,
        height: 56,
        padding: 4,
        marginBottom: 32,
        position: 'relative',
    },
    activeRoleBg: {
        position: 'absolute',
        top: 4,
        left: 0,
        width: 146, // Approximately half of the width minus padding
        height: 48,
        backgroundColor: '#055FEE',
        borderRadius: 16,
    },
    roleBtn: { flex: 1, justifyContent: 'center', alignItems: 'center', zIndex: 1 },
    roleBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '700' },
    activeRoleText: { color: '#FFF' },

    inputGroup: { marginBottom: 20 },
    label: { fontSize: 14, fontWeight: '700', color: '#FFF', marginBottom: 8, marginLeft: 4 },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 60,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    inputIcon: { marginRight: 12 },
    input: { flex: 1, color: '#FFF', fontSize: 16 },
    
    strengthWrapper: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 10 },
    strengthBarContainer: { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2 },
    strengthBar: { height: '100%', borderRadius: 2 },
    strengthLabel: { fontSize: 12, fontWeight: '700', width: 50 },

    primaryButton: { borderRadius: 20, overflow: 'hidden', marginTop: 12, elevation: 8, shadowColor: '#055FEE', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12 },
    gradientButton: { height: 64, justifyContent: 'center', alignItems: 'center' },
    buttonText: { color: '#FFF', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
    
    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
    footerText: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
    footerLink: { color: '#055FEE', fontWeight: '800', fontSize: 14 },
});
