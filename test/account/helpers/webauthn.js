/**
 * WebAuthn P-256 signing simulator for Hardhat tests (spec 041).
 *
 * Produces assertions in exactly the shape the vendored
 * `contracts/account/lib/webauthn-sol/WebAuthn.sol` verifies:
 *   messageHash = sha256(authenticatorData || sha256(clientDataJSON))
 *   clientDataJSON carries `"challenge":"<base64url(abi.encode(bytes32 hash))>"`
 *   low-s normalized (verify() rejects s > n/2)
 *
 * Hardhat's EVM has no RIP-7212 precompile at 0x…0100, so these assertions
 * exercise the FreshCryptoLib Solidity fallback path — the precompile path is
 * covered by the Amoy live checklist (quickstart.md §2).
 */

const crypto = require('node:crypto');
const { AbiCoder } = require('ethers');

const abi = AbiCoder.defaultAbiCoder();

// secp256r1 group order (for low-s normalization).
const P256_N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');

const WEBAUTHN_AUTH_TUPLE =
  'tuple(bytes authenticatorData, string clientDataJSON, uint256 challengeIndex, uint256 typeIndex, uint256 r, uint256 s)';
const SIGNATURE_WRAPPER_TUPLE = 'tuple(uint256 ownerIndex, bytes signatureData)';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function createPasskey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const x = '0x' + Buffer.from(jwk.x, 'base64url').toString('hex').padStart(64, '0');
  const y = '0x' + Buffer.from(jwk.y, 'base64url').toString('hex').padStart(64, '0');
  return {
    privateKey,
    x,
    y,
    /** 64-byte ABI owner encoding used by MultiOwnable (abi.encode(x, y)). */
    ownerBytes: abi.encode(['bytes32', 'bytes32'], [x, y]),
  };
}

/**
 * Sign a bytes32 challenge (for CoinbaseSmartWallet: the replay-safe hash for
 * ERC-1271, or the userOpHash for validateUserOp) and return the WebAuthnAuth
 * struct fields.
 */
function signWebAuthn(passkey, challengeBytes32, opts = {}) {
  const challenge = Buffer.from(challengeBytes32.slice(2), 'hex'); // abi.encode(bytes32) == the 32 bytes
  const rpIdHash = crypto.createHash('sha256').update(opts.rpId || 'fairwins.test').digest();
  const flags = Buffer.from([opts.flags ?? 0x05]); // UP | UV
  const counter = Buffer.from([0, 0, 0, 1]);
  const authenticatorData = Buffer.concat([rpIdHash, flags, counter]);

  const clientDataJSON =
    `{"type":"webauthn.get","challenge":"${b64url(challenge)}","origin":"${opts.origin || 'https://fairwins.test'}","crossOrigin":false}`;
  const typeIndex = clientDataJSON.indexOf('"type"');
  const challengeIndex = clientDataJSON.indexOf('"challenge"');

  const clientDataHash = crypto.createHash('sha256').update(clientDataJSON).digest();
  const payload = Buffer.concat([authenticatorData, clientDataHash]);
  const raw = crypto.sign('sha256', payload, { key: passkey.privateKey, dsaEncoding: 'ieee-p1363' });

  const r = BigInt('0x' + raw.subarray(0, 32).toString('hex'));
  let s = BigInt('0x' + raw.subarray(32, 64).toString('hex'));
  if (!opts.keepHighS && s > P256_N / 2n) s = P256_N - s;

  return {
    authenticatorData: '0x' + authenticatorData.toString('hex'),
    clientDataJSON,
    challengeIndex,
    typeIndex,
    r,
    s,
  };
}

/** ABI-encode a WebAuthnAuth struct. */
function encodeWebAuthnAuth(auth) {
  return abi.encode([WEBAUTHN_AUTH_TUPLE], [auth]);
}

/** Full CoinbaseSmartWallet signature: abi.encode(SignatureWrapper). */
function wrapSignature(ownerIndex, signatureData) {
  return abi.encode([SIGNATURE_WRAPPER_TUPLE], [{ ownerIndex, signatureData }]);
}

/** Convenience: WebAuthn-sign a challenge and produce the wallet signature blob. */
function signAsPasskeyOwner(passkey, ownerIndex, challengeBytes32, opts = {}) {
  return wrapSignature(ownerIndex, encodeWebAuthnAuth(signWebAuthn(passkey, challengeBytes32, opts)));
}

module.exports = {
  P256_N,
  createPasskey,
  signWebAuthn,
  encodeWebAuthnAuth,
  wrapSignature,
  signAsPasskeyOwner,
};
