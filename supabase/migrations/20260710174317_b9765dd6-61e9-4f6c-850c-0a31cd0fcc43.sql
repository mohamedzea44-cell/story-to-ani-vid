ALTER TABLE public.scenes 
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS video_status TEXT DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS video_task_id TEXT;

ALTER TABLE public.episodes
  ADD COLUMN IF NOT EXISTS video_generation_enabled BOOLEAN NOT NULL DEFAULT true;