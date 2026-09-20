import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_HTML_FIT_SCALE } from '../terminal-webview-html/terminal-fit-scale'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

/** The slice opens with the already-extracted theme group, so its text is two emissions joined. */
const modulePaths = ['./terminal-theme.ts', './fit-scale.ts'].map((relative) =>
  fileURLToPath(new URL(relative, import.meta.url))
)

describe('the terminal fit-scale slice', () => {
  it('emits the script the document carries, modulo the six normalisations', async () => {
    const emitted = (await Promise.all(modulePaths.map(emitTerminalDocumentModule))).join('\n')
    expect(compareTerminalDocumentScripts(TERMINAL_HTML_FIT_SCALE, emitted, 'scope')).toEqual({
      equivalent: true,
      normalisations: {
        qualifiedReferences: 47,
        scopeFieldDeclarations: 0,
        rebindings: 47,
        bracedBodies: 20,
        unboundCatches: 0,
        numberProperties: 9,
        shorthandProperties: 0
      }
    })
  })
})
