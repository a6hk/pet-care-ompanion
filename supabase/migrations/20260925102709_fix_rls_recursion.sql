/*
# Fix infinite recursion in family_members RLS policies

## Problem
The family_members SELECT policy references family_members in a subquery,
which triggers the same RLS policy recursively, causing infinite recursion.

## Fix
Create a SECURITY DEFINER function `is_family_member(user_uuid, family_uuid)`
that checks membership by bypassing RLS. Replace all self-referential
family_members subqueries in policies with calls to this function.

This also fixes the same pattern in families, family_invites, pets, checklists,
routines, appointments, vaccinations, and activity_log policies that reference
family_members in subqueries (which in turn triggered the recursive family_members SELECT policy).
*/

-- Helper function: check if a user is a member of a family (bypasses RLS)
CREATE OR REPLACE FUNCTION is_family_member(p_user_uuid uuid, p_family_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM family_members
    WHERE family_members.user_id = p_user_uuid
    AND family_members.family_id = p_family_uuid
  );
$$;

-- Helper function: check if a user is an admin of a family (bypasses RLS)
CREATE OR REPLACE FUNCTION is_family_admin(p_user_uuid uuid, p_family_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM family_members
    WHERE family_members.user_id = p_user_uuid
    AND family_members.family_id = p_family_uuid
    AND family_members.role = 'admin'
  );
$$;

-- ============ FAMILY MEMBERS (fix recursion) ============
DROP POLICY IF EXISTS "select_family_members" ON family_members;
CREATE POLICY "select_family_members" ON family_members FOR SELECT
  TO authenticated USING (is_family_member(auth.uid(), family_members.family_id));

DROP POLICY IF EXISTS "insert_family_member" ON family_members;
CREATE POLICY "insert_family_member" ON family_members FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = user_id OR is_family_admin(auth.uid(), family_members.family_id)
  );

DROP POLICY IF EXISTS "update_family_member" ON family_members;
CREATE POLICY "update_family_member" ON family_members FOR UPDATE
  TO authenticated USING (is_family_admin(auth.uid(), family_members.family_id))
  WITH CHECK (is_family_admin(auth.uid(), family_members.family_id));

DROP POLICY IF EXISTS "delete_family_member" ON family_members;
CREATE POLICY "delete_family_member" ON family_members FOR DELETE
  TO authenticated USING (
    auth.uid() = user_id OR is_family_admin(auth.uid(), family_members.family_id)
  );

-- ============ FAMILIES ============
DROP POLICY IF EXISTS "select_family_as_member" ON families;
CREATE POLICY "select_family_as_member" ON families FOR SELECT
  TO authenticated USING (is_family_member(auth.uid(), families.id));

DROP POLICY IF EXISTS "update_family_as_admin" ON families;
CREATE POLICY "update_family_as_admin" ON families FOR UPDATE
  TO authenticated USING (is_family_admin(auth.uid(), families.id))
  WITH CHECK (is_family_admin(auth.uid(), families.id));

DROP POLICY IF EXISTS "delete_family_as_admin" ON families;
CREATE POLICY "delete_family_as_admin" ON families FOR DELETE
  TO authenticated USING (is_family_admin(auth.uid(), families.id));

-- ============ FAMILY INVITES ============
DROP POLICY IF EXISTS "select_family_invites" ON family_invites;
CREATE POLICY "select_family_invites" ON family_invites FOR SELECT
  TO authenticated USING (
    is_family_member(auth.uid(), family_invites.family_id)
    OR email = (SELECT email FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_family_invite" ON family_invites;
CREATE POLICY "insert_family_invite" ON family_invites FOR INSERT
  TO authenticated WITH CHECK (is_family_admin(auth.uid(), family_invites.family_id));

DROP POLICY IF EXISTS "update_family_invite" ON family_invites;
CREATE POLICY "update_family_invite" ON family_invites FOR UPDATE
  TO authenticated USING (is_family_member(auth.uid(), family_invites.family_id))
  WITH CHECK (is_family_member(auth.uid(), family_invites.family_id));

DROP POLICY IF EXISTS "delete_family_invite" ON family_invites;
CREATE POLICY "delete_family_invite" ON family_invites FOR DELETE
  TO authenticated USING (is_family_admin(auth.uid(), family_invites.family_id));

-- ============ PETS ============
DROP POLICY IF EXISTS "select_pets" ON pets;
CREATE POLICY "select_pets" ON pets FOR SELECT
  TO authenticated USING (is_family_member(auth.uid(), pets.family_id));

DROP POLICY IF EXISTS "insert_pets" ON pets;
CREATE POLICY "insert_pets" ON pets FOR INSERT
  TO authenticated WITH CHECK (is_family_member(auth.uid(), pets.family_id));

DROP POLICY IF EXISTS "update_pets" ON pets;
CREATE POLICY "update_pets" ON pets FOR UPDATE
  TO authenticated USING (is_family_member(auth.uid(), pets.family_id))
  WITH CHECK (is_family_member(auth.uid(), pets.family_id));

DROP POLICY IF EXISTS "delete_pets" ON pets;
CREATE POLICY "delete_pets" ON pets FOR DELETE
  TO authenticated USING (is_family_admin(auth.uid(), pets.family_id));

-- ============ CHECKLISTS ============
DROP POLICY IF EXISTS "select_checklists" ON checklists;
CREATE POLICY "select_checklists" ON checklists FOR SELECT
  TO authenticated USING (is_family_member(auth.uid(), checklists.family_id));

DROP POLICY IF EXISTS "insert_checklists" ON checklists;
CREATE POLICY "insert_checklists" ON checklists FOR INSERT
  TO authenticated WITH CHECK (is_family_member(auth.uid(), checklists.family_id));

DROP POLICY IF EXISTS "update_checklists" ON checklists;
CREATE POLICY "update_checklists" ON checklists FOR UPDATE
  TO authenticated USING (is_family_member(auth.uid(), checklists.family_id))
  WITH CHECK (is_family_member(auth.uid(), checklists.family_id));

DROP POLICY IF EXISTS "delete_checklists" ON checklists;
CREATE POLICY "delete_checklists" ON checklists FOR DELETE
  TO authenticated USING (is_family_member(auth.uid(), checklists.family_id));

-- ============ CHECKLIST ITEMS ============
DROP POLICY IF EXISTS "select_checklist_items" ON checklist_items;
CREATE POLICY "select_checklist_items" ON checklist_items FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM checklists c
      WHERE c.id = checklist_items.checklist_id
      AND is_family_member(auth.uid(), c.family_id)
    )
  );

DROP POLICY IF EXISTS "insert_checklist_items" ON checklist_items;
CREATE POLICY "insert_checklist_items" ON checklist_items FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM checklists c
      WHERE c.id = checklist_items.checklist_id
      AND is_family_member(auth.uid(), c.family_id)
    )
  );

DROP POLICY IF EXISTS "update_checklist_items" ON checklist_items;
CREATE POLICY "update_checklist_items" ON checklist_items FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM checklists c
      WHERE c.id = checklist_items.checklist_id
      AND is_family_member(auth.uid(), c.family_id)
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM checklists c
      WHERE c.id = checklist_items.checklist_id
      AND is_family_member(auth.uid(), c.family_id)
    )
  );

DROP POLICY IF EXISTS "delete_checklist_items" ON checklist_items;
CREATE POLICY "delete_checklist_items" ON checklist_items FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM checklists c
      WHERE c.id = checklist_items.checklist_id
      AND is_family_member(auth.uid(), c.family_id)
    )
  );

-- ============ ROUTINES ============
DROP POLICY IF EXISTS "select_routines" ON routines;
CREATE POLICY "select_routines" ON routines FOR SELECT
  TO authenticated USING (is_family_member(auth.uid(), routines.family_id));

DROP POLICY IF EXISTS "insert_routines" ON routines;
CREATE POLICY "insert_routines" ON routines FOR INSERT
  TO authenticated WITH CHECK (is_family_member(auth.uid(), routines.family_id));

DROP POLICY IF EXISTS "update_routines" ON routines;
CREATE POLICY "update_routines" ON routines FOR UPDATE
  TO authenticated USING (is_family_member(auth.uid(), routines.family_id))
  WITH CHECK (is_family_member(auth.uid(), routines.family_id));

DROP POLICY IF EXISTS "delete_routines" ON routines;
CREATE POLICY "delete_routines" ON routines FOR DELETE
  TO authenticated USING (is_family_member(auth.uid(), routines.family_id));

-- ============ APPOINTMENTS ============
DROP POLICY IF EXISTS "select_appointments" ON appointments;
CREATE POLICY "select_appointments" ON appointments FOR SELECT
  TO authenticated USING (is_family_member(auth.uid(), appointments.family_id));

DROP POLICY IF EXISTS "insert_appointments" ON appointments;
CREATE POLICY "insert_appointments" ON appointments FOR INSERT
  TO authenticated WITH CHECK (is_family_member(auth.uid(), appointments.family_id));

DROP POLICY IF EXISTS "update_appointments" ON appointments;
CREATE POLICY "update_appointments" ON appointments FOR UPDATE
  TO authenticated USING (is_family_member(auth.uid(), appointments.family_id))
  WITH CHECK (is_family_member(auth.uid(), appointments.family_id));

DROP POLICY IF EXISTS "delete_appointments" ON appointments;
CREATE POLICY "delete_appointments" ON appointments FOR DELETE
  TO authenticated USING (is_family_member(auth.uid(), appointments.family_id));

-- ============ VACCINATIONS ============
DROP POLICY IF EXISTS "select_vaccinations" ON vaccinations;
CREATE POLICY "select_vaccinations" ON vaccinations FOR SELECT
  TO authenticated USING (is_family_member(auth.uid(), vaccinations.family_id));

DROP POLICY IF EXISTS "insert_vaccinations" ON vaccinations;
CREATE POLICY "insert_vaccinations" ON vaccinations FOR INSERT
  TO authenticated WITH CHECK (is_family_member(auth.uid(), vaccinations.family_id));

DROP POLICY IF EXISTS "update_vaccinations" ON vaccinations;
CREATE POLICY "update_vaccinations" ON vaccinations FOR UPDATE
  TO authenticated USING (is_family_member(auth.uid(), vaccinations.family_id))
  WITH CHECK (is_family_member(auth.uid(), vaccinations.family_id));

DROP POLICY IF EXISTS "delete_vaccinations" ON vaccinations;
CREATE POLICY "delete_vaccinations" ON vaccinations FOR DELETE
  TO authenticated USING (is_family_member(auth.uid(), vaccinations.family_id));

-- ============ ACTIVITY LOG ============
DROP POLICY IF EXISTS "select_activity_log" ON activity_log;
CREATE POLICY "select_activity_log" ON activity_log FOR SELECT
  TO authenticated USING (is_family_member(auth.uid(), activity_log.family_id));

DROP POLICY IF EXISTS "insert_activity_log" ON activity_log;
CREATE POLICY "insert_activity_log" ON activity_log FOR INSERT
  TO authenticated WITH CHECK (is_family_member(auth.uid(), activity_log.family_id));
