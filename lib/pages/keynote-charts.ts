// Keynote shows pptxgenjs charts as empty boxes (#37). PowerPoint draws a chart from the cached values in its chart
// part, but Keynote reads the Excel workbook embedded behind the chart, and it cannot read the one pptxgenjs writes.
// This step rewrites each embedded workbook as a plain one-sheet workbook built from the chart's cached values, in
// the cells the chart's formulas name. Each workbook stays editable in PowerPoint and in Keynote.
//
// It also drops each cached point with no value, which pptxgenjs writes for a null value, so that month is a gap.
// Last, it drops the folder entries from the zip, because files with them have failed to open through cloud services.

import JSZip from "jszip";

/** The deck file with each chart's workbook rebuilt from the chart's cached values, and no folder entries. */
export async function keynoteCharts(file: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const source = await JSZip.loadAsync(file);
  const replaced = new Map<string, string | Uint8Array>();
  for (const name of Object.keys(source.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n))) {
    const xml = (await source.file(name)!.async("string")).replace(/<c:pt idx="\d+">\s*<c:v><\/c:v>\s*<\/c:pt>/g, "");
    replaced.set(name, xml);
    const rels = await source.file(name.replace("charts/", "charts/_rels/") + ".rels")?.async("string");
    const target = rels?.match(/Target="\.\.\/embeddings\/([^"]+\.xlsx)"/)?.[1];
    if (target) replaced.set(`ppt/embeddings/${target}`, await workbook(chartCells(xml)));
  }
  const out = new JSZip();
  for (const [name, entry] of Object.entries(source.files)) {
    if (entry.dir) continue;
    out.file(name, replaced.get(name) ?? (await entry.async("uint8array")), { createFolders: false });
  }
  // JSZip builds the file in a plain ArrayBuffer, never a SharedArrayBuffer.
  return (await out.generateAsync({ type: "uint8array", compression: "DEFLATE" })) as Uint8Array<ArrayBuffer>;
}

/** A worksheet cell: its column and row numbers from 1, its value as escaped XML text, and whether it is text. */
interface Cell {
  col: number;
  row: number;
  value: string;
  text: boolean;
}

/**
 * The cells a chart part names: per series, the name, the category labels and the values, each read from its
 * cache and placed from the first cell of its formula, such as "Sheet1!$B$2:$B$13". The values stay escaped.
 */
function chartCells(xml: string): Cell[] {
  const cells: Cell[] = [];
  for (const [, series] of xml.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)) {
    for (const tag of ["tx", "cat", "val"]) {
      const block = series.match(new RegExp(`<c:${tag}>([\\s\\S]*?)</c:${tag}>`))?.[1];
      const start = block?.match(/<c:f>[^<!]*!\$([A-Z]+)\$(\d+)/);
      if (!block || !start) continue;
      const col = columnNumber(start[1]);
      const text = !block.includes("<c:numCache>");
      for (const [, idx, value] of block.matchAll(/<c:pt idx="(\d+)">\s*<c:v>([^<]*)<\/c:v>/g)) {
        cells.push({ col, row: Number(start[2]) + Number(idx), value, text });
      }
    }
  }
  return cells;
}

/** A one-sheet .xlsx file that holds the cells, with text as inline strings. */
async function workbook(cells: Cell[]): Promise<Uint8Array> {
  const byRow = new Map<number, Map<number, Cell>>();
  for (const c of cells) {
    if (!byRow.has(c.row)) byRow.set(c.row, new Map());
    byRow.get(c.row)!.set(c.col, c);
  }
  const rows = [...byRow.entries()]
    .sort(([a], [b]) => a - b)
    .map(([r, row]) => {
      const xml = [...row.values()]
        .sort((a, b) => a.col - b.col)
        .map((c) => {
          const ref = `${columnName(c.col)}${r}`;
          return c.text ? `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${c.value}</t></is></c>` : `<c r="${ref}"><v>${c.value}</v></c>`;
        });
      return `<row r="${r}">${xml.join("")}</row>`;
    });
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const zip = new JSZip();
  const file = (name: string, xml: string) => zip.file(name, xml, { createFolders: false });
  file(
    "[Content_Types].xml",
    `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
  );
  file(
    "_rels/.rels",
    `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  file(
    "xl/workbook.xml",
    `${head}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${rel}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  file(
    "xl/_rels/workbook.xml.rels",
    `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  );
  file(
    "xl/worksheets/sheet1.xml",
    `${head}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join("")}</sheetData></worksheet>`,
  );
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/** The column number of a column name, 1 for "A" and 27 for "AA". */
function columnNumber(name: string): number {
  return [...name].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}

/** The column name of a column number, "A" for 1 and "AA" for 27. */
function columnName(n: number): string {
  let name = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}
