const { expect } = require("chai");
const { ethers } = require("hardhat");

const {
  FLOAT_PRECISION,
  BPS_TO_FACTOR,
  UI_FEE_FACTOR,
  MAX_UI_FEE_FACTOR,
  uiFeeFactorKey,
  factorToBps,
  bpsToFactor,
  gmxAddressesFor,
  bpsProvided,
  parseBps,
  assertWithinCap,
  assertSignerIsReceiver,
  assertPostCheck,
  GMX,
} = require("../../scripts/ops/lib/gmxUiFee");

/**
 * spec 083 / T063 — the network-free half of `scripts/ops/set-gmx-ui-fee-factor.js`.
 *
 * This is an ops script an operator runs against MAINNET (Arbitrum) with a real key, and only two
 * things in it can go wrong quietly: the unit conversion (bps -> GMX's 1e30-precision factor) and
 * the receiver (`setUiFeeFactor` credits `msg.sender`, so the signer IS the fee receiver). Both
 * decide real revenue and neither would revert. Everything below is asserted against GMX's own
 * definitions rather than against a re-implementation of them.
 *
 * The live reads stay out of scope on purpose: the script reads `MAX_UI_FEE_FACTOR` from GMX
 * instead of assuming 10 bps, and a test must not make that assumption on GMX's behalf. What is
 * tested here is what the script DOES with whatever cap GMX reports.
 */
describe("GMX UI fee factor ops helpers (spec 083)", function () {
  // GMX's own units: FLOAT_PRECISION 1e30 is "1.0" (=100%), so 1 bp is 1e26.
  const ONE_BP = 10n ** 26n;

  describe("unit conversion (bps <-> GMX factor)", function () {
    it("1e30 is 1.0 and 1 bp is 1e26", function () {
      expect(FLOAT_PRECISION).to.equal(10n ** 30n);
      expect(BPS_TO_FACTOR).to.equal(ONE_BP);
      // 100% == 10,000 bps, which is the only reading of FLOAT_PRECISION that makes 1e26 a bp.
      expect(FLOAT_PRECISION / BPS_TO_FACTOR).to.equal(10_000n);
    });

    it("converts the rates that matter: 5 bps is 5e26, the 10 bps cap is 1e27", function () {
      expect(bpsToFactor(5)).to.equal(5n * 10n ** 26n);
      expect(bpsToFactor(5)).to.equal(500000000000000000000000000n); // the value sent on Arbitrum
      expect(bpsToFactor(10)).to.equal(10n ** 27n); // == the live MAX_UI_FEE_FACTOR
      expect(bpsToFactor(0)).to.equal(0n);
    });

    it("round-trips across the range", function () {
      for (let bps = 0; bps <= 10_000; bps += 97) {
        expect(factorToBps(bpsToFactor(bps)), `${bps} bps`).to.equal(bps);
      }
      for (const bps of [0, 1, 2, 5, 9, 10, 11, 50, 100, 250, 10_000]) {
        expect(factorToBps(bpsToFactor(bps)), `${bps} bps`).to.equal(bps);
      }
    });

    it("is not off by an order of magnitude in either direction", function () {
      // The failure this guards: 1e25 (0.1 bp) or 1e27 (10 bps) mistaken for 1 bp. Both would
      // send successfully and charge 10x too little or 10x too much, forever, silently.
      expect(factorToBps(10n ** 25n)).to.equal(0);
      expect(factorToBps(10n ** 26n)).to.equal(1);
      expect(factorToBps(10n ** 27n)).to.equal(10);
    });

    it("factorToBps truncates a sub-bp factor rather than rounding up", function () {
      // Only ever used to DISPLAY a factor GMX already holds. Truncating means a factor of
      // 1.9 bps reports "1 bps" — never a rate higher than the one actually in force.
      expect(factorToBps(ONE_BP + ONE_BP / 2n)).to.equal(1);
      expect(factorToBps(2n * ONE_BP - 1n)).to.equal(1);
    });
  });

  describe("DataStore key derivation (GMX Keys.sol)", function () {
    // Pinned digests. Re-deriving them with the same ethers calls the module uses would assert
    // nothing; these are the bytes GMX's DataStore is actually keyed by, and the script read a
    // non-zero MAX_UI_FEE_FACTOR from the live chain with them (tasks.md T062).
    it("UI_FEE_FACTOR and MAX_UI_FEE_FACTOR are the pinned GMX keys", function () {
      expect(UI_FEE_FACTOR).to.equal(
        "0x1183017aa6dc064c15e97f13e90ee4514112c290e234df5a0fc8dbaafe0ccdf8"
      );
      expect(MAX_UI_FEE_FACTOR).to.equal(
        "0xab045c9d202ad7ee7dd9fa7ab3c082d9835872721eaf03397e59b961fe399329"
      );
      expect(UI_FEE_FACTOR).to.not.equal(MAX_UI_FEE_FACTOR);
    });

    it("uses abi.encode, not encodePacked (a different key reads a different slot)", function () {
      const coder = ethers.AbiCoder.defaultAbiCoder();
      expect(UI_FEE_FACTOR).to.equal(ethers.keccak256(coder.encode(["string"], ["UI_FEE_FACTOR"])));
      // encodePacked of a string is the bare bytes — the classic way to key the wrong slot and
      // read 0, which would look exactly like "no fee is configured".
      expect(UI_FEE_FACTOR).to.not.equal(ethers.id("UI_FEE_FACTOR"));
    });

    it("keys the factor per account, and is case-insensitive on the address", function () {
      const a = "0x52502d049571C7893447b86c4d8B38e6184bF6e1"; // the live receiver
      const b = "0x000000000000000000000000000000000000dEaD";
      expect(uiFeeFactorKey(a)).to.equal(
        "0x4250a5646e3b385f82087f9a2c6b20b498244a2e55973a3c08480653e44e0cfe"
      );
      expect(uiFeeFactorKey(a)).to.not.equal(uiFeeFactorKey(b));
      // A lowercased address must reach the same slot, or a report would read 0 for an account
      // that in fact has a rate set.
      expect(uiFeeFactorKey(a.toLowerCase())).to.equal(uiFeeFactorKey(a));
    });

    it("refuses a malformed account rather than deriving a plausible-looking key", function () {
      expect(() => uiFeeFactorKey("not-an-address")).to.throw();
      expect(() => uiFeeFactorKey("0x1234")).to.throw();
    });
  });

  describe("chain scope", function () {
    it("resolves Arbitrum 42161 to the GMX ExchangeRouter and DataStore", function () {
      const cfg = gmxAddressesFor(42161);
      expect(cfg.exchangeRouter).to.equal("0x7dE39FF2e232A2203196788d37e234cF8F1b83f1");
      expect(cfg.dataStore).to.equal("0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8");
      expect(ethers.isAddress(cfg.exchangeRouter)).to.equal(true);
      expect(ethers.isAddress(cfg.dataStore)).to.equal(true);
    });

    it("Arbitrum is the ONLY chain (GMX also runs on Avalanche; FairWins does not)", function () {
      expect(Object.keys(GMX)).to.deep.equal(["42161"]);
      // 43114 = Avalanche, where GMX v2 exists. Setting a rate there would configure a receiver
      // the app never reads, and the operator would believe the fee was on.
      for (const chainId of [1, 137, 42161 + 1, 43114, 8453]) {
        if (chainId === 42161) continue;
        expect(() => gmxAddressesFor(chainId), `chainId ${chainId}`).to.throw(
          /not deployed on chainId|Arbitrum \(42161\) only/
        );
      }
    });
  });

  describe("BPS parsing — the report-only default", function () {
    it("an unset BPS is report-only (the safe default run)", function () {
      expect(bpsProvided(undefined)).to.equal(false);
      expect(bpsProvided(null)).to.equal(false);
    });

    it("any present BPS is a set attempt, and is parsed rather than assumed", function () {
      expect(bpsProvided("0")).to.equal(true);
      expect(bpsProvided("5")).to.equal(true);
    });

    it("parses the documented invocations", function () {
      expect(parseBps("5")).to.equal(5);
      expect(parseBps("0")).to.equal(0); // explicitly turning the fee off is a legitimate request
      expect(parseBps("10")).to.equal(10);
    });

    it("refuses a BLANK BPS instead of silently reading it as zero", function () {
      // Number("") === 0 in JavaScript. Without this guard, an operator with an empty `BPS=` left
      // in their shell would set the rate to 0 — turning off revenue with no error and no prompt.
      for (const blank of ["", " ", "\t", "\n  "]) {
        expect(() => parseBps(blank), JSON.stringify(blank)).to.throw(
          /BPS must be a non-negative integer/
        );
      }
    });

    it("refuses non-integer, negative and nonsense rates", function () {
      for (const bad of ["-1", "1.5", "abc", "5bps", "NaN", "Infinity"]) {
        expect(() => parseBps(bad), bad).to.throw(/BPS must be a non-negative integer/);
      }
    });

    it("names the offending value in the refusal", function () {
      expect(() => parseBps("abc")).to.throw('got "abc"');
    });
  });

  describe("cap enforcement (against GMX's LIVE cap, never an assumed one)", function () {
    const liveCap = 10n ** 27n; // what GMX reported on Arbitrum: 10 bps

    it("allows a rate at or below the cap", function () {
      for (const bps of [0, 1, 5, 9, 10]) {
        expect(
          () => assertWithinCap({ bps, factor: bpsToFactor(bps), maxFactor: liveCap }),
          `${bps} bps`
        ).to.not.throw();
      }
    });

    it("refuses a rate above the cap, naming both the request and the cap", function () {
      const over = () => assertWithinCap({ bps: 11, factor: bpsToFactor(11), maxFactor: liveCap });
      expect(over).to.throw(/exceeds GMX's live MAX_UI_FEE_FACTOR/);
      expect(over).to.throw(/BPS=11/);
      expect(over).to.throw(/10 bps/); // the cap in the units the operator asked in
      expect(over).to.throw(/InvalidUiFeeFactor/); // what GMX would have done with the gas
    });

    it("NEVER clamps: an over-cap request is refused, not quietly reduced", function () {
      // The failure mode this rules out is an operator who asks for 25 bps, sees a success, and
      // believes 25 bps is in force while GMX charges 10.
      expect(() =>
        assertWithinCap({ bps: 25, factor: bpsToFactor(25), maxFactor: liveCap })
      ).to.throw();
    });

    it("compares against whatever cap GMX reports, not a hardcoded 10 bps", function () {
      // GMX governance can move MAX_UI_FEE_FACTOR. If it drops to 3 bps, 5 bps must start failing;
      // if it rises to 20 bps, 11 bps must start passing. A baked-in 10 would get both wrong.
      const tightened = 3n * 10n ** 26n;
      expect(() =>
        assertWithinCap({ bps: 5, factor: bpsToFactor(5), maxFactor: tightened })
      ).to.throw(/3 bps/);

      const loosened = 20n * 10n ** 26n;
      expect(() =>
        assertWithinCap({ bps: 11, factor: bpsToFactor(11), maxFactor: loosened })
      ).to.not.throw();
    });

    it("a cap of zero refuses every non-zero rate but still permits turning the fee off", function () {
      expect(() => assertWithinCap({ bps: 1, factor: bpsToFactor(1), maxFactor: 0n })).to.throw();
      expect(() =>
        assertWithinCap({ bps: 0, factor: bpsToFactor(0), maxFactor: 0n })
      ).to.not.throw();
    });
  });

  describe("receiver — the signer IS the fee receiver", function () {
    const receiver = "0x52502d049571C7893447b86c4d8B38e6184bF6e1";
    const other = "0x000000000000000000000000000000000000dEaD";

    it("permits a send when the signer is the expected receiver", function () {
      expect(() =>
        assertSignerIsReceiver({ signerAddress: receiver, expectedReceiver: receiver })
      ).to.not.throw();
    });

    it("matches case-insensitively (checksum vs lowercase is the same account)", function () {
      expect(() =>
        assertSignerIsReceiver({
          signerAddress: receiver.toLowerCase(),
          expectedReceiver: receiver,
        })
      ).to.not.throw();
      expect(() =>
        assertSignerIsReceiver({
          signerAddress: receiver,
          expectedReceiver: receiver.toUpperCase().replace("0X", "0x"),
        })
      ).to.not.throw();
    });

    it("REFUSES to send when the signer is not the expected receiver", function () {
      // setUiFeeFactor has no receiver parameter. Sending from the wrong key would credit that
      // key, accrue nothing to the configured uiFeeReceiver, and revert nothing.
      const mismatched = () =>
        assertSignerIsReceiver({ signerAddress: other, expectedReceiver: receiver });
      expect(mismatched).to.throw(/Receiver mismatch/);
      expect(mismatched).to.throw(/credits msg.sender/);
      expect(mismatched).to.throw(other); // both addresses named, so the operator can see which
      expect(mismatched).to.throw(receiver);
    });

    it("refuses with no signer rather than reporting a send it could not make", function () {
      for (const signerAddress of [null, undefined, ""]) {
        expect(() =>
          assertSignerIsReceiver({ signerAddress, expectedReceiver: receiver })
        ).to.throw(/No signer available/);
      }
    });
  });

  describe("post-send verification", function () {
    it("accepts only the exact factor asked for", function () {
      const factor = bpsToFactor(5);
      expect(() => assertPostCheck({ expected: factor, actual: factor })).to.not.throw();
    });

    it("fails loudly when the DataStore reports anything else", function () {
      expect(() =>
        assertPostCheck({ expected: bpsToFactor(5), actual: bpsToFactor(10) })
      ).to.throw(/Post-check mismatch/);
      // 0 is the shape of "the write did not land" — it must never read as success.
      expect(() => assertPostCheck({ expected: bpsToFactor(5), actual: 0n })).to.throw(
        /Post-check mismatch/
      );
    });
  });

  describe("the fee the member is told about is the fee that is set", function () {
    it("5 bps of notional is ~50 bps of margin at 10x — the disclosure the legal text makes", function () {
      // Not a property of this script, but the number it writes on-chain is the number the risk
      // disclosure and the confirm UI quote. If the conversion here drifted, the disclosure would
      // become untrue without any test elsewhere noticing.
      const bps = factorToBps(bpsToFactor(5));
      expect(bps).to.equal(5);
      expect(bps * 10).to.equal(50); // 10x leverage
    });
  });
});
