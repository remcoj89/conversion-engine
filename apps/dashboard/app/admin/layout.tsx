import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { createPlatformContextHandler } from "../../lib/bff/platformContext";
import { getBffDependencies } from "../../lib/bff/serverDependencies";
import {
  classifyPlatformContextResponse,
  createAdminContextRequest,
  type AdminAccessResult,
} from "../../lib/session/adminAccess";
import { SESSION_COOKIE_NAME } from "../../lib/session/cookies";
import { ForbiddenState, UnauthenticatedState, UnavailableState } from "../ui-states";
import "./admin.css";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const access = await readAdminAccess();

  if (access.status === "unauthenticated") {
    return <UnauthenticatedState message="Meld je aan om de Westend beheeromgeving te bekijken." />;
  }
  if (access.status === "forbidden") {
    return <ForbiddenState message="Je account heeft geen Platform Admin-recht voor de Westend beheeromgeving." />;
  }
  if (access.status === "unavailable") {
    return <UnavailableState />;
  }

  return (
    <div className="admin-shell admin-shell-integrated">
      <div className="admin-main">
        <div className="admin-context-bar" aria-label="Werkruimte Westend beheer">
          <span><strong>Westend beheer</strong> · interne operations</span>
          <span className="badge badge-neutral">Platform Admin · read-only</span>
        </div>
        <div className="admin-content">{children}</div>
      </div>
    </div>
  );
}

async function readAdminAccess(): Promise<AdminAccessResult> {
  try {
    const sessionCookieValue = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookieValue) return { status: "unauthenticated" };

    // Build a server-only request with the HttpOnly session cookie; no tenant header is accepted.
    const request = createAdminContextRequest(sessionCookieValue);
    const response = await createPlatformContextHandler(getBffDependencies())(request);
    return classifyPlatformContextResponse(response);
  } catch {
    // Configuration, session-store and network errors fail closed without exposing details.
    return { status: "unavailable" };
  }
}
