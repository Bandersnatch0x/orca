import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_WHEEL_SCROLL_JS } from '../terminal-webview-wheel-scroll-injected'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

const modulePath = fileURLToPath(new URL('./wheel-scroll.ts', import.meta.url))

describe('the wheel-scroll module', () => {
  it('emits the script the document carries, modulo the four normalisations', async () => {
    const emitted = await emitTerminalDocumentModule(modulePath)
    expect(compareTerminalDocumentScripts(TERMINAL_WHEEL_SCROLL_JS, emitted, 'scope')).toEqual({
      equivalent: true,
      normalisations: {
        // The terminal once, and the wheel accumulator four times after its declaration.
        qualifiedReferences: 5,
        // The accumulator is declared here but a touch scroll in another slice resets it, so its
        // declaration moves onto the scope rather than staying a local.
        scopeFieldDeclarations: 1,
        rebindings: 4,
        bracedBodies: 8,
        unboundCatches: 0,
        // The one `isFinite`, behind a `typeof delta !== 'number'` check that makes the two forms
        // the same test.
        numberProperties: 1,
        shorthandProperties: 0
      }
    })
  })
})
