import { createFileRoute, Link, notFound, useParams } from "@tanstack/react-router";
import { getPublicEpisode } from "@/lib/public.functions";
import { EpisodePlayer } from "@/components/episode-player";
import { Button } from "@/components/ui/button";
import { Film, Share2, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/watch/$slug")({
  loader: async ({ params }) => {
    const data = await getPublicEpisode({ data: { slug: params.slug } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "الحلقة غير موجودة" }, { name: "robots", content: "noindex" }] };
    }
    const t = `${loaderData.episode.title} — ${loaderData.episode.series_title}`;
    const desc = `شاهد حلقة "${loaderData.episode.title}" على AnimeCast`;
    const meta: Array<Record<string, string>> = [
      { title: t },
      { name: "description", content: desc },
      { property: "og:title", content: t },
      { property: "og:description", content: desc },
      { property: "og:type", content: "video.other" },
      { name: "twitter:card", content: "summary_large_image" },
    ];
    if (loaderData.episode.cover_image_url) {
      meta.push(
        { property: "og:image", content: loaderData.episode.cover_image_url },
        { name: "twitter:image", content: loaderData.episode.cover_image_url },
      );
    }
    return { meta };
  },
  notFoundComponent: NotFound,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-md p-10 text-center">
      <h1 className="text-xl font-semibold">تعذر تحميل الحلقة</h1>
      <p className="mt-2 text-sm text-muted-foreground">{String(error)}</p>
    </div>
  ),
  component: WatchPage,
});

function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center text-center">
      <div>
        <h1 className="text-3xl font-bold">الحلقة غير موجودة</h1>
        <p className="mt-2 text-muted-foreground">قد يكون الرابط خاطئ أو الحلقة غير منشورة.</p>
        <Link to="/" className="mt-6 inline-block">
          <Button>الرئيسية</Button>
        </Link>
      </div>
    </div>
  );
}

function WatchPage() {
  const data = Route.useLoaderData();
  const { slug } = useParams({ from: "/watch/$slug" });
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/watch/${slug}` : "";

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Film className="size-4" />
            </div>
            <span className="font-bold">AnimeCast</span>
          </Link>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard?.writeText(shareUrl);
              toast.success("تم نسخ الرابط");
            }}
          >
            <Copy className="ml-2 size-4" />
            نسخ الرابط
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-4">
          <div className="text-sm text-muted-foreground">
            {data.episode.series_title} · حلقة {data.episode.episode_number}
          </div>
          <h1 className="text-3xl font-bold">{data.episode.title}</h1>
        </div>
        <EpisodePlayer scenes={data.scenes} title={data.episode.title} autoplay={false} />

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => {
              if (navigator.share) {
                navigator.share({ title: data.episode.title, url: shareUrl }).catch(() => {});
              } else {
                navigator.clipboard?.writeText(shareUrl);
                toast.success("تم نسخ الرابط");
              }
            }}
          >
            <Share2 className="ml-2 size-4" />
            مشاركة
          </Button>
          <Link to="/">
            <Button variant="ghost">اصنع حلقتك على AnimeCast</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
