import type { FastifyInstance } from "fastify";
import { getAuthContext } from "../auth/authHook.js";
import { authorize } from "../auth/authorization.js";

// Vaste fixture tot er een databron is; null betekent "nog niet beschikbaar", nooit 0.
const todayFixture = {
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
      "Zodra de Conversion Engine API is gekoppeld, verschijnen hier de aanvragen die opvolging nodig hebben.",
  },
} as const;

// Must be registered behind the auth hook; without it getAuthContext fails closed.
export function registerDashboardRoutes(app: FastifyInstance) {
  app.get("/v1/dashboard/today", async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorize(context.role, "dashboard:read")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    return todayFixture;
  });
}
