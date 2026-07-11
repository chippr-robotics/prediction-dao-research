/**
 * EarnRewardsView (spec 050, US2) — bonus reward tokens the member's lending
 * has earned (Merkl program), with a single claim action.
 *
 * Honest states: an unreachable rewards service is an explicit "temporarily
 * unavailable" (never a fabricated zero); figures carry their refresh cadence
 * ("updates every few hours"); the claim button never prompts the wallet when
 * nothing is claimable. Claim success is reported from the tx receipt.
 */
import { formatUnits } from 'ethers'
import { useEarnRewards } from '../../hooks/useEarnRewards'
import InfoTip from '../ui/InfoTip'
import SensitiveValue from '../common/SensitiveValue'
import { EARN_TIPS } from '../../lib/earn/earnCopy'

function fmtToken(amountBig, token) {
  const value = Number(formatUnits(amountBig, token.decimals))
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${token.symbol}`
}

export default function EarnRewardsView() {
  const { rewards, status, fetchedAt, totalClaimable, claim, claimState, legacyRewardsUrl, refresh } =
    useEarnRewards()

  return (
    <div className="earn-rewards">
      <div className="earn-lend-header">
        <h3>
          Rewards
          <InfoTip label="About rewards" className="earn-info">
            {EARN_TIPS.rewards}
          </InfoTip>
        </h3>
        {fetchedAt && (
          <span className="earn-freshness">
            Updates every few hours
            <InfoTip label="Why not real-time?" className="earn-info">
              {EARN_TIPS.rewardsFreshness}
            </InfoTip>
          </span>
        )}
      </div>

      {status === 'loading' && <p className="earn-state">Checking your rewards…</p>}

      {status === 'unavailable' && (
        <div className="earn-unavailable" role="alert">
          <p>
            Reward information is temporarily unavailable. Any rewards you have earned are safe —
            check back shortly.
          </p>
          <button type="button" className="earn-btn secondary" onClick={refresh}>
            Try again
          </button>
        </div>
      )}

      {status === 'ready' && rewards.length === 0 && (
        <p className="earn-state">
          Nothing to claim yet. Rewards build up over time while you have money lent out in a vault
          that runs a reward program — they will appear here.
        </p>
      )}

      {status === 'ready' && rewards.length > 0 && (
        <>
          <ul className="earn-rewards-list">
            {rewards.map((reward) => (
              <li key={reward.token.address} className="earn-reward-row">
                <span className="earn-reward-token">{reward.token.symbol}</span>
                <span className="earn-reward-values">
                  <SensitiveValue className="earn-reward-claimable">
                    {reward.claimable > 0n
                      ? `${fmtToken(reward.claimable, reward.token)} ready to claim`
                      : 'Nothing ready yet'}
                  </SensitiveValue>
                  {reward.pending > 0n && (
                    <SensitiveValue className="earn-reward-pending">
                      {`${fmtToken(reward.pending, reward.token)} building up`}
                    </SensitiveValue>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {claimState.status === 'confirmed' ? (
            <div className="earn-tx-done" role="status">
              <p>Rewards claimed — they are in your wallet.</p>
              {claimState.txUrl && (
                <a href={claimState.txUrl} target="_blank" rel="noopener noreferrer">
                  View transaction ↗
                </a>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="earn-btn primary"
              onClick={claim}
              disabled={totalClaimable === 0 || claimState.status === 'pending'}
              title={totalClaimable === 0 ? 'Nothing is ready to claim yet' : undefined}
            >
              {claimState.status === 'pending' ? 'Waiting for confirmation…' : 'Claim rewards'}
            </button>
          )}
          {claimState.status === 'error' && (
            <p className="earn-input-error" role="alert">
              {claimState.error}
            </p>
          )}
        </>
      )}

      {legacyRewardsUrl && (
        <p className="earn-legacy-note">
          Lent through Morpho before mid-2025?{' '}
          <a href={legacyRewardsUrl} target="_blank" rel="noopener noreferrer">
            Check Morpho&rsquo;s legacy rewards page ↗
          </a>
        </p>
      )}
    </div>
  )
}
