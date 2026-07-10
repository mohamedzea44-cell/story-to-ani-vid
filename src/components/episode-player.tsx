import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipForward, SkipBack } from "lucide-react";

export type PlayerScene = {
  id: string;
  narration: string;
  dialogue: string;
  character_name: string | null;
  duration_sec: number;
  image_url: string | null;
  audio_url: string | null;
  video_url?: string | null;
};

export function EpisodePlayer({
  scenes,
  title,
  autoplay = false,
}: {
  scenes: PlayerScene[];
  title?: string;
  autoplay?: boolean;
}) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(autoplay);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scene = scenes[idx];

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!playing || !scene) return;
    // If audio present, wait for audio 'ended' event; otherwise fall back to duration timer
    if (scene.audio_url && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
    // Failsafe: advance after duration_sec regardless
    const ms = Math.max(2, scene.duration_sec) * 1000;
    timerRef.current = setTimeout(() => {
      setIdx((i) => (i + 1 < scenes.length ? i + 1 : i));
    }, ms);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [idx, playing, scene, scenes.length]);

  useEffect(() => {
    if (!playing && audioRef.current) audioRef.current.pause();
  }, [playing]);

  if (!scene) return <div className="text-center text-muted-foreground">لا توجد مشاهد</div>;

  const atEnd = idx === scenes.length - 1;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
        {scene.image_url ? (
          <img
            src={scene.image_url}
            alt=""
            className="size-full object-cover transition-opacity duration-700"
            style={{
              transform: "scale(1.05)",
              animation: playing ? "kenburns 12s ease-in-out infinite alternate" : "none",
            }}
          />
        ) : (
          <div className="grid size-full place-items-center text-muted-foreground">
            مشهد بدون صورة
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-6 pt-16">
          {scene.character_name && (
            <div className="mb-1 text-sm font-semibold text-[color:var(--gold)]">
              {scene.character_name}
            </div>
          )}
          {scene.dialogue && (
            <div className="text-lg font-medium text-white md:text-xl">« {scene.dialogue} »</div>
          )}
          {scene.narration && (
            <div className="mt-2 text-sm text-white/80 md:text-base">{scene.narration}</div>
          )}
        </div>
        {title && (
          <div className="absolute top-4 right-4 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
            {title}
          </div>
        )}
        <audio ref={audioRef} src={scene.audio_url ?? undefined} preload="auto" />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          مشهد {idx + 1} / {scenes.length}
        </div>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>
            <SkipBack className="size-4" />
          </Button>
          <Button size="icon" className="glow" onClick={() => setPlaying((p) => !p)}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={() => {
              if (atEnd) {
                setIdx(0);
                setPlaying(true);
              } else setIdx((i) => i + 1);
            }}
          >
            <SkipForward className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${((idx + 1) / scenes.length) * 100}%` }}
        />
      </div>

      <style>{`
        @keyframes kenburns {
          0% { transform: scale(1.02) translate(0,0); }
          100% { transform: scale(1.12) translate(-2%, -1%); }
        }
      `}</style>
    </div>
  );
}
