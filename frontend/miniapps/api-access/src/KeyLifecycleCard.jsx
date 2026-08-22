import { useMiniAppHost } from '@fairwins/miniapp-sdk'

/** Where key minting and revocation actually live, in the host app. */
export const KEYS_DEEP_LINK = '/wallet?tab=settings#api-access'

/**
 * Create or revoke keys — an explainer and a door, not a form (spec 095).
 *
 * A mini-app is untrusted third-party code, and the host object it is handed carries no signer:
 * there is no `signMessage`, no `signTypedData`, and the only write rail is a transaction. A
 * FairWins API key is a member-signed EIP-712 grant, so minting one is a signature — which means
 * this package structurally cannot do it, and could not be given the ability without granting the
 * same ability to every other package in the catalog.
 *
 * That is a feature, and it is worth saying to the member rather than presenting a disabled button
 * and letting them assume something is broken.
 */
export default function KeyLifecycleCard() {
  const host = useMiniAppHost()

  return (
    <section className="aa-card">
      <h2 className="aa-card-title">Create or revoke keys</h2>

      <p>
        Keys are created and revoked in the FairWins app itself, under <strong>Settings → API
        access</strong>.
      </p>
      <p className="aa-help">
        Creating a key means signing a grant with your wallet, and revoking one means signing a
        revocation. Apps in this catalog are deliberately given no way to sign anything — that is
        what stops any app here from minting credentials against your account. So this console reads
        and tries; the signing stays with you, in the app.
      </p>

      <button
        type="button"
        className="aa-btn aa-btn-primary"
        onClick={() => host.navigate(KEYS_DEEP_LINK)}
      >
        Open API access settings
      </button>

      <ul className="aa-notes">
        <li>A key is shown once, when you create it. FairWins keeps no copy — the gateway verifies your signature on every request instead of storing a secret.</li>
        <li>Revoking registers on the live gateway and does not survive a gateway restart. What reliably ends a key is the expiry you chose when you signed it.</li>
        <li>No key can move funds. The strongest thing one can do is ask the gateway to build unsigned typed data, which still needs your signature.</li>
      </ul>
    </section>
  )
}
