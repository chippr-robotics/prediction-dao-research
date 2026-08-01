# Mini-app package fixture (spec 073, task T014)

A **real mini-app package, built by the real build tool, committed as bytes.**

Every other test in `src/test/miniapps/` synthesizes its package inline: hand-written
entry text, a hand-built manifest object, a hash taken over whatever the test itself
serialized. Those tests prove the loader is self-consistent. None of them can notice the
day `tools/miniapp-build/` starts emitting something the host would refuse — a renamed
manifest field, a different digest encoding, a second chunk, a stylesheet under another
name. A package that builds cleanly and refuses to launch on every member's machine is
the exact failure this fixture exists to catch, and it can only be caught by running the
real loader over real build output.

`packageFixture.test.jsx` is that test. This directory is what it runs against.

## What is here

| Path | What it is |
|---|---|
| `source/` | the fixture package's **sources** — `vite.config.js` (calls `createMiniAppConfig()` with preset defaults), `src/entry.jsx`, `src/fixture.css` |
| `package/` | the **committed build output**: `manifest.json`, `entry.js`, `style.css` — verbatim `vite build` output, i.e. exactly what `scripts/miniapps/publish.js` would pin |
| `onchain.json` | the **approved tuple a vendor would submit**: `cid` + `keccak256(manifest.json bytes)`, computed on the build side |
| `tampered/` | a **self-consistent impostor package**: `entry.js` with one extra statement, and a `manifest.json` that honestly describes it |
| `index.js` | the test seam — reads the bytes, serves them through a `fetchImpl` in the loader's own URL shape |
| `regenerate.mjs` | rebuilds everything above |

`source/dist/` is intermediate build output and is already ignored by `frontend/.gitignore`
(bare `dist`), so only the curated copy in `package/` is ever committed.

## Regenerating

```bash
node frontend/src/test/miniapps/fixtures/regenerate.mjs
```

The script builds `source/` with the preset, runs the preset's own
`verifyPackageDigests()` before copying anything, then writes `package/`, `onchain.json`
and `tampered/`. It records no timestamps, paths or hostnames and overrides no preset
defaults, so **re-running it on an unchanged tree must leave `git diff` empty**.

A diff after regeneration is a signal, not a chore: it means the build tool changed what
it emits. Read the diff, confirm the tests still pass against the new bytes, and commit
both together.

Note that the tests read `package/`, never `source/` — editing the sources without
regenerating changes nothing.

## Why the tampered package is built this way

`tampered/` is **self-consistent**: its manifest's digests are correct for its own bytes.
The only thing that refuses it is `keccak256(manifest) != the approved hash` on-chain.

That is the supply-chain case worth committing — a gateway serving a *competently
rebuilt* package, which is what an attacker who controls a gateway would actually serve.
A fixture of random bit-rot would never exercise it.

The extra statement in `tampered/entry.js` sets `globalThis.__miniappFixtureTampered`.
That is deliberate: the test asserts the marker is still unset after the refusal, which
is a direct measurement of "not one line of this package executed" rather than an
indirect trust that the loader did not import. One test imports the tampered bytes on
purpose, outside the loader, to prove the marker mechanism is not vacuous.

## Why the fixture app looks the way it does

It is the smallest package that still exercises the whole runtime contract: it
default-exports a mountable component, imports `react` and (through JSX)
`react/jsx-runtime` so the build emits host-scope shims rather than bundling React
(research R2), reads its host object through `@fairwins/miniapp-sdk`, holds hook state —
which only works if the shim resolved to the **host's** React — and ships its own
stylesheet so the package emits the `style.css` the host injects scoped.

`ethers` is intentionally not imported: it would add a ~190-binding shim to committed
bytes for no additional coverage.
