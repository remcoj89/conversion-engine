import type {
  BlogPost,
  Card,
  Cta,
  Faq,
  QuizConfig,
  Seo,
  Testimonial,
  Upsell,
} from "./types";

// Centrale demo-content. Alles is fictief: geen echte klanten, geen echte resultaten,
// geen medische claims en geen garanties. Componenten bevatten geen eigen copy.

// ---------------------------------------------------------------------------
// Globale elementen (GE-01 t/m GE-08)
// ---------------------------------------------------------------------------

const primaryCta: Cta = { label: "Plan mijn kennismaking", href: "/contact#afspraak" };
const leadmagnetCta: Cta = { label: "Start de Trainingsdoel-check", href: "/leadmagnet#check" };
const offerCta: Cta = { label: "Bekijk het coachingtraject", href: "/sales" };

export const site = {
  name: "Fitcoach Demo",
  coach: "Noor",
  tagline: "Persoonlijke begeleiding voor drukke mensen die structureel willen trainen.",
  demoNotice: "Demowebsite met een fictieve coach. Formulieren versturen en bewaren niets.",
  primaryCta,
  leadmagnetCta,
  offerCta,
  nav: [
    { label: "Home", href: "/" },
    { label: "Aanbod", href: "/sales" },
    { label: "Over mij", href: "/over-mij" },
    { label: "Blog", href: "/blog" },
    { label: "Contact", href: "/contact" },
  ] satisfies readonly Cta[],
  footer: {
    positioning: "Fictieve personal trainer voor de Conversion Engine-demo.",
    contactLabel: "Liever eerst even kennismaken?",
    legal: [{ label: "Privacy (demo)", href: "/privacy" }] satisfies readonly Cta[],
    copyright: "Fitcoach Demo — voorbeeldcontent, geen echte onderneming.",
  },
} as const;

export const pageSeo = {
  home: {
    title: "Structureel trainen naast een druk leven",
    description: "Demo: persoonlijke trainingsbegeleiding van een fictieve coach, met een haalbaar plan dat past in je week.",
    path: "/",
  },
  sales: {
    title: "Coachingtraject Sterk in je Week",
    description: "Demo-salespage: twaalf weken persoonlijke begeleiding met een trainingsplan dat past bij jouw agenda.",
    path: "/sales",
  },
  about: {
    title: "Over Noor",
    description: "Demo: waarom coach Noor (fictief) werkt met mensen die sporten willen laten passen in een vol leven.",
    path: "/over-mij",
  },
  contact: {
    title: "Plan een vrijblijvende kennismaking",
    description: "Demo-contactpagina: bespreek vrijblijvend welke trainingsaanpak bij jouw week past.",
    path: "/contact",
  },
  blog: {
    title: "Blog over haalbaar trainen",
    description: "Demo-blog met voorbeeldartikelen over trainen met weinig tijd, opbouwen en volhouden.",
    path: "/blog",
  },
  leadmagnet: {
    title: "Trainingsdoel-check",
    description: "Demo: beantwoord vijf korte vragen en ontdek welk trainingsritme bij jouw doel en week past.",
    path: "/leadmagnet",
  },
  thankYou: {
    title: "Bedankt",
    description: "Demo-bedankpagina met bevestiging en één vervolgstap.",
    path: "/bedankt",
  },
  privacy: {
    title: "Privacy (demo)",
    description: "Demo-privacytekst: deze demowebsite verwerkt en bewaart geen formuliergegevens.",
    path: "/privacy",
  },
} as const satisfies Record<string, Seo>;

// Voorbeeldreviews: nadrukkelijk als voorbeeld gemarkeerd, te vervangen door echte en controleerbare reviews.
export const testimonials: readonly Testimonial[] = [
  {
    quote: "Voor het eerst had ik een schema dat echt in mijn week paste. Daardoor bleef ik het ook doen.",
    name: "Voorbeeldklant A",
    context: "Coachingtraject, fictief",
    isExample: true,
  },
  {
    quote: "Fijn dat we eerst keken naar wat haalbaar was, in plaats van meteen vijf keer per week.",
    name: "Voorbeeldklant B",
    context: "Kennismaking, fictief",
    isExample: true,
  },
  {
    quote: "De wekelijkse check-in hield me scherp, zonder dat het voelde als moeten.",
    name: "Voorbeeldklant C",
    context: "Coachingtraject, fictief",
    isExample: true,
  },
];

export const trustNote = "Voorbeeldreviews voor de demo. Een klantwebsite toont hier alleen echte, controleerbare ervaringen.";

// ---------------------------------------------------------------------------
// Homepage — website-blokken-home-pagina.docx, blok 1 t/m 7
// ---------------------------------------------------------------------------

export const home = {
  hero: {
    eyebrow: "Personal training & coaching",
    title: "Sterker en fitter worden, in een week die al vol zit",
    text: "Je wilt graag fit zijn, maar tussen werk, gezin en afspraken sneeuwt trainen telkens onder. Je begint vol goede moed en na drie weken ben je het ritme weer kwijt.",
    cta: primaryCta,
    secondary: offerCta,
  },
  recognition: {
    intro: { eyebrow: "Herken je dit?", title: "Je weet wat je zou moeten doen. Het lukt alleen niet om het vol te houden." },
    paragraphs: [
      "Je hebt al eens een abonnement genomen, een app gedownload of een schema van internet geprobeerd. Elke keer gaat het even goed, tot een drukke week alles weer omgooit.",
      "Ondertussen wil je je gewoon weer sterk en energiek voelen. Niet voor een strandfoto, maar om lekker in je vel te zitten en de dingen te kunnen doen die je belangrijk vindt.",
      "Misschien geloof je inmiddels dat structureel trainen voor jou gewoon niet weggelegd is. Dat is niet zo: het plan moet alleen bij jouw week passen, niet andersom.",
    ],
  },
  offer: {
    intro: {
      eyebrow: "Dit is wat ik doe",
      title: "Coachingtraject Sterk in je Week",
      text: "In twaalf weken bouwen we samen een trainingsritme op dat past bij jouw agenda, met een persoonlijk plan en wekelijkse begeleiding.",
    },
    points: [
      "Persoonlijk trainingsplan op basis van jouw week",
      "Wekelijkse check-in om bij te sturen",
      "Trainen in de gym, thuis of buiten",
    ],
    cta: offerCta,
  },
  about: {
    intro: { eyebrow: "Over mij", title: "Hoi, ik ben Noor" },
    text: "Ik ben (fictief) personal trainer en help drukke mensen om trainen een vast onderdeel van hun week te maken. Geen extreme programma's, wel een plan dat je volhoudt.",
    cta: { label: "Lees mijn verhaal", href: "/over-mij" } satisfies Cta,
  },
  approach: {
    intro: {
      eyebrow: "Mijn werkwijze",
      title: "Waarom deze aanpak anders werkt",
      text: "De meeste schema's gaan uit van een ideale week. Ik begin bij jouw echte week.",
    },
    cards: [
      { title: "Eerst je week, dan het schema", text: "We kijken eerst hoeveel tijd en energie je realistisch hebt. Pas daarna maken we het plan." },
      { title: "Klein beginnen, slim opbouwen", text: "Liever twee trainingen die je volhoudt dan vijf die na een maand sneuvelen." },
      { title: "Bijsturen hoort erbij", text: "Een drukke week is geen mislukking. We passen het plan aan zodat je in beweging blijft." },
    ] satisfies readonly Card[],
  },
  firstStep: {
    intro: {
      eyebrow: "Je eerste stap",
      title: "Ontdek welk trainingsritme bij jou past",
      text: "Doe de gratis Trainingsdoel-check: vijf korte vragen en je ziet direct welk ritme past bij jouw doel en week. Een e-mailadres is niet nodig.",
    },
    cta: leadmagnetCta,
  },
  socials: {
    intro: { eyebrow: "Volg mee", title: "Korte tips en trainingsideeën" },
    handle: "@fitcoach.demo",
    note: "Voorbeeld van een socialblok. Een klantwebsite linkt hier alleen naar een account dat actief wordt bijgehouden.",
    posts: ["Tip: plan je training als een afspraak", "3 oefeningen voor thuis", "Zo pak je de draad weer op"],
  },
} as const;

// ---------------------------------------------------------------------------
// Salespage — website-blokken-salespagina.docx
// Toegepast: blok 2-7, 9-14, 16, 17 (twee reviewblokken: 5 en 11).
// Weggelaten: blok 1 (geen lopende actie; geen kunstmatige urgentie), blok 8 en 15 (extra reviews).
// ---------------------------------------------------------------------------

export const sales = {
  hero: {
    eyebrow: "Coachingtraject van 12 weken",
    title: "Sterk in je Week",
    promise: "Een trainingsritme dat past bij jouw agenda, met persoonlijke begeleiding om het vol te houden.",
    cta: primaryCta,
  },
  problem: {
    intro: { eyebrow: "Het probleem", title: "Het ligt niet aan je motivatie" },
    paragraphs: [
      "Je begint enthousiast, maar een drukke werkweek, een ziek kind of een avond overwerken gooit je planning om. Daarna is het lastig om weer op te starten.",
      "Standaardschema's gaan uit van een week waarin alles meezit. Die week bestaat zelden. Dus voelt het alsof jij faalt, terwijl het plan gewoon niet bij je leven paste.",
    ],
  },
  solution: {
    intro: {
      eyebrow: "De oplossing",
      title: "Een plan dat meebeweegt met jouw week",
      text: "In Sterk in je Week maken we een plan voor jouw echte week en sturen we elke week bij. Zo bouw je een ritme op dat ook in drukke periodes overeind blijft.",
    },
    cta: primaryCta,
  },
  outcomes: {
    intro: { eyebrow: "Wat je krijgt", title: "Waar we samen naartoe werken" },
    items: [
      "Een vast trainingsritme dat in je agenda past",
      "Inzicht in welke trainingen voor jouw doel het meest opleveren",
      "Een plan B voor drukke weken, zodat je niet opnieuw hoeft te beginnen",
      "Meer vertrouwen in je eigen kunnen tijdens het trainen",
    ],
    disclaimer: "Iedereen start op een ander punt; we werken naar jouw doel toe, zonder beloftes over vaste uitkomsten.",
  },
  practical: {
    intro: { eyebrow: "Praktisch", title: "Hoe het traject eruitziet" },
    items: [
      { title: "Duur", text: "12 weken" },
      { title: "Start", text: "Na een vrijblijvende kennismaking" },
      { title: "Begeleiding", text: "Wekelijkse online check-in van 20 minuten" },
      { title: "Training", text: "Persoonlijk plan voor gym, thuis of buiten" },
      { title: "Tijd per week", text: "Meestal 2 tot 3 trainingen, afgestemd op jouw week" },
    ] satisfies readonly Card[],
    cta: primaryCta,
  },
  pricing: {
    intro: { eyebrow: "Investering", title: "Kies wat bij je past", text: "Fictieve demoprijzen, inclusief btw." },
    plans: [
      {
        name: "Online begeleiding",
        price: "€ 149",
        period: "per maand",
        features: ["Persoonlijk trainingsplan", "Wekelijkse online check-in", "Bijsturen via berichten"],
        highlighted: false,
      },
      {
        name: "Online + training op locatie",
        price: "€ 249",
        period: "per maand",
        features: ["Alles van online begeleiding", "Twee trainingen per maand samen", "Techniekcontrole tijdens training"],
        highlighted: true,
      },
    ],
  },
  risk: {
    intro: { eyebrow: "Zonder risico starten", title: "Eerst kennismaken, dan pas beslissen" },
    points: [
      "De kennismaking is gratis en vrijblijvend",
      "Je start pas als we allebei denken dat het past",
      "Na de eerste maand maandelijks opzegbaar",
    ],
    cta: primaryCta,
  },
  intro: {
    intro: { eyebrow: "Even voorstellen", title: "Ik ben Noor, en ik weet hoe een volle week voelt" },
    text: "Als (fictieve) personal trainer zag ik steeds hetzelfde: mensen met goede voornemens die vastliepen op een plan dat niet bij hun leven paste. Daarom begin ik altijd bij jouw week.",
    cta: { label: "Lees meer over mij", href: "/over-mij" } satisfies Cta,
  },
  fit: {
    intro: { eyebrow: "Past dit bij jou?", title: "Voor wie dit traject wel en niet is" },
    forWho: [
      "Je wilt structureel trainen, maar je week zit vol",
      "Je zoekt begeleiding en wilt bijsturen als het tegenzit",
      "Je bent bereid twee à drie keer per week tijd vrij te maken",
    ],
    notFor: [
      "Je zoekt een snelle oplossing voor een paar weken",
      "Je hebt medische begeleiding nodig; overleg dan eerst met je huisarts of fysiotherapeut",
      "Je wilt alleen een schema zonder contact",
    ],
    cta: primaryCta,
  },
  whyNow: {
    intro: { eyebrow: "Waarom nu?", title: "Over drie maanden is je week niet ineens leger" },
    text: "Wachten op een rustigere periode voelt logisch, maar die komt zelden. Het ritme dat je nu opbouwt, helpt je juist door de drukke weken heen.",
  },
  faq: [
    { question: "Moet ik al ervaring hebben met trainen?", answer: "Nee. We stemmen het plan af op je huidige niveau en bouwen rustig op." },
    { question: "Kan ik thuis trainen?", answer: "Ja. Het plan kan uitgaan van de gym, thuis, buiten of een combinatie." },
    { question: "Wat als ik een week niet kan trainen?", answer: "Dan passen we het plan aan. Een gemiste week betekent niet opnieuw beginnen." },
    { question: "Hoe zit het met blessures of klachten?", answer: "Ik geef geen medisch advies. Bij klachten overleg je eerst met een arts of fysiotherapeut." },
  ] satisfies readonly Faq[],
  finalCta: {
    title: "Benieuwd of Sterk in je Week bij jou past?",
    text: "Plan een vrijblijvende kennismaking. We bespreken je week, je doel en of dit traject daarbij past.",
    cta: primaryCta,
  },
} as const;

// ---------------------------------------------------------------------------
// Over mij — website-blokken-over-mij-pagina-1.docx, blok 1 t/m 6
// ---------------------------------------------------------------------------

export const about = {
  hero: {
    eyebrow: "Over mij",
    title: "Je wilt je sterk voelen in je eigen leven. Dat is precies waarom ik coach.",
    text: "Niet om records te breken, maar om energie te hebben voor alles wat je belangrijk vindt.",
  },
  fit: {
    intro: { eyebrow: "Samenwerken", title: "Ik werk graag met mensen die…" },
    items: [
      "een volle agenda hebben en toch structureel willen trainen",
      "al eens zijn gestart en het lastig vonden om vol te houden",
      "eerlijk willen kijken naar wat haalbaar is",
      "zich sterker en fitter willen voelen, zonder extreme aanpak",
    ],
  },
  story: {
    intro: { eyebrow: "Mijn verhaal", title: "Van alles-of-niets naar een ritme dat blijft" },
    paragraphs: [
      "Noor is een fictieve coach, maar haar verhaal laat zien wat hier normaal staat: waarom de coach doet wat ze doet.",
      "Jarenlang trainde ik volgens het principe alles of niets. In drukke periodes werd het dus vaak niets. Pas toen ik mijn trainingen ging plannen rond mijn echte week, hield ik het vol.",
      "Die les gebruik ik nu bij iedereen die ik begeleid: we bouwen een plan voor jouw week, niet voor een ideale week.",
    ],
  },
  credentials: {
    intro: { eyebrow: "Wat ik doe", title: "Achtergrond en ervaring" },
    items: [
      { title: "Opleiding", text: "Voorbeeld: erkende opleiding tot personal trainer (in te vullen door klant)" },
      { title: "Specialisatie", text: "Trainen voor drukke professionals en ouders" },
      { title: "Werkwijze", text: "Persoonlijk plan, wekelijkse check-in en bijsturen" },
    ] satisfies readonly Card[],
  },
  product: {
    intro: {
      eyebrow: "Mijn belangrijkste aanbod",
      title: "Sterk in je Week",
      text: "Twaalf weken persoonlijke begeleiding om een trainingsritme op te bouwen dat past bij jouw agenda.",
    },
    cta: offerCta,
  },
  nextStep: {
    intro: {
      eyebrow: "Volgende stap",
      title: "Nog even rondkijken?",
      text: "Lees op de blog hoe ik naar trainen met weinig tijd kijk, of ontdek met de Trainingsdoel-check welk ritme bij jou past.",
    },
    cta: { label: "Lees de blog", href: "/blog" } satisfies Cta,
  },
} as const;

// ---------------------------------------------------------------------------
// Contact — website-blokken-contactpagina.md, CP-01 t/m CP-09
// ---------------------------------------------------------------------------

export const contact = {
  hero: {
    eyebrow: "Kennismaken",
    title: "Benieuwd welke aanpak bij jouw week past?",
    text: "Bespreek vrijblijvend je doel en je agenda. Daarna weet je welke volgende stap logisch is, ook als dat geen traject bij mij is.",
    cta: { label: primaryCta.label, href: "#afspraak" } satisfies Cta,
  },
  reasons: {
    intro: { title: "Waarom een kennismaking?" },
    cards: [
      { title: "Snel duidelijkheid", text: "In 20 minuten weet je welke aanpak realistisch is voor jouw week." },
      { title: "Advies op maat", text: "We kijken naar jouw doel en situatie, niet naar een standaardschema." },
      { title: "Geen verplichting", text: "Je beslist achteraf in alle rust of je verder wilt." },
    ] satisfies readonly Card[],
  },
  appointment: {
    title: "Plan direct een kennismaking",
    text: "Kies een moment dat jou uitkomt. Het gesprek duurt ongeveer 20 minuten en is online.",
    cta: primaryCta.label,
    demoResult: "Demo: hier opent in de klantversie de afspraakmodule van de coach. Er is niets geboekt.",
  },
  form: {
    title: "Liever eerst een vraag stellen?",
    text: "Laat een kort bericht achter. Noor reageert binnen twee werkdagen (fictieve termijn).",
    reasons: ["Kennismaking aanvragen", "Vraag over het coachingtraject", "Andere vraag"],
    submitLabel: "Verstuur mijn vraag",
  },
  responder: "Je bericht wordt gelezen en beantwoord door Noor zelf (fictief).",
  steps: {
    intro: { title: "Wat gebeurt er daarna?" },
    items: [
      { title: "Je plant een gesprek of stuurt je vraag", text: "Dat kost je een paar minuten." },
      { title: "Noor neemt contact op", text: "Binnen twee werkdagen (fictieve termijn)." },
      { title: "We bespreken je doel en je week", text: "Eerlijk en zonder verkooppraatje." },
      { title: "Je krijgt een passend advies", text: "Ook als dat een andere route is dan een traject." },
    ] satisfies readonly Card[],
  },
  faq: [
    { question: "Is het gesprek echt vrijblijvend?", answer: "Ja. Je zit nergens aan vast en beslist zelf of je verder wilt." },
    { question: "Wat moet ik voorbereiden?", answer: "Niets bijzonders. Denk alleen even na over je doel en hoeveel tijd je per week hebt." },
    { question: "Wat kost een traject daarna?", answer: "De (fictieve) prijzen staan op de aanbodpagina. In het gesprek hoor je welke vorm past." },
    { question: "Wat gebeurt er met mijn gegevens?", answer: "Op deze demowebsite niets: formulieren versturen en bewaren geen gegevens." },
  ] satisfies readonly Faq[],
  finalCta: {
    title: "Wil je weten wat voor jou de beste volgende stap is?",
    text: "Plan een kennismaking van 20 minuten. Vrijblijvend en online.",
    cta: { label: primaryCta.label, href: "#afspraak" } satisfies Cta,
  },
} as const;

// ---------------------------------------------------------------------------
// Leadmagnet — website-blokken-leadmagnetpagina.md, LM-01 t/m LM-06, LM-08 t/m LM-11
// (LM-07 challenge-inschrijving niet actief: maximaal één leadmagnet per website.)
// ---------------------------------------------------------------------------

export const quiz: QuizConfig = {
  version: "2026-10-demo-1",
  name: "Trainingsdoel-check",
  profiles: [
    {
      id: "rustig-opbouwen",
      title: "Rustig opbouwen",
      summary: "Je hebt baat bij een rustige start met weinig drempels. Het belangrijkste is nu een gewoonte opbouwen.",
      rhythm: "2 korte trainingen van 30 minuten per week",
      firstAction: "Zet deze week twee vaste trainingsmomenten van 30 minuten in je agenda.",
    },
    {
      id: "kracht-en-structuur",
      title: "Kracht en structuur",
      summary: "Je bent klaar voor een vast schema met krachttraining als basis en een duidelijke opbouw.",
      rhythm: "3 trainingen van 45 minuten per week",
      firstAction: "Kies drie vaste dagen en begin met een basisschema van vijf oefeningen.",
    },
    {
      id: "conditie-en-energie",
      title: "Conditie en energie",
      summary: "Je wilt je fitter en energieker voelen. Een mix van conditie en kracht past goed bij je.",
      rhythm: "2 conditietrainingen en 1 krachttraining per week",
      firstAction: "Plan deze week één wandel- of fietsrondje extra van 30 minuten.",
    },
    {
      id: "ritme-terugvinden",
      title: "Ritme terugvinden",
      summary: "Je weet hoe trainen werkt, maar het ritme is weg. Je hebt vooral een plan nodig dat tegen drukke weken kan.",
      rhythm: "2 vaste trainingen plus 1 flexibele training per week",
      firstAction: "Bepaal je minimale week: welke ene training doe je altijd, hoe druk het ook is?",
    },
  ],
  questions: [
    {
      id: "doel",
      question: "Wat is op dit moment je belangrijkste doel?",
      options: [
        { id: "beginnen", label: "Gewoon weer beginnen met bewegen", scores: { "rustig-opbouwen": 2 } },
        { id: "sterker", label: "Sterker worden", scores: { "kracht-en-structuur": 2 } },
        { id: "energie", label: "Meer energie en een betere conditie", scores: { "conditie-en-energie": 2 } },
        { id: "volhouden", label: "Eindelijk volhouden wat ik begin", scores: { "ritme-terugvinden": 2 } },
      ],
    },
    {
      id: "tijd",
      question: "Hoeveel tijd kun je realistisch per week vrijmaken?",
      options: [
        { id: "weinig", label: "Minder dan 1 uur", scores: { "rustig-opbouwen": 2 } },
        { id: "gemiddeld", label: "1 tot 2 uur", scores: { "conditie-en-energie": 1, "ritme-terugvinden": 1 } },
        { id: "ruim", label: "Meer dan 2 uur", scores: { "kracht-en-structuur": 2 } },
      ],
    },
    {
      id: "ervaring",
      question: "Hoeveel ervaring heb je met trainen?",
      options: [
        { id: "geen", label: "Weinig tot geen", scores: { "rustig-opbouwen": 2 } },
        { id: "vroeger", label: "Vroeger wel, nu al een tijd niet", scores: { "ritme-terugvinden": 2 } },
        { id: "regelmatig", label: "Ik train af en toe", scores: { "kracht-en-structuur": 1, "conditie-en-energie": 1 } },
      ],
    },
    {
      id: "struikelblok",
      question: "Waar loop je meestal op vast?",
      options: [
        { id: "starten", label: "Ik weet niet goed waar ik moet beginnen", scores: { "rustig-opbouwen": 1, "kracht-en-structuur": 1 } },
        { id: "drukte", label: "Drukke weken gooien alles om", scores: { "ritme-terugvinden": 2 } },
        { id: "saai", label: "Het wordt snel saai", scores: { "conditie-en-energie": 2 } },
      ],
    },
    {
      id: "plek",
      question: "Waar train je het liefst?",
      options: [
        { id: "thuis", label: "Thuis", scores: { "rustig-opbouwen": 1, "ritme-terugvinden": 1 } },
        { id: "gym", label: "In de sportschool", scores: { "kracht-en-structuur": 1 } },
        { id: "buiten", label: "Buiten", scores: { "conditie-en-energie": 1 } },
      ],
    },
  ],
};

export const leadmagnet = {
  hero: {
    eyebrow: "Gratis Trainingsdoel-check",
    title: "Ontdek welk trainingsritme het beste bij jouw doel past",
    promise: "Vijf korte vragen, direct een persoonlijk resultaatprofiel en een eerste haalbare actie.",
    text: "Geen e-mailadres nodig om je resultaat te zien. Duurt ongeveer twee minuten.",
    cta: leadmagnetCta,
  },
  recognition: {
    intro: { eyebrow: "Herkenbaar?", title: "Zoveel adviezen, en toch weet je niet wat bij jóu past" },
    paragraphs: [
      "Drie keer per week? Elke dag tienduizend stappen? Alleen krachttraining? Algemene adviezen houden geen rekening met jouw doel en jouw week.",
      "De Trainingsdoel-check maakt in twee minuten duidelijk welk ritme realistisch is voor jou, en wat je eerste stap is.",
    ],
  },
  benefits: {
    intro: { eyebrow: "Wat je krijgt", title: "Direct na het invullen" },
    items: [
      { title: "Je resultaatprofiel", text: "Een van vier vaste profielen die past bij je doel en situatie." },
      { title: "Een passend weekritme", text: "Hoe vaak en hoe lang trainen realistisch is voor jou." },
      { title: "Een eerste haalbare actie", text: "Eén concrete stap die je deze week kunt zetten." },
      { title: "Optioneel: samenvatting per e-mail", text: "Alleen als je dat wilt. In deze demo wordt niets verstuurd." },
    ] satisfies readonly Card[],
  },
  howItWorks: {
    intro: { eyebrow: "Hoe het werkt", title: "In drie stappen" },
    items: [
      { title: "Beantwoord vijf vragen", text: "Over je doel, je tijd en je ervaring." },
      { title: "Bekijk je resultaat", text: "Direct op deze pagina, zonder e-mailadres." },
      { title: "Zet je eerste stap", text: "Met één concrete actie voor deze week." },
    ] satisfies readonly Card[],
  },
  fit: {
    intro: { eyebrow: "Voor wie?", title: "Voor wie deze check bedoeld is" },
    forWho: [
      "Je wilt (weer) structureel gaan trainen",
      "Je twijfelt welk ritme realistisch is naast werk en gezin",
      "Je wilt een eerste stap zonder meteen iets te kopen",
    ],
    notFor: [
      "Je zoekt een revalidatie- of medisch advies; ga dan naar een arts of fysiotherapeut",
      "Je traint al jaren volgens een vast schema dat goed werkt",
    ],
  },
  form: {
    title: "Wil je je resultaat ook als samenvatting?",
    text: "Optioneel. Vul je voornaam en e-mailadres in en je krijgt in de echte versie binnen enkele minuten een samenvatting met je eerste stap.",
    submitLabel: "Stuur mijn samenvatting",
    skipLabel: "Ga verder zonder samenvatting",
  },
  trust: {
    intro: { eyebrow: "Over de check", title: "Hoe het resultaat tot stand komt" },
    text: "Je resultaat wordt berekend met vaste regels: elk antwoord telt mee voor een profiel. Er is geen AI of medische beoordeling bij betrokken.",
  },
  faq: [
    { question: "Is dit gratis?", answer: "Ja, de check is gratis." },
    { question: "Hoeveel tijd kost het?", answer: "Ongeveer twee minuten." },
    { question: "Krijg ik direct resultaat?", answer: "Ja, je resultaat verschijnt direct op de pagina. Een e-mailadres is niet nodig." },
    { question: "Wat gebeurt er met mijn antwoorden?", answer: "In deze demo niets: antwoorden blijven in je browser en worden niet opgeslagen of verstuurd." },
    { question: "Kan ik daarna persoonlijke begeleiding krijgen?", answer: "Ja, na de check kun je vrijblijvend een kennismaking plannen." },
  ] satisfies readonly Faq[],
  finalCta: {
    title: "Klaar om te ontdekken wat bij je past?",
    text: "Vijf vragen, twee minuten, direct resultaat.",
    cta: leadmagnetCta,
  },
} as const;

// ---------------------------------------------------------------------------
// Bedankpagina — website-blokken-bedankpagina-upsell.md, BP-01 t/m BP-08
// ---------------------------------------------------------------------------

// Pilotinstelling: de standaardupsell is een vrijblijvende kennismaking.
export const upsell: Upsell = {
  type: "kennismaking",
  transition: "Wil je dit niet alleen proberen? Krijg persoonlijke begeleiding bij jouw volgende stap.",
  title: "Vrijblijvende kennismaking",
  outcome: "Samen vertalen we je resultaat naar een plan dat past bij jouw week.",
  forWho: "Voor iedereen die na de check wil weten hoe het verder kan, met of zonder begeleiding.",
  included: ["Bespreking van je resultaatprofiel", "Advies over een haalbaar weekritme", "Eerlijk antwoord of begeleiding past"],
  timeInvestment: "20 minuten, online",
  price: "Gratis",
  riskReversal: "Geen verplichtingen: je beslist na het gesprek in alle rust.",
  cta: primaryCta,
};

export const thankYou = {
  leadmagnet: {
    eyebrow: "Gelukt",
    title: "Je Trainingsdoel-check is goed ontvangen",
    text: "Hieronder vind je nog een keer je resultaat en je eerste stap.",
    delivery: "In de echte versie ontvang je binnen enkele minuten een e-mail met je samenvatting. In deze demo wordt geen e-mail verstuurd.",
    deliveryWithoutSummary: "Je hebt geen samenvatting per e-mail aangevraagd. Je resultaat staat hieronder; bewaar het gerust.",
    missingResult: "We konden je resultaat niet meer vinden in deze browser. Doe de check opnieuw om het te bekijken.",
  },
  contact: {
    eyebrow: "Gelukt",
    title: "Je vraag is goed ontvangen",
    text: "Bedankt voor je bericht.",
    delivery: "Noor reageert binnen twee werkdagen (fictieve termijn). In deze demo is niets verstuurd.",
    nextStep: {
      title: "Alvast ontdekken welk ritme bij je past?",
      text: "Doe intussen de Trainingsdoel-check en neem je resultaat mee naar het gesprek.",
      cta: leadmagnetCta,
    },
  },
  upsell,
  alternative: { label: "Of lees eerst een artikel op de blog", href: "/blog" } satisfies Cta,
} as const;

export const privacy = {
  title: "Privacy (demo)",
  paragraphs: [
    "Dit is een demowebsite met fictieve content. Formulieren op deze website versturen geen gegevens naar een server of externe dienst en slaan niets op.",
    "Het resultaat van de Trainingsdoel-check wordt alleen tijdelijk in je eigen browser bewaard (sessionStorage), zodat de bedankpagina het kan tonen. Sluit je het tabblad, dan is het weg.",
    "Een klantwebsite vervangt deze tekst door de eigen privacyverklaring.",
  ],
} as const;

// ---------------------------------------------------------------------------
// Blog — website-blokken-blog.md, BL-01 t/m BL-03 en BL-05 t/m BL-10
// (BL-04 filters weggelaten: te weinig artikelen om filters zinvol te maken.)
// ---------------------------------------------------------------------------

export const blogPage = {
  hero: {
    eyebrow: "Blog",
    title: "Haalbaar trainen naast een vol leven",
    text: "Praktische artikelen voor drukke mensen die structureel willen trainen. Fictieve voorbeeldcontent voor de demo.",
  },
  listTitle: "Alle artikelen",
  readLabel: "Lees artikel",
  authorBio: {
    name: "Noor",
    role: "Personal trainer (fictief)",
    bio: "Noor helpt drukke mensen om trainen een vast onderdeel van hun week te maken.",
    link: { label: "Meer over Noor", href: "/over-mij" } satisfies Cta,
  },
  relatedTitle: "Lees ook",
} as const;

export const blogPosts: readonly BlogPost[] = [
  {
    slug: "hoe-vaak-trainen-met-weinig-tijd",
    status: "gepubliceerd",
    featured: true,
    title: "Hoe vaak moet je trainen als je weinig tijd hebt?",
    summary: "Twee goede trainingen per week zijn vaak meer waard dan vijf trainingen die je niet volhoudt.",
    seoTitle: "Hoe vaak trainen met weinig tijd?",
    seoDescription: "Voorbeeldartikel: zo bepaal je een trainingsfrequentie die past in een drukke week.",
    topic: "Planning",
    author: "Noor",
    publishedAt: "2026-09-08",
    updatedAt: "2026-10-01",
    readingMinutes: 4,
    imageAlt: "Abstracte illustratie van een weekplanning",
    content: [
      { type: "p", text: "De vraag die ik het vaakst krijg: hoe vaak moet ik eigenlijk trainen? Het eerlijke antwoord is dat het minder uitmaakt dan je denkt, zolang je het volhoudt." },
      { type: "h2", text: "Begin bij je echte week" },
      { type: "p", text: "Kijk naar een normale week, niet naar je ideale week. Hoeveel momenten heb je écht vrij? Begin daar, en plan liever één training te weinig dan één te veel." },
      { type: "list", items: ["Noteer je vaste afspraken", "Zoek twee momenten van 30 tot 45 minuten", "Zet ze als afspraak in je agenda"] },
      { type: "cta" },
      { type: "h2", text: "Kwaliteit boven kwantiteit" },
      { type: "p", text: "Een goed opgebouwde training met een paar basisoefeningen levert meer op dan lang trainen zonder plan." },
      { type: "table", caption: "Voorbeeld van een weekritme", head: ["Situatie", "Ritme"], rows: [["Zeer druk", "2 × 30 minuten"], ["Gemiddeld", "2 × 45 minuten"], ["Wat ruimer", "3 × 45 minuten"]] },
      { type: "h3", text: "En als het een week niet lukt?" },
      { type: "callout", text: "Een gemiste week is geen reden om opnieuw te beginnen. Pak gewoon de volgende geplande training op." },
    ],
    inlineCta: {
      title: "Welk ritme past bij jou?",
      text: "Doe de Trainingsdoel-check en zie direct welk weekritme realistisch is voor jouw doel.",
      cta: leadmagnetCta,
    },
    conclusion: "Begin met een ritme dat je volhoudt en bouw van daaruit op. Consistentie wint het van intensiteit.",
    related: ["consistentie-boven-motivatie", "rustig-weer-beginnen"],
  },
  {
    slug: "consistentie-boven-motivatie",
    status: "gepubliceerd",
    featured: false,
    title: "Waarom consistentie belangrijker is dan motivatie",
    summary: "Motivatie komt en gaat. Een goed plan helpt je juist op de dagen dat je geen zin hebt.",
    seoTitle: "Consistentie boven motivatie",
    seoDescription: "Voorbeeldartikel: waarom een vast ritme meer oplevert dan wachten op motivatie.",
    topic: "Mindset",
    author: "Noor",
    publishedAt: "2026-08-25",
    readingMinutes: 3,
    imageAlt: "Abstracte illustratie van een doorlopende lijn",
    content: [
      { type: "p", text: "Veel mensen wachten op motivatie om te beginnen. Maar motivatie is een gevolg van in beweging komen, niet de voorwaarde." },
      { type: "h2", text: "Maak het makkelijk om te starten" },
      { type: "list", items: ["Leg je sportkleding de avond ervoor klaar", "Kies een vaste dag en tijd", "Begin met een korte warming-up, de rest volgt vaak vanzelf"] },
      { type: "cta" },
      { type: "h2", text: "Spreek een minimale week af" },
      { type: "p", text: "Bepaal welke ene training je altijd doet, hoe druk het ook is. Dat houdt het ritme vast.", link: { label: "Lees ook hoe vaak je kunt trainen met weinig tijd", href: "/blog/hoe-vaak-trainen-met-weinig-tijd" } },
    ],
    inlineCta: {
      title: "Hulp nodig bij volhouden?",
      text: "In een vrijblijvende kennismaking kijken we samen naar een ritme dat bij jouw week past.",
      cta: primaryCta,
    },
    conclusion: "Wacht niet op motivatie. Maak een plan dat ook op mindere dagen werkt.",
    related: ["hoe-vaak-trainen-met-weinig-tijd", "rustig-weer-beginnen"],
  },
  {
    slug: "rustig-weer-beginnen",
    status: "gepubliceerd",
    featured: false,
    title: "Na een lange pauze rustig weer beginnen",
    summary: "Hoe je de draad weer oppakt zonder meteen te veel van jezelf te vragen.",
    seoTitle: "Rustig weer beginnen met trainen",
    seoDescription: "Voorbeeldartikel: tips om na een pauze rustig en haalbaar weer te starten met trainen.",
    topic: "Opbouwen",
    author: "Noor",
    publishedAt: "2026-08-11",
    readingMinutes: 3,
    imageAlt: "Abstracte illustratie van een opgaande lijn",
    content: [
      { type: "p", text: "Ben je een tijd gestopt met trainen? Dan is de verleiding groot om meteen weer op je oude niveau te beginnen. Rustig opbouwen werkt meestal beter." },
      { type: "h2", text: "Begin lager dan je denkt" },
      { type: "p", text: "Start met een lager volume en bouw per week een beetje op. Zo blijft trainen leuk en haalbaar." },
      { type: "callout", text: "Heb je klachten of twijfel je of trainen verstandig is? Overleg dan eerst met je huisarts of fysiotherapeut." },
      { type: "cta" },
    ],
    inlineCta: {
      title: "Weten waar je kunt beginnen?",
      text: "De Trainingsdoel-check geeft je een passend startritme en een eerste stap.",
      cta: leadmagnetCta,
    },
    conclusion: "Rustig weer beginnen is geen stap terug, maar de snelste weg naar een ritme dat blijft.",
    related: ["hoe-vaak-trainen-met-weinig-tijd", "consistentie-boven-motivatie"],
  },
];
