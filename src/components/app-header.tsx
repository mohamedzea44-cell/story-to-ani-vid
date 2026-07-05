import { Link, useNavigate } from "@tanstack/react-router";
import { Film, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export function AppHeader() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Film className="size-4" />
          </div>
          <span className="font-bold">AnimeCast</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/dashboard">
            <Button variant="ghost" size="sm">حلقاتي</Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="ml-2 size-4" />
            خروج
          </Button>
        </div>
      </div>
    </header>
  );
}
