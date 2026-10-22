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
- Authenticatie: ZITADEL (gekozen, implementatie volgt)
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

## Security foundation — 22 oktober 2026

De eerste interne beveiligingsgrens van de Fastify API is geïmplementeerd als voorbereiding op ZITADEL-authenticatie.

- `GET /health` blijft publiek beschikbaar.
- `GET /v1/dashboard/today` valt achter een auth-hook en geeft zonder geldige identity geen dashboarddata terug.
- De auth-hook gebruikt een adaptergrens; de huidige serverconfiguratie is bewust fail-closed en authenticeert nog geen requests.
- Een geauthenticeerde identity wordt via de lokale user en actieve membership vertaald naar een immutable `RequestContext` met tenant en rol.
- Tenantkeuze gebeurt uitsluitend via `x-tenant-id` en wordt server-side gecontroleerd tegen actieve memberships. Body- en querywaarden worden niet gebruikt.
- De rolcontrole gebruikt een deny-by-default permission map; momenteel is alleen `dashboard:read` geïmplementeerd.
- De HTTP-laag is onafhankelijk van Drizzle door dependency injection van de membership resolver.
- Onbevoegde requests geven geen tenant- of identity-informatie terug; foutuitkomsten zijn beperkt tot `401`, `400` of `403`.
- De API-testset bevat HTTP-tests voor authenticatie, tenantkeuze, roltoegang en fail-closed gedrag. De database-testset controleert de echte membership resolver.

Deze stap bevat nog geen ZITADEL-SDK, JWT-validatie, loginflow, MFA, PostgreSQL-RLS of wijziging aan de Next.js BFF. De resolver gebruikt daarom tijdelijk één geconfigureerde issuer en koppelt op `auth_provider_user_id`/OIDC-subject. Voor de eerste echte gebruiker moet issuer-opslag en de samengestelde uniqueness-regel nog worden besloten en gemigreerd. De server gebruikt tot die tijd een deny-all adapter; lokaal blijft alleen de healthcheck bruikbaar.

De BFF geeft inmiddels de relevante API-statussen door: `401` voor authenticatie, `403` voor toegang, `400` voor tenantkeuze en `502`/`503` voor API- of netwerkproblemen. De browser-`Authorization`-header wordt op dit moment nog tijdelijk doorgestuurd; de sessiegrens hieronder vervangt dat gedrag.

## Auth-transport foundation — 22 oktober 2026

De eerste bouwstenen voor server-side sessies zijn toegevoegd, zonder routes, database-opslag of OIDC-flow te activeren.

- Een sessie-ID bestaat uit 32 random bytes en wordt alleen als SHA-256-hash opgeslagen zodra de sessiestore wordt gebouwd.
- Gevoelige sessiewaarden kunnen worden versleuteld met AES-256-GCM via `node:crypto`.
- `SESSION_ENCRYPTION_KEY` wordt fail-closed gevalideerd als een base64-gecodeerde sleutel van exact 32 bytes.
- De sessiecookie gebruikt de `__Host-`-prefix, `HttpOnly`, `Secure`, `SameSite=Lax` en `Path=/`.
- De OIDC-transactiecookie heeft dezelfde beveiligingsattributen en een maximale levensduur van tien minuten.
- Encryptie, manipulatie, verkeerde sleutels, cookie-attributen en configuratiefouten zijn getest.

Deze foundation bevat bewust nog geen sessietabel, sessiestore, login, refresh, logout of ZITADEL-integratie.

## Authenticatiebesluit — 21 oktober 2026

Better Auth is vergeleken met SuperTokens, ZITADEL, Keycloak, Ory Kratos, Auth.js en managed providers. We hebben gekozen voor **ZITADEL** vanwege de combinatie van multi-tenancy, MFA, SSO, OIDC en de mogelijkheid om met een gratis cloudomgeving te starten.

De implementatie van ZITADEL is nog niet gestart. Voor development is ZITADEL Cloud Free de aanbevolen start. De gewenste regio en de uiteindelijke keuze tussen cloud en self-hosting worden vóór de implementatie definitief vastgelegd.

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

## Volgende stap: Slice 2 — sessiegrens in de BFF

De interne API-beveiligingsgrens en de eerste sessieprimitives staan nu als testbare basis. De volgende kleine stap is het server-side sessiecontract daadwerkelijk aansluiten op de Next.js BFF.

1. Voeg één migratie toe voor `bff_sessions` in de bestaande migratiebron. De tabel bevat alleen de noodzakelijke sessiemetadata en versleutelde tokenvelden: `id_hash`, identity-subject, access- en refresh-token, expiratievelden, `last_seen_at` en timestamps.
2. Voeg `apps/dashboard/lib/session/store.ts` toe met kleine ruwe PostgreSQL-queries voor aanmaken, ophalen, verwijderen en bijwerken van sessies.
3. Laat `/api/dashboard/today` de `__Host-ce_session`-cookie lezen en het access token server-side als `Authorization: Bearer ...` naar de API sturen.
4. Negeer de `Authorization`-header uit de browser volledig zodra de sessieflow actief is.
5. Voeg database- en route-tests toe voor ontbrekende, onbekende en verlopen sessies. De bestaande API-statusmapping en `no-store`-headers blijven behouden.

Acceptatiecriteria:

- Zonder geldige sessie geeft de BFF `401` en wordt de sessiecookie gewist.
- Een browser-token kan geen sessie overrulen.
- De access- en refresh-tokens worden nooit naar de browser, response-body of logs geschreven.
- Sessies kunnen in deze slice alleen via tests worden aangemaakt; login en OIDC blijven uitgesteld.
- De bestaande dashboard-, API- en database-tests blijven groen.

Nog bewust niet in Slice 2: login/callback, token refresh, logout, CSRF, tenant-URL's, ZITADEL JWT-validatie en MFA/AAL-handhaving. Die volgen in afzonderlijke slices.

Elke stap blijft klein, testbaar en gericht op de bestaande architectuur. Er worden geen extra abstractielagen of services toegevoegd zonder concrete noodzaak.

## Werkafspraken

- Kleine stappen met uitleg van het waarom.
- Geen nieuwe dependencies of tools zonder voorafgaande uitleg en akkoord.
- Geen code, documentatie of bestanden buiten de gevraagde scope wijzigen.
- Elke technische stap krijgt passende lint-, typecheck-, test- en build-controles.
- Git-commitbeschrijvingen benoemen duidelijk welke ontwikkelstap is uitgevoerd.
