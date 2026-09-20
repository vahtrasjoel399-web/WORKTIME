"use client";
import { useEffect, useState } from "react";
import { MapView } from "./MapView";

interface Point {
  lat: number;
  lng: number;
  label: string;
  color: string;
  started_at: string;
}

// Auto-refreshes the live positions every 30s without a full page reload.
export function LiveMap({ points: initial }: { points: Point[] }) {
  const [points, setPoints] = useState(initial);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (res.ok) setPoints(await res.json());
      } catch {
        /* keep last known */
      }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  if (points.length === 0) {
    return (
      <div className="flex h-[420px] flex-col items-center justify-center px-6 text-center">
        <h2 className="section-title">Hetkel pole keegi vahetuses</h2>
        <p className="mt-1 max-w-md text-sm text-muted">Töötaja ilmub kaardile pärast vahetuse alustamist ja asukoha kinnitamist.</p>
      </div>
    );
  }
  return <MapView markers={points} height={520} />;
}
