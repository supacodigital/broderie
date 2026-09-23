import { describe, it, expect, vi, afterEach } from 'vitest'
import { openKeyboardDuringTap } from './touchKeyboard.js'

// Non-régression CLI-01 — le clavier iPhone ne s'ouvrait pas sur la recherche
describe('openKeyboardDuringTap', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.querySelectorAll('[data-keyboard-proxy]').forEach((el) => el.remove())
  })

  it('pose le curseur dans un champ immédiatement, pendant le geste', () => {
    openKeyboardDuringTap()
    expect(document.activeElement?.tagName).toBe('INPUT')
    expect(document.activeElement?.hasAttribute('data-keyboard-proxy')).toBe(true)
  })

  it('retire le champ relais ensuite', () => {
    vi.useFakeTimers()
    openKeyboardDuringTap()
    expect(document.querySelectorAll('[data-keyboard-proxy]').length).toBeGreaterThan(0)
    vi.advanceTimersByTime(1600)
    expect(document.querySelectorAll('[data-keyboard-proxy]').length).toBe(0)
  })
})
