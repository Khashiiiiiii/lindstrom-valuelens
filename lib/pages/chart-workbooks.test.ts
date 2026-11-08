import assert from "node:assert/strict";
import { test } from "node:test";

import JSZip from "jszip";
import pptxgen from "pptxgenjs";

import { rebuildChartWorkbooks } from "./chart-workbooks.ts";

/** A pptxgenjs file with one column chart of 3 months, where February has no value. */
async function chartWithGap(): Promise<Uint8Array> {
  const pres = new pptxgen();
  // pptxgenjs takes a null value, though its types allow only numbers.
  pres.addSlide().addChart("bar", [{ name: "Kg & more", labels: ["Jan", "Feb", "Mar"], values: [1.5, null as unknown as number, 3] }], {
    x: 1,
    y: 1,
    w: 6,
    h: 3,
  });
  return (await pres.write({ outputType: "uint8array" })) as Uint8Array;
}

test("a month with no value is a gap: no cached point and no workbook value, while its label stays", async () => {
  const zip = await JSZip.loadAsync(await rebuildChartWorkbooks(await chartWithGap()));
  const values = (await zip.file("ppt/charts/chart1.xml")!.async("string")).match(/<c:numCache>([\s\S]*?)<\/c:numCache>/)![1];
  assert.deepEqual(
    [...values.matchAll(/<c:pt idx="(\d+)">\s*<c:v>([^<]*)<\/c:v>/g)].map((m) => [m[1], m[2]]),
    [
      ["0", "1.5"],
      ["2", "3"],
    ],
  );
  assert.match(values, /<c:ptCount val="3"\/>/);
  const embedding = Object.keys(zip.files).find((name) => /^ppt\/embeddings\/.+\.xlsx$/.test(name))!;
  const sheet = await (await JSZip.loadAsync(await zip.file(embedding)!.async("uint8array"))).file("xl/worksheets/sheet1.xml")!.async("string");
  assert.equal(
    sheet.match(/<sheetData>([\s\S]*)<\/sheetData>/)![1],
    [
      '<row r="1"><c r="B1" t="inlineStr"><is><t xml:space="preserve">Kg &amp; more</t></is></c></row>',
      '<row r="2"><c r="A2" t="inlineStr"><is><t xml:space="preserve">Jan</t></is></c><c r="B2"><v>1.5</v></c></row>',
      '<row r="3"><c r="A3" t="inlineStr"><is><t xml:space="preserve">Feb</t></is></c></row>',
      '<row r="4"><c r="A4" t="inlineStr"><is><t xml:space="preserve">Mar</t></is></c><c r="B4"><v>3</v></c></row>',
    ].join(""),
  );
});
