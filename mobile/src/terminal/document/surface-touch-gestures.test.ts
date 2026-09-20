import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_HTML_SURFACE_TOUCH_GESTURES } from '../terminal-webview-html/surface-touch-gestures'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

/** The slice opens with three already-extracted groups and ends with its own two modules. */
const modulePaths = [
  './tap-dispatch.ts',
  './wheel-scroll.ts',
  './mouse-click-drag.ts',
  './selection-menu-buttons.ts',
  './surface-touch-gestures.ts'
].map((relative) => fileURLToPath(new URL(relative, import.meta.url)))

describe('the surface-touch-gestures slice', () => {
  it('emits the script the document carries, modulo the six normalisations', async () => {
    const emitted = (await Promise.all(modulePaths.map(emitTerminalDocumentModule))).join('\n')
    expect(
      compareTerminalDocumentScripts(TERMINAL_HTML_SURFACE_TOUCH_GESTURES, emitted, 'scope')
    ).toEqual({
      equivalent: true,
      normalisations: {
        qualifiedReferences: 104,
        scopeFieldDeclarations: 1,
        rebindings: 69,
        bracedBodies: 57,
        unboundCatches: 2,
        numberProperties: 2,
        shorthandProperties: 0
      }
    })
  })
})
