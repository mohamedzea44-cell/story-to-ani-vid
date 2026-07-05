import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getEpisodeFull } from "@/lib/episodes.functions";
import { AppHeader } from "@/components/app-header";
import { EpisodePlayer } from "@/components/episode-player";
import { Loader2, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/episodes/$id/preview")({
  component: PreviewPage,
});

function PreviewPage() {
  const { id } = useParams({ from: "/_authenticated/episodes/$id/preview" });
  const getFn = useServerFn(getEpisodeFull);
  const { data, isLoading } = useQuery({
    queryKey: ["episode", id],
    queryFn: () => getFn({ data: { id } }),
  });

  if (isLoading || !data) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <div className="mx-auto max-w-6xl px-6 py-8">
          <Loader2 className="size-6 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-6 py-6">
        <Link
          to="/episodes/$id"
          params={{ id }}
          className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-3" />
          رجوع للتعديل
        </Link>
        <h1 className="mb-1 text-2xl font-bold">{data.episode.title}</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {data.episode.series_title} · حلقة {data.episode.episode_number}
        </p>
        <EpisodePlayer scenes={data.scenes} title={data.episode.title} />
      </main>
    </div>
  );
}
