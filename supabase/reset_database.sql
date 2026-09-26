-- ==============================================================================
-- PetPal Reset Script: Clean All Data (Schema-Safe)
-- ==============================================================================
-- Truncates all application tables safely without triggering auth schema errors.
-- ==============================================================================

TRUNCATE TABLE 
  activity_log,
  vaccinations,
  appointments,
  routines,
  checklist_items,
  checklists,
  pets,
  family_invites,
  family_members,
  families,
  profiles
CASCADE;
