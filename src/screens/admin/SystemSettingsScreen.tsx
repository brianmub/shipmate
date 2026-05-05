import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { settingsService } from '../../services/settingsService';

export const SystemSettingsScreen = () => {
    const [settings, setSettings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const data = await settingsService.getSettings();
            setSettings(data);
        } catch (error: any) {
            Alert.alert('Error', error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const handleUpdate = async (key: string, newValue: string) => {
        try {
            setSaving(key);
            await settingsService.updateSetting(key, newValue);
            setSettings(settings.map(s => s.key === key ? { ...s, value: newValue } : s));
        } catch (error: any) {
            Alert.alert('Update Failed', error.message);
        } finally {
            setSaving(null);
        }
    };

    if (loading) {
        return <View style={styles.center}><ActivityIndicator color="#34A853" /></View>;
    }

    return (
        <View style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <Text style={styles.title}>System Settings</Text>
                    <TouchableOpacity onPress={fetchSettings}>
                        <Ionicons name="refresh" size={20} color="#34A853" />
                    </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={styles.content}>
                    <Text style={styles.subtitle}>Configure global platform variables</Text>

                    {settings.map((item) => (
                        <View key={item.key} style={styles.settingCard}>
                            <View style={styles.cardHeader}>
                                <Text style={styles.label}>{item.key.replace(/_/g, ' ').toUpperCase()}</Text>
                                {saving === item.key && <ActivityIndicator size="small" color="#34A853" />}
                            </View>
                            <Text style={styles.description}>{item.description}</Text>
                            <View style={styles.inputRow}>
                                <TextInput
                                    style={styles.input}
                                    defaultValue={item.value}
                                    onBlur={(e) => {
                                        if (e.nativeEvent.text !== item.value) {
                                            handleUpdate(item.key, e.nativeEvent.text);
                                        }
                                    }}
                                    keyboardType="numeric"
                                />
                                <Text style={styles.unit}>
                                    {item.key.includes('rate') ? '%' : item.key.includes('amount') ? '$' : 's'}
                                </Text>
                            </View>
                        </View>
                    ))}
                </ScrollView>
            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F172A' },
    safeArea: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingBottom: 12 },
    title: { fontSize: 24, fontWeight: '800', color: '#FFF' },
    subtitle: { fontSize: 14, color: '#94A3B8', marginBottom: 24 },
    content: { padding: 24, paddingTop: 0 },
    settingCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    label: { color: '#34A853', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
    description: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 12 },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    input: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 12, color: '#FFF', fontSize: 18, fontWeight: '700' },
    unit: { color: '#94A3B8', fontSize: 18, fontWeight: '600' }
});
