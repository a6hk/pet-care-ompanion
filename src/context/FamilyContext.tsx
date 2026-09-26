import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAuth } from './AuthContext'
import { supabase } from '@/lib/supabase'
import type { Family, FamilyMember, FamilyInvite } from '@/types'

interface FamilyContextValue {
  family: Family | null
  members: FamilyMember[]
  invites: FamilyInvite[]
  loading: boolean
  refresh: () => Promise<void>
  createFamily: (name: string) => Promise<{ error: string | null }>
  inviteMember: (email: string) => Promise<{ error: string | null }>
  removeMember: (memberId: string) => Promise<{ error: string | null }>
  deleteInvite: (inviteId: string) => Promise<{ error: string | null }>
  leaveFamily: () => Promise<{ error: string | null }>
}

const FamilyContext = createContext<FamilyContextValue | undefined>(undefined)

export function FamilyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [family, setFamily] = useState<Family | null>(null)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [invites, setInvites] = useState<FamilyInvite[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      loadFamilyData()
    } else {
      setFamily(null)
      setMembers([])
      setInvites([])
      setLoading(false)
    }
  }, [user])

  async function loadFamilyData() {
    setLoading(true)
    const { data: memberData } = await supabase
      .from('family_members')
      .select('family_id')
      .eq('user_id', user!.id)
      .maybeSingle()

    if (!memberData) {
      // Check if this user's email has a pending invitation to join an existing family
      const userEmail = user!.email?.toLowerCase()
      if (userEmail) {
        const { data: pendingInvite } = await supabase
          .from('family_invites')
          .select('family_id, id')
          .eq('email', userEmail)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (pendingInvite?.family_id) {
          // Join the inviting family
          await supabase.from('family_members').insert({
            family_id: pendingInvite.family_id,
            user_id: user!.id,
            email: userEmail,
            role: 'member',
          })

          await supabase
            .from('family_invites')
            .update({ status: 'accepted' })
            .eq('id', pendingInvite.id)

          // Load data from the joined family
          const { data: famData } = await supabase
            .from('families')
            .select('*')
            .eq('id', pendingInvite.family_id)
            .maybeSingle()

          const { data: memData } = await supabase
            .from('family_members')
            .select('*')
            .eq('family_id', pendingInvite.family_id)
            .order('joined_at', { ascending: true })

          setFamily(famData as Family | null)
          setMembers((memData as FamilyMember[]) ?? [])
          setInvites([])
          setLoading(false)
          return
        }
      }

      // No invite found: auto-create default family
      await autoCreateDefaultFamily()
      return
    }

    const { data: famData } = await supabase
      .from('families')
      .select('*')
      .eq('id', memberData.family_id)
      .maybeSingle()

    if (!famData) {
      await autoCreateDefaultFamily()
      return
    }

    const { data: memData } = await supabase
      .from('family_members')
      .select('*')
      .eq('family_id', memberData.family_id)
      .order('joined_at', { ascending: true })

    const { data: invData } = await supabase
      .from('family_invites')
      .select('*')
      .eq('family_id', memberData.family_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    setFamily(famData as Family | null)
    setMembers(memData as FamilyMember[] ?? [])
    setInvites(invData as FamilyInvite[] ?? [])
    setLoading(false)
  }

  async function autoCreateDefaultFamily() {
    if (!user) {
      setLoading(false)
      return
    }

    try {
      const familyName = 'Family'
      const { data: newFam, error: famErr } = await supabase
        .from('families')
        .insert({ name: familyName, created_by: user.id })
        .select()
        .single()

      if (famErr) {
        console.error('Error auto-creating family:', famErr)
        setLoading(false)
        return
      }

      await supabase
        .from('family_members')
        .insert({
          family_id: newFam.id,
          user_id: user.id,
          email: user.email!,
          role: 'admin',
        })

      // Reload family data now that member is attached
      const { data: memData } = await supabase
        .from('family_members')
        .select('*')
        .eq('family_id', newFam.id)
        .order('joined_at', { ascending: true })

      setFamily(newFam as Family)
      setMembers((memData as FamilyMember[]) ?? [])
      setInvites([])
    } catch (e) {
      console.error('Unexpected error auto-creating family:', e)
    } finally {
      setLoading(false)
    }
  }

  async function createFamily(name: string) {
    if (!user) return { error: 'Not authenticated' }
    const { data, error } = await supabase
      .from('families')
      .insert({ name, created_by: user.id })
      .select()
      .single()
    if (error) return { error: error.message }

    const { error: memberError } = await supabase
      .from('family_members')
      .insert({
        family_id: data.id,
        user_id: user.id,
        email: user.email!,
        role: 'admin',
      })
    if (memberError) return { error: memberError.message }

    await loadFamilyData()
    return { error: null }
  }

  async function inviteMember(email: string) {
    if (!family || !user) return { error: 'No family' }
    const targetEmail = email.trim().toLowerCase()
    const defaultPassword = 'Welcome1'

    try {
      // 1. Check if user already exists in profiles
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', targetEmail)
        .maybeSingle()

      let targetUserId = existingProfile?.id

      // 2. If user doesn't exist, create an account using separate auth client to keep current session
      if (!targetUserId) {
        const tempAuthClient = createClient(
          import.meta.env.VITE_SUPABASE_URL,
          import.meta.env.VITE_SUPABASE_ANON_KEY,
          { auth: { persistSession: false, autoRefreshToken: false } }
        )

        const { data: signUpData, error: signUpError } = await tempAuthClient.auth.signUp({
          email: targetEmail,
          password: defaultPassword,
          options: { data: { full_name: targetEmail.split('@')[0] } },
        })

        if (signUpError && !signUpError.message.toLowerCase().includes('already registered')) {
          return { error: `Failed to create account: ${signUpError.message}` }
        }

        if (signUpData?.user) {
          targetUserId = signUpData.user.id
          // Ensure profile exists
          await supabase.from('profiles').upsert({
            id: targetUserId,
            email: targetEmail,
            full_name: targetEmail.split('@')[0],
          })
        }
      }

      // 3. If targetUserId is available, auto-join them directly to the family
      if (targetUserId) {
        // If they had any previous family membership, clean it or join this one
        await supabase
          .from('family_members')
          .delete()
          .eq('user_id', targetUserId)

        const { error: joinErr } = await supabase
          .from('family_members')
          .insert({
            family_id: family.id,
            user_id: targetUserId,
            email: targetEmail,
            role: 'member',
          })

        if (joinErr) {
          console.error('Error auto-adding member to family_members:', joinErr)
        }
      }

      // 4. Also record in family_invites as accepted/auto-joined
      await supabase
        .from('family_invites')
        .insert({
          family_id: family.id,
          email: targetEmail,
          invited_by: user.id,
          status: targetUserId ? 'accepted' : 'pending',
        })

      await loadFamilyData()
      return { error: null }
    } catch (err: any) {
      console.error('Error inviting member:', err)
      return { error: err.message || 'Failed to add member' }
    }
  }

  async function removeMember(memberId: string) {
    // 1. Get member details first to also clean up any invitation records for this family
    const memberToRemove = members.find((m) => m.id === memberId)
    
    // 2. Remove from family_members (removes access to family and pets, does NOT delete auth user account)
    const { error } = await supabase.from('family_members').delete().eq('id', memberId)
    if (error) return { error: error.message }

    // 3. Clean up any related family_invites for this email in this family
    if (memberToRemove && family) {
      await supabase
        .from('family_invites')
        .delete()
        .eq('family_id', family.id)
        .eq('email', memberToRemove.email.toLowerCase())
    }

    await loadFamilyData()
    return { error: null }
  }

  async function deleteInvite(inviteId: string) {
    const { error } = await supabase.from('family_invites').delete().eq('id', inviteId)
    if (error) return { error: error.message }
    await loadFamilyData()
    return { error: null }
  }

  async function leaveFamily() {
    if (!user) return { error: 'Not authenticated' }
    const { error } = await supabase
      .from('family_members')
      .delete()
      .eq('user_id', user.id)
    if (error) return { error: error.message }
    setFamily(null)
    setMembers([])
    setInvites([])
    return { error: null }
  }

  return (
    <FamilyContext.Provider value={{
      family, members, invites, loading,
      refresh: loadFamilyData,
      createFamily, inviteMember, removeMember, deleteInvite, leaveFamily,
    }}>
      {children}
    </FamilyContext.Provider>
  )
}

export function useFamily() {
  const ctx = useContext(FamilyContext)
  if (!ctx) throw new Error('useFamily must be used within FamilyProvider')
  return ctx
}
