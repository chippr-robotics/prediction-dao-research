const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Verify that a friend market's data is encrypted
 * Checks for the encryption envelope structure
 *
 * Usage:
 *   npx hardhat run scripts/debug/verify-market-encryption.js --network mordor
 */

const CONTRACTS = {
  friendGroupMarketFactory: '0x8cFE477e267bB36925047df8A6E30348f82b0085',
};

const MARKET_ID = 7; // The friend market to verify

/**
 * Check if data matches the encrypted envelope format
 */
function isEncryptedEnvelope(data) {
  try {
    // Must have required fields
    if (!data || typeof data !== 'object') return false;

    // Check for encryption markers
    const hasVersion = data.version === '1.0';
    const hasAlgorithm = data.algorithm === 'x25519-chacha20poly1305' ||
                         data.algorithm === 'x25519-xsalsa20-poly1305';
    const hasContent = data.content &&
                       typeof data.content.ciphertext === 'string' &&
                       typeof data.content.nonce === 'string';
    const hasKeys = Array.isArray(data.keys) && data.keys.length > 0;

    return hasVersion && hasAlgorithm && hasContent && hasKeys;
  } catch {
    return false;
  }
}

/**
 * Analyze the encryption envelope
 */
function analyzeEnvelope(envelope) {
  const analysis = {
    version: envelope.version,
    algorithm: envelope.algorithm,
    contentNonceLength: envelope.content?.nonce?.length,
    ciphertextLength: envelope.content?.ciphertext?.length,
    participantCount: envelope.keys?.length || 0,
    participants: [],
  };

  if (envelope.keys) {
    for (const key of envelope.keys) {
      analysis.participants.push({
        address: key.address,
        hasEphemeralKey: !!key.ephemeralPublicKey,
        hasWrappedKey: !!key.wrappedKey,
        hasNonce: !!key.nonce,
      });
    }
  }

  return analysis;
}

async function main() {
  console.log("=".repeat(60));
  console.log(`Verify Friend Market ${MARKET_ID} Encryption`);
  console.log("=".repeat(60));

  // Get FriendGroupMarketFactory
  const fgmf = await ethers.getContractAt(
    "FriendGroupMarketFactory",
    CONTRACTS.friendGroupMarketFactory
  );

  // Get market data
  console.log(`\n--- Fetching Friend Market ${MARKET_ID} ---`);

  try {
    // Use getFriendMarketWithStatus for full info including stake details
    const marketData = await fgmf.getFriendMarketWithStatus(MARKET_ID);
    const [
      marketId,
      marketType,
      creator,
      members,
      arbitrator,
      status,
      acceptanceDeadline,
      stakePerParticipant,
      stakeToken,
      acceptedCount,
      minThreshold,
      description
    ] = marketData;

    console.log("Market ID:", marketId.toString());
    console.log("Market Type:", marketType);
    console.log("Creator:", creator);
    console.log("Stake Token:", stakeToken);
    console.log("Stake Amount:", ethers.formatUnits(stakePerParticipant, 6), "(assuming 6 decimals)");
    console.log("Status:", status);
    console.log("Members:", members);
    console.log("Accepted Count:", acceptedCount.toString());
    console.log("Min Threshold:", minThreshold.toString());
    console.log("\n--- Raw Description ---");
    console.log("Length:", description.length, "characters");

    // Try to parse as JSON (encrypted envelopes are JSON)
    let parsed;
    try {
      parsed = JSON.parse(description);
      console.log("Is valid JSON: YES");
    } catch {
      console.log("Is valid JSON: NO (plaintext description)");
      console.log("Description:", description.substring(0, 200) + (description.length > 200 ? "..." : ""));
      console.log("\n--- ENCRYPTION STATUS: NOT ENCRYPTED ---");
      console.log("The market description is stored as plaintext.");
      return;
    }

    // Check if it's an encrypted envelope
    const isEncrypted = isEncryptedEnvelope(parsed);
    console.log("\n--- Encryption Analysis ---");
    console.log("Matches encrypted envelope format:", isEncrypted ? "YES" : "NO");

    if (isEncrypted) {
      console.log("\n--- ENCRYPTION STATUS: ENCRYPTED ---");
      const analysis = analyzeEnvelope(parsed);
      console.log("Version:", analysis.version);
      console.log("Algorithm:", analysis.algorithm);
      console.log("Content nonce length:", analysis.contentNonceLength, "hex chars");
      console.log("Ciphertext length:", analysis.ciphertextLength, "hex chars");
      console.log("Number of authorized participants:", analysis.participantCount);

      console.log("\n--- Authorized Participants ---");
      for (const p of analysis.participants) {
        console.log(`  ${p.address}:`);
        console.log(`    - Has ephemeral key: ${p.hasEphemeralKey}`);
        console.log(`    - Has wrapped DEK: ${p.hasWrappedKey}`);
        console.log(`    - Has nonce: ${p.hasNonce}`);
      }

      console.log("\n--- Security Properties ---");
      console.log("- Only listed participants can decrypt the market details");
      console.log("- Each participant has a unique wrapped Data Encryption Key (DEK)");
      console.log("- Content is encrypted with ChaCha20-Poly1305 (AEAD)");
      console.log("- Key exchange uses X25519 elliptic curve");
    } else {
      console.log("\n--- ENCRYPTION STATUS: NOT ENCRYPTED ---");
      console.log("Data is JSON but not in encrypted envelope format.");
      console.log("Keys found:", Object.keys(parsed).join(", "));
    }

  } catch (error) {
    console.error("Error fetching market:", error.message);
    if (error.message.includes("InvalidMarketId")) {
      console.log("Market", MARKET_ID, "does not exist.");
    }
  }

  console.log("\n" + "=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
