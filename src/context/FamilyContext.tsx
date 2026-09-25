import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
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
      setFamily(null)
      setMembers([])
      setInvites([])
      setLoading(false)
      return
    }

    const { data: famData } = await supabase
      .from('families')
      .select('*')
      .eq('id', memberData.family_id)
      .maybeSingle()

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
    if (!family) return { error: 'No family' }
    const { error } = await supabase
      .from('family_invites')
      .insert({
        family_id: family.id,
        email: email.toLowerCase(),
        invited_by: user!.id,
      })
    if (error) return { error: error.message }
    await loadFamilyData()
    return { error: null }
  }

  async function removeMember(memberId: string) {
    const { error } = await supabase.from('family_members').delete().eq('id', memberId)
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
      createFamily, inviteMember, removeMember, leaveFamily,
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
