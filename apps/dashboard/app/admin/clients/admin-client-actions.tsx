"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type MutationState = Readonly<{
  busy: boolean;
  error: string | null;
  success: string | null;
}>;

type InvitationState = Readonly<{
  busy: boolean;
  error: string | null;
  success: string | null;
  inviteUrl: string | null;
  expiresAt: string | null;
}>;

const initialState: MutationState = { busy: false, error: null, success: null };
const initialInvitationState: InvitationState = { busy: false, error: null, success: null, inviteUrl: null, expiresAt: null };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const errorMessages: Record<string, string> = {
  invalid_body: "Controleer de invoer en probeer het opnieuw.",
  invalid_tenant_id: "Deze klant-ID is ongeldig.",
  unauthorized: "Je sessie is verlopen. Meld je opnieuw aan.",
  forbidden: "Je hebt geen toestemming voor deze beheeractie.",
  not_found: "Deze klant bestaat niet meer.",
  api_unavailable: "De beheeractie is tijdelijk niet beschikbaar.",
  invitation_exists: "Er staat al een actieve uitnodiging voor deze klant.",
  tenant_unavailable: "Deze klant is nog niet beschikbaar voor uitnodigingen.",
  invalid_invitation: "Deze uitnodiging is niet geldig.",
};

export function CreateClientForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [state, setState] = useState(initialState);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runMutation({
      url: "/api/admin/clients",
      method: "POST",
      body: { name },
      setState,
      success: "Klant aangemaakt.",
      onSuccess: () => {
        setName("");
        router.refresh();
      },
    });
  }

  return (
    <form className="admin-client-action-form" onSubmit={submit} aria-label="Klant toevoegen">
      <label htmlFor="new-client-name">Nieuwe klant</label>
      <div className="admin-client-action-controls">
        <input
          id="new-client-name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Bedrijfsnaam"
          maxLength={200}
          required
          disabled={state.busy}
        />
        <button type="submit" className="button button-primary" disabled={state.busy}>
          {state.busy ? "Bezig…" : "Klant toevoegen"}
        </button>
      </div>
      <MutationFeedback state={state} />
    </form>
  );
}

export function ClientLifecycleActions({ tenantId, name, status }: { tenantId: string; name: string; status: string }) {
  const router = useRouter();
  const [newName, setNewName] = useState(name);
  const [state, setState] = useState(initialState);
  const isDisabled = status === "disabled";

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runMutation({
      url: `/api/admin/clients/${encodeURIComponent(tenantId)}`,
      method: "PATCH",
      body: { name: newName },
      setState,
      success: "Klantnaam bijgewerkt.",
      onSuccess: () => router.refresh(),
    });
  }

  async function changeStatus() {
    const action = isDisabled ? "reactivate" : "disable";
    if (!isDisabled && !window.confirm("Klant uitschakelen? De klant blijft bewaard, maar verliest direct toegang.")) {
      return;
    }

    await runMutation({
      url: `/api/admin/clients/${encodeURIComponent(tenantId)}/${action}`,
      method: "POST",
      body: {},
      setState,
      success: isDisabled ? "Klant geheractiveerd." : "Klant uitgeschakeld.",
      onSuccess: () => router.refresh(),
    });
  }

  return (
    <div className="admin-client-actions" aria-label="Klantbeheer">
      <form className="admin-client-action-form admin-client-rename-form" onSubmit={rename}>
        <label htmlFor="client-name">Klantnaam wijzigen</label>
        <div className="admin-client-action-controls">
          <input
            id="client-name"
            name="name"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            maxLength={200}
            required
            disabled={state.busy}
          />
          <button type="submit" className="button button-secondary" disabled={state.busy || newName.trim() === name.trim()}>
            Opslaan
          </button>
        </div>
      </form>
      <div className="admin-client-status-action">
        <span className="admin-client-action-label">Accountstatus</span>
        <button
          type="button"
          className={isDisabled ? "button button-primary" : "button button-secondary"}
          onClick={changeStatus}
          disabled={state.busy}
        >
          {state.busy ? "Bezig…" : isDisabled ? "Klant heractiveren" : "Klant uitschakelen"}
        </button>
        <span className="admin-client-action-help">
          {isDisabled ? "Toegang kan opnieuw worden geactiveerd." : "De klant blijft bewaard en verliest toegang."}
        </span>
      </div>
      <MutationFeedback state={state} />
    </div>
  );
}

export function ClientInvitationForm({ tenantId, disabled }: { tenantId: string; disabled: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<InvitationState>(initialInvitationState);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setState({ ...initialInvitationState, error: "Vul een geldig e-mailadres in." });
      return;
    }

    setState({ ...initialInvitationState, busy: true });
    setCopyState("idle");
    try {
      const response = await fetch(`/api/admin/clients/${encodeURIComponent(tenantId)}/invitations`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const payload = await response.json().catch(() => null) as {
        invitation_id?: unknown;
        expires_at?: unknown;
        invite_url?: unknown;
        error?: unknown;
      } | null;

      if (!response.ok) {
        const code = payload && typeof payload.error === "string" ? payload.error : "api_unavailable";
        setState({ ...initialInvitationState, error: errorMessages[code] ?? errorMessages.api_unavailable });
        return;
      }

      if (
        !payload ||
        typeof payload.invite_url !== "string" ||
        typeof payload.expires_at !== "string"
      ) {
        setState({ ...initialInvitationState, error: errorMessages.api_unavailable });
        return;
      }

      setEmail("");
      setState({ busy: false, error: null, success: "Uitnodiging aangemaakt. Deel de link veilig met de klant.", inviteUrl: payload.invite_url, expiresAt: payload.expires_at });
    } catch {
      setState({ ...initialInvitationState, error: errorMessages.api_unavailable });
    }
  }

  async function copyInviteUrl() {
    if (!state.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(state.inviteUrl);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="admin-client-actions admin-client-invitation">
      <div>
        <h3>Eigenaar uitnodigen</h3>
        <p className="admin-client-action-help">Maak een eenmalige uitnodigingslink aan. Er wordt nog geen e-mail verzonden.</p>
      </div>
      <form className="admin-client-action-form" onSubmit={submit} aria-label="Klant uitnodigen">
        <label htmlFor="client-invitation-email">E-mailadres van de klant</label>
        <div className="admin-client-action-controls">
          <input
            id="client-invitation-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="klant@bedrijf.nl"
            maxLength={320}
            required
            disabled={disabled || state.busy}
          />
          <button type="submit" className="button button-primary" disabled={disabled || state.busy}>
            {state.busy ? "Bezig…" : "Uitnodigingslink maken"}
          </button>
        </div>
      </form>
      {disabled ? <p className="admin-client-action-help">Deze klant is uitgeschakeld; maak eerst opnieuw actief.</p> : null}
      <div className="admin-client-action-feedback" aria-live="polite" role={state.error ? "alert" : undefined}>
        {state.error ? <span className="admin-client-action-error">{state.error}</span> : null}
        {state.success ? <span className="admin-client-action-success">{state.success}</span> : null}
      </div>
      {state.inviteUrl ? (
        <div className="admin-invitation-result" aria-label="Aangemaakte uitnodigingslink">
          <label htmlFor="client-invitation-link">Eenmalige link</label>
          <div className="admin-client-action-controls">
            <input id="client-invitation-link" value={state.inviteUrl} readOnly aria-describedby="client-invitation-warning" />
            <button type="button" className="button button-secondary" onClick={copyInviteUrl}>
              Link kopiëren
            </button>
          </div>
          <p id="client-invitation-warning" className="admin-invitation-warning">
            Behandel deze link als een wachtwoord. Deel hem alleen via een veilig kanaal; hij kan één keer worden gebruikt en verloopt op {formatInvitationDate(state.expiresAt)}.
          </p>
          <p className="admin-client-action-help" aria-live="polite">
            {copyState === "copied" ? "Link gekopieerd." : copyState === "failed" ? "Kopiëren is niet gelukt. Selecteer de link handmatig." : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function MutationFeedback({ state }: { state: MutationState }) {
  return (
    <div className="admin-client-action-feedback" aria-live="polite" role={state.error ? "alert" : undefined}>
      {state.error ? <span className="admin-client-action-error">{state.error}</span> : null}
      {state.success ? <span className="admin-client-action-success">{state.success}</span> : null}
    </div>
  );
}

async function runMutation({
  url,
  method,
  body,
  setState,
  success,
  onSuccess,
}: {
  url: string;
  method: "PATCH" | "POST";
  body: Readonly<Record<string, string>>;
  setState: (state: MutationState) => void;
  success: string;
  onSuccess: () => void;
}) {
  setState({ busy: true, error: null, success: null });
  try {
    const response = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null) as { error?: unknown } | null;
    if (!response.ok) {
      const code = payload && typeof payload.error === "string" ? payload.error : "api_unavailable";
      setState({ busy: false, error: errorMessages[code] ?? errorMessages.api_unavailable, success: null });
      return;
    }
    setState({ busy: false, error: null, success });
    onSuccess();
  } catch {
    setState({ busy: false, error: errorMessages.api_unavailable, success: null });
  }
}

function formatInvitationDate(value: string | null): string {
  if (!value) return "binnen de geldigheidstermijn";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "binnen de geldigheidstermijn";
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
