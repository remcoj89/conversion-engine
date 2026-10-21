# Westend Digital Conversion Engine — Requirements & Scope v0.1

**Status:** werkdocument voor functionele validatie  
**Fase:** 2 — Requirements & Scope  
**Basis:** Product Discovery v0.3, hybride beheermodel  
**Datum:** 17 oktober 2026  
**Volgende stap:** UX-flows/wireframes, daarna architectuur en stackkeuze

## 1. Vastgestelde productbesluiten

| Onderwerp | Besluit | Consequentie |
|---|---|---|
| Betalingen en abonnementen | **Extern factureren in MVP** | Platform registreert uitsluitend plan, status en ingangs-/einddata; geen eigen checkout, betaalkaartgegevens of factuurgenerator. |
| Leadmagnet | **Eén configureerbare leadmagnet per klantwebsite** | Een type/variant per tenant, met optionele branchespecifieke instellingen; geen vrije funnelbuilder. |
| Teamgebruik | **Business Owner + eenvoudige Team Member** | Eigenaar beheert organisatie en toewijzing; teamlid ziet alleen toegewezen commerciële werkitems. |
| Beheermodel | **Hybride** | Ondernemer beheert commerciële administratie; Westend beheert techniek en complexe automatisering. |
| Websitecontent | **Beheerd in MVP** | Klant kan later via Sanity copy en beelden wijzigen; CMS-geschikte contentstructuur nu voorbereiden, zonder selfservice-editor te bouwen. |
| Interne support | **Ticketdashboard na MVP** | Tijdens MVP verzoeken via bestaand extern kanaal en handmatige registratie. |
| Blog / Growth | **Na MVP** | Bestaande n8n-bloggenerator later auditen; SEO/GEO, A/B-testen en Ads niet in eerste release. |

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

Tenant en rollen; onboardingconfiguratie; website-starter; één leadmagnet; capture en antimisbruik; CRM-contacten/leads/deals; pipeline en taken; één gecontroleerde AI-eerste reactie; handover; Calendly-link met bevestigde boekingswebhook indien gekoppeld; eenvoudige follow-upregels; opt-out; contactformuliermonitoring; basisdashboard; maandelijks rapport; eenvoudige reviewaanvraag; extern bijgehouden abonnementstatus.

### 4.2 Buiten MVP

Selfservice Sanity-publicatie; ticketdashboard en AI-taakplanning; uitgebreide marketing/newslettermodule; visuele automationbuilder; meerdere funnel-/leadmagnetvarianten per klant; automatische blogpublicatie; autonome SEO/GEO/CRO; A/B-testplatform; Ads-beheer; ingebouwde payment provider; eigen helpdesk.

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

1. Owner vult intake in: bedrijfsnaam, contactgegevens, propositie, diensten, doelgroep, huisstijl/assets, openingstijden, privacylinks, toestemmingsteksten, boekingslink en gewenste leadmagnet.
2. Westend beoordeelt volledigheid en vraagt ontbrekende gegevens op.
3. Westend kiest branchetemplate en initialiseert standaardpipeline, formulieren, AI-kennisconfiguratie en **één** leadmagnet.
4. Westend produceert website op basis van startercomponenten, werkt content en beeld uit en voert technische/inhoudelijke controles uit.
5. Westend configureert e-maildomein, verzendprovider, formulierwebhook, boekingsintegratie indien gebruikt, monitoring en metingen.
6. Stagingacceptatie: Owner beoordeelt content en aanbod; Westend beoordeelt technische werking.
7. Na akkoord publiceert Westend de website en test de volledige leadflow met een herkenbare testaanvraag.
8. Owner ontvangt toegang tot dashboard en korte instructie voor leads/deals/taken.

**Alternatieven:** incomplete onboarding → `blocked`; domeinverificatie mislukt → geen live e-mail; testformulier faalt → niet publiceren; klant wil extra functionaliteit → change request buiten scope.

**Acceptatie:** checklist voor livegang 100% voltooid; testlead zichtbaar met correcte tenant en trace; maximaal één actief ingestelde leadmagnet; bouwtijd/onboardinguren worden gemeten, niet aangenomen.

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
| BR-04 | Een klantwebsite heeft in MVP maximaal één geconfigureerde actieve leadmagnet. | P0 |
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

**P0:** herbruikbare vaste secties; configureerbare copy/afbeeldingen; responsive; toegankelijke formulieren; SEO-basics; één leadmagnet-slot; test- en publicatieroutine.  
**P1:** basisblogstructuur waar nodig; herbruikbare varianten per branche.  
**Niet:** klant-selfservice CMS, vrije pagebuilder, eigen blog-AI.

**Acceptatie:** alle kritieke CTA's werken; mobiel geen horizontale overflow; testcontact verschijnt in correcte tenant; websitebouwtijd per project meetbaar (doel ≤3 actieve uren).

### M04 — Lead Capture

**P0:** standaardformulier en één leadmagnet; veldvalidatie; rate limiting; anti-spam; source/UTM/referrer indien beschikbaar; consentveld; event-ID; veilige, duurzame opslag; deduplicatie binnen tenant.  
**P1:** aparte intentie-/formuliertypes binnen hetzelfde configuratiemodel.

**Acceptatie:** dubbele submit veroorzaakt geen dubbele verzending; afwijzing en fout zijn voor gebruiker begrijpelijk; ongeldige input wordt niet verwerkt; testevents gemarkeerd.

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

**Kernobjecten:** `Tenant`, `User`, `Membership`, `SubscriptionStatus`, `BusinessProfile`, `Website`, `LeadMagnetConfig`, `Contact`, `Lead`, `Deal`, `PipelineStage`, `Task`, `Appointment`, `Activity`, `ConsentRecord`, `AutomationDefinition`, `AutomationRun`, `Message`, `ProviderEvent`, `MonitoringCheck`, `Incident`, `CampaignAttribution`, `RevenueEvent`, `AuditEvent`.

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

## 11. Ontwikkelvolgorde (geen stackbesluit)

1. **Vertical slice:** tenant → formulier → veilige opslag → CRM-lead → eigenaar ziet lead.
2. **Sales workflow:** pipeline, taken, activiteit en boekingsstatus.
3. **AI- en mailflow:** intentie, eerste antwoord, foutpaden, toestemming en stopregels.
4. **Websiteproduct:** startertemplate, één leadmagnet, onboardingconfiguratie en livegangchecklist.
5. **Monitoring en rapportage:** formuliertests, KPI's en maandrapport.
6. **Pilotverharding:** rollen-/securitytests, incidenten, quota, back-up/herstel, documentatie en vijf klantpilots.

**Exit-gate Fase 2:** businessregels en MVP-scope akkoord; opengestelde beslissingen vastgelegd; kernuserflows geaccepteerd. Daarna pas wireframes, architectuurkeuzes en vergelijking van stacks.

## 12. Open beslissingen voor de volgende review

1. Welk type leadmagnet wordt de **eerste standaardvariant** (quiz, calculator of download), en wat zijn de minimale invoervelden?
2. Welke minimale follow-up (bijvoorbeeld één reminder na ingestelde termijn) is nodig in de MVP, naast het AI-eerste antwoord?
3. Welke omzetwaarde wordt als bron gebruikt: handmatige dealwaarde, betalingsprovider of factuurimport? Advies voor MVP: handmatig bevestigd.
4. Hoe verlopen interne support- en websitewijzigingsverzoeken vóór het ticketdashboard? Advies: bestaand kanaal + gestructureerd intern log.
5. Welke onboardinggegevens zijn verplicht vóór livegang, en welke kunnen later worden aangevuld?
6. Welke operationele verzend-, AI- en testlimieten horen bij €249 per maand? Voorlopig fair-usegrenzen, kwantificeren na pilotmetingen.

**Bewuste niet-beslissingen:** frontend, backendframework, databasehosting, e-mailprovider en CMS-hosting zijn nog niet definitief gekozen.
