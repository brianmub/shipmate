import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Alert, ScrollView, ActivityIndicator, Image } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Signature from 'react-native-signature-canvas';
import { verificationService } from '../services/verificationService';

interface ProofOfDeliveryProps {
    visible: boolean;
    onClose: () => void;
    onComplete: (proof: { signatureUrl: string; photoUrl: string }) => void;
    orderId: string;
}

export const ProofOfDeliveryModal = ({ visible, onClose, onComplete, orderId }: ProofOfDeliveryProps) => {
    const [signature, setSignature] = useState<string | null>(null);
    const [photo, setPhoto] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState<'signature' | 'photo'>('signature');

    const handleSignature = (signatureData: string) => {
        setSignature(signatureData);
        setStep('photo');
    };

    const handlePhoto = async () => {
        try {
            const asset = await verificationService.pickImage(true);
            if (asset) setPhoto(asset.uri);
        } catch (error: any) {
            Alert.alert('Error', error.message);
        }
    };

    const handleSubmit = async () => {
        if (!signature || !photo) {
            Alert.alert('Incomplete', 'Please provide both signature and photo proof.');
            return;
        }

        try {
            setLoading(true);
            // Upload photo
            const photoPath = `orders/${orderId}/proof_photo.jpg`;
            const photoUrl = await verificationService.uploadImage(photo, photoPath);

            // In a real app, you'd also upload the signature base64 as a file
            // For now we'll pass them back
            onComplete({ signatureUrl: signature, photoUrl });
        } catch (error: any) {
            Alert.alert('Error', error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <BlurView intensity={80} tint="dark" style={styles.container}>
                <View style={styles.content}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Proof of Delivery</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={24} color="#64748B" />
                        </TouchableOpacity>
                    </View>

                    {step === 'signature' ? (
                        <View style={styles.stepContainer}>
                            <Text style={styles.label}>Recipient Signature</Text>
                            <View style={styles.signatureBox}>
                                <Signature
                                    onOK={handleSignature}
                                    descriptionText="Sign here"
                                    clearText="Clear"
                                    confirmText="Save Signature"
                                    webStyle={`.m-signature-pad--footer {display: none; margin: 0;}`}
                                />
                            </View>
                            <Text style={styles.hint}>Ask the recipient to sign above</Text>
                        </View>
                    ) : (
                        <View style={styles.stepContainer}>
                            <Text style={styles.label}>Delivery Photo</Text>
                            <TouchableOpacity style={styles.photoBox} onPress={handlePhoto}>
                                {photo ? (
                                    <Image source={{ uri: photo }} style={styles.previewImage} />
                                ) : (
                                    <View style={styles.emptyPhoto}>
                                        <Ionicons name="camera" size={48} color="#94A3B8" />
                                        <Text style={styles.photoHint}>Take a photo of the package at delivery</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                            <View style={styles.footerBtns}>
                                <TouchableOpacity style={styles.backBtn} onPress={() => setStep('signature')}>
                                    <Text style={styles.backTxt}>Back to Signature</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    style={[styles.submitBtn, (!photo || loading) && styles.disabled]} 
                                    onPress={handleSubmit}
                                    disabled={!photo || loading}
                                >
                                    {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitTxt}>Complete Delivery</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>
            </BlurView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'flex-end' },
    content: { backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, height: '80%' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    title: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
    stepContainer: { flex: 1 },
    label: { fontSize: 16, fontWeight: '600', color: '#475569', marginBottom: 12 },
    signatureBox: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' },
    photoBox: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
    previewImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    emptyPhoto: { alignItems: 'center', padding: 20 },
    photoHint: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 12 },
    hint: { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 12 },
    footerBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
    backBtn: { flex: 1, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
    backTxt: { color: '#64748B', fontWeight: '600' },
    submitBtn: { flex: 2, padding: 16, borderRadius: 12, backgroundColor: '#055FEE', alignItems: 'center' },
    submitTxt: { color: '#FFF', fontWeight: '700' },
    disabled: { opacity: 0.6 }
});
