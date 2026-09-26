import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useFamily } from '@/context/FamilyContext'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import {
  ArrowLeft, Plus, Trash2, CheckCircle2, Circle, Clock, Syringe, Stethoscope, Scissors,
  Calendar as CalIcon, PawPrint, Edit2, Sparkles, FileText, X, AlertTriangle, Loader2,
  ChevronDown, ChevronUp, Check, ExternalLink, CalendarDays, HelpCircle, Utensils
} from 'lucide-react'
import { Modal } from '@/components/Modal'
import { EmptyState } from '@/components/EmptyState'
import { calculateAge, formatTime, formatDate, speciesIcon, cn } from '@/lib/utils'
import { parseVetInstructionsToTasks, generateSpecializedCareProgram } from '@/lib/aiChecklistParser'
import {
  parseNaturalLanguageRoutines,
  parseNaturalLanguageAppointment,
  parseNaturalLanguageVaccinations,
  type ParsedRoutineSlot,
  type ParsedAppointment,
  type ParsedVaccination
} from '@/lib/aiPetAssistant'
import { PetFormModalContent, type PetFormData } from '@/components/PetFormModalContent'
import type { Pet, Checklist, ChecklistItem, Routine, Appointment, Vaccination } from '@/types'

type Tab = 'overview' | 'checklists' | 'routines' | 'appointments' | 'vaccinations'

export function PetDetailPage() {
  const { petId } = useParams()
  const [searchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as Tab) || 'overview'
  const navigate = useNavigate()
  const { family } = useFamily()
  const { user } = useAuth()
  const [pet, setPet] = useState<Pet | null>(null)
  const [tab, setTab] = useState<Tab>(
    ['overview', 'checklists', 'routines', 'appointments', 'vaccinations'].includes(initialTab)
      ? initialTab
      : 'overview'
  )
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
  const [showAI, setShowAI] = useState<'vet' | 'program' | null>(null)
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<{ title: string; items: { title: string; due_time: string | null }[] } | null>(null)
  const [editingItems, setEditingItems] = useState<{ title: string; due_time: string | null }[]>([])
  const [checklistTitle, setChecklistTitle] = useState('')
  const [checklistType, setChecklistType] = useState<'recurring' | 'time_limited'>('time_limited')
  const [checklistDuration, setChecklistDuration] = useState('7')
  const [expandedChecklists, setExpandedChecklists] = useState<Record<string, boolean>>({})

  const toggleChecklistExpanded = (clId: string) => {
    setExpandedChecklists((prev) => ({
      ...prev,
      [clId]: !prev[clId],
    }))
  }

  // Routine state
  const [routines, setRoutines] = useState<Routine[]>([])
  const [showAddRoutine, setShowAddRoutine] = useState(false)
  const [routineType, setRoutineType] = useState<'feeding' | 'walking'>('feeding')
  const [routineSlots, setRoutineSlots] = useState<{ label: string; time: string; portion: string; notes: string }[]>([
    { label: 'Breakfast', time: '08:00', portion: '1 cup', notes: '' },
    { label: 'Dinner', time: '18:00', portion: '1 cup', notes: '' },
  ])

  // AI Routine Assistant State
  const [showAIRoutineModal, setShowAIRoutineModal] = useState(false)
  const [aiRoutinePrompt, setAiRoutinePrompt] = useState('')
  const [aiRoutineLoading, setAiRoutineLoading] = useState(false)
  const [aiRoutineResults, setAiRoutineResults] = useState<ParsedRoutineSlot[] | null>(null)

  // Appointment state
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [showAddAppt, setShowAddAppt] = useState(false)
  const [apptForm, setApptForm] = useState({ type: 'vet' as 'vet' | 'grooming', title: '', date: '', time: '10:00', location: '', notes: '' })

  // AI Appointment Assistant State
  const [showAIApptModal, setShowAIApptModal] = useState(false)
  const [aiApptPrompt, setAiApptPrompt] = useState('')
  const [aiApptLoading, setAiApptLoading] = useState(false)
  const [aiApptResult, setAiApptResult] = useState<ParsedAppointment | null>(null)

  // Vaccination state
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([])
  const [showAddVax, setShowAddVax] = useState(false)
  const [vaxForm, setVaxForm] = useState({ vaccine_name: '', date_given: '', next_due_date: '', notes: '' })

  // AI Vaccination Assistant State
  const [showAIVaxModal, setShowAIVaxModal] = useState(false)
  const [aiVaxPrompt, setAiVaxPrompt] = useState('')
  const [aiVaxLoading, setAiVaxLoading] = useState(false)
  const [aiVaxResults, setAiVaxResults] = useState<ParsedVaccination[] | null>(null)

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

  async function generateAI(type: 'vet' | 'program') {
    if (!pet) return
    setAiLoading(true)
    setError(null)

    try {
      let result: { title: string; items: { title: string; due_time: string | null }[] } | null = null

      if (type === 'vet') {
        // Try edge function fallback to parser
        try {
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-checklist`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              type: 'vet',
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
                title: data.title || `${pet.name}'s Vet & Medication Plan`,
                items: data.items.map((item: { title?: string; due_time?: string | null }) => ({
                  title: item.title || '',
                  due_time: item.due_time || null,
                })),
              }
            }
          }
        } catch {
          // fallback to client parser
        }

        if (!result) {
          result = parseVetInstructionsToTasks(aiInput, pet.name, pet.species)
        }
      } else {
        // Specialized Care & Training Program
        result = generateSpecializedCareProgram(pet.name, pet.species, 'general', aiInput)
      }

      setAiResult(result)
      setEditingItems(result.items)
      setChecklistTitle(result.title)
      setChecklistType(type === 'vet' ? 'time_limited' : 'recurring')
      setChecklistDuration(type === 'vet' ? '7' : '14')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate checklist.')
    } finally {
      setAiLoading(false)
    }
  }

  async function saveChecklist(source: 'ai_vet' | 'ai_program' | 'manual') {
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
    setChecklistType('time_limited')
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

  // ===== AI Routine Assistant Handlers =====
  async function handleGenerateAIRoutines() {
    if (!pet) return
    setAiRoutineLoading(true)
    setError(null)
    try {
      const results = parseNaturalLanguageRoutines(aiRoutinePrompt, pet.name, pet.species)
      setAiRoutineResults(results)
    } catch (err: any) {
      setError(err.message || 'Failed to parse routines.')
    } finally {
      setAiRoutineLoading(false)
    }
  }

  async function handleSaveAIRoutines() {
    if (!pet || !family || !aiRoutineResults || aiRoutineResults.length === 0) return
    const valid = aiRoutineResults.filter((r) => r.time)
    if (valid.length === 0) return

    const rows = valid.map((s) => ({
      pet_id: pet.id,
      family_id: family.id,
      type: s.type,
      time: s.time,
      portion: s.type === 'feeding' ? (s.portion || null) : null,
      notes: [s.label, s.notes].filter(Boolean).join(' • ') || null,
    }))

    await supabase.from('routines').insert(rows)

    if (user) {
      await supabase.from('activity_log').insert({
        family_id: family.id,
        pet_id: pet.id,
        user_id: user.id,
        user_email: user.email || '',
        action: 'created_routine',
        details: `Added ${valid.length} routine(s) with AI for ${pet.name}`,
      })
    }

    setShowAIRoutineModal(false)
    setAiRoutinePrompt('')
    setAiRoutineResults(null)
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

  // ===== AI Appointment Assistant Handlers =====
  async function handleGenerateAIAppt() {
    if (!pet) return
    setAiApptLoading(true)
    setError(null)
    try {
      const result = parseNaturalLanguageAppointment(aiApptPrompt, pet.name, pet.species)
      setAiApptResult(result)
    } catch (err: any) {
      setError(err.message || 'Failed to parse appointment.')
    } finally {
      setAiApptLoading(false)
    }
  }

  async function handleSaveAIAppt() {
    if (!pet || !family || !aiApptResult) return
    await supabase.from('appointments').insert({
      pet_id: pet.id,
      family_id: family.id,
      type: aiApptResult.type,
      title: aiApptResult.title,
      date: aiApptResult.date,
      time: aiApptResult.time,
      location: aiApptResult.location || null,
      notes: aiApptResult.notes || null,
    })

    if (user) {
      await supabase.from('activity_log').insert({
        family_id: family.id,
        pet_id: pet.id,
        user_id: user.id,
        user_email: user.email || '',
        action: 'created_appointment',
        details: `Scheduled ${aiApptResult.title} on ${aiApptResult.date} for ${pet.name}`,
      })
    }

    setShowAIApptModal(false)
    setAiApptPrompt('')
    setAiApptResult(null)
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

  // ===== AI Vaccination Assistant Handlers =====
  async function handleGenerateAIVax() {
    if (!pet) return
    setAiVaxLoading(true)
    setError(null)
    try {
      const results = parseNaturalLanguageVaccinations(aiVaxPrompt, pet.name, pet.species)
      setAiVaxResults(results)
    } catch (err: any) {
      setError(err.message || 'Failed to parse vaccinations.')
    } finally {
      setAiVaxLoading(false)
    }
  }

  async function handleSaveAIVax() {
    if (!pet || !family || !aiVaxResults || aiVaxResults.length === 0) return
    const valid = aiVaxResults.filter((v) => v.vaccine_name && v.date_given)
    if (valid.length === 0) return

    const rows = valid.map((v) => ({
      pet_id: pet.id,
      family_id: family.id,
      vaccine_name: v.vaccine_name,
      date_given: v.date_given,
      next_due_date: v.next_due_date || null,
      notes: v.notes || null,
    }))

    await supabase.from('vaccinations').insert(rows)

    if (user) {
      await supabase.from('activity_log').insert({
        family_id: family.id,
        pet_id: pet.id,
        user_id: user.id,
        user_email: user.email || '',
        action: 'created_vaccination',
        details: `Logged ${valid.length} vaccination record(s) with AI for ${pet.name}`,
      })
    }

    setShowAIVaxModal(false)
    setAiVaxPrompt('')
    setAiVaxResults(null)
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
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Back button */}
      <Link to="/app/pets" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
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
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                setShowAI('vet')
                setAiInput('')
                setAiResult(null)
              }}
              className="btn-accent flex items-center gap-1.5 shadow-2xs"
            >
              <Sparkles className="w-4 h-4 text-amber-500" /> AI Vet & Medication Plan
            </button>
            <button
              onClick={() => {
                setShowAI('program')
                setAiInput('')
                setAiResult(null)
              }}
              className="btn-accent flex items-center gap-1.5 shadow-2xs"
            >
              <Sparkles className="w-4 h-4 text-amber-500" /> AI Care & Training Program
            </button>
            <button
              onClick={() => {
                setShowAddChecklist(true)
                setEditingItems([{ title: '', due_time: null }])
                setChecklistTitle('')
                setChecklistType('time_limited')
              }}
              className="btn-secondary flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4 text-gray-500" /> Manual Checklist
            </button>
          </div>

          {checklists.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<CheckCircle2 className="w-10 h-10" />}
                title="No checklists yet"
                description="Generate an AI medication plan from vet notes, create a specialized training program, or build a custom checklist."
              />
            </div>
          ) : (
            <div className="space-y-3">
              {checklists.length > 1 && (
                <div className="flex justify-end pr-1">
                  <button
                    type="button"
                    onClick={() => {
                      const anyCollapsed = checklists.some((c) => !expandedChecklists[c.id])
                      const updated: Record<string, boolean> = {}
                      checklists.forEach((c) => {
                        updated[c.id] = anyCollapsed
                      })
                      setExpandedChecklists(updated)
                    }}
                    className="text-xs text-gray-500 hover:text-gray-800 font-medium transition-colors"
                  >
                    {checklists.some((c) => !expandedChecklists[c.id])
                      ? 'Expand all checklists'
                      : 'Collapse all checklists'}
                  </button>
                </div>
              )}

              {checklists.map((cl) => {
                const clItems = items[cl.id] ?? []
                const completedCount = clItems.filter((i) => i.completed).length
                const totalCount = clItems.length
                const isExpanded = Boolean(expandedChecklists[cl.id])
                const allDone = totalCount > 0 && completedCount === totalCount

                return (
                  <div key={cl.id} className="card overflow-hidden transition-all duration-200">
                    {/* Collapsible Header */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleChecklistExpanded(cl.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggleChecklistExpanded(cl.id)
                        }
                      }}
                      className="p-4 sm:p-5 flex items-start sm:items-center justify-between gap-3 cursor-pointer hover:bg-gray-50/70 transition-colors select-none"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">
                            {cl.title}
                          </h3>
                          <span
                            className={cn(
                              'badge text-xs',
                              cl.type === 'recurring'
                                ? 'bg-primary-50 text-primary-700'
                                : 'bg-accent-50 text-accent-700'
                            )}
                          >
                            {cl.type === 'recurring' ? 'Recurring' : 'Time-limited'}
                          </span>
                          <span className="badge bg-gray-100 text-gray-600 text-xs">
                            {cl.source.replace('ai_', 'AI ').replace('_', ' ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          {cl.start_date && <span>Starts {formatDate(cl.start_date)}</span>}
                          {cl.end_date && <span>•</span>}
                          {cl.end_date && <span>Ends {formatDate(cl.end_date)}</span>}
                          {cl.end_date && <span>•</span>}
                          <span>{totalCount} {totalCount === 1 ? 'task' : 'tasks'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        {/* Summary badge */}
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors',
                            allDone
                              ? 'bg-success-50 text-success-700 border border-success-200/60'
                              : 'bg-primary-50 text-primary-700 border border-primary-200/60'
                          )}
                        >
                          {allDone && <CheckCircle2 className="w-3.5 h-3.5 text-success-600" />}
                          {completedCount}/{totalCount} done
                        </span>

                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={() => deleteChecklist(cl)}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500 transition-colors"
                          title="Delete checklist"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        {/* Chevron button */}
                        <button
                          type="button"
                          onClick={() => toggleChecklistExpanded(cl.id)}
                          className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                          aria-label={isExpanded ? 'Collapse checklist' : 'Expand checklist'}
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 transition-transform duration-200" />
                          ) : (
                            <ChevronDown className="w-4 h-4 transition-transform duration-200" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Expandable checklist items */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 bg-gray-50/40 p-3 sm:p-4 space-y-1">
                        {clItems.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => toggleItem(item, cl)}
                            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white transition-all text-left group"
                          >
                            {item.completed ? (
                              <CheckCircle2 className="w-5 h-5 text-success-500 flex-shrink-0 animate-check-pop" />
                            ) : (
                              <Circle className="w-5 h-5 text-gray-300 flex-shrink-0 group-hover:text-primary-400" />
                            )}
                            <span
                              className={cn(
                                'text-sm flex-1',
                                item.completed ? 'text-gray-400 line-through' : 'text-gray-700'
                              )}
                            >
                              {item.title}
                            </span>
                            {item.due_time && (
                              <span className="text-xs text-gray-400">
                                {formatTime(item.due_time)}
                              </span>
                            )}
                          </button>
                        ))}
                        {clItems.length === 0 && (
                          <p className="text-sm text-gray-400 py-2 text-center">
                            No items in this checklist
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Routines tab */}
      {tab === 'routines' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                setAiRoutinePrompt('')
                setAiRoutineResults(null)
                setShowAIRoutineModal(true)
              }}
              className="btn-accent flex items-center gap-1.5 shadow-2xs"
            >
              <Sparkles className="w-4 h-4 text-amber-500" /> AI Routine Assistant
            </button>
            <button onClick={() => setShowAddRoutine(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> Add Routine
            </button>
          </div>

          {routines.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<Clock className="w-10 h-10" />}
                title="No routines set"
                description="Use the AI Routine Assistant or manually add daily feeding and walking times."
              />
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {routines.map((r) => (
                <div key={r.id} className="card p-4 flex items-center justify-between border border-gray-100 hover:shadow-xs transition-all">
                  <div className="flex items-center gap-3">
                    <div className={cn('p-2.5 rounded-xl shadow-2xs text-lg', r.type === 'feeding' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600')}>
                      {r.type === 'feeding' ? '🍽️' : '🦮'}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 capitalize text-sm">{r.type}</p>
                      <p className="text-xs text-gray-600 font-medium">{formatTime(r.time)}{r.portion ? ` • ${r.portion}` : ''}</p>
                      {r.notes && <p className="text-xs text-gray-400 mt-0.5">{r.notes}</p>}
                    </div>
                  </div>
                  <button onClick={() => deleteRoutine(r.id)} className="p-2 rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500 transition-colors" title="Delete routine">
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
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                setAiApptPrompt('')
                setAiApptResult(null)
                setShowAIApptModal(true)
              }}
              className="btn-accent flex items-center gap-1.5 shadow-2xs"
            >
              <Sparkles className="w-4 h-4 text-amber-500" /> AI Schedule Assistant
            </button>
            <button onClick={() => setShowAddAppt(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> Add Appointment
            </button>
          </div>

          {appointments.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<CalIcon className="w-10 h-10" />}
                title="No appointments"
                description="Use the AI Schedule Assistant or add vet visits and grooming appointments."
              />
            </div>
          ) : (
            <div className="space-y-3">
              {appointments.map((a) => (
                <div key={a.id} className="card p-4 flex items-center justify-between border border-gray-100 hover:shadow-xs transition-all">
                  <div className="flex items-center gap-3">
                    <div className={cn('p-2.5 rounded-xl shadow-2xs', a.type === 'vet' ? 'bg-secondary-50 text-secondary-600' : 'bg-accent-50 text-accent-600')}>
                      {a.type === 'vet' ? <Stethoscope className="w-5 h-5" /> : <Scissors className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{a.title}</p>
                      <p className="text-xs text-gray-600 font-medium">{formatDate(a.date)} at {formatTime(a.time)}{a.location ? ` • ${a.location}` : ''}</p>
                      {a.notes && <p className="text-xs text-gray-400 mt-0.5">{a.notes}</p>}
                    </div>
                  </div>
                  <button onClick={() => deleteAppointment(a.id)} className="p-2 rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500 transition-colors" title="Delete appointment">
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
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                setAiVaxPrompt('')
                setAiVaxResults(null)
                setShowAIVaxModal(true)
              }}
              className="btn-accent flex items-center gap-1.5 shadow-2xs"
            >
              <Sparkles className="w-4 h-4 text-amber-500" /> AI Vaccine Assistant
            </button>
            <button onClick={() => setShowAddVax(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> Add Vaccination Record
            </button>
          </div>

          {vaccinations.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<Syringe className="w-10 h-10" />}
                title="No vaccination records"
                description="Use the AI Vaccine Assistant or log pet vaccinations to track upcoming boosters."
              />
            </div>
          ) : (
            <div className="space-y-3">
              {vaccinations.map((v) => (
                <div key={v.id} className="card p-4 flex items-center justify-between border border-gray-100 hover:shadow-xs transition-all">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-success-50 text-success-600 shadow-2xs">
                      <Syringe className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{v.vaccine_name}</p>
                      <p className="text-xs text-gray-600 font-medium">Given: {formatDate(v.date_given)}</p>
                      {v.next_due_date && (
                        <p className={cn('text-xs mt-0.5', new Date(v.next_due_date) < new Date() ? 'text-error-600 font-bold' : 'text-gray-400')}>
                          Next due: {formatDate(v.next_due_date)}
                        </p>
                      )}
                      {v.notes && <p className="text-xs text-gray-400 mt-0.5">{v.notes}</p>}
                    </div>
                  </div>
                  <button onClick={() => deleteVaccination(v.id)} className="p-2 rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500 transition-colors" title="Delete vaccination">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== AI Routine Assistant Modal ===== */}
      <Modal
        open={showAIRoutineModal}
        onClose={() => {
          setShowAIRoutineModal(false)
          setAiRoutinePrompt('')
          setAiRoutineResults(null)
          setError(null)
        }}
        title={`AI Routine Assistant for ${pet.name}`}
        size="lg"
      >
        <div className="space-y-4">
          {!aiRoutineResults ? (
            <div className="space-y-4">
              <p className="text-xs text-gray-600 leading-relaxed">
                Describe {pet.name}'s daily routine in natural language (e.g. feeding times, portions, walk lengths), or click a quick suggestion below to generate an ideal schedule for {pet.species}.
              </p>

              {/* Quick suggestions */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  Quick Prompt Suggestions:
                </span>
                <div className="flex flex-wrap gap-2">
                  {[
                    `Recommend a healthy daily feeding and walk schedule for ${pet.name} (${pet.breed ? `${pet.breed} ` : ''}${pet.species})`,
                    `Breakfast 1.5 cups at 8:00 AM, lunch potty break at 1:00 PM, evening walk 30m at 6:00 PM, dinner 1.5 cups at 7:30 PM for ${pet.name} (${pet.breed ? `${pet.breed} ` : ''}${pet.species})`,
                    `3 daily meals (8:00 AM, 1:00 PM, 7:00 PM) with 1 cup each and 3 potty walks for ${pet.name} (${pet.breed ? `${pet.breed} ` : ''}${pet.species})`,
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setAiRoutinePrompt(preset)}
                      className="text-left text-xs p-2 rounded-xl bg-gray-50 hover:bg-primary-50 hover:text-primary-800 border border-gray-200/60 transition-colors"
                    >
                      💡 "{preset}"
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label text-xs font-bold text-gray-700 uppercase">
                  Tell AI what routine to add
                </label>
                <textarea
                  value={aiRoutinePrompt}
                  onChange={(e) => setAiRoutinePrompt(e.target.value)}
                  className="input text-sm leading-relaxed"
                  rows={4}
                  placeholder={`e.g. ${pet.name} eats breakfast (1 cup) at 7:30 AM, gets a 30 min morning walk at 8:30 AM, and dinner (1 cup) at 6:30 PM...`}
                />
              </div>

              {error && <div className="text-xs text-error-700 bg-error-50 border border-error-200 rounded-xl p-3">{error}</div>}

              <button
                type="button"
                onClick={handleGenerateAIRoutines}
                disabled={aiRoutineLoading}
                className="btn-accent w-full py-3 text-sm font-bold flex items-center justify-center gap-2 shadow-sm"
              >
                {aiRoutineLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analyzing & generating routines...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Routine Schedule</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-gray-900">
                    Review Generated Routines ({aiRoutineResults.length})
                  </h4>
                  <p className="text-xs text-gray-500">
                    You can adjust any time, portion, or label before saving.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setAiRoutineResults([
                      ...aiRoutineResults,
                      { type: 'feeding', time: '12:00', label: 'Midday Meal', portion: '1 cup', notes: '' },
                    ])
                  }
                  className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Slot
                </button>
              </div>

              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {aiRoutineResults.map((slot, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-gray-200/80 bg-gray-50/70 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setAiRoutineResults(
                              aiRoutineResults.map((s, i) =>
                                i === idx ? { ...s, type: s.type === 'feeding' ? 'walking' : 'feeding' } : s
                              )
                            )
                          }
                          className={cn(
                            'text-xs font-bold px-2 py-1 rounded-lg border transition-colors flex items-center gap-1',
                            slot.type === 'feeding'
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          )}
                        >
                          {slot.type === 'feeding' ? '🍽️ Feeding' : '🦮 Walking'} (Click to toggle)
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setAiRoutineResults(aiRoutineResults.filter((_, i) => i !== idx))
                        }
                        className="p-1 text-gray-400 hover:text-error-600 rounded-lg transition-colors"
                        title="Remove slot"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase">Title / Meal</label>
                        <input
                          type="text"
                          value={slot.label}
                          onChange={(e) =>
                            setAiRoutineResults(
                              aiRoutineResults.map((s, i) => (i === idx ? { ...s, label: e.target.value } : s))
                            )
                          }
                          className="input text-xs py-1.5"
                          placeholder="e.g. Breakfast"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase">Time</label>
                        <input
                          type="time"
                          value={slot.time}
                          onChange={(e) =>
                            setAiRoutineResults(
                              aiRoutineResults.map((s, i) => (i === idx ? { ...s, time: e.target.value } : s))
                            )
                          }
                          className="input text-xs py-1.5"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase">
                          {slot.type === 'feeding' ? 'Portion' : 'Notes / Duration'}
                        </label>
                        <input
                          type="text"
                          value={slot.type === 'feeding' ? slot.portion || '' : slot.notes || ''}
                          onChange={(e) =>
                            setAiRoutineResults(
                              aiRoutineResults.map((s, i) =>
                                i === idx
                                  ? slot.type === 'feeding'
                                    ? { ...s, portion: e.target.value }
                                    : { ...s, notes: e.target.value }
                                  : s
                              )
                            )
                          }
                          className="input text-xs py-1.5"
                          placeholder={slot.type === 'feeding' ? 'e.g. 1.5 cups' : 'e.g. 30 mins'}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {error && <div className="text-xs text-error-700 bg-error-50 border border-error-200 rounded-xl p-3">{error}</div>}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAiRoutineResults(null)}
                  className="btn-secondary flex-1 text-xs py-2.5"
                >
                  Edit Prompt
                </button>
                <button
                  type="button"
                  onClick={handleSaveAIRoutines}
                  disabled={aiRoutineResults.filter((s) => s.time).length === 0}
                  className="btn-primary flex-1 text-xs py-2.5"
                >
                  Save {aiRoutineResults.length} Routines to {pet.name}
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ===== AI Appointment Assistant Modal ===== */}
      <Modal
        open={showAIApptModal}
        onClose={() => {
          setShowAIApptModal(false)
          setAiApptPrompt('')
          setAiApptResult(null)
          setError(null)
        }}
        title={`AI Schedule Assistant for ${pet.name}`}
        size="lg"
      >
        <div className="space-y-4">
          {!aiApptResult ? (
            <div className="space-y-4">
              <p className="text-xs text-gray-600 leading-relaxed">
                Tell AI about your upcoming vet visit or grooming session (e.g. doctor name, clinic, date, time). AI will extract and structure the calendar event.
              </p>

              {/* Quick suggestions */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  Quick Suggestions:
                </span>
                <div className="flex flex-wrap gap-2">
                  {[
                    `Annual wellness checkup for ${pet.name} (${pet.breed ? `${pet.breed} ` : ''}${pet.species}) with Dr. Miller at City Vet next Tuesday at 2:30 PM`,
                    `Full grooming, bath and nail trim for my ${pet.breed ? `${pet.breed} ` : ''}${pet.species} ${pet.name} at Paws Spa this Friday at 10:00 AM`,
                    `Dental cleaning and checkup for ${pet.name} (${pet.breed ? `${pet.breed} ` : ''}${pet.species}) at Greenfield Animal Hospital in 2 weeks at 9:00 AM`,
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setAiApptPrompt(preset)}
                      className="text-left text-xs p-2 rounded-xl bg-gray-50 hover:bg-primary-50 hover:text-primary-800 border border-gray-200/60 transition-colors"
                    >
                      💡 "{preset}"
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label text-xs font-bold text-gray-700 uppercase">
                  Tell AI what appointment to schedule
                </label>
                <textarea
                  value={aiApptPrompt}
                  onChange={(e) => setAiApptPrompt(e.target.value)}
                  className="input text-sm leading-relaxed"
                  rows={4}
                  placeholder={`e.g. Schedule ${pet.name}'s annual booster checkup with Dr. Smith at Banfield Vet next Wednesday at 3:00 PM...`}
                />
              </div>

              {error && <div className="text-xs text-error-700 bg-error-50 border border-error-200 rounded-xl p-3">{error}</div>}

              <button
                type="button"
                onClick={handleGenerateAIAppt}
                disabled={aiApptLoading || !aiApptPrompt.trim()}
                className="btn-accent w-full py-3 text-sm font-bold flex items-center justify-center gap-2 shadow-sm"
              >
                {aiApptLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Extracting appointment details...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Extract & Prepare Appointment</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-primary-50/70 rounded-xl border border-primary-100 text-xs text-primary-900">
                <span className="font-bold">AI Extracted Details:</span> Verify or tweak the details below before scheduling into your family calendar.
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs font-semibold">Appointment Type</label>
                  <select
                    value={aiApptResult.type}
                    onChange={(e) =>
                      setAiApptResult({ ...aiApptResult, type: e.target.value as 'vet' | 'grooming' })
                    }
                    className="input text-xs"
                  >
                    <option value="vet">🩺 Vet Visit</option>
                    <option value="grooming">✂️ Grooming</option>
                  </select>
                </div>
                <div>
                  <label className="label text-xs font-semibold">Event Title</label>
                  <input
                    type="text"
                    value={aiApptResult.title}
                    onChange={(e) => setAiApptResult({ ...aiApptResult, title: e.target.value })}
                    className="input text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs font-semibold">Date</label>
                  <input
                    type="date"
                    value={aiApptResult.date}
                    onChange={(e) => setAiApptResult({ ...aiApptResult, date: e.target.value })}
                    className="input text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="label text-xs font-semibold">Time</label>
                  <input
                    type="time"
                    value={aiApptResult.time}
                    onChange={(e) => setAiApptResult({ ...aiApptResult, time: e.target.value })}
                    className="input text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label text-xs font-semibold">Location / Clinic</label>
                <input
                  type="text"
                  value={aiApptResult.location}
                  onChange={(e) => setAiApptResult({ ...aiApptResult, location: e.target.value })}
                  className="input text-xs"
                  placeholder="e.g. City Vet Hospital"
                />
              </div>

              <div>
                <label className="label text-xs font-semibold">Notes / Instructions</label>
                <textarea
                  value={aiApptResult.notes}
                  onChange={(e) => setAiApptResult({ ...aiApptResult, notes: e.target.value })}
                  className="input text-xs"
                  rows={2}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAiApptResult(null)}
                  className="btn-secondary flex-1 text-xs py-2.5"
                >
                  Edit Prompt
                </button>
                <button
                  type="button"
                  onClick={handleSaveAIAppt}
                  disabled={!aiApptResult.title || !aiApptResult.date}
                  className="btn-primary flex-1 text-xs py-2.5"
                >
                  Schedule Appointment
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ===== AI Vaccination Assistant Modal ===== */}
      <Modal
        open={showAIVaxModal}
        onClose={() => {
          setShowAIVaxModal(false)
          setAiVaxPrompt('')
          setAiVaxResults(null)
          setError(null)
        }}
        title={`AI Vaccine Assistant for ${pet.name}`}
        size="lg"
      >
        <div className="space-y-4">
          {!aiVaxResults ? (
            <div className="space-y-4">
              <p className="text-xs text-gray-600 leading-relaxed">
                Paste veterinary vaccine records or tell AI what vaccines {pet.name} received. AI will parse dates, calculate booster due dates, and create your records.
              </p>

              {/* Quick suggestions */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  Quick Suggestions:
                </span>
                <div className="flex flex-wrap gap-2">
                  {[
                    `Recommend core vaccines and boosters for ${pet.name} (${pet.breed ? `${pet.breed} ` : ''}${pet.species})`,
                    `Rabies 3-year given today for ${pet.name} (${pet.breed ? `${pet.breed} ` : ''}${pet.species}), next due in 3 years. Bordetella given today, due in 6 months`,
                    `DHPP combo booster given on 2024-05-15 for ${pet.name} (${pet.breed ? `${pet.breed} ` : ''}${pet.species}), next due in 1 year`,
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setAiVaxPrompt(preset)}
                      className="text-left text-xs p-2 rounded-xl bg-gray-50 hover:bg-primary-50 hover:text-primary-800 border border-gray-200/60 transition-colors"
                    >
                      💡 "{preset}"
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label text-xs font-bold text-gray-700 uppercase">
                  Paste records or describe vaccinations
                </label>
                <textarea
                  value={aiVaxPrompt}
                  onChange={(e) => setAiVaxPrompt(e.target.value)}
                  className="input text-sm leading-relaxed"
                  rows={4}
                  placeholder={`e.g. ${pet.name} received Rabies shot on Oct 10 2024 (valid for 3 years) and Bordetella kennel cough vaccine due in 6 months...`}
                />
              </div>

              {error && <div className="text-xs text-error-700 bg-error-50 border border-error-200 rounded-xl p-3">{error}</div>}

              <button
                type="button"
                onClick={handleGenerateAIVax}
                disabled={aiVaxLoading || !aiVaxPrompt.trim()}
                className="btn-accent w-full py-3 text-sm font-bold flex items-center justify-center gap-2 shadow-sm"
              >
                {aiVaxLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analyzing vaccine records...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Extract Vaccine Records</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-gray-900">
                    Review Vaccine Records ({aiVaxResults.length})
                  </h4>
                  <p className="text-xs text-gray-500">
                    Check dates and booster deadlines before saving.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setAiVaxResults([
                      ...aiVaxResults,
                      {
                        vaccine_name: 'Core Booster',
                        date_given: new Date().toISOString().split('T')[0],
                        next_due_date: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
                        notes: '',
                      },
                    ])
                  }
                  className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Vaccine
                </button>
              </div>

              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {aiVaxResults.map((vax, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-gray-200/80 bg-gray-50/70 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="badge bg-success-50 text-success-700 border border-success-200 text-xs font-bold">
                        💉 Vaccine #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setAiVaxResults(aiVaxResults.filter((_, i) => i !== idx))
                        }
                        className="p-1 text-gray-400 hover:text-error-600 rounded-lg transition-colors"
                        title="Remove vaccine"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="sm:col-span-1">
                        <label className="text-[10px] font-semibold text-gray-500 uppercase">Vaccine Name</label>
                        <input
                          type="text"
                          value={vax.vaccine_name}
                          onChange={(e) =>
                            setAiVaxResults(
                              aiVaxResults.map((v, i) => (i === idx ? { ...v, vaccine_name: e.target.value } : v))
                            )
                          }
                          className="input text-xs py-1.5"
                          placeholder="e.g. Rabies"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase">Date Given</label>
                        <input
                          type="date"
                          value={vax.date_given}
                          onChange={(e) =>
                            setAiVaxResults(
                              aiVaxResults.map((v, i) => (i === idx ? { ...v, date_given: e.target.value } : v))
                            )
                          }
                          className="input text-xs py-1.5"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase">Next Booster Due</label>
                        <input
                          type="date"
                          value={vax.next_due_date}
                          onChange={(e) =>
                            setAiVaxResults(
                              aiVaxResults.map((v, i) => (i === idx ? { ...v, next_due_date: e.target.value } : v))
                            )
                          }
                          className="input text-xs py-1.5"
                        />
                      </div>
                    </div>

                    <div>
                      <input
                        type="text"
                        value={vax.notes}
                        onChange={(e) =>
                          setAiVaxResults(
                            aiVaxResults.map((v, i) => (i === idx ? { ...v, notes: e.target.value } : v))
                          )
                        }
                        className="input text-xs py-1.5"
                        placeholder="Notes (optional, e.g. 3-year certificate tag #12345)"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {error && <div className="text-xs text-error-700 bg-error-50 border border-error-200 rounded-xl p-3">{error}</div>}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAiVaxResults(null)}
                  className="btn-secondary flex-1 text-xs py-2.5"
                >
                  Edit Prompt
                </button>
                <button
                  type="button"
                  onClick={handleSaveAIVax}
                  disabled={aiVaxResults.filter((v) => v.vaccine_name && v.date_given).length === 0}
                  className="btn-primary flex-1 text-xs py-2.5"
                >
                  Save {aiVaxResults.length} Vaccine Records
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ===== AI Checklist Modal (Vet & Program) ===== */}
      <Modal
        open={showAI !== null}
        onClose={resetChecklistForm}
        title={showAI === 'vet' ? 'AI Vet & Medication Plan' : 'AI Care & Training Program'}
        size="lg"
      >
        <div className="space-y-4">
          {!aiResult ? (
            <div className="space-y-4">
              <p className="text-xs text-gray-600 leading-relaxed">
                {showAI === 'vet'
                  ? `Paste vet discharge instructions, medication dosages, or prescription notes for ${pet.name}. AI will convert them into an actionable, step-by-step medication checklist.`
                  : `Select or describe a specialized care plan (e.g. puppy potty training, post-surgery recovery, senior mobility, or travel checklist) for ${pet.name}.`}
              </p>

              {/* Quick suggestions */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  Quick Suggestions:
                </span>
                <div className="flex flex-wrap gap-2">
                  {showAI === 'vet' ? (
                    [
                      `Give 1 tablet Amoxicillin twice daily with meals for 7 days for ${pet.name} (${pet.breed ? `${pet.breed} ` : ''}${pet.species}). Eye drops 2x daily. Rest for 3 days.`,
                      `Ear drops 3 drops twice daily for 10 days for my ${pet.breed ? `${pet.breed} ` : ''}${pet.species} ${pet.name}. Clean ear canal gently before administration.`,
                      `Post-dental antibiotics once daily in the morning for 5 days for ${pet.name} (${pet.breed ? `${pet.breed} ` : ''}${pet.species}). Soft food only.`,
                    ].map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setAiInput(preset)}
                        className="text-left text-xs p-2 rounded-xl bg-gray-50 hover:bg-primary-50 hover:text-primary-800 border border-gray-200/60 transition-colors"
                      >
                        💡 "{preset}"
                      </button>
                    ))
                  ) : (
                    [
                      `${pet.breed ? `${pet.breed} ` : ''}${pet.species} Crate & Potty Training Checklist for ${pet.name}`,
                      `Post-Surgery Recovery & Wound Care Protocol for ${pet.name} (${pet.breed ? `${pet.breed} ` : ''}${pet.species})`,
                      `Senior ${pet.breed ? `${pet.breed} ` : ''}${pet.species} Mobility & Joint Care Plan for ${pet.name}`,
                      `Pet Travel & Boarding Prep Checklist for ${pet.name} (${pet.breed ? `${pet.breed} ` : ''}${pet.species})`,
                    ].map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setAiInput(preset)}
                        className="text-left text-xs p-2 rounded-xl bg-gray-50 hover:bg-primary-50 hover:text-primary-800 border border-gray-200/60 transition-colors"
                      >
                        💡 "{preset}"
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div>
                <label className="label text-xs font-bold text-gray-700 uppercase">
                  {showAI === 'vet' ? 'Vet Instructions / Prescription' : 'Specialized Care / Training Goal'}
                </label>
                <textarea
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  className="input text-sm leading-relaxed"
                  rows={5}
                  placeholder={
                    showAI === 'vet'
                      ? 'e.g. Give 1 tablet of Amoxicillin twice daily after meals for 7 days. Apply eye drops in the morning. No strenuous exercise for 3 days. Follow-up vet visit in 1 week...'
                      : 'e.g. Create a comprehensive puppy crate training and potty schedule, or post-spay recovery plan...'
                  }
                />
              </div>

              {error && <div className="text-xs text-error-700 bg-error-50 border border-error-200 rounded-xl p-3">{error}</div>}

              <button
                onClick={() => showAI && generateAI(showAI)}
                disabled={aiLoading || !aiInput.trim()}
                className="btn-accent w-full py-3 text-sm font-bold flex items-center justify-center gap-2 shadow-sm"
              >
                {aiLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Structuring checklist with AI...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Structured Checklist</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="label text-xs font-semibold">Checklist Title</label>
                <input
                  value={checklistTitle}
                  onChange={(e) => setChecklistTitle(e.target.value)}
                  className="input text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs font-semibold">Checklist Mode</label>
                  <select
                    value={checklistType}
                    onChange={(e) => setChecklistType(e.target.value as 'recurring' | 'time_limited')}
                    className="input text-xs"
                  >
                    <option value="time_limited">Time-limited (e.g. 7-14 day course)</option>
                    <option value="recurring">Recurring (ongoing daily program)</option>
                  </select>
                </div>
                {checklistType === 'time_limited' && (
                  <div>
                    <label className="label text-xs font-semibold">Duration (days)</label>
                    <input
                      type="number"
                      value={checklistDuration}
                      onChange={(e) => setChecklistDuration(e.target.value)}
                      className="input text-xs"
                      min="1"
                      max="90"
                    />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label text-xs font-semibold mb-0">Checklist Tasks ({editingItems.length})</label>
                  <button
                    type="button"
                    onClick={() => setEditingItems([...editingItems, { title: '', due_time: null }])}
                    className="btn-ghost text-xs text-primary-600 py-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add item
                  </button>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {editingItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded-xl bg-gray-50 border border-gray-100">
                      <input
                        value={item.title}
                        onChange={(e) =>
                          setEditingItems(
                            editingItems.map((it, i) => (i === idx ? { ...it, title: e.target.value } : it))
                          )
                        }
                        className="input text-xs flex-1 py-1.5"
                        placeholder="Task description"
                      />
                      <input
                        type="time"
                        value={item.due_time || ''}
                        onChange={(e) =>
                          setEditingItems(
                            editingItems.map((it, i) => (i === idx ? { ...it, due_time: e.target.value || null } : it))
                          )
                        }
                        className="input text-xs w-28 py-1.5"
                      />
                      <button
                        type="button"
                        onClick={() => setEditingItems(editingItems.filter((_, i) => i !== idx))}
                        className="p-1.5 text-gray-400 hover:text-error-600 rounded-lg transition-colors"
                        title="Remove item"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {error && <div className="text-xs text-error-700 bg-error-50 border border-error-200 rounded-xl p-3">{error}</div>}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAiResult(null)
                    setEditingItems([])
                  }}
                  className="btn-secondary flex-1 text-xs py-2.5"
                >
                  Edit Prompt
                </button>
                <button
                  type="button"
                  onClick={() => saveChecklist(showAI === 'vet' ? 'ai_vet' : 'ai_program')}
                  disabled={editingItems.filter((i) => i.title.trim()).length === 0}
                  className="btn-primary flex-1 text-xs py-2.5"
                >
                  Save Checklist to {pet.name}
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ===== Manual Checklist Modal ===== */}
      <Modal open={showAddChecklist} onClose={resetChecklistForm} title="Create manual checklist" size="lg">
        <div className="space-y-4">
          <div>
            <label className="label text-xs font-semibold">Checklist title</label>
            <input
              value={checklistTitle}
              onChange={(e) => setChecklistTitle(e.target.value)}
              className="input text-xs"
              placeholder="e.g. Evening care routine"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label text-xs font-semibold">Type</label>
              <select
                value={checklistType}
                onChange={(e) => setChecklistType(e.target.value as 'recurring' | 'time_limited')}
                className="input text-xs"
              >
                <option value="time_limited">Time-limited (e.g. medication)</option>
                <option value="recurring">Recurring (daily/monthly)</option>
              </select>
            </div>
            {checklistType === 'time_limited' && (
              <div>
                <label className="label text-xs font-semibold">Duration (days)</label>
                <input
                  type="number"
                  value={checklistDuration}
                  onChange={(e) => setChecklistDuration(e.target.value)}
                  className="input text-xs"
                  min="1"
                  max="90"
                />
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label text-xs font-semibold mb-0">Items ({editingItems.length})</label>
              <button
                type="button"
                onClick={() => setEditingItems([...editingItems, { title: '', due_time: null }])}
                className="btn-ghost text-xs text-primary-600 py-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add item
              </button>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {editingItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 rounded-xl bg-gray-50 border border-gray-100">
                  <input
                    value={item.title}
                    onChange={(e) =>
                      setEditingItems(
                        editingItems.map((it, i) => (i === idx ? { ...it, title: e.target.value } : it))
                      )
                    }
                    className="input text-xs flex-1 py-1.5"
                    placeholder="Item description"
                  />
                  <input
                    type="time"
                    value={item.due_time || ''}
                    onChange={(e) =>
                      setEditingItems(
                        editingItems.map((it, i) => (i === idx ? { ...it, due_time: e.target.value || null } : it))
                      )
                    }
                    className="input text-xs w-28 py-1.5"
                  />
                  <button
                    type="button"
                    onClick={() => setEditingItems(editingItems.filter((_, i) => i !== idx))}
                    className="p-1.5 text-gray-400 hover:text-error-600 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          {error && <div className="text-xs text-error-700 bg-error-50 border border-error-200 rounded-xl p-3">{error}</div>}
          <button
            onClick={() => saveChecklist('manual')}
            disabled={!checklistTitle || editingItems.filter((i) => i.title.trim()).length === 0}
            className="btn-primary w-full text-xs py-2.5"
          >
            Create checklist
          </button>
        </div>
      </Modal>

      {/* ===== Manual Routine Modal ===== */}
      <Modal open={showAddRoutine} onClose={() => setShowAddRoutine(false)} title="Add daily routine" size="lg">
        <div className="space-y-5">
          {/* Routine Type Selector */}
          <div>
            <label className="label">Routine Type</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => switchRoutineType('feeding')}
                className={cn(
                  'p-3.5 rounded-2xl border text-left transition-all flex items-center gap-3',
                  routineType === 'feeding'
                    ? 'border-primary-500 bg-primary-50/50 text-primary-950 font-semibold ring-2 ring-primary-500/20'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                )}
              >
                <div className="p-2 rounded-xl bg-accent-50 text-accent-600 text-lg">🍽️</div>
                <div>
                  <p className="text-sm font-bold">Feeding Schedule</p>
                  <p className="text-xs text-gray-500">Set meals, portions & times</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => switchRoutineType('walking')}
                className={cn(
                  'p-3.5 rounded-2xl border text-left transition-all flex items-center gap-3',
                  routineType === 'walking'
                    ? 'border-primary-500 bg-primary-50/50 text-primary-950 font-semibold ring-2 ring-primary-500/20'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                )}
              >
                <div className="p-2 rounded-xl bg-secondary-50 text-secondary-600 text-lg">🦮</div>
                <div>
                  <p className="text-sm font-bold">Walking Schedule</p>
                  <p className="text-xs text-gray-500">Daily walks & exercise breaks</p>
                </div>
              </button>
            </div>
          </div>

          {/* Preset Buttons */}
          <div>
            <label className="label">Quick Preset</label>
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
                    2x Daily (Breakfast & Dinner)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoutineSlots([
                      { label: 'Breakfast', time: '07:30', portion: '1 cup', notes: '' },
                      { label: 'Lunch', time: '13:00', portion: '0.5 cup', notes: '' },
                      { label: 'Dinner', time: '19:00', portion: '1 cup', notes: '' },
                    ])}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    3x Daily (Breakfast, Lunch & Dinner)
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
                      { label: 'Midday potty', time: '13:00', portion: '', notes: '10 mins' },
                      { label: 'Evening walk', time: '18:30', portion: '', notes: '35 mins' },
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
              <label className="label text-xs font-semibold">Type</label>
              <select value={apptForm.type} onChange={(e) => setApptForm({ ...apptForm, type: e.target.value as 'vet' | 'grooming' })} className="input text-xs">
                <option value="vet">Vet</option>
                <option value="grooming">Grooming</option>
              </select>
            </div>
            <div>
              <label className="label text-xs font-semibold">Title</label>
              <input value={apptForm.title} onChange={(e) => setApptForm({ ...apptForm, title: e.target.value })} className="input text-xs" placeholder="e.g. Annual checkup" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label text-xs font-semibold">Date</label>
              <input type="date" value={apptForm.date} onChange={(e) => setApptForm({ ...apptForm, date: e.target.value })} className="input text-xs" />
            </div>
            <div>
              <label className="label text-xs font-semibold">Time</label>
              <input type="time" value={apptForm.time} onChange={(e) => setApptForm({ ...apptForm, time: e.target.value })} className="input text-xs" />
            </div>
          </div>
          <div>
            <label className="label text-xs font-semibold">Location</label>
            <input value={apptForm.location} onChange={(e) => setApptForm({ ...apptForm, location: e.target.value })} className="input text-xs" placeholder="e.g. Greenfield Vet Clinic" />
          </div>
          <div>
            <label className="label text-xs font-semibold">Notes</label>
            <textarea value={apptForm.notes} onChange={(e) => setApptForm({ ...apptForm, notes: e.target.value })} className="input text-xs" rows={2} />
          </div>
          <button onClick={addAppointment} disabled={!apptForm.title || !apptForm.date} className="btn-primary w-full text-xs py-2.5">Add appointment</button>
        </div>
      </Modal>

      {/* ===== Vaccination Modal ===== */}
      <Modal open={showAddVax} onClose={() => setShowAddVax(false)} title="Add vaccination record">
        <div className="space-y-4">
          <div>
            <label className="label text-xs font-semibold">Vaccine name</label>
            <input value={vaxForm.vaccine_name} onChange={(e) => setVaxForm({ ...vaxForm, vaccine_name: e.target.value })} className="input text-xs" placeholder="e.g. Rabies" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label text-xs font-semibold">Date given</label>
              <input type="date" value={vaxForm.date_given} onChange={(e) => setVaxForm({ ...vaxForm, date_given: e.target.value })} className="input text-xs" />
            </div>
            <div>
              <label className="label text-xs font-semibold">Next due date</label>
              <input type="date" value={vaxForm.next_due_date} onChange={(e) => setVaxForm({ ...vaxForm, next_due_date: e.target.value })} className="input text-xs" />
            </div>
          </div>
          <div>
            <label className="label text-xs font-semibold">Notes</label>
            <textarea value={vaxForm.notes} onChange={(e) => setVaxForm({ ...vaxForm, notes: e.target.value })} className="input text-xs" rows={2} />
          </div>
          <button onClick={addVaccination} disabled={!vaxForm.vaccine_name || !vaxForm.date_given} className="btn-primary w-full text-xs py-2.5">Add record</button>
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
