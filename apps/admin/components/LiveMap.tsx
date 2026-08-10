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
      <div className="flex h-[420px] items-center justify-center text-muted">
        Hetkel pole keegi vahetuses.
      </div>
    );
  }
  return <MapView markers={points} height={520} />;
}
