"use client";
import { useEffect, useRef } from "react";
import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface MapMarker {
  lat: number;
  lng: number;
  label?: string;
  color?: string;
  radius_m?: number;
}

// Separate tile styles for light and dark so the map matches the panel theme. (spec §4)
// CARTO basemaps are free to use with attribution; MapTiler used if a key is set.
function styleUrl(dark: boolean): maplibregl.StyleSpecification {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const tiles = key
    ? [`https://api.maptiler.com/maps/${dark ? "streets-v2-dark" : "streets-v2"}/{z}/{x}/{y}.png?key=${key}`]
    : [
        `https://basemaps.cartocdn.com/rastertiles/${dark ? "dark_all" : "light_all"}/{z}/{x}/{y}{r}.png`,
      ];
  return {
    version: 8,
    sources: {
      base: {
        type: "raster",
        tiles,
        tileSize: 256,
        attribution: key ? "© MapTiler © OpenStreetMap" : "© OpenStreetMap © CARTO",
      },
    },
    layers: [{ id: "base", type: "raster", source: "base" }],
  };
}

export function MapView({
  markers,
  center,
  zoom = 12,
  height = 420,
}: {
  markers: MapMarker[];
  center?: [number, number];
  zoom?: number;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markerObjs = useRef<Marker[]>([]);

  const isDark = () =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const first = markers[0];
    const map = new maplibregl.Map({
      container: ref.current,
      style: styleUrl(isDark()),
      center: center ?? (first ? [first.lng, first.lat] : [24.75, 59.42]),
      zoom,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    const onTheme = () => map.setStyle(styleUrl(isDark()));
    window.addEventListener("themechange", onTheme);
    return () => {
      window.removeEventListener("themechange", onTheme);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (re)draw markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerObjs.current.forEach((m) => m.remove());
    markerObjs.current = [];
    const bounds = new maplibregl.LngLatBounds();
    markers.forEach((mk) => {
      const el = document.createElement("div");
      el.style.cssText = `width:16px;height:16px;border-radius:50%;border:2px solid #fff;background:${
        mk.color ?? "#2FBF71"
      };box-shadow:0 0 0 4px ${(mk.color ?? "#2FBF71") + "33"};`;
      const marker = new maplibregl.Marker({ element: el }).setLngLat([mk.lng, mk.lat]);
      if (mk.label) marker.setPopup(new maplibregl.Popup({ offset: 14 }).setText(mk.label));
      marker.addTo(map);
      markerObjs.current.push(marker);
      bounds.extend([mk.lng, mk.lat]);
    });
    if (markers.length > 1) map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
  }, [markers]);

  return <div ref={ref} style={{ height, width: "100%", borderRadius: 16 }} />;
}
