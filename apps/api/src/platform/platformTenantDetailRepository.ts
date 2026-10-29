import { and, count, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import { selectCurrentOnboardingProject } from "./platformTenantRepository.js";
import type { OnboardingStatus } from "../onboarding/onboardingRepository.js";

type Db = NodePgDatabase<typeof schema>;

export type PlatformTenantDetail = Readonly<{
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

export type PlatformTenantDetailRepository = Readonly<{
  findById: (tenantId: string) => Promise<PlatformTenantDetail | null>;
}>;

type TenantRow = Readonly<Pick<PlatformTenantDetail, "id" | "name" | "status" | "createdAt">>;

type ProjectRow = Readonly<{
  id: string;
  tenantId: string;
  status: OnboardingStatus;
  currentVersion: number;
  updatedAt: Date;
}>;

type VersionRow = Readonly<{
  projectId: string;
  version: number;
}>;

// Keep this response intentionally smaller than the onboarding content model. The detail view is
// an operational lookup, not a second path to answers, Project Brief data or review material.
export function buildPlatformTenantDetail(
  tenant: TenantRow,
  projects: readonly ProjectRow[],
  currentVersion: VersionRow | null,
  websiteSummary: PlatformTenantDetail["websiteSummary"],
): PlatformTenantDetail {
  const currentProject = selectCurrentOnboardingProject(projects);
  if (currentProject && (!currentVersion || currentVersion.projectId !== currentProject.id || currentVersion.version !== currentProject.currentVersion)) {
    throw new Error("Current onboarding version is missing");
  }

  return {
    ...tenant,
    onboarding: currentProject
      ? {
        status: currentProject.status,
        version: currentProject.currentVersion,
        updatedAt: currentProject.updatedAt,
      }
      : null,
    websiteSummary,
  };
}

export function createPlatformTenantDetailRepository(db: Db): PlatformTenantDetailRepository {
  return {
    findById: (tenantId) => findPlatformTenantDetail(db, tenantId),
  };
}

export async function findPlatformTenantDetail(
  db: Db,
  tenantId: string,
): Promise<PlatformTenantDetail | null> {
  const [tenant] = await db
    .select({
      id: schema.tenants.id,
      name: schema.tenants.name,
      status: schema.tenants.status,
      createdAt: schema.tenants.createdAt,
    })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);

  if (!tenant) return null;

  const [projects, websiteSummaryRows] = await Promise.all([
    db
      .select({
        id: schema.onboardingProjects.id,
        tenantId: schema.onboardingProjects.tenantId,
        status: schema.onboardingProjects.status,
        currentVersion: schema.onboardingProjects.currentVersion,
        updatedAt: schema.onboardingProjects.updatedAt,
      })
      .from(schema.onboardingProjects)
      .where(eq(schema.onboardingProjects.tenantId, tenantId)),
    db
      .select({
        total: count(schema.websites.id).mapWith(Number),
        active: sql<number>`count(*) filter (where ${schema.websites.status} = 'active')::int`.mapWith(Number),
      })
      .from(schema.websites)
      .where(eq(schema.websites.tenantId, tenantId))
      .groupBy(schema.websites.tenantId),
  ]);

  const currentProject = selectCurrentOnboardingProject(projects);
  const [currentVersion] = currentProject
    ? await db
      .select({
        projectId: schema.onboardingVersions.projectId,
        version: schema.onboardingVersions.version,
      })
      .from(schema.onboardingVersions)
      .where(and(
        eq(schema.onboardingVersions.tenantId, tenantId),
        eq(schema.onboardingVersions.projectId, currentProject.id),
        eq(schema.onboardingVersions.version, currentProject.currentVersion),
      ))
      .limit(1)
    : [null];

  return buildPlatformTenantDetail(
    tenant,
    projects,
    currentVersion ?? null,
    {
      total: websiteSummaryRows[0]?.total ?? 0,
      active: websiteSummaryRows[0]?.active ?? 0,
    },
  );
}
