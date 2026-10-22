# Westend Digital Conversion Engine
## Fase 4 · A-04 — Datamodel, relaties en auditstructuur v0.2

**Status:** A-04 uitgangspunten goedgekeurd; dit detailontwerp is een technisch voorstel ter review  
**Datum:** 17 oktober 2026  
**Basis:** Requirements & Scope v1.0, UX/UI v1.0, architectuurbesluiten A-01 t/m A-04  
**Volgende stap:** A-05 — Events, wachtrijen en achtergrondverwerking

### 1. Vastgestelde uitgangspunten

- **Gedeelde PostgreSQL-database** voor de Conversion Engine met tenantisolatie en Row-Level Security (RLS), aanvullend op server-side autorisatie.
- **Eén Tenant kan meerdere Websites bezitten**; het Basisabonnement geeft recht op één actieve website. Toekomstige pakketten kunnen het quotum verhogen zonder aparte CRM-codebase.
- De gedeelde SaaS-database bewaart **geen publieke websitecontent**: teksten, pagina's en beelden worden via een afzonderlijke Sanity-contentlaag beheerd. Het definitieve Sanity-project-/datasetmodel volgt later.
- **Financiële registratie** is bedoeld voor commercieel inzicht (dealwaarde, contractwaarde, MRR en handmatig geregistreerde ontvangsten), niet voor facturatie of volledige boekhouding.
- **MFA is verplicht voor alle rollen**, en elke rol wordt ook server-side gecontroleerd.
- AI, analytics en Playwright mogen geldige leadregistratie nooit blokkeren.

### 2. Conceptueel relationeel model

| Domein | Entiteiten | Relaties / eigenaarschap |
|---|---|---|
| Organisatie en toegang | `tenants`, `users`, `memberships`, `subscriptions` | Eén user kan lid zijn van meerdere tenants; subscription hoort bij tenant. |
| Websites en onboarding | `websites`, `forms`, `questionnaire_responses`, `project_briefs`, `approvals`, `assets` | Tenant heeft 0..N websites. Q1–Q4 en Project Brief zijn versieerbaar; Gate A/B hebben expliciete goedkeuring. |
| Lead capture | `contacts`, `leads`, `submissions`, `consent_events` | Contact heeft 0..N leads; inzending wordt duurzaam vastgelegd vóór externe acties. |
| CRM | `deals`, `pipeline_stages`, `tasks`, `appointments`, `activities` | Contact kan 0..N deals hebben; deal kan een lead en meerdere activiteiten, taken en afspraken hebben. |
| Financieel | `deal_contracts`, `revenue_events` | Eén gewonnen deal kan een contract hebben; ontvangsten/correcties zijn afzonderlijke gebeurtenissen. |
| Communicatie en AI | `messages`, `classifications`, `automation_runs`, `provider_events` | Automatiseringen verwijzen naar lead/contact/deal; externe gebeurtenissen zijn idempotent. |
| Monitoring | `monitoring_runs`, `incidents` | Iedere run hoort bij website/formulier; testrecords blijven buiten normale funnelstatistieken. |
| Website Intelligence | `integration_connections`, `metric_snapshots`, `insight_recommendations` | Providerkoppeling per tenant/website; metriek per bron/periode met synchronisatiestatus. |
| Beveiliging en betrouwbaarheid | `audit_events`, `outbox_events`, `background_jobs` | Wijzigingen zijn traceerbaar; verwerking werkt asynchroon en veilig bij retries. |

**Geen dubbele bron van waarheid:** CRM is leidend voor contact, lead, deal en taak. Sanity is leidend voor gepubliceerde websitecontent; providers blijven leidend voor hun eigen boekings- en verzendstatussen.

### 3. Relaties en datacontracten

#### 3.1 Organisaties, gebruikers en websites

- `tenants(id PK, name, status, created_at, ...)`
- `users(id PK, auth_provider_user_id UNIQUE, ...)` bevat alleen platformidentiteit, géén klantspecifieke rollen.
- `memberships(tenant_id, user_id, role, status, ...)` heeft `UNIQUE (tenant_id, user_id)`; `role` is `owner` of `team_member`. Westend Platform Admin wordt beheerd via afzonderlijke, streng bewaakte platformrechten.
- `subscriptions(tenant_id, plan, status, website_limit, started_at, ...)` houdt **contractuele rechten/status** bij, zonder betalingskaart- of factuurverwerking.
- `websites(id PK, tenant_id, domain, status, ...)` heeft een tenantgebonden unieke sleutel `(tenant_id, id)` voor veilige samengestelde verwijzingen.
- Alleen websites met `status=active` tellen mee bij `website_limit`; activering en quota-check vinden atomair in een database-transactie plaats.

#### 3.2 Aanvraag, contact, lead en deal

- `submissions`: iedere publieke formulierinzending met een unieke `submission_id`, validatiestatus, herkomst, formulier- en websiteverwijzing, tijdstip en `is_synthetic_test` (alleen servergeverifieerd).
- `contacts`: contactpersoon binnen één tenant. Normalisatie/deduplicatie vindt **binnen die tenant** plaats; een e-mailadres is niet wereldwijd uniek.
- `leads`: afzonderlijke commerciële aanvraag/gebeurtenis; meerdere leads kunnen naar hetzelfde contact verwijzen. Eén lead verwijst naar de oorspronkelijke submission en website.
- `deals`: verkoopkansen; één contact kan meerdere deals hebben. Een deal kan optioneel terugverwijzen naar een lead, maar die relatie verandert het originele aanvraagrecord niet.
- `tasks`: eigenaar/gebruiker, deadline, status en optionele koppeling naar lead/deal/contact; Team Members mogen alleen toegewezen items zien of bewerken.
- `appointments`: pas `confirmed` bij betrouwbaar providerbewijs; het enkel tonen van een boekingslink creëert geen bevestigde afspraak.

**Rela­tiecontrole:** alle tenantgebonden foreign keys gebruiken bij voorkeur samengestelde verwijzingen zoals `(tenant_id, contact_id) → contacts(tenant_id, id)`. Dit voorkomt verwijzingen naar records van andere tenants, zelfs wanneer de applicatie een onjuiste ID doorgeeft.

#### 3.3 Website en content

- `websites` bewaart technische configuratie, `sanity_project_id`/contentreferenties waar van toepassing en de actieve siteversie.
- Contentrecords in Sanity bevatten geen dealbetalingen, contracten of persoonsgegevens uit CRM.
- Vertrouwelijke geüploade documenten worden in **private object storage** opgeslagen met tenantgecontroleerde toegang, niet als publieke Sanity-assets.
- `project_briefs` bevat versies, herkomst per veld (`client_supplied`, `verified`, `inferred`, `needs_review`) en de goedkeuring waarop websiteproductie steunt.
- `approvals` onderscheidt **Gate A Strategie & Scope** en **Gate B Publicatie**, inclusief approver, tijdstip, gereviewde versie en beslissing. Eerdere goedkeuringen worden niet onzichtbaar overschreven.

### 4. Financieel model — geen fictieve betalingen

| Gegeven | Brontabel / veld | Regels |
|---|---|---|
| Geschatte dealwaarde | `deals.estimated_value_minor` | Prospectwaarde; geen gerealiseerde omzet. |
| Gewonnen contractwaarde | `deal_contracts.total_value_minor` | Vastgelegd na won-deal en bevestiging. |
| Contractuele MRR | `deal_contracts.recurring_value_minor` + `period` | Alleen voor actieve terugkerende overeenkomsten; periode expliciet. |
| Handmatig geregistreerde ontvangst | `revenue_events` type `receipt` | Alleen ondernemer bevestigt daadwerkelijk ontvangen bedrag en datum. |
| Correctie/terugbetaling | `revenue_events` type `correction` of `refund` | Nieuwe gebeurtenis verwijst naar oorsprong; oorsprong wordt niet stil overschreven. |
| Resterende contractwaarde | Afgeleide rapportage | Contractwaarde minus netto geregistreerde ontvangsten; **geen bewijs van openstaande factuurschuld**. |

**Geld en audit:** bedragen bewaren als integer in kleinste munteenheid (bijvoorbeeld eurocenten), met expliciete `currency_code`; nooit als floating-point bedrag. Financiële events bevatten `tenant_id`, `deal_id`, `type`, `amount_minor`, `occurred_at`, `recorded_by`, `source`, `reason`, `reverses_event_id` (waar nodig) en `idempotency_key`.

**Voorbeeld.** Een gewonnen contract van €900 met zes geplande maandtermijnen van €150: na registratie van één ontvangen betaling is de contractwaarde €900, netto ontvangen €150 en resterende contractwaarde €750. Zonder betalingregistratie staat er **geen ontvangst**, niet automatisch een betalingsachterstand. Een later terugbetaalde €150 verlaagt netto ontvangsten via een nieuw event.

**Schrijfbeveiliging:** financiële correcties zijn append-only op applicatieniveau. Mutaties en verwijderingen van reeds bevestigde financiële events worden geblokkeerd voor normale gebruikers; een correctie krijgt een nieuw record. Auditlogs zijn evenmin gewone bewerkbare CRM-velden.

### 5. Tenantisolatie en toegangsbeleid

1. Een geauthenticeerde gebruiker heeft alleen toegang via actieve `membership` en een expliciet gekozen tenantcontext. `tenant_id` uit de browser wordt nooit blind vertrouwd.
2. API-controles beoordelen per operatie tenant, rol én recordtoewijzing. De instelling `show_assigned_deal_value` staat per tenant onder beheer van Business Owner.
3. PostgreSQL **RLS staat standaard aan** op klantgebonden tabellen. Gebruik uitsluitend beperkte runtime-rollen; geen superuser, table owner zonder passende maatregelen of `BYPASSRLS` voor normale requests.
4. Tenantcontext wordt **transactiegebonden** ingesteld en na iedere request opgeruimd, zodat connection pooling geen context van een vorige tenant lekt. Ontbrekende of ongeldige context betekent **deny by default**.
5. Samengestelde tenant-foreign keys voorkomen cross-tenant verwijzingen. Voor globale entiteiten (`users`) worden toegangsregels via membership toegepast.
6. Achtergrondprocessen krijgen expliciete tenant-/websitecontext en beperkte service-identiteiten. Providercredentials en objectopslag worden per tenant afgescheiden.
7. Gevoelige supporttoegang door Westend is doelgebonden, tijdgebonden waar mogelijk en wordt afzonderlijk geaudit. Platform Admin ≠ onbeperkte stille inzage.

### 6. Audit en bewaarbeleid

**Auditgebeurtenissen** registreren actor (`user`/`service`), tenant, actie, objecttype, objectreferentie, tijdstip, herkomst, correlation-ID en een minimale wijzigingssamenvatting. Gebruik `INSERT`-only autorisaties voor normale runtime en opslag/retentie die ongeautoriseerde wijzigingen verhindert; een databasebeheerder met voldoende rechten kan databasegegevens technisch altijd aanpassen. Claims van absolute onveranderbaarheid zijn daarom onjuist zonder aanvullende waarborgen.

Minimaal verplicht voor: inlog-/MFA-gerelateerde beheergebeurtenissen, rechtenwijzigingen, financiële registraties en correcties, export van persoonsgegevens, supporttoegang, AI-automatisering uitschakelen, strategie-/publicatiegoedkeuring en productieconfiguratie.

Geen volledige berichten, formulierinhoud, secrets of gevoelige persoonsgegevens in algemene auditlogs. Specifieke bewaartermijnen, verwijder- en exportprocedures worden vóór livegang afgestemd op doeleinden en wettelijke verplichtingen. Verwijderen van CRM-contacten en bewaren van vereiste auditinformatie vereisen een expliciet beleid.

### 7. Betrouwbaarheid en events (vooruitblik A-05)

Na een geldige formulierinzending worden `submissions` en een `outbox_event` in **dezelfde transactie** opgeslagen. Een worker verwerkt vervolgens classificatie en verzending. Zo ontstaat geen situatie waarin de lead wel is opgeslagen maar de vervolgstap ontraceerbaar verdwijnt.

- Een event heeft unieke `event_id`, `tenant_id`, `aggregate_type`, `aggregate_id`, `event_type`, `schema_version` en `occurred_at`.
- Consumers zijn idempotent: dezelfde event-ID of providerreferentie mag niet leiden tot dubbele AI-reacties, e-mails, taken of financiële registraties.
- Retry met limiet, foutstatus en dead-letter/reviewpad; AI-storing stopt nooit de primaire opslag.
- Playwright-testevents zijn apart gemarkeerd en mogen geen commerciële automatiseringen of rapportages beïnvloeden.

**Volgende architectuurvraag (A-05):** kiezen we voor één centraal betrouwbaar taakmechanisme met gescheiden wachtrijen/prioriteiten per workertype? Aanbeveling: **ja**; de concrete queue- en hostingtechnologie bepalen we daarna.

### 8. Open technische uitwerkingen

| Onderwerp | Wanneer | Status |
|---|---|---|
| Definitieve SQL-DDL, indexen en RLS-policies | Fase 5 / implementatievoorbereiding | Open |
| Session management / gekozen authprovider | Fase 5 | Open |
| Objectopslag en encryptiesleutelbeheer | Fase 5 | Open |
| Sanity-project- versus datasetmodel | Fase 5 | Open |
| Backupstrategie, restore-test en recoverydoelen | Fase 4/5 | Open |
| Exacte rapportageaggregaties en retentie per databron | Fase 4/5 | Open |
| Oplossing voor takenwachtrij en workerdeployment | A-05 / Fase 5 | Open |

### 9. Acceptatiecriteria A-04

| ID | Test | Geslaagd indien |
|---|---|---|
| DB-01 | Tenant A probeert via API/SQL tenant B-record te benaderen | Geen uitlezing of mutatie mogelijk onder runtime-rollen. |
| DB-02 | Deal A krijgt contact_id van tenant B | Database weigert cross-tenant foreign key. |
| DB-03 | Team Member zonder dealwaarde-recht leest bedrag direct via API | Autorisatie weigert financieel veld. |
| DB-04 | Eén contact doet drie afzonderlijke aanvragen | Eén contact, drie traceerbare leads en hun eigen bron. |
| DB-05 | Dubbele formulierinzending/provider-replay | Maximaal één logische verwerking per idempotency-key. |
| DB-06 | Won deal €900, ontvangst €150, refund €150 | Contract €900; netto ontvangst €0; correctiehistorie zichtbaar. |
| DB-07 | Een tenant activeert een tweede website in Basis | Activering geweigerd of upgrade vereist; bestaande website blijft actief. |
| DB-08 | Een worker draait zonder tenantcontext | Geen toegang tot klantgegevens; taak krijgt gecontroleerde fout. |
| DB-09 | Supportmedewerker opent klantdata | Toegang alleen na rechtmatige autorisatie en controleerbare logging. |
| DB-10 | Provideranalytics ontbreekt | UI toont onbekend/niet verbonden, niet foutief nul. |

### 10. Advies om goed te keuren

**A-04 is als architectuurprincipe al goedgekeurd.** De tabellen, relaties, financiële events en beveiligingsregels hierboven zijn de voorgestelde technische uitwerking voor de vervolgfase. Exacte SQL, indexen en providers worden niet in deze stap bevroren.
