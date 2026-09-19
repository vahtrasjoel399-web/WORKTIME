import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getProfile } from "@/lib/auth";
import { SiteEditor } from "@/components/SiteEditor";
import type { Site } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const me = await getProfile();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/me");

  const supabase = await supabaseServer();
  const [{ data: sites }, { data: assignments }] = await Promise.all([
    supabase.from("sites").select("*").order("status").order("name"),
    supabase.from("employee_assignments").select("site_id").is("end_date", null),
  ]);
  const assignmentCounts: Record<string, number> = {};
  for (const assignment of assignments ?? []) {
    assignmentCounts[assignment.site_id] = (assignmentCounts[assignment.site_id] ?? 0) + 1;
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Objektid</h1>
        <p className="mt-1 text-sm text-muted">
          Objekti gео-punkt ja raadius. Väljaspool raadiust tehtud märge saab aruandes lipu.
        </p>
      </div>
      <SiteEditor sites={(sites ?? []) as Site[]} assignmentCounts={assignmentCounts} />
    </div>
  );
}
