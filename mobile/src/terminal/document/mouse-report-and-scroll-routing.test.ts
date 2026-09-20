import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_HTML_MOUSE_REPORT_AND_SCROLL_ROUTING } from '../terminal-webview-html/mouse-report-and-scroll-routing'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

/** The slice wraps the already-extracted mouse-report-cell group between its two halves. */
const modulePaths = [
  './viewport-cell.ts',
  './mouse-report-cell.ts',
  './mouse-input-encoding.ts'
].map((relative) => fileURLToPath(new URL(relative, import.meta.url)))

describe('the mouse-report and scroll-routing slice', () => {
  it('emits the script the document carries, modulo the six normalisations', async () => {
    const emitted = (await Promise.all(modulePaths.map(emitTerminalDocumentModule))).join('\n')
    expect(
      compareTerminalDocumentScripts(
        TERMINAL_HTML_MOUSE_REPORT_AND_SCROLL_ROUTING,
        emitted,
        'scope'
      )
    ).toEqual({
      equivalent: true,
      normalisations: {
        qualifiedReferences: 49,
        scopeFieldDeclarations: 0,
        rebindings: 49,
        bracedBodies: 42,
        // Three reads of xterm's mode state, each of which may not exist.
        unboundCatches: 3,
        numberProperties: 0,
        shorthandProperties: 0
      }
    })
  })
})
