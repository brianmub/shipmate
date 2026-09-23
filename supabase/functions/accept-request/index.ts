// Deno Edge Function: accept-request
// Step 5 of ShipMate live presence + bidding feature
// @ts-ignore
declare const Deno: any;
// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
    // 1. Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        if (req.method !== 'POST') {
            return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                status: 405,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
        const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

        if (!supabaseUrl || !supabaseServiceRoleKey) {
            return new Response(JSON.stringify({ error: 'Server configuration error' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

        // 2. Parse request payload
        let body: any = {};
        try {
            body = await req.json();
        } catch {
            return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const { request_id, mate_id, accepted_amount } = body;

        // 3. Input Validation
        if (!request_id || typeof request_id !== 'string') {
            return new Response(JSON.stringify({ error: 'Valid request_id is required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (!mate_id || typeof mate_id !== 'string') {
            return new Response(JSON.stringify({ error: 'Valid mate_id is required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const amountNum = Number(accepted_amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            return new Response(JSON.stringify({ error: 'accepted_amount must be greater than 0' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const nowIso = new Date().toISOString();

        // 4. Atomic Conditional Update:
        // Update requests SET status = 'accepted', accepted_mate_id = :mate_id, accepted_amount = :accepted_amount
        // WHERE id = :request_id AND status = 'searching' AND (expires_at IS NULL OR expires_at > now())
        const { data: updatedRows, error: updateError } = await supabaseAdmin
            .from('requests')
            .update({
                status: 'accepted',
                accepted_mate_id: mate_id,
                accepted_amount: amountNum,
            })
            .eq('id', request_id)
            .eq('status', 'searching')
            .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
            .select('id, customer_id, accepted_mate_id, accepted_amount, status, expires_at');

        if (updateError) {
            console.error('Update error on requests:', updateError);
            return new Response(JSON.stringify({ error: updateError.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // 5. Check affected row count
        // - 1 row affected: SUCCESS. Broadcast request_accepted, return 200 + mate details.
        // - 0 rows affected: CONFLICT. Request already accepted, expired, or cancelled. Return 409.
        if (updatedRows && updatedRows.length === 1) {
            const acceptedRequest = updatedRows[0];

            // Fetch winning Mate details
            const { data: mateProfile } = await supabaseAdmin
                .from('users')
                .select('id, full_name, phone, profile_photo_url')
                .eq('id', mate_id)
                .maybeSingle();

            // Broadcast request_accepted on channel request:{requestId}
            try {
                const channel = supabaseAdmin.channel(`request:${request_id}`);
                await channel.send({
                    type: 'broadcast',
                    event: 'request_accepted',
                    payload: {
                        request_id,
                        mate_id,
                        accepted_amount: amountNum,
                        status: 'accepted',
                        mate_name: mateProfile?.full_name || 'Courier',
                        mate_avatar: mateProfile?.profile_photo_url || null,
                    },
                });
                await supabaseAdmin.removeChannel(channel);
            } catch (broadcastErr) {
                console.warn('Realtime broadcast warning:', broadcastErr);
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    message: 'Request accepted successfully',
                    request: acceptedRequest,
                    mate: mateProfile || { id: mate_id, full_name: 'Courier' },
                }),
                {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                }
            );
        } else {
            // 0 rows affected: Already accepted, expired, or cancelled.
            // Check-on-read: mark as expired if expires_at has passed
            try {
                await supabaseAdmin
                    .from('requests')
                    .update({ status: 'expired' })
                    .eq('id', request_id)
                    .eq('status', 'searching')
                    .lte('expires_at', nowIso);
            } catch (expireErr) {
                console.warn('Check-on-read expiration note:', expireErr);
            }

            return new Response(
                JSON.stringify({
                    error: 'This driver just became unavailable, please pick another',
                    code: 'REQUEST_ALREADY_ACCEPTED_OR_EXPIRED',
                }),
                {
                    status: 409,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                }
            );
        }
    } catch (err: any) {
        console.error('Unhandled accept-request error:', err);
        return new Response(
            JSON.stringify({ error: err.message || 'Internal server error' }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    }
});
