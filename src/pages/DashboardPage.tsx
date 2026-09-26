import { useEffect, useState, useCallback } from 'react'
import { useFamily } from '@/context/FamilyContext'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, Plus, PawPrint, Activity, TrendingUp, Calendar as CalIcon } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { formatTime, relativeTime, speciesIcon } from '@/lib/utils'
import type { Pet, ChecklistItem, Checklist, ActivityLog } from '@/types'

interface TodaysTask extends ChecklistItem {
  pet_name: string
  pet_id: string
  checklist_title: string
  species: string
}

export function DashboardPage() {
  const { family } = useFamily()
  const { user } = useAuth()
  const [pets, setPets] = useState<Pet[]>([])
  const [tasks, setTasks] = useState<TodaysTask[]>([])
  const [activity, setActivity] = useState<ActivityLog[]>([])
  const [stats, setStats] = useState<{ total: number; completed: number }>({ total: 0, completed: 0 })
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (!family) return
    setLoading(true)

    const { data: petsData } = await supabase
      .from('pets')
      .select('*')
      .eq('family_id', family.id)
      .order('created_at', { ascending: true })
    setPets(petsData as Pet[] ?? [])

    if (petsData && petsData.length > 0) {
      const petIds = petsData.map((p) => p.id)
      const todayDateStr = new Date().toISOString().split('T')[0]

      // Fetch checklists
      const { data: checklists } = await supabase
        .from('checklists')
        .select('id, pet_id, title, type, end_date')
        .in('pet_id', petIds)

      const activeChecklistIds = (checklists as (Checklist & { pet_id: string })[] ?? [])
        .filter((c) => {
          if (c.type === 'recurring') return true
          if (!c.end_date) return true
          return new Date(c.end_date) >= new Date(new Date().toDateString())
        })
        .map((c) => c.id)

      // Fetch items, routines, and appointments today
      const [itemsRes, routinesRes, apptsRes, vaxRes] = await Promise.all([
        activeChecklistIds.length > 0
          ? supabase.from('checklist_items').select('*').in('checklist_id', activeChecklistIds)
          : Promise.resolve({ data: [] }),
        supabase.from('routines').select('*').in('pet_id', petIds),
        supabase.from('appointments').select('*').in('pet_id', petIds).eq('date', todayDateStr),
        supabase.from('vaccinations').select('*').in('pet_id', petIds).or(`next_due_date.eq.${todayDateStr},date_given.eq.${todayDateStr}`),
      ])

      const checklistMap = new Map((checklists as Checklist[] ?? []).map((c) => [c.id, c]))
      const petMap = new Map((petsData as Pet[]).map((p) => [p.id, p]))

      // Saved daily completion from localStorage
      let localDaily: Record<string, boolean> = {}
      try {
        const saved = localStorage.getItem(`petpal_daily_${todayDateStr}`)
        if (saved) localDaily = JSON.parse(saved)
      } catch {}

      const allTasks: TodaysTask[] = []

      // 1. Routines
      for (const r of (routinesRes.data ?? [])) {
        const pet = petMap.get(r.pet_id)
        allTasks.push({
          id: `routine_${r.id}`,
          checklist_id: '',
          title: r.type === 'feeding' ? (r.portion ? `Feed: ${r.portion}` : 'Feed meal') : 'Walk',
          due_time: r.time,
          completed: Boolean(localDaily[`routine_${r.id}`]),
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
      for (const item of (itemsRes.data ?? [])) {
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
      for (const a of (apptsRes.data ?? [])) {
        const pet = petMap.get(a.pet_id)
        allTasks.push({
          id: `appt_${a.id}`,
          checklist_id: '',
          title: `${a.type === 'vet' ? '🩺 Vet' : '✂️ Grooming'}: ${a.title}`,
          due_time: a.time,
          completed: Boolean(localDaily[`appt_${a.id}`]),
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
      for (const v of (vaxRes.data ?? [])) {
        const pet = petMap.get(v.pet_id)
        allTasks.push({
          id: `vax_${v.id}`,
          checklist_id: '',
          title: `💉 Vaccine: ${v.vaccine_name}`,
          due_time: '09:00',
          completed: Boolean(localDaily[`vax_${v.id}`]),
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
    setActivity(activityData as ActivityLog[] ?? [])

    setLoading(false)
  }, [family])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function toggleTask(task: TodaysTask) {
    const completed = !task.completed
    const todayDateStr = new Date().toISOString().split('T')[0]

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
          details: `"${task.title}" for ${task.pet_name}`,
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
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-400">Loading dashboard...</p>
      </div>
    )
  }

  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Today's pet care at a glance</p>
        </div>
        <Link to="/app/pets" className="btn-primary">
          <Plus className="w-4 h-4" />
          Add pet
        </Link>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <PawPrint className="w-5 h-5 text-primary-500" />
            <span className="text-2xl font-bold text-gray-900">{pets.length}</span>
          </div>
          <p className="text-xs text-gray-500 font-medium">Pets in family</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle2 className="w-5 h-5 text-success-500" />
            <span className="text-2xl font-bold text-gray-900">{stats.completed}/{stats.total}</span>
          </div>
          <p className="text-xs text-gray-500 font-medium">Tasks done today</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-5 h-5 text-secondary-500" />
            <span className="text-2xl font-bold text-gray-900">{completionRate}%</span>
          </div>
          <p className="text-xs text-gray-500 font-medium">Completion rate</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <Activity className="w-5 h-5 text-accent-500" />
            <span className="text-2xl font-bold text-gray-900">{activity.length}</span>
          </div>
          <p className="text-xs text-gray-500 font-medium">Recent activities</p>
        </div>
      </div>

      {/* Progress bar */}
      {stats.total > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">Today's progress</h3>
            <span className="text-sm font-bold text-primary-600">{completionRate}%</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-full transition-all duration-500"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Today's tasks */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Today's tasks</h2>
            <Link to="/app/checklists" className="text-xs text-primary-600 font-medium hover:underline">
              View all checklists
            </Link>
          </div>

          {tasks.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="w-10 h-10" />}
              title="No tasks for today"
              description="Create checklists or add routines to start tracking your pet care tasks."
              action={
                <Link to="/app/checklists" className="btn-primary">
                  <Plus className="w-4 h-4" />
                  Create checklist
                </Link>
              }
            />
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => toggleTask(task)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left group"
                >
                  {task.completed ? (
                    <CheckCircle2 className="w-5 h-5 text-success-500 flex-shrink-0 animate-check-pop" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-300 flex-shrink-0 group-hover:text-primary-400 transition-colors" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${task.completed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                      {task.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {speciesIcon(task.species)} {task.pet_name}
                      {task.due_time ? ` • ${formatTime(task.due_time)}` : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Recent activity</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No activity yet</p>
          ) : (
            <div className="space-y-3">
              {activity.map((log) => (
                <div key={log.id} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {log.user_email[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{log.user_email.split('@')[0]}</span>{' '}
                      {log.action === 'completed_task' ? 'completed' : log.action.replace(/_/g, ' ')}
                      {log.details && <span className="text-gray-500"> {log.details}</span>}
                    </p>
                    <p className="text-xs text-gray-400">{relativeTime(log.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pets overview */}
      {pets.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Your pets</h2>
            <Link to="/app/pets" className="text-xs text-primary-600 font-medium hover:underline">
              Manage pets
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pets.map((pet) => (
              <Link
                key={pet.id}
                to={`/app/pets/${pet.id}`}
                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-primary-200 hover:bg-primary-50/50 transition-all"
              >
                {pet.photo_url ? (
                  <img src={pet.photo_url} alt={pet.name} className="w-12 h-12 rounded-xl object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center text-2xl">
                    {speciesIcon(pet.species)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{pet.name}</p>
                  <p className="text-xs text-gray-500 truncate">{pet.breed || pet.species}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
