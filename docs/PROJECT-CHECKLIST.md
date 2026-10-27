# Conversion Engine — projectchecklist

**Laatst bijgewerkt:** 27 oktober 2026

Centrale lijst met de status van de lopende slices en besluiten. Details staan in `README.md`, `docs/PROJECT-CONTEXT.md` en de genoemde besluitdocumenten.

Legenda: `[x]` afgerond · `[~]` gebouwd, wacht op controle of acceptatie · `[ ]` open

## Onboarding audit-events

- [x] **Audit-event-slice:** `onboarding_audit_events` met eventtype `submitted`, geschreven in dezelfde transactie als officieel indienen (migratie `0007`). Onafhankelijk gecontroleerd.
- [x] **Reparaties audit-events:** de actor moet een membership in dezelfde tenant hebben, en `from_status` is bij `submitted` alleen `NULL` of `draft` (migratie `0008`). Onafhankelijk gecontroleerd.

## Reviewworkflow

- [x] **Ontwerpnotitie:** `docs/reviewworkflow-foundation-decision.md` (27 oktober 2026). Alleen ontwerp, geen code.
- [x] **Autorisatiebesluit:** richting B (reviewer-toewijzing per tenant, los van memberships), zelfreview verboden, klantrollen blijven `owner` en `team_member`.
- [ ] Open beslissingen O-2 en O-3: wie toewijzingen beheert, en de ZITADEL-inrichting voor Westend-accounts.
- [ ] Open beslissingen O-5 t/m O-10: gedrag na `approved`, opnieuw indienen vanuit `review_needed`, uitweg uit `blocked`, reviewnotities, inzage-logging en de verhouding tot Gate A.
- [x] **Reviewer foundation:** tabel `onboarding_reviewer_assignments` (migratie `0009`), `findActiveReviewerAssignments`, een aparte `/v1/review`-scope met `ReviewerContext` en de zelfreviewcontrole, en `GET /v1/review/onboarding` met alleen metadata. Alle API- en databasetests groen.
- [x] **Wijzigingen aanvragen (`submitted` → `review_needed`):** `onboarding_review_requests` met reden en notitie, een aparte member- en reviewer-actor in audit-events (precies één per event), het `review_requested`-event en `POST /v1/review/onboarding/request-changes`, alles in één transactie (migratie `0010`). Alle kwaliteitschecks groen.
- [x] **Reparatie review requests:** de repository controleert opnieuw de actieve toewijzing en zelfreview binnen de transactie (`FOR SHARE`, vóór de projectlock), en `version` in review requests en audit-events heeft een FK naar `onboarding_versions(project_id, version)` (migratie `0011`). Alle kwaliteitschecks groen.
- [x] **Concept opslaan in `review_needed`:** de Owner kan een nieuwe onveranderlijke versie opslaan; de status blijft `review_needed`, stale `base_version` geeft conflict en conceptopslag maakt geen audit-event. API- en databasetests groen.
- [ ] `review_needed` → `submitted` (`resubmitted`), inclusief de benodigde validatie en het aparte audit-event.
- [ ] Overige reviewstatusovergangen: `blocked`, `approved`, `reopened`.
- [ ] Reviewnotities tonen aan de klant.
- [ ] Beheer van toewijzingen (endpoint, script of UI), na besluit over O-2.
- [ ] Inzage in antwoorden of Project Brief door reviewers, met logging van die inzage.

## Beveiliging (open)

- [ ] MFA/AAL server-side afdwingen voor alle rollen, ook reviewers.
- [ ] PostgreSQL-RLS.

## Databases

- [x] Migraties `0007` t/m `0011` handmatig toegepast op de lokale **test**database; de testworkflow migreert niet automatisch.
- [ ] De lokale **ontwikkel**database apart migreren (`0007` t/m `0011`); alleen na expliciete opdracht.
- [ ] De **productie**database apart migreren; alleen na expliciete opdracht en na de releasegates.
