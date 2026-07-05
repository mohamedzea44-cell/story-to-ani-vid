import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyEpisodes, deleteEpisode } from "@/lib/episodes.functions";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Film, Plus, Trash2, ExternalLink, Play, Share2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const listFn = useServerFn(listMyEpisodes);
  const delFn = useServerFn(deleteEpisode);
  const qc = useQueryClient();
  const router = useRouter();

  const { data: episodes = [], isLoading } = useQuery({
    queryKey: ["episodes"],
    queryFn: () => listFn(),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["episodes"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">حلقاتي</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {episodes.length ? `${episodes.length} حلقة` : "لا توجد حلقات بعد"}
            </p>
          </div>
          <Button
            className="glow"
            onClick={() => router.navigate({ to: "/episodes/new" })}
          >
            <Plus className="ml-2 size-4" />
            حلقة جديدة
          </Button>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">جاري التحميل...</div>
        ) : episodes.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {episodes.map((ep) => (
              <div
                key={ep.id}
                className="group overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-primary/50"
              >
                <div className="relative aspect-video bg-gradient-to-br from-primary/20 to-accent/20">
                  {ep.cover_image_url ? (
                    <img src={ep.cover_image_url} alt={ep.title} className="size-full object-cover" />
                  ) : (
                    <div className="grid size-full place-items-center text-muted-foreground">
                      <Film className="size-10" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-1 text-xs">
                    {ep.status === "published" ? "منشورة" : "مسودة"}
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-xs text-muted-foreground">
                    {ep.series_title} · حلقة {ep.episode_number}
                  </div>
                  <h3 className="mt-1 truncate text-lg font-semibold">{ep.title}</h3>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {ep.target_duration_min} دقيقة
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link to="/episodes/$id" params={{ id: ep.id }}>
                      <Button size="sm" variant="secondary">تعديل</Button>
                    </Link>
                    <Link to="/episodes/$id/preview" params={{ id: ep.id }}>
                      <Button size="sm" variant="ghost">
                        <Play className="ml-1 size-3" />
                        معاينة
                      </Button>
                    </Link>
                    {ep.status === "published" && (
                      <a href={`/watch/${ep.share_slug}`} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="ghost">
                          <Share2 className="ml-1 size-3" />
                          مشاركة
                        </Button>
                      </a>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm("حذف هذه الحلقة نهائياً؟")) del.mutate(ep.id);
                      }}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-border p-12 text-center">
      <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Film className="size-8" />
      </div>
      <h2 className="mt-4 text-xl font-semibold">لسه ما أنشأت حلقة</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        اكتب قصتك وخلي الذكاء الاصطناعي يبنيها لك.
      </p>
      <Link to="/episodes/new" className="mt-6 inline-block">
        <Button className="glow">
          <Plus className="ml-2 size-4" />
          حلقتك الأولى
        </Button>
      </Link>
    </div>
  );
}
