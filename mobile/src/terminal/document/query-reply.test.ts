import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_QUERY_REPLY_JS } from '../terminal-webview-query-reply-injected'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

const modulePath = fileURLToPath(new URL('./query-reply.ts', import.meta.url))

describe('the query-reply module', () => {
  it('emits the script the document carries, modulo the four normalisations', async () => {
    const emitted = await emitTerminalDocumentModule(modulePath)
    expect(compareTerminalDocumentScripts(TERMINAL_QUERY_REPLY_JS, emitted, 'scope')).toEqual({
      equivalent: true,
      normalisations: {
        // `terminalGeneration` and `termObserverDisposables` once each. The reply flag is not
        // among them: every one of its four writes is in this module, so it stays a local.
        qualifiedReferences: 2,
        scopeFieldDeclarations: 0,
        // That flag's own declaration, `var` to `let`.
        rebindings: 1,
        // The two one-statement `if` bodies.
        bracedBodies: 2,
        // Both `catch (e) {}` clauses, whose binding was never read.
        unboundCatches: 2,
        numberProperties: 0
      }
    })
  })
})
