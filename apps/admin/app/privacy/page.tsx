import Link from "next/link";

export const metadata = {
  title: "Privacy · Tööaeg",
  description: "How Tööaeg processes worker data and shift location points.",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 rounded-2xl border border-border bg-surface p-6 sm:p-10">
      <div>
        <p className="text-sm text-muted">Effective 20 September 2026</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Privacy notice</h1>
        <p className="mt-3 leading-7 text-muted">
          Tööaeg is a workforce and time-recording tool. Your employer is the controller of the employee data entered in its workspace and is your first contact for privacy requests.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="font-display text-xl font-semibold">Data processed</h2>
        <p className="leading-7 text-muted">Account and contact details, job information, object assignments, shifts, breaks, consent acknowledgements, and documents uploaded by your employer.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl font-semibold">Location</h2>
        <p className="leading-7 text-muted">Location is captured only when a worker starts and finishes a shift. Tööaeg does not track workers continuously or in the background. Precise coordinates, accuracy values and resolved addresses are removed after 24 months.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl font-semibold">Access and security</h2>
        <p className="leading-7 text-muted">Workers can access only their own account and work information. Company administrators can access only their own company. Employee files are private and opened through short-lived signed links.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl font-semibold">Retention and deletion</h2>
        <p className="leading-7 text-muted">Work and payroll records are kept according to the employer’s legal obligations. Administrators can permanently delete individual documents and can export or erase a worker account. Erasure may be limited where the employer must retain records by law.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl font-semibold">Your rights</h2>
        <p className="leading-7 text-muted">Contact your employer to request access, correction, export, restriction or deletion of your data, or to ask how the employer uses Tööaeg. You may also contact the competent data-protection authority.</p>
      </section>

      <Link href="/login" className="inline-flex rounded-lg border border-border px-4 py-2 text-sm font-medium hover:border-signal">← Back to sign in</Link>
    </article>
  );
}
