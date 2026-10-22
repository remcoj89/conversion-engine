import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  CONFIRM_FLAG,
  LOCAL_TENANT_NAME,
  ProvisioningError,
  assertLocalInvocation,
  provisionLocalUser,
  type ProvisioningTx,
  type RunInTransaction,
} from "./localProvisioning.js";

type Tenant = { id: string; name: string; status: string };
type User = { id: string; authProviderUserId: string };
type Membership = { tenantId: string; userId: string; role: string; status: string };
type Session = { subject: string; active: boolean; createdAt: number };
type State = { tenants: Tenant[]; users: User[]; memberships: Membership[]; sessions: Session[] };

const SUBJECT = "zitadel-subject-123";

// In-memory database: each transaction works on a copy that only replaces the state on success.
function fakeDb(initial: Partial<State> = {}, options: { failOn?: keyof ProvisioningTx } = {}) {
  let state: State = { tenants: [], users: [], memberships: [], sessions: [], ...structuredClone(initial) };

  const run: RunInTransaction = async (fn) => {
    const draft = structuredClone(state);
    const fail = (method: keyof ProvisioningTx) => {
      if (options.failOn === method) throw new Error(`simulated failure in ${method}`);
    };
    const tx: ProvisioningTx = {
      async findLatestActiveSessionSubject() {
        fail("findLatestActiveSessionSubject");
        const active = draft.sessions.filter((s) => s.active).sort((a, b) => b.createdAt - a.createdAt);
        return active[0]?.subject ?? null;
      },
      async ensureUser(subject) {
        fail("ensureUser");
        const existing = draft.users.find((u) => u.authProviderUserId === subject);
        if (existing) return { userId: existing.id, created: false };
        const user = { id: randomUUID(), authProviderUserId: subject };
        draft.users.push(user);
        return { userId: user.id, created: true };
      },
      async hasActiveMembership(userId) {
        fail("hasActiveMembership");
        return draft.memberships.some(
          (m) =>
            m.userId === userId &&
            m.status === "active" &&
            draft.tenants.some((t) => t.id === m.tenantId && t.status === "active"),
        );
      },
      async createTenant(name) {
        fail("createTenant");
        const tenant = { id: randomUUID(), name, status: "active" };
        draft.tenants.push(tenant);
        return tenant.id;
      },
      async createOwnerMembership(tenantId, userId) {
        fail("createOwnerMembership");
        draft.memberships.push({ tenantId, userId, role: "owner", status: "active" });
      },
    };
    const result = await fn(tx);
    state = draft;
    return result;
  };

  return { run, state: () => state };
}

const activeSession = (subject = SUBJECT, createdAt = 1): Session => ({ subject, active: true, createdAt });

test("geen actieve sessie stopt met een generieke fout en wijzigt niets", async () => {
  const db = fakeDb({ sessions: [{ subject: SUBJECT, active: false, createdAt: 1 }] });

  await assert.rejects(
    provisionLocalUser(db.run),
    (error: unknown) =>
      error instanceof ProvisioningError &&
      error.code === "no_active_session" &&
      !error.message.includes(SUBJECT),
  );
  assert.deepEqual(db.state().users, []);
  assert.deepEqual(db.state().tenants, []);
});

test("nieuwe gebruiker krijgt een lokale tenant en een actieve owner-membership", async () => {
  const db = fakeDb({ sessions: [activeSession()] });

  const result = await provisionLocalUser(db.run);

  assert.equal(result.status, "provisioned");
  assert.equal(result.createdUser, true);
  const { users, tenants, memberships } = db.state();
  assert.equal(users.length, 1);
  assert.equal(users[0].authProviderUserId, SUBJECT);
  assert.deepEqual(tenants.map((t) => t.name), [LOCAL_TENANT_NAME]);
  assert.deepEqual(memberships, [{ tenantId: tenants[0].id, userId: users[0].id, role: "owner", status: "active" }]);
  assert.equal(JSON.stringify(result).includes(SUBJECT), false);
});

test("gebruikt de meest recente actieve sessie", async () => {
  const db = fakeDb({
    sessions: [activeSession("older-subject", 1), activeSession(SUBJECT, 2), { subject: "newest-expired", active: false, createdAt: 3 }],
  });

  await provisionLocalUser(db.run);

  assert.deepEqual(db.state().users.map((u) => u.authProviderUserId), [SUBJECT]);
});

test("bestaande gebruiker wordt hergebruikt en niet gewijzigd", async () => {
  const existing = { id: randomUUID(), authProviderUserId: SUBJECT };
  const db = fakeDb({ users: [existing], sessions: [activeSession()] });

  const result = await provisionLocalUser(db.run);

  assert.equal(result.status, "provisioned");
  assert.equal(result.createdUser, false);
  assert.deepEqual(db.state().users, [existing]);
  assert.equal(db.state().memberships[0].userId, existing.id);
});

test("opnieuw uitvoeren maakt geen dubbele tenant of membership", async () => {
  const db = fakeDb({ sessions: [activeSession()] });

  await provisionLocalUser(db.run);
  const afterFirst = structuredClone(db.state());
  const second = await provisionLocalUser(db.run);

  assert.deepEqual(second, { status: "already_provisioned", createdUser: false });
  assert.deepEqual(db.state(), afterFirst);
  assert.equal(db.state().memberships.filter((m) => m.status === "active").length, 1);
});

test("bestaande actieve membership blijft ongewijzigd", async () => {
  const user = { id: randomUUID(), authProviderUserId: SUBJECT };
  const tenant = { id: randomUUID(), name: "Bestaande tenant", status: "active" };
  const membership = { tenantId: tenant.id, userId: user.id, role: "team_member", status: "active" };
  const initial = { users: [user], tenants: [tenant], memberships: [membership], sessions: [activeSession()] };
  const db = fakeDb(initial);

  const result = await provisionLocalUser(db.run);

  assert.deepEqual(result, { status: "already_provisioned", createdUser: false });
  assert.deepEqual(db.state(), initial);
});

test("niet-actieve memberships worden niet aangepast; er komt een nieuwe lokale tenant bij", async () => {
  const user = { id: randomUUID(), authProviderUserId: SUBJECT };
  const tenant = { id: randomUUID(), name: "Oude tenant", status: "active" };
  const disabled = { tenantId: tenant.id, userId: user.id, role: "owner", status: "disabled" };
  const db = fakeDb({ users: [user], tenants: [tenant], memberships: [disabled], sessions: [activeSession()] });

  await provisionLocalUser(db.run);

  assert.deepEqual(db.state().memberships[0], disabled);
  assert.equal(db.state().memberships.length, 2);
  assert.deepEqual(db.state().tenants[0], tenant);
});

test("productieomgeving en ontbrekende bevestiging worden geweigerd", () => {
  assert.throws(
    () => assertLocalInvocation({ NODE_ENV: "production" }, [CONFIRM_FLAG]),
    (error: unknown) => error instanceof ProvisioningError && error.code === "production_refused",
  );
  assert.throws(
    () => assertLocalInvocation({ NODE_ENV: "development" }, []),
    (error: unknown) => error instanceof ProvisioningError && error.code === "confirmation_required",
  );
  assert.doesNotThrow(() => assertLocalInvocation({ NODE_ENV: "development" }, [CONFIRM_FLAG]));
  assert.doesNotThrow(() => assertLocalInvocation({}, [CONFIRM_FLAG]));
});

test("fout halverwege draait de hele transactie terug", async () => {
  for (const failOn of ["createTenant", "createOwnerMembership"] as const) {
    const db = fakeDb({ sessions: [activeSession()] }, { failOn });
    const before = structuredClone(db.state());

    await assert.rejects(provisionLocalUser(db.run), /simulated failure/);
    assert.deepEqual(db.state(), before, `no partial writes after failure in ${failOn}`);
  }
});
