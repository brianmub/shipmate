// Deno Edge Function: driver-prescreen
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
        const { applicantId, conversationHistory } = await req.json()
        console.log(`Processing pre-screening evaluation for driver: ${applicantId}`)

        const supabaseClient = createClient(
            // @ts-ignore
            Deno.env.get('SUPABASE_URL') ?? '',
            // @ts-ignore
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 1. Check if Pre-Screening Chat is enabled
        const { data: settingData, error: settingError } = await supabaseClient
            .from('app_settings')
            .select('enabled')
            .eq('feature_key', 'prescreening_chat_enabled')
            .single()

        if (settingError && settingError.code !== 'PGRST116') {
            throw settingError
        }

        const enabled = settingData?.enabled ?? false

        if (!enabled) {
            console.log("Pre-screening chat is disabled. Skipping AI evaluation.")
            
            // Upsert application as skipped
            const { error: upsertError } = await supabaseClient
                .from('driver_applications')
                .upsert({
                    id: applicantId,
                    screening_status: 'skipped',
                    updated_at: new Date().toISOString()
                })

            if (upsertError) throw upsertError

            return new Response(JSON.stringify({ skipped: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            })
        }

        // 2. Call Claude API to evaluate transcript
        const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
        if (!anthropicKey) {
            throw new Error("Missing ANTHROPIC_API_KEY secret")
        }

        // Format Q&A history
        const formattedTranscript = conversationHistory
            .map((msg: any) => `${msg.role.toUpperCase()}: ${msg.content}`)
            .join('\n\n')

        const prompt = `You are screening a courier driver applicant for Shipmate, a parcel delivery app in Zimbabwe. Review this Q&A transcript and return ONLY valid JSON:
{
  "verdict": "approve" | "flag_for_review" | "reject",
  "reasoning": "1-2 sentence explanation",
  "vehicle_type": "extracted vehicle type",
  "coverage_area": "extracted coverage area",
  "concerns": ["list any red flags, or empty array"]
}
Transcript: 
${formattedTranscript}

Do not include any text outside the JSON object.`

        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "x-api-key": anthropicKey,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            },
            body: JSON.stringify({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 1024,
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ]
            })
        })

        if (!response.ok) {
            const errBody = await response.text()
            throw new Error(`Anthropic API returned error: ${response.status} - ${errBody}`)
        }

        const resData = await response.json()
        const responseText = resData.content?.[0]?.text || ''

        // Clean and parse
        let cleaned = responseText.trim()
        if (cleaned.startsWith("```json")) {
            cleaned = cleaned.substring(7)
        } else if (cleaned.startsWith("```")) {
            cleaned = cleaned.substring(3)
        }
        if (cleaned.endsWith("```")) {
            cleaned = cleaned.substring(0, cleaned.length - 3)
        }
        cleaned = cleaned.trim()

        let parsedResult
        try {
            parsedResult = JSON.parse(cleaned)
        } catch (e) {
            console.error("Failed to parse Claude evaluation response:", responseText, e)
            parsedResult = {
                verdict: 'flag_for_review',
                reasoning: 'Failed to parse AI evaluation response json.',
                vehicle_type: 'unknown',
                coverage_area: 'unknown',
                concerns: ['AI evaluation parsing failure']
            }
        }

        // Validate verdict enum
        const validVerdicts = ['approve', 'flag_for_review', 'reject']
        const finalVerdict = validVerdicts.includes(parsedResult.verdict) 
            ? parsedResult.verdict 
            : 'flag_for_review'

        // 3. Update DB
        const { error: dbError } = await supabaseClient
            .from('driver_applications')
            .upsert({
                id: applicantId,
                screening_status: 'completed',
                screening_transcript: conversationHistory,
                screening_verdict: finalVerdict,
                screening_reasoning: parsedResult.reasoning || 'No reasoning provided',
                vehicle_type: parsedResult.vehicle_type || 'unknown',
                coverage_area: parsedResult.coverage_area || 'unknown',
                screening_concerns: parsedResult.concerns || [],
                updated_at: new Date().toISOString()
            })

        if (dbError) throw dbError

        // 4. Log Audit
        const { error: auditError } = await supabaseClient
            .from('ai_verification_audit')
            .insert({
                driver_id: applicantId,
                feature: 'prescreening_chat',
                verdict: finalVerdict,
                raw_response: parsedResult
            })

        if (auditError) throw auditError

        return new Response(JSON.stringify({ 
            success: true, 
            verdict: finalVerdict, 
            reasoning: parsedResult.reasoning,
            concerns: parsedResult.concerns
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        })

    } catch (err) {
        const error = err as Error
        console.error("Error in driver-prescreen function:", error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        })
    }
})
