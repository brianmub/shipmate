// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface MilestonePayload {
    order_id: string;
    status: string;
    override_phone?: string;
    custom_message?: string;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const body: MilestonePayload = await req.json();
        const { order_id, status } = body;

        if (!order_id || !status) {
            return new Response(
                JSON.stringify({ error: 'order_id and status are required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 1. Fetch order details
        const { data: order, error: orderErr } = await supabase
            .from('orders')
            .select(`
                id,
                order_number,
                status,
                service_type,
                customer_id,
                driver_id,
                pickup_address,
                dropoff_address,
                recipient_name,
                recipient_phone,
                recipient_notes,
                sms_notifications_enabled,
                sms_notification_fee,
                estimated_cost
            `)
            .eq('id', order_id)
            .single();

        if (orderErr || !order) {
            return new Response(
                JSON.stringify({ error: 'Order not found', details: orderErr?.message }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 2. Fetch Customer info
        const { data: customer } = await supabase
            .from('users')
            .select('id, full_name, phone, expo_push_token')
            .eq('id', order.customer_id)
            .single();

        // 3. Fetch Driver info if assigned
        let driverName = 'Your Mate';
        let driverPhone = '';
        if (order.driver_id) {
            const { data: driver } = await supabase
                .from('users')
                .select('id, full_name, phone')
                .eq('id', order.driver_id)
                .single();
            if (driver) {
                driverName = driver.full_name || 'Your Mate';
                driverPhone = driver.phone || '';
            }
        }

        const shortOrderNum = order.order_number || order.id.slice(0, 6).toUpperCase();
        const serviceLabel = order.service_type === 'delivery' ? 'delivery' : 'errand';

        // 4. Milestone template generator
        let pushTitle = '';
        let pushBody = '';
        let smsText = '';

        switch (status) {
            case 'driver_assigned':
                pushTitle = `🚗 Mate Assigned!`;
                pushBody = `${driverName} has accepted your ${serviceLabel} and is on the way to pickup!`;
                smsText = `ShipMate: Courier ${driverName} is assigned to order #${shortOrderNum} and is heading to pickup. Track: https://shipmate.app/track/${order.id}`;
                break;
            case 'en_route_to_pickup':
                pushTitle = `🚗 En Route to Pickup`;
                pushBody = `${driverName} is heading to the pickup spot.`;
                smsText = `ShipMate: Courier ${driverName} is en route to the pickup location for order #${shortOrderNum}.`;
                break;
            case 'arrived_at_pickup':
                pushTitle = `📍 Arrived at Pickup`;
                pushBody = `Your Mate has arrived at the pickup location.`;
                smsText = `ShipMate: Your courier ${driverName} has arrived at the pickup location.`;
                break;
            case 'picked_up':
                pushTitle = `📦 Package Picked Up!`;
                pushBody = `Your Mate is on their way to the delivery address.`;
                smsText = `ShipMate: Your package has been picked up by ${driverName} and is en route to ${order.dropoff_address || 'your destination'}.`;
                break;
            case 'en_route_to_delivery':
                pushTitle = `🚀 En Route to Delivery`;
                pushBody = `${driverName} is driving to your delivery point.`;
                smsText = `ShipMate: ${driverName} is heading towards your delivery destination.`;
                break;
            case 'arrived_at_delivery':
                pushTitle = `🔔 Mate Arrived at Gate!`;
                pushBody = `Your courier is outside at the gate! Please meet your Mate to collect the parcel.`;
                smsText = `ShipMate: 🔔 Courier ${driverName} is outside at your gate! Please meet them to receive order #${shortOrderNum}.`;
                break;
            case 'delivered':
                pushTitle = `🎉 Package Delivered!`;
                pushBody = `Your delivery is complete. Please verify and confirm receipt!`;
                smsText = `ShipMate: Your delivery #${shortOrderNum} has been completed by ${driverName}. Thank you for using ShipMate!`;
                break;
            default:
                pushTitle = `ShipMate Order Update`;
                pushBody = `Your order status changed to ${status.replace(/_/g, ' ')}.`;
                smsText = `ShipMate: Order #${shortOrderNum} status is now ${status.replace(/_/g, ' ')}.`;
                break;
        }

        let pushResult: any = null;
        let smsResult: any = null;

        // 5. Send In-App Expo Push Notification (100% Free)
        if (customer?.expo_push_token) {
            try {
                const pushRes = await fetch(EXPO_PUSH_URL, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Accept-encoding': 'gzip, deflate',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        to: customer.expo_push_token,
                        sound: 'default',
                        priority: 'high',
                        channelId: 'default',
                        title: pushTitle,
                        body: pushBody,
                        data: {
                            orderId: order.id,
                            status,
                            driverName,
                            screen: 'CustomerTracking'
                        }
                    })
                });
                pushResult = await pushRes.json();

                // Log Push in order_notifications
                await supabase.from('order_notifications').insert([{
                    order_id: order.id,
                    recipient_type: 'customer',
                    channel: 'push',
                    milestone: status,
                    destination: customer.expo_push_token,
                    title: pushTitle,
                    body: pushBody,
                    status: 'sent',
                    cost_billed: 0.00,
                    provider_response: pushResult
                }]);
            } catch (pErr: any) {
                console.warn('Push notification delivery error:', pErr?.message);
            }
        }

        // 6. Send Paid SMS / WhatsApp (Only if customer opted in and paid the add-on fee)
        const isSmsOptedIn = order.sms_notifications_enabled === true;
        const targetPhone = order.recipient_phone || customer?.phone;

        if (isSmsOptedIn && targetPhone) {
            console.log(`Paid SMS/WhatsApp opted-in for order ${order.id}. Dispatching to ${targetPhone}...`);
            
            // Check gateway credentials (Africa's Talking / Twilio / Mock)
            const atApiKey = Deno.env.get('AFRICASTALKING_API_KEY');
            const atUsername = Deno.env.get('AFRICASTALKING_USERNAME') || 'sandbox';
            const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
            const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
            const twilioFrom = Deno.env.get('TWILIO_PHONE_NUMBER');

            let providerUsed = 'mock_gateway';
            let deliveryStatus = 'delivered_mock';

            if (atApiKey) {
                // Africa's Talking API
                try {
                    providerUsed = 'africastalking';
                    const formBody = new URLSearchParams();
                    formBody.append('username', atUsername);
                    formBody.append('to', targetPhone);
                    formBody.append('message', smsText);

                    const atRes = await fetch('https://api.africastalking.com/version1/messaging', {
                        method: 'POST',
                        headers: {
                            'apiKey': atApiKey,
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Accept': 'application/json'
                        },
                        body: formBody.toString()
                    });
                    smsResult = await atRes.json();
                    deliveryStatus = atRes.ok ? 'sent' : 'failed';
                } catch (atErr: any) {
                    console.error('AfricaTalking SMS error:', atErr);
                    deliveryStatus = 'failed';
                    smsResult = { error: atErr.message };
                }
            } else if (twilioSid && twilioToken && twilioFrom) {
                // Twilio SMS API
                try {
                    providerUsed = 'twilio';
                    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
                    const formData = new URLSearchParams();
                    formData.append('To', targetPhone);
                    formData.append('From', twilioFrom);
                    formData.append('Body', smsText);

                    const twRes = await fetch(twilioUrl, {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioToken}`),
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: formData.toString()
                    });
                    smsResult = await twRes.json();
                    deliveryStatus = twRes.ok ? 'sent' : 'failed';
                } catch (twErr: any) {
                    console.error('Twilio SMS error:', twErr);
                    deliveryStatus = 'failed';
                    smsResult = { error: twErr.message };
                }
            } else {
                // Development / Simulated Gateway Adapter
                console.log(`[SIMULATED SMS/WHATSAPP] Destination: ${targetPhone} | Message: "${smsText}"`);
                smsResult = {
                    simulated: true,
                    destination: targetPhone,
                    carrier: 'Econet/NetOne/Telecel',
                    message: smsText,
                    timestamp: new Date().toISOString()
                };
            }

            // Record in audit ledger
            await supabase.from('order_notifications').insert([{
                order_id: order.id,
                recipient_type: order.recipient_phone ? 'recipient' : 'customer',
                channel: 'sms',
                milestone: status,
                destination: targetPhone,
                title: pushTitle,
                body: smsText,
                status: deliveryStatus,
                cost_billed: Number(order.sms_notification_fee) || 0.25,
                provider_response: { provider: providerUsed, result: smsResult }
            }]);
        } else {
            console.log(`SMS updates not enabled for order ${order.id}. Zero SMS gateway cost incurred.`);
        }

        return new Response(
            JSON.stringify({
                success: true,
                order_id,
                milestone: status,
                push_dispatched: !!customer?.expo_push_token,
                sms_opted_in: isSmsOptedIn,
                sms_dispatched: isSmsOptedIn && !!targetPhone,
                push_title: pushTitle,
                push_body: pushBody,
                sms_body: smsText
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (err: any) {
        console.error('notify-milestone error:', err);
        return new Response(
            JSON.stringify({ error: err.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
