import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../store/authStore';
import { verificationService } from '../../../services/verificationService';

export const VehiclePhotosScreen = ({ navigation }: any) => {
    const { user } = useAuthStore();
    const [uploading, setUploading] = useState<string | null>(null);
    const [photos, setPhotos] = useState<any>({
        photo_front_url: null,
        photo_back_url: null,
        photo_left_url: null,
        photo_right_url: null,
    });

    const handleUpload = async (type: string) => {
        try {
            const asset = await verificationService.pickImage(true); // Suggest camera for vehicle photos
            if (!asset || !user) return;

            setUploading(type);
            const path = `drivers/${user.id}/vehicle_${type}.jpg`;
            const publicUrl = await verificationService.uploadImage(asset.uri, path);
            
            await verificationService.saveVehicleInfo(user.id, { [type]: publicUrl });
            
            setPhotos({ ...photos, [type]: publicUrl });
            Alert.alert('Success', 'Vehicle photo uploaded');
        } catch (error: any) {
            Alert.alert('Upload Error', error.message);
        } finally {
            setUploading(null);
        }
    };

    const isComplete = photos.photo_front_url && photos.photo_back_url && photos.photo_left_url && photos.photo_right_url;

    const handleSubmit = async () => {
        Alert.alert(
            "Application Submitted",
            "Your driver application is now under review. We will notify you once approved!",
            [{ text: "Great!", onPress: () => navigation.navigate('Home') }]
        );
    };

    return (
        <LinearGradient colors={['#F8FAFC', '#E2E8F0']} style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                            <Ionicons name="arrow-back" size={24} color="#0F172A" />
                        </TouchableOpacity>
                        <Text style={styles.title}>Vehicle Photos</Text>
                        <Text style={styles.subtitle}>Step 4 of 4: Show us your vehicle</Text>
                    </View>

                    <View style={styles.grid}>
                        <PhotoCard label="Front View" value={photos.photo_front_url} loading={uploading === 'photo_front_url'} onPress={() => handleUpload('photo_front_url')} />
                        <PhotoCard label="Back View" value={photos.photo_back_url} loading={uploading === 'photo_back_url'} onPress={() => handleUpload('photo_back_url')} />
                    </View>
                    <View style={[styles.grid, { marginTop: 16 }]}>
                        <PhotoCard label="Left Side" value={photos.photo_left_url} loading={uploading === 'photo_left_url'} onPress={() => handleUpload('photo_left_url')} />
                        <PhotoCard label="Right Side" value={photos.photo_right_url} loading={uploading === 'photo_right_url'} onPress={() => handleUpload('photo_right_url')} />
                    </View>

                    <TouchableOpacity 
                        style={[styles.submitButton, !isComplete && styles.disabledBtn]} 
                        onPress={handleSubmit}
                        disabled={!isComplete}
                    >
                        <LinearGradient
                            colors={isComplete ? ['#055FEE', '#5B99F2'] : ['#94A3B8', '#64748B']}
                            style={styles.buttonGradient}
                        >
                            <Text style={styles.buttonText}>Submit Application</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </ScrollView>
            </SafeAreaView>
        </LinearGradient>
    );
};

const PhotoCard = ({ label, value, loading, onPress }: any) => (
    <TouchableOpacity style={styles.card} onPress={onPress} disabled={loading}>
        {loading ? (
            <ActivityIndicator color="#055FEE" />
        ) : value ? (
            <View style={styles.completedCard}>
                <Ionicons name="image" size={32} color="#055FEE" />
                <Text style={styles.cardLabel}>{label}</Text>
            </View>
        ) : (
            <View style={styles.emptyCard}>
                <Ionicons name="camera-outline" size={32} color="#64748B" />
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
    grid: { flexDirection: 'row', gap: 16 },
    card: { flex: 1, height: 140, backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
    completedCard: { alignItems: 'center', gap: 8 },
    emptyCard: { alignItems: 'center', gap: 8 },
    cardLabel: { fontSize: 14, fontWeight: '600', color: '#475569' },
    submitButton: { borderRadius: 16, overflow: 'hidden', elevation: 4, marginTop: 40 },
    disabledBtn: { opacity: 0.7 },
    buttonGradient: { paddingVertical: 18, justifyContent: 'center', alignItems: 'center' },
    buttonText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
});
