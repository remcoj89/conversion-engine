import type { ReactNode } from "react";

export type UiStateAction =
  | Readonly<{ kind: "link"; href: string; label: string }>
  | Readonly<{ kind: "button"; label: string; onClick: () => void }>;

export type TenantSelectionOption = Readonly<{
  id: string;
  name: string;
  role: "owner" | "tenant_admin" | "team_member";
}>;

function StateAction({ action }: { action: UiStateAction }) {
  if (action.kind === "link") {
    return (
      <a className="button button-primary ui-state-action" href={action.href}>
        {action.label}
      </a>
    );
  }

  return (
    <button className="button button-primary ui-state-action" type="button" onClick={action.onClick}>
      {action.label}
    </button>
  );
}

function StateContainer({
  children,
  className,
  role,
  live = "polite",
  busy = false,
}: {
  children: ReactNode;
  className: string;
  role: "status" | "alert";
  live?: "polite" | "assertive";
  busy?: boolean;
}) {
  return (
    <section className={`ui-state-container ${className}`} role={role} aria-live={live} aria-busy={busy}>
      {children}
    </section>
  );
}

export function LoadingState({
  title = "Vandaag wordt geladen",
  message = "We halen de klantomgeving en de beschikbare gegevens op.",
}: Readonly<{ title?: string; message?: string }>) {
  return (
    <StateContainer className="ui-state-loading" role="status" busy>
      <h2 className="ui-state-heading">{title}</h2>
      <p className="ui-state-message">{message}</p>
      <div className="ui-state-skeleton" aria-hidden="true">
        <span className="ui-state-skeleton-line ui-state-skeleton-line-short" />
        <div className="ui-state-skeleton-grid">
          <span className="ui-state-skeleton-card" />
          <span className="ui-state-skeleton-card" />
          <span className="ui-state-skeleton-card" />
        </div>
      </div>
    </StateContainer>
  );
}

export function UnauthenticatedState({
  message = "Meld je aan om je klantomgeving en Vandaag-overzicht te bekijken.",
}: Readonly<{ message?: string }>) {
  return (
    <StateContainer className="ui-state-unauthenticated" role="alert" live="assertive">
      <h2 className="ui-state-heading">Sessie vereist</h2>
      <p className="ui-state-message">{message}</p>
      <StateAction action={{ kind: "link", href: "/auth/login", label: "Aanmelden" }} />
    </StateContainer>
  );
}

export function ForbiddenState({
  message = "Je account heeft geen toegang tot deze klantomgeving. Neem contact op met Westend als dit niet klopt.",
}: Readonly<{ message?: string }>) {
  return (
    <StateContainer className="ui-state-forbidden" role="alert" live="assertive">
      <h2 className="ui-state-heading">Geen toegang</h2>
      <p className="ui-state-message">{message}</p>
    </StateContainer>
  );
}

export function UnavailableState({ onRetry }: { onRetry?: () => void }) {
  const action: UiStateAction = onRetry
    ? { kind: "button", label: "Opnieuw proberen", onClick: onRetry }
    : { kind: "link", href: "/", label: "Opnieuw proberen" };

  return (
    <StateContainer className="ui-state-unavailable" role="alert">
      <h2 className="ui-state-heading">Bron tijdelijk niet beschikbaar</h2>
      <p className="ui-state-message">
        De klantomgeving kan de gegevensbron nu niet bereiken. Probeer het opnieuw; je gegevens blijven veilig.
      </p>
      <StateAction action={action} />
    </StateContainer>
  );
}

export function EmptyState({
  title = "Bron nog niet gekoppeld",
  message = "Er is nog geen CRM-bron gekoppeld. Daarom tonen we geen aantallen of aanvragen als nul.",
}: Readonly<{ title?: string; message?: string }>) {
  return (
    <StateContainer className="ui-state-empty" role="status">
      <h2 className="ui-state-heading">{title}</h2>
      <p className="ui-state-message">{message}</p>
    </StateContainer>
  );
}

export function TenantSelectionState({
  memberships,
  onSelectTenant,
}: Readonly<{
  memberships: readonly TenantSelectionOption[];
  onSelectTenant: (tenantId: string) => void;
}>) {
  return (
    <StateContainer className="ui-state-tenant-selection" role="status">
      <h2 className="ui-state-heading">Kies een klantomgeving</h2>
      <p className="ui-state-message">
        Je account heeft toegang tot meerdere klantomgevingen. Kies waar je Vandaag wilt openen.
      </p>
      <div className="ui-state-tenant-list">
        {memberships.map((membership) => (
          <button
            className="button button-secondary ui-state-tenant-button"
            key={membership.id}
            type="button"
            onClick={() => onSelectTenant(membership.id)}
          >
            <strong>{membership.name}</strong>
            <span>{membership.role === "owner" ? "Eigenaar" : membership.role === "tenant_admin" ? "Tenantbeheerder" : "Teamlid"}</span>
          </button>
        ))}
      </div>
    </StateContainer>
  );
}
