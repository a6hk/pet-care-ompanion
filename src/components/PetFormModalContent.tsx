import { useState, useRef, useEffect, type ChangeEvent } from 'react'
import { Upload, X, Loader2, Camera } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { SPECIES_OPTIONS, SPECIES_BREEDS } from '@/constants/breeds'
import { speciesIcon } from '@/lib/utils'
import type { Pet } from '@/types'

export interface PetFormData {
  name: string
  species: string
  breed: string
  date_of_birth: string
  weight: string
  likes: string
  dislikes: string
  notes: string
  photo_url: string | null
}

interface PetFormModalProps {
  initialData?: Pet | null
  onSubmit: (data: PetFormData) => Promise<{ error: string | null }>
  onCancel: () => void
  isSubmitting: boolean
  title?: string
  submitLabel?: string
}

export function PetFormModalContent({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel = 'Save Pet',
}: PetFormModalProps) {
  const [form, setForm] = useState<PetFormData>({
    name: initialData?.name ?? '',
    species: initialData?.species ?? 'Dog',
    breed: initialData?.breed ?? '',
    date_of_birth: initialData?.date_of_birth ?? '',
    weight: initialData?.weight != null ? String(initialData.weight) : '',
    likes: initialData?.likes ?? '',
    dislikes: initialData?.dislikes ?? '',
    notes: initialData?.notes ?? '',
    photo_url: initialData?.photo_url ?? null,
  })

  // Breed selector helper state
  const topBreeds = SPECIES_BREEDS[form.species] ?? []
  const [breedSelection, setBreedSelection] = useState<string>(() => {
    if (!initialData?.breed) return ''
    if (topBreeds.includes(initialData.breed)) return initialData.breed
    return 'Other'
  })
  const [customBreed, setCustomBreed] = useState<string>(() => {
    if (!initialData?.breed) return ''
    if (!topBreeds.includes(initialData.breed)) return initialData.breed
    return ''
  })

  // Photo upload state
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoPreview, setPhotoPreview] = useState<string | null>(initialData?.photo_url ?? null)
  const [formError, setFormError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // When species changes, reset or reconcile breed selection
  const handleSpeciesChange = (newSpecies: string) => {
    const breedsForNewSpecies = SPECIES_BREEDS[newSpecies] ?? []
    setForm((prev) => ({ ...prev, species: newSpecies, breed: '' }))
    setBreedSelection('')
    setCustomBreed('')
  }

  const handleBreedSelectionChange = (val: string) => {
    setBreedSelection(val)
    if (val === 'Other') {
      setForm((prev) => ({ ...prev, breed: customBreed }))
    } else {
      setForm((prev) => ({ ...prev, breed: val }))
    }
  }

  const handleCustomBreedChange = (val: string) => {
    setCustomBreed(val)
    setForm((prev) => ({ ...prev, breed: val }))
  }

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Limit size to 5MB
    if (file.size > 5 * 1024 * 1024) {
      setFormError('Image file size must be less than 5MB')
      return
    }

    setUploadingPhoto(true)
    setFormError(null)

    try {
      const fileExt = file.name.split('.').pop() || 'jpg'
      const filePath = `pets/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('pet-assets')
        .upload(filePath, file, { cacheControl: '3600', upsert: true })

      if (uploadError) {
        throw uploadError
      }

      const { data: publicUrlData } = supabase.storage
        .from('pet-assets')
        .getPublicUrl(uploadData.path)

      const finalUrl = publicUrlData.publicUrl
      setPhotoPreview(finalUrl)
      setForm((prev) => ({ ...prev, photo_url: finalUrl }))
    } catch (err: any) {
      console.error('Error uploading pet image:', err)
      setFormError(err.message || 'Failed to upload image. Please try again.')
    } finally {
      setUploadingPhoto(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function handleRemovePhoto() {
    setPhotoPreview(null)
    setForm((prev) => ({ ...prev, photo_url: null }))
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      setFormError('Please enter a pet name')
      return
    }
    setFormError(null)
    const res = await onSubmit(form)
    if (res.error) {
      setFormError(res.error)
    }
  }

  return (
    <div className="space-y-5">
      {/* Photo Upload Section */}
      <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl bg-gray-50 border border-gray-100">
        <div className="relative group">
          {photoPreview ? (
            <img
              src={photoPreview}
              alt="Pet preview"
              className="w-20 h-20 rounded-2xl object-cover border-2 border-white shadow-md"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-primary-100/60 border-2 border-primary-200/60 flex items-center justify-center text-3xl shadow-inner">
              {speciesIcon(form.species)}
            </div>
          )}

          {uploadingPhoto && (
            <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center text-white">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
        </div>

        <div className="flex-1 text-center sm:text-left space-y-1">
          <p className="text-sm font-semibold text-gray-900">Pet Photo</p>
          <p className="text-xs text-gray-500">Upload a picture of your pet (JPG, PNG, WebP up to 5MB)</p>
          <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleFileSelected}
              disabled={uploadingPhoto || isSubmitting}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto || isSubmitting}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <Camera className="w-3.5 h-3.5" />
              {photoPreview ? 'Change Photo' : 'Upload Photo'}
            </button>
            {photoPreview && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                disabled={uploadingPhoto || isSubmitting}
                className="text-xs text-red-600 hover:text-red-700 py-1.5 px-2 font-medium"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Name and Species */}
      <div>
        <label className="label">Pet name <span className="text-red-500">*</span></label>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="input"
          placeholder="e.g. Buddy"
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Species</label>
          <select
            value={form.species}
            onChange={(e) => handleSpeciesChange(e.target.value)}
            className="input"
          >
            {SPECIES_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Breed</label>
          {topBreeds.length > 0 ? (
            <div className="space-y-2">
              <select
                value={breedSelection}
                onChange={(e) => handleBreedSelectionChange(e.target.value)}
                className="input"
              >
                <option value="">Select a breed...</option>
                {topBreeds.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
                <option value="Other">Other (Type your own)</option>
              </select>

              {breedSelection === 'Other' && (
                <input
                  value={customBreed}
                  onChange={(e) => handleCustomBreedChange(e.target.value)}
                  className="input text-sm animate-fade-in"
                  placeholder="Type specific breed or mix..."
                  autoFocus
                />
              )}
            </div>
          ) : (
            <input
              value={form.breed}
              onChange={(e) => setForm({ ...form, breed: e.target.value })}
              className="input"
              placeholder="e.g. Mixed breed"
            />
          )}
        </div>
      </div>

      {/* DOB and Weight */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Date of birth</label>
          <input
            type="date"
            value={form.date_of_birth}
            onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label className="label">Weight (kg)</label>
          <input
            type="number"
            step="0.1"
            value={form.weight}
            onChange={(e) => setForm({ ...form, weight: e.target.value })}
            className="input"
            placeholder="e.g. 25"
          />
        </div>
      </div>

      {/* Likes & Dislikes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Likes</label>
          <input
            value={form.likes}
            onChange={(e) => setForm({ ...form, likes: e.target.value })}
            className="input"
            placeholder="Belly rubs, squeaky toys, treats..."
          />
        </div>
        <div>
          <label className="label">Dislikes</label>
          <input
            value={form.dislikes}
            onChange={(e) => setForm({ ...form, dislikes: e.target.value })}
            className="input"
            placeholder="Loud noises, thunder, vacuum..."
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="label">Notes / Medical / Quirks</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className="input"
          rows={2}
          placeholder="Any special habits, allergies, or instructions..."
        />
      </div>

      {formError && (
        <div className="text-sm text-error-600 bg-error-50 rounded-lg px-4 py-3 animate-slide-down">
          {formError}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting || uploadingPhoto}
          className="btn-secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || uploadingPhoto || !form.name.trim()}
          className="btn-primary"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            submitLabel
          )}
        </button>
      </div>
    </div>
  )
}
