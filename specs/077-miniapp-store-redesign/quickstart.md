# Quickstart: validating the Mini-App Store redesign (spec 077)

## Prerequisites

- Workspace installed via `npm run deps:reinstall` (this feature changes dependencies —
  never recover with incremental `npm install`).

## 1. Byte-gate resolution (toolchain bump)

```bash
npm run check:deps                       # FR-015 alignment + optional-binary guard green

STAMP=$(($(date +%s) * 1000))
npm run build:miniapps                   # both packages build under vite 8
node scripts/miniapps/record-build-digests.js \
  --compare specs/075-monorepo-workspaces/baseline-miniapp-builds.json --since "$STAMP"
# Expected AFTER the re-record lands: OK (bytes match the new baseline).
# In review, the change itself must show baseline digests moved + both versions bumped.

node scripts/release/check-miniapp-versions.js --base origin/main --head HEAD
# Expected: "mini-app version/bytes pairing OK"
```

## 2. Redesigned store surface

```bash
npx vitest run src/test/miniapps --root frontend   # scoped suites (full suite in CI only)
npm run frontend                                    # dev server
```

Manual walkthrough (Apps tab, small viewport for the store bar ergonomics):

1. **Market**: verified banner + badge visible; apps grouped under styled category headers;
   each card shows artwork (Token Mint and ClearPath specific; anything else generic),
   contained Vendor/Version box, rocket Launch CTA.
2. **My Apps**: shows only favorited apps; unfavorite everything ⇒ honest empty state.
3. **Search**: search box focused, filters usable, live result count announced.
4. **Honest states** (simulate registry failure / empty registry): stale snapshot shows the
   unverified warning WITHOUT the badge and with no Launch affordances; not-deployed and
   verified-empty keep distinct copy.
5. **Themes**: light + dark render correctly; no hardcoded tenant identity.
6. **Accessibility**: keyboard-only pass over store bar/filters/cards; axe checks green.

## 3. Docs

- `docs/runbooks/miniapp-registry-operations.md` gains the "re-publish + re-approve after a
  toolchain byte move" procedure; it states the chain serves the previously approved bytes
  until curators complete it.
- `docs/developer-guide/miniapps.md` notes the host-side artwork map and store sub-views.
