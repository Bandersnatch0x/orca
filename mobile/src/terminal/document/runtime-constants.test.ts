import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_HTML_RUNTIME_CONSTANTS } from '../terminal-webview-html/runtime-constants'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

const modulePath = fileURLToPath(new URL('./runtime-constants.ts', import.meta.url))

describe('the runtime-constants module', () => {
  it('emits the script the document carries, modulo the six normalisations', async () => {
    const emitted = await emitTerminalDocumentModule(modulePath)
    expect(
      compareTerminalDocumentScripts(TERMINAL_HTML_RUNTIME_CONSTANTS, emitted, 'scope')
    ).toEqual({
      equivalent: true,
      normalisations: {
        // The status dot and both selectors, read back to build the pattern.
        qualifiedReferences: 3,
        scopeFieldDeclarations: 8,
        rebindings: 0,
        bracedBodies: 0,
        unboundCatches: 0,
        numberProperties: 0,
        shorthandProperties: 0
      }
    })
  })
})
