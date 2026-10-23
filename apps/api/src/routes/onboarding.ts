import type { FastifyInstance } from "fastify";
import { getAuthContext } from "../auth/authHook.js";
import { authorize } from "../auth/authorization.js";
import type { OnboardingDraft, SaveDraftInput, SaveDraftResult } from "../onboarding/onboardingRepository.js";
import { buildProjectBrief, onboardingSchema, parseAnswers } from "../../../../packages/onboarding-contract/src/index.ts";

// Houdt de HTTP-laag los van Drizzle/PostgreSQL. Wordt altijd aangeroepen met context.tenantId.
export type OnboardingStore = Readonly<{
  findCurrent: (tenantId: string) => Promise<OnboardingDraft | null>;
  saveDraft: (input: SaveDraftInput) => Promise<SaveDraftResult>;
}>;

export type OnboardingRouteDependencies = Readonly<{
  onboardingStore: OnboardingStore;
  now?: () => Date;
}>;

// 123 velden met tekstvakken tot enkele duizenden tekens passen ruim; daarboven is het geen normale intake.
const BODY_LIMIT_BYTES = 256 * 1024;
const PUT_KEYS = ["answers", "base_version", "schema_id", "schema_version"];

const noStore = { "cache-control": "no-store" };

function draftResponse(draft: OnboardingDraft) {
  return {
    status: draft.status,
    version: draft.version,
    schema_id: draft.schemaId,
    schema_version: draft.schemaVersion,
    answers: draft.answers,
    project_brief: draft.projectBrief,
    updated_at: draft.updatedAt.toISOString(),
  };
}

// Moet achter de auth-hook staan; zonder hook faalt getAuthContext gesloten.
export function registerOnboardingRoutes(app: FastifyInstance, { onboardingStore, now = () => new Date() }: OnboardingRouteDependencies) {
  app.get("/v1/onboarding/current", async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorize(context.role, "onboarding:manage")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    reply.headers(noStore);
    // De tenant komt uitsluitend uit de auth-context.
    const draft = await onboardingStore.findCurrent(context.tenantId);
    if (draft) return draftResponse(draft);
    return {
      status: "draft",
      version: 0,
      schema_id: onboardingSchema.id,
      schema_version: onboardingSchema.version,
      answers: {},
      project_brief: buildProjectBrief({}, { reviewStatus: "draft", now: now() }),
      updated_at: null,
    };
  });

  app.put("/v1/onboarding/current", { bodyLimit: BODY_LIMIT_BYTES }, async (request, reply) => {
    const context = getAuthContext(request);
    if (!authorize(context.role, "onboarding:manage")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    reply.headers(noStore);

    const body = request.body;
    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      Object.keys(body).sort().join(",") !== PUT_KEYS.join(",")
    ) {
      return reply.code(400).send({ error: "invalid_body" });
    }
    const { schema_id: schemaId, schema_version: schemaVersion, base_version: baseVersion, answers } = body as Record<string, unknown>;
    if (typeof schemaId !== "string" || typeof schemaVersion !== "string" || !Number.isSafeInteger(baseVersion) || (baseVersion as number) < 0) {
      return reply.code(400).send({ error: "invalid_body" });
    }
    // Een client met een ander schema kan antwoorden niet betrouwbaar duiden; eerst verversen.
    if (schemaId !== onboardingSchema.id || schemaVersion !== onboardingSchema.version) {
      return reply.code(409).send({ error: "schema_mismatch", schema_id: onboardingSchema.id, schema_version: onboardingSchema.version });
    }

    // Server-side validatie; verborgen conditionele waarden en lege waarden worden hier verwijderd.
    const parsed = parseAnswers(answers);
    if (!parsed.ok) {
      return reply.code(400).send({ error: "invalid_answers", issues: parsed.issues });
    }

    const projectBrief = buildProjectBrief(parsed.answers, { reviewStatus: "draft", now: now() });
    const result = await onboardingStore.saveDraft({
      tenantId: context.tenantId,
      userId: context.userId,
      baseVersion: baseVersion as number,
      schemaId,
      schemaVersion,
      answers: parsed.answers as Record<string, unknown>,
      projectBrief: projectBrief as unknown as Record<string, unknown>,
    });

    switch (result.status) {
      case "conflict":
        return reply.code(409).send({ error: "version_conflict", current_version: result.currentVersion });
      case "not_editable":
        return reply.code(409).send({ error: "not_editable" });
      case "saved":
        return {
          status: result.draft.status,
          version: result.draft.version,
          updated_at: result.draft.updatedAt.toISOString(),
          missing_count: projectBrief.review.required_fields_missing.length,
        };
    }
  });
}
