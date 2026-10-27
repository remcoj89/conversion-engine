# Conversion Engine

Conversion Engine is het interne SaaS-dashboard van Westend Digital voor leadopvolging, websiteproductie, taken, afspraken en resultaten.

Dit document is bewust groeiend. Nieuwe technische keuzes, gerealiseerde stappen en belangrijke beslissingen worden hier bijgehouden.

## Doel

De applicatie brengt de belangrijkste commerciële en operationele informatie van een klantomgeving samen in één dashboard. De applicatie wordt multi-tenant opgezet: iedere klantomgeving heeft eigen gebruikers, leden en gegevens.

De actuele volgorde voor de resterende onboarding-, review- en productiehand-off-slices staat in [de roadmap onboarding en review](docs/ONBOARDING-REVIEW-ROADMAP.md).

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
- Gecombineerde Q1–Q4-onboarding met 123 schema-velden, een gedeelde contractlaag en server-side Project Brief-generatie.
- Server-side onboardingconcepten met versiebeheer via migratie `0006`; `GET/PUT /v1/onboarding/current`.
- Officieel indienen via `POST /v1/onboarding/current/submit`; status `submitted` wordt server-side afgedwongen.
- Onveranderlijke audit-events bij het officieel indienen van een onboarding via migraties `0007` en `0008`.
- Westend-reviewer-toewijzingen per tenant (migratie `0009`) en het read-only metadata-endpoint `GET /v1/review/onboarding`.
- Eerste reviewactie `submitted` → `review_needed` via `POST /v1/review/onboarding/request-changes`, met een review request en een `review_requested`-audit-event in één transactie (migraties `0010` en `0011`).
- Een Owner kan in `review_needed` een concept opslaan: iedere opslag maakt een nieuwe immutable versie, de status blijft `review_needed` en er komt geen audit-event. Het dashboard maakt deze status bewerkbaar en slaat wijzigingen automatisch op.
- Een Owner kan een aangevulde onboarding vanuit `review_needed` opnieuw indienen: de API maakt een nieuwe versie, zet de status op `submitted` en schrijft in dezelfde transactie een `resubmitted`-audit-event (migratie `0012`). Migratie `0013` maakt daarnaast de `review_requested`-statuscheck expliciet null-veilig.
- Een toegewezen reviewer kan `submitted` transactioneel blokkeren (`POST /v1/review/onboarding/block`) en een blokkade opheffen naar `review_needed` (`POST /v1/review/onboarding/unblock`). Migratie `0014` voegt de tenantgebonden reviewacties, aparte reden-codes en de immutable audit-events `blocked` en `unblocked` toe.
- Een toegewezen reviewer kan een actuele `submitted` onboarding goedkeuren via `POST /v1/review/onboarding/approve`. Migratie `0015` voegt het immutable `approved`-audit-event toe. Een goedgekeurd project blijft het huidige project; de Owner kan het lezen maar niet wijzigen.
- Een toegewezen reviewer kan een goedgekeurde onboarding gecontroleerd heropenen via `POST /v1/review/onboarding/reopen`. Migratie `0016` voegt de tenantgebonden `reopened`-reviewactie en het immutable `reopened`-audit-event toe. De Owner kan daarna aanvullen en opnieuw indienen.
- Bij `review_needed` ziet de Owner de actieve reviewfeedback van het huidige project. Een wijzigingsverzoek, reopen of unblock geeft alleen reden, notitie, beoordeelde versie, datum en feedbacktype terug; reviewer- en interne gegevens blijven verborgen. Na resubmission wordt de feedback niet meer getoond.
- Het dashboard toont voor `submitted`, `blocked` en `approved` aparte statuslabels en meldingen. `blocked` en `approved` blijven volledig alleen-lezen; onbekende statussen vallen fail-closed terug naar de veilige ingediende weergave.
- `/api/onboarding` in de Next.js BFF met server-side sessie, token refresh en conflictcontrole; alleen een Owner heeft `onboarding:manage`.
- Dashboard-onboarding hervat concepten na refresh en slaat antwoorden automatisch op; bestanden zijn voorlopig metadata-only.
- Zelfstandige demowebsite in `apps/demo-site`; zie [het implementatierecord](docs/demo-site-implementation-record-v1.0.md).

## Architectuurbesluit websiteproductie — 27 oktober 2026

De Conversion Engine is de control plane voor websiteproductie. Zij beheert en versioneert de goedgekeurde Project Brief, de Demo Design Baseline voor Process A, de Design Change Set en het Production Prompt Package. De daadwerkelijke websitebouw gebeurt voorlopig in een geïsoleerd klantproject met eigen code, content, assets, tests, screenshots en deploymentflow.

Process A gebruikt de bestaande demo-pagina als design-startpunt; Process B gebruikt een goedgekeurde branchetemplate of designreferentie. Nieuwe, bevestigde onboardinginformatie en de goedgekeurde Project Brief hebben voorrang op oude demo-copy, onbevestigde prospect research en AI-afleidingen. Productie start pas na Gate A en publicatie pas na staging/QA, klantakkoord en Gate B. Een promptpakket is versioned en herleidbaar; de promptgenerator publiceert nooit zelfstandig.

Een volledig geïntegreerde websitegenerator/runner wordt uitgesteld totdat de promptcontracten en pilotworkflow zich in meerdere geïsoleerde klantprojecten hebben bewezen. Deze keuze voorkomt dat een nog veranderende AI-productieworkflow direct onderdeel wordt van de centrale SaaS-runtime.

## Security foundation — 22 oktober 2026

De beveiligingsgrens van de Fastify API, bijgewerkt naar de huidige code (23 oktober 2026).

- `GET /health` blijft publiek beschikbaar.
- Alle andere routes staan achter een auth-hook. De API authenticeert requests via de ZITADEL-adapter: het `Bearer`-access token wordt als JWT gevalideerd (RS256, issuer en audience uit de configuratie, sleutels via OIDC-discovery). Zonder geldige configuratie start de API niet.
- Een geauthenticeerde identity wordt via de lokale user en actieve membership in een actieve tenant vertaald naar een immutable `RequestContext` met tenant en rol.
- Bij één actieve membership wordt de tenant automatisch gekozen. Bij meerdere actieve memberships kan de gebruiker de tenant kiezen via `x-tenant-id`; deze waarde wordt server-side gecontroleerd tegen actieve memberships. Tenantwaarden uit body en query worden niet gebruikt.
- De rolcontrole gebruikt een deny-by-default permission map met `dashboard:read` en `leads:create`, beide voor Owner en Team Member, plus `onboarding:manage` voor Owner.
- `GET /v1/dashboard/today` toont alleen de tenant uit de auth-context.
- `POST /v1/leads` is alleen beschikbaar voor geauthenticeerde gebruikers met een actieve membership en `leads:create`. De lead wordt opgeslagen bij de tenant uit de auth-context; tenant-ID, status, lead-ID, timestamps en onbekende velden in de requestbody worden geweigerd en een nieuwe lead krijgt altijd status `new`.
- De HTTP-laag is onafhankelijk van Drizzle door dependency injection van de membership resolver, tenant-loader en lead-repository.
- Foutresponses bevatten geen tenant-, identity- of databasedetails: `401`, `403` en `400` voor auth, toegang en ongeldige invoer, `413` voor een te grote body en een generieke `500 internal_error` bij interne fouten.
- De API-testset bevat HTTP-tests voor authenticatie (inclusief de ZITADEL-adapter), tenantkeuze, roltoegang, tenantisolatie, leadvalidatie en fail-closed gedrag. De database-testset controleert de echte membership resolver, tenant-loader en lead-repository.

Nog niet aanwezig: MFA/AAL-handhaving en PostgreSQL-RLS. De resolver gaat uit van één geconfigureerde issuer en koppelt op `auth_provider_user_id`/OIDC-subject; issuer-opslag en de samengestelde uniqueness-regel zijn nog niet besloten.

Voor onboarding zijn echte uploads/private opslag, prefill en productiehandoff nog niet aanwezig; draftopslag, officieel indienen, audit-events en de eerste reviewerworkflow zijn er wel. De huidige draftopslag is lokaal gebouwd en getest. De handmatige smoketest met een echte ZITADEL-sessie is geslaagd: login, conceptopslag, refresh en opnieuw inloggen behouden de ingevulde antwoorden.

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

## Onboarding draft persistence — 23 oktober 2026

De dashboard-onboarding is gekoppeld aan server-side conceptopslag.

- `GET /v1/onboarding/current` laadt het actieve concept voor de tenant uit de auth-context.
- `PUT /v1/onboarding/current` valideert `answers`, `base_version`, `schema_id` en `schema_version`, en schrijft een nieuwe versie.
- Alleen een geauthenticeerde Owner met `onboarding:manage` kan onboardingconcepten lezen of wijzigen.
- De API genereert de Project Brief server-side uit de gevalideerde antwoorden.
- De BFF gebruikt de server-side sessie, geeft token-refresh door en behandelt versieconflicten met `409`.
- Het dashboard laadt het concept na openen, bewaart wijzigingen automatisch en hervat het concept na een refresh.
- Uploadvelden slaan voorlopig alleen metadata op. Bestandsbytes, private object storage, scanning, submit, review en audit-events vallen buiten deze slice.

De technische checks zijn groen en de handmatige controle met een echte ZITADEL-login is geslaagd. Deze slice is klaar voor acceptatie en commit.

## Onboarding indienen — 23 oktober 2026

Een ingelogde Owner kan de volledige onboarding officieel indienen; conceptopslag blijft werken zoals hierboven.

- `POST /v1/onboarding/current/submit` gebruikt dezelfde auth-hook, tenantcontext en `onboarding:manage`-permission als de draftroutes, en hetzelfde strikte body-contract (`answers`, `base_version`, `schema_id`, `schema_version`).
- De API controleert opnieuw schema, antwoordtypes en toegestane waarden, en daarnaast alle zichtbare verplichte velden. Ontbrekende of ongeldige antwoorden geven `400 incomplete_answers` met per veld de bronvragenlijst, het onderdeel en de melding. Verborgen conditionele waarden worden niet opgeslagen.
- Indienen gebeurt in één transactie met dezelfde rijlock en optimistic concurrency als de draftopslag: nieuwe immutable versie, server-side Project Brief en statusovergang `draft` → `submitted`. Een fout laat geen gedeeltelijke wijziging achter.
- Foutpaden: `401` zonder sessie, `403` zonder Owner/permission, `409 version_conflict`, `409 not_editable` (al ingediend) en `409 schema_mismatch`.
- Na indienen weigert de API elke verdere `PUT` of submit met `409 not_editable`.
- De BFF proxyt `POST /api/onboarding` met hetzelfde sessie- en tokenpatroon. Het dashboard wacht een lopende autosave af, stuurt de laatste antwoorden mee in de submit, toont de indienstatus en maakt de vragen daarna alleen-lezen; na een refresh laadt de status `submitted` opnieuw.

De handmatige submit-smoketest met een echte ZITADEL-sessie is geslaagd: de onboarding is ingediend en daarna alleen-lezen. Echte uploads, de reviewworkflow, prefill en de productiehandoff blijven buiten scope. Audit-events bij indienen zijn in een volgende slice toegevoegd; zie hieronder.

## Onboarding audit-events — 27 oktober 2026

Het officieel indienen van een onboarding wordt vastgelegd in een onveranderlijk auditlog.

- De eerste audit-event-slice introduceerde `onboarding_audit_events` (migratie `0007`, aangescherpt in `0008`) met `member_user_id` als actor voor klantacties. Migratie `0010` voegde `reviewer_user_id`, `version` en het eventtype `review_requested` toe; migratie `0011` koppelde versies aan echte onboardingversies; migratie `0012` voegde `resubmitted` toe; migratie `0013` repareerde de null-veiligheid van de `review_requested`-statuscheck; migratie `0014` voegde `blocked` en `unblocked` toe; migratie `0015` voegde `approved` toe; migratie `0016` voegde `reopened` toe.
- Een `submitted`-event gaat altijd naar status `submitted`, en de database staat als vorige status alleen `draft` toe, of leeg als het project bij het indienen zelf is aangemaakt. Een `review_requested`-event gaat altijd van `submitted` naar `review_needed`; een `resubmitted`-event gaat altijd van `review_needed` naar `submitted`; een `blocked`-event gaat van `submitted` naar `blocked`; een `unblocked`-event van `blocked` naar `review_needed`; een `approved`-event van `submitted` naar `approved`.
- Het event wordt geschreven in dezelfde transactie als de nieuwe onboardingversie en de statusovergang. Bij een fout of rollback blijft er geen event achter.
- Tenant en actor komen uitsluitend uit de auth-context. Samengestelde foreign keys borgen dit ook in de database: `(tenant_id, project_id)` verwijst naar een project van dezelfde tenant, `(tenant_id, member_user_id)` naar een membership van dezelfde tenant en `(tenant_id, reviewer_user_id)` naar een reviewer assignment van dezelfde tenant.
- Het event bevat geen antwoorden, Project Brief-inhoud, tokens of andere klantdata.
- Een databasetrigger weigert `UPDATE` en `DELETE` op de tabel. Deze trigger is handmatig aan de gegenereerde migratie toegevoegd, omdat Drizzle triggers niet modelleert.
- Database- en API-tests dekken het geslaagde event en de foutpaden: onvolledige of ongeldige antwoorden, verouderde `base_version`, tweede submit, submit na een eerdere statusovergang, een fout tijdens de transactie, een mismatch tussen tenant en project, een actor uit een andere tenant en een ongeldige vorige status.

Een audit-endpoint of audit-dashboard bestaat nog niet. De migraties `0007` t/m `0015` zijn alleen op de lokale testdatabase toegepast; de ontwikkeldatabase is nog niet gemigreerd. De audit- en review-slices zijn onafhankelijk gecontroleerd.

## Westend-reviewer foundation — 27 oktober 2026

Gebouwd volgens richting B uit [`docs/reviewworkflow-foundation-decision.md`](docs/reviewworkflow-foundation-decision.md): een reviewer-toewijzing per tenant, los van memberships. Zelfreview is verboden. Klantrollen blijven `owner` en `team_member`.

- Nieuwe tabel `onboarding_reviewer_assignments` (migratie `0009`):
  - kolommen `tenant_id`, `user_id`, `status`, `granted_by`, `created_at` en `revoked_at`;
  - primaire sleutel `(tenant_id, user_id)`;
  - FK's naar `tenants` en `users`, voor zowel de user als `granted_by`;
  - `status` is alleen `active` of `revoked`, en `revoked_at` is gevuld precies wanneer de toewijzing is ingetrokken;
  - een partial index op `user_id` voor actieve toewijzingen.
- `findActiveReviewerAssignments` geeft alleen actieve toewijzingen in actieve tenants, en alleen tenant- en user-ID.
- Reviewroutes staan in een **aparte** Fastify-scope met een eigen hook en een eigen `ReviewerContext`. De bestaande auth-hook voor klantroutes is niet gewijzigd.
  - Een reviewer zonder membership kan klantroutes niet gebruiken (403).
  - In de reviewscope is `x-tenant-id` verplicht en moet het een UUID zijn (anders 400).
  - De header moet overeenkomen met een actieve toewijzing (anders 403).
  - Een actieve membership in dezelfde tenant geeft 403 `self_review_forbidden`.
  - Tenantwaarden uit body of query worden niet gebruikt.
- `GET /v1/review/onboarding` geeft alleen `status`, `version`, `updated_at` en `missing_required_fields`. Dat laatste wordt berekend met het gedeelde onboarding-contract.
  - Reviewbaar zijn `submitted`, `review_needed`, `blocked` en `approved`.
  - Een draft of een ontbrekende onboarding geeft `404 onboarding_not_found`.
  - Antwoorden en Project Brief-inhoud komen nooit in de response.

**Nog niet gebouwd in deze slice** (`submitted` → `review_needed` en reviewnotities zijn daarna toegevoegd, zie hieronder):

- reviewstatusovergangen;
- status- en redenovergangen buiten `review_requested`;
- beheer van toewijzingen (geen endpoint, script of UI; O-2 en O-3 staan open);
- inzage in antwoorden door reviewers, en het loggen daarvan;
- MFA/AAL-handhaving en PostgreSQL-RLS.

Migratie `0009` is handmatig toegepast op de lokale testdatabase; de testworkflow migreert niet automatisch. De ontwikkeldatabase is niet gemigreerd. De voortgang staat in [`docs/PROJECT-CHECKLIST.md`](docs/PROJECT-CHECKLIST.md).

## Westend-review: wijzigingen aanvragen — 27 oktober 2026

Een toegewezen reviewer kan een ingediende onboarding terugzetten naar `review_needed` met een reden en een notitie voor de klant. Dit is de eerste echte reviewstatusovergang.

- `POST /v1/review/onboarding/request-changes` staat in de reviewer-scope en gebruikt uitsluitend de `ReviewerContext`. Tenant en reviewer komen uit de context.
  - De body bevat precies `base_version` (≥ 1), `reason_code` (`missing_information`, `rights_unclear` of `out_of_scope`) en `note` (verplicht, na trimmen 1 tot 2.000 tekens). Een `tenant_id`, `project_id` of ander veld geeft `400 invalid_body`.
  - Succes geeft `200 { "status": "review_needed", "version": n }`.
  - Fouten: `401`, `400 invalid_body`, `403 forbidden`, `403 self_review_forbidden`, `404 onboarding_not_found`, `409 version_conflict` en `409 not_reviewable`. Interne fouten geven een generieke `500`.
- `requestOnboardingChanges` doet in **één transactie**, met een rijlock op het project:
  1. controleren dat de status `submitted` is en dat `base_version` actueel is;
  2. een review request opslaan;
  3. de status op `review_needed` zetten;
  4. een `review_requested`-audit-event opslaan.

  Faalt één stap, dan rolt alles terug. Een tweede verzoek ziet `review_needed` en krijgt `409 not_reviewable`.
- **Reviewer-autorisatie wordt twee keer gecontroleerd:** in de reviewer-hook en opnieuw in de repository, binnen dezelfde transactie en vóór elke wijziging.
  - De toewijzing moet op het moment van de transactie bestaan en `active` zijn; anders volgt `reviewer_forbidden` → `403 forbidden`.
  - Een actieve membership in dezelfde tenant geeft `self_review_forbidden` → `403`. Een `disabled` of `invited` membership blokkeert niet.
  - De volgorde is: toewijzing, dan membership (beide met `FOR SHARE`), dan het project (`FOR UPDATE`). Een intrekking tijdens de transactie wacht daardoor tot de transactie klaar is.
  - Zo kan ook een directe repository-aanroep de hook niet omzeilen.
- **Versies verwijzen naar echte onboardingversies** (migratie `0011`): `onboarding_review_requests(project_id, version)` en `onboarding_audit_events(project_id, version)` hebben een FK naar `onboarding_versions(project_id, version)`. Oudere `submitted`-events met `version = NULL` blijven geldig.
- **Nieuwe tabel `onboarding_review_requests`** (migratie `0010`):
  - kolommen `id`, `tenant_id`, `project_id`, `reviewer_user_id`, `version`, `reason_code`, `note` en `created_at`;
  - samengestelde FK's naar het project van dezelfde tenant en naar de reviewer-toewijzing van dezelfde tenant;
  - checks op de reden-code, `version` ≥ 1, een niet-lege notitie en maximaal 2.000 tekens.

- **Owner-weergave van reviewfeedback:** `GET /v1/onboarding/current` geeft bij `review_needed` alleen de reden, notitie, beoordeelde versie en datum van het laatste verzoek van het huidige project terug. De reviewer-ID en andere tenantgegevens worden niet teruggegeven. Na conceptopslag blijft het verzoek zichtbaar; na resubmission en bij andere statussen is `review_request` `null`.

  De **reviewnotitie staat alleen in deze tabel**, niet in het auditlog.
- **Audit-events kennen nu twee soorten actor:**
  - `member_user_id` voor klantacties: de voormalige `actor_user_id`, hernoemd zodat bestaande events en de membership-FK intact blijven;
  - `reviewer_user_id` voor Westend-reviewacties, met een FK naar de reviewer-toewijzing van dezelfde tenant.

  Regels:
  - precies één actor per event;
  - `submitted` heeft altijd een member, `review_requested` altijd een reviewer;
  - `review_requested` gaat altijd van `submitted` naar `review_needed`, met een `version`.

  Indienen legt voortaan ook de versie vast. Oudere `submitted`-events zonder versie blijven geldig. De immutability-trigger is ongewijzigd.

## Owner-conceptopslag in `review_needed` — 27 oktober 2026

Een Owner kan een onboarding met status `review_needed` aanvullen en als concept opslaan via `PUT /v1/onboarding/current`.

- Elke opslag maakt een nieuwe onveranderlijke onboardingversie.
- De status blijft `review_needed`.
- Dezelfde `base_version`-controle voorkomt overschrijven van gelijktijdige wijzigingen; een conflict geeft `409 version_conflict`.
- Conceptopslag maakt geen audit-event. De opslag is wel herleidbaar via de onboardingversie en `created_by`.
- `submitted`, `blocked` en `approved` blijven niet bewerkbaar via deze route.
- `review_needed` → `submitted` (`resubmitted`) is in een daaropvolgende backend-slice gebouwd; zie hieronder.

De API- en databasetests controleren de onveranderlijkheid van versies, statusbehoud, tenantisolatie, Owner-autorisatie, stale-version-conflicten en het ontbreken van een audit-event. Het dashboard herkent `review_needed` als bewerkbaar, bewaart wijzigingen via de bestaande BFF/PUT-flow en houdt `submitted` alleen-lezen. De dashboard- en API-tests, lint, typecheck, build en visuele controle op desktop en mobiel zijn groen; de browsercontrole gebruikte synthetische data.

**Nog niet gebouwd op het moment van deze oorspronkelijke slice:**

- `reopened`;
- het bewaartermijn- en beheerbeleid voor reviewnotities;
- beheer van toewijzingen (O-2) en de ZITADEL-inrichting voor Westend-medewerkers (O-3);
- MFA/AAL en RLS.

## Gate 0 — bevestigde productbesluiten reviewworkflow

De resterende reviewworkflow is uitgewerkt in [`docs/reviewworkflow-foundation-decision.md`](docs/reviewworkflow-foundation-decision.md). Gate 0 is bevestigd: `approved` blijft niet-bewerkbaar, alleen een toegewezen reviewer kan `blocked` opheffen of een onboarding heropenen, reviewerinzage wordt gelogd en `approved` betekent geen automatische publicatie. Er is voor Gate 0 geen code gewijzigd.

Migraties `0010` t/m `0015` zijn alleen op de lokale testdatabase toegepast, handmatig (de testworkflow migreert niet automatisch). De ontwikkeldatabase is niet gemigreerd.

## Opnieuw indienen vanuit `review_needed` — 27 oktober 2026

Een Owner kan een aangevulde onboarding vanuit `review_needed` opnieuw indienen via `POST /v1/onboarding/current/submit`.

- De bestaande volledige server-side validatie blijft verplicht; onvolledige of ongeldige antwoorden wijzigen niets.
- De API gebruikt dezelfde rijlock en `base_version`-controle als conceptopslag en maakt een nieuwe immutable versie.
- De status gaat transactioneel van `review_needed` naar `submitted`.
- De API schrijft precies één `resubmitted`-audit-event met `member_user_id`, `from_status = review_needed`, `to_status = submitted` en de nieuwe versie; antwoorden en Project Brief-inhoud worden niet in het event opgeslagen.
- Team Members, reviewers, andere tenants en stale versies worden geweigerd; een fout tijdens de versie- of eventopslag rolt de hele transactie terug.
- Migratie `0012` voegt het eventtype en de bijbehorende databasechecks toe; migratie `0013` maakt de bestaande `review_requested`-statuscheck expliciet null-veilig. Audit-events blijven onveranderlijk.
- Het dashboard wacht op een lopende autosave voordat het indient. Als die PUT een conflict, blokkade, validatiefout of netwerkfout geeft, wordt geen submit-POST verstuurd en blijft de onboarding bewerkbaar of wacht deze op een expliciete conflictkeuze.

De onafhankelijke controle is groen: `npm run api:lint`, `npm run api:typecheck`, `npm run api:build`, 115 API-tests, 86 database-tests, de dashboardlint/typecheck/build, 132 dashboardtests en `git diff --check`. De browsercontrole met synthetische data bevestigde desktop en mobiel: een autosave-conflict resulteert in 0 submit-POSTs. De ontwikkel- en productiedatabase zijn niet gemigreerd.

## Reopen-feedback voor de Owner — 27 oktober 2026

Een Owner ziet bij een heropende onboarding met status `review_needed` dat Westend de goedkeuring heeft heropend, inclusief de reden, volledige notitie, beoordeelde versie en datum/tijd.

- De API combineert alleen de feedbackbronnen van het huidige project: een wijzigingsverzoek of een reopenactie.
- De actieve feedback wordt deterministisch gekozen op basis van de beoordeelde onboardingversie; de tijd ordent alleen gelijke versies.
- `GET /v1/onboarding/current` geeft alleen `kind`, `reason_code`, `note`, `version` en `created_at` terug.
- Feedback is tenant- en projectgebonden, wordt alleen bij `review_needed` getoond en verdwijnt na resubmission.
- De bestaande BFF, autosaveflow en resubmissionflow zijn niet inhoudelijk gewijzigd.
- De dashboardweergave is gecontroleerd op desktop en mobiel, inclusief loading, ontbrekende feedback, lange notities en resubmission.

De onafhankelijke controle is groen: API-lint, API-typecheck, API-build, 131 API-tests, 117 databasetests, dashboardlint, dashboardtypecheck, dashboardbuild, 140 dashboardtests en `git diff --check`. Migratie `0016` is alleen lokaal op de testdatabase toegepast.

## Dashboardstatussen voor `blocked` en `approved` — 27 oktober 2026

De Owner ziet voor `blocked` en `approved` een expliciete statusmelding in plaats van de generieke tekst `Ingediend`.

- `blocked` toont dat de onboarding tijdelijk is geblokkeerd en dat opnieuw indienen niet mogelijk is.
- `approved` toont dat de onboarding is goedgekeurd en dat nieuwe wijzigingen niet kunnen worden opgeslagen.
- De vragen en Project Brief blijven zichtbaar maar niet-bewerkbaar.
- `submitted` behoudt de bestaande melding.
- Onbekende statussen blijven alleen-lezen en vallen terug naar een veilige standaardweergave.
- API, database en statusovergangen zijn niet gewijzigd.
- Desktop en mobiel zijn gecontroleerd met synthetische data.

De onafhankelijke controle is groen: lint, typecheck, build, 140 dashboardtests, 131 API-tests, 117 databasetests en `git diff --check`.

## Unblock-feedback voor de Owner — 27 oktober 2026

Een Owner ziet bij een onboarding die van `blocked` naar `review_needed` is teruggezet dat Westend de blokkade heeft opgeheven, inclusief reden, volledige notitie, beoordeelde versie en datum/tijd.

- De feedback gebruikt dezelfde tenant- en projectgebonden response als wijzigingsverzoeken en reopen-acties.
- `GET /v1/onboarding/current` geeft alleen `kind`, `reason_code`, `note`, `version` en `created_at` terug.
- Voor unblock is `kind` gelijk aan `unblocked`; de drie bestaande redencodes krijgen Nederlandse labels.
- De actieve feedback wordt deterministisch gekozen op beoordeelde versie, tijd en een stabiele tiebreaker.
- De feedback wordt alleen bij `review_needed` getoond en verdwijnt na resubmission.
- Er is geen migratie toegevoegd; de bestaande `onboarding_review_actions`-opslag wordt hergebruikt.

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
