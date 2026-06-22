const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

export interface PackageClassification {
    size_category: 'Small Envelope' | 'Medium Box' | 'Large Parcel' | 'Irregular Shape';
    dimensions: string;
    estimated_weight: string;
}

export const aiService = {
    /**
     * Sends base64 image data of the package to Gemini 1.5 Flash model for size/weight/dimension estimation.
     * Includes a robust fallback mechanism if the API key is not configured.
     */
    async classifyPackage(base64Image: string): Promise<PackageClassification> {
        if (!GEMINI_API_KEY) {
            console.warn("EXPO_PUBLIC_GEMINI_API_KEY is not defined. Simulating classification...");
            await new Promise(resolve => setTimeout(resolve, 2000));
            const estimates: PackageClassification[] = [
                { size_category: 'Small Envelope', dimensions: '29.7 x 21.0 x 1.0 cm', estimated_weight: '0.2 kg' },
                { size_category: 'Medium Box', dimensions: '40.0 x 30.0 x 20.0 cm', estimated_weight: '2.5 kg' },
                { size_category: 'Large Parcel', dimensions: '80.0 x 60.0 x 40.0 cm', estimated_weight: '12.0 kg' },
                { size_category: 'Irregular Shape', dimensions: 'Irregular dimensions', estimated_weight: '5.0 kg' }
            ];
            return estimates[Math.floor(Math.random() * estimates.length)];
        }

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: "Analyze the package in the photo. Categorize its size category into one of these exact values: 'Small Envelope', 'Medium Box', 'Large Parcel', or 'Irregular Shape'. Provide a realistic estimate of its dimensions (width x height x depth in cm) and its estimated weight (in kg). Return a JSON object matching this schema: { \"size_category\": \"Small Envelope\" | \"Medium Box\" | \"Large Parcel\" | \"Irregular Shape\", \"dimensions\": \"e.g. 30x20x15 cm\", \"estimated_weight\": \"e.g. 1.5 kg\" }"
                            },
                            {
                                inlineData: {
                                    mimeType: "image/jpeg",
                                    data: base64Image
                                }
                            }
                        ]
                    }
                ],
                generationConfig: {
                    responseMimeType: "application/json"
                }
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Gemini API returned error: ${response.status} - ${errBody}`);
        }

        const resData = await response.json();
        const textResponse = resData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textResponse) {
            throw new Error("Empty response from Gemini API");
        }

        const parsed = JSON.parse(textResponse.trim());
        return {
            size_category: parsed.size_category || 'Medium Box',
            dimensions: parsed.dimensions || 'Dimensions estimated',
            estimated_weight: parsed.estimated_weight || 'Weight estimated'
        };
    }
};
