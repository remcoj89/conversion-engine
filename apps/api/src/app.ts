import Fastify, { type FastifyServerOptions } from "fastify";
import { createAuthHook, type AuthHookDependencies } from "./auth/authHook.js";
import { createIdentityAuthHook, type IdentityAuthHookDependencies } from "./auth/identityAuthHook.js";
import { createIdentityOnlyAuthHook } from "./auth/identityOnlyAuthHook.js";
import { createReviewerAuthHook, type ReviewerAuthHookDependencies } from "./auth/reviewerAuthHook.js";
import { createPlatformAdminAuthHook, type PlatformAdminAuthHookDependencies } from "./auth/platformAdminAuthHook.js";
import { apiErrorHandler } from "./errors.js";
import { registerDashboardRoutes, type DashboardRouteDependencies } from "./routes/dashboard.js";
import { registerLeadReadRoutes, registerLeadRoutes, type LeadRouteDependencies } from "./routes/leads.js";
import { registerOrganizationRoutes } from "./routes/organizations.js";
import { registerContactRoutes } from "./routes/contacts.js";
import type { OrganizationContactRepository } from "./crm/organizationContactRepository.js";
import { registerOnboardingRoutes, type OnboardingRouteDependencies } from "./routes/onboarding.js";
import { registerReviewRoutes, type ReviewRouteDependencies } from "./routes/review.js";
import { registerSessionContextRoutes, type SessionContextRouteDependencies } from "./routes/sessionContext.js";
import { registerPlatformContextRoutes } from "./routes/platformContext.js";
import { registerPlatformTenantRoutes, type PlatformTenantRouteDependencies } from "./routes/platformTenants.js";
import { registerPlatformTenantDetailRoutes, type PlatformTenantDetailRouteDependencies } from "./routes/platformTenantDetails.js";
import { registerPlatformAuditEventRoutes, type PlatformAuditEventRouteDependencies } from "./routes/platformAuditEvents.js";
import {
  registerPlatformTenantOwnerInvitationRoutes,
  registerTenantOwnerInvitationAcceptanceRoutes,
  type TenantOwnerInvitationRouteDependencies,
} from "./routes/tenantOwnerInvitations.js";
import { createDatabaseRequestContext, enterDatabaseRequestContext } from "./db/requestContext.js";

export type AppDependencies = AuthHookDependencies &
  IdentityAuthHookDependencies &
  ReviewerAuthHookDependencies &
  DashboardRouteDependencies &
  LeadRouteDependencies &
  OnboardingRouteDependencies &
  ReviewRouteDependencies &
  SessionContextRouteDependencies &
  Partial<PlatformAdminAuthHookDependencies> &
  Partial<PlatformTenantRouteDependencies> &
  Partial<PlatformTenantDetailRouteDependencies> &
  Partial<PlatformAuditEventRouteDependencies> &
  Partial<TenantOwnerInvitationRouteDependencies> & {
    organizationContactRepository?: OrganizationContactRepository;
  };

export function buildApp(
  dependencies: AppDependencies,
  options: FastifyServerOptions = { logger: true },
) {
  const app = Fastify(options);

  // Set on the root before any register, so every encapsulated scope inherits it.
  app.setErrorHandler(apiErrorHandler);
  app.addHook("onRequest", (request, _reply, done) => {
    const context = createDatabaseRequestContext();
    request.dbRequestContext = context;
    enterDatabaseRequestContext(context);
    done();
  });

  // Public routes live on the root instance.
  app.get("/health", async () => {
    return { status: "ok", service: "conversion-engine-api" };
  });

  // Everything registered in this encapsulated scope requires an auth context.
  app.register(async (protectedApp) => {
    protectedApp.addHook("onRequest", createAuthHook(dependencies));
    registerDashboardRoutes(protectedApp, dependencies);
    registerLeadRoutes(protectedApp, dependencies);
    if (dependencies.leadReader) registerLeadReadRoutes(protectedApp, dependencies.leadReader);
    if (dependencies.organizationContactRepository) {
      registerOrganizationRoutes(protectedApp, {
        organizationContactRepository: dependencies.organizationContactRepository,
      });
      registerContactRoutes(protectedApp, {
        organizationContactRepository: dependencies.organizationContactRepository,
      });
    }
    registerOnboardingRoutes(protectedApp, dependencies);
  });

  // Session context has its own auth scope: it authenticates and resolves memberships, but does
  // not select a tenant before the route can report safe tenant choices.
  app.register(async (sessionApp) => {
    sessionApp.addHook("onRequest", createIdentityAuthHook(dependencies));
    registerSessionContextRoutes(sessionApp, dependencies);
  });

  // Review routes live in a sibling scope with their own hook: they are authorized by reviewer
  // assignments, not memberships, and the client auth hook above is not applied or relaxed.
  app.register(async (reviewApp) => {
    reviewApp.addHook("onRequest", createReviewerAuthHook(dependencies));
    registerReviewRoutes(reviewApp, dependencies);
  });

  // Platform routes have their own sibling scope. They do not inherit tenant membership or
  // reviewer authorization, and they never interpret x-tenant-id.
  app.register(async (platformApp) => {
    platformApp.addHook(
      "onRequest",
      createPlatformAdminAuthHook({
        authAdapter: dependencies.authAdapter,
        platformAdminAssignmentResolver:
          dependencies.platformAdminAssignmentResolver ?? { resolve: async () => [] },
      }),
    );
    registerPlatformContextRoutes(platformApp);
    if (dependencies.platformTenantRepository) {
      registerPlatformTenantRoutes(platformApp, {
        platformTenantRepository: dependencies.platformTenantRepository,
        platformTenantMutationRepository: dependencies.platformTenantMutationRepository,
      });
    }
    if (dependencies.platformTenantDetailRepository) {
      registerPlatformTenantDetailRoutes(platformApp, {
        platformTenantDetailRepository: dependencies.platformTenantDetailRepository,
      });
    }
    if (dependencies.platformAuditEventRepository) {
      registerPlatformAuditEventRoutes(platformApp, {
        platformAuditEventRepository: dependencies.platformAuditEventRepository,
      });
    }
    if (dependencies.tenantOwnerInvitationRepository) {
      registerPlatformTenantOwnerInvitationRoutes(platformApp, {
        tenantOwnerInvitationRepository: dependencies.tenantOwnerInvitationRepository,
      });
    }
  });

  // Invitation acceptance has a separate identity-only scope. A first-time invitee has no local
  // membership yet, so this scope must not inherit session-context membership resolution.
  app.register(async (invitationApp) => {
    if (!dependencies.tenantOwnerInvitationRepository) return;

    invitationApp.addHook("onRequest", createIdentityOnlyAuthHook({
      authAdapter: dependencies.authAdapter,
    }));
    registerTenantOwnerInvitationAcceptanceRoutes(invitationApp, {
      tenantOwnerInvitationRepository: dependencies.tenantOwnerInvitationRepository,
    });
  });

  return app;
}
