import type { MetadataRoute } from "next";
import { PLATFORM_NAME, SCHOOL_NAME } from "@/lib/branding";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: `${SCHOOL_NAME} — ${PLATFORM_NAME}`,
    short_name: PLATFORM_NAME,
    description: `${SCHOOL_NAME} school portal.`,
    start_url: "/login",
    scope: "/",
    display: "standalone",
    background_color: "#f8f6ef",
    theme_color: "#1e624f",
    categories: ["education"],
    icons: [
      {
        src: "/icons/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/app-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
