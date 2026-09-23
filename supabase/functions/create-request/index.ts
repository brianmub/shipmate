// Deno Edge Function: create-request
// Step 2 of ShipMate live presence + bidding feature
// @ts-ignore
declare const Deno: any;
// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Configurable constants with environment variable overrides
const DEFAULT_REQUEST_TTL_SECONDS = 90
const DEFAULT_SEARCH_RADIUS_KM = 15.0
const DEFAULT_ZONE_ID = 'harare'

interface Coordinate {
    latitude: number;
    longitude: number;
}

/**
 * Normalizes varied coordinate representations into standard { latitude, longitude }
 * Supports:
 * - { latitude, longitude } or { lat, lng }
 * - GeoJSON { type: 'Point', coordinates: [lng, lat] }
 * - PostGIS WKT string 'POINT(lng lat)'
 */
function parseCoordinate(input: any): Coordinate | null {
    if (!input) return null

    // Object format { latitude, longitude } or { lat, lng }
    if (typeof input === 'object') {
        const lat = input.latitude !== undefined ? Number(input.latitude) : (input.lat !== undefined ? Number(input.lat) : undefined)
        const lng = input.longitude !== undefined ? Number(input.longitude) : (input.lng !== undefined ? Number(input.lng) : undefined)

        if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
            if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                return { latitude: lat, longitude: lng }
            }
        }

        // GeoJSON format { type: 'Point', coordinates: [lng, lat] }
        if (Array.isArray(input.coordinates) && input.coordinates.length >= 2) {
            const lngCoord = Number(input.coordinates[0])
            const latCoord = Number(input.coordinates[1])
            if (!isNaN(latCoord) && !isNaN(lngCoord) && latCoord >= -90 && latCoord <= 90 && lngCoord >= -180 && lngCoord <= 180) {
                return { latitude: latCoord, longitude: lngCoord }
            }
        }
    }

    // String format: 'POINT(lng lat)'
    if (typeof input === 'string') {
        const match = input.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i)
        if (match) {
            const lng = parseFloat(match[1])
            const lat = parseFloat(match[2])
            if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                return { latitude: lat, longitude: lng }
            }
        }
    }

    return null
}

/**
 * Calculates great-circle distance between two GPS coordinates in kilometers
 */
function calculateHaversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371.0
    const dLat = (lat2 - lat1) * (Math.PI / 180.0)
    const dLon = (lon2 - lon1) * (Math.PI / 180.0)
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180.0)) * Math.cos(lat2 * (Math.PI / 180.0)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
}

serve(async (req: any) => {
    // 1. Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        if (req.method !== 'POST') {
            return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED', message: 'Only POST method is allowed' }), {
                status: 405,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
        const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

        if (!supabaseUrl || !supabaseServiceRoleKey) {
            throw new Error('Supabase environment variables not configured.')
        }

        // Initialize admin client with service role key for DB operations and Realtime broadcasting
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

        // Parse request payload
        let payload: any = {}
        try {
            payload = await req.json()
        } catch {
            return new Response(JSON.stringify({
                error: 'INVALID_JSON',
                message: 'Invalid JSON request body'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // 2. Validate base_price
        const rawBasePrice = payload.base_price ?? payload.basePrice
        const basePrice = typeof rawBasePrice === 'string' ? parseFloat(rawBasePrice) : Number(rawBasePrice)

        if (isNaN(basePrice) || basePrice <= 0) {
            return new Response(JSON.stringify({
                error: 'INVALID_BASE_PRICE',
                message: 'base_price is required and must be a positive number greater than 0'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // 3. Validate pickup and dropoff locations
        const pickup = parseCoordinate(payload.pickup_location ?? payload.pickupLocation)
        if (!pickup) {
            return new Response(JSON.stringify({
                error: 'INVALID_PICKUP_LOCATION',
                message: 'pickup_location is required with valid latitude (-90 to 90) and longitude (-180 to 180)'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        const dropoff = parseCoordinate(payload.dropoff_location ?? payload.dropoffLocation)
        if (!dropoff) {
            return new Response(JSON.stringify({
                error: 'INVALID_DROPOFF_LOCATION',
                message: 'dropoff_location is required with valid latitude (-90 to 90) and longitude (-180 to 180)'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // 4. Resolve customer ID (authenticated user or payload fallback for dev testing)
        let customerId: string | null = payload.customer_id || payload.customerId || null
        const authHeader = req.headers.get('Authorization')

        if (authHeader && supabaseAnonKey) {
            try {
                const userClient = createClient(supabaseUrl, supabaseAnonKey, {
                    global: { headers: { Authorization: authHeader } }
                })
                const { data: { user } } = await userClient.auth.getUser()
                if (user?.id) {
                    customerId = user.id
                }
            } catch (authErr: any) {
                console.warn("Could not extract user from authHeader:", authErr.message)
            }
        }

        if (!customerId) {
            // Check if there is an active customer in the DB for local/dev fallback if none specified
            const { data: fallbackUser } = await supabaseAdmin
                .from('users')
                .select('id')
                .eq('role', 'customer')
                .limit(1)
                .single()

            if (fallbackUser?.id) {
                customerId = fallbackUser.id
            } else {
                return new Response(JSON.stringify({
                    error: 'UNAUTHORIZED',
                    message: 'Authentication required: missing authenticated user or valid customer_id'
                }), {
                    status: 401,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                })
            }
        }

        // 5. Calculate expiration timestamp using configurable TTL
        const ttlSeconds = parseInt(
            Deno.env.get('REQUEST_TTL_SECONDS') || '',
            10
        ) || DEFAULT_REQUEST_TTL_SECONDS

        const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString()

        // 6. Insert new row into public.requests
        const { data: newRequest, error: insertError } = await supabaseAdmin
            .from('requests')
            .insert({
                customer_id: customerId,
                pickup_location: `POINT(${pickup.longitude} ${pickup.latitude})`,
                dropoff_location: `POINT(${dropoff.longitude} ${dropoff.latitude})`,
                base_price: Math.round(basePrice * 100) / 100,
                status: 'searching',
                expires_at: expiresAt,
            })
            .select('id, customer_id, status, base_price, expires_at, created_at')
            .single()

        if (insertError || !newRequest) {
            console.error("Database insert error on requests table:", insertError)
            return new Response(JSON.stringify({
                error: 'DATABASE_ERROR',
                message: insertError?.message || 'Failed to insert request into database'
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        console.log(`Created request ${newRequest.id} for customer ${customerId} (expires_at: ${expiresAt})`)

        // 7. Match eligible nearby Mates
        const searchRadiusKm = parseFloat(
            Deno.env.get('SEARCH_RADIUS_KM') || ''
        ) || DEFAULT_SEARCH_RADIUS_KM

        let matchedMates: Array<{ id: string; zone_id?: string; distance_km?: number; [key: string]: any }> = []

        // TODO: [Step 2+ / Matching Engine] Full zone polygon matching and dynamic dispatch.
        // Query currently-online approved Mates within hardcoded radius (default 15 km).
        try {
            const { data: onlineDrivers, error: driversError } = await supabaseAdmin
                .from('drivers')
                .select('id, current_latitude, current_longitude, tier')
                .eq('is_online', true)
                .eq('verification_status', 'approved')

            if (!driversError && Array.isArray(onlineDrivers)) {
                matchedMates = onlineDrivers
                    .filter((d: any) => {
                        // Only match drivers who have an active GPS position within search radius
                        if (d.current_latitude != null && d.current_longitude != null) {
                            const dist = calculateHaversineKm(
                                pickup.latitude, pickup.longitude,
                                Number(d.current_latitude), Number(d.current_longitude)
                            )
                            d.distance_km = Math.round(dist * 100) / 100
                            return dist <= searchRadiusKm
                        }
                        return false
                    })
                console.log(`Matched ${matchedMates.length} online Mates within ${searchRadiusKm} km`)
            } else if (driversError) {
                console.warn("Drivers query error:", driversError.message)
            }
        } catch (matchErr: any) {
            console.warn("Matching query error:", matchErr.message)
        }

        // 8. Broadcast 'new_request' Realtime event on each matched Mate's zone channel
        const defaultZone = Deno.env.get('DEFAULT_ZONE_ID') || DEFAULT_ZONE_ID
        const fallbackZone = payload.zone_id || defaultZone

        const zonesToNotify = new Set<string>()

        if (matchedMates.length > 0) {
            for (const mate of matchedMates) {
                const mateZone = mate.zone_id || fallbackZone
                zonesToNotify.add(mateZone)
            }
        } else {
            console.log(`No eligible Mates found nearby for request ${newRequest.id}`)
        }

        const broadcastPayload = {
            request_id: newRequest.id,
            pickup_location: {
                latitude: pickup.latitude,
                longitude: pickup.longitude,
                address: payload.pickup_address || null,
            },
            dropoff_location: {
                latitude: dropoff.latitude,
                longitude: dropoff.longitude,
                address: payload.dropoff_address || null,
            },
            base_price: Number(newRequest.base_price),
            expires_at: newRequest.expires_at,
            matched_mates_count: matchedMates.length,
        }

        // Dispatch Realtime broadcasts across all target zone channels
        const broadcastErrors: string[] = []
        for (const zoneId of zonesToNotify) {
            const topic = `jobs:${zoneId}`
            try {
                // High-performance direct HTTP Realtime Broadcast API
                const broadcastResp = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
                    method: 'POST',
                    headers: {
                        'apikey': supabaseServiceRoleKey,
                        'Authorization': `Bearer ${supabaseServiceRoleKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        messages: [{
                            topic,
                            event: 'new_request',
                            payload: broadcastPayload,
                        }]
                    })
                })

                if (!broadcastResp.ok) {
                    const errBody = await broadcastResp.text()
                    console.warn(`Realtime REST broadcast to ${topic} returned ${broadcastResp.status}: ${errBody}`)
                    broadcastErrors.push(`${topic}: ${broadcastResp.statusText}`)
                } else {
                    console.log(`Realtime broadcast 'new_request' dispatched successfully to channel: ${topic}`)
                }
            } catch (bcErr: any) {
                console.error(`Error broadcasting to ${topic}:`, bcErr.message)
                broadcastErrors.push(`${topic}: ${bcErr.message}`)
            }
        }

        // 9. Return the created request_id and expires_at to caller
        const responseData = {
            success: true,
            request_id: newRequest.id,
            expires_at: newRequest.expires_at,
            status: newRequest.status,
            base_price: Number(newRequest.base_price),
            matched_mates_count: matchedMates.length,
            zones_notified: Array.from(zonesToNotify),
            ...(matchedMates.length === 0 ? { message: 'No eligible Mates found nearby' } : {}),
            ...(broadcastErrors.length > 0 ? { broadcast_warnings: broadcastErrors } : {})
        }

        return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (err: any) {
        console.error("Unhandled error in create-request function:", err.message)
        return new Response(JSON.stringify({
            error: 'INTERNAL_SERVER_ERROR',
            message: err.message || 'An unexpected error occurred'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
