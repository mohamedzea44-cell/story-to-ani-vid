import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  getEpisodeFull,
  updateEpisode,
  upsertScene,
  deleteScene,
  upsertCharacter,
  deleteCharacter,
  publishEpisode,
  unpublishEpisode,
} from "@/lib/episodes.functions";
import {
  splitStoryIntoScenes,
  generateSceneImage,
  generateSceneAudio,
  generateSceneVideo,
} from "@/lib/ai.functions";
import { AppHeader } from "@/components/app-header";
import { EpisodePlayer } from "@/components/episode-player";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  ImageIcon,
  Mic,
  Trash2,
  Play,
  Share2,
  Copy,
  Plus,
  ArrowRight,
  Wand2,
  CheckCircle2,
  Video,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/episodes/$id")({
  component: EditorPage,
});

const VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

function EditorPage() {
  const { id } = useParams({ from: "/_authenticated/episodes/$id" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getEpisodeFull);
  const updateFn = useServerFn(updateEpisode);
  const splitFn = useServerFn(splitStoryIntoScenes);
  const upsertSceneFn = useServerFn(upsertScene);
  const deleteSceneFn = useServerFn(deleteScene);
  const upsertCharFn = useServerFn(upsertCharacter);
  const deleteCharFn = useServerFn(deleteCharacter);
  const imgFn = useServerFn(generateSceneImage);
  const audFn = useServerFn(generateSceneAudio);
  const vidFn = useServerFn(generateSceneVideo);
  const publishFn = useServerFn(publishEpisode);
  const unpublishFn = useServerFn(unpublishEpisode);

  const { data, isLoading } = useQuery({
    queryKey: ["episode", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const refetch = () => qc.invalidateQueries({ queryKey: ["episode", id] });

  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState<{
    title: string;
    series_title: string;
    episode_number: number;
    story_text: string;
    style: string;
    mood: string;
    voice_tone: string;
    sfx_style: string;
    language: "ar" | "en";
    target_duration_min: number;
  } | null>(null);

  // Initialize local meta once
  if (data?.episode && !meta) {
    const ep = data.episode as typeof data.episode & { voice_tone?: string; sfx_style?: string };
    setMeta({
      title: ep.title,
      series_title: ep.series_title,
      episode_number: ep.episode_number,
      story_text: ep.story_text,
      style: ep.style,
      mood: ep.mood,
      voice_tone: ep.voice_tone ?? "natural",
      sfx_style: ep.sfx_style ?? "cinematic",
      language: ep.language as "ar" | "en",
      target_duration_min: ep.target_duration_min,
    });
  }

  async function saveMeta() {
    if (!meta) return;
    setSaving(true);
    try {
      await updateFn({ data: { id, patch: meta } });
      toast.success("تم الحفظ");
      refetch();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  }

  const split = useMutation({
    mutationFn: () => splitFn({ data: { episodeId: id, replace: true } }),
    onSuccess: (r) => {
      toast.success(`تم إنشاء ${r.scenes} مشهد و ${r.characters} شخصية`);
      refetch();
    },
    onError: (e) => toast.error(String(e)),
  });

  const publish = useMutation({
    mutationFn: () => publishFn({ data: { id } }),
    onSuccess: ({ slug }) => {
      toast.success("تم النشر!");
      navigator.clipboard?.writeText(`${window.location.origin}/watch/${slug}`);
      refetch();
    },
    onError: (e) => toast.error(String(e)),
  });

  const unpublish = useMutation({
    mutationFn: () => unpublishFn({ data: { id } }),
    onSuccess: () => {
      toast.success("رجعت للمسودة");
      refetch();
    },
  });

  // ---- Auto-studio: one-click full generation with progress ----
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoLabel, setAutoLabel] = useState("");
  const [autoDone, setAutoDone] = useState(0);
  const [autoTotal, setAutoTotal] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [publishingFromReview, setPublishingFromReview] = useState(false);

  async function autoGenerate() {
    if (!meta) return;
    setAutoBusy(true);
    setAutoDone(0);
    setAutoTotal(0);
    try {
      // 1) Save current settings
      setAutoLabel("حفظ الإعدادات…");
      await updateFn({ data: { id, patch: meta } });

      // 2) Split story if no scenes yet
      let currentScenes = data?.scenes ?? [];
      if (currentScenes.length === 0) {
        setAutoLabel("تحليل القصة وتقسيمها لمشاهد…");
        await splitFn({ data: { episodeId: id, replace: true } });
        const fresh = await getFn({ data: { id } });
        currentScenes = fresh.scenes;
        qc.setQueryData(["episode", id], fresh);
      }

      const needImg = currentScenes.filter((s) => !s.image_url);
      const needAud = currentScenes.filter((s) => !s.audio_url);
      // Refetch after images to know which scenes need video (need image_url first)
      const total = needImg.length + needAud.length + currentScenes.length + 1;
      setAutoTotal(total);

      // 3) Images
      for (let i = 0; i < needImg.length; i++) {
        const s = needImg[i];
        setAutoLabel(`توليد صورة المشهد ${s.order_index + 1} (${i + 1}/${needImg.length})`);
        try {
          await imgFn({ data: { sceneId: s.id } });
        } catch (e) {
          toast.error(`صورة مشهد ${s.order_index + 1}: ${String(e)}`);
        }
        setAutoDone((d) => d + 1);
      }

      // 4) Audio
      for (let i = 0; i < needAud.length; i++) {
        const s = needAud[i];
        setAutoLabel(`توليد صوت المشهد ${s.order_index + 1} (${i + 1}/${needAud.length})`);
        try {
          await audFn({ data: { sceneId: s.id } });
        } catch (e) {
          toast.error(`صوت مشهد ${s.order_index + 1}: ${String(e)}`);
        }
        setAutoDone((d) => d + 1);
      }

      // 5) Video clips (Runway) — needs image already done
      const refreshed = await getFn({ data: { id } });
      qc.setQueryData(["episode", id], refreshed);
      const needVid = refreshed.scenes.filter(
        (s: { image_url: string | null; video_url?: string | null }) =>
          s.image_url && !s.video_url,
      );
      for (let i = 0; i < needVid.length; i++) {
        const s = needVid[i];
        setAutoLabel(`تحريك فيديو المشهد ${s.order_index + 1} (${i + 1}/${needVid.length}) — قد يستغرق دقيقتين`);
        try {
          await vidFn({ data: { sceneId: s.id } });
        } catch (e) {
          toast.error(`فيديو مشهد ${s.order_index + 1}: ${String(e)}`);
        }
        setAutoDone((d) => d + 1);
      }


      // 5) Refresh and open review — user decides draft vs publish
      setAutoLabel("تجهيز المراجعة…");
      setAutoDone((d) => d + 1);
      await refetch();
      setReviewOpen(true);
      toast.success("جاهز للمراجعة — شاهد الحلقة ثم اختر حفظ كمسودة أو نشر");
    } catch (e) {
      toast.error(`خطأ: ${String(e)}`);
    } finally {
      setAutoBusy(false);
      setAutoLabel("");
    }
  }


  if (isLoading || !data || !meta) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <div className="mx-auto max-w-6xl px-6 py-8">
          <Loader2 className="size-6 animate-spin" />
        </div>
      </div>
    );
  }

  const scenesReady = data.scenes.filter((s) => s.image_url && s.audio_url).length;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <Link
              to="/dashboard"
              className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowRight className="size-3" />
              حلقاتي
            </Link>
            <h1 className="text-2xl font-bold">{meta.title}</h1>
            <p className="text-sm text-muted-foreground">
              {data.scenes.length} مشهد · {scenesReady} جاهز · {data.characters.length} شخصية
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate({ to: "/episodes/$id/preview", params: { id } })}>
              <Play className="ml-2 size-4" />
              معاينة
            </Button>
            <Button
              variant="outline"
              onClick={() => setReviewOpen(true)}
              disabled={scenesReady === 0}
            >
              <CheckCircle2 className="ml-2 size-4" />
              مراجعة
            </Button>
            {data.episode.status === "published" ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    const url = `${window.location.origin}/watch/${data.episode.share_slug}`;
                    navigator.clipboard?.writeText(url);
                    toast.success("تم نسخ الرابط");
                  }}
                >
                  <Copy className="ml-2 size-4" />
                  نسخ رابط المشاركة
                </Button>
                <Button variant="ghost" onClick={() => unpublish.mutate()}>
                  إلغاء النشر
                </Button>
              </>
            ) : (
              <Button className="glow" onClick={() => publish.mutate()} disabled={publish.isPending || scenesReady === 0}>
                <Share2 className="ml-2 size-4" />
                نشر
              </Button>
            )}
          </div>
        </div>

        {/* ===== Auto Studio ===== */}
        <div className="mb-6 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-primary/20 text-primary">
                <Wand2 className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold">توليد الحلقة كاملة تلقائياً</h2>
                <p className="text-xs text-muted-foreground">
                  زر واحد يُحلّل القصة، يُنشئ المشاهد والشخصيات، يُولّد كل الصور والأصوات، وينشر الحلقة مع رابط جاهز للمشاركة.
                </p>
              </div>
            </div>
            <Button size="lg" className="glow" onClick={autoGenerate} disabled={autoBusy}>
              {autoBusy ? (
                <Loader2 className="ml-2 size-4 animate-spin" />
              ) : (
                <Wand2 className="ml-2 size-4" />
              )}
              {autoBusy ? "جاري التوليد…" : "ابدأ التوليد التلقائي"}
            </Button>
          </div>

          {autoBusy && (
            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{autoLabel || "…"}</span>
                <span className="text-muted-foreground">
                  {autoTotal > 0 ? `${autoDone} / ${autoTotal}` : ""}
                </span>
              </div>
              <Progress value={autoTotal > 0 ? (autoDone / autoTotal) * 100 : 5} />
              <p className="text-[11px] text-muted-foreground">
                لا تغلق الصفحة — العملية قد تستغرق عدة دقائق حسب طول الحلقة.
              </p>
            </div>
          )}
        </div>

        {/* ===== Share Dialog ===== */}
        <Dialog open={shareOpen} onOpenChange={setShareOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-primary" />
                الحلقة جاهزة!
              </DialogTitle>
              <DialogDescription>
                تم نشر الحلقة وإنشاء رابط مشاركة عام. أي شخص يفتح الرابط سيشاهد الحلقة مباشرة.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input readOnly value={shareUrl} className="font-mono text-xs" />
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard?.writeText(shareUrl);
                    toast.success("تم النسخ");
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="secondary">
                  <a href={shareUrl} target="_blank" rel="noreferrer">
                    <Play className="ml-2 size-4" />
                    فتح صفحة المشاهدة
                  </a>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const text = `شاهد حلقة الأنمي: ${meta?.title ?? ""}`;
                    const wa = `https://wa.me/?text=${encodeURIComponent(`${text}\n${shareUrl}`)}`;
                    window.open(wa, "_blank");
                  }}
                >
                  مشاركة واتساب
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const t = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`شاهد حلقة الأنمي: ${meta?.title ?? ""}`)}&url=${encodeURIComponent(shareUrl)}`;
                    window.open(t, "_blank");
                  }}
                >
                  مشاركة X
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ===== Review Dialog ===== */}
        <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-primary" />
                مراجعة الحلقة قبل النشر
              </DialogTitle>
              <DialogDescription>
                شاهد الحلقة كاملة ثم اختر: احفظها كمسودة للتعديل لاحقاً، أو انشرها الآن واحصل على رابط المشاركة.
              </DialogDescription>
            </DialogHeader>

            {data.scenes.filter((s) => s.image_url || s.audio_url).length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                لا توجد مشاهد جاهزة للمراجعة بعد.
              </div>
            ) : (
              <EpisodePlayer
                title={meta.title}
                scenes={data.scenes.map((s) => ({
                  id: s.id,
                  narration: s.narration,
                  dialogue: s.dialogue,
                  character_name: s.character_name,
                  duration_sec: s.duration_sec,
                  image_url: s.image_url,
                  audio_url: s.audio_url,
                }))}
              />
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
              <div className="text-xs text-muted-foreground">
                {scenesReady} من {data.scenes.length} مشهد جاهز
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (data.episode.status === "published") {
                      await unpublishFn({ data: { id } });
                      toast.success("تم الحفظ كمسودة");
                      refetch();
                    } else {
                      toast.success("محفوظة كمسودة");
                    }
                    setReviewOpen(false);
                  }}
                >
                  حفظ كمسودة
                </Button>
                <Button
                  className="glow"
                  disabled={publishingFromReview || scenesReady === 0}
                  onClick={async () => {
                    setPublishingFromReview(true);
                    try {
                      const { slug } = await publishFn({ data: { id } });
                      const url = `${window.location.origin}/watch/${slug}`;
                      setShareUrl(url);
                      try { await navigator.clipboard?.writeText(url); } catch { /* ignore */ }
                      setReviewOpen(false);
                      setShareOpen(true);
                      refetch();
                    } catch (e) {
                      toast.error(String(e));
                    } finally {
                      setPublishingFromReview(false);
                    }
                  }}
                >
                  {publishingFromReview ? (
                    <Loader2 className="ml-2 size-4 animate-spin" />
                  ) : (
                    <Share2 className="ml-2 size-4" />
                  )}
                  نشر الحلقة الآن
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>



        <Tabs defaultValue="story">

          <TabsList>
            <TabsTrigger value="story">القصة والإعدادات</TabsTrigger>
            <TabsTrigger value="scenes">المشاهد ({data.scenes.length})</TabsTrigger>
            <TabsTrigger value="characters">الشخصيات ({data.characters.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="story" className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>اسم السلسلة</Label>
                <Input value={meta.series_title} onChange={(e) => setMeta({ ...meta, series_title: e.target.value })} />
              </div>
              <div>
                <Label>رقم الحلقة</Label>
                <Input
                  type="number"
                  value={meta.episode_number}
                  onChange={(e) => setMeta({ ...meta, episode_number: Number(e.target.value) || 1 })}
                />
              </div>
            </div>
            <div>
              <Label>عنوان الحلقة</Label>
              <Input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
            </div>
            <div>
              <Label>القصة</Label>
              <Textarea
                rows={12}
                value={meta.story_text}
                onChange={(e) => setMeta({ ...meta, story_text: e.target.value })}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <Label>اللغة</Label>
                <Select value={meta.language} onValueChange={(v) => setMeta({ ...meta, language: v as "ar" | "en" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar">العربية</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>الاستايل</Label>
                <Select value={meta.style} onValueChange={(v) => setMeta({ ...meta, style: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="modern-shonen">شونين حديث</SelectItem>
                    <SelectItem value="shojo">شوجو</SelectItem>
                    <SelectItem value="cyberpunk">سايبربانك</SelectItem>
                    <SelectItem value="ghibli">غيبلي</SelectItem>
                    <SelectItem value="dark">داكن</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>المزاج</Label>
                <Select value={meta.mood} onValueChange={(v) => setMeta({ ...meta, mood: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="action">أكشن</SelectItem>
                    <SelectItem value="drama">درامي</SelectItem>
                    <SelectItem value="romance">رومانسي</SelectItem>
                    <SelectItem value="mystery">غموض</SelectItem>
                    <SelectItem value="comedy">كوميدي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>المدة (دقيقة)</Label>
                <Input
                  type="number"
                  min={5}
                  max={30}
                  step={5}
                  value={meta.target_duration_min}
                  onChange={(e) =>
                    setMeta({ ...meta, target_duration_min: Number(e.target.value) || 10 })
                  }
                />
              </div>
            </div>

            {/* ===== Audio & Style Settings Panel ===== */}
            <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary">
                  <Mic className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">إعدادات الصوت والمؤثرات</h3>
                  <p className="text-[11px] text-muted-foreground">
                    تنعكس هذه الإعدادات تلقائياً على كل عمليات التوليد (السرد، الصور، الجو العام).
                  </p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>نبرة الصوت (الراوي والشخصيات)</Label>
                  <Select
                    value={meta.voice_tone}
                    onValueChange={(v) => setMeta({ ...meta, voice_tone: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="natural">طبيعية — واضحة ومعبّرة</SelectItem>
                      <SelectItem value="calm">هادئة — دافئة وبطيئة</SelectItem>
                      <SelectItem value="dramatic">درامية — قوية ومؤثرة</SelectItem>
                      <SelectItem value="energetic">حماسية — سريعة ومليئة بالطاقة</SelectItem>
                      <SelectItem value="whisper">همس — قريبة ومشوّقة</SelectItem>
                      <SelectItem value="heroic">بطولية — واثقة وجريئة</SelectItem>
                      <SelectItem value="mysterious">غامضة — منخفضة ومتأنية</SelectItem>
                      <SelectItem value="sad">حزينة — رقيقة وعاطفية</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>نوع المؤثرات والجو</Label>
                  <Select
                    value={meta.sfx_style}
                    onValueChange={(v) => setMeta({ ...meta, sfx_style: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cinematic">سينمائي — أوركسترا ومؤثرات ضخمة</SelectItem>
                      <SelectItem value="epic">ملحمي — معارك وشرارات وغبار</SelectItem>
                      <SelectItem value="retro">ريترو — أنمي الثمانينات وسينثويف</SelectItem>
                      <SelectItem value="minimal">هادئ — بسيط ونظيف</SelectItem>
                      <SelectItem value="horror">رعب — بارد ومتوتّر</SelectItem>
                      <SelectItem value="comedic">كوميدي — مرح ومبالغ فيه</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                💡 غيّر الإعدادات ثم اضغط "حفظ التغييرات" — أي توليد جديد للصور أو الأصوات سيستخدم القيم الحالية مباشرةً.
              </p>
            </div>



            <div className="flex flex-wrap gap-2">
              <Button onClick={saveMeta} disabled={saving}>
                {saving && <Loader2 className="ml-2 size-4 animate-spin" />}
                حفظ التغييرات
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  await saveMeta();
                  split.mutate();
                }}
                disabled={split.isPending}
              >
                {split.isPending ? (
                  <Loader2 className="ml-2 size-4 animate-spin" />
                ) : (
                  <Sparkles className="ml-2 size-4" />
                )}
                قسّم القصة لمشاهد
              </Button>
              {data.scenes.length > 0 && (
                <span className="self-center text-xs text-muted-foreground">
                  ⚠ سيستبدل المشاهد والشخصيات الحالية
                </span>
              )}
            </div>
          </TabsContent>

          <TabsContent value="scenes">
            <ScenesTab
              scenes={data.scenes}
              characters={data.characters}
              episodeId={id}
              onUpdate={refetch}
              upsertSceneFn={upsertSceneFn}
              deleteSceneFn={deleteSceneFn}
              imgFn={imgFn}
              audFn={audFn}
              vidFn={vidFn}
            />
          </TabsContent>

          <TabsContent value="characters">
            <CharactersTab
              characters={data.characters}
              episodeId={id}
              onUpdate={refetch}
              upsertCharFn={upsertCharFn}
              deleteCharFn={deleteCharFn}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

type SceneRow = {
  id: string;
  order_index: number;
  description: string;
  narration: string;
  dialogue: string;
  character_id: string | null;
  character_name: string | null;
  duration_sec: number;
  image_url: string | null;
  audio_url: string | null;
  video_url?: string | null;
  image_status: string;
  audio_status: string;
  video_status?: string | null;
};

function ScenesTab({
  scenes,
  characters,
  episodeId,
  onUpdate,
  upsertSceneFn,
  deleteSceneFn,
  imgFn,
  audFn,
  vidFn,
}: {
  scenes: SceneRow[];
  characters: { id: string; name: string }[];
  episodeId: string;
  onUpdate: () => void;
  upsertSceneFn: (args: { data: unknown }) => Promise<unknown>;
  deleteSceneFn: (args: { data: unknown }) => Promise<unknown>;
  imgFn: (args: { data: { sceneId: string } }) => Promise<{ url: string }>;
  audFn: (args: { data: { sceneId: string } }) => Promise<{ url: string }>;
  vidFn: (args: { data: { sceneId: string } }) => Promise<{ url: string }>;
}) {
  const [bulkImg, setBulkImg] = useState(false);
  const [bulkAud, setBulkAud] = useState(false);
  const [bulkVid, setBulkVid] = useState(false);

  async function generateAll(kind: "img" | "aud" | "vid") {
    const setter = kind === "img" ? setBulkImg : kind === "aud" ? setBulkAud : setBulkVid;
    setter(true);
    const missing = scenes.filter((s) =>
      kind === "img" ? !s.image_url : kind === "aud" ? !s.audio_url : s.image_url && !s.video_url,
    );
    for (const s of missing) {
      try {
        if (kind === "img") await imgFn({ data: { sceneId: s.id } });
        else if (kind === "aud") await audFn({ data: { sceneId: s.id } });
        else await vidFn({ data: { sceneId: s.id } });
        onUpdate();
      } catch (e) {
        toast.error(`مشهد ${s.order_index + 1}: ${String(e)}`);
        break;
      }
    }
    setter(false);
    toast.success("انتهت التوليدات المتاحة");
  }

  if (scenes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        لسه ما فيه مشاهد. اذهب لتبويب "القصة" واضغط "قسّم القصة لمشاهد".
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => generateAll("img")} disabled={bulkImg}>
          {bulkImg ? <Loader2 className="ml-2 size-4 animate-spin" /> : <ImageIcon className="ml-2 size-4" />}
          ولّد كل الصور الناقصة
        </Button>
        <Button variant="outline" onClick={() => generateAll("aud")} disabled={bulkAud}>
          {bulkAud ? <Loader2 className="ml-2 size-4 animate-spin" /> : <Mic className="ml-2 size-4" />}
          ولّد كل الأصوات الناقصة
        </Button>
        <Button variant="outline" onClick={() => generateAll("vid")} disabled={bulkVid}>
          {bulkVid ? <Loader2 className="ml-2 size-4 animate-spin" /> : <Video className="ml-2 size-4" />}
          حرّك كل المشاهد لفيديو
        </Button>
        <Button
          variant="secondary"
          onClick={async () => {
            await upsertSceneFn({
              data: {
                episode_id: episodeId,
                order_index: scenes.length,
                description: "",
                narration: "",
                dialogue: "",
                character_id: null,
                character_name: null,
                duration_sec: 10,
              },
            });
            onUpdate();
          }}
        >
          <Plus className="ml-2 size-4" />
          إضافة مشهد
        </Button>
      </div>

      <div className="space-y-3">
        {scenes.map((s, i) => (
          <SceneRow
            key={s.id}
            scene={s}
            index={i}
            characters={characters}
            episodeId={episodeId}
            onUpdate={onUpdate}
            upsertSceneFn={upsertSceneFn}
            deleteSceneFn={deleteSceneFn}
            imgFn={imgFn}
            audFn={audFn}
            vidFn={vidFn}
          />
        ))}
      </div>
    </div>
  );
}

function SceneRow({
  scene,
  index,
  characters,
  episodeId,
  onUpdate,
  upsertSceneFn,
  deleteSceneFn,
  imgFn,
  audFn,
}: {
  scene: SceneRow;
  index: number;
  characters: { id: string; name: string }[];
  episodeId: string;
  onUpdate: () => void;
  upsertSceneFn: (args: { data: unknown }) => Promise<unknown>;
  deleteSceneFn: (args: { data: unknown }) => Promise<unknown>;
  imgFn: (args: { data: { sceneId: string } }) => Promise<{ url: string }>;
  audFn: (args: { data: { sceneId: string } }) => Promise<{ url: string }>;
}) {
  const [local, setLocal] = useState(scene);
  const [imgBusy, setImgBusy] = useState(false);
  const [audBusy, setAudBusy] = useState(false);

  async function save(partial: Partial<SceneRow>) {
    const next = { ...local, ...partial };
    setLocal(next);
    await upsertSceneFn({
      data: {
        id: next.id,
        episode_id: episodeId,
        order_index: next.order_index,
        description: next.description,
        narration: next.narration,
        dialogue: next.dialogue,
        character_id: next.character_id,
        character_name: next.character_name,
        duration_sec: next.duration_sec,
      },
    });
  }

  async function genImg() {
    setImgBusy(true);
    try {
      await imgFn({ data: { sceneId: scene.id } });
      onUpdate();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setImgBusy(false);
    }
  }

  async function genAud() {
    setAudBusy(true);
    try {
      await audFn({ data: { sceneId: scene.id } });
      onUpdate();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setAudBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground">مشهد {index + 1}</div>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={async () => {
            if (!confirm("حذف المشهد؟")) return;
            await deleteSceneFn({ data: { id: scene.id } });
            onUpdate();
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-[240px_1fr]">
        <div className="space-y-2">
          <div className="aspect-video overflow-hidden rounded-lg bg-black/40">
            {scene.image_url ? (
              <img src={scene.image_url} alt="" className="size-full object-cover" />
            ) : (
              <div className="grid size-full place-items-center text-xs text-muted-foreground">
                لا توجد صورة
              </div>
            )}
          </div>
          <Button size="sm" variant="outline" className="w-full" onClick={genImg} disabled={imgBusy}>
            {imgBusy ? <Loader2 className="ml-2 size-3 animate-spin" /> : <ImageIcon className="ml-2 size-3" />}
            {scene.image_url ? "أعد التوليد" : "ولّد الصورة"}
          </Button>
          {scene.audio_url ? (
            <audio controls src={scene.audio_url} className="w-full" />
          ) : (
            <div className="rounded-md border border-dashed border-border p-2 text-center text-xs text-muted-foreground">
              لا يوجد صوت
            </div>
          )}
          <Button size="sm" variant="outline" className="w-full" onClick={genAud} disabled={audBusy}>
            {audBusy ? <Loader2 className="ml-2 size-3 animate-spin" /> : <Mic className="ml-2 size-3" />}
            {scene.audio_url ? "أعد التوليد" : "ولّد الصوت"}
          </Button>
        </div>

        <div className="space-y-2">
          <div>
            <Label className="text-xs">الوصف البصري (يُستخدم لتوليد الصورة)</Label>
            <Textarea
              rows={2}
              value={local.description}
              onChange={(e) => setLocal({ ...local, description: e.target.value })}
              onBlur={() => save({ description: local.description })}
            />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <Label className="text-xs">السرد (الراوي)</Label>
              <Textarea
                rows={2}
                value={local.narration}
                onChange={(e) => setLocal({ ...local, narration: e.target.value })}
                onBlur={() => save({ narration: local.narration })}
              />
            </div>
            <div>
              <Label className="text-xs">الحوار</Label>
              <Textarea
                rows={2}
                value={local.dialogue}
                onChange={(e) => setLocal({ ...local, dialogue: e.target.value })}
                onBlur={() => save({ dialogue: local.dialogue })}
              />
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <div>
              <Label className="text-xs">الشخصية المتحدثة</Label>
              <Select
                value={local.character_id ?? "__none__"}
                onValueChange={(v) => {
                  const cid = v === "__none__" ? null : v;
                  const name = characters.find((c) => c.id === cid)?.name ?? null;
                  setLocal({ ...local, character_id: cid, character_name: name });
                  save({ character_id: cid, character_name: name });
                }}
              >
                <SelectTrigger><SelectValue placeholder="لا أحد" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— لا أحد (سرد فقط) —</SelectItem>
                  {characters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">مدة المشهد (ثانية)</Label>
              <Input
                type="number"
                min={2}
                max={120}
                value={local.duration_sec}
                onChange={(e) => setLocal({ ...local, duration_sec: Number(e.target.value) || 10 })}
                onBlur={() => save({ duration_sec: local.duration_sec })}
              />
            </div>
            <div>
              <Label className="text-xs">الترتيب</Label>
              <Input
                type="number"
                value={local.order_index}
                onChange={(e) => setLocal({ ...local, order_index: Number(e.target.value) || 0 })}
                onBlur={() => save({ order_index: local.order_index })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CharactersTab({
  characters,
  episodeId,
  onUpdate,
  upsertCharFn,
  deleteCharFn,
}: {
  characters: { id: string; name: string; appearance_prompt: string; voice: string }[];
  episodeId: string;
  onUpdate: () => void;
  upsertCharFn: (args: { data: unknown }) => Promise<unknown>;
  deleteCharFn: (args: { data: unknown }) => Promise<unknown>;
}) {
  return (
    <div className="space-y-3">
      <Button
        variant="secondary"
        onClick={async () => {
          await upsertCharFn({
            data: {
              episode_id: episodeId,
              name: "شخصية جديدة",
              appearance_prompt: "",
              voice: "alloy",
            },
          });
          onUpdate();
        }}
      >
        <Plus className="ml-2 size-4" />
        إضافة شخصية
      </Button>

      {characters.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          لا توجد شخصيات. سيتم إنشاؤها تلقائياً عند تقسيم القصة.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {characters.map((c) => (
            <CharacterCard
              key={c.id}
              character={c}
              episodeId={episodeId}
              onUpdate={onUpdate}
              upsertCharFn={upsertCharFn}
              deleteCharFn={deleteCharFn}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CharacterCard({
  character,
  episodeId,
  onUpdate,
  upsertCharFn,
  deleteCharFn,
}: {
  character: { id: string; name: string; appearance_prompt: string; voice: string };
  episodeId: string;
  onUpdate: () => void;
  upsertCharFn: (args: { data: unknown }) => Promise<unknown>;
  deleteCharFn: (args: { data: unknown }) => Promise<unknown>;
}) {
  const [local, setLocal] = useState(character);

  async function save(patch: Partial<typeof character>) {
    const next = { ...local, ...patch };
    setLocal(next);
    await upsertCharFn({
      data: {
        id: next.id,
        episode_id: episodeId,
        name: next.name,
        appearance_prompt: next.appearance_prompt,
        voice: next.voice,
      },
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Input
          value={local.name}
          onChange={(e) => setLocal({ ...local, name: e.target.value })}
          onBlur={() => save({ name: local.name })}
          className="text-base font-semibold"
        />
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={async () => {
            if (!confirm("حذف الشخصية؟")) return;
            await deleteCharFn({ data: { id: character.id } });
            onUpdate();
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <div>
        <Label className="text-xs">وصف المظهر (بالإنجليزية، للصور)</Label>
        <Textarea
          rows={3}
          value={local.appearance_prompt}
          onChange={(e) => setLocal({ ...local, appearance_prompt: e.target.value })}
          onBlur={() => save({ appearance_prompt: local.appearance_prompt })}
        />
      </div>
      <div>
        <Label className="text-xs">الصوت</Label>
        <Select value={local.voice} onValueChange={(v) => save({ voice: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {VOICES.map((v) => (
              <SelectItem key={v} value={v}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
