/**
 * Tests for scripts/release/artifacts.js (spec 076, T045).
 *
 * The behaviour under test that matters most is the UNREADABLE case. A category whose source cannot
 * be read must never render as "unchanged": that would be a fabricated fact, and this table is read
 * during incidents (constitution III, FR-035).
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { CATEGORIES, movedIn, buildRows, render, subgraphEndpoint } = require("../artifacts");

test("every category is listed, including ones that did not move (FR-035)", () => {
  const rows = buildRows({ previous: null, version: "HEAD" });
  assert.equal(rows.length, CATEGORIES.length);
  for (const cat of CATEGORIES) {
    assert.ok(
      rows.some((r) => r.key === cat.key),
      `${cat.key} must appear in the table even when unchanged`,
    );
  }
});

test("every row carries a definite status", () => {
  const rows = buildRows({ previous: null, version: "HEAD" });
  for (const r of rows) {
    assert.ok(
      ["moved", "unchanged", "unreadable"].includes(r.status),
      `${r.key} has status "${r.status}"`,
    );
  }
});

test("movedIn maps a changed path to its category", () => {
  const paths = ["frontend/src/App.jsx", "contracts/fees/FeeRouter.sol"];
  assert.equal(movedIn("spa-image", paths), true);
  assert.equal(movedIn("contract-impl", paths), true);
  assert.equal(movedIn("subgraph-endpoint", paths), false);
});

test("an unreadable range yields null, NOT false (constitution III)", () => {
  // This is the distinction the whole file turns on: "I could not look" is not "nothing changed".
  assert.equal(movedIn("spa-image", null), null);
  assert.equal(movedIn("contract-impl", null), null);
});

test("a null range renders every category as unreadable, never as unchanged", () => {
  const rows = CATEGORIES.map((cat) => ({
    ...cat,
    status: movedIn(cat.key, null) === null ? "unreadable" : "unchanged",
    identity: "—",
  }));
  assert.ok(rows.every((r) => r.status === "unreadable"));
  const md = render({ previous: "v1.0.0", version: "v1.1.0", rows });
  assert.match(md, /unreadable/);
  assert.doesNotMatch(md, /\| unchanged \|/);
});

test("the rendered table warns when anything was unreadable", () => {
  const rows = [{ key: "spa-image", label: "SPA image", status: "unreadable", identity: "—" }];
  const md = render({ previous: null, version: "v1.0.0", rows });
  assert.match(md, /an absent source is not evidence that nothing moved/);
});

test("the table is silent about unreadability when everything was readable", () => {
  const rows = [{ key: "spa-image", label: "SPA image", status: "unchanged", identity: "—" }];
  const md = render({ previous: "v1.0.0", version: "v1.1.0", rows });
  assert.doesNotMatch(md, /absent source/);
});

test("renders a markdown table with a header and the range", () => {
  const rows = buildRows({ previous: null, version: "HEAD" });
  const md = render({ previous: null, version: "v1.0.0", rows });
  assert.match(md, /^### Artifacts$/m);
  assert.match(md, /\| Artifact \| Status \| Identity \|/);
  assert.match(md, /no previous release/);
});

test("reads the subgraph endpoint version this build actually consumes", () => {
  // It lives in a namespace this scheme does not own, so the release only RECORDS it (FR-034).
  const endpoint = subgraphEndpoint();
  assert.ok(endpoint === null || /^v\d+\.\d+\.\d+$/.test(endpoint), `got "${endpoint}"`);
});
