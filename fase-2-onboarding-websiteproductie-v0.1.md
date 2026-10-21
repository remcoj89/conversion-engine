# Westend Digital — Onboarding & AI Website Production

**Fase:** 2 — Requirements & Scope  
**Document:** Functionele deel-specificatie v0.1  
**Datum:** 17 oktober 2026  
**Status:** Productbesluiten vastgelegd; implementatiedetails en techstack nog open  
**Gerelateerd:** Product Discovery v0.3; Requirements & Scope v0.3; Businessplan Conversion Engine

## 1. Managementsamenvatting

Westend Digital biedt **twee afzonderlijke websiteproducten** aan: (a) het gestandaardiseerde **€999-websitepakket** met Conversion Engine en abonnement, en (b) **maatwerkwebsites** waarvoor scope, planning en prijs afzonderlijk worden geoffreerd. Beide kunnen de Conversion Engine gebruiken, maar maatwerkontwikkeling mag de gestandaardiseerde MVP-productie niet ingewikkelder maken.

Het €999-pakket vertrekt vanuit de **bestaande merkidentiteit** van de klant. Een nieuwe huisstijl, merkstrategie, logo of volledige brand guidelines zijn **geen standaardonderdeel** en worden als meerwerk geleverd door een grafisch ontwerper of via een afzonderlijk, passend AI-ondersteund traject. **Professionele fotografie** is een optionele dienst tegen meerprijs.

Websiteontwerp gebruikt de **bestaande Westend Digital-klantwebsites als interne stijl- en UX-referenties** en vooral de eigen, gecontroleerde **component library** als productiegrondslag. Deze library groeit door herbruikbare, geteste componenten toe te voegen. De klant levert vier intakevragenlijsten aan; Westend controleert het resultaat van een AI-ondersteunde productieflow. Het doel blijft **maximaal drie uur actieve websitebouw** bij een vooraf vastgelegde standaardpakket-scope; alle overige tijd wordt afzonderlijk gemeten.

## 2. Productlijnen en grenzen

| Kenmerk | €999 Website + Conversion Engine | Maatwerkwebsite |
|---|---|---|
| Aanbod | Productized website met begrensde scope | Individueel ontworpen en geoffreerd |
| Ontwerp | Eigen component library + bestaande branding | Aanpasbaar aan afgesproken klantbehoefte |
| Werkzaamheden | Vaste stappen, gestandaardiseerd | Eigen planning, reviews en oplevercriteria |
| Prijs | €999 implementatie, beoogd €249/mnd Basis | Projectprijs op offerte; abonnement apart afspreken |
| Doorlooptijd / uren | Doel: max. 3 uur actieve bouw; onboarding apart | Projectspecifiek, niet gebonden aan 3-uursdoel |
| Conversion Engine | Standaard pakketkoppeling | Optioneel of inbegrepen conform offerte |
| Scopeoverschrijding | Change request + apart akkoord | Volgens getekende maatwerkscope |

**Architectuurbesluit:** het CRM en dashboard blijven **branche- en websiteproduct-onafhankelijk**. Geen aparte CRM-codebase, rechtenstructuur of leadverwerking voor maatwerkklanten. De website mag verschillen, maar leadregistratie en rapportages gebruiken dezelfde overeengekomen integratiecontracten. Het MVP-dashboard hoeft niet te weten **hoe** een website is gebouwd; hooguit welke tenant, website, pakket en integraties actief zijn.

**Financiële afbakening:** omzet en uren voor maatwerkwebsites tellen niet automatisch mee in de bestaande €999-unit economics of de acquisitiescenario's. Deze dienstverlening krijgt later een afzonderlijke calculatie en forecast.

## 3. Onboarding: vier vragenlijsten

Het uitgangspunt is **zelfstandig invullen door de klant**, met voortgang opslaan en het kunnen uploaden van bestanden. Westend ziet ontbrekende en tegenstrijdige input en vraagt alleen gericht om aanvulling. De klant werkt in de MVP niet rechtstreeks met AI-agents.

### Q1 — Kickoff, achtergrond en bedrijfsidentiteit

**Doel:** achterhalen wat het bedrijf bijzonder maakt en welke beweringen onderbouwd zijn.  
**Vragen/velden:** bedrijf en contactpersoon; reden van oprichting; achtergrond/ervaring; relevante opleiding en certificaten; missie; waarden; persoonlijke ondernemersverhaal; onderscheidend vermogen; concrete bewijsstukken en bronnen; succesverhalen met toestemming voor publicatie.  
**Output:** `BusinessBrief` met gecontroleerde feiten, merkverhaal, bewijsbibliotheek en open vragen.

### Q2 — Doelgroep en klantreis

**Doel:** de ideale klant en diens koopproces beschrijven.  
**Vragen/velden:** primaire en secundaire doelgroep; geografische markt; concrete problemen; gewenste resultaten; triggers; bezwaren; veelgestelde vragen; termen die de doelgroep zelf gebruikt; beslisproces; bestaande succesvolle klantcases.  
**Output:** `AudienceBrief` met klantsegmenten, behoeften, bezwaren, zoekintenties en prioritaire conversieroutes.

### Q3 — Aanbod, dienst en conversiedoel

**Doel:** een controleerbaar, helder aanbod formuleren.  
**Vragen/velden:** diensten en producten; voor wie wel/niet; trajectstappen; tarieven of prijscommunicatieregels; unieke voordelen; realistische resultaten; voorwaarden; bewijs; eerste gewenste actie (boeken, aanvragen of bellen); beschikbaarheid; intakeproces.  
**Output:** `OfferBrief` met propositie, dienstenstructuur, CTA's en commerciële beperkingen.

### Q4 — Bestaande branding, assets en websitegegevens

**Doel:** merkidentiteit digitaal toepassen, zonder in het standaardpakket een nieuw merk te ontwikkelen.  
**Vragen/velden:** bestaand logo (voorkeur vector); kleuren; fonts en licenties; bestaande brand guide; goedgekeurde afbeeldingen en gebruiksrechten; huidige website; domein en technische contactpersoon; contact- en vestigingsgegevens; referentiepagina's; voorkeuren; privacy-/toestemmingsinformatie; toegestane claims; boekingslink; behoefte aan professionele fotografie of nieuwe branding.  
**Output:** `BrandAssetsBrief` met assetstatus, digitale design tokens, visuele richting, toestemming/licenties en benodigde aanvulling.

**Privacyregel:** vraag geen wachtwoorden via vragenlijsten en sla geen onnodige bijzondere persoonsgegevens of gezondheidsgegevens op. Eventuele toegang tot domein, hosting of integraties wordt via een afzonderlijk veilig proces geregeld.

## 4. Bestaande branding versus meerwerk

| Werkzaamheid | €999-pakket | Meerwerk |
|---|---|---|
| Bestaand logo, kleuren en fonts toepassen | Inbegrepen | — |
| Bestaande huisstijl analyseren en omzetten naar design tokens | Inbegrepen | — |
| Compacte technische digitale stijlconfiguratie vastleggen | Inbegrepen | — |
| Nieuwe merkstrategie, nieuwe naam of nieuwe visuele identiteit | — | Op offerte |
| Nieuw logo of complete brand guidelines ontwerpen | — | Via ontwerper of separaat AI-traject |
| Professionele fotografie / portretten / bedrijfsreportage | — | Via fotograaf, aparte offerte |
| Extra beeldbewerking, omvangrijke contentmigratie of uitzonderlijk maatwerk | — | Op offerte |

**Beslisregel branding:** als bestaande branding onvoldoende is, meldt Westend dit vóór ontwerp als blokkade of beperkt aandachtspunt. Er wordt geen nieuwe huisstijl stilzwijgend ontwikkeld binnen €999. Is aanvullende branding wenselijk, dan kiest de klant een afzonderlijke oplossing en geeft vooraf akkoord.

**Beslisregel fotografie:** voor de standaardwebsite levert de klant geschikte, rechtenvrije of gelicentieerde beelden aan. Professionele foto's worden optioneel georganiseerd via een fotograaf. De prijs, planning, selectie, auteursrechten en gebruiksrechten worden afzonderlijk vastgelegd. Bij ontbrekende beelden wordt alleen gewerkt met goedgekeurde alternatieven.

## 5. Designsystematiek: eigen component library

De **Westend Component Library** is het primaire systeem voor ontwerp én uitvoering. Bestaande klantwebsites zijn **inspiratie- en patroonreferenties**, geen bron om klantspecifieke teksten, foto's of exclusieve vormgeving klakkeloos te kopiëren.

Iedere herbruikbare component bevat minimaal:

- een stabiele ID en versie;
- functie en geschikte gebruikscontext (bijv. hero, review, CTA, dienst, FAQ);
- vaste varianten en begrensde configuratievelden voor content, media en styling;
- responsive gedrag, toegankelijkheid en performance-afspraken;
- contentcontract dat later met Sanity te vullen is;
- visuele voorbeelden en teststatus (`experimental`, `approved`, `deprecated`).

**Productieregel:** AI selecteert en configureert bij voorkeur bestaande, goedgekeurde componenten. Nieuwe componenten ontstaan alleen bij herhaald nut of betaalde specifieke scope, worden gereviewd en getest voordat ze algemeen beschikbaar worden. Niet elk nieuw klantontwerp mag de library uitbreiden met een uniek, ongetest component.

**Startertemplate:** bevat vooraf geselecteerde basissecties en de integratiepunten voor formulieren, één actieve leadmagnet, CRM-events, afspraken en monitoring. De exacte standaardpagina's, aantallen secties en revisierondes worden vóór verkoop in de pakketvoorwaarden vastgesteld; dit document verzint daarvoor geen limieten.

## 6. AI Website Production Pipeline

De workflow is **logisch in twaalf stappen verdeeld, niet verplicht in twaalf agents**. Agents delen een versiebeheerbaar `ProjectBrief`; feiten blijven van gegenereerde voorstellen gescheiden. Twee menselijke go/no-go-momenten voorkomen dat onjuiste claims of fouten automatisch live gaan.

| Stap | Werkstroom | Belangrijkste output / gate |
|---|---|---|
| 01 | Intake valideren | Compleetheidscheck, conflicten, ontbrekende input |
| 02 | Bestaande website en markt verkennen | Gecontroleerde bronlijst, kansen en beperkingen |
| 03 | Positionering & conversiestrategie | Doelgroep, kernboodschap, CTA, leadmagnet |
| 04 | Informatiearchitectuur & SEO/GEO | Sitemap, pagina-intentie, URL- en contentplan |
| 05 | Bestaande branding digitaliseren | Design tokens, fonts, assetcatalogus |
| 06 | Copywriting | Teksten per pagina, claims gekoppeld aan bron |
| 07 | UX/UI-assemblage | Sectiekeuze, wireframe, componentconfiguratie |
| 08 | Websiteproductie | Werkende stagingversie vanuit starter + library |
| 09 | Conversion Engine koppelen | Formulieren, leadmagnet, CRM, boeking, events |
| 10 | QA en acceptatie | Testverslag, visuele en functionele checks |
| 11 | Publicatie en livegang | DNS/hosting, indexeerbaarheid, meetplan, smoke tests |
| 12 | Monitoring en evaluatie | Formuliergezondheid, gebeurtenissen, maandrapport |

**Gate A (na stap 04):** Westend bevestigt strategie, sitemap, pakketgrenzen en benodigde meerwerkbesluiten.  
**Gate B (na stap 10):** Westend geeft technische vrijgave, de klant bevestigt inhoud en aanbod volgens de afgesproken correctieronde; pas daarna livegang.

**Kwaliteitsregels:** AI verzint geen testimonials, diploma's, prijzen, garanties of resultaatclaims. SEO- en GEO-aanbevelingen moeten relevant en feitelijk blijven. Waar het bewijs ontbreekt, wordt een claim als concept gemarkeerd of weggelaten. Geautomatiseerde tests vervangen geen inhoudelijke menselijke controle.

## 7. Gebruikersreis en uitzonderingen

**J-WP-01 — Standaardpakketwebsite:**
1. Klant accepteert €999-scope en externe contract-/factuurafhandeling.
2. Westend activeert de klantomgeving en onboarding.
3. Klant vult Q1–Q4 in en uploadt bestaande merkassets.
4. Systeem controleert verplichte velden; Westend vraagt ontbrekende informatie op.
5. Bij nieuwe branding of fotografie ontstaat een afzonderlijke offerte-/goedkeuringsstap.
6. Westend controleert strategie en laat AI copy, design en website samenstellen.
7. Website wordt gekoppeld aan de Conversion Engine en getest op staging.
8. Klant accordeert inhoud en aanbod; Westend controleert en publiceert.
9. Na livegang worden monitoring en gebruiksrapportage geactiveerd.

**J-WP-02 — Maatwerkwebsite:**
1. Klant vraagt een specifiek project aan.
2. Westend definieert scope, designvrijheid, prijs, planning en acceptatiecriteria op offerte.
3. Relevante intakevelden en assets kunnen worden hergebruikt; aanvullende discovery volgt volgens offerte.
4. Website volgt een afgesproken maatwerktraject, niet automatisch het 3-uurs-starterproces.
5. Indien gekozen wordt dezelfde Conversion Engine via standaardintegratie aangesloten.
6. Dashboard en CRM werken gelijk, los van het gekozen websiteproduct.

**Uitzonderingen:** ontbrekende assets → `blocked`; onvoldoende rechten/claimbewijs → eerst aanvullen; branding buiten scope → apart akkoord; mislukte formulier- of e-mailtest → geen livegang; extra nieuwe pagina of functionaliteit → change request; ongeldige domeintoegang → veilige overdracht regelen.

## 8. Business rules

| ID | Normatieve regel | Prioriteit |
|---|---|---|
| WP-01 | €999 is een begrensd standaardproduct; exacte pagina-/revisiescope wordt vooraf gecontracteerd. | P0 |
| WP-02 | Maatwerkwebsite is een afzonderlijke verkoop- en leveringsroute; geen 3-uursgarantie. | P0 |
| WP-03 | Beide websites kunnen dezelfde Conversion Engine gebruiken zonder afwijkend CRM-datamodel. | P0 |
| WP-04 | Vier intakevragenlijsten voeden één goedgekeurde, versieerbare `ProjectBrief`. | P0 |
| WP-05 | De klant kan conceptinput bewaren; verplichte gegevens worden vóór productie gecontroleerd. | P0 |
| WP-06 | Bestaande branding toepassen is standaard; nieuwe branding is betaald meerwerk. | P0 |
| WP-07 | Professionele fotografie wordt alleen na aparte offerte en akkoord uitgevoerd. | P0 |
| WP-08 | AI bouwt primair met goedgekeurde componenten; nieuwe componenten krijgen review/tests. | P0 |
| WP-09 | Alleen verifieerbare claims en toegestane mediabestanden mogen gepubliceerd worden. | P0 |
| WP-10 | Westend keurt strategie en techniek goed; de klant keurt de relevante inhoud goed. | P0 |
| WP-11 | Een website gaat niet live met falende kritieke leadflow, formulieren of CTA's. | P0 |
| WP-12 | Structurele wijzigingen buiten het abonnement worden eerst geoffreerd en goedgekeurd. | P0 |
| WP-13 | De 3-uursdoelstelling meet actieve websitebouw; intake, sales en andere uren zijn afzonderlijk zichtbaar. | P0 |
| WP-14 | In MVP beheert Westend publicatie; klant-selfservice voor copy/afbeeldingen via Sanity is later. | P0 |
| WP-15 | Referenties van klantwebsites dienen niet als toestemming voor herpublicatie van hun assets. | P0 |
| WP-16 | Backend, contentmodel en integraties zijn zo opgezet dat CMS-selfservice later mogelijk is, zonder nu een visuele editor te bouwen. | P1 |

## 9. Functionele requirements en acceptatiecriteria

| ID | Requirement | Acceptatiecriterium |
|---|---|---|
| ON-01 | Vier gestructureerde intakeformulieren, opslaan en hervatten | Testklant kan ieder onderdeel gedeeltelijk opslaan en later voltooien. |
| ON-02 | Uploads met assetmetadata en rechtenstatus | Westend ziet per asset type, eigenaar/rechtenstatus en eventueel ontbrekende licentie. |
| ON-03 | Intakevalidatie en blokkades | Onvolledige kritieke velden houden project op `blocked`; reden is zichtbaar. |
| ON-04 | Intakeversie en bronherkomst | Geautoriseerde gebruiker kan zien welke gegevens door klant zijn aangeleverd en welke AI-voorstellen zijn. |
| BD-01 | Standaard digitale brandconfiguratie | Bestaande kleuren, logo en fonts worden consistent toegepast zonder nieuwe merkcreatie. |
| BD-02 | Optionele meerwerkroute branding/fotografie | Geen activiteit start zonder aparte scope, prijs en geregistreerd akkoord. |
| CP-01 | Starterwebsite vanuit library | Website kan worden samengesteld met uitsluitend goedgekeurde, versieerbare componenten. |
| CP-02 | Reproduceerbare componentconfiguratie | Een wijziging aan content leidt niet tot een ongecontroleerde layoutwijziging. |
| AI-01 | Gestructureerde agent-handoffs | Copy, design en build lezen dezelfde goedgekeurde strategie en bronlijst. |
| QA-01 | Twee expliciete go/no-go-gates | Staging of livegang wordt geblokkeerd als vereiste goedkeuring ontbreekt. |
| QA-02 | Leadflow end-to-end testen | Testformulier/leadmagnet komt in correcte tenant en wordt uitgesloten van commerciële KPI's. |
| QA-03 | SEO, toegankelijkheid en responsiveness controleren | Controlelijst bevat metadata, canonicals, CTA's, mobiel, formulieren en performance. |
| ME-01 | Maatwerkroute zonder dashboardvertakking | CRM en dashboard werken voor standaard- én maatwerkwebsite via dezelfde websitetoewijzing. |
| ME-02 | Timing meten per werksoort | Rapport toont actieve bouwuren, onboarding, controle, revisies en support apart. |

## 10. Uitgesloten van deze MVP-deelscope

Geen volledige brand identity generator, geen volledig fotografieboekingssysteem, geen vrije pagebuilder, geen klantgerichte multi-agentinterface, geen onbeperkte designvarianten, geen zelfpublicatie via Sanity, geen AI-bloggenerator, geen AI-ticketplanning en geen uitgebreide maatwerkprojectmanagementmodule.

Bestaande n8n-bloggenerator, ticketdashboard, Sanity-selfservice en Growth Engine blijven post-MVP. **De techniek voor de definitieve CMS-integratie en overige stackkeuzes wordt pas na de functionele uitwerking gekozen.**

## 11. Afhankelijkheden en nog te specificeren

1. Contractuele pakketgrenzen: aantal pagina's/secties, inbegrepen correctieronde, migratieomvang en servicelevels.
2. Verplichte versus optionele intakevelden per branche; toegestane bestandstypen en maximale opslag.
3. Welke startercomponenten al `approved` zijn in de bestaande Westend Library; noodzakelijke gaten.
4. Waar de klant status ziet en hoe goedkeuring van de uiteindelijke content wordt vastgelegd.
5. Maatwerkofferte: welke Conversion Engine-modules en welk onderhoudsabonnement optioneel zijn.
6. Meetdefinitie voor de maximale drie uur en uitzonderingsregistratie tijdens de eerste vijf pilots.

**Vervolg:** Fase 2, vraag 6 — fair-usegrenzen voor AI, uitgaande e-mails, monitoring en opslag. Daarna UX-flows/wireframes, architectuur en stackselectie.
