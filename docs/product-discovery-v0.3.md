# Westend Digital — Product Discovery v0.3

**Status:** vastgestelde productuitgangspunten voor stap 2  
**Besluit:** hybride beheermodel  
**Scope:** MVP plus expliciete post-MVP-backlog

## 1. Productvisie

- Westend Digital Conversion Engine is een beheerde, branche-onafhankelijke oplossing voor dienstverleners die websitebezoekers omzet in gekwalificeerde aanvragen, afspraken en klanten. Het product combineert conversiegerichte websites, CRM, AI-leadopvolging, automatiseringen en monitoring.
- Kernbelofte: minder gemiste leads, minder handmatige opvolging en meer inzicht in meetbare commerciële resultaten. Resultaten zijn afhankelijk van verkeer, aanbod, sales en juiste registratie; het product garandeert geen aantallen klanten.

## 2. Doelgroep en markt

- Startniche: personal trainers en fitnesscoaches. Daarna andere coaches/trainers en dienstverleners, zoals installateurs en adviseurs. De softwarekern blijft branche-onafhankelijk. Branchetemplates configureren funnels, velden, pipelines, prompts en workflows. Resellers zijn geen MVP-doelgroep.
- Commerciële focus blijft aanvankelijk smal, ook al ondersteunt de architectuur op termijn meerdere branches.

## 3. Hybride beheermodel — vastgesteld

- Business Owner beheert contacten, leads, deals, taken, afspraken, omzetgegevens, basisbedrijfsgegevens, boekingslink en eigen medewerkers.
- Westend Digital beheert technische websitearchitectuur, ontwerpen, integraties, AI-prompts, automatiseringslogica, monitoring, security en deployments.
- Team Members behandelen toegewezen leads, deals, afspraken en taken; geen toegang tot gevoelige organisatie-instellingen. Platform Admin beheert tenants, infrastructuur en configuratie; supporttoegang tot klantdata is doelgebonden, beperkt en gelogd. Een afzonderlijke Support Operator-rol is post-MVP.
- CMS-wijzigingen: op termijn mag de klant zelfstandig copy en afbeeldingen wijzigen via Sanity. In de MVP gebeurt publicatie nog beheerd door Westend Digital; de uiteindelijke stackkeuze voor CMS en website wordt later vastgelegd.

## 4. MVP — inbegrepen

- Een herbruikbaar website-startertemplate voor AI-ondersteunde oplevering in maximaal 3 uur actieve bouwtijd per website (te valideren). Standaardsecties: hero/CTA, diensten, reviews, over, FAQ, leadmagnet, contact en blogstructuur waar relevant.
- CRM: klantgescheiden contacten, leads, deals/pipeline, taken, afspraken, basisomzetregistratie, activiteitenhistorie en rollen.
- AI-formulierafhandeling: classificatie, één passende eerste inhoudelijke reactie, leadregistratie, taken/alerts en Calendly-link; bij bevestigde boeking wordt de afspraakstatus bijgewerkt. Menselijke escalatie voor uitzonderingen.
- Basis follow-up en toestemming: contextgebonden berichten, eenvoudige e-mailtemplates, opt-out en stopregels. Uitgebreide nieuwsbrieven/campagnes via optionele externe dienst, licentiekosten bij klant.
- Monitoring: formuliercontroles, foutmeldingen, conversietracking en begrijpelijk klantdashboard met maandrapportage. Review-/feedbackverzoeken als eenvoudige, gecontroleerde workflow.
- Onboarding: Westend configureert bedrijfsinformatie, diensten, tijden, intake/boekingslink en branchetemplate. Geen drag-and-drop beheeromgevingen.

## 5. Buiten MVP — expliciet uitgesteld

- Sanity selfservice-editor voor klanten (copy en afbeeldingen); het template moet wel CMS-vriendelijk en contentgedreven zijn.
- Intern ticketdashboard: centrale inbox van alle klantverzoeken, categorieën, SLA/urgentie, scopebeoordeling, uren/kosten en analyses van terugkerende problemen.
- AI-tickettriage, voorgestelde taken, prioritering en agenda-/capaciteitsplanning. AI mag geen deadlines toezeggen of agenda-afspraken zelfstandig wijzigen zonder toestemming.
- Bestaande n8n AI-bloggenerator: later audit en aanpassen voor multi-client gebruik, factcheck, redactionele controle en publicatie.
- Growth Engine: SEO/GEO-content, CRO en A/B-tests, automatische verbeteringen pas na gecontroleerde tests en risicogrenzen.
- Traffic Engine: Meta Ads en andere campagnes pas na validatie, met apart budget, conversiemeting en bewezen salesfunnel.
- Visuele workflowbuilder, vrij ontwerpbare CRM-modules, uitgebreide rapportbouwers, webshopfuncties en resellerportaal.

## 6. Verantwoordelijkheden en wijzigingen

- Klanten mogen routinematig commerciële data beheren. Wijzigingen aan website-layout, funnels, nieuwe functionaliteit of integraties worden door Westend Digital beoordeeld.
- Wijzigingsflow: aanvraag → scopebeoordeling (inbegrepen/meerwerk) → bij meerwerk offerte en expliciet akkoord → planning → uitvoering/test → oplevering en registratie.
- Het Basisabonnement omvat geen onbeperkte websiteaanpassingen. Exacte inbegrepen werkzaamheden, serviceniveaus en meerwerktarieven moeten vóór verkoop contractueel worden afgebakend.

## 7. Gebruikersrollen en beveiliging

- Platform Admin: technische provisioning, configuratie, deployments, beheer en incidenten; geen standaard onbeperkte toegang tot de inhoudelijke gegevens van klanten.
- Business Owner: volledige eigen commerciële administratie, medewerkersbeheer, bedrijfsbasisinstellingen en factuurinzage, zonder technische platformrechten.
- Team Member: eigen/toegewezen leads, deals, taken en afspraken.
- Securityvoorwaarden: server-side autorisatie, strikte tenant-isolatie, auditlogs, dataminimalisatie, toestemming/afmelding, idempotente webhookverwerking, least-privilege AI en herhaalbare tests.

## 8. Kritieke gebruikersscenario’s

- A — Nieuwe lead: formulier → validatie → classificatie → contact/lead aanmaken of koppelen → eerste reactie indien toegestaan → taak/boeking → CRM- en dashboardupdate. Herhaalde events veroorzaken geen dubbele berichten.
- B — Websitewijziging: klant dient verzoek in → Westend bepaalt scope → inbegrepen werk inplannen of offerte meerwerk → akkoord indien nodig → uitvoeren, testen en vastleggen.
- C — Medewerkeropvolging: medewerker ziet toegewezen lead met relevante historie → registreert resultaat en volgende actie → pipeline wijzigt → alleen passende automatisering loopt door.
- D — Klant wijzigt later copy/foto: via afgebakende Sanity-velden, met validatie, versiehistorie en veilige publicatie. Post-MVP.

## 9. KPI’s en validatie

- Validatie met vijf betalende pilotklanten. Websitebouw ≤3 uur en onboarding ≤1,5 uur actieve tijd per klant zijn doelen die gemeten moeten worden.
- Basisbeheer streefwaarde ≤30 minuten handmatig per klant per maand. Iedere geldige aanvraag heeft een contact, status, bron (indien bekend) en volgende stap; geen datalek tussen tenants.
- Zakelijke KPI’s: leads, afspraakratio, salesconversie, gerealiseerde omzet, klantwaarde, acquisitiekosten, churn, supporttijd en foutpercentage formulieren. Geen omzetwaarde afleiden als data ontbreken.

## 10. Product- en prijsuitgangspunten

- Website-implementatie €999 eenmalig; richtprijs Basis €249/maand, optioneel introductietarief voor eerste klanten. Growth beoogd €499/maand, na validatie en met duidelijk afgebakende uitvoering.
- Externe marketingplatformen zoals MailBlue zijn optionele integraties, met licentiekosten bij de klant. Basis transactionele/operationele opvolging wordt bij normale volumes inbegrepen.
- De acquisitiefunnel bevat persoonlijke outreach, gepersonaliseerd voorbeeld, korte VSL, intake en onboarding. Outboundkanalen moeten aan toepasselijke regels voldoen.

## 11. Ontwerpprincipes voor herbouw

- We beginnen met een nieuwe, eenvoudige codebasis; bestaande modules worden pas hergebruikt na een gerichte audit op kwaliteit, veiligheid, afhankelijkheden en onderhoudbaarheid.
- Eerst requirements en user flows, dan systeemarchitectuur en stackselectie. Voorkeur onderzoeken voor een modulaire monoliet met duidelijke grenzen en afzonderlijke workers waar noodzakelijk.
- Elke MVP-feature moet bijdragen aan verkoop, betrouwbare levering of meetbaarheid. Geen extra bouwers of abstractielagen zonder bewezen noodzaak. Eén bron van waarheid per gegeven.

## 12. Open besluiten voor stap 2

- Exacte gegevensvelden per branche en standaardpipeline; rechten per entiteit; onboardingvelden en beheerformulieren.
- Inbegrepen support, responstijden, wijzigingslimieten en meerwerkregels per abonnement.
- Definitie van geldige lead, betrouwbare omzetattributie, AI-escalaties en follow-upregels.
- Website-starterstructuur en verhouding tussen contentmodel en later Sanity-beheer.
- Meetbare acceptatiecriteria per workflow, foutafhandeling en integratiecontracten.

## 13. Volgende fase

- Stap 2 — Requirements & Scope: productjourneys per rol, processen, functionele en niet-functionele eisen, MVP-backlog, business rules en acceptatietests. Pas daarna de definitieve techstack.
