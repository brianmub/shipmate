import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../store/authStore';
import { verificationService } from '../../../services/verificationService';

export const DocumentUploadScreen = ({ navigation }: any) => {
    const { user } = useAuthStore();
    const [uploading, setUploading] = useState<string | null>(null);
    const [docs, setDocs] = useState<any>({
        national_id_front: null,
        national_id_back: null,
        license_front: null,
        license_back: null,
    });

    const handleUpload = async (type: string) => {
        try {
            const asset = await verificationService.pickImage(false);
            if (!asset || !user) return;

            setUploading(type);
            const path = `drivers/${user.id}/${type}.jpg`;
            const publicUrl = await verificationService.uploadImage(asset.uri, path);
            
            await verificationService.saveDocument(user.id, type as any, publicUrl);
            
            setDocs({ ...docs, [type]: publicUrl });
            Alert.alert('Success', 'Document uploaded successfully');
        } catch (error: any) {
            Alert.alert('Upload Error', error.message);
        } finally {
            setUploading(null);
        }
    };

    const isComplete = docs.national_id_front && docs.national_id_back && docs.license_front && docs.license_back;

    return (
        <LinearGradient colors={['#F8FAFC', '#E2E8F0']} style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                            <Ionicons name="arrow-back" size={24} color="#0F172A" />
                        </TouchableOpacity>
                        <Text style={styles.title}>Documents</Text>
                        <Text style={styles.subtitle}>Step 2 of 4: Upload your verification documents</Text>
                    </View>

                    <View style={styles.uploadSection}>
                        <Text style={styles.sectionTitle}>National ID</Text>
                        <View style={styles.grid}>
                            <UploadCard 
                                label="ID Front" 
                                value={docs.national_id_front} 
                                loading={uploading === 'national_id_front'} 
                                onPress={() => handleUpload('national_id_front')} 
                            />
                            <UploadCard 
                                label="ID Back" 
                                value={docs.national_id_back} 
                                loading={uploading === 'national_id_back'} 
                                onPress={() => handleUpload('national_id_back')} 
                            />
                        </View>
                    </View>

                    <View style={styles.uploadSection}>
                        <Text style={styles.sectionTitle}>Driver's License</Text>
                        <View style={styles.grid}>
                            <UploadCard 
                                label="License Front" 
                                value={docs.license_front} 
                                loading={uploading === 'license_front'} 
                                onPress={() => handleUpload('license_front')} 
                            />
                            <UploadCard 
                                label="License Back" 
                                value={docs.license_back} 
                                loading={uploading === 'license_back'} 
                                onPress={() => handleUpload('license_back')} 
                            />
                        </View>
                    </View>

                    <TouchableOpacity 
                        style={[styles.nextButton, !isComplete && styles.disabledBtn]} 
                        onPress={() => isComplete && navigation.navigate('VehicleDetails')}
                        disabled={!isComplete}
                    >
                        <LinearGradient
                            colors={isComplete ? ['#34A853', '#2E9348'] : ['#94A3B8', '#64748B']}
                            style={styles.buttonGradient}
                        >
                            <Text style={styles.buttonText}>Next Step</Text>
                            <Ionicons name="arrow-forward" size={20} color="#FFF" />
                        </LinearGradient>
                    </TouchableOpacity>
                </ScrollView>
            </SafeAreaView>
        </LinearGradient>
    );
};

const UploadCard = ({ label, value, loading, onPress }: any) => (
    <TouchableOpacity style={styles.card} onPress={onPress} disabled={loading}>
        {loading ? (
            <ActivityIndicator color="#34A853" />
        ) : value ? (
            <View style={styles.completedCard}>
                <Ionicons name="checkmark-circle" size={32} color="#34A853" />
                <Text style={styles.cardLabel}>{label}</Text>
            </View>
        ) : (
            <View style={styles.emptyCard}>
                <Ionicons name="cloud-upload-outline" size={32} color="#64748B" />
                <Text style={styles.cardLabel}>{label}</Text>
            </View>
        )}
    </TouchableOpacity>
);

const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    scrollContent: { padding: 24 },
    header: { marginBottom: 32 },
    backBtn: { marginBottom: 16 },
    title: { fontSize: 28, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#64748B' },
    uploadSection: { marginBottom: 32 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 16 },
    grid: { flexDirection: 'row', gap: 16 },
    card: { flex: 1, height: 120, backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
    completedCard: { alignItems: 'center', gap: 8 },
    emptyCard: { alignItems: 'center', gap: 8 },
    cardLabel: { fontSize: 14, fontWeight: '600', color: '#475569' },
    nextButton: { borderRadius: 16, overflow: 'hidden', elevation: 4, marginTop: 20 },
    disabledBtn: { opacity: 0.7 },
    buttonGradient: { paddingVertical: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
    buttonText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
});
