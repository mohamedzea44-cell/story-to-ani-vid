import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Public read for /watch/$slug — uses publishable key + anon RLS policy
export const getPublicEpisode = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => z.object({ slug: z.string().min(1) }).parse(v))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } },
    );
    const { data: ep, error } = await client
      .from("episodes")
      .select("id, series_title, episode_number, title, language, cover_image_url, share_slug")
      .eq("share_slug", data.slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ep) return null;
    const [{ data: scenes }, { data: chars }] = await Promise.all([
      client
        .from("scenes")
        .select("id, order_index, narration, dialogue, character_name, duration_sec, image_url, audio_url, video_url")
        .eq("episode_id", ep.id)
        .order("order_index"),
      client.from("characters").select("id, name").eq("episode_id", ep.id),
    ]);
    return { episode: ep, scenes: scenes ?? [], characters: chars ?? [] };
  });
