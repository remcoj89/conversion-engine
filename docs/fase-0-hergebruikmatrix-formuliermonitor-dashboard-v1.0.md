# Fase 0 — Hergebruikmatrix bestaande monitoringprojecten

Status: concept — vastgesteld na read-only audit op 21 oktober 2026  
Bronnen: `westend-digital-monitoring-dashboard` en `formulier-monitor`  
Doel: vastleggen welke bestaande onderdelen bruikbaar zijn voor de Conversion Engine en welke onderdelen opnieuw ontworpen moeten worden.

## 1. Besluit in één zin

De Conversion Engine wordt clean-slate opgebouwd, met selectief hergebruik van de bewezen Playwright-formuliermonitoring uit `formulier-monitor` en van geselecteerde domein-, tenant-, status- en UI-patronen uit het monitoringdashboard.

We nemen geen van beide projecten integraal over.

## 2. Beoordeelde bronnen

### 2.1 Westend Digital Monitoring Dashboard

Locatie:

`/home/remco/code/remcoj89/westend-group/Compagnies/westend-digital/web/stactic/westend-digital-monitoring-dashboard`

Kenmerken:

- Astro frontend.
- Express/Node backend.
- PostgreSQL via `pg`.
- Zod-validatie, Helmet, CORS en rate limiting.
- Authentik-integratie en bestaande ownership-patronen.
- Website-, client-, CRM-, formulier-, AI- en SEO-functionaliteit in één applicatie.
- Uptime-, SSL- en incidenttabellen en statuspagina’s.
- Een grote bestaande migration- en testhistorie.

Belangrijke bronbestanden:

- `database/migrations/004_create_websites.sql`
- `database/migrations/005_create_uptime_logs.sql`
- `database/migrations/006_create_ssl_checks.sql`
- `database/migrations/007_create_incidents.sql`
- `database/migrations/055_create_forms.sql`
- `backend/src/models/dashboardModel.js`
- `backend/src/models/websiteModel.js`
- `backend/src/models/publicModel.js`
- `backend/src/middleware/ownership.js`
- `backend/src/middleware/validate.js`
- `src/pages/index.astro`
- `src/pages/website/[id].astro`
- `src/pages/status/[slug].astro`

### 2.2 Formulier Monitor

Locatie:

`/home/remco/code/remcoj89/personal-projects/web/formulier-monitor`

Kenmerken:

- Node.js CommonJS.
- Playwright.
- JSON-configuratie per website en formulier.
- Netlify- en Elementor-adapter.
- Webflow-interface aanwezig, maar nog niet geïmplementeerd.
- File-based opslag van resultaten en screenshots.
- Frontendchecks zonder echte verzending.
- Expliciete ketentests met Netlify-opslagverificatie.
- 10/10 bestaande tests geslaagd tijdens deze audit.

Belangrijke bronbestanden:

- `src/config.cjs`
- `src/engine/formTestEngine.cjs`
- `src/frontend-test/index.cjs`
- `src/adapters/index.cjs`
- `src/adapters/netlify.cjs`
- `src/adapters/elementor.cjs`
- `src/adapters/netlifyApi.cjs`
- `src/verifiers/netlifySubmissionVerifier.cjs`
- `src/engine/netlifyChainHooks.cjs`
- `src/storage/fileConfigStore.cjs`
- `src/storage/fileResultStore.cjs`
- `websites/*/website.json`
- `websites/*/formulieren/*.json`

## 3. Hergebruikmatrix

| Onderdeel | Bron | Besluit | Doel in Conversion Engine |
|---|---|---|---|
| Playwright browseruitvoering | `formulier-monitor/src/frontend-test/index.cjs` | Sterk hergebruiken, migreren | Afzonderlijke monitoring-worker |
| Run lifecycle en concurrency | `formulier-monitor/src/engine/formTestEngine.cjs` | Hergebruiken als domeinreferentie | Worker/job-contracten |
| Website- en formulierconfiguratie | `formulier-monitor/src/config.cjs` | Hergebruiken, vervangen door DB-backed configuratie | Monitorconfiguratie en validatie |
| Adapterinterface | `formulier-monitor/src/adapters/index.cjs` | Hergebruiken | Adaptercontract voor Netlify, Elementor en later Webflow |
| Netlify request matching | `formulier-monitor/src/adapters/netlify.cjs` | Hergebruiken en testen in TypeScript | Provideradapter |
| Elementor multipart/FormData parsing | `formulier-monitor/src/adapters/elementor.cjs` | Hergebruiken en verder testen | Provideradapter |
| Netlify storage verification | `formulier-monitor/src/verifiers/netlifySubmissionVerifier.cjs` | Hergebruiken als provider-specifieke verifier | Ketenbewijs |
| Correlation marker en evidence-model | `formulier-monitor/src/frontend-test/index.cjs` | Hergebruiken | Audit trail en runresultaat |
| SSRF/private-target-validatie | `formulier-monitor/src/config.cjs` | Hergebruiken, uitbreiden met worker-netwerkbeleid | Veiligheid van browserruns |
| File result store | `formulier-monitor/src/storage/fileResultStore.cjs` | Niet rechtstreeks overnemen | Vervangen door PostgreSQL + private artifact storage |
| CLI-runner | `formulier-monitor/src/runner.cjs` | Niet als productinterface overnemen | Vervangen door API- en jobaansturing |
| Website/client-relatie | Dashboard migrations 004 en bestaande models | Hergebruiken als domeinreferentie | Tenant → website → formulier |
| Uptime logs | Dashboard migration 005 | Hergebruiken als basis, uitbreiden | Website health en uptime |
| SSL checks | Dashboard migration 006 | Hergebruiken als basis | TLS/certificaatstatus |
| Incidents | Dashboard migration 007 | Hergebruiken als basis, koppelen aan monitorruns | Incidenten en notificaties |
| Formulier tenantkoppeling | Dashboard migration 055 | Hergebruiken als referentie, niet ongewijzigd | Formulierconfiguratie met tenantisolatie |
| Dashboardqueries | `dashboardModel.js`, `websiteModel.js`, `publicModel.js` | Patronen hergebruiken, queries herschrijven | Read models en KPI’s |
| Auth/ownership/validatie | Dashboard middleware | Patronen hergebruiken na audit | Server-side autorisatie en inputvalidatie |
| Statuspagina | `src/pages/status/[slug].astro` | UI- en informatierelatie hergebruiken | Klantgerichte health/statusweergave |
| Website-detailpagina | `src/pages/website/[id].astro` | UI-referentie, niet integraal kopiëren | Interne monitoringdetailweergave |
| Express backend | Dashboard | Niet rechtstreeks overnemen | Nieuwe Fastify/TypeScript API |
| `setInterval`-cron | Dashboard `cronService.js` | Niet overnemen als kernmechanisme | Outbox + queue/worker, bij voorkeur pg-boss |
| Volledige dashboardapplicatie | Dashboard | Niet overnemen | Te breed en te sterk verweven |

## 4. Wat we concreet kunnen gebruiken

### 4.1 Directe technische basis

De directe basis voor formuliermonitoring komt uit `formulier-monitor`:

1. Configuratiecontract voor website, formulier, selectors, velden en verwacht request.
2. Browserflow voor laden, cookiebanner, formulierselectie, invullen en submit.
3. Blokkeren van verkeerde formulierrequests en onverwachte navigatie.
4. Frontend-only modus zonder echte lead of e-mail.
5. Expliciete live/ketenmodus.
6. Netlify API-verificatie op unieke marker.
7. Gestructureerde foutcategorieën en bewijsstappen.
8. Testfixtures voor dispatch, verkeerde endpoints en ambigue selectors.

Deze onderdelen vormen de inhoudelijke basis van een nieuw package, bijvoorbeeld:

```text
packages/monitoring-core/
  domain/
  adapters/
  playwright/
  safety/
  contracts/
  persistence/
```

### 4.2 Domein- en productreferentie

Uit het monitoringdashboard kunnen we vooral gebruiken:

1. De relatie tussen tenant/client, website en monitoringdata.
2. Uptime-, SSL- en incidentbegrippen.
3. Statusweergave voor interne gebruikers en klanten.
4. Querypatronen voor actuele status, uptimepercentages en incidentduur.
5. Bestaande autorisatie- en validatiegedachten.
6. De bestaande formuliertenantkoppeling als uitgangspunt voor verdere modellering.

## 5. Wat opnieuw moet worden ontworpen

De volgende onderdelen horen niet één-op-één in de Conversion Engine:

- De huidige Express/JavaScript-backend.
- De huidige brede dashboardmonoliet.
- De file-based monitoropslag.
- De eenvoudige CLI als primaire aansturing.
- De huidige `setInterval`-schedulers.
- De bestaande `form_submissions`-tabel als opslag voor synthetische tests.
- De huidige frontendpagina’s als volledige componentenbibliotheek.

De nieuwe monitoringdata moet gescheiden blijven van echte leads. Minimaal zijn aparte concepten nodig voor:

- monitorconfiguratie;
- monitorrun;
- runstappen en foutcategorieën;
- correlatiegegevens;
- screenshots en andere artifacts;
- incidenten en notificaties;
- provider-/adapterconfiguratie.

Een monitoringrun mag nooit doorstromen naar CRM, AI-classificatie, commerciële e-mail of leadstatistieken.

## 6. Belangrijkste migratierisico’s

### Hoog

- Tenantisolatie bij nieuwe monitorconfiguratie en runresultaten.
- Browserruns als afzonderlijk proces met resource- en netwerkbeperkingen.
- Scheiding tussen synthetische tests en echte formulierinzendingen.
- Geen secrets, cookies, volledige request bodies of persoonsgegevens in artifacts/logs.
- Betrouwbare retries, idempotency en dubbele-runpreventie.

### Middel

- Migratie van CommonJS naar TypeScript/ESM.
- Migratie van JSON/file storage naar PostgreSQL en private artifact storage.
- Adaptercontract behouden zonder providerlogica aan de webapp te koppelen.
- Bestaande statuspagina uitbreiden met formuliergezondheid en bewijsniveaus.

### Bekend incompleet

- Webflow-adapter is alleen een placeholder.
- Mailverificatie is niet geïmplementeerd.
- De `the-human-edge` JSON-configuraties zijn leeg.
- Het dashboard bevat onopgeslagen wijzigingen in async-job- en researchbestanden; deze mogen niet zonder afzonderlijke diff-audit worden meegenomen.
- De volledige dashboardtests konden in deze omgeving niet betrouwbaar draaien doordat PostgreSQL-authenticatie faalde met een ontbrekend/ongeldig wachtwoord; dit is geen bewijs dat alle assertions inhoudelijk falen.

## 7. Definitief fase-0-besluit

1. Gebruik `formulier-monitor` als salvage-bron voor de Playwright-engine, adaptercontracten, veiligheidscontroles en teststrategie.
2. Gebruik het monitoringdashboard als salvage-bron voor domeinrelaties, status-/incidentconcepten, tenantpatronen en UI-referenties.
3. Bouw API, persistence, queueing, workerisolatie en frontendintegratie opnieuw volgens de Conversion Engine-architectuur.
4. Voeg geen bestaande code toe voordat stack, modulegrenzen en datamodel definitief zijn vastgesteld.
5. Gebruik dit document als input voor het volgende document: de exacte stack- en implementatiebeslissingen.

## 8. Brondocumenten Conversion Engine

- `fase-2-requirements-scope-definitief-v1.0.md`
- `fase-4-technische-architectuur-definitief-v1.0/fase-4-technische-architectuur-definitief-v1.0.md`
- `westend-conversion-engine-plannen/02-functioneel-ontwikkelplan-conversion-engine.md`

