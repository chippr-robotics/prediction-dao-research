const { expect } = require("chai");
const hre = require("hardhat");

/**
 * Spec 074, FR-002 / SC-002 — the EVM target must be DECLARED BY THIS REPOSITORY.
 *
 * Before spec 074 only the 0.8.23 compiler entry pinned `evmVersion`. The 0.8.24 entry — 116 of
 * the repo's 120 contracts — and all 38 per-file overrides declared nothing, so their EVM target
 * came from Hardhat's own internal default
 * (config-resolution.js: `compiler.settings?.evmVersion ?? "paris"` for solc >= 0.8.20)
 * while `hardhat` is depended on as a caret range. The EVM target of nearly all deployed bytecode
 * was therefore a property of a floating third-party default rather than of this repo.
 *
 * Why that matters concretely: `shanghai` emits PUSH0 and `cancun` emits MCOPY. Both are
 * undeployable on ETC 61 and Mordor 63 (live networks per CLAUDE.md), and both change deployed
 * bytecode — hence every CREATE2 address — against UUPS proxies at STABLE addresses.
 *
 * READ `hre.userConfig`, NOT `hre.config`.
 * ---------------------------------------
 * This is the whole point of the test and it is easy to get wrong. `hre.config` is the RESOLVED
 * config, into which Hardhat has already substituted its default — so an assertion against it
 * passes whether or not the repo declared anything. Measured at adoption: userConfig reported
 * evmVersion on 0 of 38 overrides while the resolved config reported it on all 38. A test written
 * against `hre.config` is a gate that cannot fail, which is exactly what spec 074 exists to
 * eliminate. `hre.userConfig` is the raw module export and is the only surface that answers
 * "did WE declare this?".
 *
 * Both surfaces are checked below: userConfig for the declaration, hre.config for the effective
 * value that actually reaches solc.
 */
const REQUIRED_EVM_VERSION = "paris";

describe("Compiler configuration: EVM target is declared, not inherited", function () {
  describe("declared by this repository (hre.userConfig)", function () {
    it("declares an explicit evmVersion on every compiler entry", function () {
      const compilers = hre.userConfig.solidity.compilers;
      expect(compilers, "expected at least one compiler entry").to.have.length.greaterThan(0);

      const undeclared = compilers
        .filter((c) => !c.settings || typeof c.settings.evmVersion !== "string")
        .map((c) => c.version);

      expect(
        undeclared,
        `compiler entries declaring no evmVersion: ${undeclared.join(", ")}. ` +
          "An undeclared entry silently inherits Hardhat's internal default."
      ).to.deep.equal([]);
    });

    it("declares an explicit evmVersion on every per-file override", function () {
      const overrides = hre.userConfig.solidity.overrides || {};
      const undeclared = Object.entries(overrides)
        .filter(([, cfg]) => !cfg.settings || typeof cfg.settings.evmVersion !== "string")
        .map(([file]) => file);

      expect(
        undeclared.length,
        `${undeclared.length} of ${Object.keys(overrides).length} overrides declare no evmVersion, ` +
          `e.g. ${undeclared.slice(0, 3).join(", ")}`
      ).to.equal(0);
    });
  });

  describe("effective value reaching solc (hre.config)", function () {
    it("pins every compiler entry to the deployable target", function () {
      for (const c of hre.config.solidity.compilers) {
        expect(
          c.settings.evmVersion,
          `solc ${c.version} targets "${c.settings.evmVersion}". Only "${REQUIRED_EVM_VERSION}" is ` +
            "deployable on ETC 61 / Mordor 63 (shanghai emits PUSH0, cancun emits MCOPY)."
        ).to.equal(REQUIRED_EVM_VERSION);
      }
    });

    it("pins every per-file override to the deployable target", function () {
      for (const [file, cfg] of Object.entries(hre.config.solidity.overrides || {})) {
        expect(
          cfg.settings.evmVersion,
          `override for ${file} targets "${cfg.settings.evmVersion}", expected "${REQUIRED_EVM_VERSION}"`
        ).to.equal(REQUIRED_EVM_VERSION);
      }
    });
  });
});
