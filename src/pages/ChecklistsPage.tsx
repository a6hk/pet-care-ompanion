import { useEffect, useState, useCallback, useMemo } from 'react'
import { useFamily } from '@/context/FamilyContext'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import {
  CheckCircle2, Circle, Plus, Sparkles, Trash2,
  Clock, Stethoscope, Syringe, Pill, Filter, Search,
  Sunrise, Sun, Moon, CalendarCheck2, PartyPopper, Check, ExternalLink,
  Layers, ChevronRight, X
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

type TimeBlock = 'morning' | 'afternoon' | 'evening' | 'anytime'

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
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'time_grouped' | 'list'>('time_grouped')
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

      if (selectedCategory !== 'all') {
        if (selectedCategory === 'feeding' && t.taskType !== 'routine_feeding') return false
        if (selectedCategory === 'walking' && t.taskType !== 'routine_walking') return false
        if (selectedCategory === 'checklist' && t.taskType !== 'checklist_item') return false
        if (selectedCategory === 'medical' && t.taskType !== 'appointment' && t.taskType !== 'vaccination') return false
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchTitle = t.title.toLowerCase().includes(query)
        const matchPet = t.petName.toLowerCase().includes(query)
        const matchSub = (t.subtitle || '').toLowerCase().includes(query)
        if (!matchTitle && !matchPet && !matchSub) return false
      }

      return true
    })
  }, [unifiedTasks, selectedPetId, selectedFilter, selectedCategory, searchQuery])

  // Stats
  const totalCount = unifiedTasks.length
  const completedCount = unifiedTasks.filter((t) => t.completed).length
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  // Time Block categorization helper
  function getTimeBlock(time: string | null): TimeBlock {
    if (!time) return 'anytime'
    const hour = parseInt(time.split(':')[0], 10)
    if (isNaN(hour)) return 'anytime'
    if (hour < 12) return 'morning'
    if (hour < 17) return 'afternoon'
    return 'evening'
  }

  const groupedTasks = useMemo(() => {
    const groups: Record<TimeBlock, UnifiedTodayTask[]> = {
      morning: [],
      afternoon: [],
      evening: [],
      anytime: [],
    }

    for (const task of filteredTasks) {
      const block = getTimeBlock(task.time)
      groups[block].push(task)
    }

    return groups
  }, [filteredTasks])

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
        return <Stethoscope className="w-3.5 h-3.5 text-secondary-600" />
      case 'vaccination':
        return <Syringe className="w-3.5 h-3.5 text-success-600" />
      case 'checklist_item':
        return <Pill className="w-3.5 h-3.5 text-primary-600" />
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
        return 'Care Task'
    }
  }

  const timeBlockConfig: Record<
    TimeBlock,
    { title: string; subtitle: string; icon: typeof Sunrise; color: string; badgeBg: string }
  > = {
    morning: {
      title: 'Morning Care',
      subtitle: 'Before 12:00 PM',
      icon: Sunrise,
      color: 'text-amber-500',
      badgeBg: 'bg-amber-50 text-amber-700 border-amber-200/60',
    },
    afternoon: {
      title: 'Afternoon Care',
      subtitle: '12:00 PM – 5:00 PM',
      icon: Sun,
      color: 'text-primary-600',
      badgeBg: 'bg-primary-50 text-primary-700 border-primary-200/60',
    },
    evening: {
      title: 'Evening Care',
      subtitle: '5:00 PM onwards',
      icon: Moon,
      color: 'text-indigo-500',
      badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
    },
    anytime: {
      title: 'Anytime Today',
      subtitle: 'Flexible daily tasks',
      icon: CalendarCheck2,
      color: 'text-gray-500',
      badgeBg: 'bg-gray-50 text-gray-700 border-gray-200/60',
    },
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-gray-500">Loading today's schedule and activities...</p>
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
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Today's Care Checklist</h1>
            <span className="badge bg-primary-50 text-primary-700 border border-primary-100 text-xs">
              {formatDate(todayDateStr)}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Unified feeding, walking, medications, and health care schedule across your pets.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/app/pets" className="btn-primary">
            <Plus className="w-4 h-4" /> Add Routine or Task
          </Link>
        </div>
      </div>

      {/* Progress & Overview Hero Banner */}
      {totalCount > 0 && (
        <div className="card p-5 sm:p-6 bg-gradient-to-br from-primary-600/10 via-white to-secondary-500/10 border border-primary-100 shadow-sm relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary-600 animate-pulse" />
                <p className="text-xs font-bold uppercase tracking-wider text-primary-800">
                  Daily Care Completion
                </p>
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900">
                {completedCount === totalCount ? (
                  <span className="flex items-center gap-2 text-success-700">
                    <PartyPopper className="w-6 h-6 text-success-600" /> All pet care completed for today!
                  </span>
                ) : (
                  <span>
                    {completedCount} of {totalCount} activities completed
                  </span>
                )}
              </h2>
              <p className="text-xs sm:text-sm text-gray-600">
                {completedCount === totalCount
                  ? "Great job! Your family has taken care of all scheduled routines and checklists."
                  : `${totalCount - completedCount} activity remaining today. Keep up the great care!`}
              </p>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <div className="flex flex-col items-end gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-primary-700 tabular-nums">
                  {progressPercent}%
                </span>
                <div className="w-36 sm:w-48 h-3 bg-gray-200/80 rounded-full overflow-hidden p-0.5">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-700 ease-out',
                      progressPercent === 100 ? 'bg-success-500' : 'bg-primary-600'
                    )}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Controls: Pet Filter, Categories, Search, View Toggle */}
      <div className="space-y-3 bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
        {/* Top Filter Row: Pets & Search */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Pet Pills */}
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

          {/* Search Box */}
          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search today's tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 bg-gray-50 border border-gray-200/70 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Secondary Filter Row: Category & Status */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
          {/* Category Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: 'All Types' },
              { id: 'feeding', label: '🍽️ Feedings' },
              { id: 'walking', label: '🦮 Walks' },
              { id: 'checklist', label: '💊 Checklists' },
              { id: 'medical', label: '🩺 Vet & Vaccine' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                  selectedCategory === cat.id
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200/70'
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Status Segmented Control */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setSelectedFilter('all')}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-semibold transition-all',
                selectedFilter === 'all'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-800'
              )}
            >
              All ({totalCount})
            </button>
            <button
              onClick={() => setSelectedFilter('pending')}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-semibold transition-all',
                selectedFilter === 'pending'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-800'
              )}
            >
              To Do ({totalCount - completedCount})
            </button>
            <button
              onClick={() => setSelectedFilter('completed')}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-semibold transition-all',
                selectedFilter === 'completed'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-800'
              )}
            >
              Done ({completedCount})
            </button>
          </div>
        </div>
      </div>

      {/* Main Task Feed */}
      {filteredTasks.length === 0 ? (
        <div className="card p-8">
          <EmptyState
            icon={<CalendarCheck2 className="w-10 h-10 text-primary-400" />}
            title={totalCount === 0 ? "No activities scheduled for today" : "No matching activities"}
            description={
              totalCount === 0
                ? "Set up daily feeding routines, walking schedules, or health checklists in your pet's passport."
                : "Try adjusting your search terms or filter selections."
            }
            action={
              totalCount === 0 ? (
                <Link to="/app/pets" className="btn-primary">
                  <Sparkles className="w-4 h-4" /> Go to Pet Passports
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="space-y-6">
          {(['morning', 'afternoon', 'evening', 'anytime'] as TimeBlock[]).map((block) => {
            const blockTasks = groupedTasks[block]
            if (blockTasks.length === 0) return null

            const blockCfg = timeBlockConfig[block]
            const BlockIcon = blockCfg.icon
            const blockCompleted = blockTasks.filter((t) => t.completed).length

            return (
              <div key={block} className="space-y-2.5">
                {/* Block Header */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <div className={cn('p-1.5 rounded-lg bg-gray-100', blockCfg.color)}>
                      <BlockIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        {blockCfg.title}
                        <span className="text-xs font-normal text-gray-400">({blockCfg.subtitle})</span>
                      </h2>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-gray-500">
                    {blockCompleted}/{blockTasks.length} done
                  </span>
                </div>

                {/* Block Tasks Card */}
                <div className="card divide-y divide-gray-100 overflow-hidden shadow-xs">
                  {blockTasks.map((task) => (
                    <div
                      key={task.id}
                      className={cn(
                        'p-3.5 sm:p-4 flex items-start sm:items-center justify-between gap-3 transition-colors group hover:bg-gray-50/70',
                        task.completed && 'bg-gray-50/40'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleUnifiedTask(task)}
                        className="flex items-start sm:items-center gap-3.5 flex-1 min-w-0 text-left cursor-pointer"
                      >
                        <div className="mt-0.5 sm:mt-0 flex-shrink-0">
                          {task.completed ? (
                            <div className="w-6 h-6 rounded-full bg-success-500 text-white flex items-center justify-center animate-check-pop shadow-xs">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                          ) : (
                            <Circle className="w-6 h-6 text-gray-300 group-hover:text-primary-500 transition-colors" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                'text-sm sm:text-base font-semibold transition-all',
                                task.completed ? 'text-gray-400 line-through' : 'text-gray-900'
                              )}
                            >
                              {task.title}
                            </span>

                            {/* Badge */}
                            <span className="badge bg-gray-100 text-gray-700 text-[11px] font-medium border border-gray-200/50">
                              {getBadgeIcon(task.taskType)} {getBadgeLabel(task.taskType)}
                            </span>

                            {/* Pet link chip */}
                            <Link
                              to={`/app/pets/${task.petId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs font-medium text-primary-700 hover:text-primary-800 bg-primary-50/80 px-2 py-0.5 rounded-md hover:underline flex items-center gap-1 border border-primary-100/60"
                            >
                              {speciesIcon(task.species)} {task.petName}
                            </Link>
                          </div>

                          {task.subtitle && (
                            <p className={cn('text-xs mt-0.5', task.completed ? 'text-gray-400' : 'text-gray-500')}>
                              {task.subtitle}
                            </p>
                          )}
                        </div>
                      </button>

                      {/* Time display */}
                      <div className="flex items-center gap-3 shrink-0">
                        {task.time ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-gray-50 text-gray-700 border border-gray-200/70 shadow-2xs">
                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                            {formatTime(task.time)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 font-medium">Anytime</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Checklist Collections Section */}
      {checklists.length > 0 && (
        <div className="pt-8 border-t border-gray-200 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary-600" /> Checklist Collections & Programs
              </h2>
              <p className="text-xs text-gray-500">
                Custom checklists, medical programs, and recurring care packages.
              </p>
            </div>
            <Link to="/app/pets" className="text-xs font-semibold text-primary-600 hover:text-primary-800 flex items-center gap-1">
              Manage in Pets <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {checklists.map((cl) => {
              const clPet = pets.find((p) => p.id === cl.pet_id)
              const items = checklistItems.filter((i) => i.checklist_id === cl.id)
              const comp = items.filter((i) => i.completed).length
              const clPercent = items.length > 0 ? Math.round((comp / items.length) * 100) : 0

              return (
                <div
                  key={cl.id}
                  className="card p-4 flex flex-col justify-between hover:shadow-md transition-all border border-gray-100 bg-white group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs text-primary-600 font-bold flex items-center gap-1">
                          {clPet ? `${speciesIcon(clPet.species)} ${clPet.name}` : 'Pet'}
                        </span>
                        <h3 className="font-semibold text-gray-900 text-sm mt-0.5 group-hover:text-primary-700 transition-colors">
                          {cl.title}
                        </h3>
                      </div>
                      <button
                        onClick={() => deleteChecklist(cl.id)}
                        className="p-1.5 text-gray-400 hover:text-error-500 rounded-lg hover:bg-gray-50 transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete checklist collection"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                      <span className="badge bg-primary-50 text-primary-700 text-[11px] font-semibold">
                        {cl.type === 'recurring' ? '🔄 Daily Recurring' : '📅 Time-Limited'}
                      </span>
                      <span className="badge bg-gray-100 text-gray-600 text-[11px]">
                        {cl.source.replace('ai_', 'AI ').replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-gray-500 font-medium">
                        {comp} of {items.length} items
                      </span>
                      <span className="font-bold text-primary-700">{clPercent}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full transition-all duration-500"
                        style={{ width: `${clPercent}%` }}
                      />
                    </div>
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
