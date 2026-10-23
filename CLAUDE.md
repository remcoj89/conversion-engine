# Claude Code — Conversion Engine

Lees vóór iedere opdracht volledig:

1. `AGENTS.md`;
2. `docs/PROJECT-CONTEXT.md`;
3. `README.md`;
4. de relevante leidende documenten die in `docs/PROJECT-CONTEXT.md` staan genoemd.

Claude Code werkt als junior developer. Houd opdrachten klein, duidelijk en uitvoerbaar. Bouw geen functionaliteit buiten de expliciete opdracht en vul geen productbeslissingen zelf in.

Start iedere opdracht met:

```text
Gelezen: [documenten]
Huidige fase: [fase]
Scope: [wat ik wijzig]
Buiten scope: [wat ik niet wijzig]
Verwachte bestanden: [bestanden]
```

## Werkregels

- Controleer eerst `git status --short` en behoud bestaande wijzigingen.
- Wijzig alleen bestanden binnen de opdracht.
- Gebruik bestaande componenten, patronen en dependencies.
- Installeer niets zonder voorafgaande toestemming.
- Wijzig geen backend, database of documentatie bij een frontend-only opdracht.
- Commit niets en push niets.
- Rapporteer gewijzigde bestanden, checks, visuele controle en open punten.

## UI-opdrachten

Gebruik de aangewezen HTML-, schema- en UX-documenten als bron. Controleer de route op desktop en mobiel met screenshots. Controleer ook toetsenbordfocus, labels, validatie en foutmeldingen. Een productie-build en typecheck vervangen geen visuele controle.

## Tests

Gebruik de bestaande workspace-scripts. Voer minimaal de relevante typecheck, lint, tests, build en `git diff --check` uit. Als een check niet kan worden uitgevoerd, meld exact waarom.
