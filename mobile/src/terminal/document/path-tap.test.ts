import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_PATH_TAP_JS } from '../terminal-path-tap-injected'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

const modulePath = fileURLToPath(new URL('./path-tap.ts', import.meta.url))

describe('the path-tap module', () => {
  it('emits the script the document carries, modulo the five normalisations', async () => {
    const emitted = await emitTerminalDocumentModule(modulePath)
    expect(compareTerminalDocumentScripts(TERMINAL_PATH_TAP_JS, emitted, 'scope')).toEqual({
      equivalent: true,
      normalisations: {
        // Path detection is a pure query: it reads no shared state at all.
        qualifiedReferences: 0,
        scopeFieldDeclarations: 0,
        // Two of the document's `var`s stay `var`: they are one binding declared twice.
        rebindings: 31,
        bracedBodies: 20,
        unboundCatches: 0,
        // Both `parseInt` calls take a digit run a capture group already matched.
        numberProperties: 2,
        shorthandProperties: 0,
        unshadowedNames: 0
      }
    })
  })
})
