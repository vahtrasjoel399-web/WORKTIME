import * as Location from "expo-location";

export interface Fix {
  lat: number;
  lng: number;
  accuracy_m: number | null;
  address: string | null;
}

// Point-in-time fix ONLY. Called once at start and once at stop. No background. (D-007)
export async function captureFix(): Promise<Fix> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("location-denied");
  }

  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  const accuracy_m = pos.coords.accuracy ?? null;

  const address = await reverseGeocode(lat, lng);
  return { lat, lng, accuracy_m, address };
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  // Address is resolved once at capture time and frozen on the shift. (D-006)
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const r = results[0];
    if (r) {
      return [r.street, r.name, r.city].filter(Boolean).join(", ") || null;
    }
  } catch {
    // fall through to Nominatim
  }
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`,
      { headers: { "User-Agent": "tooaeg/1.0" } },
    );
    const json = (await res.json()) as { display_name?: string };
    return json.display_name ?? null;
  } catch {
    return null;
  }
}
