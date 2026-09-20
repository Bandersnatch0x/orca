import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  TERMINAL_DOCUMENT_HOST_SEAMS_MODULE,
  TERMINAL_DOCUMENT_MODULE_ORDER,
  TERMINAL_DOCUMENT_SCOPE_MODULE
} from '../../../scripts/terminal-document-module-order.mjs'

/**
 * Every module in this directory is in the document, and everything in the order list is here.
 *
 * The generator emits exactly what the order list names, so a module added here and forgotten
 * there is dead code that reads as live, and a name left in the list after its file goes makes the
 * generator throw at build time rather than at review time. Both directions are asserted.
 *
 * Four files are deliberately not emitted into the document, each for its own reason, and they
 * are named rather than filtered by a pattern so a fifth cannot join them by looking similar.
 */
const NOT_EMITTED = [
  // Its exports are substituted into the modules that import them as literals, so the document
  // carries its values without carrying the module.
  'document-constants',
  // Types only. esbuild emits nothing for it, and an empty emission would add a blank line to the
  // document rather than a program.
  'document-terminal-shape',
  // The page's entry, not the WebView's: it imports the modules below in the order the generator
  // emits them, because on the page nothing splices them into one scope.
  // `page-document-module-order.test.ts` holds its list against this one.
  'page-document-modules'
]

function documentModuleNames(): string[] {
  return readdirSync(new URL('.', import.meta.url))
    .filter((entry) => entry.endsWith('.ts'))
    .filter((entry) => !entry.endsWith('.test.ts') && !entry.endsWith('.test-support.ts'))
    .map((entry) => entry.slice(0, -'.ts'.length))
    .sort()
}

describe('the document module order', () => {
  it('names every module the directory holds, and only those', () => {
    const expected = [
      ...NOT_EMITTED,
      TERMINAL_DOCUMENT_HOST_SEAMS_MODULE,
      TERMINAL_DOCUMENT_SCOPE_MODULE,
      ...TERMINAL_DOCUMENT_MODULE_ORDER
    ].sort()
    expect(documentModuleNames()).toEqual(expected)
  })

  it('names each module once, so the generator cannot emit one twice', () => {
    const listed = [
      TERMINAL_DOCUMENT_HOST_SEAMS_MODULE,
      TERMINAL_DOCUMENT_SCOPE_MODULE,
      ...TERMINAL_DOCUMENT_MODULE_ORDER
    ]
    expect(listed).toHaveLength(new Set(listed).size)
  })

  it('emits the host seams ahead of the scope, whose defaults are those four functions', () => {
    // Order, not just membership: `createTerminalDocumentScope()` runs as the script is parsed and
    // reads the four by name, so a seams module emitted after it would throw on the first line of
    // the document. The generator's own list is asserted in its test; this is the reason.
    expect(TERMINAL_DOCUMENT_MODULE_ORDER).not.toContain(TERMINAL_DOCUMENT_HOST_SEAMS_MODULE)
    expect(TERMINAL_DOCUMENT_HOST_SEAMS_MODULE).not.toBe(TERMINAL_DOCUMENT_SCOPE_MODULE)
  })
})
