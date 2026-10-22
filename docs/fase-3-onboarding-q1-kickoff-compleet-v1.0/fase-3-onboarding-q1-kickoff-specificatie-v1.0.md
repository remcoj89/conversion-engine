# Westend Digital Conversion Engine — Fase 3
## Vragenlijst Q1: Kickoff & Bedrijfsidentiteit — Productspecificatie v1.0 (concept)
**Datum:** 17 oktober 2026  
**Status:** voor functionele review  
**Scope:** alleen Q1 van de vier onboardingvragenlijsten  
**Bron:** Fase 2 requirements v1.0 en Fase 3 dashboardontwerpen.  

### 1. Doel en uitgangspunten
Q1 verzamelt verifieerbare informatie over het bedrijf, het ondernemersverhaal, expertise, positionering en schrijfstijl. De output wordt één gestructureerde Project Brief voor interne AI-agents. De klant stelt geen website live vanuit deze vragenlijst.
- 5 compacte schermen; richttijd 8–12 minuten voor Q1, afhankelijk van hoeveel verhaal iemand deelt. Dit is een ontwerpaanname en wordt tijdens de pilot gemeten.
- 23 velden waarvan 11 altijd verplicht, en 1 alleen verplicht bij een bepaalde keuze. Andere velden zijn optioneel. Niet van toepassing zijnde vragen worden verborgen.
- Alleen de aan de website gerelateerde informatie verzamelen; geen gevoelige persoonsgegevens, privégezondheidsgegevens of bewijsstukken rechtstreeks in Q1 vragen.
- Een tekstveld hoeft niet perfect geschreven te zijn: bedrijfsfeiten komen van de ondernemer, AI schrijft later conceptcopy.
- Een opvallend verhaal of militaire achtergrond is optioneel, nooit een vereiste; het mag slechts worden gebruikt conform de opgegeven voorkeur en latere inhoudelijke goedkeuring.
- Q2 behandelt de doelgroep, Q3 het aanbod, Q4 branding en assets. Geen inhoudelijk dubbelwerk.

### 2. Schermindeling en voortgang
**Scherm 1/5 — Bedrijf in het kort:** Eerst de basis: wat doet jouw bedrijf precies? (4 velden).
**Scherm 2/5 — Oorsprong & ondernemersverhaal:** Wat bracht je ertoe dit bedrijf te beginnen? (4 velden).
**Scherm 3/5 — Ervaring & geloofwaardigheid:** Wat laat zien dat klanten bij jou in goede handen zijn? (7 velden).
**Scherm 4/5 — Werkwijze & onderscheid:** Waarom kiest een klant voor jou en niet voor een alternatief? (4 velden).
**Scherm 5/5 — Tone of voice:** Hoe wil je dat jouw website klinkt? (4 velden).

**Globale bediening:** `Vorige`, `Opslaan en later verder`, `Volgende`, en in scherm 5 `Controleer antwoorden`. Onderweg wordt veilig opgeslagen; labels blijven zichtbaar; aantallen geselecteerde keuzes en veldfouten worden tekstueel aangegeven. De gebruiker ziet de status “Concept opgeslagen” en kan op de controlepagina elk onderdeel bewerken.
**Afronding:** na controle `Indienen bij Westend` → status `submitted`. Westend kan `review_needed` instellen met gerichte terugvraag of `approved` na verificatie. Klant ziet het verschil tussen “ingediend” en “goedgekeurd”.

### 3. Exacte velden
#### 1. Bedrijf in het kort

| ID | Vraagtekst | Type | Verplicht | Validatie / bijzonderheden | Project Brief |
|---|---|---|:---:|---|---|
| `company_name` | Hoe heet je bedrijf? | Korte tekst | Ja | 2–120 tekens | `business.name` |
| `contact_name` | Wie is het aanspreekpunt voor deze website? | Korte tekst | Ja | 2–120 tekens | `business.primary_contact_name` |
| `company_one_liner` | Wat doet jouw bedrijf in één of twee zinnen? | Lange tekst | Ja | 20–350 tekens | `business.summary` |
| `founding_year` | In welk jaar is je bedrijf gestart? | Getal | Nee | 1900–2026 jaar/getal | `business.founding_year` |

**Helperteksten, opties en inhoudsregels**

- **`company_name`:** Vooraf invullen vanuit account; ondernemer mag corrigeren. Voorbeeld: _Sterk & Fit Coaching_.
- **`contact_name`:** Alleen zakelijke contactfunctie, geen onnodige privégegevens. Voorbeeld: _Sam de Vries_.
- **`company_one_liner`:** Dit is broninput, geen definitieve H1. Voorbeeld: _Ik help drukke professionals met persoonlijke krachttraining en haalbare voedingsgewoonten._.
- **`founding_year`:** Alleen plausibel jaartal; niet hetzelfde als jaren ervaring. Voorbeeld: _2021_.

#### 2. Oorsprong & ondernemersverhaal

| ID | Vraagtekst | Type | Verplicht | Validatie / bijzonderheden | Project Brief |
|---|---|---|:---:|---|---|
| `why_started` | Waarom ben je dit bedrijf begonnen? | Lange tekst | Ja | 30–1200 tekens | `story.motivation` |
| `founder_background` | Welke achtergrond of ervaring heeft jou gevormd als ondernemer? | Lange tekst | Nee | 0–1200 tekens | `story.background` |
| `story_turning_point` | Is er een gebeurtenis of kantelpunt dat jouw verhaal bijzonder maakt? | Lange tekst | Nee | 0–750 tekens | `story.turning_point` |
| `story_usage` | Hoe mogen we jouw verhaal in het websitevoorstel gebruiken? | Eén keuze | Ja | Geen extra lengte-eis | `story.proposed_use` |

**Helperteksten, opties en inhoudsregels**

- **`why_started`:** AI mag geen persoonlijke details verzinnen. Voorbeeld: _Ik zag dat veel mensen afhaken bij rigide trainingsprogramma’s ..._.
- **`founder_background`:** Geen medische of andere gevoelige privégegevens uitvragen. Voorbeeld: _Vanuit mijn werk als trainer heb ik geleerd ..._.
- **`story_turning_point`:** Vrijwillig; geen druk om persoonlijke trauma’s te delen. Voorbeeld: _Tijdens mijn eerste jaar als coach ontdekte ik ..._.
- **`story_usage`:** Geen automatische publicatie; altijd expliciete inhoudelijke goedkeuring. Keuzes: Gebruik als basis voor conceptteksten; ik keur ze eerst goed (`proposal`); Alleen intern gebruiken voor de strategie (`internal_only`).

#### 3. Ervaring & geloofwaardigheid

| ID | Vraagtekst | Type | Verplicht | Validatie / bijzonderheden | Project Brief |
|---|---|---|:---:|---|---|
| `expertise_sources` | Waar komt jouw vakkennis vooral vandaan? | Meerdere keuzes | Ja | 1–6 keuzes | `authority.expertise_sources` |
| `expertise_other` | Welke andere achtergrond bedoel je? | Korte tekst (conditioneel) | Ja* | 3–160 tekens; alleen indien {'field': 'expertise_sources', 'includes': 'other'} | `authority.expertise_other` |
| `expertise_years` | Hoeveel jaar relevante ervaring heb je in dit vakgebied? | Getal | Nee | 0–70 jaar/getal | `authority.years_experience` |
| `expertise_description` | Wat maakt jou deskundig in wat je doet? | Lange tekst | Ja | 30–800 tekens | `authority.expertise_description` |
| `special_background_context` | Wil je toelichten hoe deze achtergrond jouw werkwijze beïnvloedt? | Lange tekst (conditioneel) | Nee | 0–650 tekens; alleen indien {'field': 'expertise_sources', 'includes_any': ['lived', 'military', 'sport']} | `authority.special_background_context` |
| `credentials` | Welke diploma’s, certificaten of erkenningen kunnen we noemen? | Lange tekst | Nee | 0–650 tekens | `authority.credentials_claimed` |
| `proof_assets` | Welk bewijs heb je beschikbaar? | Meerdere keuzes | Nee | 0–5 keuzes | `authority.proof_available` |

**Helperteksten, opties en inhoudsregels**

- **`expertise_sources`:** Geen keuze publiceert automatisch persoonskenmerken. Keuzes: Praktijkervaring (`practice`); Opleiding of certificering (`education`); Ervaringsdeskundigheid (`lived`); Militaire achtergrond (`military`); (Top)sportachtergrond (`sport`); Anders (`other`).
- **`expertise_other`:** Alleen zichtbaar/verplicht bij Anders. Voorbeeld: _Jarenlang leidinggevende in de horeca_.
- **`expertise_years`:** Maak onderscheid met oprichtingsjaar. Voorbeeld: _8_.
- **`expertise_description`:** Concrete toetsbare feiten; AI maakt geen certificeringen of resultaten bij. Voorbeeld: _Ik begeleid al acht jaar cliënten en volg elk jaar bijscholing ..._.
- **`special_background_context`:** Optioneel, alleen bij relevante specifieke expertise. Voorbeeld: _Mijn militaire achtergrond heeft mijn aanpak gestructureerd gemaakt._.
- **`credentials`:** Wordt gemarkeerd voor verificatie voordat het in public copy wordt gebruikt. Voorbeeld: _NASM-CPT, 2022; sportopleiding ..._.
- **`proof_assets`:** none sluit andere keuzes uit; materialen worden pas in Q4 geüpload. Keuzes: Reviews (`reviews`); Klantcases (`cases`); Werkvoorbeelden (`portfolio`); Certificaatbestanden (`certificates`); Nog niets beschikbaar (`none`).

#### 4. Werkwijze & onderscheid

| ID | Vraagtekst | Type | Verplicht | Validatie / bijzonderheden | Project Brief |
|---|---|---|:---:|---|---|
| `unique_approach` | Wat is er anders aan jouw aanpak ten opzichte van anderen? | Lange tekst | Ja | 25–750 tekens | `positioning.differentiation` |
| `working_principles` | Wat vind je absoluut belangrijk in je manier van werken? | Lange tekst | Nee | 0–550 tekens | `positioning.working_principles` |
| `brand_values` | Welke woorden passen het beste bij jouw bedrijf? | Meerdere keuzes | Ja | 2–4 keuzes | `positioning.brand_values` |
| `desired_impression` | Welk gevoel moet iemand overhouden aan een bezoek aan jouw website? | Lange tekst | Nee | 0–350 tekens | `positioning.desired_impression` |

**Helperteksten, opties en inhoudsregels**

- **`unique_approach`:** Verifieer vergelijkende claims; geen onbewezen superlatieven. Voorbeeld: _Geen standaard schema’s maar elke zes weken een nieuw plan ..._.
- **`working_principles`:** Vormt input voor werkwijze en waarden. Voorbeeld: _Eerlijk advies, haalbare stappen en persoonlijke aandacht._.
- **`brand_values`:** Kies 2–4; eigen woord kan later als open aanvulling. Keuzes: Betrouwbaar (`reliable`); Direct (`direct`); Persoonlijk (`personal`); Gedisciplineerd (`disciplined`); Vernieuwend (`innovative`); Toegankelijk (`accessible`); Exclusief (`premium`); Praktisch (`practical`).
- **`desired_impression`:** Dient als UX- en copytoets; geen gegarandeerd effect. Voorbeeld: _Ik voel me serieus genomen en durf contact op te nemen._.

#### 5. Tone of voice

| ID | Vraagtekst | Type | Verplicht | Validatie / bijzonderheden | Project Brief |
|---|---|---|:---:|---|---|
| `tone_traits` | Hoe mag de tekst op je website klinken? | Meerdere keuzes | Ja | 2–4 keuzes | `voice.traits` |
| `address_style` | Spreken we je bezoekers aan met je/jij of u? | Eén keuze | Ja | Geen extra lengte-eis | `voice.address_style` |
| `words_prefer` | Welke woorden of uitdrukkingen passen bij jouw bedrijf? | Lange tekst | Nee | 0–350 tekens | `voice.preferred_terms` |
| `words_avoid` | Welke woorden, claims of uitdrukkingen wil je absoluut vermijden? | Lange tekst | Nee | 0–350 tekens | `voice.avoid_terms` |

**Helperteksten, opties en inhoudsregels**

- **`tone_traits`:** Geselecteerde waarden sturen schrijfstijl, niet tone-only generatieve aannames. Keuzes: Professioneel (`professional`); Direct (`direct`); Warm (`warm`); Energiek (`energetic`); Rustig (`calm`); Deskundig (`expert`); No-nonsense (`no_nonsense`); Speels (`playful`).
- **`address_style`:** AI moet advieskeuze in Project Brief markeren als te beslissen. Keuzes: Je/jij (`jij`); U (`u`); Laat Westend adviseren (`advise`).
- **`words_prefer`:** Optionele stijlinput. Voorbeeld: _Haalbaar, persoonlijk, vooruitgang_.
- **`words_avoid`:** Negatieve copyregels worden centraal bewaard. Voorbeeld: _Summer body, gegarandeerd resultaat_.

### 4. UX-gedrag, conditionele logica en foutmeldingen
- `expertise_other` verschijnt en wordt verplicht zodra `expertise_sources` de optie `other` bevat. Bij uitschakeling verdwijnt het veld en wordt de verborgen waarde niet als actief antwoord doorgestuurd.
- `special_background_context` verschijnt optioneel bij `lived`, `military` of `sport`. Niet vragen om diagnoses, traumatische ervaringen of andere gevoelige informatie.
- `proof_assets=none` is exclusief: de interface wist de andere bewijsopties of vraagt een keuze.
- Multi-select toont het minimum en maximum in gewone taal, bijvoorbeeld “Kies twee tot vier woorden”.
- Bij ongeldige invoer blijft de gebruiker op het huidige scherm. Foutmeldingen staan bij het veld, verwijzen naar de concrete oplossing en er wordt gefocust op de eerste fout.
- Client- en servervalidatie zijn equivalent; server is leidend. Bij verlies van verbinding staat er “Nog niet opgeslagen” en volgt een handmatige retry. Nooit “opgeslagen” claimen zonder serverbevestiging.
- Op mobiel één kolom en vaste `Volgende`/`Vorige` knoppen onderaan. Alle keuzes werken met toetsenbord en schermlezer, zonder kleur als enige betekenisdrager.
- Een nog niet beantwoorde optionele vraag kan worden overgeslagen; een veld met onzeker antwoord kan in het Project Brief als `needs_review` worden aangemerkt.

### 5. Datacontract
Het JSON-configuratiebestand is de ontwikkelaarsbron voor velden, types, opties en mapping. Er is een apart antwoordobject nodig met minimaal:
```json
{
  "form_id": "Q1_KICKOFF",
  "schema_version": "1.0.0",
  "tenant_id": "<server-side tenant UUID>",
  "website_id": "<server-side website UUID>",
  "status": "draft",
  "answers": {
    "company_name": "Sterk & Fit Coaching",
    "company_one_liner": "Ik help drukke professionals om structureel te trainen.",
    "story_usage": "proposal",
    "expertise_sources": [
      "practice",
      "military"
    ],
    "tone_traits": [
      "direct",
      "warm"
    ],
    "address_style": "jij"
  },
  "sources": {
    "company_name": {
      "kind": "client_supplied",
      "needs_review": false
    },
    "credentials": {
      "kind": "client_supplied",
      "needs_review": true
    }
  },
  "updated_at": "ISO 8601"
}
```
Voorwaarden: tenant-/website-ID komen uit server-side autorisatie; opgeslagen antwoorden worden versioned; `draft` is hervatbaar; `submit` is idempotent; interne AI-agents krijgen alleen toegestane velden op basis van een goedgekeurde Project Brief.

### 6. Project Brief output en AI-gebruik
| Outputblok | Mapping / bronvelden | Gebruik |
|---|---|---|
| `business` | `company_name`, `contact_name`, `company_one_liner`, `founding_year` | Bedrijfsprofiel en contactcontext |
| `story` | `why_started`, `founder_background`, `story_turning_point`, `story_usage` | Concept ondernemersverhaal binnen publicatievoorkeur |
| `authority` | `expertise_sources`, `expertise_other`, `expertise_years`, `expertise_description`, `special_background_context`, `credentials`, `proof_assets` | Geloofwaardigheidsclaims; certificaten en aantallen laten verifiëren |
| `positioning` | `unique_approach`, `working_principles`, `brand_values`, `desired_impression` | Strategische hypothesen; niet automatisch bewezen onderscheid |
| `voice` | `tone_traits`, `address_style`, `words_prefer`, `words_avoid` | Copywriting- en stijlregels |

**Provenance en zekerheid:** voor ieder feit wordt bijgehouden of het door de klant is opgegeven, uit documentatie is gecontroleerd of nog verificatie vraagt. Een AI-agent mag een eigen interpretatie voorstellen, maar mag geen diploma’s, resultaten, aantallen tevreden klanten of achtergrond verzinnen. Publicatie vereist expliciete inhoudelijke goedkeuring.

### 7. Privacy, beveiliging en toegangsrechten
- Alleen de Business Owner en daarvoor expliciet bevoegde Westend-medewerkers mogen Q1 inzien of wijzigen. Team Members hebben standaard geen toegang tot persoonlijke ondernemersverhalen.
- Gevoelige/onnodige gegevens niet aanmoedigen; optionele vrije tekst wordt met tekst naast het veld begrensd (“Deel geen medische of andere gevoelige privégegevens”).
- Upload van bewijsstukken gaat later via Q4, met veilige opslag en rechtencontrole; referentie naar bewijs = niet automatisch goedgekeurde claim.
- Geen data doorsturen naar algemene marketinglijsten. Bewaar- en verwijderregels worden conform Fase 2 bij implementatie uitgewerkt.
- Voor de statische demo geldt alleen browseropslag op het lokale apparaat; dit simuleert geen veilige server-side opslag.

### 8. Acceptatiecriteria
- **Q1-AT01:** Alle schermen openen met correct bewaarde antwoorden en voortgang.
- **Q1-AT02:** Lege verplichte velden blokkeren doorgaan; optionele velden niet.
- **Q1-AT03:** Minimum-/maximumlengtes en multi-selectgrenzen worden zowel client- als server-side afgedwongen.
- **Q1-AT04:** Keuze `other` vereist toelichting; uitschakelen verwijdert verborgen child-waarde.
- **Q1-AT05:** Keuze `none` voor bewijs is exclusief.
- **Q1-AT06:** Draft kan door eigenaar na herlogin op andere browser worden hervat; geen claims van opslag zonder serverbevestiging.
- **Q1-AT07:** Ongeautoriseerd teamlid of andere tenant kan intake niet lezen of muteren via API.
- **Q1-AT08:** Project Brief bevat alle ingevulde mappingpaden plus provenance en verificatievlaggen.
- **Q1-AT09:** `story_usage=internal_only` sluit het ondernemersverhaal uit van voorgestelde publieke websiteteksten.
- **Q1-AT10:** Q1 kan alleen naar `approved` na Westend-review; geen publicatie vanuit de intake.
- **Q1-AT11:** Mobiele invoer 320px breed, toetsenbordnavigatie, focus en foutlabels werken.
- **Q1-AT12:** Vijf pilotklanten doorlopen Q1; meet invultijd, uitval per scherm, terugvragen en kwaliteit van output.

### 9. Nog te reviewen keuzes
- Of Westend het bedrijfsverhaal alleen intern gebruikt of ook als concept voor de Over-ons-pagina wordt bepaald door `story_usage` en de latere klantgoedkeuring.
- De voorbeeldtermijn 8–12 minuten is geen vaste eis: test met vijf pilotklanten.
- Voor Q2–Q4 dezelfde UX-componenten en datacontracten hergebruiken, zonder de vragenlijsten inhoudelijk te vermengen.

**Vervolg:** Q1 laten beoordelen; dan Q2 — Doelgroep uitwerken volgens dezelfde specificatiestandaard.
