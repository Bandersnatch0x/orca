import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_HTML_HOST_MESSAGE_ROUTER } from '../terminal-webview-html/host-message-router'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

/** The slice opens with the already-extracted reflow group. */
const modulePaths = ['./reflow.ts', './host-notify.ts', './host-message-router.ts'].map(
  (relative) => fileURLToPath(new URL(relative, import.meta.url))
)

describe('the host-message-router slice', () => {
  it('emits the script the document carries, modulo the six normalisations', async () => {
    const emitted = (await Promise.all(modulePaths.map(emitTerminalDocumentModule))).join('\n')
    expect(
      compareTerminalDocumentScripts(TERMINAL_HTML_HOST_MESSAGE_ROUTER, emitted, 'scope')
    ).toEqual({
      equivalent: true,
      normalisations: {
        qualifiedReferences: 48,
        scopeFieldDeclarations: 0,
        rebindings: 20,
        bracedBodies: 12,
        unboundCatches: 2,
        numberProperties: 0,
        shorthandProperties: 0
      }
    })
  })
})
