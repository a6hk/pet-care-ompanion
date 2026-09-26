-- ==============================================================================
-- Reset User Password to Default: Welcome1
-- ==============================================================================
-- Run this query in Supabase SQL Editor anytime you want to reset all users
-- (or a specific user) to the password: Welcome1
-- ==============================================================================

-- 1. Reset all users (or filter by WHERE email = 'your-email@example.com')
UPDATE auth.users
SET 
  encrypted_password = crypt('Welcome1', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  updated_at = now();

-- Verify updated users
SELECT id, email, email_confirmed_at, updated_at FROM auth.users;

-- ==============================================================================
-- 2. Function for Login Page "Reset Password" button (RPC)
-- Run this in SQL Editor once so the login page can reset passwords to default
-- ==============================================================================
CREATE OR REPLACE FUNCTION reset_user_password_to_default(target_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_normalized_email text := lower(trim(target_email));
  v_user_id uuid;
BEGIN
  IF v_normalized_email IS NULL OR v_normalized_email = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(trim(email)) = v_normalized_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No account found with this email';
  END IF;

  UPDATE auth.users
  SET 
    encrypted_password = crypt('Welcome1', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
  WHERE id = v_user_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION reset_user_password_to_default(text) TO anon, authenticated;

