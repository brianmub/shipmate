import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../store/authStore';
import { verificationService } from '../../../services/verificationService';

export const PersonalDetailsScreen = ({ navigation }: any) => {
    const { user } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        date_of_birth: '',
        national_id_number: '',
        emergency_contact_name: '',
        emergency_contact_phone: '',
    });

    const handleNext = async () => {
        if (!formData.date_of_birth || !formData.national_id_number || !formData.emergency_contact_name || !formData.emergency_contact_phone) {
            Alert.alert('Missing Fields', 'Please fill in all the details to proceed.');
            return;
        }

        try {
            setLoading(true);
            if (user) {
                await verificationService.updateDriverDetails(user.id, formData);
                navigation.navigate('DocumentUpload');
            }
        } catch (error: any) {
            Alert.alert('Error', error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <LinearGradient colors={['#F8FAFC', '#E2E8F0']} style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Personal Details</Text>
                        <Text style={styles.subtitle}>Step 1 of 4: Tell us about yourself</Text>
                    </View>

                    <View style={styles.form}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Date of Birth (YYYY-MM-DD)</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="1990-01-01"
                                value={formData.date_of_birth}
                                onChangeText={(text) => setFormData({ ...formData, date_of_birth: text })}
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>National ID Number</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="ID-123456789"
                                value={formData.national_id_number}
                                onChangeText={(text) => setFormData({ ...formData, national_id_number: text })}
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Emergency Contact Name</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="John Doe"
                                value={formData.emergency_contact_name}
                                onChangeText={(text) => setFormData({ ...formData, emergency_contact_name: text })}
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Emergency Contact Phone</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="+263 7XX XXX XXX"
                                keyboardType="phone-pad"
                                value={formData.emergency_contact_phone}
                                onChangeText={(text) => setFormData({ ...formData, emergency_contact_phone: text })}
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
    title: { fontSize: 28, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#64748B' },
    form: { gap: 20, marginBottom: 40 },
    inputGroup: { gap: 8 },
    label: { fontSize: 14, fontWeight: '600', color: '#475569' },
    input: {
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        color: '#1E293B',
    },
    nextButton: { borderRadius: 16, overflow: 'hidden', elevation: 4, shadowColor: '#055FEE', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
    buttonGradient: { paddingVertical: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
    buttonText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
});
