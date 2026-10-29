import type { AdminTone } from "../../app/admin/admin-types";
import type { PlatformTenant, PlatformTenantListResponse } from "../bff/platformTenants";

export type AdminTenantRow = Readonly<{
  id: string;
  name: string;
  status: string;
  accountStatus: string;
  accountStatusTone: AdminTone;
  onboardingStatus: string;
  onboardingStatusTone: AdminTone;
  onboardingMeta: string;
  websiteStatus: string;
  websiteStatusTone: AdminTone;
  createdAt: string;
  createdAtIso: string;
}>;

const accountStatusLabels: Record<string, string> = {
  pending: "In afwachting",
  active: "Actief",
  disabled: "Inactief",
};

const onboardingStatusLabels: Record<string, string> = {
  draft: "In voorbereiding",
  submitted: "Ingediend",
  review_needed: "Aanvulling nodig",
  blocked: "Geblokkeerd",
  approved: "Goedgekeurd",
  reopened: "Heropend",
};

export function mapPlatformTenantList(response: PlatformTenantListResponse): readonly AdminTenantRow[] {
  return response.items.map(mapPlatformTenant);
}

export function mapPlatformTenant(tenant: PlatformTenant): AdminTenantRow {
  const accountStatus = accountStatusLabels[tenant.status] ?? "Onbekend";
  const onboardingStatus = tenant.onboarding
    ? onboardingStatusLabels[tenant.onboarding.status] ?? "Onbekend"
    : "Niet gestart";
  const websiteSummary = tenant.website_summary;

  return {
    id: tenant.id,
    name: tenant.name,
    status: tenant.status,
    accountStatus,
    accountStatusTone: getAccountStatusTone(tenant.status),
    onboardingStatus,
    onboardingStatusTone: getOnboardingStatusTone(tenant.onboarding?.status),
    onboardingMeta: tenant.onboarding
      ? `Versie ${tenant.onboarding.version} · bijgewerkt ${formatDateTime(tenant.onboarding.updated_at)}`
      : "Nog geen onboarding beschikbaar",
    websiteStatus: getWebsiteStatus(websiteSummary),
    websiteStatusTone: getWebsiteTone(websiteSummary),
    createdAt: formatDateTime(tenant.created_at),
    createdAtIso: tenant.created_at,
  };
}

export function getAccountStatusTone(status: string): AdminTone {
  if (status === "active") return "success";
  if (status === "pending") return "warning";
  if (status === "disabled") return "danger";
  return "neutral";
}

export function getOnboardingStatusTone(status: string | undefined): AdminTone {
  if (status === "approved") return "success";
  if (status === "review_needed" || status === "blocked") return "warning";
  if (status === "submitted" || status === "reopened") return "info";
  return "neutral";
}

function getWebsiteStatus(summary: PlatformTenant["website_summary"]): string {
  if (!summary) return "Niet beschikbaar";
  if (summary.total === 0) return "Geen website gekoppeld";
  return `${summary.active} actief van ${summary.total}`;
}

function getWebsiteTone(summary: PlatformTenant["website_summary"]): AdminTone {
  if (!summary || summary.total === 0) return "neutral";
  if (summary.active > 0) return "success";
  return "info";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Niet beschikbaar";

  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
