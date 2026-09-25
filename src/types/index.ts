export type FamilyRole = 'admin' | 'member'

export interface Family {
  id: string
  name: string
  created_by: string
  created_at: string
}

export interface FamilyMember {
  id: string
  family_id: string
  user_id: string
  email: string
  role: FamilyRole
  joined_at: string
}

export interface FamilyInvite {
  id: string
  family_id: string
  email: string
  invited_by: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
}

export interface Pet {
  id: string
  family_id: string
  name: string
  species: string
  breed: string
  date_of_birth: string | null
  photo_url: string | null
  weight: number | null
  likes: string | null
  dislikes: string | null
  notes: string | null
  created_at: string
}

export type ChecklistType = 'recurring' | 'time_limited'
export type ChecklistSource = 'ai_routine' | 'ai_vet' | 'manual'

export interface Checklist {
  id: string
  pet_id: string
  family_id: string
  title: string
  type: ChecklistType
  source: ChecklistSource
  start_date: string
  end_date: string | null
  created_by: string
  created_at: string
}

export interface ChecklistItem {
  id: string
  checklist_id: string
  title: string
  due_time: string | null
  completed: boolean
  completed_by: string | null
  completed_at: string | null
  sort_order: number
}

export type RoutineType = 'feeding' | 'walking'

export interface Routine {
  id: string
  pet_id: string
  family_id: string
  type: RoutineType
  time: string
  portion: string | null
  notes: string | null
  created_at: string
}

export type AppointmentType = 'vet' | 'grooming'

export interface Appointment {
  id: string
  pet_id: string
  family_id: string
  type: AppointmentType
  title: string
  date: string
  time: string
  location: string | null
  notes: string | null
  created_at: string
}

export interface Vaccination {
  id: string
  pet_id: string
  family_id: string
  vaccine_name: string
  date_given: string
  next_due_date: string | null
  certificate_url: string | null
  notes: string | null
  created_at: string
}

export interface ActivityLog {
  id: string
  family_id: string
  pet_id: string | null
  user_id: string
  user_email: string
  action: string
  details: string | null
  created_at: string
}

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
}
