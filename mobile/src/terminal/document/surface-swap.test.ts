import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_SURFACE_SWAP_JS } from '../terminal-webview-surface-swap-injected'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

const modulePath = fileURLToPath(new URL('./surface-swap.ts', import.meta.url))

describe('the surface-swap module', () => {
  it('emits the script the document carries, modulo the five normalisations', async () => {
    const emitted = await emitTerminalDocumentModule(modulePath)
    expect(compareTerminalDocumentScripts(TERMINAL_SURFACE_SWAP_JS, emitted, 'scope')).toEqual({
      equivalent: true,
      normalisations: {
        // The mounted surface three times, and the uncommitted terminal four times after its
        // declaration.
        qualifiedReferences: 7,
        // Another slice reads the uncommitted terminal while it is still document text, so its
        // declaration moves onto the scope; the other three stay locals.
        scopeFieldDeclarations: 1,
        rebindings: 4,
        bracedBodies: 2,
        unboundCatches: 2,
        numberProperties: 0,
        shorthandProperties: 0
      }
    })
  })
})
