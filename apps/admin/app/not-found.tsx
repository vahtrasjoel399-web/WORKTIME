import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center">
      <div className="panel w-full p-6 text-center sm:p-8">
        <p className="eyebrow">404</p>
        <h1 className="mt-2 font-display text-xl font-semibold">Lehte ei leitud</h1>
        <p className="mt-2 text-sm leading-6 text-muted">See leht võib olla eemaldatud või aadress on vale.</p>
        <Link href="/" className="btn-primary mt-5">Tagasi töötajate juurde</Link>
      </div>
    </div>
  );
}
