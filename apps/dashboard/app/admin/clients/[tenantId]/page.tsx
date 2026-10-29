import Link from "next/link";
import { AdminBadge, AdminNotice, AdminPageHeader, AdminSection, AdminStat } from "../../admin-components";
import { mapPlatformTenantDetail, type AdminTenantDetail } from "../../../../lib/admin/platformTenantDetailMapping";
import { type PlatformTenantDetailResult } from "../../../../lib/bff/platformTenantDetails";
import { readPlatformTenantDetail } from "../../../../lib/bff/platformTenantDetailsServer";
import {
  ForbiddenState,
  UnauthenticatedState,
  UnavailableState,
} from "../../../ui-states";
import { ClientInvitationForm, ClientLifecycleActions } from "../admin-client-actions";

export type AdminClientDetailPageState =
  | "ready"
  | "not_found"
  | "unauthenticated"
  | "forbidden"
  | "unavailable";

export function getAdminClientDetailPageState(
  result: PlatformTenantDetailResult,
): AdminClientDetailPageState {
  if (result.status === "unauthenticated") return "unauthenticated";
  if (result.status === "forbidden") return "forbidden";
  if (result.status === "not_found" || result.status === "invalid_tenant_id") return "not_found";
  if (result.status !== "ready") return "unavailable";
  return "ready";
}

export default async function AdminClientDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const result = await readPlatformTenantDetail(tenantId);
  const state = getAdminClientDetailPageState(result);

  if (state === "unauthenticated") {
    return <UnauthenticatedState message="Meld je aan om het Westend klantdetail te bekijken." />;
  }
  if (state === "forbidden") {
    return <ForbiddenState message="Je account heeft geen Platform Admin-recht voor klantdetails." />;
  }
  if (state === "not_found") {
    return <AdminClientNotFoundState tenantId={tenantId} />;
  }
  if (state === "unavailable" || result.status !== "ready") {
    return <UnavailableState />;
  }

  return <AdminClientDetailView detail={mapPlatformTenantDetail(result.data)} />;
}

function AdminClientDetailView({ detail }: { detail: AdminTenantDetail }) {
  return (
    <div className="admin-page">
      <nav className="admin-breadcrumb" aria-label="Kruimelpad">
        <Link href="/admin/clients">Klanten</Link>
        <span aria-hidden="true">/</span>
        <strong>{detail.name}</strong>
      </nav>

      <AdminPageHeader
        eyebrow="Westend beheer · Platform Admin"
        title={detail.name}
        description="Operationeel klantdetail voor Platform Admin. Deze pagina toont alleen metadata die veilig beschikbaar is voor beheer."
        actions={<Link href="/admin/clients" className="button button-secondary">← Terug naar klanten</Link>}
      />

      <AdminNotice tone="info">
        <strong>Leescontext.</strong> Dit detail bevat geen klantantwoorden, Project Brief, leads, memberships, identities, reviewnotities, auditinhoud of previewlinks.
      </AdminNotice>

      <div className="admin-stat-grid">
        <AdminStat label="Klantstatus" value={detail.accountStatus} detail="Operationele status" tone={detail.accountStatusTone} />
        <AdminStat label="Onboarding" value={detail.onboardingStatus} detail={`${detail.onboardingVersion} · ${detail.onboardingUpdatedAt}`} tone={detail.onboardingStatusTone} />
        <AdminStat label="Websites" value={detail.websiteStatus} detail={`${detail.websiteActive} actief · ${detail.websiteTotal} totaal`} tone={detail.websiteStatusTone} />
        <AdminStat label="Aangemaakt" value={detail.createdAt} detail="Tenantregistratie" tone="neutral" />
      </div>

      <AdminSection title="Klantcontext" description="Identiteit en operationele status van deze tenant in Westend beheer.">
        <div className="card admin-detail-card">
          <div className="admin-client-detail-heading">
            <div>
              <p className="admin-detail-kicker">Tenant</p>
              <h2>{detail.name}</h2>
              <p className="admin-mono">{detail.id}</p>
            </div>
            <AdminBadge tone={detail.accountStatusTone}>{detail.accountStatus}</AdminBadge>
          </div>
          <dl className="admin-detail-list admin-detail-list-compact">
            <div>
              <dt>Tenant-ID</dt>
              <dd className="admin-mono">{detail.id}</dd>
            </div>
            <div>
              <dt>Accountstatus</dt>
              <dd><AdminBadge tone={detail.accountStatusTone}>{detail.accountStatus}</AdminBadge></dd>
            </div>
            <div>
              <dt>Aangemaakt</dt>
              <dd><time dateTime={detail.createdAtIso}>{detail.createdAt}</time></dd>
            </div>
          </dl>
        </div>
        <ClientLifecycleActions tenantId={detail.id} name={detail.name} status={detail.status} />
        <ClientInvitationForm tenantId={detail.id} disabled={detail.status === "disabled"} />
      </AdminSection>

      <div className="admin-detail-grid">
        <AdminSection title="Onboarding" description="Alleen de actuele status, versie en wijzigingsdatum zijn beschikbaar.">
          <div className="card admin-detail-card">
            <div className="admin-card-heading">
              <div>
                <h3>{detail.onboardingStatus}</h3>
                <p>{detail.onboardingVersion}</p>
              </div>
              <AdminBadge tone={detail.onboardingStatusTone}>{detail.onboardingStatus}</AdminBadge>
            </div>
            <dl className="admin-detail-list admin-detail-list-compact">
              <div>
                <dt>Status</dt>
                <dd>{detail.onboardingStatus}</dd>
              </div>
              <div>
                <dt>Versie</dt>
                <dd>{detail.onboardingVersion}</dd>
              </div>
              <div>
                <dt>Laatst bijgewerkt</dt>
                <dd>
                  {detail.onboardingUpdatedAtIso
                    ? <time dateTime={detail.onboardingUpdatedAtIso}>{detail.onboardingUpdatedAt}</time>
                    : detail.onboardingUpdatedAt}
                </dd>
              </div>
            </dl>
          </div>
        </AdminSection>

        <AdminSection title="Websites" description="Veilige aantallen uit de geregistreerde websites voor deze tenant.">
          <div className="card admin-detail-card">
            <div className="admin-card-heading">
              <div>
                <h3>{detail.websiteStatus}</h3>
                <p>Websitekoppelingen binnen deze tenant</p>
              </div>
              <AdminBadge tone={detail.websiteStatusTone}>{detail.websiteActive} actief</AdminBadge>
            </div>
            <dl className="admin-detail-list admin-detail-list-compact">
              <div>
                <dt>Totaal geregistreerd</dt>
                <dd>{detail.websiteTotal}</dd>
              </div>
              <div>
                <dt>Actief</dt>
                <dd>{detail.websiteActive}</dd>
              </div>
            </dl>
          </div>
        </AdminSection>
      </div>
    </div>
  );
}

function AdminClientNotFoundState({ tenantId }: { tenantId: string }) {
  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Westend beheer · Platform Admin"
        title="Klant niet gevonden"
        description="De gevraagde tenant bestaat niet of is niet beschikbaar in de operationele Platform Admin-bron."
        actions={<Link href="/admin/clients" className="button button-secondary">← Terug naar klanten</Link>}
      />
      <div className="card admin-empty-state" role="status">
        <strong>Geen klantdetail beschikbaar</strong>
        <span>Tenant-ID: <span className="admin-mono">{tenantId}</span></span>
        <span>Er is geen operationele metadata teruggegeven. Controleer de klantenlijst en probeer het opnieuw.</span>
      </div>
    </div>
  );
}
