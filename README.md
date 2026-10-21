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

De volgende ontwikkelstap is een kleine ZITADEL-proof-of-concept:

1. Een development-project aanmaken in ZITADEL.
2. OIDC-configuratie vastleggen zonder applicatiecode te wijzigen.
3. Vaststellen hoe de ZITADEL-gebruiker wordt gekoppeld aan onze bestaande `users`- en `memberships`-tabellen.
4. Daarna pas de eerste login-flow implementeren.

Elke stap blijft klein, testbaar en gericht op de bestaande architectuur. Er worden geen extra abstractielagen of services toegevoegd zonder concrete noodzaak.

## Werkafspraken

- Kleine stappen met uitleg van het waarom.
- Geen nieuwe dependencies of tools zonder voorafgaande uitleg en akkoord.
- Geen code, documentatie of bestanden buiten de gevraagde scope wijzigen.
- Elke technische stap krijgt passende lint-, typecheck-, test- en build-controles.
- Git-commitbeschrijvingen benoemen duidelijk welke ontwikkelstap is uitgevoerd.
