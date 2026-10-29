"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  clearStoredTenantId,
  createWorkspaceFetch,
  initialWorkspaceContext,
  readStoredTenantId,
  requestSessionContext,
  storeTenantId,
  type WorkspaceContextState,
  type WorkspaceFetch,
} from "../lib/session/context";

type WorkspaceContextValue = WorkspaceContextState & Readonly<{
  selectTenant: (tenantId: string) => Promise<void>;
  fetch: WorkspaceFetch;
}>;

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceContextProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isInviteRoute = pathname === "/invite";
  const bypassWorkspace = isAdminRoute || isInviteRoute;
  const initialTenantId = useState<string | null>(() => bypassWorkspace ? null : readStoredTenantId())[0];
  const [state, setState] = useState<WorkspaceContextState>(initialWorkspaceContext);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(initialTenantId);
  const stateRef = useRef(state);
  const installedTenantIdRef = useRef<string | null>(null);
  const restoreFetchRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const setTenantRequestBoundary = useCallback((tenantId: string | null) => {
    if (typeof window === "undefined" || installedTenantIdRef.current === tenantId) return;

    restoreFetchRef.current?.();
    restoreFetchRef.current = null;
    installedTenantIdRef.current = null;

    if (!tenantId) return;

    const previousFetch = window.fetch;
    const wrappedFetch = createWorkspaceFetch(tenantId, previousFetch.bind(window));
    window.fetch = wrappedFetch as typeof window.fetch;
    installedTenantIdRef.current = tenantId;
    restoreFetchRef.current = () => {
      if (window.fetch === wrappedFetch) window.fetch = previousFetch;
      installedTenantIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    setTenantRequestBoundary(bypassWorkspace ? null : selectedTenantId);
  }, [bypassWorkspace, selectedTenantId, setTenantRequestBoundary]);

  useEffect(() => () => setTenantRequestBoundary(null), [setTenantRequestBoundary]);

  const loadContext = useCallback(
    async (tenantId: string | null, allowStoredTenantFallback: boolean): Promise<void> => {
      try {
        let nextState = await requestSessionContext(window.fetch.bind(window), tenantId);

        // A stale sessionStorage value should not hide the user's current tenant choices.
        if (nextState.status === "forbidden" && tenantId && allowStoredTenantFallback) {
          clearStoredTenantId();
          setSelectedTenantId(null);
          setTenantRequestBoundary(null);
          nextState = await requestSessionContext(window.fetch.bind(window));
        }

        applyContextState(nextState, setState, setSelectedTenantId, setTenantRequestBoundary);
      } catch {
        setState({ status: "unavailable", tenant: null, memberships: [] });
      }
    },
    [setTenantRequestBoundary],
  );

  useEffect(() => {
    if (bypassWorkspace) return;
    queueMicrotask(() => void loadContext(initialTenantId, true));
  }, [bypassWorkspace, initialTenantId, loadContext]);

  const selectTenant = useCallback(
    async (tenantId: string): Promise<void> => {
      const currentState = stateRef.current;
      if (
        currentState.status !== "tenant_selection_required" ||
        !currentState.memberships.some((tenant) => tenant.id === tenantId)
      ) {
        return;
      }

      setState({ ...initialWorkspaceContext });

      try {
        const nextState = await requestSessionContext(window.fetch.bind(window), tenantId);
        applyContextState(nextState, setState, setSelectedTenantId, setTenantRequestBoundary);
      } catch {
        setState({ status: "unavailable", tenant: null, memberships: [] });
      }
    },
    [setTenantRequestBoundary],
  );

  const workspaceFetch = useMemo<WorkspaceFetch>(
    () => createWorkspaceFetch(bypassWorkspace ? null : selectedTenantId, fetch),
    [bypassWorkspace, selectedTenantId],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      ...(bypassWorkspace ? { status: "not_applicable", tenant: null, memberships: [] } : state),
      selectTenant,
      fetch: workspaceFetch,
    }),
    [bypassWorkspace, selectTenant, state, workspaceFetch],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspaceContext must be used within WorkspaceContextProvider");
  return context;
}

export function WorkspaceContextSelection() {
  const { status, memberships, selectTenant } = useWorkspaceContext();
  if (status !== "tenant_selection_required") return null;

  return (
    <section className="card onboarding-card" aria-labelledby="workspace-selection-title">
      <div className="section-heading">
        <h2 id="workspace-selection-title">Kies een klantomgeving</h2>
        <p>
          Je account heeft toegang tot meerdere klantomgevingen. Kies de omgeving die je wilt openen.
        </p>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="workspace-selection">
          Klantomgeving
        </label>
        <select
          id="workspace-selection"
          className="field-control"
          defaultValue=""
          onChange={(event) => void selectTenant(event.currentTarget.value)}
        >
          <option value="" disabled>
            Selecteer een klantomgeving
          </option>
          {memberships.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.name}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

export function WorkspaceContextGate({ children }: { children: ReactNode }) {
  const { status } = useWorkspaceContext();

  if (status === "loading") {
    return (
      <div className="card stat" role="status" aria-live="polite">
        Klantomgeving laden…
      </div>
    );
  }

  if (status === "tenant_selection_required") return null;
  return children;
}

function applyContextState(
  nextState: WorkspaceContextState,
  setState: (state: WorkspaceContextState) => void,
  setSelectedTenantId: (tenantId: string | null) => void,
  setTenantRequestBoundary: (tenantId: string | null) => void,
): void {
  if (nextState.status === "ready" && nextState.tenant) {
    storeTenantId(nextState.tenant.id);
    setSelectedTenantId(nextState.tenant.id);
    setTenantRequestBoundary(nextState.tenant.id);
  } else if (nextState.status === "unauthenticated" || nextState.status === "forbidden") {
    clearStoredTenantId();
    setSelectedTenantId(null);
    setTenantRequestBoundary(null);
  }

  setState(nextState);
}
