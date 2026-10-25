
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CURRENCIES, fmtDate, money, setFormat } from './api'
import { applyTheme, resolveTheme } from './theme'

describe('currency formatting', () => {
  it.each([
    ['INR', '₹1,23,457'],
    ['USD', '$123,457'],
    ['EUR', '€123,457'],
    ['GBP', '£123,457'],
    ['AED', 'AED'],
  ])('%s', (currency, expected) => {
    setFormat({ currency })
    expect(money(123456.5)).toContain(expected)
  })

  it('does not convert the number, only formats it', () => {
    setFormat({ currency: 'USD' })
    expect(money(100)).toBe('$100')

    setFormat({ currency: 'INR' })
    expect(money(100)).toBe('₹100')
  })

  it('covers all five supported currencies', () => {
    expect(Object.keys(CURRENCIES)).toEqual([
      'INR', 'USD', 'EUR', 'GBP', 'AED',
    ])
  })
})

describe('date formatting', () => {
  it('formats dates correctly', () => {
    expect(fmtDate('2026-03-27', 'DD/MM/YYYY')).toBe('27/03/2026')
    expect(fmtDate('2026-03-27', 'MM/DD/YYYY')).toBe('03/27/2026')
    expect(fmtDate('2026-03-27', 'YYYY-MM-DD')).toBe('2026-03-27')
  })
})

describe('theme restoration', () => {
  beforeEach(() => {
    const storage = new Map()

    vi.stubGlobal('localStorage', {
      getItem: (key) => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
      clear: () => storage.clear(),
    })
  })

  it('applies saved light/dark and caches it', () => {
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('sw-theme')).toBe('dark')

    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('system clears the cache and follows the device', () => {
    applyTheme('dark')
    applyTheme('system')

    expect(localStorage.getItem('sw-theme')).toBeNull()
    expect(['light', 'dark']).toContain(resolveTheme('system'))
  })
})
