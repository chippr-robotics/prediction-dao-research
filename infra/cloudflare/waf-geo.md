# Cloudflare WAF — geographic access gate (Spec 007: FR-001–FR-014)

**Zone**: `fairwins.app` (must be **proxied / orange-cloud** — DNS-only records cannot be
filtered). Security → WAF → Custom rules.

## Rule: geo gate (allowlist posture — default)

- **Field**: `ip.src.country` (ISO 3166-1 alpha-2). Cloudflare resolves this from the true
  client IP (only the edge sees it). `XX` = unknown, `T1` = Tor.
- **Expression (allowlist, recommended)**:

  ```
  not (ip.src.country in {"<ALLOWED_COUNTRIES…>"})
  ```

  → **Action: Block**. (Denylist alternative: `(ip.src.country in {"CU" "IR" "KP" "SY" …})` → Block.)

- The **deny set always includes**, regardless of posture (FR-003/FR-004):
  - OFAC-comprehensive: `CU` (Cuba), `IR` (Iran), `KP` (North Korea), `SY` (Syria) — plus
    occupied-region handling (below).
  - `US` (United States) under the current posture (revisit only if a regulated route is adopted).
- The **tunable bucket** (FR-005, gambling/prediction-market bans, e.g. `FR` `BE` `SG`) is
  edited in this same rule's country set — no code change/deploy needed.
- Country blocking via **custom rules works on all Cloudflare plans**.

## Block response → HTTP 451 (FR-006)

- Custom response: **status 451**, body type Custom HTML, body = contents of
  `frontend/public/451.html` (≤2 KB). Custom response bodies require **Pro plan or above**;
  on Free, country blocking still works but only with the default block page.
- Cloud Armor cannot emit 451 (deny actions are 403/404/502), which is another reason the
  451 lives at Cloudflare.

## Occupied regions — conservative matching (FR-013)

Crimea / Donetsk / Luhansk IP ranges are frequently mislabeled as `RU`/`UA`. Treat
ambiguous ranges that may cover these regions as **denied**. Where Cloudflare exposes
region/subdivision (`ip.src.region_code`), add a subdivision rule; otherwise document the
residual risk and prefer the allowlist posture (which denies anything not explicitly allowed).

## Fail-closed (FR-012)

- Allowlist posture inherently denies `XX` (unknown) — it isn't in the allowed set.
- If the WAF rule cannot evaluate (edge issue), the request should not be served ungated;
  validate this during the staging step.

## Staging procedure (FR-011) & verification checklist (SC-001/003/013)

1. Create the rule with action **Log** (observe) first; confirm in Security → Events that the
   intended countries *would* be blocked, with no false positives on allowed countries.
2. Switch the action to **Block** (451).
3. Verify (T012 checklist):
   - [ ] Request from an allowed country → served (200).
   - [ ] Request from `CU`/`IR`/`KP`/`SY` → 451.
   - [ ] Request from `US` → 451.
   - [ ] Request from a tunable-bucket country → 451.
   - [ ] 451 response shows the human-readable legal-reason page (not a generic error).
   - [ ] Unknown/`XX` source → denied.

## Periodic OFAC reconciliation (FR-014)

Quarterly (or on OFAC action), reconcile the locked comprehensively-sanctioned set in this
rule against the authoritative OFAC sanctions program list; record any additions in this
file's change history. (Covers analysis finding C2 — see spec Open Legal-Reconciliation Items.)
