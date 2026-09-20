/**
 * The document's modules, and the one sequence that starts them.
 *
 * The document is one function scope, not a dependency graph: `runtime-constants` takes the
 * surface, `surface-swap` captures the surface it was handed, and `selection-state-and-eviction`
 * takes the overlay elements. Ruling 20 moved each of those out of the module body and into a
 * start function, so importing this file does nothing on its own; the order below is still the
 * order, because the start calls follow it and the WebView's generated script emits the same
 * sequence at the foot of the document.
 *
 * That is what makes a second mount a second terminal. ES module bodies run once per page, so a
 * remount re-imports nothing; it calls `startPageDocumentModules` again, and every element read
 * and listener install happens against the markup the host has just replanted.
 *
 * `message-bridge` is deliberately absent (ruling 19). It installs `window`/`document` `message`
 * listeners, and on the page those frames belong to the shell: the document would read a bridge
 * envelope as a terminal command. The component calls `handleMsg` instead, and re-arms the one
 * other thing that module does, the window-resize refit.
 *
 * `page-document-module-order.test.ts` holds this list against
 * `scripts/terminal-document-module-order.mjs`, so the page and the WebView cannot run different
 * programs and a reordering edit cannot pass unread.
 */
import './document-host-seams'
import './document-scope'
import { startRuntimeConstants } from './runtime-constants'
import { startTerminalHandle } from './terminal-handle'
import './query-reply'
import { startSurfaceSwap } from './surface-swap'
import { startTextScaling } from './text-scaling'
import { startViewportTransform } from './viewport-transform'
import './terminal-theme'
import './fit-scale'
import './mouse-mode-decset-scan'
import './write-queue'
import { startWebglRecovery, stopWebglRecovery } from './webgl-recovery'
import './terminal-init'
import './reflow'
import { startHostNotify, stopHostNotify } from './host-notify'
import './host-message-router'
import { startSelectionStateAndEviction } from './selection-state-and-eviction'
import { startModeMirroring } from './mode-mirroring'
import './keyboard-avoidance-metrics'
import './term-observers'
import './viewport-cell'
import './mouse-report-cell'
import './mouse-input-encoding'
import './normal-buffer-smooth-scroll'
import './cell-geometry'
import './path-tap'
import './url-tap'
import './osc-link-tap'
import './surface-tap'
import './selection-range'
import './selection-overlay'
import { startTapDispatch, stopTapDispatch } from './tap-dispatch'
import { startWheelScroll } from './wheel-scroll'
import './mouse-click-drag'
import { startSelectionMenuButtons } from './selection-menu-buttons'
import { startSurfaceTouchGestures } from './surface-touch-gestures'

/**
 * Every module's start function, in module order: what the WebView's document runs once as its
 * script is parsed, run here once per mount.
 */
export function startPageDocumentModules() {
  startRuntimeConstants()
  startTerminalHandle()
  startSurfaceSwap()
  startTextScaling()
  startViewportTransform()
  startWebglRecovery()
  startHostNotify()
  startSelectionStateAndEviction()
  startModeMirroring()
  startTapDispatch()
  startWheelScroll()
  startSelectionMenuButtons()
  startSurfaceTouchGestures()
}

/**
 * The undo, in reverse. Only the three modules that reach past the host element need one: every
 * other listener is on the surface or the menu buttons, which the host replaces wholesale, and
 * every other start writes a scope field the next start overwrites.
 */
export function stopPageDocumentModules() {
  stopTapDispatch()
  stopHostNotify()
  stopWebglRecovery()
}

export { scope } from './document-scope'
export { handleMsg } from './host-message-router'
export { adjustRowsForViewport, applyFitScale, clampPan } from './fit-scale'
export { repositionOverlay } from './selection-overlay'
export { updateTransform } from './viewport-transform'
