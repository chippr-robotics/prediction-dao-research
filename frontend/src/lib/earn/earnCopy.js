/**
 * Member-facing copy for the Earn section (spec 050, FR-011/FR-012).
 *
 * Every DeFi term the section shows gets a plain-language explainer here,
 * rendered through InfoTip next to where the term appears. Keeping the copy in
 * one module keeps wording consistent, testable, and easy to review for tone:
 * written for members with no DeFi background (SC-002).
 */

export const EARN_TIPS = {
  earn: 'Earn puts money you are not using to work. You lend it out through an established lending service and it earns a return over time. You stay in control and can take your money back out.',
  lending:
    'Lending means your money is pooled with other people’s and lent to borrowers who put up collateral. In exchange, the pool pays you a share of the interest borrowers pay.',
  vault:
    'A vault is a shared pot that does the lending for you. You put an asset in, the vault lends it out, and your share of the pot grows as interest comes in.',
  apy: 'APY (annual percentage yield) estimates how much your deposit would grow in a year at the current rate. Rates change all the time, so this is an estimate — not a promise.',
  curator:
    'The curator is the professional team that manages the vault: choosing where it lends and how it manages risk. FairWins does not manage vaults.',
  totalDeposits:
    'The total value everyone has deposited into this vault. Bigger, long-running vaults tend to have more history to judge them by.',
  approval:
    'Your first deposit takes two quick confirmations in your wallet: the first gives the vault permission to take exactly the amount you typed, and the second makes the deposit. This is standard and you approve only that amount.',
  withdrawalLiquidity:
    'Vaults lend money out, so occasionally not all of it can be taken out at the same moment. If that happens you can withdraw what is available now and come back for the rest shortly.',
  rewards:
    'Some vaults pay bonus tokens on top of the lending return, funded by reward programs. They collect here and you can claim them to your wallet whenever you like.',
  rewardsFreshness:
    'Reward figures are recalculated by the rewards program every few hours, so what you see updates on that schedule — not every second.',
  positions:
    'Your active positions: what your deposit is worth right now in each vault. The value includes the return earned so far.',
}

/** Powered-by attribution + risk disclosure (FR-012; Morpho integration terms). */
export const EARN_DISCLOSURE = {
  attribution: 'Powered by Morpho',
  risk: 'Lending happens through Morpho, a third-party on-chain lending protocol, from your own wallet. Returns are variable and not guaranteed, and smart contracts carry risk. FairWins never holds your deposit and charges no fee on Earn.',
}

/** Honest unavailable-state copy for networks without earn support (FR-008). */
export function earnUnavailableCopy(networkName, earnNetworkNames) {
  const names = (earnNetworkNames || []).join(' and ')
  return `Earning is not available on ${networkName || 'this network'} yet. Lending is available on ${names || 'supported networks'} — switch networks to use it.`
}

/** Honest "not yet" copy for future earning areas (FR-002). */
export const EARN_AREAS_FUTURE = {
  staking: 'Staking is not available in the app yet.',
  bridges: 'Bridge earning is not available in the app yet.',
}
