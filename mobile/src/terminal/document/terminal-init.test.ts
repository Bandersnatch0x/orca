import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_HTML_INIT_AND_WRITE } from '../terminal-webview-html/terminal-init-and-write'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

/** The slice opens with the already-extracted webgl-recovery group. */
const modulePaths = ['./webgl-recovery.ts', './terminal-init.ts'].map((relative) =>
  fileURLToPath(new URL(relative, import.meta.url))
)

describe('the terminal init-and-write slice', () => {
  it('emits the script the document carries, modulo the six normalisations', async () => {
    const emitted = (await Promise.all(modulePaths.map(emitTerminalDocumentModule))).join('\n')
    expect(compareTerminalDocumentScripts(TERMINAL_HTML_INIT_AND_WRITE, emitted, 'scope')).toEqual({
      equivalent: true,
      normalisations: {
        // init() resets almost every field the document shares, so this is the densest
        // qualifier site in the script.
        qualifiedReferences: 83,
        scopeFieldDeclarations: 0,
        rebindings: 11,
        bracedBodies: 18,
        unboundCatches: 7,
        numberProperties: 0,
        shorthandProperties: 0,
        unshadowedNames: 0
      }
    })
  })
})
