import { useEffect, useState, useCallback, useMemo } from 'react'
import { useFamily } from '@/context/FamilyContext'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import {
  Plus,
  Dog,
  PawPrint,
  Search,
  ArrowRight,
  Clock,
  CheckSquare,
  Stethoscope,
  Heart,
  Scale,
  Cake,
  X,
  Sparkles,
  ShieldAlert,
} from 'lucide-react'
import { Modal } from '@/components/Modal'
import { EmptyState } from '@/components/EmptyState'
import { calculateAge, speciesIcon, formatDate, cn } from '@/lib/utils'
import { PetFormModalContent, type PetFormData } from '@/components/PetFormModalContent'
import type { Pet } from '@/types'

interface PetCareSummary {
  routinesCount: number
  checklistsCount: number
  upcomingApptsCount: number
  nextVaxDate: string | null
}

export function PetsPage() {
  const { family } = useFamily()
  const { user } = useAuth()
  const [pets, setPets] = useState<Pet[]>([])
  const [careSummaries, setCareSummaries] = useState<Record<string, PetCareSummary>>({})
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSpecies, setSelectedSpecies] = useState<string>('all')

  const loadPets = useCallback(async () => {
    if (!family) return
    setLoading(true)

    const { data: petsData } = await supabase
      .from('pets')
      .select('*')
      .eq('family_id', family.id)
      .order('created_at', { ascending: true })

    const currentPets = (petsData as Pet[]) ?? []
    setPets(currentPets)

    if (currentPets.length > 0) {
      const petIds = currentPets.map((p) => p.id)
      const todayDateStr = new Date().toISOString().split('T')[0]

      // Fetch routines, checklists, appointments, and vaccinations for all pets
      const [routinesRes, checklistsRes, apptsRes, vaxRes] = await Promise.all([
        supabase.from('routines').select('id, pet_id').in('pet_id', petIds),
        supabase.from('checklists').select('id, pet_id').in('pet_id', petIds),
        supabase
          .from('appointments')
          .select('id, pet_id, date')
          .in('pet_id', petIds)
          .gte('date', todayDateStr),
        supabase
          .from('vaccinations')
          .select('id, pet_id, next_due_date')
          .in('pet_id', petIds)
          .not('next_due_date', 'is', null)
          .gte('next_due_date', todayDateStr)
          .order('next_due_date', { ascending: true }),
      ])

      const summaryMap: Record<string, PetCareSummary> = {}
      for (const pet of currentPets) {
        const petRoutines = (routinesRes.data ?? []).filter((r) => r.pet_id === pet.id)
        const petChecklists = (checklistsRes.data ?? []).filter((c) => c.pet_id === pet.id)
        const petAppts = (apptsRes.data ?? []).filter((a) => a.pet_id === pet.id)
        const petVax = (vaxRes.data ?? []).find((v) => v.pet_id === pet.id)

        summaryMap[pet.id] = {
          routinesCount: petRoutines.length,
          checklistsCount: petChecklists.length,
          upcomingApptsCount: petAppts.length,
          nextVaxDate: petVax?.next_due_date || null,
        }
      }
      setCareSummaries(summaryMap)
    } else {
      setCareSummaries({})
    }

    setLoading(false)
  }, [family])

  useEffect(() => {
    loadPets()
  }, [loadPets])

  async function handleAdd(formData: PetFormData): Promise<{ error: string | null }> {
    if (!family || !user) return { error: 'Not authenticated or no family selected' }
    setSaving(true)

    const { data, error } = await supabase
      .from('pets')
      .insert({
        family_id: family.id,
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
      .select()
      .single()

    setSaving(false)

    if (error) {
      return { error: error.message }
    }

    await supabase.from('activity_log').insert({
      family_id: family.id,
      pet_id: data.id,
      user_id: user.id,
      user_email: user.email!,
      action: 'added_pet',
      details: `${formData.name} (${formData.species})`,
    })

    setShowAdd(false)
    loadPets()
    return { error: null }
  }

  // Available species list from existing pets
  const availableSpecies = useMemo(() => {
    const set = new Set<string>()
    for (const p of pets) {
      if (p.species) set.add(p.species.toLowerCase())
    }
    return Array.from(set)
  }, [pets])

  // Filtered pets by search and species
  const filteredPets = useMemo(() => {
    return pets.filter((pet) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        pet.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (pet.breed && pet.breed.toLowerCase().includes(searchQuery.toLowerCase())) ||
        pet.species.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesSpecies =
        selectedSpecies === 'all' || pet.species.toLowerCase() === selectedSpecies.toLowerCase()

      return matchesSearch && matchesSpecies
    })
  }, [pets, searchQuery, selectedSpecies])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-gray-500">Loading pet profiles...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Pet Profiles</h1>
            {pets.length > 0 && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary-100 text-primary-800">
                {pets.length} {pets.length === 1 ? 'pet' : 'pets'}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            View passports, daily routines, care checklists, and medical history.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="btn-primary flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Add new pet</span>
        </button>
      </div>

      {/* Search and Species Filter Bar */}
      {pets.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-gray-100 shadow-2xs">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search pets by name, breed, species..."
              className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-gray-50/80 border border-gray-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all placeholder:text-gray-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Species Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setSelectedSpecies('all')}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all',
                selectedSpecies === 'all'
                  ? 'bg-primary-600 text-white shadow-2xs'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              )}
            >
              All ({pets.length})
            </button>
            {availableSpecies.map((species) => {
              const count = pets.filter((p) => p.species.toLowerCase() === species).length
              return (
                <button
                  key={species}
                  type="button"
                  onClick={() => setSelectedSpecies(species)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold capitalize whitespace-nowrap transition-all',
                    selectedSpecies === species
                      ? 'bg-primary-600 text-white shadow-2xs'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  )}
                >
                  <span>{speciesIcon(species)}</span>
                  <span>{species}</span>
                  <span className="text-[10px] opacity-80 font-mono">({count})</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Main Pets Grid */}
      {pets.length === 0 ? (
        <div className="card p-8">
          <EmptyState
            icon={<Dog className="w-12 h-12 text-primary-500" />}
            title="No pets added yet"
            description="Add your first dog, cat, or other family pet to start scheduling meals, walks, vet visits, and checklists."
            action={
              <button onClick={() => setShowAdd(true)} className="btn-primary">
                <Plus className="w-4 h-4" /> Add your first pet
              </button>
            }
          />
        </div>
      ) : filteredPets.length === 0 ? (
        <div className="card p-8 text-center space-y-3">
          <PawPrint className="w-10 h-10 text-gray-300 mx-auto" />
          <h3 className="text-base font-semibold text-gray-800">No matching pets found</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            No pet profiles matched your search or filter. Try a different query or reset filters.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('')
              setSelectedSpecies('all')
            }}
            className="btn-secondary text-xs mt-2"
          >
            Clear search & filters
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredPets.map((pet) => {
            const summary = careSummaries[pet.id] || {
              routinesCount: 0,
              checklistsCount: 0,
              upcomingApptsCount: 0,
              nextVaxDate: null,
            }

            return (
              <div
                key={pet.id}
                className="card overflow-hidden hover:shadow-md transition-all duration-200 border border-gray-100 hover:border-primary-200 flex flex-col justify-between group"
              >
                <div className="p-5 space-y-4">
                  {/* Top Avatar & Name Area */}
                  <div className="flex items-start gap-3.5">
                    <div className="relative shrink-0">
                      {pet.photo_url ? (
                        <img
                          src={pet.photo_url}
                          alt={pet.name}
                          className="w-16 h-16 rounded-2xl object-cover ring-2 ring-gray-100 group-hover:ring-primary-300 transition-all shadow-2xs"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100/80 text-primary-700 flex items-center justify-center text-3xl shadow-2xs">
                          {speciesIcon(pet.species)}
                        </div>
                      )}
                      {/* Species icon mini badge */}
                      <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-white shadow-xs border border-gray-100 flex items-center justify-center text-xs">
                        {speciesIcon(pet.species)}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <Link
                          to={`/app/pets/${pet.id}`}
                          className="font-bold text-gray-900 text-base group-hover:text-primary-600 transition-colors truncate"
                        >
                          {pet.name}
                        </Link>
                        <span className="badge text-[11px] capitalize bg-gray-100 text-gray-600 shrink-0">
                          {pet.species}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5 font-medium">
                        {pet.breed || `${pet.species} family member`}
                      </p>

                      {/* Vital Pills */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {pet.date_of_birth && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-100">
                            <Cake className="w-3 h-3" />
                            <span>{calculateAge(pet.date_of_birth)}</span>
                          </span>
                        )}
                        {pet.weight && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
                            <Scale className="w-3 h-3" />
                            <span>{pet.weight} kg</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Care Metrics Overview */}
                  <div className="grid grid-cols-3 gap-2 py-2.5 px-3 rounded-xl bg-gray-50/80 border border-gray-100 text-center">
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-center gap-1 text-xs text-emerald-600 font-semibold">
                        <Clock className="w-3 h-3" />
                        <span>{summary.routinesCount}</span>
                      </div>
                      <p className="text-[10px] text-gray-500 font-medium">Routines</p>
                    </div>

                    <div className="space-y-0.5 border-x border-gray-200/60 px-1">
                      <div className="flex items-center justify-center gap-1 text-xs text-primary-600 font-semibold">
                        <CheckSquare className="w-3 h-3" />
                        <span>{summary.checklistsCount}</span>
                      </div>
                      <p className="text-[10px] text-gray-500 font-medium">Checklists</p>
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex items-center justify-center gap-1 text-xs text-blue-600 font-semibold">
                        <Stethoscope className="w-3 h-3" />
                        <span>{summary.upcomingApptsCount}</span>
                      </div>
                      <p className="text-[10px] text-gray-500 font-medium">Visits</p>
                    </div>
                  </div>

                  {/* Personality / Likes Snippet */}
                  {(pet.likes || pet.dislikes) && (
                    <div className="space-y-1 text-xs pt-1">
                      {pet.likes && (
                        <p className="text-gray-600 truncate flex items-center gap-1.5">
                          <Heart className="w-3 h-3 text-rose-500 shrink-0" />
                          <span className="text-gray-400 font-normal">Likes:</span>
                          <span className="font-medium text-gray-700 truncate">{pet.likes}</span>
                        </p>
                      )}
                      {pet.dislikes && (
                        <p className="text-gray-600 truncate flex items-center gap-1.5">
                          <ShieldAlert className="w-3 h-3 text-amber-500 shrink-0" />
                          <span className="text-gray-400 font-normal">Dislikes:</span>
                          <span className="font-medium text-gray-700 truncate">{pet.dislikes}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Action Footer */}
                <div className="p-3 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                  <Link
                    to={`/app/pets/${pet.id}`}
                    className="text-xs font-semibold text-primary-700 hover:text-primary-800 flex items-center gap-1 group-hover:gap-1.5 transition-all"
                  >
                    <span>View Profile & Health</span>
                    <ArrowRight className="w-3.5 h-3.5 transition-transform" />
                  </Link>

                  <div className="flex items-center gap-1.5">
                    <Link
                      to={`/app/pets/${pet.id}?tab=routines`}
                      className="text-[11px] font-medium px-2 py-1 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 text-gray-600 transition-colors"
                      title="Manage daily routines"
                    >
                      Routines
                    </Link>
                    <Link
                      to={`/app/pets/${pet.id}?tab=checklists`}
                      className="text-[11px] font-medium px-2 py-1 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 text-gray-600 transition-colors"
                      title="Manage checklists"
                    >
                      Tasks
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Pet Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add a new pet" size="lg">
        <PetFormModalContent
          onSubmit={handleAdd}
          onCancel={() => setShowAdd(false)}
          isSubmitting={saving}
          submitLabel="Add pet"
        />
      </Modal>
    </div>
  )
}
