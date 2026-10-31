export const TENANT_HEADER = "x-tenant-id";
export const SELECTED_TENANT_STORAGE_KEY = "ce_selected_tenant";

export type SessionTenant = Readonly<{
  id: string;
  name: string;
  status: string;
  role: "owner" | "tenant_admin" | "team_member";
}>;

export type SessionContextResponse = Readonly<{
  workspace: "customer";
  tenant: SessionTenant | null;
  memberships: readonly SessionTenant[];
  tenant_selection_required: boolean;
}>;

export type WorkspaceContextStatus =
  | "loading"
  | "ready"
  | "not_applicable"
  | "tenant_selection_required"
  | "unauthenticated"
  | "forbidden"
  | "unavailable";

export type WorkspaceContextState = Readonly<{
  status: WorkspaceContextStatus;
  tenant: SessionTenant | null;
  memberships: readonly SessionTenant[];
}>;

export type WorkspaceFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export const initialWorkspaceContext: WorkspaceContextState = {
  status: "loading",
  tenant: null,
  memberships: [],
};

export function stateFromSessionResponse(
  response: Response,
  body: unknown,
): WorkspaceContextState {
  if (response.status === 401) return stateFor("unauthenticated");
  if (response.status === 403) return stateFor("forbidden");
  if (!response.ok) return stateFor("unavailable");

  if (!isSessionContextResponse(body)) return stateFor("unavailable");

  if (body.tenant_selection_required) {
    return body.tenant === null && body.memberships.length > 1
      ? {
          status: "tenant_selection_required",
          tenant: null,
          memberships: body.memberships,
        }
      : stateFor("unavailable");
  }

  if (body.tenant === null || body.memberships.length === 0) {
    return stateFor("unavailable");
  }

  const selectedTenantIsKnown = body.memberships.some(
    (membership) => membership.id.toLowerCase() === body.tenant!.id.toLowerCase(),
  );
  if (!selectedTenantIsKnown) return stateFor("unavailable");

  return {
    status: "ready",
    tenant: body.tenant,
    memberships: body.memberships,
  };
}

export async function requestSessionContext(
  fetcher: WorkspaceFetch,
  tenantId: string | null = null,
): Promise<WorkspaceContextState> {
  const headers = new Headers();
  if (tenantId) headers.set(TENANT_HEADER, tenantId);

  const response = await fetcher("/api/session/context", {
    cache: "no-store",
    headers,
  });
  const body = response.ok ? await response.json().catch(() => null) : null;
  return stateFromSessionResponse(response, body);
}

// Only same-origin BFF calls receive the selected tenant. External requests never receive it.
export function createWorkspaceFetch(
  tenantId: string | null,
  fetcher: WorkspaceFetch,
): WorkspaceFetch {
  return (input, init) => {
    if (!tenantId || !isSameOriginBffRequest(input)) return fetcher(input, init);

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.set(TENANT_HEADER, tenantId);

    return fetcher(input, { ...init, headers });
  };
}

export function readStoredTenantId(): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage.getItem(SELECTED_TENANT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeTenantId(tenantId: string): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(SELECTED_TENANT_STORAGE_KEY, tenantId);
  } catch {
    // Session storage is only a convenience; server-side authorization remains authoritative.
  }
}

export function clearStoredTenantId(): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(SELECTED_TENANT_STORAGE_KEY);
  } catch {
    // Session storage is only a convenience; server-side authorization remains authoritative.
  }
}

function stateFor(status: Exclude<WorkspaceContextStatus, "loading" | "ready" | "not_applicable" | "tenant_selection_required">): WorkspaceContextState {
  return { status, tenant: null, memberships: [] };
}

function isSessionContextResponse(value: unknown): value is SessionContextResponse {
  if (!isRecord(value)) return false;
  if (value.workspace !== "customer" || typeof value.tenant_selection_required !== "boolean") {
    return false;
  }
  if (value.tenant !== null && !isSessionTenant(value.tenant)) return false;
  if (!Array.isArray(value.memberships) || !value.memberships.every(isSessionTenant)) return false;

  const ids = value.memberships.map((membership) => membership.id.toLowerCase());
  return new Set(ids).size === ids.length;
}

function isSessionTenant(value: unknown): value is SessionTenant {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    value.status === "active" &&
    (value.role === "owner" || value.role === "tenant_admin" || value.role === "team_member")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSameOriginBffRequest(input: RequestInfo | URL): boolean {
  const inputUrl =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

  if (inputUrl.startsWith("/api/")) return true;
  if (typeof window === "undefined") return false;

  try {
    const url = new URL(inputUrl, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}
