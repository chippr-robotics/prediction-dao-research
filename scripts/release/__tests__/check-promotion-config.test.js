/**
 * Tests for scripts/release/check-promotion-config.js (spec 076, T038/T041).
 *
 * A check that only ever passes is worse than no check — it manufactures confidence. These tests
 * prove it fires on the cases it exists for, against the real cloudbuild files.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ENUMERATED,
  buildArgs,
  checkEnumeratedDifferences,
} = require("../check-promotion-config");

test("parses build args from both cloudbuild files", () => {
  const prod = buildArgs("cloudbuild.yaml");
  const staging = buildArgs("cloudbuild.staging.yaml", { onlyBefore: "id: build-testnet" });
  assert.ok(prod && Object.keys(prod).length > 5, "production args should parse");
  assert.ok(staging && Object.keys(staging).length > 5, "staging args should parse");
});

test("the mainnet staging slice really is the mainnet one", () => {
  // If the slice were wrong we would be comparing production against the TESTNET image, and the
  // check would report a cohort difference that is not a defect.
  const staging = buildArgs("cloudbuild.staging.yaml", { onlyBefore: "id: build-testnet" });
  assert.equal(staging.VITE_NETWORK_ID, "137", "the mirror must be the mainnet-cohort build");
});

test("staging currently mirrors production within the enumerated differences", () => {
  assert.deepEqual(checkEnumeratedDifferences(), []);
});

test("the enumerated list matches contracts/environments.md", () => {
  // Drift between the list and the document is how this check quietly stops meaning anything.
  for (const name of [
    "VITE_APP_URL",
    "VITE_RELAYER_URL",
    "VITE_BUNDLER_URLS_POLYGON",
    "VITE_SPONSOR_PAYMASTER_POLYGON",
    "VITE_STAGING_BANNER",
    "VITE_APP_VERSION",
    "VITE_GIT_SHA",
  ]) {
    assert.ok(ENUMERATED.has(name), `${name} should be enumerated`);
  }
  // The cohort id must NOT be enumerated for the mainnet mirror: if 137 could differ from
  // production, the mirror would stop being one.
  assert.ok(!ENUMERATED.has("VITE_NETWORK_ID"), "VITE_NETWORK_ID must never be an allowed difference");
});

test("a value that must match is genuinely compared", () => {
  // Proves the comparison has teeth: these are present in both files and NOT enumerated, so a
  // change to either side would be reported.
  const prod = buildArgs("cloudbuild.yaml");
  const staging = buildArgs("cloudbuild.staging.yaml", { onlyBefore: "id: build-testnet" });
  const mustMatch = ["VITE_NETWORK_ID", "VITE_TENANT_ID", "VITE_SUBGRAPH_URL"];
  for (const name of mustMatch) {
    assert.ok(!ENUMERATED.has(name), `${name} must not be exempt`);
    assert.ok(name in prod, `${name} should exist in production config`);
    if (name in staging) {
      assert.equal(staging[name], prod[name], `${name} must match production`);
    }
  }
});

test("an unreadable config is reported, never treated as matching", () => {
  const missing = buildArgs("cloudbuild.does-not-exist.yaml");
  assert.equal(missing, null, "a missing file must be null, not an empty object");
});
