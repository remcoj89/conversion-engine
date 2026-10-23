# Conversion Engine

Conversion Engine is het interne SaaS-dashboard van Westend Digital voor leadopvolging, websiteproductie, taken, afspraken en resultaten.

Dit document is bewust groeiend. Nieuwe technische keuzes, gerealiseerde stappen en belangrijke beslissingen worden hier bijgehouden.

## Doel

De applicatie brengt de belangrijkste commerciële en operationele informatie van een klantomgeving samen in één dashboard. De applicatie wordt multi-tenant opgezet: iedere klantomgeving heeft eigen gebruikers, leden en gegevens.

## Huidige stack

- Frontend: Next.js, React en TypeScript
- Backend: Fastify op Node.js
- Database: PostgreSQL
- ORM en migrations: Drizzle ORM en Drizzle Kit
- Authenticatie: ZITADEL via OIDC, met server-side sessies in de Next.js BFF
- PWA: Web App Manifest en service worker
- Package manager: npm
- Lokale databases: `conversion_engine` en `conversion_engine_test`

## Architectuur

```text
Browser / PWA
    |
    v
Next.js dashboard
    |
    v
Fastify API
    |                 \
    v                  v
PostgreSQL       ZITADEL
applicatiedata   identity, login en MFA
```

ZITADEL beheert identiteit en authenticatie. De eigen PostgreSQL-database blijft verantwoordelijk voor applicatiedata, tenants, memberships en rollen. De Fastify API controleert de identiteit en autorisatie voordat tenantgegevens worden teruggegeven.

## Gerealiseerd

- Statische dashboard-shell met responsive layout voor desktop, tablet en mobiel.
- PWA-manifest met installatie-iconen en screenshots voor desktop en mobiel.
- Service worker voor een offline beschikbare dashboard-shell.
- Privacyveilige dashboarddataflow: data wordt client-side opgehaald en niet in de gecachte HTML opgeslagen.
- Fastify API met `/health` en `/v1/dashboard/today`.
- Fallback-weergave wanneer de API niet bereikbaar is.
- Laadstatus met `Laden…` tijdens het ophalen van dashboarddata.
- PostgreSQL-verbinding met Drizzle ORM.
- Eerste database-entiteit `tenants`.
- Tabellen `users` en `memberships`.
- Index op `memberships.user_id`.
- Testdatabase en migrations voor zowel development als test.
- Lint, typecheck, tests en builds ingericht voor dashboard en API.
- Dashboard-sessiefundament met configuratievalidatie, opaque sessie-ID's, SHA-256-hashing en AES-256-GCM-encryptie.
- Veilige `__Host-ce_session`- en OIDC-transactie-cookiepolicy vastgelegd en getest.
- Dashboard-tests ingericht met `tsx` en `node:test`.
- High-severity dependencyproblemen opgelost; de productie-audit rapporteert geen kwetsbaarheden.
- ZITADEL-login, logout, server-side sessies en token refresh in de dashboard-BFF.
- JWT-validatie van ZITADEL-access tokens in de Fastify API.
- Zelfstandige demowebsite in `apps/demo-site`; zie [het implementatierecord](docs/demo-site-implementation-record-v1.0.md).

## Security foundation — 22 oktober 2026

De beveiligingsgrens van de Fastify API, bijgewerkt naar de huidige code (23 oktober 2026).

- `GET /health` blijft publiek beschikbaar.
- Alle andere routes staan achter een auth-hook. De API authenticeert requests via de ZITADEL-adapter: het `Bearer`-access token wordt als JWT gevalideerd (RS256, issuer en audience uit de configuratie, sleutels via OIDC-discovery). Zonder geldige configuratie start de API niet.
- Een geauthenticeerde identity wordt via de lokale user en actieve membership in een actieve tenant vertaald naar een immutable `RequestContext` met tenant en rol.
- Bij één actieve membership wordt de tenant automatisch gekozen. Bij meerdere actieve memberships kan de gebruiker de tenant kiezen via `x-tenant-id`; deze waarde wordt server-side gecontroleerd tegen actieve memberships. Tenantwaarden uit body en query worden niet gebruikt.
- De rolcontrole gebruikt een deny-by-default permission map met `dashboard:read` en `leads:create`, beide voor Owner en Team Member.
- `GET /v1/dashboard/today` toont alleen de tenant uit de auth-context.
- `POST /v1/leads` is alleen beschikbaar voor geauthenticeerde gebruikers met een actieve membership en `leads:create`. De lead wordt opgeslagen bij de tenant uit de auth-context; tenant-ID, status, lead-ID, timestamps en onbekende velden in de requestbody worden geweigerd en een nieuwe lead krijgt altijd status `new`.
- De HTTP-laag is onafhankelijk van Drizzle door dependency injection van de membership resolver, tenant-loader en lead-repository.
- Foutresponses bevatten geen tenant-, identity- of databasedetails: `401`, `403` en `400` voor auth, toegang en ongeldige invoer, `413` voor een te grote body en een generieke `500 internal_error` bij interne fouten.
- De API-testset bevat HTTP-tests voor authenticatie (inclusief de ZITADEL-adapter), tenantkeuze, roltoegang, tenantisolatie, leadvalidatie en fail-closed gedrag. De database-testset controleert de echte membership resolver, tenant-loader en lead-repository.

Nog niet aanwezig: MFA/AAL-handhaving en PostgreSQL-RLS. De resolver gaat uit van één geconfigureerde issuer en koppelt op `auth_provider_user_id`/OIDC-subject; issuer-opslag en de samengestelde uniqueness-regel zijn nog niet besloten.

Websites kunnen server-side worden geregistreerd met een opaque publieke key; een resolver koppelt een actieve key aan precies één actieve tenant. Voor leads staan nog open: de publieke formulier-endpoint, anti-spam, rate limiting, outbox, externe verwerking en idempotency/duplicate prevention.

De BFF geeft de relevante API-statussen door: `401` voor authenticatie, `403` voor toegang, `400` voor tenantkeuze en `502`/`503` voor API- of netwerkproblemen. Een `Authorization`-header uit de browser wordt niet doorgestuurd; de BFF gebruikt alleen de server-side sessie (zie [ZITADEL-login, sessies en token refresh](#zitadel-login-sessies-en-token-refresh--22-oktober-2026)).

## Auth-transport foundation — 22 oktober 2026

De eerste bouwstenen voor server-side sessies zijn toegevoegd, zonder routes, database-opslag of OIDC-flow te activeren.

- Een sessie-ID bestaat uit 32 random bytes en wordt alleen als SHA-256-hash opgeslagen zodra de sessiestore wordt gebouwd.
- Gevoelige sessiewaarden kunnen worden versleuteld met AES-256-GCM via `node:crypto`.
- `SESSION_ENCRYPTION_KEY` wordt fail-closed gevalideerd als een base64-gecodeerde sleutel van exact 32 bytes.
- De sessiecookie gebruikt de `__Host-`-prefix, `HttpOnly`, `Secure`, `SameSite=Lax` en `Path=/`.
- De OIDC-transactiecookie heeft dezelfde beveiligingsattributen en een maximale levensduur van tien minuten.
- Encryptie, manipulatie, verkeerde sleutels, cookie-attributen en configuratiefouten zijn getest.

Deze foundation bevatte bewust nog geen sessietabel, sessiestore, login, refresh, logout of ZITADEL-integratie. Die zijn daarna gebouwd; zie hieronder.

## Authenticatiebesluit — 21 oktober 2026

Better Auth is vergeleken met SuperTokens, ZITADEL, Keycloak, Ory Kratos, Auth.js en managed providers. We hebben gekozen voor **ZITADEL** vanwege de combinatie van multi-tenancy, MFA, SSO, OIDC en de mogelijkheid om met een gratis cloudomgeving te starten.

ZITADEL is inmiddels geïmplementeerd voor login, logout, server-side sessies en token refresh. Voor ZITADEL is de EU-cloudregio gekozen. De Conversion Engine, API en PostgreSQL-database worden self-managed gehost op een eigen Hostinger-VPS in de EU. Statische klantwebsites worden onafhankelijk gedeployed via Cloudflare Pages; klant- en CRM-data blijven in de Conversion Engine.

## Werken met het project

Installeer dependencies vanuit de repository-root:

```bash
npm install
```

Start het dashboard:

```bash
npm run dev
```

Start de API:

```bash
npm run api:dev
```

Belangrijke controles:

```bash
npm run lint
npm run typecheck
npm run build
npm run api:test
npm run api:db:test
```

De API gebruikt lokaal standaard poort `4000`. Databasegegevens staan in `apps/api/.env` en mogen nooit worden gecommit. Gebruik `apps/api/.env.example` als template wanneer die beschikbaar is.

## ZITADEL-login, sessies en token refresh — 22 oktober 2026

De sessiegrens in de BFF (voorheen gepland als Slice 2) is gebouwd en uitgebreid met login, logout en token refresh.

- Migratie `bff_sessions`: sessie-ID's staan alleen als SHA-256-hash opgeslagen; access-, refresh- en ID-tokens alleen versleuteld (AES-256-GCM).
- `apps/dashboard/lib/session/store.ts` maakt, leest, vergrendelt, ververst en verwijdert sessies.
- Login (`/auth/login`) start een OIDC-flow met PKCE via de OIDC-transactiecookie; de callback (`/auth/callback`) valideert het ID-token (RS256) en maakt een server-side sessie met een absolute levensduur van 24 uur.
- Logout (`/auth/logout`) verwijdert eerst de sessie en stuurt daarna door naar het end-session-endpoint van ZITADEL. Mislukt het verwijderen, dan volgt geen redirect.
- `/api/dashboard/today` leest alleen de `__Host-ce_session`-cookie, negeert een browser-`Authorization`-header en stuurt het access token server-side als `Bearer` naar de API.
- Token refresh gebeurt kort vóór het verlopen van het access token, op een vergrendelde sessierij. Na een API-`401` volgt precies één refresh en één nieuwe poging.
- Zonder geldige sessie geeft de BFF `401` en wordt de sessiecookie gewist. Tokens komen niet in de browser, response-body of logs.
- De Fastify API valideert access tokens via de ZITADEL-adapter (JWT, RS256).
- Voor lokale development koppelt `npm --workspace api run provision:local -- --confirm-local` de laatst ingelogde sessie aan een lokale tenant.

Elke stap blijft klein, testbaar en gericht op de bestaande architectuur. Er worden geen extra abstractielagen of services toegevoegd zonder concrete noodzaak.

## Werkafspraken

- Kleine stappen met uitleg van het waarom.
- Geen nieuwe dependencies of tools zonder voorafgaande uitleg en akkoord.
- Geen code, documentatie of bestanden buiten de gevraagde scope wijzigen.
- Elke technische stap krijgt passende lint-, typecheck-, test- en build-controles.
- Git-commitbeschrijvingen benoemen duidelijk welke ontwikkelstap is uitgevoerd.
