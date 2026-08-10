/**
 * NetworkPill — small colored badge naming the network an address lives on.
 *
 * Each known chain gets its own hue so entries spanning several networks
 * (e.g. Polygon + Ethereum Classic Mordor) read apart at a glance
 * (issue #1023); unknown chains fall back to a neutral pill.
 */

import './NetworkPill.css'

const CHAIN_VARIANT = {
  1: 'eth',
  10: 'op',
  61: 'etc',
  63: 'mordor',
  137: 'polygon',
  8453: 'base',
  42161: 'arb',
  80002: 'amoy',
  bitcoin: 'btc',
  'bitcoin-testnet': 'btc',
}

export default function NetworkPill({ chainId, name }) {
  const variant = CHAIN_VARIANT[chainId] || 'other'
  return <span className={`ab-net-pill ab-net-pill--${variant}`}>{name}</span>
}
