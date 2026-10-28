import assert from "node:assert/strict";
import test from "node:test";
import {
  parseReviewerAssignmentInvocation,
  provisionReviewerAssignment,
  REVIEWER_CONFIRM_FLAG,
  ReviewerAssignmentProvisioningError,
  type ReviewerAssignmentProvisioningTx,
  type RunReviewerAssignmentTransaction,
} from "./reviewerAssignmentProvisioning.js";

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
type FailableMethod = keyof ReviewerAssignmentProvisioningTx;

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const REVIEWER = "00000000-0000-4000-8000-000000000011";
const OPERATOR_A = "00000000-0000-4000-8000-000000000021";
const OPERATOR_B = "00000000-0000-4000-8000-000000000022";

function fakeDb(initial: Partial<State> = {}, options: { failOn?: FailableMethod } = {}) {
  let state: State = { tenants: [], users: [], assignments: [], ...structuredClone(initial) };

  const run: RunReviewerAssignmentTransaction = async (fn) => {
    const draft = structuredClone(state);
    const fail = (method: FailableMethod) => {
      if (options.failOn === method) throw new Error(`simulated failure in ${method}`);
    };
    const tx: ReviewerAssignmentProvisioningTx = {
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
        return assignment ? structuredClone(assignment) : null;
      },
      async createAssignment({ tenantId, reviewerId, grantedBy }) {
        fail("createAssignment");
        if (draft.assignments.some((candidate) => candidate.tenantId === tenantId && candidate.reviewerId === reviewerId)) {
          return false;
        }
        draft.assignments.push({
          tenantId,
          reviewerId,
          status: "active",
          grantedBy,
          createdAt: new Date("2026-10-27T10:00:00.000Z"),
          revokedAt: null,
        });
        return true;
      },
      async reactivateAssignment({ tenantId, reviewerId, grantedBy }) {
        fail("reactivateAssignment");
        const assignment = draft.assignments.find(
          (candidate) =>
            candidate.tenantId === tenantId && candidate.reviewerId === reviewerId && candidate.status === "revoked",
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

const validArgv = (overrides: Record<string, string> = {}) => [
  "--tenant-id",
  overrides.tenantId ?? TENANT_A,
  "--reviewer-id",
  overrides.reviewerId ?? REVIEWER,
  "--granted-by",
  overrides.grantedBy ?? OPERATOR_A,
  REVIEWER_CONFIRM_FLAG,
];

const populated = (overrides: Partial<State> = {}): Partial<State> => ({
  tenants: [{ id: TENANT_A, status: "active" }],
  users: [{ id: REVIEWER }, { id: OPERATOR_A }, { id: OPERATOR_B }],
  ...overrides,
});
test("provisioning vereist expliciete bevestiging en weigert productie", () => {
  assert.throws(
    () => parseReviewerAssignmentInvocation({}, validArgv().filter((argument) => argument !== REVIEWER_CONFIRM_FLAG)),
    (error: unknown) => error instanceof ReviewerAssignmentProvisioningError && error.code === "confirmation_required",
  );
  assert.throws(
    () => parseReviewerAssignmentInvocation({ NODE_ENV: "production" }, validArgv()),
    (error: unknown) => error instanceof ReviewerAssignmentProvisioningError && error.code === "production_refused",
  );
});

test("provisioning weigert ontbrekende, ongeldige en onbekende parameters", async () => {
  for (const argv of [
    [],
    ["--tenant-id", TENANT_A, "--reviewer-id", REVIEWER, REVIEWER_CONFIRM_FLAG],
    [...validArgv({ tenantId: "not-a-uuid" })],
  ]) {
    assert.throws(
      () => parseReviewerAssignmentInvocation({}, argv),
      (error: unknown) => error instanceof ReviewerAssignmentProvisioningError,
    );
  }

  for (const [input, code] of [
    [{ tenantId: "not-a-uuid", reviewerId: REVIEWER, grantedBy: OPERATOR_A }, "invalid_uuid"],
    [{ tenantId: TENANT_A, reviewerId: "not-a-uuid", grantedBy: OPERATOR_A }, "invalid_uuid"],
    [{ tenantId: TENANT_A, reviewerId: REVIEWER, grantedBy: "not-a-uuid" }, "invalid_uuid"],
  ] as const) {
    await assert.rejects(
      provisionReviewerAssignment(fakeDb(populated()).run, input),
      (error: unknown) => error instanceof ReviewerAssignmentProvisioningError && error.code === code,
    );
  }
});

test("provisioning weigert onbekende of inactieve tenant, reviewer en granted_by", async () => {
  const cases: [Partial<State>, string, string][] = [
    [populated({ tenants: [] }), "tenant_not_found", "tenant"],
    [populated({ tenants: [{ id: TENANT_A, status: "disabled" }] }), "tenant_inactive", "tenant"],
    [populated({ users: [{ id: OPERATOR_A }] }), "reviewer_not_found", "reviewer"],
    [populated({ users: [{ id: REVIEWER }] }), "granted_by_not_found", "granted_by"],
  ];
  for (const [initial, code, label] of cases) {
    await assert.rejects(
      provisionReviewerAssignment(fakeDb(initial).run, { tenantId: TENANT_A, reviewerId: REVIEWER, grantedBy: OPERATOR_A }),
      (error: unknown) => {
        assert.equal((error as ReviewerAssignmentProvisioningError).code, code, label);
        return error instanceof ReviewerAssignmentProvisioningError;
      },
    );
  }
});

test("nieuwe assignment is active, bevat granted_by en gebruikt de database-created_at", async () => {
  const db = fakeDb(populated());
  const result = await provisionReviewerAssignment(db.run, { tenantId: TENANT_A, reviewerId: REVIEWER, grantedBy: OPERATOR_A });

  assert.deepEqual(result, { status: "created" });
  assert.deepEqual(db.state().assignments, [
    {
      tenantId: TENANT_A,
      reviewerId: REVIEWER,
      status: "active",
      grantedBy: OPERATOR_A,
      createdAt: new Date("2026-10-27T10:00:00.000Z"),
      revokedAt: null,
    },
  ]);
});

test("revoked assignment wordt heractiveerd met nieuwe granted_by en behoudt created_at", async () => {
  const createdAt = new Date("2026-01-01T09:00:00.000Z");
  const revokedAt = new Date("2026-02-01T09:00:00.000Z");
  const db = fakeDb(
    populated({
      assignments: [
        {
          tenantId: TENANT_A,
          reviewerId: REVIEWER,
          status: "revoked",
          grantedBy: OPERATOR_A,
          createdAt,
          revokedAt,
        },
      ],
    }),
  );

  assert.deepEqual(
    await provisionReviewerAssignment(db.run, { tenantId: TENANT_A, reviewerId: REVIEWER, grantedBy: OPERATOR_B }),
    { status: "reactivated" },
  );
  const assignment = db.state().assignments[0];
  assert.equal(assignment?.status, "active");
  assert.equal(assignment?.grantedBy, OPERATOR_B);
  assert.equal(assignment?.revokedAt, null);
  assert.deepEqual(assignment?.createdAt, createdAt);
});

test("actieve assignment is idempotent en wordt niet overschreven of gedupliceerd", async () => {
  const existing = {
    tenantId: TENANT_A,
    reviewerId: REVIEWER,
    status: "active" as const,
    grantedBy: OPERATOR_A,
    createdAt: new Date("2026-01-01T09:00:00.000Z"),
    revokedAt: null,
  };
  const db = fakeDb(populated({ assignments: [existing] }));

  assert.deepEqual(
    await provisionReviewerAssignment(db.run, { tenantId: TENANT_A, reviewerId: REVIEWER, grantedBy: OPERATOR_B }),
    { status: "already_active" },
  );
  assert.deepEqual(
    await provisionReviewerAssignment(db.run, { tenantId: TENANT_A, reviewerId: REVIEWER, grantedBy: OPERATOR_B }),
    { status: "already_active" },
  );
  assert.deepEqual(db.state().assignments, [existing]);
});

test("tenantisolatie blijft behouden bij dezelfde reviewer in twee tenants", async () => {
  const db = fakeDb(
    populated({
      tenants: [
        { id: TENANT_A, status: "active" },
        { id: TENANT_B, status: "active" },
      ],
      assignments: [
        {
          tenantId: TENANT_A,
          reviewerId: REVIEWER,
          status: "active",
          grantedBy: OPERATOR_A,
          createdAt: new Date("2026-01-01T09:00:00.000Z"),
          revokedAt: null,
        },
      ],
    }),
  );

  assert.deepEqual(
    await provisionReviewerAssignment(db.run, { tenantId: TENANT_B, reviewerId: REVIEWER, grantedBy: OPERATOR_B }),
    { status: "created" },
  );
  assert.equal(db.state().assignments.length, 2);
  assert.deepEqual(
    db.state().assignments.map(({ tenantId, grantedBy }) => ({ tenantId, grantedBy })).sort((a, b) => a.tenantId.localeCompare(b.tenantId)),
    [
      { tenantId: TENANT_A, grantedBy: OPERATOR_A },
      { tenantId: TENANT_B, grantedBy: OPERATOR_B },
    ],
  );
});

test("een fout draait de transactionele assignmentmutatie volledig terug", async () => {
  for (const failOn of ["createAssignment", "reactivateAssignment"] as const) {
    const initial: Partial<State> = populated({
      assignments:
        failOn === "reactivateAssignment"
          ? [
              {
                tenantId: TENANT_A,
                reviewerId: REVIEWER,
                status: "revoked",
                grantedBy: OPERATOR_A,
                createdAt: new Date("2026-01-01T09:00:00.000Z"),
                revokedAt: new Date("2026-02-01T09:00:00.000Z"),
              },
            ]
          : [],
    });
    const db = fakeDb(initial, { failOn });
    const before = structuredClone(db.state());
    const input = { tenantId: TENANT_A, reviewerId: REVIEWER, grantedBy: OPERATOR_B };

    await assert.rejects(provisionReviewerAssignment(db.run, input), /simulated failure/);
    assert.deepEqual(db.state(), before, `no partial writes after failure in ${failOn}`);
  }
});
