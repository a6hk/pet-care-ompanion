-- ==============================================================================
-- Function: reset_user_password_to_default
-- Resets the given user's password to the default 'Welc@me135246'
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
    encrypted_password = crypt('Welc@me135246', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
  WHERE id = v_user_id;

  RETURN true;
END;
$$;

-- Allow anon and authenticated roles to invoke this RPC function
GRANT EXECUTE ON FUNCTION reset_user_password_to_default(text) TO anon, authenticated;
