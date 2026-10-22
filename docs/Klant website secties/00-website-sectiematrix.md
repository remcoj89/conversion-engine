# Website-sectiematrix — Conversion Engine

**Status:** werkdocument voor Fase 1
**Doel:** overzicht van de standaardpagina's, bronbestanden en ontbrekende templates
**Bronmap:** `docs/Klant website secties/`

## 1. Bron van waarheid

De bestaande Word-documenten in deze map bevatten de standaardblokken voor de eerste drie pagina-templates. Deze matrix vervangt die documenten niet; hij koppelt de documenten aan de productstructuur en maakt zichtbaar welke pagina's nog moeten worden gespecificeerd.

| Pagina | Bronbestand | Status | Gebruik |
|---|---|---:|---|
| Homepage | `website-blokken-home-pagina.docx` | ✅ Beschikbaar | Standaardblokken voor de primaire website-ingang |
| Salespage | `website-blokken-salespagina.docx` | ✅ Beschikbaar | Herbruikbare commerciële template |
| Over mij | `website-blokken-over-mij-pagina-1.docx` | ✅ Beschikbaar | Vertrouwen, achtergrond en persoonlijke positionering |
| Contact | `website-blokken-contactpagina.md` | ✅ Beschikbaar | Conversiegericht contact, aanvraag en/of afspraak |
| Blog | `website-blokken-blog.md` | ✅ Beschikbaar | Blogoverzicht en blogdetail-template |
| Leadmagnet | `website-blokken-leadmagnetpagina.md` | ✅ Beschikbaar | Quiz of 14-/30-daagse challenge |
| Bedankt | `website-blokken-bedankpagina-upsell.md` | ✅ Beschikbaar | Bevestiging, levering en één logische upsell |

## 2. Template-regels

- De drie bestaande bronbestanden zijn de standaard voor nieuwe klantwebsites.
- Een klantwebsite configureert bestaande blokken; standaardimplementatie betekent geen vrij ontwerp zonder scopebesluit.
- De salespage is herbruikbaar en krijgt klant-specifieke contentvelden.
- De over-mij-pagina blijft een afzonderlijke template en wordt niet automatisch als contactpagina gebruikt.
- Blog krijgt nog een eigen specificatie voordat Claude Code deze implementeert.
- Contact, leadmagnet en bedankt/upsell hebben nu elk een eigen specificatie.
- De blog heeft nu een eigen specificatie.

Het document `website-globale-elementen.md` bevat de gedeelde header-, navigatie-, CTA-, footer-, formulier-, privacy- en SEO-regels voor alle pagina's.
- Nieuwe blokken worden eerst als standaard of optionele variant goedgekeurd voordat ze in de templatebibliotheek komen.

## 3. Pagina-overzicht voor de standaardwebsite

### Homepage

Bron: `website-blokken-home-pagina.docx`

De homepage gebruikt uitsluitend de standaardblokken uit het bronbestand. De definitieve implementatiespecificatie moet per blok nog de configureerbare contentvelden, CTA-regels en responsive varianten benoemen.

### Salespage

Bron: `website-blokken-salespagina.docx`

De salespage wordt een herbruikbare template voor het aanbod van de klant. De implementatie moet onderscheid maken tussen:

- vaste structuur;
- configureerbare teksten en bewijsvoering;
- primaire CTA;
- eventuele formulier- of afspraakactie;
- onderdelen die buiten de standaardscope vallen.

### Over mij

Bron: `website-blokken-over-mij-pagina-1.docx`

De over-mij-pagina wordt gebruikt voor vertrouwen, achtergrond en persoonlijke positionering. De pagina staat los van de contactpagina.

### Contact

Bron: `website-blokken-contactpagina.md`

De contactpagina is een eigen conversietemplate. De specificatie bepaalt minimaal:

- contactdoel en primaire CTA;
- formulier versus afspraaklink;
- benodigde velden;
- privacy- en toestemmingsvelden;
- bevestigings- en foutstatus;
- koppeling met de bedankpagina.

### Blog

Bron: `website-blokken-blog.md`

De blog ondersteunt:

- blogoverzicht;
- blogdetailpagina;
- categorie- of taggedrag, indien nodig;
- auteur- en publicatiedatumvelden;
- CTA naar de primaire conversieroute.

Doorlopende blogproductie valt niet automatisch binnen de website-delivery-scope.

### Leadmagnet

Bron: `website-blokken-leadmagnetpagina.md`

De leadmagnetpagina is een herbruikbare template voor maximaal één actieve leadmagnet per website:

- **Trainingsdoel-check** als quizvariant;
- **14-daagse challenge** als aanbevolen pilotvariant;
- **30-daagse challenge** als langere variant met dezelfde basisstructuur.

De challenge wordt in Fase 1 handmatig of via een eenvoudige gecontroleerde e-mailreeks geleverd. Een volledige challenge-builder valt buiten Fase 1.

### Bedankt

Bron: `website-blokken-bedankpagina-upsell.md`

De bedankt-/upsellpagina is de bevestigingspagina na een geldige aanvraag, contactinzending of leadmagnetactie. De pagina moet minimaal:

- bevestigen wat er is ontvangen;
- aangeven wat de bezoeker nu kan verwachten;
- een passende vervolgstap tonen;
- geen onbewezen resultaat beloven.

## 4. Globale onderdelen

Deze onderdelen moeten over alle pagina-templates heen worden afgestemd:

- header en primaire navigatie;
- mobiele navigatie;
- primaire en secundaire CTA-stijl;
- footer;
- privacy- en cookieverwijzingen;
- formulierstatussen;
- fout- en succesmeldingen;
- responsive spacing en typografie;
- globale SEO-metadata.

De globale onderdelen mogen niet per klant opnieuw worden uitgevonden; alleen configuratie en content verschillen.

## 5. Volgende specificatiestappen

1. De blokken uit alle beschikbare bronbestanden vertalen naar een gecontroleerde implementatiematrix.
2. De formulierstatussen en gedeelde CTA-regels consolideren.
3. De demo-template bouwen.

## 6. Definition of Done voor de sectiematrix

De sectiematrix is klaar wanneer:

- alle beschikbare bronbestanden als standaard zijn geregistreerd;
- contact niet meer wordt verward met over-mij;
- alle zeven paginatypen een duidelijke status hebben;
- alle zeven paginaspecificaties beschikbaar zijn;
- globale elementen afzonderlijk zijn vastgelegd;
- globale onderdelen zijn afgebakend;
- Claude Code op basis hiervan een implementatieopdracht kan krijgen zonder nieuwe scopebeslissingen.
