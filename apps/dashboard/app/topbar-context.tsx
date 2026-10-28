"use client";

import { usePathname } from "next/navigation";
import { useWorkspaceContext } from "./workspace-context";

const pageTitles: ReadonlyArray<readonly [string, string]> = [
  ["/leads/", "Leaddetail"],
  ["/onboarding", "Onboarding"],
  ["/leads", "Leads & contacten"],
  ["/pipeline/", "Dealdetail"],
  ["/pipeline", "Pipeline"],
  ["/tasks", "Taken & afspraken"],
  ["/results", "Resultaten"],
  ["/performance", "Websiteprestaties"],
  ["/settings", "Instellingen"],
  ["/support", "Support aanvragen"],
  ["/admin/audit", "Audit & versies"],
  ["/admin/clients", "Klanten"],
  ["/admin/review", "Project Brief Review"],
  ["/admin/websites", "Websites"],
  ["/admin/monitoring", "Monitoring"],
  ["/admin/intelligence", "Website Intelligence"],
  ["/admin/sources", "Databronnen"],
  ["/admin/templates", "Templates"],
  ["/admin/support", "Support"],
  ["/admin", "Beheeroverzicht"],
];

function matchesRoute(pathname: string, route: string): boolean {
  return route.endsWith("/")
    ? pathname.startsWith(route)
    : pathname === route || pathname.startsWith(`${route}/`);
}

function getPageTitle(pathname: string): string {
  if (pathname === "/") {
    return "Vandaag";
  }

  return pageTitles.find(([route]) => matchesRoute(pathname, route))?.[1] ?? "Vandaag";
}

// Kruimelpad in de topbar; volgt de huidige route.
export default function TopbarContext() {
  const pathname = usePathname();
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const { status, tenant } = useWorkspaceContext();

  return (
    <p className="topbar-context">
      {isAdmin ? "WESTEND BEHEER" : "KLANTDASHBOARD"} <span aria-hidden="true">/</span>{" "}
      <strong>{getPageTitle(pathname)}</strong>{" "}
      <span className="badge badge-neutral" aria-live="polite">
        {isAdmin ? "Beheeromgeving" : getWorkspaceLabel(status, tenant)}
      </span>
    </p>
  );
}

function getWorkspaceLabel(
  status: ReturnType<typeof useWorkspaceContext>["status"],
  tenant: ReturnType<typeof useWorkspaceContext>["tenant"],
): string {
  if (status === "ready" && tenant) return tenant.name;
  if (status === "tenant_selection_required") return "Kies klantomgeving";
  if (status === "unauthenticated") return "Niet ingelogd";
  if (status === "forbidden") return "Geen toegang";
  if (status === "unavailable") return "Context niet beschikbaar";
  return "Klantomgeving laden…";
}
