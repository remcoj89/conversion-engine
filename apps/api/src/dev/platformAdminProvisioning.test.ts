import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPlatformAdminInvocation,
  PLATFORM_ADMIN_CONFIRM_FLAG,
  PlatformAdminProvisioningError,
  provisionCurrentPlatformAdmin,
  type PlatformAdminProvisioningTx,
  type RunPlatformAdminTransaction,
} from "./platformAdminProvisioning.js";

type User = { id: string; authProviderUserId: string; status: "active" | "disabled" };
type Assignment = { userId: string; status: "active" | "revoked"; grantedBy: string; revokedAt: Date | null };
type Session = { subject: string; active: boolean; createdAt: number };
type State = { users: User[]; assignments: Assignment[]; sessions: Session[] };

const SUBJECT = "zitadel-subject-123";
const USER_ID = "00000000-0000-4000-8000-000000000001";
const GRANTED_BY = USER_ID;

function fakeDb(initial: Partial<State> = {}, options: { failOn?: keyof PlatformAdminProvisioningTx } = {}) {
  let state: State = { users: [], assignments: [], sessions: [], ...structuredClone(initial) };

  const run: RunPlatformAdminTransaction = async (fn) => {
    const draft = structuredClone(state);
    const fail = (method: keyof PlatformAdminProvisioningTx) => {
      if (options.failOn === method) throw new Error(`simulated failure in ${method}`);
    };
    const tx: PlatformAdminProvisioningTx = {
      async findActiveSessionSubjects() {
        fail("findActiveSessionSubjects");
        return [...new Set(draft.sessions
          .filter((session) => session.active)
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((session) => session.subject))];
      },
      async findUserBySubject(subject) {
        fail("findUserBySubject");
        return draft.users.find((user) => user.authProviderUserId === subject) ?? null;
      },
      async findAssignment(userId) {
        fail("findAssignment");
        const assignment = draft.assignments.find((candidate) => candidate.userId === userId);
        return assignment ? { status: assignment.status } : null;
      },
      async createAssignment(userId, grantedBy) {
        fail("createAssignment");
        if (draft.assignments.some((candidate) => candidate.userId === userId)) return false;
        draft.assignments.push({ userId, status: "active", grantedBy, revokedAt: null });
        return true;
      },
      async reactivateAssignment(userId, grantedBy) {
        fail("reactivateAssignment");
        const assignment = draft.assignments.find(
          (candidate) => candidate.userId === userId && candidate.status === "revoked",
        );
        if (assignment) {
          assignment.status = "active";
          assignment.grantedBy = grantedBy;
          assignment.revokedAt = null;
        }
      },
    };
    const result = await fn(tx);
    state = draft;
    return result;
  };

  return { run, state: () => state };
}

const activeSession = (subject = SUBJECT, createdAt = 1): Session => ({ subject, active: true, createdAt });
const currentUser: User = { id: USER_ID, authProviderUserId: SUBJECT, status: "active" };

test("platform-admin provisioning vereist bevestiging en weigert productie", () => {
  assert.throws(
    () => assertPlatformAdminInvocation({ NODE_ENV: "development" }, []),
    (error: unknown) =>
      error instanceof PlatformAdminProvisioningError && error.code === "confirmation_required",
  );
  assert.throws(
    () => assertPlatformAdminInvocation({ NODE_ENV: "production" }, [PLATFORM_ADMIN_CONFIRM_FLAG]),
    (error: unknown) =>
      error instanceof PlatformAdminProvisioningError && error.code === "production_refused",
  );
  assert.throws(
    () => assertPlatformAdminInvocation({}, [PLATFORM_ADMIN_CONFIRM_FLAG]),
    (error: unknown) =>
      error instanceof PlatformAdminProvisioningError && error.code === "production_refused",
  );
  assert.doesNotThrow(() =>
    assertPlatformAdminInvocation({ NODE_ENV: "development" }, [PLATFORM_ADMIN_CONFIRM_FLAG]),
  );
});

test("zonder actieve sessie of lokale gebruiker blijft de database ongewijzigd", async () => {
  const noSession = fakeDb();
  await assert.rejects(
    provisionCurrentPlatformAdmin(noSession.run),
    (error: unknown) =>
      error instanceof PlatformAdminProvisioningError && error.code === "no_active_session",
  );
  assert.deepEqual(noSession.state().assignments, []);

  const noUser = fakeDb({ sessions: [activeSession()] });
  await assert.rejects(
    provisionCurrentPlatformAdmin(noUser.run),
    (error: unknown) =>
      error instanceof PlatformAdminProvisioningError && error.code === "user_not_found",
  );
  assert.deepEqual(noUser.state().assignments, []);
});

test("meerdere actieve gebruikerssessies worden geweigerd om de verkeerde account niet te kiezen", async () => {
  const db = fakeDb({
    users: [currentUser],
    sessions: [activeSession(SUBJECT), activeSession("another-subject", 2)],
  });

  await assert.rejects(
    provisionCurrentPlatformAdmin(db.run),
    (error: unknown) =>
      error instanceof PlatformAdminProvisioningError && error.code === "ambiguous_active_sessions",
  );
  assert.deepEqual(db.state().assignments, []);
});

test("nieuwe assignment wordt actief aangemaakt voor de huidige gebruiker", async () => {
  const db = fakeDb({ users: [currentUser], sessions: [activeSession()] });

  assert.deepEqual(await provisionCurrentPlatformAdmin(db.run), { status: "created" });
  assert.deepEqual(db.state().assignments, [
    { userId: USER_ID, status: "active", grantedBy: GRANTED_BY, revokedAt: null },
  ]);
});

test("inactieve gebruiker kan geen platform-admin worden", async () => {
  const db = fakeDb({
    users: [{ ...currentUser, status: "disabled" }],
    sessions: [activeSession()],
  });

  await assert.rejects(
    provisionCurrentPlatformAdmin(db.run),
    (error: unknown) =>
      error instanceof PlatformAdminProvisioningError && error.code === "user_inactive",
  );
  assert.deepEqual(db.state().assignments, []);
});

test("actieve assignment is idempotent en overschrijft geen bestaande gegevens", async () => {
  const existing = {
    userId: USER_ID,
    status: "active" as const,
    grantedBy: "existing-grantor",
    revokedAt: null,
  };
  const db = fakeDb({ users: [currentUser], sessions: [activeSession()], assignments: [existing] });

  assert.deepEqual(await provisionCurrentPlatformAdmin(db.run), { status: "already_active" });
  assert.deepEqual(db.state().assignments, [existing]);
});

test("revoked assignment wordt opnieuw geactiveerd en krijgt de huidige gebruiker als granted_by", async () => {
  const db = fakeDb({
    users: [currentUser],
    sessions: [activeSession()],
    assignments: [
      {
        userId: USER_ID,
        status: "revoked",
        grantedBy: "old-grantor",
        revokedAt: new Date("2026-01-01T09:00:00.000Z"),
      },
    ],
  });

  assert.deepEqual(await provisionCurrentPlatformAdmin(db.run), { status: "reactivated" });
  assert.deepEqual(db.state().assignments, [
    { userId: USER_ID, status: "active", grantedBy: GRANTED_BY, revokedAt: null },
  ]);
});

test("fouten tijdens de assignmentmutatie draaien de transactie terug", async () => {
  for (const failOn of ["createAssignment", "reactivateAssignment"] as const) {
    const db = fakeDb(
      {
        users: [currentUser],
        sessions: [activeSession()],
        assignments:
          failOn === "reactivateAssignment"
            ? [{ userId: USER_ID, status: "revoked", grantedBy: "old-grantor", revokedAt: new Date() }]
            : [],
      },
      { failOn },
    );
    const before = structuredClone(db.state());

    await assert.rejects(provisionCurrentPlatformAdmin(db.run), /simulated failure/);
    assert.deepEqual(db.state(), before);
  }
});
