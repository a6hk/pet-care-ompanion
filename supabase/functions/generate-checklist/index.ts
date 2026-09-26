import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

interface ChecklistItem {
  title: string
  due_time: string | null
}

interface GenerateRequest {
  type: 'routine' | 'vet'
  petName: string
  species: string
  breed?: string
  instructions?: string
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const body: GenerateRequest = await req.json()

    if (!body.type || !body.petName || !body.species) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: type, petName, species' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')

    if (!openrouterKey) {
      return new Response(
        JSON.stringify({ error: 'AI service is not configured. Please add an OpenRouter API key.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let systemPrompt: string
    let userPrompt: string

    if (body.type === 'routine') {
      systemPrompt = `You are a pet care expert. Generate a practical daily and monthly care checklist for a pet based on its species and breed. Return ONLY a JSON object with this exact format: {"title": "Checklist title", "items": [{"title": "Task description", "due_time": "HH:MM or null"}]}. Use 24-hour time format for due_time if applicable. Include 6-12 items covering feeding, walking/exercise, grooming, health checks, and any breed-specific needs. For monthly items, set due_time to null. Keep titles concise and actionable.`

      userPrompt = `Create a care checklist for a ${body.species}${body.breed ? ` (breed: ${body.breed})` : ''} named ${body.petName}. Include both daily recurring tasks (with appropriate times) and monthly tasks (with null due_time). Focus on practical, species-appropriate care.`
    } else {
      systemPrompt = `You are a veterinary assistant. Convert the given vet instructions or prescription into a clear, step-by-step checklist. Return ONLY a JSON object with this exact format: {"title": "Checklist title", "items": [{"title": "Task description", "due_time": "HH:MM or null"}]}. Use 24-hour time format for due_time if a specific time is mentioned. Break down medications, treatments, and care instructions into individual actionable items. If a duration is mentioned (e.g., "for 7 days"), note it in the title. Keep titles concise and actionable.`

      userPrompt = `Convert these vet instructions for ${body.petName} (${body.species}) into a checklist:\n\n${body.instructions || 'No instructions provided.'}`
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': Deno.env.get('SUPABASE_URL') || 'https://supabase.co',
        'X-Title': 'PetPal',
      },
      body: JSON.stringify({
        model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error')
      console.error('OpenRouter API error:', response.status, errText)
      return new Response(
        JSON.stringify({ error: `AI service error (${response.status}). Please try again.` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      return new Response(
        JSON.stringify({ error: 'AI returned an empty response. Please try again.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let parsed: { title?: string; items?: ChecklistItem[] }
    try {
      // Strip markdown code fences if returned by the model
      const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      return new Response(
        JSON.stringify({ error: 'AI returned an invalid response. Please try again.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!parsed.items || !Array.isArray(parsed.items)) {
      return new Response(
        JSON.stringify({ error: 'AI response is missing checklist items. Please try again.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const cleanItems: ChecklistItem[] = parsed.items
      .filter((item) => item && typeof item.title === 'string' && item.title.trim())
      .map((item) => ({
        title: item.title.trim(),
        due_time: item.due_time || null,
      }))

    if (cleanItems.length === 0) {
      return new Response(
        JSON.stringify({ error: 'AI generated no valid items. Please try again with more detail.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        title: parsed.title || (body.type === 'routine' ? `${body.petName}'s Daily Care` : 'Vet Instructions Checklist'),
        items: cleanItems,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('generate-checklist error:', err)
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
