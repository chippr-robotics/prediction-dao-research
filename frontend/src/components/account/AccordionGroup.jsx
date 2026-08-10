/**
 * Groups AccordionSections so a whole settings tab opens/collapses as one surface.
 *
 * Default is "one open at a time" (`exclusive`): a long settings page reads as a
 * short list of headings, and opening a section tidies the previous one away
 * instead of pushing it off-screen. Pass `exclusive={false}` for independent
 * sections. State lives here (not in storage) so returning to the tab always
 * starts from the tidy, collapsed view.
 */

import { useCallback, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { AccordionGroupContext } from './accordionContext'

export default function AccordionGroup({ children, defaultOpenId = null, exclusive = true, className = '' }) {
  const [openIds, setOpenIds] = useState(() => (defaultOpenId ? [defaultOpenId] : []))

  const toggle = useCallback(
    (id) => {
      setOpenIds((prev) => {
        const isOpen = prev.includes(id)
        if (exclusive) return isOpen ? [] : [id]
        return isOpen ? prev.filter((x) => x !== id) : [...prev, id]
      })
    },
    [exclusive]
  )

  const value = useMemo(
    () => ({ isOpen: (id) => openIds.includes(id), toggle }),
    [openIds, toggle]
  )

  return (
    <AccordionGroupContext.Provider value={value}>
      <div className={`accordion-group ${className}`.trim()}>{children}</div>
    </AccordionGroupContext.Provider>
  )
}

AccordionGroup.propTypes = {
  children: PropTypes.node,
  /** Section id to start expanded (default: everything collapsed). */
  defaultOpenId: PropTypes.string,
  /** Only one section open at a time (default true). */
  exclusive: PropTypes.bool,
  className: PropTypes.string,
}
