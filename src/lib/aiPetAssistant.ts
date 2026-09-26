import { format, addDays, nextDay, parseISO, isDate } from 'date-fns'
import type { Routine, Appointment, Vaccination } from '@/types'

export interface ParsedRoutineSlot {
  type: 'feeding' | 'walking'
  time: string // "HH:MM" 24h
  label: string
  portion?: string
  notes?: string
}

export interface ParsedAppointment {
  type: 'vet' | 'grooming'
  title: string
  date: string // "YYYY-MM-DD"
  time: string // "HH:MM"
  location: string
  notes: string
}

export interface ParsedVaccination {
  vaccine_name: string
  date_given: string // "YYYY-MM-DD"
  next_due_date: string // "YYYY-MM-DD" or ""
  notes: string
}

/**
 * Helper to extract time string in 24h format (HH:MM) from text
 */
function extractTime(text: string, defaultTime = '09:00'): string {
  // Matches "8:30 am", "8:30pm", "14:00", "8am", "8 pm", "8:00"
  const match = text.match(/\b([01]?[0-9]|2[0-3])(?::([0-5][0-9]))?\s*(am|pm)?\b/i)
  if (!match) return defaultTime

  let hour = parseInt(match[1], 10)
  const minute = match[2] ? match[2] : '00'
  const ampm = match[3]?.toLowerCase()

  if (ampm === 'pm' && hour < 12) hour += 12
  if (ampm === 'am' && hour === 12) hour = 0

  return `${String(hour).padStart(2, '0')}:${minute}`
}

/**
 * Helper to extract a target date (YYYY-MM-DD) from relative or explicit date descriptions
 */
function extractDate(text: string): string {
  const lower = text.toLowerCase()
  const today = new Date()

  if (lower.includes('today')) {
    return format(today, 'yyyy-MM-dd')
  }
  if (lower.includes('tomorrow')) {
    return format(addDays(today, 1), 'yyyy-MM-dd')
  }
  if (lower.includes('in 2 days') || lower.includes('day after tomorrow')) {
    return format(addDays(today, 2), 'yyyy-MM-dd')
  }
  if (lower.includes('in a week') || lower.includes('in 1 week') || lower.includes('next week')) {
    return format(addDays(today, 7), 'yyyy-MM-dd')
  }
  if (lower.includes('in 2 weeks')) {
    return format(addDays(today, 14), 'yyyy-MM-dd')
  }
  if (lower.includes('in a month') || lower.includes('in 1 month')) {
    return format(addDays(today, 30), 'yyyy-MM-dd')
  }
  if (lower.includes('in 6 months')) {
    return format(addDays(today, 182), 'yyyy-MM-dd')
  }
  if (lower.includes('in 1 year') || lower.includes('in a year')) {
    return format(addDays(today, 365), 'yyyy-MM-dd')
  }
  if (lower.includes('in 3 years')) {
    return format(addDays(today, 365 * 3), 'yyyy-MM-dd')
  }

  // Check for weekday names: "next monday", "this friday", "on wednesday"
  const weekdays: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  }

  for (const [dayName, dayIndex] of Object.entries(weekdays)) {
    if (lower.includes(dayName)) {
      try {
        const target = nextDay(today, dayIndex)
        return format(target, 'yyyy-MM-dd')
      } catch {}
    }
  }

  // Check explicit ISO date: 2026-10-15
  const isoMatch = text.match(/\b(20\d{2})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b/)
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
  }

  // Check standard month name format: "Oct 15", "October 15, 2026", "15 October"
  const monthMatch = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i
  )
  if (monthMatch) {
    const monthNames: Record<string, string> = {
      jan: '01', january: '01',
      feb: '02', february: '02',
      mar: '03', march: '03',
      apr: '04', april: '04',
      may: '05',
      jun: '06', june: '06',
      jul: '07', july: '07',
      aug: '08', august: '08',
      sep: '09', september: '09',
      oct: '10', october: '10',
      nov: '11', november: '11',
      dec: '12', december: '12',
    }
    const mStr = monthNames[monthMatch[1].toLowerCase()]
    const dStr = monthMatch[2].padStart(2, '0')
    const yStr = monthMatch[3] || String(today.getFullYear())
    return `${yStr}-${mStr}-${dStr}`
  }

  // Default to today or tomorrow
  return format(addDays(today, 1), 'yyyy-MM-dd')
}

// =========================================================================
// 1. AI Routine Parser & Generator
// =========================================================================
export function parseNaturalLanguageRoutines(
  prompt: string,
  petName: string,
  species: string
): ParsedRoutineSlot[] {
  const clean = prompt.trim()
  const lower = clean.toLowerCase()
  const isDog = species.toLowerCase().includes('dog')
  const isCat = species.toLowerCase().includes('cat')

  // Check if prompt is a generic request to create a recommended routine
  if (
    lower.includes('recommend') ||
    lower.includes('schedule') ||
    lower.includes('create routine') ||
    lower.includes('default') ||
    clean.length < 15
  ) {
    if (isDog) {
      return [
        { type: 'walking', time: '07:30', label: 'Morning Walk', notes: '25 mins brisk walk & potty' },
        { type: 'feeding', time: '08:00', label: 'Breakfast', portion: '1.5 cups dry kibble', notes: 'Add fresh water' },
        { type: 'walking', time: '13:00', label: 'Midday Potty', notes: '10-15 mins backyard or short stroll' },
        { type: 'walking', time: '18:00', label: 'Evening Walk', notes: '35 mins exercise & sniff time' },
        { type: 'feeding', time: '19:30', label: 'Dinner', portion: '1.5 cups dry kibble', notes: 'Clean bowl' },
      ]
    }
    if (isCat) {
      return [
        { type: 'feeding', time: '08:00', label: 'Breakfast Feeding', portion: '1 can wet food', notes: 'Fresh water bowl' },
        { type: 'feeding', time: '19:00', label: 'Dinner Feeding', portion: '1/2 cup dry kibble', notes: 'Clean food bowl' },
      ]
    }
    return [
      { type: 'feeding', time: '08:30', label: 'Morning Feeding', portion: 'Standard meal', notes: 'Fresh water refill' },
      { type: 'feeding', time: '18:30', label: 'Evening Feeding', portion: 'Standard meal', notes: 'Spot clean' },
    ]
  }

  // Split user prompt by commas, semicolons, "and", or newlines
  const sentences = clean
    .split(/\r?\n|;|\.(?=\s+[A-Z0-9])|,\s+(?=(?:feed|walk|breakfast|lunch|dinner|potty|at|\d))/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const slots: ParsedRoutineSlot[] = []

  for (const s of sentences) {
    const sLower = s.toLowerCase()
    const isWalk = sLower.includes('walk') || sLower.includes('stroll') || sLower.includes('exercise') || sLower.includes('potty')
    const isFeed = sLower.includes('feed') || sLower.includes('breakfast') || sLower.includes('dinner') || sLower.includes('lunch') || sLower.includes('meal') || sLower.includes('food') || sLower.includes('cup') || sLower.includes('can')

    const type: 'feeding' | 'walking' = isWalk ? 'walking' : 'feeding'
    const time = extractTime(s, isWalk ? '07:30' : '08:00')

    // Extract portion if feeding
    let portion = ''
    const portionMatch = s.match(/(\d+(?:\.\d+)?(?:\/\d+)?\s*(?:cups?|grams?|g|oz|ounces?|cans?|scoops?|tbsp|teaspoons?))/i)
    if (portionMatch) {
      portion = portionMatch[1]
    }

    // Determine clean label
    let label = ''
    if (type === 'feeding') {
      if (sLower.includes('breakfast')) label = 'Breakfast'
      else if (sLower.includes('lunch')) label = 'Lunch'
      else if (sLower.includes('dinner')) label = 'Dinner'
      else label = 'Meal Feeding'
    } else {
      if (sLower.includes('morning')) label = 'Morning Walk'
      else if (sLower.includes('evening') || sLower.includes('night')) label = 'Evening Walk'
      else if (sLower.includes('midday') || sLower.includes('afternoon')) label = 'Midday Walk'
      else label = 'Walk & Exercise'
    }

    // Extract notes (e.g. "30 mins", "with wet topper")
    let notes = ''
    const durationMatch = s.match(/(\d+\s*(?:mins?|minutes?|hours?|hr))/i)
    if (durationMatch) {
      notes = durationMatch[1]
    }

    slots.push({
      type,
      time,
      label,
      portion: type === 'feeding' ? (portion || '1 portion') : undefined,
      notes: notes || undefined,
    })
  }

  // Fallback if no individual slots extracted
  if (slots.length === 0) {
    slots.push(
      { type: 'feeding', time: '08:00', label: 'Breakfast', portion: '1 cup', notes: 'Daily morning meal' },
      { type: 'walking', time: '18:00', label: 'Evening Walk', notes: '30 mins walk' }
    )
  }

  return slots.sort((a, b) => a.time.localeCompare(b.time))
}

// =========================================================================
// 2. AI Appointment Parser & Generator
// =========================================================================
export function parseNaturalLanguageAppointment(
  prompt: string,
  petName: string,
  species: string
): ParsedAppointment {
  const clean = prompt.trim()
  const lower = clean.toLowerCase()

  const isGrooming = lower.includes('groom') || lower.includes('haircut') || lower.includes('bath') || lower.includes('spa') || lower.includes('nail')
  const type: 'vet' | 'grooming' = isGrooming ? 'grooming' : 'vet'

  const date = extractDate(clean)
  const time = extractTime(clean, '10:00')

  // Extract location (e.g. "at City Vet", "at Paws Spa", "with Dr. Smith")
  let location = ''
  const locationMatch = clean.match(/(?:at|in)\s+([A-Za-z0-9\s'&.-]+?)(?:(?:\s+(?:on|at|for|with|this|next|tomorrow|\d{1,2}:))|$)/i)
  if (locationMatch && locationMatch[1]) {
    location = locationMatch[1].trim()
  }

  // Extract doctor or specialist
  let doctor = ''
  const docMatch = clean.match(/(?:with|dr\.?)\s+([A-Za-z\s]+?)(?:(?:\s+(?:at|on|for|at|\d{1,2}:))|$)/i)
  if (docMatch && docMatch[1]) {
    doctor = `with Dr. ${docMatch[1].replace(/^dr\.?\s*/i, '').trim()}`
  }

  // Determine Title
  let title = ''
  if (isGrooming) {
    if (lower.includes('nail')) title = 'Nail Trim & Spa'
    else if (lower.includes('bath')) title = 'Bath & Full Grooming'
    else title = 'Grooming Appointment'
  } else {
    if (lower.includes('vaccin') || lower.includes('booster') || lower.includes('shot')) {
      title = 'Vaccination & Wellness Check'
    } else if (lower.includes('dental') || lower.includes('teeth')) {
      title = 'Dental Examination'
    } else if (lower.includes('surgery') || lower.includes('spay') || lower.includes('neuter')) {
      title = 'Surgical Consultation'
    } else if (lower.includes('checkup') || lower.includes('annual') || lower.includes('exam')) {
      title = 'Annual Health Checkup'
    } else {
      title = 'Vet Visit & Examination'
    }
  }

  const notesParts = [doctor, clean.length > 20 ? clean : ''].filter(Boolean)

  return {
    type,
    title,
    date,
    time,
    location: location || (type === 'vet' ? 'Veterinary Clinic' : 'Pet Grooming Salon'),
    notes: notesParts.join(' • '),
  }
}

// =========================================================================
// 3. AI Vaccination Parser & Generator
// =========================================================================
export function parseNaturalLanguageVaccinations(
  prompt: string,
  petName: string,
  species: string
): ParsedVaccination[] {
  const clean = prompt.trim()
  const lower = clean.toLowerCase()
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const isDog = species.toLowerCase().includes('dog')
  const isCat = species.toLowerCase().includes('cat')

  // Check if user is asking for recommended core vaccines
  if (lower.includes('recommend') || lower.includes('puppy') || lower.includes('kitten') || lower.includes('core') || clean.length < 15) {
    if (isDog) {
      return [
        {
          vaccine_name: 'Rabies (1 or 3-Year)',
          date_given: todayStr,
          next_due_date: format(addDays(new Date(), 365), 'yyyy-MM-dd'),
          notes: 'Core mandatory vaccine against rabies virus',
        },
        {
          vaccine_name: 'DHPP (Distemper, Hepatitis, Parvo, Parainfluenza)',
          date_given: todayStr,
          next_due_date: format(addDays(new Date(), 365), 'yyyy-MM-dd'),
          notes: 'Core combo booster for canines',
        },
        {
          vaccine_name: 'Bordetella (Kennel Cough)',
          date_given: todayStr,
          next_due_date: format(addDays(new Date(), 182), 'yyyy-MM-dd'),
          notes: 'Recommended every 6-12 months for daycare and boarding',
        },
      ]
    }
    if (isCat) {
      return [
        {
          vaccine_name: 'Rabies (Feline)',
          date_given: todayStr,
          next_due_date: format(addDays(new Date(), 365), 'yyyy-MM-dd'),
          notes: 'Core rabies vaccination',
        },
        {
          vaccine_name: 'FVRCP (Feline Viral Rhinotracheitis, Calicivirus, Panleukopenia)',
          date_given: todayStr,
          next_due_date: format(addDays(new Date(), 365), 'yyyy-MM-dd'),
          notes: 'Core 3-in-1 feline booster',
        },
      ]
    }
    return [
      {
        vaccine_name: 'Annual Core Vaccine Booster',
        date_given: todayStr,
        next_due_date: format(addDays(new Date(), 365), 'yyyy-MM-dd'),
        notes: `Standard preventative vaccination for ${petName}`,
      },
    ]
  }

  // Parse lines or comma-separated vaccine entries
  const entries = clean
    .split(/\r?\n|;|\.(?=\s+[A-Z0-9])/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0)

  const list: ParsedVaccination[] = []

  for (const entry of entries) {
    const eLower = entry.toLowerCase()

    // Determine vaccine name
    let vaxName = ''
    if (eLower.includes('rabies')) vaxName = 'Rabies'
    else if (eLower.includes('dhpp') || eLower.includes('distemper') || eLower.includes('parvo')) vaxName = 'DHPP (Distemper / Parvo)'
    else if (eLower.includes('bordetella') || eLower.includes('kennel cough')) vaxName = 'Bordetella'
    else if (eLower.includes('fvrcp')) vaxName = 'FVRCP (Feline Distemper)'
    else if (eLower.includes('lyme')) vaxName = 'Lyme Disease'
    else if (eLower.includes('leptospirosis') || eLower.includes('lepto')) vaxName = 'Leptospirosis'
    else if (eLower.includes('felv') || eLower.includes('leukemia')) vaxName = 'FeLV (Feline Leukemia)'
    else {
      // Use clean text snippet as name
      const nameMatch = entry.match(/^([A-Za-z0-9\s/-]+?)(?:(?:\s+(?:given|on|due|at|\d))|$)/i)
      vaxName = nameMatch && nameMatch[1] ? nameMatch[1].trim() : 'Preventative Vaccine'
    }

    // Determine date given
    const dateGiven = extractDate(entry)

    // Determine next due date (e.g. "due in 1 year", "due 2027", "next due 2026-10-10")
    let nextDueDate = ''
    if (eLower.includes('3 year') || eLower.includes('3-year') || eLower.includes('in 3 years')) {
      nextDueDate = format(addDays(new Date(dateGiven), 365 * 3), 'yyyy-MM-dd')
    } else if (eLower.includes('6 month') || eLower.includes('6-month')) {
      nextDueDate = format(addDays(new Date(dateGiven), 182), 'yyyy-MM-dd')
    } else if (eLower.includes('due') || eLower.includes('booster')) {
      nextDueDate = format(addDays(new Date(dateGiven), 365), 'yyyy-MM-dd')
    } else {
      nextDueDate = format(addDays(new Date(dateGiven), 365), 'yyyy-MM-dd')
    }

    list.push({
      vaccine_name: vaxName,
      date_given: dateGiven,
      next_due_date: nextDueDate,
      notes: entry,
    })
  }

  if (list.length === 0) {
    list.push({
      vaccine_name: 'Rabies Booster',
      date_given: todayStr,
      next_due_date: format(addDays(new Date(), 365), 'yyyy-MM-dd'),
      notes: clean,
    })
  }

  return list
}
