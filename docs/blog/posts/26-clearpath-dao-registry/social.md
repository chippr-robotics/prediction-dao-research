# Social & Image — ClearPath: A Registry That Owns Nothing

## X (Twitter)

Most "DAO aggregators" make you delegate your votes to a contract they control. ClearPath's
registry owns nothing: a quick check confirms an address really is a DAO, then records that it
exists — no key, no role, no authority. Every vote stays signed by you. 🔗 <link>

#DAO #web3 #interoperability

## LinkedIn

The moment a DAO registry can act *on behalf of* the DAOs it references, it becomes a
liability — a new key to steal, a new trust assumption, a new thing an auditor has to
reason about. For a non-custodial platform, that's the wrong default.

ClearPath takes the opposite position: a registry that owns nothing. The new post walks the
design:

- The on-chain registry — a few facts per entry, an append-only layout checked before every
  upgrade, and a two-tier probe that proves an address is really a DAO before recording it.
- Why it borrows only the *shape* of a governance contract, never a full implementation — the
  trick that lets one registry serve DAOs on a lightweight older network and on Ethereum from
  the same code.
- The core principle: registration is metadata, not power. No sanctions screen, no quota, no
  authority. Every governance action stays signed by the member, sent to the DAO's own contract.
- How multi-network support was added as a frontend-only change — registry-optional tracking,
  parallel aggregation across networks, and pluggable per-framework connectors — with zero new
  contract deployments.

How do you draw the line between a useful DAO registry and an over-privileged one?

🔗 <link>

#DAO #Governance #web3 #Ethereum #Interoperability

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
