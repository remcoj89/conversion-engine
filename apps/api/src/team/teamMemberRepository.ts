import { and, asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";

type Db = NodePgDatabase<typeof schema>;
type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type QueryDb = Pick<Db, "select">;

export const TEAM_MEMBER_CRM_PERMISSION_KEYS = [
  "crm:read",
  "crm:create",
  "crm:update",
  "crm:archive",
] as const;

export type TeamMemberCrmPermission = (typeof TEAM_MEMBER_CRM_PERMISSION_KEYS)[number];
export type TeamMemberRole = "owner" | "tenant_admin" | "team_member";
export type TeamMemberStatus = "active" | "invited" | "disabled";

export type TeamMember = Readonly<{
  id: string;
  label: string;
  role: TeamMemberRole;
  status: TeamMemberStatus;
  permissions: Readonly<Record<TeamMemberCrmPermission, boolean>>;
}>;

export type TeamMemberMutationResult =
  | Readonly<{ status: "updated"; member: TeamMember }>
  | Readonly<{ status: "not_found" }>
  | Readonly<{ status: "conflict"; reason: "owner_not_changeable" | "role_not_configurable" | "membership_not_active" }>;

export type TeamMemberRepository = Readonly<{
  list: (tenantId: string) => Promise<readonly TeamMember[]>;
  updatePermission: (input: Readonly<{
    tenantId: string;
    memberId: string;
    permission: TeamMemberCrmPermission;
    enabled: boolean;
  }>) => Promise<TeamMemberMutationResult>;
  updateRole: (input: Readonly<{
    tenantId: string;
    memberId: string;
    role: Exclude<TeamMemberRole, "owner">;
  }>) => Promise<TeamMemberMutationResult>;
}>;

export function createTeamMemberRepository(db: Db): TeamMemberRepository {
  return {
    list: (tenantId) => listTeamMembers(db, tenantId),
    updatePermission: (input) => updatePermission(db, input),
    updateRole: (input) => updateRole(db, input),
  };
}

export async function listTeamMembers(db: QueryDb, tenantId: string): Promise<readonly TeamMember[]> {
  const rows = await db
    .select({
      id: schema.memberships.userId,
      role: schema.memberships.role,
      status: schema.memberships.status,
      createdAt: schema.memberships.createdAt,
      permission: schema.teamMemberCrmPermissions.permission,
      enabled: schema.teamMemberCrmPermissions.enabled,
    })
    .from(schema.memberships)
    .leftJoin(
      schema.teamMemberCrmPermissions,
      and(
        eq(schema.teamMemberCrmPermissions.tenantId, schema.memberships.tenantId),
        eq(schema.teamMemberCrmPermissions.userId, schema.memberships.userId),
        eq(schema.teamMemberCrmPermissions.enabled, true),
      ),
    )
    .where(eq(schema.memberships.tenantId, tenantId))
    .orderBy(asc(schema.memberships.createdAt), asc(schema.memberships.userId), asc(schema.teamMemberCrmPermissions.permission));

  const grouped = new Map<string, {
    id: string;
    role: TeamMemberRole;
    status: TeamMemberStatus;
    permissions: Set<TeamMemberCrmPermission>;
  }>();

  for (const row of rows) {
    const current = grouped.get(row.id) ?? {
      id: row.id,
      role: row.role,
      status: row.status,
      permissions: new Set<TeamMemberCrmPermission>(),
    };
    if (row.permission && row.enabled === true && isTeamMemberCrmPermission(row.permission)) {
      current.permissions.add(row.permission);
    }
    grouped.set(row.id, current);
  }

  const counters = new Map<TeamMemberRole, number>();
  return [...grouped.values()].map((member) => {
    const ordinal = (counters.get(member.role) ?? 0) + 1;
    counters.set(member.role, ordinal);
    const permissions = Object.fromEntries(
      TEAM_MEMBER_CRM_PERMISSION_KEYS.map((permission) => [
        permission,
        member.role === "owner" || member.role === "tenant_admin" || member.permissions.has(permission),
      ]),
    ) as Record<TeamMemberCrmPermission, boolean>;
    return {
      id: member.id,
      label: safeTeamMemberLabel(member.role, ordinal),
      role: member.role,
      status: member.status,
      permissions,
    } satisfies TeamMember;
  });
}

async function updatePermission(
  db: Db,
  input: Readonly<{
    tenantId: string;
    memberId: string;
    permission: TeamMemberCrmPermission;
    enabled: boolean;
  }>,
): Promise<TeamMemberMutationResult> {
  return db.transaction(async (tx) => {
    const membership = await lockMembership(tx, input.tenantId, input.memberId);
    const conflict = checkMutableTeamMember(membership);
    if (conflict) return conflict;

    await tx
      .insert(schema.teamMemberCrmPermissions)
      .values({
        tenantId: input.tenantId,
        userId: input.memberId,
        permission: input.permission,
        enabled: input.enabled,
      })
      .onConflictDoUpdate({
        target: [
          schema.teamMemberCrmPermissions.tenantId,
          schema.teamMemberCrmPermissions.userId,
          schema.teamMemberCrmPermissions.permission,
        ],
        set: { enabled: input.enabled, updatedAt: sql`now()` },
      });

    return updatedMember(tx, input.tenantId, input.memberId);
  });
}

async function updateRole(
  db: Db,
  input: Readonly<{
    tenantId: string;
    memberId: string;
    role: Exclude<TeamMemberRole, "owner">;
  }>,
): Promise<TeamMemberMutationResult> {
  return db.transaction(async (tx) => {
    const membership = await lockMembership(tx, input.tenantId, input.memberId);
    if (!membership) return { status: "not_found" };
    if (membership.role === "owner") return { status: "conflict", reason: "owner_not_changeable" };
    if (membership.status !== "active") return { status: "conflict", reason: "membership_not_active" };

    const [updated] = await tx
      .update(schema.memberships)
      .set({ role: input.role })
      .where(and(
        eq(schema.memberships.tenantId, input.tenantId),
        eq(schema.memberships.userId, input.memberId),
      ))
      .returning({ id: schema.memberships.userId });
    if (!updated) return { status: "not_found" };

    return updatedMember(tx, input.tenantId, input.memberId);
  });
}

async function lockMembership(tx: DbTx, tenantId: string, userId: string) {
  const [membership] = await tx
    .select({ role: schema.memberships.role, status: schema.memberships.status })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.tenantId, tenantId), eq(schema.memberships.userId, userId)))
    .for("update")
    .limit(1);
  return membership;
}

function checkMutableTeamMember(
  membership: { role: TeamMemberRole; status: TeamMemberStatus } | undefined,
): TeamMemberMutationResult | null {
  if (!membership) return { status: "not_found" };
  if (membership.role === "owner") return { status: "conflict", reason: "owner_not_changeable" };
  if (membership.role !== "team_member") return { status: "conflict", reason: "role_not_configurable" };
  if (membership.status !== "active") return { status: "conflict", reason: "membership_not_active" };
  return null;
}

async function updatedMember(tx: DbTx, tenantId: string, memberId: string): Promise<TeamMemberMutationResult> {
  const members = await listTeamMembers(tx, tenantId);
  const member = members.find((candidate) => candidate.id === memberId);
  return member ? { status: "updated", member } : { status: "not_found" };
}

function safeTeamMemberLabel(role: TeamMemberRole, ordinal: number): string {
  if (role === "owner") return ordinal === 1 ? "Eigenaar" : `Eigenaar ${ordinal}`;
  if (role === "tenant_admin") return ordinal === 1 ? "Tenantbeheerder" : `Tenantbeheerder ${ordinal}`;
  return `Teamlid ${ordinal}`;
}

function isTeamMemberCrmPermission(value: string): value is TeamMemberCrmPermission {
  return (TEAM_MEMBER_CRM_PERMISSION_KEYS as readonly string[]).includes(value);
}
