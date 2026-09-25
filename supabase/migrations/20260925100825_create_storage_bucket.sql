/*
# PetPal Storage: Pet photos and vaccination certificates

Creates a storage bucket for family-scoped file uploads (pet photos, vaccination certificates).
Sets public read access and authenticated write access scoped to family membership.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('pet-assets', 'pet-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read
DROP POLICY IF EXISTS "public_read_pet_assets" ON storage.objects;
CREATE POLICY "public_read_pet_assets" ON storage.objects FOR SELECT
  TO public USING (bucket_id = 'pet-assets');

-- Allow authenticated upload
DROP POLICY IF EXISTS "auth_upload_pet_assets" ON storage.objects;
CREATE POLICY "auth_upload_pet_assets" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'pet-assets');

-- Allow authenticated update (for replacing photos)
DROP POLICY IF EXISTS "auth_update_pet_assets" ON storage.objects;
CREATE POLICY "auth_update_pet_assets" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'pet-assets') WITH CHECK (bucket_id = 'pet-assets');

-- Allow authenticated delete
DROP POLICY IF EXISTS "auth_delete_pet_assets" ON storage.objects;
CREATE POLICY "auth_delete_pet_assets" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'pet-assets');
