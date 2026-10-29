import { and, desc, eq, ilike, inArray, lt, or, sql, count } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import { UUID_PATTERN } from "../auth/requestContext.js";
import type { OnboardingStatus } from "../onboarding/onboardingRepository.js";

type Db = NodePgDatabase<typeof schema>;

export type PlatformTenantOnboardingFilter = OnboardingStatus | "not_started";

const CURSOR_MAX_LENGTH = 256;

export type PlatformTenantCursor = Readonly<{
  createdAt: Date;
  id: string;
}>;

export type PlatformTenantListQuery = Readonly<{
  q?: string;
  status?: string;
  onboardingStatus?: PlatformTenantOnboardingFilter;
  limit: number;
  cursor?: PlatformTenantCursor;
}>;

export type PlatformTenantListItem = Readonly<{
  id: string;
  name: string;
  status: string;
  createdAt: Date;
  onboarding: Readonly<{
    status: OnboardingStatus;
    version: number;
    updatedAt: Date;
  }> | null;
  websiteSummary: Readonly<{
    total: number;
    active: number;
  }>;
}>;

export type PlatformTenantListResult = Readonly<{
  items: readonly PlatformTenantListItem[];
  nextCursor: PlatformTenantCursor | null;
}>;

// Keeps the route independent of Drizzle/PostgreSQL and makes the HTTP contract easy to test.
export type PlatformTenantRepository = Readonly<{
  list: (query: PlatformTenantListQuery) => Promise<PlatformTenantListResult>;
}>;

type TenantRow = Readonly<{
  id: string;
  name: string;
  status: string;
  createdAt: Date;
}>;

type OnboardingProjectRow = Readonly<{
  id: string;
  tenantId: string;
  status: OnboardingStatus;
  currentVersion: number;
  updatedAt: Date;
}>;

type OnboardingVersionRow = Readonly<{
  projectId: string;
  version: number;
}>;

type WebsiteSummaryRow = Readonly<{
  tenantId: string;
  total: number;
  active: number;
}>;

// The cursor is opaque at the HTTP boundary, but remains a typed value inside the repository.
export function encodePlatformTenantCursor(cursor: PlatformTenantCursor): string {
  const payload = JSON.stringify({
    created_at: cursor.createdAt.toISOString(),
    id: cursor.id,
  });
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodePlatformTenantCursor(value: unknown): PlatformTenantCursor | null {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > CURSOR_MAX_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

    const fields = parsed as Record<string, unknown>;
    if (
      Object.keys(fields).sort().join(",") !== "created_at,id"
      || typeof fields.created_at !== "string"
      || typeof fields.id !== "string"
      || !UUID_PATTERN.test(fields.id)
    ) {
      return null;
    }

    const createdAt = new Date(fields.created_at);
    if (Number.isNaN(createdAt.getTime())) return null;

    return { createdAt, id: fields.id };
  } catch {
    return null;
  }
}

// The active non-approved project wins. When no open project exists, the latest approved project
// wins. The ID tie-breaker keeps the result deterministic even when timestamps are equal.
export function selectCurrentOnboardingProject(
  projects: readonly OnboardingProjectRow[],
): OnboardingProjectRow | null {
  const openProject = projects
    .filter((project) => project.status !== "approved")
    .sort(compareProjectRecency)[0];
  if (openProject) return openProject;

  return projects
    .filter((project) => project.status === "approved")
    .sort(compareProjectRecency)[0] ?? null;
}

function compareProjectRecency(left: OnboardingProjectRow, right: OnboardingProjectRow): number {
  const updatedAtDifference = right.updatedAt.getTime() - left.updatedAt.getTime();
  if (updatedAtDifference !== 0) return updatedAtDifference;
  return right.id === left.id ? 0 : right.id > left.id ? 1 : -1;
}

// Pure mapping keeps tenant joins explicit and prevents a summary belonging to tenant B from being
// attached to tenant A by an accidental array index or shared mutable accumulator.
export function buildPlatformTenantListItems(
  tenants: readonly TenantRow[],
  projects: readonly OnboardingProjectRow[],
  versions: readonly OnboardingVersionRow[],
  websiteSummaries: readonly WebsiteSummaryRow[],
): readonly PlatformTenantListItem[] {
  const projectsByTenant = groupBy(projects, (project) => project.tenantId);
  const versionsByProject = new Set(versions.map((version) => `${version.projectId}:${version.version}`));
  const websitesByTenant = new Map(websiteSummaries.map((summary) => [summary.tenantId, summary]));

  return tenants.map((tenant) => {
    const currentProject = selectCurrentOnboardingProject(projectsByTenant.get(tenant.id) ?? []);
    const onboarding = currentProject
      ? toOnboardingSummary(currentProject, versionsByProject)
      : null;
    const websiteSummary = websitesByTenant.get(tenant.id);

    return {
      id: tenant.id,
      name: tenant.name,
      status: tenant.status,
      createdAt: tenant.createdAt,
      onboarding,
      websiteSummary: {
        total: websiteSummary?.total ?? 0,
        active: websiteSummary?.active ?? 0,
      },
    };
  });
}

function groupBy<T>(rows: readonly T[], keyOf: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      grouped.set(key, [row]);
    }
  }
  return grouped;
}

function toOnboardingSummary(
  project: OnboardingProjectRow,
  versions: ReadonlySet<string>,
): PlatformTenantListItem["onboarding"] {
  if (!versions.has(`${project.id}:${project.currentVersion}`)) {
    // A project pointing at a missing version is a data-integrity failure, not an empty state.
    throw new Error("Current onboarding version is missing");
  }

  return {
    status: project.status,
    version: project.currentVersion,
    updatedAt: project.updatedAt,
  };
}

export function createPlatformTenantRepository(db: Db): PlatformTenantRepository {
  return {
    list: (query) => listPlatformTenants(db, query),
  };
}

export async function listPlatformTenants(
  db: Db,
  query: PlatformTenantListQuery,
): Promise<PlatformTenantListResult> {
  const conditions = [sql`true`];

  if (query.q) {
    conditions.push(ilike(schema.tenants.name, `%${escapeLikePattern(query.q)}%`));
  }
  if (query.status) {
    conditions.push(eq(schema.tenants.status, query.status));
  }
  if (query.onboardingStatus) {
    conditions.push(currentOnboardingStatusFilter(query.onboardingStatus));
  }
  if (query.cursor) {
    conditions.push(
      or(
        lt(schema.tenants.createdAt, query.cursor.createdAt),
        and(
          eq(schema.tenants.createdAt, query.cursor.createdAt),
          lt(schema.tenants.id, query.cursor.id),
        ),
      )!,
    );
  }

  const tenantRows = await db
    .select({
      id: schema.tenants.id,
      name: schema.tenants.name,
      status: schema.tenants.status,
      createdAt: schema.tenants.createdAt,
    })
    .from(schema.tenants)
    .where(and(...conditions))
    .orderBy(desc(schema.tenants.createdAt), desc(schema.tenants.id))
    .limit(query.limit + 1);

  const hasMore = tenantRows.length > query.limit;
  const pageTenants = tenantRows.slice(0, query.limit);
  if (pageTenants.length === 0) {
    return { items: [], nextCursor: null };
  }

  const tenantIds = pageTenants.map((tenant) => tenant.id);
  const [projectRows, websiteRows] = await Promise.all([
    db
      .select({
        id: schema.onboardingProjects.id,
        tenantId: schema.onboardingProjects.tenantId,
        status: schema.onboardingProjects.status,
        currentVersion: schema.onboardingProjects.currentVersion,
        updatedAt: schema.onboardingProjects.updatedAt,
      })
      .from(schema.onboardingProjects)
      .where(inArray(schema.onboardingProjects.tenantId, tenantIds)),
    db
      .select({
        tenantId: schema.websites.tenantId,
        total: count(schema.websites.id).mapWith(Number),
        active: sql<number>`count(*) filter (where ${schema.websites.status} = 'active')::int`.mapWith(Number),
      })
      .from(schema.websites)
      .where(inArray(schema.websites.tenantId, tenantIds))
      .groupBy(schema.websites.tenantId),
  ]);

  const currentProjects = pageTenants
    .map((tenant) => selectCurrentOnboardingProject(projectRowsForTenant(projectRows, tenant.id)))
    .filter((project): project is OnboardingProjectRow => project !== null);
  const versionRows = await findCurrentOnboardingVersions(db, currentProjects);
  const items = buildPlatformTenantListItems(pageTenants, projectRows, versionRows, websiteRows);

  return {
    items,
    nextCursor: hasMore
      ? {
        createdAt: pageTenants[pageTenants.length - 1]!.createdAt,
        id: pageTenants[pageTenants.length - 1]!.id,
      }
      : null,
  };
}

function projectRowsForTenant(
  projects: readonly OnboardingProjectRow[],
  tenantId: string,
): readonly OnboardingProjectRow[] {
  return projects.filter((project) => project.tenantId === tenantId);
}

async function findCurrentOnboardingVersions(
  db: Db,
  projects: readonly OnboardingProjectRow[],
): Promise<readonly OnboardingVersionRow[]> {
  if (projects.length === 0) return [];

  const currentVersionConditions = projects.map((project) =>
    and(
      eq(schema.onboardingVersions.projectId, project.id),
      eq(schema.onboardingVersions.version, project.currentVersion),
    )!,
  );

  return db
    .select({
      projectId: schema.onboardingVersions.projectId,
      version: schema.onboardingVersions.version,
    })
    .from(schema.onboardingVersions)
    .where(or(...currentVersionConditions)!);
}

function currentOnboardingStatusFilter(status: PlatformTenantOnboardingFilter) {
  if (status === "not_started") {
    return sql`
      not exists (
        select 1
        from ${schema.onboardingProjects}
        where ${schema.onboardingProjects.tenantId} = ${schema.tenants.id}
      )
    `;
  }

  const nonApprovedProjectExists = sql`
    exists (
      select 1
      from ${schema.onboardingProjects}
      where ${schema.onboardingProjects.tenantId} = ${schema.tenants.id}
        and ${schema.onboardingProjects.status} <> 'approved'
    )
  `;

  if (status === "approved") {
    return sql`
      not (${nonApprovedProjectExists})
      and exists (
        select 1
        from ${schema.onboardingProjects}
        where ${schema.onboardingProjects.tenantId} = ${schema.tenants.id}
          and ${schema.onboardingProjects.status} = ${status}
      )
    `;
  }

  return sql`
    exists (
      select 1
      from ${schema.onboardingProjects}
      where ${schema.onboardingProjects.tenantId} = ${schema.tenants.id}
        and ${schema.onboardingProjects.status} = ${status}
    )
  `;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
