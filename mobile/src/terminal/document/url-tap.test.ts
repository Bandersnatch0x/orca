import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { URL_TAP_WEBVIEW_JS } from '../terminal-webview-url-tap'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

/**
 * The URL-tap group is three modules, not one: at 303 lines it was over the file cap, and the
 * document's own order interleaves the OSC 8 lookup with the file-URL parsing. The split follows
 * that order, so the group's text is the three emissions joined.
 */
const modulePaths = ['./url-tap.ts', './osc-link-tap.ts', './surface-tap.ts'].map((relative) =>
  fileURLToPath(new URL(relative, import.meta.url))
)

describe('the url-tap group', () => {
  it('emits the script the document carries, modulo the five normalisations', async () => {
    const emitted = (await Promise.all(modulePaths.map(emitTerminalDocumentModule))).join('\n')
    expect(compareTerminalDocumentScripts(URL_TAP_WEBVIEW_JS, emitted, 'scope')).toEqual({
      equivalent: true,
      normalisations: {
        // The terminal twice through its internals, and the captured OSC 8 links with their row
        // offset; the two patterns and the length bound are build-time constants, not state.
        qualifiedReferences: 10,
        scopeFieldDeclarations: 0,
        rebindings: 41,
        bracedBodies: 25,
        // Every read of xterm's internals, the two URL parses and the text capture.
        unboundCatches: 6,
        // All four take a digit run a capture group already matched.
        numberProperties: 4,
        shorthandProperties: 0,
        unshadowedNames: 0
      }
    })
  })
})
