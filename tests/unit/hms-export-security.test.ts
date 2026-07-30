import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  escapeHtml,
  escapeSpreadsheetCell,
  rowsToTableHtml,
  toCsv,
} from "../../src/lib/hms/export";

describe("HMS export security", () => {
  it("escapes active HTML characters", () => {
    assert.equal(
      escapeHtml(`<img src=x onerror="alert('x')">&`),
      "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;"
    );
  });

  it("escapes report headers and values", () => {
    const html = rowsToTableHtml([
      { "<script>": `<img src=x onerror="alert(1)">` },
    ]);
    assert.equal(html.includes("<script>"), false);
    assert.equal(html.includes("<img"), false);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /&lt;img/);
  });

  it("neutralizes spreadsheet formula prefixes", () => {
    assert.equal(escapeSpreadsheetCell("=2+2"), "'=2+2");
    assert.equal(escapeSpreadsheetCell(" @SUM(A1:A2)"), "' @SUM(A1:A2)");
    assert.equal(escapeSpreadsheetCell("ordinary"), "ordinary");
    assert.match(
      toCsv([{ value: '=HYPERLINK("https://evil.test")' }]),
      /'=HYPERLINK/
    );
  });
});
