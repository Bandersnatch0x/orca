import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_KEYBOARD_AVOIDANCE_METRICS_JS } from '../terminal-keyboard-avoidance-metrics-injected'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

const modulePath = fileURLToPath(new URL('./keyboard-avoidance-metrics.ts', import.meta.url))

describe('the keyboard-avoidance metrics module', () => {
  it('emits the script the document carries, modulo the four normalisations', async () => {
    const emitted = await emitTerminalDocumentModule(modulePath)
    expect(
      compareTerminalDocumentScripts(TERMINAL_KEYBOARD_AVOIDANCE_METRICS_JS, emitted, 'scope')
    ).toEqual({
      equivalent: true,
      normalisations: {
        // Every read of the terminal. The one in `lineHasVisibleContent` carries a non-null
        // assertion, which TypeScript erases, so it is a qualifier site like the rest.
        qualifiedReferences: 14,
        scopeFieldDeclarations: 0,
        rebindings: 9,
        bracedBodies: 10,
        // The row scan and the alternate-screen probe.
        unboundCatches: 2,
        numberProperties: 0,
        shorthandProperties: 0
      }
    })
  })
})
