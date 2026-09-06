/**
 * AddressScreenNotice — inline screening notice for ONE entered address: the ScreeningPill,
 * one sentence saying what it rests on, and the ⓘ that explains the rules.
 *
 * Spec 021 iteration 2 rendered this only when the address was restricted or unscreened, and
 * only against the guard on one chain. The issue-#1458 amendment renders it for EVERY valid
 * address, because a clear answer is only worth showing when it is a real one — and now it is:
 * green means every configured list on every cohort chain answered clear, not "the one guard we
 * asked did not object". Flagged carries `role="alert"`; everything else is a polite status.
 *
 * `chainId` is the network the surrounding flow acts on. It does not narrow the screen — the
 * whole cohort is always asked — it marks that network's rows in the details.
 */
import { NETWORKS } from '../../config/networks'
import { useEstateScreening } from '../../hooks/useEstateScreening'
import { isValidAddress } from '../../lib/addressBook/addressBookStore'
import { describeVerdict, VERDICTS } from '../../lib/screening/verdict'
import ScreeningPill from './ScreeningPill'
import ScreeningInfoButton from './ScreeningInfoButton'

const networkName = (chainId) => NETWORKS[chainId]?.name || `Chain ${chainId}`

export default function AddressScreenNotice({ address, chainId }) {
  const valid = Boolean(address) && isValidAddress(address)
  const { status, result } = useEstateScreening(valid ? address : null)

  if (!valid) return null

  const done = status === 'done' && result
  const flagged = done && result.verdict === VERDICTS.FLAGGED
  const text = done ? describeVerdict(result, networkName) : 'Checking sanctions lists and issuer freeze lists on every network…'

  return (
    <div
      className={`ab-screen-notice${done ? ` ab-screen-notice-${result.verdict}` : ''}`}
      role={flagged ? 'alert' : 'status'}
      data-screen-verdict={done ? result.verdict : 'loading'}
    >
      <ScreeningPill result={done ? result : null} loading={!done} chainId={chainId} />
      <span className="ab-screen-notice-text">{text}</span>
      <ScreeningInfoButton />
    </div>
  )
}
