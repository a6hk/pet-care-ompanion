import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useFamily } from '@/context/FamilyContext'
import { PawPrint, LayoutDashboard, Dog, CheckSquare, Calendar, Users, MessageSquarePlus, LogOut, Menu, X, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/pets', label: 'Pets', icon: Dog, end: false },
  { to: '/app/checklists', label: 'Checklists', icon: CheckSquare, end: false },
  { to: '/app/calendar', label: 'Calendar', icon: Calendar, end: false },
  { to: '/app/family', label: 'Family', icon: Users, end: false },
  { to: '/app/feedback', label: 'Feedback', icon: MessageSquarePlus, end: false },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const { family } = useFamily()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-6 py-5 border-b border-gray-100">
        <img src="/favicon.png" alt="PawCare" className="w-8 h-8 rounded-full shadow-2xs shrink-0 object-cover" />
        <div>
          <h1 className="text-base font-bold text-gray-900 leading-tight">PawCare</h1>
          {family && <p className="text-xs text-gray-500 leading-tight">{family.name}</p>}
        </div>
      </div>

      {/* Featured AI Consultant Button (Highlighted) */}
      <div className="px-3 pt-4 pb-2">
        <NavLink
          to="/app/consultant"
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            cn(
              'group relative flex items-center justify-between p-3 rounded-2xl transition-all overflow-hidden border shadow-xs',
              isActive
                ? 'bg-gradient-to-r from-purple-700 via-indigo-700 to-primary-700 text-white border-purple-400/50 shadow-md ring-2 ring-purple-300/40'
                : 'bg-gradient-to-r from-purple-600 via-indigo-600 to-primary-600 text-white border-transparent hover:from-purple-700 hover:to-primary-700 hover:shadow-md'
            )
          }
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-xl bg-white/20 text-white backdrop-blur-md shrink-0">
              <Sparkles className="w-4 h-4 animate-pulse text-amber-200" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold leading-tight tracking-tight">AI Consultant</span>
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-amber-300 text-purple-950 uppercase tracking-wider">
                  AI
                </span>
              </div>
              <p className="text-[10px] text-purple-100/90 truncate leading-tight mt-0.5">
                Adoption, symptoms & care
              </p>
            </div>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-purple-200 group-hover:translate-x-0.5 transition-transform shrink-0" />
        </NavLink>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )
            }
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-gray-100">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-semibold">
            {profile?.full_name?.[0]?.toUpperCase() ?? profile?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{profile?.full_name ?? 'User'}</p>
            <p className="text-xs text-gray-500 truncate">{profile?.email}</p>
          </div>
        </div>
        <NavLink
          to="/admin"
          className="flex items-center gap-2 px-3 py-1.5 mb-1 rounded-lg text-xs font-semibold text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Admin Console</span>
        </NavLink>
        <button onClick={handleSignOut} className="btn-ghost w-full justify-start text-gray-500">
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col bg-white border-r border-gray-100 fixed inset-y-0 left-0 z-30">
        {sidebar}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 animate-fade-in">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl animate-slide-down">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/favicon.png" alt="PawCare" className="w-7 h-7 rounded-full shadow-2xs shrink-0 object-cover" />
          <span className="font-bold text-gray-900">PawCare</span>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2 rounded-lg text-gray-600 hover:bg-gray-100">
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Main content */}
      <main className="flex-1 lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
