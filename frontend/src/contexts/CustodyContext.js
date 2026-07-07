// Spec 043 (US3) — the active-identity context object. Kept in a plain .js file (matching DexContext) so the
// provider .jsx only exports a component (react-refresh) and the hook lives under hooks/.

import { createContext } from 'react'

export const CustodyContext = createContext(null)

export default CustodyContext
