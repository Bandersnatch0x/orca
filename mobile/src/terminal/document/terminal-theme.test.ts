import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_WEBVIEW_THEME_JS } from '../terminal-webview-theme-injected'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

const modulePath = fileURLToPath(new URL('./terminal-theme.ts', import.meta.url))

describe('the terminal-theme module', () => {
  it('emits the script the document carries, modulo the five normalisations', async () => {
    const emitted = await emitTerminalDocumentModule(modulePath)
    expect(compareTerminalDocumentScripts(TERMINAL_WEBVIEW_THEME_JS, emitted, 'scope')).toEqual({
      equivalent: true,
      normalisations: {
        // The built-in theme three times, the live theme three, the terminal three, the floor twice
        // and the raw payload once: all five are declared by slices that are still document text.
        qualifiedReferences: 12,
        scopeFieldDeclarations: 0,
        rebindings: 28,
        bracedBodies: 13,
        unboundCatches: 0,
        // Every `parseInt`, `parseFloat` and `isFinite` here is applied to a value already proved
        // numeric, or to a string the two forms agree on.
        numberProperties: 9,
        shorthandProperties: 0
      }
    })
  })
})
