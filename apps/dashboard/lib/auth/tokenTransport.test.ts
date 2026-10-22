import assert from "node:assert/strict";
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createFormPoster, FormPostError } from "./tokenTransport";

const AUTH_CODE = "authorization-code-secret-value";

type Received = { method?: string; headers: IncomingMessage["headers"]; body: string; remoteAddress?: string };

async function withServer(
  respond: (req: IncomingMessage, res: ServerResponse) => void,
  run: (url: string, received: Received[]) => Promise<void>,
) {
  const received: Received[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      received.push({
        method: req.method,
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
        remoteAddress: req.socket.remoteAddress,
      });
      respond(req, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    // "localhost" resolves to ::1 first on many systems, so this also exercises the IPv4 forcing.
    await run(`http://localhost:${port}/oauth/v2/token`, received);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

const postForm = createFormPoster(httpRequest);
const form = () => new URLSearchParams({ grant_type: "authorization_code", code: AUTH_CODE });

test("verstuurt een form-POST over IPv4 en geeft status en body terug", async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"access_token":"a"}');
    },
    async (url, received) => {
      const response = await postForm(url, form(), 1000);
      assert.deepEqual(response, { status: 200, body: '{"access_token":"a"}' });

      assert.equal(received.length, 1);
      const [req] = received;
      assert.equal(req.method, "POST");
      assert.equal(req.headers["content-type"], "application/x-www-form-urlencoded");
      assert.equal(req.headers.accept, "application/json");
      assert.equal(req.headers["content-length"], String(Buffer.byteLength(req.body)));
      assert.deepEqual(Object.fromEntries(new URLSearchParams(req.body)), Object.fromEntries(form()));
      assert.match(req.remoteAddress ?? "", /^(::ffff:)?127\.0\.0\.1$/);
    },
  );
});

test("niet-2xx-statussen worden doorgegeven, niet als fout gegooid", async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(400, { "content-type": "application/json" });
      res.end('{"error":"invalid_grant"}');
    },
    async (url) => {
      assert.equal((await postForm(url, form(), 1000)).status, 400);
    },
  );
});

test("timeout breekt het verzoek af met een generieke fout", async () => {
  await withServer(
    () => undefined, // never responds
    async (url) => {
      await assert.rejects(postForm(url, form(), 100), (error: unknown) => {
        assert.ok(error instanceof FormPostError);
        assert.equal(error.reason, "timeout");
        assert.equal(error.message.includes(AUTH_CODE), false);
        return true;
      });
    },
  );
});

test("onbereikbaar endpoint geeft een generieke netwerkfout", async () => {
  // Port 1 on loopback is closed: the connection is refused immediately.
  await assert.rejects(postForm("http://127.0.0.1:1/token", form(), 1000), (error: unknown) => {
    assert.ok(error instanceof FormPostError);
    assert.equal(error.reason, "network");
    assert.equal(error.message.includes(AUTH_CODE), false);
    return true;
  });
});

test("te grote response wordt afgebroken", async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(200);
      res.end("x".repeat(65 * 1024));
    },
    async (url) => {
      await assert.rejects(postForm(url, form(), 1000), (error: unknown) => {
        assert.ok(error instanceof FormPostError);
        assert.equal(error.reason, "response_too_large");
        return true;
      });
    },
  );
});
