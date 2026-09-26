-- ==============================================================================
-- PetPal Seed Test Data (100% Schema-Safe for Supabase Hosted)
-- ==============================================================================
-- This script does NOT touch the internal auth schema directly, preventing
-- "Database error querying schema" errors on hosted Supabase.
-- It links all test pets, routines, appointments, vaccines, and checklists
-- to YOUR active user account in auth.users!
-- ==============================================================================

DO $$
DECLARE
  v_admin_user_id uuid;
  v_user_email text;
  v_family_id uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_pet_dog_id uuid := '22222222-2222-2222-2222-222222222222'::uuid;
  v_pet_cat_id uuid := '33333333-3333-3333-3333-333333333333'::uuid;
  v_pet_bunny_id uuid := '44444444-4444-4444-4444-444444444444'::uuid;
  v_cl_dog_routine uuid := '55555555-5555-5555-5555-555555555555'::uuid;
  v_cl_dog_meds uuid := '66666666-6666-6666-6666-666666666666'::uuid;
  v_cl_cat_care uuid := '77777777-7777-7777-7777-777777777777'::uuid;
BEGIN
  -- 1. Look for user ashutosh@example.com first, or fallback to the first created user
  SELECT id, email INTO v_admin_user_id, v_user_email 
  FROM auth.users 
  WHERE email = 'ashutosh@example.com'
  LIMIT 1;

  IF v_admin_user_id IS NULL THEN
    SELECT id, email INTO v_admin_user_id, v_user_email 
    FROM auth.users 
    ORDER BY created_at ASC 
    LIMIT 1;
  END IF;

  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found in auth.users! Please sign up with ashutosh@example.com in the app or Supabase Auth first.';
  END IF;

  -- Reset password to default 'Welcome1' and ensure email is confirmed
  UPDATE auth.users
  SET 
    encrypted_password = crypt('Welcome1', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
  WHERE id = v_admin_user_id;

  -- 2. Ensure profile exists for your user
  INSERT INTO profiles (id, email, full_name, avatar_url)
  VALUES (v_admin_user_id, v_user_email, 'Ashutosh', NULL)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  -- 3. Create or update Family
  INSERT INTO families (id, name, created_by, created_at)
  VALUES (v_family_id, 'Happy Paws Family', v_admin_user_id, now() - interval '30 days')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, created_by = v_admin_user_id;

  -- 4. Delete any conflicting previous family memberships for this user so they point to Happy Paws Family
  DELETE FROM family_members WHERE user_id = v_admin_user_id AND family_id != v_family_id;

  -- Add your user as Family Admin
  INSERT INTO family_members (family_id, user_id, email, role, joined_at)
  VALUES (v_family_id, v_admin_user_id, v_user_email, 'admin', now() - interval '30 days')
  ON CONFLICT (family_id, user_id) DO UPDATE SET role = 'admin';

  -- 5. Add a pending invitation to test family invitations
  INSERT INTO family_invites (family_id, email, invited_by, status, created_at)
  VALUES (v_family_id, 'sarah.caregiver@example.com', v_admin_user_id, 'pending', now() - interval '2 days')
  ON CONFLICT DO NOTHING;

  -- 6. Pets: Golden Retriever, Siamese Cat, Holland Lop Rabbit
  INSERT INTO pets (id, family_id, name, species, breed, date_of_birth, photo_url, weight, likes, dislikes, notes, created_at)
  VALUES
    (
      v_pet_dog_id,
      v_family_id,
      'Charlie',
      'Dog',
      'Golden Retriever',
      CURRENT_DATE - interval '3 years',
      'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=600&q=80',
      29.5,
      'Belly rubs, tennis balls, peanut butter, lake swimming',
      'Vacuum cleaner, thunder, sudden loud sirens',
      'Microchipped #9851410023456. Very friendly with other dogs and kids.',
      now() - interval '25 days'
    ),
    (
      v_pet_cat_id,
      v_family_id,
      'Luna',
      'Cat',
      'Siamese',
      CURRENT_DATE - interval '2 years',
      'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=600&q=80',
      4.2,
      'Catnip mice, cardboard boxes, high perches, sunbathing',
      'Closed doors, water sprays, trips to the vet clinic',
      'Loves salmon wet food. Prefers running water fountain.',
      now() - interval '20 days'
    ),
    (
      v_pet_bunny_id,
      v_family_id,
      'Mochi',
      'Rabbit',
      'Holland Lop',
      CURRENT_DATE - interval '1 year',
      'https://images.unsplash.com/photo-1585110396000-c9ffd4e4b308?auto=format&fit=crop&w=600&q=80',
      1.8,
      'Fresh parsley, orchard grass, wooden chew sticks',
      'Being picked up abruptly, high-pitched whistles',
      'Litter trained. Needs fresh hay refilled twice a day.',
      now() - interval '10 days'
    )
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, family_id = v_family_id;

  -- 7. Daily Routines (Multiple Feedings & Walks)
  -- Charlie: 3x Feedings + 2x Walks
  INSERT INTO routines (pet_id, family_id, type, time, portion, notes)
  VALUES
    (v_pet_dog_id, v_family_id, 'feeding', '08:00', '1.5 cups dry kibble', 'Breakfast • Add 1 pump salmon oil'),
    (v_pet_dog_id, v_family_id, 'feeding', '13:00', '1 Dental chew + treat', 'Lunch / Dental hygiene chew'),
    (v_pet_dog_id, v_family_id, 'feeding', '18:30', '1.5 cups dry kibble', 'Dinner • Soak in warm water for 5 mins'),
    (v_pet_dog_id, v_family_id, 'walking', '07:15', NULL, 'Morning park walk • 30 mins'),
    (v_pet_dog_id, v_family_id, 'walking', '17:30', NULL, 'Evening neighbourhood stroll • 40 mins');

  -- Luna: 2x Feedings
  INSERT INTO routines (pet_id, family_id, type, time, portion, notes)
  VALUES
    (v_pet_cat_id, v_family_id, 'feeding', '07:30', '1/2 can Salmon Pate', 'Breakfast • Clean water bowl'),
    (v_pet_cat_id, v_family_id, 'feeding', '19:00', '1/4 cup dry kibble', 'Dinner • Refill fountain filter');

  -- Mochi: 2x Feedings
  INSERT INTO routines (pet_id, family_id, type, time, portion, notes)
  VALUES
    (v_pet_bunny_id, v_family_id, 'feeding', '08:30', '1 cup Timothy Hay', 'Morning hay refill + fresh water'),
    (v_pet_bunny_id, v_family_id, 'feeding', '18:00', 'Small handful leafy greens', 'Evening greens: Romaine & parsley');

  -- 8. Appointments (TODAY & Upcoming)
  INSERT INTO appointments (pet_id, family_id, type, title, date, time, location, notes)
  VALUES
    (
      v_pet_dog_id,
      v_family_id,
      'vet',
      'Charlie Routine Wellness Exam',
      CURRENT_DATE,
      '10:30',
      'Metropolitan Vet Hospital, Suite 4',
      'Annual bloodwork review and ear check'
    ),
    (
      v_pet_cat_id,
      v_family_id,
      'grooming',
      'Luna Nail Trim & Fur Brushing',
      CURRENT_DATE,
      '15:00',
      'Happy Paws Grooming Spa',
      'Sensitive paws, please use gentle lavender shampoo'
    ),
    (
      v_pet_bunny_id,
      v_family_id,
      'vet',
      'Mochi Dental Checkup',
      CURRENT_DATE + interval '5 days',
      '11:00',
      'Exotic Animal Clinic',
      'Inspect back molars and check weight gain'
    );

  -- 9. Vaccinations (Due TODAY & Past Records)
  INSERT INTO vaccinations (pet_id, family_id, vaccine_name, date_given, next_due_date, certificate_url, notes)
  VALUES
    (
      v_pet_dog_id,
      v_family_id,
      'Bordetella (Kennel Cough)',
      CURRENT_DATE - interval '1 year',
      CURRENT_DATE,
      NULL,
      'Booster due today before boarding season'
    ),
    (
      v_pet_dog_id,
      v_family_id,
      'Rabies 3-Year',
      CURRENT_DATE - interval '6 months',
      CURRENT_DATE + interval '30 months',
      NULL,
      'Tag #R-883921 issued by Dr. Williams'
    ),
    (
      v_pet_cat_id,
      v_family_id,
      'FVRCP (Feline Distemper)',
      CURRENT_DATE - interval '8 months',
      CURRENT_DATE + interval '4 months',
      NULL,
      'Batch #FE-339'
    ),
    (
      v_pet_bunny_id,
      v_family_id,
      'RHDV2 Rabbit Hemorrhagic Disease',
      CURRENT_DATE - interval '11 months',
      CURRENT_DATE + interval '1 month',
      NULL,
      'Annual booster required'
    );

  -- 10. Checklists & Items
  -- Charlie: AI Routine
  INSERT INTO checklists (id, pet_id, family_id, title, type, source, start_date, end_date, created_by)
  VALUES (
    v_cl_dog_routine,
    v_pet_dog_id,
    v_family_id,
    'Charlie Daily Golden Retriever Care',
    'recurring',
    'ai_routine',
    CURRENT_DATE,
    NULL,
    v_admin_user_id
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO checklist_items (checklist_id, title, due_time, completed, sort_order)
  VALUES
    (v_cl_dog_routine, 'Check and refill fresh drinking water', '07:00', true, 1),
    (v_cl_dog_routine, 'Brush coat with undercoat de-shedder tool', '09:00', false, 2),
    (v_cl_dog_routine, 'Inspect paws and ears after walk', '12:00', false, 3),
    (v_cl_dog_routine, '15 minutes mental stimulation / puzzle feeder toy', '16:00', false, 4),
    (v_cl_dog_routine, 'Brush teeth with enzymatic paste', '20:30', false, 5);

  -- Charlie: Vet Medication Checklist (Time-limited)
  INSERT INTO checklists (id, pet_id, family_id, title, type, source, start_date, end_date, created_by)
  VALUES (
    v_cl_dog_meds,
    v_pet_dog_id,
    v_family_id,
    'Ear Infection Drops & Antibiotics',
    'time_limited',
    'ai_vet',
    CURRENT_DATE - interval '2 days',
    CURRENT_DATE + interval '5 days',
    v_admin_user_id
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO checklist_items (checklist_id, title, due_time, completed, sort_order)
  VALUES
    (v_cl_dog_meds, 'Morning Ear Drops (4 drops left ear)', '08:15', true, 1),
    (v_cl_dog_meds, 'Amoxicillin 250mg with breakfast meal', '08:20', true, 2),
    (v_cl_dog_meds, 'Evening Ear Drops (4 drops left ear)', '18:45', false, 3),
    (v_cl_dog_meds, 'Amoxicillin 250mg with dinner meal', '18:50', false, 4);

  -- Luna: Cat Care
  INSERT INTO checklists (id, pet_id, family_id, title, type, source, start_date, end_date, created_by)
  VALUES (
    v_cl_cat_care,
    v_pet_cat_id,
    v_family_id,
    'Luna Daily Wellness & Litter Box',
    'recurring',
    'manual',
    CURRENT_DATE,
    NULL,
    v_admin_user_id
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO checklist_items (checklist_id, title, due_time, completed, sort_order)
  VALUES
    (v_cl_cat_care, 'Scoop litter box and top up litter', '08:00', true, 1),
    (v_cl_cat_care, '10 minutes feather wand play', '14:00', false, 2),
    (v_cl_cat_care, 'Hairball prevention treat', '20:00', false, 3);

  -- 11. Activity Log
  INSERT INTO activity_log (family_id, pet_id, user_id, user_email, action, details, created_at)
  VALUES
    (v_family_id, v_pet_dog_id, v_admin_user_id, v_user_email, 'completed_task', '"Check and refill fresh drinking water" for Charlie', now() - interval '2 hours'),
    (v_family_id, v_pet_cat_id, v_admin_user_id, v_user_email, 'completed_task', '"Scoop litter box and top up litter" for Luna', now() - interval '1 hour'),
    (v_family_id, v_pet_dog_id, v_admin_user_id, v_user_email, 'completed_routine', '"Feed: 1.5 cups dry kibble" for Charlie', now() - interval '30 minutes');

END $$;
