// The React key that makes a chart draw in (#33). A chart's SVG takes the key of the data it draws, so it remounts
// and plays its CSS draw-in only when that data changes. A reply with the same values, a language switch or a new
// highlight keeps the key, so the chart does not redraw. A page change remounts it anyway.

/** The key for a chart that draws these parts. Equal values give an equal key, even in new arrays. */
export function drawKey(...parts: unknown[]): string {
  return JSON.stringify(parts);
}
