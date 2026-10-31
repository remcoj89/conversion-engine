# Conversion Engine — projectcontext

**Laatst bijgewerkt:** 31 oktober 2026
**Status:** Fase 5, technische implementatie met kleine verticale slices
**Laatste gepushte technische commit:** `5d75bb0 feat: add tenant security and platform administration`

Dit document is een compacte startcontext voor nieuwe Codex- en Claude-sessies. Het vervangt de leidende bron- en architectuurdocumenten niet.

## Leidende bronnen

Gebruik deze volgorde bij conflicten:

1. expliciete gebruikersopdracht;
2. `docs/fase-2-requirements-scope-definitief-v1.0.md` — functionele scope;
3. `docs/fase-3-ux-ui-user-flows-definitief-v1.0.md` — UX en user flows;
4. `docs/fase-3-gecombineerde-onboarding-ontwikkelpakket-v0.1/` — onboarding, Q1–Q4 en Project Brief;
5. `docs/westend-conversion-engine-plannen/02-functioneel-ontwikkelplan-conversion-engine.md` — ontwikkelplan en werkpakketten;
6. `docs/fase-4-technische-architectuur-definitief-v1 (2).0/fase-4-technische-architectuur-definitief-v1.0.md` — technische architectuur en releasegates;
7. `docs/ONBOARDING-REVIEW-ROADMAP.md` — volgorde en gates voor onboarding, review en productiehandoff;
8. `README.md` — actuele technische status;
9. overige fase- en providerdocumenten — alleen wanneer relevant voor de opdracht.

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
- Bij officieel indienen legt de API in dezelfde transactie een onveranderlijk `submitted`-audit-event vast (`onboarding_audit_events`, migraties `0007` en `0008`). De tabel ondersteunt inmiddels ook `review_requested`, met aparte member- en reviewer-actoren (migratie `0010`), tenantveilige versie-FK's (migratie `0011`), `resubmitted` (migratie `0012`), `blocked`/`unblocked` (migratie `0014`), `approved` (migratie `0015`) en `reopened` (migratie `0016`). Migratie `0013` maakt de `review_requested`-statuscheck expliciet null-veilig. Tenant en actor komen uit de auth-context en zijn met samengestelde foreign keys aan dezelfde tenant gekoppeld. De slices zijn onafhankelijk gecontroleerd.
- Westend-reviewer foundation: tabel `onboarding_reviewer_assignments` (migratie `0009`), een aparte `/v1/review`-scope met eigen `ReviewerContext` (verplichte `x-tenant-id`, actieve toewijzing vereist, zelfreview geweigerd) en `GET /v1/review/onboarding` met alleen status, versie, `updated_at` en het aantal ontbrekende verplichte velden.
- Eerste reviewerbeheer-slice: de server-side CLI `provision:reviewer` kan een assignment transactioneel aanmaken of een ingetrokken assignment heractiveren. Actieve assignments blijven ongewijzigd, heractivatie behoudt `created_at`, productie en ontbrekende bevestiging worden geweigerd en de bestaande samengestelde primary key wordt hergebruikt zonder migratie. Technische operatorautorisatie is nog niet gebouwd.
- Slice 2.1b reviewer-revoke: de gecontroleerde server-side CLI `revoke:reviewer` valideert actieve tenant, reviewer, operator en assignment, zet een actieve assignment transactioneel op `revoked` met `revoked_at`, is idempotent voor reeds revoked assignments en weigert productie of ontbrekende bevestiging. Er is geen migratie of onboarding-audit-event; de bestaande reviewscope sluit revoked assignments direct uit. Technische operatorautorisatie blijft een aparte release-hardening-slice.
- Slice 2.2 + 2.3 reviewerinzage en inzage-logging: `GET /v1/review/onboarding/content` geeft alleen de actuele reviewbare antwoorden en Project Brief terug aan een toegewezen reviewer. De repository herhaalt de autorisatie binnen dezelfde transactie, vergrendelt project en versie, en schrijft vóór succesvolle afronding een immutable, content-vrij access-event met tenant, reviewer, project, versie, doel, actie, request-ID en tijdstip (migratie `0017`). Drafts, ontbrekende projecten, self-review, revoked assignments en cross-tenant combinaties leveren geen content of event op. De database-FK's en append-only trigger bewaken de tenantgrens en onveranderlijkheid.
- Platform Admin-backend- en BFF-autorisatie: platformrechten staan los van tenant-memberships en reviewerassignments in `platform_admin_assignments` (migratie `0018`). De aparte fail-closed auth-scope beschermt `GET /v1/platform/context`; revoked grants, disabled users, tenantheaders en membershipfallbacks geven geen toegang. `/api/admin/context` gebruikt alleen de server-side sessie en de admin-layout rendert childpagina’s pas na exacte contextvalidatie. De overige adminpagina’s blijven read-only demo; de live klantenlijst, het live klantdetail en het live audit-dashboard zijn in afzonderlijke slices toegevoegd. Migratie `0018` is op de lokale testdatabase toegepast; de ontwikkeldatabase is niet gemigreerd.
- Platform Admin live klantenlijst (Slice 1): `GET /v1/platform/tenants` levert alleen operationele tenantmetadata met server-side zoeken, account- en onboardingfilters, stabiele cursorpaginering en website-/onboardingsamenvattingen. `/api/admin/clients` gebruikt uitsluitend de HttpOnly-sessie en de frontend toont expliciete loading-, lege-, unauthorized-, forbidden- en unavailable-states. De lijst is read-only; klantdetail, preview en beheeracties blijven buiten deze slice.
- Platform Admin live klantdetail (Slice 2): `GET /v1/platform/tenants/:tenantId` en `/api/admin/clients/:tenantId` tonen alleen exact tenantgebonden operationele metadata. De detailpagina is read-only, klikbaar vanuit de lijst en bevat geen klantantwoorden, Project Brief, leads, memberships, identities, reviewnotities of preview.
- Platform Admin audit-dashboard (Slice 2.4): `GET /v1/platform/audit-events` en `/api/admin/audit-events` tonen statusovergangen en inhoudsvrije reviewerinzage als immutable metadata, met server-side tenant-, eventtype- en tijdfilters, cursorpaginering en responsive states. Vrije reviewnotities en klantinhoud blijven buiten de feed.
- Tenant lifecycle en owner-uitnodiging: Platform Admin kan tenants aanmaken als `pending`, hernoemen, uitschakelen en heractiveren. `POST /v1/platform/tenants/:tenantId/invitations` maakt een eenmalige 32-byte bearer-token aan; alleen de SHA-256-hash wordt opgeslagen. `POST /v1/invitations/accept` gebruikt een aparte identity-only MFA/AAL-scope, maakt zo nodig de lokale user aan, maakt de owner-membership actief en activeert de pending tenant transactioneel. De dashboardflow gebruikt een fragmentlink, een vaste `/invite` OIDC-continuatie, een same-origin BFF en geen tenantheader. Het e-mailadres is momenteel metadata voor de handmatige uitnodiging en wordt nog niet als verified identiteit gecontroleerd.
- CRM-leads read slice: de klantomgeving gebruikt live tenantgebonden `GET /v1/leads`- en `GET /v1/leads/:leadId`-routes met `leads:read`, server-side zoeken, statusfilter en stabiele opaque cursorpaginering. Owners en Team members lezen alle actieve leads binnen hun eigen tenant; `lead_assignments` bepaalt verantwoordelijkheid en meldingen, niet zichtbaarheid. `POST /v1/leads` maakt in productie dezelfde transactie een actieve assignment voor de actor. De dashboard-BFF en `/leads`-pagina’s bevatten geen demo-leads meer en tonen expliciete loading-, lege-, auth-, forbidden-, not-found- en unavailable-states. Migratie `0021_aspiring_cammi.sql` is gegenereerd maar niet uitgevoerd.
- CRM-contract foundation (Slice CRM-0a): de API bevat een deny-by-default contract voor `owner`, `tenant_admin` en configureerbare Team member-CRM-rechten, zonder Platform Admin als tenantrol. De pure CRM-instellingenmodule valideert tenanttijdzone, maandag-vrijdag 09:00–17:00, leadopvolging, toewijzingsstrategie, meldingen en stabiele leadbron-ID’s. Deze slice wijzigt nog geen database, RLS, routes of frontend; persistente rechten en tenantinstellingen volgen in de security-/databaseslice. API-tests, typecheck, build, lint en `git diff --check` zijn groen.
- CRM-lead privacy (Slice CRM-0b): Team members zien alle actieve leads binnen hun eigen tenant; assignments blijven verantwoordelijkheid en notificatie-routing. Een Platform Admin of reviewer krijgt via RLS geen lees- of schrijfrechten op `leads` en `lead_assignments`, terwijl customer-, maintenance-, test- en cross-tenant-paden expliciet zijn getest. Migratie `0029_restrict_lead_platform_scope.sql` is toegepast op `conversion_engine_test`; de developmentdatabase en lokale role-bootstrap zijn nog niet uitgevoerd. API-unit-, database/RLS-, typecheck-, lint-, build- en diff-checks zijn groen.
- CRM-organizations en contacts (Slice CRM-1a): schema, migratie `0030_crm_organizations_contacts.sql`, tenant-RLS, runtime-allowlists en repository zijn toegevoegd. Na de lokale role-bootstrap zijn de CRM-, RLS- en leadregressietests 16/16 groen; typecheck, lint, build en diff-check zijn eveneens groen. Development, productie en VPS zijn niet aangepast.
- MFA/AAL-handhaving (Slice 3.1): de tenant-, session-, reviewer- en Platform Admin-scopes vereisen server-side sterke assurance uit geverifieerde JWT-claims (`acr = aal2`, `amr = mfa` of `ce_aal = aal2`). Ontbrekende, malformed of te lage assurance geeft `403 insufficient_assurance`; ongeldige authenticatie blijft `401`; `/health` blijft publiek. De adapter geeft alleen een kleine, claimvrije assurance-context door aan de auth-hooks. De lokale enforcement, contracttests en echte ZITADEL end-to-end controle zijn geslaagd. De lokale-only diagnosecontrole is weer uitgeschakeld; productie gebruikt deze route niet.
- Eerste reviewactie `submitted` → `review_needed` (`POST /v1/review/onboarding/request-changes`, migratie `0010`). In één transactie worden een review request met reden en notitie (tabel `onboarding_review_requests`), de statusovergang en een `review_requested`-audit-event opgeslagen. Audit-events ondersteunen een aparte member- en reviewer-actor, met precies één per event. De repository controleert de reviewer-toewijzing (actief op het moment van de transactie) en zelfreview opnieuw binnen de transactie. Review requests en audit-events verwijzen via een FK naar een bestaande onboardingversie (migratie `0011`).
- Een Owner kan een onboarding in `review_needed` als concept opslaan via `PUT /v1/onboarding/current`. Elke opslag maakt een nieuwe immutable versie, behoudt de status `review_needed` en maakt geen audit-event.
- Een Owner kan een aangevulde onboarding vanuit `review_needed` opnieuw indienen via `POST /v1/onboarding/current/submit`. Dit maakt een nieuwe immutable versie, zet de status op `submitted` en schrijft in dezelfde transactie een `resubmitted`-audit-event (migratie `0012`).
- Het dashboard herkent `review_needed` als bewerkbaar: de Owner kan antwoorden aanpassen en automatisch opslaan via de bestaande BFF/PUT-flow. `submitted` blijft alleen-lezen.
- Een Owner met status `review_needed` ziet de actieve reviewfeedback van het huidige project: een wijzigingsverzoek of een gecontroleerde reopen, met reden, notitie, beoordeelde versie, datum en feedbacktype. De API geeft deze gegevens alleen binnen de eigen tenant en alleen zolang de reviewronde open is.
- Een toegewezen reviewer kan `submitted` transactioneel blokkeren (`blocked`) en een blokkade later opheffen (`review_needed`) via aparte reviewacties. De reden-codes en notities zijn tenantgebonden opgeslagen; de audit-events bevatten geen vrije tekst.
- Een toegewezen reviewer kan een actuele `submitted` onboarding goedkeuren (`approved`). Het goedgekeurde project blijft het huidige project; de Owner kan het lezen maar niet wijzigen en de normale applicatieflow maakt geen tweede project aan.
- Het dashboard dient de onboarding in via de BFF (`POST /api/onboarding`), wacht daarbij een lopende autosave af, en toont een ingediende onboarding na refresh alleen-lezen.
- Zelfstandige demo-site in `apps/demo-site`, visueel gecontroleerd op desktop en mobiel.

De laatste gepushte technische commit is `5d75bb0`. Daarin zijn de Platform Admin-klantenlijst, het klantdetail, het audit-dashboard, de MFA/AAL-handhaving, tenant lifecycle, owner-uitnodigingen, de live CRM-leads read slice, de access-token contracttest en de read-only production database verifier opgenomen. API-lint, API-typecheck, API-build, 240 API-tests, dashboard-lint, dashboard-typecheck, dashboard-build, 238 dashboardtests en `git diff --check` zijn groen; de eerdere desktop-/mobiele visuele controles blijven geldig. De lokale migraties `0019` t/m `0025` zijn volgens de projectstatus toegepast. De productie database-identiteit, rollen, RLS-policyset en migration-journal-hashes zijn nog niet met de nieuwe read-only verifier gecontroleerd.

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

Antwoorden worden per tenant en project versieerbaar opgeslagen. Bij refresh wordt een bestaand concept hervat; gelijktijdige wijzigingen leiden tot een expliciete 409-conflictkeuze. De vier uploadvelden bewaren voorlopig alleen metadata: echte uploads, scanning en private opslag zijn nog niet gebouwd. Officieel indienen is aanwezig: de status `submitted` wordt server-side afgedwongen en een ingediende onboarding is niet meer automatisch wijzigbaar. In `review_needed` kan de Owner backendmatig conceptversies opslaan, de actieve reviewfeedback lezen en een aangevulde onboarding opnieuw indienen; die resubmission maakt een nieuwe versie, zet de status op `submitted` en schrijft een `resubmitted`-audit-event. Een toegewezen reviewer kan `submitted` blokkeren en `blocked` weer terugzetten naar `review_needed`, zonder nieuwe onboardingversie maar met een aparte reviewactie en audit-event per overgang. Een toegewezen reviewer kan `submitted` goedkeuren en een goedgekeurd project gecontroleerd heropenen; `approved` blijft het huidige project en blokkeert verdere Owner-wijzigingen of een tweede project via de applicatieflow. Het dashboard toont voor `submitted`, `blocked` en `approved` aparte statusmeldingen, terwijl de laatstgenoemde statussen alleen-lezen blijven. Het dashboard wacht vóór submit op een lopende autosave en verstuurt geen submit-POST als die opslag niet succesvol is. De migraties `0007` t/m `0016` staan alleen op de lokale testdatabase; de ontwikkeldatabase is nog niet gemigreerd. Review operations en productiehandoff blijven volgende slices.

Voor de reviewworkflow is richting B besloten (zie `docs/reviewworkflow-foundation-decision.md`): een reviewer-toewijzing per tenant, los van memberships, zonder zelfreview. Gebouwd zijn het autorisatiefundament (toewijzingen, de reviewer-scope en een read-only metadata-endpoint) en de eerste reviewactie `submitted` → `review_needed`. Die slaat een review request met notitie op en registreert de reviewer als aparte audit-actor.

PostgreSQL-RLS is lokaal gebouwd en gecontroleerd voor alle tenantgebonden tabellen. De implementation gebruikt `FORCE ROW LEVEL SECURITY`, transactionele requestcontext en een tokengebonden identity-only invitation-flow; de cross-tenant regressietests zijn groen. De RLS-migraties `0022` t/m `0025` zijn op de lokale ontwikkel- en testdatabase toegepast. Production database-rollen, deploymentprocedure en de definitieve MFA/AAL-provideracceptatie blijven open. Het afgesproken PostgreSQL-rollenmodel is: `ce_migrator` voor migraties en read-only verificatie, `ce_api_runtime` voor de API met `NOSUPERUSER`/`NOBYPASSRLS` en zonder ownership, `ce_bff_runtime` voor uitsluitend `bff_sessions`, `ce_maintenance` voor afzonderlijk gecontroleerd onderhoud en een aparte no-login schema-/table-owner, bij voorkeur `ce_owner` als dat technisch passend is. De daadwerkelijke rolcreatie, grants en privilegecontroles zijn nog niet uitgevoerd. De bewaartermijn voor reviewnotities is nog niet besloten. De voortgang van slices en besluiten staat in `docs/PROJECT-CHECKLIST.md`.

De handmatige bouw en verzending van koude outreach-demo’s blijven buiten de Conversion Engine. De backend- en databasefundering wordt niet opnieuw gebouwd voor de demo-opbouw.

## Besluit websiteproductie

De Conversion Engine wordt de control plane voor websiteproductie. De software bewaart en versioneert de goedgekeurde Project Brief, de Demo Design Baseline (alleen bij Process A), de Design Change Set en het Production Prompt Package. Daarmee is herleidbaar welke klantinformatie, designreferentie en prioriteitsregels voor een websiteversie zijn gebruikt.

De daadwerkelijke websitebouw gebeurt voorlopig in een geïsoleerd klantproject. Dat project bevat de websitecode, content, assets, tests en screenshots en ontvangt alleen het goedgekeurde tenantgebonden productie-inputpakket. Staging, QA, klantakkoord en Gate B blijven verplicht; de promptgenerator publiceert niet zelfstandig. Process B gebruikt zonder bestaande demo dezelfde contractvorm, maar start vanuit een goedgekeurde branchetemplate of designreferentie.

Een volledig geïntegreerde websitegenerator/runner in de Conversion Engine is uitgesteld totdat de promptcontracten, agentgrenzen, componentbibliotheek en pilotworkflow zich bij meerdere klantprojecten hebben bewezen. Tot die tijd is een losse uitvoering met een centrale, versioned inputbron de gekozen MVP-/pilotarchitectuur.

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

- De volledige volgorde voor onboarding, review en productiehandoff staat in [`docs/ONBOARDING-REVIEW-ROADMAP.md`](ONBOARDING-REVIEW-ROADMAP.md); Gate 0 is bevestigd en `blocked`/`unblocked` plus `approved`/O-5 zijn lokaal geaccepteerd.
- Gate 0 is bevestigd en documentair gesloten in `docs/reviewworkflow-foundation-decision.md`; `reopened` en de Owner-weergave van reopen-feedback zijn lokaal geaccepteerd.
- Productie-MFA/AAL-handhaving.
- Production database-rollen/deployment voor PostgreSQL-RLS en tenantveilige samengestelde relaties.
- Reviewworkflow: bewaartermijn van reviewnotities, technische operatorautorisatie, MFA/AAL en RLS (O-2, O-3, O-5, O-7 t/m O-10 in `docs/reviewworkflow-foundation-decision.md`), daarna de Project Brief-goedkeuring.
- Veilige uploads, scanning en private opslag.
- Publieke lead-ingest met anti-spam, rate limiting, outbox en idempotency.
- CRM-contacten, pipeline, taken en verdere leadopvolging.
- CRM-security-/databaseslice: persistente `tenant_admin`-rol, Team member-rechten en tenantinstellingen. De lead-privacygrens voor Platform Admin is met CRM-0b afgedekt; organizations/contacts en de overige CRM-tabellen krijgen dezelfde RLS-standaard.
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
