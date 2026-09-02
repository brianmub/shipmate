// Deno Edge Function: clicknpay-topup
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

const CLICKNPAY_BASE_URL = "https://backendservices.clicknpay.africa:2081/payme/orders"

serve(async (req: any) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const body = await req.json()
        const { action = 'create-order', courierId, amount, phoneNumber, clientReference } = body
        console.log(`ClicknPay request received: action=${action}, courierId=${courierId}`)

        // 1. Authenticate the requester using the Authorization header
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

        // Action 1: Create Payment Order
        if (action === 'create-order') {
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

            const uniqueRef = `CP-${courierId.substring(0, 8)}-${Date.now()}`
            const publicUniqueId = Deno.env.get('CLICKNPAY_PUBLIC_UNIQUE_ID') || 'QFUcFtITBUKLzuwNa'
            const returnUrl = Deno.env.get('CLICKNPAY_RETURN_URL') || 'https://shipmate.app/payment-return'
            const customerPhone = phoneNumber || user.phone || '0000000000'

            const clicknPayPayload = {
                channel: "AUTOMATED",
                clientReference: uniqueRef,
                currency: "USD",
                customerCharged: true,
                customerPhoneNumber: customerPhone,
                description: `ShipMate Courier Wallet Top-up - $${grossAmount.toFixed(2)} USD`,
                multiplePayments: true,
                orderYpe: "DYNAMIC",
                productsList: [
                    {
                        id: 1,
                        productName: "ShipMate Wallet Credit",
                        description: `Driver wallet balance top-up for user ${courierId}`,
                        price: grossAmount,
                        quantity: 1
                    }
                ],
                publicUniqueId: publicUniqueId,
                returnUrl: returnUrl
            }

            console.log(`Calling ClicknPay create order: ${CLICKNPAY_BASE_URL}`, JSON.stringify(clicknPayPayload))

            const cnpResponse = await fetch(CLICKNPAY_BASE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(clicknPayPayload)
            })

            const cnpData = await cnpResponse.json()
            console.log(`ClicknPay response:`, cnpData)

            if (!cnpResponse.ok || (cnpData.status && cnpData.status === 'FAILED')) {
                return new Response(JSON.stringify({ 
                    error: cnpData.message || 'Failed to create payment order with ClicknPay',
                    details: cnpData 
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400
                })
            }

            return new Response(JSON.stringify({
                success: true,
                clientReference: uniqueRef,
                paymeURL: cnpData.paymeURL || cnpData.paymeUrl || cnpData.url || '',
                grossAmount: grossAmount,
                orderData: cnpData
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            })
        }

        // Action 2: Verify Payment Status & Credit Wallet
        if (action === 'verify-status') {
            if (!clientReference) {
                return new Response(JSON.stringify({ error: 'Missing clientReference' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400
                })
            }

            const statusUrl = `${CLICKNPAY_BASE_URL}/top-paid/${encodeURIComponent(clientReference)}`
            console.log(`Checking ClicknPay status at: ${statusUrl}`)

            const statusRes = await fetch(statusUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            })

            const statusData = await statusRes.json()
            console.log(`ClicknPay status data:`, statusData)

            const paymentStatus = (statusData.status || '').toUpperCase()

            if (paymentStatus === 'SUCCESS') {
                const rawAmount = statusData.productsList?.[0]?.price || amount
                const grossAmount = parseFloat(rawAmount) || 5.00
                // Calculate fee (e.g. 2.5% processing fee or as needed)
                const processingFee = Math.round((grossAmount * 0.025 + 0.20) * 100) / 100
                const netAmount = Math.max(0, Math.round((grossAmount - processingFee) * 100) / 100)

                // Service client to update wallet atomically
                const serviceClient = createClient(supabaseUrl, supabaseServiceKey)
                const { data: newBalance, error: topupError } = await serviceClient.rpc('topup_wallet_rpc', {
                    p_courier_id: courierId,
                    p_gross_amount: grossAmount,
                    p_net_amount: netAmount
                })

                if (topupError) {
                    throw topupError
                }

                return new Response(JSON.stringify({
                    success: true,
                    status: 'SUCCESS',
                    grossAmount,
                    fee: processingFee,
                    netAmount,
                    newBalance: parseFloat(newBalance),
                    clicknPayDetails: statusData
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200
                })
            } else {
                return new Response(JSON.stringify({
                    success: false,
                    status: paymentStatus || 'PENDING',
                    message: `Payment is currently ${paymentStatus || 'PENDING'}`,
                    clicknPayDetails: statusData
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200
                })
            }
        }

        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
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
