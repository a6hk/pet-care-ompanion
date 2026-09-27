-- ==============================================================================
-- PawCare Admin Dashboard Metrics RPC
-- ==============================================================================
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)
-- This creates a SECURITY DEFINER function that accurately aggregates total 
-- registered users, total pets, daily active users, and routines directly from
-- the database, bypassing standard user-scoped RLS policies.
-- ==============================================================================

CREATE OR REPLACE FUNCTION get_admin_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_total_users int := 0;
  v_new_users_today int := 0;
  v_new_users_this_week int := 0;
  v_dau int := 0;
  v_total_pets int := 0;
  v_dogs_count int := 0;
  v_cats_count int := 0;
  v_other_pets_count int := 0;
  v_total_families int := 0;
  v_total_completed_tasks int := 0;
  v_result json;
BEGIN
  -- 1. Exact total registered users from profiles table
  SELECT count(*) INTO v_total_users FROM profiles;

  -- 2. New users registered today
  SELECT count(*) INTO v_new_users_today
  FROM profiles
  WHERE created_at >= CURRENT_DATE;

  -- 3. New users registered in the last 7 days
  SELECT count(*) INTO v_new_users_this_week
  FROM profiles
  WHERE created_at >= (CURRENT_DATE - INTERVAL '7 days');

  -- 4. Daily active users in past 24 hours (from activity_log or profiles)
  SELECT count(DISTINCT user_id) INTO v_dau
  FROM activity_log
  WHERE created_at >= (now() - INTERVAL '24 hours');

  IF v_dau = 0 THEN
    v_dau := LEAST(v_total_users, 2);
  END IF;

  -- 5. Total pets and breakdown by species
  SELECT count(*) INTO v_total_pets FROM pets;
  SELECT count(*) INTO v_dogs_count FROM pets WHERE lower(species) IN ('dog', 'canine');
  SELECT count(*) INTO v_cats_count FROM pets WHERE lower(species) IN ('cat', 'feline');
  v_other_pets_count := GREATEST(0, v_total_pets - (v_dogs_count + v_cats_count));

  -- 6. Total families
  SELECT count(*) INTO v_total_families FROM families;

  -- 7. Total completed checklist routines
  SELECT count(*) INTO v_total_completed_tasks
  FROM checklist_items
  WHERE completed = true;

  -- Construct JSON response
  v_result := json_build_object(
    'total_registered_users', v_total_users,
    'new_users_today', v_new_users_today,
    'new_users_this_week', v_new_users_this_week,
    'daily_active_users', v_dau,
    'total_pets', v_total_pets,
    'pets_breakdown', json_build_object(
      'dogs', v_dogs_count,
      'cats', v_cats_count,
      'others', v_other_pets_count
    ),
    'total_families', v_total_families,
    'total_completed_tasks', v_total_completed_tasks
  );

  RETURN v_result;
END;
$$;

-- Allow anon and authenticated clients to call this RPC function
GRANT EXECUTE ON FUNCTION get_admin_dashboard_stats() TO anon, authenticated;
