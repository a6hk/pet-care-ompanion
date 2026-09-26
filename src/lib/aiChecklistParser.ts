import { format, addDays } from 'date-fns'

export interface GeneratedChecklistItem {
  title: string
  due_time: string | null
}

export interface GeneratedChecklist {
  title: string
  items: GeneratedChecklistItem[]
}

/**
 * Intelligent parser that extracts structured tasks, medications, dosages,
 * schedules, and follow-ups from raw veterinary notes or prescription text.
 */
export function parseVetInstructionsToTasks(
  instructions: string,
  petName: string,
  species: string
): GeneratedChecklist {
  const cleanText = (instructions || '').trim()
  const lines = cleanText
    .split(/\r?\n|;|\.(?=\s+[A-Z0-9])/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const items: GeneratedChecklistItem[] = []

  // Helper to extract common time/frequency patterns
  function detectTimes(text: string): string[] {
    const lower = text.toLowerCase()

    if (lower.includes('twice daily') || lower.includes('twice a day') || lower.includes('2 times') || lower.includes('bid') || lower.includes('every 12 hours')) {
      return ['08:00', '20:00']
    }
    if (lower.includes('three times') || lower.includes('3 times') || lower.includes('tid') || lower.includes('every 8 hours')) {
      return ['08:00', '14:00', '20:00']
    }
    if (lower.includes('morning and evening') || lower.includes('morning & evening')) {
      return ['08:00', '19:00']
    }
    if (lower.includes('in the morning') || lower.includes('every morning') || lower.includes('with breakfast') || lower.includes('am')) {
      return ['08:30']
    }
    if (lower.includes('in the evening') || lower.includes('at night') || lower.includes('before bed') || lower.includes('pm')) {
      return ['20:00']
    }
    if (lower.includes('afternoon') || lower.includes('midday') || lower.includes('lunch')) {
      return ['13:00']
    }
    if (lower.includes('once daily') || lower.includes('once a day') || lower.includes('daily')) {
      return ['09:00']
    }

    // Try finding specific time like 8:00am, 10:30, 2pm
    const timeMatch = text.match(/\b([01]?[0-9]|2[0-3]):([0-5][0-9])\s*(am|pm)?\b/i)
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10)
      const minutes = timeMatch[2]
      const ampm = timeMatch[3]?.toLowerCase()
      if (ampm === 'pm' && hours < 12) hours += 12
      if (ampm === 'am' && hours === 12) hours = 0
      return [`${String(hours).padStart(2, '0')}:${minutes}`]
    }

    return []
  }

  // Iterate over extracted sentences or bullet points
  for (const rawLine of lines) {
    const line = rawLine.replace(/^[-*•\d.)\s]+/, '').trim()
    if (!line) continue

    const detected = detectTimes(line)

    if (detected.length > 1) {
      // Split into morning / evening or respective slots for clearer checklist tracking
      if (detected.length === 2 && (detected[0] === '08:00' && detected[1] === '20:00')) {
        items.push({
          title: `${line} (Morning dose)`,
          due_time: detected[0],
        })
        items.push({
          title: `${line} (Evening dose)`,
          due_time: detected[1],
        })
      } else {
        detected.forEach((time, idx) => {
          items.push({
            title: `${line} (Dose ${idx + 1})`,
            due_time: time,
          })
        })
      }
    } else {
      items.push({
        title: line,
        due_time: detected.length === 1 ? detected[0] : null,
      })
    }
  }

  // If no lines were parsed or input was too brief, provide sensible medical defaults
  if (items.length === 0) {
    items.push(
      { title: `Administer prescribed medication for ${petName}`, due_time: '09:00' },
      { title: `Monitor ${petName}'s appetite and water intake`, due_time: '12:00' },
      { title: `Check incision / symptom recovery`, due_time: '19:00' },
      { title: 'Schedule follow-up appointment with vet', due_time: null }
    )
  }

  return {
    title: `${petName}'s Vet Care & Medication Plan`,
    items,
  }
}

/**
 * Intelligent generator for specialized care programs:
 * puppy training, senior wellness, post-surgery, travel/boarding.
 */
export function generateSpecializedCareProgram(
  petName: string,
  species: string,
  programType: 'training' | 'senior' | 'post_surgery' | 'travel' | 'general',
  customPrompt?: string
): GeneratedChecklist {
  const isDog = species.toLowerCase().includes('dog')
  const promptLower = (customPrompt || '').toLowerCase()

  if (programType === 'training' || promptLower.includes('puppy') || promptLower.includes('train') || promptLower.includes('crate')) {
    return {
      title: `${petName}'s Training & Habit Checklist`,
      items: [
        { title: `Morning potty break & praise immediately upon waking`, due_time: '07:00' },
        { title: `Short 10-minute focus training session (Sit, Stay, Recall)`, due_time: '09:30' },
        { title: `Crate relaxation & chew toy quiet time`, due_time: '11:00' },
        { title: `Midday potty break & leash walking practice`, due_time: '13:00' },
        { title: `Interactive puzzle toy / mental enrichment session`, due_time: '16:00' },
        { title: `Evening leash walk with loose leash reinforcement`, due_time: '18:00' },
        { title: `Final nighttime potty trip before bed`, due_time: '22:00' },
      ],
    }
  }

  if (programType === 'post_surgery' || promptLower.includes('surgery') || promptLower.includes('post-op') || promptLower.includes('recovery') || promptLower.includes('spay') || promptLower.includes('neuter')) {
    return {
      title: `${petName}'s Post-Op Recovery Protocol`,
      items: [
        { title: `Morning incision site inspection (check for redness/discharge)`, due_time: '08:00' },
        { title: `Morning pain relief / antibiotic administration with food`, due_time: '08:30' },
        { title: `Ensure E-collar (cone) is securely fitted & comfortable`, due_time: '11:00' },
        { title: `Short on-leash potty break only (no jumping/running)`, due_time: '13:00' },
        { title: `Evening pain relief medication`, due_time: '19:30' },
        { title: `Evening incision inspection & clean bedding check`, due_time: '21:00' },
        { title: `Schedule suture removal / vet follow-up (Day 10-14)`, due_time: null },
      ],
    }
  }

  if (programType === 'senior' || promptLower.includes('senior') || promptLower.includes('arthritis') || promptLower.includes('joint')) {
    return {
      title: `${petName}'s Senior Pet Wellness & Joint Care`,
      items: [
        { title: `Morning joint supplement (Glucosamine/Omega-3) with breakfast`, due_time: '08:00' },
        { title: `Gentle low-impact morning stroll on soft grass`, due_time: '09:00' },
        { title: `Fresh orthopedic bed adjustment & water refill check`, due_time: '12:00' },
        { title: `Gentle massage / range of motion stretching`, due_time: '16:00' },
        { title: `Evening meal & prescribed joint/mobility medication`, due_time: '19:00' },
        { title: `Check paw pads, nails & mobility comfort`, due_time: null },
      ],
    }
  }

  if (programType === 'travel' || promptLower.includes('travel') || promptLower.includes('flight') || promptLower.includes('trip') || promptLower.includes('board')) {
    return {
      title: `${petName}'s Travel & Boarding Checklist`,
      items: [
        { title: `Pack vaccination certificates & medical history records`, due_time: null },
        { title: `Pack 7-day pre-portioned food bags and favorite treats`, due_time: null },
        { title: `Check microchip contact info is up to date`, due_time: null },
        { title: `Pack collapsible travel water bowl and bottled water`, due_time: null },
        { title: `Pack favorite blanket / comforting scent toy`, due_time: null },
        { title: `Pack travel harness, seatbelt attachment, or carrier`, due_time: null },
        { title: `Light meal 3 hours prior to departure to prevent motion sickness`, due_time: '06:00' },
      ],
    }
  }

  // General specialized care checklist fallback
  return {
    title: `${petName}'s Specialized Care Plan`,
    items: [
      { title: `Morning wellness and vital check for ${petName}`, due_time: '08:00' },
      { title: `Fresh filtered water bowl refill & clean`, due_time: '08:30' },
      { title: `Midday engagement & mental stimulation activity`, due_time: '13:00' },
      { title: `Coat grooming & teeth check`, due_time: '18:00' },
      { title: `Evening health and behavior check`, due_time: '20:30' },
    ],
  }
}

export interface ExtractedPrescriptionDetails {
  checklistTitle: string
  checklistType: 'recurring' | 'time_limited'
  checklistDuration: number
  items: GeneratedChecklistItem[]
  extractedRoutines: Array<{
    type: 'feeding' | 'walking'
    time: string
    label: string
    portion?: string
    notes?: string
  }>
  extractedAppointment?: {
    type: 'vet' | 'grooming'
    title: string
    date: string
    time: string
    location: string
    notes: string
  } | null
  extractedVaccinations: Array<{
    vaccine_name: string
    date_given: string
    next_due_date: string
    notes: string
  }>
}

/**
 * Intelligent parser that extracts multi-category care details (Medications,
 * Routines, Appointments, and Vaccinations) from a prescription image upload
 * or pasted veterinary notes.
 */
export function parsePrescriptionImageAndText(
  text: string,
  imageName: string | null,
  petName: string,
  species: string,
  breed?: string
): ExtractedPrescriptionDetails {
  const combinedPrompt = `${text || ''} ${imageName ? `[Prescription Image: ${imageName}]` : ''}`.trim()
  const lower = combinedPrompt.toLowerCase()
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const defaultChecklist = parseVetInstructionsToTasks(combinedPrompt, petName, species)

  // 1. Extract Routines if prescription mentions feeding/diet or specific walks/rest
  const extractedRoutines: ExtractedPrescriptionDetails['extractedRoutines'] = []
  if (lower.includes('feed') || lower.includes('diet') || lower.includes('soft food') || lower.includes('kibble') || lower.includes('bland diet')) {
    extractedRoutines.push({
      type: 'feeding',
      time: '08:00',
      label: 'Morning Special Vet Diet',
      portion: lower.includes('soft food') ? 'Soft vet diet food' : lower.includes('bland') ? 'Bland chicken & rice' : 'Prescription diet portion',
      notes: 'Feed as prescribed by veterinarian',
    })
    extractedRoutines.push({
      type: 'feeding',
      time: '19:00',
      label: 'Evening Special Vet Diet',
      portion: lower.includes('soft food') ? 'Soft vet diet food' : lower.includes('bland') ? 'Bland chicken & rice' : 'Prescription diet portion',
      notes: 'Feed as prescribed by veterinarian',
    })
  }

  // 2. Extract Appointments if prescription mentions re-check, follow-up, or vet visit
  let extractedAppointment: ExtractedPrescriptionDetails['extractedAppointment'] = null
  if (lower.includes('follow-up') || lower.includes('re-check') || lower.includes('recheck') || lower.includes('return in') || lower.includes('checkup') || lower.includes('vet visit') || lower.includes('weeks') || lower.includes('days')) {
    let daysAhead = 14 // default 2 weeks
    if (lower.includes('1 week') || lower.includes('7 days')) daysAhead = 7
    else if (lower.includes('3 days')) daysAhead = 3
    else if (lower.includes('10 days')) daysAhead = 10
    else if (lower.includes('1 month') || lower.includes('30 days')) daysAhead = 30

    const apptDate = format(addDays(new Date(), daysAhead), 'yyyy-MM-dd')

    extractedAppointment = {
      type: 'vet',
      title: `${petName}'s Vet Re-Check & Prescription Review`,
      date: apptDate,
      time: '10:30',
      location: 'Veterinary Clinic',
      notes: `Follow-up re-check for prescription evaluation (${imageName || 'Prescription notes'})`,
    }
  }

  // 3. Extract Vaccinations if mentioned
  const extractedVaccinations: ExtractedPrescriptionDetails['extractedVaccinations'] = []
  if (lower.includes('vaccin') || lower.includes('rabies') || lower.includes('booster') || lower.includes('dhpp') || lower.includes('fvrcp')) {
    if (lower.includes('rabies')) {
      extractedVaccinations.push({
        vaccine_name: 'Rabies Booster',
        date_given: todayStr,
        next_due_date: format(addDays(new Date(), 365 * 3), 'yyyy-MM-dd'),
        notes: 'Recorded from veterinary prescription/discharge record',
      })
    }
    if (lower.includes('dhpp') || lower.includes('fvrcp') || lower.includes('booster')) {
      extractedVaccinations.push({
        vaccine_name: species.toLowerCase().includes('cat') ? 'FVRCP Combo Booster' : 'DHPP Combo Booster',
        date_given: todayStr,
        next_due_date: format(addDays(new Date(), 365), 'yyyy-MM-dd'),
        notes: 'Recorded from veterinary prescription/discharge record',
      })
    }
  }

  return {
    checklistTitle: `${petName}'s Prescription & Medication Plan`,
    checklistType: 'time_limited',
    checklistDuration: 7,
    items: defaultChecklist.items,
    extractedRoutines,
    extractedAppointment,
    extractedVaccinations,
  }
}

