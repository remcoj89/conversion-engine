import type { FastifyReply, FastifyRequest } from "fastify";
import { readRequestedTenantId } from "./authHook.js";
import { resolveReviewerContext, type ReviewerContext } from "./reviewerContext.js";
import type { AuthAdapter, MembershipResolver, ReviewerAssignmentResolver } from "./types.js";

declare module "fastify" {
  interface FastifyRequest {
    // Only set on review routes after authentication, assignment check and self-review check.
    reviewerContext?: ReviewerContext;
  }
}

export type ReviewerAuthHookDependencies = {
  authAdapter: AuthAdapter;
  // Used only to refuse self-review; a membership never grants reviewer access.
  membershipResolver: MembershipResolver;
  reviewerAssignmentResolver: ReviewerAssignmentResolver;
};

// Auth hook for the review scope. It reuses the client authentication (same adapter, same users)
// but authorizes through reviewer assignments instead of memberships.
export function createReviewerAuthHook({ authAdapter, membershipResolver, reviewerAssignmentResolver }: ReviewerAuthHookDependencies) {
  return async function reviewerAuthHook(request: FastifyRequest, reply: FastifyReply) {
    const auth = await authAdapter.authenticate(request);
    if (auth.status !== "authenticated") {
      // Never log the reason or credentials; the outcome is enough.
      request.log.info({ authOutcome: auth.status }, "review request rejected");
      return reply.code(401).send({ error: "unauthorized" });
    }

    const [assignments, memberships] = await Promise.all([
      reviewerAssignmentResolver(auth.identity),
      membershipResolver(auth.identity),
    ]);
    const result = resolveReviewerContext(assignments, memberships, readRequestedTenantId(request));

    switch (result.status) {
      case "success":
        request.reviewerContext = result.context;
        return;
      case "tenant_required":
      case "invalid_tenant":
        request.log.info({ authOutcome: result.status }, "review request rejected");
        return reply.code(400).send({ error: result.status });
      case "assignment_forbidden":
        request.log.info({ authOutcome: result.status }, "review request rejected");
        return reply.code(403).send({ error: "forbidden" });
      case "self_review_forbidden":
        request.log.info({ authOutcome: result.status }, "review request rejected");
        return reply.code(403).send({ error: "self_review_forbidden" });
    }
  };
}

// Returns the context of a review route; throws (500, no data) when the reviewer hook did not run.
export function getReviewerContext(request: FastifyRequest): ReviewerContext {
  if (!request.reviewerContext) {
    throw new Error("Reviewer context missing on review route");
  }
  return request.reviewerContext;
}
