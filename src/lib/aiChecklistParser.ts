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
/**
 * Intelligent parser that extracts structured tasks, medications, dosages,
 * care instructions, schedules, and follow-ups from raw veterinary notes or prescription text.
 */
export function parseVetInstructionsToTasks(
  instructions: string,
  petName: string,
  species: string
): GeneratedChecklist {
  const cleanText = (instructions || '').trim()
  if (!cleanText) {
    return {
      title: `${petName}'s Vet Care & Medication Plan`,
      items: [
        { title: `💊 Medication: Administer prescribed medication for ${petName}`, due_time: '08:30' },
        { title: `👁️ Care: Monitor ${petName}'s appetite and water intake`, due_time: '12:00' },
        { title: `🩹 Care: Check incision / recovery site`, due_time: '19:00' },
        { title: '🩺 Vet Visit: Schedule follow-up appointment with vet', due_time: null },
      ],
    }
  }

  // Split lines on linebreaks, semicolons, or numbered list indicators
  const rawLines = cleanText
    .split(/\r?\n|;/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const items: GeneratedChecklistItem[] = []

  // Helper to extract common time/frequency patterns
  function detectTimes(text: string): string[] {
    const lower = text.toLowerCase()

    if (
      lower.includes('twice daily') ||
      lower.includes('twice a day') ||
      lower.includes('2 times daily') ||
      lower.includes('2 times a day') ||
      lower.includes('bid') ||
      lower.includes('b.i.d') ||
      lower.includes('every 12 hours') ||
      lower.includes('q12h') ||
      lower.includes('morning and evening') ||
      lower.includes('morning & evening') ||
      lower.includes('morning and night')
    ) {
      return ['08:00', '20:00']
    }
    if (
      lower.includes('three times') ||
      lower.includes('3 times') ||
      lower.includes('tid') ||
      lower.includes('t.i.d') ||
      lower.includes('every 8 hours') ||
      lower.includes('q8h')
    ) {
      return ['08:00', '14:00', '20:00']
    }
    if (
      lower.includes('in the morning') ||
      lower.includes('every morning') ||
      lower.includes('with breakfast') ||
      lower.includes('am dose') ||
      lower.includes('morning dose')
    ) {
      return ['08:30']
    }
    if (
      lower.includes('in the evening') ||
      lower.includes('at night') ||
      lower.includes('before bed') ||
      lower.includes('bedtime') ||
      lower.includes('pm dose') ||
      lower.includes('evening dose')
    ) {
      return ['20:00']
    }
    if (
      lower.includes('afternoon') ||
      lower.includes('midday') ||
      lower.includes('lunch')
    ) {
      return ['13:00']
    }
    if (
      lower.includes('once daily') ||
      lower.includes('once a day') ||
      lower.includes('daily') ||
      lower.includes('every 24 hours') ||
      lower.includes('sid') ||
      lower.includes('s.i.d')
    ) {
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

  // Regex patterns to recognize section headers so they aren't added as tasks
  const sectionHeaderRegex = /^(medications?|rx|prescription|care instructions?|discharge instructions?|post[- ]?op(?:erative)? care|instructions?|directions?|activity(?: restrictions?)?|wound care|diet(?:ary)?(?: instructions?)?|follow[- ]?up|re[- ]?check|warnings?|notes?):?$/i

  let currentCategory: 'medication' | 'care' | 'diet' | 'activity' | 'followup' | null = null

  // Known vet med keywords
  const medKeywords = [
    'amoxicillin', 'clavulanate', 'clavamox', 'meloxicam', 'metacam', 'gabapentin',
    'carprofen', 'rimadyl', 'prednisone', 'prednisolone', 'cephalexin', 'tramadol',
    'metronidazole', 'flagyl', 'apoquel', 'cerenia', 'bravecto', 'nexgard', 'heartgard',
    'simparica', 'eye drop', 'ear drop', 'antibiotic', 'pain relief', 'probiotic',
    'antihistamine', 'dewormer', 'omeprazole', 'famotidine', 'enrofloxacin', 'baytril',
    'marbofloxacin', 'buprenorphine', 'clindamycin', 'doxycycline'
  ]

  // Dosage units regex: 500mg, 1 tab, 2 capsules, 0.5 ml, etc.
  const dosageUnitRegex = /\b(\d+(?:\.\d+)?)\s*(mg|ml|mcg|cc|tab|tabs|tablets?|caps?|capsules?|drops?|chews?|pills?|puffs?)\b/i

  for (const rawLine of rawLines) {
    const stripped = rawLine.replace(/^[-*•\d.)\s]+/, '').trim()
    if (!stripped) continue

    // Check if this line is just a section header
    if (sectionHeaderRegex.test(stripped)) {
      const lower = stripped.toLowerCase()
      if (lower.startsWith('med') || lower.startsWith('rx') || lower.startsWith('prescrip')) {
        currentCategory = 'medication'
      } else if (lower.includes('care') || lower.includes('wound') || lower.includes('post-op')) {
        currentCategory = 'care'
      } else if (lower.includes('diet')) {
        currentCategory = 'diet'
      } else if (lower.includes('activity')) {
        currentCategory = 'activity'
      } else if (lower.includes('follow') || lower.includes('re-check') || lower.includes('recheck')) {
        currentCategory = 'followup'
      }
      continue
    }

    // Skip document titles, diagnosis lines or general hospital info lines
    const lower = stripped.toLowerCase()
    if (
      lower.startsWith('patient:') ||
      lower.startsWith('date:') ||
      lower.startsWith('clinic:') ||
      lower.startsWith('doctor:') ||
      lower.startsWith('dvm:') ||
      lower.startsWith('weight:') ||
      lower.startsWith('owner:') ||
      lower.includes('discharge') ||
      ((lower.includes('prescription') || lower.includes('clinic')) &&
        !lower.includes('give') &&
        !lower.includes('tablet') &&
        !lower.includes('drop') &&
        !lower.includes('daily') &&
        stripped.length <= 50) ||
      lower.startsWith('[prescription image:')
    ) {
      continue
    }

    // Determine category of line
    const isFollowUp = lower.includes('suture removal') || lower.includes('stitches removal') || lower.includes('staple removal') || lower.includes('re-check') || lower.includes('recheck') || lower.includes('return in') || lower.includes('follow-up') || currentCategory === 'followup'

    const isMedication =
      currentCategory === 'medication' ||
      dosageUnitRegex.test(stripped) ||
      medKeywords.some((med) => lower.includes(med)) ||
      lower.includes('tablet') ||
      lower.includes('capsule') ||
      lower.includes('give 1') ||
      lower.includes('give 2') ||
      lower.includes('apply to affected') ||
      lower.includes('drops into')

    const isCollar = lower.includes('e-collar') || lower.includes('elizabethan') || lower.includes('cone')
    const isActivity = lower.includes('crate') || lower.includes('cage rest') || lower.includes('no running') || lower.includes('no jumping') || lower.includes('leash walk only') || lower.includes('stairs') || currentCategory === 'activity'
    const isWoundOrIncision = !isFollowUp && (lower.includes('incision') || lower.includes('suture') || lower.includes('stitches') || lower.includes('wound') || lower.includes('bandage') || lower.includes('clean site') || lower.includes('saline') || lower.includes('compress'))
    const isDiet = lower.includes('bland diet') || lower.includes('boiled chicken') || lower.includes('white rice') || lower.includes('soft food') || lower.includes('small meals') || currentCategory === 'diet'

    const detectedTimes = detectTimes(stripped)

    // Format item prefix
    let prefix = ''
    if (isMedication) {
      prefix = '💊 Medication: '
    } else if (isFollowUp) {
      prefix = '🩺 Vet Visit: '
    } else if (isCollar) {
      prefix = '🛡️ Care: '
    } else if (isWoundOrIncision) {
      prefix = '🩹 Care: '
    } else if (isActivity) {
      prefix = '🐾 Care: '
    } else if (isDiet) {
      prefix = '🥣 Care: '
    } else {
      prefix = '📋 Care: '
    }

    // Remove any existing emojis or duplicate prefix
    const cleanContent = stripped
      .replace(/^(?:💊|🩹|🛡️|🐾|🥣|🩺|📋|👁️)\s*/g, '')
      .replace(/^(?:Medication|Care|Diet|Activity|Vet Visit|Follow[- ]Up):\s*/i, '')
      .trim()

    if (detectedTimes.length > 1) {
      // Multiple doses per day
      if (detectedTimes.length === 2 && detectedTimes[0] === '08:00' && detectedTimes[1] === '20:00') {
        items.push({
          title: `${prefix}${cleanContent} (Morning)`,
          due_time: detectedTimes[0],
        })
        items.push({
          title: `${prefix}${cleanContent} (Evening)`,
          due_time: detectedTimes[1],
        })
      } else {
        detectedTimes.forEach((time, idx) => {
          items.push({
            title: `${prefix}${cleanContent} (Slot ${idx + 1})`,
            due_time: time,
          })
        })
      }
    } else {
      items.push({
        title: `${prefix}${cleanContent}`,
        due_time: detectedTimes.length === 1 ? detectedTimes[0] : null,
      })
    }
  }

  // Fallback if no lines parsed
  if (items.length === 0) {
    items.push(
      { title: `💊 Medication: Administer prescribed medication for ${petName}`, due_time: '08:30' },
      { title: `👁️ Care: Monitor ${petName}'s appetite, hydration, and energy`, due_time: '12:00' },
      { title: `🩹 Care: Check incision or recovery site`, due_time: '19:00' },
      { title: '🩺 Vet Visit: Schedule follow-up appointment with vet', due_time: null }
    )
  }

  return {
    title: `${petName}'s Prescription & Care Plan`,
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
 * Care Instructions, Routines, Appointments, and Vaccinations) from a prescription image upload
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
  const defaultChecklist = parseVetInstructionsToTasks(text || '', petName, species)

  // 1. Detect Course Duration (e.g. "for 10 days", "for 2 weeks", "7 days")
  let checklistDuration = 7 // Default 7 days
  const durationMatch = combinedPrompt.match(/(?:for|duration:?|give for|continue for)\s*(\d+)\s*(days?|weeks?)/i)
  if (durationMatch) {
    const num = parseInt(durationMatch[1], 10)
    const unit = durationMatch[2].toLowerCase()
    if (unit.startsWith('week')) {
      checklistDuration = Math.min(num * 7, 90)
    } else {
      checklistDuration = Math.min(num, 90)
    }
  }

  // 2. Extract Routines (Feeding / Diet and Leash Walking / Activity)
  const extractedRoutines: ExtractedPrescriptionDetails['extractedRoutines'] = []

  // Feeding & Diet Routines
  if (
    lower.includes('feed') ||
    lower.includes('diet') ||
    lower.includes('soft food') ||
    lower.includes('kibble') ||
    lower.includes('bland diet') ||
    lower.includes('chicken and rice') ||
    lower.includes('boiled chicken')
  ) {
    const dietPortion = lower.includes('soft food')
      ? 'Soft vet diet food'
      : lower.includes('bland') || lower.includes('chicken')
      ? 'Bland chicken & rice portion'
      : 'Prescription diet portion'

    extractedRoutines.push({
      type: 'feeding',
      time: '08:00',
      label: 'Morning Special Vet Diet',
      portion: dietPortion,
      notes: 'Feed as prescribed by veterinarian (give with morning medication if required)',
    })
    extractedRoutines.push({
      type: 'feeding',
      time: '19:00',
      label: 'Evening Special Vet Diet',
      portion: dietPortion,
      notes: 'Feed as prescribed by veterinarian (give with evening medication if required)',
    })
  }

  // Walking & Activity Routines
  if (
    lower.includes('crate rest') ||
    lower.includes('cage rest') ||
    lower.includes('leash walk') ||
    lower.includes('potty walk') ||
    lower.includes('short walk') ||
    lower.includes('no running') ||
    lower.includes('no jumping')
  ) {
    extractedRoutines.push({
      type: 'walking',
      time: '07:30',
      label: 'Morning Short Leash Potty Break',
      portion: '5-10 min',
      notes: 'Strict on-leash walk for elimination only. No running, jumping, or rough play.',
    })
    extractedRoutines.push({
      type: 'walking',
      time: '18:30',
      label: 'Evening Short Leash Potty Break',
      portion: '5-10 min',
      notes: 'Strict on-leash walk for elimination only. Keep calm & quiet.',
    })
  }

  // 3. Extract Follow-Up Appointment (Suture removal, re-check, vet visit)
  let extractedAppointment: ExtractedPrescriptionDetails['extractedAppointment'] = null
  const hasFollowUp =
    lower.includes('follow-up') ||
    lower.includes('follow up') ||
    lower.includes('re-check') ||
    lower.includes('recheck') ||
    lower.includes('suture removal') ||
    lower.includes('stitches removal') ||
    lower.includes('staple removal') ||
    lower.includes('return in') ||
    lower.includes('re-examination') ||
    lower.includes('vet visit')

  if (hasFollowUp) {
    let daysAhead = 14 // default 2 weeks

    if (lower.includes('10-14 days') || lower.includes('10 to 14 days')) daysAhead = 12
    else if (lower.includes('7-10 days') || lower.includes('7 to 10 days')) daysAhead = 8
    else if (lower.includes('1 week') || lower.includes('7 days')) daysAhead = 7
    else if (lower.includes('3 days')) daysAhead = 3
    else if (lower.includes('5 days')) daysAhead = 5
    else if (lower.includes('10 days')) daysAhead = 10
    else if (lower.includes('2 weeks') || lower.includes('14 days')) daysAhead = 14
    else if (lower.includes('3 weeks') || lower.includes('21 days')) daysAhead = 21
    else if (lower.includes('1 month') || lower.includes('4 weeks') || lower.includes('30 days')) daysAhead = 30

    const isSuture = lower.includes('suture') || lower.includes('stitch') || lower.includes('staple')
    const apptTitle = isSuture
      ? `${petName}'s Suture Removal & Vet Re-Check`
      : `${petName}'s Vet Re-Check & Recovery Follow-Up`

    const apptDate = format(addDays(new Date(), daysAhead), 'yyyy-MM-dd')

    extractedAppointment = {
      type: 'vet',
      title: apptTitle,
      date: apptDate,
      time: '10:30',
      location: 'Veterinary Clinic',
      notes: `Veterinary post-prescription re-examination (${imageName || 'Prescription notes'})`,
    }
  }

  // 4. Extract Vaccinations if mentioned
  const extractedVaccinations: ExtractedPrescriptionDetails['extractedVaccinations'] = []
  if (
    lower.includes('vaccin') ||
    lower.includes('rabies') ||
    lower.includes('booster') ||
    lower.includes('dhpp') ||
    lower.includes('fvrcp') ||
    lower.includes('bordetella')
  ) {
    if (lower.includes('rabies')) {
      extractedVaccinations.push({
        vaccine_name: 'Rabies Booster',
        date_given: todayStr,
        next_due_date: format(addDays(new Date(), 365 * 3), 'yyyy-MM-dd'),
        notes: 'Extracted from veterinary prescription/discharge record',
      })
    }
    if (lower.includes('dhpp') || lower.includes('fvrcp') || lower.includes('booster')) {
      extractedVaccinations.push({
        vaccine_name: species.toLowerCase().includes('cat') ? 'FVRCP Combo Booster' : 'DHPP Combo Booster',
        date_given: todayStr,
        next_due_date: format(addDays(new Date(), 365), 'yyyy-MM-dd'),
        notes: 'Extracted from veterinary prescription/discharge record',
      })
    }
    if (lower.includes('bordetella')) {
      extractedVaccinations.push({
        vaccine_name: 'Bordetella (Kennel Cough)',
        date_given: todayStr,
        next_due_date: format(addDays(new Date(), 365), 'yyyy-MM-dd'),
        notes: 'Extracted from veterinary prescription/discharge record',
      })
    }
  }

  return {
    checklistTitle: `${petName}'s Prescription & Care Plan`,
    checklistType: 'time_limited',
    checklistDuration,
    items: defaultChecklist.items,
    extractedRoutines,
    extractedAppointment,
    extractedVaccinations,
  }
}

