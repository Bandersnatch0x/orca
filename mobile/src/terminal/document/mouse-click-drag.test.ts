import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_MOUSE_CLICK_DRAG_JS } from '../terminal-webview-mouse-click-drag-injected'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

const modulePath = fileURLToPath(new URL('./mouse-click-drag.ts', import.meta.url))

describe('the mouse-click-drag module', () => {
  it('emits the script the document carries, modulo the five normalisations', async () => {
    const emitted = await emitTerminalDocumentModule(modulePath)
    expect(compareTerminalDocumentScripts(TERMINAL_MOUSE_CLICK_DRAG_JS, emitted, 'scope')).toEqual({
      equivalent: true,
      normalisations: {
        // The escape byte and both SGR modes from the runtime slice, the selection and its mode
        // from the overlay slice, the terminal, and the tap slop.
        qualifiedReferences: 17,
        // The gesture is declared here and never read outside, so it stays a module local.
        scopeFieldDeclarations: 0,
        rebindings: 22,
        bracedBodies: 27,
        // The pointer-capture call, which throws when capture is unavailable.
        unboundCatches: 1,
        numberProperties: 0,
        shorthandProperties: 0,
        unshadowedNames: 0
      }
    })
  })
})
