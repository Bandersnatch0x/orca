import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_HTML_MESSAGE_BRIDGE } from '../terminal-webview-html/message-bridge-and-document-close'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

const modulePath = fileURLToPath(new URL('./message-bridge.ts', import.meta.url))

describe('the message-bridge module', () => {
  it('emits the script the document carries, modulo the five normalisations', async () => {
    const emitted = await emitTerminalDocumentModule(modulePath)
    expect(compareTerminalDocumentScripts(TERMINAL_HTML_MESSAGE_BRIDGE, emitted, 'scope')).toEqual({
      equivalent: true,
      normalisations: {
        // Only the ready flag, read to decide whether a failed init is fatal.
        qualifiedReferences: 1,
        scopeFieldDeclarations: 0,
        rebindings: 1,
        bracedBodies: 0,
        // The parse guard. The second catch names its error and reports it, so it keeps its binding.
        unboundCatches: 1,
        numberProperties: 0
      }
    })
  })
})
