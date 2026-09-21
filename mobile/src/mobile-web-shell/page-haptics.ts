import * as haptics from '../platform/haptics'
import type { BridgeHapticsKind } from './bridge/bridge-haptics-notify'

/**
 * A haptic the page asked for, played by the same functions a native screen plays.
 *
 * The native file's own body and nothing beside it: the `Platform.OS` split, the Android
 * `HapticFeedbackConstants` and the iOS styles all stay where they are, so a phone feels the same
 * tap whether the screen came from the bundle or from the app. A second mapping would be the one
 * that drifted.
 *
 * Total both ways, without a test having to say so. Keyed on the kind union, a kind with no row does
 * not compile; valued as a name of the module, a row naming a function `haptics.ts` does not export
 * does not compile either.
 */
const HAPTIC_BY_KIND: Readonly<Record<BridgeHapticsKind, keyof typeof haptics>> = {
  mediumImpact: 'triggerMediumImpact',
  selection: 'triggerSelection',
  success: 'triggerSuccess',
  error: 'triggerError',
  edgeBump: 'triggerEdgeBump'
}

/** Nothing is owed back: every function above is already `void …catch(() => {})` on the device. */
export function playPageHaptic(kind: BridgeHapticsKind): void {
  haptics[HAPTIC_BY_KIND[kind]]()
}

/**
 * The function names the table spells, so a test can hold it to the module it maps.
 *
 * The third direction the type cannot state: a haptic `haptics.ts` grows with no kind of its own is
 * one the page can never ask for, and the only thing that sees it is a comparison of both sets.
 */
export function pageHapticExportNames(): readonly string[] {
  return Object.values(HAPTIC_BY_KIND)
}
