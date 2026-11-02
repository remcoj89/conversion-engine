# Conversion Engine — projectcontext

**Laatst bijgewerkt:** 2 november 2026
**Status:** Fase 5, technische implementatie met kleine verticale slices
**Laatste gepushte technische commit:** `42fc7bf feat: complete CRM foundation and harden database access`

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
- CRM-organizations en contacts API/BFF (Slice CRM-1b): de API biedt tenantgebonden list-, detail-, create-, update- en archive-routes voor organisaties en contactpersonen. De Next.js BFF gebruikt uitsluitend de HttpOnly-sessie, whitelisted query/bodyvelden, same-origin mutaties en strikte response-parsing. Team members worden voor deze routes fail-closed geweigerd zolang configureerbare CRM-rechten nog niet persistent aan een gebruiker gekoppeld zijn.
- CRM-frontend en integratiegate (Slice CRM-1c/1d): `/crm`, `/organizations` en `/contacts` zijn live gekoppeld aan de BFF zonder demo-data. De pagina’s hebben zoeken, loading-, lege-, unauthorized-, forbidden- en unavailable-states, semantische tabellen, toetsenbordfocus en responsive desktop/mobiel gedrag. De topbar benoemt de drie CRM-routes correct. De lijstweergave met echte ingelogde tenantdata is nog niet visueel gevalideerd omdat tijdens de gate geen lokale geauthenticeerde browsersessie beschikbaar was; contracttests dekken die data- en foutpaden wel af.
- CRM CRUD-frontend (Slice CRM-1e): organisaties en contactpersonen kunnen in de klantomgeving worden toegevoegd, bewerkt en gearchiveerd via de bestaande server-side BFF. De formulieren valideren invoer, verversen lijsten na succesvolle mutaties en tonen expliciete loading-, fout- en successtates. Archiveren is soft-delete en permanente verwijdering is nog niet beschikbaar. De CRUD-formulieren zijn contractueel getest en gebouwd, maar nog niet met echte tenantdata in een ingelogde browser visueel geopend.
- CRM relatie-aanmaak (Slice CRM-1f): bij het aanmaken van een contactpersoon kan optioneel direct een nieuwe organisatie worden aangemaakt en gekoppeld. Bij het aanmaken van een organisatie kan optioneel een bestaande contactpersoon worden gekoppeld of inline een nieuwe contactpersoon worden aangemaakt. De combinatie wordt transactioneel opgeslagen, blijft tenantgebonden en hergebruikt de bestaande normalisatie- en deduplicatieregels. Bestaande contactpersonen die al aan een organisatie gekoppeld zijn worden niet opnieuw toegewezen. API-, BFF-, dashboard-, database-, typecheck-, lint- en build-gates zijn groen.
- CRM-2a backend/BFF: `tenant_admin` is toegevoegd als persistente tenantrol. De genormaliseerde tabel `team_member_crm_permissions` bewaart uitsluitend de vier CRM-rechten (`crm:read`, `crm:create`, `crm:update`, `crm:archive`) met veilige defaults, tenantgebonden composite FK, timestamps en `ENABLE`/`FORCE RLS`. De membership resolver laadt alleen actieve grants in een claimvrij `TeamMemberPermissionContract`; CRM-organizations/contacts en de nieuwe teamroutes gebruiken dit contract server-side. `/v1/team/members` en de permissions-/role-PATCHes geven geen provider-subjects terug en gebruiken stabiele veilige labels. De BFF gebruikt alleen de HttpOnly-sessie, strict allowlists, same-origin mutaties, no-store en veilige 401/403/404/409/503-mappings. Migratie `0031_tenant_crm_permissions.sql` is op de lokale development- en testdatabase toegepast en de lokale rol-bootstrap is uitgevoerd. De API-database-suite is 143/143 groen; de gewone API-suite is 295/295 groen.
- CRM-instellingen (Slice CRM-2b): tenantgebonden CRM-settings bewaren tijdzone, werkdagen, werktijden, leadopvolging, toewijzingsstrategie, meldingen en vaste leadbronnen. `GET/PATCH /v1/crm/settings` en de dashboard-BFF zijn fail-closed, valideren het volledige contract server-side en schrijven een immutable settings-audit-snapshot bij updates. De repository valideert opnieuw vóór opslag, zodat ook niet-HTTP callers geen ongeldige settings of audit-snapshots kunnen persisteren. De dashboardpagina heeft loading-, save-, error- en successtates. Migratie `0032_crm_tenant_settings.sql` is lokaal op development en test toegepast; settings-, RLS- en volledige database-regressietests zijn groen.
- Publieke lead-intake (Slice CRM-2c backend): `POST /v1/public/leads` gebruikt uitsluitend een opaque website-key en een bounded `Idempotency-Key`. De server resolveert de actieve website en tenant, valideert naam/e-mail/bericht/consents, dedupliceert contacten transactioneel, rate-limiteert per website-minuut, schrijft lead + pending outbox-event + idempotency-record atomair en retourneert geen tenant- of leaddetails. Public RLS bindt de write exact aan actieve tenant, website, contact-e-mail, vaste bron en privacyconsent; Platform Admin en andere tenants krijgen geen toegang. De forward-only migratie `0041_public_lead_rls_boundary_hardening.sql` sluit bovendien publieke tenant-/website-mutaties, rate-limitresets en cross-website interne records uit. De migratieketen `0033`–`0041`, role-bootstrap en database-regressietests moeten nog lokaal worden uitgevoerd; de demo-site gebruikt voorlopig bewust een unavailable adapter totdat de website-key/API-configuratie is ingericht.
- Lead lifecycle/statusmutaties (Slice CRM-2d backend + dashboard): `PATCH /v1/leads/:leadId/status` gebruikt uitsluitend de auth-context, de geselecteerde tenant en het bestaande `crm:update`-permissioncontract. De dashboard-BFF gebruikt alleen de HttpOnly-sessie, dwingt same-origin mutaties af en forwardt geen browser-Authorization of tenantcontext. De statuscontracten zijn `new`, `qualified`, `appointment_scheduled`, `proposal`, `won` en `lost`; de backend en frontend staan alleen de expliciete voorwaartse pipeline toe (`new` → `qualified` → `appointment_scheduled` → `proposal` → `won`/`lost`) en terminale statussen kunnen niet opnieuw worden gewijzigd. `next_action` blijft nullable en wordt in deze slice alleen als `null` gelezen/teruggegeven; taak- en follow-up-CRUD valt buiten scope. Elke geldige mutatie schrijft transactioneel een immutable, tenantgebonden `status_changed`-event naar `lead_lifecycle_audit_events`, met composite foreign keys en `ENABLE`/`FORCE RLS`. De klantomgeving heeft daarnaast `/pipeline` als live read-only Kanban over deze zes statussen, met dezelfde tenantgebonden lead-readroute, filters, detaillinks en expliciete fout-/lege states. Deals, drag-and-drop, pipelineconfiguratie en taken blijven open. Migratie `0042_lead_lifecycle_status_audit.sql` is toegevoegd maar niet uitgevoerd. API-unit-/route-tests (335), dashboardtests (275), typecheck, lint en builds zijn groen; de database-test en lokale migratie/role-bootstrap zijn bewust open. De visuele smoke-check bevestigde desktop en mobiel voor de unauthenticated/loading boundary; een geauthenticeerde tenantbrowser was niet beschikbaar. De vraag of een lead vóór `proposal` expliciet naar `lost` mag, of later uit `lost` kan worden heropend, blijft een productbeslissing.
- CRM-deals backend foundation: `deals` is een kleine tenantgebonden opportunity-kern met één bestaand contact, optionele actieve owner-membership, EUR-bedrag, bestaande lifecycle-stage, verwachte sluitdatum, optionele verliesreden en `active`/`archived`-metadata. `GET/POST/PATCH /v1/deals` en `POST /v1/deals/:dealId/archive` gebruiken het bestaande `crm:read`, `crm:create`, `crm:update` en `crm:archive`-contract. Composite foreign keys, een owner-validatietrigger, niet-negatieve EUR-check, loss-reason-check en `ENABLE/FORCE RLS` bewaken de invarianten. Stagewijzigingen volgen dezelfde voorwaartse matrix als leads, zijn transactioneel en schrijven immutable `deal_lifecycle_audit_events`; directe creatie als `won`/`lost` is bewust geweigerd. Migratie `0043_crm_deals_foundation.sql` en de lokale role-bootstrap zijn nog niet uitgevoerd.
- CRM-deals frontend beheer: `/pipeline` heeft naast de lead-Kanban een afzonderlijke live deal-Kanban via de dashboard-BFF. De BFF parseert responses strikt, gebruikt uitsluitend de HttpOnly-sessie, dwingt same-origin JSON-mutaties af en forwardt geen browser-Authorization of tenantcontext. Nieuwe deals gebruiken een live actieve contactselectie; het formulier valideert EUR-bedragen, datums en de voorwaartse stagekeuzes. `/pipeline/[id]` ondersteunt server-confirmed bewerken en soft-archiveren; `won`/`lost` kunnen niet worden heropend en ownerkeuze wordt niet aangeboden zolang veilige live teamdata niet functioneel nodig is. Loading-, empty-, unauthorized-, forbidden-, not-found-, conflict-, validatie- en unavailable-states zijn afgedekt. Dashboardtests (290), lint, typecheck, production build, `git diff --check` en desktop-/mobiele unauthenticated/loading screenshots zijn groen. Een ingelogde tenantbrowser met echte deals/contacts is niet beschikbaar voor visuele controle. Lokale migratie/role-bootstrap/database-gates en de API/db-slice blijven buiten deze frontend-slice.
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

De laatste gepushte technische commit is `af6b219`. Daarin zijn de Platform Admin-klantenlijst, het klantdetail, het audit-dashboard, de MFA/AAL-handhaving, tenant lifecycle, owner-uitnodigingen, de live CRM-leads read slice, de access-token contracttest, de read-only production database verifier en de CRM-foundation plus organizations/contacts API, BFF en CRUD-frontend opgenomen. Ook CRM-2a (teamrollen, persistente CRM-permissies, teambeheer-BFF en frontend) is gepusht en lokaal gecontroleerd.

## Belangrijk onderscheid: twee intakeflows

### Publieke lead-intake

Een bezoeker dient via een klantwebsite een aanvraag in. De backendfundering staat; de volgende vervolgstappen blijven apart:

- demo-site koppelen met een per-website publieke sleutel en API-configuratie;
- outbox-worker en externe verwerking/opvolging;
- aanvullende anti-spammaatregelen zoals abuse-signalen en eventueel CAPTCHA;
- dashboardweergave en verdere leadopvolging.

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

PostgreSQL-RLS is lokaal gebouwd en gecontroleerd voor alle tenantgebonden tabellen. De implementatie gebruikt `FORCE ROW LEVEL SECURITY`, transactionele requestcontext en een tokengebonden identity-only invitation-flow; de cross-tenant regressietests zijn groen. De RLS-migraties `0022` t/m `0025`, de CRM-permissiemigratie `0031` en CRM-settingsmigratie `0032` zijn op de lokale ontwikkel- en testdatabase toegepast; de rol-bootstrap voor die lokale databases is uitgevoerd. Production database-rollen, deploymentprocedure, productie-MFA/AAL-provideracceptatie en de migraties `0033`–`0043` blijven releasegates. Het afgesproken PostgreSQL-rollenmodel is: `ce_migrator` voor migraties en read-only verificatie, `ce_api_runtime` voor de API met `NOSUPERUSER`/`NOBYPASSRLS` en zonder ownership, `ce_bff_runtime` voor uitsluitend `bff_sessions`, `ce_maintenance` voor afzonderlijk gecontroleerd onderhoud en een aparte no-login schema-/table-owner, bij voorkeur `ce_owner` als dat technisch passend is. De bewaartermijn voor reviewnotities is nog niet besloten. De voortgang van slices en besluiten staat in `docs/PROJECT-CHECKLIST.md`.

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

### Statuscorrectie na CRM- en database-hardening

De documentatie hieronder bevat historische slice-notities. De actuele status is dat migraties `0033` t/m `0045`, de lokale role-bootstrap en de volledige API-, dashboard- en databasesuites groen zijn op development en test. De transactionele CRM-relatie-aanmaak is geïmplementeerd; de geauthenticeerde browser-smoke-check met echte tenantdata blijft apart open. De publieke lead-intake gebruikt lokaal de volledige RLS- en idempotency-hardening, maar de demo-sitekoppeling, outbox-worker en verdere abuse-hardening zijn nog open.

- CRM-vervolg: taken, follow-ups, afspraken, drag-and-drop/pipelineconfiguratie en verdere leadopvolging.
- Productie: PostgreSQL-productierollen, deployment, backups/restore, monitoring, VPS-isolatie en productie-MFA/AAL-validatie.

- De volledige volgorde voor onboarding, review en productiehandoff staat in [`docs/ONBOARDING-REVIEW-ROADMAP.md`](ONBOARDING-REVIEW-ROADMAP.md); Gate 0 is bevestigd en `blocked`/`unblocked` plus `approved`/O-5 zijn lokaal geaccepteerd.
- Gate 0 is bevestigd en documentair gesloten in `docs/reviewworkflow-foundation-decision.md`; `reopened` en de Owner-weergave van reopen-feedback zijn lokaal geaccepteerd.
- Productie-MFA/AAL-handhaving.
- Production database-rollen/deployment voor PostgreSQL-RLS en tenantveilige samengestelde relaties.
- Reviewworkflow: bewaartermijn van reviewnotities, technische operatorautorisatie, MFA/AAL en RLS (O-2, O-3, O-5, O-7 t/m O-10 in `docs/reviewworkflow-foundation-decision.md`), daarna de Project Brief-goedkeuring.
- Veilige uploads, scanning en private opslag.
- Drag-and-drop/pipelineconfiguratie, taken en verdere leadopvolging blijven open; de lead- en deal-Kanban plus create/update/archive-dealbeheer zijn gebouwd, maar de lokale migratie-/role-bootstrap/databasegates voor de backend zijn nog open.
- Publieke lead-intake: lokale uitvoering en verificatie van migraties `0033`–`0041` op development en test, daarna demo-site-koppeling, outbox-worker en verdere abuse-hardening. De huidige slice bevat de publieke RLS-boundary hardening en transactionele opslag; een worker, IP-/abuse-signalen, CAPTCHA en retention-cleanup blijven aparte gates. De lead-privacygrens voor Platform Admin is met CRM-0b afgedekt; organizations/contacts, team permissions, CRM-settings en publieke ingest gebruiken dezelfde RLS-standaard.
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
