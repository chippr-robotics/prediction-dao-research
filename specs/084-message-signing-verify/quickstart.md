# Quickstart: validating Protect ▸ Verify

How to prove this feature works, in the order that gets to a real answer fastest.

## 1. The decisions, without a browser

Everything that decides anything lives in `frontend/src/lib/verify/` and is testable without React.

```bash
cd frontend
npx vitest run src/test/verify/
```

Expect all suites green. The three files map to the three decisions: `signedMessage.test.js` (the
record round-trips and refuses what it should), `signMessage.test.js` (identity → signs or refuses),
`verifyMessage.test.js` (the three outcomes).

The assertions worth reading are the ones about the third outcome. Every network-failure path
asserts `unverifiable` and never `invalid` — that is the invariant the whole feature rests on.

## 2. The surface

```bash
cd frontend
npx vitest run src/test/verify/VerifySection.test.jsx
```

Covers the entry rows, both sheets, draft survival across close/reopen, the withdrawn-signing
states, and two axe audits (WCAG 2.1 AA, FR-025).

> The **full** frontend suite OOMs this environment with default settings. Scope local runs as
> above. For a whole-suite run before merging, see the `monorepo-verify` skill:
> `TZ=UTC NODE_OPTIONS=--max-old-space-size=8192 npx vitest run --reporter=dot --pool=forks --maxWorkers=2`

## 3. End-to-end by hand

1. `npm run dev --workspace frontend`
2. Connect an account, then go to **Tools ▸ Protect**. The **Verify** area is the middle section:
   two rows, both closed.
3. Open **Sign a message**, paste any text, sign, and copy the record.
4. Close the sheet. The row now reads "Signed — reopen to copy the document" (FR-021/FR-022);
   reopening shows the record again.
5. Open **Check a signature**, paste the record into the signature box. Every field fills itself in
   and the surface says what it read (FR-016). Check it — expect **Signature is valid**.
6. Now change one character of the message and check again — expect **Signature does not match**.

### Proving the third outcome by hand

This is the one worth doing deliberately, because it is the behaviour that is easy to regress.

1. In **My Account ▸ Network**, point the current chain's RPC at something unreachable (e.g.
   `http://127.0.0.1:1`).
2. In the check form, enter a valid message and signature but a **different** address, and select
   that network.
3. Expect **Could not be checked** — amber, with "this is not a failed check — nothing here says the
   signature is bad", and the recovered address offered as evidence.

If that renders as **Signature does not match**, the feature's central invariant has regressed
(FR-010/FR-011), whatever the tests say.

## 4. The visual record

```bash
npm run dev --workspace frontend -- --port 5199        # terminal 1
mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && \
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright  # once
NODE_PATH=/tmp/pw/node_modules node scripts/ui/capture-verify.mjs http://127.0.0.1:5199
```

Writes 24 PNGs to `screenshots/` — 6 states × desktop/mobile × light/dark. Both the wallet and the
chain are loopback stubs and every other request is aborted, so a run cannot depend on the internet.
The wallet stub signs with a real key, so records in the screenshots genuinely verify.

Findings from each review round are recorded in `screenshots/README.md`. When re-running, check that
each shot shows the state its *filename* claims — the loop's one fixture bug produced a plausible
screenshot of the wrong state, and only that check catches it.

## Fixtures

All of the above share one fixture module, `frontend/src/test/fixtures/signedMessages.js`, whose
signatures are computed at import from a published test key. If you need a signature for a new test,
import it from there — a pasted hex drifts from its message the moment either is edited, and a
verification test whose fixture has drifted is green while proving nothing.
