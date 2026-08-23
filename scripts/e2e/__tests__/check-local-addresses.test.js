#!/usr/bin/env node
/**
 * Tests for the E2E deploy-order gate (issue #1298).
 *
 * The scenario every one of these exists for is #1289: a deploy was inserted mid-list instead of
 * appended, so each later plain-CREATE address slid one nonce slot. A gate that passes that input
 * is worse than no gate, because its green tick is then cited as evidence the addresses agree.
 * The shifted-address case is therefore asserted directly, with the real measured addresses.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  compareAddresses,
  flattenDeployment,
  formatReport,
  parseContractsBlock,
  resolveBlockName,
  main,
} = require("../check-local-addresses.js");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const CONTRACTS_FILE = path.join(ROOT, "frontend", "src", "config", "contracts.js");

// Measured on a fresh local chain (issue #1298): same commit, only the deploy order changed.
const APPENDED = {
  callsignRegistry: "0x7A9Ec1d04904907De0ED7b6839CcdD59c3716AC9",
  mockUniswapRates: "0xD84379CEae14AA33C123Af12424A37803F885889",
  mockUniswapQuoter: "0x2B0d36FACD61B71CC05ab8F3D2355ec3631C0dd5",
};
const INSERTED = {
  callsignRegistry: "0x49fd2BE640DB2910c2fAb69bB8531Ab6E76127ff",
  mockUniswapRates: "0x2B0d36FACD61B71CC05ab8F3D2355ec3631C0dd5",
  mockUniswapQuoter: "0xfbC22278A96299D91d41C453234d97b4F5Eb9B2d",
};

// ── the failure this gate exists for ───────────────────────────────────────────────────────────

test("rejects the shifted addresses an inserted (rather than appended) deploy produces", () => {
  const { mismatches, matched } = compareAddresses(APPENDED, INSERTED);

  assert.equal(matched, 0);
  assert.deepEqual(
    mismatches.map((m) => m.key).sort(),
    ["callsignRegistry", "mockUniswapQuoter", "mockUniswapRates"]
  );

  const rates = mismatches.find((m) => m.key === "mockUniswapRates");
  assert.equal(rates.configured, APPENDED.mockUniswapRates);
  assert.equal(rates.actual, INSERTED.mockUniswapRates);
});

test("the shifted-address report names each key, expected, actual, and the append rule", () => {
  const result = compareAddresses(APPENDED, INSERTED);
  const report = formatReport(result, {
    blockName: "HARDHAT_CONTRACTS",
    contractsFile: CONTRACTS_FILE,
    deploymentFile: path.join(ROOT, "deployments", "localhost-chain1337-v2.json"),
  });

  for (const key of Object.keys(APPENDED)) assert.match(report, new RegExp(key));
  assert.match(report, new RegExp(APPENDED.callsignRegistry));
  assert.match(report, new RegExp(INSERTED.callsignRegistry));
  assert.match(report, /expected/);
  assert.match(report, /actual/);
  assert.match(report, /APPEND new deploys at the END/);
});

test("passes when every hardcoded address is where the deploy put it", () => {
  const { mismatches, matched } = compareAddresses(APPENDED, { ...APPENDED, extraKey: "0x" + "1".repeat(40) });
  assert.deepEqual(mismatches, []);
  assert.equal(matched, 3);
});

// ── what is and is not a mismatch ──────────────────────────────────────────────────────────────

test("checksum casing is not a mismatch", () => {
  const { mismatches, matched } = compareAddresses(
    { wagerRegistry: APPENDED.callsignRegistry },
    { wagerRegistry: APPENDED.callsignRegistry.toLowerCase() }
  );
  assert.deepEqual(mismatches, []);
  assert.equal(matched, 1);
});

test("an empty constant is the app's 'not deployed here' state, not an address to check", () => {
  const { mismatches, unverifiable, matched } = compareAddresses(
    { callsignRegistry: "", treasury: "" },
    { callsignRegistry: APPENDED.callsignRegistry }
  );
  assert.deepEqual(mismatches, []);
  assert.deepEqual(unverifiable, []);
  assert.equal(matched, 0);
});

test("a key the record does not carry is unverifiable — never a pass, never a failure", () => {
  const { mismatches, unverifiable, matched } = compareAddresses(
    { safePolicyGuard: APPENDED.callsignRegistry },
    {}
  );
  assert.deepEqual(mismatches, []);
  assert.equal(matched, 0, "an unchecked key must not be counted as verified");
  assert.deepEqual(unverifiable, [{ key: "safePolicyGuard", configured: APPENDED.callsignRegistry }]);
});

// ── reading the two sources ────────────────────────────────────────────────────────────────────

test("flattenDeployment merges top-level fields, mocks and contracts (contracts win)", () => {
  const flat = flattenDeployment({
    deployer: "0x" + "a".repeat(40),
    paymentToken: "0x" + "b".repeat(40),
    treasury: "",
    contracts: { wagerRegistry: "0x" + "c".repeat(40), paymentToken: "0x" + "d".repeat(40) },
    mocks: { mockUSDC: "0x" + "e".repeat(40), mockWMATIC: null },
  });

  assert.equal(flat.deployer, "0x" + "a".repeat(40));
  assert.equal(flat.wagerRegistry, "0x" + "c".repeat(40));
  assert.equal(flat.paymentToken, "0x" + "d".repeat(40), "contracts must override the top-level field");
  assert.equal(flat.mockUSDC, "0x" + "e".repeat(40));
  assert.ok(!("treasury" in flat));
  assert.ok(!("mockWMATIC" in flat));
});

test("parseContractsBlock reads quoted addresses and tolerates comments", () => {
  const source = [
    "const HARDHAT_CONTRACTS = {",
    "  // a leading comment line",
    "  wagerRegistry: '0x9A676e781A523b5d0C0e43731313A708CB607508',",
    "  callsignRegistry: '', // spec 054 — synced after deploy",
    "  nested: { a: 1 },",
    "}",
    "",
    "const AMOY_CONTRACTS = {",
    "  wagerRegistry: '0xA429CdaD3E1497e33BEA7D6FE7d6913fE880241b',",
    "}",
  ].join("\n");

  const hardhat = parseContractsBlock(source, "HARDHAT_CONTRACTS");
  assert.equal(hardhat.wagerRegistry, "0x9A676e781A523b5d0C0e43731313A708CB607508");
  assert.equal(hardhat.callsignRegistry, "");

  // Brace matching must stop at the right block, not run into the next one.
  const amoy = parseContractsBlock(source, "AMOY_CONTRACTS");
  assert.equal(amoy.wagerRegistry, "0xA429CdaD3E1497e33BEA7D6FE7d6913fE880241b");

  assert.equal(parseContractsBlock(source, "NOPE_CONTRACTS"), null);
});

test("the block name comes from the app's own NETWORK_CONTRACTS map", () => {
  const source = fs.readFileSync(CONTRACTS_FILE, "utf8");
  assert.equal(resolveBlockName(source, 1337), "HARDHAT_CONTRACTS");
  assert.equal(resolveBlockName(source, 137), "POLYGON_CONTRACTS");
  assert.equal(resolveBlockName(source, 999999), null);
});

test("the local chain's block is readable and holds real addresses", () => {
  const source = fs.readFileSync(CONTRACTS_FILE, "utf8");
  const hardhat = parseContractsBlock(source, resolveBlockName(source, 1337));
  assert.ok(hardhat, "HARDHAT_CONTRACTS must stay parseable — the gate reads it, not the module");
  assert.match(hardhat.wagerRegistry, /^0x[0-9a-fA-F]{40}$/);
});

// ── the CLI ────────────────────────────────────────────────────────────────────────────────────

function withSilencedConsole(fn) {
  const { log, error } = console;
  console.log = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
    console.error = error;
  }
}

test("a missing deployment record fails — it is never treated as nothing to check", () => {
  const missing = path.join(os.tmpdir(), `fw-no-such-deployment-${Date.now()}.json`);
  const code = withSilencedConsole(() => main(["--deployment", missing]));
  assert.equal(code, 1);
});

test("main exits non-zero on a mismatch and zero on agreement", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-e2e-addr-"));
  const contractsFile = path.join(dir, "contracts.js");
  const deploymentFile = path.join(dir, "localhost-chain1337-v2.json");

  fs.writeFileSync(
    contractsFile,
    [
      "const HARDHAT_CONTRACTS = {",
      `  callsignRegistry: '${APPENDED.callsignRegistry}',`,
      "}",
      "",
      "const NETWORK_CONTRACTS = {",
      "  1337: HARDHAT_CONTRACTS,",
      "}",
      "",
    ].join("\n")
  );

  const write = (callsignRegistry) =>
    fs.writeFileSync(
      deploymentFile,
      JSON.stringify({ network: "localhost", chainId: 1337, contracts: { callsignRegistry } })
    );

  write(INSERTED.callsignRegistry);
  assert.equal(
    withSilencedConsole(() => main(["--deployment", deploymentFile, "--contractsFile", contractsFile])),
    1
  );

  write(APPENDED.callsignRegistry);
  assert.equal(
    withSilencedConsole(() => main(["--deployment", deploymentFile, "--contractsFile", contractsFile])),
    0
  );

  fs.rmSync(dir, { recursive: true, force: true });
});

test("a chain NETWORK_CONTRACTS does not map fails rather than checking some other block", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-e2e-addr-"));
  const contractsFile = path.join(dir, "contracts.js");
  const deploymentFile = path.join(dir, "localhost-chain4242-v2.json");

  fs.writeFileSync(
    contractsFile,
    ["const HARDHAT_CONTRACTS = {", "  wagerRegistry: '0x" + "1".repeat(40) + "',", "}", "", "const NETWORK_CONTRACTS = {", "  1337: HARDHAT_CONTRACTS,", "}", ""].join("\n")
  );
  fs.writeFileSync(deploymentFile, JSON.stringify({ chainId: 4242, contracts: {} }));

  assert.equal(
    withSilencedConsole(() => main(["--deployment", deploymentFile, "--contractsFile", contractsFile])),
    1
  );

  fs.rmSync(dir, { recursive: true, force: true });
});
