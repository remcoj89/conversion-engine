import type { FastifyInstance } from "fastify";
import { getAuthContext } from "../auth/authHook.js";
import { authorize } from "../auth/authorization.js";
import { parseLeadInput } from "../leads/leadInput.js";
import type { Lead, NewLead } from "../leads/leadRepository.js";

// Keeps the HTTP layer independent of Drizzle/PostgreSQL. Always called with context.tenantId.
export type LeadCreator = (tenantId: string, lead: NewLead) => Promise<Lead>;

export type LeadRouteDependencies = Readonly<{
  leadCreator: LeadCreator;
}>;

// Well above the field limits in leadInput.ts, far below Fastify's 1 MiB default.
const BODY_LIMIT_BYTES = 16 * 1024;

// Must be registered behind the auth hook; without it getAuthContext fails closed.
// Not a public form endpoint: there is no trusted site-to-tenant resolver yet.
export function registerLeadRoutes(app: FastifyInstance, { leadCreator }: LeadRouteDependencies) {
  app.post("/v1/leads", { bodyLimit: BODY_LIMIT_BYTES }, async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorize(context.role, "leads:create")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const input = parseLeadInput(request.body);
    if (!input.ok) {
      return reply.code(400).send({ error: "invalid_body" });
    }

    // The tenant only ever comes from the auth context, never from the body.
    const lead = await leadCreator(context.tenantId, input.lead);
    return reply.code(201).send({ id: lead.id, status: lead.status, createdAt: lead.createdAt.toISOString() });
  });
}
