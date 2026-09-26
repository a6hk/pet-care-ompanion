import { useEffect, useState, useMemo } from 'react'
import { useFamily } from '@/context/FamilyContext'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Stethoscope, Scissors, Syringe,
  Calendar as CalendarIcon, Clock, Plus, Filter, Download, ExternalLink,
  Sparkles, CalendarDays, CheckCircle2, ChevronDown
} from 'lucide-react'
import { formatTime, formatDate, speciesIcon, cn } from '@/lib/utils'
import type { Pet, Appointment, Vaccination } from '@/types'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, format,
  isSameDay, isSameMonth, addMonths, isToday as dateFnsIsToday, isAfter, startOfDay
} from 'date-fns'

interface CalendarEvent {
  id: string
  pet_id: string
  date: string
  type: 'vet' | 'grooming' | 'vaccination'
  title: string
  pet_name: string
  species: string
  time: string
  notes?: string | null
  location?: string | null
}

export function CalendarPage() {
  const { family } = useFamily()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [pets, setPets] = useState<Pet[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedPetId, setSelectedPetId] = useState<string>('all')
  const [selectedType, setSelectedType] = useState<'all' | 'vet' | 'vaccination' | 'grooming'>('all')

  useEffect(() => {
    async function loadEvents() {
      if (!family) return
      setLoading(true)

      const { data: petsData } = await supabase
        .from('pets')
        .select('*')
        .eq('family_id', family.id)
        .order('created_at', { ascending: true })

      const petsList = (petsData as Pet[]) ?? []
      setPets(petsList)
      const petMap = new Map(petsList.map((p) => [p.id, p]))

      const petIds = petsList.map((p) => p.id)
      if (petIds.length === 0) {
        setEvents([])
        setLoading(false)
        return
      }

      const { data: appts } = await supabase.from('appointments').select('*').in('pet_id', petIds)
      const { data: vax } = await supabase
        .from('vaccinations')
        .select('*')
        .in('pet_id', petIds)
        .not('next_due_date', 'is', null)

      const allEvents: CalendarEvent[] = []

      for (const a of (appts as Appointment[]) ?? []) {
        const pet = petMap.get(a.pet_id)
        allEvents.push({
          id: a.id,
          pet_id: a.pet_id,
          date: a.date,
          type: a.type,
          title: a.title,
          pet_name: pet?.name ?? 'Pet',
          species: pet?.species ?? '',
          time: a.time,
          notes: a.notes,
          location: a.location,
        })
      }

      for (const v of (vax as Vaccination[]) ?? []) {
        if (v.next_due_date) {
          const pet = petMap.get(v.pet_id)
          allEvents.push({
            id: v.id,
            pet_id: v.pet_id,
            date: v.next_due_date,
            type: 'vaccination',
            title: `${v.vaccine_name} booster`,
            pet_name: pet?.name ?? 'Pet',
            species: pet?.species ?? '',
            time: '09:00',
            notes: v.notes,
          })
        }
      }

      setEvents(allEvents)
      setLoading(false)
    }

    loadEvents()
  }, [family])

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (selectedPetId !== 'all' && e.pet_id !== selectedPetId) return false
      if (selectedType !== 'all' && e.type !== selectedType) return false
      return true
    })
  }, [events, selectedPetId, selectedType])

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
    return filteredEvents.filter((e) => e.date === dateStr).sort((a, b) => a.time.localeCompare(b.time))
  }

  // Upcoming events (today and future) sorted chronologically
  const upcomingEvents = useMemo(() => {
    const today = startOfDay(new Date())
    return filteredEvents
      .filter((e) => {
        try {
          const eventDate = new Date(`${e.date}T${e.time || '00:00'}`)
          return !isAfter(today, eventDate) || isSameDay(today, eventDate)
        } catch {
          return true
        }
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date)
        return a.time.localeCompare(b.time)
      })
  }, [filteredEvents])

  const eventIcons = {
    vet: <Stethoscope className="w-4 h-4 text-secondary-600" />,
    grooming: <Scissors className="w-4 h-4 text-accent-600" />,
    vaccination: <Syringe className="w-4 h-4 text-success-600" />,
  }

  const eventColors = {
    vet: 'bg-secondary-500',
    grooming: 'bg-accent-500',
    vaccination: 'bg-success-500',
  }

  const eventBadgeStyles = {
    vet: 'bg-secondary-50 text-secondary-700 border-secondary-200/60',
    grooming: 'bg-accent-50 text-accent-700 border-accent-200/60',
    vaccination: 'bg-success-50 text-success-700 border-success-200/60',
  }

  function createGoogleCalendarUrl(event: CalendarEvent) {
    const timeClean = event.time ? event.time.replace(':', '') : '0900'
    const dateClean = event.date.replace(/-/g, '')
    const startIso = `${dateClean}T${timeClean}00`
    const endIso = `${dateClean}T${String(parseInt(timeClean) + 100).padStart(4, '0')}00`

    const title = `${event.title} (${event.pet_name})`
    const details = `${event.notes || 'Pet care appointment via PetPal'}\nPet: ${event.pet_name}`
    const location = event.location || ''

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      title
    )}&dates=${startIso}/${endIso}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(
      location
    )}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-gray-500">Loading appointments and care calendar...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Care Calendar</h1>
            <span className="badge bg-primary-50 text-primary-700 border border-primary-100 text-xs">
              {filteredEvents.length} Total Events
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Track vet checkups, vaccine booster deadlines, and grooming appointments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/app/pets" className="btn-primary">
            <Plus className="w-4 h-4" /> Schedule Visit or Booster
          </Link>
        </div>
      </div>

      {/* Filter Bar: Pets & Types */}
      <div className="bg-white p-3.5 rounded-2xl border border-gray-100 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Pet Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <button
            onClick={() => setSelectedPetId('all')}
            className={cn(
              'px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all',
              selectedPetId === 'all'
                ? 'bg-primary-600 text-white shadow-xs'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200/60'
            )}
          >
            All Pets ({pets.length})
          </button>
          {pets.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPetId(p.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all',
                selectedPetId === p.id
                  ? 'bg-primary-600 text-white shadow-xs'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200/60'
              )}
            >
              <span>{speciesIcon(p.species)}</span>
              <span>{p.name}</span>
            </button>
          ))}
        </div>

        {/* Type Filter */}
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl shrink-0 self-start md:self-auto">
          {[
            { id: 'all', label: 'All Events' },
            { id: 'vet', label: '🩺 Vet' },
            { id: 'vaccination', label: '💉 Vaccines' },
            { id: 'grooming', label: '✂️ Grooming' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedType(t.id as any)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                selectedType === t.id
                  ? 'bg-white text-gray-900 shadow-xs font-semibold'
                  : 'text-gray-500 hover:text-gray-800'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        {/* Calendar Grid Box */}
        <div className="lg:col-span-2 card p-5 sm:p-6 shadow-sm border border-gray-100 space-y-4">
          {/* Month Navigation */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 tracking-tight">
              {format(currentDate, 'MMMM yyyy')}
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentDate(addMonths(currentDate, -1))}
                className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 border border-gray-200/70 transition-colors"
                title="Previous month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setCurrentDate(new Date())
                  setSelectedDate(new Date())
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100 border border-gray-200/70 transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 border border-gray-200/70 transition-colors"
                title="Next month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, idx) => (
              <div
                key={d}
                className={cn(
                  'text-xs font-bold py-2 uppercase tracking-wider',
                  idx >= 5 ? 'text-primary-700/60' : 'text-gray-400'
                )}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
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
                    'min-h-[64px] sm:min-h-[74px] rounded-xl p-1.5 flex flex-col items-center justify-between transition-all text-xs border',
                    !inMonth && 'text-gray-300 border-transparent bg-gray-50/40',
                    inMonth && !isSelected && 'text-gray-700 border-gray-100 hover:bg-gray-50/80 hover:border-gray-200',
                    isToday && 'ring-2 ring-primary-500 ring-inset font-bold',
                    isSelected && 'bg-primary-50/70 border-primary-300 text-primary-950 font-bold shadow-xs'
                  )}
                >
                  <div className="w-full flex items-center justify-between">
                    <span
                      className={cn(
                        'w-5 h-5 flex items-center justify-center rounded-full text-xs font-medium',
                        isToday && 'bg-primary-600 text-white font-bold'
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[10px] font-bold px-1 rounded-full bg-primary-100 text-primary-800">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  {dayEvents.length > 0 && (
                    <div className="w-full flex gap-1 flex-wrap justify-center mt-1">
                      {dayEvents.slice(0, 3).map((e) => (
                        <span
                          key={e.id}
                          className={cn('w-2 h-2 rounded-full shadow-2xs', eventColors[e.type])}
                          title={`${e.title} (${e.pet_name})`}
                        />
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[9px] text-gray-500 font-bold">+{dayEvents.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-gray-100 text-xs">
            <div className="flex flex-wrap items-center gap-3 text-gray-500">
              <span className="font-semibold text-gray-700">Event types:</span>
              {Object.entries(eventColors).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <span className={cn('w-2.5 h-2.5 rounded-full', color)} />
                  <span className="capitalize">{type}</span>
                </div>
              ))}
            </div>

            {selectedDate && (
              <button
                onClick={() => setSelectedDate(null)}
                className="text-primary-600 hover:text-primary-800 font-semibold"
              >
                Clear date selection
              </button>
            )}
          </div>
        </div>

        {/* Selected Date or Upcoming Agenda Side Panel */}
        <div className="card p-5 shadow-sm border border-gray-100 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div>
              <h3 className="text-base font-bold text-gray-900">
                {selectedDate ? format(selectedDate, 'EEEE, MMM d, yyyy') : 'Upcoming Care Agenda'}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {selectedDate
                  ? `${getEventsForDate(selectedDate).length} event(s) on this date`
                  : `Next ${upcomingEvents.length} scheduled visits & boosters`}
              </p>
            </div>
            {selectedDate && (
              <span className="badge bg-primary-50 text-primary-700 text-xs">Selected</span>
            )}
          </div>

          {/* Event Listing */}
          {selectedDate ? (
            getEventsForDate(selectedDate).length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <CalendarDays className="w-8 h-8 text-gray-300 mx-auto" />
                <p className="text-sm font-medium text-gray-600">No events on this day</p>
                <p className="text-xs text-gray-400">Click another date or schedule a visit.</p>
                <Link to="/app/pets" className="btn-secondary text-xs mt-3 inline-flex">
                  <Plus className="w-3.5 h-3.5" /> Add appointment
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {getEventsForDate(selectedDate).map((event) => (
                  <div
                    key={event.id}
                    className="p-3.5 rounded-2xl bg-gray-50/90 border border-gray-100 space-y-2 group hover:bg-white hover:shadow-xs transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <div className="p-2 rounded-xl bg-white shadow-2xs shrink-0 mt-0.5">
                          {eventIcons[event.type]}
                        </div>
                        <div>
                          <span className={cn('badge text-[10px] font-bold uppercase mb-1 border', eventBadgeStyles[event.type])}>
                            {event.type}
                          </span>
                          <h4 className="text-sm font-bold text-gray-900">{event.title}</h4>
                          <p className="text-xs text-gray-600 mt-0.5 flex items-center gap-1">
                            <span>{speciesIcon(event.species)}</span>
                            <span className="font-semibold text-gray-800">{event.pet_name}</span>
                            <span>•</span>
                            <Clock className="w-3 h-3 text-gray-400" />
                            <span>{formatTime(event.time)}</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {event.location && (
                      <p className="text-xs text-gray-500 pl-10">
                        📍 {event.location}
                      </p>
                    )}

                    {event.notes && (
                      <p className="text-xs text-gray-500 pl-10 italic">
                        "{event.notes}"
                      </p>
                    )}

                    <div className="pt-2 pl-10 flex items-center gap-2">
                      <a
                        href={createGoogleCalendarUrl(event)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-semibold text-primary-600 hover:text-primary-800 flex items-center gap-1 hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" /> Add to Google Cal
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : upcomingEvents.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <CalendarDays className="w-8 h-8 text-gray-300 mx-auto" />
              <p className="text-sm font-medium text-gray-600">No upcoming events scheduled</p>
              <p className="text-xs text-gray-400">All pet vet checkups and vaccines are up to date.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingEvents.slice(0, 8).map((event) => (
                <div
                  key={event.id}
                  className="p-3 rounded-xl bg-gray-50/80 border border-gray-100 hover:bg-white hover:shadow-xs transition-all space-y-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-white shadow-2xs">
                        {eventIcons[event.type]}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-900">{event.title}</h4>
                        <p className="text-[11px] text-gray-500">
                          {speciesIcon(event.species)} {event.pet_name}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-bold text-primary-800 block">
                        {formatDate(event.date)}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {formatTime(event.time)}
                      </span>
                    </div>
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
