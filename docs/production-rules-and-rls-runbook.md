# Production rules and RLS runbook

Status: bounded Gate 3.2 operations-slice. Dit document beschrijft het production-model en de verificatiestappen. Er is geen productieverbinding gemaakt en er is geen productieactie uitgevoerd.

## Doel en grenzen

PostgreSQL RLS (Row Level Security) is een tweede beveiligingsgrens naast de API-autorisatie. De database moet daarom niet alleen de juiste policies bevatten; de applicatie moet ook met een beperkte database-rol verbinden. Een rol die eigenaar is van tabellen, superuser is of `BYPASSRLS` heeft, kan RLS omzeilen.

Deze slice:

- voegt alleen een read-only verifier en dit runbook toe;
- herschrijft geen bestaande migratie;
- voert geen productieverbinding, migratie, rolwijziging of privilegewijziging uit;
- bevat geen secrets, klantdata of productie-uitvoer.

De huidige migraties `0022` tot en met `0025` zijn het controle-object van deze verifier. De verifier vergelijkt de database-journal hashes met de lokale SQL-bestanden. Daardoor worden niet-gecommitte lokale migraties ook zichtbaar als release-input; voer de verifier pas uit tegen een exact vastgelegde release.

## Productierollen

Gebruik per proces een aparte database-identiteit. De namen hieronder zijn de defaults van `db:verify:production`; ze mogen alleen via expliciete environment-variabelen worden aangepast.

| Rol | Doel | Minimale eigenschappen |
| --- | --- | --- |
| `ce_migrator` | Gecontroleerde migraties en read-only verificatie | `NOSUPERUSER`, `NOBYPASSRLS`, geen `CREATEROLE`, geen `CREATEDB`; geen applicatiesecret; alleen vanuit private deploymentomgeving |
| `ce_api_runtime` | API-runtime en tenantdata | `NOSUPERUSER`, `NOBYPASSRLS`, geen `CREATEROLE`, geen `CREATEDB`; geen eigenaar van tabellen of RLS-functies |
| `ce_bff_runtime` | Dashboard BFF-sessies | `NOSUPERUSER`, `NOBYPASSRLS`; uitsluitend de noodzakelijke `bff_sessions`-rechten; geen toegang tot tenantdata |
| `ce_maintenance` | Afzonderlijk gecontroleerd onderhoud | `NOSUPERUSER`, `NOBYPASSRLS`; niet beschikbaar via de normale API-runtime; bij voorkeur geen permanente login |
| `ce_owner` | Schema- en table-owner voor DDL en RLS-objecten | `NOLOGIN`; uitsluitend eigenaar, geen runtimeverbinding en geen applicatiecredential |

`ce_owner` is de voorkeursnaam voor de no-login schema-/table-owner, mits die naam in de uiteindelijke provider- en schema-inrichting technisch passend blijft; anders wordt een gelijkwaardige expliciet vastgelegde no-login naam gebruikt. Geen van de runtime-rollen krijgt `SET ROLE` naar deze eigenaar, directe ownership, `BYPASSRLS` of superuserrechten. `FORCE ROW LEVEL SECURITY` beschermt gewone rollen, maar is geen compensatie voor een te machtige login.

### API, BFF en maintenance strikt scheiden

- `ce_api_runtime` gebruikt de API-`DATABASE_URL` en krijgt alleen de tabellen en functies die de API nodig heeft.
- `ce_bff_runtime` gebruikt de dashboard-`SESSION_DATABASE_URL` en krijgt uitsluitend de BFF-sessietabel. De API-rol krijgt geen rechten op `bff_sessions`.
- `ce_maintenance` is geen alternatief voor een migrator. De bestaande database-scope `maintenance` is een applicatiecontext en mag niet betekenen dat de productie-API zichzelf tot onderhoudsrol kan verheffen. Dit moet vóór production go-live worden afgedwongen door rol-/principalcontrole in een forward migration of door die bypass uit de runtimecode te verwijderen.
- `ce_migrator` wordt alleen gebruikt door de gecontroleerde migratiejob en de read-only verificatie. Het migrator-secret staat niet in API- of BFF-configuratie.

Let op: `bff_sessions` is bewust niet onderdeel van de huidige RLS-tabelset. Dat maakt rolisolatie verplicht, geen optionele verbetering.

## Secrets en verbindingen

Gebruik een secret manager of private deployment-secrets. Zet geen wachtwoorden in Git, documentatie, browsercode, CI-output of logs.

- API: `DATABASE_URL` bevat alleen de API-runtimeverbinding.
- Dashboard BFF: `SESSION_DATABASE_URL` bevat alleen de BFF-runtimeverbinding.
- Migratie/verificatie: `PRODUCTION_DATABASE_URL` wordt uitsluitend tijdelijk in de migratie/verificatiejob geïnjecteerd met de migrator- of verifieridentiteit.
- De verifier vereist daarnaast `EXPECTED_PRODUCTION_DATABASE` en `--confirm-production` en weigert zonder `NODE_ENV=production`.
- Gebruik TLS met certificaatverificatie (`sslmode=verify-full` of provider-equivalent), private netwerktoegang en korte, roteerbare secrets.
- De verifier print nooit de URL, host, username uit de URL, password, foutdetails of queryresultaten die secrets kunnen bevatten.

## Lokale role-bootstrap

De database-rollen zijn clusterobjecten en worden daarom niet door een gewone Drizzle-migratie aangemaakt. Voer de bootstrap één keer uit met een lokale PostgreSQL-beheerverbinding. Gebruik hiervoor een tijdelijke shell-omgeving; zet geen wachtwoorden in Git, documentatie of logs.

```text
DATABASE_URL="<lokale-beheerverbinding-naar-conversion_engine>" \
CE_MIGRATOR_PASSWORD="<lokaal-secret>" \
CE_API_RUNTIME_PASSWORD="<ander-lokaal-secret>" \
CE_BFF_RUNTIME_PASSWORD="<bff-lokaal-secret>" \
CE_MAINTENANCE_PASSWORD="<maintenance-lokaal-secret>" \
npm --workspace api run db:bootstrap:roles:local -- --confirm-local
```

De bootstrap weigert productie, controleert exact de database `conversion_engine`, maakt de vijf rollen idempotent aan, draagt publieke ownership over aan `ce_owner` en verwijdert tijdelijke owner-membership van de uitvoerende beheerrol. Na afloop moeten `DATABASE_URL`, `MIGRATOR_DATABASE_URL`, `MAINTENANCE_DATABASE_URL` en `SESSION_DATABASE_URL` lokaal naar hun respectieve beperkte rollen wijzen. De API mag daarna niet meer met de beheerverbinding starten.

Voer dezelfde gecontroleerde bootstrap daarna opnieuw uit met `EXPECTED_LOCAL_DATABASE=conversion_engine_test` en een adminverbinding naar `conversion_engine_test`; zo krijgen de lokale database-integratietests dezelfde beperkte API/BFF-rollen. Gebruik voor beide databases dezelfde rolcredentials uit je lokale secretomgeving, maar zet ze niet in deze documentatie.

## Preflight vóór een production migration

Voer deze controles uit vanuit de private deploymentomgeving; de stappen hieronder zijn instructies, geen reeds uitgevoerde acties.

1. Leg releaseversie, commit-SHA en de exacte migratieset vast. Controleer dat `apps/api/drizzle/` en `drizzle.__drizzle_migrations` dezelfde release bedoelen.
2. Controleer backup/PITR, restorebaarheid in staging en de afgesproken RPO/RTO. Neem vóór structurele wijzigingen een herstelpunt.
3. Controleer `current_database()` en `current_user` met de migratorverbinding. Een onverwachte database of rol is direct **no-go**.
4. Controleer role flags: alle vijf genoemde rollen zijn aanwezig; `ce_migrator`, `ce_api_runtime`, `ce_bff_runtime` en `ce_maintenance` zijn `NOSUPERUSER` en `NOBYPASSRLS`, zonder `CREATEROLE`/`CREATEDB`; `ce_owner` is `NOLOGIN` en geen runtime-rol kan ernaar escaleren. API, BFF en migrator kunnen inloggen; maintenance bij voorkeur niet.
5. Controleer ownership, `SET ROLE`, schema-rechten en `PUBLIC`-rechten. Runtime-rollen mogen geen tabel- of functie-eigenaar zijn.
6. Controleer RLS `ENABLE` én `FORCE` op alle verwachte tenant-tabellen.
7. Controleer de exacte policies. De testpolicy `users_privileged_write` uit migratie `0023` mag niet in productie effectief zijn en moet vóór Gate 3.2 production green met een nieuwe forward migration/productie-cleanup worden verwijderd of anderszins buiten productie worden gehouden. Bestaande migraties worden niet herschreven.
8. Controleer `drizzle.__drizzle_migrations` op aantal en SHA-256 hashes. Een verschil betekent **no-go**; geen handmatige journal-update.
9. Controleer dat er maar één migratiejob tegelijk kan draaien en dat de API-release compatibel is met de nieuwe schema-/RLS-staat.
10. Voer de bestaande default-deny-, cross-tenant-, pool-context- en BFF-isolatietests uit tegen een disposable/staging database. Gebruik nooit echte klantdata als testdata.

## Migratievolgorde

De gecontroleerde volgorde is de bestaande Drizzle-volgorde:

`0019 → 0020 → 0021 → 0022 → 0023 → 0024 → 0025`

De migratorjob draait de release met `drizzle-kit migrate` vanaf de vastgelegde artifactversie. Gebruik in production niet `db:generate`, geen interactieve SQL en geen handmatige inserts in het migration journal. De API en BFF worden pas vrijgegeven nadat de migratie en de verifier groen zijn.

De huidige `0023` is test-only bedoeld via `ce_rls_test_bypass()`, die alleen bij database `conversion_engine_test` en de testsetting actief hoort te zijn. Omdat bestaande migraties niet worden herschreven, is de veilige route een aparte forward migration die de ongewenste production policy opruimt, gevolgd door een nieuwe verifierverwachting. Tot die tijd is de policy-aanwezigheid een production hardening-risico en geen stilzwijgend groen signaal.

## Read-only verificatie

De nieuwe script-entrypoint is:

```text
NODE_ENV=production \
PRODUCTION_DATABASE_URL="<tijdelijk-secret>" \
EXPECTED_PRODUCTION_DATABASE="<exacte-productiedatabase>" \
npm --workspace api run db:verify:production -- --confirm-production
```

De job maakt een verbinding met `default_transaction_read_only=on`, start een `READ ONLY`-transactie en controleert:

- current database, current user en session user;
- role flags voor migrator, API, BFF en maintenance;
- `ENABLE` en `FORCE ROW LEVEL SECURITY` op alle verwachte tabellen;
- de exacte verwachte policyset;
- aanwezigheid, volgorde, hash en timestamp van het Drizzle-migration journal.

De exitstatus is fail-closed: `0` is geslaagd, `1` is een database-/controlefout en `2` is een ontbrekende of onveilige invocation. Geen enkele verifierstap schrijft naar de database.

De verifier is geen vervanging voor gedragscontroles. De release-gate moet daarnaast staging-tests aantonen voor default deny, tenant A/B-isolatie, reviewer/customer-scope, pool-context per transactie, BFF-sessie-isolatie en veilige `SECURITY DEFINER`-functies met vaste `search_path` en beperkte `EXECUTE`-rechten.

## Rollback en incidentprocedure

### Mislukte migratie vóór commit

1. Stop de migratiejob; start geen tweede job.
2. Controleer de migrator-output en het journal vanuit een read-only verbinding.
3. Laat de transactie afhandelen zoals Drizzle dat doet; voer geen handmatige journal-update uit.
4. Herstel de oorzaak in een nieuwe forward migration of herstel vanuit backup/PITR na beoordeling.

### Migratie succesvol, applicatie niet compatibel

1. Zet de inkomende release stil en behoud logs zonder secrets.
2. Gebruik eerst een compatibele applicatierelease als het schema backward-compatible is.
3. Downgrade geen schema blind en verwijder geen migration-journalregels.
4. Voor destructieve of niet-backward-compatible wijzigingen is PITR/backup-herstel de rollbackstrategie, met expliciete besluitvorming en data-impactcontrole.
5. Zet RLS-migraties niet terug naar een API-release die geen databasecontext kan zetten; dat zou de beveiligingsgrens omzeilen.

### Beveiligingsincident

Isoleer de betrokken runtime-rol, roteer het secret, bewaar audit/loggegevens en blokkeer verdere deploys. Onderzoek specifiek ownership, `BYPASSRLS`, `SET ROLE`, `maintenance`-toegang, `SECURITY DEFINER`-eigenaren en privileges op `bff_sessions`. Herstel pas na een nieuwe read-only verifier en staging-test.

## Go/no-go

### GO wanneer alle volgende punten waar zijn

- backup/PITR en restoretest zijn bevestigd;
- release en journal hashes zijn exact gelijk;
- huidige database en migratoridentiteit zijn exact verwacht;
- geen rol kan via superuser, owner, `BYPASSRLS` of `SET ROLE` RLS omzeilen;
- API-, BFF-, migrator-, maintenance- en owner-rollen zijn gescheiden;
- RLS staat enabled én forced op alle verwachte tabellen;
- policyset is exact en de test-only policy is niet production-effectief;
- staging-tests voor isolatie, default deny en BFF-scheiding zijn groen;
- één migratiejob en een compatibele API/BFF-release zijn gepland;
- read-only verifier eindigt met exitstatus `0`.

### NO-GO bij één van deze signalen

- onbekende database, gebruiker, rolflag, owner of privilege;
- ontbrekende/extra policy, ontbrekende `FORCE RLS` of hashverschil;
- onduidelijke migration-status of een niet-herleidbare release;
- geen herstelpunt of geen getest herstelpad;
- directe runtime-toegang tot migrator/maintenance/BFF-secrets;
- actieve production test-bypass policy;
- verifier kan niet veilig verbinden of geeft een niet-nul exitstatus.

## Acceptatiecriteria voor Gate 3.2

1. `apps/api/src/dev/verifyProductionDatabase.ts` bestaat, is read-only en fail-closed.
2. `npm --workspace api run db:verify:production -- --confirm-production` is beschikbaar.
3. De verifier vereist expliciete production-preflight en logt geen secrets.
4. De verifier controleert database/user, role flags, RLS `ENABLE/FORCE`, policyset en migration journal hashes.
5. Het runbook beschrijft rolisolatie, secrets, preflight, migratievolgorde, rollback en go/no-go.
6. Er is geen productieverbinding gemaakt, geen productieactie uitgevoerd en geen bestaande migratie herschreven.
