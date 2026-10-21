import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Conversion Engine",
    short_name: "Conversion Engine",
    description:
      "Dashboard van de Westend Digital Conversion Engine voor leads, opvolging en resultaten.",
    start_url: "/",
    display: "standalone",
    theme_color: "#234cd5",
    background_color: "#f6f8fc",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    screenshots: [
      {
        src: "/screenshots/dashboard-wide.png",
        sizes: "1440x900",
        type: "image/png",
        form_factor: "wide",
      },
      {
        src: "/screenshots/dashboard-mobile.png",
        sizes: "390x844",
        type: "image/png",
      },
    ],
  };
}
