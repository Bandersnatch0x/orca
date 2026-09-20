import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_HTML_SELECTION_OVERLAY } from '../terminal-webview-html/selection-overlay'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

/** The slice opens with the already-extracted path-tap and url-tap groups. */
const modulePaths = [
  './path-tap.ts',
  './url-tap.ts',
  './osc-link-tap.ts',
  './surface-tap.ts',
  './selection-range.ts',
  './selection-overlay.ts'
].map((relative) => fileURLToPath(new URL(relative, import.meta.url)))

describe('the selection-overlay slice', () => {
  it('emits the script the document carries, modulo the six normalisations', async () => {
    const emitted = (await Promise.all(modulePaths.map(emitTerminalDocumentModule))).join('\n')
    expect(
      compareTerminalDocumentScripts(TERMINAL_HTML_SELECTION_OVERLAY, emitted, 'scope')
    ).toEqual({
      equivalent: true,
      normalisations: {
        qualifiedReferences: 77,
        scopeFieldDeclarations: 0,
        rebindings: 96,
        bracedBodies: 63,
        unboundCatches: 9,
        numberProperties: 6,
        shorthandProperties: 0
      }
    })
  })
})
