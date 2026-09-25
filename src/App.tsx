import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useFamily } from '@/context/FamilyContext'
import { FullPageLoader } from '@/components/LoadingSpinner'
import { AppShell } from '@/components/AppShell'
import { FamilySetupPage } from '@/pages/FamilySetupPage'
import { SignUpPage } from '@/pages/auth/SignUpPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { PetsPage } from '@/pages/PetsPage'
import { PetDetailPage } from '@/pages/PetDetailPage'
import { ChecklistsPage } from '@/pages/ChecklistsPage'
import { CalendarPage } from '@/pages/CalendarPage'
import { FamilyPage } from '@/pages/FamilyPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  const { family, loading: familyLoading } = useFamily()

  if (loading || (session && familyLoading)) return <FullPageLoader />
  if (!session) return <Navigate to="/login" replace />
  if (!family) return <FamilySetupPage />
  return <AppShell>{children}</AppShell>
}

export default function App() {
  const { session, loading } = useAuth()

  if (loading) return <FullPageLoader />

  return (
    <Routes>
      <Route path="/signup" element={session ? <Navigate to="/app" replace /> : <SignUpPage />} />
      <Route path="/login" element={session ? <Navigate to="/app" replace /> : <LoginPage />} />
      <Route path="/app" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/app/pets" element={<ProtectedRoute><PetsPage /></ProtectedRoute>} />
      <Route path="/app/pets/:petId" element={<ProtectedRoute><PetDetailPage /></ProtectedRoute>} />
      <Route path="/app/checklists" element={<ProtectedRoute><ChecklistsPage /></ProtectedRoute>} />
      <Route path="/app/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
      <Route path="/app/family" element={<ProtectedRoute><FamilyPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}
