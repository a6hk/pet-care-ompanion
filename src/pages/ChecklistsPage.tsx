import { useEffect, useState, useCallback, useMemo } from 'react'
import { useFamily } from '@/context/FamilyContext'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import {
  CheckCircle2, Circle, Plus, Sparkles, Trash2, Calendar,
  Clock, Stethoscope, Syringe, Pill, Filter
} from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { formatTime, formatDate, speciesIcon, cn } from '@/lib/utils'
import type { Pet, Checklist, ChecklistItem, Routine, Appointment, Vaccination } from '@/types'

export type UnifiedItemType = 'routine_feeding' | 'routine_walking' | 'appointment' | 'vaccination' | 'checklist_item'

export interface UnifiedTodayTask {
  id: string
  taskType: UnifiedItemType
  petId: string
  petName: string
  species: string
  title: string
  subtitle?: string
  time: string | null // e.g. "08:00"
  completed: boolean
  completedBy?: string | null
  originalItem?: any
}

export function ChecklistsPage() {
  const { family } = useFamily()
  const { user } = useAuth()
  const [pets, setPets] = useState<Pet[]>([])
  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([])
  const [routines, setRoutines] = useState<Routine[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([])
  const [selectedPetId, setSelectedPetId] = useState<string>('all')
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'pending' | 'completed'>('all')
  const [loading, setLoading] = useState(true)

  // Local storage completion persistence for daily routines / events today
  const todayDateStr = useMemo(() => new Date().toISOString().split('T')[0], [])
  const [dailyCompletedMap, setDailyCompletedMap] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`petpal_daily_${todayDateStr}`)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  const loadAllTodayData = useCallback(async () => {
    if (!family) return
    setLoading(true)

    // 1. Fetch Pets
    const { data: petsData } = await supabase
      .from('pets')
      .select('*')
      .eq('family_id', family.id)
      .order('created_at', { ascending: true })

    const currentPets = (petsData as Pet[]) ?? []
    setPets(currentPets)

    if (currentPets.length === 0) {
      setChecklists([])
      setChecklistItems([])
      setRoutines([])
      setAppointments([])
      setVaccinations([])
      setLoading(false)
      return
    }

    const petIds = currentPets.map((p) => p.id)

    // 2. Fetch Checklists & Items
    const { data: clData } = await supabase
      .from('checklists')
      .select('*')
      .in('pet_id', petIds)
      .order('created_at', { ascending: false })

    const currentChecklists = (clData as Checklist[]) ?? []
    setChecklists(currentChecklists)

    if (currentChecklists.length > 0) {
      const clIds = currentChecklists.map((c) => c.id)
      const { data: itemData } = await supabase
        .from('checklist_items')
        .select('*')
        .in('checklist_id', clIds)
        .order('sort_order', { ascending: true })

      setChecklistItems((itemData as ChecklistItem[]) ?? [])
    } else {
      setChecklistItems([])
    }

    // 3. Fetch Daily Routines (Feedings & Walks)
    const { data: routineData } = await supabase
      .from('routines')
      .select('*')
      .in('pet_id', petIds)
      .order('time', { ascending: true })

    setRoutines((routineData as Routine[]) ?? [])

    // 4. Fetch Appointments Today
    const { data: apptData } = await supabase
      .from('appointments')
      .select('*')
      .in('pet_id', petIds)
      .eq('date', todayDateStr)
      .order('time', { ascending: true })

    setAppointments((apptData as Appointment[]) ?? [])

    // 5. Fetch Vaccinations Today (due today or given today)
    const { data: vaxData } = await supabase
      .from('vaccinations')
      .select('*')
      .in('pet_id', petIds)
      .or(`next_due_date.eq.${todayDateStr},date_given.eq.${todayDateStr}`)
      .order('created_at', { ascending: false })

    setVaccinations((vaxData as Vaccination[]) ?? [])

    // Sync logged activity for today's routine tasks to maintain multi-user state
    const { data: todayLogs } = await supabase
      .from('activity_log')
      .select('action, details, created_at')
      .eq('family_id', family.id)
      .gte('created_at', `${todayDateStr}T00:00:00.000Z`)

    const serverCompleted: Record<string, boolean> = {}
    if (todayLogs) {
      for (const log of todayLogs) {
        if (log.action === 'completed_routine' && log.details) {
          serverCompleted[log.details] = true
        }
      }
    }

    setDailyCompletedMap((prev) => {
      const merged = { ...prev, ...serverCompleted }
      try {
        localStorage.setItem(`petpal_daily_${todayDateStr}`, JSON.stringify(merged))
      } catch {}
      return merged
    })

    setLoading(false)
  }, [family, todayDateStr])

  useEffect(() => {
    loadAllTodayData()
  }, [loadAllTodayData])

  // Build combined task list
  const unifiedTasks: UnifiedTodayTask[] = useMemo(() => {
    const petMap = new Map(pets.map((p) => [p.id, p]))
    const checklistMap = new Map(checklists.map((c) => [c.id, c]))
    const list: UnifiedTodayTask[] = []

    // 1. Add Daily Routines
    for (const r of routines) {
      const pet = petMap.get(r.pet_id)
      const isCompleted = Boolean(dailyCompletedMap[`routine_${r.id}`])
      const isFeeding = r.type === 'feeding'
      list.push({
        id: `routine_${r.id}`,
        taskType: isFeeding ? 'routine_feeding' : 'routine_walking',
        petId: r.pet_id,
        petName: pet?.name ?? 'Pet',
        species: pet?.species ?? '',
        title: isFeeding ? (r.portion ? `Feed: ${r.portion}` : 'Feed meal') : 'Walk',
        subtitle: r.notes || (isFeeding ? 'Daily Feeding' : 'Daily Walk'),
        time: r.time,
        completed: isCompleted,
        originalItem: r,
      })
    }

    // 2. Add Active Checklist Items (Recurring or Active Time-Limited)
    for (const item of checklistItems) {
      const cl = checklistMap.get(item.checklist_id)
      if (!cl) continue
      // If time limited, ensure today is between start_date and end_date
      if (cl.type === 'time_limited' && cl.end_date && cl.end_date < todayDateStr) {
        continue
      }
      const pet = petMap.get(cl.pet_id)
      const isMed = cl.source === 'ai_vet' || cl.title.toLowerCase().includes('med')
      list.push({
        id: `item_${item.id}`,
        taskType: 'checklist_item',
        petId: cl.pet_id,
        petName: pet?.name ?? 'Pet',
        species: pet?.species ?? '',
        title: item.title,
        subtitle: cl.title,
        time: item.due_time,
        completed: item.completed,
        originalItem: item,
      })
    }

    // 3. Add Today's Appointments
    for (const a of appointments) {
      const pet = petMap.get(a.pet_id)
      const isCompleted = Boolean(dailyCompletedMap[`appt_${a.id}`])
      list.push({
        id: `appt_${a.id}`,
        taskType: 'appointment',
        petId: a.pet_id,
        petName: pet?.name ?? 'Pet',
        species: pet?.species ?? '',
        title: `${a.type === 'vet' ? '🩺 Vet' : '✂️ Grooming'}: ${a.title}`,
        subtitle: a.location ? `${a.location}${a.notes ? ` • ${a.notes}` : ''}` : a.notes || undefined,
        time: a.time,
        completed: isCompleted,
        originalItem: a,
      })
    }

    // 4. Add Today's Vaccinations
    for (const v of vaccinations) {
      const pet = petMap.get(v.pet_id)
      const isCompleted = Boolean(dailyCompletedMap[`vax_${v.id}`])
      list.push({
        id: `vax_${v.id}`,
        taskType: 'vaccination',
        petId: v.pet_id,
        petName: pet?.name ?? 'Pet',
        species: pet?.species ?? '',
        title: `💉 Vaccine: ${v.vaccine_name}`,
        subtitle: v.notes || (v.next_due_date === todayDateStr ? 'Due today' : 'Scheduled today'),
        time: '09:00',
        completed: isCompleted,
        originalItem: v,
      })
    }

    // Sort chronologically by time
    return list.sort((a, b) => {
      if (!a.time && !b.time) return 0
      if (!a.time) return 1
      if (!b.time) return -1
      return a.time.localeCompare(b.time)
    })
  }, [pets, checklists, checklistItems, routines, appointments, vaccinations, dailyCompletedMap, todayDateStr])

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return unifiedTasks.filter((t) => {
      if (selectedPetId !== 'all' && t.petId !== selectedPetId) return false
      if (selectedFilter === 'pending' && t.completed) return false
      if (selectedFilter === 'completed' && !t.completed) return false
      return true
    })
  }, [unifiedTasks, selectedPetId, selectedFilter])

  // Stats
  const totalCount = unifiedTasks.length
  const completedCount = unifiedTasks.filter((t) => t.completed).length
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  // Toggle completion
  async function toggleUnifiedTask(task: UnifiedTodayTask) {
    const nextCompleted = !task.completed

    if (task.taskType === 'checklist_item') {
      const item = task.originalItem as ChecklistItem
      await supabase
        .from('checklist_items')
        .update({
          completed: nextCompleted,
          completed_by: nextCompleted ? user?.id : null,
          completed_at: nextCompleted ? new Date().toISOString() : null,
        })
        .eq('id', item.id)

      if (nextCompleted && family) {
        await supabase.from('activity_log').insert({
          family_id: family.id,
          pet_id: task.petId,
          user_id: user?.id,
          user_email: user?.email || '',
          action: 'completed_task',
          details: `"${task.title}"`,
        })
      }

      setChecklistItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, completed: nextCompleted } : i))
      )
    } else {
      // Routine, appointment, or vaccination: update local map and log to activity
      const nextMap = { ...dailyCompletedMap, [task.id]: nextCompleted }
      setDailyCompletedMap(nextMap)
      try {
        localStorage.setItem(`petpal_daily_${todayDateStr}`, JSON.stringify(nextMap))
      } catch {}

      if (nextCompleted && family) {
        await supabase.from('activity_log').insert({
          family_id: family.id,
          pet_id: task.petId,
          user_id: user?.id,
          user_email: user?.email || '',
          action: 'completed_routine',
          details: task.id,
        })
      }
    }
  }

  // Delete checklist container
  async function deleteChecklist(id: string) {
    if (!confirm('Delete this checklist?')) return
    await supabase.from('checklists').delete().eq('id', id)
    loadAllTodayData()
  }

  function getBadgeIcon(type: UnifiedItemType) {
    switch (type) {
      case 'routine_feeding':
        return '🍽️'
      case 'routine_walking':
        return '🦮'
      case 'appointment':
        return <Stethoscope className="w-3.5 h-3.5" />
      case 'vaccination':
        return <Syringe className="w-3.5 h-3.5" />
      case 'checklist_item':
        return <Pill className="w-3.5 h-3.5" />
    }
  }

  function getBadgeLabel(type: UnifiedItemType) {
    switch (type) {
      case 'routine_feeding':
        return 'Feeding'
      case 'routine_walking':
        return 'Walking'
      case 'appointment':
        return 'Appointment'
      case 'vaccination':
        return 'Vaccine'
      case 'checklist_item':
        return 'Checklist'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-400">Loading today's schedule and activities...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Today's Care Checklist</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Combined feeding, walking, appointments, vaccines, and daily care for {formatDate(todayDateStr)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/app/pets" className="btn-primary">
            <Plus className="w-4 h-4" /> Add Routine or Task
          </Link>
        </div>
      </div>

      {/* Progress & Overview Card */}
      {totalCount > 0 && (
        <div className="card p-5 bg-gradient-to-r from-primary-500/10 via-white to-secondary-500/10 border border-primary-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-primary-700 uppercase tracking-wider">Today's Progress</p>
              <h2 className="text-xl font-bold text-gray-900 mt-0.5">
                {completedCount} of {totalCount} activities completed
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-36 sm:w-48 h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-600 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-sm font-bold text-primary-800">{progressPercent}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs: By Pet & Status */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
        {/* Pets filter tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setSelectedPetId('all')}
            className={cn(
              'px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all',
              selectedPetId === 'all'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
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
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              )}
            >
              <span>{speciesIcon(p.species)}</span>
              <span>{p.name}</span>
            </button>
          ))}
        </div>

        {/* Status filter buttons */}
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setSelectedFilter('all')}
            className={cn(
              'px-3 py-1 rounded-lg text-xs font-medium transition-colors',
              selectedFilter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
            )}
          >
            All ({totalCount})
          </button>
          <button
            onClick={() => setSelectedFilter('pending')}
            className={cn(
              'px-3 py-1 rounded-lg text-xs font-medium transition-colors',
              selectedFilter === 'pending' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
            )}
          >
            To Do ({totalCount - completedCount})
          </button>
          <button
            onClick={() => setSelectedFilter('completed')}
            className={cn(
              'px-3 py-1 rounded-lg text-xs font-medium transition-colors',
              selectedFilter === 'completed' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
            )}
          >
            Done ({completedCount})
          </button>
        </div>
      </div>

      {/* Main Unified Task List */}
      {filteredTasks.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<CheckCircle2 className="w-10 h-10" />}
            title={totalCount === 0 ? "No activities scheduled for today" : "No matching activities"}
            description={
              totalCount === 0
                ? "Set up daily routines (breakfast, dinner, walks), schedule appointments, or create checklists in your pet's profile."
                : "You're all caught up for the selected filter!"
            }
            action={
              totalCount === 0 ? (
                <Link to="/app/pets" className="btn-primary">
                  <Sparkles className="w-4 h-4" /> Go to Pet Profiles
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="card p-4 sm:p-5 divide-y divide-gray-100">
          {filteredTasks.map((task) => (
            <div
              key={task.id}
              className="py-3 first:pt-0 last:pb-0 flex items-start sm:items-center justify-between gap-3 group"
            >
              <button
                type="button"
                onClick={() => toggleUnifiedTask(task)}
                className="flex items-start sm:items-center gap-3.5 flex-1 min-w-0 text-left cursor-pointer"
              >
                <div className="mt-0.5 sm:mt-0 flex-shrink-0">
                  {task.completed ? (
                    <CheckCircle2 className="w-6 h-6 text-success-500 animate-check-pop" />
                  ) : (
                    <Circle className="w-6 h-6 text-gray-300 group-hover:text-primary-500 transition-colors" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'text-base font-semibold transition-all',
                        task.completed ? 'text-gray-400 line-through' : 'text-gray-900'
                      )}
                    >
                      {task.title}
                    </span>

                    {/* Activity Type Badge */}
                    <span className="badge bg-gray-100 text-gray-700 text-xs">
                      {getBadgeIcon(task.taskType)} {getBadgeLabel(task.taskType)}
                    </span>

                    {/* Pet Name Tag */}
                    <Link
                      to={`/app/pets/${task.petId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-medium text-primary-600 hover:underline flex items-center gap-1"
                    >
                      {speciesIcon(task.species)} {task.petName}
                    </Link>
                  </div>

                  {task.subtitle && (
                    <p className={cn('text-xs mt-0.5', task.completed ? 'text-gray-300' : 'text-gray-500')}>
                      {task.subtitle}
                    </p>
                  )}
                </div>
              </button>

              {/* Time display */}
              <div className="flex items-center gap-3 shrink-0">
                {task.time ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-gray-50 text-gray-700 border border-gray-100">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    {formatTime(task.time)}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">Anytime</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Standalone Checklists Section */}
      {checklists.length > 0 && (
        <div className="pt-6 border-t border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Checklist Collections</h2>
              <p className="text-xs text-gray-500">Manage checklist containers and recurring templates</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {checklists.map((cl) => {
              const clPet = pets.find((p) => p.id === cl.pet_id)
              const items = checklistItems.filter((i) => i.checklist_id === cl.id)
              const comp = items.filter((i) => i.completed).length

              return (
                <div key={cl.id} className="card p-4 flex flex-col justify-between">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs text-primary-600 font-medium">
                        {clPet ? `${speciesIcon(clPet.species)} ${clPet.name}` : 'Pet'}
                      </span>
                      <h3 className="font-semibold text-gray-900 text-sm mt-0.5">{cl.title}</h3>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="badge bg-primary-50 text-primary-700 text-xs">
                          {cl.type === 'recurring' ? 'Recurring' : 'Time-limited'}
                        </span>
                        <span className="badge bg-gray-100 text-gray-600 text-xs">
                          {cl.source.replace('ai_', 'AI ').replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteChecklist(cl.id)}
                      className="p-1.5 text-gray-400 hover:text-error-500 rounded-lg hover:bg-gray-50 transition-colors"
                      title="Delete checklist collection"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                    <span>{items.length} items total</span>
                    <span className="font-medium text-gray-700">{comp} completed</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
