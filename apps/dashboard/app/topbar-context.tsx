"use client";

import { usePathname } from "next/navigation";

const pageTitles: Readonly<Record<string, string>> = {
  "/": "Vandaag",
  "/onboarding": "Onboarding",
};

// Kruimelpad in de topbar; volgt de huidige route.
export default function TopbarContext() {
  const pathname = usePathname();
  return (
    <p className="topbar-context">
      Klantomgeving <span aria-hidden="true">/</span> <strong>{pageTitles[pathname] ?? "Vandaag"}</strong>
    </p>
  );
}
