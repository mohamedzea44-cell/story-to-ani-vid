import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

const STYLE_PROMPTS: Record<string, string> = {
  "modern-shonen":
    "modern shonen anime style, vibrant colors, dynamic action lines, cinematic lighting, high detail",
  "shojo":
    "shojo anime style, soft pastel colors, delicate line art, sparkles, romantic atmosphere",
  "cyberpunk":
    "cyberpunk anime style, neon lights, dark alleys, rain, glowing signs, futuristic city",
  "ghibli":
    "studio ghibli inspired anime style, hand painted background, warm natural lighting, soft palette",
  "dark":
    "dark anime style, deep shadows, high contrast, dramatic lighting, moody atmosphere, seinen",
};

const SFX_PROMPTS: Record<string, string> = {
  cinematic: "cinematic ambient atmosphere with subtle orchestral swell and impactful whooshes suggested visually",
  retro: "retro 80s anime atmosphere, VHS grain feel, synthwave energy",
  epic: "epic battle atmosphere, dust particles, sparks, dramatic wind",
  minimal: "clean minimal atmosphere, quiet negative space, gentle ambient light",
  horror: "eerie tense atmosphere, cold color grading, unsettling shadows",
  comedic: "playful bright atmosphere, exaggerated expressions, cartoony sparkle",
};

const VOICE_TONE_INSTRUCTIONS: Record<string, string> = {
  natural: "Speak in a natural, clear, expressive voice suitable for anime narration.",
  calm: "Speak in a calm, soft, gentle tone. Slow pace, warm and reassuring.",
  dramatic: "Speak with intense dramatic emotion, strong emphasis, cinematic weight.",
  energetic: "Speak with high energy, fast pace, excitement and enthusiasm — shonen anime style.",
  whisper: "Speak in a quiet, intimate whisper — suspenseful and close-mic.",
  heroic: "Speak in a bold, confident, heroic tone — determined and powerful.",
  mysterious: "Speak in a low, mysterious, intriguing tone — measured and secretive.",
  sad: "Speak in a soft, melancholic, tender tone — emotional and vulnerable.",
};

// ---------- Split & expand story into scenes ----------
export const splitStoryIntoScenes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ episodeId: z.string().uuid(), replace: z.boolean().default(true) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { data: ep, error } = await context.supabase
      .from("episodes")
      .select("*")
      .eq("id", data.episodeId)
      .single();
    if (error || !ep) throw new Error(error?.message ?? "Episode not found");

    const targetSec = ep.target_duration_min * 60;
    const approxScenes = Math.max(12, Math.round(targetSec / 12));
    const lang = ep.language === "ar" ? "Arabic" : "English";

    const sys = `You are an anime episode director. Turn the user story into a detailed scene list for a ${ep.target_duration_min}-minute anime episode.
Rules:
- Output MUST be valid JSON matching the schema.
- Produce ~${approxScenes} scenes so total duration_sec ≈ ${targetSec}.
- Each scene has a vivid visual "description" (English, for image generation), plus "narration" and "dialogue" in ${lang}.
- Identify recurring characters and give each a short "appearance_prompt" (English, physical look for consistent image generation).
- Assign scene.character_name = name of the character speaking dialogue, or null for pure narration.
- If the story is short, expand it into a full arc that fills the duration.`;

    const schema = {
      type: "object",
      properties: {
        characters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              appearance_prompt: { type: "string" },
            },
            required: ["name", "appearance_prompt"],
          },
        },
        scenes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              narration: { type: "string" },
              dialogue: { type: "string" },
              character_name: { type: ["string", "null"] },
              duration_sec: { type: "integer", minimum: 4, maximum: 30 },
            },
            required: ["description", "narration", "dialogue", "character_name", "duration_sec"],
          },
        },
      },
      required: ["characters", "scenes"],
    };

    const res = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content: `Story:\n${ep.story_text || "(the user left the story blank — invent a compelling one that matches the mood)"}\n\nStyle: ${ep.style}\nMood: ${ep.mood}\nSFX/Atmosphere style: ${(ep as { sfx_style?: string }).sfx_style ?? "cinematic"}\nVoice tone for narration: ${(ep as { voice_tone?: string }).voice_tone ?? "natural"}\nLanguage of narration/dialogue: ${lang}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "episode_script", schema, strict: true },
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("تجاوزت الحد المسموح، جرّب بعد قليل");
      if (res.status === 402) throw new Error("رصيد الذكاء الاصطناعي انتهى، الرجاء إضافة رصيد");
      throw new Error(`AI split failed: ${res.status} ${text}`);
    }
    const j = await res.json();
    const content = j.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");
    const parsed = JSON.parse(content) as {
      characters: { name: string; appearance_prompt: string }[];
      scenes: {
        description: string;
        narration: string;
        dialogue: string;
        character_name: string | null;
        duration_sec: number;
      }[];
    };

    // Replace existing scenes/chars
    if (data.replace) {
      await context.supabase.from("scenes").delete().eq("episode_id", data.episodeId);
      await context.supabase.from("characters").delete().eq("episode_id", data.episodeId);
    }

    const voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
    const charInserts = parsed.characters.map((c, i) => ({
      episode_id: data.episodeId,
      name: c.name,
      appearance_prompt: c.appearance_prompt,
      voice: voices[i % voices.length],
    }));
    let charMap: Record<string, string> = {};
    if (charInserts.length) {
      const { data: chars, error: cErr } = await context.supabase
        .from("characters")
        .insert(charInserts)
        .select("id, name");
      if (cErr) throw new Error(cErr.message);
      charMap = Object.fromEntries((chars ?? []).map((c) => [c.name, c.id]));
    }

    const sceneInserts = parsed.scenes.map((s, i) => ({
      episode_id: data.episodeId,
      order_index: i,
      description: s.description,
      narration: s.narration,
      dialogue: s.dialogue,
      character_name: s.character_name,
      character_id: s.character_name ? (charMap[s.character_name] ?? null) : null,
      duration_sec: s.duration_sec,
    }));
    if (sceneInserts.length) {
      const { error: sErr } = await context.supabase.from("scenes").insert(sceneInserts);
      if (sErr) throw new Error(sErr.message);
    }

    await context.supabase
      .from("episodes")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.episodeId);

    return { characters: parsed.characters.length, scenes: parsed.scenes.length };
  });

// ---------- Generate one scene image ----------
export const generateSceneImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ sceneId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { data: scene, error } = await context.supabase
      .from("scenes")
      .select("id, episode_id, description, character_id")
      .eq("id", data.sceneId)
      .single();
    if (error || !scene) throw new Error("Scene not found");

    const { data: ep } = await context.supabase
      .from("episodes")
      .select("style, mood, user_id, sfx_style")
      .eq("id", scene.episode_id)
      .single();
    if (!ep) throw new Error("Episode not found");

    let charLook = "";
    if (scene.character_id) {
      const { data: ch } = await context.supabase
        .from("characters")
        .select("appearance_prompt, name")
        .eq("id", scene.character_id)
        .single();
      if (ch) charLook = `Featured character: ${ch.name} — ${ch.appearance_prompt}. `;
    }

    const stylePrompt = STYLE_PROMPTS[ep.style] ?? STYLE_PROMPTS["modern-shonen"];
    const sfxKey = (ep as { sfx_style?: string }).sfx_style ?? "cinematic";
    const sfxPrompt = SFX_PROMPTS[sfxKey] ?? SFX_PROMPTS.cinematic;
    const prompt = `${stylePrompt}. Mood: ${ep.mood}. Atmosphere: ${sfxPrompt}. ${charLook}Scene: ${scene.description}. Widescreen 16:9 cinematic composition, anime keyframe quality, no text or watermarks.`;

    await context.supabase
      .from("scenes")
      .update({ image_status: "generating" })
      .eq("id", scene.id);

    const res = await fetch(`${GATEWAY}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        prompt,
      }),
    });

    if (!res.ok) {
      await context.supabase
        .from("scenes")
        .update({ image_status: "failed" })
        .eq("id", scene.id);
      const t = await res.text();
      if (res.status === 429) throw new Error("تجاوزت الحد، انتظر قليلاً");
      if (res.status === 402) throw new Error("رصيد AI انتهى");
      throw new Error(`Image gen failed: ${res.status} ${t}`);
    }
    const j = await res.json();
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image returned");

    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const path = `${ep.user_id}/scenes/${scene.id}.png`;
    const { error: upErr } = await context.supabase.storage
      .from("episode-assets")
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (upErr) throw new Error(upErr.message);

    const { data: signed } = await context.supabase.storage
      .from("episode-assets")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    const url = signed?.signedUrl;
    if (!url) throw new Error("Sign URL failed");

    await context.supabase
      .from("scenes")
      .update({ image_url: url, image_status: "ready" })
      .eq("id", scene.id);
    return { url };
  });

// ---------- Generate scene audio (TTS) ----------
export const generateSceneAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ sceneId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { data: scene, error } = await context.supabase
      .from("scenes")
      .select("id, episode_id, narration, dialogue, character_id")
      .eq("id", data.sceneId)
      .single();
    if (error || !scene) throw new Error("Scene not found");

    const { data: ep } = await context.supabase
      .from("episodes")
      .select("user_id, voice_tone")
      .eq("id", scene.episode_id)
      .single();
    if (!ep) throw new Error("Episode not found");

    let voice = "alloy";
    if (scene.character_id) {
      const { data: ch } = await context.supabase
        .from("characters")
        .select("voice")
        .eq("id", scene.character_id)
        .single();
      if (ch?.voice) voice = ch.voice;
    }

    const text = [scene.narration, scene.dialogue].filter(Boolean).join("\n\n").trim();
    if (!text) throw new Error("لا يوجد نص لتوليد الصوت");

    const toneKey = (ep as { voice_tone?: string }).voice_tone ?? "natural";
    const instructions = VOICE_TONE_INSTRUCTIONS[toneKey] ?? VOICE_TONE_INSTRUCTIONS.natural;

    await context.supabase
      .from("scenes")
      .update({ audio_status: "generating" })
      .eq("id", scene.id);

    const res = await fetch(`${GATEWAY}/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: text,
        voice,
        instructions,
        response_format: "mp3",
      }),
    });

    if (!res.ok) {
      await context.supabase.from("scenes").update({ audio_status: "failed" }).eq("id", scene.id);
      const t = await res.text();
      if (res.status === 429) throw new Error("تجاوزت الحد، انتظر قليلاً");
      if (res.status === 402) throw new Error("رصيد AI انتهى");
      throw new Error(`TTS failed: ${res.status} ${t}`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    const path = `${ep.user_id}/audio/${scene.id}.mp3`;
    const { error: upErr } = await context.supabase.storage
      .from("episode-assets")
      .upload(path, buf, { contentType: "audio/mpeg", upsert: true });
    if (upErr) throw new Error(upErr.message);

    const { data: signed } = await context.supabase.storage
      .from("episode-assets")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    const url = signed?.signedUrl;
    if (!url) throw new Error("Sign URL failed");

    await context.supabase
      .from("scenes")
      .update({ audio_url: url, audio_status: "ready" })
      .eq("id", scene.id);
    return { url };
  });

// ---------- Generate real animated video clip via Runway ML ----------
const RUNWAY_API = "https://api.dev.runwayml.com/v1";
const RUNWAY_VERSION = "2024-11-06";

async function runwayPoll(taskId: string, key: string): Promise<string> {
  const started = Date.now();
  // Poll up to ~4 minutes
  while (Date.now() - started < 4 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetch(`${RUNWAY_API}/tasks/${taskId}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        "X-Runway-Version": RUNWAY_VERSION,
      },
    });
    if (!res.ok) throw new Error(`Runway poll failed: ${res.status} ${await res.text()}`);
    const j = (await res.json()) as {
      status: string;
      output?: string[];
      failure?: string;
      failureCode?: string;
    };
    if (j.status === "SUCCEEDED" && j.output?.[0]) return j.output[0];
    if (j.status === "FAILED" || j.status === "CANCELLED")
      throw new Error(`Runway task ${j.status}: ${j.failure ?? j.failureCode ?? "unknown"}`);
  }
  throw new Error("Runway timeout — استغرق الفيديو وقتاً طويلاً");
}

export const generateSceneVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ sceneId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const key = process.env.RUNWAYML_API_SECRET;
    if (!key) throw new Error("Missing RUNWAYML_API_SECRET — أضف مفتاح Runway ML");

    const { data: scene, error } = await context.supabase
      .from("scenes")
      .select("id, episode_id, description, image_url, duration_sec, character_id")
      .eq("id", data.sceneId)
      .single();
    if (error || !scene) throw new Error("Scene not found");
    if (!scene.image_url) throw new Error("لازم تولّد صورة المشهد الأول");

    const { data: ep } = await context.supabase
      .from("episodes")
      .select("style, mood, user_id, sfx_style")
      .eq("id", scene.episode_id)
      .single();
    if (!ep) throw new Error("Episode not found");

    const stylePrompt = STYLE_PROMPTS[ep.style] ?? STYLE_PROMPTS["modern-shonen"];
    const sfxKey = (ep as { sfx_style?: string }).sfx_style ?? "cinematic";
    const sfxPrompt = SFX_PROMPTS[sfxKey] ?? SFX_PROMPTS.cinematic;
    const motionPrompt = `${stylePrompt}. ${sfxPrompt}. Scene motion: ${scene.description}. Smooth cinematic camera movement, subtle character animation, dynamic anime motion.`.slice(0, 900);

    // Runway gen4_turbo accepts duration 5 or 10 seconds
    const duration = scene.duration_sec >= 8 ? 10 : 5;

    await context.supabase
      .from("scenes")
      .update({ video_status: "generating" })
      .eq("id", scene.id);

    const createRes = await fetch(`${RUNWAY_API}/image_to_video`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "X-Runway-Version": RUNWAY_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gen4_turbo",
        promptImage: scene.image_url,
        promptText: motionPrompt,
        duration,
        ratio: "1280:720",
      }),
    });

    if (!createRes.ok) {
      await context.supabase.from("scenes").update({ video_status: "failed" }).eq("id", scene.id);
      const t = await createRes.text();
      if (createRes.status === 401) throw new Error("Runway API key غير صحيح");
      if (createRes.status === 429) throw new Error("Runway rate limit — انتظر قليلاً");
      throw new Error(`Runway create failed: ${createRes.status} ${t}`);
    }
    const created = (await createRes.json()) as { id: string };
    await context.supabase
      .from("scenes")
      .update({ video_task_id: created.id })
      .eq("id", scene.id);

    let videoUrl: string;
    try {
      videoUrl = await runwayPoll(created.id, key);
    } catch (e) {
      await context.supabase.from("scenes").update({ video_status: "failed" }).eq("id", scene.id);
      throw e;
    }

    // Download the mp4 and store in Supabase for a stable long-lived URL
    const dl = await fetch(videoUrl);
    if (!dl.ok) throw new Error(`Download failed: ${dl.status}`);
    const buf = new Uint8Array(await dl.arrayBuffer());
    const path = `${ep.user_id}/video/${scene.id}.mp4`;
    const { error: upErr } = await context.supabase.storage
      .from("episode-assets")
      .upload(path, buf, { contentType: "video/mp4", upsert: true });
    if (upErr) throw new Error(upErr.message);

    const { data: signed } = await context.supabase.storage
      .from("episode-assets")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    const url = signed?.signedUrl;
    if (!url) throw new Error("Sign URL failed");

    await context.supabase
      .from("scenes")
      .update({ video_url: url, video_status: "ready" })
      .eq("id", scene.id);
    return { url };
  });
