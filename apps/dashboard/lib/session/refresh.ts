import { RefreshError, type RefreshTokens } from "../auth/refresh";
import type { LockedSession, LockedWork } from "./store";

// Refresh this long before the access token expires, so a request never leaves with an almost-dead token.
export const REFRESH_MARGIN_MS = 60_000;

export type SessionTokens = Readonly<{ accessToken: string; accessExpiresAt: Date; absoluteExpiresAt: Date }>;

export type RefreshOutcome =
  | Readonly<{ status: "ok"; accessToken: string }>
  // The session is gone (and deleted if it still existed): the browser must log in again.
  | Readonly<{ status: "invalid" }>
  // The provider failed; the session is left untouched.
  | Readonly<{ status: "unavailable" }>;

// Matches withLockedSession() with the database and key already bound.
export type LockSession = <T>(
  sessionId: string,
  work: (session: LockedSession | null) => Promise<LockedWork<T>>,
) => Promise<T>;

export type SessionRefresherDependencies = Readonly<{
  lockSession: LockSession;
  refreshTokens: RefreshTokens;
  now?: () => Date;
  // Receives only fixed reason codes, never tokens or session IDs.
  logFailure?: (reason: string) => void;
}>;

// Once the access token runs until the absolute limit, refreshing cannot gain anything.
export function needsRefresh(session: SessionTokens, now: Date): boolean {
  return (
    session.accessExpiresAt.getTime() - now.getTime() <= REFRESH_MARGIN_MS &&
    session.accessExpiresAt.getTime() < session.absoluteExpiresAt.getTime()
  );
}

// `rejectedAccessToken` is set when the API answered 401 for that token: refresh even if it looks valid,
// unless another request has already replaced it.
export function createSessionRefresher(deps: SessionRefresherDependencies) {
  const now = deps.now ?? (() => new Date());
  const logFailure = deps.logFailure ?? ((reason) => console.warn("Session refresh failed:", reason));

  return function refreshSession(sessionId: string, rejectedAccessToken?: string): Promise<RefreshOutcome> {
    return deps.lockSession<RefreshOutcome>(sessionId, async (session) => {
      if (!session) {
        return { result: { status: "invalid" } };
      }

      // Re-checked under the lock: a concurrent request may have refreshed while this one waited.
      const current = now();
      if (session.absoluteExpiresAt.getTime() <= current.getTime()) {
        logFailure("session_expired");
        return { result: { status: "invalid" }, change: { kind: "delete" } };
      }
      const replacedMeanwhile = rejectedAccessToken !== undefined && session.accessToken !== rejectedAccessToken;
      const mustRefresh = rejectedAccessToken === undefined ? needsRefresh(session, current) : !replacedMeanwhile;
      if (!mustRefresh && session.accessExpiresAt.getTime() > current.getTime()) {
        return { result: { status: "ok", accessToken: session.accessToken } };
      }

      let tokens;
      try {
        tokens = await deps.refreshTokens(session.refreshToken);
      } catch (error) {
        const reason = error instanceof RefreshError ? error.reason : "unavailable";
        logFailure(`refresh_${reason}`);
        return reason === "invalid_grant"
          ? { result: { status: "invalid" }, change: { kind: "delete" } }
          : { result: { status: "unavailable" } };
      }

      // Never extends the absolute session limit.
      const accessExpiresAt = new Date(
        Math.min(now().getTime() + tokens.expiresIn * 1000, session.absoluteExpiresAt.getTime()),
      );
      return {
        result: { status: "ok", accessToken: tokens.accessToken },
        change: {
          kind: "rotate",
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? session.refreshToken,
          accessExpiresAt,
        },
      };
    });
  };
}

export type RefreshSession = ReturnType<typeof createSessionRefresher>;
