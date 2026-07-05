import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, Wand2, Share2, Mic, ImageIcon, Film } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground glow">
            <Film className="size-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">AnimeCast</span>
        </Link>
        <Link to="/auth">
          <Button variant="outline" size="sm">دخول</Button>
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-6 pt-10 pb-24">
        <section className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-[color:var(--gold)]" />
            مدعوم بالذكاء الاصطناعي · Lovable Cloud
          </div>
          <h1 className="text-5xl font-black leading-tight md:text-7xl">
            اكتب قصة.<br />
            <span className="bg-gradient-to-r from-primary via-[color:var(--gold)] to-[color:var(--neon)] bg-clip-text text-transparent">
              شاهدها كأنها أنمي.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            حوّل أي قصة إلى حلقة أنمي كاملة — مشاهد مصوّرة، تعليق صوتي بشخصيات مختلفة، وقابلة للمشاركة برابط واحد.
            ابدأ من 10 دقائق وزوّد المدة كما تريد، وأنشئ حلقات لا نهائية.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/auth">
              <Button size="lg" className="glow">
                <Wand2 className="ml-2 size-4" />
                ابدأ حلقتك الأولى
              </Button>
            </Link>
            <a href="#features">
              <Button size="lg" variant="outline">اعرف أكثر</Button>
            </a>
          </div>
        </section>

        <section id="features" className="mt-28 grid gap-6 md:grid-cols-3">
          <FeatureCard
            icon={<Wand2 className="size-5" />}
            title="اكتب قصة، احصل على مشاهد"
            desc="الذكاء الاصطناعي يقسّم قصتك لمشاهد سينمائية مع وصف بصري وحوار لكل مشهد."
          />
          <FeatureCard
            icon={<ImageIcon className="size-5" />}
            title="صور أنمي عصرية"
            desc="اختر استايل (شونين، سايبربانك، غيبلي...) وولّد صورة لكل مشهد بلمسة زر."
          />
          <FeatureCard
            icon={<Mic className="size-5" />}
            title="أصوات متعددة"
            desc="راوي للسرد وأصوات مختلفة للشخصيات، بلغة عربية أو إنجليزية."
          />
          <FeatureCard
            icon={<Film className="size-5" />}
            title="تحكم كامل بالمدة"
            desc="من 10 دقائق للأعلى. عدّل مدة كل مشهد بدقة، وأعد ترتيب المشاهد."
          />
          <FeatureCard
            icon={<Sparkles className="size-5" />}
            title="حلقات لا نهائية"
            desc="أنشئ سلسلة كاملة: S1E1, S1E2, S1E3... كل حلقة قابلة للتعديل في أي وقت."
          />
          <FeatureCard
            icon={<Share2 className="size-5" />}
            title="رابط مشاركة عام"
            desc="كل حلقة تحصل على رابط تفتحه من أي مكان — واتساب، تويتر، أي حد."
          />
        </section>

        <section className="mt-24 rounded-3xl border border-border bg-card/60 p-8 text-center md:p-14">
          <h2 className="text-3xl font-bold md:text-4xl">جاهز تصنع أول حلقة؟</h2>
          <p className="mt-3 text-muted-foreground">مجاني للبدء — سجّل الدخول بجوجل أو إيميل.</p>
          <Link to="/auth" className="mt-6 inline-block">
            <Button size="lg" className="glow">
              <Sparkles className="ml-2 size-4" />
              ابدأ الآن
            </Button>
          </Link>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        صُنع بحب على Lovable · AnimeCast © {new Date().getFullYear()}
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="group rounded-2xl border border-border bg-card/60 p-6 transition-all hover:border-primary/50 hover:bg-card">
      <div className="mb-4 inline-grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
