import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

interface OfferSelectionPanelProps {
    offers: any[];
    onAccept: (offer: any) => void;
    onSelect: (offer: any) => void;
    loading: boolean;
}

export const OfferSelectionPanel = ({ offers, onAccept, onSelect, loading }: OfferSelectionPanelProps) => {
    const [selectedId, setSelectedId] = React.useState<string | null>(null);

    const handleSelect = (offer: any) => {
        setSelectedId(offer.id);
        onSelect(offer);
    };
    if (loading && offers.length === 0) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator color="#055FEE" size="large" />
                <Text style={styles.loadingText}>Looking for couriers...</Text>
            </View>
        );
    }

    if (offers.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <View style={styles.searchIcon}>
                    <ActivityIndicator color="#055FEE" size="small" />
                </View>
                <Text style={styles.emptyTitle}>Finding Couriers</Text>
                <Text style={styles.emptySub}>Drivers are reviewing your request. Offers will appear here shortly.</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Available Couriers ({offers.length})</Text>
            <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                contentContainerStyle={styles.scrollContent}
            >
                {offers.map((offer) => (
                    <TouchableOpacity 
                        key={offer.id} 
                        activeOpacity={0.9} 
                        onPress={() => handleSelect(offer)}
                    >
                        <BlurView 
                            intensity={selectedId === offer.id ? 80 : 40} 
                            tint={selectedId === offer.id ? "dark" : "light"} 
                            style={[
                                styles.offerCard, 
                                selectedId === offer.id && styles.selectedOfferCard
                            ]}
                        >
                        <View style={styles.driverInfo}>
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>{offer.driver.full_name.charAt(0).toUpperCase()}</Text>
                            </View>
                            <View>
                                <Text style={styles.driverName}>{offer.driver.full_name}</Text>
                                <Text style={styles.rating}>⭐ {offer.driver.average_rating || '5.0'}</Text>
                            </View>
                        </View>

                        <View style={styles.statsRow}>
                            <View style={styles.statItem}>
                                <Text style={styles.statLabel}>Pickup In</Text>
                                <Text style={styles.statValue}>{offer.pickup_time_estimate} min</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statItem}>
                                <Text style={styles.statLabel}>Offer Price</Text>
                                <Text style={styles.statValue}>${offer.offer_amount.toFixed(2)}</Text>
                            </View>
                        </View>

                        <TouchableOpacity 
                            style={styles.acceptBtnContainer}
                            onPress={() => onAccept(offer)}
                        >
                            <LinearGradient
                                colors={['#055FEE', '#5B99F2']}
                                style={styles.acceptBtn}
                            >
                                <Text style={styles.acceptBtnText}>Hire Courier</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </BlurView>
                </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginTop: 16,
    },
    centerContainer: {
        padding: 40,
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        color: '#64748B',
        fontSize: 14,
        fontWeight: '500',
    },
    emptyContainer: {
        padding: 32,
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.4)',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.6)',
    },
    searchIcon: {
        marginBottom: 12,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1E293B',
        marginBottom: 4,
    },
    emptySub: {
        fontSize: 13,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 18,
    },
    title: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 16,
        paddingHorizontal: 4,
    },
    scrollContent: {
        paddingBottom: 8,
        gap: 16,
    },
    offerCard: {
        width: 280,
        borderRadius: 24,
        padding: 16,
        backgroundColor: 'rgba(255,255,255,0.5)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.8)',
        overflow: 'hidden',
    },
    selectedOfferCard: {
        borderColor: '#055FEE',
        borderWidth: 2,
        backgroundColor: 'rgba(5, 95, 238, 0.05)',
    },
    driverInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 12,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#0F172A',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    driverName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1E293B',
    },
    rating: {
        fontSize: 12,
        color: '#F59E0B',
        fontWeight: '700',
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255,255,255,0.6)',
        borderRadius: 16,
        padding: 12,
        marginBottom: 16,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statLabel: {
        fontSize: 11,
        color: '#64748B',
        marginBottom: 4,
        fontWeight: '500',
    },
    statValue: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0F172A',
    },
    statDivider: {
        width: 1,
        height: '100%',
        backgroundColor: '#E2E8F0',
    },
    acceptBtnContainer: {
        borderRadius: 12,
        overflow: 'hidden',
    },
    acceptBtn: {
        paddingVertical: 12,
        alignItems: 'center',
    },
    acceptBtnText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 14,
    },
});
