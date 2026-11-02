import type { FastifyInstance } from "fastify";
import { getAuthContext } from "../auth/authHook.js";
import { authorize } from "../auth/authorization.js";
import type { LeadDashboardSummary, LeadReader } from "../leads/leadRepository.js";
import type { TenantLoader } from "../tenants/tenantLoader.js";

// Backwards-compatible fallback for older test doubles that do not provide the CRM reader.
const legacyTodayFixture = {
  actionRequired: [
    {
      id: "leads-needing-attention",
      label: "Leads die aandacht vragen",
      value: null,
      status: "unavailable",
      source: "CRM",
    },
    {
      id: "open-tasks",
      label: "Open taken",
      value: null,
      status: "unavailable",
      source: "CRM",
    },
    {
      id: "confirmed-appointments",
      label: "Bevestigde afspraken",
      value: null,
      status: "unavailable",
      source: "Boekingsprovider",
    },
  ],
  directFollowUp: {
    status: "empty",
    message:
      "CRM- en leaddata zijn nog niet beschikbaar. Zodra die bron is gekoppeld, verschijnen hier de aanvragen die opvolging nodig hebben.",
  },
} as const;

export type DashboardRouteDependencies = Readonly<{
  tenantLoader: TenantLoader;
  // Optional only for older test doubles. Production wiring always provides the reader.
  leadReader?: LeadReader;
}>;

// Must be registered behind the auth hook; without it getAuthContext fails closed.
export function registerDashboardRoutes(app: FastifyInstance, { tenantLoader, leadReader }: DashboardRouteDependencies) {
  app.get("/v1/dashboard/today", async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorize(context.role, "dashboard:read")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    // The tenant only ever comes from the auth context, never from the request.
    const tenant = await tenantLoader(context.tenantId);
    if (!tenant) {
      // Removed after the membership check: fail closed without saying why.
      return reply.code(403).send({ error: "forbidden" });
    }

    // The tenant only ever comes from the auth context. The reader repeats that boundary in SQL.
    if (!leadReader?.getTodaySummary) return { tenant, ...legacyTodayFixture };
    const summary = await leadReader.getTodaySummary(context.tenantId);
    return { tenant, ...todayDataFor(summary) };
  });
}

function todayDataFor(summary: LeadDashboardSummary) {
  const newestNewLeads = summary.newestNewLeads.slice(0, 5);
  return {
    actionRequired: [
      {
        id: "leads-needing-attention",
        label: "Leads die aandacht vragen",
        value: summary.newLeadCount,
        status: "available" as const,
        source: "CRM",
      },
      {
        id: "open-tasks",
        label: "Open taken",
        value: null,
        status: "unavailable" as const,
        source: "CRM",
      },
      {
        id: "confirmed-appointments",
        label: "Bevestigde afspraken",
        value: null,
        status: "unavailable" as const,
        source: "Boekingsprovider",
      },
    ],
    directFollowUp: newestNewLeads.length > 0
      ? {
        status: "available" as const,
        leads: newestNewLeads.map((lead) => ({
          id: lead.id,
          name: lead.name,
          message: lead.message,
          source: lead.source,
          created_at: lead.createdAt.toISOString(),
        })),
      }
      : {
        status: "empty" as const,
        message: "Er zijn geen nieuwe aanvragen om op te volgen.",
      },
  };
}
