# Roadmap onboarding en review

**Laatst bijgewerkt:** 29 oktober 2026
**Projectfase:** Fase 5 — technische implementatie met kleine verticale slices

Dit document beschrijft de volgorde waarin de onboarding, reviewworkflow en productiehandoff worden afgebouwd. Het is een roadmap, geen vrijbrief voor één grote implementatieopdracht. Iedere ontwikkelstap blijft een afzonderlijke verticale slice met eigen acceptatiecriteria, onafhankelijke review en kwaliteitsgate.

## Huidige uitgangspositie

De kern van de klant-onboarding is lokaal gebouwd en gecontroleerd:

- Q1–Q4 met 123 schema-velden, validatie en Project Brief-generatie;
- tenantgebonden, versieerbare conceptopslag;
- indienen van `draft` naar `submitted`;
- reviewerfundament en `submitted` naar `review_needed`;
- review request met reden en notitie in een aparte tabel;
- Owner-opslag in `review_needed`;
- opnieuw indienen van `review_needed` naar `submitted`;
- `submitted` naar `blocked` en `blocked` naar `review_needed`, met aparte reviewactie-opslag;
- `submitted` naar `approved`, waarbij een goedgekeurd project het huidige project blijft;
- onveranderlijke audit-events voor `submitted`, `review_requested`, `resubmitted`, `blocked`, `unblocked` en `reopened`;
- het `approved`-audit-event;
- `approved` naar `review_needed` via een gecontroleerde reopen;
- dashboardondersteuning voor `review_needed`;
- Owner-weergave van reopen-feedback;
- Owner-weergave van unblock-feedback;
- aparte dashboardlabels voor `blocked` en `approved`;
- gecontroleerde reviewer-provisioning voor aanmaken en heractiveren van tenantgebonden assignments;
- reparatie van de autosave-submit-race.

De laatste reviewer-provisioning-slice, Slice 2.1b, Slice 2.2/2.3 en de bijgewerkte statusdocumentatie zijn lokaal geaccepteerd maar nog niet gecommit of gepusht. Migraties `0012` t/m `0017` zijn alleen op de lokale testdatabase toegepast. Zie `docs/PROJECT-CONTEXT.md` en `docs/PROJECT-CHECKLIST.md` voor de actuele Git- en databasepositie.

De expliciete productprioriteit heeft daarnaast een afzonderlijke Platform Admin-track toegevoegd. De live read-only klantenlijst (Slice 1), het live klantdetail en het live audit-dashboard zijn lokaal gebouwd en gecontroleerd; deze track blijft gescheiden van de klantweergave. Beheeracties zijn nog niet gebouwd.

## Planningsregels

1. Claude krijgt steeds één kleine verticale slice.
2. Productbesluiten worden vastgelegd vóór code die ervan afhankelijk is.
3. Geen package-installatie zonder voorafgaande toestemming.
4. Geen echte klantgegevens; tests gebruiken synthetische data.
5. API, database, BFF en dashboard worden per slice samen gecontroleerd wanneer ze geraakt worden.
6. UI-slices vereisen desktop- en mobiele screenshots.
7. Claude commit of pusht nooit zelfstandig.
8. Codex voert de kwaliteitschecks en senior-review onafhankelijk opnieuw uit.
9. Na acceptatie worden README en checklist bijgewerkt.

## Roadmap in gates

### Gate 0 — productbesluiten vastleggen — bevestigd

**Doel:** voorkomen dat status- en reviewerfunctionaliteit op impliciete aannames wordt gebouwd.

De volledige uitwerking staat in `docs/reviewworkflow-foundation-decision.md`. De bevestigde MVP-besluiten zijn:

- `approved` is niet bewerkbaar en opent niet automatisch een nieuw lopend project;
- `blocked` kan alleen door Westend worden opgeheven via `blocked → review_needed`;
- `approved → review_needed` is een gecontroleerde reopen met reden;
- review requests zijn zichtbaar voor de Owner, maar revieweridentiteit en interne auditinformatie niet;
- reviewnotities blijven in de tenantgebonden review-request-tabel; bewaren tijdens de projectlevensduur plus 24 maanden, waarna de vrije tekst wordt verwijderd of geanonimiseerd; privacy/legal bevestigt dit vóór productie;
- reviewerinzage in antwoorden en Project Brief wordt altijd gelogd als immutable access-event zonder klantinhoud in het log;
- `approved` is de intakecontrole binnen Gate A, niet automatisch de formele productie-gate;
- MFA/AAL en RLS zijn releasevoorwaarden vóór gevoelige productiefunctionaliteit live gaat.

**Resultaat:** een bevestigde besluitnotitie zonder nieuwe code. Gate 0 is gesloten; de technische uitwerking blijft verdeeld over kleine slices.

### Gate 1 — klantgerichte reviewlus sluiten

#### Slice 1.1 — reviewnotitie zichtbaar voor Owner — afgerond

De Owner ziet bij `review_needed` de actuele reden en notitie van de reviewer. De data is tenant- en projectgebonden en verdwijnt uit de klantweergave zodra de onboarding opnieuw is ingediend.

#### Slice 1.2 — status `blocked` en `unblocked` — afgerond

Een toegewezen reviewer kan een onboarding transactioneel blokkeren en later terugzetten naar `review_needed`. Beide acties hebben een eigen audit-event, een aparte tenantgebonden reviewactie met verplichte reden en notitie, en volledige concurrency-/autorisatiecontrole. De gekozen reden-codes zijn `critical_basis_missing`, `rights_not_cleared` en `requires_extra_work` voor blokkeren, en `basis_provided`, `rights_cleared` en `extra_work_agreed` voor opheffen.

#### Slice 1.3 — status `approved` en O-5 — afgerond

Een toegewezen reviewer kan de actuele `submitted`-versie goedkeuren. De status en het `approved`-audit-event worden transactioneel opgeslagen. Een goedgekeurd project blijft het huidige project: de Owner kan het lezen maar niet wijzigen en er ontstaat geen tweede project via de normale applicatieflow.

#### Slice 1.4 — status `reopened` — afgerond

Een toegewezen reviewer kan een `approved`-onboarding gecontroleerd heropenen naar `review_needed`, met verplichte reden, reviewactie en audit-event. De goedgekeurde versie blijft ongewijzigd en de bestaande Owner-aanvul- en resubmissionflow wordt hergebruikt. Migratie `0016` voegt de `reopened`-ondersteuning toe.

#### Slice 1.5 — Owner-weergave van reopen-feedback — afgerond

De Owner ziet bij `review_needed` de actieve feedback van het huidige project wanneer die afkomstig is van een wijzigingsverzoek of een reopen. De weergave bevat alleen feedbacktype, reden, notitie, beoordeelde versie en datum/tijd. De feedback is tenant- en projectgebonden en verdwijnt na resubmission. Desktop en mobiel zijn visueel gecontroleerd.

#### Slice 1.6 — Owner-weergave van unblock-feedback — afgerond

De Owner ziet bij `review_needed` ook de reden en notitie van de laatste `unblocked`-actie, met dezelfde privacy-, tenant- en projectregels als de bestaande reviewfeedback. De actieve feedbackselectie ondersteunt wijzigingsverzoeken, reopen en unblock deterministisch; de response bevat geen interne gegevens.

#### Slice 1.7 — dashboardlabels voor `blocked` en `approved` — afgerond

De Owner ziet bij `blocked` en `approved` een duidelijke statusmelding in plaats van de generieke tekst `Ingediend`. De bestaande server-side read-onlyregels blijven leidend. De vragen en Project Brief blijven zichtbaar maar niet-bewerkbaar; onbekende statussen vallen fail-closed terug naar de ingediende weergave. Desktop en mobiel zijn visueel gecontroleerd.

**Gate 1 is klaar wanneer:** de volledige klantgerichte reviewlus werkt:

```text
draft → submitted → review_needed → submitted → approved
                         │                       │
                         └→ blocked → review_needed
                                                 │
                                      approved → review_needed
```

Alle ongeautoriseerde, stale-version, tenant- en ongeldige overgangspaden zijn getest.

### Gate 2 — reviewer operations

#### Slice 2.1a — reviewer-provisioning: aanmaken en heractiveren — afgerond

De gecontroleerde server-side CLI `provision:reviewer` maakt een assignment aan of heractiveert een revoked assignment. De bestaande samengestelde primary key wordt hergebruikt, actieve assignments blijven ongewijzigd en `created_at` blijft bij heractivatie behouden. De CLI vereist expliciete bevestiging en weigert productie. O-2 en O-3 blijven leidend; dit is geen Platform Admin-UI en geen technische MFA/AAL-handhaving.

#### Slice 2.1b — reviewerbeheer: revoke/deactivatie — afgerond

De gecontroleerde server-side CLI `revoke:reviewer` valideert de actieve tenant, reviewer, operator en bestaande assignment, zet `status = revoked` en `revoked_at` transactioneel vast en is idempotent voor reeds revoked assignments. De bestaande reviewscope sluit revoked reviewers direct uit. Er is geen migratie, onboarding-audit-event, klant-Owner-endpoint of algemene UI toegevoegd. Technische operatorautorisatie blijft een aparte release-hardening-slice.

#### Slice 2.2 — reviewerinzage in antwoorden en Project Brief — afgerond

Een toegewezen reviewer kan alleen de actuele reviewbare onboarding van de eigen tenant lezen via `GET /v1/review/onboarding/content`. De scope bevat antwoorden en Project Brief, maar geen klantcredentials, sessies of gegevens van andere tenants. De autorisatie wordt opnieuw binnen de repository-transactie gecontroleerd; drafts, revoked assignments, self-review en cross-tenant combinaties worden geweigerd.

#### Slice 2.3 — inzage-logging — afgerond

Iedere succesvolle reviewerinzage wordt in dezelfde transactie vastgelegd in `onboarding_review_access_events` (migratie `0017`) met tenant, reviewer, project, versie, doel, actie, request/correlation-ID en tijdstip. Logs bevatten geen klantinhoud. Tenantveilige foreign keys, rollback bij een logfout en een database-trigger tegen `UPDATE` en `DELETE` borgen de herleidbaarheid.

#### Slice 2.4 — audit-dashboard — afgerond

Een geautoriseerde Westend-gebruiker kan status, versie, actor en tijdlijn van onboarding-events bekijken. De live Platform Admin-feed combineert statusovergangen en inhoudsvrije reviewerinzage, met tenant-, eventtype-, tijd- en cursorfilters. Vrije reviewnotities en klantinhoud worden niet getoond.

**Gate 2 is klaar wanneer:** reviewers hun toegewezen werk kunnen uitvoeren en iedere gevoelige inzage herleidbaar is.

### Gate 3 — security release gate

#### Slice 3.1 — MFA/AAL-handhaving — afgerond

De API handhaaft MFA/AAL server-side voor klantrollen, reviewers en Platform Admin. Alleen cryptografisch geverifieerde JWT-claims met `acr = aal2`, expliciete `amr = mfa` of `ce_aal = aal2` geven sterke assurance; ontbrekende, malformed of te lage assurance geeft `403 insufficient_assurance`. `/health` blijft publiek. De lokale tests dekken ontbrekende, onvoldoende en geldige assurance-context in alle beschermde scopes. De echte ZITADEL-login is gecontroleerd met de lokale-only diagnosecontrole: het access-token bevat `ce_aal = aal2`. De diagnose-instelling is daarna uitgeschakeld.

#### Slice 3.2 — PostgreSQL-RLS — lokaal afgerond

RLS is tenantveilig ingevoerd voor de relevante tabellen met `ENABLE` plus `FORCE ROW LEVEL SECURITY`. De API zet per request en transactie de scope, subject, tenant en eventuele invitation-tokenhash; customer, reviewer, Platform Admin en identity-only acceptance hebben gescheiden policies. Cross-tenant reads/writes, ontbrekende context, standalone pooled queries, reviewer-leadtoegang en invitation acceptance zijn regressietestgedekt. Applicatielaagchecks blijven bestaan als tweede verdedigingslaag. Production database-rollen, deployment hardening en een echte productie-migratie blijven open.

**Gate 3 is klaar wanneer:** cross-tenant toegang, onvoldoende authenticatie en directe databasepaden aantoonbaar worden geblokkeerd.

### Gate 4 — betrouwbare klantinput

#### Slice 4.1 — veilige uploads

De metadata-only uploadvelden worden vervangen of uitgebreid met private object storage, type-/groottecontrole, malware/scanning, tenantgebonden download en veilige verwijder-/bewaarregels. Geen publieke object-URLs en geen vertrouwen in client-MIME-types.

**Gate 4 is klaar wanneer:** assets veilig kunnen worden ontvangen, gecontroleerd, teruggevonden en verwijderd zonder tenantvermenging.

### Gate 5 — onboarding naar websiteproductie

#### Slice 5.1 — Project Brief en provenance als productie-input

De goedgekeurde Project Brief, bronherkomst en verificatiestatus worden als versioned productie-input beschikbaar gemaakt. Onbevestigde research, claims en assets worden expliciet gemarkeerd als `needs_review`.

#### Slice 5.2 — Demo Design Baseline en Design Change Set

Process A kan de bestaande demo-pagina vastleggen als versioned design-baseline. Process B gebruikt zonder demo een goedgekeurde branchetemplate of designreferentie. Per onderdeel wordt vastgelegd wat behouden, gewijzigd, verwijderd of gecontroleerd moet worden.

#### Slice 5.3 — Production Prompt Package

De Conversion Engine genereert een tenantgebonden, versioned en herleidbaar promptpakket met projectbrief-, baseline- en change-setversies, taakinputs, prioriteitsregels en `preserve`/`change`/`remove`/`needs_review`.

#### Slice 5.4 — overdracht naar geïsoleerd klantproject

Een goedgekeurd pakket wordt veilig overgedragen naar een geïsoleerd klantproject. Dat project bevat eigen code, content, assets, tests, screenshots en deploymentflow. De Conversion Engine blijft control plane; de promptgenerator publiceert niet zelfstandig.

#### Slice 5.5 — Gate A, staging, QA, klantakkoord en Gate B

De productieflow krijgt expliciete vrijgaven vóór productie en publicatie. Rollback, versieherkomst en tenantisolatie worden aantoonbaar getest met minimaal twee synthetische klantprojecten.

**Gate 5 is klaar wanneer:** onboardinginformatie gecontroleerd en herleidbaar kan worden omgezet naar een websiteproductie-inputpakket, zonder automatische publicatie of contextvermenging.

## Definitie van gereedheid

### Onboarding-MVP

De onboarding-MVP is gereed na Gate 1: een klant kan invullen, indienen, reviewfeedback ontvangen, aanvullen, opnieuw indienen en door Westend worden goedgekeurd of geblokkeerd.

### Review- en operations-ready

De workflow is operations-ready na Gate 2 en Gate 3: reviewers kunnen veilig werken, inzage is gelogd en authenticatie/tenantisolatie zijn releasewaardig.

### Websiteproductie-MVP

De websiteproductie-MVP is gereed na Gate 4 en Gate 5: betrouwbare klantinput, provenance, promptpakket, geïsoleerde uitvoering en expliciete publicatiegates zijn aanwezig.

## Volgende concrete slice

De volgende securitystap is production database-role/deployment hardening met de read-only verifier en het RLS-runbook. MFA/AAL, inclusief het echte ZITADEL access-token-claimcontract (`ce_aal = aal2`), is lokaal end-to-end geaccepteerd. PostgreSQL-RLS is lokaal gebouwd en getest; productieacceptatie blijft open. Daarna volgt Gate 4.1 veilige uploads. Productiehandoff en overige Gate 5-slices blijven apart gepland.
