import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { Profile } from '@/types'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  resetPasswordToDefault: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) {
        loadProfile(data.session.user.id)
      } else {
        setLoading(false)
      }
    }).catch((err) => {
      console.error('Failed to get session:', err)
      setLoading(false)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess)
      if (sess) {
        loadProfile(sess.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => authListener.subscription.unsubscribe()
  }, [])

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('Error loading profile:', error)
    }
    setProfile(data as Profile | null)
    setLoading(false)
  }

  async function signUp(email: string, password: string, fullName: string) {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase credentials are not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.' }
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) return { error: error.message }
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email,
        full_name: fullName,
      })
    }
    return { error: null }
  }

  async function signIn(email: string, password: string) {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase credentials are not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.' }
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return { error: null }
  }

  async function resetPasswordToDefault(email: string) {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase credentials are not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.' }
    }
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail) {
      return { error: 'Please enter a valid email address.' }
    }

    try {
      // 1. Try calling the database RPC function to reset directly to 'Welc@me135246'
      const { error: rpcError } = await supabase.rpc('reset_user_password_to_default', {
        target_email: cleanEmail,
      })

      if (!rpcError) {
        return { error: null }
      }

      // If function is not found or error, inspect
      console.warn('RPC reset_user_password_to_default returned error:', rpcError.message)

      // 2. If the RPC function has not yet been applied in Supabase SQL editor, provide actionable guidance
      if (rpcError.message.includes('Could not find the function') || rpcError.code === 'PGRST202') {
        return {
          error: 'The database reset function is not installed yet. Please run supabase/reset_password.sql in your Supabase SQL Editor.',
        }
      }

      return { error: rpcError.message }
    } catch (err: any) {
      return { error: err?.message || 'Failed to reset password' }
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, signUp, signIn, resetPasswordToDefault, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
