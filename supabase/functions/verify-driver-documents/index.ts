// Deno Edge Function: verify-driver-documents
// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
// @ts-ignore
import { encodeBase64 } from "https://deno.land/std@0.207.0/encoding/base64.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const getPrompt = (docType: string) => `You are verifying identity documents for a courier driver application in Zimbabwe. Examine this document image and return ONLY valid JSON:
{
  "document_type": "${docType}",
  "full_name": "extracted name or null",
  "id_number": "extracted number or null", 
  "date_of_birth": "YYYY-MM-DD or null",
  "expiry_date": "YYYY-MM-DD or null",
  "is_expired": boolean,
  "is_legible": boolean,
  "possible_tampering": boolean,
  "confidence": "high" | "medium" | "low"
}
Do not include any text outside the JSON object.`;

serve(async (req: any) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { applicantId, idImageUrl, licenseImageUrl } = await req.json()
        console.log(`Processing document verification for driver: ${applicantId}`)

        const supabaseClient = createClient(
            // @ts-ignore
            Deno.env.get('SUPABASE_URL') ?? '',
            // @ts-ignore
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 1. Check if Document Verification is enabled
        const { data: settingData, error: settingError } = await supabaseClient
            .from('app_settings')
            .select('enabled')
            .eq('feature_key', 'document_verification_enabled')
            .single()

        if (settingError && settingError.code !== 'PGRST116') {
            throw settingError
        }

        const enabled = settingData?.enabled ?? false

        if (!enabled) {
            console.log("Document verification is disabled. Skipping AI scan.")
            
            // Upsert application as skipped
            const { error: upsertError } = await supabaseClient
                .from('driver_applications')
                .upsert({
                    id: applicantId,
                    id_verification_status: 'skipped',
                    license_verification_status: 'skipped',
                    verification_flags: ['AI Document Verification disabled'],
                    updated_at: new Date().toISOString()
                })

            if (upsertError) throw upsertError

            return new Response(JSON.stringify({ skipped: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            })
        }

        // 2. Fetch images and convert to base64
        const getPathFromUrl = (url: string) => {
            if (!url) return ''
            const parts = url.split('/verification-docs/')
            return parts.length > 1 ? parts[1] : url
        }

        let idBase64 = null
        let licenseBase64 = null

        if (idImageUrl) {
            console.log(`Downloading ID image from path: ${getPathFromUrl(idImageUrl)}`)
            const { data: fileData, error: downloadError } = await supabaseClient.storage
                .from('verification-docs')
                .download(getPathFromUrl(idImageUrl))
            
            if (downloadError) {
                console.error("ID download error:", downloadError)
            } else {
                const arrayBuffer = await fileData.arrayBuffer()
                idBase64 = encodeBase64(new Uint8Array(arrayBuffer))
            }
        }

        if (licenseImageUrl) {
            console.log(`Downloading License image from path: ${getPathFromUrl(licenseImageUrl)}`)
            const { data: fileData, error: downloadError } = await supabaseClient.storage
                .from('verification-docs')
                .download(getPathFromUrl(licenseImageUrl))

            if (downloadError) {
                console.error("License download error:", downloadError)
            } else {
                const arrayBuffer = await fileData.arrayBuffer()
                licenseBase64 = encodeBase64(new Uint8Array(arrayBuffer))
            }
        }

        const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
        if (!anthropicKey) {
            throw new Error("Missing ANTHROPIC_API_KEY secret")
        }

        const callClaudeVision = async (base64Data: string, docType: string) => {
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
                            content: [
                                {
                                    type: "image",
                                    source: {
                                        type: "base64",
                                        media_type: "image/jpeg",
                                        data: base64Data
                                    }
                                },
                                {
                                    type: "text",
                                    text: getPrompt(docType)
                                }
                            ]
                        }
                    ]
                })
            })

            if (!response.ok) {
                const errBody = await response.text()
                throw new Error(`Anthropic API returned error: ${response.status} - ${errBody}`)
            }

            const resData = await response.json()
            return resData.content?.[0]?.text || ''
        }

        const parseClaudeResponse = (text: string, defaultDocType: string) => {
            let cleaned = text.trim()
            if (cleaned.startsWith("```json")) {
                cleaned = cleaned.substring(7)
            } else if (cleaned.startsWith("```")) {
                cleaned = cleaned.substring(3)
            }
            if (cleaned.endsWith("```")) {
                cleaned = cleaned.substring(0, cleaned.length - 3)
            }
            cleaned = cleaned.trim()

            try {
                return JSON.parse(cleaned)
            } catch (e) {
                console.error("Failed to parse Claude response:", text, e)
                return {
                    document_type: defaultDocType,
                    full_name: null,
                    id_number: null,
                    date_of_birth: null,
                    expiry_date: null,
                    is_expired: false,
                    is_legible: false,
                    possible_tampering: true,
                    confidence: "low",
                    error: "Failed to parse JSON"
                }
            }
        }

        // 3. Invoke Claude Vision for each document
        let idResult = { document_type: 'national_id', error: 'No ID uploaded' }
        if (idBase64) {
            console.log("Analyzing ID document with Claude...")
            const rawIdResponse = await callClaudeVision(idBase64, 'national_id')
            idResult = parseClaudeResponse(rawIdResponse, 'national_id')
        }

        let licenseResult = { document_type: 'drivers_license', error: 'No License uploaded' }
        if (licenseBase64) {
            console.log("Analyzing License document with Claude...")
            const rawLicenseResponse = await callClaudeVision(licenseBase64, 'drivers_license')
            licenseResult = parseClaudeResponse(rawLicenseResponse, 'drivers_license')
        }

        // 4. Determine status and flags
        const flags: string[] = []
        
        // Check ID flags
        if (idBase64) {
            // @ts-ignore
            if (idResult.possible_tampering) flags.push("ID shows signs of tampering")
            // @ts-ignore
            if (idResult.is_expired) flags.push("ID is expired")
            // @ts-ignore
            if (idResult.is_legible === false) flags.push("ID is blurry or unreadable")
        } else {
            flags.push("Missing National ID document")
        }

        // Check License flags
        if (licenseBase64) {
            // @ts-ignore
            if (licenseResult.possible_tampering) flags.push("License shows signs of tampering")
            // @ts-ignore
            if (licenseResult.is_expired) flags.push("License is expired")
            // @ts-ignore
            if (licenseResult.is_legible === false) flags.push("License is blurry or unreadable")
        } else {
            flags.push("Missing Driver's License document")
        }

        // Check name mismatch (case-insensitive name comparison if both extracted)
        // @ts-ignore
        if (idResult.full_name && licenseResult.full_name) {
            // @ts-ignore
            const name1 = idResult.full_name.toLowerCase().replace(/[^a-z]/g, '')
            // @ts-ignore
            const name2 = licenseResult.full_name.toLowerCase().replace(/[^a-z]/g, '')
            if (name1 !== name2 && !name1.includes(name2) && !name2.includes(name1)) {
                flags.push("Mismatched name between ID and license")
            }
        }

        // Set verification statuses
        // @ts-ignore
        const id_verification_status = (idBase64 && idResult.is_legible && !idResult.is_expired && !idResult.possible_tampering) ? 'verified' : 'flagged'
        // @ts-ignore
        const license_verification_status = (licenseBase64 && licenseResult.is_legible && !licenseResult.is_expired && !licenseResult.possible_tampering) ? 'verified' : 'flagged'

        // 5. Update DB
        const { error: dbError } = await supabaseClient
            .from('driver_applications')
            .upsert({
                id: applicantId,
                // @ts-ignore
                id_verification_status: idResult.error ? 'flagged' : id_verification_status,
                id_extracted_data: idResult,
                // @ts-ignore
                license_verification_status: licenseResult.error ? 'flagged' : license_verification_status,
                license_extracted_data: licenseResult,
                verification_flags: flags,
                updated_at: new Date().toISOString()
            })

        if (dbError) throw dbError

        // 6. Log Audit
        const { error: auditError } = await supabaseClient
            .from('ai_verification_audit')
            .insert({
                driver_id: applicantId,
                feature: 'document_verification',
                verdict: flags.length === 0 ? 'verified' : 'flagged',
                raw_response: { id_document: idResult, drivers_license: licenseResult, flags }
            })

        if (auditError) throw auditError

        return new Response(JSON.stringify({ 
            success: true, 
            id_verification_status, 
            license_verification_status, 
            flags 
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        })

    } catch (err) {
        const error = err as Error
        console.error("Error in verify-driver-documents function:", error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        })
    }
})
