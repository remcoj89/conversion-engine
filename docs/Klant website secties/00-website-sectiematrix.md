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
| Contact | Nog geen bronbestand | ⬜ Te specificeren | Contact, aanvraag en/of afspraak |
| Blog | Nog geen bronbestand | ⬜ Te specificeren | Blogoverzicht en blogdetail-template |
| Leadmagnet | Nog geen bronbestand | ⬜ Te specificeren | Quiz of 14-/30-daagse challenge |
| Bedankt | Nog geen bronbestand | ⬜ Te specificeren | Bevestiging en passende vervolgstap |

## 2. Template-regels

- De drie bestaande bronbestanden zijn de standaard voor nieuwe klantwebsites.
- Een klantwebsite configureert bestaande blokken; standaardimplementatie betekent geen vrij ontwerp zonder scopebesluit.
- De salespage is herbruikbaar en krijgt klant-specifieke contentvelden.
- De over-mij-pagina blijft een afzonderlijke template en wordt niet automatisch als contactpagina gebruikt.
- Contact, blog, leadmagnet en bedankt krijgen een eigen specificatie voordat Claude Code ze implementeert.
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

Nog te specificeren als eigen template. Minimaal te bepalen:

- contactdoel en primaire CTA;
- formulier versus afspraaklink;
- benodigde velden;
- privacy- en toestemmingsvelden;
- bevestigings- en foutstatus;
- koppeling met de bedankpagina.

### Blog

Nog te specificeren als:

- blogoverzicht;
- blogdetailpagina;
- categorie- of taggedrag, indien nodig;
- auteur- en publicatiedatumvelden;
- CTA naar de primaire conversieroute.

Doorlopende blogproductie valt niet automatisch binnen de website-delivery-scope.

### Leadmagnet

Nog te specificeren als herbruikbare template voor maximaal één actieve leadmagnet per website:

- **Trainingsdoel-check** als quizvariant;
- **14-daagse challenge** als aanbevolen pilotvariant;
- **30-daagse challenge** als langere variant met dezelfde basisstructuur.

De challenge wordt in Fase 1 handmatig of via een eenvoudige gecontroleerde e-mailreeks geleverd. Een volledige challenge-builder valt buiten Fase 1.

### Bedankt

Nog te specificeren als bevestigingspagina na een geldige aanvraag, contactinzending of leadmagnetactie. De pagina moet minimaal:

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

1. De blokken uit de drie bronbestanden vertalen naar een gecontroleerde implementatiematrix.
2. De contactpagina als afzonderlijk document uitwerken.
3. De blogtemplate definiëren.
4. De leadmagnet- en challengeflow definiëren.
5. De bedankt- en formulierstatussen definiëren.
6. De globale header, navigatie en footer vastleggen.
7. Daarna pas de demo-template bouwen.

## 6. Definition of Done voor de sectiematrix

De sectiematrix is klaar wanneer:

- de drie bestaande bronbestanden als standaard zijn geregistreerd;
- contact niet meer wordt verward met over-mij;
- alle zeven paginatypen een duidelijke status hebben;
- ontbrekende templates afzonderlijk zijn benoemd;
- globale onderdelen zijn afgebakend;
- Claude Code op basis hiervan een implementatieopdracht kan krijgen zonder nieuwe scopebeslissingen.
