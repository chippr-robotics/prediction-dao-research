/**
 * Member-facing copy for the Earn → Stake area (spec 065, FR-013/FR-014).
 * Plain language for non-technical members; every staking concept gets an
 * InfoTip. Kept in one place so the UI never inlines jargon.
 */
import { getStakingNetworks } from '../../config/networks'

export const STAKING_TIPS = {
  staking:
    'Staking puts a proof-of-stake coin to work helping secure a network, and pays you a reward for it. Unlike lending, getting your coin back can take a waiting period.',
  apr:
    'APR is the estimated yearly reward rate. It varies with network conditions and is not guaranteed by FairWins.',
  liquidToken:
    'Liquid staking gives you a token (like wstETH or sPOL) that represents your stake and grows in value as rewards build up. You can hold it, and cash out later.',
  delegation:
    'Delegating means backing a specific validator with your coin. Your coin stays yours but is locked with that validator until you unstake and wait out the unbonding period.',
  validator:
    'A validator is an operator that helps run the network. You pick one from a short, vetted list; they take a small commission from rewards.',
  unbonding:
    'When you unstake a delegated position, the network makes you wait an unbonding period before the coin is released. No rewards accrue on the exiting amount during that wait.',
  lockup:
    'Staked funds are not instantly spendable. Liquid tokens can be sold at any time; delegated positions must be unstaked and wait out the unbonding period.',
  slashing:
    'If a validator misbehaves, the network can reduce (slash) the amount staked with it. This is a real risk of delegated staking, though it has been rare in practice.',
  approval:
    'Staking a token (not a native coin) needs a one-time spending permission first, so you may see two confirmations on the first stake.',
  instantExit:
    'sPOL is a tradeable token, so you can swap it back to POL right away at the market price instead of waiting out the unbonding period. The swap price may differ slightly from the exact value.',
  rewards:
    'Some delegated positions pay separate rewards you can claim. Liquid staking has no separate claim — rewards build into the value of your liquid token.',
}

/** Risk disclosure shown in the Stake area and confirm summaries (FR-014). */
export const STAKING_DISCLOSURE =
  'Staking runs through third-party protocols from your own wallet — FairWins never holds your funds. Rewards vary and are not guaranteed, staked funds are not instantly spendable, and delegated staking carries the risk that a validator penalty (slashing) reduces your staked amount.'

/** Honest unavailable-state copy naming where staking is live. */
export function stakingUnavailableCopy() {
  const names = getStakingNetworks().map((n) => n.name)
  const where = names.length ? names.join(' and ') : 'a supported network'
  return `Staking is not available on this network yet. It is available on ${where} — switch networks to stake.`
}

/** Future areas honest copy (kept for parity with earnCopy's EARN_AREAS_FUTURE). */
export const STAKING_AREA_DESC =
  'Stake supported coins to earn a network reward. Choose a liquid option you can cash out any time, or delegate to a validator.'
