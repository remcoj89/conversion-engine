# Standaardblokken blog — Conversion Engine

**Status:** concept voor Fase 1
**Doel:** een herbruikbare blogstructuur bieden die expertise en vertrouwen opbouwt en bezoekers naar de primaire conversieroute leidt.

## 1. Functie van de blog

De blog is geen los contentarchief. Iedere publicatie moet minimaal één van deze functies hebben:

- een concrete vraag van de doelgroep beantwoorden;
- expertise en vertrouwen opbouwen;
- een bezwaar wegnemen;
- een leadmagnet of aanbod logisch ondersteunen;
- bezoekers naar de primaire conversieroute begeleiden.

Doorlopende blogproductie valt niet automatisch binnen de standaard website-delivery-scope.

## 2. Templates

De standaardwebsite ondersteunt twee templates:

1. Blogoverzicht.
2. Blogdetailpagina.

Categorieën en tags zijn optioneel en worden alleen toegevoegd wanneer ze de navigatie of contentstrategie aantoonbaar verbeteren.

## 3. Blogoverzicht

### BL-01 — Bloghero

**Doel:** duidelijk maken voor wie de content bedoeld is en welke onderwerpen worden behandeld.

Configureerbare velden:

- paginatitel;
- korte introductie;
- optionele uitgelichte CTA;
- optionele uitgelichte afbeelding.

De hero bevat geen concurrerende verzameling van CTA's.

### BL-02 — Uitgelicht artikel

Toont maximaal één uitgelicht artikel met:

- titel;
- korte samenvatting;
- categorie of onderwerp, indien actief;
- publicatiedatum;
- leestijd;
- uitgelichte afbeelding;
- CTA naar het artikel.

### BL-03 — Artikelenoverzicht

De lijst toont per artikel minimaal:

- titel;
- korte samenvatting;
- publicatiedatum;
- leestijd;
- uitgelichte afbeelding of visuele fallback;
- CTA `Lees artikel`.

De lijst ondersteunt pagination of gecontroleerd laden van meer artikelen wanneer het aantal groeit.

### BL-04 — Categorieën of filters

Alleen toevoegen als er voldoende relevante content is. Filters moeten:

- begrijpelijk zijn voor de doelgroep;
- geen lege resultaten tonen;
- op mobiel bruikbaar zijn;
- geen belangrijke content verbergen zonder duidelijke reden.

## 4. Blogdetailpagina

### BL-05 — Artikelheader

Bevat minimaal:

- H1;
- korte introductie of samenvatting;
- auteur of afzender;
- publicatiedatum;
- bijgewerkt-datum indien relevant;
- leestijd;
- uitgelichte afbeelding;
- categorie of onderwerp, indien actief.

### BL-06 — Artikelinhoud

De content ondersteunt:

- logische H2- en H3-structuur;
- paragrafen;
- lijsten;
- links;
- afbeeldingen met alternatieve tekst;
- citaten of callouts;
- eenvoudige tabellen wanneer nodig.

De inhoud moet scanbaar zijn en snel naar de belangrijkste conclusie leiden.

### BL-07 — Inhoudelijke CTA

In het artikel staat minimaal één relevante vervolgstap die aansluit op het onderwerp, bijvoorbeeld:

- primaire leadmagnet;
- contactpagina;
- salespage;
- kennismakingsgesprek.

De CTA mag inhoudelijk in het artikel voorkomen en wordt eventueel aan het einde herhaald.

### BL-08 — Auteur en vertrouwen

Optioneel blok met:

- foto;
- naam;
- functie of expertise;
- korte bio;
- link naar over-mij-pagina.

Gebruik alleen feitelijke expertise en echte resultaten.

### BL-09 — Gerelateerde artikelen

Toon maximaal drie gerelateerde artikelen op basis van handmatige selectie of een eenvoudige categorie-/onderwerp-relatie.

De gerelateerde artikelen mogen de primaire CTA niet volledig vervangen.

### BL-10 — Artikelafsluiting

De afsluiting bevat:

- korte samenvatting of conclusie;
- één passende CTA;
- optionele uitnodiging om een vraag te stellen;
- deelopties alleen wanneer deze technisch en privacyvriendelijk worden uitgevoerd.

## 5. Content- en publicatieregels

Een artikel heeft minimaal:

- titel;
- slug;
- samenvatting;
- inhoud;
- auteur;
- publicatiedatum;
- status: concept, gepland of gepubliceerd;
- SEO-titel en meta description;
- uitgelichte afbeelding of bewuste keuze zonder afbeelding.

Een artikel wordt niet gepubliceerd wanneer de H1, auteur, inhoud of primaire CTA ontbreekt.

## 6. Conversieregels

- Ieder artikel heeft één relevante primaire vervolgstap.
- De CTA sluit aan op de intentie van de lezer.
- De blog probeert niet tegelijk alle aanbiedingen te verkopen.
- De lezer krijgt eerst inhoudelijke waarde voordat een CTA dominant wordt.
- Leadmagnet- en formulierflows gebruiken bestaande privacyregels.
- Blogcontent bevat geen onbewezen medische, financiële of resultaatclaims.
- De blog ondersteunt de primaire conversieroute, maar vervangt de salespage niet.

## 7. SEO-basis

Iedere blogdetailpagina ondersteunt:

- één H1;
- configureerbare SEO-titel;
- configureerbare meta description;
- canonical URL;
- Open Graph-titel, beschrijving en afbeelding;
- beschrijvende slug;
- auteur- en publicatiedatumvelden;
- passende alternatieve tekst;
- structured data wanneer de implementatie dit correct en controleerbaar kan leveren.

Geen automatisch gegenereerde metadata met onbewezen claims.

## 8. Responsive en toegankelijkheid

- Artikelen zijn goed leesbaar op mobiel en desktop.
- De tekstkolom blijft geschikt voor langere leesteksten.
- Koppen en links zijn toetsenbordbedienbaar.
- Afbeeldingen schalen zonder layoutproblemen.
- Er is geen horizontale overflow.
- Linkteksten zijn beschrijvend.
- Contrast en focus zijn zichtbaar.
- Deelopties of interactieve elementen blokkeren de leesflow niet.

## 9. Metingen

Meet minimaal:

- blogoverzicht bekeken;
- artikel geopend;
- leestijd of scroll-diepte waar privacyvriendelijk beschikbaar;
- primaire CTA aangeklikt;
- leadmagnet gestart;
- contact- of afspraakflow gestart;
- gerelateerd artikel geopend.

Analytics mogen geen volledige persoonsgegevens, formulierinhoud of gevoelige artikelinteracties vastleggen.

## 10. Buiten scope

- automatische blogproductie;
- onbeperkte categorie- en tagstructuren;
- complexe auteurs- of redactie-workflows;
- volledige commentaarfunctionaliteit;
- advertentiebeheer;
- automatische SEO-garanties;
- contentstrategie of copywriting als onderdeel van de standaard websitebouw;
- een aparte blog-app naast de website.

## 11. Definition of Done

De blogtemplate is klaar wanneer:

- blogoverzicht en blogdetail afzonderlijk zijn beschreven;
- een artikel alle noodzakelijke contentvelden heeft;
- ieder artikel één relevante CTA kan tonen;
- SEO-basisvelden configureerbaar zijn;
- auteur, datum en leestijd correct worden weergegeven;
- mobiele leesbaarheid en toegankelijkheid zijn geborgd;
- categorieën alleen worden toegevoegd wanneer ze waarde hebben;
- de blog naar leadmagnet, contact of salespage kan doorverwijzen;
- de template geen onnodige content- of feature-scope introduceert.
