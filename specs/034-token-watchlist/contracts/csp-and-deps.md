# Contract: CSP Changes & Dependency Posture

**Type**: Edge config (nginx CSP) + dependency decision. Both nginx files must stay in sync or
CI fails loudly (see the QR-camera divergence history, PR #640 / commit `bb6fae7a`).

---

## CSP edits — apply to BOTH files

Files: `frontend/nginx.conf` (img-src `:41`, connect-src `:35`) and
`frontend/nginx.conf.template` (img-src `:95`, connect-src `:93`).

**`connect-src`** — add (to fetch the token lists):
```text
https://tokens.uniswap.org
https://raw.githubusercontent.com
```

**`img-src`** — add (to render registry logos):
```text
https://raw.githubusercontent.com
```
`ipfs.io` is already present, so Uniswap `ipfs://` logoURIs (rewritten client-side to
`https://ipfs.io/ipfs/<cid>`) need no new host. No `Permissions-Policy` change (unrelated to
images).

**Regression tests** (Constitution IV — fail loud):
- New `frontend/src/test/nginxCspImgSrc.test.js` — iterate both configs; assert `img-src`
  contains `https://raw.githubusercontent.com` (mirror `nginxCspConnectSrc.test.js`).
- Extend `frontend/src/test/nginxCspConnectSrc.test.js` — assert `connect-src` contains the two
  new hosts in both configs.

**Invariant**: the only image hosts a watchlist `<img>` may use are
`raw.githubusercontent.com` and `ipfs.io`. `tokenLogo.js#resolveLogoSrc` enforces this at the
app layer; CSP enforces it at the browser layer (defense-in-depth, FR-024).

---

## Dependency posture

**Decision: add NO new runtime dependency.** Token-list parsing uses a hand-rolled allowlist
sanitizer (`tokenList.js#sanitizeTokenList`) over the ~6 fields we consume. Balance/metadata
reads reuse the existing `ethers` v6 + `frontend/src/abis/ERC20.js` + optional
`frontend/src/abis/Multicall3.js`.

**Rejected**: `ajv` + `ajv-formats` + `@uniswap/token-lists` (schema/types). Rationale in
[../research.md](../research.md) §2 — disproportionate bundle/TS-types weight to validate a
field subset we already constrain and filter. Recorded as the fallback if the hand-rolled
sanitizer proves insufficient. Because no new core technology is introduced, the Constitution's
"new tech requires justification" clause is satisfied by this explicit no-op.
