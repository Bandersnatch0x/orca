import { describe, expect, it } from 'vitest'
import { XTERM_ENGINE_JS } from '../terminal-webview-engine.generated'
import { XTERM_HTML } from '../terminal-webview-html'
import {
  compareTerminalDocumentScripts,
  readTerminalDocumentScript
} from './terminal-document-equivalence.test-support'

/**
 * The instrument the C7.1 flip commit is reviewed with, exercised on what it will be asked.
 *
 * Each case below is one way the move could go wrong. The refusals matter more than the
 * acceptances: a comparison that accepted a reordered statement or a changed literal would pass
 * the flip while the document had silently become a different program.
 */
const QUALIFIER = 'scope'
const script = readTerminalDocumentScript(XTERM_HTML, XTERM_ENGINE_JS)

describe('terminal document script equivalence', () => {
  it('reads the hand-written script out of the real document', () => {
    expect(script.trimStart().startsWith('(function() {')).toBe(true)
    expect(script.trimEnd().endsWith('})();')).toBe(true)
  })

  it('accepts the real script against itself, with nothing qualified', () => {
    // The instrument on the real 2,758-line program rather than on a toy, which is the only way
    // to know it survives everything the document actually contains.
    expect(compareTerminalDocumentScripts(script, script, QUALIFIER)).toEqual({
      equivalent: true,
      qualifiedSites: 0
    })
  })

  it('ignores the semicolons the formatter drops', () => {
    // The reason this is a token comparison at all: `oxfmt` writes the repository style, so the
    // generated script cannot carry the hand-written one's semicolons.
    const before = 'var a = 1;\nfunction f() {\n  a = 2;\n}\n'
    const after = 'var a = 1\nfunction f() {\n  a = 2\n}\n'
    expect(compareTerminalDocumentScripts(before, after, QUALIFIER)).toEqual({
      equivalent: true,
      qualifiedSites: 0
    })
  })

  it('ignores comments, which are not the program', () => {
    const before = '// one\nvar a = 1;\n'
    const after = '/* another thing entirely */\nvar a = 1\n'
    expect(compareTerminalDocumentScripts(before, after, QUALIFIER)).toEqual({
      equivalent: true,
      qualifiedSites: 0
    })
  })

  it('counts every site the qualifier was applied to', () => {
    const before = 'function f() {\n  a = a + 1;\n  return b;\n}\n'
    const after = 'function f() {\n  scope.a = scope.a + 1\n  return scope.b\n}\n'
    expect(compareTerminalDocumentScripts(before, after, QUALIFIER)).toEqual({
      equivalent: true,
      qualifiedSites: 3
    })
  })

  it('refuses a qualifier that is not the one it was told to expect', () => {
    // Without this a rename of the scope object would read as an ordinary qualification.
    const result = compareTerminalDocumentScripts('a = 1;', 'state.a = 1', QUALIFIER)
    expect(result.equivalent).toBe(false)
  })

  it('refuses a changed literal', () => {
    const result = compareTerminalDocumentScripts('var a = 1;', 'var a = 2', QUALIFIER)
    expect(result).toEqual({
      equivalent: false,
      reason: 'token 3: expected num 1, generated num 2'
    })
  })

  it('refuses a dropped operator', () => {
    const result = compareTerminalDocumentScripts('if (!a) return;', 'if (a) return', QUALIFIER)
    expect(result.equivalent).toBe(false)
  })

  it('refuses a reordered pair of statements', () => {
    const result = compareTerminalDocumentScripts('a();\nb();', 'b()\na()', QUALIFIER)
    expect(result.equivalent).toBe(false)
  })

  it('refuses a dropped statement', () => {
    const result = compareTerminalDocumentScripts('a();\nb();', 'a()', QUALIFIER)
    expect(result).toEqual({
      equivalent: false,
      reason: 'length: 3 token(s) left in the baseline, 0 in the generated script'
    })
  })

  it('refuses an added statement', () => {
    const result = compareTerminalDocumentScripts('a();', 'a()\nb()', QUALIFIER)
    expect(result.equivalent).toBe(false)
  })

  it('refuses a renamed local', () => {
    const result = compareTerminalDocumentScripts(
      'function f(x) { return x; }',
      'function f(y) { return y }',
      QUALIFIER
    )
    expect(result.equivalent).toBe(false)
  })
})
