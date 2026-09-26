import { useEffect, useState, useCallback } from 'react'
import { useFamily } from '@/context/FamilyContext'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import { Plus, Dog, PawPrint } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { EmptyState } from '@/components/EmptyState'
import { calculateAge, speciesIcon } from '@/lib/utils'
import { PetFormModalContent, type PetFormData } from '@/components/PetFormModalContent'
import type { Pet } from '@/types'

export function PetsPage() {
  const { family } = useFamily()
  const { user } = useAuth()
  const [pets, setPets] = useState<Pet[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadPets = useCallback(async () => {
    if (!family) return
    const { data } = await supabase
      .from('pets')
      .select('*')
      .eq('family_id', family.id)
      .order('created_at', { ascending: true })
    setPets((data as Pet[]) ?? [])
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-400">Loading pets...</p>
      </div>
    )
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
            action={
              <button onClick={() => setShowAdd(true)} className="btn-primary">
                <Plus className="w-4 h-4" /> Add your first pet
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pets.map((pet) => (
            <Link
              key={pet.id}
              to={`/app/pets/${pet.id}`}
              className="card p-5 hover:shadow-md transition-all group animate-slide-up flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start gap-4">
                  {pet.photo_url ? (
                    <img
                      src={pet.photo_url}
                      alt={pet.name}
                      className="w-16 h-16 rounded-2xl object-cover border border-gray-100 shadow-sm"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center text-3xl">
                      {speciesIcon(pet.species)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 group-hover:text-primary-600 transition-colors truncate">
                      {pet.name}
                    </h3>
                    <p className="text-sm text-gray-500 truncate">{pet.breed || pet.species}</p>
                    <p className="text-xs text-gray-400 mt-1">{calculateAge(pet.date_of_birth)}</p>
                  </div>
                </div>

                {pet.likes && (
                  <div className="mt-3 pt-3 border-t border-gray-50">
                    <p className="text-xs text-gray-500 truncate">
                      <span className="font-medium text-gray-700">Likes:</span> {pet.likes}
                    </p>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

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
