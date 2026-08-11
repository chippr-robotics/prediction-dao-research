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

export default function AccordionGroup({
  children,
  defaultOpenId = null,
  openId = null,
  exclusive = true,
  className = '',
}) {
  const [openIds, setOpenIds] = useState(() => {
    const initial = openId || defaultOpenId
    return initial ? [initial] : []
  })

  // A deep link (e.g. the update toast → Settings #pwa-update) has to land on an
  // OPEN section, not on a collapsed heading the member then has to hunt for.
  // Unlike `defaultOpenId` this also fires when the target CHANGES, so a second
  // deep link arriving while the tab is already mounted still opens its section.
  // Adjusted during render rather than in an effect (the React-recommended shape
  // for "state derived from a changed prop"), and it only ever opens: the member
  // can close the section again and it will not spring back.
  const [lastOpenId, setLastOpenId] = useState(openId)
  if (openId && openId !== lastOpenId) {
    setLastOpenId(openId)
    setOpenIds((prev) => {
      if (prev.includes(openId)) return prev
      return exclusive ? [openId] : [...prev, openId]
    })
  }

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
  /** Section id to open when it changes — for deep links that arrive after mount. */
  openId: PropTypes.string,
  /** Only one section open at a time (default true). */
  exclusive: PropTypes.bool,
  className: PropTypes.string,
}
