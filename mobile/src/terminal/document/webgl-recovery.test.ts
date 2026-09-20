import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_WEBGL_RECOVERY_JS } from '../terminal-webview-webgl-recovery-injected'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

const modulePath = fileURLToPath(new URL('./webgl-recovery.ts', import.meta.url))

describe('the WebGL recovery module', () => {
  it('emits the script the document carries, modulo the four normalisations', async () => {
    const emitted = await emitTerminalDocumentModule(modulePath)
    expect(compareTerminalDocumentScripts(TERMINAL_WEBGL_RECOVERY_JS, emitted, 'scope')).toEqual({
      equivalent: true,
      normalisations: {
        qualifiedReferences: 23,
        scopeFieldDeclarations: 0,
        rebindings: 3,
        bracedBodies: 12,
        // Five of the six catch clauses; the attach failure reads its error and keeps its binding.
        unboundCatches: 5,
        numberProperties: 0,
        shorthandProperties: 0,
        unshadowedNames: 0
      }
    })
  })
})
