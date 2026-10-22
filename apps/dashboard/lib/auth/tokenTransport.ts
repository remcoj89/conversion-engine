import { request as httpsRequest, type RequestOptions } from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";

// Token responses are a few KB; anything larger is not a token response.
const MAX_RESPONSE_BYTES = 64 * 1024;

export type FormPostResponse = Readonly<{ status: number; body: string }>;

// Rejects on network failure, timeout or an oversized response. Errors carry no request details.
export type PostForm = (url: string, form: URLSearchParams, timeoutMs: number) => Promise<FormPostResponse>;

type RequestFn = (url: URL, options: RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest;

export class FormPostError extends Error {
  constructor(readonly reason: "network" | "timeout" | "response_too_large") {
    super(`Form POST failed: ${reason}`);
    this.name = "FormPostError";
  }
}

// Forces IPv4: global fetch times out against the token endpoint, while an IPv4 HTTPS request succeeds.
// `request` is injectable so tests can point it at a plain-HTTP local server.
export function createFormPoster(request: RequestFn = httpsRequest): PostForm {
  return (url, form, timeoutMs) =>
    new Promise<FormPostResponse>((resolve, reject) => {
      const payload = Buffer.from(form.toString(), "utf8");
      let settled = false;
      let req: ClientRequest | undefined;

      // Never forwards the underlying error: it could reference request details.
      const fail = (reason: FormPostError["reason"]) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        req?.destroy();
        reject(new FormPostError(reason));
      };

      // A wall-clock deadline over DNS, connect and the full response, not just socket idle time.
      const timer = setTimeout(() => fail("timeout"), timeoutMs);

      try {
        req = request(
          new URL(url),
          {
            method: "POST",
            family: 4,
            headers: {
              "content-type": "application/x-www-form-urlencoded",
              "content-length": payload.length,
              accept: "application/json",
            },
          },
          (response) => {
            const chunks: Buffer[] = [];
            let size = 0;
            response.on("data", (chunk: Buffer) => {
              size += chunk.length;
              if (size > MAX_RESPONSE_BYTES) {
                fail("response_too_large");
                return;
              }
              chunks.push(chunk);
            });
            response.on("end", () => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
            });
            response.on("error", () => fail("network"));
            response.on("aborted", () => fail("network"));
          },
        );
      } catch {
        fail("network");
        return;
      }

      req.on("error", () => fail("network"));
      req.end(payload);
    });
}

export const postForm: PostForm = createFormPoster();
