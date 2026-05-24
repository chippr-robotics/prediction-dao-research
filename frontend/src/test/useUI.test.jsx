import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'
import { UIContext } from '../contexts/UIContext'
import { useUI, useNotification, useAnnouncement, useModal, useError } from '../hooks/useUI'

const mockUIValue = {
  notification: null,
  showNotification: vi.fn(),
  hideNotification: vi.fn(),
  announcement: '',
  announce: vi.fn(),
  modal: null,
  showModal: vi.fn(),
  hideModal: vi.fn(),
  error: null,
  showError: vi.fn(),
  clearError: vi.fn(),
}

function createWrapper(value = mockUIValue) {
  return function Wrapper({ children }) {
    return (
      <UIContext.Provider value={value}>
        {children}
      </UIContext.Provider>
    )
  }
}

describe('useUI hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return UI context value when provider exists', () => {
    const { result } = renderHook(() => useUI(), {
      wrapper: createWrapper(),
    })
    expect(result.current).toEqual(mockUIValue)
  })

  it('should throw error when used outside UIProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => {
      renderHook(() => useUI())
    }).toThrow('useUI must be used within a UIProvider')
    consoleError.mockRestore()
  })

  it('should provide all expected properties', () => {
    const { result } = renderHook(() => useUI(), {
      wrapper: createWrapper(),
    })
    expect(result.current).toHaveProperty('notification')
    expect(result.current).toHaveProperty('showNotification')
    expect(result.current).toHaveProperty('hideNotification')
    expect(result.current).toHaveProperty('announcement')
    expect(result.current).toHaveProperty('announce')
    expect(result.current).toHaveProperty('modal')
    expect(result.current).toHaveProperty('showModal')
    expect(result.current).toHaveProperty('hideModal')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('showError')
    expect(result.current).toHaveProperty('clearError')
  })
})

describe('useNotification hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return notification state and functions', () => {
    const { result } = renderHook(() => useNotification(), {
      wrapper: createWrapper(),
    })
    expect(result.current.notification).toBeNull()
    expect(typeof result.current.showNotification).toBe('function')
    expect(typeof result.current.hideNotification).toBe('function')
  })

  it('should expose showNotification function', () => {
    const { result } = renderHook(() => useNotification(), {
      wrapper: createWrapper(),
    })
    result.current.showNotification('Test message', 'success')
    expect(mockUIValue.showNotification).toHaveBeenCalledWith('Test message', 'success')
  })

  it('should expose hideNotification function', () => {
    const { result } = renderHook(() => useNotification(), {
      wrapper: createWrapper(),
    })
    result.current.hideNotification()
    expect(mockUIValue.hideNotification).toHaveBeenCalled()
  })

  it('should reflect active notification', () => {
    const activeNotification = {
      ...mockUIValue,
      notification: { id: 1, message: 'Hello', type: 'info' },
    }
    const { result } = renderHook(() => useNotification(), {
      wrapper: createWrapper(activeNotification),
    })
    expect(result.current.notification).toEqual({
      id: 1,
      message: 'Hello',
      type: 'info',
    })
  })

  it('should throw when used outside UIProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => {
      renderHook(() => useNotification())
    }).toThrow('useUI must be used within a UIProvider')
    consoleError.mockRestore()
  })
})

describe('useAnnouncement hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return announcement state and announce function', () => {
    const { result } = renderHook(() => useAnnouncement(), {
      wrapper: createWrapper(),
    })
    expect(result.current.announcement).toBe('')
    expect(typeof result.current.announce).toBe('function')
  })

  it('should call announce function', () => {
    const { result } = renderHook(() => useAnnouncement(), {
      wrapper: createWrapper(),
    })
    result.current.announce('Screen reader message')
    expect(mockUIValue.announce).toHaveBeenCalledWith('Screen reader message')
  })

  it('should reflect active announcement', () => {
    const activeAnnouncement = {
      ...mockUIValue,
      announcement: 'Important update',
    }
    const { result } = renderHook(() => useAnnouncement(), {
      wrapper: createWrapper(activeAnnouncement),
    })
    expect(result.current.announcement).toBe('Important update')
  })
})

describe('useModal hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return modal state and functions', () => {
    const { result } = renderHook(() => useModal(), {
      wrapper: createWrapper(),
    })
    expect(result.current.modal).toBeNull()
    expect(typeof result.current.showModal).toBe('function')
    expect(typeof result.current.hideModal).toBe('function')
  })

  it('should call showModal function', () => {
    const { result } = renderHook(() => useModal(), {
      wrapper: createWrapper(),
    })
    result.current.showModal('modal-content', { size: 'large' })
    expect(mockUIValue.showModal).toHaveBeenCalledWith('modal-content', { size: 'large' })
  })

  it('should call hideModal function', () => {
    const { result } = renderHook(() => useModal(), {
      wrapper: createWrapper(),
    })
    result.current.hideModal()
    expect(mockUIValue.hideModal).toHaveBeenCalled()
  })

  it('should reflect active modal state', () => {
    const activeModal = {
      ...mockUIValue,
      modal: { content: 'Test Modal', options: {} },
    }
    const { result } = renderHook(() => useModal(), {
      wrapper: createWrapper(activeModal),
    })
    expect(result.current.modal).toEqual({ content: 'Test Modal', options: {} })
  })
})

describe('useError hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return error state and functions', () => {
    const { result } = renderHook(() => useError(), {
      wrapper: createWrapper(),
    })
    expect(result.current.error).toBeNull()
    expect(typeof result.current.showError).toBe('function')
    expect(typeof result.current.clearError).toBe('function')
  })

  it('should call showError function', () => {
    const { result } = renderHook(() => useError(), {
      wrapper: createWrapper(),
    })
    result.current.showError('Something went wrong', { code: 500 })
    expect(mockUIValue.showError).toHaveBeenCalledWith('Something went wrong', { code: 500 })
  })

  it('should call clearError function', () => {
    const { result } = renderHook(() => useError(), {
      wrapper: createWrapper(),
    })
    result.current.clearError()
    expect(mockUIValue.clearError).toHaveBeenCalled()
  })

  it('should reflect active error state', () => {
    const activeError = {
      ...mockUIValue,
      error: { message: 'Network error', details: null, timestamp: 1234567890 },
    }
    const { result } = renderHook(() => useError(), {
      wrapper: createWrapper(activeError),
    })
    expect(result.current.error).toEqual({
      message: 'Network error',
      details: null,
      timestamp: 1234567890,
    })
  })
})
