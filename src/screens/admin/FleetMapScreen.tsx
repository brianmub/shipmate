import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const FleetMapScreen = () => {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Fleet Tracking</Text>
            <View style={styles.placeholder}>
                <Text style={styles.text}>🗺️ Map View is only available on Mobile App</Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: '#F8FAFC', justifyContent: 'center' },
    title: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginBottom: 20, textAlign: 'center' },
    placeholder: { flex: 0.6, backgroundColor: '#E2E8F0', borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed', borderWidth: 2, borderColor: '#94A3B8' },
    text: { color: '#64748B', fontSize: 16, fontWeight: '600' }
});
