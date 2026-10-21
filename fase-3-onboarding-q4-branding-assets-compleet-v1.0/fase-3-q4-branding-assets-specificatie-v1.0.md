# Westend Digital Conversion Engine
## Fase 3 — Vragenlijst Q4 · Branding, Content & Assets

**Versie:** v1.0 — concept ter review  
**Datum:** 17 oktober 2026  
**Doelgroep:** Business Owner  
**Input:** Q1 bedrijfsidentiteit, Q2 doelgroep, Q3 aanbod  
**Output:** `ProjectBrief.brand`, `assets`, `content`, `website`, `integrations`, `project`

## 1. Doel en afbakening
- **5 schermen, 38 kernvelden; 19 standaard verplicht en 3 conditioneel verplicht.**
- Basisabonnement: toepassen van **bestaande** branding met technische design tokens. Nieuwe volledige brand guidelines, logo of merkstrategie zijn betaalde extra’s.
- Professionele fotografie is een optionele extra dienst en nooit automatisch inbegrepen.
- De eigen Westend Component Library en bestaande klantwebsites dienen als ontwerp-inspiratie, binnen geldende rechten.
- Geen wachtwoorden, DNS-codes of API-sleutels in intake; providerautorisatie volgt via beveiligde kanalen.
- DataForSEO wordt centraal door Westend geconfigureerd en hoort niet als klantlogin in Q4.
- Klant kan intake indienen met reviewpunten; **publicatie** wordt pas vrijgegeven na controle van essentiële assets, rechtsgrond, domein en formulierontvangst.
- Richttijd voor Q4 10–15 minuten **als hypothese**, afhankelijk van beschikbare bestanden. Totale onboarding kan langer duren; in delen invullen is toegestaan.

## 2. Schermindeling
| Stap | Titel | Doel |
|---|---|---|
| 1/5 | Bestaande huisstijl | We gebruiken wat je al hebt. Een nieuwe identiteit is optioneel meerwerk. |
| 2/5 | Fotografie & beeldmateriaal | Authentieke beelden maken een website geloofwaardig. We controleren kwaliteit en gebruiksrechten. |
| 3/5 | Bestaande content & referenties | We hergebruiken goede informatie, maar nemen nooit automatisch claims of teksten over. |
| 4/5 | Domein, contact & metingen | We verzamelen alleen projectgegevens — nooit wachtwoorden of herstelcodes. |
| 5/5 | Laatste controle & aanvullende wensen | Tot slot controleren we of de input en gebruiksrechten klaar zijn voor productie. |

## 3. Exacte vragen, velden en Project Brief-mapping

Conditionele velden zijn alleen verplicht als hun voorwaarde waar is. Verborgen waarden worden uitgesloten van export naar de goedgekeurde Project Brief.

### 1/5 — Bestaande huisstijl
We gebruiken wat je al hebt. Een nieuwe identiteit is optioneel meerwerk.

| Field-ID | Vraagtekst | Type | Verplicht | Validatie / zichtbaar indien | Mapping |
|---|---|---|:---:|---|---|
| `brand_status` | Hoe compleet is je huidige huisstijl? | Enkelkeuze | Ja | keuze / tekst | `brand.current.status` |
| `logo_assets` | Upload je logo of logo-varianten | Bestand(en) | Nee | max_files=5; max_mb=10; wanneer {'field': 'brand_status', 'in': ['complete', 'basic']}; extensies: .svg, .png, .webp, .pdf | `assets.logo` |
| `brandbook_assets` | Heb je een bestaande brand guide of stijlgids? Upload die hier. | Bestand(en) | Nee | max_files=2; max_mb=15; wanneer {'field': 'brand_status', 'eq': 'complete'}; extensies: .pdf | `assets.brandbook` |
| `brand_colors` | Welke merkkleuren gebruik je? | Korte tekst | Nee | max=200 | `brand.current.colors_raw` |
| `brand_fonts` | Welke lettertypen gebruik je? | Korte tekst | Nee | max=160 | `brand.current.fonts_raw` |
| `brand_style` | Welke drie woorden passen het beste bij de uitstraling? | Meerkeuze | Ja | min_items=1; max_items=3 | `brand.current.style_keywords` |
| `new_branding_request` | Wil je een offerte voor nieuwe branding of een uitgebreid brandbook? | Enkelkeuze | Ja | keuze / tekst | `commercial.upsells.branding` |

**Keuzes en business rules**

- **`brand_status`** — Keuzes: Logo, kleuren en richtlijnen aanwezig (`complete`), Logo en/of kleuren aanwezig (`basic`), Er is nog geen huisstijl (`none`); Geen automatische complete rebranding in het standaardpakket.
- **`logo_assets`** — Voorkeur: origineel vectorbestand (SVG/PDF). Bestanden worden pas via beveiligde upload opgeslagen in de echte app.
- **`brand_colors`** — AI zet dit later om naar design tokens; twijfelachtige kleurcodes zijn reviewpunten.; Voorbeeld: #19372C en #F7EFE2 of “donkergroen en crème”
- **`brand_fonts`** — Voorbeeld: Poppins en Instrument Serif
- **`brand_style`** — Keuzes: Premium (`premium`), Minimalistisch (`minimal`), Modern (`modern`), Persoonlijk (`personal`), Sportief (`sporty`), Warm (`warm`), Zakelijk (`corporate`), Energiek (`energetic`)
- **`new_branding_request`** — Keuzes: Nee, bestaande branding gebruiken (`no`), Ja, ontvang vrijblijvend een voorstel (`quote`), Ik wil graag advies (`unsure`); Nieuwe branding: aparte offerte, uitgevoerd door ontwerper of AI-ondersteund afhankelijk van budget.

### 2/5 — Fotografie & beeldmateriaal
Authentieke beelden maken een website geloofwaardig. We controleren kwaliteit en gebruiksrechten.

| Field-ID | Vraagtekst | Type | Verplicht | Validatie / zichtbaar indien | Mapping |
|---|---|---|:---:|---|---|
| `photo_status` | Welk geschikt beeldmateriaal heb je al? | Enkelkeuze | Ja | keuze / tekst | `assets.photos.availability` |
| `photo_upload` | Upload geschikte bedrijfsfoto’s | Bestand(en) | Nee | max_files=15; max_mb=15; extensies: .jpg, .jpeg, .png, .webp | `assets.photos.uploads` |
| `photo_categories` | Welke onderwerpen zijn afgebeeld? | Meerkeuze | Nee | max_items=5 | `assets.photos.categories` |
| `image_license` | Heb je het recht om de aangeleverde foto’s commercieel op de website te gebruiken? | Enkelkeuze | Ja | wanneer {'field': 'photo_status', 'in': ['professional', 'mixed']} | `assets.photos.license_state` |
| `people_consent` | Is publicatie van herkenbare personen op deze beelden toegestaan? | Enkelkeuze | Ja | wanneer {'field': 'photo_categories', 'includes_any': ['portrait', 'clients']} | `assets.photos.people_permission` |
| `stock_policy` | Mogen we geschikte stockbeelden voorstellen als eigen beelden ontbreken? | Enkelkeuze | Ja | keuze / tekst | `assets.photos.stock_policy` |
| `photoshoot_request` | Wil je een offerte voor professionele bedrijfsfotografie? | Enkelkeuze | Ja | keuze / tekst | `commercial.upsells.photography` |

**Keuzes en business rules**

- **`photo_status`** — Keuzes: Professionele eigen foto’s (`professional`), Een combinatie van eigen en andere beelden (`mixed`), Weinig tot geen geschikt materiaal (`little`)
- **`photo_upload`** — In demo alleen bestandsnamen; in productie bestandsscan, opslag, limieten en verwijdering.
- **`photo_categories`** — Keuzes: Ondernemer of medewerkers (`portrait`), Werkruimte / praktijk / locatie (`workspace`), Diensten in actie (`service`), Producten en materialen (`product`), Klanten of herkenbare derden (`clients`)
- **`image_license`** — Keuzes: Ja, ik kan de gebruiksrechten bevestigen (`yes`), Dat moet ik nog controleren (`check`), Nee / ik weet het niet (`no`); Onzekere rechten blokkeren publicatie van de betrokken beelden, niet het opslaan van de intake.
- **`people_consent`** — Keuzes: Ja, waar nodig is toestemming/rechtsgrond geregeld (`yes`), Nog controleren (`check`), Nee, deze beelden niet publiceren (`no`)
- **`stock_policy`** — Keuzes: Ja, na selectie en licentiecontrole (`allowed`), Alleen na overleg (`consult`), Nee, liever uitsluitend eigen foto’s (`not_allowed`)
- **`photoshoot_request`** — Keuzes: Nee (`no`), Ja, stuur een voorstel (`quote`), Misschien, adviseer mij (`unsure`); Fotoshoot nooit standaard inbegrepen; aparte offerte en licentieafspraken.

### 3/5 — Bestaande content & referenties
We hergebruiken goede informatie, maar nemen nooit automatisch claims of teksten over.

| Field-ID | Vraagtekst | Type | Verplicht | Validatie / zichtbaar indien | Mapping |
|---|---|---|:---:|---|---|
| `current_website` | Wat is de URL van je huidige website? | HTTPS-URL | Nee | max=300 | `website.existing.url` |
| `available_assets` | Welke bestaande content kunnen we gebruiken? | Meerkeuze | Ja | min_items=1; max_items=6 | `content.sources.available` |
| `content_files` | Upload brochures, tekstdocumenten of voorbeelden | Bestand(en) | Nee | max_files=10; max_mb=15; extensies: .pdf, .docx, .txt, .png | `assets.content.documents` |
| `copy_preference` | Wat mogen we met de bestaande teksten doen? | Enkelkeuze | Ja | keuze / tekst | `content.copy.preference` |
| `website_references` | Welke websites of stijlen spreken je aan? | Lange tekst | Nee | max=700 | `brand.references.external` |
| `westend_reference` | Heb je een voorkeur voor een bestaande Westend-website of stijl? | Korte tekst | Nee | max=200 | `brand.references.westend` |
| `proof_sources` | Waar kunnen we jouw reviews, certificaten of andere bewijsstukken verifiëren? | Lange tekst | Nee | max=550 | `content.proof_sources` |
| `legal_docs` | Zijn privacyverklaring en eventuele voorwaarden aanwezig? | Enkelkeuze | Ja | keuze / tekst | `content.legal.status` |

**Keuzes en business rules**

- **`current_website`** — Voorbeeld: https://voorbeeld.nl
- **`available_assets`** — Keuzes: Huidige website (`site`), Bestaande teksten (`texts`), Brochure of PDF (`brochure`), Reviews of referenties (`reviews`), FAQ / veelgestelde vragen (`faq`), Cases / werkvoorbeelden (`cases`), Nog geen content (`none`); Exclusieve optie(s): none
- **`copy_preference`** — Keuzes: Herschrijven op basis van bestaande feiten (`rewrite`), Waar mogelijk grotendeels behouden (`reuse`), Nieuw schrijven op basis van de intake (`new`)
- **`website_references`** — Voorbeeld: https://voorbeeld.nl — goede navigatie, maar liever minder druk.
- **`westend_reference`** — Referenties zijn inspiratie; teksten, ontwerpen en beelden van andere klanten worden niet zonder rechten gekopieerd.; Voorbeeld: De rustige opbouw van de website van klant X
- **`proof_sources`** — AI mag nooit testimonials of resultaten verzinnen.; Voorbeeld: Google Bedrijfsprofiel; certificaat is beschikbaar als PDF
- **`legal_docs`** — Keuzes: Ja, documenten zijn beschikbaar (`ready`), Ja, maar ze moeten nagekeken worden (`need_review`), Nee, hier heb ik hulp bij nodig (`missing`); Geen juridische juistheid garanderen; noodzakelijke privacy- en cookie-informatie vóór livegang controleren.

### 4/5 — Domein, contact & metingen
We verzamelen alleen projectgegevens — nooit wachtwoorden of herstelcodes.

| Field-ID | Vraagtekst | Type | Verplicht | Validatie / zichtbaar indien | Mapping |
|---|---|---|:---:|---|---|
| `domain_status` | Heb je al een domeinnaam voor deze website? | Enkelkeuze | Ja | keuze / tekst | `website.domain.status` |
| `domain_name` | Welke domeinnaam gaat de website gebruiken? | Domeinnaam | Ja | max=253; wanneer {'field': 'domain_status', 'eq': 'existing'} | `website.domain.name` |
| `site_relation` | Wat gebeurt er met je huidige website? | Enkelkeuze | Ja | keuze / tekst | `website.migration.relation` |
| `dns_control` | Wie kan de DNS of domeininstellingen wijzigen? | Enkelkeuze | Ja | keuze / tekst | `website.domain.access_status` |
| `contact_email` | Op welk zakelijk e-mailadres mogen websiteaanvragen binnenkomen? | E-mail | Ja | max=254 | `website.contact.recipient_email` |
| `ga4_status` | Is Google Analytics 4 al ingericht? | Enkelkeuze | Ja | keuze / tekst | `integrations.ga4.status` |
| `gsc_status` | Is Google Search Console al gekoppeld? | Enkelkeuze | Ja | keuze / tekst | `integrations.gsc.status` |
| `clarity_status` | Gebruik je Microsoft Clarity al? | Enkelkeuze | Ja | keuze / tekst | `integrations.clarity.status` |
| `cookie_setup` | Heb je al een cookiebanner of toestemmingsbeheer? | Enkelkeuze | Ja | keuze / tekst | `website.privacy.consent_manager` |

**Keuzes en business rules**

- **`domain_status`** — Keuzes: Ja (`existing`), Nog niet (`new`), Ik weet het niet (`unsure`)
- **`domain_name`** — Voorbeeld: voorbeeld.nl
- **`site_relation`** — Keuzes: We vervangen een bestaande website (`replace`), Het wordt een nieuwe website (`new`), Nog afstemmen (`unknown`)
- **`dns_control`** — Keuzes: Ik of mijn team (`customer`), Mijn huidige leverancier (`provider`), Onbekend (`unknown`); Geen wachtwoorden in het formulier. Toegang later via een veilige, aparte procedure.
- **`contact_email`** — Adres wordt vóór livegang via test gecontroleerd; niet automatisch marketingmail sturen.; Voorbeeld: info@voorbeeld.nl
- **`ga4_status`** — Keuzes: Ja (`yes`), Nee (`no`), Geen idee (`unknown`)
- **`gsc_status`** — Keuzes: Ja (`yes`), Nee (`no`), Geen idee (`unknown`)
- **`clarity_status`** — Keuzes: Ja (`yes`), Nee (`no`), Geen idee (`unknown`)
- **`cookie_setup`** — Keuzes: Ja (`yes`), Nee (`no`), Geen idee (`unknown`); Metingen en Clarity pas activeren conform de vereiste privacy-/toestemmingsinstellingen.

### 5/5 — Laatste controle & aanvullende wensen
Tot slot controleren we of de input en gebruiksrechten klaar zijn voor productie.

| Field-ID | Vraagtekst | Type | Verplicht | Validatie / zichtbaar indien | Mapping |
|---|---|---|:---:|---|---|
| `social_links` | Welke socialmediaprofielen mogen op de website staan? | Lange tekst | Nee | max=650 | `website.social.links` |
| `booking_link` | Wat is je boekingslink, als je er een hebt? | HTTPS-URL | Nee | max=500 | `integrations.booking.url` |
| `important_urls` | Welke bestaande pagina’s of URL’s moeten behouden blijven of worden doorgestuurd? | Lange tekst | Nee | max=700; wanneer {'field': 'site_relation', 'eq': 'replace'} | `website.migration.important_urls` |
| `restrictions` | Zijn er specifieke zaken die we absoluut niet mogen veranderen of publiceren? | Lange tekst | Nee | max=800 | `project.constraints.restrictions` |
| `third_party_rights` | Zijn alle aangeleverde logo’s, teksten en bestanden van jou of heb je gebruiksrecht? | Enkelkeuze | Ja | keuze / tekst | `assets.rights.overall` |
| `approval_contact` | Wie kan de definitieve inhoud namens je bedrijf goedkeuren? | Korte tekst | Ja | min=2; max=120 | `project.approval.contact_name` |
| `extra_notes` | Wil je nog iets meegeven voor de website? | Lange tekst | Nee | max=1000 | `project.notes` |

**Keuzes en business rules**

- **`social_links`** — Voorbeeld: https://www.linkedin.com/company/voorbeeld/
- **`booking_link`** — Wordt afgestemd op Q3; een ontbrekende link bij boekings-CTA blokkeert livegang.; Voorbeeld: https://calendly.com/voorbeeld/gesprek
- **`important_urls`** — Redirection mapping wordt door Westend beoordeeld; geen automatische 301 op basis van onvolledige input.; Voorbeeld: /diensten en /contact — bestaande SEO-pagina’s
- **`restrictions`** — Voorbeeld: Geen klantfoto’s zonder schriftelijk akkoord; gebruik de huidige bedrijfsnaam.
- **`third_party_rights`** — Keuzes: Ja, rechten zijn geregeld (`confirmed`), Deels, ik moet iets controleren (`review`), Nee / onbekend (`not_confirmed`); Bij twijfel gaat het project naar review_needed. Geen publicatie van niet-vrijgegeven assets.
- **`approval_contact`** — Voorbeeld: Voornaam Achternaam
- **`extra_notes`** — Voorbeeld: Liever rustige animaties en een duidelijke knop om een intake te boeken.

## 4. Project Brief-schema en betrouwbaarheid

| Project Brief-pad | Brongegeven | Gebruik |
|---|---|---|
| `brand.current` | Huidige visuele stijl, aangeleverde logo/brandbook | Tokens, ontwerprichting — géén nieuwe branding zonder offerte |
| `brand.references` | Externe voorbeelden en Westend-referenties | Interne inspiratie voor componentkeuze, geen kopieerlicentie |
| `assets.logo`, `assets.photos`, `assets.content` | Versiebeheerde assetreferenties en rechtenmetadata | Websitebouw alleen voor vrijgegeven assets |
| `content.sources`, `content.legal`, `content.proof_sources` | Herbruikbare inhoud en documentstatus | Copy- en compliance-review; geen verzonnen bewijs |
| `website.domain`, `website.migration`, `website.contact` | Domein, redirects, ontvangstadres | Technische go/no-go voor staging en livegang |
| `integrations.ga4`, `integrations.gsc`, `integrations.clarity` | Status vanuit klant | Verzoek tot koppeling; echte data pas na veilige autorisatie |
| `commercial.upsells` | Branding- en fotografieverzoek | Offerteflow buiten abonnement; geen betaling zonder akkoord |
| `project.approval`, `project.constraints` | Goedkeuringscontact en beperkingen | Human review en blokkadecontrole |

**Bronniveaus:** `customer_declared`, `asset_uploaded`, `external_verified`, `human_approved`. De projectbrief bewaart bron, versie, tijdstip en goedkeuringsstatus per belangrijk feit. Q1/Q2/Q3 krijgen voorrang bij identiteit, doelgroep en aanbod; afwijkingen worden expliciet ter review gemarkeerd.

## 5. Functionele flow & uitzonderingen

1. Business Owner ziet vijf stappen, voortgang, autosave-bevestiging, conceptstatus en terugnavigatie.
2. Vragen en bestanden worden bij concept opgeslagen met tenant- en gebruikersreferentie; technische uploads gebruiken beveiligde uploadtokens en privéstorage.
3. De klant ziet na stap vijf een controleoverzicht met markeringen voor ontbrekende essentiële input of rechten.
4. `submitted` met ontbrekende informatie wordt `review_needed`; dit blokkeert niet het invullen van de andere drie vragenlijsten.
5. Westend controleert authenticiteit, rechten, contentclaims, privacyvereisten, design tokens en technische toegang vóór `approved`.
6. Een aanvraag voor branding of fotografie resulteert in een **apart te accorderen voorstel**.
7. Pas na geautoriseerde verbinding, privacycontrole en formuliertest kan website gepubliceerd en analytics geactiveerd worden.

### 5.1 Validatie en veilige uploads

- URL-velden vereisen een volledige HTTPS-URL; domein apart zonder schema; e-mailformat plus server-side controle.
- Formaat, aantallen, grootte, MIME-handtekening en schadelijke bestanden aan serverzijde controleren; `accept` in HTML is onvoldoende.
- Bestandsnamen zijn niet het bestand zelf; demo uploadt niet. Productie bewaart private asset-ID, oorspronkelijke naam, MIME, hash, rechten- en goedkeuringsstatus.
- Verwijderde of vervangen bestanden worden versieerbaar gekoppeld aan juiste tenant; geen gedeelde publieke uploadlocatie.
- Geen geheimen verzamelen in tekstvelden; automatisch waarschuwen voor mogelijke tokens/wachtwoorden en zo nodig invoer blokkeren.
- Betrokkenen op foto’s vereisen passende toestemmings-/rechtsgrondcontrole; bij twijfel blijven beelden uit de publicatie.
- Privacy/cookietoestemming en masking bij Clarity zijn aparte launch-acceptatiepunten; “Clarity actief” is niet gelijk aan compliant.

## 6. Gecombineerde Q1–Q4 Project Brief — vervolg

Onboarding output wordt samengevoegd tot één gecontroleerde Project Brief met: `business`, `story`, `audience`, `offer`, `funnel`, `evidence`, `brand`, `assets`, `content`, `website`, `integrations`, `approvals`, `unknowns`, `sources`. De AI Website Production Pipeline ontvangt alleen gecontroleerde feiten en duidelijke onzekerheden. De pipeline mag geen klantnaam, prijs, claim, foto-licentie of contractvoorwaarden invullen door te gokken.

## 7. Acceptatiecriteria

| ID | Acceptatie |
|---|---|
| Q4-AT01 | De vijf stappen ondersteunen concept opslaan, hervatten, terugnavigatie en review zonder dat verborgen waarden uitlekken. |
| Q4-AT02 | Nieuwe branding en fotografie worden alleen als optionele offerteaanvragen vastgelegd, nooit automatisch gefactureerd. |
| Q4-AT03 | Uploadtypen, maximale bestandsgrootte en maximale aantallen worden zowel client- als server-side afgedwongen. |
| Q4-AT04 | Uploadbestanden zijn tenantgebonden, privé, gescand en alleen toegankelijk voor bevoegde projectgebruikers. |
| Q4-AT05 | Logo en brandbook verschijnen conditioneel; hidden fields worden niet meegenomen in goedgekeurde projectbrief. |
| Q4-AT06 | Bij foto’s met herkenbare personen is bewijs van publicatierecht/toestemming expliciet onderdeel van de review. |
| Q4-AT07 | Onbevestigde gebruiksrechten blokkeren publicatie van de betrokken assets; de intake kan wel in review_needed komen. |
| Q4-AT08 | Bestaande site en URL’s worden gecontroleerd; vervangen van bestaande site triggert redirectreview. |
| Q4-AT09 | Er worden nooit domein-, GA4-, GSC-, Clarity- of DataForSEO-wachtwoorden gevraagd of in logs opgeslagen. |
| Q4-AT10 | GA4/GSC/Clarity tonen configuratiestatus; koppeling geschiedt later met gescheiden autorisatie en toegangscontroles. |
| Q4-AT11 | Contactmail is valide en wordt bij livegang via test gevalideerd; ontbrekende domein-/boekingsvereisten geven expliciete blokkade. |
| Q4-AT12 | AI kopieert geen klantspecifieke referentiematerialen van andere Westend-klanten zonder grondslag. |
| Q4-AT13 | Het resultaat mapt volledig en versieerbaar naar Project Brief; conflicten met Q1–Q3 zijn zichtbaar. |
| Q4-AT14 | 320px en 390px mobiel, toetsenbordnavigatie en begrijpelijke foutmeldingen worden getest. |
| Q4-AT15 | DataForSEO blijft een intern centraal platformcomponent en wordt niet als klantcredential gevraagd. |
| Q4-AT16 | Testdemo verstuurt geen bestanden, analytics of formulierdata naar externe servers. |

## 8. UI- en kwaliteitsprincipes

- Dezelfde premium, lichte Westend SaaS-stijl als Q1–Q3: sobere kaarten, hoge contrasten, duidelijke invoervelden en primaire CTA.
- Laat geen afbeeldingen van echte klanten of reviewdata uit andere omgevingen zien in de intake.
- Geef duidelijke uitleg bij “rechten”, “DNS”, “Analytics”, “Search Console” en “Clarity”; voorkom technisch jargon in de labels.
- Mobiele layouts houden voortgang en primaire actie zichtbaar; formulieren en foutfeedback blijven bedienbaar op 320px.
- De eigenaar mag later een vragenlijst aanvullen; ingediende versies blijven in historie.

**Status:** Q4 v1.0 ter review; na akkoord consolideren we Q1–Q4 tot één onboardingflow en bouwen we het gezamenlijke Project Brief-schema uit.