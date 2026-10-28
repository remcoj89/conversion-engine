import assert from "node:assert/strict";
import test from "node:test";
import {
  parseReviewerAssignmentRevocationInvocation,
  revokeReviewerAssignment,
  REVIEWER_REVOCATION_CONFIRM_FLAG,
  ReviewerAssignmentRevocationError,
  type ReviewerAssignmentRevocationTx,
  type RunReviewerAssignmentRevocationTransaction,
} from "./reviewerAssignmentRevocation.js";

type Tenant = { id: string; status: string };
type User = { id: string };
type Assignment = {
  tenantId: string;
  reviewerId: string;
  status: "active" | "revoked";
  grantedBy: string;
  createdAt: Date;
  revokedAt: Date | null;
};
type State = { tenants: Tenant[]; users: User[]; assignments: Assignment[] };
type FailableMethod = keyof ReviewerAssignmentRevocationTx;

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const REVIEWER = "00000000-0000-4000-8000-000000000011";
const OPERATOR_A = "00000000-0000-4000-8000-000000000021";
const OPERATOR_B = "00000000-0000-4000-8000-000000000022";

function fakeDb(initial: Partial<State> = {}, options: { failOn?: FailableMethod } = {}) {
  let state: State = { tenants: [], users: [], assignments: [], ...structuredClone(initial) };

  const run: RunReviewerAssignmentRevocationTransaction = async (fn) => {
    const draft = structuredClone(state);
    const fail = (method: FailableMethod) => {
      if (options.failOn === method) throw new Error(`simulated failure in ${method}`);
    };
    const tx: ReviewerAssignmentRevocationTx = {
      async findTenant(tenantId) {
        fail("findTenant");
        return draft.tenants.find((tenant) => tenant.id === tenantId) ?? null;
      },
      async findUser(userId) {
        fail("findUser");
        return draft.users.find((user) => user.id === userId) ?? null;
      },
      async findAssignment(tenantId, reviewerId) {
        fail("findAssignment");
        const assignment = draft.assignments.find(
          (candidate) => candidate.tenantId === tenantId && candidate.reviewerId === reviewerId,
        );
        return assignment ? { status: assignment.status } : null;
      },
      async revokeAssignment({ tenantId, reviewerId }) {
        fail("revokeAssignment");
        const assignment = draft.assignments.find(
          (candidate) =>
            candidate.tenantId === tenantId && candidate.reviewerId === reviewerId && candidate.status === "active",
        );
        if (!assignment) return false;
        assignment.status = "revoked";
        assignment.revokedAt = new Date("2026-10-28T10:00:00.000Z");
        return true;
      },
    };
    const result = await fn(tx);
    state = draft;
    return result;
  };

  return { run, state: () => state };
}

const validArgv = (overrides: Record<string, string> = {}) => [
  "--tenant-id",
  overrides.tenantId ?? TENANT_A,
  "--reviewer-id",
  overrides.reviewerId ?? REVIEWER,
  "--revoked-by",
  overrides.revokedBy ?? OPERATOR_A,
  REVIEWER_REVOCATION_CONFIRM_FLAG,
];

const populated = (overrides: Partial<State> = {}): Partial<State> => ({
  tenants: [{ id: TENANT_A, status: "active" }],
  users: [{ id: REVIEWER }, { id: OPERATOR_A }, { id: OPERATOR_B }],
  ...overrides,
});

const activeAssignment = (tenantId = TENANT_A, grantedBy = OPERATOR_A): Assignment => ({
  tenantId,
  reviewerId: REVIEWER,
  status: "active",
  grantedBy,
  createdAt: new Date("2026-01-01T09:00:00.000Z"),
  revokedAt: null,
});

test("revoke vereist expliciete bevestiging en weigert productie", () => {
  assert.throws(
    () =>
      parseReviewerAssignmentRevocationInvocation(
        {},
        validArgv().filter((argument) => argument !== REVIEWER_REVOCATION_CONFIRM_FLAG),
      ),
    (error: unknown) =>
      error instanceof ReviewerAssignmentRevocationError && error.code === "confirmation_required",
  );
  assert.throws(
    () => parseReviewerAssignmentRevocationInvocation({ NODE_ENV: "production" }, validArgv()),
    (error: unknown) => error instanceof ReviewerAssignmentRevocationError && error.code === "production_refused",
  );
});

test("revoke valideert ontbrekende, ongeldige en onbekende inputs zonder mutatie", async () => {
  for (const argv of [
    [],
    ["--tenant-id", TENANT_A, "--reviewer-id", REVIEWER, REVIEWER_REVOCATION_CONFIRM_FLAG],
    [...validArgv({ tenantId: "not-a-uuid" })],
  ]) {
    assert.throws(
      () => parseReviewerAssignmentRevocationInvocation({}, argv),
      (error: unknown) => error instanceof ReviewerAssignmentRevocationError,
    );
  }

  for (const [input, code] of [
    [{ tenantId: "not-a-uuid", reviewerId: REVIEWER, revokedBy: OPERATOR_A }, "invalid_uuid"],
    [{ tenantId: TENANT_A, reviewerId: "not-a-uuid", revokedBy: OPERATOR_A }, "invalid_uuid"],
    [{ tenantId: TENANT_A, reviewerId: REVIEWER, revokedBy: "not-a-uuid" }, "invalid_uuid"],
  ] as const) {
    await assert.rejects(
      revokeReviewerAssignment(fakeDb(populated({ assignments: [activeAssignment()] })).run, input),
      (error: unknown) => error instanceof ReviewerAssignmentRevocationError && error.code === code,
    );
  }
});

test("revoke weigert onbekende of inactieve tenant, reviewer, operator en assignment", async () => {
  const cases: [Partial<State>, string][] = [
    [populated({ tenants: [] }), "tenant_not_found"],
    [populated({ tenants: [{ id: TENANT_A, status: "disabled" }] }), "tenant_inactive"],
    [populated({ users: [{ id: OPERATOR_A }], assignments: [activeAssignment()] }), "reviewer_not_found"],
    [populated({ users: [{ id: REVIEWER }], assignments: [activeAssignment()] }), "revoked_by_not_found"],
    [populated({ assignments: [] }), "assignment_not_found"],
  ];

  for (const [initial, code] of cases) {
    const db = fakeDb(initial);
    const before = structuredClone(db.state());
    await assert.rejects(
      revokeReviewerAssignment(db.run, { tenantId: TENANT_A, reviewerId: REVIEWER, revokedBy: OPERATOR_A }),
      (error: unknown) => error instanceof ReviewerAssignmentRevocationError && error.code === code,
    );
    assert.deepEqual(db.state(), before, code);
  }
});

test("actieve assignment wordt ingetrokken en bestaande assignmentvelden blijven behouden", async () => {
  const db = fakeDb(populated({ assignments: [activeAssignment()] }));

  assert.deepEqual(
    await revokeReviewerAssignment(db.run, { tenantId: TENANT_A, reviewerId: REVIEWER, revokedBy: OPERATOR_B }),
    { status: "revoked" },
  );
  const assignment = db.state().assignments[0];
  assert.equal(assignment?.status, "revoked");
  assert.equal(assignment?.grantedBy, OPERATOR_A);
  assert.deepEqual(assignment?.createdAt, new Date("2026-01-01T09:00:00.000Z"));
  assert.deepEqual(assignment?.revokedAt, new Date("2026-10-28T10:00:00.000Z"));
});

test("reeds revoked assignment is idempotent en behoudt revoked_at", async () => {
  const revokedAt = new Date("2026-02-01T09:00:00.000Z");
  const db = fakeDb(
    populated({
      assignments: [{ ...activeAssignment(), status: "revoked", revokedAt }],
    }),
  );

  assert.deepEqual(
    await revokeReviewerAssignment(db.run, { tenantId: TENANT_A, reviewerId: REVIEWER, revokedBy: OPERATOR_B }),
    { status: "already_revoked" },
  );
  assert.deepEqual(db.state().assignments[0]?.revokedAt, revokedAt);
  assert.deepEqual(
    await revokeReviewerAssignment(db.run, { tenantId: TENANT_A, reviewerId: REVIEWER, revokedBy: OPERATOR_B }),
    { status: "already_revoked" },
  );
  assert.deepEqual(db.state().assignments[0]?.revokedAt, revokedAt);
});

test("tenantisolatie blijft behouden bij dezelfde reviewer in twee tenants", async () => {
  const db = fakeDb(
    populated({
      tenants: [
        { id: TENANT_A, status: "active" },
        { id: TENANT_B, status: "active" },
      ],
      assignments: [activeAssignment(TENANT_A), activeAssignment(TENANT_B, OPERATOR_B)],
    }),
  );

  assert.deepEqual(
    await revokeReviewerAssignment(db.run, { tenantId: TENANT_A, reviewerId: REVIEWER, revokedBy: OPERATOR_B }),
    { status: "revoked" },
  );
  assert.equal(db.state().assignments.find((assignment) => assignment.tenantId === TENANT_A)?.status, "revoked");
  assert.equal(db.state().assignments.find((assignment) => assignment.tenantId === TENANT_B)?.status, "active");
});

test("een fout tijdens revoke draait de transactionele mutatie volledig terug", async () => {
  const db = fakeDb(populated({ assignments: [activeAssignment()] }), { failOn: "revokeAssignment" });
  const before = structuredClone(db.state());

  await assert.rejects(
    revokeReviewerAssignment(db.run, { tenantId: TENANT_A, reviewerId: REVIEWER, revokedBy: OPERATOR_A }),
    /simulated failure/,
  );
  assert.deepEqual(db.state(), before);
});
