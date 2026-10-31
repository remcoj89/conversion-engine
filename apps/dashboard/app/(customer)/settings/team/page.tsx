"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CustomerPage, StatusBadge } from "../../customer-ui";
import { EmptyState, ForbiddenState, LoadingState, UnauthenticatedState, UnavailableState } from "../../../ui-states";
import { useWorkspaceContext } from "../../../workspace-context";
import styles from "../../customer.module.css";
import {
  CRM_PERMISSION_KEYS,
  fetchTeamMembers,
  type CrmPermission,
  type TeamMember,
  type TeamMemberRole,
  type TeamMembersResult,
} from "./team-data";
import { updateCrmPermission, updateTeamMemberRole } from "./team-mutations";

const permissionLabels: Readonly<Record<CrmPermission, string>> = {
  "crm:read": "Bekijken",
  "crm:create": "Aanmaken",
  "crm:update": "Wijzigen",
  "crm:archive": "Archiveren",
};

const permissionHelp: Readonly<Record<CrmPermission, string>> = {
  "crm:read": "CRM-records bekijken",
  "crm:create": "Organisaties, contacten en leads toevoegen",
  "crm:update": "Bestaande CRM-records aanpassen",
  "crm:archive": "CRM-records archiveren",
};

type TeamPageState = Readonly<{ status: "loading" }> | TeamMembersResult;

export default function TeamSettingsPage() {
  const { fetch: workspaceFetch } = useWorkspaceContext();
  const [state, setState] = useState<TeamPageState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"success" | "error">("success");
  const [pendingRoles, setPendingRoles] = useState<Readonly<Record<string, Exclude<TeamMemberRole, "owner">>>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadTeamMembers() {
      const result = await fetchTeamMembers(workspaceFetch);
      if (cancelled) return;
      setState(result);
    }

    void loadTeamMembers();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, workspaceFetch]);

  const canManage = useMemo(
    () => state.status === "ready" && state.items.some((member) => member.role === "owner" || member.role === "tenant_admin"),
    [state],
  );

  async function handlePermissionChange(member: TeamMember, permission: CrmPermission, enabled: boolean) {
    setFeedback(null);
    setBusyKey(`${member.id}:${permission}`);
    const result = await updateCrmPermission(workspaceFetch, member.id, permission, enabled);
    setBusyKey(null);

    if (result.status === "success") {
      replaceMember(result.member);
      showFeedback("CRM-recht opgeslagen.", "success");
      return;
    }

    showFeedback(mutationErrorMessage(result.status), "error");
  }

  async function handleRoleChange(member: TeamMember) {
    const nextRole = pendingRoles[member.id];
    if (!nextRole || nextRole === member.role || member.role === "owner") return;

    const confirmed = window.confirm(
      `Weet je zeker dat ${member.label} de rol ${roleLabel(nextRole)} krijgt? De CRM-rechten worden opnieuw door de server beoordeeld.`,
    );
    if (!confirmed) {
      setPendingRoles((roles) => ({ ...roles, [member.id]: member.role === "owner" ? "team_member" : member.role }));
      return;
    }

    setFeedback(null);
    setBusyKey(`${member.id}:role`);
    const result = await updateTeamMemberRole(workspaceFetch, member.id, nextRole);
    setBusyKey(null);

    if (result.status === "success") {
      replaceMember(result.member);
      setPendingRoles((roles) => {
        const next = { ...roles };
        delete next[member.id];
        return next;
      });
      showFeedback("Rol opgeslagen.", "success");
      return;
    }

    showFeedback(mutationErrorMessage(result.status), "error");
  }

  function replaceMember(nextMember: TeamMember) {
    setState((current) => {
      if (current.status !== "ready") return current;
      return { status: "ready", items: current.items.map((member) => member.id === nextMember.id ? nextMember : member) };
    });
  }

  function showFeedback(message: string, tone: "success" | "error") {
    setFeedback(message);
    setFeedbackTone(tone);
  }

  function retry() {
    setFeedback(null);
    setState({ status: "loading" });
    setReloadKey((value) => value + 1);
  }

  return (
    <CustomerPage
      current="settings"
      title="Team & CRM-rechten"
      intro="Beheer wie binnen deze klantomgeving toegang heeft tot de CRM-onderdelen."
      actions={<Link className="button button-secondary" href="/settings">Terug naar instellingen</Link>}
    >
      <section className="card" aria-labelledby="team-help-title">
        <div className={styles.teamCardContent}>
          <h2 id="team-help-title">Alleen CRM-rechten</h2>
          <p>
            Deze pagina regelt alleen de vier CRM-rechten: bekijken, aanmaken, wijzigen en archiveren.
            De server blijft de uiteindelijke tenanttoegang controleren.
          </p>
          <p className={styles.teamMutedHelp}>
            Eigenaren en tenantbeheerders hebben vaste volledige CRM-toegang. Teamleden kunnen per recht worden aangepast.
          </p>
        </div>
      </section>

      {feedback ? <p className={`${styles.teamFeedback} ${feedbackTone === "error" ? styles.teamFeedbackError : styles.teamFeedbackSuccess}`} role={feedbackTone === "error" ? "alert" : "status"} aria-live="polite">{feedback}</p> : null}
      {state.status === "loading" ? <LoadingState title="Teamleden worden geladen" message="We halen de team- en CRM-rechten op." /> : null}
      {state.status === "unauthenticated" ? <UnauthenticatedState message="Meld je aan om team- en CRM-rechten te bekijken." /> : null}
      {state.status === "forbidden" ? <ForbiddenState message="Je account heeft geen toegang tot team- en CRM-rechten." /> : null}
      {state.status === "unavailable" ? <UnavailableState onRetry={retry} /> : null}
      {state.status === "ready" && state.items.length === 0 ? <EmptyState title="Nog geen teamleden" message="Er zijn nog geen teamleden beschikbaar in deze klantomgeving." /> : null}
      {state.status === "ready" && state.items.length > 0 && canManage ? (
        <TeamMembersTable
          members={state.items}
          busyKey={busyKey}
          pendingRoles={pendingRoles}
          onPermissionChange={handlePermissionChange}
          onRoleSelection={(memberId, role) => setPendingRoles((roles) => ({ ...roles, [memberId]: role }))}
          onRoleChange={handleRoleChange}
        />
      ) : null}
      {state.status === "ready" && state.items.length === 1 && !canManage ? (
        <TeamMemberStatus member={state.items[0]} />
      ) : null}
      {state.status === "ready" && state.items.length > 1 && !canManage ? (
        <ForbiddenState message="De persoonlijke teamstatus kon niet veilig worden bepaald. Vraag een eigenaar of tenantbeheerder om dit te controleren." />
      ) : null}
    </CustomerPage>
  );
}

function TeamMembersTable({
  members,
  busyKey,
  pendingRoles,
  onPermissionChange,
  onRoleSelection,
  onRoleChange,
}: Readonly<{
  members: readonly TeamMember[];
  busyKey: string | null;
  pendingRoles: Readonly<Record<string, Exclude<TeamMemberRole, "owner">>>;
  onPermissionChange: (member: TeamMember, permission: CrmPermission, enabled: boolean) => void;
  onRoleSelection: (memberId: string, role: Exclude<TeamMemberRole, "owner">) => void;
  onRoleChange: (member: TeamMember) => void;
}>) {
  return (
    <section aria-labelledby="team-members-title">
      <div className="section-heading">
        <h2 id="team-members-title">Teamleden</h2>
        <p>{members.length} teamleden met een CRM-status in deze klantomgeving.</p>
      </div>
      <div className={styles.teamTableWrap} role="region" aria-label="Teamleden en CRM-rechten" tabIndex={0}>
        <table className={styles.teamTable}>
          <caption className="visually-hidden">Teamleden en hun CRM-rechten</caption>
          <thead>
            <tr>
              <th scope="col">Teamlid</th>
              <th scope="col">Rol</th>
              <th scope="col">Status</th>
              {CRM_PERMISSION_KEYS.map((permission) => <th scope="col" key={permission}>{permissionLabels[permission]}</th>)}
              <th scope="col">Rolactie</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const fixedAccess = member.role === "owner" || member.role === "tenant_admin";
              const selectedRole = member.role === "owner" ? "team_member" : (pendingRoles[member.id] ?? member.role);

              return (
                <tr key={member.id}>
                  <td data-label="Teamlid"><strong>{member.label}</strong></td>
                  <td data-label="Rol"><StatusBadge tone={member.role === "team_member" ? "neutral" : "success"}>{roleLabel(member.role)}</StatusBadge></td>
                  <td data-label="Status"><StatusBadge tone={member.status === "active" ? "success" : "warning"}>{statusLabel(member.status)}</StatusBadge></td>
                  {CRM_PERMISSION_KEYS.map((permission) => (
                    <td data-label={permissionLabels[permission]} key={permission}>
                      <label className={styles.teamPermission}>
                        <span className="visually-hidden">{permissionHelp[permission]} voor {member.label}</span>
                        <input
                          type="checkbox"
                          checked={fixedAccess || member.permissions[permission]}
                          disabled={fixedAccess || busyKey !== null}
                          onChange={(event) => onPermissionChange(member, permission, event.currentTarget.checked)}
                        />
                        <span aria-hidden="true">{fixedAccess || member.permissions[permission] ? "Aan" : "Uit"}</span>
                      </label>
                    </td>
                  ))}
                  <td data-label="Rolactie">
                    {member.role === "owner" ? <span className={styles.teamMutedHelp}>Eigenaar kan niet worden gewijzigd.</span> : (
                      <div className={styles.teamRoleAction}>
                        <label className="visually-hidden" htmlFor={`role-${member.id}`}>Nieuwe rol voor {member.label}</label>
                        <select id={`role-${member.id}`} className="field-control" value={selectedRole} disabled={busyKey !== null} onChange={(event) => onRoleSelection(member.id, event.currentTarget.value as Exclude<TeamMemberRole, "owner">)}>
                          <option value="team_member">Teamlid</option>
                          <option value="tenant_admin">Tenantbeheerder</option>
                        </select>
                        <button className="button button-secondary button-small" type="button" disabled={busyKey !== null || selectedRole === member.role} onClick={() => onRoleChange(member)}>
                          {busyKey === `${member.id}:role` ? "Opslaan…" : "Rol opslaan"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={styles.teamMutedHelp}>Een rolwijziging vraagt altijd om een bevestiging. Een eigenaar kan niet via deze pagina worden gewijzigd.</p>
    </section>
  );
}

function TeamMemberStatus({ member }: Readonly<{ member: TeamMember | undefined }>) {
  if (!member) return null;

  return (
    <section className="card" aria-labelledby="own-crm-status-title">
      <div className={styles.teamCardContent}>
        <div className="section-heading">
          <h2 id="own-crm-status-title">Jouw CRM-status</h2>
          <p>Je ziet hier alleen je eigen status. Rechten kunnen door een eigenaar of tenantbeheerder worden aangepast.</p>
        </div>
        <div className={styles.teamStatusGrid}>
          <div className={styles.teamStatusItem}><span>Account</span><strong>{member.label}</strong></div>
          <div className={styles.teamStatusItem}><span>Rol</span><strong>{roleLabel(member.role)}</strong></div>
          <div className={styles.teamStatusItem}><span>Status</span><strong>{statusLabel(member.status)}</strong></div>
        </div>
        <ul className={styles.teamPermissionList} aria-label="Jouw CRM-rechten">
          {CRM_PERMISSION_KEYS.map((permission) => <li key={permission}><span>{permissionHelp[permission]}</span><StatusBadge tone={member.permissions[permission] ? "success" : "neutral"}>{member.permissions[permission] ? "Toegestaan" : "Niet toegestaan"}</StatusBadge></li>)}
        </ul>
      </div>
    </section>
  );
}

function roleLabel(role: TeamMemberRole): string {
  if (role === "owner") return "Eigenaar";
  if (role === "tenant_admin") return "Tenantbeheerder";
  return "Teamlid";
}

function statusLabel(status: TeamMember["status"]): string {
  if (status === "active") return "Actief";
  if (status === "invited") return "Uitgenodigd";
  return "Uitgeschakeld";
}

function mutationErrorMessage(status: Exclude<TeamMembersResult["status"], "ready" | "loading"> | "invalid" | "not_found"): string {
  if (status === "unauthenticated") return "Je sessie is verlopen. Meld je opnieuw aan.";
  if (status === "forbidden") return "Je hebt geen toestemming om deze wijziging uit te voeren.";
  if (status === "invalid") return "De wijziging is niet geldig.";
  if (status === "not_found") return "Dit teamlid bestaat niet meer.";
  return "De wijziging kon niet worden opgeslagen. Probeer het opnieuw.";
}
