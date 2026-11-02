import assert from "node:assert/strict";
import { test } from "node:test";
import {
  archiveContact,
  saveContact,
  saveOrganization,
  validateContactForm,
  validateOrganizationForm,
  type ContactFormValues,
  type OrganizationFormValues,
} from "./crm-mutations";

const organizationResponse = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Westend Digital",
  kvk_number: null,
  website: null,
  general_email: null,
  general_phone: null,
  address: null,
  industry: null,
  notes: null,
  status: "active",
  created_at: "2026-10-31T09:00:00.000Z",
  updated_at: "2026-10-31T09:00:00.000Z",
};

const contactResponse = {
  id: "22222222-2222-4222-8222-222222222222",
  organization_id: null,
  full_name: "Voorbeeld Contact",
  first_name: null,
  last_name: null,
  email: "contact@example.test",
  phone: null,
  function: null,
  notes: null,
  communication_preference: null,
  status: "active",
  created_at: "2026-10-31T09:00:00.000Z",
  updated_at: "2026-10-31T09:00:00.000Z",
};

function organizationForm(overrides: Partial<OrganizationFormValues> = {}): OrganizationFormValues {
  return {
    name: " Westend Digital ",
    kvk_number: "",
    website: " https://example.test ",
    general_email: " info@example.test ",
    general_phone: "",
    address: "",
    industry: " Webdesign ",
    notes: "",
    contact_mode: "none",
    contact_id: "",
    contact_full_name: "",
    contact_email: "",
    contact_phone: "",
    ...overrides,
  };
}

function contactForm(overrides: Partial<ContactFormValues> = {}): ContactFormValues {
  return {
    organization_id: "",
    full_name: " Voorbeeld Contact ",
    first_name: "",
    last_name: "",
    email: " contact@example.test ",
    phone: "",
    function: "",
    notes: "",
    communication_preference: "",
    organization_mode: "none",
    new_organization_name: "",
    ...overrides,
  };
}

test("CRM-formulieren trimmen waarden en maken lege optionele velden null", () => {
  assert.deepEqual(validateOrganizationForm(organizationForm()).values, {
    name: "Westend Digital",
    kvk_number: null,
    website: "https://example.test",
    general_email: "info@example.test",
    general_phone: null,
    address: null,
    industry: "Webdesign",
    notes: null,
    contact_mode: "none",
    contact_id: null,
    contact_full_name: null,
    contact_email: null,
    contact_phone: null,
  });
  assert.deepEqual(validateContactForm(contactForm()).values, {
    organization_id: null,
    full_name: "Voorbeeld Contact",
    first_name: null,
    last_name: null,
    email: "contact@example.test",
    phone: null,
    function: null,
    notes: null,
    communication_preference: null,
    organization_mode: "none",
    new_organization_name: null,
  });
});

test("CRM-validatie blokkeert ontbrekende verplichte velden vóór de BFF-call", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return new Response(JSON.stringify(organizationResponse), { status: 201 });
  };

  assert.equal(Object.keys(validateOrganizationForm(organizationForm({ name: " " })).errors).length, 1);
  assert.equal(Object.keys(validateContactForm(contactForm({ email: "geen-email" })).errors).length, 1);
  assert.deepEqual(await saveOrganization(fetcher, null, organizationForm({ name: " " })), { status: "invalid" });
  assert.equal(calls, 0);
});

test("CRM-mutaties gebruiken de bestaande BFF-paden en ondersteunen een contact zonder organisatie", async () => {
  const calls: Array<{ url: string; method: string; body: string }> = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? "GET", body: String(init?.body ?? "") });
    const isArchive = String(input).endsWith("/archive");
    const payload = isArchive ? contactResponse : String(input).includes("contacts") ? contactResponse : organizationResponse;
    return new Response(JSON.stringify(payload), { status: isArchive ? 200 : String(input).endsWith("organizations") ? 201 : 200 });
  };

  const created = await saveContact(fetcher, null, contactForm());
  const archived = await archiveContact(fetcher, contactResponse.id);

  assert.equal(created.status, "success");
  assert.equal(archived.status, "success");
  assert.equal(calls[0]?.url, "/api/contacts");
  assert.equal(calls[0]?.method, "POST");
  assert.deepEqual(JSON.parse(calls[0]?.body ?? "{}"), {
    organization_id: null,
    full_name: "Voorbeeld Contact",
    first_name: null,
    last_name: null,
    email: "contact@example.test",
    phone: null,
    function: null,
    notes: null,
    communication_preference: null,
  });
  assert.equal(calls[1]?.url, `/api/contacts/${contactResponse.id}/archive`);
  assert.equal(calls[1]?.method, "POST");
  assert.equal(calls[1]?.body, "");
});

test("CRM-mutaties kunnen een contact met een nieuwe organisatie aanmaken", async () => {
  let requestBody: unknown;
  const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify(contactResponse), { status: 201 });
  };

  const result = await saveContact(fetcher, null, contactForm({
    organization_mode: "new",
    new_organization_name: "Nieuwe Organisatie",
  }));

  assert.equal(result.status, "success");
  assert.deepEqual(requestBody, {
    full_name: "Voorbeeld Contact",
    first_name: null,
    last_name: null,
    email: "contact@example.test",
    phone: null,
    function: null,
    notes: null,
    communication_preference: null,
    organization: { name: "Nieuwe Organisatie" },
  });
});

test("CRM-mutaties kunnen een organisatie met een nieuw contact aanmaken", async () => {
  let requestBody: unknown;
  const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify(organizationResponse), { status: 201 });
  };

  const result = await saveOrganization(fetcher, null, organizationForm({
    contact_mode: "new",
    contact_full_name: "Nieuwe Contactpersoon",
    contact_email: "nieuw@example.test",
    contact_phone: "0612345678",
  }));

  assert.equal(result.status, "success");
  assert.deepEqual(requestBody, {
    name: "Westend Digital",
    kvk_number: null,
    website: "https://example.test",
    general_email: "info@example.test",
    general_phone: null,
    address: null,
    industry: "Webdesign",
    notes: null,
    contact: {
      full_name: "Nieuwe Contactpersoon",
      email: "nieuw@example.test",
      phone: "0612345678",
    },
  });
});
