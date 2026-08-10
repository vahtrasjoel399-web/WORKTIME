import { supabaseServer } from "@/lib/supabase-server";
import { SiteEditor } from "@/components/SiteEditor";
import type { Site } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const supabase = supabaseServer();
  const { data: sites } = await supabase.from("sites").select("*").order("name");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Objektid</h1>
        <p className="mt-1 text-sm text-muted">
          Objekti gео-punkt ja raadius. Väljaspool raadiust tehtud märge saab aruandes lipu.
        </p>
      </div>
      <SiteEditor sites={(sites ?? []) as Site[]} />
    </div>
  );
}
