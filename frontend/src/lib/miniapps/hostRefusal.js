/**
 * Refusal vocabulary for the mini-app host, extracted to its own module because a `.jsx` file may
 * only export components and constants — `react-refresh/only-export-components` is an error in
 * this repo's lint config, and `MiniAppHostError` is a class.
 */

/**
 * Stable machine codes for every refusal this host can produce. Exported so a
 * mini-app can branch on a cause without importing a class (the shared scope
 * publishes only `useMiniAppHost`, by design), and so the workspace can render
 * the right recovery affordance.
 */
export const HOST_REFUSAL = Object.freeze({
  /** No wallet is connected, or the acting identity has no address here. */
  WALLET_ABSENT: 'wallet_absent',
  /** The wallet is on a different chain than the action names. */
  WRONG_CHAIN: 'wrong_chain',
  /** The acting identity exists but cannot sign right now (recovered account re-lock). */
  IDENTITY_LOCKED: 'identity_locked',
  /** The app asked for something this contract does not describe. */
  BAD_PAYLOAD: 'bad_payload',
  /** No RPC endpoint is configured for the requested chain (spec 069 resolution). */
  NO_READ_PROVIDER: 'no_read_provider',
  /** `navigate` was handed something that leaves the host. */
  EXTERNAL_TARGET: 'external_target',
  /** A read provider member that would mutate the host's shared instance. */
  PROVIDER_MEMBER_BLOCKED: 'provider_member_blocked',
  /**
   * The connected wallet offers no transaction rail this host can drive — no
   * signer and no `sendCalls`. Distinct from `WALLET_ABSENT` (there IS a
   * wallet) and from `IDENTITY_LOCKED` (nothing is locked): the session simply
   * cannot write, and saying which of the three it is, is the difference
   * between a member reconnecting, unlocking, or giving up on this browser.
   */
  NO_WRITE_RAIL: 'no_write_rail',
  /**
   * `contracts(name)` was asked for a name the package's manifest never
   * declared. Refused rather than answered `null`, so "you are not approved to
   * resolve this" can never be mistaken for "it is not deployed here".
   */
  UNDECLARED_CONTRACT: 'undeclared_contract',
  /**
   * Sanctions screening returned a positive restriction for the acting account.
   * Distinct from every other refusal because the member cannot resolve it by
   * reconnecting, switching, or retrying.
   */
  SANCTIONED_ACCOUNT: 'sanctioned_account',
  /** `switchChain` was declined in the wallet, or the wallet cannot reach that chain. */
  SWITCH_REFUSED: 'switch_refused',
})

/**
 * A capability was refused. Terminal for the call that raised it; never fatal
 * to the host, and never fatal to the app beyond the surface that called it
 * (FR-015 contains the rest).
 */
export class MiniAppHostError extends Error {
  /**
   * @param {string} reason - one of {@link HOST_REFUSAL}
   * @param {string} message - developer/log detail
   * @param {{userMessage?: string}} [detail]
   */
  constructor(reason, message, detail = {}) {
    super(message)
    this.name = 'MiniAppHostError'
    this.reason = reason
    this.userMessage = detail.userMessage ?? message
  }
}

