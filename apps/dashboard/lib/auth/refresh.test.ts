import assert from "node:assert/strict";
import test from "node:test";
import { createTokenRefresher, RefreshError } from "./refresh";
import { FormPostError, type FormPostResponse } from "./tokenTransport";

const CLIENT_ID = "dashboard-client";
const TOKEN_ENDPOINT = "https://id.example.test/oauth/v2/token";
const REFRESH_TOKEN = "refresh-token-secret-value";
const NEW_ACCESS_TOKEN = "new-access-token-secret-value";
const NEW_REFRESH_TOKEN = "new-refresh-token-secret-value";

type PostCall = { url: string; form: URLSearchParams; timeoutMs: number };

function setup(respond: () => FormPostResponse | Promise<FormPostResponse>) {
  const calls: PostCall[] = [];
  const refresh = createTokenRefresher({
    clientId: CLIENT_ID,
    tokenEndpoint: TOKEN_ENDPOINT,
    postForm: async (url, form, timeoutMs) => {
      calls.push({ url, form, timeoutMs });
      return respond();
    },
  });
  return { refresh, calls };
}

const json = (body: unknown, status = 200): FormPostResponse => ({ status, body: JSON.stringify(body) });

async function assertRefreshError(promise: Promise<unknown>, reason: RefreshError["reason"]) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof RefreshError);
    assert.equal(error.reason, reason);
    for (const secret of [REFRESH_TOKEN, NEW_ACCESS_TOKEN, NEW_REFRESH_TOKEN]) {
      assert.equal(error.message.includes(secret), false);
    }
    return true;
  });
}

test("refresh stuurt grant_type, refresh_token en client_id als form-POST met timeout", async () => {
  const { refresh, calls } = setup(() => json({ access_token: NEW_ACCESS_TOKEN, expires_in: 3600 }));
  await refresh(REFRESH_TOKEN);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, TOKEN_ENDPOINT);
  assert.equal(calls[0].timeoutMs, 5000);
  assert.deepEqual(Object.fromEntries(calls[0].form), {
    grant_type: "refresh_token",
    refresh_token: REFRESH_TOKEN,
    client_id: CLIENT_ID,
  });
});

test("response met nieuw refresh-token geeft dat token terug voor rotatie", async () => {
  const { refresh } = setup(() =>
    json({
      access_token: NEW_ACCESS_TOKEN,
      refresh_token: NEW_REFRESH_TOKEN,
      expires_in: 3600,
      token_type: "Bearer",
      scope: "openid offline_access",
    }),
  );
  assert.deepEqual(await refresh(REFRESH_TOKEN), {
    accessToken: NEW_ACCESS_TOKEN,
    refreshToken: NEW_REFRESH_TOKEN,
    expiresIn: 3600,
  });
});

test("response zonder refresh-token laat refreshToken weg", async () => {
  const { refresh } = setup(() => json({ access_token: NEW_ACCESS_TOKEN, expires_in: 3600 }));
  const tokens = await refresh(REFRESH_TOKEN);
  assert.deepEqual(tokens, { accessToken: NEW_ACCESS_TOKEN, expiresIn: 3600 });
  assert.equal("refreshToken" in tokens, false);
});

test("een id_token in de refreshresponse wordt genegeerd", async () => {
  const { refresh } = setup(() => json({ access_token: NEW_ACCESS_TOKEN, expires_in: 3600, id_token: "id.token.value" }));
  assert.deepEqual(Object.keys(await refresh(REFRESH_TOKEN)).sort(), ["accessToken", "expiresIn"]);
});

test("response zonder geldig access_token wordt geweigerd", async () => {
  for (const access_token of [undefined, "", 42, null]) {
    const { refresh } = setup(() => json({ access_token, expires_in: 3600 }));
    await assertRefreshError(refresh(REFRESH_TOKEN), "invalid_response");
  }
});

test("ongeldige expires_in wordt geweigerd", async () => {
  for (const expires_in of [undefined, "3600", 0, -1, null, true]) {
    const { refresh } = setup(() => json({ access_token: NEW_ACCESS_TOKEN, expires_in }));
    await assertRefreshError(refresh(REFRESH_TOKEN), "invalid_response");
  }
});

test("ongeldige optionele velden of geen JSON worden geweigerd", async () => {
  const responses: FormPostResponse[] = [
    json({ access_token: NEW_ACCESS_TOKEN, expires_in: 3600, refresh_token: "" }),
    json({ access_token: NEW_ACCESS_TOKEN, expires_in: 3600, refresh_token: 42 }),
    json({ access_token: NEW_ACCESS_TOKEN, expires_in: 3600, token_type: "mac" }),
    json({ access_token: NEW_ACCESS_TOKEN, expires_in: 3600, scope: ["openid"] }),
    json(null),
    json([NEW_ACCESS_TOKEN]),
    { status: 200, body: "not json" },
  ];
  for (const response of responses) {
    const { refresh } = setup(() => response);
    await assertRefreshError(refresh(REFRESH_TOKEN), "invalid_response");
  }
});

test("provider-timeout of netwerkfout geeft unavailable", async () => {
  for (const reason of ["timeout", "network"] as const) {
    const { refresh } = setup(() => {
      throw new FormPostError(reason);
    });
    await assertRefreshError(refresh(REFRESH_TOKEN), "unavailable");
  }
});

test("invalid_grant geeft invalid_grant", async () => {
  const { refresh } = setup(() =>
    json({ error: "invalid_grant", error_description: `refresh token ${REFRESH_TOKEN} is invalid` }, 400),
  );
  await assertRefreshError(refresh(REFRESH_TOKEN), "invalid_grant");
});

test("andere providerfouten maken de sessie niet ongeldig", async () => {
  const responses: FormPostResponse[] = [
    json({ error: "invalid_client" }, 401),
    json({ error: "invalid_request" }, 400),
    json({ error: "invalid_grant" }, 500),
    { status: 400, body: "not json" },
    { status: 503, body: "upstream down" },
  ];
  for (const response of responses) {
    const { refresh } = setup(() => response);
    await assertRefreshError(refresh(REFRESH_TOKEN), "unavailable");
  }
});
