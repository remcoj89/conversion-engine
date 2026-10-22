# Standaardblokken contactpagina — Conversion Engine

**Status:** concept voor Fase 1
**Doel:** een contactpagina die bezoekers op het laatste beslismoment overtuigt en met zo weinig mogelijk frictie naar een passende vervolgstap brengt.

## 1. Functie van de pagina

De contactpagina is geen generieke pagina met alleen een formulier. Het is een conversiepagina voor bezoekers die al interesse hebben, maar nog zekerheid nodig hebben over:

- waarom ze contact zouden opnemen;
- wat de vervolgstap oplevert;
- hoeveel moeite het kost;
- wie reageert;
- wat er met hun gegevens gebeurt;
- wat ze na het versturen kunnen verwachten.

De pagina krijgt één primaire conversiedoelstelling. De concrete CTA is per klant configureerbaar.

## 2. Standaardpagina-opbouw

```text
Conversiegerichte hero
    ↓
Waarom contact opnemen?
    ↓
Primaire contactactie + alternatief formulier
    ↓
Vertrouwen en bewijs
    ↓
Wat gebeurt er daarna?
    ↓
FAQ en bezwaren
    ↓
Laatste CTA
```

## 3. Blokken

### CP-01 — Conversiegerichte hero

**Doel:** direct duidelijk maken waarom contact opnemen relevant is.

Verplichte velden:

- korte, resultaatgerichte kop;
- ondersteunende uitleg;
- primaire CTA-label;
- optionele ondersteunende afbeelding of portret.

Voorbeeldrichting:

> Klaar om meer uit je website te halen? Bespreek vrijblijvend wat de beste volgende stap is.

De kop mag niet uitsluitend “Neem contact op” zijn.

### CP-02 — Waarom contact opnemen?

**Doel:** de belangrijkste twijfel wegnemen voordat iemand het formulier of de afspraakmodule gebruikt.

Standaard drie voordeelkaarten:

- snel duidelijkheid over de mogelijkheden;
- passend advies voor de situatie;
- zonder verplichting direct te beslissen.

De teksten zijn klant-specifiek configureerbaar, maar blijven kort en concreet.

### CP-03 — Primaire contactactie

**Doel:** bezoekers die klaar zijn voor actie direct laten converteren.

Mogelijke primaire acties:

- kennismakingsgesprek plannen;
- intakegesprek boeken;
- offerte aanvragen;
- adviesgesprek aanvragen.

De primaire actie gebruikt één duidelijke CTA en verwijst naar een afspraakmodule, formulier of gecontroleerde vervolgstap.

### CP-04 — Kort contactformulier

**Doel:** een laagdrempelig alternatief bieden aan bezoekers die nog geen afspraak willen plannen.

Minimale velden:

- naam;
- e-mailadres;
- reden van contact;
- optionele toelichting;
- optioneel telefoonnummer.

Verplichte toestemmingen:

- privacyverwijzing;
- noodzakelijke toestemming voor verwerking van de aanvraag.

Optioneel:

- aparte marketingopt-in, nooit vooraf aangevinkt.

Niet opnemen in het eerste contactformulier:

- uitgebreide intakevragen;
- onnodige persoonsgegevens;
- verplichte telefoonnummers zonder duidelijke reden;
- medische of andere bijzondere persoonsgegevens.

### CP-05 — Vertrouwen en bewijs

**Doel:** onzekerheid verminderen voordat de bezoeker contactgegevens achterlaat.

Mogelijke configureerbare onderdelen:

- echte klantbeoordelingen;
- relevante cases;
- keurmerken of certificaten;
- foto van de ondernemer of het team;
- duidelijke informatie over wie reageert;
- ervaring of specialisatie.

Alle bewijsvoering moet echt en controleerbaar zijn. Geen verzonnen testimonials, cijfers of garanties.

### CP-06 — Wat gebeurt er daarna?

**Doel:** onzekerheid over de vervolgstap wegnemen.

Standaard drie- of vierstappenblok:

1. Je laat je gegevens achter of plant een gesprek.
2. De ondernemer neemt binnen de afgesproken termijn contact op.
3. De situatie en het doel worden besproken.
4. Je ontvangt een passende vervolgstap.

De reactietermijn is klant-specifiek configureerbaar en mag alleen worden beloofd als de klant deze kan waarmaken.

### CP-07 — FAQ en bezwaren

**Doel:** veelvoorkomende bezwaren beantwoorden zonder de pagina onnodig lang te maken.

De FAQ ondersteunt minimaal drie relevante vragen, bijvoorbeeld:

- Is het gesprek vrijblijvend?
- Wat moet ik voorbereiden?
- Wat kost een vervolgtraject?
- Voor wie is deze dienst wel en niet geschikt?
- Wat gebeurt er met mijn gegevens?

De vragen zijn per klant configureerbaar.

### CP-08 — Laatste CTA

**Doel:** een bezoeker die de volledige pagina heeft gelezen alsnog laten converteren.

De laatste CTA herhaalt de primaire actie en gebruikt dezelfde bestemming als CP-03.

Voorbeeldrichting:

> Wil je weten wat voor jou de beste volgende stap is?

Er wordt geen nieuwe concurrerende actie toegevoegd onderaan de pagina.

### CP-09 — Formuliersuccesscherm en bedankpagina

Na een geldige inzending:

- wordt bevestigd dat de aanvraag is ontvangen;
- wordt vermeld wat de bezoeker nu kan verwachten;
- wordt verwezen naar de specifieke bedankpagina;
- wordt een passende vervolgstap getoond als die logisch en toegestaan is.

De bedankpagina wordt als afzonderlijk standaardtemplate gespecificeerd.

## 4. Conversieregels

- De pagina heeft één primaire actie.
- Het formulier bevat zo min mogelijk velden.
- De primaire CTA is binnen de eerste viewport herkenbaar.
- De mobiele versie houdt CTA en formulier goed bedienbaar.
- De pagina bevat geen afleidende acties die de primaire keuze verdringen.
- De pagina maakt duidelijk wie reageert en binnen welke termijn.
- De pagina gebruikt geen onbewezen resultaatclaims.
- De bezoeker weet vóór verzending wat er met de gegevens gebeurt.
- Formulierfouten worden inline, duidelijk en zonder gegevensverlies getoond.
- Na succes krijgt de bezoeker een concrete bevestiging.

## 5. Metingen

De volgende events moeten waar technisch beschikbaar worden gemeten:

- contactpagina bekeken;
- primaire CTA aangeklikt;
- afspraakflow gestart;
- afspraak geboekt;
- formulier gestart;
- formulier verzonden;
- formulier succesvol verwerkt;
- formulierfout opgetreden;
- bedankpagina bekeken.

Test- en monitorinzendingen mogen geen echte leads, conversies of commerciële KPI's veroorzaken.

## 6. Responsive en toegankelijkheid

- De pagina werkt op mobiel, tablet en desktop.
- CTA's zijn met toetsenbord en touch bruikbaar.
- Labels en foutmeldingen zijn aan formuliervelden gekoppeld.
- Focus en foutstatus zijn zichtbaar.
- Er is geen horizontale overflow op kleine schermen.
- Afbeeldingen hebben passende alternatieve tekst.
- Kleurcontrast en leesbaarheid voldoen aan de geldende toegankelijkheidsnormen voor de MVP.

## 7. Privacy en veiligheid

- Verzamel alleen gegevens die nodig zijn voor de gekozen vervolgstap.
- Marketingtoestemming staat los van de aanvraag.
- Marketingopt-in is nooit vooraf aangevinkt.
- Contactdata wordt tenantgebonden verwerkt.
- Tokens, formulierinhoud en persoonsgegevens komen niet in client-side analytics of logs terecht.
- Anti-spam en rate limiting worden toegepast zodra de technische formulierflow wordt gebouwd.

## 8. Buiten scope

- uitgebreide intake op de contactpagina;
- onbeperkte formulierflows;
- meerdere concurrerende primaire CTA's;
- automatische medische of juridische adviezen;
- verzonnen of niet-verifieerbare social proof;
- volledige afspraak- of CRM-module binnen deze paginaspecificatie;
- campagne- of advertentielandingpages buiten de standaardtemplate.

## 9. Definition of Done

De contactpagina-template is klaar wanneer:

- de hero een duidelijke reden tot contact geeft;
- een primaire contactactie en laagdrempelig alternatief beschikbaar zijn;
- het formulier alleen noodzakelijke velden bevat;
- vertrouwen, vervolgstap en FAQ zijn afgedekt;
- de bedankpagina-flow is gedefinieerd;
- succes- en foutstatussen zijn beschreven;
- relevante conversie-events zijn benoemd;
- privacy, tenantisolatie en anti-spam als randvoorwaarden zijn vastgelegd;
- de template op mobiel en desktop bruikbaar is.
