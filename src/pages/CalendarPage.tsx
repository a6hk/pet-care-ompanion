import { useEffect, useState, useMemo } from 'react'
import { useFamily } from '@/context/FamilyContext'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Stethoscope, Scissors, Syringe, Clock } from 'lucide-react'
import { formatTime, speciesIcon, cn } from '@/lib/utils'
import type { Pet, Appointment, Vaccination, Routine } from '@/types'
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, format, isSameDay, isSameMonth, addMonths } from 'date-fns'

interface CalendarEvent {
  date: string
  type: 'vet' | 'grooming' | 'vaccination' | 'routine'
  title: string
  pet_name: string
  species: string
  time: string
}

export function CalendarPage() {
  const { family } = useFamily()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  useEffect(() => {
    async function loadEvents() {
      if (!family) return
      setLoading(true)

      const { data: petsData } = await supabase.from('pets').select('*').eq('family_id', family.id)
      const pets = petsData as Pet[] ?? []
      const petMap = new Map(pets.map((p) => [p.id, p]))

      const petIds = pets.map((p) => p.id)
      if (petIds.length === 0) { setEvents([]); setLoading(false); return }

      const { data: appts } = await supabase.from('appointments').select('*').in('pet_id', petIds)
      const { data: vax } = await supabase.from('vaccinations').select('*').in('pet_id', petIds).not('next_due_date', 'is', null)
      const { data: routines } = await supabase.from('routines').select('*').in('pet_id', petIds)

      const allEvents: CalendarEvent[] = []

      for (const a of (appts as Appointment[] ?? [])) {
        const pet = petMap.get(a.pet_id)
        allEvents.push({
          date: a.date, type: a.type, title: a.title,
          pet_name: pet?.name ?? '', species: pet?.species ?? '', time: a.time,
        })
      }

      for (const v of (vax as Vaccination[] ?? [])) {
        if (v.next_due_date) {
          const pet = petMap.get(v.pet_id)
          allEvents.push({
            date: v.next_due_date, type: 'vaccination', title: `${v.vaccine_name} booster`,
            pet_name: pet?.name ?? '', species: pet?.species ?? '', time: '09:00',
          })
        }
      }

      // Routines show on every day
      for (const r of (routines as Routine[] ?? [])) {
        const pet = petMap.get(r.pet_id)
        allEvents.push({
          date: format(new Date(), 'yyyy-MM-dd'), type: 'routine',
          title: r.type === 'feeding' ? `Feeding ${r.portion || ''}` : 'Walk',
          pet_name: pet?.name ?? '', species: pet?.species ?? '', time: r.time,
        })
      }

      setEvents(allEvents)
      setLoading(false)
    }

    loadEvents()
  }, [family])

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

    const days: Date[] = []
    let day = gridStart
    while (day <= gridEnd) {
      days.push(day)
      day = addDays(day, 1)
    }
    return days
  }, [currentDate])

  function getEventsForDate(date: Date): CalendarEvent[] {
    const dateStr = format(date, 'yyyy-MM-dd')
    return events.filter((e) => e.date === dateStr).sort((a, b) => a.time.localeCompare(b.time))
  }

  const eventIcons = {
    vet: <Stethoscope className="w-3.5 h-3.5 text-secondary-600" />,
    grooming: <Scissors className="w-3.5 h-3.5 text-accent-600" />,
    vaccination: <Syringe className="w-3.5 h-3.5 text-success-600" />,
    routine: <Clock className="w-3.5 h-3.5 text-primary-600" />,
  }

  const eventColors = {
    vet: 'bg-secondary-500',
    grooming: 'bg-accent-500',
    vaccination: 'bg-success-500',
    routine: 'bg-primary-500',
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><p className="text-gray-400">Loading calendar...</p></div>
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
        <p className="text-sm text-gray-500 mt-0.5">Upcoming appointments and care events</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{format(currentDate, 'MMMM yyyy')}</h2>
            <div className="flex gap-1">
              <button onClick={() => setCurrentDate(addMonths(currentDate, -1))} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors">
                Today
              </button>
              <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-2">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const dayEvents = getEventsForDate(day)
              const isToday = isSameDay(day, new Date())
              const inMonth = isSameMonth(day, currentDate)
              const isSelected = selectedDate && isSameDay(day, selectedDate)

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    'aspect-square rounded-lg p-1 flex flex-col items-center gap-0.5 transition-colors text-xs',
                    !inMonth && 'text-gray-300',
                    inMonth && 'text-gray-700',
                    isToday && 'ring-2 ring-primary-500 ring-inset',
                    isSelected && !isToday && 'bg-primary-50',
                    !isSelected && !isToday && 'hover:bg-gray-50',
                  )}
                >
                  <span className={cn('font-medium', isToday && 'text-primary-600')}>{format(day, 'd')}</span>
                  {dayEvents.length > 0 && (
                    <div className="flex gap-0.5 flex-wrap justify-center">
                      {dayEvents.slice(0, 3).map((e, i) => (
                        <span key={i} className={cn('w-1.5 h-1.5 rounded-full', eventColors[e.type])} />
                      ))}
                      {dayEvents.length > 3 && <span className="text-[9px] text-gray-400">+{dayEvents.length - 3}</span>}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-gray-50">
            {Object.entries(eventColors).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1.5">
                <span className={cn('w-2 h-2 rounded-full', color)} />
                <span className="text-xs text-gray-500 capitalize">{type}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Selected day events */}
        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            {selectedDate ? format(selectedDate, 'EEEE, MMM d') : 'Select a date'}
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            {selectedDate ? `${getEventsForDate(selectedDate).length} event(s)` : 'Click a date to see events'}
          </p>

          {selectedDate && getEventsForDate(selectedDate).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No events on this day</p>
          ) : (
            <div className="space-y-3">
              {selectedDate && getEventsForDate(selectedDate).map((event, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                  <div className="flex-shrink-0 mt-0.5">{eventIcons[event.type]}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{event.title}</p>
                    <p className="text-xs text-gray-500">
                      {speciesIcon(event.species)} {event.pet_name} • {formatTime(event.time)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
