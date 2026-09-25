import { useEffect, useState, useCallback } from 'react'
import { useFamily } from '@/context/FamilyContext'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import { Plus, Dog, PawPrint, Trash2 } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { EmptyState } from '@/components/EmptyState'
import { calculateAge, speciesIcon, cn } from '@/lib/utils'
import type { Pet } from '@/types'

const SPECIES_OPTIONS = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Hamster', 'Fish', 'Reptile', 'Other']

export function PetsPage() {
  const { family } = useFamily()
  const { user } = useAuth()
  const [pets, setPets] = useState<Pet[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    name: '', species: 'Dog', breed: '', date_of_birth: '', weight: '', likes: '', dislikes: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPets = useCallback(async () => {
    if (!family) return
    const { data } = await supabase.from('pets').select('*').eq('family_id', family.id).order('created_at', { ascending: true })
    setPets(data as Pet[] ?? [])
    setLoading(false)
  }, [family])

  useEffect(() => { loadPets() }, [loadPets])

  async function handleAdd() {
    if (!family) return
    setSaving(true)
    setError(null)
    const { data, error } = await supabase
      .from('pets')
      .insert({
        family_id: family.id,
        name: form.name,
        species: form.species,
        breed: form.breed || null,
        date_of_birth: form.date_of_birth || null,
        weight: form.weight ? parseFloat(form.weight) : null,
        likes: form.likes || null,
        dislikes: form.dislikes || null,
        notes: form.notes || null,
      })
      .select()
      .single()
    setSaving(false)
    if (error) { setError(error.message); return }

    await supabase.from('activity_log').insert({
      family_id: family.id,
      pet_id: data.id,
      user_id: user!.id,
      user_email: user!.email!,
      action: 'added_pet',
      details: `${form.name} (${form.species})`,
    })

    setShowAdd(false)
    setForm({ name: '', species: 'Dog', breed: '', date_of_birth: '', weight: '', likes: '', dislikes: '', notes: '' })
    loadPets()
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><p className="text-gray-400">Loading pets...</p></div>
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pets</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your family's pet profiles</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Add pet
        </button>
      </div>

      {pets.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Dog className="w-10 h-10" />}
            title="No pets yet"
            description="Add your first pet to start tracking feeding, walking, checklists, and appointments."
            action={<button onClick={() => setShowAdd(true)} className="btn-primary"><Plus className="w-4 h-4" />Add your first pet</button>}
          />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pets.map((pet) => (
            <Link key={pet.id} to={`/app/pets/${pet.id}`} className="card p-5 hover:shadow-md transition-all group animate-slide-up">
              <div className="flex items-start gap-4">
                {pet.photo_url ? (
                  <img src={pet.photo_url} alt={pet.name} className="w-16 h-16 rounded-2xl object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center text-3xl">
                    {speciesIcon(pet.species)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">{pet.name}</h3>
                  <p className="text-sm text-gray-500">{pet.breed || pet.species}</p>
                  <p className="text-xs text-gray-400 mt-1">{calculateAge(pet.date_of_birth)}</p>
                </div>
              </div>
              {pet.likes && (
                <div className="mt-3 pt-3 border-t border-gray-50">
                  <p className="text-xs text-gray-500"><span className="font-medium">Likes:</span> {pet.likes}</p>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add a new pet">
        <div className="space-y-4">
          <div>
            <label className="label">Pet name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="e.g. Buddy" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Species</label>
              <select value={form.species} onChange={(e) => setForm({ ...form, species: e.target.value })} className="input">
                {SPECIES_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Breed</label>
              <input value={form.breed} onChange={(e) => setForm({ ...form, breed: e.target.value })} className="input" placeholder="e.g. Golden Retriever" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Date of birth</label>
              <input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Weight (kg)</label>
              <input type="number" step="0.1" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} className="input" placeholder="e.g. 25" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Likes</label>
              <input value={form.likes} onChange={(e) => setForm({ ...form, likes: e.target.value })} className="input" placeholder="Belly rubs, treats..." />
            </div>
            <div>
              <label className="label">Dislikes</label>
              <input value={form.dislikes} onChange={(e) => setForm({ ...form, dislikes: e.target.value })} className="input" placeholder="Loud noises, baths..." />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input" rows={2} placeholder="Any additional info..." />
          </div>
          {error && <div className="text-sm text-error-600 bg-error-50 rounded-lg px-4 py-3">{error}</div>}
          <button onClick={handleAdd} disabled={saving || !form.name} className="btn-primary w-full">
            {saving ? 'Adding...' : 'Add pet'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
