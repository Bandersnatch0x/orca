import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_REFLOW_JS } from '../terminal-webview-reflow-injected'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

const modulePath = fileURLToPath(new URL('./reflow.ts', import.meta.url))

describe('the reflow module', () => {
  it('emits the script the document carries, modulo the four normalisations', async () => {
    const emitted = await emitTerminalDocumentModule(modulePath)
    expect(compareTerminalDocumentScripts(TERMINAL_REFLOW_JS, emitted, 'scope')).toEqual({
      equivalent: true,
      normalisations: {
        // `term` ten times and `initRows` once. `initRows` is written from three groups, so unlike
        // the query-reply flag it is the document's state and not this module's.
        qualifiedReferences: 11,
        scopeFieldDeclarations: 0,
        // Six locals, none of them reassigned.
        rebindings: 6,
        // The two early returns. The bottom-anchoring branch already had its braces.
        bracedBodies: 2,
        unboundCatches: 0,
        numberProperties: 0
      }
    })
  })
})
