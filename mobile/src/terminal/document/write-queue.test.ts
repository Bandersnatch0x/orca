import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_HTML_WRITE_QUEUE } from '../terminal-webview-html/write-queue'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

const modulePath = fileURLToPath(new URL('./write-queue.ts', import.meta.url))

describe('the write-queue module', () => {
  it('emits the script the document carries, modulo the six normalisations', async () => {
    const emitted = await emitTerminalDocumentModule(modulePath)
    expect(compareTerminalDocumentScripts(TERMINAL_HTML_WRITE_QUEUE, emitted, 'scope')).toEqual({
      equivalent: true,
      normalisations: {
        // The queue and its head throughout, plus the status-dot constants, the drain flags and
        // the generation the pump is running for.
        qualifiedReferences: 50,
        scopeFieldDeclarations: 0,
        rebindings: 11,
        bracedBodies: 10,
        // Disposing an observer that is already gone.
        unboundCatches: 1,
        numberProperties: 0,
        shorthandProperties: 0
      }
    })
  })
})
