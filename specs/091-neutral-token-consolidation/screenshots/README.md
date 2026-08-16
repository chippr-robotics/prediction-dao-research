# Actor-critic screen validation — neutral token consolidation (spec 091)

**FR-009 / SC-004.** Real screenshots of the running app, critiqued, fixed, re-captured.

- **Actor**: `scripts/ui/capture-brand.mjs` (extended for this spec)
- **Matrix**: 17 surfaces × {desktop 1280×900, mobile 390×844} × {light, dark} = **68 shots per round**
- **Rounds**: 3. Round 3 produced no findings.

## What this spec added to the harness

Three surfaces spec 090 never photographed, all of them heavily swept here:

| Surface | Why it was missing |
|---|---|
| `landing-public` | `/` forwards a returning visitor to the wallet, so the connected `landing` shot photographed the wallet page. **LandingPage.css was the single most-swept stylesheet in this spec (55 literals) and had never appeared in a screenshot at all.** |
| `components` | `/ui-components` — the widest single view of buttons, inputs, badges and cards |
| `state-demo` | `/state-demo` — the error / success / info notice blocks |

Getting `landing-public` to actually show the landing page took two corrections, both worth
recording because both produced a *plausible* wrong screenshot:

1. **Skipping the connect click is not the same as having no wallet.** wagmi auto-reconnects to an
   injected provider whose `eth_accounts` already answers, so the first attempt filed the connected
   wallet page under the name `landing-public`. The harness now omits the provider entirely for
   these shots.
2. **`/` still forwards on wallet history.** `?stay=1` pins `LandingRoute` to the marketing page.

## Rounds

### Round 1 — 1 finding

**F1 · Green survivors in the component gallery, from a mis-mapped role.**

The primary button rendered as a teal→green gradient and the section headings in mid-green. The
cause was a mapping mistake, not a missed literal: `Button.module.css` had
`linear-gradient(#2D7A4F → #34A853)` — two greens from the *retired brand* palette — and the sweep
read the second stop as `--success-color`. That turned a primary control into a brand→success
blend, which says something untrue about what the button does.

Four more gradients had been split the same way (`ShareWagerModal`, `MyMarketsModal` ×2,
`FriendMarketsModal`).

*Fix*: all six became `var(--gradient-brand)`, and the gallery headings became `--brand-primary`.
This is the risk inherent in role-mapping and the reason FR-009 exists: the table looked right, and
only the pixels showed it wasn't.

### Round 2 — 1 finding

**F2 · The connect modal's "RECOMMENDED" and "QR CODE" badges were green.**

Pre-existing (`--success-color`, unchanged from staging), but newly *wrong-looking*: in a teal app
where green now means "this succeeded", a green badge on a wallet you have not connected yet reads
as a state rather than a suggestion.

*Fix*: brand emphasis, which is what a recommendation actually is.

### Round 3 — clean

No findings. The 68 shots here are from this round.

## Deliberately not photographed

- **Portfolio's populated token list** — needs a price feed and an indexer, both blocked by the
  harness's network isolation. Carried over from spec 090; the data-dense-row coverage comes from
  Network, Earn, Settings and Recovery.
- **The Apps catalog** — the mini-app registry is a real contract the stub does not implement, so
  the shot shows its degraded state. Left in deliberately: it is a good photograph of an honest
  failure.
- **The landing marquee** appears duplicated and clipped in `landing-public`. That is a looping
  ticker caught mid-animation, not a layout defect.

## What the loop was worth here

Both findings were **role-mapping mistakes invisible to every automated check**. The literal
scanner saw a token, the contrast audit saw a valid pairing, the undefined-token guard saw a
defined name. Nothing was wrong except the meaning, and meaning is what a screenshot shows.
