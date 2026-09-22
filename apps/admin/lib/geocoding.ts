export type AddressSuggestion = {
  id: string;
  label: string;
  lat: number;
  lng: number;
};

type MapTilerFeature = {
  id?: unknown;
  place_name?: unknown;
  text?: unknown;
  center?: unknown;
};

export function mapTilerSearchUrl(query: string, apiKey: string): string {
  const params = new URLSearchParams({
    key: apiKey,
    autocomplete: "true",
    limit: "6",
    language: "et",
    country: "ee",
    types: "address,road,poi,place,locality,municipality",
  });
  return `https://api.maptiler.com/geocoding/${encodeURIComponent(query.trim())}.json?${params}`;
}

export function parseMapTilerSuggestions(payload: unknown): AddressSuggestion[] {
  if (!payload || typeof payload !== "object" || !("features" in payload) || !Array.isArray(payload.features)) return [];
  return payload.features.flatMap((feature: MapTilerFeature, index: number) => {
    const center = feature.center;
    const label = typeof feature.place_name === "string"
      ? feature.place_name.trim()
      : typeof feature.text === "string" ? feature.text.trim() : "";
    if (!label || !Array.isArray(center) || center.length < 2) return [];
    const lng = Number(center[0]);
    const lat = Number(center[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return [];
    return [{ id: typeof feature.id === "string" ? feature.id : `${lng}:${lat}:${index}`, label, lat, lng }];
  });
}
