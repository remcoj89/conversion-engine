"use client";

import { usePathname } from "next/navigation";
import { useWorkspaceContext } from "./workspace-context";

const pageTitles: ReadonlyArray<readonly [string, string]> = [
  ["/organizations", "Organisaties"],
  ["/contacts", "Contactpersonen"],
  ["/crm", "CRM-overzicht"],
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
  const isInvite = pathname === "/invite";
  const { status, tenant } = useWorkspaceContext();
  const showLoginLink = !isAdmin && ["loading", "unauthenticated", "unavailable"].includes(status);

  return (
    <>
      <p className="topbar-context">
        {isInvite ? "UITNODIGING" : isAdmin ? "WESTEND BEHEER" : "KLANTDASHBOARD"} <span aria-hidden="true">/</span>{" "}
        <strong>{isInvite ? "Uitnodiging" : getPageTitle(pathname)}</strong>{" "}
        <span className="badge badge-neutral" aria-live="polite">
          {isInvite ? "Publieke uitnodiging" : isAdmin ? "Beheeromgeving" : getWorkspaceLabel(status, tenant)}
        </span>
      </p>
      {showLoginLink ? (
        <a className="button button-primary button-small topbar-login" href="/auth/login">
          Aanmelden
        </a>
      ) : null}
    </>
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
