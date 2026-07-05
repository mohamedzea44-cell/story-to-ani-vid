
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- storage: public read for all objects in episode-assets bucket (bucket itself is private but we sign URLs; simpler: allow anon read)
CREATE POLICY "public read episode-assets" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'episode-assets');
