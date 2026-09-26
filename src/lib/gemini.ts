/**
 * Google Gemini AI Integration Engine for PetPal
 * Supports gemini-3.8-flash and gemini-flash-latest for sub-second, intelligent
 * pet care consultations, vet discharge action item extraction, and care program generation.
 */

import type { ExtractedPrescriptionDetails } from './aiChecklistParser'
import type { Pet } from '@/types'

// Candidate models ordered by speed and general availability with automatic cascade fallback
const CANDIDATE_MODELS = [
  'gemini-flash-latest',
  'gemini-3-flash-preview',
  'gemini-3.8-flash',
  'gemini-3.5-flash',
]

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

  async function tryModel(modelName: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`Gemini API error (${response.status}): ${errorText || response.statusText}`)
    }

    const data = await response.json()
    const textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!textOutput) {
      throw new Error('Gemini returned an empty response.')
    }
    return textOutput
  }

  let lastError: any = null
  for (const model of CANDIDATE_MODELS) {
    try {
      return await tryModel(model)
    } catch (err: any) {
      lastError = err
      const errMsg = (err?.message || '').toLowerCase()
      // If error is 404, 503 (high demand), 429 (rate limit), 500, or temporary spike, try next candidate
      if (
        errMsg.includes('404') ||
        errMsg.includes('503') ||
        errMsg.includes('429') ||
        errMsg.includes('500') ||
        errMsg.includes('demand') ||
        errMsg.includes('not found') ||
        errMsg.includes('unsupported') ||
        errMsg.includes('unavailable')
      ) {
        console.warn(`Model ${model} unavailable (${err?.message?.slice(0, 80)}...). Trying next candidate model...`)
        continue
      }
      throw err
    }
  }

  throw lastError || new Error('All candidate Gemini models failed.')
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
  const systemInstruction = `You are PetPal's Certified AI Pet Care Consultant.
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
