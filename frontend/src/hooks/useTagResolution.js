/**
 * useTagResolution (spec 054) — forward-resolve a tag-like input (`%chipprbots`) to its owner address for
 * address-entry surfaces. Additive to ENS/address entry: only engages when the input LOOKS like a tag.
 *
 * Soft-failing and null-safe: a registry that is undeployed / unreachable, or a non-tag input, yields
 * `{ isTag: false }` so the caller keeps working with raw addresses and ENS (FR-013). Only status ACTIVE
 * produces a usable `address`; every other status surfaces an honest, non-committable message (FR-011/022).
 */
import { useContext, useEffect, useState } from 'react'
import { WalletContext } from '../contexts/WalletContext.js'
import { resolveTag, statusMessage, TagStatus } from '../lib/tags/resolveTag'
import { isTagLike, normalizeTag } from '../lib/tags/normalizeTag'
import { isValidEthereumAddress, isEnsName } from '../utils/validation'

const EMPTY = { isTag: false, address: null, status: null, verified: false, isLoading: false, message: null }

/**
 * @param {string} input raw entry-field value
 * @param {{ chainId?: number }} [opts]
 * @returns {{ isTag: boolean, address: string|null, status: number|null, verified: boolean, isLoading: boolean, message: string|null }}
 */
export function useTagResolution(input, { chainId: chainIdArg } = {}) {
  const wallet = useContext(WalletContext)
  const provider = wallet?.provider
  const chainId = chainIdArg ?? wallet?.chainId
  const raw = typeof input === 'string' ? input.trim() : ''

  // Tag branch engages only for tag-shaped input that is NOT an address or ENS name.
  const looksLikeTag = isTagLike(raw) && !isValidEthereumAddress(raw) && !isEnsName(raw)

  const [state, setState] = useState(EMPTY)

  useEffect(() => {
    if (!looksLikeTag) {
      setState(EMPTY)
      return
    }
    // Locally invalid (e.g. bad hyphen) — treat as a tag attempt with a format hint, no contract call.
    let canonical
    try {
      canonical = normalizeTag(raw)
    } catch {
      setState({ ...EMPTY, isTag: true, message: 'Not a valid tag' })
      return
    }
    if (!provider || chainId == null) {
      setState({ ...EMPTY, isTag: true, isLoading: false })
      return
    }

    let cancelled = false
    setState({ ...EMPTY, isTag: true, isLoading: true })
    resolveTag(canonical, { provider, chainId })
      .then((info) => {
        if (cancelled) return
        if (!info || info.status === TagStatus.NONE) {
          setState({ isTag: true, address: null, status: TagStatus.NONE, verified: false, isLoading: false, message: 'No such tag' })
          return
        }
        const active = info.status === TagStatus.ACTIVE
        setState({
          isTag: true,
          address: active ? info.address : null,
          status: info.status,
          verified: info.verified,
          isLoading: false,
          message: active ? null : statusMessage(info.status),
        })
      })
      .catch(() => {
        if (!cancelled) setState({ ...EMPTY, isTag: true, isLoading: false })
      })
    return () => {
      cancelled = true
    }
  }, [looksLikeTag, raw, provider, chainId])

  return state
}

export default useTagResolution
