import { tokenizer } from 'acorn'

/**
 * Whether two versions of the in-WebView document script are the same program, allowing only the
 * scope qualifier that moving it into modules requires.
 *
 * C7.1 turns the document's one 2,758-line IIFE into modules the web page can import. The 57
 * variables the script reassigns cannot stay free variables across ES modules — assigning an
 * imported binding is a syntax error — so they become fields of one scope object, and every read
 * and write of them gains a qualifier. Nothing else about the program may change.
 *
 * Byte comparison cannot make that claim once the source is formatter-owned: `oxfmt` writes the
 * repository's style, which drops the semicolons the hand-written document carries, so the emitted
 * text necessarily differs on almost every line for reasons that are not the refactor. Tokens are
 * the level where the claim is exactly true. Semicolons are excluded for the same reason they moved
 * — they are the formatter's, not the program's — and comments never reach the stream.
 *
 * This is deliberately stricter than "it still runs": a reordered statement, a changed literal, a
 * dropped `!`, a renamed local, all diverge here and are reported with the token index and both
 * sides, so the flip commit is reviewed by running this rather than by reading a 515-line diff.
 */
export type TerminalDocumentEquivalence =
  | { readonly equivalent: true; readonly qualifiedSites: number }
  | { readonly equivalent: false; readonly reason: string }

/** One token as this comparison reads it: what kind it is, and the text it carried. */
type DocumentToken = { readonly label: string; readonly text: string }

/**
 * Acorn's `Token` class declares `type`, `start` and `end` and not `value`, which it does carry,
 * so the field is read through a narrowing check rather than asserted onto the declared type.
 */
function readDocumentToken(token: unknown): DocumentToken | null {
  if (typeof token !== 'object' || token === null || !('type' in token) || !('value' in token)) {
    return null
  }
  const type: unknown = token.type
  if (typeof type !== 'object' || type === null || !('label' in type)) {
    return null
  }
  const label: unknown = type.label
  if (typeof label !== 'string') {
    return null
  }
  const value: unknown = token.value
  return { label, text: value === undefined || value === null ? '' : String(value) }
}

/** Semicolons are the formatter's; every other token is the program's. */
function significantTokens(source: string): DocumentToken[] {
  const kept: DocumentToken[] = []
  for (const raw of tokenizer(source, { ecmaVersion: 2020 })) {
    const token = readDocumentToken(raw)
    if (token === null) {
      throw new Error('acorn produced a token this comparison cannot read')
    }
    if (token.label === ';' || token.label === 'eof') {
      continue
    }
    kept.push(token)
  }
  return kept
}

function describeToken(token: DocumentToken | undefined): string {
  return token === undefined ? '(end of script)' : `${token.label} ${token.text}`.trim()
}

/**
 * `baseline` is the script as it stood before the move, `candidate` the one the modules generate.
 *
 * The qualifier is read from `qualifier`, not assumed, so the test names the object it expects and
 * a rename cannot quietly satisfy this.
 */
export function compareTerminalDocumentScripts(
  baseline: string,
  candidate: string,
  qualifier: string
): TerminalDocumentEquivalence {
  const before = significantTokens(baseline)
  const after = significantTokens(candidate)
  let qualifiedSites = 0
  let left = 0
  let right = 0
  while (left < before.length && right < after.length) {
    const expected = before[left]
    const actual = after[right]
    if (expected.label === actual.label && expected.text === actual.text) {
      left += 1
      right += 1
      continue
    }
    // The one allowed difference: `name` became `<qualifier>.name`, three tokens for one.
    const qualified =
      actual.label === 'name' &&
      actual.text === qualifier &&
      after[right + 1]?.label === '.' &&
      after[right + 2]?.label === expected.label &&
      after[right + 2]?.text === expected.text
    if (!qualified) {
      return {
        equivalent: false,
        reason: `token ${left}: expected ${describeToken(expected)}, generated ${describeToken(actual)}`
      }
    }
    qualifiedSites += 1
    left += 1
    right += 3
  }
  if (left !== before.length || right !== after.length) {
    return {
      equivalent: false,
      reason: `length: ${before.length - left} token(s) left in the baseline, ${after.length - right} in the generated script`
    }
  }
  return { equivalent: true, qualifiedSites }
}

/**
 * The hand-written script out of the whole document, which is the part C7.1 moves.
 *
 * Read by locating the generated engine rather than by an index into the text, so a slice added
 * above or below it does not silently shift what gets compared.
 */
export function readTerminalDocumentScript(document: string, engineJs: string): string {
  const opener = `<script>${engineJs}</script>`
  const start = document.indexOf(opener)
  if (start === -1) {
    throw new Error('the document does not carry the generated engine script')
  }
  const scriptStart = document.indexOf('<script>', start + opener.length)
  const scriptEnd = document.lastIndexOf('</script>')
  if (scriptStart === -1 || scriptEnd <= scriptStart) {
    throw new Error('the document does not carry a hand-written script after the engine')
  }
  return document.slice(scriptStart + '<script>'.length, scriptEnd)
}
