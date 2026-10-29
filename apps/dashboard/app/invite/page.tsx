"use client";

import { useEffect, useRef, useState } from "react";

type InviteState =
  | { kind: "preparing" }
  | { kind: "missing" }
  | { kind: "accepting" }
  | { kind: "unauthenticated" }
  | { kind: "expired" }
  | { kind: "revoked" }
  | { kind: "invalid" }
  | { kind: "forbidden" }
  | { kind: "unavailable" }
  | { kind: "success"; tenantName: string };

type AcceptedInvitation = Readonly<{
  tenant_id: string;
  tenant_name: string;
  status: "active";
}>;

export default function InvitePage() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [state, setState] = useState<InviteState>({ kind: "preparing" });
  const [loginStarted, setLoginStarted] = useState(false);
  const attemptedToken = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const fragment = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
      if (fragment) {
        window.history.replaceState(null, "", window.location.pathname);
      }
      setToken(fragment || null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (token === undefined) return;
    if (token === null) return;
    if (attemptedToken.current === token) return;
    attemptedToken.current = token;
    void acceptInvitation(token);
  }, [token]);

  async function acceptInvitation(invitationToken: string) {
    if (invitationToken.length > 4096) {
      setState({ kind: "invalid" });
      return;
    }

    setState({ kind: "accepting" });
    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: invitationToken }),
      });
      const payload = await response.json().catch(() => null) as Partial<AcceptedInvitation> & { error?: unknown } | null;

      if (response.ok && isAcceptedInvitation(payload)) {
        setState({ kind: "success", tenantName: payload.tenant_name });
        return;
      }

      setState(mapInvitationError(response.status, payload?.error));
    } catch {
      setState({ kind: "unavailable" });
    }
  }

  const retry = () => {
    if (!token) return;
    attemptedToken.current = null;
    void acceptInvitation(token);
  };

  return (
    <section className="invite-page" aria-labelledby="invite-title">
      <div className="invite-card">
        <p className="eyebrow">Conversion Engine</p>
        <h1 id="invite-title">Uitnodiging voor je klantomgeving</h1>
        {renderInviteState(token === null && state.kind === "preparing" ? { kind: "missing" } : state, {
          loginStarted,
          onLoginStarted: () => setLoginStarted(true),
          onRetry: retry,
        })}
      </div>
    </section>
  );
}

function renderInviteState(
  state: InviteState,
  actions: Readonly<{ loginStarted: boolean; onLoginStarted: () => void; onRetry: () => void }>,
) {
  switch (state.kind) {
    case "preparing":
      return <InviteMessage title="Uitnodiging voorbereiden…" message="We lezen de beveiligde uitnodiging uit je browser." busy />;
    case "missing":
      return <InviteMessage title="Uitnodigingslink ontbreekt" message="Open de volledige eenmalige link die je van Westend hebt ontvangen." />;
    case "accepting":
      return <InviteMessage title="Uitnodiging controleren…" message="We koppelen je account veilig aan de klantomgeving." busy />;
    case "unauthenticated":
      return (
        <div className="invite-message" role="alert" aria-live="assertive">
          <h2>Meld je aan om verder te gaan</h2>
          <p>Log in met je ZITADEL-account. De uitnodigingslink blijft in dit browservenster staan en wordt niet opgeslagen in localStorage of sessionStorage.</p>
          <a
            className="button button-primary"
            href="/auth/login?returnTo=%2Finvite"
            target="_blank"
            rel="noopener noreferrer"
            onClick={actions.onLoginStarted}
          >
            Aanmelden in nieuw venster
          </a>
          <p className="invite-help">Laat dit venster open, rond de aanmelding af en klik daarna hier op “Opnieuw controleren”.</p>
          {actions.loginStarted ? <button className="button button-secondary" type="button" onClick={actions.onRetry}>Opnieuw controleren</button> : null}
        </div>
      );
    case "expired":
      return <InviteMessage title="Uitnodiging verlopen" message="Vraag Westend om een nieuwe uitnodigingslink." />;
    case "revoked":
      return <InviteMessage title="Uitnodiging ingetrokken" message="Deze link is niet meer geldig. Vraag Westend om een nieuwe uitnodiging." />;
    case "invalid":
      return <InviteMessage title="Ongeldige uitnodiging" message="Controleer of je de volledige link gebruikt. Vraag Westend om hulp als het probleem blijft." />;
    case "forbidden":
      return <InviteMessage title="Geen toegang" message="Je account mag deze uitnodiging niet accepteren. Controleer of je met het bedoelde account bent aangemeld." />;
    case "unavailable":
      return <InviteMessage title="Uitnodiging tijdelijk niet beschikbaar" message="De uitnodiging kon nu niet worden verwerkt. Probeer het opnieuw." action={<button className="button button-secondary" type="button" onClick={actions.onRetry}>Opnieuw proberen</button>} />;
    case "success":
      return (
        <div className="invite-message" role="status" aria-live="polite">
          <h2>Je klantomgeving is geactiveerd</h2>
          <p>Je hebt toegang tot <strong>{state.tenantName}</strong>. Je kunt nu naar het dashboard gaan.</p>
          <a className="button button-primary" href="/">Naar klantdashboard</a>
        </div>
      );
  }
}

function InviteMessage({
  title,
  message,
  busy = false,
  action,
}: Readonly<{ title: string; message: string; busy?: boolean; action?: React.ReactNode }>) {
  return (
    <div className="invite-message" role={busy ? "status" : "alert"} aria-live="polite" aria-busy={busy}>
      <h2>{title}</h2>
      <p>{message}</p>
      {action}
    </div>
  );
}

function mapInvitationError(status: number, error: unknown): InviteState {
  if (status === 401 || error === "unauthorized") return { kind: "unauthenticated" };
  if (status === 403 || error === "forbidden") return { kind: "forbidden" };
  if (error === "invitation_revoked") return { kind: "revoked" };
  if (error === "invalid_invitation" || error === "invalid_token" || error === "invitation_not_found") return { kind: "invalid" };
  if (error === "invitation_expired") return { kind: "expired" };
  if (status === 410 || error === "invitation_unavailable") return { kind: "invalid" };
  if (status === 409 || error === "invitation_already_accepted") return { kind: "invalid" };
  if (status === 503 || status === 502 || error === "api_unavailable") return { kind: "unavailable" };
  return { kind: "invalid" };
}

function isAcceptedInvitation(value: Partial<AcceptedInvitation> & { error?: unknown } | null): value is AcceptedInvitation {
  return Boolean(
    value &&
    typeof value.tenant_id === "string" &&
    typeof value.tenant_name === "string" &&
    value.status === "active",
  );
}
