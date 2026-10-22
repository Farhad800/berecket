import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bereket Plastic — Factory Management System",
    short_name: "Bereket FMS",
    description: "Orders, production, service, quality control and warehouse for Bereket Plastic.",
    id: "/",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any", // tablets on the floor are often landscape
    background_color: "#26417b",
    theme_color: "#294680",
    lang: "en",
    dir: "ltr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.webp", sizes: "512x512", type: "image/webp", purpose: "any" },
      { src: "/icons/maskable-512.webp", sizes: "512x512", type: "image/webp", purpose: "maskable" },
    ],
  };
}
