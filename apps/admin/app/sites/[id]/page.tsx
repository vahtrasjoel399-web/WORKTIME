import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";
import type { Profile, Site } from "@/lib/types";
import { EmptyState, MetricStrip, PageHeader, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

type CurrentAssignment = {
  employee_id: string;
  start_date: string;
};

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getProfile();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect(me.role === "accountant" ? "/reports" : "/me");

  const { id } = await params;
  const supabase = await supabaseServer();
  const [{ data: site }, { data: assignments }] = await Promise.all([
    supabase.from("sites").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("employee_assignments")
      .select("employee_id, start_date")
      .eq("site_id", id)
      .is("end_date", null)
      .order("start_date"),
  ]);
  if (!site) notFound();

  const currentAssignments = (assignments ?? []) as CurrentAssignment[];
  const employeeIds = currentAssignments.map((assignment) => assignment.employee_id);
  let workers: Profile[] = [];
  if (employeeIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .in("id", employeeIds)
      .eq("role", "worker")
      .order("last_name");
    workers = (data ?? []) as Profile[];
  }
  const assignmentByEmployee = new Map(currentAssignments.map((assignment) => [assignment.employee_id, assignment]));
  const object = site as Site;

  return (
    <div className="page-stack">
      <Link href="/sites" className="inline-flex text-sm font-medium text-muted hover:text-primary">← Kõik objektid</Link>

      <PageHeader eyebrow="Objekti ülevaade" title={object.name} description={object.address || "Aadress puudub"} actions={<><StatusBadge tone={object.status === "active" ? "live" : "neutral"}>{object.status === "active" ? "Aktiivne" : "Mitteaktiivne"}</StatusBadge><Link href={`/sites?edit=${object.id}`} className="btn-secondary">Muuda objekti</Link></>} />
      {object.description && <p className="panel-pad whitespace-pre-wrap text-sm leading-6">{object.description}</p>}
      <MetricStrip items={[
        { label: "Määratud töötajaid", value: workers.length },
        { label: "Tööpiirkonna raadius", value: `${object.radius_m} m` },
        { label: "Koordinaadid", value: object.lat != null && object.lng != null ? `${object.lat.toFixed(5)}, ${object.lng.toFixed(5)}` : "Määramata" },
      ]} />

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Praegused töötajad</h2>
          <p className="mt-1 text-sm text-muted">Objektile hetkel määratud töötajad.</p>
        </div>
        {workers.length === 0 && (
          <EmptyState title="Töötajaid pole määratud" description="Määra töötaja objektile tema profiili tööinfo jaotises." icon="users" />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {workers.map((worker) => {
            const assignment = assignmentByEmployee.get(worker.id);
            return (
              <Link key={worker.id} href={`/workers/${worker.id}`} className="panel p-4 transition-colors hover:border-primary/50 hover:bg-elevated">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{worker.first_name} {worker.last_name}</div>
                    <div className="truncate text-sm text-muted">{worker.position || "Amet määramata"}</div>
                  </div>
                  <StatusBadge tone={worker.is_active ? "live" : "neutral"}>{worker.is_active ? "Aktiivne" : "Mitteaktiivne"}</StatusBadge>
                </div>
                <div className="mt-3 text-xs text-muted">Objektil alates {assignment?.start_date ? new Date(`${assignment.start_date}T00:00:00`).toLocaleDateString("et-EE") : "—"}</div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
