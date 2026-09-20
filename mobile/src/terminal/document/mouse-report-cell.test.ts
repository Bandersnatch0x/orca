import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_MOUSE_REPORT_CELL_JS } from '../terminal-webview-mouse-report-cell-injected'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

/**
 * The module is the same program the document has been carrying as a string.
 *
 * One of these per extracted group, each pinning its own normalisation counts, so the flip commit
 * inherits a claim that was already true group by group instead of proving everything at once.
 */
const modulePath = fileURLToPath(new URL('./mouse-report-cell.ts', import.meta.url))

describe('the mouse-report cell module', () => {
  it('emits the script the document carries, modulo the four normalisations', async () => {
    const emitted = await emitTerminalDocumentModule(modulePath)
    expect(compareTerminalDocumentScripts(TERMINAL_MOUSE_REPORT_CELL_JS, emitted, 'scope')).toEqual(
      {
        equivalent: true,
        normalisations: {
          // `term` seven times, `panX` and `panY` once each.
          qualifiedReferences: 9,
          // Nothing this group declares is written from elsewhere, so no declaration moved.
          scopeFieldDeclarations: 0,
          // Nine locals, every one of them a `const` or a `let` now.
          rebindings: 9,
          // Thirteen one-statement `if` bodies the linter braces.
          bracedBodies: 13,
          unboundCatches: 0,
          numberProperties: 0,
          shorthandProperties: 0
        }
      }
    )
  })
})
