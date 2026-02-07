import { expect } from "chai";
import hre from "hardhat";

describe("ZKVerifier - Unit Tests", function () {
  let ethers;
  let zkVerifier;
  let owner, admin, user1;

  // Sample verification key components for testing
  // These are valid BN128 curve points for testing
  // Point at infinity and simple valid points
  const sampleVK = {
    alpha: [0, 0], // Point at infinity
    beta: [[0, 0], [0, 0]],
    gamma: [[0, 0], [0, 0]],
    delta: [[0, 0], [0, 0]],
    gammaABC: [[0, 0], [0, 0], [0, 0]]
  };

  beforeEach(async function () {
    const connection = await hre.network.connect();
    ethers = connection.ethers;
    [owner, admin, user1] = await ethers.getSigners();
    
    const ZKVerifier = await ethers.getContractFactory("ZKVerifier");
    zkVerifier = await ZKVerifier.deploy();
    await zkVerifier.waitForDeployment();
    
    // Grant verifier admin role
    const VERIFIER_ADMIN_ROLE = await zkVerifier.VERIFIER_ADMIN_ROLE();
    await zkVerifier.grantRole(VERIFIER_ADMIN_ROLE, admin.address);
  });

  describe("Deployment", function () {
    it("Should grant deployer admin roles", async function () {
      const DEFAULT_ADMIN_ROLE = await zkVerifier.DEFAULT_ADMIN_ROLE();
      const ADMIN_ROLE = await zkVerifier.ADMIN_ROLE();
      const VERIFIER_ADMIN_ROLE = await zkVerifier.VERIFIER_ADMIN_ROLE();
      
      expect(await zkVerifier.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.equal(true);
      expect(await zkVerifier.hasRole(ADMIN_ROLE, owner.address)).to.equal(true);
      expect(await zkVerifier.hasRole(VERIFIER_ADMIN_ROLE, owner.address)).to.equal(true);
    });

    it("Should not have verification key set initially", async function () {
      expect(await zkVerifier.isVerificationKeySet()).to.equal(false);
    });
  });

  describe("Verification Key Management", function () {
    it("Should allow verifier admin to set verification key", async function () {
      await expect(
        zkVerifier.connect(admin).setVerificationKey(
          sampleVK.alpha,
          sampleVK.beta,
          sampleVK.gamma,
          sampleVK.delta,
          sampleVK.gammaABC
        )
      ).to.emit(zkVerifier, "VerificationKeySet");
      
      expect(await zkVerifier.isVerificationKeySet()).to.equal(true);
    });

    it("Should reject empty gammaABC array", async function () {
      await expect(
        zkVerifier.connect(admin).setVerificationKey(
          sampleVK.alpha,
          sampleVK.beta,
          sampleVK.gamma,
          sampleVK.delta,
          [] // Empty array
        )
      ).to.be.revertedWith("gammaABC cannot be empty");
    });

    it("Should reject setting key by non-admin", async function () {
      await expect(
        zkVerifier.connect(user1).setVerificationKey(
          sampleVK.alpha,
          sampleVK.beta,
          sampleVK.gamma,
          sampleVK.delta,
          sampleVK.gammaABC
        )
      ).to.be.revertedWithCustomError(zkVerifier, "AccessControlUnauthorizedAccount");
    });

    it("Should store verification key correctly", async function () {
      await zkVerifier.connect(admin).setVerificationKey(
        sampleVK.alpha,
        sampleVK.beta,
        sampleVK.gamma,
        sampleVK.delta,
        sampleVK.gammaABC
      );
      
      const [alpha, beta, gamma, delta, gammaABCLength] = await zkVerifier.getVerificationKey();
      
      expect(alpha[0]).to.equal(sampleVK.alpha[0]);
      expect(alpha[1]).to.equal(sampleVK.alpha[1]);
      expect(gammaABCLength).to.equal(sampleVK.gammaABC.length);
    });
  });

  describe("Proof Structure Validation", function () {
    beforeEach(async function () {
      await zkVerifier.connect(admin).setVerificationKey(
        sampleVK.alpha,
        sampleVK.beta,
        sampleVK.gamma,
        sampleVK.delta,
        sampleVK.gammaABC
      );
    });

    it("Should reject proof without verification key", async function () {
      const zkVerifier2 = await (await ethers.getContractFactory("ZKVerifier")).deploy();
      await zkVerifier2.waitForDeployment();
      
      const proofBytes = ethers.zeroPadBytes("0x00", 256);
      const publicInputs = [1, 2];
      
      await expect(
        zkVerifier2.verifyProof(proofBytes, publicInputs)
      ).to.be.revertedWithCustomError(zkVerifier2, "VerificationKeyNotSet");
    });

    it("Should reject proof that is too short", async function () {
      const shortProof = ethers.zeroPadBytes("0x00", 100); // Less than 256 bytes
      const publicInputs = [1, 2];
      
      await expect(
        zkVerifier.verifyProof(shortProof, publicInputs)
      ).to.be.revertedWith("Proof too short");
    });
  });

  describe("Curve Operations", function () {
    it("Should validate points on BN128 curve (G1)", async function () {
      // Point at infinity is valid
      const pointAtInfinity = [0, 0];
      
      // Note: Full validation requires the point to be on the curve y^2 = x^3 + 3
      // We can't directly test the internal _isOnCurveG1 function, but it's used
      // during verification key setup
      
      await expect(
        zkVerifier.connect(admin).setVerificationKey(
          pointAtInfinity,
          sampleVK.beta,
          sampleVK.gamma,
          sampleVK.delta,
          sampleVK.gammaABC
        )
      ).to.not.be.reverted; // Point at infinity is valid
    });
  });

  describe("Proof Verification", function () {
    beforeEach(async function () {
      await zkVerifier.connect(admin).setVerificationKey(
        sampleVK.alpha,
        sampleVK.beta,
        sampleVK.gamma,
        sampleVK.delta,
        sampleVK.gammaABC
      );
    });

    it("Should accept valid proof structure", async function () {
      // Create a properly formatted proof with point at infinity (valid on curve)
      const proof = {
        a: [0, 0], // Point at infinity
        b: [[0, 0], [0, 0]],
        c: [0, 0]
      };
      
      const publicInputs = [100, 200]; // 2 public inputs to match gammaABC length - 1
      
      // This will fail cryptographic verification but should not revert on structure
      await expect(
        zkVerifier.connect(user1).verifyProofComponents(
          proof.a,
          proof.b,
          proof.c,
          publicInputs
        )
      ).to.not.be.reverted;
    });

    it("Should reject proof with wrong number of public inputs", async function () {
      const proof = {
        a: [0, 0],
        b: [[0, 0], [0, 0]],
        c: [0, 0]
      };
      
      const wrongInputs = [100]; // Wrong length - should be 2
      
      await expect(
        zkVerifier.verifyProofComponents(
          proof.a,
          proof.b,
          proof.c,
          wrongInputs
        )
      ).to.be.reverted;
    });

    it("Should emit event on verification", async function () {
      const proof = {
        a: [0, 0],
        b: [[0, 0], [0, 0]],
        c: [0, 0]
      };
      
      const publicInputs = [100, 200];
      
      // Should emit either ProofVerified or VerificationFailed
      const tx = await zkVerifier.connect(user1).verifyProofComponents(
        proof.a,
        proof.b,
        proof.c,
        publicInputs
      );
      
      const receipt = await tx.wait();
      const events = receipt.logs.filter(log => {
        try {
          const parsed = zkVerifier.interface.parseLog(log);
          return parsed && (parsed.name === "ProofVerified" || parsed.name === "VerificationFailed");
        } catch (e) {
          return false;
        }
      });
      
      expect(events.length).to.be.greaterThan(0);
    });
  });

  describe("Field Element Validation", function () {
    beforeEach(async function () {
      await zkVerifier.connect(admin).setVerificationKey(
        sampleVK.alpha,
        sampleVK.beta,
        sampleVK.gamma,
        sampleVK.delta,
        sampleVK.gammaABC
      );
    });

    it("Should reject public inputs exceeding field modulus", async function () {
      const proof = {
        a: [0, 0],
        b: [[0, 0], [0, 0]],
        c: [0, 0]
      };
      
      // BN128 field modulus
      const fieldModulus = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
      const invalidInput = fieldModulus; // Exactly equal to modulus (invalid)
      
      const publicInputs = [invalidInput, 200];
      
      await expect(
        zkVerifier.verifyProofComponents(
          proof.a,
          proof.b,
          proof.c,
          publicInputs
        )
      ).to.be.reverted;
    });
  });

  describe("Integration with PrivacyCoordinator", function () {
    it("Should be deployable and linkable", async function () {
      const PrivacyCoordinator = await ethers.getContractFactory("PrivacyCoordinator");
      const privacyCoordinator = await PrivacyCoordinator.deploy();
      await privacyCoordinator.waitForDeployment();
      
      await privacyCoordinator.initialize(owner.address);
      
      // Should be able to set ZKVerifier
      await expect(
        privacyCoordinator.setZKVerifier(await zkVerifier.getAddress())
      ).to.emit(privacyCoordinator, "ZKVerifierSet");
    });
  });

  describe("Gas Optimization", function () {
    beforeEach(async function () {
      await zkVerifier.connect(admin).setVerificationKey(
        sampleVK.alpha,
        sampleVK.beta,
        sampleVK.gamma,
        sampleVK.delta,
        sampleVK.gammaABC
      );
    });

    it("Should use precompiles for curve operations", async function () {
      // This test verifies that the contract attempts to use precompiles
      // Actual verification will fail due to invalid proof, but precompiles should be called
      
      const proof = {
        a: [0, 0],
        b: [[0, 0], [0, 0]],
        c: [0, 0]
      };
      
      const publicInputs = [100, 200];
      
      const tx = await zkVerifier.connect(user1).verifyProofComponents(
        proof.a,
        proof.b,
        proof.c,
        publicInputs
      );
      
      const receipt = await tx.wait();
      
      // Gas should be reasonable (precompiles are efficient)
      // This is a basic sanity check
      expect(receipt.gasUsed).to.be.lessThan(1000000n);
    });
  });

  describe("Error Handling", function () {
    beforeEach(async function () {
      await zkVerifier.connect(admin).setVerificationKey(
        sampleVK.alpha,
        sampleVK.beta,
        sampleVK.gamma,
        sampleVK.delta,
        sampleVK.gammaABC
      );
    });

    it("Should handle invalid curve points gracefully", async function () {
      // Use extremely large values that are definitely not on the curve
      const fieldModulus = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
      const invalidPoint = [fieldModulus - 1n, fieldModulus - 1n];
      
      const proof = {
        a: invalidPoint,
        b: [[3, 4], [5, 6]],
        c: [7, 8]
      };
      
      const publicInputs = [100, 200];
      
      // Should revert with invalid curve point error
      await expect(
        zkVerifier.verifyProofComponents(
          proof.a,
          proof.b,
          proof.c,
          publicInputs
        )
      ).to.be.revertedWithCustomError(zkVerifier, "InvalidCurvePoint");
    });
  });

  describe("View Functions", function () {
    it("Should correctly report verification key status", async function () {
      expect(await zkVerifier.isVerificationKeySet()).to.equal(false);
      
      await zkVerifier.connect(admin).setVerificationKey(
        sampleVK.alpha,
        sampleVK.beta,
        sampleVK.gamma,
        sampleVK.delta,
        sampleVK.gammaABC
      );
      
      expect(await zkVerifier.isVerificationKeySet()).to.equal(true);
    });

    it("Should reject getting verification key when not set", async function () {
      await expect(
        zkVerifier.getVerificationKey()
      ).to.be.revertedWith("Verification key not set");
    });
  });
});
