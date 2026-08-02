// Spec 042 (FR-019) — read-route control. ClearPath reads default to the network's public RPC (reliable for the
// wide eth_getLogs scans the live indexer runs); a member can opt into routing reads through their connected
// wallet's provider instead. This affects READS ONLY — every write is always signed by the wallet. Subgraph
// reads are unaffected by this choice.

export default function ReadRouteToggle({ value, onChange }) {
  return (
    <div className="cp-readroute" role="group" aria-label="Read routing">
      <span className="cp-row-sub" id="cp-readroute-label">Read via</span>
      <div className="cp-seg" role="radiogroup" aria-labelledby="cp-readroute-label">
        <button
          type="button"
          role="radio"
          aria-checked={value !== 'wallet'}
          className={`cp-seg-btn ${value !== 'wallet' ? 'active' : ''}`}
          onClick={() => onChange('public')}
          title="Read from the network's public RPC (default; best for wide log scans)"
        >
          Public RPC
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value === 'wallet'}
          className={`cp-seg-btn ${value === 'wallet' ? 'active' : ''}`}
          onClick={() => onChange('wallet')}
          title="Route reads through your connected wallet's provider (may reject wide log scans)"
        >
          Wallet
        </button>
      </div>
    </div>
  )
}
