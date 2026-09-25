import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useFamily } from '@/context/FamilyContext'
import { PawPrint, Users } from 'lucide-react'
import type { FormEvent } from 'react'

export function FamilySetupPage() {
  const { user } = useAuth()
  const { createFamily: ctxCreateFamily } = useFamily()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await ctxCreateFamily(name)
    setLoading(false)
    if (error) setError(error)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary-50 via-white to-secondary-50 p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 rounded-2xl bg-primary-600 text-white mb-3">
            <Users className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create your family</h1>
          <p className="text-sm text-gray-500 mt-1 text-center">
            Welcome{user?.email ? `, ${user.email}` : ''}! Set up a family to start adding pets and inviting members.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="label">Family name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="e.g. The Smith Family"
              required
            />
          </div>

          {error && (
            <div className="text-sm text-error-600 bg-error-50 rounded-lg px-4 py-3 animate-slide-down">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Creating...' : 'Create family'}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-400">
          <PawPrint className="w-4 h-4" />
          <span>PetPal — Family Pet Care Manager</span>
        </div>
      </div>
    </div>
  )
}
