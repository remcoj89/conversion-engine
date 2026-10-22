# Westend Digital Conversion Engine
## Fase 3 — Project Brief Review & Website Production v0.3

**Status:** klikbaar UX-prototype voor review · ter definitieve productreview  
**Datum:** 17 oktober 2026  
**Gebruikersrol:** uitsluitend Westend Platform Admin  
**Bronnen:** Product Discovery v0.3; Requirements & Scope v1.0; Q1–Q4-specificaties v1.0; geïntegreerde onboarding en Project Brief Generator v0.1  
**Niet vastgesteld:** technische stack, deployarchitectuur, echte AI-orkestratie en prijsafhandeling.

## 1. Doel en afbakening

De reviewomgeving is **een extra module in het bestaande Westend-managementdashboard**, geen afzonderlijke SaaS of klantportaal. Ze brengt ingediende Q1–Q4-vragenlijsten samen als versieerbare Project Brief en helpt Westend de websiteproductie beheerst uit te voeren. De klant vult vragenlijsten in; alleen Westend beoordeelt feiten, scope, bewijs en de strategie.

De MVP-module ondersteunt een herkenbare **human-in-the-loop workflow**: intake ontvangen → broninformatie controleren → open punten oplossen → Project Brief goedkeuren → strategie goedkeuren → copy/design → staging → QA en klantakkoord → klaar voor de daadwerkelijke livegangprocedure.

**Niet in MVP:** een AI-agentconsole voor klanten, vrij bewerkbare workflows, offerte- of betaalsysteem, automatisch publiceren, definitieve e-signatures, ticketdashboard en nieuwe huisstijlontwikkeling binnen het standaardpakket.

## 2. Plaats in de informatiearchitectuur

Het bestaande beheer-menu blijft intact: Operations, Klanten, Onboarding, Websites, Monitoring, AI & flows, Website Intelligence, Databronnen, Templates en Support. **Project Brief Review** komt direct onder **Onboarding**. Vanuit Operations en Onboarding is de reviewomgeving bereikbaar; één klant kan vanuit de wachtrij worden geopend.

### Hoofdschermen

| Scherm | Inhoud | Actie |
|---|---|---|
| Reviewoverzicht | KPI's, klantwachtrij, status en versienummer | Selecteer bedrijf |
| Project Brief | Q1–Q4, bronvelden, gecontroleerde bedrijfs-/doelgroep-/aanbod-/brandinggegevens | Bekijk bron en exporteer demo-JSON |
| Review & blokkades | Volledigheid, claims, beeldrechten, scope/meerwerk, technische gegevens | Markeer handmatige controle, vraag aanvulling, keur intake goed |
| Productie & vrijgave | Gate 1, Gate A, productiefases, Gate B / QA | Strategie, staging, QA en gereedmelding |
| Historie | Project Brief-versies, genomen besluiten en fictieve gebeurtenissen | Simuleer nieuwe wijziging, exporteer snapshot |

### UX-principes

- **Werk eerst weg wat blokkeert.** De wachtrij bevat de status per klant en intake-compleetheid.
- **Geen verborgen goedkeuring.** De UI toont expliciet waarom een actie geblokkeerd is.
- **Volledigheid is geen bewijs.** Een ingevuld veld is niet automatisch een gevalideerd diploma, review of prijs.
- **Herleidbare inhoud.** Bij de kernvelden wordt de bronvraag of het Project Brief-pad vermeld.
- **Scheiding commercieel/technisch.** Een meerwerkofferte is iets anders dan QA of toestemming voor publicatie.
- **Mobiel bruikbaar.** Wachtrij wordt verticaal; inhoud wordt in kaarten en korte blokken getoond.

## 3. Statusmodel en vrijgave

| Toestand | Voorwaarde | Vervolg |
|---|---|---|
| `intake_in_progress` | Minstens één vragenlijst ontbreekt | Ondernemer aanvullen |
| `ready_for_review` | Alle relevante Q1–Q4 ingestuurd | Controle door Westend |
| `review_needed` | Claims, rechten, prijs, scope of domein onduidelijk | Verificatie of aanvullingsvraag |
| `brief_approved` | Alle vereiste controles aantoonbaar akkoord | Strategie opstellen en reviewen |
| `strategy_approved` | Strategie-artefact akkoord, inclusief scope en leadmagnet | Copy/design & build starten |
| `staging_ready` | Websiteconcept staat klaar op staging | QA uitvoeren |
| `qa_review` | Tech- en contenttesten worden uitgevoerd | Klantakkoord en bewijs verzamelen |
| `ready_for_launch` | Klantinhoud akkoord, QA en integraties geslaagd | Afzonderlijke release-/deployprocedure |

**Gate 1 — Intake/Brief:** alle relevante vragenlijsten compleet, noodzakelijke claims onderbouwd of verwijderd, assetrechten gecontroleerd, prijs/CTA bevestigd, scope en meerwerk formeel afgebakend. Alleen Platform Admin kan vrijgeven.

**Gate A — Strategie:** na Gate 1 beoordeelt Westend positionering, sitemap, SEO/GEO-basis, hoofd-CTA, één actieve leadmagnet en productiescope. Een klik in de demo simuleert akkoord; in productie bestaat een aparte versieerbare strategie-output met reviewer-ID.

**Gate B — Oplevering:** vóór `ready_for_launch` zijn noodzakelijk: gecontroleerde copy/aanbod, geslaagde formulier- en backendketentest, correct ingestelde metingen/toestemming, toegankelijke mobiele weergave, en aantoonbaar klantakkoord. Geen van deze checks betekent dat de website automatisch wordt gepubliceerd.

**Regel versie-invalidering:** elke inhoudelijke wijziging aan een eerder goedgekeurd bronantwoord maakt de Project Brief opnieuw reviewplichtig. Afhankelijke strategie- en productie-vrijgaven worden ingetrokken of gericht herbeoordeeld. Herbruikbare goedgekeurde assetversies blijven traceerbaar, maar uitkomsten mogen niet stilzwijgend op een oude brief blijven steunen.

## 4. De Project Brief in de reviewomgeving

De UI groepeert de vier intakebronnen zonder ze te overschrijven.

| Bron | Reviewmodule | Specifieke aandacht |
|---|---|---|
| Q1 Kickoff | Bedrijf, verhaal, expertise, positionering | Geen verzonnen diploma, militair verleden of resultaten |
| Q2 Doelgroep | Ideale klant, problemen, wensen, koopbezwaren | Onderzoek versus aanname helder labelen; geen onnodige gezondheidsgegevens |
| Q3 Aanbod | Hoofdaanbod, prijzen, CTA, opvolgkwalificatie | Eén primaire propositie; klant moet prijs of prijsvorm bevestigen |
| Q4 Branding & Assets | Bestaande huisstijl, beeldmateriaal, domein, analytics | Rechten, logo, fotografie, privacy en technische toegang |

Elke weergegeven waarde hoort in productie de volgende metadata te hebben: `field_id`, `source_schema_version`, `answer_version`, `client_supplied_value`, `last_modified_at`, `verification_state`, `reviewer_id` en waar relevant een referentie naar gecontroleerd bronmateriaal. Het veld `source` bewijst **herkomst**, niet **juistheid**.

De demo biedt een download van voorbeeld-JSON om de informatiearchitectuur tastbaar te maken. Het is **geen definitief API-contract** en gebruikt uitsluitend fictieve klanten.

## 5. Meerwerk en commerciële scheiding

Binnen de standaardwebsite van €999 wordt **bestaande** branding toegepast via vaste Westend-componenten. Een nieuwe branding/brand guide, professionele fotografie, extra pagina's of ander maatwerk valt buiten die scope en vraagt afzonderlijke offerte en expliciete goedkeuring.

De reviewomgeving toont signalen voor zulke wensen. In productie wordt een beslissing vastgelegd als:

- `excluded_from_standard_scope`: uitgesloten van huidige oplevering, apart te offreren.
- `separately_approved_quote`: afzonderlijke offerte aantoonbaar goedgekeurd.
- `no_extra_scope`: geen extra traject nodig.

De reviewer mag de scopecontrole niet als 'gecontroleerd' markeren zolang een relevant meerwerkbesluit ontbreekt. Een akkoord in de klikdemo verstuurt **geen** offerte en incasseert **geen** betaling.

## 6. Integratie met het bestaande platform

**Klantomgeving:** Q1–Q4 blijven de bron van antwoorden en uploads. Een `review_needed`-status veroorzaakt later een gerichte aanvulvraag voor de ondernemer, zonder toegang te geven tot interne prompts of reviewbeslissingen.

**Westend-klantdetail:** één tenant/account; de review koppelt via `tenant_id`, `website_id`, `project_brief_id` en een expliciete versie.

**Websiteproductie:** een goedgekeurde brief en strategie vormen samen de input voor strategie/SEO/copy/design/build; de Westend Component Library is de gecontroleerde basis van secties en layouts.

**Conversion Engine:** formulieren, de gekozen leadmagnet, boekingsflow, AI-follow-up en tracking worden vóór livegang op staging gevalideerd.

**Monitoring:** na livegang worden de bekende Playwright-runs gebruikt: frontend iedere 30 minuten zonder backendverzending, volledige ketentest iedere drie dagen of indien geconfigureerd dagelijks. Synthetische tests vallen buiten AI en commerciële statistiek.

**Analytics:** GA4, Search Console, Clarity en DataForSEO worden in het beheer gekoppeld. Hun synchronisatie is geen voorwaarde om feitelijke klantgegevens in Q1–Q4 te verzinnen; bij ontbrekende koppeling verschijnt een expliciet reviewpunt of gecategoriseerde waarschuwing.

## 7. Functionele requirements

| ID | Requirement | Prioriteit |
|---|---|---|
| RV-01 | Alleen Westend Platform Admin ziet de reviewomgeving; server-side rol- en tenantcontrole | P0 |
| RV-02 | Wachtrij filtert/sorteert op reviewstatus, blokkade, project en actualiteit | P1 |
| RV-03 | Bronantwoorden Q1–Q4 tonen bronveld, schema- en versieherkomst | P0 |
| RV-04 | Geen Gate 1 zolang relevante vragen of bewijs-/rechtencontroles ontbreken | P0 |
| RV-05 | Reviewpunt kan gerichte aanvulvraag bevatten, zonder gemengd supportticketsysteem | P0 |
| RV-06 | Vraag aan klant gaat via controleerbare notificatie, zonder verloren concepttekst | P1 |
| RV-07 | Branding/fotografie/meerwerk leiden naar aparte scopebeslissing en offerteakkoord | P0 |
| RV-08 | Gate A legt expliciet een goedgekeurde strategieversie vast | P0 |
| RV-09 | Gate B vereist inhouds-, formulier-, tracking- en toegankelijkheids-QA plus klantakkoord | P0 |
| RV-10 | Nieuwe intakeversie maakt verouderde downstream goedkeuring ongeldig | P0 |
| RV-11 | Auditlog registreert actor, tenant, artefactversie, verandering, tijdstip en reden | P0 |
| RV-12 | Handmatige controles zijn niet automatisch 'geverifieerd' door AI | P0 |
| RV-13 | Export is beperkt tot geautoriseerde tenant en bevat geen secrets | P0 |
| RV-14 | Responsive op desktop, 390px en 320px zonder horizontale overflow | P1 |
| RV-15 | Klantportaal toont begrijpelijke voortgang, niet interne risk-score of agentprompts | P1 |

## 8. Acceptatiecriteria / QA

| Test | Verwacht resultaat |
|---|---|
| Onvolledige Q4 | Gate 1 blijft disabled, alleen gerichte aanvulactie beschikbaar |
| Alle Q compleet, rechten onbevestigd | Gate 1 blijft geblokkeerd |
| Meerwerk gevraagd, scopebesluit ontbreekt | Scopecontrole kan niet worden afgesloten |
| Alle intake- en verificatiecontroles afgevinkt | Gate 1 kan expliciet door Westend worden goedgekeurd |
| Gate 1 ontbreekt | Gate A blijft geblokkeerd |
| Gate A geaccordeerd | Productie kan gecontroleerd naar staging/QA |
| QA- of klantakkoord ontbreekt | Geen live-gereedmelding |
| Bronantwoord wijzigt na goedkeuring | Intrek/vernieuw de eerdere brief-, strategie- en QA-approvals |
| Actie in prototype | Geen echte e-mail, AI-uitvoering, facturatie of deployment |
| Bezoeker/Team Member benadert review API | Productie-API weigert toegang ondanks gemanipuleerde requests |
| Mobiele breedtes 390 en 320 px | Leesbare kaarten, bruikbare acties, geen documentoverflow |
| Project Brief-export | JSON bevat bronindicaties en demostatus; geen echte persoonsgegevens/secrets |

## 9. Prototype: wat is echt interactief?

Het HTML-prototype is samengevoegd met de eerdere admin-demo v0.2. De volgende acties werken lokaal **zonder serververbinding**:

- Klant uit wachtrij selecteren; Q1–Q4-bronvelden bekijken.
- Reviewcontroles markeren; openstaande blokkades houden goedkeuring tegen.
- Meerwerk als buiten scope zetten of een offerteakkoord simuleren.
- Aanvultekst vastleggen en een *fictief* verzoek simuleren.
- Brief goedkeuren, strategie vrijgeven, staging en QA simuleren.
- QA-checks en klantinhoudakkoord aanvinken; klaar-voor-live-status testen.
- Versie-invalidering simuleren, gebeurtenishistorie bekijken en voorbeeld-JSON downloaden.
- Terug navigeren naar Operations, Onboarding, Monitoring en Website Intelligence.

**Prototypebeperking:** de klikinvoer staat uitsluitend in tijdelijke JavaScript-geheugenstate. Reload zet alles terug naar fictieve beginwaarden; geen backend, database, externe communicatie of actualiteit. Browserchecks testen alleen UI-gedrag, geen serverbeveiliging.

## 10. Nog te beslissen in Fase 4/5

Dataopslag en versiecontrole (optimistic concurrency), persistent workflowmodel, bewijsdocumenten en privé-assets, auth/RBAC, notificatievoorziening, waarheidsbron en projectschema's, deploymentpipeline, AI-providerorkestratie, idempotente events en auditretentie. Een technische implementatie moet ook voorkomen dat een normale gebruiker via API-calls goedkeuringen kan manipuleren.

### Productiemetrieken tijdens de eerste vijf pilots

Meet actieve Westend-reviewtijd, aantal teruggestuurde Q1–Q4-velden, herhaalrondes, frequentie van meerwerk, outputcorrecties na AI, staging-naar-live tijd en het percentage projecten dat Gate A/Gate B in één keer doorloopt. Het interne doel van maximaal drie uur actieve standaardwebsitebouw blijft een **te toetsen operationele doelstelling**, geen garantie.

**Conclusie:** met deze module is de volledige onboarding-naar-productieflow in Fase 3 als UX te beoordelen. De volgende stap is de integrale review van klantomgeving, Westend-beheeromgeving en onboarding, vóór technische architectuur (Fase 4).
