import { useEffect, useState, useCallback, useMemo } from 'react'
import { useFamily } from '@/context/FamilyContext'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  Circle,
  Plus,
  PawPrint,
  Calendar as CalIcon,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Sparkles,
  FileText,
  Clock,
  Activity,
  HeartHandshake,
  Cake,
  Gift,
  PartyPopper,
  Users,
} from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { formatTime, formatDate, relativeTime, speciesIcon, cn } from '@/lib/utils'
import type { Pet, ChecklistItem, Checklist, ActivityLog } from '@/types'

interface TodaysTask extends ChecklistItem {
  pet_name: string
  pet_id: string
  checklist_title: string
  species: string
}

interface UpcomingEvent {
  id: string
  pet_id: string
  pet_name: string
  species: string
  type: 'vet' | 'grooming' | 'vaccination'
  title: string
  date: string
  time?: string | null
  location?: string | null
  notes?: string | null
  statusLabel: string
  isToday: boolean
  isOverdue?: boolean
}

function getGreeting(name?: string | null): string {
  const hour = new Date().getHours()
  const firstName = name?.split(' ')[0] || 'there'
  if (hour < 12) return `Good morning, ${firstName}`
  if (hour < 17) return `Good afternoon, ${firstName}`
  return `Good evening, ${firstName}`
}

function getTimeContext(dueTime?: string | null): { label: string; period: string } | null {
  if (!dueTime) return null
  const [hourStr] = dueTime.split(':')
  const hour = parseInt(hourStr, 10)
  if (isNaN(hour)) return null
  if (hour < 12) return { label: formatTime(dueTime), period: 'Morning' }
  if (hour < 17) return { label: formatTime(dueTime), period: 'Afternoon' }
  return { label: formatTime(dueTime), period: 'Evening' }
}

function getTaskBadge(task: TodaysTask) {
  if (task.id.startsWith('routine_')) {
    const isFeeding =
      task.title.toLowerCase().includes('feed') ||
      task.checklist_title.toLowerCase().includes('feed')
    if (isFeeding) {
      return { icon: '🍽️', label: 'Feeding', style: 'bg-amber-50 text-amber-700 border-amber-200/60' }
    }
    return { icon: '🦮', label: 'Walk', style: 'bg-emerald-50 text-emerald-700 border-emerald-200/60' }
  }
  if (task.id.startsWith('appt_')) {
    const isVet = task.title.toLowerCase().includes('vet')
    if (isVet) {
      return { icon: '🩺', label: 'Vet Visit', style: 'bg-blue-50 text-blue-700 border-blue-200/60' }
    }
    return { icon: '✂️', label: 'Grooming', style: 'bg-purple-50 text-purple-700 border-purple-200/60' }
  }
  if (task.id.startsWith('vax_')) {
    return { icon: '💉', label: 'Vaccine', style: 'bg-rose-50 text-rose-700 border-rose-200/60' }
  }
  return { icon: '💊', label: 'Care Task', style: 'bg-primary-50 text-primary-700 border-primary-200/60' }
}

function formatActivityLog(log: ActivityLog): { user: string; text: string; details?: string } {
  const userName = log.user_email?.split('@')[0] || 'Member'
  const capitalizedUser = userName.charAt(0).toUpperCase() + userName.slice(1)

  switch (log.action) {
    case 'completed_routine':
    case 'completed_task': {
      const taskName = log.details || 'a task'
      return {
        user: capitalizedUser,
        text: `completed ${taskName}`,
      }
    }
    case 'added_pet':
      return { user: capitalizedUser, text: `added pet ${log.details || ''}` }
    case 'created_checklist':
      return { user: capitalizedUser, text: `created checklist "${log.details || ''}"` }
    case 'submitted_feedback':
      return { user: capitalizedUser, text: `submitted feedback ${log.details || ''}` }
    default:
      return {
        user: capitalizedUser,
        text: `${log.action.replace(/_/g, ' ')} ${log.details || ''}`,
      }
  }
}

function getEventDateLabel(dateStr: string): { label: string; isToday: boolean; isPast: boolean } {
  const [y, m, d] = dateStr.split('-').map(Number)
  const target = new Date(y, m - 1, d)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  const diffTime = target.getTime() - now.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return { label: 'Today', isToday: true, isPast: false }
  if (diffDays === 1) return { label: 'Tomorrow', isToday: false, isPast: false }
  if (diffDays === -1) return { label: 'Yesterday', isToday: false, isPast: true }
  if (diffDays > 1) return { label: `In ${diffDays} days`, isToday: false, isPast: false }
  return { label: `${Math.abs(diffDays)}d ago`, isToday: false, isPast: true }
}

export function DashboardPage() {
  const { family } = useFamily()
  const { user, profile } = useAuth()
  const [pets, setPets] = useState<Pet[]>([])
  const [tasks, setTasks] = useState<TodaysTask[]>([])
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([])
  const [activity, setActivity] = useState<ActivityLog[]>([])
  const [stats, setStats] = useState<{ total: number; completed: number }>({ total: 0, completed: 0 })
  const [loading, setLoading] = useState(true)
  const [expandedPets, setExpandedPets] = useState<Record<string, boolean>>({})

  const todayDateStr = useMemo(() => new Date().toISOString().split('T')[0], [])

  const upcomingBirthdays = useMemo(() => {
    if (!pets || pets.length === 0) return []

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const currentYear = today.getFullYear()

    const list: Array<{
      pet: Pet
      daysUntil: number
      turningAge: number
      nextBirthdayDate: Date
    }> = []

    for (const pet of pets) {
      if (!pet.date_of_birth) continue
      const parts = pet.date_of_birth.split('-').map(Number)
      if (parts.length !== 3 || parts.some(isNaN)) continue

      const [birthYear, birthMonth, birthDay] = parts

      let nextBday = new Date(currentYear, birthMonth - 1, birthDay)
      nextBday.setHours(0, 0, 0, 0)

      if (nextBday.getTime() < today.getTime()) {
        nextBday = new Date(currentYear + 1, birthMonth - 1, birthDay)
        nextBday.setHours(0, 0, 0, 0)
      }

      const diffMs = nextBday.getTime() - today.getTime()
      const daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24))

      if (daysUntil >= 0 && daysUntil <= 30) {
        const turningAge = nextBday.getFullYear() - birthYear
        list.push({
          pet,
          daysUntil,
          turningAge,
          nextBirthdayDate: nextBday,
        })
      }
    }

    list.sort((a, b) => a.daysUntil - b.daysUntil)
    return list
  }, [pets])

  const togglePetExpanded = (petId: string) => {
    setExpandedPets((prev) => ({
      ...prev,
      [petId]: !prev[petId],
    }))
  }

  const setAllExpanded = (expand: boolean) => {
    const updated: Record<string, boolean> = {}
    groupedPets.forEach((g) => {
      updated[g.petId] = expand
    })
    setExpandedPets(updated)
  }

  const groupedPets = useMemo(() => {
    const petMap = new Map(pets.map((p) => [p.id, p]))
    const groupMap = new Map<
      string,
      {
        petId: string
        petName: string
        species: string
        petPhoto: string | null
        tasks: TodaysTask[]
        completedCount: number
        totalCount: number
      }
    >()

    // Initialize groups for pets that have tasks
    for (const task of tasks) {
      const pid = task.pet_id || 'unknown'
      if (!groupMap.has(pid)) {
        const pet = petMap.get(pid)
        groupMap.set(pid, {
          petId: pid,
          petName: pet?.name || task.pet_name || 'Pet',
          species: pet?.species || task.species || '',
          petPhoto: pet?.photo_url || null,
          tasks: [],
          completedCount: 0,
          totalCount: 0,
        })
      }
      const group = groupMap.get(pid)!
      group.tasks.push(task)
      group.totalCount += 1
      if (task.completed) {
        group.completedCount += 1
      }
    }

    return Array.from(groupMap.values())
  }, [pets, tasks])

  const loadData = useCallback(async () => {
    if (!family) return
    setLoading(true)

    const { data: petsData } = await supabase
      .from('pets')
      .select('*')
      .eq('family_id', family.id)
      .order('created_at', { ascending: true })
    setPets((petsData as Pet[]) ?? [])

    if (petsData && petsData.length > 0) {
      const petIds = petsData.map((p) => p.id)
      const today = new Date()
      const in7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
      const in7DaysDateStr = in7Days.toISOString().split('T')[0]
      const past7Days = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      const past7DaysDateStr = past7Days.toISOString().split('T')[0]

      // Fetch checklists
      const { data: checklists } = await supabase
        .from('checklists')
        .select('id, pet_id, title, type, end_date')
        .in('pet_id', petIds)

      const activeChecklistIds = ((checklists as (Checklist & { pet_id: string })[]) ?? [])
        .filter((c) => {
          if (c.type === 'recurring') return true
          if (!c.end_date) return true
          return new Date(c.end_date) >= new Date(new Date().toDateString())
        })
        .map((c) => c.id)

      // Fetch items, routines, appointments today, and upcoming 7-day non-daily events
      const [itemsRes, routinesRes, apptsRes, vaxRes, upcomingApptsRes, upcomingVaxRes] = await Promise.all([
        activeChecklistIds.length > 0
          ? supabase.from('checklist_items').select('*').in('checklist_id', activeChecklistIds)
          : Promise.resolve({ data: [] }),
        supabase.from('routines').select('*').in('pet_id', petIds),
        supabase.from('appointments').select('*').in('pet_id', petIds).eq('date', todayDateStr),
        supabase
          .from('vaccinations')
          .select('*')
          .in('pet_id', petIds)
          .or(`next_due_date.eq.${todayDateStr},date_given.eq.${todayDateStr}`),
        supabase
          .from('appointments')
          .select('*')
          .in('pet_id', petIds)
          .gte('date', past7DaysDateStr)
          .lte('date', in7DaysDateStr)
          .order('date', { ascending: true }),
        supabase
          .from('vaccinations')
          .select('*')
          .in('pet_id', petIds)
          .not('next_due_date', 'is', null)
          .gte('next_due_date', past7DaysDateStr)
          .lte('next_due_date', in7DaysDateStr)
          .order('next_due_date', { ascending: true }),
      ])

      const checklistMap = new Map(((checklists as Checklist[]) ?? []).map((c) => [c.id, c]))
      const petMap = new Map((petsData as Pet[]).map((p) => [p.id, p]))

      // Process upcoming non-daily events (appointments & vaccinations)
      const eventsList: UpcomingEvent[] = []

      for (const a of upcomingApptsRes.data ?? []) {
        const pet = petMap.get(a.pet_id)
        const rel = getEventDateLabel(a.date)
        eventsList.push({
          id: `upcoming_appt_${a.id}`,
          pet_id: a.pet_id,
          pet_name: pet?.name || 'Pet',
          species: pet?.species || '',
          type: a.type,
          title: a.title,
          date: a.date,
          time: a.time,
          location: a.location,
          notes: a.notes,
          statusLabel: rel.label,
          isToday: rel.isToday,
          isOverdue: rel.isPast,
        })
      }

      for (const v of upcomingVaxRes.data ?? []) {
        const pet = petMap.get(v.pet_id)
        const rel = getEventDateLabel(v.next_due_date!)
        eventsList.push({
          id: `upcoming_vax_${v.id}`,
          pet_id: v.pet_id,
          pet_name: pet?.name || 'Pet',
          species: pet?.species || '',
          type: 'vaccination',
          title: `${v.vaccine_name} booster`,
          date: v.next_due_date!,
          time: '09:00',
          notes: v.notes,
          statusLabel: rel.label,
          isToday: rel.isToday,
          isOverdue: rel.isPast,
        })
      }

      // Sort chronologically by date and time
      eventsList.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date)
        return (a.time || '').localeCompare(b.time || '')
      })

      setUpcomingEvents(eventsList)

      // Fetch activity logs for today to sync daily completions across users/devices
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

      // Saved daily completion from localStorage merged with server completed logs
      let localDaily: Record<string, boolean> = {}
      try {
        const saved = localStorage.getItem(`petpal_daily_${todayDateStr}`)
        if (saved) localDaily = JSON.parse(saved)
      } catch {}

      const effectiveDaily = { ...localDaily, ...serverCompleted }
      try {
        localStorage.setItem(`petpal_daily_${todayDateStr}`, JSON.stringify(effectiveDaily))
      } catch {}

      const allTasks: TodaysTask[] = []

      // 1. Routines
      for (const r of routinesRes.data ?? []) {
        const pet = petMap.get(r.pet_id)
        allTasks.push({
          id: `routine_${r.id}`,
          checklist_id: '',
          title: r.type === 'feeding' ? (r.portion ? `Feed: ${r.portion}` : 'Feed meal') : 'Walk',
          due_time: r.time,
          completed: Boolean(effectiveDaily[`routine_${r.id}`]),
          completed_by: null,
          completed_at: null,
          sort_order: 0,
          pet_name: pet?.name ?? 'Pet',
          pet_id: r.pet_id,
          checklist_title: r.notes || (r.type === 'feeding' ? 'Daily Feeding' : 'Daily Walk'),
          species: pet?.species ?? '',
        })
      }

      // 2. Checklist items
      for (const item of itemsRes.data ?? []) {
        const cl = checklistMap.get(item.checklist_id)
        const pet = cl ? petMap.get(cl.pet_id) : null
        allTasks.push({
          ...item,
          pet_name: pet?.name ?? 'Pet',
          pet_id: cl?.pet_id ?? '',
          checklist_title: cl?.title ?? 'Care Checklist',
          species: pet?.species ?? '',
        })
      }

      // 3. Appointments
      for (const a of apptsRes.data ?? []) {
        const pet = petMap.get(a.pet_id)
        allTasks.push({
          id: `appt_${a.id}`,
          checklist_id: '',
          title: `${a.type === 'vet' ? '🩺 Vet' : '✂️ Grooming'}: ${a.title}`,
          due_time: a.time,
          completed: Boolean(effectiveDaily[`appt_${a.id}`]),
          completed_by: null,
          completed_at: null,
          sort_order: 0,
          pet_name: pet?.name ?? 'Pet',
          pet_id: a.pet_id,
          checklist_title: a.location ? `${a.location}${a.notes ? ` • ${a.notes}` : ''}` : a.notes || 'Appointment',
          species: pet?.species ?? '',
        })
      }

      // 4. Vaccinations
      for (const v of vaxRes.data ?? []) {
        const pet = petMap.get(v.pet_id)
        allTasks.push({
          id: `vax_${v.id}`,
          checklist_id: '',
          title: `💉 Vaccine: ${v.vaccine_name}`,
          due_time: '09:00',
          completed: Boolean(effectiveDaily[`vax_${v.id}`]),
          completed_by: null,
          completed_at: null,
          sort_order: 0,
          pet_name: pet?.name ?? 'Pet',
          pet_id: v.pet_id,
          checklist_title: 'Vaccination Due',
          species: pet?.species ?? '',
        })
      }

      // Sort by time
      allTasks.sort((a, b) => {
        if (!a.due_time && !b.due_time) return 0
        if (!a.due_time) return 1
        if (!b.due_time) return -1
        return a.due_time.localeCompare(b.due_time)
      })

      setTasks(allTasks)
      setStats({
        total: allTasks.length,
        completed: allTasks.filter((t) => t.completed).length,
      })
    } else {
      setTasks([])
      setStats({ total: 0, completed: 0 })
    }

    const { data: activityData } = await supabase
      .from('activity_log')
      .select('*')
      .eq('family_id', family.id)
      .order('created_at', { ascending: false })
      .limit(10)
    setActivity((activityData as ActivityLog[]) ?? [])

    setLoading(false)
  }, [family, todayDateStr])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function toggleTask(task: TodaysTask) {
    const completed = !task.completed

    if (task.id.startsWith('routine_') || task.id.startsWith('appt_') || task.id.startsWith('vax_')) {
      let localDaily: Record<string, boolean> = {}
      try {
        const saved = localStorage.getItem(`petpal_daily_${todayDateStr}`)
        if (saved) localDaily = JSON.parse(saved)
      } catch {}
      localDaily[task.id] = completed
      try {
        localStorage.setItem(`petpal_daily_${todayDateStr}`, JSON.stringify(localDaily))
      } catch {}

      if (completed && family) {
        await supabase.from('activity_log').insert({
          family_id: family.id,
          pet_id: task.pet_id,
          user_id: user?.id,
          user_email: user?.email || '',
          action: 'completed_routine',
          details: task.id,
        })
      }
    } else {
      const { error } = await supabase
        .from('checklist_items')
        .update({
          completed,
          completed_by: completed ? user!.id : null,
          completed_at: completed ? new Date().toISOString() : null,
        })
        .eq('id', task.id)
      if (error) return

      if (completed && family) {
        await supabase.from('activity_log').insert({
          family_id: family.id,
          pet_id: task.pet_id,
          user_id: user!.id,
          user_email: user!.email!,
          action: 'completed_task',
          details: `"${task.title}" for ${task.pet_name}`,
        })
      }
    }

    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed } : t)))
    setStats((prev) => ({
      ...prev,
      completed: prev.completed + (completed ? 1 : -1),
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-gray-500">Loading your pet care dashboard...</p>
        </div>
      </div>
    )
  }

  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero Welcome Banner with Interactive Progress & Pet Avatars */}
      <div className="card p-6 sm:p-7 bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white relative overflow-hidden shadow-md border-0">
        {/* Subtle decorative background blur */}
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-white/5 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-32 -top-10 w-32 h-32 bg-secondary-400/10 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-medium text-primary-100 border border-white/10">
              <Sparkles className="w-3.5 h-3.5 text-accent-300" />
              <span>{formatDate(todayDateStr)}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {getGreeting(profile?.full_name)}
            </h1>
            <p className="text-sm sm:text-base text-primary-100/90 leading-relaxed">
              {stats.total === 0 ? (
                'Welcome to PetPal! Add your pets and setup daily feeding or routines to start tracking care.'
              ) : stats.completed === stats.total ? (
                'All caught up! 🎉 Your family completed all pet care tasks for today.'
              ) : (
                `Your family is ${completionRate}% through today's pet care (${stats.completed} of ${stats.total} tasks completed).`
              )}
            </p>

            {/* Pet Avatars Quick Status */}
            {groupedPets.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <span className="text-xs text-primary-200 font-medium">Pets today:</span>
                <div className="flex flex-wrap items-center gap-2">
                  {groupedPets.map((g) => {
                    const done = g.completedCount === g.totalCount && g.totalCount > 0
                    return (
                      <button
                        key={g.petId}
                        type="button"
                        onClick={() => togglePetExpanded(g.petId)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all backdrop-blur-md cursor-pointer',
                          done
                            ? 'bg-emerald-500/30 text-emerald-100 border border-emerald-400/40 hover:bg-emerald-500/40'
                            : 'bg-white/15 text-white border border-white/20 hover:bg-white/25'
                        )}
                        title={`Click to view ${g.petName}'s tasks (${g.completedCount}/${g.totalCount})`}
                      >
                        <span>{speciesIcon(g.species)}</span>
                        <span className="font-semibold">{g.petName}</span>
                        <span className="text-[10px] opacity-85 font-mono">
                          ({g.completedCount}/{g.totalCount})
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Radial / Progress Visual Ring */}
          {stats.total > 0 && (
            <div className="flex items-center gap-5 bg-white/10 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-white/15 shrink-0 self-start md:self-auto">
              <div className="relative w-16 h-16 flex items-center justify-center">
                <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-white/20"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-white transition-all duration-700 ease-out"
                    strokeDasharray={`${completionRate}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <span className="absolute text-sm font-bold text-white font-mono">{completionRate}%</span>
              </div>
              <div className="text-left">
                <p className="text-xs text-primary-200 font-medium">Daily Progress</p>
                <p className="text-lg font-bold text-white leading-tight mt-0.5">
                  {stats.completed} <span className="text-xs font-normal text-primary-200">/ {stats.total} done</span>
                </p>
                <p className="text-[11px] text-primary-200/80 mt-0.5">
                  {stats.total - stats.completed === 0 ? 'All finished 🎉' : `${stats.total - stats.completed} remaining`}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upcoming Pet Birthdays Section (Next 30 Days) */}
      {upcomingBirthdays.length > 0 && (
        <div className="card p-5 sm:p-6 bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-purple-500/10 border border-amber-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-500/20 text-amber-700 rounded-xl">
                <Cake className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-gray-900">Upcoming Birthdays</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white shadow-2xs">
                    {upcomingBirthdays.length} {upcomingBirthdays.length === 1 ? 'Birthday' : 'Birthdays'}
                  </span>
                </div>
                <p className="text-xs text-gray-600">Pets celebrating birthdays in the next 30 days!</p>
              </div>
            </div>
            <PartyPopper className="w-6 h-6 text-amber-500 animate-bounce hidden sm:block" />
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcomingBirthdays.map(({ pet, daysUntil, turningAge, nextBirthdayDate }) => {
              const formattedDate = nextBirthdayDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })

              const badgeText =
                daysUntil === 0
                  ? '🎉 Today!'
                  : daysUntil === 1
                  ? '🎂 Tomorrow!'
                  : `⏳ In ${daysUntil} days`

              const badgeColor =
                daysUntil === 0
                  ? 'bg-rose-500 text-white ring-2 ring-rose-300 animate-pulse'
                  : daysUntil === 1
                  ? 'bg-amber-500 text-white font-bold'
                  : 'bg-amber-100 text-amber-800 border border-amber-200'

              return (
                <Link
                  key={pet.id}
                  to={`/app/pets/${pet.id}`}
                  className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-white/90 backdrop-blur-sm border border-amber-200/60 shadow-2xs hover:shadow-md hover:border-amber-300 transition-all group relative overflow-hidden"
                >
                  <div className="relative shrink-0">
                    {pet.photo_url ? (
                      <img
                        src={pet.photo_url}
                        alt={pet.name}
                        className="w-14 h-14 rounded-2xl object-cover ring-2 ring-amber-400/80 shadow-xs group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-3xl ring-2 ring-amber-400/80 shadow-xs group-hover:scale-105 transition-transform">
                        {speciesIcon(pet.species)}
                      </div>
                    )}
                    <div className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white rounded-full p-1 shadow-2xs">
                      <Gift className="w-3 h-3" />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-bold text-gray-900 text-sm truncate group-hover:text-amber-700 transition-colors">
                        {pet.name}
                      </span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${badgeColor}`}>
                        {badgeText}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                      <span>{turningAge > 0 ? `Turning ${turningAge} ${turningAge === 1 ? 'year' : 'years'} old` : 'Celebrating Birthday'}</span>
                    </p>

                    <p className="text-[11px] text-gray-500 mt-0.5">
                      📅 {formattedDate}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick Action Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-gray-100 shadow-2xs">
        <div className="flex items-center gap-2 text-xs text-gray-500 font-medium px-1">
          <HeartHandshake className="w-4 h-4 text-primary-600" />
          <span>Quick actions:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/app/pets"
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 hover:border-primary-300"
          >
            <PawPrint className="w-3.5 h-3.5 text-primary-600" />
            <span>Add Pet</span>
          </Link>
          <Link
            to="/app/checklists"
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 hover:border-primary-300"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-600" />
            <span>Add Routine / Task</span>
          </Link>
          <Link
            to="/app/calendar"
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 hover:border-primary-300"
          >
            <CalIcon className="w-3.5 h-3.5 text-blue-600" />
            <span>Schedule Appointment</span>
          </Link>
          <Link
            to="/app/family"
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 hover:border-primary-300"
          >
            <Users className="w-3.5 h-3.5 text-purple-600" />
            <span>Invite Family Member</span>
          </Link>
        </div>
      </div>

      {/* Main Grid: Today's Tasks & Right Widgets */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Today's Tasks Column */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-primary-600" />
              <h2 className="text-base font-semibold text-gray-900">Today's tasks</h2>
            </div>
            <div className="flex items-center gap-3">
              {groupedPets.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const anyCollapsed = groupedPets.some((g) => !expandedPets[g.petId])
                    setAllExpanded(anyCollapsed)
                  }}
                  className="text-xs text-gray-500 hover:text-gray-800 font-medium transition-colors"
                >
                  {groupedPets.some((g) => !expandedPets[g.petId]) ? 'Expand all' : 'Collapse all'}
                </button>
              )}
              <Link to="/app/checklists" className="text-xs text-primary-600 font-medium hover:underline">
                View all checklists
              </Link>
            </div>
          </div>

          {tasks.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="w-10 h-10" />}
              title="No tasks scheduled for today"
              description="Set up daily routines (feeding, walks) or create care checklists to track your tasks."
              action={
                <Link to="/app/checklists" className="btn-primary">
                  <Plus className="w-4 h-4" />
                  Create routine or checklist
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {groupedPets.map((group) => {
                const isExpanded = Boolean(expandedPets[group.petId])
                const allDone = group.completedCount === group.totalCount && group.totalCount > 0
                const petPercent =
                  group.totalCount > 0 ? Math.round((group.completedCount / group.totalCount) * 100) : 0

                return (
                  <div
                    key={group.petId}
                    className="border border-gray-100 rounded-2xl bg-white overflow-hidden shadow-2xs transition-all hover:border-gray-200"
                  >
                    {/* Pet Accordion Header */}
                    <button
                      type="button"
                      onClick={() => togglePetExpanded(group.petId)}
                      className="w-full flex items-center justify-between p-3.5 hover:bg-gray-50/80 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {group.petPhoto ? (
                          <img
                            src={group.petPhoto}
                            alt={group.petName}
                            className="w-10 h-10 rounded-xl object-cover ring-1 ring-gray-200/60"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center text-xl flex-shrink-0">
                            {speciesIcon(group.species)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 text-sm truncate">
                              {group.petName}
                            </span>
                            <span className="text-xs text-gray-400 capitalize hidden sm:inline">
                              {group.species}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-gray-500">
                              {group.totalCount === 1 ? '1 task' : `${group.totalCount} tasks`} scheduled
                            </p>
                            <span className="text-gray-300">•</span>
                            <span className="text-xs font-medium text-gray-600">{petPercent}% done</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 flex-shrink-0">
                        {/* Summary badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                            allDone
                              ? 'bg-success-50 text-success-700 border border-success-200/60'
                              : 'bg-primary-50 text-primary-700 border border-primary-200/60'
                          }`}
                        >
                          {allDone ? <CheckCircle2 className="w-3.5 h-3.5 text-success-600" /> : null}
                          {group.completedCount}/{group.totalCount} done
                        </span>

                        {/* Chevron */}
                        <div className="p-1 rounded-lg text-gray-400 hover:text-gray-600">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 transition-transform duration-200" />
                          ) : (
                            <ChevronDown className="w-4 h-4 transition-transform duration-200" />
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Mini visual progress track under header */}
                    <div className="w-full bg-gray-100 h-1">
                      <div
                        className={cn(
                          'h-full transition-all duration-500',
                          allDone ? 'bg-success-500' : 'bg-primary-500'
                        )}
                        style={{ width: `${petPercent}%` }}
                      />
                    </div>

                    {/* Collapsible Tasks List */}
                    {isExpanded && (
                      <div className="border-t border-gray-50 bg-gray-50/30 px-2 py-2 space-y-1.5">
                        {group.tasks.map((task) => {
                          const badge = getTaskBadge(task)
                          const timeInfo = getTimeContext(task.due_time)

                          return (
                            <button
                              key={task.id}
                              type="button"
                              onClick={() => toggleTask(task)}
                              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-white transition-all text-left group border border-transparent hover:border-gray-100 hover:shadow-2xs"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                {task.completed ? (
                                  <CheckCircle2 className="w-5 h-5 text-success-500 flex-shrink-0 animate-check-pop" />
                                ) : (
                                  <Circle className="w-5 h-5 text-gray-300 flex-shrink-0 group-hover:text-primary-500 transition-colors" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <p
                                      className={cn(
                                        'text-sm font-medium transition-all',
                                        task.completed ? 'text-gray-400 line-through' : 'text-gray-900'
                                      )}
                                    >
                                      {task.title}
                                    </p>
                                    {/* Visual activity pill */}
                                    <span
                                      className={cn(
                                        'inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border',
                                        badge.style
                                      )}
                                    >
                                      <span>{badge.icon}</span>
                                      <span>{badge.label}</span>
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                                    {task.checklist_title}
                                  </p>
                                </div>
                              </div>

                              {/* Time context tag */}
                              {timeInfo ? (
                                <div className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-gray-100 text-gray-700 shrink-0">
                                  <Clock className="w-3 h-3 text-gray-400" />
                                  <span>{timeInfo.period}</span>
                                  <span className="text-gray-400 font-normal">•</span>
                                  <span>{timeInfo.label}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400 shrink-0">Anytime</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right column: Upcoming non-daily events & Recent activity */}
        <div className="space-y-6">
          {/* Upcoming Events (non-daily) */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CalIcon className="w-4 h-4 text-primary-600" />
                <h2 className="text-base font-semibold text-gray-900">Upcoming events</h2>
              </div>
              <Link
                to="/app/calendar"
                className="text-xs text-primary-600 font-medium hover:underline flex items-center gap-1"
              >
                Calendar <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {upcomingEvents.length === 0 ? (
              <div className="text-center py-6 px-3 bg-gray-50/60 rounded-xl border border-dashed border-gray-200">
                <CalIcon className="w-6 h-6 text-gray-400 mx-auto mb-1.5" />
                <p className="text-xs font-medium text-gray-600">No upcoming events</p>
                <p className="text-[11px] text-gray-400 mt-0.5">No vet visits or vaccines in the 7-day window.</p>
                <Link
                  to="/app/calendar"
                  className="inline-block text-xs font-semibold text-primary-600 mt-2 hover:underline"
                >
                  + Schedule event
                </Link>
              </div>
            ) : (
              <div className="space-y-2.5">
                {upcomingEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className={cn(
                      'p-3 rounded-xl border transition-all flex items-start gap-3',
                      evt.isToday
                        ? 'border-primary-200 bg-primary-50/40 shadow-2xs'
                        : evt.isOverdue
                        ? 'border-amber-200 bg-amber-50/40'
                        : 'border-gray-100 bg-gray-50/50 hover:bg-white hover:border-gray-200'
                    )}
                  >
                    <div className="p-2 rounded-lg bg-white shadow-2xs text-base flex-shrink-0">
                      {evt.type === 'vet' ? '🩺' : evt.type === 'grooming' ? '✂️' : '💉'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <p className="text-xs font-semibold text-gray-900 truncate">{evt.title}</p>
                        <span
                          className={cn(
                            'text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap',
                            evt.isToday
                              ? 'bg-primary-100 text-primary-700'
                              : evt.isOverdue
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-600'
                          )}
                        >
                          {evt.statusLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                        <span>
                          {speciesIcon(evt.species)} {evt.pet_name}
                        </span>
                        <span>•</span>
                        <span>
                          {formatDate(evt.date)}
                          {evt.time ? ` at ${formatTime(evt.time)}` : ''}
                        </span>
                      </div>
                      {evt.location && (
                        <p className="text-[11px] text-gray-400 mt-0.5 truncate">📍 {evt.location}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent activity */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-accent-600" />
                <h2 className="text-base font-semibold text-gray-900">Recent family activity</h2>
              </div>
            </div>

            {activity.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No activity yet</p>
            ) : (
              <div className="space-y-3">
                {activity.map((log) => {
                  const item = formatActivityLog(log)

                  return (
                    <div key={log.id} className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {log.user_email[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 leading-relaxed">
                          <span className="font-semibold text-gray-900">{item.user}</span>{' '}
                          <span>{item.text}</span>
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{relativeTime(log.created_at)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pets overview */}
      {pets.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <PawPrint className="w-4 h-4 text-primary-600" />
              <h2 className="text-base font-semibold text-gray-900">Your pets ({pets.length})</h2>
            </div>
            <Link to="/app/pets" className="text-xs text-primary-600 font-medium hover:underline">
              Manage pets
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pets.map((pet) => (
              <Link
                key={pet.id}
                to={`/app/pets/${pet.id}`}
                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-primary-200 hover:bg-primary-50/50 transition-all group"
              >
                {pet.photo_url ? (
                  <img src={pet.photo_url} alt={pet.name} className="w-12 h-12 rounded-xl object-cover ring-1 ring-gray-200/60 group-hover:scale-105 transition-transform" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center text-2xl group-hover:scale-105 transition-transform">
                    {speciesIcon(pet.species)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 text-sm truncate group-hover:text-primary-700 transition-colors">{pet.name}</p>
                  <p className="text-xs text-gray-500 truncate">{pet.breed || pet.species}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-primary-600 group-hover:translate-x-0.5 transition-all" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
