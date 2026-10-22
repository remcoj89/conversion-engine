import type { FastifyReply, FastifyRequest } from "fastify";

// Central handler for unexpected exceptions. Explicit 4xx replies are sent directly and never reach it.
export function apiErrorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  // Error messages are not logged: e.g. DrizzleQueryError embeds query params (subjects, tenant IDs).
  request.log.error(
    {
      errorType: error instanceof Error ? error.name : typeof error,
      errorCode: readCode(error),
      causeCode: error instanceof Error ? readCode(error.cause) : undefined,
      stackFrames: stackFrames(error),
      method: request.method,
      route: request.routeOptions.url,
    },
    "unhandled error",
  );
  return reply.code(500).send({ error: "internal_error" });
}

function readCode(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("code" in value)) return undefined;
  return typeof value.code === "string" ? value.code : undefined;
}

// Stack without its first line, which repeats the message.
function stackFrames(error: unknown): string[] | undefined {
  if (!(error instanceof Error) || !error.stack) return undefined;
  return error.stack
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("at "));
}
