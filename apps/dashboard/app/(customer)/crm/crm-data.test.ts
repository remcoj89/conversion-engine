import assert from "node:assert/strict";
import test from "node:test";
import { fetchContacts, fetchOrganizations, type CrmFetchResult } from "./crm-data";
import type { WorkspaceFetch } from "../../../lib/session/context";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const CONTACT_ID = "22222222-2222-4222-8222-222222222222";

test("organization fetcher maps the current BFF response without fallback data", async () => {
  const result = await fetchOrganizations(async () => new Response(JSON.stringify({
    items: [{
      id: ORGANIZATION_ID,
      name: "Northline",
      general_email: "hello@northline.example",
      general_phone: null,
      website: null,
      industry: "Coaching",
      status: "active",
    }],
  }), { status: 200 }) as Response);

  assert.deepEqual(result, {
    status: "ready",
    data: {
      items: [{
        id: ORGANIZATION_ID,
        name: "Northline",
        status: "active",
        website: null,
        email: "hello@northline.example",
        phone: null,
        industry: "Coaching",
        contact_count: null,
      }],
      next_cursor: null,
    },
  });
});

test("contact fetcher supports a contact without an organization", async () => {
  const result = await fetchContacts(jsonFetcher({
    items: [{
      id: CONTACT_ID,
      organization_id: null,
      full_name: "Lisa Jansen",
      email: "lisa@example.test",
      phone: null,
      function: null,
      status: "active",
    }],
  }));

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.data.items[0]?.name, "Lisa Jansen");
  assert.equal(result.data.items[0]?.organization, null);
});

test("CRM fetchers fail closed for auth errors, malformed data and network failures", async () => {
  const cases: Array<[Response | Error, CrmFetchResult<unknown>["status"]]> = [
    [new Response(null, { status: 401 }), "unauthenticated"],
    [new Response(null, { status: 403 }), "forbidden"],
    [new Response(JSON.stringify({ items: [{ id: "missing-name" }] }), { status: 200 }), "unavailable"],
    [new Error("network failure"), "unavailable"],
  ];

  for (const [outcome, expected] of cases) {
    const fetcher: WorkspaceFetch = async () => {
      if (outcome instanceof Error) throw outcome;
      return outcome;
    };

    const result = await fetchOrganizations(fetcher);
    assert.equal(result.status, expected);
  }
});

function jsonFetcher(body: unknown): WorkspaceFetch {
  return async () => new Response(JSON.stringify(body), { status: 200 });
}
