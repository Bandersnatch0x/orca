import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_HTML_OBSERVERS_AND_MODE_MIRRORING } from '../terminal-webview-html/term-observers-and-mode-mirroring'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

/**
 * This slice interpolates the keyboard-avoidance group between its own two halves, so its text is
 * three emissions joined in that order — the already-extracted group in the middle.
 */
const modulePaths = [
  './mode-mirroring.ts',
  './keyboard-avoidance-metrics.ts',
  './term-observers.ts'
].map((relative) => fileURLToPath(new URL(relative, import.meta.url)))

describe('the term-observers slice', () => {
  it('emits the script the document carries, modulo the five normalisations', async () => {
    const emitted = (await Promise.all(modulePaths.map(emitTerminalDocumentModule))).join('\n')
    expect(
      compareTerminalDocumentScripts(TERMINAL_HTML_OBSERVERS_AND_MODE_MIRRORING, emitted, 'scope')
    ).toEqual({
      equivalent: true,
      normalisations: {
        qualifiedReferences: 36,
        // The published mode set, declared here and read by the host-message router.
        scopeFieldDeclarations: 1,
        rebindings: 12,
        bracedBodies: 12,
        unboundCatches: 6,
        numberProperties: 0,
        // The two SGR mode flags, written twice each: the document's shorthand cannot survive a
        // qualified value.
        shorthandProperties: 4,
        unshadowedNames: 0
      }
    })
  })
})
