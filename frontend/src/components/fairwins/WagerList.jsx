import { MyWagersView } from '../../constants/wagerDefaults'
import WagerCardGrid from './WagerCardGrid'
import WagerTable from './WagerTable'

/**
 * WagerList (spec 018)
 *
 * Thin switch between the grid (expandable cards) and table (compact rows) views
 * of My Wagers. Forwards the shared prop contract to whichever view is active so
 * MyMarketsModal's call sites stay simple.
 */
export default function WagerList({ viewMode = MyWagersView.GRID, ...props }) {
  return viewMode === MyWagersView.TABLE
    ? <WagerTable {...props} />
    : <WagerCardGrid {...props} />
}
