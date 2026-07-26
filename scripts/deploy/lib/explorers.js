/**
 * explorers.js — Which block explorer covers which chain, in ONE place.
 *
 * Two facts have to agree for `scripts/deploy/verify.js` to work, and they used to be
 * written down separately (hardhat.config.js knew the Blockscout network names; verify.js
 * knew nothing at all). When they drift, verification fails in the least useful way
 * possible: hardhat-verify silently picks Etherscan V2 for a Blockscout chain and reports
 * "chain not supported", or picks V1 for an Etherscan chain and 404s a dead V1 endpoint.
 * So both readers import this table:
 *
 *   - hardhat.config.js       -> which `etherscan` config shape to build for --network
 *   - scripts/deploy/verify.js -> the pre-flight (is this chain verifiable at all? is the
 *                                 API key present?) and the explorer links it prints
 *
 * DELIBERATELY DEPENDENCY-FREE. hardhat.config.js requires this file while it is still
 * building its own config object, so anything that reaches back into `hardhat` (as
 * lib/constants.js does, for `ethers`) would be a require cycle. Keep it plain data +
 * pure functions.
 *
 * Two explorer families, and the difference is not cosmetic:
 *   * ETHERSCAN V2 — one unified endpoint (api.etherscan.io/v2/api?chainid=<id>) and ONE
 *     key for every chain in the family. There is no per-chain key to mint any more; the
 *     old per-explorer V1 keys and endpoints (polygonscan.com, basescan.org, arbiscan.io)
 *     were shut off 2025-08-15. Mint the key at etherscan.io.
 *   * BLOCKSCOUT — self-hosted per chain, no key. hardhat-verify still requires a
 *     non-empty placeholder string to resolve the chain, which is why the config below
 *     carries `apiKeyEnv: null` rather than an empty key.
 */

/**
 * chainId -> explorer facts. `network` is the hardhat network name that deploys to that
 * chain (the deployments/ filename is derived from it), and it is what a caller passes to
 * `--network`, so keep the two in sync with hardhat.config.js `networks`.
 *
 * `proxyLinking` records how the explorer connects an ERC-1967 proxy to the verified
 * implementation behind it. verify.js prints this per proxy so the operator knows whether
 * a follow-up click is expected — see the PROXIES section of its summary.
 */
const EXPLORERS = {
  1: {
    network: "mainnet",
    chainName: "Ethereum",
    label: "Etherscan",
    family: "etherscan",
    browserUrl: "https://etherscan.io",
    proxyLinking: "on-demand", // "Is this a proxy?" under Contract -> More Options
  },
  10: {
    network: "optimism",
    chainName: "Optimism",
    label: "Optimistic Etherscan",
    family: "etherscan",
    browserUrl: "https://optimistic.etherscan.io",
    proxyLinking: "on-demand",
  },
  61: {
    network: "etc",
    chainName: "Ethereum Classic",
    label: "Blockscout (ETC)",
    family: "blockscout",
    browserUrl: "https://etc.blockscout.com",
    apiUrl: "https://etc.blockscout.com/api",
    proxyLinking: "automatic", // Blockscout reads the EIP-1967 slot itself
  },
  63: {
    network: "mordor",
    chainName: "Mordor (ETC testnet)",
    label: "Blockscout (Mordor)",
    family: "blockscout",
    browserUrl: "https://etc-mordor.blockscout.com",
    apiUrl: "https://etc-mordor.blockscout.com/api",
    proxyLinking: "automatic",
  },
  137: {
    network: "polygon",
    chainName: "Polygon",
    label: "PolygonScan",
    family: "etherscan",
    browserUrl: "https://polygonscan.com",
    proxyLinking: "on-demand",
  },
  8453: {
    network: "base",
    chainName: "Base",
    label: "BaseScan",
    family: "etherscan",
    browserUrl: "https://basescan.org",
    proxyLinking: "on-demand",
  },
  42161: {
    network: "arbitrum",
    chainName: "Arbitrum One",
    label: "Arbiscan",
    family: "etherscan",
    browserUrl: "https://arbiscan.io",
    proxyLinking: "on-demand",
  },
  80002: {
    network: "amoy",
    chainName: "Polygon Amoy",
    label: "PolygonScan (Amoy)",
    family: "etherscan",
    browserUrl: "https://amoy.polygonscan.com",
    proxyLinking: "on-demand",
  },
};

/** The single Etherscan-V2 key covers every `family: "etherscan"` chain above. */
const ETHERSCAN_API_KEY_ENV = "ETHERSCAN_API_KEY";

/**
 * Values people paste into .env when they mean "I have not set this yet". Treated as
 * ABSENT rather than passed to the explorer, so the failure names the real problem
 * instead of surfacing as an opaque "Invalid API Key" six retries later.
 */
const PLACEHOLDER_KEYS = new Set([
  "your_api_key",
  "your_api_key_here",
  "your_etherscan_api_key",
  "changeme",
  "todo",
  "xxx",
  "empty",
]);

/** @returns {object|undefined} the explorer entry for `chainId`, or undefined if we have none. */
function explorerForChain(chainId) {
  return EXPLORERS[Number(chainId)];
}

/** Hardhat network names whose explorer is Blockscout. Consumed by hardhat.config.js. */
function blockscoutNetworkNames() {
  return Object.values(EXPLORERS)
    .filter((e) => e.family === "blockscout")
    .map((e) => e.network);
}

/**
 * The legacy-V1 `etherscan` config hardhat-verify needs for the Blockscout chains:
 * a per-network apiKey OBJECT (which is what forces V1 mode) plus customChains pointing
 * at each Blockscout /api. Blockscout ignores the key value but hardhat-verify refuses to
 * resolve a chain whose key is empty, hence the placeholder.
 */
function blockscoutVerifyConfig() {
  const entries = Object.entries(EXPLORERS).filter(([, e]) => e.family === "blockscout");
  return {
    apiKey: Object.fromEntries(entries.map(([, e]) => [e.network, "empty"])),
    customChains: entries.map(([chainId, e]) => ({
      network: e.network,
      chainId: Number(chainId),
      urls: { apiURL: e.apiUrl, browserURL: e.browserUrl },
    })),
  };
}

/** Explorer URL for an address, e.g. for a "check it here" line in a summary. */
function addressUrl(explorer, address) {
  return `${explorer.browserUrl}/address/${address}`;
}

/**
 * Pre-flight: can we verify on this chain AT ALL, with the environment as it stands?
 *
 * Called BEFORE anything is submitted. The point is that a run which cannot possibly
 * verify anything must say so in one readable sentence up front, rather than making the
 * operator infer it from a summary of zeros (or worse, from a green exit code) at the end.
 *
 * @param {number} chainId
 * @param {string} networkName  the --network the caller actually used
 * @returns {object} the explorer entry
 * @throws {Error} with an actionable message if the chain or the key is unusable
 */
function assertExplorerConfigured(chainId, networkName) {
  const explorer = explorerForChain(chainId);

  if (!explorer) {
    const known = Object.entries(EXPLORERS)
      .map(([id, e]) => `${e.network} (${id})`)
      .join(", ");
    throw new Error(
      `No block explorer is configured for chainId ${chainId} (network '${networkName}'), so ` +
        `source verification is not possible here.\n` +
        `Local dev chains (hardhat/localhost, 1337) have no explorer and never need this script.\n` +
        `Chains with an explorer: ${known}.\n` +
        `If ${networkName} is a real new network, add it to EXPLORERS in scripts/deploy/lib/explorers.js ` +
        `(and to hardhat.config.js networks) before deploying to it.`
    );
  }

  if (explorer.network !== networkName) {
    throw new Error(
      `Network name mismatch: --network ${networkName} reports chainId ${chainId}, but ` +
        `scripts/deploy/lib/explorers.js maps that chain to the '${explorer.network}' network. ` +
        `One of the two is wrong — check the chainId pinned in hardhat.config.js for '${networkName}'. ` +
        `Refusing to guess which explorer you meant.`
    );
  }

  if (explorer.family === "etherscan") {
    const raw = process.env[ETHERSCAN_API_KEY_ENV];
    const key = typeof raw === "string" ? raw.trim() : "";
    if (!key || PLACEHOLDER_KEYS.has(key.toLowerCase())) {
      throw new Error(
        `${ETHERSCAN_API_KEY_ENV} is ${key ? `a placeholder ("${key}")` : "not set"}, so nothing can be ` +
          `verified on ${explorer.label} (${explorer.chainName}, chainId ${chainId}).\n` +
          `Mint ONE key at https://etherscan.io/myapikey — the Etherscan V2 API covers Ethereum, ` +
          `Optimism, Polygon, Base, Arbitrum and Amoy with that single key. Do NOT mint per-explorer ` +
          `keys at polygonscan.com / basescan.org / arbiscan.io: those V1 keys and endpoints were ` +
          `retired 2025-08-15.\n` +
          `Then put it in .env as ${ETHERSCAN_API_KEY_ENV}=<key> and re-run.`
      );
    }
  }

  return explorer;
}

/**
 * Does this explorer error mean "your API key is missing/invalid/not authorised for this
 * chain" rather than "this particular contract did not verify"?
 *
 * It matters because the two need opposite handling. A bad key fails EVERY contract
 * identically, so retrying it six times each across a dozen contracts just buries the one
 * line that explains the problem under a wall of identical failures. verify.js treats a
 * key rejection as fatal and stops immediately.
 *
 * Etherscan answers a bad key with `{status:"0", message:"NOTOK", result:"Invalid API Key"}`;
 * hardhat-verify surfaces that string. "Missing/Invalid API Key" and the V2-specific
 * "not authorized"/"invalid chainid" variants are the other shapes seen in the wild.
 */
function isApiKeyProblem(message) {
  const m = String(message || "").toLowerCase();
  return (
    m.includes("invalid api key") ||
    m.includes("missing/invalid api key") ||
    m.includes("missing or invalid api key") ||
    m.includes("api key is invalid") ||
    m.includes("invalid apikey") ||
    m.includes("apikey is not valid") ||
    (m.includes("api key") && m.includes("not authorized"))
  );
}

/** One-liner an operator can act on after a key rejection. */
function apiKeyHelp(explorer) {
  return (
    `${ETHERSCAN_API_KEY_ENV} was REJECTED by ${explorer.label}. The key exists but the explorer ` +
    `will not accept it for chainId — check it is a current Etherscan V2 key from ` +
    `https://etherscan.io/myapikey (a legacy per-explorer V1 key looks valid but is rejected on the ` +
    `V2 endpoint), that it is not rate-limited, and that .env has no stray quotes or whitespace.`
  );
}

module.exports = {
  EXPLORERS,
  ETHERSCAN_API_KEY_ENV,
  explorerForChain,
  blockscoutNetworkNames,
  blockscoutVerifyConfig,
  addressUrl,
  assertExplorerConfigured,
  isApiKeyProblem,
  apiKeyHelp,
};
