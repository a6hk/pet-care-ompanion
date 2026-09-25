import { useEffect, useState, useCallback } from 'react'
import { useFamily } from '@/context/FamilyContext'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, Plus, Sparkles, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { formatTime, formatDate, speciesIcon, cn } from '@/lib/utils'
import type { Pet, Checklist, ChecklistItem } from '@/types'

interface ChecklistWithPet extends Checklist {
  pet_name: string
  species: string
}

export function ChecklistsPage() {
  const { family } = useFamily()
  const [checklists, setChecklists] = useState<ChecklistWithPet[]>([])
  const [items, setItems] = useState<Record<string, ChecklistItem[]>>({})
  const [loading, setLoading] = useState(true)

  const loadChecklists = useCallback(async () => {
    if (!family) return
    setLoading(true)

    const { data: petsData } = await supabase.from('pets').select('*').eq('family_id', family.id)
    const pets = petsData as Pet[] ?? []
    const petMap = new Map(pets.map((p) => [p.id, p]))

    if (pets.length === 0) {
      setChecklists([])
      setItems({})
      setLoading(false)
      return
    }

    const { data: clData } = await supabase
      .from('checklists')
      .select('*')
      .in('pet_id', pets.map((p) => p.id))
      .order('created_at', { ascending: false })

    const cls = (clData as Checklist[] ?? []).map((cl) => ({
      ...cl,
      pet_name: petMap.get(cl.pet_id)?.name ?? 'Unknown',
      species: petMap.get(cl.pet_id)?.species ?? '',
    }))
    setChecklists(cls)

    if (cls.length > 0) {
      const clIds = cls.map((c) => c.id)
      const { data: itemData } = await supabase
        .from('checklist_items')
        .select('*')
        .in('checklist_id', clIds)
        .order('sort_order', { ascending: true })

      const itemMap: Record<string, ChecklistItem[]> = {}
      for (const item of (itemData as ChecklistItem[] ?? [])) {
        if (!itemMap[item.checklist_id]) itemMap[item.checklist_id] = []
        itemMap[item.checklist_id].push(item)
      }
      setItems(itemMap)
    } else {
      setItems({})
    }

    setLoading(false)
  }, [family])

  useEffect(() => { loadChecklists() }, [loadChecklists])

  async function toggleItem(item: ChecklistItem) {
    const { data: userData } = await supabase.auth.getUser()
    const currentUserId = userData.user?.id ?? null
    const currentUserEmail = userData.user?.email ?? ''
    const completed = !item.completed
    await supabase.from('checklist_items').update({
      completed,
      completed_by: completed ? currentUserId : null,
      completed_at: completed ? new Date().toISOString() : null,
    }).eq('id', item.id)

    if (completed && family) {
      const cl = checklists.find((c) => c.id === item.checklist_id)
      await supabase.from('activity_log').insert({
        family_id: family.id,
        pet_id: cl?.pet_id,
        user_id: currentUserId,
        user_email: currentUserEmail,
        action: 'completed_task',
        details: `"${item.title}" from ${cl?.title}`,
      })
    }

    setItems((prev) => ({
      ...prev,
      [item.checklist_id]: (prev[item.checklist_id] ?? []).map((i) => (i.id === item.id ? { ...i, completed } : i)),
    }))
  }

  async function deleteChecklist(id: string) {
    await supabase.from('checklists').delete().eq('id', id)
    loadChecklists()
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><p className="text-gray-400">Loading checklists...</p></div>
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Checklists</h1>
          <p className="text-sm text-gray-500 mt-0.5">All care checklists across your pets</p>
        </div>
        <Link to="/app/pets" className="btn-primary">
          <Plus className="w-4 h-4" /> New checklist
        </Link>
      </div>

      {checklists.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<CheckCircle2 className="w-10 h-10" />}
            title="No checklists yet"
            description="Go to a pet's profile to generate AI care checklists or create your own manual checklists."
            action={<Link to="/app/pets" className="btn-primary"><Sparkles className="w-4 h-4" /> Go to pets</Link>}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {checklists.map((cl) => {
            const clItems = items[cl.id] ?? []
            const completedCount = clItems.filter((i) => i.completed).length
            const progress = clItems.length > 0 ? Math.round((completedCount / clItems.length) * 100) : 0

            return (
              <div key={cl.id} className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link to={`/app/pets/${cl.pet_id}`} className="text-xs text-gray-500 hover:text-primary-600">
                        {speciesIcon(cl.species)} {cl.pet_name}
                      </Link>
                    </div>
                    <h3 className="font-semibold text-gray-900 mt-0.5">{cl.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn('badge', cl.type === 'recurring' ? 'bg-primary-50 text-primary-700' : 'bg-accent-50 text-accent-700')}>
                        {cl.type === 'recurring' ? 'Recurring' : 'Time-limited'}
                      </span>
                      <span className="badge bg-gray-100 text-gray-600">
                        {cl.source === 'ai_routine' ? 'AI Routine' : cl.source === 'ai_vet' ? 'AI Vet' : 'Manual'}
                      </span>
                      {cl.end_date && <span className="text-xs text-gray-400">Ends {formatDate(cl.end_date)}</span>}
                    </div>
                  </div>
                  <button onClick={() => deleteChecklist(cl.id)} className="p-2 rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {clItems.length > 0 && (
                  <div className="mb-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                )}

                <div className="space-y-1">
                  {clItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => toggleItem(item)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left group"
                    >
                      {item.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-success-500 flex-shrink-0 animate-check-pop" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-300 flex-shrink-0 group-hover:text-primary-400" />
                      )}
                      <span className={cn('text-sm flex-1', item.completed ? 'text-gray-400 line-through' : 'text-gray-700')}>
                        {item.title}
                      </span>
                      {item.due_time && <span className="text-xs text-gray-400">{formatTime(item.due_time)}</span>}
                    </button>
                  ))}
                  {clItems.length === 0 && <p className="text-sm text-gray-400 py-2">No items</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
