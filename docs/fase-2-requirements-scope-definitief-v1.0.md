# Westend Digital Conversion Engine

## Fase 2 — Requirements & Scope | Definitieve productspecificatie v1.0

**Documentstatus:** vastgesteld als functionele MVP-baseline  
**Datum:** 17 oktober 2026  
**Eigenaar:** Westend Digital  
**Volgende fase:** Fase 3 — informatiearchitectuur, gebruikersstromen en wireframes  
**Nog niet bepaald:** definitieve stack, hostingarchitectuur, visueel dashboarddesign en implementatieplanning.

> **Kernbelofte**  
> Eén beheerde website- en conversieoplossing voor dienstverleners: elke geldige aanvraag betrouwbaar ontvangen, kwalificeren, opvolgen en meetbaar maken — zonder dat de ondernemer technisch beheer hoeft te doen.

### Leeswijzer en geldigheid

Dit document consolideert de genomen besluiten uit Product Discovery v0.3, Requirements & Scope v0.1–v0.5 en Onboarding & AI Website Production v0.1. **Deze v1.0 is vanaf nu de leidende functionele scope**; eerdere documenten zijn historische werkversies. Nieuwe ideeën veranderen de MVP niet zonder expliciet wijzigingsbesluit.

- **P0 — noodzakelijk vóór pilot:** veilige, werkende kernketen en minimale bedrijfsvoering.
- **P1 — noodzakelijk vóór commerciële MVP-release:** afgesproken waarde, maar tijdelijk handmatig uitvoerbaar tijdens de eerste interne test.
- **P2 — na MVP:** ontwerp houdt rekening met latere toevoeging; functionaliteit wordt niet nu gebouwd.
- **MVP:** eerste betaalde release voor vijf pilotklanten. Geen belofte van gegarandeerd verkeer, klantenaantallen of omzet.

---

## 1. Productdoel, succes en afbakening

### 1.1 Doelgroepen

Commerciële validatie begint bij **personal trainers en fitnesscoaches**. De softwarekern is brancheonafhankelijk en werkt via configureerbare *industry templates* ook voor coaches, adviseurs, installateurs en andere dienstverleners. Er wordt **geen aparte codebase per branche** gebouwd.

### 1.2 Zakelijke uitgangspunten

| Onderwerp | Vastgestelde afspraak |
|---|---|
| Standaardwebsite | Eenmalige richtprijs **€999 excl. btw**, vaste scope, bestaande branding |
| Conversion Engine Basis | Richtprijs **€249 per maand excl. btw** |
| Maatwerkwebsites | Blijven als aparte productlijn, prijs en scope via offerte |
| Dashboard bij maatwerk | Dezelfde Conversion Engine kan optioneel worden afgenomen |
| Growth (€499/mnd) | Beoogde latere productlijn, **niet in deze MVP** |
| Betalingen Westend | Facturatie en betalingen buiten het platform; enkel pakket- en abonnementstatus in MVP |
| Standaardwebsitebouw | **Maximaal 3 uur actieve bouwtijd als te toetsen streefwaarde**, exclusief afzonderlijk gemeten sales/onboarding |
| Onboarding | **1,5 uur actieve inzet als streefwaarde**, klant vult zelf vier vragenlijsten in |
| Validatie | Vijf betalende klanten, betrouwbare leadketen, echt gebruik en gemeten tijd/kosten |

Voor verkoop moeten concrete pakketgrenzen (aantal pagina's/secties, toegestane revisie, wat inbegrepen is) contractueel worden vastgelegd. De bekende drie uur is een interne doelstelling, **geen ongeclausuleerde oplevergarantie**.

### 1.3 Wel in de MVP

- Eén website en één actieve leadmagnet per abonnement/klantwebsite; keuze uit **quiz, calculator of download**.
- Vierdelige onboarding, interne AI-ondersteunde websiteproductie en herbruikbare component library.
- Klant- en teamlogin, gescheiden organisaties, gestandaardiseerde CRM-pipeline en taken.
- Formulieren, duurzame leadregistratie, AI-classificatie en **maximaal één inhoudelijke AI-reactie**.
- Optionele boekingslink, bevestigde boekingswebhooks, beperkte geoorloofde opvolging.
- Omzet-/betalingsregistratie in het CRM, zonder boekhoudkoppeling.
- Twee supportkanalen naar één inbox; controle van meerwerk vóór uitvoering.
- Playwright-frontendmonitoring en periodieke end-to-end-formuliertests.
- Kern-KPI's, maandrapport en eenvoudig neutraal reviewverzoek.
- Gebruikslimieten, incidentafhandeling en meetbare operationele kosten.

### 1.4 Expliciet buiten de MVP

Sanity-selfservice voor klantcopy en afbeeldingen; visuele website/pagebuilder; eigen e-mailmarketingplatform of complexe nieuwsbrieven; MailBlue/Brevo-resellerverplichting; ticketdashboard met AI-planning; zelfstandige AI-bloggenerator voor klanten; autonome SEO/GEO/CRO; A/B-testplatform; ads/campagnebeheer; dynamische workflowbuilder; automatische boekhoudkoppeling; zelfstandige AI-salesconversaties; onbeperkte branchemaatwerkvelden; online betaling binnen dit platform.

---

## 2. Hybride beheermodel en autorisatie

### 2.1 Rollen

- **Platform Admin (Westend):** tenant activeren, abonnementstatus bijhouden, branchtemplate kiezen, website en AI/automatiseringen configureren, monitoring en incidenten beheren. Inhoudelijke klantgegevens alleen via doelgebonden, beperkte en gelogde supporttoegang.
- **Business Owner (klant):** beheert eigen contacten, leads, deals, taken, medewerkers, omzetregistratie en eenvoudige bedrijfsinstellingen, waaronder zakelijke contactgegevens en boekingslink.
- **Team Member (klant):** beheert alleen toegewezen commerciële records, afspraken en taken; geen platforminstellingen of organisatiebrede financiële rapporten.

Een aparte Support Operator-rol is P2. De klant krijgt **geen** recht om systeemprompts, deployment, technische workflowdefinities of websitestructuur te wijzigen. Na MVP kan hij binnen afgebakende Sanity-contentvelden zelfstandig copy en afbeeldingen aanpassen.

### 2.2 Rechtenmatrix

| Functionaliteit | Platform Admin | Business Owner | Team Member |
|---|---|---|---|
| Organisatie provisionen, abonnementstatus | Ja | Alleen status inzien | Nee |
| Gebruikers uitnodigen | Initieel/herstel | Ja, eigen team | Nee |
| Contacten, leads en deals | Geautoriseerde support | Ja, eigen organisatie | Alleen toegewezen |
| Klantomzet en kostenrapporten | Geautoriseerde support | Ja | Nee |
| CRM-taken | Geautoriseerde support | Alle eigen taken/deals | Toegewezen |
| Bedrijfsgegevens en boekingslink | Technische inrichting | Basisvelden wijzigen | Nee |
| AI-prompts en automation templates | Ja | Nee | Nee |
| Website aanpassen en publiceren | Ja | Alleen wijzigingsverzoek | Nee |
| Monitoring en incidentbeheer | Ja | Status bekijken | Beperkt indien relevant |
| Supportverzoek indienen | N.v.t. | Ja | Ja |

**P0-regel:** autorisatie gebeurt **server-side op tenant, rol en waar nodig recordtoewijzing**. Een verborgen UI-element is nooit een beveiligingsmaatregel. Een teamlid van organisatie A mag geen gegevens van B kunnen opvragen met handmatig gewijzigde identifiers.

---

## 3. Hoofdgebruikersreizen (end-to-end)

### J01 — Prospect wordt betalende Westend-klant

1. Westend identificeert een geschikte prospect en gebruikt een juridisch toegestaan contactkanaal.
2. Het salesaanbod toont een persoonlijk verbeterpunt, voorbeeldpagina en korte VSL.
3. Prospect heeft een intake/verkoopgesprek en ontvangt heldere standaard- of maatwerkscope.
4. Overeenkomst, factuur en betaling worden **extern** geregeld.
5. Platform Admin registreert pakket, abonnementstatus en eerste eigenaar en stuurt veilige toegang.

**Uitzonderingen:** geen interesse → geen ongewenste opvolging; niet betaald/niet gestart → `pending`, geen live automatische verzending; bestaande onderneming → controleren op dubbele tenant. **Acceptatie:** platform hoeft geen creditcard- of factuurgegevens te bewaren.

### J02 — Onboarding en oplevering website

1. Business Owner vult vier vragenlijsten in en kan tussentijds opslaan.
2. Westend controleert volledigheid, eigendom/rechten van aangeleverde assets en ontbrekende gegevens.
3. Westend kiest branchetemplate, één leadmagnettype, pipeline, boeking en communicatieconfiguratie.
4. Interne AI-ondersteunde productielijn maakt strategie, sitemap, content, designconfiguratie en stagingwebsite.
5. Westend keurt strategie/techniek goed; klant accordeert feitelijke inhoud en aanbod.
6. Website en Conversion Engine worden getest; alleen bij geslaagde checks volgt publicatie.
7. Klant krijgt een beknopte uitleg over dashboard, leads, taken en pipeline.

**Uitzonderingen:** onvoldoende gegevens → `blocked`; nieuw logo/fotoshoot of extra pagina → meerwerkofferte; onveilig of incompleet formulier → geen livegang.

### J03 — Websitebezoeker wordt lead

1. Bezoeker gebruikt standaardformulier of actieve leadmagnet.
2. Server valideert aanvraag, rate limiting, anti-spam, herkomst en eventuele toestemming.
3. Geldige inzending wordt **duurzaam opgeslagen vóór externe provider-/AI-calls**.
4. CRM koppelt aan bestaand contact binnen dezelfde tenant of maakt een nieuw contact; lead-event blijft afzonderlijk bestaan.
5. AI classificeert intentie; lage zekerheid, klachten, dringende zaken of onveilige aanvragen krijgen menselijke beoordeling.
6. Hoogstens één toegestane inhoudelijke AI-reactie wordt verzonden; waar passend met boekingslink.
7. CRM schrijft historie, verantwoordelijke, status en volgende actie weg.

**Uitzonderingen:** AI-/mailuitval → aanvraag bewaard en zichtbaar voor mens; dubbele submit → niet dubbel verzenden; testinzending → geen reguliere AI of klantopvolging.

### J04 — Afspraak, verkoop en financiële registratie

1. Bezoeker boekt bij gekoppelde provider; pas een **geverifieerde bevestiging** telt als geboekte afspraak.
2. CRM werkt de afgesproken pipelinefase en taken bij.
3. Ondernemer voert gesprek en registreert deal als gewonnen/verloren, reden en contractwaarde.
4. Ondernemer registreert ontvangen betalingen handmatig op de juiste deal.
5. Dashboard onderscheidt openstaande verkoopkansen, gewonnen contractwaarde, verwachte contractomzet en daadwerkelijk geregistreerde ontvangsten.

**Uitzonderingen:** geannuleerde afspraak → status bijwerken en passende opvolging; meerdere verkopen door hetzelfde contact → aparte deals; geen betalingsdata → onbekend, nooit fictieve ontvangst.

### J05 — Automatische opvolging en review

1. Na een succesvol verzonden eerste AI-reactie wordt een kandidaat-reminder op **48 uur** gepland.
2. Vlak voor verzending controleert het systeem of een bericht is toegestaan en of er niet al gereageerd, geboekt, opgezegd of overgenomen is.
3. Bij een positieve controle volgt **maximaal één goedgekeurde, vaste herinnering**, geen vrije tweede AI-reactie.
4. Zonder reactie maakt het systeem **48 uur na de herinnering** één CRM-taak. Wanneer herinnering niet is toegestaan of reply-detectie onbetrouwbaar is, wordt in plaats daarvan een menselijke taak aangemaakt.
5. Na een geschikte trigger (bijvoorbeeld afgeronde dienstverlening) kan een neutraal reviewverzoek volgen, zonder selectie op verwachte beoordeling.

**Uitzonderingen:** inbound provider ontbreekt → automatische reminder uit; bounces/opt-out → geen toepasselijke vervolgmails; ontvangen reply → mens neemt over.

### J06 — Monitoring, rapportage en support

1. Monitor voert periodieke Playwright-controles uit (details in §9).
2. Incidenten komen in Westends technisch overzicht met bewijs, categorie en tijdstip.
3. Owner ziet commerciële resultaten, open taken en periodiek maandrapport met data-onzekerheden.
4. Klant kan support mailen of een supportformulier indienen; beide worden via één supportinbox afgehandeld.
5. Structurele wijziging → Westend beoordeelt abonnementsscope en vraagt bij meerwerk **vooraf akkoord**.

**Uitzonderingen:** meetdata ontbreekt → rapport toont onbekend; ketentest faalt terwijl frontend goed is → verschillende statussen; niet-goedgekeurd meerwerk → niets publiceren.

---

## 4. Onboarding en AI Website Production

### 4.1 Vier vragenlijsten

| Vragenlijst | Onderwerpen | Minimale output |
|---|---|---|
| Q1 — Kickoff en bedrijfsverhaal | Naam, bedrijf, oprichter, achtergrond, expertise, ontstaan, missie, onderscheidend vermogen | Gecontroleerd bedrijfsprofiel; alleen echte claims |
| Q2 — Doelgroep | Ideale klant, context, problemen, wensen, bezwaren, beslismomenten, regio | Primaire doelgroep en commerciële klantreis |
| Q3 — Aanbod | Diensten, doelgroep per aanbod, prijzen/indicaties, traject, resultaat, bewijsmateriaal, gewenste CTA | Geprioriteerd aanbod en concrete conversiedoelen |
| Q4 — Bestaande branding/assets/techniek | Logo, kleuren, fonts, brandbook, fotografie, beeldrechten, domein, huidige website, referenties, boekingsgegevens | Digitale merkconfiguratie en uitvoerbare projectchecklist |

Alle vragenlijsten ondersteunen `draft` → `submitted` → `review_needed` → `approved`. Verplichte velden worden per branchetemplate begrensd, niet via een vrije vragenlijstbuilder in MVP.

### 4.2 Branding, fotografie en productlijnen

**In €999 inbegrepen:** bestaande branding toepassen, een **technische** digitale stijlconfiguratie maken (design tokens), klantmateriaal zorgvuldig verwerken. **Niet inbegrepen:** nieuwe merkstrategie, logo, volledige nieuwe brand guidelines of complete rebranding. Dit is betaald meerwerk, uitgevoerd door een grafisch ontwerper of AI-ondersteund onder menselijke verantwoordelijkheid. Professionele bedrijfsfotografie is eveneens een optionele betaalde dienst met duidelijke gebruiksrechten.

**Maatwerkwebsites:** afzonderlijke offerte, designvrijheid, planning en acceptatie; niet gebonden aan de 3-uurs-starterdoelstelling. Wel kunnen beide productlijnen dezelfde CRM-/monitoringmodules gebruiken.

### 4.3 AI-ondersteunde productiepipeline

De volgende **twaalf logische werkstappen zijn geen twaalf afzonderlijke AI-agents**. Eén beheerde projectbrief en begrensde tools/agents volstaan.

| Stap | Werkstroom | Vast te leggen resultaat |
|---|---|---|
| 01 | Intake valideren | Compleetheid, ontbrekende data, bronherkomst |
| 02 | Huidige site en markt analyseren | Onderzoeksnotities en verifieerbare bronnen |
| 03 | Positionering en conversiestrategie | Klantsegment, aanbod, hoofd-CTA, funnel |
| 04 | Sitemap en SEO/GEO-basis | Pagina-intenties, URL-plan, interne links |
| GATE A | Westend keurt strategie en scope goed | Go/no-go, wijzigingen of meerwerk |
| 05 | Bestaande branding digitaliseren | Logo-assets, kleuren, fonts, tokens |
| 06 | Copy schrijven | Copy per pagina, broncontrole en CTA's |
| 07 | UX/UI samenstellen | Sectiekeuze, componentconfiguratie, responsive indeling |
| 08 | Website produceren | Stagingversie vanuit starter en component library |
| 09 | Conversion Engine koppelen | Formulieren, leadmagnet, boeking, tracking |
| 10 | QA en correctieronde | Functionele, inhoudelijke en visuele tests |
| GATE B | Westend en klant keuren relevante delen goed | Technisch + inhoudelijk akkoord |
| 11 | Publiceren | Domein, redirects, indexeerbaarheid, live-smoketests |
| 12 | Monitoring activeren | Formuliertests, events, maandrapportage |

**Component library:** elk goedgekeurd onderdeel heeft ID/versie, functie, begrensde varianten, toegestane velden, responsive/toegankelijkheidscriteria en teststatus. AI gebruikt eerst bestaande, goedgekeurde componenten. Nieuwe componenten komen alleen na review in de library. Referenties uit bestaande Westend-websites zijn voorbeelden, geen herpublicatierecht voor klantteksten of foto's.

**Kwaliteit:** geen AI-verzonnen klantreviews, diploma's, prijzen, garanties of resultaten. Staging en livegang vereisen expliciete menselijke vrijgave. Sanity is de **gewenste latere contentbeheerroute**, niet een nu definitief gekozen technische stack of klantinterface.

---

## 5. Leadmagnet Engine: drie templates, één actieve instantie

### 5.1 Gemeenschappelijke logica

Westend kiest tijdens onboarding `quiz`, `calculator` of `download`. De gekozen variant deelt dezelfde identificatie, bronregistratie, toestemmingsvelden, CRM-routering, tracking en versiebeheer. In de MVP is per klantwebsite precies **maximaal één actieve leadmagnet**. Er is geen visuele builder en geen vrije door klant te bewerken formule-/scoretaal.

### 5.2 Varianten

| Variant | Bezoekersflow | Bijzondere regels |
|---|---|---|
| Quiz/assessment | Start → 3–7 vragen → uitslag → vrijwillige vervolgaanvraag | Antwoorden en uitslag via gecontroleerde, reproduceerbare regels; geen gevoelige gezondheidsgegevens verzamelen |
| Calculator | Invoer → validatie → deterministische berekening → resultaat → optionele aanvraag | Formuleversie en input-/outputeenheden registreren; geen vrij uitvoerbare code/formules |
| Download/gids | Intro → e-mailadres en afleververzoek → ontvangstbevestiging → gids veilig leveren | Levering en eventuele nieuwsbriefopt-in gescheiden; bestand en versie zijn traceerbaar |

**Waarde vóór leadgate:** quiz en calculator mogen een nuttige uitslag tonen voordat e-mail verplicht wordt; voor een e-maildownload mag een adres noodzakelijk zijn om te kunnen leveren. Een quizdeelname of gidsdownload is niet automatisch een verkoopsignaal.

### 5.3 Gedeelde minimale velden

- `tenant_id`, `website_id`, `leadmagnet_id`, `type`, `version`, `status`.
- Publieke inhoud: titel, intro, CTA, bevestiging, privacyverwijzing.
- Config: vragen + antwoordopties / invoervelden + gecontroleerde berekening / bestandsreferentie + afleveringstemplate.
- Lead:event-ID, contactgegevens indien aangeleverd, bron en UTM's (waar bekend), consent-per-doel, timestamp en taal.
- Resultaat: `outcome_key`, relevante scores/uitkomst zonder onnodige persoonsgegevens; bronversie.
- Tracking: `started`, `completed`, `lead_submitted`, `delivered`, `appointment_booked` waar geverifieerd.

Alle uitvoer is tenantgebonden. Gepubliceerde versies zijn in de historie terug te vinden; publicatie van een nieuwe versie verandert oudere uitslagen niet.

---

## 6. Conversion CRM en omzet

### 6.1 Conceptueel domeinmodel

- **Contact:** persoon, kan meerdere aanvragen en deals hebben.
- **Lead:** individuele inkomende interesse/aanvraag met intentie, bron, tijdstip en status.
- **Deal:** verkoopkans met eigenaar, pipelinefase, waarde en uitkomst.
- **Task:** opvolgactie met eigenaar, uiterste datum, status en relatie met lead/deal.
- **Appointment:** bevestigde of geannuleerde afspraak met providerreferentie.
- **Activity:** immutabele logische gebeurtenis (bericht, boeking, statuswijziging, actie).
- **RevenueEvent:** met datum en herkomst geregistreerde financiële verandering, incl. correcties en terugbetalingen.
- **ConsentRecord:** doel, status, tijdstip, herkomst en intrekking.

**P0 CRM-functies:** contacten zoeken/filteren, status en relevante historie zien, lead→deal koppelen, taken maken en afwerken, toegewezen werkitems, won/lost en reden, eenvoudige pijplijn per branchetemplate. Geen volledige pipelinebuilder.

### 6.2 Omzet: deal, contract en betaling strikt scheiden

| Begrip | Betekenis | Voorbeeld personal training |
|---|---|---|
| Dealwaarde | Potentiële verkoopwaarde | €900 voorstel |
| Gewonnen contractwaarde | Bevestigde waarde van gesloten deal | €150 x 6 maanden = €900 |
| Contractuele MRR | Verwachte terugkerende maandwaarde zolang contract actief is | €150/mnd |
| Ontvangen betalingen | Alleen handmatig bevestigde daadwerkelijke ontvangsten | €150 ontvangen |
| Resterende contractwaarde | Nog niet als betaling geregistreerde contractwaarde, **geen factuurschuld** | €750 |

De eigenaar bevestigt het winnen van een deal én elke betaling. Terugbetalingen/correcties worden als afzonderlijke gebeurtenissen vastgelegd. Twee identieke imports/acties mogen niet tot dubbele betaling leiden. Financiële widgets markeren ontbrekende invoer als **onbekend**; het systeem doet geen boekhoudkundige juistheidsclaims.

### 6.3 Minimaal dashboard

KPI's: nieuwe leads, lead→afspraak, afspraak→klant, leads per bron, pipelinewaarde, gewonnen deals/contractwaarde, handmatig geregistreerde ontvangsten, open taken, technische formulierstatus. **CPL/CAC en LTV alleen tonen wanneer onderliggende kosten en klantwaarde voldoende betrouwbaar beschikbaar zijn**, met duidelijke definitie en bron. Conversies rekenen met hetzelfde tijdvenster en bijbehorende cohortdefinitie.

---

## 7. AI-kwalificatie en hybride follow-up

### 7.1 AI-beschikbaarheid

- Intentieschema omvat: koopintentie, offerteaanvraag, informatievraag, klacht, sales-outreach, spam, urgent/onduidelijk.
- Per tenant: goedgekeurde bedrijfskennis, diensten, openingstijden, contactgegevens en toegestane boekingslink.
- Output is gestructureerd en schema-gevalideerd; bij onzekere classificatie, misbruik of model-timeout → menselijke taak.
- **Maximaal één inhoudelijke AI-reactie per leadconversatie**. Het systeem onderhandelt niet, verzint geen prijs/afspraak of stuurt geen autonoom vervolggesprek.
- Inhoud van een klantbericht heeft nooit instructiebevoegdheid over de agentconfiguratie. Uitgaand verzenden is een aparte gecontroleerde stap.

### 7.2 Reminderregime

1. Pas na een **succesvol verzonden** eerste AI-reactie ontstaat een kandidaat-reminder voor +48 uur, verschoven naar het ingestelde lokale verzendvenster.
2. Direct voor verzending worden consent/doel, toegestane template, actuele leadstatus, inbound reply, boeking, human handover, bounce en opt-out opnieuw gecheckt.
3. Maximaal één **vaste, vooraf goedgekeurde** herinnering als de communicatie rechtmatig en nodig is.
4. 48 uur na die herinnering zonder reactie volgt één taak voor menselijke opvolging.
5. Is een automatische herinnering niet toegestaan, of kan inkomende e-mailreactie niet betrouwbaar worden waargenomen? Dan **geen automatische herinnering**, maar een taak bij het controlepunt.
6. Bij reply, afspraak, klacht, deal gewonnen/verloren, menselijke overname of bezwaar stopt de geplande flow.

**Juridische grens:** een inhoudelijke reactie op een ingediende aanvraag is niet gelijk aan toestemming voor commerciële nieuwsbrieven. Marketingdoelen hebben hun eigen basis, toestemming (waar vereist), bezwaar- en afmeldverwerking. Geen automatische inschrijving in marketing op basis van een formulier of gidsdownload.

### 7.3 Technische correctheid

Idempotente provider-events, verzend-statussen (`pending`, `sent`, `unknown`, `failed`, `cancelled`), gecontroleerde retries, een correlation-ID en kill switch per tenant zijn vereist. Herstarten of replay mag niet meerdere mails of taken opleveren. Menselijke overname is altijd mogelijk. Message bodies horen niet onnodig in operationele logs.

---

## 8. Messaging, support en reviews

### 8.1 E-mail

**Binnen basis:** operationele notificaties, eerste AI-reactie, één toegestane reminder, relevante boekingsberichten en neutrale reviewverzoeken. **Buiten basis:** complexe nieuwsbrieven, marketingnurturing en campagnes; later optioneel via MailBlue, Brevo of een andere provider. Een e-mailprovider is een vervangbare uitvoeringslaag; CRM blijft bron van waarheid.

### 8.2 Support

De klant kiest **supportmail** of een **eenvoudig formulier in het dashboard** met categorie `technisch probleem`, `vraag` of `websitewijziging`, omschrijving en optionele bijlage. Beide komen in één centrale inbox. Formulier voegt tenant/website-referentie server-side toe; afzender ontvangt ontvangstbevestiging. **Nog geen ticketdatabase, ticketsysteem, AI-prioritering of interne taakplanner in de MVP.**

Westend beoordeelt of een structurele websitewijziging onder de overeenkomst valt; meerwerk start uitsluitend na vastgelegde offerte en klantakkoord. Bugfixes van het eigen platform vallen niet onder het reguliere supportminutenbudget.

### 8.3 Reviews

Een neutraal, triggergebaseerd review-/feedbackverzoek is P1. Geen selectie van alleen tevreden klanten, geen neprecensies, geen automatische extra verzoeken na bezwaar en geen blootstelling van privéfeedback zonder toestemming.

---

## 9. Playwright-formuliermonitoring — definitief ontwerp

### 9.1 Twee verschillende testklassen

| Eigenschap | Frontendcontrole | Volledige ketentest |
|---|---|---|
| Ritme | Elke **30 minuten** | **Elke 3 dagen** standaard; kritieke formulieren optioneel dagelijks |
| Browser | Playwright, schone context | Playwright, schone context |
| Interactie | Velden invullen, validatie en submitgedrag beproeven | Synthetische aanvraag via **echte** website en backend |
| Backendinzending | **Geblokkeerd/gecontroleerd gemockt** | **Wel**, naar geautoriseerd testpad/testbestemming |
| AI-classificatie en antwoord | Geen | **Hard uit vóór modelaanroep** |
| Normale nurture/review/reminder | Geen | **Hard uit** |
| CRM-effect | Nul productie-events | Technisch testrecord/testtrace; geen commerciële pipeline |
| Controleert | Render, selectors, clientvalidatie, interactie | Ontvangst, tenantroutering, opslag, gecontroleerde delivery |
| Resultaat | Frontend gezond/storing | Keten gezond/storing/onbekend |

### 9.2 Frontendcontrole (elke 30 minuten)

1. Bezoek formulier in schone browsercontext, handel cookie-UI af en wacht op bruikbaarheid.
2. Test zichtbaarheid, vereiste velden, selectoren, invoervalidatie en submit-interactie.
3. Intercepteer en **blokkeer vóór verzending** alle relevante backend-endpoints of gebruik gecontroleerde mocks. Als submitroute niet veilig te isoleren is, test alleen UI/validatie en markeer submit als **niet geverifieerd**; voorkom absoluut echte aanvragen.
4. Registreer `tenant_id`, `website_id`, `form_id`, `run_id`, tijdstip, type, foutcategorie, bewijs/screenshot en status.
5. Geen backend-aanvraag, geen echte e-mail, geen AI-call, geen CRM-contact en geen commerciële statistiek.

**Beperking:** een groene frontendtest zegt **niets** over backendbeschikbaarheid, e-mailaflevering of AI-functionaliteit.

### 9.3 Volledige end-to-end-ketentest (3 dagen, optioneel dagelijks)

1. Playwright verzendt synthetische data via de **echte** formulier- en backendroute.
2. Alleen een **server-side geverifieerd testmechanisme** markeert de aanvraag als test (bijvoorbeeld een kortlevend ondertekend token, aan scope en run gebonden). Een publiek formulier `is_test=true` of een prompttekst als 'dit is een test' is nooit voldoende.
3. De aanvraag wordt persistent vastgelegd en testtrace wijst de juiste tenant, website en formulier aan.
4. Controleer de vereiste afleverstap via **uitsluitend een aangewezen testbestemming**, zodat geen gewone prospect of klant onbedoeld bericht ontvangt.
5. De backend onderdrukt **AI-classificatie, AI-antwoording, normale reminders, nurturing, reviewverzoeken, klantnotificaties en reguliere salespipeline-updates** voordat deze acties worden ingepland. Zo wordt geen AI-prompt nodig om tests veilig te maken.
6. Controleer de verwachte uitkomst; bij fout verschijnt een incident met oorzaak/bewijs. Teststatussen blijven gescheiden van productiestatussen.
7. Synthetische testrecords worden uit lead-/conversie-/omzetstatistieken en commerciële gebruikstellers gefilterd. Werkelijke externe testkosten blijven intern meetbaar.

**Nauwkeurigheidsgrens:** deze ketentest bewijst **niet** dat AI of de gewone prospect-autoresponse gezond is, juist omdat die worden overgeslagen. Richt voor AI en de uitgaande productieverbinding aparte synthetische, geïsoleerde healthchecks of providerstatuscontroles in met veilige mocks/testbestemmingen. Dashboard moet onderscheid maken tussen `frontend`, `backend/CRM`, `delivery` en `AI` in plaats van één misleidende groene totaalstatus.

### 9.4 Monitoring business rules

| ID | Regel |
|---|---|
| MON-01 | Per run unieke correlatie, tenant, website, formulier, versie, tijdstip en resultaatcode. |
| MON-02 | Gegevens synthetisch; geen gevoelige of echte prospectgegevens. |
| MON-03 | Testmachtiging uitsluitend backend-geverifieerd, niet door een bezoeker na te bootsen. |
| MON-04 | Een 30-minutencontrole triggert nooit een echte productieaanvraag. |
| MON-05 | Volledige ketentest slaat AI en commerciële automations hard over. |
| MON-06 | Alle uitgaande testberichten gaan uitsluitend naar goedgekeurde testbestemmingen. |
| MON-07 | Testactiviteiten tellen niet mee in leads, omzet, conversie, productiemail of productie-AI-quota. |
| MON-08 | Monitoringrapport toont frontend- en backend-/deliverystatus afzonderlijk; onbekend is niet groen. |
| MON-09 | Tests hebben throttling, retries met bovengrens en incidentdetectie zonder eindeloze loops. |
| MON-10 | Schema/frequentie zijn per formulier configureerbaar; optioneel dagelijks na capaciteits- en kostencheck. |

---

## 10. Fair use en kostenbeheersing

### 10.1 Inbegrepen basispakket — startconfiguratie

| Onderdeel | Limiet / norm |
|---|---|
| Actieve websites | 1 |
| Actieve leadmagnets | 1 (uit 3 ondersteunde types) |
| Gemonitorde formulieren | 3 |
| CRM-contacten | Geen harde commerciële aantallimiet; wel misbruik-, privacy- en capaciteitsgrenzen |
| Gebruikers | 1 Owner + 2 Team Members |
| AI-productieverwerkingen | 500 geldige leadaanvragen per maand |
| Automatische platformmails | 2.000 per maand; geen marketingbulk |
| Playwright frontendchecks | Elke 30 minuten |
| Playwright volledige ketentest | Elke 3 dagen standaard, configureerbaar dagelijks |
| Periodieke rapportage | 1 keer per maand |
| CRM-bestandsopslag | 1 GB |
| Reguliere support | 30 minuten per maand als **interne planningsnorm**, geen eenzijdige weigering van bugfixes |

Dit zijn **pilotstartwaarden**. Waargenomen volume, kosten en foutpercentages bepalen herijking na vijf klanten.

### 10.2 Degradatieregels en facturatie

- Bij **80%** van maandquota intern waarschuwing; boven **100%** onderzoekt Westend oorzaak en kan niet-kritische, dure processen vertragen.
- **Nooit stilzwijgend geldige aanvragen laten verdwijnen.** Backend accepteert en bewaart geldige verzoeken zolang dat veilig en technisch mogelijk is; wanneer externe opvolging niet lukt volgt zichtbare handmatige behandeling.
- Geen automatisch meerwerk of overschrijdingsfactuur zonder vooraf afgesproken prijs en instemming.
- Kosten **per tenant** volgen: AI, e-mails, testen, hosting, opslag. Het eerdere financiële uitgangspunt van circa **€23 externe kosten per maand per klant** is een hypothese, geen garantie.
- Spam/abuse krijgt rate limiting en misbruikbeveiliging. Een quota-overschrijding mag de productieve leadregistratie niet verborgen onderdrukken.

---

## 11. Functionele requirements per module

| ID | Module | Minimale verplichting | Prioriteit |
|---|---|---|---|
| M01 | Platform Core | Tenants, auth, rollen, serverrechten, abonnementstatus, beheerlogs | P0 |
| M02 | Onboarding | Vier vragenlijsten, drafts, valide status, businessprofiel, templates, goedkeuring | P0 |
| M03 | Website Starter | Responsive library-componenten, bestaande branding, staging/publicatie, basis SEO en CRM-koppelpunt | P0 |
| M04 | Lead Capture / Leadmagnets | Betrouwbare capture, anti-abuse, 3 leadmagnettypes, één actief, versiebeheer | P0 |
| M05 | Conversion CRM | Contacten, leads, deals, pipeline, taken, afspraken, omzetgebeurtenissen | P0 |
| M06 | AI Qualification | Gestructureerde intent, één eerste inhoudelijke reply, escalatie, audit en timeoutfallback | P0 |
| M07 | Automations & Messaging | E-mailadapter, stopregels, beperkte reminders, boekingsprovider-event, reviewverzoek | P0/P1 |
| M08 | Monitoring | 30m frontendtest zonder submit, 3-daagse gescheiden ketentest, incident/alert | P0 |
| M09 | Dashboard & Reporting | KPI's, leadstatus, geverifieerde afspraak, opbrengsten, incidentstatus, maandrapport | P0/P1 |

### 11.1 Functionele grensafspraken

- Alleen **CRM** is bron van waarheid voor contact, lead, deal en taak; e-mail/boekingsproviders beheren hun eigen verzend-/boekingsstatussen.
- Een monitorings-run is een technisch event en mag nooit als productielead worden verwerkt.
- Een wijziging aan een lead/deal/afspraak veroorzaakt alleen gedocumenteerde automatiseringen.
- Iedere automation is observeerbaar, pauzeerbaar en voorzien van idempotency- en foutafhandeling.
- De MVP krijgt **geen** eigen universele workflowbuilder of generieke klantpagina-editor.

---

## 12. Conceptueel datamodel — stackneutraal

| Domein | Objecten |
|---|---|
| Organisatie en toegang | Tenant, User, Membership, Role, SubscriptionStatus, AuditEvent |
| Klantprofiel en website | BusinessProfile, QuestionnaireResponse, ProjectBrief, Asset, Website, ComponentConfig, Approval |
| Leadmagnet | LeadMagnetConfig, LeadMagnetVersion, Submission, Outcome |
| CRM | Contact, Lead, Deal, PipelineStage, Activity, Task, Appointment, ConsentRecord |
| Geld en marketing | ContractValue, RevenueEvent, CampaignAttribution (waar bekend) |
| AI en communicatie | AIClassification, Message, ProviderEvent, AutomationDefinition, AutomationRun |
| Monitoring en support | FormConfig, MonitoringRun, MonitoringIncident, SupportRequestReference |

**Belangrijke relaties:** tenant bezit alle zakelijke records; één contact kan veel leads/deals hebben; leads kunnen naar een deal verwijzen; één deal heeft een actuele fase en meerdere omzetgebeurtenissen; provider-events hebben per tenant/provider een unieke externe referentie; consent bewaart historische gebeurtenissen, niet alleen één boolean.

**Providerneutraliteit:** e-mail, boeking, CMS en facturatie worden pas bij Fase 4/5 op technische oplossingen vastgezet. Voor toekomstige boekhoudkoppeling is ruimte voor externe referentie-ID's, bron, tijdstip en herkomst, zonder nu facturen te modelleren als volledige boekhoudadministratie.

---

## 13. Niet-functionele eisen

| Thema | MVP-eis |
|---|---|
| Security | Sterke authenticatie, tenant-isolatie, server-side rollen, webhookauthenticiteit, secretbeheer, least privilege |
| Privacy | Dataminimalisatie, toestemmingsdoelen, export/verwijderen, verwerkersafspraken, bewaartermijnen vóór livegang |
| Betrouwbaarheid | Eerst duurzame opslag, dan externe acties; idempotent events; retries met limiet; menselijke fallback |
| Waarneembaarheid | Correlatie-ID's, audit van belangrijke mutaties, foutcategorieën, per-tenant kosten en incidenten |
| Performance | Snel bruikbare pagina's en CRM-schermen; AI niet op kritieke opslagroute voor inzending |
| Toegankelijkheid | Toegankelijke formulieren en componenten, foutteksten, toetsenbordinteractie, responsiviteit |
| Testbaarheid | Unit-, integratie- en E2E-tests op alle P0-processen, tenanttoegang en monitoringisolatie |
| Beheerbaarheid | Begrensde modules, versiebeheer van templates/prompts, geen dubbele bron van waarheid |
| Migratie | Hergebruik oude code alleen na audit op complexiteit, beveiliging, testbaarheid en afhankelijkheden |

De exacte meetgrenzen voor responstijden, hersteldoelen, bewaartermijnen en uptime-SLA worden in Fase 4/5 gedocumenteerd na beoordeling van technische risico's en pakketverplichtingen; zij worden hier niet verzonnen.

---

## 14. Acceptatietests voor MVP-go/no-go

| Test-ID | Scenario | Verwacht bewijs |
|---|---|---|
| AT-01 | Gebruiker tenant A vraagt via gemanipuleerde ID tenant B op | Nul datalek; server weigert; test gelogd |
| AT-02 | Team Member opent niet-toegewezen deal | Toegang geweigerd, ook via API |
| AT-03 | Nieuwe klant doorloopt Q1–Q4 | Drafts hervatbaar, blokkades zichtbaar, goedgekeurde brief |
| AT-04 | Standaardwebsite publiceren | Strategie/inhoud geaccordeerd, integraties en smoke tests geslaagd |
| AT-05 | Quiz, calculator en download elk als enige actieve leadmagnet | Drie varianten slagen in afzonderlijke tests; geen dubbele actieve instantie |
| AT-06 | Formulier 2x snel verzonden / provider-event gereplayed | Eén logische leadverwerking en maximaal één eerste AI-reply |
| AT-07 | AI-timeout of schemafout | Lead veilig bewaard, taak/incident zichtbaar |
| AT-08 | Promptinjectie in formulierbericht | Geen systeemregel of providercredential gelekt/gewijzigd |
| AT-09 | Kalenderlink getoond, nog geen boeking | Geen afspraak in CRM; alleen geverifieerde webhook telt |
| AT-10 | Reply/boeking/opt-out kort vóór reminder | Geen herinnering, correcte reden en stopstatus |
| AT-11 | Inbound repliedetectie ontbreekt | Menselijke taak, geen onbewaakte reminder |
| AT-12 | Eerste reminder verstuurd, daarna 48 uur stilte | Eén opvolgtaak, geen tweede automatische mail |
| AT-13 | Deal gewonnen + €900 contract, €150 betaling geregistreerd | Contract €900, ontvangsten €150, resterend contract €750; geen fictieve factuurschuld |
| AT-14 | Support via mail en dashboardformulier | Beide komen bij dezelfde centrale inbox; context klopt |
| AT-15 | Extra werk buiten abonnement | Geen uitvoering vóór klantakkoord |
| AT-16 | Playwright frontendcheck | Geen echte backendaanvraag, AI-call of productiemail |
| AT-17 | Playwright echte ketentest met geldige testauthenticatie | Juiste tenant en persistente ontvangst, gecontroleerde testdelivery |
| AT-18 | Publieke gebruiker voegt `is_test=true` toe | Wordt niet als geautoriseerde test geaccepteerd |
| AT-19 | Echte test terwijl productieregels actief zijn | Geen AI, reminders, reviewverzoeken of commerciële statistieken |
| AT-20 | Backend stuk, frontend intact | Frontendstatus niet onterecht gelijk aan volledige ketenstatus |
| AT-21 | Limiet >100% bij geldige productieaanvraag | Aanvraag zichtbaar bewaard of expliciet foutsignaal; geen stil verlies |
| AT-22 | Maandrapport met ontbrekende omzet/marketingkosten | Onbekende waarden niet als €0 of positieve ROI gepresenteerd |
| AT-23 | Klant gebruikt eigen reviewflow | Neutraal verzoek zonder review-gating |
| AT-24 | Productie van vijf pilotwebsites | Gemeten bouw-, onboarding-, acquisitie- en supporturen, echte kosten per tenant |

**Releasecriteria:** alle P0-tests slagen; openstaande P1-afwijkingen zijn expliciet geaccepteerd met tijdelijke werkwijze; geen kritieke beveiligings-/privacyproblemen; monitoring en herstelpad werken; vijf pilotklanten leveren data voor commerciële evaluatie.

---

## 15. Voorgestelde bouwvolgorde en afhankelijkheden

| Iteratie | Focus | Einde-iteratie-bewijs |
|---|---|---|
| 0 | Audit bestaande code + productscope bevriezen | Hergebruikbesluiten per component, terugvalplan |
| 1 | Tenant/auth + basiscontacten + veilige leadopslag | Lead van testsite zichtbaar in juiste tenant |
| 2 | AI-classificatie + verzending + handover | Eén AI-reply en veilige foutverwerking |
| 3 | Pipeline, taken, afspraak en beperkte follow-up | Complete aanvraag→afspraak→deal route |
| 4 | Leadmagnettypes, onboarding en website-starter | Klantwebsite met gekozen template en 3 varianten afzonderlijk getest |
| 5 | Monitoring + dashboard + financiële registratie | Gezondheidsstatus, KPI's, omzet en rapport |
| 6 | Review, supportformulier, fair-use en pilotacceptatie | Eerste vijf pilots veilig uitvoerbaar |

Deze volgorde is een **hypothese voor implementatie**. Werkelijke iteraties en stack worden pas na Fase 3–5 vastgelegd; e2e-beveiliging en testroutines bestaan vanaf het begin, niet pas in iteratie 6.

---

## 16. Resterende uitwerking na Fase 2

### In Fase 3 — UX/UI

1. Informatiearchitectuur en menu's voor **Business Owner**, **Team Member** en **Platform Admin**.
2. Wireframes en gebruikersstromen voor onboarding (Q1–Q4), dashboard, contacten, pipeline, deals/betalingen, taken, leadhistorie en supportformulier.
3. Fout-, leeg-, loading-, overschrijdings- en storingsstatussen; expliciete menselijke handover.
4. Componenten en interactiepatronen voor drie leadmagnetvarianten en hun resultaatpagina's.
5. Scheiding tussen technische incidentstatus (Westend) en leesbare status voor ondernemer.
6. Scope van basisinstellingen en rechten in ieder scherm.

### In Fase 4/5 — Architectuur en techstack

Definitieve database- en tenantstrategie; autorisatiemodel; webhooks/queues/outbox en retrybeleid; AI-provider; mail- en afspraakadapter; monitoring-runner en veilige testauthenticatie; CMS-koppeling voor latere Sanity-selfservice; deploy en hosting; backup/restore; operationele SLA's; keuze welke huidige code herbruikbaar is.

### Aanpak om complexiteit te beheersen

- **Eerst een verticale keten werkend**: formulier → opslag → CRM → AI/human → afspraak/deal → dashboard.
- Eén bron van waarheid voor CRM; geen parallelle contacttabellen per integratie.
- Geen visuele builders wanneer vaste templates voldoen.
- AI-productie van websites is een **interne workflow**, geen klantgerichte agentconsole in MVP.
- Nieuwe ideeën na deze baseline krijgen apart P2-label en worden alleen op basis van klantdata naar voren gehaald.

**Conclusie:** Fase 2 is functioneel vastgesteld en gereed voor Fase 3. Dit document beschrijft *wat* en *waarom*, niet definitief *met welke stack*.
