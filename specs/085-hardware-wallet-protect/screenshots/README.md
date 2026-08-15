# Protect ▸ hardware wallets — screenshot record (spec 085)

Captured by `scripts/ui/capture-protect-hardware.mjs` (see its header for how to run it): the
real surface, in a real Chromium, against the dev server — the device is the DEV-only adapter
seam, balances are real reads against a loopback stub chain, and every non-loopback request is
aborted. 8 scenarios × {desktop 1280×900, mobile 390×844} × {light, dark} = 32 shots.

| shot | what it shows |
|---|---|
| `accordion` | The whole Protect page as an exclusive accordion — On chain open, Verify and Off chain as one-line headings |
| `offchain-empty` | Off chain open with nothing saved: the add action and the empty line |
| `offchain-list` | Two saved accounts — vendor badges, labels, address + path, Forget controls |
| `sheet-vendor` | Wizard step 1: vendor choice, each option carrying its transport hint |
| `sheet-connect` | Wizard step 2: the physical checklist before the browser prompt |
| `sheet-error` | A posed connect failure: the typed human sentence, retry stays available |
| `sheet-pick` | Wizard step 3: derived accounts with real balances, scheme toggle, paging, label |
| `sheet-saved` | Wizard step 4: what was saved and where it is now available |

## Actor-critic findings (what the loop changed)

**Round 1 → fix.** In light mode, every action button on the accordion card surface — "Create
vault", "Load existing", "Add hardware wallet", "Forget", "Show more accounts" — rendered as
bare text: the global button chrome is `--bg-secondary` with a transparent border, which was
visible on the old gray `.custody-subsection` background but disappears on the accordion card's
own surface. Dark mode masked the bug entirely (dark buttons on dark cards still contrast),
which is why single-theme review would have shipped it. Fix: explicit `--border-color` chrome on
`.custody-actions button` (Custody.css) and the hardware list/sheet controls (HardwareWallet.css).

**Round 2.** Clean across both themes and both viewports: sheet content fits a single mobile
screen at every step, the error state reads as a sentence with a live retry, balances render
right-aligned with tabular numerals, and the collapsed accordion keeps the whole tab under one
screen on mobile.

**Not photographed, deliberately:** the reconnect-to-act dialog under a real device ceremony and
the Trezor popup — both need physical hardware and are exactly what
`docs/runbooks/hardware-wallet-staging-validation.md` validates in staging.
