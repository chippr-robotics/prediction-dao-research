const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const { keccak256, toUtf8Bytes } = require("ethers");

/**
 * Spec 075, FR-026/FR-027 — every shared EIP-712 struct is checked against the contract that
 * actually verifies it.
 *
 * These field lists decide what a member's signature AUTHORISES. A mismatch between signer and
 * verifier does not throw — it produces a signature that verifies against something other than
 * what the member was shown. CLAUDE.md required three copies to stay byte-identical and enforced
 * it by convention; the convention held for 26 of 27 structs and failed on the 27th
 * (`InvalidateNonce` was missing from the relay gateway entirely).
 *
 * WHY COMPARE STRINGS RATHER THAN HASHES
 * The contracts declare `keccak256("<literal type string>")`, so the literal is right there in the
 * source. Comparing strings is exactly as strong as comparing hashes and infinitely more useful
 * when it fails: you see WHICH field moved, not that two opaque 32-byte values differ. The hash
 * equality is asserted too, so the test still speaks the contract's language.
 *
 * MOCKS ARE NOT AUTHORITATIVE — see the EIP-3009 block at the bottom.
 */
const ROOT = path.join(__dirname, "..", "..");
const CONTRACTS = path.join(ROOT, "contracts");

const TYPEHASH_RE =
  /bytes32\s+(?:private\s+|internal\s+|public\s+)?constant\s+(\w*TYPEHASH)\s*=\s*keccak256\(\s*"([^"]+)"\s*\)/g;

function solidityTypeStrings() {
  const out = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        // contracts/mocks/ is test-only. A mock's typehash proves nothing about what a deployed
        // contract verifies, so it must never satisfy this gate.
        if (e.name === "mocks") continue;
        walk(p);
      } else if (e.name.endsWith(".sol")) {
        const src = fs.readFileSync(p, "utf8");
        for (const m of src.matchAll(TYPEHASH_RE)) {
          const typeString = m[2];
          const primary = typeString.slice(0, typeString.indexOf("("));
          out[primary] = { typeString, file: path.relative(ROOT, p), constant: m[1] };
        }
      }
    }
  };
  walk(CONTRACTS);
  return out;
}

describe("EIP-712 intent structs match the contracts that verify them (spec 075)", function () {
  let pkg;
  let solidity;

  before(async function () {
    pkg = await import("@fairwins/intent-types");
    solidity = solidityTypeStrings();
  });

  it("finds typehash constants in the production contracts", function () {
    expect(Object.keys(solidity).length, "no *_TYPEHASH constants parsed — the regex or layout changed").to.be.greaterThan(20);
  });

  it("has a production-contract counterpart for every shared intent struct", function () {
    const orphans = Object.keys(pkg.INTENT_TYPES).filter((k) => !solidity[k]);
    expect(
      orphans,
      "These structs exist in @fairwins/intent-types with no matching typehash in a non-mock " +
        "contract. Either the contract was removed (delete the struct) or it moved into mocks/ " +
        "(which cannot satisfy this gate):\n  " + orphans.join("\n  "),
    ).to.deep.equal([]);
  });

  it("renders a type string identical to each contract's literal", function () {
    const mismatches = [];
    for (const primary of Object.keys(pkg.INTENT_TYPES)) {
      const sol = solidity[primary];
      if (!sol) continue; // reported by the previous test
      const ours = pkg.typeStringFor(primary);
      if (ours !== sol.typeString) {
        mismatches.push(
          `${primary}  (${sol.file} :: ${sol.constant})\n` +
            `    package : ${ours}\n` +
            `    contract: ${sol.typeString}`,
        );
      }
    }
    expect(
      mismatches,
      `${mismatches.length} struct(s) disagree with the verifying contract. A signature produced ` +
        `from the package definition would NOT verify on-chain:\n\n${mismatches.join("\n\n")}`,
    ).to.deep.equal([]);
  });

  it("agrees on the keccak256 typehash the contract actually stores", function () {
    for (const primary of Object.keys(pkg.INTENT_TYPES)) {
      const sol = solidity[primary];
      if (!sol) continue;
      expect(
        keccak256(toUtf8Bytes(pkg.typeStringFor(primary))),
        `${primary} typehash differs from ${sol.file}`,
      ).to.equal(keccak256(toUtf8Bytes(sol.typeString)));
    }
  });
});

describe("EIP-3009 ReceiveWithAuthorization is pinned to a recorded vector (spec 075, FR-027)", function () {
  /**
   * This struct is DIFFERENT in kind from every struct above, and the difference matters.
   *
   * Its authoritative typehash lives in the DEPLOYED USDC contract — Circle's, not ours. The only
   * in-repo Solidity copy is contracts/mocks/MockUSDCPermit.sol, a mock we wrote. Checking our
   * definition against our own mock would be circular: both could drift together and the gate
   * would stay green while every gasless payment stopped verifying against real USDC.
   *
   * So it is pinned to the canonical EIP-3009 typehash instead — a fixed vector, independently
   * checkable against the standard and against any deployed FiatTokenV2.
   */
  const CANONICAL_TYPE_STRING =
    "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)";
  // keccak256 of the string above, and the value FiatTokenV2 stores as
  // RECEIVE_WITH_AUTHORIZATION_TYPEHASH. PROVENANCE: read live from deployed USDC on Polygon 137
  // (0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359) on 2026-08-03 and confirmed equal — so this is an
  // independent vector, not a hash of our own string.
  const CANONICAL_TYPEHASH = "0xd099cc98ef71107a616c4f0f941f04c322d8e254fe26b3c6668db87aae413de8";

  it("renders the canonical EIP-3009 type string", async function () {
    const pkg = await import("@fairwins/intent-types");
    expect(
      pkg.typeStringFor("ReceiveWithAuthorization", pkg.RECEIVE_WITH_AUTHORIZATION_TYPES),
    ).to.equal(CANONICAL_TYPE_STRING);
  });

  it("hashes to the typehash deployed USDC verifies against", async function () {
    const pkg = await import("@fairwins/intent-types");
    const ours = keccak256(
      toUtf8Bytes(pkg.typeStringFor("ReceiveWithAuthorization", pkg.RECEIVE_WITH_AUTHORIZATION_TYPES)),
    );
    expect(ours, "a gasless payment signed with this struct would not verify against real USDC").to.equal(
      CANONICAL_TYPEHASH,
    );
  });
});
