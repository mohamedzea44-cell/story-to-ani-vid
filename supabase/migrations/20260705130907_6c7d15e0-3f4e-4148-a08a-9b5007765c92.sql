
-- ============ profiles ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ episodes ============
CREATE TABLE public.episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  series_title TEXT NOT NULL DEFAULT 'My Anime',
  episode_number INT NOT NULL DEFAULT 1,
  title TEXT NOT NULL DEFAULT 'Untitled Episode',
  story_text TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'ar',
  style TEXT NOT NULL DEFAULT 'modern-shonen',
  mood TEXT NOT NULL DEFAULT 'action',
  target_duration_min INT NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'draft',
  share_slug TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(6),'hex'),
  cover_image_url TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.episodes TO authenticated;
GRANT SELECT ON public.episodes TO anon;
GRANT ALL ON public.episodes TO service_role;
ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own episodes all" ON public.episodes FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "published episodes public read" ON public.episodes FOR SELECT TO anon
  USING (status = 'published');
CREATE POLICY "published episodes auth read" ON public.episodes FOR SELECT TO authenticated
  USING (status = 'published' OR auth.uid() = user_id);
CREATE INDEX episodes_user_idx ON public.episodes(user_id, created_at DESC);
CREATE INDEX episodes_slug_idx ON public.episodes(share_slug);

-- ============ characters ============
CREATE TABLE public.characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  appearance_prompt TEXT NOT NULL DEFAULT '',
  voice TEXT NOT NULL DEFAULT 'alloy',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.characters TO authenticated;
GRANT SELECT ON public.characters TO anon;
GRANT ALL ON public.characters TO service_role;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own characters all" ON public.characters FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.episodes e WHERE e.id = episode_id AND e.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.episodes e WHERE e.id = episode_id AND e.user_id = auth.uid()));
CREATE POLICY "characters public read" ON public.characters FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.episodes e WHERE e.id = episode_id AND e.status = 'published'));

-- ============ scenes ============
CREATE TABLE public.scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  order_index INT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  narration TEXT NOT NULL DEFAULT '',
  dialogue TEXT NOT NULL DEFAULT '',
  character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
  character_name TEXT,
  duration_sec INT NOT NULL DEFAULT 10,
  image_url TEXT,
  audio_url TEXT,
  image_status TEXT NOT NULL DEFAULT 'pending',
  audio_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenes TO authenticated;
GRANT SELECT ON public.scenes TO anon;
GRANT ALL ON public.scenes TO service_role;
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own scenes all" ON public.scenes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.episodes e WHERE e.id = episode_id AND e.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.episodes e WHERE e.id = episode_id AND e.user_id = auth.uid()));
CREATE POLICY "scenes public read" ON public.scenes FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.episodes e WHERE e.id = episode_id AND e.status = 'published'));
CREATE INDEX scenes_episode_idx ON public.scenes(episode_id, order_index);

-- storage policies for episode-assets (public bucket)
CREATE POLICY "own upload episode-assets" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'episode-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own update episode-assets" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'episode-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own delete episode-assets" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'episode-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
