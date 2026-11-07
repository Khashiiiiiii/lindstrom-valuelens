// PROTOTYPE, throw me away. EN, SV and FI strings for variant D and the PowerPoint export.
// Loaded as a plain script by the browser and imported by server.ts. Draft wording by the agent,
// not checked by a native speaker or against Lindström's own terms.

// I18N.en only holds labels for data keys such as "energy_recovery".
globalThis.I18N = { en: {}, sv: {}, fi: {} };
function add(en, sv, fi, enLabel) { I18N.sv[en] = sv; I18N.fi[en] = fi; if (enLabel) I18N.en[en] = enLabel; }

// Navigation and header
add("Overview", "Översikt", "Yleiskatsaus");
add("Sites", "Anläggningar", "Toimipaikat");
add("Opportunities", "Möjligheter", "Mahdollisuudet");
add("Priorities", "Prioriteringar", "Prioriteetit");
add("Customer priorities", "Kundens prioriteringar", "Asiakkaan prioriteetit");
add("Data and assumptions", "Data och antaganden", "Tiedot ja oletukset");
add("Dashboard", "Instrumentpanel", "Koontinäyttö");
add("Export", "Exportera", "Vienti");
add("Print review", "Skriv ut genomgången", "Tulosta katselmus");
add("Synthetic data, 2025", "Syntetisk data, 2025", "Synteettinen data, 2025");
add("KAM view", "KAM-vy", "KAM-näkymä");
add("Customer view", "Kundvy", "Asiakasnäkymä");
add("Month", "Månad", "Kuukausi");
add("Site", "Anläggning", "Toimipaikka");
add("Collapse menu", "Fäll ihop menyn", "Pienennä valikko");
add("Expand menu", "Fäll ut menyn", "Laajenna valikko");
add("Language", "Språk", "Kieli");
add("Theme", "Tema", "Teema");
add("Light", "Ljust", "Vaalea");
add("Dark", "Mörkt", "Tumma");
add("Colours", "Färger", "Värit");
add("Indigo", "Indigo", "Indigo");
add("Lindström-style", "Lindström-stil", "Lindström-tyyli");
add("Key Account Manager", "Key Account Manager", "Avainasiakaspäällikkö");
add("Sign out", "Logga ut", "Kirjaudu ulos");
add("Draft translation. Caveats, signal texts and assistant answers are still in English.",
  "Utkast till översättning. Förbehåll, signaltexter och assistentens svar är fortfarande på engelska.",
  "Käännösluonnos. Varaumat, signaalitekstit ja avustajan vastaukset ovat vielä englanniksi.");

// Overview
add("Common indicators", "Gemensamma nyckeltal", "Yhteiset tunnusluvut");
add("Your priorities", "Era prioriteringar", "Prioriteettinne");
add("Edit priorities", "Redigera prioriteringar", "Muokkaa prioriteetteja");
add("No fired signal for this priority.", "Ingen utlöst signal för den här prioriteringen.", "Tälle prioriteetille ei ole lauennutta signaalia.");
add("may be overstated", "kan vara överskattad", "voi olla yliarvioitu");
add("fired results across {n} signals", "utlösta resultat i {n} signaler", "lauennutta tulosta {n} signaalissa");
add("Top: {x}", "Främst: {x}", "Kärjessä: {x}");
add("Account health", "Kundhälsa", "Asiakkuuden tila");
add("Dashboard emphasis (illustrative)", "Panelens tyngdpunkt (exempel)", "Näkymän painotus (esimerkki)");
add("KAM view only", "Endast KAM-vy", "Vain KAM-näkymä");
add("Not evaluated", "Ej bedömd", "Ei arvioitu");
add("green", "grön", "vihreä"); add("amber", "gul", "keltainen"); add("red", "röd", "punainen"); add("not_rated", "ej bedömd", "ei arvioitu", "not rated");
add("{n} caveat(s)", "{n} förbehåll", "{n} varaumaa");
add("SYNTHETIC", "SYNTETISK", "SYNTEETTINEN");
add("SYNTHETIC_ESTIMATE", "SYNTETISK UPPSKATTNING", "SYNTEETTINEN ARVIO");
add("ALLOCATED_ESTIMATE_SYNTHETIC", "FÖRDELAD UPPSKATTNING, SYNTETISK", "KOHDISTETTU ARVIO, SYNTEETTINEN");

// Charts
add("Monthly trend", "Månadsutveckling", "Kuukausikehitys");
add("Months in the selected period are highlighted.", "Månaderna i vald period är markerade.", "Valitun jakson kuukaudet on korostettu.");
add("of sampled service cycles on time", "av stickprovets servicecykler i tid", "otoksen palvelukierroksista ajallaan");
add("Green from {g}, amber from {a}", "Grön från {g}, gul från {a}", "Vihreä alkaen {g}, keltainen alkaen {a}");
add("Median hours per stage, by month", "Mediantimmar per steg och månad", "Mediaanitunnit vaiheittain kuukausittain");
add("Laundry outcome, the Customer cannot influence the route mix.", "Tvätteriets utfall, kunden kan inte påverka fördelningen.", "Pesulan tulos, asiakas ei voi vaikuttaa jakaumaan.");
add("Compare Sites", "Jämför anläggningar", "Vertaa toimipaikkoja");
add("recycling", "Återvinning", "Kierrätys", "Recycling");
add("reuse", "Återanvändning", "Uudelleenkäyttö", "Reuse");
add("energy_recovery", "Energiåtervinning", "Energiahyödyntäminen", "Energy recovery");
add("incineration", "Förbränning", "Poltto", "Incineration");
add("pickup_to_in_laundry", "Upphämtning till tvätteri", "Noudosta pesulaan", "Pickup to laundry");
add("in_laundry_to_out_laundry", "I tvätteriet", "Pesulassa", "In the laundry");
add("out_laundry_to_delivered", "Tvätteri till leverans", "Pesulasta toimitukseen", "Laundry to delivery");
add("total", "totalt", "yhteensä");

// Sites, opportunities, priorities, data
add("Click a Site to filter every page to it. Columns follow the priority blocks.",
  "Klicka på en anläggning för att filtrera alla sidor till den. Kolumnerna följer prioriteringsblocken.",
  "Napsauta toimipaikkaa rajataksesi kaikki sivut siihen. Sarakkeet seuraavat prioriteettilohkoja.");
add("Fired signals", "Utlösta signaler", "Lauenneet signaalit");
add("Loading Sites...", "Läser in anläggningar...", "Ladataan toimipaikkoja...");
add("Signal groups", "Signalgrupper", "Signaaliryhmät");
add("ranked by your priorities, then by gap", "rangordnade efter era prioriteringar, sedan efter avvikelse", "järjestetty prioriteettien ja sitten eron mukaan");
add("No fired signals.", "Inga utlösta signaler.", "Ei lauenneita signaaleja.");
add("Proposed next steps", "Föreslagna nästa steg", "Ehdotetut jatkotoimet");
add("Proposed, to be agreed in the meeting.", "Förslag, att komma överens om på mötet.", "Ehdotus, sovitaan kokouksessa.");
add("rank {r}, {n} result(s), matches {p}", "rang {r}, {n} resultat, matchar {p}", "sija {r}, {n} tulosta, vastaa: {p}");
add("no priority", "ingen prioritering", "ei prioriteettia");
add("Lever", "Åtgärd", "Toimenpide");
add("Add:", "Lägg till:", "Lisää:");
add("The first 3 make the priority blocks.", "De tre första blir prioriteringsblocken.", "Kolme ensimmäistä muodostavat prioriteettilohkot.");
add("Reset to default", "Återställ standard", "Palauta oletus");
add("Changes apply at once to Overview, Sites and Opportunities. The AI assistant can also change them, and you can undo that.",
  "Ändringarna gäller direkt i Översikt, Anläggningar och Möjligheter. AI-assistenten kan också ändra dem, och du kan ångra det.",
  "Muutokset näkyvät heti Yleiskatsauksessa, Toimipaikoissa ja Mahdollisuuksissa. Tekoälyavustaja voi myös muuttaa niitä, ja voit perua muutoksen.");
add("Customer version shown. The KAM version adds factors, thresholds and guards.",
  "Kundversionen visas. KAM-versionen lägger till faktorer, tröskelvärden och spärrar.",
  "Näytetään asiakasversio. KAM-versio lisää kertoimet, kynnysarvot ja suojaukset.");

// Assistant
add("AI assistant", "AI-assistent", "Tekoälyavustaja");
add("Ask", "Fråga", "Kysy");
add("Observations", "Observationer", "Havainnot");
add("AI observation {n}", "AI-observation {n}", "Tekoälyhavainto {n}");
add("Generate observations", "Skapa observationer", "Luo havainnot");
add("Try one of these:", "Prova någon av dessa:", "Kokeile jotakin näistä:");
add("Ask about {x}...", "Fråga om {x}...", "Kysy asiakkaasta {x}...");
add("Each question stands alone.", "Varje fråga besvaras för sig.", "Jokainen kysymys käsitellään erikseen.");
add("Working... {n} s", "Arbetar... {n} s", "Käsitellään... {n} s");
add("Try again", "Försök igen", "Yritä uudelleen");
add("Priorities changed to {x}.", "Prioriteringarna ändrades till {x}.", "Prioriteetit muutettiin: {x}.");
add("Priorities changed by the assistant.", "Assistenten ändrade prioriteringarna.", "Avustaja muutti prioriteetteja.");
add("Undo", "Ångra", "Peru");
add("Numbers not found in the sources: {x}", "Siffror som inte finns i källorna: {x}", "Luvut, joita ei löydy lähteistä: {x}");
add("{n} source(s)", "{n} källor", "{n} lähdettä");
add("No AI observations yet. They appear only when you click \"Generate observations\".",
  "Inga AI-observationer än. De visas först när du klickar på \"Skapa observationer\".",
  "Ei vielä tekoälyhavaintoja. Ne näkyvät vasta, kun napsautat \"Luo havainnot\".");

// Priority names
add("Water", "Vatten", "Vesi");
add("Emissions", "Utsläpp", "Päästöt");
add("Circularity", "Cirkularitet", "Kiertotalous");
add("Service reliability", "Leveranssäkerhet", "Palvelun luotettavuus");
add("Garment utilisation", "Plaggutnyttjande", "Vaatteiden käyttöaste");
add("Traceability", "Spårbarhet", "Jäljitettävyys");
add("Improvement", "Förbättring", "Parannus");

// Tile and KPI names
add("Site count", "Antal anläggningar", "Toimipaikkojen määrä");
add("Optimisation potential", "Optimeringspotential", "Optimointipotentiaali");
add("Emissions saved and Water saved", "Sparade utsläpp och sparat vatten", "Säästetyt päästöt ja säästetty vesi");
add("On-time service cycle share", "Andel servicecykler i tid", "Ajallaan toteutuneiden palvelukierrosten osuus");
add("Late service cycles", "Försenade servicecykler", "Myöhästyneet palvelukierrokset");
add("Turnaround hours, median", "Genomloppstid i timmar, median", "Läpimenoaika tunteina, mediaani");
add("Turnaround hours, 90th percentile", "Genomloppstid i timmar, 90:e percentilen", "Läpimenoaika tunteina, 90. persentiili");
add("Turnaround by stage", "Genomloppstid per steg", "Läpimenoaika vaiheittain");
add("Service requests", "Serviceärenden", "Palvelupyynnöt");
add("Service requests per 100 wearers", "Serviceärenden per 100 bärare", "Palvelupyynnöt 100 käyttäjää kohden");
add("Service-request-free Site-months", "Anläggningsmånader utan serviceärenden", "Toimipaikkakuukaudet ilman palvelupyyntöjä");
add("Active wearers", "Aktiva bärare", "Aktiiviset käyttäjät");
add("Garments per wearer", "Plagg per bärare", "Vaatteita käyttäjää kohden");
add("Scan coverage", "Skanningstäckning", "Skannauskattavuus");
add("Allocated garments with no scan activity", "Tilldelade plagg utan skanningar", "Kohdistetut vaatteet ilman skannauksia");
add("Washes per garment", "Tvättar per plagg", "Pesukerrat vaatetta kohden");
add("Garments in circulation", "Plagg i omlopp", "Kierrossa olevat vaatteet");
add("Repairs", "Reparationer", "Korjaukset");
add("Repair rate", "Reparationsgrad", "Korjausaste");
add("Replacements postponed (estimated)", "Uppskjutna ersättningsplagg (uppskattat)", "Lykätyt korvaushankinnat (arvio)");
add("Avoided product CO2e (estimated)", "Undvikna produktutsläpp, CO2e (uppskattat)", "Vältetyt tuotepäästöt, CO2e (arvio)");
add("Textile waste (allocated)", "Textilavfall (fördelat)", "Tekstiilijäte (kohdistettu)");
add("Textile waste by treatment route", "Textilavfall per behandlingsväg", "Tekstiilijäte käsittelytavoittain");
add("Recycled or reused share", "Andel återvunnet eller återanvänt", "Kierrätetty tai uudelleenkäytetty osuus");
add("Textile waste diverted from mixed waste (estimated)", "Textilavfall som inte gick till blandat avfall (uppskattat)", "Sekajätteestä ohjattu tekstiilijäte (arvio)");
add("Washed kg", "Tvättade kg", "Pestyt kilot");
add("Water use (allocated)", "Vattenförbrukning (fördelad)", "Vedenkulutus (kohdistettu)");
add("Energy use (allocated)", "Energiförbrukning (fördelad)", "Energiankulutus (kohdistettu)");
add("Emissions (allocated)", "Utsläpp (fördelade)", "Päästöt (kohdistetut)");
add("Water saved", "Sparat vatten", "Säästetty vesi");
add("Energy saved", "Sparad energi", "Säästetty energia");
add("Emissions saved", "Sparade utsläpp", "Säästetyt päästöt");
add("Improvement on-time service cycles", "Förbättring, servicecykler i tid", "Parannus, ajallaan toteutuneet palvelukierrokset");
add("Improvement service requests", "Förbättring, serviceärenden", "Parannus, palvelupyynnöt");
add("Improvement scan coverage", "Förbättring, skanningstäckning", "Parannus, skannauskattavuus");

// Units
add("Sites_unit", "anläggningar", "toimipaikkaa", "Sites");
add("wearers", "bärare", "käyttäjää");
add("count", "st", "kpl");
add("hours", "timmar", "tuntia");
add("garments", "plagg", "vaatetta");
add("garments per wearer", "plagg per bärare", "vaatetta käyttäjää kohden");
add("per 100 wearers per month", "per 100 bärare och månad", "100 käyttäjää kohden kuukaudessa");
add("washes per garment per month", "tvättar per plagg och månad", "pesua vaatetta kohden kuukaudessa");
add("per 1,000 packed pieces", "per 1 000 packade plagg", "1 000 pakattua kappaletta kohden");

// Signal names and levers (opportunity-signals catalogue)
add("Garment allocation above peers", "Plaggtilldelning över jämförbara", "Vaatemitoitus vertailuryhmää suurempi");
add("Allocated garments with no scan activity above peers", "Fler tilldelade plagg utan skanningar än jämförbara", "Skannaamattomia kohdistettuja vaatteita enemmän kuin vertailuryhmässä");
add("Washes per garment above peers", "Fler tvättar per plagg än jämförbara", "Pesukertoja vaatetta kohden enemmän kuin vertailuryhmässä");
add("Service request rate above peers", "Fler serviceärenden än jämförbara", "Palvelupyyntöjä enemmän kuin vertailuryhmässä");
add("Late service cycles above peers", "Fler försenade servicecykler än jämförbara", "Myöhästyneitä palvelukierroksia enemmän kuin vertailuryhmässä");
add("Repair rate above peers", "Högre reparationsgrad än jämförbara", "Korjausaste vertailuryhmää korkeampi");
add("Check wearer counts and spares, then right-size the allocation.", "Kontrollera antalet bärare och reservplagg och anpassa sedan tilldelningen.", "Tarkista käyttäjämäärät ja varavaatteet ja mitoita sitten vaatemäärä oikein.");
add("Check whether the garments are spares, not needed or missing scans.", "Kontrollera om plaggen är reserver, inte behövs eller saknar skanningar.", "Tarkista, ovatko vaatteet varavaatteita, tarpeettomia vai puuttuuko niiltä skannauksia.");
add("Review the Site's garment change routine.", "Se över anläggningens rutin för plaggbyte.", "Käy läpi toimipaikan vaatteidenvaihtorutiini.");
add("Review the Site's service requests with the Customer.", "Gå igenom anläggningens serviceärenden med kunden.", "Käy toimipaikan palvelupyynnöt läpi asiakkaan kanssa.");
add("Investigate the late cycles by stage.", "Undersök de försenade cyklerna per steg.", "Selvitä myöhästyneet kierrokset vaiheittain.");
add("Check fit, working conditions and handling for that garment.", "Kontrollera passform, arbetsförhållanden och hantering för plagget.", "Tarkista vaatteen istuvuus, työolosuhteet ja käsittely.");
add("Joint", "Gemensamt", "Yhteinen");
add("Customer", "Kunden", "Asiakas");
add("vs outsourced local laundry", "jämfört med lokalt tvätteri på entreprenad", "verrattuna ulkoistettuun paikalliseen pesulaan");
add("Draft translation. Caveats and assistant answers are still in English.", "Utkast till översättning. Förbehåll och assistentens svar är fortfarande på engelska.", "Käännösluonnos. Varaumat ja avustajan vastaukset ovat vielä englanniksi.");

// Export and review page
add("PowerPoint deck", "PowerPoint-presentation", "PowerPoint-esitys");
add("Building PowerPoint...", "Skapar PowerPoint...", "Luodaan PowerPointia...");
add("Back to dashboard", "Tillbaka till panelen", "Takaisin koontinäyttöön");
add("Save as PDF", "Spara som PDF", "Tallenna PDF:ksi");
add("{c}: annual review {p}", "{c}: årlig genomgång {p}", "{c}: vuosikatselmus {p}");
add("Evidence and value, {n}% of pages", "Underlag och värde, {n} % av sidorna", "Näyttö ja arvo, {n} % sivuista");
add("Future planning, {n}% of pages", "Framtida planering, {n} % av sidorna", "Tulevaisuuden suunnittelu, {n} % sivuista");
add("Follows the Customer view rules. No account health, no KAM-only items.", "Följer reglerna för kundvyn. Ingen kundhälsa och inget som bara gäller KAM-vyn.", "Noudattaa asiakasnäkymän sääntöjä. Ei asiakkuuden tilaa eikä vain KAM-näkymän tietoja.");
add("Look back", "Tillbakablick", "Katsaus taaksepäin");
add("Show value", "Visa värdet", "Arvon osoittaminen");
add("Build trust", "Bygga förtroende", "Luottamuksen rakentaminen");
add("Look forward", "Framåtblick", "Katse eteenpäin");
add("Agree actions", "Komma överens om åtgärder", "Toimenpiteistä sopiminen");

// PowerPoint deck
add("ValueLens by Lindström", "ValueLens från Lindström", "Lindströmin ValueLens");
add("Annual value review", "Årlig värdegenomgång", "Vuosittainen arvokatselmus");
add("Prepared by {name}, Lindström", "Förberedd av {name}, Lindström", "Valmistellut {name}, Lindström");
add("Customer view. Synthetic data.", "Kundvy. Syntetisk data.", "Asiakasnäkymä. Synteettinen data.");
add("Agenda", "Agenda", "Asialista");
add("Service performance and adoption", "Serviceprestanda och användning", "Palvelun toimivuus ja käyttöönotto");
add("Operational and sustainability value", "Operativt värde och hållbarhetsvärde", "Toiminnallinen arvo ja kestävyysarvo");
add("How we read the data", "Så läser vi datan", "Näin luemme tiedot");
add("Where to improve next", "Var vi kan förbättra härnäst", "Missä parannamme seuraavaksi");
add("Up to 3 proposed next steps", "Upp till 3 föreslagna nästa steg", "Enintään 3 ehdotettua jatkotoimea");
add("The year at a glance", "Året i korthet", "Vuosi lyhyesti");
add("Service performance", "Serviceprestanda", "Palvelun toimivuus");
add("Sustainability value", "Hållbarhetsvärde", "Kestävyysarvo");
add("Circularity and textile waste", "Cirkularitet och textilavfall", "Kiertotalous ja tekstiilijäte");
add("Washed kg per month", "Tvättade kg per månad", "Pestyt kilot kuukausittain");
add("On-time service cycle share per month", "Andel servicecykler i tid per månad", "Ajallaan toteutuneiden palvelukierrosten osuus kuukausittain");
add("Emissions saved per month, kg CO2e", "Sparade utsläpp per månad, kg CO2e", "Säästetyt päästöt kuukausittain, kg CO2e");
add("Full year 2025, by month.", "Hela 2025, per månad.", "Koko vuosi 2025 kuukausittain.");
add("Compared with outsourced local laundry. The savings may be overstated.", "Jämfört med lokalt tvätteri på entreprenad. Besparingen kan vara överskattad.", "Verrattuna ulkoistettuun paikalliseen pesulaan. Säästö voi olla yliarvioitu.");
add("Financial value is not shown, because the data holds no Customer cost or price.", "Ekonomiskt värde visas inte, eftersom datan saknar kundens kostnader och priser.", "Taloudellista arvoa ei näytetä, koska tiedoissa ei ole asiakkaan kustannuksia tai hintoja.");
add("Largest gap above peers, by signal", "Största avvikelse mot jämförbara, per signal", "Suurin ero vertailuryhmään signaaleittain");
add("Change from H1 to H2", "Förändring från H1 till H2", "Muutos H1:stä H2:een");
add("improved", "Förbättrad", "Parantunut", "Improved");
add("worse", "Sämre", "Heikentynyt", "Worse");
add("no_clear_change", "Ingen tydlig förändring", "Ei selvää muutosta", "No clear change");
add("not_evaluated", "Ej bedömd", "Ei arvioitu", "Not evaluated");
add("{n} result(s)", "{n} resultat", "{n} tulosta");
add("Owner: {x}", "Ansvarig: {x}", "Vastuu: {x}");
add("Data status", "Datastatus", "Tietojen tila");
add("Counted directly in the synthetic data.", "Räknat direkt i den syntetiska datan.", "Laskettu suoraan synteettisestä datasta.");
add("Calculated with factors from the synthetic data.", "Beräknat med faktorer från den syntetiska datan.", "Laskettu synteettisen datan kertoimilla.");
add("The Customer's share of laundry totals, calculated with factors.", "Kundens andel av tvätteriets totaler, beräknad med faktorer.", "Asiakkaan osuus pesulan kokonaismääristä kertoimilla laskettuna.");
add("Every figure comes from synthetic 2025 data for this prototype.", "Alla siffror kommer från syntetisk data för 2025 i den här prototypen.", "Kaikki luvut perustuvat tämän prototyypin synteettiseen vuoden 2025 dataan.");
add("Savings are compared with outsourced local laundry and may be overstated.", "Besparingar jämförs med lokalt tvätteri på entreprenad och kan vara överskattade.", "Säästöjä verrataan ulkoistettuun paikalliseen pesulaan, ja ne voivat olla yliarvioituja.");
add("Customer Experience data is not available yet, so satisfaction is not shown.", "Data om kundupplevelse finns inte än, så nöjdhet visas inte.", "Asiakaskokemuksen tietoja ei vielä ole, joten tyytyväisyyttä ei näytetä.");
add("Proposed by Lindström. We agree the final steps together in the meeting.", "Föreslaget av Lindström. Vi kommer överens om de slutliga stegen tillsammans på mötet.", "Lindströmin ehdotus. Sovimme lopulliset toimet yhdessä kokouksessa.");
add("Sites: {x}", "Anläggningar: {x}", "Toimipaikat: {x}");
add("Thank you", "Tack", "Kiitos");
add("Questions and discussion", "Frågor och diskussion", "Kysymykset ja keskustelu");
