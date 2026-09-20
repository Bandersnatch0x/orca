import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_HTML_SMOOTH_SCROLL_AND_CELL_GEOMETRY } from '../terminal-webview-html/smooth-scroll-and-cell-geometry'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

/** The slice carries two concerns in order, so it becomes two modules joined in that order. */
const modulePaths = ['./normal-buffer-smooth-scroll.ts', './cell-geometry.ts'].map((relative) =>
  fileURLToPath(new URL(relative, import.meta.url))
)

describe('the smooth-scroll and cell-geometry slice', () => {
  it('emits the script the document carries, modulo the six normalisations', async () => {
    const emitted = (await Promise.all(modulePaths.map(emitTerminalDocumentModule))).join('\n')
    expect(
      compareTerminalDocumentScripts(
        TERMINAL_HTML_SMOOTH_SCROLL_AND_CELL_GEOMETRY,
        emitted,
        'scope'
      )
    ).toEqual({
      equivalent: true,
      normalisations: {
        // The terminal throughout, the three smooth-scroll fields and both pan offsets.
        qualifiedReferences: 39,
        scopeFieldDeclarations: 0,
        rebindings: 15,
        bracedBodies: 16,
        unboundCatches: 0,
        numberProperties: 0,
        shorthandProperties: 0
      }
    })
  })
})
