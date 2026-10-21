# Westend Digital Conversion Engine
## Fase 4 — A-09 Technologiestack & Providerselectie

**Versie:** v0.1 — voorstel ter goedkeuring  
**Datum:** 18 oktober 2026  
**Status:** A-01 t/m A-08 goedgekeurd; A-09 nog niet goedgekeurd  
**Scope:** de concrete technologiestack, providerkandidaten, randvoorwaarden en proof-of-concept-gates.

### 1. Besluit in één oogopslag

**Advies: één modulaire TypeScript-codebase**, met Astro voor onafhankelijke klantwebsites, React voor het SaaS-dashboard, Fastify als API, PostgreSQL met Drizzle en pg-boss als eerste queue-kandidaat. Beheerde PostgreSQL/Auth/Private Storage via Supabase is de **voorkeurskandidaat**, maar vereist eerst een security-, herstel- en kostentoets. Sanity blijft uitsluitend websitecontent beheren; het project-/datasetmodel per klant is nog niet gekozen.

Niet doen in de MVP: Kubernetes, microservices per domein, Redis uitsluitend voor jobs, willekeurige AI-gegenereerde productiecode zonder sandbox of een zelfstandig gebouwd wachtwoordsysteem. n8n kan voor interne niet-kritieke workflows beschikbaar blijven, maar is niet de bron van waarheid voor leadstatus of betalingen.

### 2. Technische keuzematrix

| Domein | Voorkeur | Status / argument |
|---|---|---|
| Statische klantwebsites | Astro + TypeScript | Voorkeurskeuze; onafhankelijke builds en CDN-deploys |
| SaaS-app | React + TypeScript + Vite | Voorkeurskeuze; rijke CRM-interfaces en state |
| UI-system | Tailwind CSS + eigen design tokens + toegankelijke componenten | Baseren op goedgekeurd Fase 3 design; shadcn/ui als mogelijke implementatiebasis |
| API | Node.js + TypeScript + Fastify | Schema-gebaseerde request/responsevalidatie; bestaande Express-modules selectief hergebruiken |
| API-contracten | Zod + OpenAPI (versiebeheer) | Eén contract voor client, API en workers; op compatibiliteit testen |
| Relationele opslag | PostgreSQL | A-02/A-04; RLS en samengestelde tenantgebonden sleutels |
| Database-toegang | Drizzle ORM + gecontroleerde SQL-migrations | RLS-support; raw SQL waar beleidsregels dat vereisen |
| Auth & MFA | Supabase Auth (TOTP/aal2) | Kandidaat; MFA verplicht voor alle rollen en op API/DB-niveau afdwingen |
| Jobqueue | pg-boss | Kandidaat; Postgres-queue, retries, scheduling en tenantcapaciteit, zonder Redis |
| Bestanden | Private objectopslag, bij voorkeur Supabase Storage | Signed URLs, RLS, malwarecontrole en bewaarbeleid |
| Website-CMS | Sanity Studio, gedeelde schema-codebase | Per-klant-projecten versus gedeeld project nog beslissen |
| E-mail/router | Resend + eigen veilige inbound router | A-07: geen toegang tot volledige klantmailboxen |
| Analytics | GA4, GSC, Clarity, DataForSEO adapters | Server-side, read-only waar mogelijk; rate limits en budgetmeters |
| AI | Provideradapter (OpenAI/Anthropic), Zod-gecontroleerde output | Modelkeuze per taak later; geen directe tool-, mail-, CMS- of betaalrechten |
| Browsercontroles | Playwright (gescheiden worker) | Hergebruik formuliermonitor; testisolatie is verplicht |
| Delivery | GitHub Actions + Docker Compose + CDN | CI security-gates; per-site deployment en rollback |
| Observability | Structured JSON logs + errortracking + externe uptimecheck | Kosten- en regioselectie nog toetsen; geen PII standaard loggen |

### 3. Voorgestelde code- en deploymentstructuur

```text
westend-conversion-engine/
  apps/dashboard/            # React CRM en Westend admin
  apps/api/                  # Fastify API + autorisatie
  apps/workers/              # Lead, analytics en planning (afzonderlijke processen)
  apps/sanity-studio/        # Gedeelde Studio-configuratie
  packages/database/         # Drizzle schema, RLS policies, migrations
  packages/contracts/        # Zod / OpenAPI / eventschema's
  packages/domain/           # CRM-, betalings- en workflowregels
  packages/ui/               # Westend SaaS-designsystem
  packages/integrations/     # Sanity, Resend, Google, Clarity, DataForSEO
  packages/security/         # tenantcontext, auth, audit, injection controls
website-starter/             # Astro + Westend Component Library
customer-sites/              # Eigen onafhankelijke repo/deploy per site (pilot)
```

Werk met pnpm-workspaces; voeg een extra monorepo-orchestrator alleen toe bij meetbare noodzaak. Klantwebsites gebruiken versioned componenten en expliciet goedgekeurde projectconfiguratie; een update aan de starter publiceert niet stilzwijgend alle sites. Websitebuilds draaien geïsoleerd en krijgen geen productiecredentials.

### 4. Database- en authenticatiebeveiliging

- **MFA verplicht voor alle rollen**: Westend Admin, Business Owner én Team Member. Supabase Auth ondersteunt TOTP en `aal2`; de backend weigert zakelijke en financiële endpoints totdat `aal2` is geverifieerd. Herstelflow en account recovery worden vóór livegang getest.
- **API is de enige applicatiepoort** naar klant- en financiële gegevens. Een browser mag via Auth aanmelden, maar leest/schrijft geen CRM-tabellen rechtstreeks via een breed bevoegde Supabase client.
- **PostgreSQL RLS** is de tweede verdedigingslaag naast server-side autorisatie. Iedere transactie krijgt een gecontroleerde user-/tenantcontext. Gebruik een niet-eigenaar, niet-`BYPASSRLS` runtime-rol; test connection-pooling, policy-grenzen en default deny. Geen `tenant_id` uit een browserrequest vertrouwen.
- **Netwerk**: beperk PostgreSQL/pooler op bekende egress-IP's of private verbindingen waar beschikbaar. Supabase netwerkrestricties gelden voor directe databaseverbindingen, niet automatisch voor Auth/Storage/HTTPS-API's; die moeten afzonderlijk zijn afgeschermd.
- **Workers** gebruiken een apart serviceaccount met minimale rollen. Zij krijgen uitsluitend interne record-ID's en geautoriseerde tenantcontext; service-privileges mogen nooit via API-requestheaders worden doorgegeven.
- **Bestanden**: private buckets, per-tenant storage policies, kortlevende links, malware- en inhoudstypecontrole. Sanity-assets zijn geen vertrouwelijke documentenopslag.
- **Environments**: minimaal gescheiden staging en productie, met afzonderlijke databases/authconfig/credentials. Geen ongeschoonde productiedata naar test of AI.

### 5. Betrouwbare taken zonder extra Redis

pg-boss ondersteunt PostgreSQL-queues, retries, deadlines, scheduling en database-transacties. Begin met aparte logische queues en resources voor `lead`, `email`, `report`, `monitor` en `website_build`. Gebruik een transactionele outbox in de bedrijfsdatabase en een dispatcher met unieke event-ID's; downstream acties hebben eigen idempotentiechecks.

**Geen absoluut 'exactly-once' voor externe e-mailcalls**: een worker kan na een geslaagde provider-call crashen. Bewaar daarom een verzendledger en verifieer onzekere providerstatus, in plaats van blind opnieuw te verzenden. Per-tenant concurrency- en kostenlimieten voorkomen dat één klant de queue monopoliseert. Bij toenemende load mogen workers afzonderlijk schalen zonder dat de app uiteenvalt in microservices. Langlopende builds vereisen geen lang openstaande database-transactie.

### 6. Hosting- en providerselectie

| Onderdeel | Eerste kandidaat | Alternatief / beslissing |
|---|---|---|
| API en lichte workers | Geharde Hostinger VPS + Docker Compose | Managed apphost als incidentbeheer of HA zwaarder weegt |
| Database/Auth/Storage | Supabase EU-regio (productie + afzonderlijke staging) | Managed PostgreSQL + aparte beheerde auth/storage bij ongunstige PITR-TCO |
| Klantwebsites | Cloudflare Pages (Astro static) | Netlify; vergelijk builds, sites/domeinen, bandbreedte en migratie |
| CMS | Sanity | Eén codebase; project-per-klant heeft voorkeur bij toekomstige klanttoegang, mits licentie/TCO haalbaar |
| E-mail | Resend | Alternatief alleen bij compliance, regio, deliverability of prijsproblemen |
| Playwright/builds | Tijdelijke geïsoleerde runner buiten kritieke API-host | Afzonderlijke worker-VPS of managed container jobs |
| Logs en uptime | Externe uptimecheck plus errortracking | Definitieve dienst kiezen op EU-regio, kosten en logretentie |

**Supabase-restorerisico:** dagelijkse backups alleen zijn niet voldoende voor voorlopig RPO van maximaal 1 uur. De officiële Supabase-prijsinformatie noemt zeven dagen PITR rond $100/maand extra; in het getoonde voorbeeld is een Pro-project met Small compute en PITR ongeveer $130/maand na compute credit. De totale prijs stijgt door staging, extra workloads en overige providers. Dit is een gedateerd voorbeeld, geen offerte.

**Sanity-risico:** de huidige basisdataset en betaalde extra datasets maken 'een dataset per klant in één project' niet vanzelf schaalbaar. Project-per-klant biedt een sterkere organisatorische grens, maar moet voor 5, 25 en 100 websites op accounts, rollen, API-limieten en werkelijk factureerbare resources worden doorgerekend. Wij kiezen dit niet blind.

### 7. Proof-of-concept: vijf gates vóór definitieve providers

| Gate | Test en meetpunt | Afkeurcriterium |
|---|---|---|
| P1 Auth & RLS | Business Owner en Team Member loggen in met MFA; 20+ cross-tenant read/write-aanvallen, ook via workers | Eén geslaagde cross-tenant toegang of endpoint dat `aal1` aanvaardt |
| P2 Recovery & budget | Volledige restore-oefening database + bestanden, apart van productie; meet feitelijke RPO/RTO en TCO | RPO > 1 uur, RTO > 4 uur of kosten niet verklaarbaar; vereisen expliciet herontwerp |
| P3 Queue & e-mail | Webhook/retry/crash-simulaties, rate caps en gesimuleerde onzekere verzendstatus | Lead verloren, dubbele automatische inhoudelijke mail, of 48u reminder zonder betrouwbare antwoordstatus |
| P4 CMS & deployment | Twee demo-klanten met afzonderlijke content, eigen websites, testrechten en rollback | Inzage bij andere tenant, lek van schrijftoken, globale niet-geautoriseerde publicatie |
| P5 Isolatie & prompt injection | Verwerk onbetrouwbaar formulier/document, draai Playwright en site-build met beperkte rechten | Modelinstrucies leiden tot ongeautoriseerde gegevensverzending, productieactie of container breakout |

Vóór commercialisatie daarnaast AVG-verwerkerscontracten, subverwerkers, dataregio's, logging-/bewaarbeleid, rate limits, integratievoorwaarden en incidentrunbooks expliciet verifiëren.

### 8. Hergebruik bestaande Westend-producten

- Formuliermonitor: neem bestaande Playwright-frontendchecks en adapterconfig over na code- en security-review. Houd echte end-to-end synthetische aanvragen gescheiden van de AI-flow.
- AI-contactformulierautomatisering: hergebruik de intentlabels, één-AI-antwoordregel, state machine, anti-injectietests en gestructureerde output. Maak de centrale backend opnieuw autoritatief voor allowed actions; n8n mag niet zelfstandig business rules overrulen.
- Westend Component Library: versieer Astro-secties als componentbibliotheek, met geïsoleerde release per klantwebsite.
- Sanity-ervaring en React/Astro-kennis blijven bruikbaar; geen onnodige volledige rewrite enkel om frameworks gelijk te trekken.

### 9. A-09 acceptatiecriteria

- **A09-01:** Eén TypeScript-ecosysteem voor dashboard/API/workers en Astro-sites; contracten gedeeld en versiebeheerbaar.
- **A09-02:** MFA-`aal2` daadwerkelijk verplicht op API en database; tenant-RLS sluit cross-tenant reads/writes uit.
- **A09-03:** Geen secrets in websites, browserbundels, AI-context, logs of onbetrouwbare buildcontainers.
- **A09-04:** Eén centrale ledger voor berichten, events en menselijke escalaties; externe retries zijn idempotent ontworpen.
- **A09-05:** Frontendchecks, websitebuilds en analytics blokkeren geen nieuwe leadregistraties.
- **A09-06:** Private Storage en Sanity publiek contentbeleid zijn technisch en contractueel gescheiden.
- **A09-07:** Kostenmatrix voor 5, 25 en 100 klanten bevat VPS, managed DB/PITR, staging, CMS, sitehosting, AI, e-mail, logs en personeelstijd.
- **A09-08:** Backups en restore behalen aantoonbaar de nog te contracteren doelen; geen provider lock-in zonder export- en herstelpad.
- **A09-09:** Sanity-projectmodel blijft expliciet *open* totdat rol-/kosten-/migratietests zijn uitgevoerd.
- **A09-10:** Alle gekozen dependencies krijgen een security-, licentie- en onderhoudsreview; geen 'latest' zonder versiepinning.

### 10. Te nemen besluit

**A-09 voorstel:** goedkeuring van de *kernstack*: Astro + React + Node/Fastify + TypeScript + PostgreSQL/Drizzle + pg-boss + Sanity + Resend + Playwright + GitHub Actions/Docker. **Supabase, Cloudflare Pages en eigen VPS** worden als eerste providerkandidaten geselecteerd, niet onvoorwaardelijk als productieproviders goedgekeurd. Definitieve providerkeuze vereist geslaagde gates P1–P5 en doorgerekende kosten. De AI-provider wordt niet hard gecodeerd; per taak werken we met een gecontroleerde adapter.

### 11. Geraadpleegde officiële documentatie (18 oktober 2026)

- Supabase MFA: https://supabase.com/docs/guides/auth/auth-mfa
- Supabase Storage: https://supabase.com/docs/guides/storage/buckets/fundamentals
- Supabase databasebackups: https://supabase.com/docs/guides/platform/backups
- Supabase PITR: https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery
- Supabase netwerkrestricties: https://supabase.com/docs/guides/platform/network-restrictions
- Fastify API-validatie: https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/
- Drizzle RLS: https://orm.drizzle.team/docs/rls
- pg-boss Postgres-queue: https://github.com/timgit/pg-boss
- Cloudflare Astro: https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/
- Sanity workspaces: https://www.sanity.io/docs/studio/workspaces
- Sanity access-tokens & assets: https://www.sanity.io/docs/content-lake/keeping-your-data-safe
