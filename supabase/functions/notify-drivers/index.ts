// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const expoPushURL = 'https://exp.host/--/api/v2/push/send'

serve(async (req: any) => {
    try {
        const payload = await req.json()
        console.log("Webhook payload received:", payload)

        // Ensure this is an insert into the orders table
        if (payload.type !== 'INSERT' || payload.table !== 'orders') {
            return new Response(JSON.stringify({ message: 'Ignored: Not a new order' }), { status: 200 })
        }

        const newOrder = payload.record

        // Setup Supabase client to fetch drivers
        const supabaseClient = createClient(
            // @ts-ignore
            Deno.env.get('SUPABASE_URL') ?? '',
            // @ts-ignore
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Fetch all push tokens for users who are 'driver'
        const { data: drivers, error } = await supabaseClient
            .from('users')
            .select('expo_push_token')
            .eq('role', 'driver')
            .not('expo_push_token', 'is', null)

        if (error) {
            throw error;
        }

        if (!drivers || drivers.length === 0) {
            return new Response(JSON.stringify({ message: 'No drivers with push tokens found.' }), { status: 200 })
        }

        // Prepare notifications formatted for Expo
        const notifications = drivers.map((driver: any) => ({
            to: driver.expo_push_token,
            sound: 'default',
            title: 'New Delivery Request! 🚚',
            body: `A new ${newOrder.service_type} is available. Earn $${newOrder.estimated_cost}.`,
            data: { orderId: newOrder.id }, // Optional data to handle when clicked
        }))

        // Send to Expo Push API
        const expoResponse = await fetch(expoPushURL, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(notifications),
        })

        const expoResult = await expoResponse.json()
        console.log("Expo Push API result:", expoResult)

        return new Response(JSON.stringify({ success: true, expoResult }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
        })
    } catch (err) {
        const error = err as Error;
        console.error("Error in notify-drivers function:", error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { "Content-Type": "application/json" },
            status: 400,
        })
    }
})
