const { expect } = require("chai");
const { ethers } = require("hardhat");

// Spec 073 — MiniAppRegistry: submission (US3), lifecycle (US4), the approved/proposed
// serving invariant (US1 / FR-003), views, and gate administration.
//
// The invariant under the microscope here is I2 (data-model.md §1): a vendor may propose new
// package bytes but can NEVER change what a host executes. Every "approved unchanged" assertion
// below is that promise — if one of them ever goes red, a vendor can hot-swap running code.
//
// Deploys the REAL MembershipManager and SanctionsGuard so both optional gates are exercised
// end-to-end rather than stubbed.

const VENDOR_ROLE = ethers.id("WAGER_PARTICIPANT_ROLE"); // the only user-purchasable role
const Tier = { None: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
const Status = { Pending: 0, Approved: 1, Suspended: 2, Deprecated: 3 };
const Category = {
  TradeSettlement: 0,
  Reconciliation: 1,
  TreasuryLiquidity: 2,
  IdentityCompliance: 3,
  AssetServicing: 4,
  ReportingAudit: 5,
};

const CID_A = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const CID_B = "bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";
const CID_C = "bafybeiczsscdsbs7ffqz55asqdf3smv6klcw3gofszvwlyarci47bgf354";
const HASH_A = ethers.id("manifest-a");
const HASH_B = ethers.id("manifest-b");
const HASH_C = ethers.id("manifest-c");

async function deployProxy(name, initArgs) {
  const Impl = await ethers.getContractFactory(name);
  const impl = await Impl.deploy();
  await impl.waitForDeployment();
  const initData = Impl.interface.encodeFunctionData("initialize", initArgs);
  const Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const proxy = await Proxy.deploy(await impl.getAddress(), initData);
  await proxy.waitForDeployment();
  return Impl.attach(await proxy.getAddress());
}

/// Gate-free registry: the shape most tests want, so a failure points at lifecycle logic rather
/// than at membership plumbing.
async function fixture() {
  const [admin, curator, vendor, vendor2, outsider] = await ethers.getSigners();

  const reg = await deployProxy("MiniAppRegistry", [
    admin.address,
    curator.address, // first curator — the role administers itself, so it must be seeded here
    ethers.ZeroAddress, // membership gate off
    ethers.ZeroHash,
    Tier.None,
    ethers.ZeroAddress, // sanctions screening off
  ]);

  return { reg, admin, curator, vendor, vendor2, outsider };
}

/// Registry with BOTH optional gates wired to real contracts.
async function gatedFixture() {
  const [admin, curator, vendor, vendor2, outsider] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("MockERC20");
  const token = await Token.deploy("USD Coin", "USDC", 6);
  await token.waitForDeployment();

  const Oracle = await ethers.getContractFactory("MockSanctionsOracle");
  const oracle = await Oracle.deploy();
  await oracle.waitForDeployment();

  const Guard = await ethers.getContractFactory("SanctionsGuard");
  const guard = await Guard.deploy(admin.address, await oracle.getAddress());
  await guard.waitForDeployment();

  const membership = await deployProxy("MembershipManager", [
    admin.address,
    await token.getAddress(),
    admin.address, // treasury
  ]);

  const reg = await deployProxy("MiniAppRegistry", [
    admin.address,
    curator.address,
    await membership.getAddress(),
    VENDOR_ROLE,
    Tier.Silver,
    await guard.getAddress(),
  ]);

  // vendor clears the Silver floor; vendor2 sits below it.
  await membership.connect(admin).grantMembership(vendor.address, VENDOR_ROLE, Tier.Gold, 365);
  await membership.connect(admin).grantMembership(vendor2.address, VENDOR_ROLE, Tier.Bronze, 365);

  return { reg, membership, guard, oracle, admin, curator, vendor, vendor2, outsider };
}

/// Submit + approve, leaving the app Approved on package A.
async function submitAndApprove(reg, vendor, curator, name = "Token Mint") {
  await reg.connect(vendor).submitApp(name, "Mint and distribute tokens", Category.AssetServicing, CID_A, HASH_A);
  const id = await reg.appCount();
  await reg.connect(curator).approveApp(id, HASH_A);
  return id;
}

describe("MiniAppRegistry (spec 073)", function () {
  describe("initialization", function () {
    it("seeds the first curator and keeps the admin out of curation", async function () {
      const { reg, admin, curator } = await fixture();
      expect(await reg.hasRole(await reg.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
      expect(await reg.hasRole(await reg.UPGRADER_ROLE(), admin.address)).to.equal(true);
      expect(await reg.hasRole(await reg.APP_CURATOR_ROLE(), curator.address)).to.equal(true);
      expect(await reg.hasRole(await reg.APP_CURATOR_ROLE(), admin.address)).to.equal(false);
    });

    it("makes the curator role self-administering so admin cannot grant itself curation", async function () {
      const { reg, admin, curator, vendor } = await fixture();
      const curatorRole = await reg.APP_CURATOR_ROLE();

      // The whole point of the separation: OZ would default this to DEFAULT_ADMIN_ROLE, which would let
      // the gate administrator self-grant curation in one transaction and make the trust boundary a comment.
      expect(await reg.getRoleAdmin(curatorRole)).to.equal(curatorRole);
      await expect(reg.connect(admin).grantRole(curatorRole, admin.address)).to.be.revertedWithCustomError(
        reg,
        "AccessControlUnauthorizedAccount"
      );
      // Only a curator can create a curator.
      await reg.connect(curator).grantRole(curatorRole, vendor.address);
      expect(await reg.hasRole(curatorRole, vendor.address)).to.equal(true);
    });

    it("rejects a zero admin or a zero curator", async function () {
      const [admin] = await ethers.getSigners();
      const Impl = await ethers.getContractFactory("MiniAppRegistry");
      const impl = await Impl.deploy();
      await impl.waitForDeployment();
      const Proxy = await ethers.getContractFactory("ERC1967Proxy");

      for (const args of [
        [ethers.ZeroAddress, admin.address, ethers.ZeroAddress, ethers.ZeroHash, Tier.None, ethers.ZeroAddress],
        // A registry with no curator could never be granted one (the role administers itself), so every
        // listing would be stuck Pending forever.
        [admin.address, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroHash, Tier.None, ethers.ZeroAddress],
      ]) {
        const initData = Impl.interface.encodeFunctionData("initialize", args);
        await expect(Proxy.deploy(await impl.getAddress(), initData)).to.be.revertedWithCustomError(
          Impl,
          "ZeroAddress"
        );
      }
    });

    it("rejects a membership manager configured without a role", async function () {
      const [admin, curator] = await ethers.getSigners();
      const Impl = await ethers.getContractFactory("MiniAppRegistry");
      const impl = await Impl.deploy();
      await impl.waitForDeployment();
      const initData = Impl.interface.encodeFunctionData("initialize", [
        admin.address,
        curator.address,
        admin.address, // non-zero "manager"
        ethers.ZeroHash, // ...but no role: would gate every vendor on a role nobody holds
        Tier.None,
        ethers.ZeroAddress,
      ]);
      const Proxy = await ethers.getContractFactory("ERC1967Proxy");
      await expect(Proxy.deploy(await impl.getAddress(), initData)).to.be.revertedWithCustomError(
        Impl,
        "InvalidGateConfig"
      );
    });
  });

  // Regression suite for the findings of the spec-073 adversarial security review. Each test here
  // reproduces an attack that the original implementation permitted; they are the reason approval is
  // content-committed and launchability is expressed on-chain.
  describe("supply-chain attacks (security review regressions)", function () {
    it("refuses an approval whose reviewed package was swapped out from under it", async function () {
      const { reg, vendor, curator } = await fixture();
      await reg.connect(vendor).submitApp("Token Mint", "d", Category.AssetServicing, CID_A, HASH_A);

      // The curator reviews package A. Before their (multisig, therefore slow and public) approval
      // lands, the vendor swaps in package B — by front-running, or during the signing window.
      await reg.connect(vendor).submitUpdate(1, CID_B, HASH_B);

      // The approval names the hash that was REVIEWED, so it cannot promote the substitute.
      await expect(reg.connect(curator).approveApp(1, HASH_A))
        .to.be.revertedWithCustomError(reg, "StaleProposal")
        .withArgs(HASH_A, HASH_B);

      const app = await reg.getApp(1);
      expect(app.status).to.equal(Status.Pending);
      expect(app.approved.cid).to.equal(""); // nothing unreviewed became servable
      expect(app.launchable).to.equal(false);
    });

    it("refuses a swapped-in package on an app that is already live", async function () {
      const { reg, vendor, curator } = await fixture();
      const id = await submitAndApprove(reg, vendor, curator);
      await reg.connect(vendor).submitUpdate(id, CID_B, HASH_B); // reviewed by the curator
      await reg.connect(vendor).submitUpdate(id, CID_C, HASH_C); // swapped after review

      await expect(reg.connect(curator).approveApp(id, HASH_B))
        .to.be.revertedWithCustomError(reg, "StaleProposal")
        .withArgs(HASH_B, HASH_C);
      // The live package is untouched and still serving.
      const app = await reg.getApp(id);
      expect(app.approved.cid).to.equal(CID_A);
      expect(app.launchable).to.equal(true);
    });

    it("does not silently promote an armed proposal when a curator reinstates an app", async function () {
      const { reg, vendor, curator } = await fixture();
      const id = await submitAndApprove(reg, vendor, curator);
      await reg.connect(vendor).submitUpdate(id, CID_B, HASH_B); // proposal left armed
      await reg.connect(curator).suspendApp(id);

      // Lifting the suspension by naming the package that was already approved must not ship B.
      await expect(reg.connect(curator).approveApp(id, HASH_A))
        .to.be.revertedWithCustomError(reg, "StaleProposal")
        .withArgs(HASH_A, HASH_B);

      // The honest path: reject the proposal, then reinstate.
      await reg.connect(curator).rejectProposal(id, HASH_B);
      await reg.connect(curator).approveApp(id, HASH_A);
      const app = await reg.getApp(id);
      expect(app.approved.cid).to.equal(CID_A);
      expect(app.proposed.cid).to.equal("");
      expect(app.launchable).to.equal(true);
    });

    it("keeps a live app launchable while its update is in review", async function () {
      const { reg, vendor, curator } = await fixture();
      const id = await submitAndApprove(reg, vendor, curator);
      expect(await reg.isLaunchable(id)).to.equal(true);

      // Submitting an update must NOT be an offline switch a vendor can pull on their own live app.
      await reg.connect(vendor).submitUpdate(id, CID_B, HASH_B);
      const app = await reg.getApp(id);
      expect(app.status).to.equal(Status.Pending); // review state
      expect(app.launchable).to.equal(true); // ...but still serving the reviewed package (FR-003)
      expect(app.approved.cid).to.equal(CID_A);

      // Metadata edits likewise.
      await reg.connect(vendor).updateMetadata(id, "Token Mint", "New copy", Category.AssetServicing);
      expect(await reg.isLaunchable(id)).to.equal(true);
    });

    it("stops serving on suspension and deprecation, and never serves an unapproved app", async function () {
      const { reg, vendor, curator } = await fixture();
      await reg.connect(vendor).submitApp("Fresh", "d", Category.AssetServicing, CID_A, HASH_A);
      expect(await reg.isLaunchable(1)).to.equal(false); // never approved

      const id = await submitAndApprove(reg, vendor, curator, "Live");
      await reg.connect(curator).suspendApp(id);
      expect(await reg.isLaunchable(id)).to.equal(false);
      await reg.connect(curator).approveApp(id, HASH_A);
      expect(await reg.isLaunchable(id)).to.equal(true);
      await reg.connect(curator).deprecateApp(id);
      expect(await reg.isLaunchable(id)).to.equal(false);

      expect(await reg.isLaunchable(999)).to.equal(false); // unknown id
    });

    it("gives the curator a reject path that neither ships nor retires the app", async function () {
      const { reg, vendor, curator } = await fixture();
      const id = await submitAndApprove(reg, vendor, curator);
      await reg.connect(vendor).submitUpdate(id, CID_B, HASH_B);

      await expect(reg.connect(curator).rejectProposal(id, HASH_B))
        .to.emit(reg, "AppProposalRejected")
        .withArgs(id, curator.address, CID_B, HASH_B, 2);

      const app = await reg.getApp(id);
      expect(app.proposed.cid).to.equal(""); // no longer armed for the next approval
      expect(app.status).to.equal(Status.Approved); // service restored, not suspended or retired
      expect(app.approved.cid).to.equal(CID_A);
      expect(app.launchable).to.equal(true);

      // The vendor can try again; the rejected number is burned, so this is v3 — a compliance log
      // that says "v2 rejected" must never later say "v2 approved".
      await reg.connect(vendor).submitUpdate(id, CID_C, HASH_C);
      expect((await reg.getApp(id)).proposed.version).to.equal(3);
    });

    it("rejects a first submission without making it servable", async function () {
      const { reg, vendor, curator } = await fixture();
      await reg.connect(vendor).submitApp("Token Mint", "d", Category.AssetServicing, CID_A, HASH_A);
      await reg.connect(curator).rejectProposal(1, HASH_A);

      const app = await reg.getApp(1);
      expect(app.status).to.equal(Status.Pending); // never approved, so it stays in the queue
      expect(app.approved.cid).to.equal("");
      expect(app.launchable).to.equal(false);
    });

    it("guards rejection against the same swap attack, and refuses when nothing is proposed", async function () {
      const { reg, vendor, curator } = await fixture();
      const id = await submitAndApprove(reg, vendor, curator);
      await reg.connect(vendor).submitUpdate(id, CID_B, HASH_B);
      await reg.connect(vendor).submitUpdate(id, CID_C, HASH_C);

      // A vendor must not be able to have a fresh submission discarded by a stale rejection.
      await expect(reg.connect(curator).rejectProposal(id, HASH_B))
        .to.be.revertedWithCustomError(reg, "StaleProposal")
        .withArgs(HASH_B, HASH_C);

      await reg.connect(curator).rejectProposal(id, HASH_C);
      await expect(reg.connect(curator).rejectProposal(id, HASH_C)).to.be.revertedWithCustomError(
        reg,
        "NothingProposed"
      );
    });

    it("does not let a rejection quietly lift a suspension", async function () {
      const { reg, vendor, curator } = await fixture();
      const id = await submitAndApprove(reg, vendor, curator);
      await reg.connect(vendor).submitUpdate(id, CID_B, HASH_B);
      await reg.connect(curator).suspendApp(id);

      await reg.connect(curator).rejectProposal(id, HASH_B);
      const app = await reg.getApp(id);
      expect(app.status).to.equal(Status.Suspended); // a curator decision about the listing outranks it
      expect(app.launchable).to.equal(false);
    });

    it("restricts rejection to curators and refuses it on a deprecated record", async function () {
      const { reg, vendor, curator, admin, outsider } = await fixture();
      const id = await submitAndApprove(reg, vendor, curator);
      await reg.connect(vendor).submitUpdate(id, CID_B, HASH_B);

      for (const caller of [vendor, outsider, admin]) {
        await expect(reg.connect(caller).rejectProposal(id, HASH_B)).to.be.revertedWithCustomError(
          reg,
          "AccessControlUnauthorizedAccount"
        );
      }
      await reg.connect(curator).deprecateApp(id);
      await expect(reg.connect(curator).rejectProposal(id, HASH_B)).to.be.revertedWithCustomError(
        reg,
        "AppDeprecatedError"
      );
    });

    it("treats spacing and case variants of a name as one listing", async function () {
      const { reg, vendor, vendor2 } = await fixture();
      await reg.connect(vendor).submitApp("Token Mint", "d", Category.AssetServicing, CID_A, HASH_A);

      // Case folding alone would leave these registrable — the cheapest impersonation there is.
      for (const lookalike of ["  Token   Mint  ", "token  mint", "TOKEN MINT "]) {
        await expect(
          reg.connect(vendor2).submitApp(lookalike, "d", Category.AssetServicing, CID_B, HASH_B)
        ).to.be.revertedWithCustomError(reg, "DuplicateName");
        expect(await reg.idByName(lookalike)).to.equal(1);
      }
    });

    it("refuses blank and control-character names", async function () {
      const { reg, vendor } = await fixture();
      // "   " passes a raw length check but normalizes to the empty key, which every later blank
      // name would then collide with.
      await expect(
        reg.connect(vendor).submitApp("   ", "d", Category.AssetServicing, CID_A, HASH_A)
      ).to.be.revertedWithCustomError(reg, "EmptyName");
      // Invisible in a catalog card ⇒ two listings could render identically to a member.
      for (const sneaky of ["Token\u0000Mint", "Token\tMint", "Token\nMint", "Token\u007fMint"]) {
        await expect(
          reg.connect(vendor).submitApp(sneaky, "d", Category.AssetServicing, CID_A, HASH_A)
        ).to.be.revertedWithCustomError(reg, "InvalidName");
      }
    });
  });

  describe("submission (US3)", function () {
    it("creates a Pending record with the package in `proposed` and nothing approved", async function () {
      const { reg, vendor } = await fixture();
      await expect(
        reg.connect(vendor).submitApp("Token Mint", "Mint tokens", Category.AssetServicing, CID_A, HASH_A)
      )
        .to.emit(reg, "AppSubmitted")
        .withArgs(1, vendor.address, "Token Mint", Category.AssetServicing, CID_A, HASH_A, 1);

      const app = await reg.getApp(1);
      expect(app.vendor).to.equal(vendor.address);
      expect(app.status).to.equal(Status.Pending);
      expect(app.proposed.cid).to.equal(CID_A);
      expect(app.proposed.manifestHash).to.equal(HASH_A);
      expect(app.proposed.version).to.equal(1);
      // Nothing servable yet — invariant I1.
      expect(app.approved.cid).to.equal("");
      expect(app.approved.version).to.equal(0);
      expect(app.submittedAt).to.be.greaterThan(0);
      expect(app.approvedAt).to.equal(0);
    });

    it("indexes the app by vendor and by name", async function () {
      const { reg, vendor } = await fixture();
      await reg.connect(vendor).submitApp("Token Mint", "d", Category.AssetServicing, CID_A, HASH_A);
      await reg.connect(vendor).submitApp("ClearPath", "d", Category.ReportingAudit, CID_B, HASH_B);

      expect((await reg.appIdsByVendor(vendor.address)).map(Number)).to.deep.equal([1, 2]);
      expect(await reg.idByName("Token Mint")).to.equal(1);
      // Name matching is case-insensitive, so a lookalike cannot claim a second listing.
      expect(await reg.idByName("token mint")).to.equal(1);
      expect(await reg.idByName("Nonexistent")).to.equal(0);
    });

    it("rejects a duplicate name regardless of case", async function () {
      const { reg, vendor, vendor2 } = await fixture();
      await reg.connect(vendor).submitApp("Token Mint", "d", Category.AssetServicing, CID_A, HASH_A);
      await expect(
        reg.connect(vendor2).submitApp("TOKEN MINT", "d", Category.AssetServicing, CID_B, HASH_B)
      ).to.be.revertedWithCustomError(reg, "DuplicateName");
    });

    it("rejects empty and oversized inputs", async function () {
      const { reg, vendor } = await fixture();
      const long = "x".repeat(65);

      await expect(
        reg.connect(vendor).submitApp("", "d", Category.AssetServicing, CID_A, HASH_A)
      ).to.be.revertedWithCustomError(reg, "EmptyName");
      await expect(
        reg.connect(vendor).submitApp(long, "d", Category.AssetServicing, CID_A, HASH_A)
      ).to.be.revertedWithCustomError(reg, "StringTooLong");
      await expect(
        reg.connect(vendor).submitApp("A", "x".repeat(513), Category.AssetServicing, CID_A, HASH_A)
      ).to.be.revertedWithCustomError(reg, "StringTooLong");
      await expect(
        reg.connect(vendor).submitApp("A", "d", Category.AssetServicing, "", HASH_A)
      ).to.be.revertedWithCustomError(reg, "EmptyCid");
      await expect(
        reg.connect(vendor).submitApp("A", "d", Category.AssetServicing, "x".repeat(257), HASH_A)
      ).to.be.revertedWithCustomError(reg, "StringTooLong");
      // A zero manifest hash could never match a real keccak256 — the listing could only ever
      // fail integrity verification.
      await expect(
        reg.connect(vendor).submitApp("A", "d", Category.AssetServicing, CID_A, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(reg, "EmptyManifestHash");
    });

    it("enforces the membership tier gate when configured", async function () {
      const { reg, vendor, vendor2 } = await gatedFixture();
      // Gold clears the Silver floor.
      await reg.connect(vendor).submitApp("Token Mint", "d", Category.AssetServicing, CID_A, HASH_A);
      // Bronze does not.
      await expect(
        reg.connect(vendor2).submitApp("ClearPath", "d", Category.ReportingAudit, CID_B, HASH_B)
      ).to.be.revertedWithCustomError(reg, "InsufficientMembershipTier");
    });

    it("screens vendors through the sanctions guard when configured", async function () {
      const { reg, oracle, vendor } = await gatedFixture();
      await oracle.setSanctioned(vendor.address, true);
      await expect(
        reg.connect(vendor).submitApp("Token Mint", "d", Category.AssetServicing, CID_A, HASH_A)
      ).to.be.revertedWithCustomError(reg, "SanctionedAccount");
    });

    it("only the vendor of record may update a listing", async function () {
      const { reg, vendor, outsider } = await fixture();
      await reg.connect(vendor).submitApp("Token Mint", "d", Category.AssetServicing, CID_A, HASH_A);
      await expect(reg.connect(outsider).submitUpdate(1, CID_B, HASH_B)).to.be.revertedWithCustomError(
        reg,
        "NotVendor"
      );
      await expect(
        reg.connect(outsider).updateMetadata(1, "Hijack", "d", Category.AssetServicing)
      ).to.be.revertedWithCustomError(reg, "NotVendor");
    });

    it("reverts on an unknown app id", async function () {
      const { reg, vendor } = await fixture();
      await expect(reg.getApp(1)).to.be.revertedWithCustomError(reg, "AppNotFound");
      await expect(reg.connect(vendor).submitUpdate(99, CID_A, HASH_A)).to.be.revertedWithCustomError(
        reg,
        "AppNotFound"
      );
    });
  });

  describe("the approved/proposed serving invariant (US1, FR-003)", function () {
    it("keeps serving the approved package while an update awaits review", async function () {
      const { reg, vendor, curator } = await fixture();
      const id = await submitAndApprove(reg, vendor, curator);

      // Baseline: package A is approved and servable.
      let app = await reg.getApp(id);
      expect(app.status).to.equal(Status.Approved);
      expect(app.approved.cid).to.equal(CID_A);
      expect(app.approved.manifestHash).to.equal(HASH_A);
      expect(app.approved.version).to.equal(1);
      expect(app.proposed.cid).to.equal("");

      // Vendor proposes package B.
      await expect(reg.connect(vendor).submitUpdate(id, CID_B, HASH_B))
        .to.emit(reg, "AppUpdateSubmitted")
        .withArgs(id, vendor.address, CID_B, HASH_B, 2);

      app = await reg.getApp(id);
      expect(app.status).to.equal(Status.Pending);
      // THE INVARIANT: the served tuple is untouched. A vendor cannot swap executing bytes.
      expect(app.approved.cid).to.equal(CID_A);
      expect(app.approved.manifestHash).to.equal(HASH_A);
      expect(app.approved.version).to.equal(1);
      // The new bytes sit in `proposed`, unservable, until a curator says otherwise.
      expect(app.proposed.cid).to.equal(CID_B);
      expect(app.proposed.manifestHash).to.equal(HASH_B);
      expect(app.proposed.version).to.equal(2);

      // Only approval promotes it — and the curator names the hash they reviewed.
      await expect(reg.connect(curator).approveApp(id, HASH_B))
        .to.emit(reg, "AppApproved")
        .withArgs(id, curator.address, CID_B, HASH_B, 2);

      app = await reg.getApp(id);
      expect(app.status).to.equal(Status.Approved);
      expect(app.approved.cid).to.equal(CID_B);
      expect(app.approved.version).to.equal(2);
      expect(app.proposed.cid).to.equal(""); // slot cleared on promotion
    });

    it("holds the invariant across repeated update cycles with monotonic versions", async function () {
      const { reg, vendor, curator } = await fixture();
      const id = await submitAndApprove(reg, vendor, curator);

      await reg.connect(vendor).submitUpdate(id, CID_B, HASH_B);
      // A second proposal before review replaces the first proposal, still never `approved`.
      await reg.connect(vendor).submitUpdate(id, CID_C, HASH_C);
      let app = await reg.getApp(id);
      expect(app.approved.cid).to.equal(CID_A);
      expect(app.proposed.cid).to.equal(CID_C);
      expect(app.proposed.version).to.equal(3); // versions never reused

      await reg.connect(curator).approveApp(id, HASH_C);
      app = await reg.getApp(id);
      expect(app.approved.cid).to.equal(CID_C);
      expect(app.approved.version).to.equal(3);

      await reg.connect(vendor).submitUpdate(id, CID_A, HASH_A);
      app = await reg.getApp(id);
      expect(app.approved.cid).to.equal(CID_C); // still the last approved
      expect(app.proposed.version).to.equal(4);
    });

    it("sends metadata edits back to review without disturbing the served package", async function () {
      const { reg, vendor, curator } = await fixture();
      const id = await submitAndApprove(reg, vendor, curator);

      await expect(reg.connect(vendor).updateMetadata(id, "Token Mint Pro", "Better", Category.TreasuryLiquidity))
        .to.emit(reg, "AppMetadataUpdated")
        .withArgs(id, "Token Mint Pro", "Better", Category.TreasuryLiquidity);

      const app = await reg.getApp(id);
      expect(app.status).to.equal(Status.Pending); // invariant I4
      expect(app.name).to.equal("Token Mint Pro");
      expect(app.category).to.equal(Category.TreasuryLiquidity);
      expect(app.approved.cid).to.equal(CID_A); // untouched
      expect(app.proposed.cid).to.equal(""); // metadata-only: nothing new proposed

      // Re-approval reinstates the retained package rather than reverting on an empty proposal.
      await expect(reg.connect(curator).approveApp(id, HASH_A))
        .to.emit(reg, "AppApproved")
        .withArgs(id, curator.address, CID_A, HASH_A, 1);
      expect((await reg.getApp(id)).status).to.equal(Status.Approved);
    });

    it("re-keys the name index on rename and frees the old name", async function () {
      const { reg, vendor, vendor2, curator } = await fixture();
      const id = await submitAndApprove(reg, vendor, curator);

      await reg.connect(vendor).updateMetadata(id, "Renamed", "d", Category.AssetServicing);
      expect(await reg.idByName("Renamed")).to.equal(id);
      expect(await reg.idByName("Token Mint")).to.equal(0);

      // The vacated name is claimable by someone else.
      await reg.connect(vendor2).submitApp("Token Mint", "d", Category.AssetServicing, CID_B, HASH_B);
      expect(await reg.idByName("Token Mint")).to.equal(2);

      // ...and can no longer be taken back by the original vendor.
      await expect(
        reg.connect(vendor).updateMetadata(id, "Token Mint", "d", Category.AssetServicing)
      ).to.be.revertedWithCustomError(reg, "DuplicateName");
    });
  });

  describe("curator lifecycle (US4)", function () {
    it("promotes a first submission and stamps the approval time", async function () {
      const { reg, vendor, curator } = await fixture();
      await reg.connect(vendor).submitApp("Token Mint", "d", Category.AssetServicing, CID_A, HASH_A);
      await reg.connect(curator).approveApp(1, HASH_A);

      const app = await reg.getApp(1);
      expect(app.status).to.equal(Status.Approved);
      expect(app.approved.cid).to.equal(CID_A);
      expect(app.approvedAt).to.be.greaterThan(0);
    });

    it("suspends and reinstates, keeping the package retained but unserved", async function () {
      const { reg, vendor, curator } = await fixture();
      const id = await submitAndApprove(reg, vendor, curator);

      await expect(reg.connect(curator).suspendApp(id))
        .to.emit(reg, "AppSuspended")
        .withArgs(id, curator.address);
      let app = await reg.getApp(id);
      expect(app.status).to.equal(Status.Suspended);
      expect(app.approved.cid).to.equal(CID_A); // retained, but the host must refuse to serve it

      await reg.connect(curator).approveApp(id, HASH_A);
      app = await reg.getApp(id);
      expect(app.status).to.equal(Status.Approved);
      expect(app.approved.cid).to.equal(CID_A);
    });

    it("can suspend a Pending listing whose approved package is still live", async function () {
      const { reg, vendor, curator } = await fixture();
      const id = await submitAndApprove(reg, vendor, curator);
      await reg.connect(vendor).submitUpdate(id, CID_B, HASH_B); // back to Pending, A still serving

      // A vendor must not be able to shield a live package from a curator by keeping an update open.
      await reg.connect(curator).suspendApp(id);
      expect((await reg.getApp(id)).status).to.equal(Status.Suspended);
    });

    it("freezes a suspended listing against vendor edits", async function () {
      const { reg, vendor, curator } = await fixture();
      const id = await submitAndApprove(reg, vendor, curator);
      await reg.connect(curator).suspendApp(id);

      // Otherwise a vendor could clear a compliance suspension unilaterally by resubmitting.
      await expect(reg.connect(vendor).submitUpdate(id, CID_B, HASH_B)).to.be.revertedWithCustomError(
        reg,
        "InvalidStatus"
      );
      await expect(
        reg.connect(vendor).updateMetadata(id, "New", "d", Category.AssetServicing)
      ).to.be.revertedWithCustomError(reg, "InvalidStatus");
    });

    it("treats deprecation as terminal for every mutating path", async function () {
      const { reg, vendor, curator } = await fixture();
      const id = await submitAndApprove(reg, vendor, curator);
      await reg.connect(vendor).submitUpdate(id, CID_B, HASH_B); // leave a proposal outstanding

      await expect(reg.connect(curator).deprecateApp(id))
        .to.emit(reg, "AppDeprecated")
        .withArgs(id, curator.address);

      const app = await reg.getApp(id);
      expect(app.status).to.equal(Status.Deprecated);
      expect(app.proposed.cid).to.equal(""); // it will never be reviewed
      expect(app.approved.cid).to.equal(CID_A); // kept as the explanation for members who used it

      // Invariant I3 — every mutating call reverts from here.
      await expect(reg.connect(curator).approveApp(id, HASH_A)).to.be.revertedWithCustomError(reg, "AppDeprecatedError");
      await expect(reg.connect(curator).suspendApp(id)).to.be.revertedWithCustomError(reg, "AppDeprecatedError");
      await expect(reg.connect(curator).deprecateApp(id)).to.be.revertedWithCustomError(reg, "AppDeprecatedError");
      await expect(reg.connect(vendor).submitUpdate(id, CID_C, HASH_C)).to.be.revertedWithCustomError(
        reg,
        "AppDeprecatedError"
      );
      await expect(
        reg.connect(vendor).updateMetadata(id, "X", "d", Category.AssetServicing)
      ).to.be.revertedWithCustomError(reg, "AppDeprecatedError");

      // The name stays reserved so nobody can claim a retired listing's identity.
      expect(await reg.idByName("Token Mint")).to.equal(id);
    });

    it("refuses no-op lifecycle transitions rather than logging a change that did not happen", async function () {
      const { reg, vendor, curator } = await fixture();
      const id = await submitAndApprove(reg, vendor, curator);

      await expect(reg.connect(curator).approveApp(id, HASH_A)).to.be.revertedWithCustomError(reg, "InvalidStatus");
      await reg.connect(curator).suspendApp(id);
      await expect(reg.connect(curator).suspendApp(id)).to.be.revertedWithCustomError(reg, "InvalidStatus");
    });

    it("restricts every lifecycle action to the curator role", async function () {
      const { reg, vendor, admin, outsider } = await fixture();
      await reg.connect(vendor).submitApp("Token Mint", "d", Category.AssetServicing, CID_A, HASH_A);

      for (const caller of [vendor, outsider, admin]) {
        // Even DEFAULT_ADMIN_ROLE cannot approve: configuring gates and deciding what code runs
        // are deliberately different privileges.
        await expect(reg.connect(caller).approveApp(1, HASH_A)).to.be.revertedWithCustomError(
          reg,
          "AccessControlUnauthorizedAccount"
        );
        await expect(reg.connect(caller).suspendApp(1)).to.be.revertedWithCustomError(
          reg,
          "AccessControlUnauthorizedAccount"
        );
        await expect(reg.connect(caller).deprecateApp(1)).to.be.revertedWithCustomError(
          reg,
          "AccessControlUnauthorizedAccount"
        );
      }
    });
  });

  describe("views", function () {
    it("pages over the catalog and clamps both bounds", async function () {
      const { reg, vendor, curator } = await fixture();
      for (let i = 0; i < 5; i++) {
        await reg.connect(vendor).submitApp(`App ${i}`, "d", Category.Reconciliation, CID_A, HASH_A);
      }
      await reg.connect(curator).approveApp(2, HASH_A);

      const firstTwo = await reg.getAppsPaged(0, 2);
      expect(firstTwo.length).to.equal(2);
      expect(firstTwo[0].id).to.equal(1);
      expect(firstTwo[1].id).to.equal(2);
      expect(firstTwo[1].status).to.equal(Status.Approved);

      // The window clamps to appCount rather than reverting on an over-eager request.
      const tail = await reg.getAppsPaged(3, 100);
      expect(tail.length).to.equal(2);
      expect(tail[0].id).to.equal(4);

      expect((await reg.getAppsPaged(5, 10)).length).to.equal(0); // past the end
      expect((await reg.getAppsPaged(0, 0)).length).to.equal(0);
    });

    it("reports an empty catalog honestly", async function () {
      const { reg } = await fixture();
      expect(await reg.appCount()).to.equal(0);
      expect((await reg.getAppsPaged(0, 10)).length).to.equal(0);
    });
  });

  describe("gate administration", function () {
    it("lets admin retune the membership gate and reflects it immediately", async function () {
      const { reg, membership, admin, vendor2 } = await gatedFixture();
      // vendor2 is Bronze — below the Silver floor.
      await expect(
        reg.connect(vendor2).submitApp("A", "d", Category.AssetServicing, CID_A, HASH_A)
      ).to.be.revertedWithCustomError(reg, "InsufficientMembershipTier");

      await expect(reg.connect(admin).setMembershipGate(await membership.getAddress(), VENDOR_ROLE, Tier.Bronze))
        .to.emit(reg, "MembershipGateChanged")
        .withArgs(await membership.getAddress(), VENDOR_ROLE, Tier.Bronze);

      await reg.connect(vendor2).submitApp("A", "d", Category.AssetServicing, CID_A, HASH_A);
      expect(await reg.appCount()).to.equal(1);
    });

    it("lets admin disable each gate by zeroing it", async function () {
      const { reg, oracle, admin, vendor2 } = await gatedFixture();
      await oracle.setSanctioned(vendor2.address, true);

      await reg.connect(admin).setMembershipGate(ethers.ZeroAddress, ethers.ZeroHash, Tier.None);
      // Still screened — the two gates are independent.
      await expect(
        reg.connect(vendor2).submitApp("A", "d", Category.AssetServicing, CID_A, HASH_A)
      ).to.be.revertedWithCustomError(reg, "SanctionedAccount");

      await expect(reg.connect(admin).setSanctionsGuard(ethers.ZeroAddress))
        .to.emit(reg, "SanctionsGuardChanged")
        .withArgs(ethers.ZeroAddress);
      await reg.connect(vendor2).submitApp("A", "d", Category.AssetServicing, CID_A, HASH_A);
      expect(await reg.appCount()).to.equal(1);
    });

    it("rejects a gate configuration that would brick submissions", async function () {
      const { reg, membership, admin } = await gatedFixture();
      await expect(
        reg.connect(admin).setMembershipGate(await membership.getAddress(), ethers.ZeroHash, Tier.Silver)
      ).to.be.revertedWithCustomError(reg, "InvalidGateConfig");
      await expect(
        reg.connect(admin).setMembershipGate(await membership.getAddress(), VENDOR_ROLE, 5) // above Platinum
      ).to.be.revertedWithCustomError(reg, "InvalidGateConfig");
    });

    it("restricts gate configuration to admin", async function () {
      const { reg, curator, vendor } = await fixture();
      for (const caller of [curator, vendor]) {
        await expect(
          reg.connect(caller).setMembershipGate(ethers.ZeroAddress, ethers.ZeroHash, Tier.None)
        ).to.be.revertedWithCustomError(reg, "AccessControlUnauthorizedAccount");
        await expect(reg.connect(caller).setSanctionsGuard(ethers.ZeroAddress)).to.be.revertedWithCustomError(
          reg,
          "AccessControlUnauthorizedAccount"
        );
      }
    });
  });
});
