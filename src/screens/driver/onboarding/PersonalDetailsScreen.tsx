import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuthStore } from '../../../store/authStore';
import { verificationService } from '../../../services/verificationService';

interface CountryItem {
    flag: string;
    code: string;
    dial: string;
    name: string;
}

const COUNTRIES: CountryItem[] = [
    { flag: '🇿🇼', code: 'ZW', dial: '263', name: 'Zimbabwe (+263)' },
    { flag: '🇿🇦', code: 'ZA', dial: '27', name: 'South Africa (+27)' },
    { flag: '🇧🇼', code: 'BW', dial: '267', name: 'Botswana (+267)' },
    { flag: '🇿🇲', code: 'ZM', dial: '260', name: 'Zambia (+260)' },
    { flag: '🇲🇿', code: 'MZ', dial: '258', name: 'Mozambique (+258)' },
    { flag: '🇬🇧', code: 'GB', dial: '44', name: 'United Kingdom (+44)' },
    { flag: '🇺🇸', code: 'US', dial: '1', name: 'United States (+1)' },
];

export const PersonalDetailsScreen = ({ navigation }: any) => {
    const { user } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [date, setDate] = useState(new Date(1995, 0, 1));
    
    const [selectedCountry, setSelectedCountry] = useState<CountryItem>(COUNTRIES[0]);
    const [showCountryModal, setShowCountryModal] = useState(false);
    
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

    const handleNext = async () => {
        if (!formData.date_of_birth || !formData.national_id_number || !formData.emergency_contact_name || !formData.emergency_contact_phone) {
            Alert.alert('Missing Fields', 'Please fill in all the details to proceed.');
            return;
        }

        const fullPhone = `+${selectedCountry.dial}${formData.emergency_contact_phone.replace(/^0+/, '')}`;

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
                                <TouchableOpacity 
                                    style={styles.countryPickerWrapper}
                                    onPress={() => setShowCountryModal(true)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.countryFlagText}>{selectedCountry.flag}</Text>
                                    <Text style={styles.callingCodeText}>+{selectedCountry.dial}</Text>
                                    <Ionicons name="chevron-down" size={14} color="#64748B" />
                                </TouchableOpacity>
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
                            colors={['#055FEE', '#5B99F2']}
                            style={styles.buttonGradient}
                        >
                            <Text style={styles.buttonText}>{loading ? 'Saving...' : 'Next Step'}</Text>
                            <Ionicons name="arrow-forward" size={20} color="#FFF" />
                        </LinearGradient>
                    </TouchableOpacity>
                </ScrollView>

                {/* Country Selection Modal */}
                <Modal
                    visible={showCountryModal}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setShowCountryModal(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalCard}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Select Country Code</Text>
                                <TouchableOpacity onPress={() => setShowCountryModal(false)}>
                                    <Ionicons name="close-circle" size={24} color="#94A3B8" />
                                </TouchableOpacity>
                            </View>
                            <ScrollView style={{ maxHeight: 300 }}>
                                {COUNTRIES.map((c) => (
                                    <TouchableOpacity
                                        key={c.code}
                                        style={[
                                            styles.countryItem,
                                            selectedCountry.code === c.code && styles.countryItemActive
                                        ]}
                                        onPress={() => {
                                            setSelectedCountry(c);
                                            setShowCountryModal(false);
                                        }}
                                    >
                                        <Text style={styles.countryItemFlag}>{c.flag}</Text>
                                        <Text style={styles.countryItemName}>{c.name}</Text>
                                        {selectedCountry.code === c.code && (
                                            <Ionicons name="checkmark" size={18} color="#055FEE" />
                                        )}
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
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
        paddingHorizontal: 16,
        height: 56,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    inputIcon: { marginRight: 12 },
    input: { flex: 1, fontSize: 16, color: '#1E293B' },
    
    phoneInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 16,
        height: 56,
        paddingHorizontal: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    countryPickerWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingRight: 10,
        marginRight: 10,
        borderRightWidth: 1,
        borderRightColor: '#E2E8F0',
        gap: 6,
    },
    countryFlagText: { fontSize: 20 },
    callingCodeText: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
    phoneInput: { flex: 1, fontSize: 16, color: '#1E293B' },
    
    nextButton: {
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#055FEE',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    buttonGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 56,
        gap: 8,
    },
    buttonText: { fontSize: 16, fontWeight: '700', color: '#FFF' },

    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalCard: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
    countryItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    countryItemActive: {
        backgroundColor: '#EFF6FF',
        borderRadius: 10,
    },
    countryItemFlag: { fontSize: 22, marginRight: 12 },
    countryItemName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1E293B' },
});
