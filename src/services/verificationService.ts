import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { supabase } from '../utils/supabase';
import { DocumentType, VehicleType } from '../types';

export const verificationService = {
    /**
     * Request permissions and pick an image
     */
    async pickImage(useCamera: boolean = false) {
        const permissionResult = useCamera 
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (permissionResult.granted === false) {
            throw new Error(`Permission to access ${useCamera ? 'camera' : 'media library'} was denied`);
        }

        const result = useCamera
            ? await ImagePicker.launchCameraAsync({
                allowsEditing: true,
                quality: 0.7,
            })
            : await ImagePicker.launchImageLibraryAsync({
                allowsEditing: true,
                quality: 0.7,
            });

        if (!result.canceled) {
            return result.assets[0];
        }
        return null;
    },

    /**
     * Upload image to Supabase Storage
     */
    async uploadImage(uri: string, path: string) {
        const formData = new FormData();
        const fileName = path.split('/').pop() || 'upload.jpg';
        
        // In React Native, we need to cast to any or use the specific object structure
        formData.append('file', {
            uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
            name: fileName,
            type: 'image/jpeg',
        } as any);

        const { data, error } = await supabase.storage
            .from('verification-docs')
            .upload(path, formData, {
                cacheControl: '3600',
                upsert: true
            });

        if (error) throw error;
        
        const { data: publicUrlData } = supabase.storage
            .from('verification-docs')
            .getPublicUrl(path);

        return publicUrlData.publicUrl;
    },

    /**
     * Save document record
     */
    async saveDocument(driverId: string, type: DocumentType, url: string) {
        // Ensure driver profile exists first to satisfy foreign key constraint
        await supabase
            .from('drivers')
            .upsert({ id: driverId })
            .select();

        const { error } = await supabase
            .from('driver_documents')
            .insert({
                driver_id: driverId,
                document_type: type,
                file_url: url
            });
        
        if (error) throw error;
    },

    /**
     * Update driver profile details
     */
    async updateDriverDetails(driverId: string, details: any) {
        const { error } = await supabase
            .from('drivers')
            .upsert({ 
                id: driverId, 
                ...details
            });
        
        if (error) throw error;
    },

    /**
     * Save/Update vehicle info
     */
    async saveVehicleInfo(driverId: string, vehicleInfo: any) {
        const { data: existing } = await supabase
            .from('vehicles')
            .select('id')
            .eq('driver_id', driverId)
            .single();

        if (existing) {
            const { error } = await supabase
                .from('vehicles')
                .update(vehicleInfo)
                .eq('driver_id', driverId);
            if (error) throw error;
        } else {
            const { error } = await supabase
                .from('vehicles')
                .insert({ ...vehicleInfo, driver_id: driverId });
            if (error) throw error;
        }
    }
};
