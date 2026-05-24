import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { InfiniteScroll, InfiniteScrollLoader } from '../components/ui/InfiniteScroll'

// InfiniteScroll uses CSS modules - mock them
vi.mock('../components/ui/InfiniteScroll.module.css', () => ({
  default: {
    container: 'container',
    loader: 'loader',
    spinner: 'spinner',
    loaderText: 'loaderText',
    endMessage: 'endMessage',
    sentinel: 'sentinel',
  },
}))

describe('InfiniteScroll', () => {
  let observeCallback = null

  beforeEach(() => {
    vi.clearAllMocks()
    observeCallback = null

    // Override global mock to capture the callback - must be a class
    global.IntersectionObserver = class {
      constructor(callback) {
        observeCallback = callback
        this.observe = vi.fn()
        this.unobserve = vi.fn()
        this.disconnect = vi.fn()
      }
    }
  })

  it('should render children', () => {
    render(
      <InfiniteScroll onLoadMore={vi.fn()}>
        <p>Item 1</p>
        <p>Item 2</p>
      </InfiniteScroll>
    )
    expect(screen.getByText('Item 1')).toBeInTheDocument()
    expect(screen.getByText('Item 2')).toBeInTheDocument()
  })

  it('should show loading indicator when isLoading is true', () => {
    render(
      <InfiniteScroll onLoadMore={vi.fn()} isLoading={true}>
        <p>Items</p>
      </InfiniteScroll>
    )
    expect(screen.getByText('Loading more...')).toBeInTheDocument()
  })

  it('should show custom loader when provided and loading', () => {
    render(
      <InfiniteScroll
        onLoadMore={vi.fn()}
        isLoading={true}
        loader={<p>Custom loader</p>}
      >
        <p>Items</p>
      </InfiniteScroll>
    )
    expect(screen.getByText('Custom loader')).toBeInTheDocument()
  })

  it('should show end message when hasMore is false and not loading', () => {
    render(
      <InfiniteScroll onLoadMore={vi.fn()} hasMore={false} isLoading={false}>
        <p>All items</p>
      </InfiniteScroll>
    )
    expect(screen.getByText('No more markets to load')).toBeInTheDocument()
  })

  it('should show custom end message when provided', () => {
    render(
      <InfiniteScroll
        onLoadMore={vi.fn()}
        hasMore={false}
        isLoading={false}
        endMessage={<p>That is all</p>}
      >
        <p>Items</p>
      </InfiniteScroll>
    )
    expect(screen.getByText('That is all')).toBeInTheDocument()
  })

  it('should render sentinel element when hasMore and not loading', () => {
    const { container } = render(
      <InfiniteScroll onLoadMore={vi.fn()} hasMore={true} isLoading={false}>
        <p>Items</p>
      </InfiniteScroll>
    )
    const sentinel = container.querySelector('.sentinel')
    expect(sentinel).toBeInTheDocument()
    expect(sentinel).toHaveAttribute('aria-hidden', 'true')
  })

  it('should NOT render sentinel when loading', () => {
    const { container } = render(
      <InfiniteScroll onLoadMore={vi.fn()} hasMore={true} isLoading={true}>
        <p>Items</p>
      </InfiniteScroll>
    )
    const sentinel = container.querySelector('.sentinel')
    expect(sentinel).not.toBeInTheDocument()
  })

  it('should NOT render sentinel when hasMore is false', () => {
    const { container } = render(
      <InfiniteScroll onLoadMore={vi.fn()} hasMore={false} isLoading={false}>
        <p>Items</p>
      </InfiniteScroll>
    )
    const sentinel = container.querySelector('.sentinel')
    expect(sentinel).not.toBeInTheDocument()
  })

  it('should create IntersectionObserver when hasMore and not loading', () => {
    const onLoadMore = vi.fn()
    render(
      <InfiniteScroll onLoadMore={onLoadMore} hasMore={true} isLoading={false}>
        <p>Items</p>
      </InfiniteScroll>
    )
    // If IntersectionObserver was created, observeCallback should be set
    expect(observeCallback).not.toBeNull()
  })

  it('should call onLoadMore when sentinel intersects', () => {
    const onLoadMore = vi.fn()
    render(
      <InfiniteScroll onLoadMore={onLoadMore} hasMore={true} isLoading={false}>
        <p>Items</p>
      </InfiniteScroll>
    )

    // Simulate intersection
    if (observeCallback) {
      observeCallback([{ isIntersecting: true }])
    }
    expect(onLoadMore).toHaveBeenCalled()
  })

  it('should NOT call onLoadMore when sentinel does not intersect', () => {
    const onLoadMore = vi.fn()
    render(
      <InfiniteScroll onLoadMore={onLoadMore} hasMore={true} isLoading={false}>
        <p>Items</p>
      </InfiniteScroll>
    )

    if (observeCallback) {
      observeCallback([{ isIntersecting: false }])
    }
    expect(onLoadMore).not.toHaveBeenCalled()
  })

  it('should apply custom className', () => {
    const { container } = render(
      <InfiniteScroll onLoadMore={vi.fn()} className="custom-scroll">
        <p>Items</p>
      </InfiniteScroll>
    )
    const scrollContainer = container.firstChild
    expect(scrollContainer).toHaveClass('custom-scroll')
  })
})

describe('InfiniteScrollLoader', () => {
  it('should render loading text', () => {
    render(<InfiniteScrollLoader />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })
})
