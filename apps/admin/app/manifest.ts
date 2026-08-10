import type { MetadataRoute } from "next";

// Web app manifest — lets phones "Add to Home Screen" with the logo + name,
// opening full-screen (standalone) instead of a browser tab.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tööaeg",
    short_name: "Tööaeg",
    description: "Учёт рабочего времени",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0B1320",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
