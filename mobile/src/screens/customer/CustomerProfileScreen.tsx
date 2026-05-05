import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';

export const CustomerProfileScreen = () => {
    const { signOut, user } = useAuthStore();

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                <Text style={styles.header}>Profile</Text>

                <View style={styles.profileCard}>
                    <View style={styles.avatarContainer}>
                        <Text style={styles.avatarText}>JD</Text>
                    </View>
                    <View style={styles.infoContainer}>
                        <Text style={styles.nameText}>John Doe</Text>
                        <Text style={styles.emailText}>john.doe@example.com</Text>
                        <View style={styles.badgeContainer}>
                            <Text style={styles.badgeText}>Customer</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.settingsGroup}>
                    <TouchableOpacity style={styles.settingItem}>
                        <Text style={styles.settingIcon}>📍</Text>
                        <Text style={styles.settingText}>Saved Addresses</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.settingItem}>
                        <Text style={styles.settingIcon}>💳</Text>
                        <Text style={styles.settingText}>Payment Methods</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.settingItem}>
                        <Text style={styles.settingIcon}>🔔</Text>
                        <Text style={styles.settingText}>Notifications</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
                    <Text style={styles.logoutButtonText}>Sign Out</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    container: {
        flex: 1,
    },
    header: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 20,
        color: '#333',
        paddingHorizontal: 24,
        paddingTop: 16,
    },
    profileCard: {
        backgroundColor: '#fff',
        flexDirection: 'row',
        padding: 24,
        marginBottom: 24,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        borderTopWidth: 1,
        borderTopColor: '#eee',
    },
    avatarContainer: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#0056D2',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    avatarText: {
        color: '#fff',
        fontSize: 24,
        fontWeight: 'bold',
    },
    infoContainer: {
        justifyContent: 'center',
    },
    nameText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 4,
    },
    emailText: {
        fontSize: 14,
        color: '#666',
        marginBottom: 8,
    },
    badgeContainer: {
        backgroundColor: '#E3F2FD',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        alignSelf: 'flex-start',
    },
    badgeText: {
        color: '#0056D2',
        fontSize: 12,
        fontWeight: '600',
    },
    settingsGroup: {
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        borderTopWidth: 1,
        borderTopColor: '#eee',
        marginBottom: 32,
    },
    settingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderBottomWidth: 1,
        borderBottomColor: '#f5f5f5',
    },
    settingIcon: {
        fontSize: 20,
        marginRight: 16,
    },
    settingText: {
        fontSize: 16,
        color: '#333',
    },
    logoutButton: {
        backgroundColor: '#fff',
        padding: 16,
        marginHorizontal: 24,
        borderRadius: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#ff3b30',
    },
    logoutButtonText: {
        color: '#ff3b30',
        fontSize: 16,
        fontWeight: '600',
    },
});
