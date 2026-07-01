// Deno Edge Function: clicknpay-topup
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
        const { courierId, amount, cardToken } = await req.json()
        console.log(`Top-up request received for courier: ${courierId}, amount: $${amount}`)

        // 1. Validate inputs
        if (!courierId || !amount) {
            return new Response(JSON.stringify({ error: 'Missing courierId or amount' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400
            })
        }

        const grossAmount = parseFloat(amount)
        if (isNaN(grossAmount) || grossAmount < 5.00) {
            return new Response(JSON.stringify({ error: 'Minimum top-up amount is $5.00 USD' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400
            })
        }

        // 2. Authenticate the requester using the Authorization header
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401
            })
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

        // Create client with user's JWT to authenticate them
        const userClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } }
        })

        const { data: { user }, error: authError } = await userClient.auth.getUser()
        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized user session' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401
            })
        }

        // Ensure user is topping up their own wallet, or is an admin
        if (user.id !== courierId) {
            const { data: userRoleData } = await userClient
                .from('users')
                .select('role')
                .eq('id', user.id)
                .single()
            
            if (userRoleData?.role !== 'admin') {
                return new Response(JSON.stringify({ error: 'Access denied: Cannot modify other wallets' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403
                })
            }
        }

        // 3. Simulate ClickNPay Card Charge & Fee Deduction
        // Business Rule: If ClickNPay deducts a processing fee, credit the net amount.
        // Simulated Fee structure: 2.5% + $0.20 USD
        const simulatedFee = Math.round((grossAmount * 0.025 + 0.20) * 100) / 100
        const netAmount = Math.max(0, Math.round((grossAmount - simulatedFee) * 100) / 100)

        console.log(`ClickNPay simulation: Gross $${grossAmount}, Fee $${simulatedFee}, Net $${netAmount}`)

        // 4. Create Service Role Client to bypass RLS restrictions and credit balance
        const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

        // Call atomic topup database RPC
        const { data: newBalance, error: topupError } = await serviceClient.rpc('topup_wallet_rpc', {
            p_courier_id: courierId,
            p_gross_amount: grossAmount,
            p_net_amount: netAmount
        })

        if (topupError) {
            throw topupError
        }

        console.log(`Topup credited successfully. New balance: $${newBalance}`)

        return new Response(JSON.stringify({
            success: true,
            grossAmount,
            fee: simulatedFee,
            netAmount,
            newBalance: parseFloat(newBalance)
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        })

    } catch (err) {
        const error = err as Error
        console.error("Error in clicknpay-topup Edge Function:", error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        })
    }
})
