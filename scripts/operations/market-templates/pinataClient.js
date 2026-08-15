/**
 * Minimal Pinata pinning client — the same seam `scripts/miniapps/publish.js` uses.
 *
 * WHY THIS EXISTS RATHER THAN `@pinata/sdk`
 * The SDK is unmaintained: 2.1.0 is the newest published version and it depends on
 * `axios ^0.21.1`, a line that has no patched release. That drags a permanent set of high
 * advisories (CSRF, SSRF via absolute URL, prototype-pollution credential theft) into the
 * lockfile for three calls — `pinJSONToIPFS`, `pinFileToIPFS` and `testAuthentication` —
 * each of which is one `fetch` against a documented REST endpoint.
 *
 * `scripts/miniapps/publish.js` already talks to these endpoints directly and documents
 * why it does not use the SDK's `pinFromFS`. This module is that same approach, factored
 * so the market-template scripts share it. Credential names and precedence (PINATA_JWT
 * first, then PINATA_API_KEY + PINATA_SECRET_KEY) are unchanged, so no operator runbook
 * or CI secret has to move.
 *
 * Node's global fetch/FormData/Blob are used directly — the root manifest requires
 * Node >= 22, where all three are stable.
 */

const fs = require("fs");
const path = require("path");

const PINATA_BASE_URL = "https://api.pinata.cloud";
const PINATA_PIN_FILE_URL = `${PINATA_BASE_URL}/pinning/pinFileToIPFS`;
const PINATA_PIN_JSON_URL = `${PINATA_BASE_URL}/pinning/pinJSONToIPFS`;
const PINATA_AUTH_URL = `${PINATA_BASE_URL}/data/testAuthentication`;

/** Mirrors `IPFS_CONFIG.UPLOAD_TIMEOUT` / `TIMEOUT` in `frontend/src/constants/ipfs.js`. */
const PIN_TIMEOUT_MS = 120_000;
const AUTH_TIMEOUT_MS = 15_000;

/**
 * Read pinning credentials from the environment.
 *
 * Same order of preference the rest of the repo uses: a JWT if present, otherwise the
 * legacy API key pair.
 *
 * @returns {{kind: string, headers: Record<string, string>}|null} null when unconfigured
 */
function readPinataCredentials() {
  const jwt = (process.env.PINATA_JWT || "").trim();
  if (jwt !== "") return { kind: "PINATA_JWT", headers: { Authorization: `Bearer ${jwt}` } };

  const apiKey = (process.env.PINATA_API_KEY || "").trim();
  const secretKey = (process.env.PINATA_SECRET_KEY || "").trim();
  if (apiKey !== "" && secretKey !== "") {
    return {
      kind: "PINATA_API_KEY + PINATA_SECRET_KEY",
      headers: { pinata_api_key: apiKey, pinata_secret_api_key: secretKey },
    };
  }

  return null;
}

async function requestWithTimeout(url, init, timeoutMs, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`${label} timed out after ${timeoutMs / 1000}s`);
    }
    throw new Error(`${label} failed: ${error?.message || error}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pinata's error shape, unwrapped the way `frontend/src/utils/ipfsService.js` unwraps it.
 *
 * Only a string is usable: Pinata sometimes nests `error` as an object, and interpolating
 * that would print "[object Object]" instead of the reason.
 */
async function describeHttpFailure(response) {
  const text = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(text);
    const candidates = [parsed?.error?.reason, parsed?.error?.message, parsed?.error, parsed?.message];
    const message = candidates.find((value) => typeof value === "string" && value.trim() !== "");
    if (message) return `${response.status} ${message}`;
  } catch {
    // not JSON — fall through to the raw snippet
  }
  return `${response.status}${text ? ` ${text.slice(0, 200)}` : ""}`;
}

/** Read `IpfsHash` off a pin response, failing loudly when it is absent. */
async function readIpfsHash(response, label) {
  if (!response.ok) throw new Error(`${label}: ${await describeHttpFailure(response)}`);
  const result = await response.json().catch(() => null);
  const cid = result?.IpfsHash;
  if (!cid) throw new Error(`${label}: Pinata accepted the upload but returned no IpfsHash`);
  return cid;
}

/**
 * Pin a JSON document. Replaces the SDK's `pinJSONToIPFS`.
 *
 * @param {object} credentials from readPinataCredentials()
 * @param {object} content JSON-serialisable document
 * @param {{name?: string, cidVersion?: number}} [options]
 * @returns {Promise<string>} the bare CID
 */
async function pinJson(credentials, content, options = {}) {
  const body = {
    pinataContent: content,
    pinataMetadata: { name: options.name || "pin" },
    pinataOptions: { cidVersion: options.cidVersion ?? 1 },
  };

  const response = await requestWithTimeout(
    PINATA_PIN_JSON_URL,
    {
      method: "POST",
      headers: { ...credentials.headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    PIN_TIMEOUT_MS,
    "Pinata JSON upload",
  );

  return readIpfsHash(response, "Pinata JSON upload");
}

/**
 * Pin a single file from disk. Replaces the SDK's `pinFileToIPFS`.
 *
 * The SDK took a readable stream; this reads the file into a Blob instead. These are
 * category images and market metadata — kilobytes — so buffering is not a concern, and it
 * avoids the SDK's `normalizePath` rewriting, which is the behaviour `publish.js` documents
 * as the reason it hand-rolls its multipart upload.
 *
 * @param {object} credentials from readPinataCredentials()
 * @param {string} filePath absolute or cwd-relative path to the file
 * @param {{name?: string, cidVersion?: number}} [options]
 * @returns {Promise<string>} the bare CID
 */
async function pinFile(credentials, filePath, options = {}) {
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
  form.append("pinataMetadata", JSON.stringify({ name: options.name || path.basename(filePath) }));
  form.append("pinataOptions", JSON.stringify({ cidVersion: options.cidVersion ?? 1 }));

  const response = await requestWithTimeout(
    PINATA_PIN_FILE_URL,
    { method: "POST", headers: credentials.headers, body: form },
    PIN_TIMEOUT_MS,
    "Pinata file upload",
  );

  return readIpfsHash(response, "Pinata file upload");
}

/**
 * Confirm the credentials work. Replaces the SDK's `testAuthentication`.
 *
 * @returns {Promise<boolean>} true when Pinata accepts them
 */
async function testAuthentication(credentials) {
  const response = await requestWithTimeout(
    PINATA_AUTH_URL,
    { method: "GET", headers: credentials.headers },
    AUTH_TIMEOUT_MS,
    "Pinata authentication",
  );
  return response.ok;
}

module.exports = {
  PINATA_BASE_URL,
  readPinataCredentials,
  describeHttpFailure,
  pinJson,
  pinFile,
  testAuthentication,
};
