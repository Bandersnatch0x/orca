/**
 * The document's modules, reached in the order the document runs them.
 *
 * The document is one function scope, not a dependency graph: `runtime-constants` takes the
 * surface and nothing imports it, `surface-swap` captures the surface it was handed, and
 * `selection-state-and-eviction` takes the overlay elements — all as they are parsed. Inside the
 * WebView the generator splices them in this order; on the page this file is the order, and it is
 * reached by one dynamic import so the host has already planted the markup they read.
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
import './runtime-constants'
import './terminal-handle'
import './query-reply'
import './surface-swap'
import './text-scaling'
import './viewport-transform'
import './terminal-theme'
import './fit-scale'
import './mouse-mode-decset-scan'
import './write-queue'
import './webgl-recovery'
import './terminal-init'
import './reflow'
import './host-notify'
import './host-message-router'
import './selection-state-and-eviction'
import './mode-mirroring'
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
import './tap-dispatch'
import './wheel-scroll'
import './mouse-click-drag'
import './selection-menu-buttons'
import './surface-touch-gestures'

export { scope } from './document-scope'
export { handleMsg } from './host-message-router'
export { adjustRowsForViewport, applyFitScale, clampPan } from './fit-scale'
export { repositionOverlay } from './selection-overlay'
export { updateTransform } from './viewport-transform'
