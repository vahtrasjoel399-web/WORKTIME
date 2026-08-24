import type { Site } from "./types";

/** Haversine metres — the TypeScript twin of SQL `public.distance_m`. */
export function distanceM(
  lat1: number | null,
  lng1: number | null,
  lat2: number | null,
  lng2: number | null,
): number | null {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const r = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

export interface SiteMatch {
  /** Site whose radius contains the fix, if any. */
  site: Site | null;
  /** Closest site regardless of radius — what to name when the fix is outside. */
  nearest: Site | null;
  /** Metres to `nearest`. */
  distance: number | null;
}

/**
 * Which job site is this GPS fix at? Same rule as `public.nearest_site`: the
 * closest site whose own radius contains the point. Used to display shifts that
 * were recorded before the database started resolving this itself (D-016).
 */
export function matchSite(
  lat: number | null,
  lng: number | null,
  sites: Site[],
): SiteMatch {
  let nearest: Site | null = null;
  let distance: number | null = null;

  for (const s of sites) {
    const d = distanceM(lat, lng, s.lat, s.lng);
    if (d == null) continue;
    if (distance == null || d < distance) {
      distance = d;
      nearest = s;
    }
  }
  const site = nearest != null && distance != null && distance <= nearest.radius_m ? nearest : null;
  return { site, nearest, distance };
}

/** "1,2 km" / "340 m" — distance a person can read at a glance. */
export function distanceLabel(m: number | null): string {
  if (m == null) return "—";
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

/** Street + number, dropping the country/postcode tail Nominatim returns. */
export function shortAddress(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.slice(0, 2).join(", ") || address;
}
