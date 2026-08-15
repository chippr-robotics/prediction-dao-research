/**
 * Tests for the fetch-based Pinata client that replaced `@pinata/sdk`.
 *
 * The SDK was removed because 2.1.0 is its newest published version and it depends on
 * `axios ^0.21.1`, a line with no patched release. These tests pin the behaviour that
 * replaced it: credential precedence, request shape against the documented endpoints, and
 * that a failure is reported rather than swallowed.
 *
 * `fetch` is stubbed — no network access, and no Pinata credentials are needed to run.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const pinata = require("../pinataClient");

/** Swap in a fake fetch, run `fn`, always restore. Returns the recorded calls. */
async function withFetch(handler, fn) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = original;
  }
  return calls;
}

/** Restore the credential env vars around each test that touches them. */
function withEnv(vars, fn) {
  const keys = ["PINATA_JWT", "PINATA_API_KEY", "PINATA_SECRET_KEY"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const jsonOk = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

test("readPinataCredentials prefers the JWT over the API key pair", () => {
  const creds = withEnv(
    { PINATA_JWT: "jwt-token", PINATA_API_KEY: "key", PINATA_SECRET_KEY: "secret" },
    () => pinata.readPinataCredentials(),
  );
  assert.equal(creds.kind, "PINATA_JWT");
  assert.deepEqual(creds.headers, { Authorization: "Bearer jwt-token" });
});

test("readPinataCredentials falls back to the API key pair", () => {
  const creds = withEnv({ PINATA_API_KEY: "key", PINATA_SECRET_KEY: "secret" }, () =>
    pinata.readPinataCredentials(),
  );
  assert.equal(creds.kind, "PINATA_API_KEY + PINATA_SECRET_KEY");
  assert.deepEqual(creds.headers, { pinata_api_key: "key", pinata_secret_api_key: "secret" });
});

test("readPinataCredentials treats whitespace-only values as unconfigured", () => {
  assert.equal(withEnv({ PINATA_JWT: "   " }, () => pinata.readPinataCredentials()), null);
  // A key with no secret is not usable either.
  assert.equal(withEnv({ PINATA_API_KEY: "key" }, () => pinata.readPinataCredentials()), null);
  assert.equal(withEnv({}, () => pinata.readPinataCredentials()), null);
});

test("pinJson posts the SDK's pinataContent envelope and returns the bare CID", async () => {
  const credentials = { kind: "PINATA_JWT", headers: { Authorization: "Bearer t" } };
  await withFetch(
    () => jsonOk({ IpfsHash: "bafyjson" }),
    async (calls) => {
      const cid = await pinata.pinJson(credentials, { hello: "world" }, { name: "market-x", cidVersion: 1 });
      assert.equal(cid, "bafyjson");

      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, "https://api.pinata.cloud/pinning/pinJSONToIPFS");
      assert.equal(calls[0].init.method, "POST");
      assert.equal(calls[0].init.headers.Authorization, "Bearer t");

      const body = JSON.parse(calls[0].init.body);
      assert.deepEqual(body.pinataContent, { hello: "world" });
      assert.equal(body.pinataMetadata.name, "market-x");
      // CIDv1 keeps the string short and matches every other pin in the repo.
      assert.equal(body.pinataOptions.cidVersion, 1);
    },
  );
});

test("pinJson defaults to CIDv1 when no option is passed", async () => {
  const credentials = { kind: "PINATA_JWT", headers: {} };
  await withFetch(
    () => jsonOk({ IpfsHash: "bafydefault" }),
    async (calls) => {
      await pinata.pinJson(credentials, {});
      assert.equal(JSON.parse(calls[0].init.body).pinataOptions.cidVersion, 1);
    },
  );
});

test("pinFile uploads multipart to the file endpoint and returns the bare CID", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pinata-test-"));
  const file = path.join(dir, "sports.png");
  fs.writeFileSync(file, Buffer.from([1, 2, 3, 4]));

  const credentials = { kind: "PINATA_JWT", headers: { Authorization: "Bearer t" } };
  try {
    await withFetch(
      () => jsonOk({ IpfsHash: "bafyfile" }),
      async (calls) => {
        const cid = await pinata.pinFile(credentials, file, { name: "market-category-sports" });
        assert.equal(cid, "bafyfile");

        assert.equal(calls[0].url, "https://api.pinata.cloud/pinning/pinFileToIPFS");
        assert.equal(calls[0].init.method, "POST");

        const form = calls[0].init.body;
        assert.ok(form instanceof FormData);
        assert.equal(form.get("file").size, 4);
        assert.equal(JSON.parse(form.get("pinataMetadata")).name, "market-category-sports");
        assert.equal(JSON.parse(form.get("pinataOptions")).cidVersion, 1);
      },
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a pin that returns no IpfsHash is an error, not a silent success", async () => {
  const credentials = { kind: "PINATA_JWT", headers: {} };
  await withFetch(
    () => jsonOk({ ok: true }),
    async () => {
      await assert.rejects(() => pinata.pinJson(credentials, {}), /returned no IpfsHash/);
    },
  );
});

test("an HTTP failure surfaces Pinata's own reason string", async () => {
  const credentials = { kind: "PINATA_JWT", headers: {} };
  await withFetch(
    () =>
      new Response(JSON.stringify({ error: { reason: "INVALID_CREDENTIALS" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    async () => {
      await assert.rejects(() => pinata.pinJson(credentials, {}), /401 INVALID_CREDENTIALS/);
    },
  );
});

test("a non-JSON error body still produces a usable message", async () => {
  const credentials = { kind: "PINATA_JWT", headers: {} };
  await withFetch(
    () => new Response("<html>gateway timeout</html>", { status: 504 }),
    async () => {
      await assert.rejects(() => pinata.pinJson(credentials, {}), /504 <html>gateway timeout/);
    },
  );
});

test("testAuthentication reports the endpoint verdict as a boolean", async () => {
  const credentials = { kind: "PINATA_JWT", headers: { Authorization: "Bearer t" } };

  await withFetch(
    () => jsonOk({ message: "Congratulations!" }),
    async (calls) => {
      assert.equal(await pinata.testAuthentication(credentials), true);
      assert.equal(calls[0].url, "https://api.pinata.cloud/data/testAuthentication");
      assert.equal(calls[0].init.method, "GET");
    },
  );

  await withFetch(
    () => new Response("nope", { status: 401 }),
    async () => {
      assert.equal(await pinata.testAuthentication(credentials), false);
    },
  );
});

test("a network failure is reported with the operation that failed", async () => {
  const credentials = { kind: "PINATA_JWT", headers: {} };
  await withFetch(
    () => {
      throw new Error("ECONNREFUSED");
    },
    async () => {
      await assert.rejects(() => pinata.pinJson(credentials, {}), /Pinata JSON upload failed: ECONNREFUSED/);
    },
  );
});
