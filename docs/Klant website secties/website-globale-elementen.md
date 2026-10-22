# Globale website-elementen — Conversion Engine

**Status:** concept voor Fase 1
**Doel:** vaste globale onderdelen definiëren die op alle standaardpagina's consistent worden toegepast.

## 1. Uitgangspunt

De globale elementen mogen niet per klant opnieuw worden uitgevonden. De structuur, interactie en technische regels blijven gelijk; alleen merk, content, navigatielabels en CTA-bestemmingen zijn configureerbaar.

De globale elementen ondersteunen één primaire conversieroute per klantwebsite.

## 2. Header en primaire navigatie

### GE-01 — Header

De header bevat minimaal:

- logo of merknaam;
- primaire navigatie;
- primaire CTA;
- mobiele navigatietoggle.

De header blijft visueel rustig. De primaire CTA is actiegericht en sluit aan op het hoofdproduct, bijvoorbeeld:

- `Plan een kennismaking`;
- `Bekijk het aanbod`;
- `Start de check`.

### GE-02 — Primaire navigatie

De standaardnavigatie ondersteunt maximaal de belangrijkste routes:

- Home;
- Aanbod of salespage;
- Over mij;
- Blog, indien actief;
- Contact of kennismaken.

De navigatie bevat geen lange lijst met alle mogelijke pagina's. De leadmagnet kan als primaire CTA worden aangeboden, maar hoeft niet als apart navigatielabel zichtbaar te zijn.

### GE-03 — Mobiele navigatie

De mobiele navigatie:

- is volledig met touch en toetsenbord bruikbaar;
- toont dezelfde kernroutes als desktop;
- maakt de primaire CTA duidelijk zichtbaar;
- sluit na navigatie of expliciete sluitactie;
- blokkeert niet onnodig de terugknop of browserbediening;
- veroorzaakt geen horizontale overflow.

## 3. CTA-systeem

### GE-04 — CTA-hiërarchie

Elke website heeft:

- één primaire CTA;
- maximaal één secundaire CTA per context;
- ondersteunende tekstlinks alleen wanneer ze de hoofdroute niet verdringen.

CTA-labels beschrijven de actie en niet alleen de bestemming. Gebruik bijvoorbeeld `Plan mijn kennismaking` in plaats van `Klik hier`.

### GE-05 — CTA-varianten

Ondersteunde CTA-bestemmingen:

- afspraakmodule;
- contactformulier;
- salespage;
- leadmagnetpagina;
- checkout of aanvraagflow.

Dezelfde primaire actie gebruikt overal dezelfde naam, tenzij de context aantoonbaar een andere formulering nodig heeft.

### GE-06 — CTA-statussen

Elke interactieve CTA heeft minimaal deze toestanden:

- standaard;
- hover of focus;
- actief;
- tijdelijk uitgeschakeld tijdens verwerking;
- foutstatus wanneer de bestemming of verwerking niet beschikbaar is.

Een klik mag niet leiden tot een stille fout of dubbele verzending.

## 4. Footer

### GE-07 — Functionele footer

De footer bevat minimaal:

- merknaam of korte positionering;
- primaire contactroute;
- links naar privacy en relevante juridische informatie;
- copyright of bedrijfsinformatie;
- relevante social links, alleen indien actief onderhouden.

De footer is geen tweede volledige navigatie. De primaire conversieroute blijft herkenbaar.

### GE-08 — Footer-CTA

De footer mag één compacte CTA bevatten wanneer dat past bij de klantflow. Deze CTA gebruikt dezelfde bestemming en stijlregels als de primaire CTA.

## 5. Formulieren en statusmeldingen

### GE-09 — Formulierbasis

Formulieren:

- verzamelen alleen noodzakelijke gegevens;
- gebruiken zichtbare labels;
- geven format- en verplichte-veldvalidatie inline;
- behouden ingevulde waarden bij een fout;
- tonen duidelijk welke gegevens verplicht zijn;
- gebruiken een expliciete submitknop;
- voorkomen dubbele verzending.

### GE-10 — Formulierstatussen

Iedere publieke formulierflow definieert:

- leeg en gereed;
- veld actief;
- veld met validatiefout;
- verzenden;
- succesvol verwerkt;
- tijdelijk niet beschikbaar;
- algemene fout zonder gevoelige technische details.

Succesmeldingen noemen wat de bezoeker nu kan verwachten. Foutmeldingen geven een bruikbare vervolgstap.

### GE-11 — Bedank- en vervolgstap

Een succesvolle inzending verwijst naar de juiste bedankpagina of toont een gelijkwaardige bevestiging. De bezoeker krijgt eerst de beloofde levering en daarna eventueel de geconfigureerde upsell.

## 6. Privacy en veiligheid

### GE-12 — Privacyverwijzingen

Op relevante formulieren en leadmagnetflows:

- staat een duidelijke privacyverwijzing;
- is noodzakelijke verwerking gescheiden van marketingtoestemming;
- is marketingopt-in vrijwillig en niet vooraf aangevinkt;
- wordt niet meer data gevraagd dan nodig;
- worden geen medische of andere bijzondere persoonsgegevens gevraagd zonder aparte goedkeuring en passende waarborgen.

### GE-13 — Technische grenzen

- Persoonsgegevens komen niet in publieke URL's terecht.
- Gevoelige formulierinhoud komt niet in analytics-events terecht.
- Publieke formulieren krijgen rate limiting en anti-spammaatregelen zodra de backendflow wordt gebouwd.
- Test- en monitorinzendingen worden uitgesloten van echte leads en KPI's.
- Alle operationele records blijven tenantgebonden.

## 7. SEO-basisregels

Iedere pagina-template ondersteunt minimaal:

- één duidelijke H1;
- logische H2-structuur;
- configureerbare paginatitel;
- configureerbare meta description;
- canonical URL waar nodig;
- beschrijvende URL;
- Open Graph-basisvelden;
- passende alternatieve tekst voor betekenisvolle afbeeldingen;
- geen dubbele of lege metadata bij publicatie.

SEO-metadata mag geen onbewezen claims bevatten. Blog- en inhoudsmetadata worden verder uitgewerkt in de blogtemplate.

## 8. Responsive en toegankelijkheid

De globale elementen:

- werken op mobiel, tablet en desktop;
- gebruiken consistente spacing en typografie;
- hebben voldoende kleurcontrast;
- zijn toetsenbordbedienbaar;
- tonen zichtbare focus;
- respecteren reduced-motion voorkeuren waar animatie wordt toegepast;
- veroorzaken geen horizontale overflow;
- gebruiken semantische HTML-elementen.

## 9. Globale Definition of Done

De globale website-elementen zijn klaar wanneer:

- header en navigatie op alle standaardpagina's consistent zijn;
- de primaire CTA overal dezelfde conversieroute gebruikt;
- mobiele navigatie volledig bruikbaar is;
- footer en juridische links aanwezig zijn;
- alle formulierstatussen zijn beschreven;
- privacy- en marketingtoestemming gescheiden zijn;
- basis SEO-velden per pagina configureerbaar zijn;
- responsive en toegankelijk gedrag als acceptatiecriterium is vastgelegd;
- Claude Code de elementen als gedeelde componenten kan implementeren zonder nieuwe scopebeslissingen.
