# Demo-site — implementatierecord

**Datum:** 22 oktober 2026 (bijgewerkt 23 oktober 2026)
**Status:** gebouwd, getest en visueel gecontroleerd
**Locatie:** `apps/demo-site`
**Doel:** zelfstandige demowebsite voor de Conversion Engine

## 1. Architectuurbesluit

De demo-site staat als zelfstandige applicatie in `apps/demo-site`.

De demo-site is bewust losgekoppeld van:

- `apps/dashboard`;
- `apps/api`;
- Zitadel-authenticatie;
- productieklantdata;
- klantwebsites;
- externe CRM-, e-mail- en afspraakproviders.

Klantdemo's en productie-klantwebsites vallen buiten dit project.

## 2. Gebouwde routes

De demo bevat deze routes:

- `/` — homepage;
- `/sales` — herbruikbare salespage;
- `/over-mij` — over-mij-pagina;
- `/contact` — conversiegerichte contactpagina;
- `/blog` — blogoverzicht;
- `/blog/[slug]` — blogdetailpagina met drie voorbeeldartikelen;
- `/leadmagnet` — Ritme-check;
- `/bedankt` — bevestiging en kennismakings-upsell;
- `/privacy` — demo-privacyinformatie;
- 404-pagina.

De pagina's worden vooraf gegenereerd, behalve `/bedankt`, omdat die de bron van de flow leest.

## 3. Contentarchitectuur

De content staat centraal in:

- `content/types.ts`;
- `content/demo.ts`.

Componenten bevatten geen hardcoded commerciële copy. De content is fictief en bedoeld voor een personal trainer/fitnesscoach-demo.

## 4. Componenten

Belangrijkste gedeelde componenten:

- `SiteHeader`;
- `NavLinks`;
- `MobileNav`;
- `SiteFooter`;
- `CtaButton`;
- `CtaBand`;
- `AppointmentCta`;
- `FormFields`;
- `ContactForm`;
- `BlogCard`;
- `TrustBlock`;
- `QuizLeadmagnet`;
- `ThankYou`;
- `UpsellBlock`.

Hulpcomponenten ondersteunen secties, kaarten, stappen, lijsten, FAQ, geschikt/niet-geschikt-blokken en decoratieve demo-visuals.

## 5. Toegepaste standaarddocumenten

De demo is gebouwd op basis van de documenten in `docs/Klant website secties/`:

- homepage;
- salespage;
- over-mij;
- contactpagina;
- blog;
- leadmagnetpagina;
- bedankpagina met upsell;
- globale website-elementen;
- centrale sectiematrix.

Bewuste keuzes:

- de salespage gebruikt de noodzakelijke bronblokken en geen nep-urgentie;
- extra reviews zijn beperkt en duidelijk als voorbeeld gemarkeerd;
- de contactpagina gebruikt CP-01 t/m CP-08;
- CP-09 verwijst naar de bedankpagina;
- de quiz is de actieve leadmagnet;
- de challenge is nog niet actief naast de quiz;
- de bedankpagina toont eerst levering/bevestiging en daarna één upsell;
- blogfilters zijn weggelaten omdat drie artikelen geen filter nodig hebben.

## 6. Demo-interacties

- Quizscoring is deterministisch.
- De quiz heeft vijf vragen en vier profielen.
- Een e-mailadres is niet nodig voor het quizresultaat.
- Formulieren versturen of bewaren geen echte gegevens.
- Dubbele verzending wordt geblokkeerd.
- Een e-mailadres op `@fout.test` simuleert tijdelijke onbeschikbaarheid.
- Afspraakknoppen tonen een demo-melding zonder externe afspraakmodule.
- Quizresultaat gaat via `sessionStorage` naar `/bedankt` en niet via de URL.

## 7. Bewuste demo-toevoegingen

- Dunne demobalk bovenaan.
- `/privacy`-pagina.
- `noindex` op de volledige demo-site.
- Gegenereerde Open Graph-afbeelding.
- Label `Voorbeeld` op alle fictieve reviews.
- CSS-visuals als placeholders in plaats van echte afbeeldingen.

## 8. Verificatie

Geslaagd:

- `npm --workspace demo-site run typecheck`;
- `npm --workspace demo-site run lint`;
- `npm --workspace demo-site run test` — 19/19;
- `next build`;
- `git diff --check`;
- controle op trailing whitespace;
- controle op ongewenste netwerkaanroepen.

Visueel gecontroleerd:

- homepage desktop;
- homepage op 1024, 768 en mobiel;
- salespage desktop en mobiel;
- contactpagina desktop en mobiel;
- volledige leadmagnet → bedankpagina-flow;
- over-mij-pagina;
- blogpagina's.

Gecontroleerd gedrag:

- CTA zichtbaar op alle gecontroleerde breedtes;
- geen horizontale overflow op 390, 768 en 1024 pixels;
- mobiele navigatie sluit met Escape en na navigatie;
- focus keert terug naar de menuknop;
- foutieve formuliervelden krijgen focus;
- ingevulde formulierwaarden blijven behouden bij fouten;
- driedubbele klik veroorzaakt één verzending;
- marketingopt-in staat standaard uit;
- bedankpagina toont bevestiging vóór upsell.

## 9. Visuele verfijning — 23 oktober 2026

De demo-site is visueel verfijnd en opnieuw gecontroleerd op desktop (1440 px) en mobiel (390 px): homepage, salespage, contactpagina, over-mij, leadmagnetflow, beide bedankpagina's, blog en mobiele navigatie.

Opgelost:

- **CTA-contrast:** de primaire CTA-kleur is `#c24e2c` (4,75:1 met witte tekst), de hover-state `#a63f24` (6,25:1). Stapnummers gebruiken dezelfde kleur.
- **Rasteruitlijning:** blog- en reviewrasters met twee items tonen twee kolommen in plaats van een lege derde kolom. Bij drie items blijven drie kolommen staan. Dit lost ook het eerdere aandachtspunt bij `Lees ook` op.
- **Blogkaart-meta:** het onderwerp staat op een eigen regel, datum en leestijd breken niet meer af. Titels en tekst staan in alle kaarten op dezelfde hoogte.
- **Inspringing:** `home.firstStep.intro.text` in `content/demo.ts` is gecorrigeerd.

Geen horizontale overflow op de gecontroleerde pagina's.

Geslaagd na deze wijzigingen:

- `npm --workspace demo-site run typecheck`;
- `npm --workspace demo-site run lint`;
- `npm --workspace demo-site run test` — 19/19;
- `npm --workspace demo-site run build`;
- `git diff --check`.

## 10. Niet uitgevoerd

- Geen packages geïnstalleerd.
- Geen `npm install` uitgevoerd.
- Geen echte formulieren of afspraken verstuurd.
- Geen productie-integraties aangesloten.
- Geen wijzigingen buiten `apps/demo-site` gemaakt tijdens de demo-implementatie.
- Geen commit gemaakt van `apps/demo-site`.

## 11. Vergelijkingsdoel voor morgen

Voer de opgeslagen prompt opnieuw uit in dezelfde repository of op een schone vergelijkingsbranch. Vergelijk minimaal:

- routevolledigheid;
- componentstructuur;
- contentarchitectuur;
- toepassing van de bronblokken;
- responsive gedrag;
- formulier- en quizgedrag;
- testdekking;
- visuele verschillen;
- bewuste afwijkingen van deze baseline.
