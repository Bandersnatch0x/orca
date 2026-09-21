/**
 * The page's haptic is the app's haptic.
 *
 * Asserted against `expo-haptics` rather than against `platform/haptics`: a test that mocked the
 * app's own module would pin this file's table and prove nothing about the thing a hand feels, and
 * the whole reason haptics ride one mapping is that the `Platform.OS` split and the Android
 * `HapticFeedbackConstants` must not be written twice.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BRIDGE_HAPTICS_KINDS, type BridgeHapticsKind } from './bridge/bridge-haptics-notify'

// Hoisted, because `vi.mock` is: a factory closing over an ordinary `const` reads it before its
// initializer has run. The device call each haptic makes is the only thing recorded.
const device = vi.hoisted(() => ({
  platform: { OS: 'ios' as 'ios' | 'android' },
  calls: [] as string[]
}))
const { calls, platform } = device

vi.mock('react-native', () => ({ Platform: device.platform }))

vi.mock('expo-haptics', () => ({
  impactAsync: (style: string) => {
    device.calls.push(`impact:${style}`)
    return Promise.resolve()
  },
  selectionAsync: () => {
    device.calls.push('selection')
    return Promise.resolve()
  },
  notificationAsync: (type: string) => {
    device.calls.push(`notification:${type}`)
    return Promise.resolve()
  },
  performAndroidHapticsAsync: (constant: string) => {
    device.calls.push(`android:${constant}`)
    return Promise.resolve()
  },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
  AndroidHaptics: {
    Long_Press: 'long-press',
    Gesture_Start: 'gesture-start',
    Confirm: 'confirm',
    Reject: 'reject',
    Clock_Tick: 'clock-tick'
  }
}))

import * as nativeHaptics from '../platform/haptics'
import { pageHapticExportNames, playPageHaptic } from './page-haptics'

beforeEach(() => {
  calls.length = 0
  platform.OS = 'ios'
})

describe('the haptic a page asked for, on iOS', () => {
  it.each([
    ['mediumImpact', 'impact:medium'],
    ['selection', 'selection'],
    ['success', 'notification:success'],
    ['error', 'notification:error'],
    ['edgeBump', 'impact:light']
  ] as const)('plays %s as %s', (kind, expected) => {
    playPageHaptic(kind)
    expect(calls).toEqual([expected])
  })
})

/**
 * The other platform, unchanged: `performAndroidHapticsAsync` reaches
 * `HapticFeedbackConstants`, which works with no `VIBRATE` permission and is why the split exists.
 */
describe('the same haptic on Android', () => {
  it.each([
    ['mediumImpact', 'android:long-press'],
    ['selection', 'android:gesture-start'],
    ['success', 'android:confirm'],
    ['error', 'android:reject'],
    ['edgeBump', 'android:clock-tick']
  ] as const)('plays %s as %s', (kind, expected) => {
    platform.OS = 'android'
    playPageHaptic(kind)
    expect(calls).toEqual([expected])
  })
})

describe('the kinds and the functions behind them', () => {
  it('spends exactly one call per notify, which is what a per-row tap can afford', () => {
    for (const kind of BRIDGE_HAPTICS_KINDS) {
      playPageHaptic(kind)
    }
    expect(calls).toHaveLength(BRIDGE_HAPTICS_KINDS.length)
  })

  /**
   * The direction the table's type cannot state.
   *
   * `Record<BridgeHapticsKind, keyof typeof haptics>` refuses a kind with no row and a row naming a
   * function that does not exist. It says nothing about a function `haptics.ts` grows with no kind
   * of its own, which would be a haptic the page could never ask for; comparing both sets is the
   * only thing that sees it.
   */
  it('maps every function the app exports, so no haptic is unreachable from the page', () => {
    const exported = Object.keys(nativeHaptics).filter(
      (name) => typeof nativeHaptics[name as keyof typeof nativeHaptics] === 'function'
    )
    expect(exported.length).toBe(BRIDGE_HAPTICS_KINDS.length)
    expect([...pageHapticExportNames()].sort()).toEqual(exported.sort())
  })
})

describe('the kind union', () => {
  it('is the five the app has and nothing else', () => {
    const kinds: readonly BridgeHapticsKind[] = BRIDGE_HAPTICS_KINDS
    expect([...kinds]).toEqual(['mediumImpact', 'selection', 'success', 'error', 'edgeBump'])
  })
})
