# Reviewworkflow — technische ontwerpnotitie (fundament)

**Datum:** 27 oktober 2026
**Status:** richting B en Gate 0 bevestigd; reviewerfundament, eerste reviewactie, Owner-conceptopslag, reviewnotitiezichtbaarheid en resubmission vanuit `review_needed` gebouwd. De status- en beheer-slices volgen als afzonderlijke implementatieopdrachten.
**Fase:** Fase 5 — technische implementatie met kleine verticale slices
**Auteur:** Claude Code (junior developer), ter review door de projectleider

Deze notitie beschrijft hoe een Westend-review van onboardings veilig kan worden toegevoegd. Richting B en de scheiding van reviewer- en klantrollen zijn inmiddels besloten en geïmplementeerd in de eerste verticale slices. De resterende open productbesluiten bepalen de volgende reviewstatusovergangen en klantinteractie.

**Bronnen:**

- `docs/fase-2-requirements-scope-definitief-v1.0.md`: §2.1 rollen, §2.2 rechtenmatrix en §4.1 statusreeks;
- `docs/fase-3-ux-ui-user-flows-definitief-v1.0.md`: §2.2 Westend-beheeromgeving en §3.2 goedkeuringen;
- `docs/fase-3-gecombineerde-onboarding-ontwikkelpakket-v0.1/…-project-brief-specificatie-v0.1.md`: §3 statusmodel;
- `docs/fase-4-technische-architectuur-definitief-v1 (2).0/…-v1.0.md`: A-02, A-03, R-01, R-03 en SEC-01 t/m SEC-03;
- `docs/fase-4-a04-datamodel-relaties-v0.2.md`: memberships, platformrechten, supporttoegang en audit;
- de actuele code in `apps/api/src/auth/`, `apps/api/src/db/schema.ts`, `apps/api/src/onboarding/` en `apps/api/src/routes/onboarding.ts`;
- de migraties `0006` t/m `0015`;
- `db.test.ts` en `onboarding.test.ts`.

---

## 1. Huidige situatie

### 1.1 Rollen

- Er bestaan alleen **tenantrollen**: `owner` en `team_member` (`TenantRole` in `auth/types.ts`). De database dwingt dat af met `memberships_role_check`.
- Een platformrol of Westend-rol bestaat niet. `auth/types.ts` zegt dat expliciet: *"Platform Admin is deliberately not a tenant role."*
- A-04 (§4) bevestigt de richting: `memberships.role` is alleen `owner` of `team_member`. *"Westend Platform Admin wordt beheerd via afzonderlijke, streng bewaakte platformrechten."*

### 1.2 Memberships en tenants

- `memberships` heeft als primaire sleutel `(tenant_id, user_id)`, met een rol en een status (`active`, `invited` of `disabled`).
- `users` bevat alleen platformidentiteit: `auth_provider_user_id`, het OIDC-subject. Er staan geen rollen in.
- `findActiveMemberships` geeft alleen **actieve** memberships in **actieve** tenants terug.
- `resolveRequestContext` kiest per request precies één tenant. Bij één membership gebeurt dat automatisch. Bij meerdere memberships kiest de client via `x-tenant-id`, en die keuze wordt gecontroleerd tegen de eigen memberships. Een tenant uit de body of query wordt nooit gebruikt.
- Het resultaat is een bevroren `RequestContext { userId, tenantId, role }`.

### 1.3 Permissioncontrole

- Alle routes behalve `/health` staan in één afgeschermde Fastify-scope met de auth-hook (`app.ts`).
- De auth-hook geeft **403 als iemand geen actieve membership heeft**. Een gebruiker die geen lid is van een tenant, komt dus niet bij een route.
- `authorize(role, permission)` werkt deny-by-default met drie permissions:
  - `dashboard:read`: Owner en Team Member;
  - `leads:create`: Owner en Team Member;
  - `onboarding:manage`: alleen Owner.
- Iedere onboardingroute controleert `onboarding:manage` en gebruikt uitsluitend `context.tenantId`.

### 1.4 Onboardingstatussen

- De database kent vijf statussen: `draft`, `submitted`, `review_needed`, `blocked` en `approved` (check constraint uit `0006`).
- De applicatie schrijft er nu drie:
  - `draft`: bij opslaan;
  - `submitted`: bij officieel indienen, na server-side validatie van alle zichtbare verplichte velden.
  - `review_needed`: wanneer een toegewezen reviewer wijzigingen aanvraagt.
- Een nieuwe versie kan ontstaan bij conceptopslag vanuit `draft` of `review_needed`, en bij indienen vanuit `draft`. Vanuit `submitted`, `blocked` en `approved` volgt `409 not_editable`.
- Alles gebeurt onder een rijlock (`FOR UPDATE`) met optimistic concurrency via `base_version`.
- Per tenant kan maar één lopend project bestaan: een unieke index op `tenant_id` waar de status niet `approved` is.
- **Belangrijk voor dit ontwerp:** `findCurrentOnboarding` en de opslaglogica behandelen een `approved` project als het huidige, niet-bewerkbare project. De normale applicatieflow maakt na goedkeuring dus geen tweede project aan; alleen een gecontroleerde reopen door Westend kan de status opnieuw bewerkbaar maken.

### 1.5 Audit-events

- `onboarding_audit_events` kent de eventtypes `submitted` en `review_requested` (migraties `0007`, `0008` en `0010`).
- Het event wordt geschreven in dezelfde transactie als de nieuwe versie en de statusovergang.
- Database-integriteit:
  - een composiet-FK `(tenant_id, project_id)` naar `onboarding_projects`;
  - een composiet-FK `(tenant_id, member_user_id)` naar `memberships` en een composiet-FK `(tenant_id, reviewer_user_id)` naar `onboarding_reviewer_assignments`;
  - `from_status` is bij `submitted` alleen `NULL` of `draft`;
  - een trigger weigert `UPDATE` en `DELETE`.
- Reviewer-events gebruiken daarom een aparte actor-kolom met een tenantveilige FK naar de reviewer assignment. Een reviewer hoeft geen membership in de klanttenant te hebben en zelfreview blijft verboden.

### 1.6 Tenantgebonden versus platformbreed

| Onderdeel | Nu | Hoort |
|---|---|---|
| `tenants`, `memberships`, `leads`, `websites`, `onboarding_*` | tenantgebonden | tenantgebonden |
| `users` | platformidentiteit | platformidentiteit (geen rollen) |
| Westend-reviewrechten | aparte reviewer assignments per tenant | **niet** als tenantmembership; wel expliciet per tenant afgebakend |
| Platform Admin (provisioning, templates, monitoring) | bestaat niet | platformbreed, later en buiten deze notitie |
| Reviewbeslissingen en -notities | eerste wijzigingsverzoek bestaat; overige beslissingen open | tenantgebonden data, geschreven door een toegewezen reviewer |

---

## 2. Probleem: waarom een tenant-Owner geen Westend-reviewer is

**Te brede toegang.** Een Owner-membership geeft nu al `dashboard:read`, `leads:create` en `onboarding:manage`, en straks ook contacten, deals en omzet (rechtenmatrix §2.2). Een Westend-medewerker die als Owner aan een tenant hangt om te reviewen, krijgt die CRM- en financiële toegang er gratis bij. Dat botst met A-04 §4.7: *"Platform Admin ≠ onbeperkte stille inzage"*. Supporttoegang moet doelgebonden zijn en apart geaudit worden.

**Cross-tenant datalekken.** Om alle klanten te kunnen reviewen, zou een Westend-medewerker een membership in **elke** tenant nodig hebben. Eén account wordt dan een sleutel tot alle tenants. Dat is precies risico R-01: een fout in de tenantkeuze, een vergeten tenantfilter of een overgenomen account raakt dan alle klanten tegelijk, in plaats van één.

**Klantrollen versus platformrollen.** Klantrollen beschrijven wat iemand *binnen het eigen bedrijf* mag. De klant beheert ze zelf: de Owner nodigt het team uit. Een Westend-reviewer is geen lid van het klantteam. Als membership zou een Westend-medewerker:

- in het team van de klant verschijnen;
- meetellen voor de limiet van Owner plus twee Team Members;
- door de klant-Owner beheerd of verwijderd kunnen worden;
- in het auditlog niet te onderscheiden zijn van een klantactie.

**Een Owner-permission alleen is onvoldoende.** Hangt de route "goedkeuren" achter `onboarding:manage`, dan kan **elke klant-Owner zijn eigen onboarding goedkeuren**. De specificatie (§3) zegt uitdrukkelijk: *"`approved`: alleen Westend zet deze status na handmatige controle."* De tenantisolatie houdt dan wel stand, want de Owner raakt alleen de eigen tenant. Maar de **integriteit** van de review is weg. Een Owner-permission beantwoordt de vraag "mag deze klant zijn eigen intake beheren?", niet "is dit een bevoegde Westend-beoordelaar voor déze klant?".

---

## 3. Advies

### 3.1 Richting A — platformbrede reviewerrol buiten memberships

Een tabel zoals `platform_roles(user_id, role)` met de rol `onboarding_reviewer`. Wie die rol heeft, kan de onboarding van **iedere** tenant openen en beoordelen. De tenant wordt per request gekozen via `x-tenant-id`.

- **Voordelen:** eenvoudig en past bij A-04 ("afzonderlijke platformrechten"). De klant ziet er niets van.
- **Nadelen:** iedere reviewer heeft standaard toegang tot alle tenants. Dat is geen least privilege, en het risico bij een overgenomen account is maximaal. De tenantkeuze is niet afgebakend, dus `x-tenant-id` wordt de enige grens. Testen beperkt zich tot "heeft de rol wel of niet".

### 3.2 Richting B — reviewerrelatie met expliciete tenant-scope (voorkeur)

Een aparte tabel, bijvoorbeeld `onboarding_reviewer_assignments`, met deze kolommen:

- `tenant_id`;
- `user_id`;
- `status` (`active` of `revoked`);
- `granted_by`, `created_at` en `revoked_at`.

De primaire sleutel is `(tenant_id, user_id)`. Er zijn FK's naar `tenants` en `users`. Een reviewer mag alleen tenants openen waaraan hij **expliciet** is toegewezen. De relatie staat volledig los van `memberships`.

Hoe dit in de bestaande auth-architectuur past:

- Dezelfde `AuthAdapter`: hetzelfde ZITADEL-JWT en dezelfde `users`-rij.
- Een **eigen** afgeschermde Fastify-scope, bijvoorbeeld `/v1/review/...`, met een eigen hook. Die hook zet een eigen `ReviewerContext { userId, tenantId, scope: "onboarding_review" }`. In die scope is `x-tenant-id` **verplicht** en wordt het gecontroleerd tegen actieve toewijzingen.
- Een aparte permission-map voor reviewers (`onboarding:review`). Die komt **niet** in de bestaande `allowedRoles` van tenantrollen.
- Klantroutes blijven ongewijzigd: een reviewer zonder membership krijgt daar nog steeds 403. Reviewroutes blijven onbereikbaar voor klant-Owners: zonder toewijzing volgt 403.

Toewijzingen worden ingetrokken door de status op `revoked` te zetten, niet door te verwijderen. Zo blijven ze bruikbaar als FK-doel voor audit-events.

### 3.3 Voorkeur voor de MVP: richting B

| Eis | Richting A | Richting B |
|---|---|---|
| Tenantisolatie behouden | alleen via header | header **plus** toewijzing per tenant |
| Least privilege | nee, alle tenants | ja, alleen toegewezen tenants |
| Eenvoudig te testen | ja | ja: twee tenants, één toewijzing, negatieve tests per richting |
| Geen brede adminrechten | nee | ja |
| Past bij de auth-architectuur | ja | ja: zelfde adapter, eigen scope en context |
| Uitbreidbaar naar review, Gate A en audit-dashboard | ja | ja: dezelfde toewijzing kan later Gate A-rechten dragen. Een toekomstige Platform Admin wordt degene die toewijzingen beheert |

Richting B kost één extra tabel en een eigen hook. Daar staat tegenover dat een reviewer alleen ziet waarvoor hij is aangewezen, en dat de beslissing per tenant herleidbaar is.

---

## 4. Statusmodel

### 4.1 Overgangen

"Reviewer" betekent hier: een gebruiker met een actieve toewijzing voor déze tenant en geen membership in diezelfde tenant (zie open beslissing O-4).

| Van | Naar | Actor | Voorwaarde | Audit-event |
|---|---|---|---|---|
| (geen project) | `draft` | Owner (`onboarding:manage`) | `base_version = 0` | nee (concept) |
| `draft` | `draft` | Owner | `base_version` actueel | nee (concept) |
| `draft` of (geen project) | `submitted` | Owner | alle zichtbare verplichte velden geldig; `base_version` actueel | `submitted` (**bestaat**) |
| `submitted` | `review_needed` | Reviewer | reden verplicht (reden-code plus notitie, eventueel veld-ID's); reviewer beoordeelt versie *n* = `current_version` | `review_requested` |
| `review_needed` | `review_needed` | Owner | aanvullen als concept (zie §4.2); `base_version` actueel | nee (concept) |
| `review_needed` | `submitted` | Owner | opnieuw volledige validatie; `base_version` actueel | `resubmitted` (zie §6.3) |
| `submitted` | `blocked` | Reviewer | reden verplicht (bijv. kritische basis ontbreekt binnen het standaardpakket) | `blocked` |
| `blocked` | `review_needed` | Reviewer | reden verplicht; blokkade opgeheven (bijv. meerwerk akkoord) | `unblocked` |
| `submitted` | `approved` | Reviewer | beoordeelde versie = `current_version`; notitie optioneel | `approved` |
| `approved` | `review_needed` | Reviewer | materiële wijziging; reden verplicht (latere slice "reopen") | `reopened` |

**Niet toegestaan:**

- een Owner die `review_needed`, `blocked` of `approved` zet;
- een reviewer die antwoorden wijzigt;
- `review_needed` direct naar `approved` (eerst opnieuw indienen);
- `draft` naar `approved`;
- een overgang op een verouderde versie.

### 4.2 Ontbrekende informatie

- **Vóór indienen:** de server weigert onvolledige antwoorden met `400 incomplete_answers`. Dat bestaat al.
- **Na indienen:** de reviewer zet `review_needed`, met een reden-code (bijvoorbeeld `missing_information`, `rights_unclear` of `out_of_scope`), een korte notitie voor de klant en eventueel de betrokken veld-ID's.
- **Gebouwd:** in `review_needed` mag de Owner concepten opslaan. De status blijft `review_needed`, totdat de Owner opnieuw indient. Opnieuw indienen voert opnieuw volledige validatie uit, maakt een nieuwe versie en schrijft het aparte `resubmitted`-event.
- Bij een kritisch tekort, bijvoorbeeld geen bestaande branding binnen het standaardpakket, gebruikt de reviewer `blocked`. Die blokkade lost de klant niet zelf op via de vragenlijst. Westend heft hem op.

### 4.3 Wijzigingen nadat een project al beoordeeld is

- Na `approved` kan de klant **niet** meer via de onboarding-API wijzigen.
- Een materiële wijziging (UX §3.2: intake, strategie, prijs, beeldrechten of CTA) loopt via een gecontroleerde **reopen** door Westend: `approved` naar `review_needed`, met een reden.
- De oude goedkeuring blijft zichtbaar in het auditlog en wordt niet overschreven, conform A-04 bij `approvals`.
- Wat precies "materieel" is, en hoe dat doorwerkt naar Gate A en Gate B, is nog niet besloten.
- **O-5 opgelost in migratie-/repositoryslice 0015:** `approved` blijft in de current-projectlogica staan, Owner-writes geven `not_editable` en de normale applicatieflow kan geen tweede project naast het goedgekeurde project starten. Een directe database-insert van een extra `approved` project wordt nog niet door een unieke constraint uitgesloten.

### 4.4 Wat auditbaar moet zijn

- Elke statusovergang die geen concept-opslag is, krijgt een audit-event. Zie de laatste kolom in §4.1.
- Concept-opslag is via de versietabel (`onboarding_versions`, met `created_by`) al herleidbaar.
- Daarnaast moet **inzage in klantinhoud door een reviewer** gelogd worden (UX §2.2: *"Toegang tot individuele klantinhoud is doelgebonden en gelogd"*). Dat wordt een apart soort access-event, in een latere slice.

## Gate 0 — bevestigde productbesluiten

Gate 0 voorkomt dat de volgende status- en reviewer-slices op impliciete aannames worden gebouwd. De onderstaande keuzes zijn op 27 oktober 2026 bevestigd als MVP-beleid.

| Besluit | Voorstel voor de MVP | Consequentie voor implementatie |
|---|---|---|
| **O-2 Toewijzingen beheren** | Geen klant-Owner-endpoint en geen algemene reviewer-UI. Toewijzingen worden voorlopig uitgevoerd via een gecontroleerd server-side provisioningscript door een bevoegde Westend-operator. `granted_by`, `created_at`, `revoked_at` en de status blijven verplicht auditbaar. | Eerst een kleine beheer-/provisioningslice; een Platform Admin-rol en UI blijven buiten scope. |
| **O-3 Westend-identiteit** | Westend-medewerkers gebruiken dezelfde OIDC-issuer als de applicatie, maar een afzonderlijke ZITADEL-organisatie. De lokale `users`-rij blijft de koppeling op OIDC-subject. MFA/AAL is verplicht voor reviewers vóór productiegebruik. | Geen reviewer-memberships in klanttenants; MFA/AAL wordt een release-gate, niet alleen een UI-regel. |
| **O-5 Gedrag na `approved`** | `approved` is definitief niet-bewerkbaar voor de klant. Een goedgekeurd project mag niet stilzwijgend uit de current-project-query vallen om een nieuw lopend project te openen. Alleen een reviewer kan gecontroleerd heropenen. | **Gebouwd:** de current-project- en create-logica houdt een goedgekeurd project vast; Owner-lezen blijft toegestaan, schrijven en een tweede project via de applicatieflow niet. |
| **O-7 Uitweg uit `blocked`** | Alleen een actieve, aan de tenant toegewezen reviewer kan `blocked → review_needed` uitvoeren. De reviewer geeft een reden en notitie; daarna kan de Owner weer aanvullen en resubmitteren. De Owner kan `blocked` niet zelf opheffen. | Nieuwe statusovergang, concurrency-check en audit-event `unblocked`; klant- en reviewerrechten blijven gescheiden. |
| **O-8 Reviewnotities** | Reviewnotities staan in de tenantgebonden review-request-tabel, niet in het audit-event. De Owner ziet de open notitie zolang de status `review_needed` is. Voor de MVP is het voorstel: bewaren zolang het project bestaat en 24 maanden na sluiting; daarna de vrije notitietekst verwijderen of anonimiseren. Dit wordt vóór productie door privacy/legal bevestigd. | Geen inhoud in audit-events; een latere retention-slice moet purge/anonymisatie, autorisatie en herstelgedrag testen. |
| **O-9 Inzage-logging** | Iedere reviewer-opvraag van antwoorden of Project Brief schrijft een immutable access-event met tenant, reviewer, project, versie, doel, endpoint/actie, tijdstip en request/correlation-ID. De klantinhoud zelf staat niet in het log. | Reviewerinzage en audit-dashboard mogen pas worden gebouwd met de access-eventstrategie en cross-tenant tests. |
| **O-10 Gate A/B** | `approved` betekent: de intake en Project Brief zijn door Westend gecontroleerd en mogen als kandidaat-input naar Gate A. Het is geen automatische productie- of publicatievrijgave. Gate A-vrijgave, geïsoleerde bouw, staging/QA, klantakkoord en Gate B blijven afzonderlijke stappen. De promptgenerator publiceert nooit zelfstandig. | De productiehandoff krijgt aparte release-events en expliciete menselijke vrijgaven; `approved` start geen generator-run automatisch. |

De `blocked`/`unblocked`-backend-slice bewaart de unblock-notitie veilig in `onboarding_review_actions`, maar toont die nog niet in de Owner-response. Een aparte Owner/UI-slice moet bepalen of de unblock-toelichting als actuele reviewfeedback wordt getoond, zodat een oude `review_requested`-notitie niet als actuele blokkadereden wordt gepresenteerd.

### Status- en redenregels na Gate 0

- Klantstatussen blijven `draft`, `submitted`, `review_needed`, `blocked` en `approved`.
- Klantacties: `draft → submitted`, `review_needed → review_needed` en `review_needed → submitted`.
- Revieweracties: `submitted → review_needed`, `submitted → blocked`, `blocked → review_needed`, `submitted → approved` en `approved → review_needed`.
- Iedere reviewerstatusovergang vereist de actuele `base_version`/`current_version`, een actieve tenanttoewijzing en een transactioneel audit-event.
- `review_requested` gebruikt de bestaande klantgerichte reden-codes. Voor `blocked`, `unblocked` en `reopened` worden aparte event-reason-codes gebruikt; de slice mag deze niet stilzwijgend gelijkstellen aan klantnotities. De gerealiseerde codes zijn `critical_basis_missing`, `rights_not_cleared` en `requires_extra_work` voor `blocked`, en `basis_provided`, `rights_cleared` en `extra_work_agreed` voor `unblocked`.
- Geen enkele overgang geeft een reviewer het recht om antwoorden of de Project Brief rechtstreeks te wijzigen.

### Gate 0-uitkomst

Gate 0 is gesloten als productbesluit. De `blocked`/`unblocked`-slice en de `approved`/O-5-slice zijn gebouwd en onafhankelijk gecontroleerd. De resterende technische slices zijn:

1. `reopened`;
2. reviewerbeheer volgens O-2/O-3.

MFA/AAL, RLS en access-logging blijven releasevoorwaarden voordat reviewerinzage of productiegebruik live gaat.

---

## 5. Eerste implementatieslice — gerealiseerd

De reviewer foundation uit deze slice is gebouwd en onafhankelijk gecontroleerd. De eerste statusovergang en reviewnotitie zijn daarna als aparte verticale slice toegevoegd; de actuele status staat in `README.md` en `docs/PROJECT-CHECKLIST.md`.

**Doel:** het reviewer-autorisatiefundament aantonen zonder statusovergang en zonder klantinhoud.

**Inhoud (één beperkte combinatie):**

1. **Database:** één nieuwe tabel `onboarding_reviewer_assignments` (`tenant_id`, `user_id`, `status` met `active`/`revoked`, `granted_by`, `created_at`, `revoked_at`). De primaire sleutel is `(tenant_id, user_id)`, met FK's naar `tenants` en `users`, en een check op de status. Dat is één migratie (`0009`).
2. **Repository:** `findActiveReviewerAssignments(db, identity)`. Die geeft alleen actieve toewijzingen in actieve tenants.
3. **Auth:** een `ReviewerContext`-resolver en een hook in een **aparte** Fastify-scope `/v1/review`. Daarin is `x-tenant-id` verplicht (anders 400) en wordt het gecontroleerd tegen toewijzingen (anders 403). Een eigen permission `onboarding:review` komt in een aparte map.
4. **Eén read-only endpoint:** `GET /v1/review/onboarding` voor de gekozen tenant. Het geeft **alleen metadata**: `status`, `version`, `updated_at` en het aantal ontbrekende verplichte velden. Er gaan geen antwoorden en geen Project Brief mee, zodat er in deze slice nog geen inzage in klantinhoud plaatsvindt.
5. **Tests**, met twee tenants:
   - reviewer van A leest A (200);
   - reviewer van A vraagt B op (403);
   - zonder `x-tenant-id` (400);
   - ingetrokken toewijzing (403);
   - klant-Owner van A op de reviewroute (403);
   - reviewer op de klantroutes `/v1/onboarding/current` (403);
   - anoniem (401);
   - databasetests voor FK's, status en primaire sleutel.

**Wat er nog niet in hoort:**

- statusovergangen (`blocked`, `approved` en `reopened`); de overgangen naar `review_needed`, conceptopslag in `review_needed` en `resubmitted` zijn inmiddels gebouwd;
- status- en redenovergangen buiten `review_requested`;
- inzage in antwoorden of de Project Brief, en het loggen daarvan;
- wijzigingen aan `onboarding_audit_events`, inclusief de oplossing voor de membership-FK uit §6.2;
- een beheer-endpoint of UI voor toewijzingen;
- een Platform Admin-rol;
- dashboard- of BFF-wijzigingen;
- een provisioningscript voor toewijzingen (zie O-2);
- handhaving van MFA/AAL;
- RLS.

---

## 6. Audit-eventstrategie

### 6.1 Minimale gegevens voor een review-event

| Gegeven | Kolom (voorstel) | Opmerking |
|---|---|---|
| Event-ID | `id` | bestaat |
| Tenant | `tenant_id` | uit de context, nooit uit de request |
| Project | `project_id` | composiet-FK met `tenant_id` (bestaat) |
| Actor | zie §6.2 | reviewer of Owner |
| Eventtype | `event_type` | uitbreiden per slice: `review_requested`, `resubmitted`, `blocked`, `unblocked`, `approved`, `reopened` |
| Vorige en nieuwe status | `from_status`, `to_status` | per eventtype een check, zoals nu bij `submitted` |
| Reden | `reason_code` | vaste lijst; verplicht bij `review_requested`, `blocked`, `unblocked` en `reopened` |
| Notitie | **niet in het auditlog** | vrije tekst kan klantinhoud of persoonsgegevens bevatten. Bewaar de notitie in een tenantgebonden reviewtabel; het event verwijst er hooguit naar via een ID |
| Beoordeelde versie | `version` | de projectversie waarop de beslissing slaat; nodig voor Gate A en reopen |
| Tijdstip | `created_at` | bestaat |
| Correlation-ID | `request_id` | de Fastify-request-ID, voor koppeling met logs |

**Nooit opslaan:** antwoorden, Project Brief-inhoud, notitietekst, tokens of secrets, AI-prompts of AI-tokens, e-mailadressen, en andere persoonsgegevens dan de interne gebruikers-ID.

### 6.2 Actor en de membership-FK uit `0008`

De oorspronkelijke FK `(tenant_id, actor_user_id) → memberships` maakte reviewer-events onmogelijk. **In de slice met de eerste reviewovergang zijn daarom twee actorkolommen toegevoegd, elk tenantveilig, waarvan precies één gevuld is:**

- `member_user_id` → `memberships(tenant_id, user_id)`;
- `reviewer_user_id` → `onboarding_reviewer_assignments(tenant_id, user_id)`;
- `check (num_nonnulls(member_user_id, reviewer_user_id) = 1)`.

Zo blijft elke actor in de database aan déze tenant gekoppeld. Dit is gerealiseerd in migratie `0010`; migratie `0011` koppelt de beoordeelde versie aan een bestaande onboardingversie.

### 6.3 Waarom `resubmitted` een apart eventtype is

Migratie `0008` borgt dat een `submitted`-event alleen vanuit `NULL` of `draft` komt. Opnieuw indienen vanuit `review_needed` zou die regel breken. Een apart eventtype houdt die regel geldig, en houdt "eerste indiening" en "aanvulling na review" onderscheidbaar in rapportages. Migratie `0013` maakt daarnaast de `review_requested`-overgang expliciet null-veilig.

---

## 7. Open beslissingen voor volgende slices

| # | Beslissing | Status / voorstel |
|---|---|---|
| O-1 | Richting A of B | **Besloten: B** — reviewer-toewijzing per tenant |
| O-2 | Wie maakt toewijzingen in de MVP, en hoe? | **Bevestigd Gate 0:** server-side via een gecontroleerd script, met `granted_by` gevuld en zelf geaudit. Later via een Platform Admin |
| O-3 | Identiteit van Westend-medewerkers in ZITADEL | **Bevestigd Gate 0:** dezelfde issuer (de single-issuer-aanname blijft gelden), aparte ZITADEL-organisatie, MFA verplicht |
| O-4 | Mag een reviewer ook membership hebben in dezelfde tenant? | **Besloten: nee** — geen zelfreview; de hook en repository weigeren dit |
| O-5 | Na `approved` een nieuw project toestaan? | **Bevestigd Gate 0:** nee. Goedgekeurd betekent "niet bewerkbaar"; alleen een reviewer kan gecontroleerd heropenen |
| O-6 | Bewerken in `review_needed` | **Gebouwd:** conceptopslag behoudt `review_needed`; opnieuw indienen zet de status op `submitted` en schrijft `resubmitted` |
| O-7 | Uitweg uit `blocked` | **Gebouwd:** alleen een actieve toegewezen reviewer kan `blocked` naar `review_needed` zetten, met reden en notitie; de Owner kan daarna weer aanvullen |
| O-8 | Opslag, zichtbaarheid en bewaartermijn van reviewnotities | **Bevestigd Gate 0:** tenantgebonden tabel, zichtbaar voor de Owner tijdens `review_needed`, bewaren tijdens projectlevensduur plus 24 maanden na sluiting; daarna vrije tekst verwijderen of anonimiseren, onder voorbehoud van privacy/legal |
| O-9 | Inzage-logging | **Bevestigd Gate 0:** elke opvraag van antwoorden of Project Brief door een reviewer logt een immutable access-event zonder klantinhoud |
| O-10 | Verhouding tot Gate A en Gate B | **Bevestigd Gate 0:** `approved` is intakecontrole binnen Gate A, geen formele Gate A-vrijgave; staging/QA, klantakkoord en Gate B blijven verplicht |

---

## Waarom deze keuzes?

### 1. Waarom deze voorkeursoplossing?

Richting B geeft een Westend-reviewer precies de toegang die de taak vraagt: de onboarding van een klant waaraan hij is toegewezen, en niets anders.

- **Tenantgrens:** die blijft in de database, omdat de toewijzing per tenant is vastgelegd. Hij hangt niet alleen aan een header.
- **Klantrollen:** die blijven zuiver. Een Westend-medewerker verschijnt nooit in het team van de klant.
- **Architectuur:** het past bij wat er al staat: dezelfde ZITADEL-login, dezelfde `users`-tabel en hetzelfde patroon van een bevroren context per request. Alleen het soort context verschilt.
- **Typesysteem:** met een aparte context en scope kan een klantroute nooit per ongeluk een reviewer doorlaten, of andersom.

### 2. Welke alternatieven zijn overwogen?

1. **Richting A**, een platformbrede reviewerrol (§3.1).
2. **Een extra rol in `memberships`**, bijvoorbeeld `westend_reviewer`.
3. **Westend-medewerkers als Owner** aan iedere tenant koppelen.
4. **De review-endpoints achter de bestaande `onboarding:manage`** hangen.

### 3. Waarom niet die alternatieven?

- **Richting A:** geeft iedere reviewer toegang tot alle tenants. Voor een klein team voelt dat praktisch, maar het is precies de "onbeperkte stille inzage" die A-04 uitsluit. Bij een overgenomen account vergroot het de schade tot alle klanten.
- **Rol in `memberships`:** botst met A-04 (rollen in memberships zijn alleen `owner` en `team_member`). Het mengt platformrechten met klantrechten, en de klant-Owner zou die rol in zijn team zien.
- **Owner-membership:** geeft CRM- en financiële toegang die niets met review te maken heeft. Het telt mee voor de teamlimiet en maakt Westend-acties niet te onderscheiden van klantacties.
- **Achter `onboarding:manage`:** laat iedere klant-Owner zijn eigen onboarding goedkeuren. Dat is in strijd met de specificatie (alleen Westend zet `approved`).

### 4. Hoe ben ik tot de oplossing gekomen?

1. Eerst de huidige code gelezen: welke rollen er zijn, hoe de auth-hook een tenant kiest, en hoe permissions werken. Daaruit bleek dat iedere klantroute een membership vereist. Een reviewer zonder membership heeft daarom een aparte route-scope nodig.
2. Daarna de leidende documenten gelezen: fase 2 legt vast dat Platform Admin een aparte rol is met beperkte, gelogde inzage. A-04 zegt dat platformrechten los van memberships staan. UX §2.2 wil een zichtbare klantcontext en gelogde inzage.
3. Vervolgens de onboarding- en auditcode doorgelopen. Daar vond ik twee concrete obstakels: de membership-FK uit `0008` blokkeert reviewer-events, en `approved` valt uit de lopende-projectlogica.
4. De alternatieven getoetst aan de zes eisen uit de opdracht (§3.3). Alleen richting B voldoet aan alle zes.
5. Tot slot is de kleinste slice gekozen die het autorisatiefundament bewijst, zónder antwoorden of Project Brief-inhoud vrij te geven. Zo ontstaat geen nieuwe inhoudelijke inzage, terwijl de negatieve tests de tenantgrens aantonen.

### 5. Welke risico's staan nog open?

- **MFA:** MFA/AAL wordt nog niet server-side afgedwongen (SEC-01). Reviewerroutes mogen niet naar productie zonder MFA.
- **Geen RLS:** de tenantgrens hangt nu alleen aan applicatiecode en composiet-FK's, niet aan PostgreSQL-RLS.
- **Gedrag na `approved`:** de normale applicatieflow houdt het goedgekeurde project vast en weigert Owner-writes; een directe database-insert van een extra goedgekeurd project wordt nog niet door een unieke constraint uitgesloten.
- **Audit-actor:** de aparte reviewer-actor is gebouwd; de immutability-trigger beschermt nog steeds alleen tegen runtime-updates en -deletes.
- **Beheer van toewijzingen:** zonder beheerinterface blijft dat handwerk. Dat moet gecontroleerd en zelf auditbaar gebeuren.
- **Grenzen van immutability:** de trigger houdt een databasebeheerder niet tegen (A-04 §6). "Onveranderlijk" geldt alleen voor de normale runtime.

### 6. Welke informatie ontbreekt nog voordat volgende slices veilig gebouwd kunnen worden?

Voor de eerste slices zijn **O-1**, **O-2**, **O-3**, **O-4**, **O-5**, **O-7**, **O-8**, **O-9** en **O-10** bevestigd. **O-5** en **O-6** zijn gebouwd: een goedgekeurd project blijft current en niet-bewerkbaar, en conceptopslag/resubmission vanuit `review_needed` zijn geïmplementeerd. De resterende beheer-, status- en inzageslices moeten nog worden gebouwd; privacy/legal moet de bewaartermijn vóór productie nog bevestigen.

- de keuze voor richting B — besloten en gebouwd;
- wie toewijzingen maakt, en hoe;
- hoe Westend-accounts in ZITADEL worden ingericht;
- of zelfreview wordt uitgesloten — besloten en afgedwongen.

### 7. Waarom is dit document bijgewerkt na de eerste slices?

De oorspronkelijke notitie legde eerst het autorisatie- en statusmodel vast voordat code werd gebouwd. Daarna zijn richting B, de aparte reviewer-scope, de metadata-opvraag en `submitted → review_needed` als kleine verticale slices geïmplementeerd. Dit document houdt nu bij welke keuzes zijn besloten, welke onderdelen daadwerkelijk gebouwd zijn en welke productbesluiten nog expliciet openstaan.
