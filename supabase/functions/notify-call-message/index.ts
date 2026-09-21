// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface CallMessagePayload {
    order_id?: string;
    orderId?: string;
    event_type?: 'call' | 'message' | 'sms' | 'in_app_call' | 'in_app_message';
    eventType?: 'call' | 'message' | 'sms' | 'in_app_call' | 'in_app_message';
    caller_id?: string;
    callerId?: string;
    caller_name?: string;
    callerName?: string;
    caller_role?: 'driver' | 'customer';
    callerRole?: 'driver' | 'customer';
    sender_id?: string;
    senderId?: string;
    sender_name?: string;
    senderName?: string;
    sender_role?: 'driver' | 'customer';
    senderRole?: 'driver' | 'customer';
    message_text?: string;
    messageText?: string;
    // Telephony Webhook Provider fields (Twilio / Africa's Talking)
    From?: string;
    To?: string;
    Body?: string;
    CallSid?: string;
    MessageSid?: string;
    SmsSid?: string;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        let body: CallMessagePayload = {};
        const contentType = req.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            body = await req.json();
        } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
            const formData = await req.formData();
            const entries: Record<string, any> = {};
            for (const [key, value] of formData.entries()) {
                entries[key] = value;
            }
            body = entries;
        } else {
            // Attempt json fallback
            try {
                body = await req.json();
            } catch {
                body = {};
            }
        }

        console.log('notify-call-message received payload:', JSON.stringify(body));

        let orderId = body.order_id || body.orderId;
        const rawEvent = (body.event_type || body.eventType || '').toLowerCase();
        const isCall = rawEvent === 'call' || rawEvent === 'in_app_call' || !!body.CallSid;
        const isMessage = rawEvent === 'message' || rawEvent === 'sms' || rawEvent === 'in_app_message' || !!body.MessageSid || !!body.SmsSid;

        let callerOrSenderId = body.caller_id || body.callerId || body.sender_id || body.senderId;
        let callerOrSenderRole = body.caller_role || body.callerRole || body.sender_role || body.senderRole;
        let callerOrSenderName = body.caller_name || body.callerName || body.sender_name || body.senderName;
        const messageContent = body.message_text || body.messageText || body.Body || '';

        // 1. Resolve active order if orderId is missing (e.g. Inbound Telephony Webhook from provider)
        if (!orderId && body.From) {
            const cleanFrom = body.From.replace(/\s+/g, '').replace('+', '');
            const { data: matchedOrders, error: matchErr } = await supabase
                .from('orders')
                .select('id, order_number, customer_id, driver_id, customer_phone, driver_phone, status')
                .in('status', ['driver_assigned', 'en_route_to_pickup', 'arrived_at_pickup', 'picked_up', 'en_route_to_delivery', 'arrived_at_delivery'])
                .order('updated_at', { ascending: false })
                .limit(5);

            if (!matchErr && matchedOrders && matchedOrders.length > 0) {
                const found = matchedOrders.find((o: any) => {
                    const cPhone = (o.customer_phone || '').replace(/\s+/g, '').replace('+', '');
                    const dPhone = (o.driver_phone || '').replace(/\s+/g, '').replace('+', '');
                    return (cPhone && (cPhone.includes(cleanFrom) || cleanFrom.includes(cPhone))) ||
                           (dPhone && (dPhone.includes(cleanFrom) || cleanFrom.includes(dPhone)));
                });

                if (found) {
                    orderId = found.id;
                    const cPhone = (found.customer_phone || '').replace(/\s+/g, '').replace('+', '');
                    if (cPhone && (cPhone.includes(cleanFrom) || cleanFrom.includes(cPhone))) {
                        callerOrSenderRole = 'customer';
                        callerOrSenderId = found.customer_id;
                    } else {
                        callerOrSenderRole = 'driver';
                        callerOrSenderId = found.driver_id;
                    }
                }
            }
        }

        if (!orderId) {
            return new Response(
                JSON.stringify({ error: 'Valid order_id could not be determined for this event.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 2. Fetch full order details
        const { data: order, error: orderErr } = await supabase
            .from('orders')
            .select(`
                id,
                order_number,
                status,
                customer_id,
                driver_id,
                customer_phone,
                driver_phone
            `)
            .eq('id', orderId)
            .single();

        if (orderErr || !order) {
            return new Response(
                JSON.stringify({ error: 'Order not found', details: orderErr?.message }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 3. Resolve Counterparty (Recipient)
        let recipientId: string | null = null;
        let recipientRole: 'driver' | 'customer' = 'customer';

        if (callerOrSenderRole === 'driver' || callerOrSenderId === order.driver_id) {
            recipientId = order.customer_id;
            recipientRole = 'customer';
            callerOrSenderRole = 'driver';
        } else {
            recipientId = order.driver_id;
            recipientRole = 'driver';
            callerOrSenderRole = 'customer';
        }

        if (!recipientId) {
            return new Response(
                JSON.stringify({ error: 'No counterparty recipient found for order (driver may not be assigned yet).' }),
                { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 4. Fetch Recipient Profile & Push Token
        const { data: recipientUser } = await supabase
            .from('users')
            .select('id, full_name, phone, expo_push_token')
            .eq('id', recipientId)
            .single();

        // 5. Fetch Caller Name if not provided
        if (!callerOrSenderName && callerOrSenderId) {
            const { data: callerUser } = await supabase
                .from('users')
                .select('full_name')
                .eq('id', callerOrSenderId)
                .single();
            if (callerUser?.full_name) {
                callerOrSenderName = callerUser.full_name;
            }
        }

        if (!callerOrSenderName) {
            callerOrSenderName = callerOrSenderRole === 'driver' ? 'Your Mate' : 'Customer';
        }

        const shortOrderNum = order.order_number || order.id.slice(0, 8).toUpperCase();

        // 6. Build Notification Content
        let pushTitle = '';
        let pushBody = '';
        let pushChannel = 'default';
        let pushData: Record<string, any> = {};

        if (isCall) {
            pushTitle = `📞 Incoming Call from ${callerOrSenderName}`;
            pushBody = `Order #${shortOrderNum}: Tap to answer in-app call`;
            pushChannel = 'incoming-calls';
            pushData = {
                type: 'in_app_call',
                orderId: order.id,
                callerId: callerOrSenderId,
                callerName: callerOrSenderName,
                callerRole: callerOrSenderRole,
                recipientRole,
                channelName: `order_call_${order.id}`
            };

            // Log initiated call into masked_call_logs
            try {
                await supabase.from('masked_call_logs').insert([{
                    order_id: order.id,
                    caller_id: callerOrSenderId || null,
                    caller_role: callerOrSenderRole,
                    recipient_id: recipientId,
                    recipient_phone: recipientUser?.phone || (recipientRole === 'customer' ? order.customer_phone : order.driver_phone),
                    masked_proxy_number: '+2638677000123',
                    status: 'initiated',
                    duration_seconds: 0,
                    trigger_event: 'in_app_call'
                }]);
            } catch (cLogErr: any) {
                console.warn('Non-blocking call log insert error:', cLogErr?.message);
            }
        } else {
            // Message / SMS
            pushTitle = `💬 ${callerOrSenderName}`;
            pushBody = messageContent || 'New message received regarding your delivery.';
            pushChannel = 'default';
            pushData = {
                type: 'in_app_message',
                orderId: order.id,
                senderId: callerOrSenderId,
                senderName: callerOrSenderName,
                senderRole: callerOrSenderRole,
                recipientRole,
                messageText: messageContent
            };

            // If this was an inbound SMS webhook, also persist into order_messages
            if (body.MessageSid || body.SmsSid || body.Body) {
                try {
                    await supabase.from('order_messages').insert([{
                        order_id: order.id,
                        sender_id: callerOrSenderId || recipientId,
                        message_text: messageContent
                    }]);
                } catch (mErr: any) {
                    console.warn('Non-blocking message store error:', mErr?.message);
                }
            }
        }

        let pushDispatched = false;
        let providerResponse: any = null;

        // 7. Dispatch High-Priority Expo Push Notification
        if (recipientUser?.expo_push_token) {
            try {
                const pushPayload = {
                    to: recipientUser.expo_push_token,
                    sound: 'default',
                    priority: 'high',
                    channelId: pushChannel,
                    title: pushTitle,
                    body: pushBody,
                    data: pushData
                };

                const pushRes = await fetch(EXPO_PUSH_URL, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Accept-encoding': 'gzip, deflate',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(pushPayload)
                });

                providerResponse = await pushRes.json();
                pushDispatched = pushRes.ok;

                // Log into public.order_notifications
                await supabase.from('order_notifications').insert([{
                    order_id: order.id,
                    recipient_type: recipientRole,
                    channel: 'push',
                    milestone: isCall ? 'in_app_call' : 'in_app_message',
                    destination: recipientUser.expo_push_token,
                    title: pushTitle,
                    body: pushBody,
                    status: 'sent',
                    cost_billed: 0.00,
                    provider_response: providerResponse
                }]);

                console.log(`Dispatched ${isCall ? 'call' : 'message'} push notification to ${recipientRole} (${recipientUser.id}):`, providerResponse);
            } catch (pushErr: any) {
                console.error('Expo push dispatch failed:', pushErr?.message);
                providerResponse = { error: pushErr?.message };
            }
        } else {
            console.log(`Recipient ${recipientUser?.full_name || recipientId} (${recipientRole}) does not have an active expo_push_token.`);
        }

        return new Response(
            JSON.stringify({
                success: true,
                order_id: order.id,
                event_type: isCall ? 'call' : 'message',
                push_dispatched: pushDispatched,
                recipient_role: recipientRole,
                recipient_id: recipientId,
                recipient_has_token: !!recipientUser?.expo_push_token,
                push_title: pushTitle,
                push_body: pushBody,
                provider_response: providerResponse
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (err: any) {
        console.error('notify-call-message error:', err);
        return new Response(
            JSON.stringify({ error: err.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
