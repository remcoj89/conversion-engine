# Westend Digital Conversion Engine — Fase 4
## A-07 · Integraties & API-beveiliging — architectuurvoorstel v0.1
**Status:** Ter goedkeuring · **Datum:** 18 oktober 2026 · **Scope:** Integratiegrenzen, credentials, webhooks, externe API's en responsdetectie

### 1. Besliskader
A-01 t/m A-06 zijn goedgekeurd: modulaire centrale applicatie, logisch gescheiden workers, PostgreSQL met tenantisolatie en RLS, verplichte MFA voor alle rollen, atomair event/outbox-model en een deterministische workflow-engine. Prompt-injectiepreventie is een releasevoorwaarde. Dit document is een *voorstel*, geen reeds goedgekeurd besluit. De definitieve Sanity-projectindeling, e-mailprovider en authenticatieprovider blijven open.

**Voorgesteld kernprincipe:** alle externe communicatie verloopt via een gecontroleerde integratielaag; modeloutput, browserinput en webhooks zijn geen autoriteit. Alleen de backend kan na tenant-, rol-, bron- en actievalidatie een actie uitvoeren. Tokens zijn nooit beschikbaar voor publieke websites of LLM-context.

### 2. Integratiematrix
| Kanaal | Toegang vanuit Conversion Engine | Beveiliging / beperking |
|---|---|---|
| Publieke formulieren | Alleen inzenden (geen lezen) | Publiek formulier-ID, server-side websitebinding, botbescherming, limieten, validatie; geen klant-ID uit browser vertrouwen |
| Website backend (optioneel) | Beperkte machine-to-machine POST | Per website sleutel, HMAC met tijdstempel, nonce en payload-hash, korte geldigheidsduur, rotatie |
| Sanity | Publicatie/contentbeheer volgens Gate B | Projectgebonden robot token; read/write scheiden; geen CRM-data of vertrouwelijke bestanden |
| E-mailprovider | Alleen gecontroleerd verzenden en statuswebhooks | Afzender vastgelegd; ontvanger uit gevalideerde lead; lokale verzendregistratie; provider-idempotency waar beschikbaar |
| GA4 | Read-only rapportages per property | OAuth of expliciet toegelaten serviceaccount met minimale propertyrechten |
| Google Search Console | Read-only op geverifieerde site | OAuth `webmasters.readonly`; encrypt refresh tokens, reconnect en intrekken |
| Microsoft Clarity | Metrics per project | Project-token; beperkte sync; opnames alleen via deep links en bestaande Clarity-rechten |
| DataForSEO | Beperkte onderzoeksqueries via Westend | Centraal secret, adapter-only toegang, tenant/website-begroting, cache en request-accounting |
| Externe webhooks / n8n | Alleen expliciet toegestane events en acties | Provider-specifieke signatures, deduplicatie, scopes, replaypreventie en audit |

### 3. Veilige inkomende formulierstroom
1. De website stuurt de aanvraag naar een vaste, versiebeheerbare form-API. Publieke formulier-ID's zijn identifiers, geen geheime sleutel.
2. Een publieke request wordt nooit vertrouwd op basis van Origin/CORS, een referrer of een door de browser aangeleverde tenant-ID. Alle website-, form- en tenantrelaties worden server-side uit geregistreerde configuratie opgehaald. CORS is geen authenticatie.
3. Bij websites met een serverbackend kan een per-website server-to-server authenticatie worden gebruikt. Voor statische/browserformulieren bestaat een publiek endpoint met anti-spam, requestvalidatie, rate limiting, honeypot en optionele challenge; een browsersecret is onmogelijk geheim te houden.
4. De backend controleert formversie, verplichte velden, payloadgrootte, bestandstypen en klantcontext, schrijft lead + outbox-event atomair naar PostgreSQL en antwoordt na duurzame opslag.
5. AI-analyse gebeurt later; AI- of e-mailuitval kan geen originele lead vernietigen.
6. Synthetische monitoringaanvragen gebruiken een aparte, geauthenticeerde testmodus: geen AI, commerciële berichten, reminders, dealcreatie of reguliere analytics-vervuiling.

### 4. Credentials en service-identiteiten
- Eén connectorregistratie per `(tenant_id, website_id, provider, resource_id)` of uitdrukkelijk gedeeld Westend-account. De backend verifieert provider-resourcebinding voor elke query.
- Secrets en OAuth-refresh-tokens alleen server-side in secrets manager of envelop-versleutelde opslag; sleutelbeheer gescheiden van de applicatiedatabase waar praktisch uitvoerbaar.
- Geen tokens in Git, frontendbundels, client-side environment variables, Sanity-documenten, LLM-prompts, logs of exportbestanden.
- Verplicht: least privilege, rotatie, revoke/reconnect, expiratie, test/production-scheiding, audit van gebruik en alerting op authenticatiefouten.
- Een worker ontvangt een beperkt jobtoken met tenant, website, taaktype en geldigheidsduur; de integratielaag bepaalt zelfstandig of de gevraagde provideractie mag.
- Bescherm uitgaande HTTP-calls tegen SSRF: vaste provider-base-URL's, geen door AI te kiezen endpoints, strikte redirectregels, DNS/IP-controles en netwerk-egressbeleid.

### 5. Webhooks, e-mail en idempotentie
- Iedere provider-webhook heeft een eigen route/handler met cryptografische signature-validatie op de ongewijzigde requestbody, tijdvenster/replaybescherming, beperkte grootte en structurele schemavalidatie.
- Schrijf unieke `provider_event_id` + provider/tenantcontext naar een inbox-record voor deduplicatie; acknowledge na duurzame vastlegging, verwerk asynchroon.
- E-mail krijgt lokale `message_intent_id` en unieke businesssleutel (bijv. tenant+lead+workflowversie+reactietype). De provider-idempotency-key is een aanvullende, geen enige garantie. Resend houdt idempotency-keys 24 uur vast; eigen deduplicatie blijft langer geldig.
- Bij onbekende afleverstatus géén blind opnieuw verzenden; eerst providerstatus reconciliëren of menselijke beoordeling.
- Uitgaande afzenders/domeinen worden geverifieerd; `To`, `Reply-To` en bijlagen komen uit geautoriseerde workflowconfiguratie, nooit uit AI-tekst.
- Sanity-webhooks mogen previews of builds starten, maar **geen productiepublicatie buiten Gate B om**.

### 6. Privacy en antwoorddetectie — open productbesluit
De goedgekeurde workflow voorziet in één inhoudelijke AI-reactie, mogelijk één beleidsmatig toegestane herinnering na 48 uur en een menselijke taak na nog 48 uur. Een automatisch reminder is alleen veilig wanneer een reactie daadwerkelijk kan worden gedetecteerd.

**Aanbevolen model:** een eigen reply-alias per klant/website of leadthread op een gecontroleerd ontvangstdomein. Binnenkomende antwoorden worden door de e-mailontvangstdienst veilig doorgestuurd naar de klant en leveren uitsluitend noodzakelijke replymetadata aan de Conversion Engine (geen structurele mailboxscraping). Het model genereert nooit automatisch een tweede inhoudelijk antwoord. Inbound inhoud blijft onvertrouwd; geen workflow-instructies uit e-mail overnemen.

**Fallback:** als inbound reply-detectie niet technisch/contractueel betrouwbaar is, zetten we de automatische 48-uursherinnering voor die klant uit en maken we uitsluitend een menselijke controle-/opvolgtaak. Een ontbrekend signaal is niet gelijk aan 'geen antwoord'.

Beslispunt: kiezen we voor centrale, privacyvriendelijke reply-routing als onderdeel van de MVP of voor handmatige statusbevestiging zonder automatische reminder?

### 7. Analytics en productiegrenzen
- GA4 / GSC: enkel ingeschakelde, geautoriseerde properties uitlezen, ingestelde consent respecteren, gegevens met `source`, `period`, `synced_at` en `status` bewaren.
- Clarity Data Export API heeft volgens Microsoft 10 verzoeken per project per dag en een venster van de laatste 1–3 dagen; plan een dagelijkse sync, cache en geef ontbrekende metingen als zodanig weer. Dit is geen API om individuele sessievideo's rechtstreeks in het dashboard af te spelen.
- DataForSEO gebruikt Basic Authentication met Westend API-credentials. Alleen een centrale adapter mag de credentials zien; stel per website kostenplafonds en budgetsafeguards in.
- Sanity-dataset-assets zijn op openbare CDN-URL's beschikbaar, zelfs bij private datasets; bewaar contracten, klantbijlagen en financiële stukken in afgesloten objectstorage. Voor CMS-assets met bijzondere eisen is aparte rechtencontrole nodig.
- Sandbox en productie gebruiken gescheiden credentials, domains, webhooks en databases; CI/deployment heeft geen onbeperkte toegang tot productiegegevens.

### 8. Controles en releasecriteria
| ID | Test / acceptatiecriterium |
|---|---|
| A07-01 | Een publieke formulierrequest kan geen tenant-id of websitebinding wijzigen |
| A07-02 | Onjuiste of verlopen machine-handtekening wordt geweigerd; replays worden geweigerd |
| A07-03 | Webhooks met verkeerde signature of opnieuw event-ID veroorzaken geen statusverandering |
| A07-04 | Eén workflowevent kan geen twee inhoudelijke AI-e-mails verzenden, ook niet na crash/retry |
| A07-05 | Onzekere provider-send-status leidt tot reconciliatie, niet automatische herverzending |
| A07-06 | Promptinjecties kunnen geen endpoint, ontvanger, tenant, CMS-publicatie of export wijzigen |
| A07-07 | Analyticsconnection A kan niet property of Clarity-project B opvragen |
| A07-08 | API-credentials verschijnen niet in logging, exports, browserbundels of AI-prompts |
| A07-09 | Revoke/rotation en herstel na vervallen OAuth-token werken |
| A07-10 | Sanity-contentwijziging omzeilt Gate B niet |
| A07-11 | Monitoringtest activeert geen AI, reminders of marketingflows |
| A07-12 | Geen automatische reminder als reply-detectie niet betrouwbaar is |

### 9. Voorstel architectuurbesluit A-07
**Ter goedkeuring:** één gecontroleerde integratielaag; tenantgebonden providerverbindingen; minst mogelijke scopes; centraal geheimenbeheer; geverifieerde, idempotente webhooks; geen directe LLM/website-toegang tot providercredentials; gescheiden sandbox en productie; operationele monitoring en aantoonbare testbaarheid. 

**Nog te kiezen:** reply-routing voor statusdetectie versus handmatige statusbevestiging, definitieve providerkeuze voor e-mail/auth, definitief Sanity-isolatiemodel. Deze open punten worden expliciet bijgehouden en niet stilzwijgend als goedgekeurd behandeld.

### 10. Relevante officiële documentatie (gecontroleerd 18 oktober 2026)
- Resend idempotency: https://resend.com/changelog/idempotency-keys
- Resend signature verificatie: https://www.resend.com/changelog/managing-webhooks-via-api
- Sanity robot tokens: https://www.sanity.io/docs/content-lake/http-auth
- Sanity webhookbeveiliging: https://www.sanity.io/docs/content-lake/webhook-best-practices
- Sanity publieke dataset-assets: https://www.sanity.io/docs/content-lake/manage-assets
- GA4 Data API: https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart
- GSC OAuth: https://developers.google.com/webmaster-tools/v1/how-tos/authorizing
- Clarity Data Export API: https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api
- DataForSEO API-auth: https://docs.dataforseo.com/v3/auth/
