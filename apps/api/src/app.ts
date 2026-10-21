import Fastify, { type FastifyServerOptions } from "fastify";

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

export function buildApp(options: FastifyServerOptions = { logger: true }) {
  const app = Fastify(options);

  app.get("/health", async () => {
    return { status: "ok", service: "conversion-engine-api" };
  });

  app.get("/v1/dashboard/today", async () => {
    return todayFixture;
  });

  return app;
}
