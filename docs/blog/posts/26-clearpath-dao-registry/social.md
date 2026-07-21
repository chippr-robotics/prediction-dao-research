# Social & Image — ClearPath: A Registry That Owns Nothing

## X (Twitter)

Most "DAO aggregators" make you delegate to a contract they control. ClearPath's
ExternalDAORegistry owns nothing: an ERC-165 `IGovernor` probe records that a DAO exists —
no key, no role, no authority. Every vote stays member-signed. 🔗 <link>

#DAO #web3 #interoperability

## LinkedIn

The moment a DAO registry can act *on behalf of* the DAOs it references, it becomes a
liability — a new key to steal, a new trust assumption, a new thing an auditor has to
reason about. For a non-custodial platform, that's the wrong default.

ClearPath (FairWins specs 030 + 042) takes the opposite position: a registry that owns
nothing. The new post walks the design:

- The on-chain `ExternalDAORegistry` — five fields per entry, ids starting at 1, an
  append-only storage layout gated in CI, and an ERC-165 + defensive-view probe that
  proves an address is really a Governor before recording it.
- Why it imports OpenZeppelin's `IGovernor` interface only (never the implementation) — the
  trick that lets one registry serve DAOs on pre-Cancun Ethereum Classic and Ethereum
  mainnet from the same bytecode.
- Invariant INV-4: registration is metadata, not power. No sanctions screen, no quota, no
  authority. Every governance action stays member-signed against the DAO's own contract.
- How multi-network support was layered on as a frontend-only change — registry-optional
  tracking, per-chain aggregation via `Promise.allSettled`, and pluggable per-framework
  connectors (OZ Governor + GovernorBravo) — with zero new contract deploys.

How do you draw the line between a useful DAO registry and an over-privileged one?

🔗 <link>

#DAO #SmartContracts #web3 #Ethereum #Interoperability

## Image prompt (Gemini / Nano Banana)

A clean, modern editorial illustration in an isometric style depicting a central,
transparent glass card-catalog or index cabinet floating in space, its drawers open to
reveal glowing address labels — but the cabinet is visibly hollow, holding no keys, coins,
or locks, only reference cards. Around it, several distinct governance "buildings" on
separate floating platforms (each platform a different network) connect to the cabinet with
thin, one-directional light beams that point *from* the buildings *to* the index — signaling
the registry reads and references but never controls. Each building has a subtle geometric
signature marking a different DAO framework. Composition centered and balanced, generous
negative space, subtle depth-of-field. Color mood: deep navy and teal base with a single
warm amber accent on the active reference beams and drawer labels. Soft, directional studio
lighting with gentle rim light on the glass edges. No text, no logos, no watermarks. Aspect
ratio 16:9.
