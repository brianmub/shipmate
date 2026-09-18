import * as Location from 'expo-location';

export interface AddressSuggestion {
    id: string;
    mainText: string;
    secondaryText: string;
    fullAddress: string;
    placeId?: string;
    latitude?: number;
    longitude?: number;
}

// Common Zimbabwe prominent locations for instant offline/fallback suggestions
const ZIMBABWE_POPULAR_LANDMARKS: AddressSuggestion[] = [
    {
        id: 'zim-1',
        mainText: 'Joina City',
        secondaryText: 'Jason Moyo Ave & Julius Nyerere Way, Harare',
        fullAddress: 'Joina City, Jason Moyo Ave, Harare, Zimbabwe',
        latitude: -17.8312,
        longitude: 31.0494,
    },
    {
        id: 'zim-2',
        mainText: 'Eastgate Shopping Mall',
        secondaryText: 'Robert Mugabe Rd, Harare CBD',
        fullAddress: 'Eastgate Mall, Robert Mugabe Rd, Harare, Zimbabwe',
        latitude: -17.8322,
        longitude: 31.0536,
    },
    {
        id: 'zim-3',
        mainText: 'Avondale Shopping Centre',
        secondaryText: 'King George Rd, Avondale, Harare',
        fullAddress: 'Avondale Shopping Centre, King George Rd, Harare, Zimbabwe',
        latitude: -17.7981,
        longitude: 31.0396,
    },
    {
        id: 'zim-4',
        mainText: 'Sam Levy\'s Village',
        secondaryText: 'Borrowdale Rd, Borrowdale, Harare',
        fullAddress: 'Sam Levy\'s Village, Borrowdale Rd, Harare, Zimbabwe',
        latitude: -17.7558,
        longitude: 31.0858,
    },
    {
        id: 'zim-5',
        mainText: 'Westgate Shopping Mall',
        secondaryText: 'Lomagundi Rd, Westgate, Harare',
        fullAddress: 'Westgate Shopping Mall, Lomagundi Rd, Harare, Zimbabwe',
        latitude: -17.7667,
        longitude: 30.9744,
    },
    {
        id: 'zim-6',
        mainText: 'Ruwa Shopping Centre',
        secondaryText: 'Mutare Rd, Ruwa',
        fullAddress: 'Ruwa Shopping Centre, Mutare Rd, Ruwa, Zimbabwe',
        latitude: -17.8936,
        longitude: 31.2447,
    },
    {
        id: 'zim-7',
        mainText: 'Chitungwiza Town Centre',
        secondaryText: 'Mangwende Dr, Chitungwiza',
        fullAddress: 'Chitungwiza Town Centre, Mangwende Dr, Chitungwiza, Zimbabwe',
        latitude: -18.0125,
        longitude: 31.0664,
    },
    {
        id: 'zim-8',
        mainText: 'Bulawayo City Centre',
        secondaryText: '8th Ave & Leopold Takawira Ave, Bulawayo',
        fullAddress: 'Bulawayo City Centre, Bulawayo, Zimbabwe',
        latitude: -20.1553,
        longitude: 28.5833,
    },
    {
        id: 'zim-9',
        mainText: 'Zindoga Shopping Centre',
        secondaryText: 'Simon Mazorodze Rd, Waterfalls, Harare',
        fullAddress: 'Zindoga Shopping Centre, Simon Mazorodze Rd, Waterfalls, Harare, Zimbabwe',
        latitude: -17.8981,
        longitude: 31.0040,
    },
    {
        id: 'zim-10',
        mainText: 'Waterfalls Shopping Centre',
        secondaryText: 'Parktown, Waterfalls, Harare',
        fullAddress: 'Waterfalls Shopping Centre, Harare, Zimbabwe',
        latitude: -17.9130,
        longitude: 30.9988,
    },
];

const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export const locationSearchService = {
    /**
     * Search address suggestions with autocomplete
     */
    async searchAddresses(query: string): Promise<AddressSuggestion[]> {
        const trimmed = query.trim();
        if (!trimmed || trimmed.length < 2) return [];

        const lowerQuery = trimmed.toLowerCase();

        // 1. Check local Zimbabwe landmarks first for instant response
        const matchedLandmarks = ZIMBABWE_POPULAR_LANDMARKS.filter(
            l => l.mainText.toLowerCase().includes(lowerQuery) || 
                 l.secondaryText.toLowerCase().includes(lowerQuery) ||
                 l.fullAddress.toLowerCase().includes(lowerQuery)
        );

        // 2. Try Google Places Autocomplete API if key is present
        if (GOOGLE_MAPS_KEY) {
            try {
                const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(trimmed)}&key=${GOOGLE_MAPS_KEY}&components=country:zw`;
                const response = await fetch(url);
                const data = await response.json();

                if (data.status === 'OK' && Array.isArray(data.predictions)) {
                    const googleResults: AddressSuggestion[] = data.predictions.map((p: any) => ({
                        id: p.place_id,
                        placeId: p.place_id,
                        mainText: p.structured_formatting?.main_text || p.description,
                        secondaryText: p.structured_formatting?.secondary_text || 'Zimbabwe',
                        fullAddress: p.description,
                    }));

                    // Deduplicate and merge with local landmarks
                    const combined = [...matchedLandmarks];
                    for (const g of googleResults) {
                        if (!combined.some(c => c.fullAddress.toLowerCase() === g.fullAddress.toLowerCase())) {
                            combined.push(g);
                        }
                    }
                    return combined.slice(0, 6);
                }
            } catch (err) {
                console.warn('Google Places Autocomplete failed, falling back to Geocoder:', err);
            }
        }

        // 3. Fallback to Photon / OSM Geocoder
        try {
            const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed + ' Zimbabwe')}&limit=5`;
            const photonRes = await fetch(photonUrl);
            const photonData = await photonRes.json();

            if (photonData?.features && Array.isArray(photonData.features) && photonData.features.length > 0) {
                const photonResults: AddressSuggestion[] = photonData.features.map((f: any, idx: number) => {
                    const props = f.properties || {};
                    const name = props.name || props.street || trimmed;
                    const city = props.city || props.district || props.country || 'Zimbabwe';
                    const [lng, lat] = f.geometry?.coordinates || [31.053, -17.8248];

                    return {
                        id: `photon-${idx}-${Date.now()}`,
                        mainText: name,
                        secondaryText: `${props.street ? props.street + ', ' : ''}${city}`,
                        fullAddress: `${name}, ${city}`,
                        latitude: lat,
                        longitude: lng,
                    };
                });

                const merged = [...matchedLandmarks];
                for (const p of photonResults) {
                    if (!merged.some(m => m.mainText.toLowerCase() === p.mainText.toLowerCase())) {
                        merged.push(p);
                    }
                }
                return merged.slice(0, 6);
            }
        } catch (err) {
            console.warn('Photon geocoder fallback failed:', err);
        }

        // 4. Fallback to Expo Location geocoding
        try {
            const expoResults = await Location.geocodeAsync(trimmed + ', Zimbabwe');
            if (expoResults.length > 0) {
                const { latitude, longitude } = expoResults[0];
                return [
                    ...matchedLandmarks,
                    {
                        id: `expo-${Date.now()}`,
                        mainText: trimmed,
                        secondaryText: 'Zimbabwe',
                        fullAddress: `${trimmed}, Zimbabwe`,
                        latitude,
                        longitude,
                    }
                ].slice(0, 6);
            }
        } catch (err) {
            console.warn('Expo geocode fallback failed:', err);
        }

        return matchedLandmarks;
    },

    /**
     * Resolve latitude and longitude for an address suggestion if not yet attached
     */
    async resolveCoordinates(suggestion: AddressSuggestion): Promise<{ latitude: number; longitude: number }> {
        if (suggestion.latitude && suggestion.longitude) {
            return { latitude: suggestion.latitude, longitude: suggestion.longitude };
        }

        // If Google place_id exists, fetch Place Details
        if (suggestion.placeId && GOOGLE_MAPS_KEY) {
            try {
                const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${suggestion.placeId}&fields=geometry&key=${GOOGLE_MAPS_KEY}`;
                const res = await fetch(detailsUrl);
                const data = await res.json();
                if (data.status === 'OK' && data.result?.geometry?.location) {
                    return {
                        latitude: data.result.geometry.location.lat,
                        longitude: data.result.geometry.location.lng,
                    };
                }
            } catch (err) {
                console.warn('Place Details fetch failed:', err);
            }
        }

        // Fallback to Expo Geocode
        try {
            const results = await Location.geocodeAsync(suggestion.fullAddress);
            if (results.length > 0) {
                return {
                    latitude: results[0].latitude,
                    longitude: results[0].longitude,
                };
            }
        } catch (err) {
            console.warn('Failed to geocode address suggestion:', err);
        }

        // Default to Harare Central coordinates if resolution fails
        return { latitude: -17.8248, longitude: 31.0530 };
    }
};
