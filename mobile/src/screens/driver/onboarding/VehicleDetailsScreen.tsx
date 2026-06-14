import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../store/authStore';
import { verificationService } from '../../../services/verificationService';

export const VehicleDetailsScreen = ({ navigation }: any) => {
    const { user } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [vehicle, setVehicle] = useState({
        vehicle_type: 'motorcycle',
        make: '',
        model: '',
        year: '',
        color: '',
        license_plate: '',
    });

    const handleNext = async () => {
        if (!vehicle.make || !vehicle.model || !vehicle.license_plate) {
            Alert.alert('Missing Fields', 'Please fill in the essential vehicle details.');
            return;
        }

        try {
            setLoading(true);
            if (user) {
                await verificationService.saveVehicleInfo(user.id, {
                    ...vehicle,
                    year: parseInt(vehicle.year) || null
                });
                navigation.navigate('VehiclePhotos');
            }
        } catch (error: any) {
            Alert.alert('Error', error.message);
        } finally {
            setLoading(false);
        }
    };

    const types = [
        { id: 'motorcycle', icon: 'bicycle', label: 'Motorcycle' },
        { id: 'car', icon: 'car', label: 'Car' },
        { id: 'van', icon: 'bus', label: 'Van' },
    ];

    return (
        <LinearGradient colors={['#F8FAFC', '#E2E8F0']} style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                            <Ionicons name="arrow-back" size={24} color="#0F172A" />
                        </TouchableOpacity>
                        <Text style={styles.title}>Vehicle Info</Text>
                        <Text style={styles.subtitle}>Step 3 of 4: Register your vehicle</Text>
                    </View>

                    <Text style={styles.sectionTitle}>Select Vehicle Type</Text>
                    <View style={styles.typeGrid}>
                        {types.map((type) => (
                            <TouchableOpacity 
                                key={type.id} 
                                style={[styles.typeCard, vehicle.vehicle_type === type.id && styles.activeType]}
                                onPress={() => setVehicle({ ...vehicle, vehicle_type: type.id })}
                            >
                                <Ionicons 
                                    name={type.icon as any} 
                                    size={32} 
                                    color={vehicle.vehicle_type === type.id ? '#055FEE' : '#64748B'} 
                                />
                                <Text style={[styles.typeLabel, vehicle.vehicle_type === type.id && styles.activeTypeLabel]}>
                                    {type.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View style={styles.form}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Make (e.g. Honda, Toyota)</Text>
                            <TextInput
                                style={styles.input}
                                value={vehicle.make}
                                onChangeText={(text) => setVehicle({ ...vehicle, make: text })}
                            />
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Model (e.g. Fit, CG125)</Text>
                            <TextInput
                                style={styles.input}
                                value={vehicle.model}
                                onChangeText={(text) => setVehicle({ ...vehicle, model: text })}
                            />
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>License Plate</Text>
                            <TextInput
                                style={styles.input}
                                autoCapitalize="characters"
                                value={vehicle.license_plate}
                                onChangeText={(text) => setVehicle({ ...vehicle, license_plate: text })}
                            />
                        </View>
                    </View>

                    <TouchableOpacity 
                        style={styles.nextButton} 
                        onPress={handleNext}
                        disabled={loading}
                    >
                        <LinearGradient
                            colors={['#055FEE', '#5B99F2']}
                            style={styles.buttonGradient}
                        >
                            <Text style={styles.buttonText}>{loading ? 'Saving...' : 'Next Step'}</Text>
                            <Ionicons name="arrow-forward" size={20} color="#FFF" />
                        </LinearGradient>
                    </TouchableOpacity>
                </ScrollView>
            </SafeAreaView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    scrollContent: { padding: 24 },
    header: { marginBottom: 32 },
    backBtn: { marginBottom: 16 },
    title: { fontSize: 28, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#64748B' },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 16 },
    typeGrid: { flexDirection: 'row', gap: 12, marginBottom: 32 },
    typeCard: { flex: 1, height: 100, backgroundColor: '#FFF', borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
    activeType: { borderColor: '#055FEE', backgroundColor: 'rgba(5, 95, 238, 0.05)' },
    typeLabel: { fontSize: 12, fontWeight: '600', color: '#64748B', marginTop: 8 },
    activeTypeLabel: { color: '#055FEE' },
    form: { gap: 20, marginBottom: 40 },
    inputGroup: { gap: 8 },
    label: { fontSize: 14, fontWeight: '600', color: '#475569' },
    input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 16, fontSize: 16 },
    nextButton: { borderRadius: 16, overflow: 'hidden', elevation: 4 },
    buttonGradient: { paddingVertical: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
    buttonText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
});
