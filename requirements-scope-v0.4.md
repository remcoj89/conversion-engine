# Westend Digital Conversion Engine — Requirements & Scope v0.4

**Status:** functionele specificatie — productbesluiten bevestigd, technische keuzes open  
**Fase:** 2 — Requirements & Scope  
**Basis:** Product Discovery v0.3, hybride beheermodel  
**Datum:** 17 oktober 2026  
**Volgende stap:** UX-flows/wireframes, daarna architectuur en stackkeuze

## 1. Vastgestelde productbesluiten

| Onderwerp | Besluit | Consequentie |
|---|---|---|
| Betalingen en abonnementen | **Extern factureren in MVP** | Platform registreert uitsluitend plan, status en ingangs-/einddata; geen eigen checkout, betaalkaartgegevens of factuurgenerator. |
| Leadmagnet | **Drie ondersteunde types uit één gestandaardiseerde module: quiz, calculator, download** | Per klantwebsite in MVP maximaal één actieve leadmagnet. Westend kiest en configureert het type; geen vrije funnelbuilder. |
| Teamgebruik | **Business Owner + eenvoudige Team Member** | Eigenaar beheert organisatie en toewijzing; teamlid ziet alleen toegewezen commerciële werkitems. |
| Beheermodel | **Hybride** | Ondernemer beheert commerciële administratie; Westend beheert techniek en complexe automatisering. |
| Websitecontent | **Beheerd in MVP** | Klant kan later via Sanity copy en beelden wijzigen; CMS-geschikte contentstructuur nu voorbereiden, zonder selfservice-editor te bouwen. |
| Interne support | **Ticketdashboard na MVP** | Tijdens MVP verzoeken via bestaand extern kanaal en handmatige registratie. |
| Blog / Growth | **Na MVP** | Bestaande n8n-bloggenerator later auditen; SEO/GEO, A/B-testen en Ads niet in eerste release. |
| Follow-up | **Hybride: maximaal één vooraf goedgekeurde herinnering plus CRM-taak** | Alleen na rechtmatigheidscheck en met betrouwbare stopregels; geen autonome AI-opvolgconversatie. |

**Terminologie.** Tenant = klantorganisatie. Contact = persoon. Lead = specifieke inkomende interesse/aanvraag. Deal = verkoopkans met pipelinefase. Activity = gebeurtenis op een contact of deal. Automation = geconfigureerde reactie op een gebeurtenis.

## 2. Productdoelen en succescriteria

**Hoofddoel:** iedere geldige lead betrouwbaar vastleggen, tijdig behandelen, naar de juiste eigenaar/routering sturen en inzichtelijk maken of deze leidt tot een afspraak en verkoop.

**MVP-validatie:** vijf betalende bedrijven; maximaal 3 uur actieve websitebouw en 1,5 uur onboarding als te toetsen streefwaarden; iedere geldige aanvraag traceerbaar; geen dubbele verzending bij herhaalde events; veilige scheiding tussen klanten; ondernemers kunnen zelfstandig pipeline en taken beheren.

**Niet beloven:** gegarandeerd meer verkeer, gegarandeerd meer klanten, volledig autonome sales, betrouwbare omzetattributie zonder ingevoerde deal-/kosteninformatie.

## 3. Rollen, omgevingen en toegang

### 3.1 Rollen

- **Platform Admin (Westend):** tenant provisionen, abonnementstatus registreren, website/configuratie beheren, technische problemen onderzoeken, geautoriseerde supportacties uitvoeren. Klantinhoud is niet standaard vrij toegankelijk; gevoelige supporttoegang is doelgebonden en wordt gelogd.
- **Business Owner:** eigen organisatie, eigen teamleden, contacten, deals, taken, afspraken, bedrijfsspecificaties en meetgegevens beheren. Kan geen AI-systeemprompts, deploys of andere tenants wijzigen.
- **Team Member:** toegewezen contacten/deals en eigen taken behandelen, relevante activiteiten registreren. Geen tenant-instellingen of volledige financiële rapporten.

### 3.2 Rollenmatrix (MVP)

| Actie | Platform Admin | Owner | Team Member |
|---|---|---|---|
| Tenant activeren/schorsen | Ja | Nee | Nee |
| Gebruikers uitnodigen/uitschakelen | Alleen initiële provisioning/herstel | Ja | Nee |
| Contacten en deals lezen/schrijven | Bij expliciete supporttoegang | Eigen tenant | Toegewezen records |
| Omzet en campagnerapporten | Geautoriseerd support | Ja | Nee |
| Taken/afspraken | Geautoriseerd support | Alle eigen tenant | Toegewezen |
| Bedrijfsnaam, diensten, boekingslink | Technische inrichting | Basisvelden | Nee |
| Automatiseringslogica en AI-beleid | Ja | Nee | Nee |
| Website publiceren | Ja | Nee | Nee |
| Abonnementsstatus instellen | Ja | Alleen inzien | Nee |

**Security-invariant:** elke request wordt server-side geautoriseerd op tenant, rol en waar nodig recordtoewijzing. Geen vertrouwelijkheid op basis van frontendfilters.

## 4. Scope: prioriteiten

- **P0 — launch blocker:** nodig voor eerste werkende klantreis, veiligheid en betrouwbaarheid.
- **P1 — pilot gewenst:** belangrijk voor commerciële waarde; kan beperkt of handmatig worden uitgevoerd zolang de kernflow intact blijft.
- **P2 — post-MVP:** nu niet implementeren, hooguit uitbreidbare interface/data-afspraak voorzien.

### 4.1 MVP inbegrepen

Tenant en rollen; onboardingconfiguratie; website-starter; één actieve leadmagnet (keuze uit quiz, calculator of download); capture en antimisbruik; CRM-contacten/leads/deals; pipeline en taken; één gecontroleerde AI-eerste reactie; handover; Calendly-link met bevestigde boekingswebhook indien gekoppeld; eenvoudige follow-upregels; opt-out; contactformuliermonitoring; basisdashboard; maandelijks rapport; eenvoudige reviewaanvraag; extern bijgehouden abonnementstatus.

### 4.2 Buiten MVP

Selfservice Sanity-publicatie; ticketdashboard en AI-taakplanning; uitgebreide marketing/newslettermodule; visuele automationbuilder; meerdere gelijktijdig actieve leadmagnets per klant, vrije quiz-/rekenregelbuilders; automatische blogpublicatie; autonome SEO/GEO/CRO; A/B-testplatform; Ads-beheer; ingebouwde payment provider; eigen helpdesk.

## 5. End-to-end user journeys

### J01 — Prospect wordt klant van Westend Digital

**Actor:** Westend Sales / prospect. **Start:** geschikte prospect geïdentificeerd.

1. Westend kwalificeert prospect en gebruikt een toegestaan acquisitiekanaal.
2. Prospect krijgt een persoonlijk probleem/verbeterpunt en kan interesse aangeven.
3. Bij interesse toont Westend een voorbeeld van de landingspagina, inclusief korte VSL en heldere scope.
4. Prospect kan een intake boeken; Westend bespreekt aanbod, tarieven, verantwoordelijkheden en meerwerkgrenzen.
5. Westend verstuurt buiten het platform de offerte/contract en factuur of betaalverzoek.
6. Na bevestigde overeenkomst en betaling/afgesproken startdatum maakt Platform Admin de tenant aan en kiest het pakket.
7. Prospect wordt Business Owner en krijgt een veilige uitnodiging voor onboarding.

**Alternatieven:** geen interesse → stop of geldige later-opvolging; interesse zonder beslissing → handmatige salesfollow-up; betaling ontbreekt → tenant niet activeren; bestaande klant → geen tweede tenant zonder expliciete beslissing.

**Acceptatie:** platform hoeft geen betalingsinformatie te bewaren; status `pending`, `active`, `past_due` of `suspended` is zichtbaar en alleen door Westend instelbaar. Verkoopproces zelf kan in eerste MVP buiten platform plaatsvinden.

### J02 — Onboarding en websiteoplevering

**Actor:** Platform Admin en Business Owner. **Start:** actief contract.

1. Owner vult vier vragenlijsten in: (Q1) kickoff en bedrijfsverhaal, (Q2) doelgroep, (Q3) aanbod, (Q4) bestaande branding, assets en websitegegevens. Nieuwe branding en professionele fotografie zijn optioneel meerwerk.
2. Westend beoordeelt volledigheid en vraagt ontbrekende gegevens op.
3. Westend kiest branchetemplate en initialiseert standaardpipeline, formulieren, AI-kennisconfiguratie en **één actief exemplaar van quiz, calculator of download**.
4. Westend produceert website op basis van startercomponenten, werkt content en beeld uit en voert technische/inhoudelijke controles uit.
5. Westend configureert e-maildomein, verzendprovider, formulierwebhook, boekingsintegratie indien gebruikt, monitoring en metingen.
6. Stagingacceptatie: Owner beoordeelt content en aanbod; Westend beoordeelt technische werking.
7. Na akkoord publiceert Westend de website en test de volledige leadflow met een herkenbare testaanvraag.
8. Owner ontvangt toegang tot dashboard en korte instructie voor leads/deals/taken.

**Alternatieven:** incomplete onboarding → `blocked`; domeinverificatie mislukt → geen live e-mail; testformulier faalt → niet publiceren; klant wil extra functionaliteit → change request buiten scope.

**Acceptatie:** checklist voor livegang 100% voltooid; testlead zichtbaar met correcte tenant en trace; maximaal één actieve leadmagnet (alle drie de types ondersteund in het platform); bouwtijd/onboardinguren worden gemeten, niet aangenomen.

### J03 — Bezoeker wordt lead en krijgt eerste opvolging

**Actor:** websitebezoeker, systeem, ondernemer.

1. Bezoeker verzendt formulier of één leadmagnet.
2. Server valideert schema, consent, honeypot/rate limit, herkomst en request-ID.
3. De geldige aanvraag wordt duurzaam opgeslagen vóór eventuele AI- of e-mailactie.
4. Contact wordt veilig gekoppeld (tenant-specifieke deduplicatie), aanvraag als nieuw lead-event vastgelegd.
5. AI beoordeelt intentie via expliciet begrensde categorieën en bedrijfskennis; bij lage zekerheid gaat lead naar menselijke review.
6. Toegestane eerste inhoudelijke reactie wordt samengesteld en verzonden; optioneel met boekingslink. Maximaal één AI-inhoudelijke reply per leadconversatie.
7. CRM ontvangt activiteit, toegewezen eigenaar en vervolgtaak waar nodig.
8. Ondernemer ziet leadstatus en of verzending daadwerkelijk bevestigd is.

**Alternatieven:** spam → veilig markeren; sales outreach → afwijzen volgens template of geen antwoord; klacht/urgent → menselijk escaleren; AI down → opslaan en alarmeren; mail onduidelijk → `send_unknown` en niet blind dubbel versturen; replay → geen dubbele lead-event/verzending.

**Acceptatie:** geen aanvraagverlies wanneer externe AI/e-mail tijdelijk faalt; idempotente verwerking; veilige promptinput; iedere uitgaande mail heeft controleerbare status.

### J04 — Afspraak, pipeline en verkoop

**Actor:** Owner/Team Member.

1. Nieuwe gekwalificeerde lead verschijnt in `Nieuw` of `Gekwalificeerd`.
2. Owner wijst lead toe aan zichzelf of teamlid, of standaardrouting doet dit.
3. Bevestigde boekingswebhook creëert/koppelt afspraak en beweegt deal naar `Afspraak gepland` wanneer regel van toepassing is.
4. Medewerker registreert gespreksuitkomst en volgende taak; status blijft transparant.
5. Bij `Voorstel` kan een contextuele follow-up starten indien toegestaan.
6. Bij `Gewonnen` voert bevoegde gebruiker gerealiseerde dealwaarde en eventuele terugkerende waarde in; verkoopsequentie stopt.
7. Bij `Verloren` wordt een reden vastgelegd en verdere verkoopopvolging gestopt.

**Alternatieven:** annulering/herplanning → status corrigeren; webhook replay → één afspraak; afspraak zonder match → reviewqueue; medewerker verliest toegang → records opnieuw toewijzen.

**Acceptatie:** historie blijft behouden bij pipelinewijziging, geen verkoopautomatisering bij `Gewonnen`, `Verloren` of opt-out.

### J05 — Opvolging en reviewverzoeken

**Actor:** Automation Engine, Owner.

1. Templateworkflow start vanuit een ondersteund event, bijvoorbeeld lead nog zonder reactie of traject afgerond.
2. Check vóór verzending: tenant actief, contactkanaal geldig, toestemming/grondslag passend, geen stopconditie en geen recent equivalent bericht.
3. Bericht wordt volgens template verzonden en als activiteit geregistreerd.
4. Bij reply, opt-out, boeking of gewonnen/verloren deal stopt of pauzeert de relevante workflow.
5. Reviewverzoek gebeurt alleen op passende gebeurtenis en frequentie; geen review-gating of selectie op alleen positieve beoordeling.

**Alternatieven:** providerfout → retry met limiet; bounce → kanaal pauzeren; klant wijzigt toestemming → direct stoppen; menselijke reactie → automatisch pauzeren.

**Acceptatie:** klant krijgt geen marketing zonder geldige grondslag, opt-out werkt tenantbreed en wordt aantoonbaar verwerkt.

### J06 — Monitoring, maandrapport en wijzigingsverzoek

**Actor:** Westend, Owner.

1. Monitor voert geplande front-end formuliertests uit met testmarkering; end-to-end verzending wordt met afzonderlijke frequentie en limieten getest.
2. Fout wordt geregistreerd, gededupliceerd en naar Westend gemeld.
3. Dashboard toont websitebezoek (indien meetbaar), leads, afspraken, gesloten deals en omzet, met periode en brondefinitie.
4. Maandrapport toont veranderingen, datakwaliteit, incidenten en aanbevelingen; geen causale claims zonder bewijs.
5. Owner verzoekt een structurele websitewijziging via bestaand kanaal.
6. Westend beoordeelt scope: inbegrepen of meerwerk; bij meerwerk eerst offerte en expliciet akkoord.
7. Na uitvoering test en documenteert Westend de wijziging.

**Alternatieven:** analytics ontbreekt → `onbekend` tonen; formuliertest is testlead → uitsluiten uit conversiecijfers; te weinig data → geen significante CRO-claim; incident niet reproduceerbaar → status met bewijs.

**Acceptatie:** rapport rekent geen onbekende omzet als nul, monitoringalarmering bereikt Westend, meerwerk wordt niet zonder akkoord uitgevoerd.

## 6. Business rules (normatief)

| ID | Regel | Prioriteit |
|---|---|---|
| BR-01 | Elke tenant heeft eigen logische data-isolatie; iedere query is op tenant en bevoegdheden begrensd. | P0 |
| BR-02 | Alleen Westend beheert technische prompts, automatiseringsdefinities en websites. | P0 |
| BR-03 | Owner kan gebruikers binnen eigen tenant beheren; Team Member alleen toegewezen werkitems. | P0 |
| BR-04 | Een klantwebsite heeft in MVP maximaal één actieve leadmagnet, gekozen uit de vaste types `quiz`, `calculator` of `download`; details in §13–18. | P0 |
| BR-05 | Nieuwe aanvragen worden opgeslagen voordat AI of e-mail wordt aangeroepen. | P0 |
| BR-06 | Identieke event-ID's hebben maximaal één duurzame verwerking en één verzendpogingketen; retries zijn idempotent. | P0 |
| BR-07 | AI verstuurt maximaal één inhoudelijke automatische reactie per leadconversatie; vervolgreacties naar mens. | P0 |
| BR-08 | Gevoelige, urgente, onduidelijke of misbruikgevoelige aanvragen worden geëscaleerd; AI doet geen ongeverifieerde toezeggingen. | P0 |
| BR-09 | Toestemming en afmeldstatus worden met bron en tijd geregistreerd; marketing flows volgen toepasselijke wetgeving. | P0 |
| BR-10 | Bevestigde boekingen komen uit een geverifieerde provider-event, niet uit het tonen van een boekingslink. | P0 |
| BR-11 | Won/verloren, reactie, bounce en opt-out activeren expliciete stop-/pauzeregels. | P0 |
| BR-12 | Alleen handmatig bevestigde of gevalideerde verkopen tellen als gerealiseerde omzet. | P0 |
| BR-13 | Onbekende marketingkosten of omzet worden als onbekend getoond, niet als nul. | P0 |
| BR-14 | Testaanvragen en monitorverkeer worden herkenbaar geregistreerd en uitgesloten uit commerciële KPI's. | P0 |
| BR-15 | Facturatie is extern; platform bewaart uitsluitend commercieel plan en abonnementsstatus. | P0 |
| BR-16 | Websitewijziging buiten afgesproken scope vereist offerte en expliciete goedkeuring vooraf. | P1 |
| BR-17 | Publicatie alleen na controle van formulieren, CTA's, basisseo, tracking, mobiele weergave en terugvalscenario's. | P0 |
| BR-18 | Supporttoegang van Westend tot klantcontent heeft doel, beperkte duur en auditspoor. | P0 |
| BR-19 | Elke automation heeft status, eigenaar, limiet, logs, handmatige stop en veilige retries. | P0 |
| BR-20 | Reviewverzoeken zijn neutraal en worden niet op basis van verwachte beoordeling gefilterd. | P1 |

## 7. Module requirements en acceptatiecriteria

### M01 — Platform Core

**P0:** tenant provisioning; rollen en veilige uitnodigingen; account recovery; tenantcontext op iedere API; plan/statusvelden; configureerbare accountblokkade; audit van admin- en toestemmingsacties.  
**P1:** owner uitnodigen/uitschakelen teamleden; basisorganisatiesettings.  
**Niet:** betalingscheckout, factuurgenerator, resellerstructuur.

**Acceptatie:** Team Member uit tenant A kan ook met gewijzigde identifiers geen records van tenant B zien; geschorste tenant verzendt geen nieuwe commerciële automatiseringen; toegangwijzigingen staan in auditlog.

### M02 — Onboarding & Configuratie

**P0:** intakevelden bedrijf/diensten/doelgroep/locatie/contact; branding/assets; providerconfiguratie; openingstijden; boekingslink; privacy-/toestemmingsteksten; branchtemplatekeuze; checklist met `draft`, `blocked`, `ready`, `live`.  
**P1:** import van relevante bestaande content; urenregistratie van bouw en onboarding.

**Acceptatie:** geen livegang bij ontbrekende kritieke config; Westend kan zonder database-edit een tweede tenant inrichten; wijzigingen aan secrets niet zichtbaar aan Owner/Team Member.

### M03 — Website Starter

**P0:** herbruikbare vaste secties; configureerbare copy/afbeeldingen; responsive; toegankelijke formulieren; SEO-basics; één leadmagnet-slot (quiz, calculator of download); test- en publicatieroutine.  
**P1:** basisblogstructuur waar nodig; herbruikbare varianten per branche.  
**Niet:** klant-selfservice CMS, vrije pagebuilder, eigen blog-AI.

**Acceptatie:** alle kritieke CTA's werken; mobiel geen horizontale overflow; testcontact verschijnt in correcte tenant; websitebouwtijd per project meetbaar (doel ≤3 actieve uren).

### M04 — Lead Capture

**P0:** standaardformulier en één actieve leadmagnet via drie vaste typen met gedeelde registratie; veldvalidatie; rate limiting; anti-spam; source/UTM/referrer indien beschikbaar; consentveld; event-ID; veilige, duurzame opslag; deduplicatie binnen tenant.  
**P1:** aparte intentie-/formuliertypes binnen hetzelfde configuratiemodel.

**Acceptatie:** alle drie leadmagnettypen doorlopen een geteste end-to-end flow; dubbele submit veroorzaakt geen dubbele verzending; fouten zijn begrijpelijk; ongeldige input wordt niet verwerkt; testevents gemarkeerd; zie AT-LM-cases in §17.

### M05 — Conversion CRM

**P0:** contactprofiel; afzonderlijke leadrecords; deals met pipelinefase; contact-/dealhistorie; eigenaren/toewijzing; taken met vervaldatum; dealstatus en bedrag; zoeken/filteren; toestemmingsstatus inzichtelijk.  
**P1:** afspraakoverzicht en verliesredenen; import/export op gecontroleerde wijze.  
**Niet:** zelfbouw pipelinebuilder of onbeperkte custom-objecten.

**Acceptatie:** één contact kan meerdere leads/deals hebben; conversie van lead naar klant behoudt historie; Team Member kan geen niet-toegewezen record aanpassen; won/lost werkt stopregels bij.

### M06 — AI Qualification

**P0:** per tenant geconfigureerde kenniscontext; vast intentieschema (vraag, koopintentie, offerte, klacht, outreach, spam, urgent/onduidelijk); gestructureerde outputvalidatie; één AI-reply; veilige fallback naar mens; logging van modelversie, intentie en actie zonder onnodige persoonsgegevens.  
**P1:** kwaliteitsevaluatie van samples en handmatige correctie voor verbetering.  
**Niet:** autonome onderhandelingen of meerdere conversatierondes.

**Acceptatie:** injectietekst in bericht kan systeemregels niet wijzigen; bij model-timeout blijft aanvraag behouden; uitvoer buiten schema wordt geweigerd of geëscaleerd.

### M07 — Automations & Messaging

**P0:** beperkte vooraf ingerichte workflows; verzendprovideradapter; templatevariabelen; toestemming-/stopregels; retries, statussen en idempotentie; handover; Calendly-webhooks indien ingeschakeld; operationele mail.  
**P1:** eenvoudige follow-up als geen respons; neutrale reviewverzoeken.  
**Niet:** nieuwsbrieflayoutbuilder, uitgebreide nurturing, visuele flowbuilder.

**Acceptatie:** opt-out blokkeert toepasselijke marketingberichten; verzending is niet dubbel bij webhookreplay; mislukking is zichtbaar; follow-up stopt bij menselijke reply en gewonnen/verloren deal.

### M08 — Monitoring

**P0:** website-/formulierconfiguratie per tenant; front-end controle, foutcategorieën, tijdstempels, waarschuwingen; testdata scheiden; incidentstatus.  
**P1:** minder frequente end-to-end mailketentest met quotas; automatische herstelverificatie.  
**Niet:** 30-minuten-volledige e-mailketentest voor ieder formulier zonder limietanalyse.

**Acceptatie:** een gebroken formulier veroorzaakt incident; monitoringtest telt niet als echte lead; tests schenden geen formulier-/mailquota; false positives worden traceerbaar beheerd.

### M09 — Dashboard & Reporting

**P0:** leads, afspraken, gewonnen deals, geregistreerde omzet, leadbronnen, funnelconversie; periodefilter; actievereisten; datakwaliteitsindicatoren; eigenaar- en teamafhankelijke toegang.  
**P1:** maandelijks verslag met feiten, observaties en aanbevolen vervolgstappen.  
**Niet:** vrije BI-querybuilder, automatische omzettoerekening zonder data.

**Acceptatie:** KPI-definities zijn vastgelegd; vergelijkingen gebruiken dezelfde tijdvensters; onbekende waarden expliciet; rapport kan zonder onjuiste causaliteit worden samengesteld.

## 8. Functioneel datamodel (stackneutraal)

**Kernobjecten:** `Tenant`, `User`, `Membership`, `SubscriptionStatus`, `BusinessProfile`, `Website`, `LeadMagnetConfig`, `LeadMagnetVersion`, `LeadMagnetSubmission`, `LeadMagnetOutcome`, `Contact`, `Lead`, `Deal`, `PipelineStage`, `Task`, `Appointment`, `Activity`, `ConsentRecord`, `AutomationDefinition`, `AutomationRun`, `Message`, `ProviderEvent`, `MonitoringCheck`, `Incident`, `CampaignAttribution`, `RevenueEvent`, `AuditEvent`.

**Relaties:** Tenant heeft veel gebruikers, contacten, leads en deals; Contact heeft veel leads en deals; Deal heeft één actuele fase en meerdere activiteiten/taken; iedere provider-event heeft een unieke externe sleutel binnen tenant/provider; berichten horen bij een conversatie/lead en een verzendstatus; consent is historisch, niet slechts één boolean.

**Databeheer:** bron van waarheid voor contacten/deals is het eigen CRM; externe mail-/boekingsproviders zijn uitvoerende of bron-systemen voor hun eigen events. Beperkte bewaartermijnen, verwijder-/exportmogelijkheid en audit horen in technische uitwerking thuis.

## 9. Niet-functionele eisen

- **Betrouwbaarheid:** geen verlies van geldige aanvragen bij externe API-uitval; asynchrone taken met retry en dead-letter/reviewpad.
- **Security:** veilige authenticatie, tenant-isolatie, server-side RBAC, secretbeheer, webhooksignaturecontrole, auditlogs, encryptie waar passend, dataminimalisatie.
- **Privacy:** juiste grondslag voor verwerking en marketing; transparantie bij AI; verwerkersafspraken en bewaarbeleid vóór pilot.
- **Observeerbaarheid:** correlatie-ID per aanvraag/automatisering, logs zonder onnodige persoonsgegevens, incidentdashboard voor Westend.
- **Testbaarheid:** unit- en integratietests voor business rules; browser-e2e voor formulier, leadflow en rollen; replaytests voor webhooks.
- **Onderhoudbaarheid:** modulegrenzen en versiebeheer; geen tweede bron van waarheid; herbruikbare templates.
- **Performance:** paginaprestaties als acceptatiepunt; AI mag geen voorwaarde zijn voor succesvolle formulieracceptatie.
- **Toegankelijkheid:** formulieren werken met toetsenbord, labels, fouten en voldoende contrast.
- **Operationeel:** per tenant inzicht in AI-/mailverbruik en limieten; herstel- en rollbackprocedure.

Kwantitatieve SLA's, exacte retentieperiodes en volumelimieten volgen na pilots en stackevaluatie, vóór contractuele toezeggingen.

## 10. Testcases voor pilotacceptatie

| ID | Test | Verwacht resultaat |
|---|---|---|
| AT-01 | Owner logt in | Alleen eigen tenant zichtbaar |
| AT-02 | Team Member vraagt ander contact-ID op | Geen toegang |
| AT-03 | Testlead via liveformulier | Contact, lead en activity correct aangemaakt |
| AT-04 | Identieke submit/webhook tweemaal | Geen dubbele mail of deal |
| AT-05 | AI-provider faalt | Lead opgeslagen, handover/alert |
| AT-06 | E-mailstatus onbekend | Geen blinde dubbele verzendpoging |
| AT-07 | Urgente klacht | Escalatie naar mens, geen ongepast verkoopantwoord |
| AT-08 | Lead reageert op AI-antwoord | Geen tweede inhoudelijke AI-reply |
| AT-09 | Calendly bevestigt boeking | Afspraak gekoppeld en status correct |
| AT-10 | Calendly annuleert | Afspraakstatus en taken bijgewerkt |
| AT-11 | Contact meldt zich af | Marketingberichten stoppen |
| AT-12 | Deal wordt gewonnen | Verkoopflow stopt en waarde wordt geregistreerd |
| AT-13 | Formuliermonitor detecteert fout | Incident + Westend-alert, geen echte lead |
| AT-14 | Omzet ontbreekt | Dashboard toont onbekend, niet nul |
| AT-15 | Onboarding mist kritieke gegevens | Website niet als live markeerbaar |
| AT-16 | Websitewijziging is meerwerk | Geen uitvoering zonder expliciet akkoord |

**Aanvullende acceptatietests voor quiz, calculator en download:** zie §17 (AT-LM-01 t/m AT-LM-18).

## 11. Ontwikkelvolgorde (geen stackbesluit)

1. **Vertical slice:** tenant → formulier → veilige opslag → CRM-lead → eigenaar ziet lead.
2. **Sales workflow:** pipeline, taken, activiteit en boekingsstatus.
3. **AI- en mailflow:** intentie, eerste antwoord, foutpaden, toestemming en stopregels.
4. **Websiteproduct:** startertemplate en gedeelde leadmagnetkern, vervolgens de drie vaste templates (quiz, calculator, download), onboardingconfiguratie en livegangchecklist.
5. **Monitoring en rapportage:** formuliertests, KPI's en maandrapport.
6. **Pilotverharding:** rollen-/securitytests, incidenten, quota, back-up/herstel, documentatie en vijf klantpilots.

**Exit-gate Fase 2:** businessregels en MVP-scope akkoord; opengestelde beslissingen vastgelegd; kernuserflows geaccepteerd. Daarna pas wireframes, architectuurkeuzes en vergelijking van stacks.

## 12. Open beslissingen voor de volgende review

1. Welke quizvragen, rekenregels en download-assets kiezen we als **eerste concrete branchevoorbeelden**? (Typebesluit staat vast: alle drie ondersteunen.)
2. Welke minimale follow-up (bijvoorbeeld één reminder na ingestelde termijn) is nodig in de MVP, naast het AI-eerste antwoord?
3. Welke omzetwaarde wordt als bron gebruikt: handmatige dealwaarde, betalingsprovider of factuurimport? Advies voor MVP: handmatig bevestigd.
4. Hoe verlopen interne support- en websitewijzigingsverzoeken vóór het ticketdashboard? Advies: bestaand kanaal + gestructureerd intern log.
5. Welke onboardinggegevens zijn verplicht vóór livegang, en welke kunnen later worden aangevuld?
6. Welke operationele verzend-, AI- en testlimieten horen bij €249 per maand? Voorlopig fair-usegrenzen, kwantificeren na pilotmetingen.

**Bewuste niet-beslissingen:** frontend, backendframework, databasehosting, e-mailprovider en CMS-hosting zijn nog niet definitief gekozen.


## 13. Aanvullend besluit: één Leadmagnet Engine, drie vaste templates

**Vastgesteld op 17 oktober 2026.** Voor de MVP worden drie typen ondersteund: `quiz`, `calculator` en `download`. Ze delen één technische kern voor configuratie, weergave, contactregistratie, toestemming, CRM-events, attributie en rapportage. Dit is **geen** opdracht om een generieke, visuele formulier- of funnelbuilder te maken.

| Onderdeel | MVP-afspraak |
|---|---|
| Beschikbare typen | Quiz/assessment, calculator, download/gids |
| Maximaal actief per klantwebsite | Één `published` configuratie tegelijk; andere typen mogen als concept worden voorbereid |
| Configuratie | Westend kiest type en vult vooraf afgebakende velden in tijdens onboarding |
| Zelf aanpassen door klant | Voor leadmagnetconstructie nog niet; bedrijfseigen basisgegevens wel binnen bestaande rechten |
| Leadopslag | Eigen CRM is bron van waarheid; één contact kan meerdere aanvragen indienen |
| Opvolging | Alleen passend bij type, intentie en toestemming; geen automatische verkoopclaim op basis van downloaden |
| Meting | Weergave, start, resultaat, inzending, afspraak en gewonnen deal (indien herleidbaar) |
| Publicatie | Concept → preview → validatie → gepubliceerd; publiceren uitsluitend door Westend |

**Interpretatie:** “alle drie” betekent **drie beschikbare sjablonen in het platform**, niet drie gelijktijdige funnels voor iedere MVP-klant. Deze begrenzing houdt onboarding, tests en commerciële ondersteuning beheersbaar.

### 13.1 Waarom dit ontwerp

- Eén gedeelde implementatie voor registratie, toestemming, routing, logging en analytics voorkomt dubbele code.
- De drie typen hebben een eigen UI en eigen invoer-/resultaatregels; die mogen niet door willekeurige code van klanten worden geprogrammeerd.
- Een branchetemplate levert een **voorbeeldconfiguratie** op, geen afzonderlijke applicatie.
- Elke leadmagnet heeft een stabiele ID en een versie. Wijzigingen overschrijven geen historische quizresultaten of herkomstcijfers.
- De doelstelling van maximaal 3 uur websitebouw geldt **pas nadat** de drie templates zijn ontwikkeld en getest. De eenmalige bouw van de Leadmagnet Engine valt onder productontwikkeling.

## 14. User journeys per type

### J-LM-00 — Westend configureert de leadmagnet (gedeeld)

**Actor:** Platform Admin. **Trigger:** klant is in onboarding en heeft een gekozen branchetemplate.

1. Open de klantwebsite en kies `quiz`, `calculator` of `download`.
2. Kies een bestaand branchevoorbeeld of de minimale standaardconfiguratie.
3. Configureer titel, beschrijving, CTA, de vereiste vragen/inputs of het downloadbestand, een resultaattekst, vervolgstap, privacyverwijzing en trackinglabels.
4. Controleer dat alle vereiste velden en regels geldig zijn (quizresultaatmapping, rekenformule of beschikbaar downloadbestand).
5. Test in preview met testdata; er worden geen echte commerciële leads geteld.
6. Publiceer; het systeem borgt dat niet twee verschillende leadmagnets tegelijk actief zijn op dezelfde klantwebsite.
7. Test na publicatie de publieke flow en registratie in de juiste tenant.

**Afwijkingen:** ontbrekende configuratie blokkeert publicatie; nieuwe versie vervangt alleen de actieve weergave, niet historische data; een rollback kan de vorige goedgekeurde versie herstellen. In de MVP mag rollback desnoods een gecontroleerde Westend-beheerhandeling zijn.

### J-LM-01 — Quiz / assessment

**Voorbeeld:** “Welke trainingsaanpak past bij jouw week?” voor een personal trainer, met 4–6 laagdrempelige vragen.

1. Bezoeker opent een landingspagina met doel, geschatte duur en duidelijke CTA.
2. Bezoeker beantwoordt maximaal 3–7 vooraf gedefinieerde enkelvoudige/meervoudige keuzevragen, één stap per keer of compact op één pagina.
3. Bezoeker kan teruggaan en een antwoord herstellen; de vooruitgang is duidelijk zichtbaar.
4. Het systeem bepaalt met **vaste, toetsbare resultaatregels** één uitkomst, bijvoorbeeld “2–3 trainingsmomenten met focus op consistentie”.
5. Bezoeker krijgt ten minste een waardevolle uitslag/preview te zien. Indien de volledige verdieping per e-mail wordt geleverd, staat dat vooraf transparant aangegeven.
6. Voor optionele verzending of opvolging vult bezoeker naam en e-mail in; afzonderlijke keuze voor marketingcommunicatie is expliciet en niet vooraf aangevinkt.
7. Bij inzending maakt het systeem een contact (of koppelt bestaand contact), lead en activiteit met quiztype, uitkomst en bron aan.
8. Vervolgactie is afhankelijk van de vastgestelde interesse: passende uitslagmail en/of een boekingslink; geen automatische classificatie als koopklare lead enkel wegens deelname.

**Afwijkingen:** niet ingevulde verplichte vragen → inline validatie; geen geldige resultaatmapping → geen foutieve uitslag, melding aan Westend; bezoeker stopt halverwege → geen onvolledige CRM-lead aanmaken.

**Afbakening:** geen medische diagnose, psychologische persoonlijkheidstest met wetenschappelijke claims of verwerking van gevoelige gezondheidsgegevens als standaard. Vragen over doelen, beschikbare tijd en voorkeuren zijn passend; medische gegevens uitsluitend via een apart expliciet beoordeeld traject buiten deze MVP.

### J-LM-02 — Calculator

**Voorbeeld:** “Hoeveel tijd kun je realistisch vrijmaken voor trainen?” of een offerte-indicatie op basis van vaste variabelen.

1. Bezoeker leest waarvoor de berekening bedoeld is, welke aannames gelden en of de uitkomst indicatief is.
2. Bezoeker vult 2–5 vooraf goedgekeurde invoervelden in (bijvoorbeeld beschikbare dagen per week, minuten per training, doelcategorie).
3. Het systeem valideert types en minima/maxima en berekent de uitslag met een **deterministische, versiebeheerde formule**.
4. Resultaat toont uitkomst, relevante aannames en een passende CTA; geen gegarandeerde uitkomsten of individueel medisch advies.
5. Bezoeker kan invoer wijzigen en opnieuw rekenen zonder verplicht gegevens achter te laten.
6. Voor ontvangen van een samenvatting/offerte-intake vult bezoeker naam/e-mail in en verstuurt expliciet de aanvraag; marketingtoestemming is afzonderlijk.
7. CRM ontvangt inputcategorieën, formuleversie, uitkomst, bron en vervolgintentie. Indien calculator vooral informatief is, wordt die niet automatisch als sales-qualified beschouwd.

**Afwijkingen:** negatieve/ongeldige invoer → geen berekening; fout in formuleconfiguratie → publicatieblokkade of veilige foutmelding; berekening werkt zonder AI of e-mailprovider.

**Afbakening:** geen door klanten in te voeren JavaScript, scripts of willekeurige formules. Gebruik een beperkte bibliotheek van goedgekeurde rekenregels en parameters per template.

### J-LM-03 — Download / gids

**Voorbeeld:** “Checklist: je eerste 30 dagen met een haalbaar trainingsritme”.

1. Bezoeker ziet titel, inhoud, formaat en duidelijke verwachting van de download.
2. Bezoeker vult naam en e-mail in indien de gids via e-mail wordt geleverd; privacyverwijzing en afzonderlijke marketingopt-in zijn zichtbaar.
3. Server valideert de inzending, anti-spammaatregelen en de beschikbaarheid van de gids.
4. CRM registreert contact/lead met bron `leadmagnet_download` en specifieke asset-ID.
5. Een operationele e-mail levert de aangevraagde gids via een geldige downloadlink; alleen deze levering geeft geen recht op nieuwsbrieven of verkoopnurturing.
6. De bezoeker ziet een bevestigingsscherm met heldere status en mogelijke vrijwillige vervolgstap, bijvoorbeeld intake boeken.
7. Leveringsstatus wordt gekoppeld aan de lead, inclusief eventuele bounce/fout.

**Afwijkingen:** verzendprovider onbereikbaar → lead veilig bewaren, afleverstatus inzichtelijk, retries volgens bestaand verzendbeleid; asset ontbreekt → publicatie geblokkeerd; dubbele submit → geen dubbele levering; ongeldige link → veilige fout of vervangende levermethode.

**Afbakening:** alleen vooraf geüploade en goedgekeurde bestanden/links. Verdeel downloads desgewenst via tijdelijke of afgeschermde links; vertrouw niet op alleen het verbergen van een publiek URL-pad.

### J-LM-04 — Gemeenschappelijke lead- en opvolgflow

`published` → `view` → `start` → `result_or_request` → `contact_submit` → `contact+lead+activity` → `delivery_or_followup` → `appointment/deal`.

- De eerste drie events kunnen anoniem en geaggregeerd worden gemeten mits toegestaan; er is **geen** verplicht CRM-contact vóór vrijwillige inzending van identificerende gegevens.
- `result_or_request` staat voor het quiz-/calculatorresultaat of het aanvragen van een download.
- Een e-mailadres is een vereiste voor **e-maillevering en CRM-contact**, niet om een calculator te mogen gebruiken.
- Een informatieaanvraag kan een operationele levering starten; marketingnurturing vereist een afzonderlijk vastgelegde toepasselijke grondslag.
- Voor quiz en calculator is de uitslag onafhankelijk van AI; AI kan hooguit een begrensde vervolgtekst samenstellen, niet de feiten/formule veranderen.
- Bij een externe storing blijft de ingezonden lead bestaan en wordt deze behandeld volgens de bestaande `send_unknown`/handoverregels.

## 15. Functionele velden en configuratieschema (stackneutraal)

### 15.1 Gedeelde configuratie: `LeadMagnetConfig`

| Veld | Type / validatie | Verplicht | Wie beheert? |
|---|---|:---:|---|
| `id`, `tenant_id`, `website_id` | Stabiele interne identifiers | Ja | Systeem |
| `type` | `quiz` / `calculator` / `download` | Ja | Westend |
| `status` | `draft` / `preview` / `published` / `archived` | Ja | Westend |
| `version` | Positief versienummer | Ja | Systeem |
| `title`, `intro`, `cta_label` | Lengtebegrensde, veilig weergegeven tekst | Ja | Westend |
| `success_message` | Tekst na afronding | Ja | Westend |
| `outcome_cta` | Tekst + gecontroleerde URL/boeking | Optioneel | Westend |
| `form_fields` | Vaste formuliervelddefinitie | Ja | Westend |
| `privacy_notice_url` | Geldige URL | Ja | Westend |
| `consent_text_version` | Versie van toestemmingscopy | Voor marketingopt-in | Westend |
| `routing_rule_id` | Gevalideerde verwijzing naar workflow | Optioneel | Westend |
| `source_label` | Trackinglabel (niet-persoonsgebonden) | Ja | Westend |
| `published_at`, `updated_at` | Datum/tijd | Systeem | Systeem |

**Publicatieconstraint:** uniek actief `published` object per website. Een nieuwe configuratie blijft eerst concept en vervangt pas na expliciete publicatie de huidige actieve versie.

### 15.2 Gedeelde bezoekersvelden en metadata

| Veld | Verplicht wanneer? | Opmerking |
|---|---|---|
| `first_name` | Bij inzending, tenzij formulier bewust alleen e-mail vraagt | Voor aanspreking, geen onnodige persoonsgegevens |
| `email` | Voor e-maillevering of CRM-contact | Formaatvalidatie; tenantgebonden deduplicatie |
| `marketing_opt_in` | Optioneel, nooit vooraf aangevinkt | Niet gelijk aan aanvraag of download |
| `consent_source`, `consent_timestamp`, `consent_text_version` | Bij vastlegging van toestemming | Bewijs en herroepbaarheid |
| `request_id`, `submission_id` | Bij iedere succesvolle inzending | Idempotentie/correlatie |
| `utm_source`, `utm_medium`, `utm_campaign`, `referrer` | Indien beschikbaar en toegestaan | Voor bronherleiding; geen PII in analytics-events |
| `is_test`, `template_version` | Systeem | Uitsluiten uit commerciële KPI's |
| `submitted_at` | Systeem | Niet vertrouwen op bezoekerklok |

### 15.3 Quizspecifiek

| Veld | Functie |
|---|---|
| `questions[]` | 3–7 vaste vraagobjecten met ID, label, vraagtype en verplichte status |
| `options[]` | Vaste antwoorden met stabiele IDs; geen vrije medische teksten standaard |
| `scoring_rules` | Eenvoudige gewichten/categorieën of regelgebaseerde mapping |
| `outcomes[]` | Minimaal één uitkomst met korte uitleg en CTA |
| `answers` | Geselecteerde antwoord-IDs, gekoppeld aan inzending indien vereist |
| `result_code` | Uitkomstlabel met versie, geen onbewezen diagnose |

### 15.4 Calculatorspecifiek

| Veld | Functie |
|---|---|
| `inputs[]` | 2–5 goedgekeurde inputvelden met datatype, eenheid, min/max en defaults |
| `formula_key`, `formula_version` | Verwijzing naar vooraf goedgekeurde rekenregel |
| `parameters` | Begrensde configuratiewaarden, bijvoorbeeld tarief of standaardduur |
| `calculation_result` | Rekenuitkomst + eenheid, afronding en eventuele bandbreedte |
| `assumptions` | Zichtbare uitgangspunten/disclaimer van indicatieve uitkomst |
| `result_cta` | Vrijwillige vervolgstap, bijvoorbeeld intake of prijsaanvraag |

### 15.5 Downloadspecifiek

| Veld | Functie |
|---|---|
| `asset_id` | Verwijzing naar één goedgekeurde gids/download |
| `asset_title`, `file_type`, `file_size` | Verwachtingsmanagement en controles |
| `delivery_mode` | MVP: e-mail met gecontroleerde downloadlink |
| `delivery_template_id` | Vaste mailtemplate van operationele levering |
| `delivery_status` | `queued` / `sent` / `delivered` / `failed` / `unknown` indien providergegevens beschikbaar |
| `link_expiry` | Optioneel voor afgeschermde downloads, volgens configuratie |

### 15.6 Minimaal persistente domeinobjecten

- `LeadMagnetConfig` en `LeadMagnetVersion`: publicatie- en configuratiehistorie.
- `LeadMagnetSubmission`: een expliciet ingezonden gebeurtenis, bron, timestamp, type, versie en anti-duplicatiesleutels.
- `LeadMagnetOutcome`: uitkomstcode/rekenresultaat/asset-ID voor rapportage zonder onnodig alle antwoorden te bewaren.
- Bestaande `Contact`, `Lead`, `Activity`, `ConsentRecord`, `Message` en `AutomationRun`: geen tweede contactdatabase.
- Analytics-events zijn geaggregeerd of pseudoniem en gescheiden van operationele identiteitsdata; de exacte implementatie volgt bij architectuur en privacy review.

## 16. Business rules — leadmagnetmodule

| ID | Normatieve regel | Prioriteit |
|---|---|---|
| BR-LM-01 | Eén website kan binnen de MVP maximaal één `published` leadmagnet hebben, uit precies drie vaste types. | P0 |
| BR-LM-02 | Alleen Platform Admin kan het type, de vragen, de formule, de asset en de publicatiestatus wijzigen. | P0 |
| BR-LM-03 | `draft`/`preview` mag geen echte productie-lead, mailing of commerciële KPI opleveren. | P0 |
| BR-LM-04 | Publicatie weigeren bij onvolledige configuratie, ontbrekende privacytekst, ongeldige rekenregel of ontbrekende asset. | P0 |
| BR-LM-05 | Geldige inzending eerst duurzaam opslaan; AI, e-mail en CRM-workflows daarna asynchroon afhandelen. | P0 |
| BR-LM-06 | Replays en herhaald klikken mogen niet leiden tot dubbele leads, bezorgingen of AI-inhoudelijke reacties. | P0 |
| BR-LM-07 | Quizresultaten en calculatorresultaten worden met toetsbare, versiebeheerde logica berekend; niet door vrije generatieve AI. | P0 |
| BR-LM-08 | Een quizdeelnemer of calculatorgebruiker hoeft vóór de eerste zinvolle uitkomst geen e-mail in te vullen, tenzij een specifieke gated verdiepingsstap expliciet is aangekondigd. | P0 |
| BR-LM-09 | Voor een verzonden gids mag een e-mailadres nodig zijn; de bezoeker ziet vóór inzending welke levering volgt. | P0 |
| BR-LM-10 | Operationele levering van aangevraagd materiaal wordt gescheiden van toestemming voor marketingberichten. | P0 |
| BR-LM-11 | Marketingtoestemming is vrijwillig, specifiek, herroepbaar en wordt met bron/tijd/copyversie vastgelegd. | P0 |
| BR-LM-12 | Leadscore en routering steunen op echte intentiesignalen; deelname alleen kwalificeert niet automatisch als verkoopkans met hoge prioriteit. | P0 |
| BR-LM-13 | Alle operationele gegevens zijn tenantgebonden; link of event van tenant A mag geen record bij tenant B creëren. | P0 |
| BR-LM-14 | Het systeem verwerkt standaard geen medische of bijzondere persoonsgegevens in quiz/calculator; aanvullende gevoelige use cases vallen buiten de MVP. | P0 |
| BR-LM-15 | Resultaat en vervolgstap zijn eerlijk: geen gegarandeerde gezondheids-, omzet- of besparingsclaims. | P0 |
| BR-LM-16 | Bij providerfout blijft de lead opgeslagen; leverstatus en menselijke handover zijn traceerbaar. | P0 |
| BR-LM-17 | Test-/monitorinzendingen worden gemarkeerd en uitgesloten van leads, conversieratio's en commerciële automatiseringen. | P0 |
| BR-LM-18 | Publiceren van nieuwe versie behoudt historische submissies en verwijst rapportages naar de juiste versie. | P0 |
| BR-LM-19 | Browseranalyse bevat geen persoonsgegevens uit antwoorden, e-mailadressen of resultaatteksten; waar nodig alleen geaggregeerde events. | P0 |
| BR-LM-20 | Een leadmagnet moet ook zonder AI-beschikbaarheid berekend/getoond kunnen worden; externe AI mag de capture niet blokkeren. | P0 |

## 17. Acceptatietests — leadmagnetmodule

| ID | Test | Verwacht resultaat |
|---|---|---|
| AT-LM-01 | Admin selecteert achtereenvolgens quiz, calculator en download voor testtenant | Alle drie kunnen afzonderlijk worden geconfigureerd en gepubliceerd. |
| AT-LM-02 | Admin probeert twee leadmagnets tegelijk te publiceren | Hoogstens één blijft `published`; veilige vervanging of afwijzing. |
| AT-LM-03 | Quizdeelnemer doorloopt vragen, navigeert terug en corrigeert een antwoord | Deterministische, juiste uitkomst; correcte toegankelijke bediening. |
| AT-LM-04 | Quiz heeft ongeldige/ontbrekende resultaatmapping | Publicatie geblokkeerd; geen misleidend resultaat. |
| AT-LM-05 | Calculator ontvangt randwaarden en ongeldige invoer | Geldige invoer berekend met juiste versie; ongeldige invoer geweigerd. |
| AT-LM-06 | Calculator provider/AI tijdelijk onbereikbaar | Berekening werkt zelfstandig en toont resultaat. |
| AT-LM-07 | Bezoeker bekijkt quiz-/calculatorresultaat zonder persoonsgegevens in te vullen | Waardevol eerste resultaat zichtbaar, zonder CRM-contact. |
| AT-LM-08 | Bezoeker vraagt een gids aan | Eén lead/contactactiviteit en één operationele leveringsflow. |
| AT-LM-09 | Downloadbestand ontbreekt vóór publicatie | Publicatie geweigerd. |
| AT-LM-10 | Dubbele submit / netwerk-replay | Eén logische submission, geen dubbele mail of AI-reactie. |
| AT-LM-11 | Alleen gids aangevraagd, geen marketingopt-in | Wel gidslevering; geen nieuwsbrief/nurturecampagne. |
| AT-LM-12 | Expliciete marketingopt-in en daarna uitschrijving | Correcte bewijsvastlegging; toekomstige toepasselijke marketing stopt. |
| AT-LM-13 | Bericht/asset van tenant A met identifier van tenant B | Geen cross-tenant gegevenslek of registratie. |
| AT-LM-14 | E-mailprovider down na geldige inzending | Lead blijft bewaard, deliverystatus/alert correct. |
| AT-LM-15 | Testmodus of monitoringsaanvraag | Geen echte commerciële KPI of reguliere salesfollow-up. |
| AT-LM-16 | Versie van actieve quiz wordt aangepast en gepubliceerd | Historische resultaten blijven aan originele versie gekoppeld. |
| AT-LM-17 | Bezoeker gebruikt mobiel en toetsenbord | Alle stappen, labels, meldingen en focus zijn bruikbaar; geen horizontale overflow. |
| AT-LM-18 | Quiz- of calculatorantwoorden bevatten mogelijk bijzondere persoonsgegevens | Verboden/ongewenste velden worden geweigerd; geen PII in analytics of logs. |

**Definition of Done:** de drie templates slagen voor de gedeelde en typespecifieke E2E-tests op een testtenant, en ten minste één volledig klanttraject is in staging gevalideerd (bezoek → inzending → CRM → aflevering/opvolging → rapportage). Productiepublicatie vereist dezelfde checklist uit J02.

## 18. Voorgestelde ontwikkeling en impact op scope

1. **Gedeelde kern** (P0): configuratieversies, statusbeheer, veilige formulieren, CRM-event, toestemming, attributie en verzending.
2. **Downloadtemplate** (P0): minst complexe variant om de volledige registratie- en bezorgketen te testen.
3. **Quiztemplate** (P0): beperkte vraag- en uitkomsttypen, geen vrije builder.
4. **Calculatortemplate** (P0): gecontroleerde inputtypen en goedgekeurde berekenregels, geen vrije formule-editor.
5. **Hardening** (P0): tenant-isolatie, retries, rate limiting, testevents, analytics en browser-E2E voor alle drie.
6. **Branchevoorbeelden** (P1): één configuratie voor fitnesscoach; pas uitbreiden na eerste klantdata.

**Scopewaarschuwing:** drie templates bouwen kost meer initiële productontwikkeling dan één vaste leadmagnet. Dit is bewust geaccepteerd. Om de MVP beheersbaar te houden, blijven visuele templatebouwers, meerdere actieve leadmagnets, medische tests, dynamische scoring-AI en complexe calculatorformules uitgesloten.

**Open voor de functionele review, géén blokkade voor verdere schetsen:** keuze van eerste concrete quizvragen, eerste goedgekeurde calculatorformule, eerste gidsbestand, fair-use limieten. **Techstack, databaseproduct en hosting blijven onbeslist.**


## 19. Besluit Q2 — Hybride follow-up (vastgesteld)

**Besluit:** kies model B. Na één inhoudelijke, door AI gegenereerde eerste reactie volgt, alleen indien toegestaan en nog nodig, maximaal één herinnering op basis van een vooraf goedgekeurde template. Daarna volgt een CRM-taak voor menselijke opvolging. Geen zelfstandig doorlopende AI-gesprekken in de MVP.

### 19.1 Functionele flow

1. Een geldige aanvraag wordt duurzaam geregistreerd; de bestaande AI-leadkwalificatie verwerkt het eerste bericht en verstuurt hoogstens één inhoudelijke reactie.
2. Het systeem plant een kandidaat-herinnering op **48 uur na een succesvol verzonden eerste reactie** (instelbare standaard; uitsluitend in het lokale verzendvenster, bijvoorbeeld werkdagen 09:00–17:00).
3. Vlak vóór verzending controleert de automation-engine **actuele status, juridische grondslag, opt-out, geldigheid adres, reply/boeking en human-handover**. Alleen bij positieve controle wordt één vooraf goedgekeurde reminder verstuurd.
4. Zonder reactie volgt standaard **48 uur na de herinnering** een CRM-taak voor de toegewezen ondernemer/medewerker. Als een reminder niet rechtmatig of betrouwbaar kan worden verstuurd, volgt in plaats daarvan een CRM-taak na de eerste geplande controle.
5. Bij reactie, boeking, bezwaar/uitschrijving, deal gewonnen/verloren, menselijke overname of een andere eindstatus stopt de automatische opvolging onmiddellijk.
6. Historie vermeldt wat gepland, verstuurd, overgeslagen of geblokkeerd is en waarom. De eigenaar kan een open taak afhandelen of opvolging handmatig stopzetten.

**Juridische afbakening:** een contextgebonden reactie op een actieve aanvraag is niet hetzelfde als een reclame- of nurturecampagne. Nieuwsbrieven en zelfstandige commerciële follow-ups vereisen doorgaans voorafgaande toestemming of een toepasselijke wettelijke uitzondering, met afmeldmogelijkheid. Een formulierinzending wordt **niet** automatisch als marketingtoestemming geïnterpreteerd. De classificatie van een mail als operationele conversatie of reclame moet bij templategoedkeuring worden beoordeeld en gedocumenteerd.

### 19.2 Business rules

| ID | Business rule | Prioriteit |
|---|---|---|
| BR-FU-01 | Per individuele leadaanvraag maximaal één AI-eerste reactie en daarna maximaal één automatische, vooraf goedgekeurde reminder; geen vrije AI-tekst voor een tweede inhoudelijke reactie. | P0 |
| BR-FU-02 | Herinnering wordt standaard 48 uur na succesvolle eerste verzending gepland, niet na formulierinzending; het tijdstip en werkdagvenster zijn per tenant te configureren door Westend. | P0 |
| BR-FU-03 | Automatische follow-up is alleen toegestaan wanneer doel, berichtinhoud en rechtsgrond zijn geverifieerd; nieuwsbriefopt-in en operationele communicatie zijn aparte doelen. | P0 |
| BR-FU-04 | Direct vóór de verzending volgt een actuele stopregelcontrole; ingetrokken toestemming, bezwaar of opt-out blokkeert toepasselijke marketingverzending onmiddellijk. | P0 |
| BR-FU-05 | Bij een reply, bevestigde boeking, gewonnen/verloren deal, klacht, spamclassificatie, menselijke overname of handmatig stopzetten wordt de geplande reminder geannuleerd. | P0 |
| BR-FU-06 | Reactiedetectie moet aantoonbaar betrouwbaar zijn via een ingestelde inbound-berichtenbron/webhook of expliciete handmatige status. Is dat niet gegarandeerd, dan wordt geen onbewaakte automatische reminder verstuurd; het systeem maakt een taak aan. | P0 |
| BR-FU-07 | Bij ontbrekende verzendbevoegdheid, geblokkeerd adres, bounce of onzekere afleverstatus wordt geen reminder verstuurd; er ontstaat een taak of duidelijke foutstatus. | P0 |
| BR-FU-08 | Bij uitblijvende reactie wordt standaard 48 uur ná de reminder één menselijke opvolgtaak aangemaakt, zonder automatische extra marketingberichten. | P0 |
| BR-FU-09 | Een lead die niet in aanmerking komt voor automatische reminder krijgt op het eerste controlemoment één menselijke opvolgtaak, tenzij de lead al is afgehandeld. | P0 |
| BR-FU-10 | Retries, dubbele webhooks en worker-herstarts mogen geen dubbele reminders of taken veroorzaken; idempotentie per lead en follow-upstap is verplicht. | P0 |
| BR-FU-11 | Iedere beslissing en statusovergang is traceerbaar op tenant-/leadniveau, zonder onnodige persoonsgegevens in technische logs. | P0 |
| BR-FU-12 | Monitoring- en testaanvragen starten nooit de reguliere klantfollow-up. | P0 |
| BR-FU-13 | Alleen Westend beheert standaardtemplates, cadence en automatiseringsvoorwaarden; ondernemer beheert contactstatus, boekingen, toewijzing en handmatige taken. | P0 |

### 19.3 Acceptatietests

| ID | Scenario | Verwacht resultaat |
|---|---|---|
| AT-FU-01 | Geen reply/boeking, contact en template rechtmatig, 48 uur verstreken | Precies één reminder binnen ingesteld verzendvenster. |
| AT-FU-02 | Lead antwoordt één minuut voor geplande verzending | Reminder geannuleerd; geen nieuwe AI-inhoudelijke reactie. |
| AT-FU-03 | Calendly bevestigt boeking | Geen reminder; pipeline en afspraakstatus actueel. |
| AT-FU-04 | Marketingtoestemming ontbreekt en template valt onder reclame | Geen reclamebericht; taak voor ondernemer. |
| AT-FU-05 | Contact trekt toestemming in of maakt bezwaar | Toepasselijke marketingberichten onmiddellijk geblokkeerd. |
| AT-FU-06 | Geen betrouwbare detectie van inbound replies | Geen onbewaakte reminder; menselijke taak. |
| AT-FU-07 | Twee workers verwerken hetzelfde verzendmoment | Hoogstens één daadwerkelijke reminder en één taak. |
| AT-FU-08 | Reminder verstuurd; nog steeds geen reactie na 48 uur | Precies één toegewezen CRM-taak. |
| AT-FU-09 | Provider geeft bounce of onzekere verzendstatus | Geen onbegrensde retries of dubbele mail; correcte status/taak. |
| AT-FU-10 | Testformulier of monitoringinzending | Geen leadopvolging of reguliere commerciële KPI. |

### 19.4 Open beslissing Q3

**Omzetregistratie:** nog kiezen tussen (A) alleen dealwaarde, (B) dealwaarde plus handmatig bevestigde werkelijke betalingen/omzetgebeurtenissen, of (C) directe facturatie-/boekhoudintegratie. Aanbeveling: B in MVP, C na MVP.


## 19. Besluit: onboarding en AI Website Production

**Vastgesteld op 17 oktober 2026.** De functionele deel-specificatie staat in **`fase-2-onboarding-websiteproductie-v0.1.md`**. Deze vormt een normatieve aanvulling op M02 (Onboarding) en M03 (Website Starter). Bij tegenspraak prevaleren de latere, expliciete besluiten in de deel-specificatie.

- **Productlijnen:** naast het €999-starterpakket blijft Westend Digital maatwerkwebsites aanbieden. Maatwerk krijgt een eigen offerte, scope en urenbegroting, maar kan dezelfde Conversion Engine gebruiken.
- **Intake:** vier vragenlijsten (Kickoff/achtergrond, Doelgroep, Aanbod, Branding/assets/techniek).
- **Branding:** bestaand logo, kleuren, fonts en bestaande brand guide worden toegepast; nieuwe branding, logo, merkstrategie of volledige brand guidelines zijn meerwerk.
- **Fotografie:** professionele fotografie is een optionele betaalde uitbreiding.
- **Ontwerp:** componentgestuurd vanuit de eigen Westend Component Library en interne referenties van bestaande klantwebsites. Referenties geven geen herpublicatierecht op tekst of beeld.
- **Workflow:** gestructureerde AI Website Production Pipeline met strategie, SEO/GEO, copy, UX, build, QA en lancering; Westend controleert sleutelbesluiten en publicatie.
- **CMS:** klant-selfservice voor copy en beelden later; contentmodel is daar nu op voorbereid. Sanity is de gewenste CMS-richting maar er is nog geen definitieve technische stack gekozen.
- **Tijd:** doelstelling maximaal 3 uur actieve websitebouw bij vastgelegde pakketgrenzen; andere uren apart meten en rapporteren.
- **Scope:** gewijzigde pagina-indeling, aanvullende modules of nieuwe branding/fotografie niet stilzwijgend inclusief; vooraf offreren en akkoord vragen.
- **Buiten MVP:** volledig projectmanagement voor maatwerk, eigen ticketdashboard en AI-bloggenerator.
