# Conversion Engine — projectchecklist

**Laatst bijgewerkt:** 28 oktober 2026

Centrale lijst met de status van de lopende slices en besluiten. Details staan in `README.md`, `docs/PROJECT-CONTEXT.md` en de genoemde besluitdocumenten.

De volgorde en afhankelijkheden van de resterende onboarding-, review- en productiehand-off-slices staan in [`docs/ONBOARDING-REVIEW-ROADMAP.md`](ONBOARDING-REVIEW-ROADMAP.md).

Legenda: `[x]` afgerond · `[~]` gebouwd, wacht op controle of acceptatie · `[ ]` open

## Onboarding audit-events

- [x] **Audit-event-slice:** `onboarding_audit_events` met eventtype `submitted`, geschreven in dezelfde transactie als officieel indienen (migratie `0007`). Onafhankelijk gecontroleerd.
- [x] **Reparaties audit-events:** de actor moet een membership in dezelfde tenant hebben, en `from_status` is bij `submitted` alleen `NULL` of `draft` (migratie `0008`). Onafhankelijk gecontroleerd.

## Reviewworkflow

- [x] **Ontwerpnotitie:** `docs/reviewworkflow-foundation-decision.md` (27 oktober 2026). Alleen ontwerp, geen code.
- [x] **Gate 0 productbesluiten:** statusovergangen, gedrag na `approved`, reviewnotities, inzage-logging en Gate A/B zijn bevestigd en vastgelegd in `docs/reviewworkflow-foundation-decision.md`; de technische implementatie blijft verdeeld over afzonderlijke slices.
- [x] **Autorisatiebesluit:** richting B (reviewer-toewijzing per tenant, los van memberships), zelfreview verboden, klantrollen blijven `owner` en `team_member`.
- [x] **Productbesluiten O-2 en O-3:** gecontroleerd server-side provisioningscript, aparte ZITADEL-organisatie voor Westend en MFA/AAL als releasevoorwaarde; provisioning en revoke/deactivatie zijn gebouwd, technische release-hardening blijft open.
- [x] **Productbesluiten O-5, O-7, O-8, O-9 en O-10:** `approved` is niet-bewerkbaar, alleen reviewers heffen `blocked` op of heropenen, reviewnotities blijven tenantgebonden met projectduur + 24 maanden als voorstel, reviewerinzage wordt gelogd en `approved` is geen automatische publicatie; implementatie blijft open.
- [x] **Reviewer foundation:** tabel `onboarding_reviewer_assignments` (migratie `0009`), `findActiveReviewerAssignments`, een aparte `/v1/review`-scope met `ReviewerContext` en de zelfreviewcontrole, en `GET /v1/review/onboarding` met alleen metadata. Alle API- en databasetests groen.
- [x] **Reviewer-provisioning (eerste O-2-beheerslice):** de server-side CLI `provision:reviewer` maakt een assignment aan of heractiveert een revoked assignment transactioneel, blijft idempotent voor actieve assignments, behoudt `created_at` bij heractivatie, vereist expliciete bevestiging en weigert productie. API-lint, typecheck, build, 146 API-tests, 117 databasetests en `git diff --check` groen.
- [x] **Wijzigingen aanvragen (`submitted` → `review_needed`):** `onboarding_review_requests` met reden en notitie, een aparte member- en reviewer-actor in audit-events (precies één per event), het `review_requested`-event en `POST /v1/review/onboarding/request-changes`, alles in één transactie (migratie `0010`). Alle kwaliteitschecks groen.
- [x] **Reparatie review requests:** de repository controleert opnieuw de actieve toewijzing en zelfreview binnen de transactie (`FOR SHARE`, vóór de projectlock), en `version` in review requests en audit-events heeft een FK naar `onboarding_versions(project_id, version)` (migratie `0011`). Alle kwaliteitschecks groen.
- [x] **Concept opslaan in `review_needed`:** de Owner kan een nieuwe onveranderlijke versie opslaan; de status blijft `review_needed`, stale `base_version` geeft conflict en conceptopslag maakt geen audit-event. API- en databasetests groen.
- [x] **Dashboardondersteuning voor `review_needed`:** de status blijft in de clientstate behouden, de Owner kan antwoorden wijzigen en automatisch opslaan via de bestaande BFF/PUT-flow, `submitted` blijft alleen-lezen en resubmission doet geen POST. Dashboardtests, lint, typecheck, build en desktop-/mobiele screenshotcontrole groen.
- [x] **Opnieuw indienen vanuit `review_needed`:** de Owner kan na aanvullingen opnieuw indienen; de API valideert opnieuw, maakt een nieuwe versie, zet de status op `submitted` en schrijft transactioneel een `resubmitted`-audit-event (migratie `0012`). API- en databasetests, lint, typecheck, build en `git diff --check` groen.
- [x] **Reparatie `review_requested`-constraint:** `from_status = NULL` wordt door de database geweigerd; de geldige overgang `submitted` → `review_needed` blijft toegestaan (migratie `0013`). Database-regression test en alle kwaliteitschecks groen.
- [x] **Reparatie autosave-submit-race:** submit wacht op de uitkomst van de lopende autosave; een PUT-conflict, blokkade, validatiefout of netwerkfout leidt tot 0 submit-POSTs. Dashboardtests, lint, typecheck, build, desktop-/mobiele screenshotcontrole en de synthetische browsercontrole groen.
- [x] **Reviewnotitie voor de Owner:** bij `review_needed` toont de onboarding de reden, notitie, beoordeelde versie en datum van het laatste verzoek van het huidige project; andere statussen en tenants krijgen deze informatie niet. API-, database- en dashboardtests, lint, typecheck, build en desktop-/mobiele screenshotcontrole groen.
- [x] **Blokkeren en opheffen (`submitted` → `blocked` → `review_needed`):** een toegewezen reviewer kan beide overgangen transactioneel uitvoeren via `POST /v1/review/onboarding/block` en `/unblock`. Reden en notitie staan in de tenantgebonden tabel `onboarding_review_actions`; de aparte reden-codes worden ook door de database afgedwongen. Audit-events `blocked` en `unblocked` zijn immutable en null-veilig gevalideerd (migratie `0014`). API-lint, typecheck, build, 121 API-tests, 96 databasetests en `git diff --check` groen.
- [x] **Goedkeuren (`submitted` → `approved`) en Gate 0 O-5:** een toegewezen reviewer kan de actuele versie goedkeuren via `POST /v1/review/onboarding/approve`. Het immutable `approved`-audit-event wordt transactioneel opgeslagen. Een goedgekeurd project blijft het huidige project; de Owner kan lezen maar niet wijzigen en kan via de applicatie geen tweede project starten (migratie `0015`). API-lint, typecheck, build, 126 API-tests, 103 databasetests en `git diff --check` groen.
- [x] **Heropenen (`approved` → `review_needed`):** een toegewezen reviewer kan een goedgekeurde onboarding transactioneel heropenen via `POST /v1/review/onboarding/reopen`, met eigen reden-codes, reviewactie en immutable `reopened`-audit-event (migratie `0016`). De goedgekeurde versie blijft ongewijzigd en de Owner kan via de bestaande flow aanvullen en opnieuw indienen.
- [x] **Owner-weergave na reopen:** bij `review_needed` ziet de Owner de actieve reviewfeedback van het eigen project, inclusief feedbacktype, reden, notitie, beoordeelde versie en datum/tijd. Tenantisolatie, projectisolatie, resubmission en het verbergen van feedback bij andere statussen zijn getest.
- [x] **Owner-weergave na unblock:** bij `review_needed` ziet de Owner de actieve `unblocked`-feedback van het eigen project, inclusief reden, notitie, beoordeelde versie en datum/tijd. De bestaande feedback voor wijzigingsverzoeken en reopen-acties blijft werken; tenantisolatie, projectisolatie en resubmission zijn getest.
- [x] **Dashboardstatussen `blocked` en `approved`:** de Owner ziet voor beide statussen een aparte duidelijke melding en statuslabel. De vragen en Project Brief blijven zichtbaar maar alleen-lezen; onbekende statussen vallen veilig terug naar de ingediende weergave. Dashboardtests, lint, typecheck, build, API-tests, database-tests en desktop-/mobiele screenshotcontrole zijn groen.
- [ ] Retention-/anonymisatieslice voor reviewnotities uitvoeren en vóór productie privacy/legal laten bevestigen (O-8).
- [x] **Reviewer-revoke/deactivatie (Slice 2.1b):** de gecontroleerde CLI `revoke:reviewer` valideert tenant, reviewer, operator en assignment, zet actieve assignments transactioneel op `revoked` met `revoked_at`, is idempotent, bewaart bestaande assignmentvelden en laat revoked reviewers direct uit de reviewscope verdwijnen. Tests dekken onbekende/inactieve inputs, tenantisolatie, rollback en revoked access. Technische operatorautorisatie blijft vóór productie een aparte releasevoorwaarde.
- [x] **Reviewerinzage en inzage-logging (Slice 2.2 + 2.3):** `GET /v1/review/onboarding/content` geeft de actuele reviewbare antwoorden en Project Brief alleen aan de toegewezen reviewer terug. De toegang wordt binnen dezelfde transactie vastgelegd in `onboarding_review_access_events` (migratie `0017`) met tenant, reviewer, project, versie, doel, actie, request-ID en tijdstip, zonder klantinhoud. Tenantveilige FK's, rollback bij een logfout, revoked/self-review/draft/cross-tenant deny-paden en database-append-only gedrag zijn getest. API-lint, typecheck, build en API-tests zijn groen; de slice-specifieke database-tests zijn groen. De volledige databasesuite heeft nog één bekende, bestaande cleanup-failure door achtergebleven lokale testfixtures.
- [x] **Platform Admin-backend- en BFF-autorisatie:** platformrechten staan in een aparte `platform_admin_assignments`-tabel (migratie `0018`) en zijn geen tenantrol, membership of reviewerassignment. De aparte auth-scope beschermt `GET /v1/platform/context` fail-closed; revoked grants, disabled users, tenantheaders en membershipfallbacks geven geen toegang. De Next.js BFF-route `/api/admin/context` gebruikt alleen de server-side sessie en de admin-layout rendert childpagina’s pas na exacte contextvalidatie. Dashboard-lint, typecheck, build, 170 dashboardtests, API-gates, visuele desktop-/mobiele smoke-check en `git diff --check` zijn groen. Migratie `0018` is op de lokale testdatabase toegepast; de database-suite heeft 124 geslaagde tests en alleen de bekende cleanup-check met achtergebleven lokale fixtures faalt.

## Websiteproductie-architectuur

- [x] **Control-planebesluit:** de Conversion Engine beheert Project Brief, Demo Design Baseline, Design Change Set en Production Prompt Package; de website wordt voorlopig in een geïsoleerd klantproject gebouwd.
- [x] **Twee commerciële ingangen:** Process A gebruikt een bestaande demo als design-baseline; Process B start zonder demo vanuit Project Brief en een goedgekeurde template/referentie.
- [ ] Production Prompt Package en de overdracht naar het geïsoleerde klantproject implementeren.
- [ ] Geïntegreerde websitegenerator/runner pas beoordelen na meerdere bewezen pilotprojecten.

## Beveiliging (open)

- [ ] MFA/AAL server-side afdwingen voor alle rollen, ook reviewers.
- [ ] PostgreSQL-RLS.

## Databases

- [x] Migraties `0007` t/m `0017` handmatig toegepast op de lokale **test**database; de testworkflow migreert niet automatisch.
- [x] Migratie `0018` voor Platform Admin-rechten toegepast op de lokale **test**database; de testworkflow migreert niet automatisch.
- [ ] De lokale **ontwikkel**database apart migreren (`0007` t/m `0018`); alleen na expliciete opdracht.
- [ ] De **productie**database apart migreren; alleen na expliciete opdracht en na de releasegates.
