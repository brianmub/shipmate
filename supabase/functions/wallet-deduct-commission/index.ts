// Deno Edge Function: wallet-deduct-commission
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
        console.log("Deduct Commission Webhook payload received:", payload)

        // Webhook handles updates on the orders table
        if (payload.table !== 'orders') {
            return new Response(JSON.stringify({ message: 'Ignored: Not orders table' }), { status: 200 })
        }

        const newRecord = payload.record
        const oldRecord = payload.old_record

        // Only trigger when status transitions to 'delivered' and has a driver
        if (newRecord.status !== 'delivered' || (oldRecord && oldRecord.status === 'delivered') || !newRecord.driver_id) {
            return new Response(JSON.stringify({ message: 'Ignored: Not transition to delivered or driver missing' }), { status: 200 })
        }

        const courierId = newRecord.driver_id
        const jobId = newRecord.id
        const deliveryFee = parseFloat(newRecord.estimated_cost || '0')

        // Setup Supabase Client
        const supabaseClient = createClient(
            // @ts-ignore
            Deno.env.get('SUPABASE_URL') ?? '',
            // @ts-ignore
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Fetch current commission rate from settings (defaulting to 12%)
        const { data: settingsData, error: settingsError } = await supabaseClient
            .from('system_settings')
            .select('commission_rate')
            .eq('id', 1)
            .single()

        let commissionRate = 0.12 // default 12%
        if (!settingsError && settingsData) {
            commissionRate = parseFloat(settingsData.commission_rate) / 100
        }

        // BUSINESS RULE: Minimum platform charge per job is $2 USD
        const commissionBase = Math.max(deliveryFee, 2.00)
        const commissionAmount = Math.round(commissionBase * commissionRate * 100) / 100

        console.log(`Deducting commission of $${commissionAmount} (${commissionRate * 100}% rate, base fee $${deliveryFee}) for driver ${courierId} on job ${jobId}`)

        // Call database RPC function for atomic deduction
        const { data: rpcResult, error: rpcError } = await supabaseClient.rpc('deduct_commission_rpc', {
            p_courier_id: courierId,
            p_amount: commissionAmount,
            p_job_id: jobId
        })

        if (rpcError) {
            throw rpcError
        }

        // rpcResult returns an array/object with old_balance, new_balance, and new_status
        const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult
        if (!result) {
            throw new Error("RPC returned no result")
        }

        const oldBalance = parseFloat(result.old_balance)
        const newBalance = parseFloat(result.new_balance)
        const newStatus = result.new_status

        console.log(`Commission deducted successfully. Old Balance: $${oldBalance}, New Balance: $${newBalance}, Status: ${newStatus}`)

        // BUSINESS RULE: Warning threshold at <= $3.00, once per crossing only
        if (oldBalance > 3.00 && newBalance <= 3.00) {
            console.log(`Low balance threshold crossed for courier ${courierId}. Triggering notification...`)

            // Fetch courier push token
            const { data: userProfile, error: userError } = await supabaseClient
                .from('users')
                .select('expo_push_token')
                .eq('id', courierId)
                .single()

            if (userError) {
                console.error("Error fetching user push token for low balance warning:", userError.message)
            } else if (userProfile?.expo_push_token) {
                // Trigger Expo push notification
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
                        title: 'Low Wallet Balance ⚠️',
                        body: `Your wallet balance has dropped to $${newBalance.toFixed(2)}. Please top up soon to avoid lockout.`,
                        data: { balance: newBalance },
                    })
                })
                const expoResult = await expoResponse.json()
                console.log("Expo push response for low balance:", expoResult)
            } else {
                console.log(`Courier ${courierId} does not have an active expo_push_token configured. Warning logged to server.`)
            }
        }

        return new Response(JSON.stringify({ success: true, oldBalance, newBalance, newStatus }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        })

    } catch (err) {
        const error = err as Error
        console.error("Error in wallet-deduct-commission Edge Function:", error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        })
    }
})
