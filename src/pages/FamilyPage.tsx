import { useState } from 'react'
import { useFamily } from '@/context/FamilyContext'
import { useAuth } from '@/context/AuthContext'
import { UserPlus, Trash2, Crown, Mail, Check, Clock, Users } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { cn, relativeTime } from '@/lib/utils'
import type { FormEvent } from 'react'

export function FamilyPage() {
  const { family, members, invites, inviteMember, removeMember, leaveFamily } = useFamily()
  const { user } = useAuth()
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const currentUserMember = members.find((m) => m.user_id === user?.id)
  const isAdmin = currentUserMember?.role === 'admin'

  async function handleInvite(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)
    const { error } = await inviteMember(inviteEmail.toLowerCase())
    setLoading(false)
    if (error) {
      setError(error)
    } else {
      setSuccess(`Invitation sent to ${inviteEmail}`)
      setInviteEmail('')
      setTimeout(() => { setShowInvite(false); setSuccess(null) }, 2000)
    }
  }

  async function handleRemove(memberId: string, memberEmail: string) {
    if (!confirm(`Remove ${memberEmail} from the family?`)) return
    await removeMember(memberId)
  }

  async function handleLeave() {
    if (!confirm('Leave this family? You will need a new invitation to rejoin.')) return
    await leaveFamily()
  }

  if (!family) return null

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Family</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage members and invitations</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowInvite(true)} className="btn-primary">
            <UserPlus className="w-4 h-4" /> Invite member
          </button>
        )}
      </div>

      {/* Family info */}
      <div className="card p-6">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-primary-50 text-primary-600">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{family.name}</h2>
            <p className="text-sm text-gray-500">{members.length} member{members.length !== 1 ? 's' : ''} • Created {relativeTime(family.created_at)}</p>
          </div>
        </div>
      </div>

      {/* Members */}
      <div className="card p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Members</h3>
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold text-sm">
                  {m.email[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{m.email}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {m.role === 'admin' ? (
                      <span className="badge bg-accent-50 text-accent-700"><Crown className="w-3 h-3" /> Admin</span>
                    ) : (
                      <span className="badge bg-gray-100 text-gray-600">Member</span>
                    )}
                    <span className="text-xs text-gray-400">Joined {relativeTime(m.joined_at)}</span>
                  </div>
                </div>
              </div>
              {isAdmin && m.user_id !== user?.id && (
                <button
                  onClick={() => handleRemove(m.id, m.email)}
                  className="p-2 rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="card p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Pending invitations</h3>
          <div className="space-y-2">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-warning-50 text-warning-600 flex items-center justify-center">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{inv.email}</p>
                    <p className="text-xs text-gray-400">Invited {relativeTime(inv.created_at)}</p>
                  </div>
                </div>
                <span className="badge bg-warning-50 text-warning-700">
                  <Clock className="w-3 h-3" /> Pending
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Leave family */}
      {!isAdmin && (
        <button onClick={handleLeave} className="btn-danger w-full sm:w-auto">
          <Trash2 className="w-4 h-4" /> Leave family
        </button>
      )}

      {/* Invite modal */}
      <Modal open={showInvite} onClose={() => { setShowInvite(false); setError(null); setSuccess(null) }} title="Invite family member" size="sm">
        <form onSubmit={handleInvite} className="space-y-4">
          <p className="text-sm text-gray-600">
            Enter the email of the person you want to invite. They will receive an invitation to join your family.
          </p>
          <div>
            <label className="label">Email address</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="input"
              placeholder="e.g. spouse@example.com"
              required
            />
          </div>
          {error && <div className="text-sm text-error-600 bg-error-50 rounded-lg px-4 py-3">{error}</div>}
          {success && <div className="text-sm text-success-600 bg-success-50 rounded-lg px-4 py-3 flex items-center gap-2"><Check className="w-4 h-4" /> {success}</div>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Sending...' : 'Send invitation'}
          </button>
        </form>
      </Modal>
    </div>
  )
}
