# Westend Digital Conversion Engine — A-09B Supabase Kosten & Herstelvergelijking

**Versie:** v0.1 — besluitvoorbereiding  
**Datum:** 18 oktober 2026  
**Valuta:** USD/maand exclusief belastingen; afgeronde indicaties voor circa 730 uren/maand  
**Scope:** één gedeeld Supabase-productieproject voor alle tenants; geen Supabase-project per klant. De capaciteitskeuzes per scenario zijn hypothesen en geen benchmarks.

## Executive summary

- Supabase Pro begint op **$25/maand** met Micro-compute en **dagelijkse** databasebackups met zeven dagen bewaartermijn. Dit is **niet genoeg** om het voorlopige Westend-doel **RPO ≤ 1 uur** aannemelijk te maken.
- Supabase Pro + **7 dagen PITR** vereist ten minste Small-compute; officiële minimale combinatie is **$130/maand** (`$25 + $15 + $100 - $10`); backups gaan dan via PITR in plaats van de dagelijkse backupcyclus. Zie bronnen [1–3].
- **RTO ≤ 4 uur is niet gegarandeerd**; de database is bij herstel tijdelijk niet beschikbaar. Herstelduur hangt af van databaseomvang, herconfiguratie en applicatieverificatie. Bewijs via hersteloefening.
- Een databasebackup herstelt **geen Supabase Storage-bestanden**. Er zijn aparte offsite objectkopieën, bewaartermijnen en hersteltests nodig.
- DigitalOcean Managed PostgreSQL bevat **7 dagen PITR** in de databasekosten vanaf ca. **$15/mnd** (1 GiB), of **ca. $30/mnd** (2 GiB). Dit is **geen functioneel equivalent** van Supabase, want Auth, private Storage en de bijbehorende operatiekosten ontbreken. Zie [9–11].

## 1. Tarieven Supabase — officiële leveranciersinformatie

| Kostenpost | Tarief / maand | Uitleg |
|---|---:|---|
| Pro-abonnement | $25 | Projectorganisatie; eerste project met Micro via computecredit inbegrepen |
| Micro compute | $10 | Gedekt door $10 computecredit bij precies één Micro-project |
| Small compute | $15 | Minimale compute bij PITR |
| Medium compute | $60 | Scenario-schaal voor 25 tenants, te testen |
| Large compute | $110 | Scenario-schaal voor 100 tenants, te testen |
| Maandelijkse computecredit | −$10 | Eén credit per betaalde organisatie, niet per project |
| PITR 7 dagen | $100 | Volledige productieprojectfacturering |
| PITR 14 dagen | $200 | Verdubbeling herstelvenster |
| PITR 28 dagen | $400 | Langer herstelvenster |
| Databasegebruik | eerste 8 GB inbegrepen | Daarboven $0,125/GB/maand |
| Bestandsopslag | eerste 100 GB inbegrepen | Daarboven circa $0,0213/GB/maand |
| Egress | eerste 250 GB inbegrepen | Daarna $0,09/GB; caching apart gemeten |
| Auth MAU | eerste 100.000 inbegrepen | Daarna $0,00325 per actieve gebruiker/maand |
| App Authenticator (TOTP) MFA | $0 | Volgens Supabase standaard API; backend vereist `aal2` |

**Niet inbegrepen:** eigen API-VPS, klantwebsites/CDN, Sanity, AI-inferentie en verwerking, DataForSEO, Resend, monitoring, SMTP, apart stagingproject, objectbackup, incidentwerk, belasting en teamuren. Supabase heeft bij productie een eigen SMTP-provider nodig [7].

## 2. Rekenmodel: 5, 25, 100 klanten

**Gelijke verbruiksaanname per klant:** 0,3 GB PostgreSQL, 1 GB private bestanden, 5 GB maandelijks Supabase-egress, 4 dashboardaccounts. Let op: website-CDN-verkeer is apart en valt niet automatisch onder deze egress. 7 dagen PITR. Voor 5, 25 en 100 klanten zijn Small, Medium en Large gekozen als *capaciteitshypothesen*, die via loadtests nog moeten worden bewezen.

| Kenmerk | 5 klanten | 25 klanten | 100 klanten |
|---|---:|---:|---:|
| PostgreSQL compute | Small $15 | Medium $60 | Large $110 |
| Gegevens in database | 1,5 GB | 7,5 GB | 30 GB |
| Private opslag | 5 GB | 25 GB | 100 GB |
| Supabase-egress | 25 GB | 125 GB | 500 GB |
| Pro + compute + PITR − credit | $130,00 | $175,00 | $225,00 |
| Database-oververbruik | $0,00 | $0,00 | $2,75 |
| Storage-oververbruik | $0,00 | $0,00 | $0,00 |
| Egress-oververbruik | $0,00 | $0,00 | $22,50 |
| **Supabase totaal/mnd** | **$130.00** | **$175.00** | **$250.25** |
| **Supabase per klant/mnd** | **$26.00** | **$7.00** | **$2.50** |

*Bij 100 klanten kost egress in dit scenario 250 GB boven de inbegrepen grens × $0,09 = $22,50. De grote onzekerheid is compute-behoefte: aantallen klanten op zichzelf bepalen de databasebelasting niet.*

**Optionele operationele budgettering:** Voor één staging-Micro-project (+ ca. $10/mnd), één API-VPS (rekenpost $30/mnd, niet geoffreerd), Resend Pro ($20/mnd bij passend volume) en een aparte objectkopie (Cloudflare R2 Standard $0,015/GB-maand, 10 GB gratis; zonder operationele uren) wordt het indicatieve aanvullende bedrag $60.00, $60.60 en $62.85 USD/maand. Dit is **geen volledige platform-TCO**: AI- en analytics-API's, veel e-mails, GitHub, domeinen, Sanity, monitoring-infra, backupsoftware en personeelsuren ontbreken. Voor Resend geldt bovendien dat inkomende e-mails meetellen met de verzendquota [13].

## 3. Herstelvergelijking

| Optie | Dataverlies (RPO) | Herstelduur (RTO) | Dekking | Totale db-/platformbasis |
|---|---|---|---|---|
| Supabase Pro zonder PITR | Bij dagelijkse backups potentieel tot 24 uur | Onbekend; downtime bij restore | DB; geen objecten | vanaf $25/mnd |
| Supabase Pro + PITR 7d | Secundengranulariteit herstelpunten; feitelijke RPO testen | Onbekend; downtime bij restore | DB + Auth DB; geen objecten | vanaf $130/mnd |
| Supabase Pro + PITR 14d | Zelfde granulariteit, langer herstelvenster | Idem | Idem | vanaf $230/mnd (Small) |
| DigitalOcean Managed PG | 7 dagen PITR, WAL; feitelijke RPO testen | Onbekend; nieuwe cluster bij handmatige herstelactie | PostgreSQL alleen | vanaf ca. $15–30/mnd |
| Eigen VPS + PostgreSQL/WAL | Afhankelijk van eigen offsite WAL-backupinterval | Volledig eigen verantwoordelijkheid | Alleen wat apart is geback-upt | Server + opslag + monitoring + tijd |

**PITR is geen high-availability-oplossing.** Een uitval kan nog steeds downtime geven; een regionale storing, verkeerde configuratie, gecompromitteerde admin, bewuste dataverwijdering en storageverlies vereisen aanvullende maatregelen. Herstel naar nieuw Supabase-project kopieert niet automatisch Storage-bestanden, Edge Functions, Auth-instellingen of API-sleutels. Bovendien kunnen database-extensies en ingeplande jobs in een herstelde kopie opnieuw starten; voorkom dubbele automatische e-mails [4].

## 4. Herstelscenario's (productieregels)

1. **Per ongeluk verwijderde lead/deal:** herstel PITR eerst in een afzonderlijke gecontroleerde herstelomgeving, blokkeer automatische achtergrondjobs, vergelijk records en migreer uitsluitend de noodzakelijke gegevens terug. Niet de hele live-database terugrollen als andere tenants intussen leads binnenkrijgen.
2. **Corruptie/ransomware of projectcompromis:** productie blokkeren; auditsporen veiligstellen; schone nieuwe omgeving opbouwen uit onafhankelijk gevalideerde backups; credentials rouleren; uploads separaat herstellen.
3. **Supabase-project volledig verwijderd:** de standaard Supabase-backups zijn óók verwijderd. Zonder onafhankelijke externe kopie kan herstel onmogelijk zijn [3].
4. **Files verdwijnen:** PITR van PostgreSQL herstelt hoogstens opslagmetadata, niet de daadwerkelijke bestanden. Aparte versie-/backupprocedure nodig.
5. **Provider-/regiostoring:** herstel op andere omgeving is niet automatisch geregeld. Een tweede regio en herdeploy-instructie moeten apart worden getest.
6. **Slechte migratie:** vooraf schema-migration dry run + offsite snapshot; na deploy smoke tests, rollbackprocedure voor schema versus code. Nooit automatisch productie terugspringen zonder impactanalyse.

## 5. Alternatieven: werkelijke vergelijkbaarheid

| Model | Indicatieve databasekosten/mnd | 7d PITR | Auth/MFA | Private objectopslag | Operationeel gevolg |
|---|---:|---|---|---|---|
| Supabase Small + PITR | $130 | Betaalde add-on | Inclusief TOTP; verplicht `aal2` | 100 GB inbegrepen; apart objectbackup | Eén leverancier, eenvoudiger geïntegreerd |
| DigitalOcean Managed PG 2 GiB | circa $30 | Inbegrepen | Externe provider nodig | Apart | Lagere DB-prijs, maar meerdere integraties, operationeel samenstellen |
| Eigen PostgreSQL VPS | VPS-prijs + opslag | Zelf implementeren | Externe provider nodig | Apart | Lage factuur, hoogste beheer-/incidentlast |

**Conclusie:** DigitalOcean kan substantieel voordeliger zijn voor **alleen PostgreSQL met PITR**, maar is niet één-op-één goedkoper voor de **volledige** database + Auth + Storage combinatie. Een exacte all-invergelijking vereist eerst keuze van een externe authprovider, private storage en beheeruren.

## 6. Advies en go/no-go

**Aanbevolen pilot:** Supabase Pro, één productieproject, **7d PITR, minimaal Small compute**, EU-specifieke regio `eu-central-1`, TOTP-MFA voor iedere gebruikersrol met backend- en RLS-afgedwongen `aal2`, eigen SMTP (Resend-kandidaat), onafhankelijk offsite database-/storagebackup met versleutelde credentials en regelmatige hersteltests. De eerstvolgende stap is een hersteltest en capaciteitstest van het kleinste acceptabele tier.

De definitieve productiekeuze is **voorwaardelijk** aan:
- PITR-hersteloefening van 1 verloren tenantrecord zonder actuele data van andere klanten te verliezen.
- Volledige hersteltest naar nieuwe omgeving met Auth, Storage, functies, rolrechten, servicecredentials en e-mail-suppressie.
- Gemeten RPO ≤ 1 uur en RTO ≤ 4 uur voor representatieve incidenten en datavolumes; geen SLA beloven voordat dit bewezen is.
- Onafhankelijk export-/backupmechanisme, vooral tegen verwijdering van heel Supabase-project.
- Controle of Small/Medium/Large compute voldoende is bij 5/25/100 klanten; database-connection-pooling, indexatie, pgboss jobs, analytics ETL.
- DPA, regio, subprocessors, toegangscontrole, logging en backupretentie voor persoonsgegevens.

## Bronnen (geraadpleegd 18 oktober 2026)

[1] Supabase tarieven — https://supabase.com/pricing  
[2] PITR tarieven en officieel $130-voorbeeld — https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery  
[3] Backups, PITR en storage-uitzondering — https://supabase.com/docs/guides/platform/backups  
[4] Restore to new project en niet-gekopieerde services — https://supabase.com/docs/guides/platform/clone-project  
[5] Verbruiksquota — https://supabase.com/docs/guides/platform/billing-on-supabase  
[6] Supabase TOTP MFA — https://supabase.com/docs/guides/auth/auth-mfa/totp  
[7] Productie SMTP — https://supabase.com/docs/guides/auth/auth-smtp  
[8] Regio's — https://supabase.com/docs/guides/platform/regions  
[9] DigitalOcean Managed Postgres-prijzen — https://docs.digitalocean.com/products/databases/postgresql/details/pricing/  
[10] DigitalOcean 7-day PITR — https://docs.digitalocean.com/products/databases/postgresql/details/features/  
[11] DigitalOcean herstel naar nieuw cluster — https://docs.digitalocean.com/products/databases/postgresql/how-to/restore-from-backups/  
[12] Cloudflare R2 tarieven — https://developers.cloudflare.com/r2/pricing/  
[13] Resend tarieven — https://resend.com/pricing  
[14] Supabase cost-control uitzonderingen — https://supabase.com/docs/guides/platform/cost-control  
