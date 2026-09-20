import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_HTML_MOUSE_MODE_DECSET_SCAN } from '../terminal-webview-html/mouse-mode-decset-scan'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

const modulePath = fileURLToPath(new URL('./mouse-mode-decset-scan.ts', import.meta.url))

describe('the mouse-mode DECSET scan module', () => {
  it('emits the script the document carries, modulo the five normalisations', async () => {
    const emitted = await emitTerminalDocumentModule(modulePath)
    expect(
      compareTerminalDocumentScripts(TERMINAL_HTML_MOUSE_MODE_DECSET_SCAN, emitted, 'scope')
    ).toEqual({
      equivalent: true,
      normalisations: {
        // Both control-sequence introducers, the straddling scan tail and all three mode fields.
        qualifiedReferences: 20,
        scopeFieldDeclarations: 0,
        rebindings: 10,
        bracedBodies: 9,
        unboundCatches: 0,
        numberProperties: 0,
        shorthandProperties: 0
      }
    })
  })
})
