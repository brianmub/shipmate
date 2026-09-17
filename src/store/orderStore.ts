import { create } from 'zustand';

interface OrderState {
    pickupAddress: string;
    pickupCoords: { latitude: number; longitude: number } | null;
    dropoffAddress: string;
    dropoffCoords: { latitude: number; longitude: number } | null;
    packageDescription: string;
    errandLocation: string;
    errandCoords: { latitude: number; longitude: number } | null;
    errandList: string;
    packageImage: string | null;
    aiEstimate: string | null;
    serviceType: 'delivery' | 'errand';

    // Actions
    setPickup: (address: string, coords: { latitude: number; longitude: number } | null) => void;
    setDropoff: (address: string, coords: { latitude: number; longitude: number } | null) => void;
    setErrand: (address: string, coords: { latitude: number; longitude: number } | null) => void;
    setPackageDesc: (desc: string) => void;
    setPackageImage: (url: string | null) => void;
    setAIEstimate: (estimate: string | null) => void;
    setErrandInstructions: (list: string) => void;
    setServiceType: (type: 'delivery' | 'errand') => void;
    resetOrder: () => void;
}

export const useOrderStore = create<OrderState>((set) => ({
    pickupAddress: '',
    pickupCoords: null,
    dropoffAddress: '',
    dropoffCoords: null,
    packageDescription: '',
    errandLocation: '',
    errandCoords: null,
    errandList: '',
    packageImage: null,
    aiEstimate: null,
    serviceType: 'delivery',

    setPickup: (address, coords) => set({ pickupAddress: address, pickupCoords: coords }),
    setDropoff: (address, coords) => set({ dropoffAddress: address, dropoffCoords: coords }),
    setErrand: (address, coords) => set({ errandLocation: address, errandCoords: coords }),
    setPackageDesc: (packageDescription) => set({ packageDescription }),
    setPackageImage: (url) => set({ packageImage: url }),
    setAIEstimate: (estimate) => set({ aiEstimate: estimate }),
    setErrandInstructions: (errandList) => set({ errandList }),
    setServiceType: (serviceType) => set({ serviceType }),
    resetOrder: () => set({
        pickupAddress: '',
        pickupCoords: null,
        dropoffAddress: '',
        dropoffCoords: null,
        packageDescription: '',
        errandLocation: '',
        errandCoords: null,
        errandList: '',
        packageImage: null,
        aiEstimate: null,
    }),
}));
