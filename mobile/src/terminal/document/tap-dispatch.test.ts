import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_TAP_DISPATCH_JS } from '../terminal-webview-tap-dispatch-injected'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

const modulePath = fileURLToPath(new URL('./tap-dispatch.ts', import.meta.url))

describe('the tap-dispatch module', () => {
  it('emits the script the document carries, modulo the five normalisations', async () => {
    const emitted = await emitTerminalDocumentModule(modulePath)
    expect(compareTerminalDocumentScripts(TERMINAL_TAP_DISPATCH_JS, emitted, 'scope')).toEqual({
      equivalent: true,
      normalisations: {
        // The heaviest reader of shared state so far: the selection, its elements, its thresholds
        // and both press origins are all declared by the overlay slice, which is still document text.
        qualifiedReferences: 49,
        scopeFieldDeclarations: 0,
        rebindings: 15,
        bracedBodies: 11,
        unboundCatches: 0,
        numberProperties: 0,
        shorthandProperties: 0,
        unshadowedNames: 0
      }
    })
  })
})
