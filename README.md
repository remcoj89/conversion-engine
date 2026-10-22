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

## Volgende stap

De interne beveiligingsgrens staat nu als testbare basis. De volgende ontwikkelstap is eerst het afronden van de integratiegrenzen vóór de ZITADEL-proof-of-concept:

1. De Fastify error handler begrenzen zodat interne foutdetails niet naar clients lekken.
2. De Next.js BFF laten onderscheiden tussen `401`, `403`, `400` en API-/netwerkfouten, en later het auth-token doorgeven.
3. Vastleggen hoe de gekozen tenant in het dashboard wordt beheerd.
4. Daarna een kleine ZITADEL-proof-of-concept uitvoeren:
   - een development-project aanmaken in ZITADEL;
   - OIDC-configuratie vastleggen zonder applicatiecode te wijzigen;
   - issuer, audience en MFA/AAL-beleid vaststellen;
   - vaststellen hoe de ZITADEL-gebruiker wordt gekoppeld aan onze bestaande `users`- en `memberships`-tabellen.

De eerste login-flow implementeren we pas nadat deze keuzes zijn vastgelegd.

Elke stap blijft klein, testbaar en gericht op de bestaande architectuur. Er worden geen extra abstractielagen of services toegevoegd zonder concrete noodzaak.

## Werkafspraken

- Kleine stappen met uitleg van het waarom.
- Geen nieuwe dependencies of tools zonder voorafgaande uitleg en akkoord.
- Geen code, documentatie of bestanden buiten de gevraagde scope wijzigen.
- Elke technische stap krijgt passende lint-, typecheck-, test- en build-controles.
- Git-commitbeschrijvingen benoemen duidelijk welke ontwikkelstap is uitgevoerd.
