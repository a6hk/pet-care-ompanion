import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useFamily } from '@/context/FamilyContext'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import {
  ArrowLeft, Plus, Trash2, CheckCircle2, Circle, Clock, Syringe, Stethoscope, Scissors,
  Calendar as CalIcon, PawPrint, Edit2, Sparkles, FileText, X, AlertTriangle, Loader2
} from 'lucide-react'
import { Modal } from '@/components/Modal'
import { EmptyState } from '@/components/EmptyState'
import { calculateAge, formatTime, formatDate, speciesIcon, cn } from '@/lib/utils'
import { parseVetInstructionsToTasks, generateDefaultPetRoutine } from '@/lib/aiChecklistParser'
import { PetFormModalContent, type PetFormData } from '@/components/PetFormModalContent'
import type { Pet, Checklist, ChecklistItem, Routine, Appointment, Vaccination } from '@/types'

type Tab = 'overview' | 'checklists' | 'routines' | 'appointments' | 'vaccinations'

export function PetDetailPage() {
  const { petId } = useParams()
  const navigate = useNavigate()
  const { family } = useFamily()
  const { user } = useAuth()
  const [pet, setPet] = useState<Pet | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)

  // Pet Edit & Delete states
  const [showEditPet, setShowEditPet] = useState(false)
  const [isUpdatingPet, setIsUpdatingPet] = useState(false)
  const [showDeletePetModal, setShowDeletePetModal] = useState(false)
  const [isDeletingPet, setIsDeletingPet] = useState(false)
  const [deletePetError, setDeletePetError] = useState<string | null>(null)

  // Checklist state
  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [items, setItems] = useState<Record<string, ChecklistItem[]>>({})
  const [showAddChecklist, setShowAddChecklist] = useState(false)
  const [showAI, setShowAI] = useState<'routine' | 'vet' | null>(null)
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<{ title: string; items: { title: string; due_time: string | null }[] } | null>(null)
  const [editingItems, setEditingItems] = useState<{ title: string; due_time: string | null }[]>([])
  const [checklistTitle, setChecklistTitle] = useState('')
  const [checklistType, setChecklistType] = useState<'recurring' | 'time_limited'>('recurring')
  const [checklistDuration, setChecklistDuration] = useState('7')

  // Routine multi-slot state
  const [routines, setRoutines] = useState<Routine[]>([])
  const [showAddRoutine, setShowAddRoutine] = useState(false)
  const [routineType, setRoutineType] = useState<'feeding' | 'walking'>('feeding')
  const [routineSlots, setRoutineSlots] = useState<{ label: string; time: string; portion: string; notes: string }[]>([
    { label: 'Breakfast', time: '08:00', portion: '1 cup', notes: '' },
    { label: 'Dinner', time: '18:00', portion: '1 cup', notes: '' },
  ])

  // Appointment state
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [showAddAppt, setShowAddAppt] = useState(false)
  const [apptForm, setApptForm] = useState({ type: 'vet' as 'vet' | 'grooming', title: '', date: '', time: '10:00', location: '', notes: '' })

  // Vaccination state
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([])
  const [showAddVax, setShowAddVax] = useState(false)
  const [vaxForm, setVaxForm] = useState({ vaccine_name: '', date_given: '', next_due_date: '', notes: '' })

  const [error, setError] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    if (!petId || !family) return
    setLoading(true)

    const { data: petData } = await supabase.from('pets').select('*').eq('id', petId).maybeSingle()
    setPet(petData as Pet | null)

    const { data: clData } = await supabase.from('checklists').select('*').eq('pet_id', petId).order('created_at', { ascending: false })
    const checklistsData = clData as Checklist[] ?? []
    setChecklists(checklistsData)

    if (checklistsData.length > 0) {
      const clIds = checklistsData.map((c) => c.id)
      const { data: itemData } = await supabase.from('checklist_items').select('*').in('checklist_id', clIds).order('sort_order', { ascending: true })
      const itemMap: Record<string, ChecklistItem[]> = {}
      for (const item of (itemData as ChecklistItem[] ?? [])) {
        if (!itemMap[item.checklist_id]) itemMap[item.checklist_id] = []
        itemMap[item.checklist_id].push(item)
      }
      setItems(itemMap)
    } else {
      setItems({})
    }

    const { data: routineData } = await supabase.from('routines').select('*').eq('pet_id', petId).order('time', { ascending: true })
    setRoutines(routineData as Routine[] ?? [])

    const { data: apptData } = await supabase.from('appointments').select('*').eq('pet_id', petId).order('date', { ascending: true })
    setAppointments(apptData as Appointment[] ?? [])

    const { data: vaxData } = await supabase.from('vaccinations').select('*').eq('pet_id', petId).order('date_given', { ascending: false })
    setVaccinations(vaxData as Vaccination[] ?? [])

    setLoading(false)
  }, [petId, family])

  useEffect(() => { loadAll() }, [loadAll])

  // ===== Pet Edit & Delete handlers =====
  async function handleEditPet(formData: PetFormData): Promise<{ error: string | null }> {
    if (!pet || !family || !user) return { error: 'Not authenticated' }
    setIsUpdatingPet(true)

    const { error: updateError } = await supabase
      .from('pets')
      .update({
        name: formData.name.trim(),
        species: formData.species,
        breed: formData.breed?.trim() || null,
        date_of_birth: formData.date_of_birth || null,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        photo_url: formData.photo_url || null,
        likes: formData.likes?.trim() || null,
        dislikes: formData.dislikes?.trim() || null,
        notes: formData.notes?.trim() || null,
      })
      .eq('id', pet.id)

    setIsUpdatingPet(false)

    if (updateError) {
      return { error: updateError.message }
    }

    await supabase.from('activity_log').insert({
      family_id: family.id,
      pet_id: pet.id,
      user_id: user.id,
      user_email: user.email!,
      action: 'updated_pet',
      details: `Updated details for ${formData.name}`,
    })

    setShowEditPet(false)
    loadAll()
    return { error: null }
  }

  async function handleDeletePet() {
    if (!pet || !family || !user) return
    setIsDeletingPet(true)
    setDeletePetError(null)

    const { error: delError } = await supabase
      .from('pets')
      .delete()
      .eq('id', pet.id)

    setIsDeletingPet(false)

    if (delError) {
      setDeletePetError(delError.message)
      return
    }

    await supabase.from('activity_log').insert({
      family_id: family.id,
      user_id: user.id,
      user_email: user.email!,
      action: 'deleted_pet',
      details: `Removed pet profile "${pet.name}"`,
    })

    setShowDeletePetModal(false)
    navigate('/app/pets', { replace: true })
  }

  // ===== Checklist handlers =====
  async function toggleItem(item: ChecklistItem, cl: Checklist) {
    const completed = !item.completed
    await supabase.from('checklist_items').update({
      completed,
      completed_by: completed ? user!.id : null,
      completed_at: completed ? new Date().toISOString() : null,
    }).eq('id', item.id)

    if (completed && family) {
      await supabase.from('activity_log').insert({
        family_id: family.id,
        pet_id: petId,
        user_id: user!.id,
        user_email: user!.email!,
        action: 'completed_task',
        details: `"${item.title}" from ${cl.title}`,
      })
    }

    setItems((prev) => ({
      ...prev,
      [item.checklist_id]: (prev[item.checklist_id] ?? []).map((i) => (i.id === item.id ? { ...i, completed } : i)),
    }))
  }

  async function deleteChecklist(cl: Checklist) {
    await supabase.from('checklists').delete().eq('id', cl.id)
    loadAll()
  }

  async function generateAI(type: 'routine' | 'vet') {
    if (!pet) return
    setAiLoading(true)
    setError(null)

    try {
      let result: { title: string; items: { title: string; due_time: string | null }[] } | null = null

      // 1. Try calling the Supabase Edge Function if available
      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-checklist`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            type,
            petName: pet.name,
            species: pet.species,
            breed: pet.breed,
            instructions: aiInput || undefined,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          if (data.items && Array.isArray(data.items) && data.items.length > 0) {
            result = {
              title: data.title || (type === 'routine' ? `${pet.name}'s Daily Care` : `${pet.name}'s Vet Instructions`),
              items: data.items.map((item: { title?: string; due_time?: string | null }) => ({
                title: item.title || '',
                due_time: item.due_time || null,
              })),
            }
          }
        } else {
          console.warn(`Edge function returned ${response.status}. Using smart client-side parser fallback.`)
        }
      } catch (networkOrFuncErr) {
        console.warn('Edge function unavailable, using client-side smart parser:', networkOrFuncErr)
      }

      // 2. If edge function was not deployed or returned no result, use the smart built-in analyzer
      if (!result) {
        if (type === 'vet') {
          result = parseVetInstructionsToTasks(aiInput, pet.name, pet.species)
        } else {
          result = generateDefaultPetRoutine(pet.name, pet.species, pet.breed || undefined)
        }
      }

      setAiResult(result)
      setEditingItems(result.items)
      setChecklistTitle(result.title)
      setChecklistType(type === 'routine' ? 'recurring' : 'time_limited')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate checklist.')
    } finally {
      setAiLoading(false)
    }
  }

  async function saveChecklist(source: 'ai_routine' | 'ai_vet' | 'manual') {
    if (!pet || !family || editingItems.length === 0) return
    setError(null)

    const endDate = checklistType === 'time_limited'
      ? new Date(Date.now() + parseInt(checklistDuration) * 86400000).toISOString().split('T')[0]
      : null

    const { data: cl, error: clError } = await supabase.from('checklists').insert({
      pet_id: pet.id,
      family_id: family.id,
      title: checklistTitle,
      type: checklistType,
      source,
      start_date: new Date().toISOString().split('T')[0],
      end_date: endDate,
      created_by: user!.id,
    }).select().single()

    if (clError) { setError(clError.message); return }

    const itemRows = editingItems
      .filter((i) => i.title.trim())
      .map((item, idx) => ({
        checklist_id: cl.id,
        title: item.title.trim(),
        due_time: item.due_time || null,
        sort_order: idx,
      }))

    if (itemRows.length > 0) {
      await supabase.from('checklist_items').insert(itemRows)
    }

    await supabase.from('activity_log').insert({
      family_id: family.id,
      pet_id: pet.id,
      user_id: user!.id,
      user_email: user!.email!,
      action: 'created_checklist',
      details: `"${checklistTitle}" (${source.replace('ai_', 'AI ').replace('_', ' ')})`,
    })

    resetChecklistForm()
    loadAll()
  }

  function resetChecklistForm() {
    setShowAddChecklist(false)
    setShowAI(null)
    setAiInput('')
    setAiResult(null)
    setEditingItems([])
    setChecklistTitle('')
    setChecklistType('recurring')
    setChecklistDuration('7')
    setError(null)
  }

  // ===== Routine handlers =====
  function switchRoutineType(type: 'feeding' | 'walking') {
    setRoutineType(type)
    if (type === 'feeding') {
      setRoutineSlots([
        { label: 'Breakfast', time: '08:00', portion: '1 cup', notes: '' },
        { label: 'Dinner', time: '18:00', portion: '1 cup', notes: '' },
      ])
    } else {
      setRoutineSlots([
        { label: 'Morning walk', time: '07:30', portion: '', notes: '20 mins' },
        { label: 'Evening walk', time: '18:30', portion: '', notes: '30 mins' },
      ])
    }
  }

  async function addRoutinesBatch() {
    if (!pet || !family || routineSlots.length === 0) return
    const validSlots = routineSlots.filter((s) => s.time)
    if (validSlots.length === 0) return

    const rows = validSlots.map((s) => {
      const combinedNotes = [s.label, s.notes].filter(Boolean).join(' • ')
      return {
        pet_id: pet.id,
        family_id: family.id,
        type: routineType,
        time: s.time,
        portion: routineType === 'feeding' ? (s.portion || null) : null,
        notes: combinedNotes || null,
      }
    })

    await supabase.from('routines').insert(rows)
    setShowAddRoutine(false)
    switchRoutineType('feeding')
    loadAll()
  }

  async function deleteRoutine(id: string) {
    await supabase.from('routines').delete().eq('id', id)
    loadAll()
  }

  // ===== Appointment handlers =====
  async function addAppointment() {
    if (!pet || !family) return
    await supabase.from('appointments').insert({
      pet_id: pet.id,
      family_id: family.id,
      type: apptForm.type,
      title: apptForm.title,
      date: apptForm.date,
      time: apptForm.time,
      location: apptForm.location || null,
      notes: apptForm.notes || null,
    })
    setShowAddAppt(false)
    setApptForm({ type: 'vet', title: '', date: '', time: '10:00', location: '', notes: '' })
    loadAll()
  }

  async function deleteAppointment(id: string) {
    await supabase.from('appointments').delete().eq('id', id)
    loadAll()
  }

  // ===== Vaccination handlers =====
  async function addVaccination() {
    if (!pet || !family) return
    await supabase.from('vaccinations').insert({
      pet_id: pet.id,
      family_id: family.id,
      vaccine_name: vaxForm.vaccine_name,
      date_given: vaxForm.date_given,
      next_due_date: vaxForm.next_due_date || null,
      notes: vaxForm.notes || null,
    })
    setShowAddVax(false)
    setVaxForm({ vaccine_name: '', date_given: '', next_due_date: '', notes: '' })
    loadAll()
  }

  async function deleteVaccination(id: string) {
    await supabase.from('vaccinations').delete().eq('id', id)
    loadAll()
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><p className="text-gray-400">Loading pet...</p></div>
  }

  if (!pet) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 mb-4">Pet not found</p>
        <Link to="/app/pets" className="btn-primary">Back to pets</Link>
      </div>
    )
  }

  const tabs: { id: Tab; label: string; icon: typeof PawPrint }[] = [
    { id: 'overview', label: 'Overview', icon: PawPrint },
    { id: 'checklists', label: 'Checklists', icon: CheckCircle2 },
    { id: 'routines', label: 'Routines', icon: Clock },
    { id: 'appointments', label: 'Appointments', icon: CalIcon },
    { id: 'vaccinations', label: 'Vaccinations', icon: Syringe },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <Link to="/app/pets" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to pets
      </Link>

      {/* Pet header */}
      <div className="card p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-4">
          {pet.photo_url ? (
            <img src={pet.photo_url} alt={pet.name} className="w-20 h-20 rounded-2xl object-cover border border-gray-100 shadow-sm" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-primary-50 flex items-center justify-center text-4xl">{speciesIcon(pet.species)}</div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{pet.name}</h1>
            <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-500">
              <span>{pet.breed || pet.species}</span>
              <span>•</span>
              <span>{calculateAge(pet.date_of_birth)}</span>
              {pet.weight && <><span>•</span><span>{pet.weight} kg</span></>}
            </div>
          </div>
        </div>

        {/* Edit and Delete Actions */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            onClick={() => setShowEditPet(true)}
            className="btn-secondary text-sm py-2 px-3.5 flex items-center gap-1.5"
            title="Edit Pet Details"
          >
            <Edit2 className="w-4 h-4 text-gray-600" />
            <span>Edit Pet</span>
          </button>
          <button
            onClick={() => {
              setDeletePetError(null)
              setShowDeletePetModal(true)
            }}
            className="p-2 rounded-xl text-gray-400 hover:text-error-600 hover:bg-error-50 border border-transparent hover:border-error-200 transition-colors"
            title="Delete Pet Profile"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              tab === t.id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div className="grid sm:grid-cols-2 gap-4 animate-fade-in">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">About {pet.name}</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Species</dt><dd className="font-medium text-gray-900">{pet.species}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Breed</dt><dd className="font-medium text-gray-900">{pet.breed || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Born</dt><dd className="font-medium text-gray-900">{formatDate(pet.date_of_birth)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Weight</dt><dd className="font-medium text-gray-900">{pet.weight ? `${pet.weight} kg` : '—'}</dd></div>
            </dl>
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Preferences</h3>
            <div className="space-y-3 text-sm">
              <div><p className="text-gray-500 text-xs mb-1">Likes</p><p className="text-gray-900">{pet.likes || 'Not specified'}</p></div>
              <div><p className="text-gray-500 text-xs mb-1">Dislikes</p><p className="text-gray-900">{pet.dislikes || 'Not specified'}</p></div>
              <div><p className="text-gray-500 text-xs mb-1">Notes</p><p className="text-gray-900">{pet.notes || 'No notes'}</p></div>
            </div>
          </div>
          <div className="card p-5 sm:col-span-2">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-primary-600">{checklists.length}</p>
                <p className="text-xs text-gray-500">Checklists</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-secondary-600">{routines.length}</p>
                <p className="text-xs text-gray-500">Routines</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-accent-600">{appointments.length}</p>
                <p className="text-xs text-gray-500">Appointments</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Checklists tab */}
      {tab === 'checklists' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setShowAI('routine'); setAiInput(''); setAiResult(null); }} className="btn-accent">
              <Sparkles className="w-4 h-4" /> AI Routine Checklist
            </button>
            <button onClick={() => { setShowAI('vet'); setAiInput(''); setAiResult(null); }} className="btn-accent">
              <Sparkles className="w-4 h-4" /> AI from Vet Notes
            </button>
            <button onClick={() => { setShowAddChecklist(true); setEditingItems([{ title: '', due_time: null }]); setChecklistTitle(''); setChecklistType('recurring'); }} className="btn-secondary">
              <FileText className="w-4 h-4" /> Manual Checklist
            </button>
          </div>

          {checklists.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<CheckCircle2 className="w-10 h-10" />}
                title="No checklists yet"
                description="Generate an AI care checklist based on breed, convert vet instructions, or create your own manual checklist."
              />
            </div>
          ) : (
            checklists.map((cl) => (
              <div key={cl.id} className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{cl.title}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn('badge', cl.type === 'recurring' ? 'bg-primary-50 text-primary-700' : 'bg-accent-50 text-accent-700')}>
                        {cl.type === 'recurring' ? 'Recurring' : `${checklistDuration} days`}
                      </span>
                      <span className="badge bg-gray-100 text-gray-600">
                        {cl.source === 'ai_routine' ? 'AI Routine' : cl.source === 'ai_vet' ? 'AI Vet' : 'Manual'}
                      </span>
                      {cl.end_date && <span className="text-xs text-gray-400">Ends {formatDate(cl.end_date)}</span>}
                    </div>
                  </div>
                  <button onClick={() => deleteChecklist(cl)} className="p-2 rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-1">
                  {(items[cl.id] ?? []).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => toggleItem(item, cl)}
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
                  {(items[cl.id] ?? []).length === 0 && <p className="text-sm text-gray-400 py-2">No items in this checklist</p>}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Routines tab */}
      {tab === 'routines' && (
        <div className="space-y-4 animate-fade-in">
          <button onClick={() => setShowAddRoutine(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Add routine
          </button>
          {routines.length === 0 ? (
            <div className="card">
              <EmptyState icon={<Clock className="w-10 h-10" />} title="No routines set" description="Add feeding or walking schedules to keep track of daily care times." />
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {routines.map((r) => (
                <div key={r.id} className="card p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn('p-2 rounded-xl', r.type === 'feeding' ? 'bg-accent-50 text-accent-600' : 'bg-secondary-50 text-secondary-600')}>
                      {r.type === 'feeding' ? '🍽️' : '🦮'}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 capitalize">{r.type}</p>
                      <p className="text-sm text-gray-500">{formatTime(r.time)}{r.portion ? ` • ${r.portion}` : ''}</p>
                      {r.notes && <p className="text-xs text-gray-400 mt-0.5">{r.notes}</p>}
                    </div>
                  </div>
                  <button onClick={() => deleteRoutine(r.id)} className="p-2 rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Appointments tab */}
      {tab === 'appointments' && (
        <div className="space-y-4 animate-fade-in">
          <button onClick={() => setShowAddAppt(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Add appointment
          </button>
          {appointments.length === 0 ? (
            <div className="card">
              <EmptyState icon={<CalIcon className="w-10 h-10" />} title="No appointments" description="Schedule vet visits or grooming appointments to keep track of upcoming care." />
            </div>
          ) : (
            <div className="space-y-3">
              {appointments.map((a) => (
                <div key={a.id} className="card p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn('p-2 rounded-xl', a.type === 'vet' ? 'bg-secondary-50 text-secondary-600' : 'bg-accent-50 text-accent-600')}>
                      {a.type === 'vet' ? <Stethoscope className="w-5 h-5" /> : <Scissors className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{a.title}</p>
                      <p className="text-sm text-gray-500">{formatDate(a.date)} at {formatTime(a.time)}{a.location ? ` • ${a.location}` : ''}</p>
                      {a.notes && <p className="text-xs text-gray-400 mt-0.5">{a.notes}</p>}
                    </div>
                  </div>
                  <button onClick={() => deleteAppointment(a.id)} className="p-2 rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Vaccinations tab */}
      {tab === 'vaccinations' && (
        <div className="space-y-4 animate-fade-in">
          <button onClick={() => setShowAddVax(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Add vaccination record
          </button>
          {vaccinations.length === 0 ? (
            <div className="card">
              <EmptyState icon={<Syringe className="w-10 h-10" />} title="No vaccination records" description="Log your pet's vaccinations to track when the next dose is due." />
            </div>
          ) : (
            <div className="space-y-3">
              {vaccinations.map((v) => (
                <div key={v.id} className="card p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-success-50 text-success-600">
                      <Syringe className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{v.vaccine_name}</p>
                      <p className="text-sm text-gray-500">Given: {formatDate(v.date_given)}</p>
                      {v.next_due_date && (
                        <p className={cn('text-xs mt-0.5', new Date(v.next_due_date) < new Date() ? 'text-error-500 font-medium' : 'text-gray-400')}>
                          Next due: {formatDate(v.next_due_date)}
                        </p>
                      )}
                      {v.notes && <p className="text-xs text-gray-400 mt-0.5">{v.notes}</p>}
                    </div>
                  </div>
                  <button onClick={() => deleteVaccination(v.id)} className="p-2 rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== AI Checklist Modal ===== */}
      <Modal open={showAI !== null} onClose={resetChecklistForm} title={showAI === 'routine' ? 'AI Routine Checklist' : 'AI Checklist from Vet Notes'} size="lg">
        <div className="space-y-4">
          {!aiResult && (
            <>
              <p className="text-sm text-gray-600">
                {showAI === 'routine'
                  ? `AI will suggest daily and monthly care items based on ${pet.name}'s species and breed. You can edit everything before saving.`
                  : 'Paste your vet instructions or prescription below. AI will convert them into a step-by-step checklist.'}
              </p>
              {showAI === 'vet' && (
                <div>
                  <label className="label">Vet instructions / prescription</label>
                  <textarea
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    className="input"
                    rows={6}
                    placeholder="e.g. Give 1 tablet of Amoxicillin twice daily after meals for 7 days. Apply eye drops in the morning. No exercise for 3 days. Follow-up check in 1 week."
                  />
                </div>
              )}
              {showAI === 'routine' && (
                <div className="bg-primary-50 rounded-xl p-4 text-sm text-gray-600">
                  <p className="font-medium text-gray-700 mb-1">Pet info:</p>
                  <p>Name: {pet.name} • Species: {pet.species} • Breed: {pet.breed || 'Not specified'}</p>
                </div>
              )}
              {error && <div className="text-sm text-error-600 bg-error-50 rounded-lg px-4 py-3">{error}</div>}
              <button onClick={() => showAI && generateAI(showAI)} disabled={aiLoading} className="btn-accent w-full">
                {aiLoading ? 'Generating with AI...' : <><Sparkles className="w-4 h-4" /> Generate checklist</>}
              </button>
            </>
          )}

          {aiResult && (
            <>
              <div>
                <label className="label">Checklist title</label>
                <input value={checklistTitle} onChange={(e) => setChecklistTitle(e.target.value)} className="input" />
              </div>
              {checklistType === 'time_limited' && (
                <div>
                  <label className="label">Duration (days)</label>
                  <input type="number" value={checklistDuration} onChange={(e) => setChecklistDuration(e.target.value)} className="input" min="1" max="90" />
                </div>
              )}
              <div>
                <label className="label">Items (editable)</label>
                <div className="space-y-2">
                  {editingItems.map((item, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        value={item.title}
                        onChange={(e) => setEditingItems(editingItems.map((it, i) => i === idx ? { ...it, title: e.target.value } : it))}
                        className="input flex-1"
                        placeholder="Item description"
                      />
                      <input
                        type="time"
                        value={item.due_time || ''}
                        onChange={(e) => setEditingItems(editingItems.map((it, i) => i === idx ? { ...it, due_time: e.target.value || null } : it))}
                        className="input w-32"
                      />
                      <button
                        onClick={() => setEditingItems(editingItems.filter((_, i) => i !== idx))}
                        className="p-2 rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setEditingItems([...editingItems, { title: '', due_time: null }])}
                  className="btn-ghost mt-2 text-sm"
                >
                  <Plus className="w-4 h-4" /> Add item
                </button>
              </div>
              {error && <div className="text-sm text-error-600 bg-error-50 rounded-lg px-4 py-3">{error}</div>}
              <div className="flex gap-3">
                <button onClick={() => { setAiResult(null); setEditingItems([]); }} className="btn-secondary flex-1">Start over</button>
                <button
                  onClick={() => saveChecklist(showAI === 'routine' ? 'ai_routine' : 'ai_vet')}
                  disabled={editingItems.filter((i) => i.title.trim()).length === 0}
                  className="btn-primary flex-1"
                >
                  Save checklist
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ===== Manual Checklist Modal ===== */}
      <Modal open={showAddChecklist} onClose={resetChecklistForm} title="Create manual checklist" size="lg">
        <div className="space-y-4">
          <div>
            <label className="label">Checklist title</label>
            <input value={checklistTitle} onChange={(e) => setChecklistTitle(e.target.value)} className="input" placeholder="e.g. Evening care routine" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Type</label>
              <select value={checklistType} onChange={(e) => setChecklistType(e.target.value as 'recurring' | 'time_limited')} className="input">
                <option value="recurring">Recurring (daily/monthly)</option>
                <option value="time_limited">Time-limited</option>
              </select>
            </div>
            {checklistType === 'time_limited' && (
              <div>
                <label className="label">Duration (days)</label>
                <input type="number" value={checklistDuration} onChange={(e) => setChecklistDuration(e.target.value)} className="input" min="1" max="90" />
              </div>
            )}
          </div>
          <div>
            <label className="label">Items</label>
            <div className="space-y-2">
              {editingItems.map((item, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    value={item.title}
                    onChange={(e) => setEditingItems(editingItems.map((it, i) => i === idx ? { ...it, title: e.target.value } : it))}
                    className="input flex-1"
                    placeholder="Item description"
                  />
                  <input
                    type="time"
                    value={item.due_time || ''}
                    onChange={(e) => setEditingItems(editingItems.map((it, i) => i === idx ? { ...it, due_time: e.target.value || null } : it))}
                    className="input w-32"
                  />
                  <button
                    onClick={() => setEditingItems(editingItems.filter((_, i) => i !== idx))}
                    className="p-2 rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setEditingItems([...editingItems, { title: '', due_time: null }])} className="btn-ghost mt-2 text-sm">
              <Plus className="w-4 h-4" /> Add item
            </button>
          </div>
          {error && <div className="text-sm text-error-600 bg-error-50 rounded-lg px-4 py-3">{error}</div>}
          <button
            onClick={() => saveChecklist('manual')}
            disabled={editingItems.filter((i) => i.title.trim()).length === 0 || !checklistTitle}
            className="btn-primary w-full"
          >
            Save checklist
          </button>
        </div>
      </Modal>

      {/* ===== Routine Multi-Slot Modal ===== */}
      <Modal open={showAddRoutine} onClose={() => setShowAddRoutine(false)} title="Setup daily routine" size="lg">
        <div className="space-y-5">
          {/* Routine Type Selector */}
          <div>
            <label className="label">Activity type</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => switchRoutineType('feeding')}
                className={cn(
                  'flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold transition-all',
                  routineType === 'feeding'
                    ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-sm ring-1 ring-primary-500'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                )}
              >
                <span className="text-lg">🍽️</span> Feeding
              </button>
              <button
                type="button"
                onClick={() => switchRoutineType('walking')}
                className={cn(
                  'flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold transition-all',
                  routineType === 'walking'
                    ? 'border-secondary-500 bg-secondary-50 text-secondary-700 shadow-sm ring-1 ring-secondary-500'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                )}
              >
                <span className="text-lg">🦮</span> Walking
              </button>
            </div>
          </div>

          {/* Quick preset buttons */}
          <div>
            <label className="label">Quick presets</label>
            <div className="flex flex-wrap gap-2">
              {routineType === 'feeding' ? (
                <>
                  <button
                    type="button"
                    onClick={() => setRoutineSlots([
                      { label: 'Breakfast', time: '08:00', portion: '1 cup', notes: '' },
                      { label: 'Dinner', time: '18:00', portion: '1 cup', notes: '' },
                    ])}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    2x Daily (Breakfast, Dinner)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoutineSlots([
                      { label: 'Breakfast', time: '08:00', portion: '3/4 cup', notes: '' },
                      { label: 'Lunch', time: '13:00', portion: '1/2 cup', notes: '' },
                      { label: 'Dinner', time: '19:00', portion: '3/4 cup', notes: '' },
                    ])}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    3x Daily (Breakfast, Lunch, Dinner)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoutineSlots([
                      { label: 'Breakfast', time: '08:00', portion: '1/2 cup', notes: '' },
                      { label: 'Lunch', time: '12:30', portion: '1/2 cup', notes: '' },
                      { label: 'Dinner', time: '17:30', portion: '1/2 cup', notes: '' },
                      { label: 'Night snack', time: '21:00', portion: 'small treat', notes: '' },
                    ])}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    4x Daily (with Snacks)
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setRoutineSlots([
                      { label: 'Morning walk', time: '07:30', portion: '', notes: '20 mins' },
                      { label: 'Evening walk', time: '18:30', portion: '', notes: '30 mins' },
                    ])}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    2x Daily (Morning & Evening)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoutineSlots([
                      { label: 'Morning walk', time: '07:00', portion: '', notes: '25 mins' },
                      { label: 'Mid-day walk', time: '13:00', portion: '', notes: '15 mins' },
                      { label: 'Evening walk', time: '19:00', portion: '', notes: '30 mins' },
                    ])}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    3x Daily (Morning, Noon & Evening)
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Slots List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="label mb-0">Scheduled times ({routineSlots.length})</label>
              <button
                type="button"
                onClick={() => setRoutineSlots([
                  ...routineSlots,
                  {
                    label: routineType === 'feeding' ? `Meal ${routineSlots.length + 1}` : `Walk ${routineSlots.length + 1}`,
                    time: '12:00',
                    portion: routineType === 'feeding' ? '1 cup' : '',
                    notes: '',
                  },
                ])}
                className="btn-ghost text-xs text-primary-600 py-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add another time
              </button>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {routineSlots.map((slot, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 rounded-xl border border-gray-100 bg-gray-50/70">
                  <div className="w-full sm:w-36">
                    <input
                      type="text"
                      value={slot.label}
                      onChange={(e) => setRoutineSlots(routineSlots.map((s, i) => i === idx ? { ...s, label: e.target.value } : s))}
                      placeholder={routineType === 'feeding' ? 'e.g. Breakfast' : 'e.g. Morning walk'}
                      className="input text-xs py-1.5"
                    />
                  </div>
                  <div className="w-full sm:w-32">
                    <input
                      type="time"
                      value={slot.time}
                      onChange={(e) => setRoutineSlots(routineSlots.map((s, i) => i === idx ? { ...s, time: e.target.value } : s))}
                      className="input text-xs py-1.5"
                      required
                    />
                  </div>
                  {routineType === 'feeding' ? (
                    <div className="w-full sm:w-32">
                      <input
                        type="text"
                        value={slot.portion}
                        onChange={(e) => setRoutineSlots(routineSlots.map((s, i) => i === idx ? { ...s, portion: e.target.value } : s))}
                        placeholder="Portion"
                        className="input text-xs py-1.5"
                      />
                    </div>
                  ) : null}
                  <div className="flex-1">
                    <input
                      type="text"
                      value={slot.notes}
                      onChange={(e) => setRoutineSlots(routineSlots.map((s, i) => i === idx ? { ...s, notes: e.target.value } : s))}
                      placeholder={routineType === 'feeding' ? 'Notes (optional)' : 'Duration / Notes'}
                      className="input text-xs py-1.5"
                    />
                  </div>
                  {routineSlots.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setRoutineSlots(routineSlots.filter((_, i) => i !== idx))}
                      className="p-2 text-gray-400 hover:text-error-500 rounded-lg hover:bg-white self-end sm:self-center transition-colors"
                      title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowAddRoutine(false)}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addRoutinesBatch}
              disabled={routineSlots.filter((s) => s.time).length === 0}
              className="btn-primary flex-1"
            >
              Save all ({routineSlots.length}) routines
            </button>
          </div>
        </div>
      </Modal>

      {/* ===== Appointment Modal ===== */}
      <Modal open={showAddAppt} onClose={() => setShowAddAppt(false)} title="Add appointment">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Type</label>
              <select value={apptForm.type} onChange={(e) => setApptForm({ ...apptForm, type: e.target.value as 'vet' | 'grooming' })} className="input">
                <option value="vet">Vet</option>
                <option value="grooming">Grooming</option>
              </select>
            </div>
            <div>
              <label className="label">Title</label>
              <input value={apptForm.title} onChange={(e) => setApptForm({ ...apptForm, title: e.target.value })} className="input" placeholder="e.g. Annual checkup" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Date</label>
              <input type="date" value={apptForm.date} onChange={(e) => setApptForm({ ...apptForm, date: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Time</label>
              <input type="time" value={apptForm.time} onChange={(e) => setApptForm({ ...apptForm, time: e.target.value })} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Location</label>
            <input value={apptForm.location} onChange={(e) => setApptForm({ ...apptForm, location: e.target.value })} className="input" placeholder="e.g. Greenfield Vet Clinic" />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={apptForm.notes} onChange={(e) => setApptForm({ ...apptForm, notes: e.target.value })} className="input" rows={2} />
          </div>
          <button onClick={addAppointment} disabled={!apptForm.title || !apptForm.date} className="btn-primary w-full">Add appointment</button>
        </div>
      </Modal>

      {/* ===== Vaccination Modal ===== */}
      <Modal open={showAddVax} onClose={() => setShowAddVax(false)} title="Add vaccination record">
        <div className="space-y-4">
          <div>
            <label className="label">Vaccine name</label>
            <input value={vaxForm.vaccine_name} onChange={(e) => setVaxForm({ ...vaxForm, vaccine_name: e.target.value })} className="input" placeholder="e.g. Rabies" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Date given</label>
              <input type="date" value={vaxForm.date_given} onChange={(e) => setVaxForm({ ...vaxForm, date_given: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Next due date</label>
              <input type="date" value={vaxForm.next_due_date} onChange={(e) => setVaxForm({ ...vaxForm, next_due_date: e.target.value })} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={vaxForm.notes} onChange={(e) => setVaxForm({ ...vaxForm, notes: e.target.value })} className="input" rows={2} />
          </div>
          <button onClick={addVaccination} disabled={!vaxForm.vaccine_name || !vaxForm.date_given} className="btn-primary w-full">Add record</button>
        </div>
      </Modal>

      {/* ===== Edit Pet Modal ===== */}
      <Modal open={showEditPet} onClose={() => setShowEditPet(false)} title={`Edit ${pet.name}'s Profile`} size="lg">
        <PetFormModalContent
          initialData={pet}
          onSubmit={handleEditPet}
          onCancel={() => setShowEditPet(false)}
          isSubmitting={isUpdatingPet}
          submitLabel="Save Changes"
        />
      </Modal>

      {/* ===== Delete Pet Confirmation Modal ===== */}
      <Modal open={showDeletePetModal} onClose={() => setShowDeletePetModal(false)} title="Delete Pet Profile" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-error-50 text-error-800 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-error-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-error-900">Are you sure you want to delete {pet.name}?</p>
              <p className="mt-1 text-xs text-error-700">
                This will permanently delete {pet.name}'s profile and associated checklists, routines, appointments, and vaccination history. This action cannot be undone.
              </p>
            </div>
          </div>

          {deletePetError && (
            <div className="text-sm text-error-600 bg-error-50 rounded-lg px-4 py-3">
              {deletePetError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowDeletePetModal(false)}
              disabled={isDeletingPet}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeletePet}
              disabled={isDeletingPet}
              className="btn-danger flex items-center gap-2"
            >
              {isDeletingPet ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Delete {pet.name}
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
