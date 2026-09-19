import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";
import type { Profile, Site } from "@/lib/types";

export const dynamic = "force-dynamic";

type CurrentAssignment = {
  employee_id: string;
  start_date: string;
};

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getProfile();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/me");

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
    <div className="space-y-6">
      <Link href="/sites" className="inline-flex text-sm text-muted hover:text-signal">← Kõik objektid</Link>

      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-bold">{object.name}</h1>
              <span className={`rounded-full px-2.5 py-1 text-xs ${object.status === "active" ? "bg-live/10 text-live" : "bg-bg text-muted"}`}>
                {object.status === "active" ? "Aktiivne" : "Mitteaktiivne"}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted">{object.address || "Aadress puudub"}</p>
          </div>
          <Link href="/sites" className="rounded-lg border border-border px-4 py-2 text-center text-sm font-medium hover:border-signal">
            Objektide haldus
          </Link>
        </div>
        {object.description && <p className="mt-5 whitespace-pre-wrap text-sm leading-6">{object.description}</p>}
        <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-xl bg-bg p-3"><div className="text-xs text-muted">Töötajaid</div><div className="mt-1 font-semibold">{workers.length}</div></div>
          <div className="rounded-xl bg-bg p-3"><div className="text-xs text-muted">GPS-raadius</div><div className="mt-1 font-semibold">{object.radius_m} m</div></div>
          <div className="rounded-xl bg-bg p-3"><div className="text-xs text-muted">Koordinaadid</div><div className="mt-1 font-semibold">{object.lat != null && object.lng != null ? `${object.lat.toFixed(5)}, ${object.lng.toFixed(5)}` : "Määramata"}</div></div>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Praegused töötajad</h2>
          <p className="mt-1 text-sm text-muted">Objektile hetkel määratud töötajad.</p>
        </div>
        {workers.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center text-sm text-muted">
            Sellele objektile pole töötajaid määratud.
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {workers.map((worker) => {
            const assignment = assignmentByEmployee.get(worker.id);
            return (
              <Link key={worker.id} href={`/workers/${worker.id}`} className="rounded-2xl border border-border bg-surface p-4 transition hover:border-signal">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{worker.first_name} {worker.last_name}</div>
                    <div className="truncate text-sm text-muted">{worker.position || "Amet määramata"}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${worker.is_active ? "bg-live/10 text-live" : "bg-bg text-muted"}`}>
                    {worker.is_active ? "Aktiivne" : "Mitteaktiivne"}
                  </span>
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
