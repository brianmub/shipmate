import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, StatusBar, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '../../utils/supabase';
import { useAuthStore } from '../../store/authStore';

export const DriverSecurityCheckScreen = ({ navigation }: any) => {
    const { user } = useAuthStore();
    const [permission, requestPermission] = useCameraPermissions();
    const [isVerifying, setIsVerifying] = useState(false);
    const [status, setStatus] = useState<'idle' | 'scanning' | 'success'>('idle');
    const cameraRef = useRef<any>(null);

    if (!permission) {
        // Camera permissions are still loading.
        return <View style={styles.centerContainer}><ActivityIndicator size="large" color="#055FEE" /></View>;
    }

    if (!permission.granted) {
        // Camera permissions are not granted yet.
        return (
            <View style={styles.container}>
                <Text style={styles.message}>We need your permission to show the camera</Text>
                <TouchableOpacity onPress={requestPermission} style={styles.permissionBtn}>
                    <Text style={styles.permissionBtnText}>Grant Permission</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const handleVerify = async () => {
        setIsVerifying(true);
        setStatus('scanning');

        // 1. Take a picture (Simulated)
        // In a real app, we would send this to an AI face-match API (e.g. AWS Rekognition)
        setTimeout(async () => {
            try {
                // 2. Update the driver's verification status in the database
                const { error } = await supabase
                    .from('drivers')
                    .update({
                        is_identity_verified: true,
                        last_verification_at: new Date().toISOString()
                    })
                    .eq('id', user?.id);

                if (error) throw error;

                setStatus('success');
                setTimeout(() => {
                    Alert.alert(
                        "Identity Verified",
                        "Security check passed. You are now authorized for today's deliveries.",
                        [{ text: "Continue", onPress: () => navigation.replace('DriverHome') }]
                    );
                }, 1000);
            } catch (error: any) {
                Alert.alert("Verification Failed", error.message);
                setStatus('idle');
            } finally {
                setIsVerifying(false);
            }
        }, 3000); // 3 second "AI scanning" simulation
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
            
            <CameraView style={styles.camera} facing="front">
                <View style={styles.overlay}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Identity Check</Text>
                        <Text style={styles.subtitle}>Position your face in the frame</Text>
                    </View>

                    <View style={styles.scanContainer}>
                        <View style={[styles.scanFrame, status === 'scanning' && styles.scanningFrame]}>
                            {status === 'scanning' && (
                                <View style={styles.scanLine} />
                            )}
                        </View>
                    </View>

                    <BlurView intensity={20} tint="dark" style={styles.footer}>
                        <Text style={styles.instructionText}>
                            {status === 'idle' ? 'Ensure your face is clearly visible' :
                             status === 'scanning' ? 'Verifying with AI Face-Match...' :
                             'Security Clearance Granted'}
                        </Text>
                        
                        {status === 'idle' && (
                            <TouchableOpacity 
                                style={styles.verifyBtnContainer}
                                onPress={handleVerify}
                                disabled={isVerifying}
                            >
                                <LinearGradient
                                    colors={['#055FEE', '#5B99F2']}
                                    style={styles.verifyBtn}
                                >
                                    <Text style={styles.verifyBtnText}>Verify My Identity</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        )}

                        {status === 'scanning' && (
                            <ActivityIndicator size="large" color="#FFFFFF" style={{ marginTop: 20 }} />
                        )}

                        {status === 'success' && (
                            <View style={styles.successIcon}>
                                <Text style={{ fontSize: 40 }}>✅</Text>
                            </View>
                        )}
                    </BlurView>
                </View>
            </CameraView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    camera: {
        flex: 1,
    },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'space-between',
        paddingVertical: 60,
    },
    header: {
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    title: {
        fontSize: 28,
        fontWeight: '900',
        color: '#FFFFFF',
        letterSpacing: 1,
    },
    subtitle: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.7)',
        marginTop: 8,
    },
    scanContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scanFrame: {
        width: 280,
        height: 280,
        borderRadius: 140,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.5)',
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    scanningFrame: {
        borderColor: '#055FEE',
        borderStyle: 'solid',
        borderWidth: 4,
    },
    scanLine: {
        width: '100%',
        height: 4,
        backgroundColor: '#055FEE',
        position: 'absolute',
        top: 0,
        shadowColor: '#055FEE',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 1,
        shadowRadius: 20,
    },
    footer: {
        marginHorizontal: 32,
        borderRadius: 32,
        padding: 32,
        alignItems: 'center',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    instructionText: {
        fontSize: 16,
        color: '#FFFFFF',
        textAlign: 'center',
        fontWeight: '600',
    },
    verifyBtnContainer: {
        marginTop: 24,
        width: '100%',
        borderRadius: 16,
        overflow: 'hidden',
    },
    verifyBtn: {
        paddingVertical: 18,
        alignItems: 'center',
    },
    verifyBtnText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0F172A',
    },
    permissionBtn: {
        backgroundColor: '#055FEE',
        padding: 16,
        borderRadius: 12,
        marginTop: 20,
    },
    permissionBtnText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
    message: {
        color: '#FFFFFF',
        textAlign: 'center',
        fontSize: 16,
        paddingHorizontal: 40,
    },
    successIcon: {
        marginTop: 20,
    }
});
