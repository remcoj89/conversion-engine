# Codex-prompt — standalone demo-site

Gebruik deze prompt morgen opnieuw om de demo-site opnieuw te laten bouwen en met de huidige baseline te vergelijken.

```text
Bouw de eerste standalone Conversion Engine demowebsite.

Lees eerst:

- docs/demo-site-implementation-record-v1.0.md
- docs/Klant website secties/00-website-sectiematrix.md
- docs/Klant website secties/website-blokken-home-pagina.docx
- docs/Klant website secties/website-blokken-salespagina.docx
- docs/Klant website secties/website-blokken-over-mij-pagina-1.docx
- docs/Klant website secties/website-blokken-contactpagina.md
- docs/Klant website secties/website-blokken-blog.md
- docs/Klant website secties/website-blokken-leadmagnetpagina.md
- docs/Klant website secties/website-blokken-bedankpagina-upsell.md
- docs/Klant website secties/website-globale-elementen.md

Doel
----

Maak een zelfstandige demo-site in `apps/demo-site` voor een fictieve Nederlandse personal trainer of fitnesscoach.

De site staat volledig los van:

- apps/dashboard;
- apps/api;
- Zitadel;
- databases;
- klantdata;
- productie-integraties;
- externe afspraak-, e-mail- of CRM-providers.

Wijzig niets buiten `apps/demo-site`, behalve eventueel de minimaal noodzakelijke workspace-configuratie. Als zo'n wijziging nodig is, rapporteer dat eerst en voer hem niet automatisch uit.

Gebruik geen nieuwe dependencies en voer geen npm install uit. Als een dependency ontbreekt, stop dan en rapporteer welke dependency nodig is en waarom.

Routes
------

Implementeer:

- `/`
- `/sales`
- `/over-mij`
- `/contact`
- `/blog`
- `/blog/[slug]` met drie fictieve artikelen
- `/leadmagnet`
- `/bedankt`
- `/privacy`
- een nette 404-pagina

Functionele flow
---------------

1. Homepage toont de primaire conversieroute.
2. Salespage toont een herbruikbaar aanbod.
3. Leadmagnetpagina toont de Trainingsdoel-check.
4. Quiz gebruikt vijf vragen en vier vaste profielen.
5. Quizscoring is deterministisch.
6. Quizresultaat wordt niet in de URL gezet.
7. Bedankpagina toont eerst de bevestiging/levering.
8. Daarna toont de bedankpagina één upsell.
9. Standaardupsell is een vrijblijvende kennismaking.
10. Contactpagina bevat een laagdrempelig conversieformulier.
11. Formulieren zijn lokale demo-interacties en bewaren of versturen geen echte gegevens.

Content
-------

Gebruik een centrale contentconfiguratie. Componenten mogen geen commerciële copy hardcoden.

Gebruik uitsluitend fictieve content. Gebruik geen onbewezen testimonials, medische claims, gezondheidsdiagnoses, omzetgaranties of echte klantnamen.

Componenten
-----------

Maak gedeelde componenten voor minimaal:

- header;
- desktop- en mobiele navigatie;
- footer;
- CTA's;
- formulieren en formuliervelden;
- blogkaarten;
- trust/review-blokken;
- quiz-leadmagnet;
- bedankpagina;
- upsellblok;
- secties, kaarten, stappen, FAQ en lijsten.

Gebruik de bestaande frontend-stack in het repository en TypeScript. Gebruik eigen CSS; geen Tailwind of nieuwe CSS-frameworks.

Bronblokken
-----------

Gebruik de Word-documenten voor homepage, salespage en over-mij als bron van waarheid. Gebruik de Markdown-specificaties voor contact, blog, leadmagnet, bedankpagina/upsell en globale elementen.

Verzin geen nieuwe blokken zonder dit expliciet te rapporteren.

Bewuste demo-eisen
------------------

- Voeg een duidelijke demobalk toe.
- Voeg een `/privacy`-pagina toe.
- Zet de volledige demo op `noindex`.
- Gebruik CSS-visuals of veilige placeholders; geen externe afbeeldingen nodig.
- Markeer fictieve reviews zichtbaar als voorbeeld.
- Een e-mailadres op `@fout.test` mag tijdelijke onbeschikbaarheid simuleren.
- Afspraakknoppen tonen een lokale demo-melding.
- Marketing-opt-in staat standaard uit.
- Dubbele verzending wordt geblokkeerd.
- Formulierfouten zijn inline en behouden ingevulde waarden.
- Quizfocus gaat naar iedere nieuwe vraag.

Technische grenzen
------------------

- Geen echte netwerkcalls.
- Geen database.
- Geen secrets.
- Geen persoonsgegevens in publieke URL's.
- Geen externe analyticsprovider.
- Geen echte e-mailverzending.
- Geen echte checkout.
- Geen echte afspraakmodule.
- Geen challenge naast de quiz activeren.

Kwaliteit
---------

Voer uit:

- relevante typecheck;
- relevante lint;
- unit tests voor quiz, validatie en contentregels;
- production build;
- git diff --check.

Maak visuele screenshots van minimaal:

- homepage desktop en mobiel;
- salespage desktop en mobiel;
- contactpagina desktop en mobiel;
- leadmagnet → bedankpagina-flow;
- over-mij en blog.

Controleer visueel:

- CTA-zichtbaarheid;
- blokvolgorde volgens de bronnen;
- responsive gedrag;
- geen horizontale overflow;
- mobiele navigatie;
- formulierstatussen;
- quizfocus;
- bedankpagina vóór upsell;
- uitlijning van het `Lees ook`-raster.

Rapporteer
---------

Rapporteer:

- gewijzigde bestanden;
- routes;
- componentstructuur;
- contentarchitectuur;
- toegepaste bronblokken;
- afwijkingen ten opzichte van docs/demo-site-implementation-record-v1.0.md;
- testresultaten;
- buildresultaat;
- visuele bevindingen;
- eventuele dependency- of workspace-blockers.

Commit niets en start geen productieproces.
```

## Vergelijkingsinstructie

Vergelijk het resultaat van morgen met `docs/demo-site-implementation-record-v1.0.md`. Beoordeel niet alleen of de checks slagen, maar ook:

- welke componenten anders zijn opgebouwd;
- welke bronblokken anders zijn geïnterpreteerd;
- welke pagina's visueel afwijken;
- of de interacties hetzelfde gedrag hebben;
- of afwijkingen verbeteringen of regressies zijn.
