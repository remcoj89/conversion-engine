# Westend Digital Conversion Engine
## Fase 3 — Klantomgeving: UX-specificatie & wireframes v0.4

**Status:** concept ter productreview  
**Datum:** 17 oktober 2026  
**Bron:** Fase 2 — Requirements & Scope v1.0 en Fase 3 — Informatiearchitectuur v0.1  
**Scope:** Business Owner en Team Member; geen Westend Admin-omgeving in dit document.  
**Artefact:** `fase-3-klantomgeving-interactieve-wireframes-v0.4.html` (interactieve browserdemo met fictieve data, zonder backend).

> **UX-principe:** Acties vóór rapportages. De gebruiker ziet welke lead of taak aandacht nodig heeft en kan van het dashboard direct naar de bijbehorende opvolging.

## 1. Ontwerpbesluiten

| ID | Besluit | Consequentie |
|---|---|---|
| UX-01 | Eén klantomgeving voor Owner en Team Member | Menu, data en acties variëren op basis van rol; geen aparte applicatie. |
| UX-02 | Actiegericht startscherm | Bovenaan te behandelen leads en taken; daarna omzet- en conversiecijfers (alleen Owner) en formulierstatus. |
| UX-03 | Leads en contacten zijn verschillende entiteiten | Een contact kan meerdere lead-events en deals hebben; de aanvraag leidt naar de contactcontext. |
| UX-04 | AI-status is niet dezelfde status als leadopvolging | Toon expliciet `reactie verzonden/mislukt`, `reminder voorwaardelijk/gestopt` en menselijke overname. |
| UX-05 | Afspraken zijn alleen bevestigd na provider-event | Een getoonde boekingslink is nooit voldoende bewijs van een afspraak. |
| UX-06 | Desktop kanban, mobiele lijst per fase | Geen horizontaal afgekapt pipelineboard op een telefoon. |
| UX-07 | Responsive leadlijsten gebruiken kaarten | Alle informatie, inclusief de primaire actie, blijft zichtbaar zonder horizontaal scrollen. |
| UX-08 | De MVP blijft een product met vaste patronen | Geen vrije dashboardbuilder, pipelinebuilder, ticketing of klantgerichte AI-agentconsole. |

## 2. Navigatie en inhoud

### 2.1 Business Owner

| Primair menu | Inhoud | Meest voorkomende actie |
|---|---|---|
| Overzicht | Aandachtspunten, afspraken, kern-KPI's, technische formulierstatus | Open lead of taak |
| Leads & contacten | Filterbare aanvragen met contactcontext | Open aanvraag en handel af |
| Pipeline | Deals per fase, waarde en verantwoordelijke | Open deal en wijzig fase |
| Taken & afspraken | Open acties en bevestigde afspraken | Taak afronden |
| Resultaten | Leads, afspraken, gewonnen deals, geregistreerde ontvangsten | Resultaat interpreteren |
| Instellingen | Basisbedrijf, boekingslink, abonnementsstatus | Basisgegevens bijwerken |
| Support aanvragen | Categorie, omschrijving, bevestiging | Vraag of wijziging indienen |

**Detailroutes:** aanvraagdetail en dealdetail zijn contextschermen; geen extra hoofdmenu-items. De klant configureert niet zelf AI-prompts, websitecode, monitoringinstellingen of technische workflows.

### 2.2 Team Member

Ziet Overzicht, Leads & contacten, Pipeline, Taken & afspraken en Support. Alle commerciële records zijn beperkt tot **toegewezen** werkitems. De modules Resultaten en Instellingen zijn verborgen; geen organisatiebrede financiële waarden in kaarten, dealoverzichten of andere API-antwoorden. Zijn er geen toegewezen items, toon dan een bruikbare lege staat in plaats van onterechte organisatiegegevens.

**Security note:** role switching in het HTML-prototype simuleert alleen presentatie. Productie vereist server-side tenant-, rol- en recordautorisatie op iedere aanvraag.

## 3. Schermspecificaties

### S01 — Overzicht (actiegericht)

**Doel:** in maximaal enkele seconden bepalen wat opvolging nodig heeft.

**Volgorde:** 1) leads die aandacht vragen, 2) open taken, 3) bevestigde afspraken, 4) lijst directe opvolging, 5) commerciële statistieken (voor Owner), 6) technische formuliergezondheid.

**Interacties:** selecteer actie/lead; navigeer naar leaddetail; open taken; bekijk alle aanvragen. Leads zonder opvolgactie worden niet ten onrechte als urgent getoond. Frontendcontrole en volledige ketentest worden apart gepresenteerd; een groen frontendsignaal impliceert geen gezonde backend.

**Staten:** loading/skeleton, nul aandachtspunten, AI/mailincident, onbekende financiële data, verlopen monitoringsresultaat, serverfout met herproberen.

### S02 — Leads & contacten (aanvraaglijst)

**Doel:** aanvragen vinden, filteren en oppakken.

**Filters MVP:** Actie nodig (default), Alle, Afspraak, Nieuw en Afgehandeld. Zoek op naam of dienst. In echte bouw komt zoeken via een beveiligde query of serverfilter met debounce; schermen krijgen paginering zodra volumes oplopen.

**Rij/kaart:** naam, ontvangstdatum, interesse, bron, toegewezen eigenaar, opvolgstatus en Open-knop. Contactpersonen en afzonderlijke aanvragen worden niet samengevoegd tot één onduidelijke lijst.

**Staten:** geen aanvragen, geen zoekresultaten, toegang geweigerd, laadfout. Mobiel is een kaart met veldlabels en een zichtbare primaire actie; geen horizontale tabel.

### S03 — Leaddetail & menselijke handover

**Doel:** de context van een aanvraag begrijpen en de volgende actie nemen.

**Kernvelden:** contact, e-mail, interesse, bron, eigenaar, status, marketingtoestemming, AI-status, reminderstatus, contacttijdlijn en geadviseerde volgende actie.

**Acties:** `Neem over` stopt de automatische vervolgstappen; `Maak taak` koppelt een actie aan de aanvraag; `Maak deal` of `Bekijk deal` toont de verkoopkans. In productie moeten deze wijzigingen worden bevestigd door backend-events en gelogd.

**Regels:** hoogstens één inhoudelijke AI-reactie; een reminder is alleen toegestaan bij betrouwbare inbound-detectie en juridische grondslag; klik op Calendly-link is geen afspraak. Wanneer AI/mail faalt, blijft de lead zichtbaar voor menselijke afhandeling.

**Staten:** nog niet geclassificeerd, AI bezig, reactie verzonden, mislukt, handmatig overgenomen, onduidelijk, spam/urgent, afgemeld, geen toestemming, geen toegang.

### S04 — Pipeline & deal

**Doel:** verkoopkansen verplaatsen en de uitkomst registreren.

**Fases in prototype:** Nieuw, Gekwalificeerd, Afspraak, Voorstel, Gewonnen; `Verloren` is bereikbaar via de deal. Productie gebruikt branchetemplate-fases en vastgelegde uitkomstredenen zonder een vrije builder.

**Desktop:** kanban-lanes; klik opent detail. **Mobiel:** verticale lijsten per fase met volledige dealnamen. Geen drag-and-drop verplicht in de MVP: selecteren en opslaan is veiliger en toegankelijker.

**Owner-dealdetail:** fase en contractwaarde, handmatig bevestigde ontvangsten, restant contractwaarde (expliciet **geen** openstaande factuur), datum en registratieactie. **Team Member:** mag alleen toegewezen deals wijzigen, zonder organisatiebrede financiële cijfers; fijnmazige toegang tot dealwaarde moet vooraf worden bevestigd.

**Staten:** geen deals, verloren deal, annulering, geen betaling, betalingscorrectie (later expliciet ontwerp), onbevestigde afspraak, ontoegankelijk record.

### S05 — Taken & afspraken

**Doel:** menselijke opvolging afhandelen nadat AI heeft geclassificeerd of een herinnering niet mogelijk is.

**Acties:** eigen of toegewezen taak afronden, gekoppelde aanvraag openen; afspraak zien alleen wanneer provider bevestiging heeft gegeven. Heropenen en deadlines wijzigen horen bij productiefunctionaliteit, maar zijn nog niet volledig in de demo uitgewerkt.

**Staten:** geen taken, verlopen taak, taak geannuleerd, afspraak verplaatst/geannuleerd, provider niet beschikbaar.

### S06 — Resultaten, Instellingen, Support (ondersteunende schermen)

- **Resultaten (Owner):** leads, bevestigde afspraken, gewonnen contracten, handmatig geregistreerde ontvangsten; CAC/LTV alleen wanneer brondata compleet is. Geen verzonnen ROI.
- **Instellingen (Owner):** bedrijfscontactgegevens, boekingslink, abonnementstatus. Geen technische prompts of websitecode.
- **Support (Owner + Team):** categorie `technisch probleem`, `vraag`, `websitewijziging`; omschrijving en later bijlage indien toegestaan. Via centrale supportinbox, nog geen intern ticketsysteem. Bij structureel werk: scopebeoordeling en akkoord op meerwerk vóór uitvoering.

## 4. Gebruikersflows

| Flow | Start | Kritieke stappen | Succesbewijs |
|---|---|---|---|
| F3-C01 Lead aanpakken | Dashboard actie vereist | Lead openen → AI/historie lezen → Neem over / Maak taak | Opvolging gelogd en niet meer geautomatiseerd |
| F3-C02 AI-uitval | AI-reactie mislukt | Lead zichtbaar → prioriteit handmatig → taak | Geen verdwenen aanvraag of onjuiste succesbadge |
| F3-C03 Deal afronden | Pipeline | Deal → fase Gewonnen → contractwaarde controleren → ontvangst registreren | Contractwaarde en ontvangst correct onderscheiden |
| F3-C04 Team Member | Teamlogin | Alleen toegewezen leads/deals/taken | Geen resultaat- of instellingenmenu; API weigert onbevoegde toegang |
| F3-C05 Support | Support aanvragen | Categorie → omschrijving → indienen | Aanvraag aan juiste tenant gekoppeld; bevestiging zonder fake ticketnummer |
| F3-C06 Responsive | Telefoon | Menu openen → leadkaart → detail → actie | Geen afgekapt veld of primaire knop; geen horizontale pagina-overflow |

## 5. Visuele hiërarchie en patroonbibliotheek

1. **Primaire aandacht:** acties met status, verantwoordelijke en volgende stap.
2. **Context:** kaart van het contact en een chronologische activiteitentijdlijn.
3. **Bewijs:** ontvangen afspraakprovider-event, AI verzendstatus en geteste formulieren.
4. **Management-KPI's:** alleen zichtbaar wanneer bevoegd en wanneer gegevens werkelijk beschikbaar zijn.
5. **Technische status:** aparte frontend-/backendketenstatus, inclusief laatst geverifieerde tijd en onbekend/verlopen.

Gebruik consistente statussen: `Actie nodig`, `Handmatig behandelen`, `Afspraak gepland`, `Afgehandeld`; AI krijgt aparte statussen `Niet gestart`, `Bezig`, `Verzonden`, `Mislukt`, `Overgenomen`. Gebruik tekst naast kleur. Maak buttons herkenbaar en toetsenbordbedienbaar. Bij gegevensmutaties zijn bevestiging, foutmelding en herstelpad noodzakelijk.

## 6. Responsief gedrag

| Breedte | Navigatie | Leads | Pipeline | KPI's |
|---|---|---|---|---|
| Desktop | Vaste zijbalk | Tabel met zichtbare actie | Kanban-kolommen | Maximaal vier kaarten per rij |
| Tablet | Compactere zijbalk/afmetingen | Tabel of compacte lijst | Scrollbaar board waar zinvol | Twee kaarten |
| Mobiel | Uitklapbaar menu, rolwissel alleen prototype | Verticaal gestapelde kaarten | Verticale lijsten per fase | Eén kaart per rij |

Mobiele prioriteit: taak afhandelen zonder zoomen of horizontaal scrollen; labels blijven bij hun waarden zichtbaar. Het prototype is getest op viewportbreedte 390 px zonder documentbrede overflow.

## 7. Prototypevalidatie (17 oktober 2026)

**Uitgevoerd:** Chromium/Playwright met lokale HTML-injectie en fictieve data, omdat lokale file/HTTP-navigatie door de testomgeving geblokkeerd werd. Geteste acties: dashboard openen; mobiele menunavigatie; rolwissel Owner/Team; afgeschermde menu-items; toegewezen leads; mobiel pipeline-overzicht; lead openen; menselijke overname; taak creëren; pipelinefase wijzigen; ontvangst handmatig registreren. Geen JavaScript-excepties in geteste flows. Desktopviewport 1440 × 900, mobiele viewport 390 × 844.

**Niet bewezen:** productieautorisatie, backend-persistentie, werkelijke AI-/mailafhandeling, boekingswebhooks, echte omzetdata, toegankelijkheidsaudit en gebruikerstests met klanten. Die horen bij implementatie- en acceptatietests.

## 8. UX-acceptatiecriteria

| ID | Voorwaarde |
|---|---|
| UX-AT-01 | Owner ziet actiepunten vóór rapportages. |
| UX-AT-02 | Van startscherm naar een individuele lead maximaal twee acties. |
| UX-AT-03 | Een manuele overname is expliciet zichtbaar en pauzeert verdere automatische opvolging. |
| UX-AT-04 | AI-verzending en leadstatus zijn afzonderlijk zichtbaar. |
| UX-AT-05 | Team Member ziet geen organisatiebrede financiële metrics of onbevoegde records. |
| UX-AT-06 | Toegang tot records wordt in productie op de server afgedwongen. |
| UX-AT-07 | Onbekende betalingen, CAC/LTV of ontbrekende providerstatussen worden niet als succesvol/€0 voorgesteld. |
| UX-AT-08 | Een boekingslink zonder bevestigd provider-event is geen afspraak. |
| UX-AT-09 | Mobiel: geen afgeknipte hoofdactie of documentbrede horizontale scroll. |
| UX-AT-10 | Technische formulierstatus toont frontend en echte ketentest afzonderlijk. |
| UX-AT-11 | Supportformulier verstuurt naar centrale inbox; de MVP toont geen niet-bestaand ticketsysteem. |
| UX-AT-12 | Alle mutaties geven succes- of foutfeedback; productie schrijft een audit/eventlog. |

## 9. Open ontwerpbeslissingen voor review

1. **Teamrechten:** mag een medewerker een dealwaarde zien, of moet die altijd verborgen blijven? Voor het prototype is geld verborgen; dit kan per branche anders uitpakken.
2. **Taken:** mogen medewerkers zelf nieuwe taken aanmaken voor collega's of uitsluitend eigen taken beheren?
3. **Leadoverdracht:** toont 'Neem over' een bevestigingsdialoog voor de automations worden gestopt?
4. **Omzet:** wordt ontvangen betaling in een dialoog ingevoerd met verplichte datum en omschrijving? Aanbevolen vanwege risico op vergissingen.
5. **Dashboard:** welke informatie ziet een ondernemer bij 0 leads / 0 bezoekers? Maak dan concrete onboardingadviezen zichtbaar, niet alleen lege KPI-kaarten.
6. **Monitoring:** wat krijgt de ondernemer te zien bij een ketenstoring? Advies: korte begrijpelijke melding, details en technische logs alleen voor Westend.

## 10. Volgende ontwerpstap

Na review van dit klantenprototype: **Westend-beheeromgeving** (operations, klanten/onboarding, websites, monitoring en AI-configuratie), gevolgd door de aanvullende onboardingwizard Q1–Q4 en definitieve UX-acceptatie. Daarna starten Fase 4 systeemarchitectuur en Fase 5 techstackkeuze.

**Scopegrens:** dit document is geen werkende SaaS en bevat geen definitieve frontendframework- of databasekeuze.


---

# Addendum v0.4 — Websiteprestaties, AI-zichtbaarheid en rechten

**Status:** UX-ontwerpuitbreiding, vastgesteld als voorliggende ontwerpversie; nog geen productie-integraties.  
**Bron:** aanvullende productbesluiten in Fase 3, oktober 2026.  
**Impact:** klantnavigatie, dashboardoverzicht, resultaten, instellingen, adviseringsflow en integraties.

## 1. Nieuwe navigatie en schermen

- **Overzicht:** een compacte preview met actieve gebruikers (GA4), organische klikken (Search Console) en open aanbevelingen. Alle belangrijke leadacties blijven hoger op het scherm staan.
- **Websiteprestaties:** nieuwe hoofdnav-pagina voor Business Owner met tabs **Overzicht**, **SEO & zoekwoorden**, **Gedrag (Clarity)**, **AI-zichtbaarheid**; periodeselectie 7/30/90 dagen; bron- en statuslabels. Team Member heeft deze pagina niet in de MVP.
- **Resultaten:** behoudt commerciële KPI's uit CRM, zoals leads, afspraken, deals en handmatig geregistreerde betalingen. Geen tweede, overlappende omzetregistratie in Websiteprestaties.
- **Instellingen:** een organisatiebrede schakelaar voor het tonen van **waarde van toegewezen deals** aan Team Members; standaard **uit**. In de interface en servercontrole gescheiden van algemene financiële rapporten en betalingen.

## 2. Databronnen en verantwoord datagebruik

| Bron | Indicatieve gegevens in Websiteprestaties | Betrouwbaarheids- en productgrens |
|---|---|---|
| Google Analytics 4 | Actieve gebruikers, verkeersbronnen, pagina's, events | GA4-data zijn webmetingen; identificeer events niet zomaar als gevalideerde CRM-leads. |
| Google Search Console | Klikken, vertoningen, CTR, zoekopdrachten, pagina's | GSC omvat Google Search-performance, geen totale vraag in de markt. |
| Microsoft Clarity | Rage clicks, dead clicks, scrolldiepte, gedragsfrictie | Export API levert beperkte datavensters (1–3 dagen); 30/90 dagen vergt eigen geplande aggregatie. Opnamen en heatmaps niet automatisch als volledige API-data presenteren. Privacy- en consentinstellingen zijn noodzakelijk. |
| DataForSEO Keywords & SERP | Zoekvolume (schatting), verwante queries, SERP/onderwerpverkenning | DataForSEO is marktdata, geen werkelijk aantal bezoeken of zoekklikken. Per opdracht API-kosten loggen en begrenzen. |
| DataForSEO LLM Mentions | Merk-/domeinvermeldingen in geselecteerde ChatGPT- en Google AI Overview-datasets | Steekproef of afgebakende dataset, afhankelijk van taal, plaats, platform en onderwerp. Niet presenteren als volledige AI-zichtbaarheid of gegarandeerde citaties. |
| GA4 AI-referrals (aanvullend) | Verwijzingen vanaf herkende AI-traffic-bronnen | Alleen meetbare verwijzingen, niet alle AI-vermeldingen. |

**AI-citaties in Clarity:** Microsoft biedt een AI Citations-dashboard aan; toegang tot identieke cijfers via de algemene Clarity Export API is **niet vastgesteld**. Een externe deep-link of losse verificatie volgt; geen fictieve API-koppeling bouwen.

**Bronbeleid:** iedere widget in productie toont bron, periode, synchronisatietijd, meetdefinitie en status: `beschikbaar`, `verouderd`, `niet verbonden`, `niet ondersteund` of `fout`. Geen data -> `Niet beschikbaar`, nooit onterecht `0`.

## 3. Maandelijks adviesrapport

**Workflow:** data ophalen → normaliseren → signalen afleiden → prioriteren → inhoudelijk adviesconcept → Westend-review → publiceren/aanbieden aan klant.

Ieder advies bevat minimaal:

1. **Wat is waargenomen?** Specifiek signaal met bron, rapportperiode en data voor beoordeling.
2. **Hypothese.** Waarom een wijziging mogelijk helpt; onzekerheid en randvoorwaarden benoemen.
3. **Voorgestelde actie.** Bijvoorbeeld blog over een geverifieerde zoekvraag, metatitel herschrijven, formulierfrictie onderzoeken.
4. **Prioriteit.** Verwachte waarde, inspanning en bewijskwaliteit; geen verzonnen impactscore.
5. **Afhandeling.** Inzien; wijziging aanvragen via bestaand supportformulier, met automatische invulling van de aanbeveling; Westend bepaalt scope/meerwerk.

Het prototype kan een **fictief voorbeeldrapport in Markdown** downloaden. Dat is geen live AI-gegenereerd rapport. Productie vereist brondata, kwaliteitscontrole en een gedocumenteerde goedkeuringsstap; adviezen worden in het Basisabonnement niet automatisch toegepast.

## 4. Uitbreiding rechtenmodel

- Alleen Business Owner kan de instelling **teamDealValues** wijzigen. Standaard `false`.
- Team Member mag ook bij `true` uitsluitend de waarde bekijken van eigen/toegewezen deals; geen bedragen van niet-toegewezen deals, betalingen, cumulatieve omzet, marges of abonnementkosten.
- Team Member mag nooit de instellingspagina openen of rechtstreeks via een API de bevoegdheid wijzigen.
- Deze MVP-wireframe simuleert autorisatie in de browser; productie vraagt server-side RBAC/recordchecks, tests op ID-manipulatie en audits van wijziging.

## 5. Wireframeinteracties v0.4

- Navigatie Websiteprestaties toevoegen; toegankelijk op desktop en mobiel voor Business Owner.
- Selectie van 7, 30 of 90 dagen past de demonstratie-KPI's en fictieve grafiek aan.
- Tabselectie toont verschillende bronnen: totaalbeeld, GSC + DataForSEO, Clarity, AI-vermeldingen.
- Aanbeveling uitklappen toont onderbouwing, hypothese en actie; **Vraag uitvoering aan** opent het al bestaande supportformulier met een vooraf ingevuld concept.
- Voorbeeldrapport downloadt lokaal als `.md`, met prominente waarschuwing dat de data fictief zijn.
- De instelling 'dealwaarde aan medewerkers tonen' is in de demo interactief; rolwissel demonstreert het effect.

## 6. Aanvullende acceptatiecriteria

| ID | Acceptatiecriterium |
|---|---|
| UX-PERF-01 | Business Owner kan Websiteprestaties binnen één klik vanuit het menu openen. |
| UX-PERF-02 | Dashboard toont GA4, Search Console, Clarity, DataForSEO en AI-mentions als **afzonderlijke bronnen**, zonder samenvoegen van onvergelijkbare tellingen. |
| UX-PERF-03 | Ontbrekende of verouderde productiebronnen krijgen een expliciete status, geen fictief nulresultaat. |
| UX-PERF-04 | Zoekvolume van DataForSEO is herkenbaar een schatting en niet vergelijkbaar met GSC-vertoningen alsof dit dezelfde metriek is. |
| UX-PERF-05 | AI-vermeldingen tonen platform, geografische/taalafbakening, peildatum en methode wanneer gekoppeld. |
| UX-PERF-06 | Clarity-data worden voor langere perioden opgeslagen/geaggregeerd volgens periodieke snapshots binnen retentie- en consentbeleid. |
| UX-PERF-07 | Maandrapport bevat bronverwijzing, signaal, hypothese, actie, prioriteit en Westend-goedkeuring. |
| UX-PERF-08 | Klant kan advies bekijken en een verzoek starten; uitvoeren/publiceren gebeurt niet autonoom. |
| UX-PERF-09 | Team Member ziet geen Websiteprestaties/Resultaten, behalve specifiek toegewezen commerciële gegevens binnen het toegangsbeleid. |
| UX-PERF-10 | Owner kan inzage in toegewezen dealwaarden aan- of uitzetten; Team Member ziet nooit betaling of totale bedrijfsomzet. |
| UX-PERF-11 | Voor de prototypes wordt uitdrukkelijk vermeld dat alle cijfers fictief zijn; er worden geen live API-aanroepen gedaan. |
| UX-PERF-12 | Mobiele websiteprestatiepagina heeft geen horizontale viewportoverloop bij 390 px breedte. |

## 7. Aandachtspunten voor Fase 4–5

- OAuth/toegang voor GA4 en Search Console per tenant, domeinverificatie en veilige tokenopslag.
- Clarity Project API token per tenant; exports maximaal drie dagen per aanvraag; ingest en historische snapshots.
- DataForSEO één beheerd Westend-account met per-tenant kostenregistratie, API-budgetten, rate limiting en retries; geen API-key naar browser of klantsite.
- LLM Mentions/AI Optimization alleen op afgesproken prompts/zoekonderwerpen en instelbare sampling; kosten en methode monitoren.
- Recommendation Engine **geen autonome contentpublicatie** in Basis; AI mag gestructureerd advies voorstellen met menselijke accordering.
- Raadpleeg de contractuele MVP-baseline vóór definitieve P0/P1-indeling: volledige kosten en werkelijke integratiecomplexiteit moeten nog worden doorgerekend. Deze UX-uitbreiding alleen betekent niet dat alle databronnen al productie-gereed zijn.

### Officiële technische bronnen (geraadpleegd 17 oktober 2026)

- DataForSEO LLM Mentions API — https://docs.dataforseo.com/v3/ai_optimization-llm_mentions-overview/
- DataForSEO Keywords Data — https://docs.dataforseo.com/v3/keywords_data/overview/
- Microsoft Clarity Data Export — https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api
- Microsoft Clarity AI Citations Dashboard — https://learn.microsoft.com/en-us/clarity/ai-visibility/citations-dashboard
- Google Analytics Data API — https://developers.google.com/analytics/devguides/reporting/data/v1
