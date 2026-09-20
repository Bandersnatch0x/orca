import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_HTML_SELECTION_STATE_AND_EVICTION } from '../terminal-webview-html/selection-state-and-eviction'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

const modulePath = fileURLToPath(new URL('./selection-state-and-eviction.ts', import.meta.url))

describe('the selection-state-and-eviction module', () => {
  it('emits the script the document carries, modulo the six normalisations', async () => {
    const emitted = await emitTerminalDocumentModule(modulePath)
    expect(
      compareTerminalDocumentScripts(TERMINAL_HTML_SELECTION_STATE_AND_EVICTION, emitted, 'scope')
    ).toEqual({
      equivalent: true,
      normalisations: {
        qualifiedReferences: 12,
        // This slice is where most of the shared selection state is declared: every threshold,
        // every overlay element and the selection itself.
        scopeFieldDeclarations: 22,
        // The eviction counter is declared and assigned only here, so it stays a module local.
        rebindings: 2,
        bracedBodies: 3,
        unboundCatches: 0,
        numberProperties: 0,
        shorthandProperties: 0,
        unshadowedNames: 0
      }
    })
  })
})
