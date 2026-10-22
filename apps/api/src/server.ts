import { buildApp } from "./app.js";
import type { AuthAdapter, MembershipResolver } from "./auth/types.js";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 4000;

const port = Number(process.env.PORT ?? DEFAULT_PORT);

// Fail-closed until the ZITADEL adapter exists: no request is ever authenticated, so
// protected routes always return 401. Deliberately no bypass, header or env switch.
const denyAllAuthAdapter: AuthAdapter = {
  authenticate: async () => ({ status: "anonymous" }),
};

// Never reached while every request is anonymous; the Drizzle resolver is wired in with ZITADEL.
const noMembershipsResolver: MembershipResolver = async () => [];

const app = buildApp({
  authAdapter: denyAllAuthAdapter,
  membershipResolver: noMembershipsResolver,
});

try {
  await app.listen({ host: HOST, port });
} catch (error) {
  app.log.error(error, "Server kon niet starten");
  process.exit(1);
}
