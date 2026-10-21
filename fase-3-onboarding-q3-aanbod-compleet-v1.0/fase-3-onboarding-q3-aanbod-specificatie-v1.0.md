# Westend Digital Conversion Engine
## Fase 3 — Vragenlijst Q3 · Aanbod & Verdienmodel

**Versie:** v1.0 (concept ter review)  
**Datum:** 17 oktober 2026  
**Doelgroep:** Business Owner  
**Input:** Q1 Kickoff + Q2 Doelgroep  
**Output:** `ProjectBrief.offer` + `ProjectBrief.funnel` + `ProjectBrief.evidence`

### 1. Doel & ontwerpgrenzen
- **5 schermen, 35 kernvelden, 18 standaard verplicht**, plus 3 conditioneel verplichte velden. De extra aanbiedingen zijn een herhaalbare substructuur van maximaal twee items.
- Eén primair aanbod; secundaire aanbiedingen zijn aanvullende context en leiden niet automatisch tot extra landingspagina’s of funnels.
- Fase 2 blijft leidend: €999-websitescope, één actieve leadmagnet, CRM, maximaal één inhoudelijke AI-reply en Westend-review vóór publicatie.
- Prijsgegevens mogen alleen automatisch worden overgenomen wanneer bevestigd en juridisch passend weergegeven; exacte btw-presentatie en algemene voorwaarden worden apart gecontroleerd.
- Geschatte klantinvultijd 12–18 minuten is een **te toetsen hypothese**; lange intakes kunnen in meer sessies worden ingevuld.

### 2. Schermvolgorde
| Stap | Scherm | Doel |
|---|---|---|
| 1/5 | Je belangrijkste aanbod | Kies één dienst of pakket waarop de nieuwe website zich als eerste richt. |
| 2/5 | Werkwijze & inhoud | Beschrijf wat de klant daadwerkelijk ontvangt en hoe de samenwerking verloopt. |
| 3/5 | Prijzen & voorwaarden | We nemen geen prijzen of garanties over zonder jouw bevestiging. |
| 4/5 | Verkoop & conversie | Welke concrete actie moet een bezoeker ondernemen om klant te worden? |
| 5/5 | Vertrouwen & laatste controle | Laat zien welke claims en klantvragen we met echte bronnen kunnen ondersteunen. |

### 3. Exacte vragen, types, verplichtingen en Project Brief-mapping

De conditioneel verplichte velden worden alleen verplicht wanneer ze zichtbaar zijn. Verborgen waarden mogen niet in de goedgekeurde Project Brief worden opgenomen.

#### 1/5 — Je belangrijkste aanbod
Kies één dienst of pakket waarop de nieuwe website zich als eerste richt.

| ID | Exacte vraag | Type | Verplicht | Validatie | Mapping |
|---|---|---|:---:|---|---|
| `main_offer_name` | Hoe heet jouw belangrijkste dienst of pakket? | Korte tekst | Ja | min 3; max 120 | `offer.primary.name` |
| `main_offer_summary` | Wat krijgt de klant concreet bij dit aanbod? | Lange tekst | Ja | min 30; max 650 | `offer.primary.summary` |
| `main_offer_audience` | Voor welk deel van je doelgroep is dit aanbod bedoeld? | Lange tekst | Ja | min 15; max 380 | `offer.primary.audience_fit` |
| `main_offer_problem` | Welk concreet probleem helpt dit aanbod op te lossen? | Lange tekst | Ja | min 15; max 400 | `offer.primary.problem` |
| `main_offer_result` | Wat kan de klant na het traject realistisch verwachten? | Lange tekst | Ja | min 20; max 500 | `offer.primary.outcome` |
| `additional_offers` | Welke aanvullende diensten of pakketten wil je vermelden? | Herhaalbare dienst | Nee | min 0 items; max 2 items | `offer.secondary` |

**Keuzes, voorbeelden en business rules**

- **`main_offer_name`** — Werknaam is voldoende; de definitieve commerciële titel komt na strategische review. Voorbeeld: _Persoonlijke krachttraining_.
- **`main_offer_summary`** — Beschrijf de feitelijke inhoud; geen losse slogans. Voorbeeld: _Wekelijkse 1-op-1 training met een persoonlijk schema en periodieke voortgangsgesprekken._.
- **`main_offer_audience`** — Moet aansluiten bij de primaire doelgroep in Q2; mismatch wordt reviewpunt. Voorbeeld: _Drukke professionals die begeleiding willen bij regelmatig krachttrainen._.
- **`main_offer_problem`** — Geen medische of onbewezen werkzaamheidsclaims. Voorbeeld: _De klant mist een plan en persoonlijke begeleiding om consistent te trainen._.
- **`main_offer_result`** — Verwachting is geen resultaatgarantie; claims moeten afzonderlijk worden gecontroleerd. Voorbeeld: _Een helder trainingsplan, goede begeleiding en beter inzicht in eigen voortgang._.
- **`additional_offers`** — Maximaal twee aanvullende aanbiedingen in intake; geen automatische extra funnels of pagina’s binnen de vaste €999-scope. Per aanvullend item: Naam aanvullende dienst (verplicht), Wat is het? (verplicht), Prijsindicatie (optioneel) (optioneel).

#### 2/5 — Werkwijze & inhoud
Beschrijf wat de klant daadwerkelijk ontvangt en hoe de samenwerking verloopt.

| ID | Exacte vraag | Type | Verplicht | Validatie | Mapping |
|---|---|---|:---:|---|---|
| `delivery_mode` | Hoe lever je deze dienst meestal? | Enkelkeuze | Ja | keuzelijst | `offer.primary.delivery.mode` |
| `included_deliverables` | Wat is precies inbegrepen in je belangrijkste aanbod? | Lange tekst | Ja | min 30; max 900 | `offer.primary.delivery.inclusions` |
| `delivery_steps` | Hoe ziet de samenwerking stap voor stap eruit? | Lange tekst | Ja | min 30; max 900 | `offer.primary.delivery.steps` |
| `typical_duration` | Hoe lang duurt de dienstverlening of het traject doorgaans? | Korte tekst | Nee | max 150 | `offer.primary.delivery.duration` |
| `customer_commitments` | Wat moet de klant zelf doen of aanleveren? | Lange tekst | Nee | max 500 | `offer.primary.delivery.customer_commitments` |
| `exclusions` | Wat is nadrukkelijk niet inbegrepen? | Lange tekst | Nee | max 500 | `offer.primary.delivery.exclusions` |
| `capacity` | Zijn er beperkingen in beschikbaarheid of capaciteit? | Korte tekst | Nee | max 220 | `offer.primary.delivery.capacity` |

**Keuzes, voorbeelden en business rules**

- **`delivery_mode`** — Locatie- en afspraakopties later door Westend configureren. Keuzes: Op locatie (`onsite`), Online (`remote`), Combinatie online en op locatie (`hybrid`), Digitaal product / materiaal (`digital`).
- **`included_deliverables`** — Feitelijke inclusies; niet automatisch extra onderdelen beloven. Voorbeeld: _Intake, 8 begeleide trainingen, trainingsschema en voortgangsgesprek._.
- **`delivery_steps`** — Bron voor werkwijze-, FAQ- en verwachtingenpagina. Voorbeeld: _1. Kennismaken / 2. Intake en doelen / 3. Persoonlijk programma / 4. Evalueren_.
- **`typical_duration`** — Geen gegarandeerde oplevertermijn zonder contractgrondslag. Voorbeeld: _8 weken; daarna maandelijks verlengbaar._.
- **`customer_commitments`** — Gebruik realistische verwachtingen en geen beschuldigende formuleringen. Voorbeeld: _Tijd vrijmaken voor twee afspraken per week._.
- **`exclusions`** — Relevant voor offerte, FAQ en verwachtingen. Voorbeeld: _Geen voedingsschema op maat of begeleiding buiten contacturen._.
- **`capacity`** — Niet omzetten in schaarsteclaim zonder recente bevestiging. Voorbeeld: _Maximaal 12 actieve cliënten tegelijk._.

#### 3/5 — Prijzen & voorwaarden
We nemen geen prijzen of garanties over zonder jouw bevestiging.

| ID | Exacte vraag | Type | Verplicht | Validatie | Mapping |
|---|---|---|:---:|---|---|
| `pricing_model` | Hoe is je belangrijkste aanbod geprijsd? | Enkelkeuze | Ja | keuzelijst | `offer.primary.pricing.model` |
| `price_amount` | Wat is het bedrag in euro’s? | Bedrag (€) | Ja | min 0.01; max 1000000; conditioneel: {'field': 'pricing_model', 'in': ['fixed', 'starting_at', 'recurring']} | `offer.primary.pricing.amount_eur` |
| `recurring_period` | Hoe vaak betaalt de klant dit bedrag? | Enkelkeuze | Ja | conditioneel: {'field': 'pricing_model', 'eq': 'recurring'} | `offer.primary.pricing.billing_interval` |
| `price_display` | Wat mogen we op de website over de prijs vermelden? | Enkelkeuze | Ja | keuzelijst | `offer.primary.pricing.public_display` |
| `pricing_details` | Welke aanvullende informatie is belangrijk over prijs of betalingsvoorwaarden? | Lange tekst | Nee | max 650 | `offer.primary.pricing.conditions` |
| `price_source` | Waarop zijn deze prijsgegevens gebaseerd? | Enkelkeuze | Ja | keuzelijst | `offer.primary.pricing.evidence_level` |
| `optional_addons` | Zijn er betaalde extra’s of upgrades voor jouw eigen klanten? | Lange tekst | Nee | max 450 | `offer.primary.pricing.upsells` |

**Keuzes, voorbeelden en business rules**

- **`pricing_model`** — Model bepaalt of een bedrag vereist is; valuta EUR voor MVP. Keuzes: Vast bedrag (`fixed`), Vanafprijs (`starting_at`), Terugkerend abonnement (`recurring`), Offerte op aanvraag (`quote`), Gratis kennismaking / eerste stap; betaalde dienst later (`free`).
- **`price_amount`** — Bedrag alleen verplicht bij vaste prijs, vanafprijs of abonnement. Positief decimaal; voor productie server-side valuta normaliseren. Voorbeeld: _149,00_.
- **`recurring_period`** — Geen fictieve contractduur of opzegvoorwaarden afleiden. Keuzes: Per maand (`monthly`), Per kwartaal (`quarterly`), Per jaar (`yearly`).
- **`price_display`** — Bij offerte of gratis eerste stap nooit automatisch een totaalprijs publiceren. Keuzes: Bedrag zichtbaar tonen (`show`), Een vanafprijs tonen (`starting`), Prijs bespreken na contact (`discuss`).
- **`pricing_details`** — Geen juridische/contractuele voorwaarden verzinnen. Voorbeeld: _Betaling per maand vooruit; minimale looptijd wordt schriftelijk afgesproken._.
- **`price_source`** — Bij indicative/undecided prijs blokkeren voor automatische publicatie tot verificatie. Keuzes: Dit zijn mijn actuele, bevestigde prijzen (`current`), Dit zijn indicaties; eerst controleren (`indicative`), Prijsstelling moet nog worden bepaald (`undecided`).
- **`optional_addons`** — Niet verwarren met Westend-upsells als branding of fotografie. Voorbeeld: _Extra PT-sessie of losse techniekworkshop._.

#### 4/5 — Verkoop & conversie
Welke concrete actie moet een bezoeker ondernemen om klant te worden?

| ID | Exacte vraag | Type | Verplicht | Validatie | Mapping |
|---|---|---|:---:|---|---|
| `primary_conversion` | Wat is de belangrijkste vervolgstap voor een geïnteresseerde bezoeker? | Enkelkeuze | Ja | keuzelijst | `offer.funnel.primary_goal` |
| `preferred_cta` | Welke tekst past bij de hoofdknop? | Korte tekst | Nee | max 85 | `offer.funnel.cta_copy_proposal` |
| `booking_provider` | Welke afspraaktool gebruik je? | Enkelkeuze | Ja | keuzelijst | `offer.funnel.booking.provider` |
| `booking_url` | Wat is de link waarop bezoekers kunnen boeken? | URL | Nee | max 500; conditioneel: {'field': 'booking_provider', 'in': ['calendly', 'other']} | `offer.funnel.booking.url` |
| `qualified_lead_signals` | Wanneer is een aanvraag voor jou interessant? | Lange tekst | Ja | min 20; max 600 | `offer.funnel.qualification.criteria` |
| `first_contact_questions` | Welke maximaal drie vragen mag de eerste reactie stellen? | Lange tekst | Nee | max 450 | `offer.funnel.qualification.preferred_questions` |
| `preferred_contact_channel` | Hoe neem je het liefst contact op met nieuwe leads? | Enkelkeuze | Ja | keuzelijst | `offer.funnel.handoff.preferred_channel` |
| `leadmagnet_idea` | Welke leadmagnet lijkt geschikt? | Enkelkeuze | Nee | keuzelijst | `offer.funnel.leadmagnet_preference` |

**Keuzes, voorbeelden en business rules**

- **`primary_conversion`** — Directe checkout valt buiten deze standaardfunnel; eventueel apart maatwerk. Keuzes: Kennismakingsgesprek boeken (`book`), Proefles / proefafspraak aanvragen (`trial`), Offerte aanvragen (`quote`), Contactformulier invullen (`contact`).
- **`preferred_cta`** — Een AI-voorstel mag worden gedaan; geen woord als gratis gebruiken tenzij aantoonbaar van toepassing. Voorbeeld: _Plan een gratis kennismaking_.
- **`booking_provider`** — Alleen bevestigde boekingen mogen als afspraak in CRM worden geregistreerd. Keuzes: Calendly (`calendly`), Andere agenda- of boekingstool (`other`), Nog geen boekingstool (`none`).
- **`booking_url`** — Een ontbrekende link is niet fataal voor concept; bij primaire CTA boeken is dit wel een launch-blocker. Voorbeeld: _https://calendly.com/voorbeeld/kennismaking_.
- **`qualified_lead_signals`** — Objectieve commerciële geschiktheid; geen gevoelige persoonsgegevens of uitsluiting. Voorbeeld: _Persoon zoekt coaching op locatie en wil binnen vier weken beginnen._.
- **`first_contact_questions`** — Voorkomen van dubbele of gevoelige vragen; AI-reactie blijft maximaal één keer inhoudelijk. Voorbeeld: _Wat is je doel? Wanneer wil je beginnen? Wil je online of op locatie trainen?_.
- **`preferred_contact_channel`** — Geen automatische telefonie of onbeperkte opvolging inbegrepen. Keuzes: E-mail (`email`), Telefoon (`phone`), Ingeplande afspraak (`meeting`).
- **`leadmagnet_idea`** — Dit is een voorkeur, geen tweede actieve leadmagnet of automatische publicatie. Keuzes: Laat Westend adviseren (`advice`), Quiz / assessment (`quiz`), Calculator (`calculator`), Downloadbare gids (`download`), Voorlopig geen idee (`none`).

#### 5/5 — Vertrouwen & laatste controle
Laat zien welke claims en klantvragen we met echte bronnen kunnen ondersteunen.

| ID | Exacte vraag | Type | Verplicht | Validatie | Mapping |
|---|---|---|:---:|---|---|
| `proof_types` | Welk bewijs voor jouw aanbod is momenteel beschikbaar? | Meerkeuze | Ja | min 1 items; max 5 items | `offer.evidence.available_types` |
| `proof_context` | Welke voorbeelden of resultaten mogen we controleren? | Lange tekst | Nee | max 650 | `offer.evidence.description` |
| `common_offer_questions` | Welke drie vragen stellen mensen het vaakst over jouw aanbod? | Lange tekst | Ja | min 20; max 850 | `offer.faq.questions` |
| `guarantee_or_promise` | Doe je een specifieke belofte of geef je garantie? | Lange tekst | Nee | max 450 | `offer.evidence.claimed_guarantees` |
| `claim_basis` | Hoe is deze specifieke belofte onderbouwd? | Lange tekst | Ja | min 15; max 550; conditioneel: {'field': 'guarantee_or_promise', 'nonempty': True} | `offer.evidence.guarantee_support` |
| `restricted_messaging` | Wat mogen we absoluut niet beloven of publiceren? | Lange tekst | Nee | max 450 | `offer.evidence.disallowed_claims` |
| `offer_evidence_basis` | Hoe betrouwbaar is de meeste informatie die je hebt ingevuld? | Enkelkeuze | Ja | keuzelijst | `offer.evidence.source_quality` |

**Keuzes, voorbeelden en business rules**

- **`proof_types`** — Bewijsstukken later via Q4 uploaden; geen nepreviews of before/after-claims verzinnen. Keuzes: Echte reviews (`reviews`), Echte cases of werkvoorbeelden (`cases`), Diploma’s en certificeringen (`credentials`), Foto’s van werk of resultaten met toestemming (`portfolio`), Documentatie van de werkwijze (`process`), Nog geen bewijsstukken (`none`).
- **`proof_context`** — Geen persoonlijke gegevens of afbeeldingen van klanten in het tekstveld opnemen. Voorbeeld: _Vijf reviews op Google en twee geanonimiseerde praktijkcases._.
- **`common_offer_questions`** — Input voor FAQ; concrete antwoorden volgen uit de geverifieerde aanbiedingsgegevens. Voorbeeld: _Hoe ziet de eerste sessie eruit? Hoe vaak trainen we? Wat gebeurt er als ik moet annuleren?_.
- **`guarantee_or_promise`** — Claims pas publiek na contract-/broncontrole. Voorbeeld: _Geen resultaatsgarantie; wel persoonlijke begeleiding en regelmatige evaluatie._.
- **`claim_basis`** — Verplichte toelichting indien garantie of belofte is ingevuld. Voorbeeld: _Vastgelegd in de huidige overeenkomst met klanten._.
- **`restricted_messaging`** — Geldt als expliciete redactieregel voor AI Copy Agent. Voorbeeld: _Geen afvallen-in-30-dagen-belofte, geen medische claims._.
- **`offer_evidence_basis`** — Annotatie bronkwaliteit in Project Brief; onbekend nooit omzetten in feit. Keuzes: Gebaseerd op bestaande klanten en echte verkoopervaring (`experience`), Deels ervaring, deels aannames (`mixed`), Dit aanbod is nieuw; veel aannames moeten nog worden getoetst (`new`).

### 4. Dynamische validatieregels
- `additional_offers`: 0–2 aanvullende items, per item naam + beschrijving verplicht; geen lege/halflege items opslaan.
- `pricing_model=fixed|starting_at|recurring`: `price_amount` verplicht en positief. Bij `quote|free` geldt geen bedrag; verborgen bedrag actief opruimen.
- `pricing_model=recurring`: `recurring_period` verplicht. Prijs kan niet automatisch per maand worden geïnterpreteerd zonder periode.
- `pricing_model=quote|free`: `price_display=show|starting` is ongeschikt; UI toont conflict en vraagt om `discuss`, of Westend beoordeelt de gewenste copy.
- `booking_provider=calendly|other`: `booking_url` zichtbaar met https-URL-validatie als gevuld. Bij boekings-CTA en ontbrekende link volgt een duidelijke **launch-blocker**, geen blokkade om intake als concept in te dienen.
- `proof_types=none`: exclusief; andere bewijssoorten worden uit de keuze gehaald.
- `guarantee_or_promise` ingevuld: `claim_basis` verplicht, bronbewijs nog te verifiëren door Westend.
- Ontbrekende of onbevestigde prijzen/claims zijn `needs_review`, nooit geschikt voor autopublicatie.
- Browserdemo kan lokaal opslaan; productie slaat revisions server-side op met API-autorisatie, autosave-feedback, veilige uploads in Q4 en idempotente submit.

### 5. Project Brief & agentgebruik
| Pad | Betekenis | Afhankelijk gebruik |
|---|---|---|
| `offer.primary` | Hoofdproduct, doelgroep, pijnpunt, resultaat | Strategy, Copy, Sitemap |
| `offer.secondary[]` | Max. twee overige diensten | Uitbreidingscontext, geen automatische pagina |
| `offer.primary.delivery` | Werkwijze, inbegrepen, duur en uitsluitingen | Copy, FAQ, Ontwerp |
| `offer.primary.pricing` | Model, prijs, termijn, publicatiestatus, bewijsniveau | Copy na goedkeuring, sales |
| `offer.funnel` | CTA, boeking, kwalificatie, leadmagnetvoorkeur | Lead Capture, CRM, Automations |
| `offer.evidence` en `offer.faq` | Feiten, cases, bronstatus, FAQ en verboden claims | Copy QA, conversiestrategie |

### 6. Voorbeeld antwoordcontract
```json
{
  "form_id": "Q3_AANBOD",
  "schema_version": "1.0.0",
  "status": "draft",
  "tenant_id": "<server assigned>",
  "answers": {
    "main_offer_name": "1-op-1 krachttraining",
    "main_offer_summary": "Persoonlijke training en plan op maat met periodieke evaluaties.",
    "additional_offers": [
      {
        "name": "Groepstraining",
        "description": "Kleine groepslessen voor maximaal zes deelnemers.",
        "price_note": "Vanaf €18 per sessie"
      }
    ],
    "pricing_model": "recurring",
    "price_amount": "149.00",
    "recurring_period": "monthly",
    "price_source": "current",
    "primary_conversion": "book",
    "booking_provider": "calendly",
    "booking_url": "https://calendly.com/voorbeeld/gesprek"
  },
  "provenance": {
    "source": "client_supplied",
    "verified_by_westend": false
  }
}
```

### 7. Veiligheid, rollen en meerwerk
- Eigenaarsrol kan Q3 aanpassen en indienen; Westend kan na geautoriseerde inzage reviewen/goedkeuren; Team Members niet standaard.
- Aanbod- en prijswijzigingen na goedkeuring vragen versiebeheer en waar nodig nieuwe publicatiecontrole.
- Nieuwe betaalde funnel, webwinkel/checkout, meer dan één actieve leadmagnet of extra pagina’s vallen niet automatisch in de standaardwebsite.
- Schakel AI-publiekscopy en berichten uit totdat Westend de commerciële claims, CTA en contactgegevens heeft gecontroleerd.

### 8. Acceptatiecriteria
- **Q3-AT01:** Vijf stappen en terugnavigatie werken; actieve antwoorden worden als concept hervat.
- **Q3-AT02:** Eén hoofdaanbod is verplicht; secundaire aanbiedingen zijn beperkt tot twee complete, valide items.
- **Q3-AT03:** Bij vaste/vanaf-/abonnementsprijzen is een geldig positief eurobedrag vereist; offerte/gratis mogen dat niet behouden.
- **Q3-AT04:** Abonnement toont verplicht de betaalperiode; bij ander model wordt het verborgen veld niet geëxporteerd.
- **Q3-AT05:** Een offerteaanbod kan niet als publieke vaste prijs worden gepubliceerd; inconsistenties worden als reviewpunt gemarkeerd.
- **Q3-AT06:** Ontbrekende boekingslink bij boekings-CTA blokkeert livegang, niet het conceptformulier.
- **Q3-AT07:** Bewijsmateriaal `none` is exclusief; claims/garanties vereisen onderbouwing vóór publicatie.
- **Q3-AT08:** Project Brief houdt primaire/secundaire aanbiedingen, prijzen, bewijsniveau en onzekerheden gescheiden.
- **Q3-AT09:** AI schrijft geen eigen prijs, garantie, korting, vrije AI-conversatie of extra pagina zonder akkoord.
- **Q3-AT10:** Server-side tenant-/rolcontrole; Team Member kan strategische intake niet ongevraagd wijzigen.
- **Q3-AT11:** Formulier werkt bij 320 px, toetsenbordinteractie, foutfocus en duidelijke labels.
- **Q3-AT12:** Pilot toetst invultijd, incomplete prijzen, aanbiedingcomplexiteit en kopieerbare Project Brief.

### 9. Handoff en openstaande productbesluiten
- JSON-schema als formulierconfig: `fase-3-q3-aanbod-fields-v1.0.json`.
- UX-demo: `fase-3-q3-aanbod-interactieve-onboarding-v1.0.html`.
- In fase 4/5 ontwerpen: geldbedrag-decimalisatie (EUR), statuswerkstroom, serverautorisatie en definitief antwoordcontract.
- Nog vast te leggen vóór klantverkoop: precieze €999-pagina-/sectiescope, prijsvermelding inclusief btw voor consumenten waar van toepassing en commerciële voorwaarden.
- Volgende vragenlijst: Q4 — Branding, Content & Assets.
