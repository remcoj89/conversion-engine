"use client";

import { usePathname } from "next/navigation";
import {
  ForbiddenState,
  LoadingState,
  UnauthenticatedState,
  UnavailableState,
} from "./ui-states";
import {
  useWorkspaceContext,
  WorkspaceContextSelection,
} from "./workspace-context";

type RouteAccess = "admin" | "public" | "customer";

const PUBLIC_ROUTE_PREFIXES = ["/api/", "/auth/"] as const;

export default function CustomerWorkspaceGate({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const routeAccess = classifyRoute(pathname);
  const { status } = useWorkspaceContext();

  // Admin and technical routes do not belong to the customer workspace boundary.
  if (routeAccess === "admin" || routeAccess === "public") return children;

  if (status === "loading" || status === "not_applicable") {
    return (
      <LoadingState
        title="Klantomgeving wordt geladen"
        message="We controleren je sessie en klanttoegang."
      />
    );
  }
  if (status === "tenant_selection_required") return <WorkspaceContextSelection />;
  if (status === "unauthenticated") {
    return <UnauthenticatedState message="Meld je aan om je klantomgeving te bekijken." />;
  }
  if (status === "forbidden") {
    return <ForbiddenState message="Je account heeft geen toegang tot deze klantomgeving." />;
  }
  if (status === "unavailable") {
    return <UnavailableState onRetry={() => window.location.reload()} />;
  }

  return children;
}

function classifyRoute(pathname: string | null): RouteAccess {
  const path = pathname ?? "/";

  if (path === "/admin" || path.startsWith("/admin/")) return "admin";
  if (
    path === "/api" ||
    path === "/auth" ||
    PUBLIC_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix))
  ) {
    return "public";
  }

  return "customer";
}
