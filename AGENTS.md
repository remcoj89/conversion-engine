# Projectregels voor agents

Dit document bevat de algemene werkwijze voor Codex, Claude Code en andere agents die aan de Conversion Engine werken.

## Start van iedere nieuwe sessie

Lees in deze volgorde:

1. `CLAUDE.md` als Claude Code uitvoert, of dit bestand als algemene projectinstructie.
2. `docs/PROJECT-CONTEXT.md` voor de actuele status, leidende bronnen en eerstvolgende stap.
3. `README.md` voor de actuele technische implementatiestatus.
4. Het relevante brondocument voor de opdracht:
   - functionele scope: `docs/fase-2-requirements-scope-definitief-v1.0.md`;
   - UX en user flows: `docs/fase-3-ux-ui-user-flows-definitief-v1.0.md`;
   - onboarding: `docs/fase-3-gecombineerde-onboarding-ontwikkelpakket-v0.1/`;
   - functioneel ontwikkelplan: `docs/westend-conversion-engine-plannen/02-functioneel-ontwikkelplan-conversion-engine.md`;
   - technische architectuur: `docs/fase-4-technische-architectuur-definitief-v1 (2).0/fase-4-technische-architectuur-definitief-v1.0.md`.

Lees geen historische of niet-relevante documenten volledig zonder reden. De actuele opdracht en deze leidende bronnen bepalen de scope.

Begin daarna met een korte bevestiging van:

- gelezen documenten;
- huidige projectfase;
- relevante bestaande implementatie;
- expliciete scope en uitgesloten werkzaamheden;
- bestanden die je verwacht te wijzigen.

## Rollen en werkproces

- Codex is projectleider en senior reviewer.
- Claude Code is junior developer en voert kleine, concrete opdrachten uit.
- De gebruiker beslist over scope, providerkeuzes, committen en pushen.
- Een Claude-oplevering wordt altijd onafhankelijk gecontroleerd vóór commit of push.
- Iedere opdracht is een kleine verticale slice met duidelijke acceptatiecriteria.
- Na iedere slice worden relevante documentatie, tests en status gecontroleerd.

## Scope- en veiligheidsregels

- Voer uitsluitend de gevraagde wijziging uit.
- Maak, wijzig of verwijder geen extra bestanden zonder expliciete scope.
- Installeer geen dependencies, packages of CLI-tools zonder voorafgaande toestemming.
- Vraag geen wachtwoorden, API-sleutels, recoverycodes of productiedumps op.
- Gebruik geen echte klantgegevens in lokale prototypes of tests.
- Voer geen productieactie of destructieve databaseactie uit zonder expliciete opdracht.
- Commit of push nooit zelfstandig; doe dat alleen na expliciete toestemming.
- Bewaar secrets buiten Git en log nooit tokens of persoonsgegevens.

## Kwaliteitsgate

Voer na codewijzigingen de relevante typecheck, lint, tests, build en `git diff --check` uit. Rapporteer het echte resultaat, inclusief failures en beperkingen.

Bij UI-werk:

- gebruik de relevante bestaande documentatie of prototype als bron;
- controleer desktop en mobiel;
- controleer loading-, empty-, error- en successstates waar relevant;
- controleer toetsenbordbediening, focus, labels en foutmeldingen;
- maak zelf screenshots vóór je de slice als klaar meldt.

Een groene typecheck of HTTP-status bewijst niet dat de UI visueel of functioneel correct is.
