// PROTOTYPE, throw me away. Keynote shows pptxgenjs charts as blank boxes, because it cannot read the Excel
// workbook pptxgenjs embeds behind each chart. PowerPoint reads the chart's own cached values, Keynote reads the
// workbook. This rewrites each embedded workbook as a plain xlsx built from the chart's cached values, and drops
// the folder entries from the zip.

import JSZip from "jszip";

const col = (i: number) => String.fromCharCode(65 + i); // charts here have fewer than 26 series

// Values are copied as they appear in the chart XML, so they are already escaped.
// Reads the category labels and the series from the cached values in a chart part.
function chartTable(xml: string) {
  const sers = [...xml.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)].map((m) => m[1]);
  const pts = (block: string) => [...block.matchAll(/<c:pt idx="(\d+)">\s*<c:v>([\s\S]*?)<\/c:v>/g)].map((m) => [Number(m[1]), m[2]] as const);
  const labels: string[] = [];
  const series = sers.map((s) => {
    const name = pts(s.match(/<c:tx>([\s\S]*?)<\/c:tx>/)?.[1] ?? "")[0]?.[1] ?? "";
    const cat = s.match(/<c:cat>([\s\S]*?)<\/c:cat>/)?.[1] ?? "";
    for (const [i, v] of pts(cat)) labels[i] = v;
    const values: (string | undefined)[] = [];
    for (const [i, v] of pts(s.match(/<c:val>([\s\S]*?)<\/c:val>/)?.[1] ?? "")) values[i] = v;
    return { name, values };
  });
  return { labels, series };
}

async function workbook(t: { labels: string[]; series: { name: string; values: (string | undefined)[] }[] }) {
  const cell = (ref: string, v: string | undefined, text: boolean) =>
    v === undefined ? "" : text ? `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>` : `<c r="${ref}"><v>${v}</v></c>`;
  const rows = [`<row r="1">${cell("A1", "", true)}${t.series.map((s, j) => cell(`${col(j + 1)}1`, s.name, true)).join("")}</row>`];
  t.labels.forEach((l, i) => rows.push(`<row r="${i + 2}">${cell(`A${i + 2}`, l, true)}${t.series.map((s, j) => cell(`${col(j + 1)}${i + 2}`, s.values[i], false)).join("")}</row>`));
  const z = new JSZip();
  z.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
  z.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  z.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  z.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`);
  z.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join("")}</sheetData></worksheet>`);
  return z.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function fixForKeynote(buf: Buffer): Promise<Buffer> {
  const src = await JSZip.loadAsync(buf);
  const out = new JSZip();
  const replace = new Map<string, Buffer>();
  for (const name of Object.keys(src.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n))) {
    const rels = await src.file(name.replace("charts/", "charts/_rels/") + ".rels")?.async("string");
    const target = rels?.match(/Target="\.\.\/embeddings\/([^"]+)"/)?.[1];
    if (target) replace.set("ppt/embeddings/" + target, await workbook(chartTable(await src.file(name)!.async("string"))));
  }
  for (const [name, f] of Object.entries(src.files)) {
    if (f.dir) continue;
    out.file(name, replace.get(name) ?? (await f.async("nodebuffer")));
  }
  return out.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
