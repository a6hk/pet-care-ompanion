import { useState } from 'react'
import { useFamily } from '@/context/FamilyContext'
import { useAuth } from '@/context/AuthContext'
import {
  UserPlus, Trash2, Crown, Mail, Check, Clock, Users,
  Copy, Share2, ShieldCheck, HeartHandshake, Phone,
  Sparkles, AlertCircle, Info, ExternalLink
} from 'lucide-react'
import { Modal } from '@/components/Modal'
import { cn, relativeTime } from '@/lib/utils'
import type { FormEvent } from 'react'

export function FamilyPage() {
  const { family, members, invites, inviteMember, removeMember, deleteInvite, leaveFamily } = useFamily()
  const { user } = useAuth()
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)

  const currentUserMember = members.find((m) => m.user_id === user?.id)
  const isAdmin = currentUserMember?.role === 'admin'

  async function handleInvite(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)
    const { error } = await inviteMember(inviteEmail.toLowerCase().trim())
    setLoading(false)
    if (error) {
      setError(error)
    } else {
      setSuccess(`Invitation sent to ${inviteEmail}`)
      setInviteEmail('')
      setTimeout(() => {
        setShowInvite(false)
        setSuccess(null)
      }, 2000)
    }
  }

  async function handleRemove(memberId: string, memberEmail: string) {
    if (
      !confirm(
        `Remove ${memberEmail} from this family? (This only removes them from the family; their user account remains intact).`
      )
    )
      return
    await removeMember(memberId)
  }

  async function handleDeleteInvite(inviteId: string, inviteEmail: string) {
    if (!confirm(`Cancel and remove the invitation for ${inviteEmail}?`)) return
    await deleteInvite(inviteId)
  }

  async function handleLeave() {
    if (!confirm('Leave this family? You will need a new invitation to rejoin.')) return
    await leaveFamily()
  }

  function handleCopyFamilyCode() {
    if (!family) return
    const textToCopy = `Join our PetPal family "${family.name}" to coordinate pet care together! Visit: ${window.location.origin}/login`
    navigator.clipboard.writeText(textToCopy)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2500)
  }

  async function handleShareFamily() {
    if (!family) return
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${family.name} on PetPal`,
          text: `Join our family on PetPal to coordinate daily walks, feeding, and vet visits!`,
          url: `${window.location.origin}/login`,
        })
      } catch {}
    } else {
      handleCopyFamilyCode()
    }
  }

  if (!family) return null

  const memberColors = [
    'bg-primary-100 text-primary-700',
    'bg-secondary-100 text-secondary-700',
    'bg-accent-100 text-accent-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
  ]

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Family & Caretakers</h1>
            <span className="badge bg-primary-50 text-primary-700 border border-primary-100 text-xs">
              {members.length} Member{members.length !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Coordinate feeding, walking duties, and medical schedules with your household.
          </p>
        </div>

        {isAdmin && (
          <button onClick={() => setShowInvite(true)} className="btn-primary">
            <UserPlus className="w-4 h-4" /> Invite Member
          </button>
        )}
      </div>

      {/* Family Info & Quick Share Banner */}
      <div className="card p-6 bg-gradient-to-br from-primary-600/10 via-white to-secondary-500/10 border border-primary-100 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start sm:items-center gap-4">
            <div className="p-3.5 rounded-2xl bg-primary-600 text-white shadow-md">
              <Users className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-gray-900">{family.name}</h2>
                <span className="badge bg-white/80 border border-primary-200 text-primary-800 text-[11px] font-semibold">
                  Family Hub
                </span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
                {members.length} active caretaker{members.length !== 1 ? 's' : ''} • Created {relativeTime(family.created_at)}
              </p>
            </div>
          </div>

          {/* Quick Share Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleCopyFamilyCode}
              className="btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5 shadow-2xs"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-success-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Invitation Copied!' : 'Copy Invite Info'}</span>
            </button>
            <button
              onClick={handleShareFamily}
              className="btn-primary text-xs py-2 px-3.5 flex items-center gap-1.5 shadow-2xs"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share Invite</span>
            </button>
          </div>
        </div>
      </div>

      {/* Members Directory */}
      <div className="card p-5 sm:p-6 shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900">Active Caretakers</h3>
            <p className="text-xs text-gray-500">
              Members with real-time access to log routines and view pet records.
            </p>
          </div>
        </div>

        <div className="grid gap-3">
          {members.map((m, idx) => {
            const isSelf = m.user_id === user?.id
            const colorClass = memberColors[idx % memberColors.length]

            return (
              <div
                key={m.id}
                className={cn(
                  'flex items-center justify-between p-3.5 sm:p-4 rounded-2xl border transition-all',
                  isSelf ? 'border-primary-200 bg-primary-50/20' : 'border-gray-100 bg-white hover:bg-gray-50/50'
                )}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className={cn(
                      'w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-base shadow-2xs shrink-0',
                      colorClass
                    )}
                  >
                    {m.email[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-900 text-sm truncate">{m.email}</p>
                      {isSelf && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-800">
                          You
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {m.role === 'admin' ? (
                        <span className="badge bg-amber-50 text-amber-700 border border-amber-200/60 text-[11px] font-semibold">
                          <Crown className="w-3 h-3 text-amber-600" /> Family Admin
                        </span>
                      ) : (
                        <span className="badge bg-gray-100 text-gray-600 text-[11px] font-medium">
                          <ShieldCheck className="w-3 h-3 text-gray-500" /> Caretaker
                        </span>
                      )}
                      <span className="text-xs text-gray-400">Joined {relativeTime(m.joined_at)}</span>
                    </div>
                  </div>
                </div>

                {isAdmin && !isSelf && (
                  <button
                    onClick={() => handleRemove(m.id, m.email)}
                    className="p-2.5 rounded-xl text-gray-400 hover:bg-error-50 hover:text-error-500 transition-colors shrink-0"
                    title="Remove from family"
                    aria-label={`Remove ${m.email} from family`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Pending Invitations */}
      {invites.length > 0 && (
        <div className="card p-5 sm:p-6 shadow-sm border border-gray-100 space-y-4">
          <div>
            <h3 className="text-base font-bold text-gray-900">Pending Invitations</h3>
            <p className="text-xs text-gray-500">Invitations waiting to be accepted</p>
          </div>

          <div className="space-y-2.5">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between p-3.5 rounded-2xl border border-warning-100 bg-warning-50/20"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-warning-100 text-warning-700 flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{inv.email}</p>
                    <p className="text-xs text-gray-400">Invited {relativeTime(inv.created_at)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="badge bg-warning-50 text-warning-700 border border-warning-200 text-xs">
                    <Clock className="w-3 h-3" /> Pending
                  </span>
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteInvite(inv.id, inv.email)}
                      className="p-2 rounded-xl text-gray-400 hover:bg-error-50 hover:text-error-500 transition-colors"
                      title="Cancel invitation"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shared Emergency & Caretaker Information Hub */}
      <div className="card p-5 sm:p-6 bg-gray-50/80 border border-gray-100 space-y-3">
        <div className="flex items-center gap-2 text-primary-800">
          <HeartHandshake className="w-5 h-5 text-primary-600" />
          <h3 className="text-sm font-bold text-gray-900">Shared Caretaker Tips</h3>
        </div>
        <p className="text-xs text-gray-600 leading-relaxed">
          All caretakers in this family can check off daily feeding and walking routines, record vet notes, and view vaccination certificates in real-time. Any update made by one caretaker instantly notifies everyone in the activity feed.
        </p>
      </div>

      {/* Leave Family Action */}
      {!isAdmin && (
        <div className="pt-2">
          <button onClick={handleLeave} className="btn-danger w-full sm:w-auto text-xs py-2.5 px-4">
            <Trash2 className="w-4 h-4" /> Leave Family
          </button>
        </div>
      )}

      {/* Invite Modal */}
      <Modal
        open={showInvite}
        onClose={() => {
          setShowInvite(false)
          setError(null)
          setSuccess(null)
        }}
        title="Invite Family Caretaker"
        size="sm"
      >
        <form onSubmit={handleInvite} className="space-y-4">
          <p className="text-xs text-gray-600 leading-relaxed">
            Enter the email of the person you want to invite. They will receive access to your pets' profiles, routines, and shared care checklists.
          </p>

          <div className="p-3 bg-primary-50 rounded-xl text-xs text-primary-900 border border-primary-100 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary-600" /> Dev Default Credentials
            </p>
            <p className="text-primary-800">
              New accounts can sign in with password:{' '}
              <code className="bg-white px-1.5 py-0.5 rounded font-mono font-bold text-primary-950 border border-primary-200">
                Welcome1
              </code>
            </p>
          </div>

          <div>
            <label className="label text-xs font-semibold text-gray-700">Email Address</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="input text-sm"
              placeholder="e.g. partner@example.com"
              required
            />
          </div>

          {error && <div className="text-xs text-error-700 bg-error-50 border border-error-200 rounded-xl p-3">{error}</div>}
          {success && (
            <div className="text-xs text-success-700 bg-success-50 border border-success-200 rounded-xl p-3 flex items-center gap-2">
              <Check className="w-4 h-4 text-success-600" /> {success}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full text-sm py-2.5">
            {loading ? 'Sending invitation...' : 'Send Invitation'}
          </button>
        </form>
      </Modal>
    </div>
  )
}
