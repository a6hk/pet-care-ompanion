/*
# PetPal Schema Part 2: RLS Policies

Adds row-level security policies to all tables.
Access is scoped through family_members membership checks.
Only authenticated users can access data.
*/

-- ============ PROFILES ============
DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============ FAMILIES ============
DROP POLICY IF EXISTS "select_family_as_member" ON families;
CREATE POLICY "select_family_as_member" ON families FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = families.id AND family_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_family_as_creator" ON families;
CREATE POLICY "insert_family_as_creator" ON families FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "update_family_as_admin" ON families;
CREATE POLICY "update_family_as_admin" ON families FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = families.id AND family_members.user_id = auth.uid() AND family_members.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = families.id AND family_members.user_id = auth.uid() AND family_members.role = 'admin')
  );

DROP POLICY IF EXISTS "delete_family_as_admin" ON families;
CREATE POLICY "delete_family_as_admin" ON families FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = families.id AND family_members.user_id = auth.uid() AND family_members.role = 'admin')
  );

-- ============ FAMILY MEMBERS ============
DROP POLICY IF EXISTS "select_family_members" ON family_members;
CREATE POLICY "select_family_members" ON family_members FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = family_members.family_id AND fm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_family_member" ON family_members;
CREATE POLICY "insert_family_member" ON family_members FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = family_members.family_id AND fm.user_id = auth.uid() AND fm.role = 'admin')
  );

DROP POLICY IF EXISTS "update_family_member" ON family_members;
CREATE POLICY "update_family_member" ON family_members FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = family_members.family_id AND fm.user_id = auth.uid() AND fm.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = family_members.family_id AND fm.user_id = auth.uid() AND fm.role = 'admin')
  );

DROP POLICY IF EXISTS "delete_family_member" ON family_members;
CREATE POLICY "delete_family_member" ON family_members FOR DELETE
  TO authenticated USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = family_members.family_id AND fm.user_id = auth.uid() AND fm.role = 'admin')
  );

-- ============ FAMILY INVITES ============
DROP POLICY IF EXISTS "select_family_invites" ON family_invites;
CREATE POLICY "select_family_invites" ON family_invites FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = family_invites.family_id AND family_members.user_id = auth.uid())
    OR email = (SELECT email FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_family_invite" ON family_invites;
CREATE POLICY "insert_family_invite" ON family_invites FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = family_invites.family_id AND family_members.user_id = auth.uid() AND family_members.role = 'admin')
  );

DROP POLICY IF EXISTS "update_family_invite" ON family_invites;
CREATE POLICY "update_family_invite" ON family_invites FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = family_invites.family_id AND family_members.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = family_invites.family_id AND family_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_family_invite" ON family_invites;
CREATE POLICY "delete_family_invite" ON family_invites FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = family_invites.family_id AND family_members.user_id = auth.uid() AND family_members.role = 'admin')
  );

-- ============ PETS ============
DROP POLICY IF EXISTS "select_pets" ON pets;
CREATE POLICY "select_pets" ON pets FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = pets.family_id AND family_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_pets" ON pets;
CREATE POLICY "insert_pets" ON pets FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = pets.family_id AND family_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_pets" ON pets;
CREATE POLICY "update_pets" ON pets FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = pets.family_id AND family_members.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = pets.family_id AND family_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_pets" ON pets;
CREATE POLICY "delete_pets" ON pets FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = pets.family_id AND family_members.user_id = auth.uid() AND family_members.role = 'admin')
  );

-- ============ CHECKLISTS ============
DROP POLICY IF EXISTS "select_checklists" ON checklists;
CREATE POLICY "select_checklists" ON checklists FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = checklists.family_id AND family_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_checklists" ON checklists;
CREATE POLICY "insert_checklists" ON checklists FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = checklists.family_id AND family_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_checklists" ON checklists;
CREATE POLICY "update_checklists" ON checklists FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = checklists.family_id AND family_members.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = checklists.family_id AND family_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_checklists" ON checklists;
CREATE POLICY "delete_checklists" ON checklists FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = checklists.family_id AND family_members.user_id = auth.uid())
  );

-- ============ CHECKLIST ITEMS ============
DROP POLICY IF EXISTS "select_checklist_items" ON checklist_items;
CREATE POLICY "select_checklist_items" ON checklist_items FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM checklists c
      JOIN family_members fm ON fm.family_id = c.family_id
      WHERE c.id = checklist_items.checklist_id AND fm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_checklist_items" ON checklist_items;
CREATE POLICY "insert_checklist_items" ON checklist_items FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM checklists c
      JOIN family_members fm ON fm.family_id = c.family_id
      WHERE c.id = checklist_items.checklist_id AND fm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_checklist_items" ON checklist_items;
CREATE POLICY "update_checklist_items" ON checklist_items FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM checklists c
      JOIN family_members fm ON fm.family_id = c.family_id
      WHERE c.id = checklist_items.checklist_id AND fm.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM checklists c
      JOIN family_members fm ON fm.family_id = c.family_id
      WHERE c.id = checklist_items.checklist_id AND fm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_checklist_items" ON checklist_items;
CREATE POLICY "delete_checklist_items" ON checklist_items FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM checklists c
      JOIN family_members fm ON fm.family_id = c.family_id
      WHERE c.id = checklist_items.checklist_id AND fm.user_id = auth.uid()
    )
  );

-- ============ ROUTINES ============
DROP POLICY IF EXISTS "select_routines" ON routines;
CREATE POLICY "select_routines" ON routines FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = routines.family_id AND family_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_routines" ON routines;
CREATE POLICY "insert_routines" ON routines FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = routines.family_id AND family_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_routines" ON routines;
CREATE POLICY "update_routines" ON routines FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = routines.family_id AND family_members.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = routines.family_id AND family_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_routines" ON routines;
CREATE POLICY "delete_routines" ON routines FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = routines.family_id AND family_members.user_id = auth.uid())
  );

-- ============ APPOINTMENTS ============
DROP POLICY IF EXISTS "select_appointments" ON appointments;
CREATE POLICY "select_appointments" ON appointments FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = appointments.family_id AND family_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_appointments" ON appointments;
CREATE POLICY "insert_appointments" ON appointments FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = appointments.family_id AND family_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_appointments" ON appointments;
CREATE POLICY "update_appointments" ON appointments FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = appointments.family_id AND family_members.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = appointments.family_id AND family_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_appointments" ON appointments;
CREATE POLICY "delete_appointments" ON appointments FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = appointments.family_id AND family_members.user_id = auth.uid())
  );

-- ============ VACCINATIONS ============
DROP POLICY IF EXISTS "select_vaccinations" ON vaccinations;
CREATE POLICY "select_vaccinations" ON vaccinations FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = vaccinations.family_id AND family_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_vaccinations" ON vaccinations;
CREATE POLICY "insert_vaccinations" ON vaccinations FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = vaccinations.family_id AND family_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_vaccinations" ON vaccinations;
CREATE POLICY "update_vaccinations" ON vaccinations FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = vaccinations.family_id AND family_members.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = vaccinations.family_id AND family_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_vaccinations" ON vaccinations;
CREATE POLICY "delete_vaccinations" ON vaccinations FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = vaccinations.family_id AND family_members.user_id = auth.uid())
  );

-- ============ ACTIVITY LOG ============
DROP POLICY IF EXISTS "select_activity_log" ON activity_log;
CREATE POLICY "select_activity_log" ON activity_log FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = activity_log.family_id AND family_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_activity_log" ON activity_log;
CREATE POLICY "insert_activity_log" ON activity_log FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM family_members WHERE family_members.family_id = activity_log.family_id AND family_members.user_id = auth.uid())
  );
