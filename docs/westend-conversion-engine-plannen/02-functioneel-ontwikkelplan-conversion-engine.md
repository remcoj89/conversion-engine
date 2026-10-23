# Westend Digital — Productbeschrijving & ontwikkelplan Conversion Engine
**Versie:** 1.3 — 22 oktober 2026 (post-MVP websitekwaliteit en Playwright toegevoegd)
**Status:** Technologieneutraal functioneel en architecturaal ontwerp  
**Uitgangspunt:** clean-slate nieuwbouw, selectief hergebruik van bestaande bewezen onderdelen  
**Belangrijke afspraak:** stack, frameworks, hosting, deploymentprovider en leveranciers worden **na** dit ontwerp vastgesteld.

## 1. Productvisie en grenzen
Een meervoudig inzetbaar, multi-tenant platform voor Nederlandse dienstverleners. Het product ondersteunt één primaire commerciële keten:

**Bezoeker → lead → gekwalificeerde lead → afspraak → deal → klant → omzet → inzicht/verbetering.**

De website is de zichtbare voorkant; het CRM en de Automation Engine zijn de uitvoerende motor; het Monitoring Dashboard maakt betrouwbaarheid en uitkomsten zichtbaar. Iedere branche gebruikt hetzelfde product maar krijgt een configureerbare template.

### Kernprincipes
1. **Simpel vóór compleet:** één primaire gebruiker, één standaardpipeline en een kleine set betrouwbare acties.
2. **Eén bron van waarheid:** eigen CRM bewaart contact-, lead-, deal- en toestemmingsstatus; externe tools zijn adapters.
3. **Configuratie, geen kopie-apps:** branchetemplates bepalen labels/velden/workflows, niet forks.
4. **Verantwoord automatiseren:** deterministische acties waar mogelijk, AI alleen bij taalbegrip of tekstproductie.
5. **Meetbare herkomst:** gebeurtenissen zijn herleidbaar; dashboards onderscheiden zekerheid en onbekende data.
6. **Isolatie per klant:** sterke toegangscontrole, geen data-lekken tussen tenants.
7. **Vervangbare integraties:** afspraken, e-mail, analytics en formulieren via duidelijke interfaces.

### Buiten de MVP
Geen complete e-mailmarketing-suite, geen volledige drag-and-drop workflow builder, geen native advertentiebeheer, geen omnichannel inbox, geen boekhoudpakket, geen volledige ERP, geen onbeperkte CMS-builder, geen automatische SEO/GEO-publicatie, geen AI die zelfstandig prijzen of juridische teksten wijzigt, geen belofte van gegarandeerde leads en geen complexe attributiemodellen.

## 2. Waarom opnieuw beginnen?
Het huidige systeem is volgens de opdrachtgever te complex geworden. Een incrementele uitbreiding zou nieuwe afhankelijkheden en scopeproblemen verergeren. Daarom een **functionele reset**, niet automatisch het weggooien van alle code.

### Fase 0: inventarisatie & salvage
- Inventariseer bestaande monitoringdashboard-, CRM-, AI-formulier-, formuliermonitor- en websitebouwmodules.
- Maak per onderdeel een korte scorekaart: functionaliteit, kwaliteit, testen, security, complexiteit, afhankelijkheden, documentatie, migratiekosten.
- Besluit **hergebruiken**, **inspiratie/reference**, **herschrijven** of **laten vervallen**.
- Hergebruik geen complete gedeelde database, businesslogica of UI-kluwen zonder bewijs dat deze eenvoudig te onderhouden is.
- Exporteer en archiveer noodzakelijke data/configuratie voordat oude systemen worden uitgefaseerd.
- Bouw de nieuwe kern in een gescheiden omgeving; verwijder oude systemen pas na dataconsistentie- en rollbackcheck.

**Deliverables fase 0:** module-inventaris, hergebruikmatrix, definitieve MVP-grens, domeinmodel, functionele gebruikersflows en technische acceptatie-eisen. Geen stackkeuze in deze stap.

## 3. Rollen en gebruikers
- **Platformbeheerder (Westend):** tenant en template beheren, incidenten zien, configuratie en facturatiestatus beheren; geen onnodige standaardinzage in klantdata.
- **Klantbeheerder:** eigen bedrijf, medewerkers, integraties, pipeline en rechten instellen.
- **Medewerker:** toegewezen leads, afspraken, taken en deals verwerken.
- **Websitebezoeker:** formulier/quiz invullen en eventueel afspraak boeken.
- **Automatisering/AI:** service-identiteit met scoped permissies en audittrail, nooit onbeperkte adminrechten.

## 4. Functionele hoofdmodules

### M1. Accounts, tenants, onboarding
**Doel:** klantbedrijf aanmaken en direct een vooraf gedefinieerde inrichting leveren.
- Tenant, gebruikers, uitnodigingen, rollen, status van abonnement.
- Selecteer branchetemplate, configureer bedrijfsnaam, diensten, contactkanalen, openingstijden, afspraaklink, privacyteksten en AI-kennisbasis.
- Checklist voor ontbrekende configuratie; niet publiceren als essentiële velden ontbreken.
**Acceptatie:** nieuwe tenant heeft eigen afgeschermde workspace, één bruikbare pipeline en aantoonbare testflow zonder toegang tot data van andere klanten.

### M2. Website & Lead Capture
**Doel:** elke aanvraag correct ontvangen en aan de juiste tenant koppelen. **Productiedoel:** een standaardwebsite met AI in maximaal 3 uur menselijke bouw-/QA-tijd realiseren (los van 1,5 uur onboarding en commerciële tijd); de pilot moet dit meten en bewijzen.
- Gestandaardiseerde website- en formuliercomponenten; configureerbare maar beperkte secties.
- Velden: naam, e-mail, optioneel telefoon, bericht; extra branchevelden via whitelist/config.
- Brondata: pagina, campagne/UTM indien aanwezig, privacyversie, tijdstip.
- Honeypot, rate limiting, server-side validatie; geen vertrouwelijke gegevens in de browser.
- Dedupe bij identieke retries; aanmaak van **lead** en koppeling aan bestaand **contact** waar betrouwbaar.
- Optionele leadmagnet (MVP één eenvoudig quiz/calculatorformaat) na kernflow.
**Acceptatie:** één inzending leidt niet tot dubbele leads of e-mails; fouten worden gelogd en zichtbaar; inzendingen verdwijnen niet stilletjes.

### M3. Contacten en leads
**Doel:** minimalistisch klantbeeld en actiehistorie.
- Contactprofiel: naam, e-mail, telefoon optioneel, bron, tags, eigenaren, toestemming, notes, tijdlijn.
- Lead: specifieke aanvraag met intentie, kwalificatie, datum, kanaal en status.
- Contact kan meerdere leads en meerdere deals hebben; dit zijn geen synoniemen.
- Zoek/filter, tags, notities, export en archivering/verwijderen volgens beleid.
**Acceptatie:** een medewerker kan binnen 30 seconden zien waarom iemand contact opnam en wat de volgende actie is.

### M4. Pipeline, deals en taken
**Doel:** ondernemer krijgt overzicht van de verkoopkansen.
- Standaardstatus: Nieuw → Gekwalificeerd → Afspraak gepland → Voorstel → Gewonnen/Verloren.
- Pipeline mag per branche worden gelabeld/aangepast zonder nieuwe code.
- Deal heeft bedrag, product/dienst, eigenaar, fase, verwachte sluitdatum optioneel, verliesreden.
- Taak heeft eigenaar, deadline, gekoppeld object, prioriteit en voltooiingsstatus.
- Menselijke of geautoriseerde automatische faseverplaatsing; elke statuswijziging in audittrail.
**Acceptatie:** gewonnen deals worden geregistreerd als omzetgebeurtenis of als **handmatig aangegeven dealwaarde** (duidelijk onderscheid); verloren deals hebben optionele reden.

### M5. AI-intentie en eerste contactreactie
**Doel:** snel en passend reageren met lage risico's.
- Classificeer bijvoorbeeld: aankoopintentie, offerteverzoek, informatievraag, klacht, urgent probleem, verkoopbenadering, spam/onbekend.
- Gebruik per tenant gecontroleerde kennisbron (diensten, FAQ, tarieven voor zover gevalideerd, werkwijze).
- Maximaal één inhoudelijke automatisch gegenereerde reactie op een initiële aanvraag; daarna overdracht aan mens of expliciet aparte opt-in workflow.
- Bij relevante interesse: contextuele vervolgvragen en geldige Calendly-link, niet claimen dat er al geboekt is.
- Bij klacht/urgent: markeer en alarmeer medewerker; bij spam/sales outreach veilige policy.
- Bij ontbrekende kennis: geen fabricatie, eskaleer.
- Logging van classificatie, modelbeslissing, reden/code, verzendstatus en uitkomst; privacyvriendelijke bewaartermijnen.
**Acceptatie:** geen loop of dubbele reactie bij retry; uitvoeringsstatus is inzichtelijk; de mens kan de automatisering direct uitzetten.

### M6. Afspraken
**Doel:** afspraakstatus zichtbaar, niet simpelweg 'link geklikt' = geboekt.
- Externe planningslink per tenant, webhook of handmatige registratie van bevestigde boeking.
- Status: aangeboden, geboekt, geannuleerd, no-show/afgerond indien bron dat ondersteunt.
- Trigger opvolgtaken op basis van werkelijk ontvangen status.
**Acceptatie:** alleen gevalideerde events leiden tot afspraak-KPI; webhook idempotent.

### M7. E-mail en follow-up
**Doel:** kernopvolging standaard, uitgebreide e-mailmarketing als add-on.
- Operationele berichten via providerinterface; gescheiden van marketingcommunicatie.
- Toestemmingsstatus, bewijs/herkomst, voorkeuren, uitschrijvingen, bounces en suppressie centraal.
- Beperkte vooraf goedgekeurde sequenties: aanvraag ontvangen/AI-reactie, toegestane reminder, herinnering aan interne medewerker, afspraak-event, feedback/reviewtrigger.
- Stopregels: reply, afspraak geboekt, gewonnen, verloren, unsubscribe, bounce, handmatige stop.
- Quota en tenant-rate limits; verzendfouten zichtbaar en retry met limiet.
- Marketingplatformen als optionele externe accounts/integraties, licentie bij klant tenzij anders overeengekomen.
**Acceptatie:** niet-ingeschreven contacten krijgen geen nieuwsbrieven; uitschrijving wordt consequent gerespecteerd; automatische e-mails blijven traceerbaar.

### M8. Monitoring & betrouwbaarheid
**Doel:** gemiste leads door technische storingen voorkomen.
- Synthetische end-to-end-tests van kritieke formulieren met testmarker en afzonderlijke testverwerking; controle van validatie, ingest, opslag en waar relevant mailpad.
- Frequentie configureerbaar; voorstel: elke 30 minuten voor geschikte formulieren, maar agressieve productieposts vermijden en rate limits respecteren.
- Incidentstatus, herhaling, waarschuwingen en herstelmelding.
- Basis website-health: uptime en kritieke fouten. Geen breed observabilityplatform als MVP.
**Acceptatie:** gesimuleerde fout leidt tot alert en testdata vervuilt reguliere funnel-KPI's niet.

### M9. Analytics & rapportages
**Doel:** korte, betrouwbare commerciële cockpit.
- KPI's: sessions (alleen met beschikbare consent/gegevens), formulieren, leads, gekwalificeerde leads, boekingen, gewonnen deals, gerapporteerde omzet, opvolgtijd, formulierstatus.
- Campagne/UTM-registratie waar beschikbaar; geen fictieve marketingkosten.
- Maandrapport: cijfers, trend, belangrijkste conversieknelpunten en **aanbevelingen**; geen automatische implementatie in Basis.
- Data provenance/zekerheid: gemeten, afgeleid, handmatig ingevoerd of onbekend.
**Acceptatie:** dashboards tonen nooit nul als de werkelijke waarde onbekend is; omzet is herleidbaar tot deals of expliciete invoer.

### M10. Feedback en reviews
**Doel:** feedback verzamelen zonder selectieve reviewmanipulatie.
- Eenvoudige trigger na afgeronde dienstverlening of instelbaar geschikt moment.
- Feedbackformulier; optionele neutrale reviewuitnodiging aan alle geschikte klanten op gelijke voorwaarden, niet alleen tevreden klanten naar publieke reviews doorsturen.
- Frequentiegrens, unsubscribe/opt-out, log status.
**Acceptatie:** geen herhaald verzoek binnen de afgesproken wachttijd; publiek reviewplatformvoorwaarden gerespecteerd.

### M11. Branchetemplates
**Doel:** per niche relevante bedrijfslogica configureren zonder nieuwe codebase.
Een template bevat: pipelinefasen, leadvelden, AI-intentsubtypes/kennisinstructies, e-mailtemplates, automatiseringsconfiguraties, KPI-labels, CTA-tekstpatronen en optionele leadmagnetdefinities.
- MVP: één template **personal trainer/fitnesscoach** + generiek basistemplate.
- Op tenantniveau overschrijfbare velden binnen grenzen.
- Templateversies worden opgeslagen; updates migreren bestaande tenants niet stilzwijgend.
**Acceptatie:** twee tenants met verschillende templates gebruiken dezelfde kernmodules en behouden volledig gescheiden data.

### M12. Websitekwaliteit & conversietesten (post-MVP)
**Doel:** klantwebsites herhaalbaar testen op werking, conversie, toegankelijkheid en technische kwaliteit.
- Een herbruikbare browser-testlaag met Playwright en configureerbare testprofielen per klantwebsite.
- **Basiscontrole:** homepage, navigatie, belangrijkste CTA's, responsive gedrag, 404-pagina en kritieke console-errors.
- **Conversiecontrole:** formulieren, verplichte velden, foutmeldingen, succesmelding, dubbele verzending, bedankpagina en de primaire lead funnel.
- **Trackingcontrole:** UTM-doorgifte, analytics-events, advertentieconversies, formulier-events en bedankpagina-events.
- **Integratiecontrole:** CRM-ingest, e-mailnotificaties, afspraakmodules, webhooks en andere expliciet geconfigureerde koppelingen.
- **Toegankelijkheidscontrole:** toetsenbordbediening, focusvolgorde, labels, foutmeldingen en basiscontroles op semantiek en contrast.
- **Visuele regressie:** screenshots van afgesproken kernpagina's en states op mobiel, tablet en desktop.
- **Technische controle:** statuscodes, redirects, canonical/meta-informatie, structured data, sitemap, robots.txt en deployment-smoke-tests.
- **PWA-controle waar relevant:** service worker, offline shell, cachegrenzen en updategedrag.
- Resultaat per test: pass/fail, timestamp, testprofiel, foutcontext, screenshot/trace waar relevant en een tenantgebonden historiek.
- Productiechecks gebruiken alleen veilige, gemarkeerde testpaden; waar mogelijk draaien volledige formulier- en integratietests tegen staging.
- Testdata bevat geen echte persoonsgegevens, betalingen of onbeheerde productie-e-mails. Testdomeinen en externe endpoints zijn expliciet geallowlist.
**Acceptatie:** een website kan met één herhaalbaar profiel worden gecontroleerd; kritieke fouten zijn reproduceerbaar met bewijs; testverkeer vervuilt geen klant-KPI's en een klant kan alleen eigen testresultaten zien.

## 5. Minimaal datamodel — conceptueel, stackvrij
**Tenant** 1—N **User**, **Contact**, **Lead**, **Deal**, **Task**, **AutomationRun**, **Form**, **Campaign**, **ConsentEvent**.  
**Contact** 1—N **Lead**; **Contact** 1—N **Deal**; **Deal** N—1 **PipelineStage**.  
**Lead** kan verwijzen naar **FormSubmission**, **Appointment**, en de initiële **SourceAttribution**.  
**Activity/Event** verwijst naar één tenant en relevante objecten; correlatie-id verbindt eventketens.  
**RevenueEvent** komt uit expliciete transacties of handmatige registratie en bevat herkomstsoort.  
**TemplateVersion** wordt op een tenantconfiguratie vastgelegd.

**Privacy:** velden voor trainingsdoelen en coachingcontext kunnen gevoelige persoonsgegevens bevatten; verzamel geen gezondheidsdiagnoses of bijzondere persoonsgegevens zonder expliciete noodzaak, passende grondslag en extra waarborgen. AI-kennis en leaddata blijven per tenant gescheiden.

## 6. Gebeurtenissen en workflowregels
Voorbeelden: `lead.created`, `lead.classified`, `ai.reply_requested`, `ai.reply_sent`, `ai.reply_failed`, `appointment.booked`, `appointment.cancelled`, `deal.stage_changed`, `deal.won`, `consent.granted`, `consent.withdrawn`, `email.bounced`, `form.health_failed`, `form.health_recovered`, `review.invitation_due`.

Iedere kritieke gebeurtenis heeft: event-id, tenant-id, schema-/versie-id, occured-at, object-id, correlatie-id, herkomst, privacyclassificatie en idempotency key. Triggers worden deterministisch beoordeeld. AI produceert gestructureerde voorstellen, niet onbegrensde side effects.

**Invarianten:**
- Eén form submission resulteert in maximaal één business-lead volgens dedupebeleid.
- Eén initiële aanvraag resulteert in maximaal één automatische inhoudelijke AI-reactie.
- Geen marketingmail na geldig opt-out-event.
- Een bevestigde afspraak is nooit afgeleid uit alleen een linkklik.
- Een verloren/gewonnen deal triggert stopzetting van niet-relevante sales-follow-up.
- Geen cross-tenant lees-/schrijfacties.
- Tests tellen nooit mee als echte leads/omzet.

## 7. Functionele schermen — MVP
1. **Vandaag:** urgente leads, mislukte opvolgingen, aankomende afspraken, taken.
2. **Dashboard:** leads, afspraken, deals, gerapporteerde omzet, trends, datakwaliteit.
3. **Contacten:** tabel/zoeken + profiel met tijdlijn, toestemming en gekoppelde records.
4. **Pipeline:** eenvoudige Kanban + filters + dealformulier.
5. **Taken:** lijst, verantwoordelijke, deadline en status.
6. **Automatiseringen:** statussen/aan-uit, verzendfouten en standaardflowconfig; geen visuele builder.
7. **Monitoring:** formulierstatus, laatste test, foutsignalen, incidenten.
8. **Instellingen:** bedrijfsprofiel, rollen, branchetemplate, formulieren, afspraken, e-mail, quota, rechten.
9. **Rapportages:** maandrapport en export.

**UX-regel:** elke primaire view geeft antwoord op "wat moet ik nu doen?"; voorkom grafieken zonder besliswaarde.

### PWA-dashboard

Het dashboard wordt gebouwd als één Next.js-webapp die zowel in de browser werkt als installeerbaar is als Progressive Web App (PWA). De PWA is een uitbreiding van dezelfde frontend, geen aparte applicatie.

De eerste PWA-scope bestaat uit:

- Next.js App Router met responsive dashboardlayouts;
- web app manifest met naam, iconen, thema- en startinstellingen;
- installatie op desktop en mobiel via een ondersteunde browser, waaronder Ubuntu met Chrome of Chromium;
- standalone appweergave zonder normale browserchrome;
- service worker voor de statische app-shell en zorgvuldig gekozen caching;
- veilige update- en cache-invalideringsstrategie;
- optionele pushnotificaties voor relevante incidenten in een latere slice.

Gevoelige tenantdata, CRM-data en autorisatiebeslissingen worden niet onbeperkt offline gecachet. De server blijft de bron van waarheid; offline gedrag is in de MVP beperkt tot een bruikbare app-shell en eventueel expliciet goedgekeurde read-only informatie.

## 8. Ontwikkelfasering, afhankelijkheden en gereedcriteria

### Fase 0 — Vereenvoudigen en opnieuw ontwerpen
**Werk:** bestaande codeaudit, begrenzing MVP, gebruikersflows, gegevens-/eventmodel, compliance requirements, branch-template contract, integratiegrenzen.
**Klaar als:** er een scherpe productdefinitie ligt, hergebruikbeslissingen zijn genomen, kritieke regels getest kunnen worden en er nog geen onbewezen stackkeuze is ingebouwd.

### Fase 1 — Salesproces & site-delivery
**Werk:** outreachadministratie (mag aanvankelijk handmatig), demo-template, VSL-flow, lead→intake→checkout/onboarding, gestandaardiseerde website- en formulierdelivery.
**Klaar als:** een pilotklant een realistisch voorbeeld ziet, kan besluiten, onboarden en een functionerende website met formulier krijgt binnen vastgestelde scope.

### Fase 1B — Next.js dashboard- en PWA-fundament
**Werk:** Next.js App Router, responsive dashboard-shell, navigatie/layouts, authenticatieflow, PWA-manifest, app-iconen, service-workerfundament, veilige caching en installatiecontrole op desktop en mobiel.
**Klaar als:** dezelfde applicatie normaal via de browser werkt én als geïnstalleerde PWA geopend kan worden; de dashboard-shell blijft bruikbaar bij tijdelijk netwerkverlies zonder gevoelige data onveilig lokaal op te slaan.

### Fase 2A — CRM-kern
**Werk:** tenants/rollen, contacten, leads, tijdlijn, pipeline, deals, taken, brancheconfig.
**Klaar als:** een formulierinzending als lead binnenkomt, gekoppeld kan worden aan een contact, handmatig naar een gewonnen/verloren deal kan worden verwerkt en auditbaar is.

**Implementatiestatus — 23 oktober 2026:** het lead-datamodel is toegevoegd (tabel `leads`, migratie `0004`). Per lead worden naam, e-mail, optioneel telefoonnummer, bericht, bron, status (start als `new`) en aanmaak-/wijzigingstijd opgeslagen. Leads zijn altijd gekoppeld aan een bestaande tenant; opslaan zonder geldige tenant wordt geweigerd en ophalen gebeurt alleen op tenant én lead-ID. De koppeling met het contactformulier en de weergave in het dashboard staan nog open.

### Fase 2B — Automatiseringen en afspraken
**Werk:** AI-classificatie, één AI-antwoord, escalation policy, outbound email adapter, consent, Calendly adapter, stopregels, retry/idempotentie.
**Klaar als:** echte en gesimuleerde happy-path en failure-path flows foutloos en zonder dubbele antwoorden verlopen.

### Fase 2C — Operationele betrouwbaarheid
**Werk:** formuliermonitoring, test-isolatie, incidenten, review-/feedbackbasis, health-inzichten.
**Klaar als:** een gesimuleerde formulierstoring zichtbaar een alarm produceert, wordt hersteld en geen foutieve leadstatistieken veroorzaakt.

### Fase 3A — Rapportages
**Werk:** conversieevents, KPI-definities, herkomstvelden, omzetinput, maandrapporten, datakwaliteitslabels.
**Klaar als:** de volledige route lead→afspraak→deal in het dashboard te volgen is zonder verzonnen cijfers.

### Fase 3B — Beta/pilot
**Werk:** vijf betalende pilotklanten, onboarding-runbook, feedback, supportregistratie, securityreview, operationele kostmeting.
**Klaar als:** systemen aantoonbaar stabiel zijn, pilotgebruik wordt gemeten, kosten in kaart zijn gebracht en scopekeuzes voor versie 2 onderbouwd zijn.

### Post-MVP-workstream — Website Quality Engine
**Werk:** een veilige Playwright-runner, testprofielen per klantwebsite, browserflows, formulier- en conversietests, trackingvalidatie, integratiechecks, toegankelijkheidschecks, visuele regressie, technische SEO-smoke-tests, bewijsopslag, incidentstatus en historische resultaten.
- Start met een klein basisprofiel voor homepage, navigatie, primaire CTA, responsive gedrag en het belangrijkste formulier.
- Voeg conversie-, tracking-, integratie-, accessibility- en visual-regressieprofielen afzonderlijk toe.
- Gebruik staging als standaard voor muterende tests; productie alleen met testmarkers, allowlists, rate limits en geïsoleerde verwerking.
- Bescherm de runner tegen willekeurige URL's, ongecontroleerde redirects, SSRF, secrets in traces en opslag van persoonsgegevens.
- Integreer resultaten pas na een bewezen losse runner met M8 Monitoring & betrouwbaarheid en M9 Analytics & rapportages.
**Klaar als:** een nieuwe klantwebsite via configuratie aan een testprofiel kan worden gekoppeld, de kritieke conversieroute aantoonbaar wordt getest en een fout met reproduceerbaar bewijs als incident zichtbaar wordt zonder productie-KPI's te vervuilen.

### Fase 4 — Growth Engine (buiten MVP)
**Werk:** read-only audits, prioritering, SEO/GEO-contentbriefs, bron/factcheck, wijzigingsvoorstel, staging/preview, tests, autorisatie, gecontroleerde uitrol, meetcyclus en rollback. A/B-testing uitsluitend waar voldoende volume en consistente toewijzing aanwezig zijn; anders kwalitatieve en observationele optimalisatie.
**Klaar als:** elke uitgevoerde wijziging een hypothese, data, risico-indeling, goedkeuring indien nodig, testresultaat en traceerbare uitkomst heeft.

### Fase 5 — Traffic Engine (buiten MVP)
Campagneplanning, advertentiespecialist, spend-registratie, betrouwbare attributie en geïntegreerde ROAS/CAC; eerst pilots en aanvullende expertise, geen vroege resultaatsgaranties.

## 9. Teststrategie
- **Domein:** contact met meerdere leads, meerdere deals per contact, statusovergangen, templateconfiguratie.
- **Idempotentie:** formulierdubbelpost, webhook-retry, e-mailprovider-retry, race conditions.
- **Autorisatie:** tenantisolatie, rolbeperkingen, service accounts, export/verwijderprocessen.
- **AI:** spam, sales outreach, klachten, onbekende vraag, jailbreak/promptinjectie, ontbrekende prijs, onveilige toezegging, AI-provider outage.
- **Communicatie:** unsubscribe, soft/hard bounce, dubbele sequences, antwoord van prospect, gewonnen deal.
- **Monitoring:** vals-positief/vals-negatief tests, geen productie-effecten, alert- en herstelstatus.
- **Privacy:** persoonsgegevens in logging, toestemmingsbewijzen, verwijder-/bewaarverzoeken, persoonsgegevens per tenant.
- **Rapportage:** ontbrekende events, onbekende omzet, refund/correcties, attributieconflicten.
- **UX:** kerngebruiker kan nieuwe lead behandelen zonder uitleg; mobiele bediening van taken/pipeline.
- **PWA:** manifest, installatie, service worker, cachegrenzen, updategedrag en gedrag bij tijdelijk netwerkverlies.

### Browser- en klantwebsite-tests (post-MVP)
- **Smoke:** homepage, kritieke routes, navigatie, CTA's, 404 en console-errors.
- **Conversie:** formulieren, validatie, succes- en foutstaten, deduplicatie en primaire funnel.
- **Responsive:** mobiel, tablet en desktop in de ondersteunde browsers.
- **Tracking:** UTM's, analytics-events, advertentieconversies en bedankpagina's.
- **Integraties:** CRM, e-mail, afspraken, webhooks en expliciet geconfigureerde externe diensten.
- **Toegankelijkheid:** keyboard flow, focus, labels, foutmeldingen en basissemantiek.
- **Visueel:** vastgelegde screenshots en vergelijking van kernpagina's en belangrijke states.
- **Technisch:** statuscodes, redirects, metadata, structured data, sitemap, robots.txt en deployment-smoke-tests.
- **PWA:** service worker, offline shell, caching van alleen toegestane assets en updategedrag.
- **Veiligheid:** staging/testmarkers als standaard, geen echte persoonsgegevens of betalingen, allowlisted domeinen en geen secrets in traces of screenshots.

## 10. Non-functionele kwaliteitseisen (vaststellen als acceptatie-SLO's)
- Veilige authenticatie en rolgebaseerde autorisatie op elke tenantgebonden actie.
- Volledige traceerbaarheid van verzending, statusovergangen en kritieke integraties.
- Rate limits, queue-/retrybeleid en duidelijke foutstatussen.
- Backups, herstelprocedure, incidentmelding, logging zonder overbodige PII.
- Data-export en accountbeëindiging volgens contract en wettelijke eisen.
- Toegankelijke basisinterface en responsive dashboard.
- Installeerbare PWA met voorspelbaar updategedrag en zonder onbedoelde lokale opslag van gevoelige tenantdata.
- Prestatie- en beschikbaarheidsdoelen worden tijdens stackkeuze gekwantificeerd; geen fictieve SLA vooraf.

## 11. Integratiecontracten (provider-onafhankelijk)
- **EmailTransport:** verzenden, status/bounce events, templates en sender identity.
- **MarketingPlatform (optioneel):** contact sync, consent/opt-out sync, start/stop sequence.
- **BookingProvider:** booking link, validate event, booking status.
- **AnalyticsSource:** events, bron, datasetbeschikbaarheid en privacystatus.
- **WebsiteForm:** signed/validated submissions, form health en testmarkering.
- **AIProvider:** classificatie en conceptreply onder output-schema, timeout en budget.
- **BillingProvider:** abonnementstatus, betaalgebeurtenissen, zonder billing als CRM te mengen.

De precieze leveranciers en stack zijn uitdrukkelijk nog open.

## 12. Scopebeheer: must, should, later
**Must (MVP):** tenantisolatie, gebruikersrollen, betrouwbare formulieren, contact+lead, pipeline+deal, taken, AI-classificatie+max. één reply, afsprakenstatus, basis-e-mailopvolging/opt-out, formuliermonitor, KPI's met datakwaliteit, branchetemplate personal trainer, onboarding, audit-/incidentlog.

**Should indien voldoende capaciteit:** eenvoudige quiz/calculator als leadmagnet, reviewtrigger, extra e-mailtemplate, selfservice-export, tweede brancheconfig.

**Later:** AI Growth, A/B-engine, complete campagne-attributie, uitgebreide workflow-builder, multi-channel inbox, geavanceerde marketingplatformintegraties, native ads, AI lead-score voorspellingen en de Website Quality Engine met Playwright.

## 13. Werkpakketindeling voor Codex (regie) en Claude Code (bouw)
Elke bouwopdracht krijgt: doel, gebruikersscenario, input/output, datacontract, security/privacycheck, foutpaden, tests en acceptatiecriteria.

**Volgorde van werkpakketten:**
- WP0: Legacy-audit + hergebruikmatrix.
- WP1: Productcontract, domeinmodel en eventcontracten.
- WP2: Tenant/gebruikersrechten en onboarding.
- WP3: Contact/lead/form submission.
- WP4: Deal/pipeline/taken en activity feed.
- WP5: AI-classificatie en antwoord-state machine.
- WP6: Afspraken + e-mail + consent en stopregels.
- WP7: Synthetische formuliermonitoring.
- WP8: Analytics/rapportage.
- WP9: Branchetemplate-configuratie en end-to-end pilot.
- WP10 (post-MVP): Playwright Website Quality Engine met testprofielen, bewijs, incidenten en veilige productie-/staginggrenzen.

**Gate na ieder werkpakket:** tests groen, relevante docs aangepast, geen extra ongevraagde functionaliteit, securitycheck en demo van de gebruikersflow.

## 14. Open productvragen (niet blokkeren voor conceptontwerp)
1. Definitieve standaardwebsite-omvang en CMS-editrechten.
2. Tarief, contractminimum, eigendom van websites en overdracht van data.
3. Support- en verzendlimieten per pakket.
4. Welke conversieevents zonder cookie-consent rechtmatig/technisch beschikbaar zijn.
5. Welke e-mailstromen een marketingtoestemming vereisen versus noodzakelijke servicecommunicatie.
6. Bestaande code waar effectief hergebruik aantoonbaar voordeel oplevert.
7. Of websitebuilder en CRM één product of twee onafhankelijk deploybare producten worden — bepalen bij stack-/architectuurkeuze.
8. Of toekomstige tenants eigen afzenderdomeinen en provideraccounts krijgen — uitwerken bij providerselectie.

## 15. Volgende stap: aparte stackbeslissing
**Niet nu implementeren op basis van een toevallige stack.** Na acceptatie van businessplan en functioneel ontwerp: architectuurvarianten vergelijken op eenvoud, hergebruik, tenantisolatie, operationele kosten, leverancierafhankelijkheid, snelheid van oplevering, monitoring, onderhoud en veiligheid. Pas daarna een beargumenteerd technology decision record en repo-/deploymentplan vaststellen.

### Definition of Done van de MVP
- Vijf betalende pilotklanten kunnen door dezelfde onboardingroute.
- Elke echte lead heeft traceerbare status; er gaat geen aanvraag stil verloren.
- AI verstuurt niet meer dan de toegestane automatische initiële reply en kan worden uitgezet.
- Taken en pipeline zijn voor ondernemer bruikbaar zonder trainingstraject.
- Formulierfouten worden gesignaleerd; tests vervuilen geen businessdata.
- Dashboard toont transparante KPI's met herkomst/ontbrekende data.
- Tenantdata blijft geïsoleerd en toestemming/afmelding wordt gerespecteerd.
- Werkelijke implementatie-, gebruiks- en supportkosten zijn gemeten en vastgelegd.

De Playwright Website Quality Engine is bewust geen MVP-acceptatiecriterium. De MVP bevat wel beperkte formuliermonitoring en testisolatie; de bredere klantwebsite-testlaag volgt pas na MVP-validatie.
