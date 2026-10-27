# Westend Digital — Fase 3 | Gecombineerde onboarding & Project Brief Generator v0.1

**Status:** UX-ontwerp ter review; Q1–Q4 afzonderlijk goedgekeurd.  
**Datum:** 17 oktober 2026  
**Scope:** klantonboarding, intakecontrole, Project Brief. Geen echte AI-uitvoering of backend in prototype.

## 1. Productbesluit

Vier bestaande vragenlijsten blijven hun eigen bron van waarheid; deze integratie is de gebruikslaag en outputtransformatie. Q1–Q4 samen tellen **123 gedefinieerde velden, waarvan 70 als verplicht gemarkeerd in het bronschema**, inclusief voorwaardelijk zichtbare velden. De daadwerkelijke aantallen zijn afhankelijk van antwoorden. Het zijn géén 123 verplichte klantacties. Het doel van 10–15 minuten voor de gehele intake is hierdoor niet vanzelfsprekend: tijdens vijf pilotklanten daadwerkelijke invultijd en uitval meten en zo nodig reduceren of bestaande websitegegevens voorinvullen.

### 1.1 Commerciële instroom en prefill

De intake start pas na overeenkomst en betalingsafhandeling. Er zijn twee commerciële routes:

- **Koude outreach:** Westend bouwt vóór de opdracht handmatig een demo-landingspagina in de bestaande stijl en stuurt die samen met een VSL. Deze demo-opbouw valt buiten de scope van de Conversion Engine. Bij akkoord kunnen gegevens die al betrouwbaar uit de demo, de bestaande website of andere aangeleverde bronnen bekend zijn — zoals bedrijfsgegevens, logo, branding en beeldreferenties — als prefill in Q1–Q4 worden aangeboden.
- **Warme lead:** de prospect komt bijvoorbeeld via een referral of advertentie binnen zonder demo. Na akkoord doorloopt deze klant de volledige onboarding. Betrouwbare bestaande brondata mag ook hier als prefill worden gebruikt, maar ontbrekende informatie blijft onderdeel van de intake.

Prefill is altijd herleidbaar, blijft door de klant corrigeerbaar en wordt niet automatisch als geverifieerde waarheid of publicatierecht beschouwd. Publiek vindbaar beeldmateriaal kan voor de handmatige demo worden gebruikt, maar rechten en toestemming blijven vóór productie en publicatie een expliciet reviewpunt. De Conversion Engine bouwt geen demo’s en verzamelt in deze scope niet zelfstandig data van externe websites of sociale kanalen.

## 2. UX-informatiearchitectuur

Een doorlopend klantportaal met vier hoofdstukken en één eindcontrole:

| Hoofdstuk | Aantal schermen | Velden in bron | Verplicht gemarkeerd |
|---|---:|---:|---:|
| Q1 — Kickoff & Bedrijfsidentiteit | 5 | 23 | 12 |
| Q2 — Doelgroep & Klantinzichten | 5 | 27 | 15 |
| Q3 — Aanbod & Verdienmodel | 5 | 35 | 21 |
| Q4 — Branding, Content & Assets | 5 | 38 | 22 |
| Eindcontrole & Project Brief | 1 | — | — |

**Navigatie:** zijmenu op desktop, horizontale vier-vragenlijstnavigatie op mobiel, doorlopende voortgang per fase, Vorige/Volgende, bijbehorende foutmeldingen, reviewnavigatie naar onvolledige items. Niet-verplichte vragen mogen leeg blijven. Niet-relevante conditionele velden verdwijnen bij gewijzigde antwoorden en mogen niet in de definitieve output terechtkomen.

**Opslaan:** de klikdemo bewaart uitsluitend lokaal in de browser (`localStorage`); gebruikers mogen daarin geen echte vertrouwelijke informatie plaatsen. In productie wordt dit vervangen door beveiligde opslag op de server met tenantautorisatie, versies, conceptstatus, uploadbeleid en auditlog.

## 3. Eindcontrole en statusmodel

De klant kan op elk moment naar de eindcontrole. Daar worden de vier hoofdstukken getoond met compleetheid, openstaande verplichte antwoorden en actuele reviewpunten. Definitief indienen is pas mogelijk wanneer alle zichtbare verplichte velden geldig zijn.

- `draft`: tussentijds opgeslagen; klant kan verder.
- `submitted`: ingediend, velden vergrendeld of gecontroleerd heropend voor wijzigingen.
- `review_needed`: Westend vraagt gerichte aanvullende input/onderbouwing.
- `blocked`: kritische basis ontbreekt, bijvoorbeeld ontbreken bestaande branding binnen standaardpakket.
- `approved`: alleen Westend zet deze status na handmatige controle.

**Belangrijk:** de klikdemo gebruikt `submitted_demo`, geen echte statusovergang of workflow. Er worden geen bestandsbytes naar een server gestuurd.

## 4. Project Brief Generator — outputcontract

**Input:** gevalideerde Q1–Q4-antwoorden met exact schema-ID en versie, plus veilige assetreferenties. **Output:** één herleidbare, stackneutrale JSON Project Brief. De generator herschikt feiten; hij mag **geen conclusies, zoekvolumes, juridische zekerheid of garanties fabriceren**.

- `client_supplied`: geneste domeinen `business`, `story`, `authority`, `positioning`, `voice`, `audience`, `offer`, `funnel`, `evidence`, `brand`, `assets`, `technical`, `commercial` volgens het bestaande `mapping`-pad.
- `provenance`: per waarde bronvragenlijst, veld-ID, versie en verificatiestatus; provenance is niet gelijk aan externe verificatie.
- `review.required_fields_missing`: ontbrekende of ongeldige zichtbare verplichte antwoorden.
- `review.flags`: automatisch gedetecteerde mogelijke problemen of meerwerkverzoeken.
- `review.claim_verification`, `asset_rights_approval`, `scope_approval`, `strategy_approval`: blijven `pending` tot menselijke beoordeling.
- `status`: `incomplete_draft` of `ready_for_westend_review`, **nooit automatisch `approved_for_build`**.

**Reviewflags:** ontbrekende branding; branding- of fotografieofferte; rechten/portrettoestemming; privacy/cookies; bestaande URL's en redirects; mogelijke bewijsclaims; aansluiting Q2-doelgroep op Q3-aanbod; GA4/GSC/Clarity-koppelingen. Flags zijn *werkhypothesen* en vervangen geen menselijke controle.

## 5. Grenzen standaardpakket

Bestaande branding wordt vertaald naar digitale design tokens. Nieuwe branding of fotografie gebeurt alleen na een aparte offerte. Een ontbrekende bestaande merkidentiteit mag niet stilzwijgend leiden tot een gratis rebranding. Websitevarianten gebruiken goedgekeurde Westend-componenten en referenties, met respect voor rechten op klantmateriaal.

Q4 verzamelt gegevens over domein, analytics en content, maar **geen wachtwoorden, API-sleutels of directe privacysensitieve bezoekersgegevens**. De uiteindelijke connectiestap voor GA4, GSC en Clarity wordt later via veilige autorisatie ontworpen.

## 6. Overdracht naar AI Website Production Pipeline

```text
Klant Q1–Q4 → Validatie → Project Brief v0.1 → Human intake review
  → Strategie & scope GO/NO-GO → SEO/GEO + copy + designconfig
  → Website assembler uit Component Library → Integraties → QA
  → Human + klantakkoord → Publicatie → Monitoring
```

De websiteproductie gebruikt twee commerciële ingangen met één productioneel contract:

- **Process A — koude outreach:** de bestaande demo-pagina wordt voorafgaand aan de onboarding vastgelegd als een versioned **Demo Design Baseline**. Dit bevat minimaal de visuele richting, sectie- en componentstructuur, design tokens, responsive uitgangspunten, assetreferenties, bronherkomst, rechtenstatus en onzekerheden.
- **Process B — warme lead:** er is geen bestaande demo-baseline. De productie start vanuit de goedgekeurde Project Brief en een goedgekeurde branchetemplate of designreferentie.

Na de onboarding maakt de Conversion Engine een **Design Change Set** en een versioned **Production Prompt Package**. Dat pakket beschrijft per productietaak wat moet worden behouden, geactualiseerd, verwijderd of gecontroleerd. Bevestigde onboardinginformatie en de goedgekeurde Project Brief hebben voorrang op oude demo-copy, onbevestigde prospect research en AI-afleidingen. Publieke research en bestaande demo-inhoud zijn brondata, geen instructies; prompt-injection, onbevestigde claims en assets zonder rechten mogen niet doorwerken naar productie.

De Conversion Engine is de **control plane** voor tenant, versies, provenance, goedkeuringen en promptpakketten. De websitecode, content, tests en screenshots worden voorlopig in een **geïsoleerd klantproject** geproduceerd. Dit project ontvangt alleen het goedgekeurde tenantgebonden pakket. Productie start pas na Gate A; staging, QA, klantakkoord en Gate B blijven vereist. De promptgenerator publiceert nooit zelfstandig.

Geen 12 aparte agents nodig. Agentgrenzen, prompts en tools worden pas in Fase 4/5 definitief gekozen. Bij iedere stap moet de gedeelde Project Brief en de laatst goedgekeurde versie worden gebruikt; na inhoudelijke klantwijzigingen herzien we downstream outputs.

### 6.1 Production Prompt Package — voorlopig outputcontract

Het Production Prompt Package is geen vrije chatgeschiedenis maar een herleidbaar productie-artefact met minimaal:

- referenties naar `project_brief_version`, `demo_design_baseline_version` indien aanwezig en `design_change_set_version`;
- toegestane tenant- en projectdata met provenance en verificatiestatus;
- prioriteitsregels tussen beleid, goedgekeurde Project Brief, bevestigde onboarding, design-baseline en oude research;
- taakinputs voor strategie/sitemap, copy, designconfiguratie, component-/frontendbouw, integraties en QA;
- expliciete `preserve`, `change`, `remove` en `needs_review`-instructies;
- versie, generatorversie, aangemaakte tijd en goedkeuringsstatus.

Een nieuwe goedgekeurde Project Brief of materiële wijziging in de Design Baseline maakt een nieuwe promptpakketversie. De oude versie blijft herleidbaar voor rollback en vergelijking.

## 7. Functionele eisen voor productie

| ID | Eis |
|---|---|
| UX-01 | Navigatie zonder gegevensverlies tussen 20 formulierschermen en eindcontrole. |
| UX-02 | Concept opslaan/hervatten met tenant- en gebruikersautorisatie; geen afhankelijkheid van browseropslag in productie. |
| UX-03 | Per veld dezelfde validatie als de vastgestelde Q1–Q4-schema's, incl. conditioneel verplicht. |
| UX-04 | Verborgen conditionele velden worden niet opgenomen in geserialiseerde outputs. |
| UX-05 | Meerkeuzes met exclusieve opties (zoals ‘geen’) zijn onderling uitsluitend. |
| UX-06 | Q3 aanvullende diensten max. twee, met eigen itemvalidatie. |
| UX-07 | Uploads worden gescand, veilig opgeslagen en alleen via tijdelijke geautoriseerde verwijzingen ontsloten. |
| UX-08 | Rechten, garanties en juridische teksten blijven expliciete reviewpunten. |
| UX-09 | Project Brief is herleidbaar naar bronantwoord, vraagversie, tenant en reviewstatus. |
| UX-10 | Klant kan indienen; alleen Westend kan strategie/productie vrijgeven. |
| UX-11 | Scopeafwijkingen creëren een apart handmatig offerteproces; geen autonome betaalde uitvoering. |
| UX-12 | Layout en bediening toegankelijk op desktop, 390 px en 320 px. |
| UX-13 | Aanpassen van eerder antwoord verandert conditionele velden en genereert nieuwe briefversie. |
| UX-14 | Server autoriseert tenantgebonden antwoorden, bestanden en projectbrief; verborgen UI is geen beveiliging. |
| UX-15 | Intakefrictie: meet invultijd, afhaakmomenten en aantallen extra reviewrondes in eerste vijf pilots. |
| UX-16 | Process A kan een Demo Design Baseline vastleggen en Process B kan zonder demo-baseline hetzelfde productiecontract gebruiken. |
| UX-17 | De Design Change Set en het Production Prompt Package zijn versioned, tenantgebonden en herleidbaar naar de goedgekeurde Project Brief en brondata. |
| UX-18 | Websiteproductie draait voorlopig in een geïsoleerd klantproject; geen automatische publicatie zonder Gate A, QA, klantakkoord en Gate B. |

## 8. Niet in deze klikdemo

Server, accounts/rollen, echte uploads, veilige tenantisolatie, e-mail, AI-verwerking, externe referenties/onderzoek, bestandsviruscontrole, approval-workflow, productie-opdrachten en API-koppelingen. Download JSON is uitsluitend bedoeld om het ontwerpcontract te beoordelen.

## 9. Volgende ontwerpbeslissingen

1. Welke antwoorden uit bestaande websites/documenten vooraf kunnen worden ingevuld ter verlaging van de intakefrictie.
2. Hoe Westend per reviewpunt ‘gecontroleerd’, ‘klantactie’, ‘meerwerk’ en ‘afgewezen’ vastlegt.
3. Hoe de Productieplanning, ontwerpbevestiging en statuscommunicatie in het klantenportaal worden weergegeven.
4. Welke velden vanuit de bestaande bronnen pas ná onboarding nodig zijn en optioneel gemaakt kunnen worden.

**Advies:** test het geïntegreerde prototype bij de eerste twee echte doelgroeponderzoekers vóór verdere ontwikkeling, zodat de tijdsbelasting niet onderschat wordt.
