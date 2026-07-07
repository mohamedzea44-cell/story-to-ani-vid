import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// -------- list episodes --------
export const listMyEpisodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("episodes")
      .select("id, series_title, episode_number, title, status, cover_image_url, target_duration_min, updated_at, share_slug")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// -------- create episode --------
export const createEpisode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        series_title: z.string().min(1).max(120),
        title: z.string().min(1).max(120),
        story_text: z.string().max(20000).default(""),
        language: z.enum(["ar", "en"]),
        style: z.string(),
        mood: z.string(),
        target_duration_min: z.number().int().min(5).max(60),
        episode_number: z.number().int().min(1).max(999),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("episodes")
      .insert({ ...data, user_id: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

// -------- get episode (with scenes + chars) --------
export const getEpisodeFull = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const [ep, sc, ch] = await Promise.all([
      context.supabase.from("episodes").select("*").eq("id", data.id).single(),
      context.supabase.from("scenes").select("*").eq("episode_id", data.id).order("order_index"),
      context.supabase.from("characters").select("*").eq("episode_id", data.id).order("created_at"),
    ]);
    if (ep.error) throw new Error(ep.error.message);
    return { episode: ep.data, scenes: sc.data ?? [], characters: ch.data ?? [] };
  });

// -------- update episode meta --------
export const updateEpisode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z.object({
          title: z.string().max(120).optional(),
          series_title: z.string().max(120).optional(),
          episode_number: z.number().int().min(1).max(999).optional(),
          story_text: z.string().max(20000).optional(),
          language: z.enum(["ar", "en"]).optional(),
          style: z.string().optional(),
          mood: z.string().optional(),
          voice_tone: z.string().max(40).optional(),
          sfx_style: z.string().max(40).optional(),
          target_duration_min: z.number().int().min(5).max(60).optional(),
          cover_image_url: z.string().url().nullable().optional(),
        }),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("episodes")
      .update({ ...data.patch, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- delete episode --------
export const deleteEpisode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("episodes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- publish episode --------
export const publishEpisode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    // pick cover from first scene image
    const { data: first } = await context.supabase
      .from("scenes")
      .select("image_url")
      .eq("episode_id", data.id)
      .order("order_index")
      .limit(1)
      .maybeSingle();
    const patch = {
      status: "published" as const,
      published_at: new Date().toISOString(),
      ...(first?.image_url ? { cover_image_url: first.image_url } : {}),
    };
    const { error } = await context.supabase.from("episodes").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    const { data: ep } = await context.supabase
      .from("episodes")
      .select("share_slug")
      .eq("id", data.id)
      .single();
    return { slug: ep!.share_slug };
  });

export const unpublishEpisode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("episodes")
      .update({ status: "draft" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- scenes CRUD --------
export const upsertScene = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        episode_id: z.string().uuid(),
        order_index: z.number().int().min(0),
        description: z.string().max(2000).default(""),
        narration: z.string().max(2000).default(""),
        dialogue: z.string().max(2000).default(""),
        character_id: z.string().uuid().nullable().optional(),
        character_name: z.string().max(80).nullable().optional(),
        duration_sec: z.number().int().min(2).max(120),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { error } = await context.supabase.from("scenes").update(data).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("scenes")
      .insert(data)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteScene = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("scenes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderScenes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ orders: z.array(z.object({ id: z.string().uuid(), order_index: z.number().int() })) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    for (const o of data.orders) {
      const { error } = await context.supabase
        .from("scenes")
        .update({ order_index: o.order_index })
        .eq("id", o.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// -------- characters --------
export const upsertCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        episode_id: z.string().uuid(),
        name: z.string().min(1).max(80),
        appearance_prompt: z.string().max(1000).default(""),
        voice: z.string().default("alloy"),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { error } = await context.supabase.from("characters").update(data).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("characters")
      .insert(data)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("characters").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
