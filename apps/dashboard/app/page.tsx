"use client";

import TodayOverview from "./today-overview";
import { useWorkspaceContext } from "./workspace-context";

export default function TodayPage() {
  const { status } = useWorkspaceContext();
  const showLoginLink = ["loading", "unauthenticated", "unavailable"].includes(status);

  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Conversion Engine</p>
        <h1>Vandaag</h1>
        <p className="intro">
          Bekijk hier de belangrijkste acties en opvolging.
        </p>
        {showLoginLink ? (
          <a className="button button-primary page-login-button" href="/auth/login">
            Aanmelden
          </a>
        ) : null}
      </div>

      <TodayOverview />
    </>
  );
}
