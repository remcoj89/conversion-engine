# Westend Digital Conversion Engine
## Fase 3 — Integrale UX-review & Designsystem | v0.9

**Datum:** 17 oktober 2026  
**Status:** ter finale productreview — nog niet Fase 3 v1.0  
**Productbasis:** Fase 2 Requirements & Scope v1.0; klantomgeving v0.4; Westend-beheeromgeving v0.2; Project Brief Review v0.3; onboardingoptimalisatie v1.1.  
**Doel:** een consistent UX-contract vastleggen vóór Fase 4 (technische architectuur).

> **Kernprincipe:** de ondernemer ziet wat hij vandaag moet doen en wat zijn website oplevert. Westend ziet welke klanten, projecten, websites en systemen aandacht nodig hebben. AI en analytics helpen bij besluitvorming; ze doen geen onbeheerde publicaties of doen geen verzonnen claims.

---

# 1. Samenvatting en besluitstatus

De vier onboardingvragenlijsten zijn akkoord; de **geoptimaliseerde v1.1-flow ná commerciële conversie** is bevestigd. Q1–Q4 behouden 123 datavelden, maar de UX toont 39 directe strategische kernvragen; overige data komt uit geverifieerde prefill, conditionele vragen, optionele verdieping, afleiding of prelaunch-controles. Vier inhoudelijke modules blijven intact.

| Domein | Bestaand besluit | UX-baseline v0.9 |
|---|---|---|
| Product | Standaardwebsite €999 + Conversion Engine €249/maand, maatwerk apart | Eén platform; maatwerk kan dezelfde Conversion Engine optioneel gebruiken |
| Klant | Owner en Team Member | Actiegerichte schermen; server-side autorisatie vereist |
| Teamfinanciën | Owner kiest zichtbaarheid | Schakelaar `toon toegewezen dealwaarde`, standaard uit; nooit algemene omzet of ontvangsten voor team |
| Onboarding | Q1–Q4 | Start **na** overeenkomst/betalingsafhandeling; autosave, herkomst, gefaseerde vragen |
| Productie | Interne AI-pipeline | Alleen Westend geeft strategie en publicatie vrij |
| Data | GA4, Search Console, Clarity, DataForSEO, CRM | Bron/meetperiode/freshness/dekking zichtbaar; ontbrekend is niet nul |
| AI-advies | Maandrapport met kansen | Conceptadvies, menselijke review, klant vraagt uitvoering aan; geen automatische wijzigingen |
| Monitoring | Playwright 30m + 3-daags | Frontendstatus en volledige ketenstatus afzonderlijk; veilige testinzendingen |
| Support | Supportmail + formulier | Centrale inbox; géén ticketproduct binnen MVP |

**Let op:** de tabellen en wireframes vormen nog **geen production-ready componenten of harde privacy-/API-toezeggingen**. De stijlvoorstellen in hoofdstuk 7 en drie UX-keuzes in hoofdstuk 9 vragen een laatste review.

---

# 2. Definitieve conceptuele informatiearchitectuur

## 2.1 Klantomgeving

| Hoofdmenu | Doel van het scherm | Toegang |
|---|---|---|
| **Vandaag** | Nieuwe leads, opvolgacties, komende afspraken; kerncijfers secundair | Owner / Team (alleen eigen werk) |
| **Leads & contacten** | Inkomende aanvraag, bron, historie, AI-reactie, overname | Owner / Team (toegewezen) |
| **Pipeline** | Deals, fase, verantwoordelijke, gewonnen/verloren | Owner / Team (toegewezen) |
| **Taken & afspraken** | Eigen opvolging en geverifieerde afspraken | Owner / Team (toegewezen) |
| **Websiteprestaties** | GA4, GSC, Clarity, SEO-kansen, AI-zichtbaarheid | Owner; Team niet standaard |
| **Resultaten** | CRM-conversies, contractwaarde, betalingen, maandrapport | Owner |
| **Instellingen** | Bedrijfsgegevens, boekingslink, teamrechten | Owner |
| **Hulp & wijzigingen** | Supportverzoek, websitewijziging, extern supportadres | Owner / Team |

De navigatie is **rolafhankelijk**. Het feit dat een menu is verborgen geeft géén autorisatie; API's controleren tenant, rol en recordtoewijzing. Een medewerker kan — als Owner toestemming geeft — de waarde van **eigen toegewezen deals** zien, maar geen organisatiebrede financiële rapporten en geen betalingen.

## 2.2 Westend-beheeromgeving

Navigatie in **vijf logische groepen**, zodat het beheer niet uitgroeit tot een lange, ongeordende menulijst:

1. **Operations:** prioriteiten, incidenten, geblokkeerde projecten, gemiste checks en AI-status.
2. **Klanten & projecten:** tenant-/abonnementstatus, intake, Project Brief Review, productievoortgang, vrijgaven.
3. **Websites & kwaliteit:** websites, formulieren, leadmagnet, Playwright, technische releasecheck.
4. **Intelligence & integraties:** prestaties per klant, GA4/GSC/Clarity/DataForSEO, AI-zichtbaarheid, rapportreview, syncstatus en kosten.
5. **Configuratie:** branchetemplates, gecontroleerde componenten, AI-/automation-regels, beperkte platforminstellingen.

Support blijft een **duidelijke ingang naar de centrale inbox**, niet een nieuw ticketmenu met fictieve ticketstatussen.

**Globale klantcontext:** wanneer Westend klant X kiest, blijft die selectie zichtbaar bij Project Brief, Website Intelligence, Monitoring en Integraties. Een klantwissel vereist een zichtbare contextwissel, geen stille vermenging van gegevens. Toegang tot individuele klantinhoud is doelgebonden en gelogd.

---

# 3. Integrale gebruikersreis, stap voor stap

| Fase | Primair actor | Actie / scherm | Succes en uitzondering |
|---|---|---|---|
| 1. **Sales** | Westend | Outbound → voorstel → overeenkomst en externe facturatie | Geen uitgebreide onboarding vóór opdracht |
| 2. **Provisioning** | Westend | Klant aanmaken, pakket/status, Owner uitnodigen | Geen dubbele tenant; geen betaling in SaaS verwerken |
| 3. **Strategische intake** | Owner | Q1–Q4, autosave, prefill, optionele verdieping | 39 kernvragen als voorgestelde basis; relevante ontbrekende input zichtbaar |
| 4. **Project Brief** | Westend | Bronnen, aannames, rechten, bewijs en meerwerk beoordelen | Gerichte aanvulvraag mogelijk; geen AI-verzonnen feiten |
| 5. **Strategievrijgave (Gate A)** | Westend | Brief/strategie/scope/CTA/leadmagnet beoordelen | Pas productie starten na expliciete vrijgave |
| 6. **Productie** | Westend/AI | Sitemap → copy → design tokens → library → staging | Agentresultaten intern; goedgekeurde componenten eerst |
| 7. **Prelaunch + Gate B** | Owner + Westend | Contentakkoord, rechten, privacy, redirects, formulierketen en QA | Klant geeft inhoudelijk akkoord; Westend autoriseert release |
| 8. **Live & opvolging** | Bezoeker + Owner | Formulier → duurzame leadopslag → AI eerste reply → agenda → deal | Geldige leads blijven bewaard; menselijke fallback |
| 9. **Monitoring** | Westend | 30m frontendcontrole en 3-daagse end-to-endtest | Separaat technisch bewijs, tests onderdrukken AI en commerciële flows |
| 10. **Maandelijkse verbetering** | Westend + Owner | Brondata → signalen → adviesconcept → review → rapport | Aanbeveling is geen automatische publicatie; meerwerk na offerte |

## 3.1 Goedkeuringen uniform benoemen

De Review Studio toont een **intakecontrole** en twee formele productie-gates. Om verwarring te voorkomen gebruiken we **niet drie afzonderlijke verplichte akkoordmomenten**:

- **Intakecontrole:** volledigheid, auteursrechten, bewijs en meerwerk; dit is een reviewstatus binnen Gate A, geen derde formele klantgoedkeuring.
- **Gate A — Strategie & Scope:** expliciete Westend-vrijgave na goedgekeurde Project Brief en strategie.
- **Gate B — Publicatie:** klantakkoord op feitelijke inhoud én Westend-technische vrijgave na QA; dit autoriseert pas de daaropvolgende releaseactie.

Bij materiële wijzigingen aan intake, strategie, prijs, beeldrechten of CTA worden afhankelijke goedkeuringen ongeldig of opnieuw ter gerichte review aangeboden. Wat precies `materieel` is, wordt in Fase 4 uitgewerkt met versies en afhankelijkheden.

---

# 4. UX-regels die alle modules delen

**Rechten:** rolkeuze in prototypes is uitsluitend een demo; productie gebruikt server-side RBAC + tenantisolatie + toewijzingen. `deal_value_visibility_for_team` is standaard false. Teamleden zien nooit ontvangsten, MRR op organisatieniveau of een tenantbrede omzetwidget.

**Status & taal:** precies onderscheid tussen `concept`, `ingediend`, `aanvulling nodig`, `goedgekeurd`, `geblokkeerd`, `in behandeling`, `klaar voor controle` en `live`. Geen technisch jargon zoals `webhook_unknown` in klantmeldingen; technische codes alleen in beheerdetail.

**Datakwaliteit:** een getal krijgt een bron, datum/rapportperiode en betekenis. `niet verbonden`, `nog geen data`, `tijdelijk niet beschikbaar`, `verouderd` en `daadwerkelijk 0` zijn **vijf verschillende toestanden**.

**Acties:** elke mutatie kent een expliciete bestemming, voorspelbare feedback, foutafhandeling en auditspoor. Risicovolle acties (AI pauzeren, deal gewonnen, betalingscorrectie, website publiceren) vragen gerichte bevestiging wanneer passend.

**Mobiel:** per scherm één primaire actie; kaarten in plaats van gecomprimeerde brede tabellen; pipeline als verticale fasen; menu als drawer; geen horizontale pagina-overflow op 320px, 390px of 768px.

**Toegankelijkheid:** toetsenbordbediening, zichtbare focus, contrast, semantische labels en foutuitleg naast velden. Kleur is nooit de enige statusindicator. Grafieken hebben tekstalternatieven en gegevensweergave.

**Privacy:** Clarity-opnames uitsluitend via geautoriseerde deep-links binnen Clarity, met toegangs- en toestemmingsvoorwaarden. Demografie uit GA4 is geaggregeerd en soms beperkt; koppel die **niet** aan individuele sessieopnames. Bedrijfsherkenning van anonieme bezoekers is geen MVP-belofte.

---

# 5. Heldere scheiding: CRM-resultaten, webprestaties en AI-zichtbaarheid

| Begrip | Betrouwbare bron | Mag niet worden verward met |
|---|---|---|
| Nieuwe lead, taak, deal, ontvangst | Conversion CRM | GA4-conversie-event of geschatte omzet |
| Bezoekers, sessies, events, verkeerskanaal | GA4 | Aantal echte leadaanvragen in CRM |
| Zoekopdrachten, klikken, CTR, positie | Search Console | Totale marktvraag of exact aantal klanten |
| Scroll/rage/dead clicks, opnamelinks | Microsoft Clarity | Bewijs voor motief of identiteit van bezoeker |
| Zoekvolume, concurrentie, SERP, AI-vermeldingssample | DataForSEO | Werkelijk bezoek of universele LLM-zichtbaarheid |
| AI Assistant-referrals | GA4 voor zover gedetecteerd | Alle GEO-vermeldingen; Google AI Overviews vallen vaak binnen Organic Search |

**Klantinterface:** Websiteprestaties toont gedrags- en vindbaarheidsdata; Resultaten toont CRM-omzet en salesfunnel. Het overzicht toont compacte samenvattingen zonder dubbeltelling.

**Westend-interface:** Website Intelligence is een tenantgericht analysewerkblad. Filters: klant, datum, kanaal, device, locatie en bron — alleen wanneer daadwerkelijk door de connector geleverd. GA4-demografie (leeftijd/gender) alleen geaggregeerd, bij onvoldoende dekking `niet beschikbaar`. Clarity-opnames openen via oorspronkelijke beveiligde omgeving. B2B-bedrijfsherkenning blijft P2 en vraagt afzonderlijke leveranciers- en privacybeoordeling.

**Maandadvies:** detecteer signalen → stel hypotheses → onderbouw met bron/verificatie → prioriteer → **Westend-review** → toon aanbeveling met actie `Wijziging aanvragen`. Geen automatisch artikel, metatitel of code publiceren in het Basisabonnement. Kosten DataForSEO per tenant zijn intern zichtbaar; querybudget en caching voorkomen onverwachte kosten.

---

# 6. Ontbrekende, foutieve en bijzondere schermtoestanden

| Gebeurtenis | Klant ziet | Westend ziet |
|---|---|---|
| Nieuwe klant, geen leads | 'Je website is klaar voor aanvragen' + uitleg volgende stap; geen nepcijfers | Contract, onboarding-/live-/formulierstatus |
| AI-eerste reply faalt | 'Aanvraag ontvangen, handmatige opvolging nodig' + taak | Providerfout, correlation ID, kill switch en herstelpad |
| GA4 niet gekoppeld | 'Nog geen meetgegevens gekoppeld' | Koppeling nodig, juiste client/toegang, syncstatus |
| GSC vertraagd | Laatste update + 'gegevens lopen achter' | Databron-freshness, retry en foutreden |
| Clarity heeft geen sessies | 'Geen opnames beschikbaar in deze periode' | Verzameling/consent/status; geen nepopnames |
| DataForSEO-budget bereikt | Advies op eerdere data, met meetdatum | Budgetmelding, optioneel pauzeerbare marktqueries |
| Onvolledige strategische intake | Gerichte vraag, concept blijft bewaard | Missing-field-wachtrij, geen Gate A |
| Nieuwe branding of fotoshoot gevraagd | 'Offerte volgt' zonder automatische opdracht | Meerwerkstatus/goedkeuring, geen inzet vóór akkoord |
| Formulier UI gezond, backend stuk | Korte melding met handelingsadvies, niet 'alles werkt' | Frontend groen; volledige ketentest rood of onbekend |
| Geen toestemming voor analyse | Geen niet-toegestane analytics | Consent-status, uitgesloten tracking en datadekking |

---

# 7. Designsystem v0.9 — te beoordelen visuele richting

**Richting vastgesteld:** premium, rustige SaaS-uitstraling: lichte achtergrond, duidelijke hiërarchie, luchtige cards, sterke typografie, compacte bruikbare tabellen en professionele grafieken. **De concrete hexwaarden hieronder zijn een nieuw voorstel**, geen reeds vastgesteld merkdesign.

| Token | Conceptwaarde | Toepassing |
|---|---|---|
| `--surface-page` | `#F6F8FC` | Rustige paginabasis |
| `--surface-card` | `#FFFFFF` | Cards en dialogen |
| `--text-primary` | `#142033` | Headings, kerncijfers |
| `--text-muted` | `#64748B` | Labels, metadata |
| `--brand-primary` | `#234CD5` | Primaire CTA, selectie, focus |
| `--brand-soft` | `#EAF0FF` | Zachte selectieachtergrond |
| `--border` | `#E4E9F1` | Zachte scheiding |
| `--success` | `#087F5B` | Geslaagd, *met* statuslabel |
| `--warning` | `#A36506` | Nader controleren |
| `--danger` | `#B42332` | Incident/actie mislukt |
| `--radius-card` | `16px` | Moderne maar zakelijke cards |
| `--radius-control` | `10px` | Inputs, knoppen |
| `--space-unit` | `8px` | Ritmische spacing (8/16/24/32) |
| `--content-max` | `1440px` | Inhoudsbreedte desktop |

**Typografie:** voorlopig `Inter` of vergelijkbare goed leesbare sans-serif voor UI; niet automatisch de marketingwebsites hun merkfont opleggen. Heading 24–32px; body 14–16px; label 12–13px; cijfers met tabular numerals. Gebruik maximaal één prominente primary CTA per formuliercontext.

**Bibliotheek van dashboard-UI-componenten:** App Shell, Sidebar, Topbar, Breadcrumbs, Tenant Switcher, KPI Card, Status Indicator, Action Queue Item, Filter Bar, Data Table, Mobile Record Card, Timeline, Tabs, Stepper, Form Field, File Upload, Evidence Tag, Approval Gate, Confirm Dialog, Empty State, Error State, Chart Shell en Source/Freshness Label. Elk component heeft focus-, loading-, empty- en errorvarianten waar relevant.

**Responsieve richtlijn (concept):** mobiel <768px (drawer + één kolom); tablet 768–1199px (compactere navigatie/twee cards); desktop ≥1200px (vaste sidebar, drie of vier kaarten indien ruimte). Definitieve breakpoints na wireframevalidatie en toegankelijkheidstest; geen harde frameworkspecificatie.

**Website-component library ≠ dashboard component library.** De bestaande Westend-bibliotheek voor klantwebsites blijft de basis van AI-websiteproductie. De hier beschreven UI-kit geldt voor het Conversion Engine-dashboard. Ze mogen gedeelde tokens/patronen hebben, maar niet automatisch dezelfde componentcode.

---

# 8. Releasegerichte UX-acceptatie (cross-module)

| ID | Testscenario | Verwacht bewijs |
|---|---|---|
| UX-X01 | Prospect ontvangt offerte maar nog geen overeenkomst | Geen onboardingverplichting of account-intake-email |
| UX-X02 | Owner start intake op telefoon, hervat op laptop | Concept inclusief versies hervatbaar; echte server-opslag pas na bevestiging |
| UX-X03 | 39 kernvragen volledig, niet relevante aanvullende velden leeg | Intake kan voor Gate A worden aangeboden; relevante blokkades zichtbaar |
| UX-X04 | Onbewezen resultaatclaim | Niet automatisch in copy of livewebsite; reviewstatus getoond |
| UX-X05 | Strategie gewijzigd na goedkeuring | Afhankelijke goedkeuring gericht herbeoordeeld |
| UX-X06 | Teamledenwaarde-instelling uit | Toegewezen dealwaarde afgeschermd in UI én API |
| UX-X07 | Teamledenwaarde-instelling aan | Alleen eigen toegewezen dealwaarde zichtbaar; geen MRR/ontvangsten |
| UX-X08 | AI-antwoorden per tenant gepauzeerd | Leadopslag loopt door; menselijke opvolging en status zichtbaar |
| UX-X09 | 30m Playwright frontendcheck | Geen echte backendinzending of klantbericht |
| UX-X10 | Volledige ketentest | Testauthenticatie server-side; geen AI/automatische commerciële communicatie |
| UX-X11 | GA4/GSC ontbreekt of veroudert | Geen fictieve 0, bron-/freshnessstatus zichtbaar |
| UX-X12 | Geaggregeerd leeftijd/gender ontbreekt | Geen demografische schatting en nooit toewijzen aan Clarity-sessie |
| UX-X13 | Klant opent Clarity-opname | Alleen geautoriseerde deep-link; geen niet-ondersteunde embedded player beloofd |
| UX-X14 | AI-vermeldingensample bekeken | Platform/taal/land/datum en beperkte meetdekking zichtbaar |
| UX-X15 | Maandadvies gegenereerd | Bron, hypothese, onzekerheid, reviewbeslissing en mogelijke wijzigingsaanvraag zichtbaar |
| UX-X16 | Extra fotografie aangevraagd | Geen automatische opdracht; eerst scope/prijsakkoord |
| UX-X17 | Kleine schermbreedte (320/390px) | Hoofdacties bereikbaar, geen viewportbrede horizontale overflow |
| UX-X18 | Lege/foute/gepauzeerde datastaat | Heldere betekenis en handelingsoptie voor betreffende rol |

---

# 9. Laatste beslispunten voor finale v1.0

| ID | Ontwerpkeuze | Advies | Besluitstatus |
|---|---|---|---|
| D-01 | **Hoeveel formele gates?** | Alleen Gate A (strategie/scope) en Gate B (publicatie); intakecontrole is onderdeel van Gate A | Voorstel — bevestigen |
| D-02 | **Welke dashboardstijl?** | Premium licht SaaS-systeem volgens hoofdstuk 7; kleurwaarden als eerste voorstel, nog fine-tunen | Stijl akkoord, tokens ter review |
| D-03 | **Wat zien Team Members bij websiteprestaties?** | Voor MVP geen Websiteprestaties of organisatiebrede Resultaten; alleen toegewezen werk en optioneel dealwaarde | Voorstel — bevestigen |

De overige hoofdkeuzes zijn al bevestigd tijdens Fase 2–3 en worden niet opnieuw opengebroken. Finetuning van microcopy, componentvarianten en grafiekdetails kan na deze besluiten worden uitgevoerd zonder de productscope te wijzigen.

---

# 10. Handover naar Fase 4

Wanneer D-01 t/m D-03 zijn goedgekeurd, maken we **Fase 3 UX/UI & User Flows v1.0** als vastgestelde baseline. Fase 4 bepaalt pas daarna: auth/tenant-isolatie, database, statusmodellen, eventverwerking en idempotentie, connectoren, AI-agentorkestratie, Playwright-runner, CMS, deployment, caching, kostenquota en privacy/securitymaatregelen.

**Handover-artefacten:** de Fase 2 productbaseline; beide dashboardprototypeversies; Q1–Q4 schemas; onboarding v1.1 mapping; Project Brief Review; UX-v0.9 consolidatie; cross-module acceptatietests; concreet designsystem. Belangrijke architectuurregel: een demo-interactie of getoonde permissie is nooit een vervanging voor productieautorisatie.

**Aanbevolen vervolgstap:** keur de drie design-/interactievoorstellen uit hoofdstuk 9 goed of geef een gerichte wijziging. Pas dan noemen we Fase 3 definitief afgerond.
