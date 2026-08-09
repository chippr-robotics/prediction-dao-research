# Mini-app package fixtures (spec 073 T014, spec 075 T033)

**Real mini-app packages, built by the real build tool, committed as bytes.**

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
| `source-ethers/` | the **second fixture's** sources — the same shape, plus an `ethers` import |
| `package-ethers/` | its committed build output: `manifest.json`, `entry.js` (no stylesheet — that app ships none) |
| `onchain-ethers.json` | its approved tuple |
| `index.js` | the test seam — reads the bytes, serves them through a `fetchImpl` in the loader's own URL shape |
| `regenerate.mjs` | rebuilds everything above |

`source*/dist/` is intermediate build output and is already ignored by `frontend/.gitignore`
(bare `dist`), so only the curated copies in `package/` and `package-ethers/` are ever committed.

## Regenerating

```bash
node frontend/src/test/miniapps/fixtures/regenerate.mjs
```

The script builds `source/` and `source-ethers/` with the preset, runs the preset's own
`verifyPackageDigests()` before copying anything, then writes `package/`, `onchain.json`,
`tampered/`, `package-ethers/` and `onchain-ethers.json`. It records no timestamps, paths
or hostnames and overrides no preset defaults, so **re-running it on an unchanged tree
must leave `git diff` empty**.

A diff after regeneration is a signal, not a chore: it means the build tool changed what
it emits — **or that a shared dependency now resolves to something else**. Read the diff,
confirm the tests still pass against the new bytes, and commit both together.

Note that the tests read `package/` and `package-ethers/`, never `source*/` — editing the
sources without regenerating changes nothing.

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

`ethers` is intentionally not imported *by that app*, so its committed bytes stay small
enough to read.

## Why there is a second fixture (spec 075, T033)

Leaving `ethers` out was right for spec 073 and wrong for spec 075, because the hazard
spec 075 exists to bound runs through `ethers` specifically:

```
npm hoisting -> module resolution -> hostScopePlugin#discoverExports ->
shim text -> entry.js -> its sha256 in manifest.json ->
keccak256(manifest bytes) -> the on-chain MiniAppRegistry commitment
```

`hostScopePlugin.js` enumerates a shared module's bindings by importing the very file Vite
resolved, so the emitted shim is a literal transcript of what the installer put on disk.
ethers contributes **192 names** to that transcript — by far the largest — and **both real
packages carry it**. A fixture set without it could not notice a resolution change that
rewrote thousands of bytes in every published package, which is exactly what adopting
workspaces, changing hoisting, or bumping a dependency can do with no error raised
anywhere.

So `source-ethers/` imports `ethers` and its committed `entry.js` carries the whole list.
Its shared-dependency set (`@fairwins/miniapp-sdk`, `ethers`, `react`, `react/jsx-runtime`)
is deliberately **identical to Token Mint's and ClearPath's**, so the fixture and the real
packages exercise the same shim surface. It ships no stylesheet, which is not an omission
either: `styles: []` is a package shape the host must handle and the first fixture cannot
produce.

It has no tampered twin. The refusal paths are already proven once, and proving them twice
would only double the committed bytes.
