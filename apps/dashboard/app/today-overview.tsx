"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  EmptyState,
  ForbiddenState,
  LoadingState,
  TenantSelectionState,
  UnauthenticatedState,
  UnavailableState,
} from "./ui-states";
import type { LeadRecord } from "../lib/bff/leads";

export const MAX_DIRECT_FOLLOW_UP_ITEMS = 5;

type TodayActionCard = Readonly<{
  id: string;
  label: string;
  value: number | null;
  status: "available" | "not-connected";
  source: string;
}>;

type TodayFollowUpItem = Readonly<Pick<LeadRecord, "id" | "name" | "message" | "source"> & {
  createdAt: string;
}>;

type TodayDirectFollowUp = Readonly<{
  status: "empty";
  message: string;
}> | Readonly<{
  status: "available";
  leads: readonly TodayFollowUpItem[];
}>;

export type TodayResponse = Readonly<{
  tenant: {
    id: string;
    name: string;
    status: string;
  };
  actionRequired: readonly TodayActionCard[];
  directFollowUp: TodayDirectFollowUp;
}>;

type SessionTenant = Readonly<{
  id: string;
  name: string;
  status: string;
  role: "owner" | "tenant_admin" | "team_member";
}>;

type SessionContextResponse = Readonly<{
  workspace: "customer";
  tenant: SessionTenant | null;
  memberships: readonly SessionTenant[];
  tenant_selection_required: boolean;
}>;

type TodayViewState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "unauthenticated" }>
  | Readonly<{ status: "forbidden" }>
  | Readonly<{ status: "unavailable" }>
  | Readonly<{ status: "tenant-selection"; memberships: readonly SessionTenant[] }>
  | Readonly<{ status: "empty"; tenant: SessionTenant; today: TodayResponse }>
  | Readonly<{ status: "ready"; tenant: SessionTenant; today: TodayResponse }>;

type RequestErrorState = Extract<
  TodayViewState,
  { status: "unauthenticated" | "forbidden" | "unavailable" }
>;

const initialState: TodayViewState = { status: "loading" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSessionTenant(value: unknown): value is SessionTenant {
  return (
    isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.status === "string"
    && (value.role === "owner" || value.role === "tenant_admin" || value.role === "team_member")
  );
}

function isSessionContextResponse(value: unknown): value is SessionContextResponse {
  return (
    isRecord(value)
    && value.workspace === "customer"
    && (value.tenant === null || isSessionTenant(value.tenant))
    && Array.isArray(value.memberships)
    && value.memberships.every(isSessionTenant)
    && typeof value.tenant_selection_required === "boolean"
  );
}

function parseTodayFollowUpItem(value: unknown): TodayFollowUpItem | null {
  if (
    isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.message === "string"
    && typeof value.source === "string"
    && typeof value.created_at === "string"
  ) {
    return {
      id: value.id,
      name: value.name,
      message: value.message,
      source: value.source,
      createdAt: value.created_at,
    };
  }

  return null;
}

export function parseTodayResponse(value: unknown): TodayResponse | null {
  if (
    !isRecord(value)
    || !isRecord(value.tenant)
    || typeof value.tenant.id !== "string"
    || typeof value.tenant.name !== "string"
    || typeof value.tenant.status !== "string"
    || !Array.isArray(value.actionRequired)
  ) return null;

  const actionRequired = value.actionRequired.map(parseTodayActionCard);
  if (actionRequired.some((card): card is null => card === null)) return null;

  const directFollowUp = parseDirectFollowUp(value.directFollowUp);
  if (!directFollowUp) return null;

  return {
    tenant: {
      id: value.tenant.id,
      name: value.tenant.name,
      status: value.tenant.status,
    },
    actionRequired: actionRequired as TodayActionCard[],
    directFollowUp,
  };
}

export function hasAvailableTodayData(today: TodayResponse): boolean {
  return today.actionRequired.some((card) => card.status === "available" && card.value !== null);
}

export function limitDirectFollowUpItems(items: readonly TodayFollowUpItem[]): readonly TodayFollowUpItem[] {
  return items.slice(0, MAX_DIRECT_FOLLOW_UP_ITEMS);
}

function parseTodayActionCard(value: unknown): TodayActionCard | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string"
    || typeof value.label !== "string"
    || (typeof value.value !== "number" && value.value !== null)
    || (value.status !== "available" && value.status !== "unavailable" && value.status !== "not-connected")
    || typeof value.source !== "string"
  ) return null;

  return {
    id: value.id,
    label: value.label,
    value: value.value,
    status: value.status === "available" ? "available" : "not-connected",
    source: value.source,
  };
}

function parseDirectFollowUp(value: unknown): TodayDirectFollowUp | null {
  if (!isRecord(value) || typeof value.status !== "string") return null;
  if (value.status === "empty" && typeof value.message === "string") {
    return { status: "empty", message: value.message };
  }
  if (value.status !== "available" || !Array.isArray(value.leads)) return null;

  const items = value.leads.map(parseTodayFollowUpItem);
  if (items.some((item): item is null => item === null)) return null;
  return { status: "available", leads: limitDirectFollowUpItems(items as TodayFollowUpItem[]) };
}

function stateForHttpStatus(status: number): RequestErrorState | null {
  if (status === 401) return { status: "unauthenticated" };
  if (status === 403) return { status: "forbidden" };
  if (status === 502 || status === 503) return { status: "unavailable" };
  return null;
}

async function loadTodayState(selectedTenantId: string | undefined, signal: AbortSignal): Promise<TodayViewState> {
  try {
    const contextResponse = await fetch("/api/session/context", {
      cache: "no-store",
      headers: selectedTenantId ? { "x-tenant-id": selectedTenantId } : undefined,
      signal,
    });
    const contextError = stateForHttpStatus(contextResponse.status);
    if (contextError) return contextError;
    if (!contextResponse.ok) return { status: "unavailable" };

    const contextData: unknown = await contextResponse.json();
    if (!isSessionContextResponse(contextData)) return { status: "unavailable" };
    if (contextData.tenant_selection_required || !contextData.tenant) {
      return contextData.memberships.length > 0
        ? { status: "tenant-selection", memberships: contextData.memberships }
        : { status: "forbidden" };
    }

    const todayResponse = await fetch("/api/dashboard/today", {
      cache: "no-store",
      headers: { "x-tenant-id": contextData.tenant.id },
      signal,
    });
    const todayError = stateForHttpStatus(todayResponse.status);
    if (todayError) return todayError;
    if (!todayResponse.ok) return { status: "unavailable" };

    const todayData = parseTodayResponse(await todayResponse.json());
    if (!todayData) return { status: "unavailable" };

    return hasAvailableTodayData(todayData)
      ? { status: "ready", tenant: contextData.tenant, today: todayData }
      : { status: "empty", tenant: contextData.tenant, today: todayData };
  } catch {
    // Abort is expected when the component unmounts or a tenant selection changes.
    return signal.aborted ? { status: "loading" } : { status: "unavailable" };
  }
}

function TenantContext({ tenant }: { tenant: SessionTenant }) {
  return (
    <p className="tenant-context">
      Klantomgeving: <strong>{tenant.name}</strong>
      <span className="badge badge-neutral">
        {tenant.status === "active" ? "Actief" : tenant.status}
      </span>
    </p>
  );
}

function TodayData({ today }: { today: TodayResponse }) {
  return (
    <>
      <section aria-labelledby="attention-title">
        <div className="section-heading">
          <h2 id="attention-title">Actie vereist</h2>
          <p>Pak de belangrijkste openstaande aanvragen en taken eerst op.</p>
        </div>
        <div className="card-grid">
          {today.actionRequired.map((card) => (
            <article key={card.id} className="card stat">
              <h3 className="stat-label">{card.label}</h3>
              <p className="stat-value">{card.status === "available" && card.value !== null ? card.value : "—"}</p>
              <p className="stat-meta">
                {card.status === "not-connected" ? (
                  <span className="badge badge-neutral">Nog niet gekoppeld</span>
                ) : null}
                {card.status === "available" ? `Bron: ${card.source}` : card.source}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="follow-up-title">
        <div className="section-heading">
          <h2 id="follow-up-title">Direct opvolgen</h2>
          <p>Aanvragen gesorteerd op benodigde actie.</p>
        </div>
        {today.directFollowUp.status === "empty" ? (
          <div className="card empty-state">
            <h3>Nog geen aanvragen</h3>
            <p>{today.directFollowUp.message}</p>
          </div>
        ) : (
          <div role="region" aria-label="Direct op te volgen CRM-aanvragen">
            <ul className="today-follow-up-list">
              {today.directFollowUp.leads.map((lead) => (
                <li className="today-follow-up-item" key={lead.id}>
                  <Link className="today-follow-up-link" href={`/leads/${encodeURIComponent(lead.id)}`} aria-label={`Open lead ${lead.name}`}>
                    <span className="today-follow-up-content">
                      <strong>{lead.name}</strong>
                      <span>{lead.message}</span>
                      <span className="today-follow-up-meta">Bron: {lead.source}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}

export default function TodayOverview() {
  const [state, setState] = useState<TodayViewState>(initialState);
  const [selectedTenantId, setSelectedTenantId] = useState<string>();
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void loadTodayState(selectedTenantId, controller.signal).then((nextState) => {
      if (!controller.signal.aborted) {
        setState(nextState);
      }
    });
    return () => controller.abort();
  }, [retryCount, selectedTenantId]);

  if (state.status === "loading") return <LoadingState />;
  if (state.status === "unauthenticated") return <UnauthenticatedState />;
  if (state.status === "forbidden") return <ForbiddenState />;
  if (state.status === "unavailable") {
    return (
      <UnavailableState
        onRetry={() => {
          setState({ status: "loading" });
          setRetryCount((count) => count + 1);
        }}
      />
    );
  }
  if (state.status === "tenant-selection") {
    return (
      <TenantSelectionState
        memberships={state.memberships}
        onSelectTenant={(tenantId) => {
          setState({ status: "loading" });
          setSelectedTenantId(tenantId);
        }}
      />
    );
  }
  if (state.status === "empty") {
    return (
      <>
        <TenantContext tenant={state.tenant} />
        <EmptyState />
      </>
    );
  }

  return (
    <>
      <TenantContext tenant={state.tenant} />
      <TodayData today={state.today} />
    </>
  );
}
