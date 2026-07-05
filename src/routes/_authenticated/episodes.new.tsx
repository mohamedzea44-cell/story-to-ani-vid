import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { createEpisode } from "@/lib/episodes.functions";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/episodes/new")({
  component: NewEpisode,
});

function NewEpisode() {
  const navigate = useNavigate();
  const createFn = useServerFn(createEpisode);
  const [form, setForm] = useState({
    series_title: "أنميي الخاص",
    episode_number: 1,
    title: "الحلقة الأولى",
    story_text: "",
    language: "ar" as "ar" | "en",
    style: "modern-shonen",
    mood: "action",
    target_duration_min: 10,
  });

  const mut = useMutation({
    mutationFn: () => createFn({ data: form }),
    onSuccess: ({ id }) => {
      toast.success("تم إنشاء الحلقة");
      navigate({ to: "/episodes/$id", params: { id } });
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-3xl font-bold">حلقة جديدة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          املأ التفاصيل، وبعدين نقسّم القصة لمشاهد.
        </p>

        <form
          className="mt-8 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>اسم السلسلة</Label>
              <Input
                value={form.series_title}
                onChange={(e) => setForm({ ...form, series_title: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>رقم الحلقة</Label>
              <Input
                type="number"
                min={1}
                value={form.episode_number}
                onChange={(e) =>
                  setForm({ ...form, episode_number: Number(e.target.value) || 1 })
                }
                required
              />
            </div>
          </div>

          <div>
            <Label>عنوان الحلقة</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>

          <div>
            <Label>القصة</Label>
            <Textarea
              rows={10}
              placeholder="اكتب قصتك هنا... مو لازم تكون طويلة، الذكاء الاصطناعي بيوسّعها."
              value={form.story_text}
              onChange={(e) => setForm({ ...form, story_text: e.target.value })}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>اللغة</Label>
              <Select
                value={form.language}
                onValueChange={(v) => setForm({ ...form, language: v as "ar" | "en" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ar">العربية</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الاستايل</Label>
              <Select
                value={form.style}
                onValueChange={(v) => setForm({ ...form, style: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="modern-shonen">شونين حديث</SelectItem>
                  <SelectItem value="shojo">شوجو</SelectItem>
                  <SelectItem value="cyberpunk">سايبربانك</SelectItem>
                  <SelectItem value="ghibli">غيبلي</SelectItem>
                  <SelectItem value="dark">أنمي داكن</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>المزاج</Label>
              <Select value={form.mood} onValueChange={(v) => setForm({ ...form, mood: v })}>
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
          </div>

          <div>
            <Label>المدة المستهدفة: {form.target_duration_min} دقيقة</Label>
            <Slider
              min={5}
              max={30}
              step={5}
              value={[form.target_duration_min]}
              onValueChange={([v]) => setForm({ ...form, target_duration_min: v })}
              className="mt-3"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              كل ما زوّدت المدة، كل ما زاد عدد المشاهد وتوليد الصور والصوت.
            </p>
          </div>

          <Button type="submit" size="lg" className="w-full glow" disabled={mut.isPending}>
            {mut.isPending ? <Loader2 className="ml-2 size-4 animate-spin" /> : <Sparkles className="ml-2 size-4" />}
            إنشاء الحلقة
          </Button>
        </form>
      </main>
    </div>
  );
}
