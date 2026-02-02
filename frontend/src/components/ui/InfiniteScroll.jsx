/**
 * InfiniteScroll Component
 *
 * A wrapper component that triggers a callback when the user scrolls
 * near the bottom of the content. Uses IntersectionObserver for efficiency.
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Content to render
 * @param {Function} props.onLoadMore - Callback when more content should load
 * @param {boolean} props.hasMore - Whether more content is available
 * @param {boolean} props.isLoading - Whether content is currently loading
 * @param {React.ReactNode} props.loader - Custom loading indicator
 * @param {React.ReactNode} props.endMessage - Message to show when all content loaded
 * @param {number} props.threshold - Pixels from bottom to trigger load (default: 200)
 * @param {string} props.className - Additional CSS classes
 */

import { useRef, useEffect, useCallback } from 'react'
import styles from './InfiniteScroll.module.css'

export function InfiniteScroll({
  children,
  onLoadMore,
  hasMore = true,
  isLoading = false,
  loader = null,
  endMessage = null,
  threshold = 200,
  className = ''
}) {
  const sentinelRef = useRef(null)
  const containerRef = useRef(null)

  // Stable callback ref
  const onLoadMoreRef = useRef(onLoadMore)
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore
  }, [onLoadMore])

  // Set up intersection observer
  useEffect(() => {
    if (!hasMore || isLoading) return

    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (entry.isIntersecting && onLoadMoreRef.current) {
          onLoadMoreRef.current()
        }
      },
      {
        root: null, // viewport
        rootMargin: `${threshold}px`,
        threshold: 0
      }
    )

    observer.observe(sentinel)

    return () => {
      observer.disconnect()
    }
  }, [hasMore, isLoading, threshold])

  // Default loader
  const defaultLoader = (
    <div className={styles.loader}>
      <div className={styles.spinner} />
      <span className={styles.loaderText}>Loading more...</span>
    </div>
  )

  // Default end message
  const defaultEndMessage = (
    <div className={styles.endMessage}>
      <span>No more markets to load</span>
    </div>
  )

  return (
    <div ref={containerRef} className={`${styles.container} ${className}`}>
      {children}

      {/* Loading indicator */}
      {isLoading && (loader || defaultLoader)}

      {/* End of list message */}
      {!hasMore && !isLoading && (endMessage || defaultEndMessage)}

      {/* Invisible sentinel element for intersection detection */}
      {hasMore && !isLoading && (
        <div
          ref={sentinelRef}
          className={styles.sentinel}
          aria-hidden="true"
        />
      )}
    </div>
  )
}

/**
 * Loading spinner component for use outside InfiniteScroll
 */
export function InfiniteScrollLoader() {
  return (
    <div className={styles.loader}>
      <div className={styles.spinner} />
      <span className={styles.loaderText}>Loading...</span>
    </div>
  )
}

export default InfiniteScroll
