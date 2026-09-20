import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emitTerminalDocumentModule } from '../../../scripts/build-terminal-document-script.mjs'
import { TERMINAL_QUERY_REPLY_JS } from '../terminal-webview-query-reply-injected'
import { TERMINAL_SURFACE_SWAP_JS } from '../terminal-webview-surface-swap-injected'
import { TERMINAL_HTML_RUNTIME_STATE_AND_TEXT_SCALING } from '../terminal-webview-html/runtime-state-and-text-scaling'
import { compareTerminalDocumentScripts } from './terminal-document-equivalence.test-support'

/**
 * This slice wraps two already-extracted groups, and the declaration it opens with is shadowed by
 * a parameter inside one of them. Printed as one program the shadow has to be renamed, so the two
 * halves are compared against their own text: the slice split on the groups it interpolates, which
 * have their own tests either side of this one.
 */
function sliceOn(text: string, marker: string): [string, string] {
  const at = text.indexOf(marker)
  expect(at).toBeGreaterThan(-1)
  return [text.slice(0, at), text.slice(at + marker.length)]
}

const emit = (relative: string) =>
  emitTerminalDocumentModule(fileURLToPath(new URL(relative, import.meta.url)))

describe('the runtime-state and text-scaling slice', () => {
  it('emits the declaration it opens with', async () => {
    const [head] = sliceOn(TERMINAL_HTML_RUNTIME_STATE_AND_TEXT_SCALING, TERMINAL_QUERY_REPLY_JS)
    expect(compareTerminalDocumentScripts(head, await emit('./terminal-handle.ts'), 'scope'))
      .toEqual({
        equivalent: true,
        normalisations: {
          qualifiedReferences: 0,
          scopeFieldDeclarations: 2,
          rebindings: 0,
          bracedBodies: 0,
          unboundCatches: 0,
          numberProperties: 0,
          shorthandProperties: 0
        }
      })
  })

  it('emits everything after the groups it interpolates', async () => {
    const [, rest] = sliceOn(TERMINAL_HTML_RUNTIME_STATE_AND_TEXT_SCALING, TERMINAL_QUERY_REPLY_JS)
    const [between, tail] = sliceOn(rest, TERMINAL_SURFACE_SWAP_JS)
    expect(between.trim()).toBe('')
    const emitted = [await emit('./text-scaling.ts'), await emit('./viewport-transform.ts')]
      .join('\n')
    expect(compareTerminalDocumentScripts(tail, emitted, 'scope')).toEqual({
      equivalent: true,
      normalisations: {
        qualifiedReferences: 31,
        // Where the document declares almost everything it shares.
        scopeFieldDeclarations: 38,
        rebindings: 25,
        bracedBodies: 13,
        unboundCatches: 1,
        numberProperties: 0,
        shorthandProperties: 0
      }
    })
  })
})
