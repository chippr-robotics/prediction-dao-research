/**
 * ClearPath's mounted component (spec 073 T028).
 *
 * A one-line adapter on purpose: `ClearPathPanel` is unchanged in role from the host-native tab it
 * replaces, and describing the feature's structure in two places is how the two drift.
 */

import ClearPathPanel from './ClearPathPanel'

export default function ClearPathApp() {
  return <ClearPathPanel />
}
