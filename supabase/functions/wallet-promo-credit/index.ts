// Deno Edge Function: wallet-promo-credit
// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: any) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const payload = await req.json()
        console.log("Promo Credit Webhook payload received:", payload)

        // Webhook handles updates on the drivers table
        if (payload.table !== 'drivers') {
            return new Response(JSON.stringify({ message: 'Ignored: Not drivers table' }), { status: 200 })
        }

        const newRecord = payload.record
        const oldRecord = payload.old_record

        // Only trigger when verification_status transitions to 'approved'
        if (newRecord.verification_status !== 'approved' || (oldRecord && oldRecord.verification_status === 'approved')) {
            return new Response(JSON.stringify({ message: 'Ignored: Not transition to approved status' }), { status: 200 })
        }

        const courierId = newRecord.id
        console.log(`Checking promo credit eligibility for driver ${courierId}`)

        // Setup Supabase Client
        const supabaseClient = createClient(
            // @ts-ignore
            Deno.env.get('SUPABASE_URL') ?? '',
            // @ts-ignore
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Call database RPC to atomically apply the credit if eligible
        const { data: granted, error: rpcError } = await supabaseClient.rpc('grant_promo_credit_rpc', {
            p_courier_id: courierId
        })

        if (rpcError) {
            throw rpcError
        }

        console.log(`Promo credit grant completed. Granted: ${granted}`)

        if (granted) {
            console.log(`Sending promotion notification to courier ${courierId}...`)

            // Fetch courier push token
            const { data: userProfile, error: userError } = await supabaseClient
                .from('users')
                .select('expo_push_token')
                .eq('id', courierId)
                .single()

            if (userError) {
                console.error("Error fetching user push token for promo credit:", userError.message)
            } else if (userProfile?.expo_push_token) {
                // Send push notification
                const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Accept-encoding': 'gzip, deflate',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        to: userProfile.expo_push_token,
                        sound: 'default',
                        title: 'Welcome Credit Received! 🎁',
                        body: 'Congratulations! You have received a $10.00 welcome bonus in your wallet as one of our first 50 couriers.',
                        data: { type: 'promo_credit', amount: 10.00 }
                    })
                })
                const expoResult = await expoResponse.json()
                console.log("Expo push response for promo credit:", expoResult)
            } else {
                console.log(`Courier ${courierId} does not have an active expo_push_token configured. Warning logged to server.`)
            }
        }

        return new Response(JSON.stringify({ success: true, granted }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        })

    } catch (err) {
        const error = err as Error
        console.error("Error in wallet-promo-credit Edge Function:", error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        })
    }
})
