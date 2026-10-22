# Standaardblokken bedankpagina en upsell — Conversion Engine

**Status:** concept voor Fase 1
**Doel:** de leadmagnet correct afronden en daarna één logische vervolgstap aanbieden met zo weinig mogelijk frictie.

## 1. Functie van de pagina

De bedankpagina bevestigt eerst dat de aanvraag, quiz of challenge correct is ontvangen. De bezoeker krijgt waarvoor hij zijn gegevens heeft achtergelaten. Daarna biedt de pagina één passende vervolgstap aan.

De upsell is geen onderbreking van de beloofde leadmagnet, maar een logisch antwoord op de volgende vraag van de bezoeker:

> Wil je dit zelf proberen, of wil je hulp om sneller resultaat te bereiken?

## 2. Standaardflow

```text
Leadmagnet ingevuld
    ↓
Inzending en lead veilig opslaan
    ↓
Bedankpagina bevestigt ontvangst
    ↓
Leadmagnet, resultaat of startinstructie beschikbaar
    ↓
Logische vervolgstap tonen
    ↓
Afspraak, aanvraag of aankoop
```

De leadmagnet moet eerst succesvol zijn verwerkt voordat de upsell als primaire vervolgstap wordt getoond.

## 3. Blokken

### BP-01 — Bevestiging

**Doel:** onzekerheid wegnemen en bevestigen dat de actie gelukt is.

Verplichte onderdelen:

- duidelijke bevestigingskop;
- korte uitleg wat is ontvangen;
- geen onnodige technische details;
- passende tone of voice van de klant.

Voorbeeldrichting:

> Je aanvraag is goed ontvangen.

### BP-02 — Verwachting en levering

**Doel:** duidelijk maken wat de bezoeker nu ontvangt en wanneer.

Afhankelijk van de leadmagnet:

- quizresultaat direct tonen;
- downloadlink aanbieden;
- challenge-instructie tonen;
- eerste challenge-actie uitleggen;
- aangeven wanneer een e-mail of vervolgbericht wordt verstuurd.

De operationele levering van de leadmagnet staat los van marketingtoestemming.

### BP-03 — Eerste resultaat of actie

**Doel:** de bezoeker direct waarde geven.

Voorbeelden:

- quizresultaat met korte uitleg;
- eerste concrete trainingsactie;
- downloadknop;
- startinstructie voor de 14- of 30-daagse challenge.

De bezoeker mag niet verplicht opnieuw gegevens invullen om de beloofde eerste waarde te ontvangen, tenzij dit vooraf duidelijk is aangekondigd.

### BP-04 — Overgang naar vervolgstap

**Doel:** natuurlijk uitleggen waarom de vervolgstap relevant is.

Voorbeeldrichting:

> Wil je dit niet alleen proberen? Krijg persoonlijke begeleiding bij jouw volgende stap.

De overgang moet aansluiten op de leadmagnet en mag niet voelen als een willekeurige advertentie.

### BP-05 — Configureerbaar upsell-aanbod

De template ondersteunt meerdere aanbodtypen:

- vrijblijvende kennismaking;
- betaalde startsessie;
- persoonlijk plan;
- coachingtraject;
- intake of strategiegesprek;
- proefles of consult;
- ander goedgekeurd vervolgaanbod.

Configureerbare velden:

- aanbodtitel;
- gewenste uitkomst;
- voor wie het aanbod is;
- wat inbegrepen is;
- tijdsinvestering;
- prijs;
- bewijs of resultaten;
- CTA-label;
- CTA-bestemming;
- garantie of risicoreductie.

### BP-06 — Primaire CTA

De pagina heeft maximaal één primaire upsell-actie.

Voorbeelden:

- `Plan mijn kennismaking`;
- `Start met mijn persoonlijke plan`;
- `Bekijk het coachingtraject`;
- `Boek mijn startsessie`.

De CTA verwijst naar een afspraakmodule, verkoop-/salespagina, checkout of gecontroleerd aanvraagformulier.

### BP-07 — Risicoverlaging

Mogelijke elementen:

- vrijblijvend kennismakingsgesprek;
- proefles;
- tevredenheidsgarantie;
- duidelijke uitleg van de vervolgstap;
- transparante prijs;
- echte klantbeoordeling.

Gebruik alleen garanties en bewijs die de klant daadwerkelijk kan waarmaken. Geen verzonnen schaarste, deadlines of resultaten.

### BP-08 — Alternatief voor twijfelaars

Bezoekers die nog niet klaar zijn voor de upsell krijgen één rustige alternatieve route, bijvoorbeeld:

- terug naar de inhoudelijke website;
- een relevant artikel lezen;
- de challenge starten;
- de leadmagnet bewaren.

Dit alternatief mag de primaire upsell niet visueel domineren.

## 4. Pilotinstelling

Voor de eerste pilot is de standaardupsell:

> Een vrijblijvende kennismaking.

De template wordt wel zo gebouwd dat per klant ook een betaald vervolgaanbod kan worden ingesteld. Daarmee blijft de eerste pilot laagdrempelig, terwijl het productmodel commerciële doorgroei ondersteunt.

## 5. Conversieregels

- Eerst leveren wat is beloofd, daarna pas upsellen.
- Eén primaire upsell per bedankpagina.
- De upsell sluit inhoudelijk aan op de gekozen leadmagnet.
- De bezoeker hoeft niet opnieuw dezelfde gegevens in te vullen.
- De primaire CTA is direct herkenbaar.
- Prijs en voorwaarden zijn duidelijk wanneer het om een betaald aanbod gaat.
- De pagina gebruikt geen misleidende urgentie of onbewezen claims.
- De alternatieve route blijft beschikbaar zonder de primaire CTA te verdringen.
- De mobiele versie maakt de CTA gemakkelijk bedienbaar.

## 6. Metingen

Meet minimaal:

- leadmagnet succesvol verwerkt;
- bedankpagina bekeken;
- resultaat of levering geopend;
- upsell bekeken;
- upsell-CTA aangeklikt;
- afspraakflow gestart;
- afspraak geboekt;
- aanvraag verzonden;
- aankoop gestart;
- aankoop afgerond.

Test- en monitorinzendingen worden uitgesloten van echte leads, omzet en conversierapportages.

## 7. Technische randvoorwaarden

- Zet geen e-mailadres, quizantwoorden of andere persoonsgegevens in de URL.
- Gebruik een server-side sessie of een opaque, kortlevende verwijzing voor de actuele leadmagnetstatus.
- Sla de leadmagnetinzending duurzaam op voordat levering of upsell wordt gestart.
- Zorg dat een dubbele submit geen dubbele lead, levering of upsell-event oplevert.
- Houd operationele levering en marketingtoestemming gescheiden.
- Houd de upsell tenantgebonden.
- Log geen tokens, volledige formulierinhoud of onnodige persoonsgegevens.

## 8. Buiten scope

- meerdere gelijktijdige upsells;
- complexe personalisatie op basis van gevoelige persoonsgegevens;
- automatische prijs- of kortingsbeslissingen;
- misleidende countdowns of valse schaarste;
- volledige checkout- of abonnementsfunctionaliteit binnen deze paginaspecificatie;
- een volledige challenge-builder.

## 9. Definition of Done

De bedankpagina-template is klaar wanneer:

- de leadmagnet eerst correct wordt bevestigd en geleverd;
- de bezoeker een direct resultaat of duidelijke startinstructie krijgt;
- één logische upsell configureerbaar is;
- een vrijblijvende kennismaking als standaard kan worden ingesteld;
- betaalde vervolgaanbiedingen ook ondersteund worden;
- CTA, afspraak, aanvraag of aankoop meetbaar zijn;
- privacy, idempotentie en tenantisolatie zijn geborgd;
- de pagina op mobiel en desktop bruikbaar is;
- een bezoeker zonder interesse een rustige alternatieve route heeft.
