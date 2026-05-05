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
                aspect: [4, 3],
                quality: 0.7,
            })
            : await ImagePicker.launchImageLibraryAsync({
                allowsEditing: true,
                aspect: [4, 3],
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

    async saveDocument(driverId: string, type: DocumentType, url: string) {
        // Ensure the base user profile exists in public.users first to prevent FK violations
        await this.ensureUserExists(driverId);

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
        try {
            // Ensure base user exists
            await this.ensureUserExists(driverId);

            console.log('Upserting driver details for:', driverId);
            const { error } = await supabase
                .from('drivers')
                .upsert({ 
                    id: driverId, 
                    ...details
                });
            
            if (error) {
                console.error('Error in updateDriverDetails:', error);
                throw error;
            }
        } catch (err: any) {
            console.error('Caught error in updateDriverDetails:', err);
            throw err;
        }
    },

    /**
     * Helper to ensure user exists in public.users
     */
    async ensureUserExists(userId: string) {
        console.log('Checking if user exists in public.users:', userId);
        const { data: user, error: fetchError } = await supabase.from('users').select('id').eq('id', userId).single();
        
        if (fetchError && fetchError.code !== 'PGRST116') {
            console.error('Error fetching user profile:', fetchError);
        }

        if (!user) {
            console.log('User not found in public.users, creating record...');
            const { data: authUser } = await supabase.auth.getUser();
            if (authUser.user) {
                const { error: insertError } = await supabase.from('users').upsert({
                    id: userId,
                    email: authUser.user.email,
                    full_name: authUser.user.user_metadata?.full_name || 'Driver',
                    role: authUser.user.user_metadata?.role || 'driver'
                });
                if (insertError) {
                    console.error('Failed to create public user record:', insertError);
                    throw new Error(`Profile initialization failed: ${insertError.message}`);
                }
            } else {
                throw new Error('No authenticated session found');
            }
        }
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
