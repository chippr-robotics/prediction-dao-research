#!/usr/bin/env node
/**
 * Derive the Ethereum gas-wallet address for a GCP KMS secp256k1 signing key (spec 036 engine).
 *
 * The oz-relayer engine signs with a Cloud KMS key (`services/oz-relayer/config/config.json` →
 * signers[].config.key). KMS never exposes the private key, so the funded address is derived from
 * the key's PUBLIC key. This script takes that public key (PEM, as emitted by
 * `gcloud kms keys versions get-public-key`) and prints the checksummed 0x address to fund.
 *
 * Usage:
 *   gcloud kms keys versions get-public-key 1 \
 *     --key=gas-key-mordor --keyring=fairwins-relayer --location=us-central1 \
 *     --project=chippr-bots-site-wp --output-file=/tmp/gas-key-mordor.pem
 *   node scripts/operations/relayer/kms-gas-address.js /tmp/gas-key-mordor.pem
 *
 * Or pipe the PEM on stdin:
 *   gcloud kms keys versions get-public-key 1 --key=... | node scripts/operations/relayer/kms-gas-address.js
 *
 * secp256k1 SubjectPublicKeyInfo (SPKI) ends with the uncompressed EC point `04 || X(32) || Y(32)`
 * (the BIT STRING payload after its `00` unused-bits octet), i.e. the last 65 DER bytes. The
 * Ethereum address is keccak256(X||Y)[-20:], which ethers computes from that 65-byte point.
 */
const fs = require("fs");
const { ethers } = require("ethers");

function readInput() {
  const argPath = process.argv[2];
  if (argPath && argPath !== "-") return fs.readFileSync(argPath, "utf8");
  return fs.readFileSync(0, "utf8"); // stdin
}

function pemToUncompressedPoint(pem) {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  if (!b64) throw new Error("No PEM body found — expected a `-----BEGIN PUBLIC KEY-----` block.");
  const der = Buffer.from(b64, "base64");
  const point = der.subarray(der.length - 65); // 04 || X(32) || Y(32)
  if (point.length !== 65 || point[0] !== 0x04) {
    throw new Error(
      `Not a secp256k1 uncompressed SPKI public key (got ${point.length} trailing bytes, ` +
        `leading 0x${point[0]?.toString(16)}). Confirm the key algorithm is EC_SIGN_SECP256K1_SHA256.`
    );
  }
  return "0x" + point.toString("hex");
}

function main() {
  const pem = readInput();
  const point = pemToUncompressedPoint(pem);
  const address = ethers.computeAddress(point);
  // Address on stdout (scriptable); context on stderr.
  process.stderr.write(`uncompressed pubkey: ${point}\n`);
  process.stdout.write(address + "\n");
}

main();
