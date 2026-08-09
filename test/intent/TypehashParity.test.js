const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const { keccak256, toUtf8Bytes } = require("ethers");

/**
 * Spec 075, FR-026/FR-027 — every shared EIP-712 definition is checked against the contract that
 * actually verifies it.
 *
 * These definitions decide what a member's signature AUTHORISES. A mismatch between signer and
 * verifier does not throw — it produces a signature that verifies against something other than
 * what the member was shown. CLAUDE.md required three copies to stay byte-identical and enforced
 * it by convention; the convention held for 26 of 27 structs and failed on the 27th
 * (`InvalidateNonce` was missing from the relay gateway entirely).
 *
 * TWO HALVES, ONE DIGEST
 * An EIP-712 digest is `keccak256(0x1901 ‖ domainSeparator ‖ hashStruct(message))`. This file
 * therefore gates BOTH halves:
 *   · the STRUCTS, against each contract's `*_TYPEHASH` literal, and
 *   · the DOMAINS, against each contract's `__EIP712_init(name, version)` arguments.
 * The domains were the gap: a byte-perfect struct signed under a wrong name or version is exactly
 * as dead as a wrong struct, and nothing checked them at all.
 *
 * WHY COMPARE STRINGS RATHER THAN HASHES
 * The contracts declare `keccak256("<literal type string>")`, so the literal is right there in the
 * source. Comparing strings is exactly as strong as comparing hashes and infinitely more useful
 * when it fails: you see WHICH field moved, not that two opaque 32-byte values differ. The hash
 * equality is asserted too, so the test still speaks the contract's language.
 *
 * BOTH DIRECTIONS, ALWAYS
 * Every gate here runs package→Solidity AND Solidity→package. A one-directional gate only proves
 * that what you kept is right; it says nothing about what you DELETED. Iterating the package alone
 * meant a struct could be removed from the package while a contract still verified it, and all
 * three spec-075 gates stayed green.
 *
 * MOCKS ARE NOT AUTHORITATIVE — see the EIP-3009 block at the bottom.
 */
const ROOT = path.join(__dirname, "..", "..");
const CONTRACTS = path.join(ROOT, "contracts");

const TYPEHASH_RE =
  /bytes32\s+(?:private\s+|internal\s+|public\s+)?constant\s+(\w*TYPEHASH)\s*=\s*keccak256\(\s*"([^"]+)"\s*\)/g;

// `__EIP712_init("<name>", "<version>")` — the call that fixes a contract's domain separator.
const EIP712_INIT_RE = /__EIP712_init\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)/g;

/** Every non-mock .sol file, repo-relative path + source. */
function productionSources() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        // contracts/mocks/ is test-only. A mock's typehash or domain proves nothing about what a
        // deployed contract verifies, so it must never satisfy this gate.
        if (e.name === "mocks") continue;
        walk(p);
      } else if (e.name.endsWith(".sol")) {
        out.push({ file: path.relative(ROOT, p).split(path.sep).join("/"), src: fs.readFileSync(p, "utf8") });
      }
    }
  };
  walk(CONTRACTS);
  return out;
}

/**
 * primaryType -> { typeString, files[], constants[] } for every `*_TYPEHASH` in a production
 * contract.
 *
 * THROWS on a colliding primary type with a DIFFERENT shape. It used to assign `out[primary] = …`
 * unconditionally, so whichever file the directory walk happened to visit last won. Nothing
 * collides today, but `Cancel`, `Refund`, `ClaimShare` and `CreatePool` are generic enough names
 * that a second contract could plausibly declare its own — and the effect would be that one of the
 * two structs is silently no longer gated by anything, which is precisely the failure mode this
 * file exists to prevent. An identical redeclaration is harmless (both agree) and is recorded with
 * every file it appears in, so failures name all of them.
 */
function solidityTypeStrings(sources = productionSources()) {
  const out = {};
  for (const { file, src } of sources) {
    for (const m of src.matchAll(TYPEHASH_RE)) {
      const typeString = m[2];
      const primary = typeString.slice(0, typeString.indexOf("("));
      const prior = out[primary];
      if (prior && prior.typeString !== typeString) {
        throw new Error(
          `Two production contracts declare a DIFFERENTLY-SHAPED "${primary}" typehash. ` +
            `Only one of them can be gated by the package's single "${primary}" entry, so the other ` +
            `is unverified — rename one struct.\n` +
            `  ${prior.files.join(", ")} :: ${prior.constants.join(", ")}\n      ${prior.typeString}\n` +
            `  ${file} :: ${m[1]}\n      ${typeString}`,
        );
      }
      if (prior) {
        prior.files.push(file);
        prior.constants.push(m[1]);
      } else {
        out[primary] = { typeString, files: [file], constants: [m[1]] };
      }
    }
  }
  return out;
}

/** repo-relative file -> [{ name, version }] for every `__EIP712_init` in a production contract. */
function solidityDomainInits(sources = productionSources()) {
  const byFile = {};
  for (const { file, src } of sources) {
    for (const m of src.matchAll(EIP712_INIT_RE)) {
      (byFile[file] ||= []).push({ name: m[1], version: m[2] });
    }
  }
  return byFile;
}

const describeSol = (sol) => `${sol.files.join(", ")} :: ${sol.constants.join(", ")}`;

/**
 * Typehashes in production contracts that are deliberately NOT defined in @fairwins/intent-types.
 * Every entry needs a reason; each is asserted to still EXIST in the Solidity, so a stale exemption
 * fails rather than quietly widening the hole.
 */
const NON_PACKAGE_TYPEHASHES = {
  CoinbaseSmartWalletMessage:
    "Third-party. This is Coinbase Smart Wallet's ERC-1271 replay-safe message wrapper " +
    "(contracts/account/ERC1271.sol), reproduced so a passkey account can verify signatures the " +
    "way Coinbase's own tooling produces them. It is not a FairWins intent, no FairWins client " +
    "signs it from a shared table, and its shape is fixed by an external wallet standard rather " +
    "than by this repo — so putting it in the package would misrepresent who owns it.",
};

/**
 * Production contracts whose `__EIP712_init` domain is deliberately NOT in CONTRACT_DOMAINS.
 * Empty today: all five EIP-712 contracts in the tree are signed against by FairWins clients.
 * A new EIP-712 contract must either register a domain or be exempted here WITH a reason.
 */
const NON_PACKAGE_DOMAINS = {};

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

  it("has a production-contract counterpart for every shared struct", function () {
    const orphans = Object.keys(pkg.CONTRACT_VERIFIED_TYPES).filter((k) => !solidity[k]);
    expect(
      orphans,
      "These structs exist in @fairwins/intent-types with no matching typehash in a non-mock " +
        "contract. Either the contract was removed (delete the struct) or it moved into mocks/ " +
        "(which cannot satisfy this gate):\n  " + orphans.join("\n  "),
    ).to.deep.equal([]);
  });

  it("has a package definition for every typehash a production contract verifies", function () {
    // The direction that was missing. Without it, DELETING a struct from the package passes every
    // gate in the repo while a deployed contract still verifies signatures over it — the package
    // stops being the single source and nothing says so.
    const ungated = Object.keys(solidity).filter(
      (k) => !pkg.CONTRACT_VERIFIED_TYPES[k] && !NON_PACKAGE_TYPEHASHES[k],
    );
    expect(
      ungated,
      "These typehashes are verified by a production contract but have no definition in " +
        "@fairwins/intent-types, so nothing checks what clients sign against them. Add them to the " +
        "package (and to CONTRACT_VERIFIED_TYPES), or exempt them in NON_PACKAGE_TYPEHASHES with a " +
        "reason:\n  " +
        ungated.map((k) => `${k}  (${describeSol(solidity[k])})`).join("\n  "),
    ).to.deep.equal([]);
  });

  it("keeps every non-package typehash exemption justified and still real", function () {
    for (const [primary, reason] of Object.entries(NON_PACKAGE_TYPEHASHES)) {
      expect(solidity[primary], `${primary} is exempted but no production contract declares it — drop the exemption`).to.exist;
      expect(
        pkg.CONTRACT_VERIFIED_TYPES[primary],
        `${primary} is now in the package — remove it from NON_PACKAGE_TYPEHASHES so it is gated`,
      ).to.equal(undefined);
      expect(reason.length, `${primary} needs a real reason, not a placeholder`).to.be.greaterThan(40);
    }
  });

  it("renders a type string identical to each contract's literal", function () {
    const mismatches = [];
    for (const primary of Object.keys(pkg.CONTRACT_VERIFIED_TYPES)) {
      const sol = solidity[primary];
      if (!sol) continue; // reported by the previous test
      const ours = pkg.typeStringFor(primary, pkg.CONTRACT_VERIFIED_TYPES);
      if (ours !== sol.typeString) {
        mismatches.push(
          `${primary}  (${describeSol(sol)})\n` +
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
    for (const primary of Object.keys(pkg.CONTRACT_VERIFIED_TYPES)) {
      const sol = solidity[primary];
      if (!sol) continue;
      expect(
        keccak256(toUtf8Bytes(pkg.typeStringFor(primary, pkg.CONTRACT_VERIFIED_TYPES))),
        `${primary} typehash differs from ${describeSol(sol)}`,
      ).to.equal(keccak256(toUtf8Bytes(sol.typeString)));
    }
  });

  it("resolves every action's primaryType to a struct definition", function () {
    // INTENT_ACTIONS is the table clients build signatures from. An action naming a primaryType
    // that INTENT_TYPES no longer defines is not a type error anywhere — `types[primaryType]` is
    // just `undefined` — so it surfaces at signing time, on a member's screen.
    const broken = [];
    for (const [action, meta] of Object.entries(pkg.INTENT_ACTIONS)) {
      if (meta.authOnly) {
        // poolJoin: the EIP-3009 authorization IS the whole intent; there is no struct to sign.
        expect(meta.primaryType, `${action} is authOnly but still names a primaryType`).to.equal(undefined);
        continue;
      }
      if (!meta.primaryType) broken.push(`${action}: no primaryType and not authOnly`);
      else if (!pkg.INTENT_TYPES[meta.primaryType]) {
        broken.push(`${action}: primaryType "${meta.primaryType}" is not defined in INTENT_TYPES`);
      }
    }
    expect(
      broken,
      "These actions cannot be signed — the struct they name does not exist:\n  " + broken.join("\n  "),
    ).to.deep.equal([]);
  });

  it("leaves no struct in INTENT_TYPES unreachable from any action", function () {
    // The reverse: a struct nothing signs is either dead weight or a missing action entry. Either
    // way it should be a decision, not a leftover.
    const used = new Set(Object.values(pkg.INTENT_ACTIONS).map((m) => m.primaryType).filter(Boolean));
    const unused = Object.keys(pkg.INTENT_TYPES).filter((k) => !used.has(k));
    expect(
      unused,
      "Defined in INTENT_TYPES but named by no action in INTENT_ACTIONS — dead struct, or a missing " +
        "action:\n  " + unused.join("\n  "),
    ).to.deep.equal([]);
  });
});

describe("EIP-712 domains match the contracts that verify under them (spec 075)", function () {
  let pkg;
  let inits;

  before(async function () {
    pkg = await import("@fairwins/intent-types");
    inits = solidityDomainInits();
  });

  it("finds __EIP712_init calls in the production contracts", function () {
    const total = Object.values(inits).reduce((n, l) => n + l.length, 0);
    expect(total, "no __EIP712_init calls parsed — the regex or the contracts changed").to.be.greaterThan(4);
  });

  it("declares a source contract for every domain, and nothing more", function () {
    expect(
      Object.keys(pkg.DOMAIN_SOURCES).sort(),
      "CONTRACT_DOMAINS and DOMAIN_SOURCES must describe the same set of domains",
    ).to.deep.equal(Object.keys(pkg.CONTRACT_DOMAINS).sort());
  });

  it("carries only name and version, so nothing extra leaks into the domain separator", function () {
    // Consumers spread these into an EIP-712 domain object. An extra key would be a THIRD domain
    // field on some paths and not others, i.e. two different separators for the same contract.
    for (const [key, d] of Object.entries(pkg.CONTRACT_DOMAINS)) {
      expect(Object.keys(d).sort(), `CONTRACT_DOMAINS.${key} must be exactly { name, version }`).to.deep.equal([
        "name",
        "version",
      ]);
    }
  });

  it("matches the name and version each source contract initialises", function () {
    const mismatches = [];
    for (const [key, d] of Object.entries(pkg.CONTRACT_DOMAINS)) {
      const file = pkg.DOMAIN_SOURCES[key];
      const found = inits[file];
      if (!found || found.length === 0) {
        mismatches.push(`${key}: ${file} contains no __EIP712_init — moved, renamed, or deleted?`);
        continue;
      }
      // A contract may init in both `initialize` and a `reinitializer` (WagerRegistry,
      // MembershipManager, WagerPoolFactory all do). They must agree: EIP712Upgradeable stores the
      // name/version, so a re-init under different arguments would silently change the separator of
      // an already-deployed proxy and invalidate every signature in flight.
      for (const got of found) {
        if (got.name !== d.name || got.version !== d.version) {
          mismatches.push(
            `${key}  (${file})\n` +
              `    package : name=${JSON.stringify(d.name)} version=${JSON.stringify(d.version)}\n` +
              `    contract: name=${JSON.stringify(got.name)} version=${JSON.stringify(got.version)}`,
          );
        }
      }
    }
    expect(
      mismatches,
      `${mismatches.length} domain(s) disagree with the verifying contract. The domain separator is ` +
        `half of the EIP-712 digest, so a signature built from the package domain would NOT verify ` +
        `on-chain:\n\n${mismatches.join("\n\n")}`,
    ).to.deep.equal([]);
  });

  it("has a package domain for every EIP-712 contract in the tree", function () {
    // The Solidity→package direction, same argument as the struct gate: without it, deleting a
    // domain from the package leaves a contract whose separator nothing checks.
    const declared = new Map(Object.entries(pkg.DOMAIN_SOURCES).map(([key, file]) => [file, key]));
    const ungated = Object.keys(inits).filter((f) => !declared.has(f) && !NON_PACKAGE_DOMAINS[f]);
    expect(
      ungated,
      "These contracts fix an EIP-712 domain that no CONTRACT_DOMAINS entry tracks. If FairWins " +
        "clients sign against them, add a domain; if not, exempt them in NON_PACKAGE_DOMAINS with a " +
        "reason:\n  " + ungated.join("\n  "),
    ).to.deep.equal([]);
  });

  it("keeps every non-package domain exemption justified and still real", function () {
    for (const [file, reason] of Object.entries(NON_PACKAGE_DOMAINS)) {
      expect(inits[file], `${file} is exempted but declares no __EIP712_init — drop the exemption`).to.exist;
      expect(reason.length, `${file} needs a real reason, not a placeholder`).to.be.greaterThan(40);
    }
  });

  it("builds a complete domain that keeps the contract's own name and version", function () {
    const d = pkg.domainFor("wagerRegistry", 137, "0x0000000000000000000000000000000000000001");
    expect(d).to.deep.equal({
      ...pkg.CONTRACT_DOMAINS.wagerRegistry,
      chainId: 137,
      verifyingContract: "0x0000000000000000000000000000000000000001",
    });
  });

  it("throws on an unknown domain key rather than signing under an empty domain", function () {
    expect(() => pkg.domainFor("notAContract", 137, "0x0000000000000000000000000000000000000001")).to.throw(
      /Unknown EIP-712 domain key/,
    );
  });
});

describe("the Solidity parser itself refuses to hide a struct (spec 075)", function () {
  // These feed the parser synthetic sources rather than mutating contracts/. The collision rule is
  // the one behaviour with no natural occurrence in the tree today, so it would otherwise be
  // asserted by nothing — which is exactly the state it was in.
  const constant = (name, typeString) =>
    `bytes32 private constant ${name} = keccak256("${typeString}");`;

  it("throws when two contracts declare a same-named struct with different fields", function () {
    const sources = [
      { file: "contracts/a/A.sol", src: constant("CANCEL_TYPEHASH", "Cancel(address creator,bytes32 nonce)") },
      { file: "contracts/b/B.sol", src: constant("CANCEL_TYPEHASH", "Cancel(address anyone,uint256 id)") },
    ];
    // Before this rule the walk simply overwrote, so ONE of the two Cancel structs was gated and the
    // other silently was not — with no failure to notice, and the winner decided by directory order.
    expect(() => solidityTypeStrings(sources)).to.throw(/DIFFERENTLY-SHAPED "Cancel"/);
  });

  it("accepts an identical redeclaration and names every file it came from", function () {
    const same = "Cancel(address creator,bytes32 nonce)";
    const out = solidityTypeStrings([
      { file: "contracts/a/A.sol", src: constant("CANCEL_TYPEHASH", same) },
      { file: "contracts/b/B.sol", src: constant("CANCEL_TYPEHASH", same) },
    ]);
    expect(out.Cancel.typeString).to.equal(same);
    expect(out.Cancel.files).to.deep.equal(["contracts/a/A.sol", "contracts/b/B.sol"]);
  });

  it("reads the domain out of the __EIP712_init call, per file", function () {
    const inits = solidityDomainInits([
      { file: "contracts/x/X.sol", src: '__EIP712_init("Some Name", "7");' },
      { file: "contracts/y/Y.sol", src: '__EIP712_init("A", "1");\n__EIP712_init("A", "2");' },
    ]);
    expect(inits["contracts/x/X.sol"]).to.deep.equal([{ name: "Some Name", version: "7" }]);
    // Both occurrences are kept: a contract that re-inits under a different version would change an
    // already-deployed proxy's separator, and the domain gate asserts every occurrence agrees.
    expect(inits["contracts/y/Y.sol"]).to.deep.equal([
      { name: "A", version: "1" },
      { name: "A", version: "2" },
    ]);
  });
});

describe("the EIP-3009 token legs are pinned to recorded vectors (spec 075, FR-027)", function () {
  /**
   * These two structs are DIFFERENT in kind from every struct above, and the difference matters.
   *
   * Their authoritative typehashes live in the DEPLOYED USDC contract — Circle's, not ours. The only
   * in-repo Solidity copy is contracts/mocks/MockUSDCPermit.sol, a mock we wrote. Checking our
   * definitions against our own mock would be circular: both could drift together and the gate
   * would stay green while every gasless payment stopped verifying against real USDC.
   *
   * So they are pinned to the canonical EIP-3009 typehashes instead — fixed vectors, independently
   * checkable against the standard and against any deployed FiatTokenV2.
   *
   * PROVENANCE for both: read live from deployed USDC on Polygon 137
   * (0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359, `version()` == "2") via its
   * RECEIVE_/TRANSFER_WITH_AUTHORIZATION_TYPEHASH getters and confirmed equal — so these are
   * independent vectors, not hashes of our own strings.
   */
  const VECTORS = {
    ReceiveWithAuthorization: {
      table: "RECEIVE_WITH_AUTHORIZATION_TYPES",
      // Recorded 2026-08-03; re-read 2026-08-08.
      typeString:
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)",
      typehash: "0xd099cc98ef71107a616c4f0f941f04c322d8e254fe26b3c6668db87aae413de8",
      // The escrow-side leg: the token enforces `to == msg.sender`, so only the recipient contract
      // can submit it (pool joins, stake pulls).
    },
    TransferWithAuthorization: {
      table: "TRANSFER_WITH_AUTHORIZATION_TYPES",
      // Recorded 2026-08-08.
      typeString:
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)",
      typehash: "0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267",
      // The wallet-to-wallet leg (Pay & Transfer): any address may submit it, so the relayer need
      // not be the recipient.
    },
  };

  for (const [primaryType, v] of Object.entries(VECTORS)) {
    it(`renders the canonical ${primaryType} type string`, async function () {
      const pkg = await import("@fairwins/intent-types");
      expect(pkg.typeStringFor(primaryType, pkg[v.table])).to.equal(v.typeString);
    });

    it(`hashes ${primaryType} to the typehash deployed USDC verifies against`, async function () {
      const pkg = await import("@fairwins/intent-types");
      const ours = keccak256(toUtf8Bytes(pkg.typeStringFor(primaryType, pkg[v.table])));
      expect(ours, "a gasless payment signed with this struct would not verify against real USDC").to.equal(
        v.typehash,
      );
    });
  }

  it("keeps the two legs distinct", async function () {
    // Same six fields, different names — and the name is the whole difference: it decides whether
    // the token will accept a submitter that is not the recipient. Collapsing them into one table
    // would silently let a wallet-to-wallet payment be signed as a receive-only authorization.
    const pkg = await import("@fairwins/intent-types");
    expect(Object.keys(pkg.RECEIVE_WITH_AUTHORIZATION_TYPES)).to.deep.equal(["ReceiveWithAuthorization"]);
    expect(Object.keys(pkg.TRANSFER_WITH_AUTHORIZATION_TYPES)).to.deep.equal(["TransferWithAuthorization"]);
    expect(VECTORS.ReceiveWithAuthorization.typehash).to.not.equal(VECTORS.TransferWithAuthorization.typehash);
  });
});
