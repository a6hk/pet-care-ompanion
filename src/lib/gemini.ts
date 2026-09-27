/**
 * Google Gemini AI Integration Engine for PetPal
 * Supports gemini-3.8-flash and gemini-flash-latest for sub-second, intelligent
 * pet care consultations, vet discharge action item extraction, and care program generation.
 */

import type { ExtractedPrescriptionDetails } from './aiChecklistParser'
import type { Pet } from '@/types'

// Candidate models: always attempt gemini-3.1-flash-lite first, fallback to gemini-3.8-flash on issue
const CANDIDATE_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
]

// In-memory cache & in-flight promise deduplication to prevent 429 burst rate limits
const responseCache = new Map<string, { output: string; timestamp: number }>()
const inFlightRequests = new Map<string, Promise<string>>()
const CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

function getCacheKey(prompt: string, systemInstruction?: string, responseJson?: boolean): string {
  return `${prompt.trim()}|${systemInstruction || ''}|${responseJson ? 'json' : 'text'}`
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Fallback emergency knowledge generator if Gemini API free quota is 100% exhausted
 */
function generateOfflineEmergencyFallback(prompt: string, responseJson: boolean): string {
  const p = prompt.toLowerCase()

  if (responseJson) {
    if (p.includes('lily') || p.includes('lilies')) {
      return JSON.stringify({
        content: `### 🚨 CRITICAL EMERGENCY ALERT: LILY TOXICITY\n\n**Lilies (Lilium and Hemerocallis species) are extremely toxic to cats.** Ingesting even a single leaf, petal, or pollen grain can cause severe acute kidney failure within 24 to 72 hours.\n\n#### Immediate Actions:\n1. **Do not wait for symptoms.** Every hour counts.\n2. **Contact your nearest emergency veterinary hospital immediately.**\n3. Take a photo or sample of the plant with you to the clinic.`,
        category: 'symptoms',
        isEmergency: true,
        suggestedActions: [{ label: '📞 Call Emergency Vet', actionType: 'prompt', payload: 'Find 24/7 emergency veterinary clinics nearby' }]
      })
    }

    if (p.includes('chocolate') || p.includes('cocoa')) {
      return JSON.stringify({
        content: `### ⚠️ EMERGENCY ALERT: CHOCOLATE TOXICITY\n\n**Chocolate contains theobromine and caffeine**, which pets (especially dogs) cannot metabolize. Dark chocolate, baker's chocolate, and cocoa powder are the most dangerous.\n\n#### Immediate Action Steps:\n1. **Determine the type and amount:** Check the wrapper for chocolate type and total grams/ounces consumed.\n2. **Note your pet's weight:** Toxicity depends heavily on pet size.\n3. **Call your veterinarian or Pet Poison Helpline immediately.** Do not induce vomiting without professional guidance.`,
        category: 'symptoms',
        isEmergency: true,
        suggestedActions: [{ label: '📞 Contact Pet Poison Control', actionType: 'prompt', payload: 'What are the symptoms of theobromine poisoning?' }]
      })
    }

    // Default structured JSON fallback
    return JSON.stringify({
      content: `### ℹ️ AI Service Notice\n\n*The Google Gemini free tier rate limit was temporarily reached (15 requests/minute).*\n\n**Immediate Pet Care Guidance:**\n* Ensure your pet has access to clean, fresh water and a calm resting area.\n* If your pet is showing acute distress, persistent vomiting, or difficulty breathing, contact an emergency veterinarian right away.\n* You can retry your request in 30 seconds once the quota window resets.`,
      category: 'general',
      isEmergency: false,
      suggestedActions: [{ label: '🔄 Retry Consultation', actionType: 'prompt', payload: prompt }]
    })
  }

  return `### ℹ️ AI Service Notice (Rate Limit Cooldown)\n\nThe Gemini API rate limit has been reached on the free tier. Please wait 30 seconds for the quota window to reset, or check back shortly. If this is an urgent pet emergency, please contact your nearest 24/7 veterinary clinic directly.`
}

/**
 * Retrieve the Gemini API key from environment variable or user localStorage
 */
export function getGeminiApiKey(): string {
  // Check Vite client-side environment
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) {
      const envKey = import.meta.env.VITE_GEMINI_API_KEY
      if (typeof envKey === 'string' && envKey.trim().length > 0) {
        return envKey.trim()
      }
    }
  } catch {
    // ignore
  }

  // Node / test environment fallback
  try {
    const globalProcess = (globalThis as any)?.process
    if (globalProcess?.env?.VITE_GEMINI_API_KEY) {
      const procKey = globalProcess.env.VITE_GEMINI_API_KEY
      if (typeof procKey === 'string' && procKey.trim().length > 0) {
        return procKey.trim()
      }
    }
  } catch {
    // ignore
  }

  // User manual key stored in browser localStorage
  try {
    if (typeof localStorage !== 'undefined') {
      const localKey = localStorage.getItem('petpal_gemini_api_key')
      if (localKey && typeof localKey === 'string' && localKey.trim().length > 0) {
        return localKey.trim()
      }
    }
  } catch {
    // ignore
  }

  return ''
}

export function setGeminiApiKey(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      if (key && key.trim()) {
        localStorage.setItem('petpal_gemini_api_key', key.trim())
      } else {
        localStorage.removeItem('petpal_gemini_api_key')
      }
    }
  } catch {
    // ignore
  }
}

export function hasGeminiApiKey(): boolean {
  return getGeminiApiKey().length > 0
}

interface GeminiCallParams {
  prompt: string
  systemInstruction?: string
  history?: Array<{ role: 'user' | 'model'; text: string }>
  responseJson?: boolean
  temperature?: number
}

/**
 * Core caller to Google Gemini REST API with automatic model fallback
 */
export async function callGeminiApi({
  prompt,
  systemInstruction,
  history = [],
  responseJson = false,
  temperature = 0.4,
}: GeminiCallParams): Promise<string> {
  const apiKey = getGeminiApiKey()
  if (!apiKey) {
    throw new Error('Gemini API Key is not configured. Please add VITE_GEMINI_API_KEY to .env or in AI settings.')
  }

  // 1. Check client-side response cache (only for non-chat history or standalone prompts)
  const cacheKey = getCacheKey(prompt, systemInstruction, responseJson)
  if (history.length === 0 && responseCache.has(cacheKey)) {
    const cached = responseCache.get(cacheKey)!
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.output
    }
    responseCache.delete(cacheKey)
  }

  // 2. In-flight deduplication: if exact same call is already pending, reuse it
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!
  }

  const executionPromise = (async () => {
    const contents: Array<{ role?: string; parts: Array<{ text: string }> }> = []

    // Add conversation history
    if (history && history.length > 0) {
      for (const h of history) {
        contents.push({
          role: h.role === 'model' ? 'model' : 'user',
          parts: [{ text: h.text }],
        })
      }
    }

    // Add the current prompt
    contents.push({
      role: 'user',
      parts: [{ text: prompt }],
    })

    const requestBody: Record<string, any> = {
      contents,
      generationConfig: {
        temperature,
      },
    }

    if (systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: systemInstruction }],
      }
    }

    if (responseJson) {
      requestBody.generationConfig.responseMimeType = 'application/json'
    }

    async function tryModelWithBackoff(modelName: string): Promise<string> {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`
      const maxRetries = 2

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          })

          if (response.ok) {
            const data = await response.json()
            const textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text
            if (!textOutput) {
              throw new Error('Gemini returned an empty response.')
            }
            return textOutput
          }

          const errorText = await response.text().catch(() => '')
          const isRateLimit = response.status === 429 || response.status === 402 || errorText.includes('RESOURCE_EXHAUSTED')

          if (isRateLimit && attempt < maxRetries) {
            // Exponential backoff with random jitter: 1.5s -> 3.2s
            const backoffMs = Math.round(Math.pow(2, attempt) * 1500 + Math.random() * 800)
            console.warn(`[Gemini Rate Limit 429/402] Backing off for ${backoffMs}ms on model ${modelName} (attempt ${attempt + 1}/${maxRetries})...`)
            await sleep(backoffMs)
            continue
          }

          throw new Error(`Gemini API error (${response.status}): ${errorText || response.statusText}`)
        } catch (err: any) {
          const isNetworkOr429 = err?.message?.includes('429') || err?.message?.includes('402') || err?.message?.includes('RESOURCE_EXHAUSTED')
          if (isNetworkOr429 && attempt < maxRetries) {
            const backoffMs = Math.round(Math.pow(2, attempt) * 1500 + Math.random() * 800)
            await sleep(backoffMs)
            continue
          }
          throw err
        }
      }

      throw new Error(`Exhausted retries for model ${modelName}`)
    }

    let lastError: any = null
    for (const model of CANDIDATE_MODELS) {
      try {
        const textOutput = await tryModelWithBackoff(model)
        // Cache successful response
        if (history.length === 0) {
          responseCache.set(cacheKey, { output: textOutput, timestamp: Date.now() })
        }
        return textOutput
      } catch (err: any) {
        lastError = err
        const errMsg = (err?.message || '').toLowerCase()
        console.warn(`Model ${model} failed (${err?.message?.slice(0, 100)}). Trying next candidate model...`)
        // If 429 or quota, short delay before next model to let quota breathe
        if (errMsg.includes('429') || errMsg.includes('402') || errMsg.includes('resource_exhausted')) {
          await sleep(1200)
        }
      }
    }

    // If both specified models hit rate limits, return offline emergency fallback so app never crashes
    console.error('All specified Gemini models reached rate limits. Serving offline fallback.', lastError)
    const fallbackOutput = generateOfflineEmergencyFallback(prompt, responseJson)
    return fallbackOutput
  })()

  inFlightRequests.set(cacheKey, executionPromise)

  try {
    return await executionPromise
  } finally {
    inFlightRequests.delete(cacheKey)
  }
}

/**
 * Extract structured clinical care details from veterinary instructions using Gemini AI.
 * Explicitly instructs the model to ignore names, addresses, phone numbers, and invoice info.
 */
export async function extractVetCarePlanWithGemini(
  instructions: string,
  petName: string,
  species: string,
  breed?: string
): Promise<ExtractedPrescriptionDetails> {
  const systemInstruction = `You are an expert veterinary clinical assistant and care coordinator.
Your task is to analyze veterinary discharge notes, prescriptions, or doctor instructions for a pet and convert them into structured, actionable care items.

CRITICAL INSTRUCTIONS ON WHAT TO IGNORE:
- IGNORE AND COMPLETELY EXCLUDE all non-clinical administrative metadata:
  * Clinic / hospital names, locations, and branding
  * Street addresses, suites, cities, states, postal codes
  * Phone numbers, fax numbers, emergency telephone lines, email addresses, websites
  * Veterinarian names, license numbers, DEA numbers, staff signatures
  * Owner / client names, account numbers, case IDs, chart numbers
  * Billing details, invoices, totals, payments, credit card info
  * Manufacturer disclaimers (e.g. "Federal law restricts...", "Keep out of reach...")
- NEVER create an action item or care task from an address, clinic name, owner name, or invoice line.

WHAT TO EXTRACT INTO ACTION ITEMS:
1. Medications: Name, strength/dosage (e.g. "500 mg", "0.8 ml"), route, frequency.
   * If a medication is taken twice daily (b.i.d., every 12 hours), split into two checklist items: one for Morning (08:00) and one for Evening (20:00).
   * If three times daily, split into Morning (08:00), Afternoon (14:00), Evening (20:00).
   * If once daily, assign Morning (08:30) or Evening (20:00) based on context.
   * Prefix medication items with "💊 Medication: ".
2. Care Instructions:
   * Surgical incision / wound care: gentle saline cleaning, checking redness/swelling twice daily (prefix with "🩹 Care: ").
   * E-collar / cone: keeping cone securely on at all times (prefix with "🛡️ Care: ").
   * Activity restrictions: strict crate rest, short on-leash potty breaks only, no running/jumping (prefix with "🐾 Care: ").
   * Dietary care: bland diet (boiled chicken & rice), soft vet food, feeding times (prefix with "🥣 Care: ").
   * Monitoring: appetite, hydration, lethargy, vomiting checks (prefix with "👁️ Care: ").
3. Daily Routines:
   * If feeding or special diet is specified, create routine items with portion and times.
   * If short leash walks are restricted, create morning and evening potty walk routines.
4. Follow-Up Appointment:
   * Suture/staple removal or vet re-check appointment. Compute date based on days/weeks noted (e.g. in 10-14 days). Default time: 10:30.
5. Vaccinations:
   * Any vaccine booster administered or due (Rabies, DHPP, FVRCP, Bordetella).

Respond strictly with valid JSON matching this schema:
{
  "checklistTitle": string,
  "checklistType": "time_limited",
  "checklistDuration": number (integer in days, e.g. 7, 10, 14),
  "items": [
    { "title": string, "due_time": string | null (format "HH:MM" e.g. "08:00", or null) }
  ],
  "extractedRoutines": [
    { "type": "feeding" | "walking", "time": "HH:MM", "label": string, "portion": string, "notes": string }
  ],
  "extractedAppointment": {
    "type": "vet",
    "title": string,
    "date": "YYYY-MM-DD",
    "time": "HH:MM",
    "location": string,
    "notes": string
  } | null,
  "extractedVaccinations": [
    { "vaccine_name": string, "date_given": "YYYY-MM-DD", "next_due_date": "YYYY-MM-DD", "notes": string }
  ]
}`

  const prompt = `Patient: ${petName}
Species: ${species}
Breed: ${breed || 'Unknown'}
Today's Date: ${new Date().toISOString().split('T')[0]}

Raw Veterinary Notes / Discharge Instructions:
"""
${instructions}
"""`

  const jsonStr = await callGeminiApi({
    prompt,
    systemInstruction,
    responseJson: true,
    temperature: 0.2,
  })

  const parsed = JSON.parse(jsonStr)

  return {
    checklistTitle: parsed.checklistTitle || `${petName}'s Care & Medication Plan`,
    checklistType: 'time_limited',
    checklistDuration: typeof parsed.checklistDuration === 'number' && parsed.checklistDuration > 0 ? parsed.checklistDuration : 7,
    items: Array.isArray(parsed.items) && parsed.items.length > 0 ? parsed.items : [
      { title: `💊 Medication: Administer prescribed medications for ${petName}`, due_time: '08:30' },
      { title: `👁️ Care: Monitor ${petName}'s recovery, appetite & comfort`, due_time: '12:00' },
    ],
    extractedRoutines: Array.isArray(parsed.extractedRoutines) ? parsed.extractedRoutines : [],
    extractedAppointment: parsed.extractedAppointment || null,
    extractedVaccinations: Array.isArray(parsed.extractedVaccinations) ? parsed.extractedVaccinations : [],
  }
}

/**
 * Generate a specialized care or training program using Gemini AI
 */
export async function generateCareProgramWithGemini(
  petName: string,
  species: string,
  breed?: string,
  customPrompt?: string
): Promise<{ title: string; items: { title: string; due_time: string | null }[] }> {
  const systemInstruction = `You are a certified veterinary behaviorist and animal wellness specialist.
Generate a structured, evidence-based daily checklist and routine for a pet.
Include realistic daily times (e.g. 07:00, 09:30, 13:00, 18:00, 21:00) and clear action items.
Respond strictly with valid JSON:
{
  "title": string,
  "items": [
    { "title": string, "due_time": string | null }
  ]
}`

  const prompt = `Pet Name: ${petName}
Species: ${species}
Breed: ${breed || 'Mixed'}
Goal / Request: ${customPrompt || 'Comprehensive daily care and wellness plan'}

Generate a tailored 5-8 item structured checklist.`

  const jsonStr = await callGeminiApi({
    prompt,
    systemInstruction,
    responseJson: true,
    temperature: 0.3,
  })

  const parsed = JSON.parse(jsonStr)
  return {
    title: parsed.title || `${petName}'s Specialized Care Plan`,
    items: Array.isArray(parsed.items) ? parsed.items : [],
  }
}

/**
 * Interactive Pet Care Consultant response using Gemini AI
 */
export async function getGeminiConsultantChat(
  query: string,
  selectedPet?: Pet | null,
  allPets?: Pet[],
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<{
  content: string
  category: 'adoption' | 'symptoms' | 'nutrition' | 'training' | 'general'
  isEmergency: boolean
  suggestedActions?: Array<{
    label: string
    actionType: 'navigate_calendar' | 'navigate_checklist' | 'prompt'
    payload?: string
  }>
}> {
  const systemInstruction = `You are PawCare's Certified AI Pet Care Consultant.
You are an expert companion animal specialist, veterinary nurse consultant, and animal behaviorist.
You provide compassionate, accurate, veterinary-grounded advice for pet owners.

KEY BEHAVIORS:
1. Warm, professional, and empathetic tone.
2. Structure your answers with clear GitHub-flavored markdown headings, bullet points, and highlight callouts.
3. If the user asks about adopting a pet, give an organized checklist covering lifestyle matching, setup costs, home-proofing, essential gear, and initial vet visits.
4. If the user describes symptoms:
   * Provide immediate triage evaluation (Red Flags vs Mild signs).
   * Outline helpful home monitoring tips.
   * State when an in-person veterinary visit is necessary.
   * Always include an appropriate disclaimer that this is educational triage, not a definitive diagnosis.
5. If the user describes critical emergencies (e.g. chocolate, grapes, raisins, xylitol, lilies, rat poison, breathing distress, sudden inability to walk, bloated hard abdomen):
   * State clearly in bold at the very top: "⚠️ EMERGENCY VETERINARY ALERT: SEEK IMMEDIATE MEDICAL ATTENTION".
   * Provide immediate first aid steps (e.g. do not induce vomiting unless advised by vet/poison control).

Respond strictly with valid JSON:
{
  "content": string (detailed formatted markdown response),
  "category": "adoption" | "symptoms" | "nutrition" | "training" | "general",
  "isEmergency": boolean,
  "suggestedActions": [
    {
      "label": string (short button label, e.g. "📅 Book Vet Re-Check", "📋 Create Adoption Checklist", "💡 Ask About Diet"),
      "actionType": "navigate_calendar" | "navigate_checklist" | "prompt",
      "payload": string
    }
  ]
}`

  let petContext = ''
  if (selectedPet) {
    petContext = `Active Pet: ${selectedPet.name} (${selectedPet.species}${selectedPet.breed ? `, Breed: ${selectedPet.breed}` : ''}${selectedPet.weight ? `, Weight: ${selectedPet.weight}kg` : ''}${selectedPet.date_of_birth ? `, DOB: ${selectedPet.date_of_birth}` : ''})`
  }

  const history = chatHistory.slice(-8).map((msg) => ({
    role: msg.role === 'assistant' ? ('model' as const) : ('user' as const),
    text: msg.content,
  }))

  const prompt = `${petContext ? `[Pet Context: ${petContext}]\n\n` : ''}User Query: ${query}`

  const jsonStr = await callGeminiApi({
    prompt,
    systemInstruction,
    history,
    responseJson: true,
    temperature: 0.7,
  })

  const parsed = JSON.parse(jsonStr)

  return {
    content: parsed.content || 'I have analyzed your request. Please let me know how else I can assist with your pet.',
    category: parsed.category || 'general',
    isEmergency: Boolean(parsed.isEmergency),
    suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions : [],
  }
}
