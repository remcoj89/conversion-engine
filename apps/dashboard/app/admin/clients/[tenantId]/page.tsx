import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminBadge, AdminDemoFooter, AdminNotice, AdminPageHeader, AdminSection, AdminStat } from "../../admin-components";
import { adminAuditEvents, adminClients } from "../../admin-data";

export function generateStaticParams() {
  return adminClients.map((client) => ({ tenantId: client.id }));
}

function getOnboardingTone(onboardingKey: string) {
  if (onboardingKey === "approved" || onboardingKey === "submitted") return "success" as const;
  if (onboardingKey === "review-needed") return "warning" as const;
  return "info" as const;
}

export default async function AdminClientDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const client = adminClients.find((candidate) => candidate.id === tenantId);

  if (!client) {
    notFound();
  }

  const clientEvents = adminAuditEvents.filter((event) => event.tenant === client.id).slice(0, 4);

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow={`Westend beheeromgeving · ${client.name}`}
        title="Klantdetail"
        description={`${client.industry} · tenant ${client.id}. Bekijk de actuele beheercontext en open het relevante Westend-onderdeel.`}
        actions={
          <>
            <Link href="/admin/clients" className="button button-secondary">← Terug naar klanten</Link>
            <Link href="/" className="button button-secondary admin-readonly-action" aria-label={`Open klantweergave van ${client.name}, alleen lezen`}>
              <span>Open klantweergave</span>
              <AdminBadge tone="neutral">Alleen lezen</AdminBadge>
            </Link>
          </>
        }
      />

      <AdminNotice tone="info">
        <strong>Leescontext.</strong> Dit demo-detail toont Westend-beheerdata voor {client.name}. De knop “Open klantweergave” is read-only; deze demo-routing claimt geen echte tenantselectie of autorisatie.
      </AdminNotice>

      <div className="admin-stat-grid">
        <AdminStat label="Klantstatus" value={client.status} detail={client.service} tone={client.statusTone} />
        <AdminStat label="Onboarding" value={client.onboarding} detail={client.onboardingProgress} tone={getOnboardingTone(client.onboardingKey)} />
        <AdminStat label="Website" value={client.websiteEnvironment} detail={`${client.website} · ${client.websiteVersion}`} tone={client.websiteEnvironment === "Live" ? "success" : "info"} />
        <AdminStat label="Monitoring" value={client.monitoringStatus} detail={client.websiteLastCheck} tone={client.monitoringTone} />
      </div>

      <AdminSection title="Klantcontext" description="De kerngegevens die Westend gebruikt om deze tenant te vinden en te beheren.">
        <div className="card admin-detail-card">
          <div className="admin-client-detail-heading">
            <div>
              <p className="admin-detail-kicker">Tenant</p>
              <h2>{client.name}</h2>
              <p>{client.industry} · <span className="admin-mono">{client.id}</span></p>
            </div>
            <AdminBadge tone={client.statusTone}>{client.status}</AdminBadge>
          </div>
          <dl className="admin-detail-list">
            <div>
              <dt>Eigenaar</dt>
              <dd>{client.owner}</dd>
            </div>
            <div>
              <dt>Dienst</dt>
              <dd>{client.service}</dd>
            </div>
            <div>
              <dt>Laatst bijgewerkt</dt>
              <dd>{client.updatedAt}</dd>
            </div>
            <div>
              <dt>Domein</dt>
              <dd className="admin-mono">{client.website}</dd>
            </div>
          </dl>
        </div>
      </AdminSection>

      <div className="admin-detail-grid">
        <AdminSection title="Onboarding" description="Voortgang en huidige beoordelingsstatus van de intake.">
          <div className="card admin-detail-card">
            <div className="admin-card-heading">
              <div>
                <h3>{client.onboarding}</h3>
                <p>{client.onboardingProgress} · laatste wijziging {client.updatedAt}</p>
              </div>
              <AdminBadge tone={getOnboardingTone(client.onboardingKey)}>{client.onboarding}</AdminBadge>
            </div>
            <div className="admin-progress" aria-label={`Onboardingvoortgang: ${client.onboardingProgress}`}>
              <div className="admin-progress-track"><span className={client.onboardingKey === "approved" || client.onboardingKey === "submitted" ? "admin-progress-fill-100" : "admin-progress-fill-75"} /></div>
              <div className="admin-progress-labels"><span>Intake</span><span>Review</span><span>Vrijgave</span></div>
            </div>
            <Link href="/admin/review#project-brief" className="button button-secondary button-small">Open Project Brief Review</Link>
          </div>
        </AdminSection>

        <AdminSection title="Website & monitoring" description="Technische omgeving, releasegate en laatste bekende controle.">
          <div className="card admin-detail-card">
            <dl className="admin-detail-list admin-detail-list-compact">
              <div>
                <dt>Omgeving</dt>
                <dd><AdminBadge tone={client.websiteEnvironment === "Live" ? "success" : "info"}>{client.websiteEnvironment}</AdminBadge></dd>
              </div>
              <div>
                <dt>Releasegate</dt>
                <dd>{client.websiteGate}</dd>
              </div>
              <div>
                <dt>Websiteversie</dt>
                <dd className="admin-mono">{client.websiteVersion}</dd>
              </div>
              <div>
                <dt>Monitoring</dt>
                <dd><AdminBadge tone={client.monitoringTone}>{client.monitoringStatus}</AdminBadge></dd>
              </div>
            </dl>
            <p className="admin-detail-note">{client.monitoringDetail}. Laatste check: {client.websiteLastCheck}.</p>
            {client.monitoringTone === "warning" ? (
              <AdminNotice tone="warning"><strong>Controle vereist.</strong> Open monitoring voor het bestaande incidentoverzicht.</AdminNotice>
            ) : null}
          </div>
        </AdminSection>
      </div>

      <AdminSection title="Recente audit- en review-events" description="Leesbare demo-events uit de bestaande audit- en reviewcontext van deze tenant.">
        <div className="card admin-detail-card">
          {clientEvents.length > 0 ? (
            <ol className="admin-event-list">
              {clientEvents.map((event) => (
                <li key={event.id} className="admin-event-item">
                  <span className="admin-event-marker" aria-hidden="true" />
                  <div className="admin-event-content">
                    <div className="admin-event-meta"><time>{event.time}</time><span className="admin-mono">{event.id}</span></div>
                    <strong>{event.action}</strong>
                    <span>{event.reason}</span>
                    <small>{event.actor} · {event.actorRole} · {event.version} · {event.source}</small>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="admin-empty-state"><strong>Geen events in demo-data</strong><span>Voor deze tenant is nog geen audit- of review-event beschikbaar.</span></div>
          )}
          <div className="admin-action-row">
            <Link href="/admin/audit" className="button button-secondary button-small">Bekijk audit & versies</Link>
          </div>
        </div>
      </AdminSection>

      <AdminSection title="Beheeracties" description="Navigatie naar bestaande beheeronderdelen. Deze demo voert geen mutaties uit.">
        <div className="admin-action-grid">
          <Link href="/admin/review#project-brief" className="card admin-action-card">
            <span>Onboarding & review</span>
            <strong>Open Project Brief Review</strong>
            <small>Bekijk broncontext, blokkades en vrijgavegates.</small>
          </Link>
          <Link href="/admin/websites" className="card admin-action-card">
            <span>Websiteproductie</span>
            <strong>Open websiteportfolio</strong>
            <small>Bekijk omgeving, versie en productieprincipes.</small>
          </Link>
          <Link href="/admin/monitoring" className="card admin-action-card">
            <span>Kwaliteit</span>
            <strong>Open monitoring</strong>
            <small>Bekijk health checks en incidenten voor alle klanten.</small>
          </Link>
        </div>
      </AdminSection>

      <AdminDemoFooter />
    </div>
  );
}
