# Westend Digital Conversion Engine
## Fase 4 — A-08 Hosting, Docker & Deployment — Architectuurvoorstel v0.1
**Datum:** 18 oktober 2026  
**Status:** Ter goedkeuring — nog geen architectuurbesluit  
**Afhankelijkheden:** A-01 t/m A-07 goedgekeurd.

### 1. Managementadvies
**Aanbevolen architectuur: hybride.** Publiceer standaard Astro-klantwebsites als onafhankelijke statische builds op een CDN. Host de centrale Conversion Engine API en de lichte achtergrondprocessen in gescheiden containers op een eigen, geharde VPS **of** een beheerde apphost; voor de eerste fase is een eigen VPS acceptabel indien patchbeheer, beveiliging, monitoring en operationele beschikbaarheid expliciet worden geborgd. Plaats productie-PostgreSQL in een apart beheerd cluster/project, buiten de publieke websitehosting. Gebruik private object storage voor vertrouwelijke documenten. Draai zware AI-websitebuilds en Playwright-tests als geïsoleerde, tijdgebonden jobs buiten het kritieke API-proces, bij voorkeur buiten dezelfde host. Sanity blijft de afzonderlijke contentlaag.

**Besluitpunt A-08:** akkoord op de logische verdeling én het hybride voorkeursmodel; de keuze van concrete providers/servers en de haalbare RPO/RTO volgen na een operationele kosten- en securitytoets.

### 2. Logische systeemtopologie
- **Publieke website (per klant):** zelfstandig deploymentproject met eigen domein/TLS, statische Astro-build waar mogelijk, alleen publieke assets en niet-vertrouwelijke configuratie. Afzonderlijke website-origin en CSP waar passend.
- **Centrale API:** geauthenticeerde dashboards en publieke ingest-endpoints met afzonderlijke beveiligingsprofielen; per request tenant-/recordautorisatie en RLS. AI-modellen mogen geen rechtstreekse externe acties uitvoeren.
- **Lichte workers:** lead & automation met gereserveerde capaciteit en prioriteit; analytics & scheduler. Eén codebase is toegestaan, gescheiden processen/containers en begrensde resources.
- **Zware workers:** Playwright in geïsoleerde containers/jobs met CPU/memory/timeout-limieten; websiteproductie in aparte sandbox zonder productiecredentials of Docker-hostsocket. Alle uploads en gegenereerde code behandelen als onvertrouwd.
- **Database:** beheerde PostgreSQL met strikte netwerktoegang, RLS, versleuteling, onafhankelijke databasebackups en controleerbare herstelprocedure. Staging gebruikt een eigen database, zonder ruwe productiekopie.
- **Objectopslag:** private buckets voor klantdocumenten, beperkte gesigneerde downloadlinks, malwarecontrole voor uploads en bewaartermijnen. Sanity-assets zijn geen private documentenopslag.
- **Sanity:** gedeelde Studio-/schema-codebase; keuze dataset/projectisolatie per klant volgt afzonderlijke rechten- en kostenreview.
- **Randdiensten:** domein/DNS/TLS/WAF, e-mail-router en Resend, veilige integratiecredentials, monitoring en foutregistratie.

### 3. Vergelijking van hostingmodellen
| Model | Voordelen | Nadelen | Voorstel |
|---|---|---|---|
| Alles op één VPS | Laagste vaste infra-factuur; directe controle | Single point of failure, kwetsbaar voor gelijktijdige builds, eigen DBA/ops, herstelcomplexiteit | Niet voor productie met financiële gegevens |
| Alles managed | Minder OS-/DB-beheer, eenvoudiger afzonderlijk opschalen | Gebruikskosten, providerafhankelijkheid en meerdere configuraties | Geschikt, maar niet noodzakelijk voor MVP |
| Hybride | Risicovolle data gescheiden; CDN-sites efficiënt; controle op app-ops | Extra integraties en netwerkconfiguratie | Voorkeur |

### 4. Docker en isolatie
- **Geen container per statische website nodig.** Een CDN-deployment is doorgaans eenvoudiger en voorkomt onnodige processen. Alleen als SSR/servercode nodig is, krijgt die website een afzonderlijke runtime of deployment.
- **Wel afzonderlijke containers/processen per centrale rol:** reverse proxy, API, leadworker, overige lichte workers. De browser-/buildworkers draaien bij voorkeur niet op de API-host.
- **Docker Compose is voldoende voor een single-host pilot** met releasebeheer; het is geen automatische high-availability-oplossing en geen vervanging voor backups of een tweede host.
- Containers draaien als non-root, met minimale Linux-capabilities, read-only rootbestandssysteem waar uitvoerbaar, gescheiden netwerken, resourcegrenzen en expliciet toegekende secrets. Nooit Docker-socket mounten in een AI-/buildcontainer; geen privileged containers.
- Containerimages bouwen in CI, dependencies en imagekwetsbaarheden controleren, images taggen op commit/digest en terugrollen op gecontroleerde release. Secrets niet in Git, image layers of front-endbundels.

### 5. Omgevingen, deployment en goedkeuringen
1. **Development:** lokale mock-/testgegevens, geen live productiecredentials.
2. **Staging:** aparte API, databaseproject, opslag, secrets, e-mailtestbestemming en Sanity-dataset/project; geschoonde of synthetische gegevens.
3. **Productie:** uitsluitend gecontroleerde builds; minimale toegang via MFA, kortlevende deploycredentials en auditspoor.
4. **CI:** lint/typecheck/test, dependency- en secretscans, tenant/RLS-tests, API-contracttests, prompt-injection-regressie, build en imagechecks.
5. **Gate A:** menselijke goedkeuring van strategie/scope vóór productie; **Gate B:** klantinhoud en Westend-QA vóór publicatie. Staging verandert nooit zelfstandig in productie.
6. **Deploy:** gecontroleerde database-migrations (backward compatible indien mogelijk), smoke tests, healthchecks en terugrolprocedure. Rollback van code herstelt niet automatisch een destructieve migration.
7. **Website-updates:** per klant onafhankelijk publiceren, desgewenst in batches via gedeelde componentlibrary, met behoud van eerdere websiteversie voor rollback.

### 6. Veiligheid en beschikbaarheid
- **Netwerkgrenzen:** alleen 443 publiek waar nodig; beheer en database uitsluitend via private verbindingen/allowlists, geen publieke PostgreSQL-poort. Gebruik beveiligde DNS/TLS en WAF/rate limits voor publieke formulieren.
- **Secrets:** aparte productiesleutels per dienst/omgeving; veilige secretinjectie, rotatie, logredactie, egressbeperking waar beschikbaar.
- **Backups:** onafhankelijke versleutelde databasebackups; korte herstelpunten via PITR/WAL of equivalente bewezen methode voor CRM/financiële gegevens, plus offsite-retentie. VPS-snapshots alleen voor hostherstel, niet als vervanging van databaseconsistentie of afzonderlijke dataretentie.
- **Voorlopige RPO/RTO-doelen:** streefwaarde RPO maximaal 1 uur voor CRM/leads/betalingsregistraties, RTO maximaal 4 uur voor centrale SaaS-dienst. Deze zijn **ontwerpdoelen, geen beloofde SLA**; providerkeuze en kosten moeten aantonen of ze haalbaar zijn. Definitieve doelen vóór livegang beslissen.
- **Monitoring:** externe uptimechecks, API latency/error rate, queue-lag, mislukte leadopslaan/verzenden, cron-stilstand, disk/memory, cert-expiry, backup-succes en maandelijkse restore-oefening in pilot.
- **Incidenten:** alarmen naar Westend, runbook voor providerstoring, queue-achterstand en verloren credentials; log geen volledige gevoelige payloads of AI-prompts zonder noodzaak.
- **AVG/GDPR:** contracten, verwerkers, subverwerkers, regio's en doorgiften aan providers vooraf toetsen. Nederlandse of EU-serverlocatie op zichzelf is niet voldoende om naleving te garanderen.

### 7. Capaciteit, kosten en providerafweging
**Providerindicaties, geraadpleegd 18-10-2026; geen totaalofferte:**
- Hostinger NL VPS KVM 2: vanaf €7,99/mnd promotie; vermelde verlengprijs €14,99/mnd bij de toepasselijke tweejarige voorwaarden; dit betreft 2 vCPU/8 GB RAM zonder operationeel beheer. Bron: https://www.hostinger.com/nl/vps
- Netlify Pro: vanaf $20/mnd op huidig creditmodel, met 3.000 credits. Bandbreedte 20 credits/GB en productiedeploy 15 credits; verbruik groeit dus met totaal aantal sites, builds en verkeer. Bronnen: https://www.netlify.com/pricing/ en https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/
- Cloudflare Pages heeft o.a. een limiet van 500 builds/maand op Free; controleer klantvolume, domeinlimieten en optionele SSR/runtime afzonderlijk. Bron: https://developers.cloudflare.com/pages/platform/limits/
- Supabase hosted PostgreSQL Pro: geadverteerd vanaf $25/mnd met dagelijkse backups; PITR als extra optie. 7-daagse PITR wordt op de geraadpleegde tariefpagina rond $100/mnd extra vermeld. Een beheerde database is dus niet automatisch goedkoop als we RPO ≤ 1 uur eisen. Bronnen: https://supabase.com/solutions/hosted-postgres en https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery
**Werkelijke TCO omvat** VPS/apphosting, managed DB/backups/PITR, CDN/bandbreedte/builds, private opslag, observability, e-mail, extra isolated build runners, DNS/WAF, support en incidenturen. Geen vaste maandbegroting zonder aantal websites, bezoekers, builds en SLA.

### 8. Uitrolfasering
- **Pilot (1–5 bedrijven):** CDN-hosted statische sites, één geharde app-VPS of managed app, afzonderlijke PostgreSQL, lichte workers met resourceisolatie, aparte sandbox-executie voor untrusted builds; dagelijkse operationele controles.
- **Groei (5–50):** websiteprovisioning, automatische certificaten, centraal log- en kostenoverzicht, aparte workerhost/runnerpool indien belasting dit vereist, route naar redundantie.
- **Schaal (50+):** capaciteit en feitelijke belastingsmetingen bepalen splitsing, HA van API/DB, dedicated workers en regionale failover indien commercieel vereist; geen Kubernetes vooraf nodig.

### 9. Acceptatiecriteria
- A08-01: Elke klantwebsite kan onafhankelijk worden gedeployd en teruggerold zonder wijziging aan andere websites.
- A08-02: Publieke websitebundels en browserrequests bevatten geen database-, Resend-, Sanity-schrijf- of AI-credentials.
- A08-03: Test-, staging- en productiegegevens en credentials zijn van elkaar gescheiden.
- A08-04: PostgreSQL is niet direct vanaf het publieke internet bereikbaar; diensttoegang is minimaal en gecontroleerd.
- A08-05: Container voor AI-build of Playwright heeft geen Docker-socket, host-root of productiecredentials.
- A08-06: Falen/hoge belasting van websiteproductie of Playwright laat nieuwe leads nog steeds veilig registreren.
- A08-07: CI blokkeert release bij falende tenantisolatie-/securitytests; Gate B is handmatig afdwingbaar.
- A08-08: Een volledig herstel van database en bestanden is aantoonbaar getest binnen overeengekomen RTO/RPO.
- A08-09: Uptime, queue-lag, backups, formulierstoringen en API-fouten leveren relevante alerts op.
- A08-10: De TCO voor 5, 25 en 100 sites is berekend met expliciete traffic-, build- en herstelaannames voordat providers vaststaan.

### 10. Te bevestigen besluit
**A-08 voorgesteld:** hybride topologie, CDN voor zoveel mogelijk statische klantwebsites; centrale API plus lichte workers op eigen geharde VPS of beheerde apphost; productie-PostgreSQL apart beheerd; untrusted websitebuilds en Playwright geïsoleerd, buiten de kritieke API-runtime; veilige private objectopslag; CI/CD met menselijke publicatie-gates; onafhankelijk backup- en herstelontwerp. De concrete provider en definitieve RPO/RTO/TCO worden in de technische providerselectie vastgelegd.

### 11. Bronnen (officiële documentatie)
- Hostinger VPS prijzen: https://www.hostinger.com/nl/vps
- Hostinger VPS backups: https://www.hostinger.com/support/1583232-how-to-back-up-or-restore-a-vps-at-hostinger/
- Netlify prijzen: https://www.netlify.com/pricing/
- Netlify creditmodel: https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/
- Cloudflare Pages limieten: https://developers.cloudflare.com/pages/platform/limits/
- Docker Compose productie: https://docs.docker.com/compose/how-tos/production/
- Docker Compose secrets: https://docs.docker.com/compose/how-tos/use-secrets/
- Docker rootless: https://docs.docker.com/engine/security/rootless/
- Supabase hosted PostgreSQL: https://supabase.com/solutions/hosted-postgres
- Supabase PITR tarieven: https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery
