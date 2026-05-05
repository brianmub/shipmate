import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, StatusBar, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as DocumentPicker from 'expo-document-picker';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../utils/supabase';

export const DriverOnboardingScreen = ({ navigation }: any) => {
    const { user } = useAuthStore();
    const [loading, setLoading] = useState(false);

    const [docLicense, setDocLicense] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
    const [docVehicleInfo, setDocVehicleInfo] = useState<DocumentPicker.DocumentPickerAsset | null>(null);

    const pickDocument = async (setDoc: React.Dispatch<React.SetStateAction<DocumentPicker.DocumentPickerAsset | null>>) => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'image/*'],
                copyToCacheDirectory: true,
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
                setDoc(result.assets[0]);
            }
        } catch (err) {
            console.error('Error picking document', err);
        }
    };

    const uploadFileToSupabase = async (file: DocumentPicker.DocumentPickerAsset, folderName: string) => {
        try {
            if (!user) return null;

            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}_${Date.now()}.${fileExt}`;
            const filePath = `${folderName}/${fileName}`;

            // Create form data (React Native style for Supabase storage upload)
            const formData = new FormData();
            formData.append('file', {
                uri: file.uri,
                name: file.name,
                type: file.mimeType || 'application/octet-stream',
            } as any);

            const { data, error } = await supabase.storage
                .from('driver_documents')
                .upload(filePath, formData);

            if (error) throw error;
            return data.path;
        } catch (error) {
            console.error('Upload Error:', error);
            throw error;
        }
    };

    const handleSubmit = async () => {
        if (!docLicense || !docVehicleInfo) {
            Alert.alert('Missing Documents', 'Please select both your Driver\'s License and Vehicle Information.');
            return;
        }

        setLoading(true);
        try {
            // Wait for both uploads to complete in the driver_documents bucket
            await uploadFileToSupabase(docLicense, 'licenses');
            await uploadFileToSupabase(docVehicleInfo, 'vehicles');

            // Optional: Update user metadata to mark documents as pending review
            const { error: updateError } = await supabase.auth.updateUser({
                data: { verification_status: 'pending' }
            });

            if (updateError) throw updateError;

            Alert.alert(
                'Documents Submitted',
                'Your profile is now pending verification by an admin. We will notify you once approved.',
                [{ text: 'OK', onPress: () => navigation.goBack() }]
            );
        } catch (error: any) {
            Alert.alert('Submission Error', error.message || 'Failed to upload documents. Please ensure the bucket is correctly configured.');
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
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
            <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>

                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Text style={styles.backButtonText}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Verification</Text>
                    <Text style={styles.subtext}>
                        Upload official documents to become an approved courier on the ShipMate network.
                    </Text>
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                    <BlurView intensity={20} tint="light" style={styles.formCard}>

                        {/* Driver License Section */}
                        <View style={styles.uploadSection}>
                            <View style={styles.sectionHeaderRow}>
                                <View style={styles.numberBadge}>
                                    <Text style={styles.numberText}>1</Text>
                                </View>
                                <Text style={styles.sectionTitle}>Driver's License</Text>
                            </View>
                            <Text style={styles.label}>Upload a clear image or PDF of your valid driver's license.</Text>

                            <TouchableOpacity
                                style={[styles.uploadButton, docLicense && styles.uploadButtonSuccess]}
                                activeOpacity={0.8}
                                onPress={() => pickDocument(setDocLicense)}
                            >
                                <Text style={[styles.uploadIcon, docLicense && styles.uploadIconSuccess]}>
                                    {docLicense ? '✅' : '📄'}
                                </Text>
                                <Text style={[styles.uploadText, docLicense && styles.uploadTextSuccess]}>
                                    {docLicense ? docLicense.name : 'Tap to select License file'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.divider} />

                        {/* Vehicle Registration Section */}
                        <View style={styles.uploadSection}>
                            <View style={styles.sectionHeaderRow}>
                                <View style={styles.numberBadge}>
                                    <Text style={styles.numberText}>2</Text>
                                </View>
                                <Text style={styles.sectionTitle}>Vehicle Registration</Text>
                            </View>
                            <Text style={styles.label}>Upload proof of the vehicle you will be using for deliveries.</Text>

                            <TouchableOpacity
                                style={[styles.uploadButton, docVehicleInfo && styles.uploadButtonSuccess]}
                                activeOpacity={0.8}
                                onPress={() => pickDocument(setDocVehicleInfo)}
                            >
                                <Text style={[styles.uploadIcon, docVehicleInfo && styles.uploadIconSuccess]}>
                                    {docVehicleInfo ? '✅' : '🚗'}
                                </Text>
                                <Text style={[styles.uploadText, docVehicleInfo && styles.uploadTextSuccess]}>
                                    {docVehicleInfo ? docVehicleInfo.name : 'Tap to select Vehicle Info'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                    </BlurView>

                    <TouchableOpacity
                        style={styles.submitButtonContainer}
                        activeOpacity={0.8}
                        onPress={handleSubmit}
                        disabled={loading}
                    >
                        <LinearGradient
                            colors={['#34A853', '#2E9348']}
                            style={styles.submitGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                        >
                            {loading ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <Text style={styles.submitButtonText}>Submit for Verification</Text>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>

                </ScrollView>
            </SafeAreaView>
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
    header: {
        paddingHorizontal: 24,
        paddingTop: Platform.OS === 'android' ? 20 : 10,
        marginBottom: 24,
    },
    backButton: {
        paddingVertical: 8,
        paddingRight: 16,
        marginBottom: 16,
        alignSelf: 'flex-start',
    },
    backButtonText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 16,
        fontWeight: '600',
    },
    headerTitle: {
        fontSize: 32,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: -0.5,
        marginBottom: 8,
    },
    subtext: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.7)',
        lineHeight: 22,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingBottom: 40,
    },
    formCard: {
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        marginBottom: 32,
        overflow: 'hidden',
    },
    uploadSection: {
        marginBottom: 8,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    numberBadge: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    numberText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 12,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    label: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 20,
        lineHeight: 20,
    },
    uploadButton: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 100,
    },
    uploadButtonSuccess: {
        borderColor: 'rgba(52, 168, 83, 0.5)',
        backgroundColor: 'rgba(52, 168, 83, 0.1)',
        borderStyle: 'solid',
    },
    uploadIcon: {
        fontSize: 24,
        marginBottom: 8,
        opacity: 0.8,
    },
    uploadIconSuccess: {
        opacity: 1,
    },
    uploadText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        fontWeight: '500',
        textAlign: 'center',
        paddingHorizontal: 16,
    },
    uploadTextSuccess: {
        color: '#4ADE80',
        fontWeight: '600',
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginVertical: 24,
    },
    submitButtonContainer: {
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#34A853',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    submitGradient: {
        paddingVertical: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    submitButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
});
