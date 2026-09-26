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
 * Intelligent species & breed routine generator fallback
 */
export function generateDefaultPetRoutine(
  petName: string,
  species: string,
  breed?: string
): GeneratedChecklist {
  const isDog = species.toLowerCase().includes('dog')
  const isCat = species.toLowerCase().includes('cat')

  const items: GeneratedChecklistItem[] = isDog
    ? [
        { title: `Morning walk & bathroom break for ${petName}`, due_time: '07:30' },
        { title: `Breakfast & fresh water refill`, due_time: '08:00' },
        { title: `Midday potty break or quick play session`, due_time: '13:00' },
        { title: `Evening walk & exercise`, due_time: '18:30' },
        { title: `Dinner feeding`, due_time: '19:30' },
        { title: `Coat brushing & paw check`, due_time: '20:30' },
        { title: 'Teeth brushing & dental chew', due_time: '21:00' },
        { title: 'Monthly flea & tick preventative check', due_time: null },
        { title: 'Monthly weight & body condition check', due_time: null },
      ]
    : isCat
    ? [
        { title: `Breakfast & fresh water bowl refill`, due_time: '08:00' },
        { title: `Clean litter box`, due_time: '09:00' },
        { title: `Interactive playtime (laser/wand toy)`, due_time: '14:00' },
        { title: `Dinner feeding`, due_time: '19:00' },
        { title: `Evening litter box scoop`, due_time: '21:00' },
        { title: `Gentle coat brushing`, due_time: null },
        { title: 'Monthly flea/worm prevention check', due_time: null },
      ]
    : [
        { title: `Morning feeding & fresh water for ${petName}`, due_time: '08:30' },
        { title: `Enclosure / cage spot clean`, due_time: '11:00' },
        { title: `Evening feeding`, due_time: '18:30' },
        { title: `Health & behavior check`, due_time: null },
      ]

  return {
    title: `${petName}'s Daily Care Routine`,
    items,
  }
}
