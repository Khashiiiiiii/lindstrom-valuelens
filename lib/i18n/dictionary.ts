// The EN, SV and FI strings for the dashboard and the PowerPoint deck, ported from the prototype's
// variant-d-dict.js (#25). An agent reviewed every SV and FI string against the term list and rules in #20. No
// native speaker has checked them.
//
// A key is the English string, or the JSON id of a data value such as "energy_recovery". Where one English
// string needs two translations, the key takes a context suffix such as "_owner" or "_unit". An entry sets `en`
// only when the English text differs from the key. Caveats, transparency texts, the suggested prompts and
// assistant replies stay English and have no entry here.

/** A text with a count: the "one" and "other" forms that Intl.PluralRules picks between. */
export interface Plural {
  one: string;
  other: string;
}

export type Text = string | Plural;

export interface Entry {
  en?: Text;
  sv?: Text;
  fi?: Text;
}

export const AI_TRANSLATION_NOTE = "AI translation. Caveats and assistant answers are in English.";

export const DICTIONARY = {
  // Navigation and header
  "Overview": { sv: "Översikt", fi: "Yleiskatsaus" },
  "Sites": { sv: "Anläggningar", fi: "Toimipaikat" },
  "Opportunities": { sv: "Möjligheter", fi: "Mahdollisuudet" },
  "Priorities": { sv: "Prioriteringar", fi: "Painopisteet" },
  "Customer priorities": { sv: "Kundens prioriteringar", fi: "Asiakkaan painopisteet" },
  "Data and assumptions": { sv: "Data och antaganden", fi: "Tiedot ja oletukset" },
  "Dashboard": { sv: "Instrumentpanel", fi: "Koontinäyttö" },
  "Export": { sv: "Exportera", fi: "Vienti" },
  "Synthetic data, 2025": { sv: "Syntetisk data, 2025", fi: "Synteettinen data, 2025" },
  "KAM view": { sv: "KAM-vy", fi: "KAM-näkymä" },
  "Customer view": { sv: "Kundvy", fi: "Asiakasnäkymä" },
  "Month": { sv: "Månad", fi: "Kuukausi" },
  "Site": { sv: "Anläggning", fi: "Toimipaikka" },
  "Customer": { sv: "Kund", fi: "Asiakas" },
  "Collapse menu": { sv: "Fäll ihop menyn", fi: "Pienennä valikko" },
  "Expand menu": { sv: "Fäll ut menyn", fi: "Laajenna valikko" },
  "Language": { sv: "Språk", fi: "Kieli" },
  "Theme": { sv: "Tema", fi: "Teema" },
  "Light": { sv: "Ljust", fi: "Vaalea" },
  "Dark": { sv: "Mörkt", fi: "Tumma" },
  "Colours": { sv: "Färger", fi: "Värit" },
  "Indigo": { sv: "Indigo", fi: "Indigo" },
  "Lindström-style": { sv: "Lindström-stil", fi: "Lindström-tyyli" },
  "Key Account Manager": { sv: "Key Account Manager", fi: "Avainasiakaspäällikkö" },
  "Sign out": { sv: "Logga ut", fi: "Kirjaudu ulos" },
  "This page comes in a later build.": {
    sv: "Den här sidan kommer i en senare version.",
    fi: "Tämä sivu tulee myöhemmässä versiossa.",
  },
  "Loading...": { sv: "Läser in...", fi: "Ladataan..." },
  [AI_TRANSLATION_NOTE]: {
    sv: "AI-översättning. Förbehåll och assistentens svar är på engelska.",
    fi: "Tekoälykäännös. Varaumat ja avustajan vastaukset ovat englanniksi.",
  },

  // Overview
  "Common indicators": { sv: "Gemensamma nyckeltal", fi: "Yhteiset tunnusluvut" },
  "Your priorities": { sv: "Era prioriteringar", fi: "Painopisteenne" },
  "Edit priorities": { sv: "Redigera prioriteringar", fi: "Muokkaa painopisteitä" },
  "No fired signal for this priority.": {
    sv: "Ingen utlöst signal för den här prioriteringen.",
    fi: "Tälle painopisteelle ei ole lauennutta signaalia.",
  },
  "fired results across {n} signals": {
    en: { one: "fired results across {n} signal", other: "fired results across {n} signals" },
    sv: { one: "utlösta resultat i {n} signal", other: "utlösta resultat i {n} signaler" },
    fi: "lauennutta tulosta {n} signaalissa",
  },
  "Top: {x}": { sv: "Främst: {x}", fi: "Kärjessä: {x}" },
  "Signals judge all of 2025.": { sv: "Signalerna bedömer hela 2025.", fi: "Signaalit arvioivat koko vuoden 2025." },
  "Account health": { sv: "Kundhälsa", fi: "Asiakkuuden tila" },
  "Dashboard emphasis (illustrative)": { sv: "Panelens tyngdpunkt (exempel)", fi: "Näkymän painotus (esimerkki)" },
  "KAM view only": { sv: "Endast KAM-vy", fi: "Vain KAM-näkymä" },
  "green": { sv: "grön", fi: "vihreä" },
  "amber": { sv: "gul", fi: "keltainen" },
  "red": { sv: "röd", fi: "punainen" },
  "not_rated": { en: "not rated", sv: "ej bedömd", fi: "ei arvioitu" },
  "{n} caveat(s)": {
    en: { one: "{n} caveat", other: "{n} caveats" },
    sv: "{n} förbehåll",
    fi: { one: "{n} varauma", other: "{n} varaumaa" },
  },

  // Data statuses
  "SYNTHETIC": { sv: "SYNTETISK", fi: "SYNTEETTINEN" },
  "SYNTHETIC_ESTIMATE": { en: "SYNTHETIC ESTIMATE", sv: "SYNTETISK UPPSKATTNING", fi: "SYNTEETTINEN ARVIO" },
  "ALLOCATED_ESTIMATE_SYNTHETIC": {
    en: "ALLOCATED ESTIMATE, SYNTHETIC",
    sv: "FÖRDELAD UPPSKATTNING, SYNTETISK",
    fi: "KOHDISTETTU ARVIO, SYNTEETTINEN",
  },
  "SYNTHETIC_STRUCTURALLY_REPRESENTATIVE": {
    en: "SYNTHETIC, STRUCTURALLY REPRESENTATIVE",
    sv: "SYNTETISK, STRUKTURELLT REPRESENTATIV",
    fi: "SYNTEETTINEN, RAKENTEELTAAN EDUSTAVA",
  },
  "PUBLIC_REFERENCE": { en: "PUBLIC REFERENCE", sv: "OFFENTLIG REFERENS", fi: "JULKINEN VERTAILUTIETO" },
  "TEAM_ASSUMPTION": { en: "TEAM ASSUMPTION", sv: "TEAMETS ANTAGANDE", fi: "TIIMIN OLETUS" },
  "Data status": { sv: "Datastatus", fi: "Tietojen tila" },
  "Counted directly in the synthetic data.": {
    sv: "Räknat direkt i den syntetiska datan.",
    fi: "Laskettu suoraan synteettisestä datasta.",
  },
  "Calculated with factors from the synthetic data.": {
    sv: "Beräknat med faktorer från den syntetiska datan.",
    fi: "Laskettu synteettisen datan kertoimilla.",
  },
  "The Customer's share of laundry totals, calculated with factors.": {
    sv: "Kundens andel av tvätteriets totaler, beräknad med faktorer.",
    fi: "Asiakkaan osuus pesulan kokonaismääristä kertoimilla laskettuna.",
  },

  // Charts
  "Monthly trend": { sv: "Månadsutveckling", fi: "Kuukausikehitys" },
  "Months in the selected period are highlighted.": {
    sv: "Månaderna i vald period är markerade.",
    fi: "Valitun jakson kuukaudet on korostettu.",
  },
  "of sampled service cycles on time": {
    sv: "av stickprovets servicecykler i tid",
    fi: "otoksen palvelukierroksista ajallaan",
  },
  "Green from {g}, amber from {a}": { sv: "Grön från {g}, gul från {a}", fi: "Vihreä alkaen {g}, keltainen alkaen {a}" },
  "Median hours per stage, by month": {
    sv: "Mediantimmar per steg och månad",
    fi: "Mediaanitunnit vaiheittain kuukausittain",
  },
  "Compare Sites": { sv: "Jämför anläggningar", fi: "Vertaa toimipaikkoja" },
  "recycling": { en: "Recycling", sv: "Återvinning", fi: "Kierrätys" },
  "reuse": { en: "Reuse", sv: "Återanvändning", fi: "Uudelleenkäyttö" },
  "energy_recovery": { en: "Energy recovery", sv: "Energiåtervinning", fi: "Energiahyötykäyttö" },
  "incineration": { en: "Incineration", sv: "Förbränning", fi: "Poltto" },
  // Repair types, as the workbook writes them (breakdown repair_type)
  "BUTTON": { en: "Button", sv: "Knapp", fi: "Nappi" },
  "DARNING / PATCHING": { en: "Darning and patching", sv: "Stoppning och lagning", fi: "Parsinta ja paikkaus" },
  "OTHER ACCESSORIES": { en: "Other accessories", sv: "Övriga tillbehör", fi: "Muut tarvikkeet" },
  "OTHER SEAM STITCHING": { en: "Other seam stitching", sv: "Övriga sömmar", fi: "Muut saumat" },
  "ZIPPER": { en: "Zipper", sv: "Blixtlås", fi: "Vetoketju" },
  // Emission sources (breakdown emission_source)
  "process": { en: "Laundry process", sv: "Tvättprocess", fi: "Pesuprosessi" },
  "delivery": { en: "Delivery transport", sv: "Leveranstransporter", fi: "Toimituskuljetukset" },
  "pickup_to_in_laundry": { en: "Pickup to laundry", sv: "Upphämtning till tvätteri", fi: "Noudosta pesulaan" },
  "in_laundry_to_out_laundry": { en: "In the laundry", sv: "I tvätteriet", fi: "Pesulassa" },
  "out_laundry_to_delivered": { en: "Laundry to delivery", sv: "Tvätteri till leverans", fi: "Pesulasta toimitukseen" },
  "total": { sv: "totalt", fi: "yhteensä" },

  // Sites, opportunities, priorities, data
  "Click a Site to filter every page to it. Columns follow the priority blocks.": {
    sv: "Klicka på en anläggning för att filtrera alla sidor till den. Kolumnerna följer prioriteringsblocken.",
    fi: "Napsauta toimipaikkaa rajataksesi kaikki sivut siihen. Sarakkeet seuraavat painopistelohkoja.",
  },
  "Fired signals": { sv: "Utlösta signaler", fi: "Lauenneet signaalit" },
  "Loading Sites...": { sv: "Läser in anläggningar...", fi: "Ladataan toimipaikkoja..." },
  "Signal groups": { sv: "Signalgrupper", fi: "Signaaliryhmät" },
  "ranked by your priorities, then by gap": {
    sv: "rangordnade efter era prioriteringar, sedan efter avvikelse",
    fi: "järjestetty painopisteidenne ja sitten eron mukaan",
  },
  "No fired signals.": { sv: "Inga utlösta signaler.", fi: "Ei lauenneita signaaleja." },
  "Proposed next steps": { sv: "Föreslagna nästa steg", fi: "Ehdotetut jatkotoimet" },
  "Proposed, to be agreed in the meeting.": {
    sv: "Förslag, att komma överens om på mötet.",
    fi: "Ehdotus, sovitaan kokouksessa.",
  },
  "rank {r}, {n} result(s), matches {p}": {
    en: { one: "rank {r}, {n} result, matches {p}", other: "rank {r}, {n} results, matches {p}" },
    sv: "rang {r}, {n} resultat, matchar {p}",
    fi: { one: "sija {r}, {n} tulos, vastaa: {p}", other: "sija {r}, {n} tulosta, vastaa: {p}" },
  },
  "no priority": { sv: "ingen prioritering", fi: "ei painopistettä" },
  "Lever": { sv: "Åtgärd", fi: "Toimenpide" },
  "Add:": { sv: "Lägg till:", fi: "Lisää:" },
  "The first 3 make the priority blocks.": {
    sv: "De tre första blir prioriteringsblocken.",
    fi: "Kolme ensimmäistä muodostavat painopistelohkot.",
  },
  "Reset to default": { sv: "Återställ standard", fi: "Palauta oletus" },
  "Changes apply at once to Overview, Sites and Opportunities. The AI assistant can also change them, and you can undo that.": {
    sv: "Ändringarna gäller direkt i Översikt, Anläggningar och Möjligheter. AI-assistenten kan också ändra dem, och du kan ångra det.",
    fi: "Muutokset näkyvät heti Yleiskatsauksessa, Toimipaikoissa ja Mahdollisuuksissa. Tekoälyavustaja voi myös muuttaa niitä, ja voit perua muutoksen.",
  },
  "Customer version shown. The KAM version adds factors, thresholds and guards.": {
    sv: "Kundversionen visas. KAM-versionen lägger till faktorer, tröskelvärden och spärrar.",
    fi: "Näytetään asiakasversio. KAM-versio lisää kertoimet, kynnysarvot ja suojaukset.",
  },

  // Assistant
  "AI assistant": { sv: "AI-assistent", fi: "Tekoälyavustaja" },
  "Ask": { sv: "Fråga", fi: "Kysy" },
  "Observations": { sv: "Observationer", fi: "Havainnot" },
  "AI observation {n}": { sv: "AI-observation {n}", fi: "Tekoälyhavainto {n}" },
  "Generate observations": { sv: "Skapa observationer", fi: "Luo havainnot" },
  "Try one of these:": { sv: "Prova någon av dessa:", fi: "Kokeile jotakin näistä:" },
  "Ask about {x}...": { sv: "Fråga om {x}...", fi: "Kysy asiakkaasta {x}..." },
  "Each question stands alone.": { sv: "Varje fråga besvaras för sig.", fi: "Jokainen kysymys käsitellään erikseen." },
  "Working... {n} s": { sv: "Arbetar... {n} s", fi: "Käsitellään... {n} s" },
  "Try again": { sv: "Försök igen", fi: "Yritä uudelleen" },
  "Priorities changed to {x}.": { sv: "Prioriteringarna ändrades till {x}.", fi: "Painopisteet muutettiin: {x}." },
  "Priorities changed by the assistant.": {
    sv: "Assistenten ändrade prioriteringarna.",
    fi: "Avustaja muutti painopisteitä.",
  },
  "Undo": { sv: "Ångra", fi: "Peru" },
  "Numbers not found in the sources: {x}": {
    sv: "Siffror som inte finns i källorna: {x}",
    fi: "Luvut, joita ei löydy lähteistä: {x}",
  },
  "{n} source(s)": {
    en: { one: "{n} source", other: "{n} sources" },
    sv: { one: "{n} källa", other: "{n} källor" },
    fi: { one: "{n} lähde", other: "{n} lähdettä" },
  },
  "No AI observations yet. They appear only when you click \"Generate observations\".": {
    sv: "Inga AI-observationer än. De visas först när du klickar på \"Skapa observationer\".",
    fi: "Ei vielä tekoälyhavaintoja. Ne näkyvät vasta, kun napsautat \"Luo havainnot\".",
  },

  // Priority names
  "Water": { sv: "Vatten", fi: "Vesi" },
  "Emissions": { sv: "Utsläpp", fi: "Päästöt" },
  "Circularity": { sv: "Cirkularitet", fi: "Kiertotalous" },
  "Service reliability": { sv: "Leveranssäkerhet", fi: "Toimitusvarmuus" },
  "Garment utilisation": { sv: "Plaggutnyttjande", fi: "Vaatteiden käyttöaste" },
  "Traceability": { sv: "Spårbarhet", fi: "Jäljitettävyys" },
  "Improvement": { sv: "Förbättring", fi: "Parannus" },

  // Tile and KPI names
  "Site count": { sv: "Antal anläggningar", fi: "Toimipaikkojen määrä" },
  "Optimisation potential": { sv: "Optimeringspotential", fi: "Optimointipotentiaali" },
  "Emissions saved and Water saved": { sv: "Sparade utsläpp och sparat vatten", fi: "Säästetyt päästöt ja säästetty vesi" },
  "On-time service cycle share": { sv: "Andel servicecykler i tid", fi: "Ajallaan toteutuneiden palvelukierrosten osuus" },
  "Late service cycles": { sv: "Försenade servicecykler", fi: "Myöhästyneet palvelukierrokset" },
  "Turnaround hours, median": { sv: "Genomloppstid i timmar, median", fi: "Läpimenoaika tunteina, mediaani" },
  "Turnaround hours, 90th percentile": {
    sv: "Genomloppstid i timmar, 90:e percentilen",
    fi: "Läpimenoaika tunteina, 90. persentiili",
  },
  "Turnaround by stage": { sv: "Genomloppstid per steg", fi: "Läpimenoaika vaiheittain" },
  "Service requests": { sv: "Serviceärenden", fi: "Palvelupyynnöt" },
  "Service requests per 100 wearers": { sv: "Serviceärenden per 100 bärare", fi: "Palvelupyynnöt 100 käyttäjää kohden" },
  "Service-request-free Site-months": {
    sv: "Anläggningsmånader utan serviceärenden",
    fi: "Toimipaikkakuukaudet ilman palvelupyyntöjä",
  },
  "Active wearers": { sv: "Aktiva bärare", fi: "Aktiiviset käyttäjät" },
  "Garments per wearer": { sv: "Plagg per bärare", fi: "Vaatteita käyttäjää kohden" },
  "Scan coverage": { sv: "Skanningstäckning", fi: "Skannauskattavuus" },
  "Allocated garments with no scan activity": { sv: "Tilldelade plagg utan skanningar", fi: "Kohdistetut vaatteet ilman skannauksia" },
  "Washes per garment": { sv: "Tvättar per plagg", fi: "Pesukerrat vaatetta kohden" },
  "Garments in circulation": { sv: "Plagg i omlopp", fi: "Kierrossa olevat vaatteet" },
  "Repairs": { sv: "Reparationer", fi: "Korjaukset" },
  "Repair rate": { sv: "Reparationsgrad", fi: "Korjausaste" },
  "Replacements postponed (estimated)": {
    sv: "Uppskjutna ersättningsplagg (uppskattat)",
    fi: "Lykätyt korvaushankinnat (arvio)",
  },
  "Avoided product CO2e (estimated)": {
    sv: "Undvikna produktutsläpp, CO2e (uppskattat)",
    fi: "Vältetyt tuotepäästöt, CO2e (arvio)",
  },
  "Textile waste (allocated)": { sv: "Textilavfall (fördelat)", fi: "Tekstiilijäte (kohdistettu)" },
  "Textile waste by treatment route": { sv: "Textilavfall per behandlingsväg", fi: "Tekstiilijäte käsittelytavoittain" },
  "Recycled or reused share": { sv: "Andel återvunnet eller återanvänt", fi: "Kierrätetty tai uudelleenkäytetty osuus" },
  "Textile waste diverted from mixed waste (estimated)": {
    sv: "Textilavfall som inte gick till blandat avfall (uppskattat)",
    fi: "Sekajätteestä ohjattu tekstiilijäte (arvio)",
  },
  "Washed kg": { sv: "Tvättade kg", fi: "Pestyt kilot" },
  "Water use (allocated)": { sv: "Vattenförbrukning (fördelad)", fi: "Vedenkulutus (kohdistettu)" },
  "Energy use (allocated)": { sv: "Energiförbrukning (fördelad)", fi: "Energiankulutus (kohdistettu)" },
  "Emissions (allocated)": { sv: "Utsläpp (fördelade)", fi: "Päästöt (kohdistetut)" },
  "Water saved": { sv: "Sparat vatten", fi: "Säästetty vesi" },
  "Energy saved": { sv: "Sparad energi", fi: "Säästetty energia" },
  "Emissions saved": { sv: "Sparade utsläpp", fi: "Säästetyt päästöt" },
  "Improvement on-time service cycles": {
    sv: "Förbättring, servicecykler i tid",
    fi: "Parannus, ajallaan toteutuneet palvelukierrokset",
  },
  "Improvement service requests": { sv: "Förbättring, serviceärenden", fi: "Parannus, palvelupyynnöt" },
  "Improvement scan coverage": { sv: "Förbättring, skanningstäckning", fi: "Parannus, skannauskattavuus" },
  "Account health on-time service cycle share": {
    sv: "Kundhälsa, andel servicecykler i tid",
    fi: "Asiakkuuden tila, ajallaan toteutuneiden palvelukierrosten osuus",
  },
  "Account health service requests per 100 wearers per month": {
    sv: "Kundhälsa, serviceärenden per 100 bärare och månad",
    fi: "Asiakkuuden tila, palvelupyynnöt 100 käyttäjää kohden kuukaudessa",
  },
  "Account health scan coverage": { sv: "Kundhälsa, skanningstäckning", fi: "Asiakkuuden tila, skannauskattavuus" },

  // Units. The value picks the form, for example t(lang, "Sites_unit", { n: 24 }) or dataLabel(lang, "hours", 1).
  "Sites_unit": {
    en: { one: "Site", other: "Sites" },
    sv: { one: "anläggning", other: "anläggningar" },
    fi: { one: "toimipaikka", other: "toimipaikkaa" },
  },
  "wearers": {
    en: { one: "wearer", other: "wearers" },
    sv: "bärare",
    fi: { one: "käyttäjä", other: "käyttäjää" },
  },
  "count": { sv: "st", fi: "kpl" },
  "hours": {
    en: { one: "hour", other: "hours" },
    sv: { one: "timme", other: "timmar" },
    fi: { one: "tunti", other: "tuntia" },
  },
  "garments": {
    en: { one: "garment", other: "garments" },
    sv: "plagg",
    fi: { one: "vaate", other: "vaatetta" },
  },
  "garments per wearer": {
    en: { one: "garment per wearer", other: "garments per wearer" },
    sv: "plagg per bärare",
    fi: { one: "vaate käyttäjää kohden", other: "vaatetta käyttäjää kohden" },
  },
  "per 100 wearers per month": { sv: "per 100 bärare och månad", fi: "100 käyttäjää kohden kuukaudessa" },
  "washes per garment per month": {
    en: { one: "wash per garment per month", other: "washes per garment per month" },
    sv: { one: "tvätt per plagg och månad", other: "tvättar per plagg och månad" },
    fi: { one: "pesu vaatetta kohden kuukaudessa", other: "pesua vaatetta kohden kuukaudessa" },
  },
  "per 1,000 packed pieces": { sv: "per 1 000 packade plagg", fi: "1 000 pakattua kappaletta kohden" },
  "share": { sv: "andel", fi: "osuus" },
  "rating": { sv: "bedömning", fi: "arvio" },
  // The symbols read the same in all 3 languages. The entries say so, so the dev warning stays quiet.
  "kg": { sv: "kg", fi: "kg" },
  "l": { sv: "l", fi: "l" },
  "kWh": { sv: "kWh", fi: "kWh" },
  "kg CO2e": { sv: "kg CO2e", fi: "kg CO2e" },
  "kg per active wearer": { sv: "kg per aktiv bärare", fi: "kg aktiivista käyttäjää kohden" },
  "l per active wearer": { sv: "l per aktiv bärare", fi: "l aktiivista käyttäjää kohden" },
  "kWh per active wearer": { sv: "kWh per aktiv bärare", fi: "kWh aktiivista käyttäjää kohden" },
  "kg CO2e per active wearer": { sv: "kg CO2e per aktiv bärare", fi: "kg CO2e aktiivista käyttäjää kohden" },

  // Signal names, levers and lever owners (opportunity-signals.json). Peers are the Customer's other Sites
  // (ADR 0008).
  "Garment allocation above peers": {
    sv: "Högre plaggtilldelning än kundens övriga anläggningar",
    fi: "Suurempi vaatemitoitus kuin asiakkaan muissa toimipaikoissa",
  },
  "Allocated garments with no scan activity above peers": {
    sv: "Fler tilldelade plagg utan skanningar än kundens övriga anläggningar",
    fi: "Enemmän skannaamattomia kohdistettuja vaatteita kuin asiakkaan muissa toimipaikoissa",
  },
  "Washes per garment above peers": {
    sv: "Fler tvättar per plagg än kundens övriga anläggningar",
    fi: "Enemmän pesukertoja vaatetta kohden kuin asiakkaan muissa toimipaikoissa",
  },
  "Service request rate above peers": {
    sv: "Fler serviceärenden än kundens övriga anläggningar",
    fi: "Enemmän palvelupyyntöjä kuin asiakkaan muissa toimipaikoissa",
  },
  "Late service cycles above peers": {
    sv: "Fler försenade servicecykler än kundens övriga anläggningar",
    fi: "Enemmän myöhästyneitä palvelukierroksia kuin asiakkaan muissa toimipaikoissa",
  },
  "Repair rate above peers": {
    sv: "Högre reparationsgrad än kundens övriga anläggningar",
    fi: "Korkeampi korjausaste kuin asiakkaan muissa toimipaikoissa",
  },
  "Check wearer counts and spares, then right-size the allocation.": {
    sv: "Kontrollera antalet bärare och reservplagg och anpassa sedan tilldelningen.",
    fi: "Tarkista käyttäjämäärät ja varavaatteet ja mitoita sitten vaatemäärä oikein.",
  },
  "Check whether the garments are spares, not needed or missing scans.": {
    sv: "Kontrollera om plaggen är reserver, inte behövs eller saknar skanningar.",
    fi: "Tarkista, ovatko vaatteet varavaatteita, tarpeettomia vai puuttuuko niiltä skannauksia.",
  },
  "Review the Site's garment change routine.": {
    sv: "Se över anläggningens rutin för plaggbyte.",
    fi: "Käy läpi toimipaikan vaatteidenvaihtorutiini.",
  },
  "Review the Site's service requests with the Customer.": {
    sv: "Gå igenom anläggningens serviceärenden med kunden.",
    fi: "Käy toimipaikan palvelupyynnöt läpi asiakkaan kanssa.",
  },
  "Investigate the late cycles by stage.": {
    sv: "Undersök de försenade servicecyklerna per steg.",
    fi: "Selvitä myöhästyneet palvelukierrokset vaiheittain.",
  },
  "Check fit, working conditions and handling for that garment.": {
    sv: "Kontrollera passform, arbetsförhållanden och hantering för plagget.",
    fi: "Tarkista vaatteen istuvuus, työolosuhteet ja käsittely.",
  },
  "Customer_owner": { en: "Customer", sv: "kunden", fi: "asiakas" },
  "Lindström_owner": { en: "Lindström", sv: "Lindström", fi: "Lindström" },
  "Joint_owner": { en: "Joint", sv: "gemensamt", fi: "yhteinen" },
  "Owner: {x}": { sv: "Ansvarig: {x}", fi: "Vastuu: {x}" },

  // Baseline labels of the handprint KPIs (runKpi detail.baseline_label)
  "vs outsourced local laundry": {
    sv: "jämfört med lokalt tvätteri på entreprenad",
    fi: "verrattuna ulkoistettuun paikalliseen pesulaan",
  },
  "vs home washing": { sv: "jämfört med hemtvätt", fi: "verrattuna kotipesuun" },
  "vs in-house customer laundry": {
    sv: "jämfört med kundens eget tvätteri",
    fi: "verrattuna asiakkaan omaan pesulaan",
  },

  // Period comparison labels (period-comparisons.json)
  "better": { en: "Improved", sv: "Förbättrad", fi: "Parantunut" },
  "worse": { en: "Worse", sv: "Sämre", fi: "Heikentynyt" },
  "no_clear_change": { en: "No clear change", sv: "Ingen tydlig förändring", fi: "Ei selvää muutosta" },
  "not_evaluated": { en: "Not evaluated", sv: "Ej bedömd", fi: "Ei arvioitu" },

  // Export and review parts
  "PowerPoint deck": { sv: "PowerPoint-presentation", fi: "PowerPoint-esitys" },
  "Building PowerPoint...": { sv: "Skapar PowerPoint...", fi: "Luodaan PowerPointia..." },
  "{c}: annual review {p}": { sv: "{c}: årlig genomgång {p}", fi: "{c}: vuosikatselmus {p}" },
  "Evidence and value, {n}% of pages": { sv: "Underlag och värde, {n} % av sidorna", fi: "Näyttö ja arvo, {n} % sivuista" },
  "Future planning, {n}% of pages": {
    sv: "Framtida planering, {n} % av sidorna",
    fi: "Tulevaisuuden suunnittelu, {n} % sivuista",
  },
  "Follows the Customer view rules. No account health, no KAM-only items.": {
    sv: "Följer reglerna för kundvyn. Ingen kundhälsa och inget som bara gäller KAM-vyn.",
    fi: "Noudattaa asiakasnäkymän sääntöjä. Ei asiakkuuden tilaa eikä vain KAM-näkymän tietoja.",
  },
  "Look back": { sv: "Tillbakablick", fi: "Katsaus taaksepäin" },
  "Show value": { sv: "Visa värdet", fi: "Arvon osoittaminen" },
  "Build trust": { sv: "Bygga förtroende", fi: "Luottamuksen rakentaminen" },
  "Look forward": { sv: "Framåtblick", fi: "Katse eteenpäin" },
  "Agree actions": { sv: "Komma överens om åtgärder", fi: "Toimenpiteistä sopiminen" },

  // PowerPoint deck
  "ValueLens by Lindström": { sv: "ValueLens från Lindström", fi: "Lindströmin ValueLens" },
  "Annual value review": { sv: "Årlig värdegenomgång", fi: "Vuosittainen arvokatselmus" },
  "Prepared by {name}, Lindström": { sv: "Förberedd av {name}, Lindström", fi: "Valmistellut {name}, Lindström" },
  "Customer view. Synthetic data.": { sv: "Kundvy. Syntetisk data.", fi: "Asiakasnäkymä. Synteettinen data." },
  "Agenda": { sv: "Agenda", fi: "Asialista" },
  "Service performance and adoption": { sv: "Serviceprestanda och användning", fi: "Palvelun toimivuus ja käyttöönotto" },
  "Operational and sustainability value": {
    sv: "Operativt värde och hållbarhetsvärde",
    fi: "Toiminnallinen arvo ja kestävyysarvo",
  },
  "How we read the data": { sv: "Så läser vi datan", fi: "Näin luemme tiedot" },
  "Where to improve next": { sv: "Var vi kan förbättra härnäst", fi: "Missä parannamme seuraavaksi" },
  "Up to 3 proposed next steps": { sv: "Upp till 3 föreslagna nästa steg", fi: "Enintään 3 ehdotettua jatkotoimea" },
  "The year at a glance": { sv: "Året i korthet", fi: "Vuosi lyhyesti" },
  "Service performance": { sv: "Serviceprestanda", fi: "Palvelun toimivuus" },
  "Sustainability value": { sv: "Hållbarhetsvärde", fi: "Kestävyysarvo" },
  "Circularity and textile waste": { sv: "Cirkularitet och textilavfall", fi: "Kiertotalous ja tekstiilijäte" },
  "Washed kg per month": { sv: "Tvättade kg per månad", fi: "Pestyt kilot kuukausittain" },
  "On-time service cycle share per month": {
    sv: "Andel servicecykler i tid per månad",
    fi: "Ajallaan toteutuneiden palvelukierrosten osuus kuukausittain",
  },
  "Emissions saved per month, kg CO2e": {
    sv: "Sparade utsläpp per månad, kg CO2e",
    fi: "Säästetyt päästöt kuukausittain, kg CO2e",
  },
  "Full year 2025, by month.": { sv: "Hela 2025, per månad.", fi: "Koko vuosi 2025 kuukausittain." },
  "Largest gap to the Customer's other Sites, by signal": {
    sv: "Största avvikelse mot kundens övriga anläggningar, per signal",
    fi: "Suurin ero asiakkaan muihin toimipaikkoihin signaaleittain",
  },
  "Change from H1 to H2": { sv: "Förändring från H1 till H2", fi: "Muutos H1:stä H2:een" },
  "{n} result(s)": {
    en: { one: "{n} result", other: "{n} results" },
    sv: "{n} resultat",
    fi: { one: "{n} tulos", other: "{n} tulosta" },
  },
  "Every figure comes from synthetic 2025 data.": {
    sv: "Alla siffror kommer från syntetisk data för 2025.",
    fi: "Kaikki luvut perustuvat synteettiseen vuoden 2025 dataan.",
  },
  "Proposed by Lindström. We agree the final steps together in the meeting.": {
    sv: "Föreslaget av Lindström. Vi kommer överens om de slutliga stegen tillsammans på mötet.",
    fi: "Lindströmin ehdotus. Sovimme lopulliset toimet yhdessä kokouksessa.",
  },
  "Sites: {x}": { sv: "Anläggningar: {x}", fi: "Toimipaikat: {x}" },
  "Thank you": { sv: "Tack", fi: "Kiitos" },
  "Questions and discussion": { sv: "Frågor och diskussion", fi: "Kysymykset ja keskustelu" },
} satisfies Record<string, Entry>;
