import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PDF_SCALE_PREFERENCES_STORAGE_KEY,
  readPdfScalePreference,
  writePdfScalePreference
} from './pdf-scale-preference-storage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PDF scale preference storage', () => {
  it('round-trips a preference by file path', () => {
    const storage = createMemoryStorage()
    vi.stubGlobal('localStorage', storage)

    writePdfScalePreference('/repo/report.pdf', 1.75)

    expect(readPdfScalePreference('/repo/report.pdf')).toBe(1.75)
    expect(readPdfScalePreference('/repo/other.pdf')).toBeNull()
  })

  it('persists fit-to-width resets and keeps files isolated', () => {
    const storage = createMemoryStorage()
    vi.stubGlobal('localStorage', storage)

    writePdfScalePreference('/repo/report.pdf', 2)
    writePdfScalePreference('/repo/other.pdf', 'page-width')

    expect(readPdfScalePreference('/repo/report.pdf')).toBe(2)
    expect(readPdfScalePreference('/repo/other.pdf')).toBe('page-width')
  })

  it('ignores malformed stored values', () => {
    const storage = createMemoryStorage()
    vi.stubGlobal('localStorage', storage)
    storage.setItem(
      PDF_SCALE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ '/repo/report.pdf': { scale: 2 } })
    )

    expect(readPdfScalePreference('/repo/report.pdf')).toBeNull()
  })
})

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => {
      values.set(key, value)
    }
  }
}
