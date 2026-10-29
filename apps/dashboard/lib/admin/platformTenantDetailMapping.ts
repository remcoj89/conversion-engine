import type { AdminTone } from "../../app/admin/admin-types";
import type { PlatformTenantDetailResponse } from "../bff/platformTenantDetails";
import { getAccountStatusTone, getOnboardingStatusTone } from "./platformTenantMapping";

export type AdminTenantDetail = Readonly<{
  id: string;
  name: string;
  status: string;
  accountStatus: string;
  accountStatusTone: AdminTone;
  onboardingStatus: string;
  onboardingStatusTone: AdminTone;
  onboardingVersion: string;
  onboardingUpdatedAt: string;
  onboardingUpdatedAtIso: string | null;
  websiteStatus: string;
  websiteStatusTone: AdminTone;
  websiteTotal: string;
  websiteActive: string;
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
};

export function mapPlatformTenantDetail(tenant: PlatformTenantDetailResponse): AdminTenantDetail {
  const accountStatus = accountStatusLabels[tenant.status] ?? "Onbekend";
  const onboardingStatus = tenant.onboarding
    ? onboardingStatusLabels[tenant.onboarding.status] ?? "Onbekend"
    : "Niet gestart";

  return {
    id: tenant.id,
    name: tenant.name,
    status: tenant.status,
    accountStatus,
    accountStatusTone: getAccountStatusTone(tenant.status),
    onboardingStatus,
    onboardingStatusTone: getOnboardingStatusTone(tenant.onboarding?.status),
    onboardingVersion: tenant.onboarding ? `Versie ${tenant.onboarding.version}` : "Geen versie",
    onboardingUpdatedAt: tenant.onboarding ? formatDateTime(tenant.onboarding.updated_at) : "Niet gestart",
    onboardingUpdatedAtIso: tenant.onboarding?.updated_at ?? null,
    websiteStatus: tenant.website_summary.total === 0
      ? "Geen websites gekoppeld"
      : `${tenant.website_summary.active} actief van ${tenant.website_summary.total}`,
    websiteStatusTone: getWebsiteTone(tenant.website_summary),
    websiteTotal: String(tenant.website_summary.total),
    websiteActive: String(tenant.website_summary.active),
    createdAt: formatDateTime(tenant.created_at),
    createdAtIso: tenant.created_at,
  };
}

function getWebsiteTone(summary: PlatformTenantDetailResponse["website_summary"]): AdminTone {
  if (summary.total === 0) return "neutral";
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
