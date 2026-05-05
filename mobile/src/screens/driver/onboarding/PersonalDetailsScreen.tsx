import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import CountryPicker, { CountryCode, Country } from 'react-native-country-picker-modal';
import { useAuthStore } from '../../../store/authStore';
import { verificationService } from '../../../services/verificationService';

export const PersonalDetailsScreen = ({ navigation }: any) => {
    const { user } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [date, setDate] = useState(new Date(1995, 0, 1));
    
    const [countryCode, setCountryCode] = useState<CountryCode>('ZW');
    const [callingCode, setCallingCode] = useState('263');
    
    const [formData, setFormData] = useState({
        date_of_birth: '1995-01-01',
        national_id_number: '',
        emergency_contact_name: '',
        emergency_contact_phone: '',
    });

    const onDateChange = (event: any, selectedDate?: Date) => {
        setShowDatePicker(false);
        if (selectedDate) {
            setDate(selectedDate);
            const formattedDate = selectedDate.toISOString().split('T')[0];
            setFormData({ ...formData, date_of_birth: formattedDate });
        }
    };

    const onSelectCountry = (country: Country) => {
        setCountryCode(country.cca2);
        setCallingCode(country.callingCode[0]);
    };

    const handleNext = async () => {
        if (!formData.date_of_birth || !formData.national_id_number || !formData.emergency_contact_name || !formData.emergency_contact_phone) {
            Alert.alert('Missing Fields', 'Please fill in all the details to proceed.');
            return;
        }

        const fullPhone = `+${callingCode}${formData.emergency_contact_phone.replace(/^0+/, '')}`;

        try {
            setLoading(true);
            if (user) {
                await verificationService.updateDriverDetails(user.id, {
                    ...formData,
                    emergency_contact_phone: fullPhone
                });
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
                            <Text style={styles.label}>Date of Birth</Text>
                            <TouchableOpacity 
                                style={styles.dateSelector} 
                                onPress={() => setShowDatePicker(true)}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="calendar-outline" size={20} color="#64748B" />
                                <Text style={styles.dateText}>
                                    {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </Text>
                            </TouchableOpacity>
                            
                            {showDatePicker && (
                                <DateTimePicker
                                    value={date}
                                    mode="date"
                                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                    onChange={onDateChange}
                                    maximumDate={new Date(2007, 11, 31)} // Must be at least 18
                                />
                            )}
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>National ID Number</Text>
                            <View style={styles.inputWrapper}>
                                <Ionicons name="card-outline" size={20} color="#64748B" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="ID-123456789"
                                    value={formData.national_id_number}
                                    onChangeText={(text) => setFormData({ ...formData, national_id_number: text })}
                                />
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Emergency Contact Name</Text>
                            <View style={styles.inputWrapper}>
                                <Ionicons name="person-outline" size={20} color="#64748B" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Full Name"
                                    value={formData.emergency_contact_name}
                                    onChangeText={(text) => setFormData({ ...formData, emergency_contact_name: text })}
                                />
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Emergency Contact Phone</Text>
                            <View style={styles.phoneInputContainer}>
                                <View style={styles.countryPickerWrapper}>
                                    <CountryPicker
                                        countryCode={countryCode}
                                        withFilter
                                        withFlag
                                        withCallingCode
                                        withCallingCodeButton
                                        onSelect={onSelectCountry}
                                        containerStyle={styles.countryPicker}
                                    />
                                    <Ionicons name="chevron-down" size={14} color="#64748B" />
                                </View>
                                <TextInput
                                    style={styles.phoneInput}
                                    placeholder="771234567"
                                    keyboardType="phone-pad"
                                    value={formData.emergency_contact_phone}
                                    onChangeText={(text) => setFormData({ ...formData, emergency_contact_phone: text })}
                                />
                            </View>
                        </View>
                    </View>

                    <TouchableOpacity 
                        style={styles.nextButton} 
                        onPress={handleNext}
                        disabled={loading}
                    >
                        <LinearGradient
                            colors={['#34A853', '#2E9348']}
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
    title: { fontSize: 32, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#64748B' },
    form: { gap: 24, marginBottom: 40 },
    inputGroup: { gap: 8 },
    label: { fontSize: 14, fontWeight: '700', color: '#475569', marginLeft: 4 },
    
    dateSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 16,
        padding: 16,
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    dateText: { fontSize: 16, color: '#1E293B', fontWeight: '500' },
    
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 16,
        paddingLeft: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    inputIcon: { marginRight: 12 },
    input: { flex: 1, paddingVertical: 16, paddingRight: 16, fontSize: 16, color: '#1E293B' },
    
    phoneInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    countryPickerWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    countryPicker: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    phoneInput: {
        flex: 1,
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 16,
        padding: 16,
        fontSize: 16,
        color: '#1E293B',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    
    nextButton: { borderRadius: 16, overflow: 'hidden', elevation: 8, shadowColor: '#34A853', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12 },
    buttonGradient: { paddingVertical: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
    buttonText: { color: '#FFF', fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },
});
