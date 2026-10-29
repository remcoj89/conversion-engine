import { buildApp } from "./app.js";
import { readAuthConfig, type AuthConfig } from "./auth/authConfig.js";
import { findActiveMemberships } from "./auth/membershipResolver.js";
import { findActiveReviewerAssignments } from "./auth/reviewerAssignmentResolver.js";
import { findActivePlatformAdminAssignments } from "./auth/platformAdminResolver.js";
import { createDiscoveredKeySet } from "./auth/oidcDiscovery.js";
import { createZitadelAdapter } from "./auth/zitadelAdapter.js";
import { createDb } from "./db.js";
import { createLead, createLeadReader } from "./leads/leadRepository.js";
import { findCurrentOnboarding, saveOnboardingDraft, submitOnboarding } from "./onboarding/onboardingRepository.js";
import {
  approveOnboarding,
  blockOnboarding,
  findReviewableOnboarding,
  readReviewableOnboardingContent,
  reopenOnboarding,
  requestOnboardingChanges,
  unblockOnboarding,
} from "./onboarding/onboardingReviewRepository.js";
import { createPlatformTenantRepository } from "./platform/platformTenantRepository.js";
import { createPlatformTenantDetailRepository } from "./platform/platformTenantDetailRepository.js";
import { createPlatformTenantMutationRepository } from "./platform/platformTenantMutationRepository.js";
import { createPlatformAuditEventRepository } from "./platform/platformAuditEventRepository.js";
import { createTenantOwnerInvitationRepository } from "./platform/tenantOwnerInvitationRepository.js";
import { findTenant } from "./tenants/tenantLoader.js";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 4000;

const port = Number(process.env.PORT ?? DEFAULT_PORT);

// DATABASE_URL, ZITADEL_ISSUER and API_AUDIENCE are required; there is no fallback or bypass.
let authConfig: AuthConfig;
let db: ReturnType<typeof createDb>["db"];
try {
  authConfig = readAuthConfig();
  ({ db } = createDb());
} catch (error) {
  // Config errors name the missing variable, never its value.
  console.error("Configuratie ongeldig:", error instanceof Error ? error.message : "unknown");
  process.exit(1);
}

const app = buildApp({
  authAdapter: createZitadelAdapter({
    issuer: authConfig.issuer,
    audience: authConfig.audience,
    keys: createDiscoveredKeySet(authConfig.issuer),
  }),
  membershipResolver: (identity) => findActiveMemberships(db, identity),
  reviewerAssignmentResolver: (identity) => findActiveReviewerAssignments(db, identity),
  platformAdminAssignmentResolver: {
    resolve: (identity) => findActivePlatformAdminAssignments(db, identity),
  },
  platformTenantRepository: createPlatformTenantRepository(db),
  platformTenantDetailRepository: createPlatformTenantDetailRepository(db),
  platformTenantMutationRepository: createPlatformTenantMutationRepository(db),
  platformAuditEventRepository: createPlatformAuditEventRepository(db),
  tenantOwnerInvitationRepository: createTenantOwnerInvitationRepository(db),
  tenantLoader: (tenantId) => findTenant(db, tenantId),
  leadCreator: (tenantId, lead, actorUserId) => createLead(db, tenantId, lead, actorUserId),
  leadReader: createLeadReader(db),
  onboardingStore: {
    findCurrent: (tenantId) => findCurrentOnboarding(db, tenantId),
    saveDraft: (input) => saveOnboardingDraft(db, input),
    submit: (input) => submitOnboarding(db, input),
  },
  reviewStore: {
    findReviewable: (tenantId) => findReviewableOnboarding(db, tenantId),
    readContent: (input) => readReviewableOnboardingContent(db, input),
    requestChanges: (input) => requestOnboardingChanges(db, input),
    block: (input) => blockOnboarding(db, input),
    unblock: (input) => unblockOnboarding(db, input),
    approve: (input) => approveOnboarding(db, input),
    reopen: (input) => reopenOnboarding(db, input),
  },
});

try {
  await app.listen({ host: HOST, port });
} catch (error) {
  app.log.error(error, "Server kon niet starten");
  process.exit(1);
}
