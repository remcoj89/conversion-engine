# Duitse partnerpilot — Conversion Engine

**Status:** intern strategiedocument — eerste concept
**Doel:** toetsen of Conversion Engine ook als partnerplatform voor andere webondernemers kan worden aangeboden
**Pilotpartner:** Duitse ondernemer uit het persoonlijke netwerk van Westend Digital
**Markt:** Duitsland

## 1. Samenvatting

Westend Digital onderzoekt of Conversion Engine na de eigen MVP beschikbaar kan worden gemaakt voor andere ondernemers die websites bouwen voor hun eigen klanten.

De eerste mogelijke partner werkt voor de Duitse markt. Zij zou Conversion Engine gebruiken voor haar eigen klanten en zelf de klantwebsites bouwen. Westend Digital blijft verantwoordelijk voor het platform, de technische werking, security en updates. De partner beheert haar eigen klantrelaties, websites en dagelijkse uitvoering.

De eerste test wordt bewust laagdrempelig opgezet:

- geen setupfee;
- gratis gebruik tijdens een beperkte pilot;
- alleen bouwen van Duitse vertaling en een partneromgeving als de partner daadwerkelijk wil testen;
- geen verplichting om de pilot voort te zetten;
- de pilot dient als productvalidatie en kan — met toestemming — een eerste Duitse case study opleveren.

De pilot is geen onbeperkte gratis dienstverlening. Scope, gebruikslimieten, support en evaluatiemomenten worden vooraf duidelijk afgesproken.

## 2. Strategische beoordeling

Dit is een kansrijke uitbreiding, maar alleen als Conversion Engine wordt verkocht als een middel waarmee de partner sneller en winstgevender websites kan opleveren.

De waarde is niet simpelweg:

> Toegang tot software en AI-credits.

De waarde is:

> Een gecontroleerde workflow waarmee een webondernemer klantinformatie omzet in een Project Brief, websitebouwinstructies, content en opvolgprocessen — zonder zelf CRM-, onboarding- en AI-infrastructuur te hoeven ontwikkelen.

De eerste partner is daarom geen gewone affiliate. Zij is een mogelijke implementatiepartner of reseller:

```text
Westend Digital
  Platform, hosting, security, updates en AI-infrastructuur
                 │
                 ▼
Duitse partner
  Eigen klantrelatie, websitebouw en eerste lijn support
                 │
                 ▼
Eigen klantomgevingen
```

## 3. Wat de partner krijgt

De toekomstige partneromgeving moet haar helpen om:

- klanten via een Duitse onboarding te laten antwoorden;
- antwoorden automatisch te bewaren en hervatten;
- een gestructureerde Project Brief te genereren;
- AI-ondersteunde websiteprompts te maken;
- websites sneller vanuit klantinformatie te produceren;
- per klant een eigen omgeving en datagrens te behouden;
- later eventueel leads, taken en resultaten per klant te beheren.

De partner hoeft in de eerste pilot niet zelf platformbeheer, databasebeheer, security of deployments te doen.

## 4. Pilotvoorwaarden

### 4.1 Wat Westend aanbiedt

- Geen setupfee.
- Gratis toegang tijdens de afgesproken pilotperiode.
- Duitse vertaling alleen wanneer de partner daadwerkelijk wil testen.
- Een beperkte partneromgeving voor haar eigen klantprojecten.
- Technisch onderhoud, security-updates en platformbeheer door Westend.
- Gezamenlijke evaluatie van gebruik, knelpunten en mogelijke vervolgstappen.

### 4.2 Wat de partner toezegt

- Zij gebruikt de pilot actief voor minimaal één echt of realistisch klantproject.
- Zij geeft concrete feedback op onboarding, taal, workflow en AI-output.
- Zij meldt fouten, beveiligingsproblemen en onduidelijke klantflows.
- Zij gebruikt geen echte gevoelige klantdata voordat opslag, rollen, privacy en productiegrenzen daarvoor zijn goedgekeurd.
- Zij levert toestemming voordat haar naam, resultaten of projectdata in een case study worden gebruikt.

### 4.3 Grenzen van de gratis pilot

- De pilot heeft een vooraf afgesproken looptijd, bijvoorbeeld 60 of 90 dagen.
- Er is een maximumaantal klantomgevingen.
- AI-gebruik heeft een redelijke limiet.
- Support verloopt via één afgesproken kanaal.
- Nieuwe maatwerkfuncties worden niet automatisch onderdeel van de gratis pilot.
- Een verzoek dat alleen voor haar specifieke bedrijf nodig is, wordt eerst apart beoordeeld.

Gratis betekent hier: geen financiële drempel voor een bevriende designpartner. Het betekent niet: onbeperkte ontwikkeling of onbeperkte support.

## 5. Toekomstig commerciële model

Na een geslaagde pilot is een partnerlicentie logischer dan een affiliateconstructie.

Een mogelijke structuur:

1. Een vaste maandelijkse platformfee voor de partner.
2. Een bedrag per actieve klantomgeving.
3. Een inbegrepen AI-budget per klantomgeving.
4. Betaalde extra AI-consumptie of een groter pakket.
5. Optioneel een premium white-labelpakket met eigen branding en domein.

Een eerste commerciële hypothese na validatie:

- setupfee: €750–€1.500;
- platformfee: €299–€499 per maand;
- inbegrepen: 3–5 actieve klantomgevingen;
- extra klantomgeving: €49–€99 per maand;
- AI-gebruik binnen een duidelijke bundel;
- 90 dagen minimale looptijd.

Deze bedragen zijn startpunten voor validatie, geen definitieve prijslijst.

De Duitse partner bepaalt vervolgens zelf haar verkoopprijs richting haar klanten. Zij koopt capaciteit en infrastructuur in; Westend verkoopt haar geen losse uren.

## 6. AI-credits en kostenbeheersing

AI-kosten moeten beheersbaar en uitlegbaar zijn. Ruwe tokens zijn hiervoor geen geschikt klantbegrip, omdat verschillende modellen en opdrachten verschillende kosten hebben.

Gebruik daarom een interne credit- of unitstructuur:

- korte tekstbewerking: laag aantal credits;
- Project Brief-samenvatting: middelgroot aantal credits;
- pagina- of sitemapgeneratie: hoger aantal credits;
- volledige websitepromptset: hoogste aantal credits.

Intern moet ieder gebruik worden geregistreerd met:

- partner- en klanttenant;
- gebruiker;
- type AI-opdracht;
- provider en model;
- input- en outputtokens;
- interne kostprijs;
- aantal gebruikte credits;
- status en eventuele foutmelding;
- idempotency- of request-ID.

### Aanbevolen volgorde

1. Tijdens de pilot gebruikt Westend eigen API-keys.
2. De partner krijgt een vaste, begrensde bundel.
3. Overschrijding wordt geregistreerd en eerst handmatig geëvalueerd.
4. Pas bij structureel gebruik komt betaalde overage.
5. Bring Your Own Key wordt pas later onderzocht.

BYOK kan interessant zijn voor grotere partners, maar vereist veilige versleutelde opslag, key-rotatie, limieten, foutafhandeling en extra support. Het hoort niet in de eerste gratis pilot.

## 7. AI voor websiteproductie

De bestaande onboarding en Project Brief vormen het juiste startpunt voor AI-ondersteunde websiteproductie.

De eerste AI-versie moet geen volledig autonome websitebouwer worden. De AI maakt een gecontroleerde production pack:

```text
Q1–Q4 onboarding
        ↓
Project Brief
        ↓
AI production pack
  ├── sitemap-prompt
  ├── pagina- en copybrief
  ├── sectiekeuze uit de component library
  ├── design tokens
  ├── CTA- en leadmagnetvoorstel
  ├── SEO-basis
  └── QA-checklist
```

De output moet:

- gebaseerd zijn op de gevalideerde Project Brief;
- geen klantclaims, reviews, prijzen of garanties verzinnen;
- bronherkomst en onzekerheden behouden;
- een taal en doelgroep expliciet meekrijgen;
- versieerbaar zijn;
- menselijke controle vereisen vóór publicatie;
- niet zelfstandig live deployen.

De eerste belofte aan de partner kan daardoor zijn:

> Van klantintake naar een gecontroleerde websitebouwinstructie in minuten.

## 8. Duitse lokalisatie

De Duitse vertaling wordt pas gebouwd nadat de partner heeft bevestigd dat zij de pilot wil gebruiken.

Duitse lokalisatie omvat meer dan vertaalde knoppen:

- onboardingvragen;
- uitleg en helpteksten;
- foutmeldingen en validatie;
- e-mails en systeemmeldingen;
- AI-prompts en outputtaal;
- datum-, valuta- en nummerformaten;
- tone of voice;
- privacy- en juridische teksten;
- controle door een native Duitstalige.

De software moet talen niet als aparte codebases behandelen. Field-ID’s en datacontracten blijven stabiel; labels, hulpteksten en prompts krijgen vertalingen.

Gebruik conceptueel drie taalinstellingen:

- `ui_locale`: taal van de applicatie;
- `content_locale`: taal van de websitecontent;
- `tenant_locale`: standaardtaal van een klantomgeving.

Zo kan de partner bijvoorbeeld een Nederlandse beheerdersinterface gebruiken terwijl haar klantomgeving en website Duits zijn.

## 9. Technische productrichting na MVP

Voor resellers is een extra organisatielaag nodig. De huidige tenantstructuur is geschikt voor afzonderlijke klanten, maar nog niet voor een partner die meerdere klanten beheert.

De toekomstige structuur wordt waarschijnlijk:

```text
Westend platform
  └── Partnerorganisatie
        ├── Klanttenant A
        ├── Klanttenant B
        └── Klanttenant C
```

Benodigde onderdelen zijn onder andere:

- partnerorganisatie en partnerrol;
- klanttenants onder een partner;
- partnerisolatie tussen resellers;
- rechten per partner en klanttenant;
- klant- en partnerbranding;
- usage- en creditadministratie;
- partnerdashboard;
- data-export en exitprocedure;
- support- en escalatiemodel;
- billing en abonnementstatus.

Deze onderdelen worden pas gebouwd nadat de pilot vraag en gebruik heeft bewezen.

## 10. Succescriteria van de pilot

De pilot is geslaagd wanneer de volgende vragen positief kunnen worden beantwoord:

- Wil de partner de software daadwerkelijk gebruiken?
- Gebruikt zij de onboarding voor minimaal één klantproject?
- Bespaart de workflow aantoonbaar tijd?
- Kan zij zelfstandig websites bouwen op basis van de Project Brief en AI production pack?
- Is de Duitse output bruikbaar zonder voortdurende herschrijving?
- Hoeveel support vraagt één actieve klantomgeving?
- Wat kost AI-gebruik per klantproject?
- Kan zij hier zelf marge op maken?
- Zou zij na de gratis pilot betalen voor voortgezet gebruik?
- Mag Westend de resultaten als case study gebruiken?

De belangrijkste validatievraag is niet of zij de demo leuk vindt, maar:

> Zou zij dit blijven gebruiken als de gratis periode voorbij is?

## 11. Case study

Een case study mag alleen worden gemaakt na expliciete toestemming van de partner en, waar relevant, haar klant.

Mogelijke meetpunten:

- tijd vóór en na gebruik van Conversion Engine;
- aantal klantprojecten;
- tijd van onboarding naar eerste websiteversie;
- aantal correctierondes;
- AI-kosten per project;
- omzet of marge voor de partner;
- tevredenheid van de partner en haar klant;
- welke onderdelen daadwerkelijk gebruikt worden.

De case study moet geen onbewezen omzetbelofte worden. Het doel is aantonen welke workflow sneller, eenvoudiger of winstgevender werd.

## 12. Besluit en aanbevolen volgorde

De uitbreiding naar andere ondernemers is strategisch interessant, mits Westend eerst de eigen MVP en daarna één partnerpilot valideert.

Aanbevolen volgorde:

1. Eigen MVP afronden en testen.
2. De Duitse ondernemer het concept tonen.
3. Alleen bij duidelijke interesse een gratis pilotafspraak maken.
4. Pilotdoelgroep, looptijd, gebruikslimieten en feedbackmomenten vastleggen.
5. Duitse vertaling en beperkte partneromgeving bouwen.
6. Eén echt klantproject door de workflow laten lopen.
7. Gebruik, kosten, support en resultaten meten.
8. Na de pilot een betaalde partnerlicentie voorstellen.
9. Pas daarna resellerfunctionaliteit, billing en volledige white-labeling bouwen.

De kernbeslissing is daarmee:

> Eerst vraag bewijzen met een goedkope, begrensde designpartnerpilot. Daarna pas productiseren voor meerdere resellers.
