# Conversion Engine — projectcontext

**Laatst bijgewerkt:** 23 oktober 2026
**Status:** Fase 5, technische implementatie met kleine verticale slices
**Laatste gepushte technische commit:** `ca0d5a8 feat: persist onboarding drafts`

Dit document is een compacte startcontext voor nieuwe Codex- en Claude-sessies. Het vervangt de leidende bron- en architectuurdocumenten niet.

## Leidende bronnen

Gebruik deze volgorde bij conflicten:

1. expliciete gebruikersopdracht;
2. `docs/fase-2-requirements-scope-definitief-v1.0.md` — functionele scope;
3. `docs/fase-3-ux-ui-user-flows-definitief-v1.0.md` — UX en user flows;
4. `docs/fase-3-gecombineerde-onboarding-ontwikkelpakket-v0.1/` — onboarding, Q1–Q4 en Project Brief;
5. `docs/westend-conversion-engine-plannen/02-functioneel-ontwikkelplan-conversion-engine.md` — ontwikkelplan en werkpakketten;
6. `docs/fase-4-technische-architectuur-definitief-v1 (2).0/fase-4-technische-architectuur-definitief-v1.0.md` — technische architectuur en releasegates;
7. `README.md` — actuele technische status;
8. overige fase- en providerdocumenten — alleen wanneer relevant voor de opdracht.

Historische werkversies mogen de v1.0-scope niet stilzwijgend overschrijven.

## Product en architectuur

Conversion Engine is een multi-tenant SaaS-dashboard voor leadopvolging, websiteproductie, onboarding, taken, afspraken en resultaten.

- Frontend: Next.js, React en TypeScript in `apps/dashboard`.
- API: Fastify op Node.js in `apps/api`.
- Database: PostgreSQL met Drizzle ORM en Drizzle Kit.
- Authenticatie: ZITADEL via OIDC, met server-side sessies in de Next.js BFF.
- Centrale klantdata: self-managed op een eigen Hostinger-VPS in de EU.
- Statische klantwebsites: standaard Cloudflare Pages vanuit Git.
- Klant- en CRM-data blijven in de Conversion Engine; een websitehost is geen CRM-bron.

## Wat is gerealiseerd

- Dashboard-shell met responsive layout, PWA-manifest en service-workerfundament.
- ZITADEL-login, logout, server-side sessies en token refresh.
- JWT-validatie in de API.
- Tenant-, membership- en role-based autorisatie met tenantcontext.
- `GET /v1/dashboard/today` met tenantgebonden dashboarddata.
- Lead-datamodel en migratie `0004`.
- Geauthenticeerde `POST /v1/leads` met server-side validatie en tenantisolatie.
- Website-tabel en migratie `0005`.
- Opaque website-public-key en `findActiveWebsiteContext` voor actieve website + actieve tenant.
- Migratie `0005` toegepast op de lokale developmentdatabase; `websites` bevat 0 rijen.
- Onboarding-draftopslag met migratie `0006`: versieerbare antwoorden en server-side gegenereerde Project Brief.
- `GET/PUT /v1/onboarding/current` achter ZITADEL-auth; alleen een Owner met `onboarding:manage` heeft toegang.
- Officieel indienen via `POST /v1/onboarding/current/submit`: volledige server-side validatie, transactionele statusovergang `draft` → `submitted`; daarna weigert de API wijzigingen (`409 not_editable`).
- Next.js BFF-route `/api/onboarding` met server-side sessie, token refresh en 409-conflictafhandeling.
- Dashboard-onboarding hervat server-side drafts na refresh en slaat wijzigingen automatisch op; uploads zijn voorlopig metadata-only.
- Het dashboard dient de onboarding in via de BFF (`POST /api/onboarding`), wacht daarbij een lopende autosave af, en toont een ingediende onboarding na refresh alleen-lezen.
- Zelfstandige demo-site in `apps/demo-site`, visueel gecontroleerd op desktop en mobiel.

De laatste gecontroleerde status na de submit-slice: groene API-typecheck, lint, 96 API-tests en 51 database-tests; 127 dashboardtests; dashboard- en API-builds groen. Er is geen nieuwe migratie nodig (de status `submitted` bestond al in `0006`); 7 migraties zijn geregistreerd. De handmatige ZITADEL-smoketest voor conceptopslag en de handmatige submit-smoketest met een echte sessie zijn geslaagd: indienen werkt en de onboarding wordt daarna alleen-lezen.

## Belangrijk onderscheid: twee intakeflows

### Publieke lead-intake

Een bezoeker dient via een klantwebsite een aanvraag in. Hiervoor staan nog open:

- publieke formulier-endpoint;
- anti-spam en rate limiting;
- submission/outbox-model;
- idempotency en duplicate prevention;
- externe verwerking en opvolging.

### Klant-onboarding-intake

Een klant vult Q1–Q4 in voor de Project Brief en websiteproductie, na overeenkomst en betalingsafhandeling. Er zijn twee commerciële instroomroutes:

- bij koude outreach bouwt Westend eerst handmatig een demo-landingspagina en VSL; deze demo-opbouw valt buiten de Conversion Engine. Bij akkoord kunnen al bekende bedrijfsgegevens, logo, branding en beeldreferenties als corrigeerbare prefill in de onboarding terechtkomen;
- bij warme leads, bijvoorbeeld via referrals of advertenties, start de klant zonder demo met de volledige onboarding. Ook daar kan betrouwbare bestaande brondata worden vooringevuld.

De klikdemo staat in:

`docs/fase-3-gecombineerde-onboarding-ontwikkelpakket-v0.1/fase-3-gecombineerde-onboarding-interactief-v0.1.html`

De bijbehorende schema- en contractspecificaties staan in dezelfde map. De demo gebruikt lokale browserstate en heeft geen echte authenticatie, serveropslag, uploads of workflowstatus. Het dashboard gebruikt dezelfde schema-/contractlaag en heeft nu wel server-side draftopslag en hervatten. De losse demo blijft UX- en datacontractbron, geen productiecomponent.

## Huidige werkpositie

De backendfundering voor identiteit, tenantisolatie, leads en website-resolutie is aanwezig. De dashboard-frontend bevat de volledige onboardingflow: Q1–Q4, 20 onderdelen, schema-gedreven validatie, conditionele velden, optionele assetmetadata en de eindcontrole met Project Brief-preview. De flow is via `/api/onboarding` gekoppeld aan server-side draftopslag.

Antwoorden worden per tenant en project versieerbaar opgeslagen. Bij refresh wordt een bestaand concept hervat; gelijktijdige wijzigingen leiden tot een expliciete 409-conflictkeuze. De vier uploadvelden bewaren voorlopig alleen metadata: echte uploads, scanning en private opslag zijn nog niet gebouwd. Officieel indienen is aanwezig: de status `submitted` wordt server-side afgedwongen en een ingediende onboarding is niet meer automatisch wijzigbaar. De handmatige submit-smoketest met een echte ZITADEL-sessie is geslaagd. Westend-review, audit-events, prefill en productiehandoff blijven volgende slices.

De handmatige bouw en verzending van koude outreach-demo’s blijven buiten de Conversion Engine. De backend- en databasefundering wordt niet opnieuw gebouwd voor de demo-opbouw.

## Vast ontwikkelproces

1. Lees de leidende documenten en controleer de actuele Git-status.
2. Beschrijf één kleine slice met gebruikersscenario, input/output, security/privacy, foutpaden, tests en acceptatiecriteria.
3. Laat Claude Code alleen die slice implementeren.
4. Laat Claude tests, build, diff-check en bij UI-werk screenshots uitvoeren.
5. Voer daarna zelf een onafhankelijke senior-review uit van code, scope, tests, security en documentatie.
6. Los bevindingen op in een aparte kleine opdracht.
7. Commit en push alleen na expliciete toestemming van de gebruiker.
8. Werk de actuele status bij wanneer de slice daadwerkelijk is geaccepteerd.

## Openstaande hoofdpunten

- Productie-MFA/AAL-handhaving.
- PostgreSQL-RLS en tenantveilige samengestelde relaties.
- Onboarding audit-events, reviewworkflow en Project Brief-goedkeuring.
- Veilige uploads, scanning en private opslag.
- Publieke lead-ingest met anti-spam, rate limiting, outbox en idempotency.
- CRM-contacten, pipeline, taken en verdere leadopvolging.
- Backup/WAL/PITR, restore en operationele monitoring.
- Exacte VPS-resources, recoveryprocedure en deploymentisolatie.
- Cloudflare Pages DNS-, formulier- en rollbackinrichting.

## Session-start checklist

Een nieuwe sessie moet vóór codewijzigingen kunnen antwoorden op:

- Welke documenten zijn gelezen?
- Wat is de huidige fase?
- Welke slice is als laatste geaccepteerd?
- Welke slice is nu expliciet opgedragen?
- Welke bestanden mogen wijzigen?
- Wat blijft bewust buiten scope?
- Welke checks en visuele controles zijn vereist?
