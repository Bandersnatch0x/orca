import { tokenizer } from 'acorn'
import { transformSync } from 'esbuild'

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
/**
 * The differences moving the script into modules is allowed to make, each counted on its own.
 *
 * Four classes and no others. Three are the repository's own rules rewriting the document's ES5
 * style the moment its source is a linted module — measured, not assumed: `curly` braces 279
 * brace-less bodies, `no-unused-vars` unbinds 38 catch clauses, and 446 `var` declarators become
 * `const`, `let` or a scope field. The fourth is the move itself. Semicolons and whitespace are the
 * formatter's and never reach the token stream at all.
 *
 * Counted separately because the flip commit pins each number: a total would let one class absorb
 * another, which is exactly the drift the pin exists to catch.
 */
export type TerminalDocumentNormalisations = {
  /** `name` became `<qualifier>.name`; the declaration stayed where it was. */
  readonly qualifiedReferences: number
  /**
   * `var name` became `<qualifier>.name`; the declaration moved onto the scope object. A `var`
   * with several declarators counts once per declarator, because each becomes its own assignment.
   */
  readonly scopeFieldDeclarations: number
  /** `var` became `const` or `let`, the binding staying local to the emitted script. */
  readonly rebindings: number
  /** A brace-less `if`/`else`/`for`/`while` body gained its braces. */
  readonly bracedBodies: number
  /** `catch (e)` became `catch`, the unused binding dropped. */
  readonly unboundCatches: number
  /** A global numeric function became its `Number` property. */
  readonly numberProperties: number
  /** `{ name: name }` was shorthand; qualifying the value spells the property out again. */
  readonly shorthandProperties: number
}

/**
 * The globals `unicorn/prefer-number-properties` moves onto `Number`.
 *
 * Measured over the whole script: seventeen sites, and the rule is the only one of its kind that
 * appears often enough to be worth matching. Each is equivalent here because every call is already
 * behind a `typeof … === 'number'` check or is parsing a string, which is what the `Number` form
 * does with no coercion of its own.
 */
const NUMBER_GLOBALS = new Set(['isFinite', 'isNaN', 'parseInt', 'parseFloat'])

export type TerminalDocumentEquivalence =
  | { readonly equivalent: true; readonly normalisations: TerminalDocumentNormalisations }
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

/**
 * Both sides are printed by the generator's own printer before being read.
 *
 * Otherwise every choice the printer makes — semicolons, property shorthand, quote style — reads as
 * a difference in the program, when it is a difference in who typed it. Printing both sides with
 * one printer removes that whole class by construction rather than by a rule per symptom, and
 * leaves only what the four normalisations and the qualifier cover.
 */
function significantTokens(source: string): DocumentToken[] {
  const printed = transformSync(source, { loader: 'js', target: 'chrome74', minify: false }).code
  const kept: DocumentToken[] = []
  for (const raw of tokenizer(printed, { ecmaVersion: 2020 })) {
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

/**
 * The tokens of one side, or the reason it could not be read.
 *
 * A script that does not parse is a refusal with the printer's own message rather than an
 * exception out of the comparison: a generator that emitted something broken should say so where
 * the other differences are reported.
 */
function readScriptTokens(
  source: string,
  side: string
): { ok: true; tokens: DocumentToken[] } | { ok: false; reason: string } {
  try {
    return { ok: true, tokens: significantTokens(source) }
  } catch (error) {
    return {
      ok: false,
      reason: `${side} does not parse: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`
    }
  }
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
  const baselineTokens = readScriptTokens(baseline, 'the baseline')
  if (!baselineTokens.ok) {
    return { equivalent: false, reason: baselineTokens.reason }
  }
  const candidateTokens = readScriptTokens(candidate, 'the generated script')
  if (!candidateTokens.ok) {
    return { equivalent: false, reason: candidateTokens.reason }
  }
  const before = baselineTokens.tokens
  const after = candidateTokens.tokens
  let qualifiedReferences = 0
  let scopeFieldDeclarations = 0
  let rebindings = 0
  let bracedBodies = 0
  let unboundCatches = 0
  let numberProperties = 0
  let shorthandProperties = 0
  // Braces arrive in pairs around one statement, so a counter is enough: a close is only ever
  // absorbed while an inserted open is outstanding, which bounds how far this can mask a real one.
  let openInsertedBraces = 0
  let lastMatched: DocumentToken | undefined
  let left = 0
  let right = 0
  while (left < before.length && right < after.length) {
    const expected = before[left]
    const actual = after[right]
    if (expected.label === actual.label && expected.text === actual.text) {
      lastMatched = expected
      left += 1
      right += 1
      continue
    }
    // `{ name }` -> `{ name: <qualifier>.name }`: the printer writes the baseline's shorthand back
    // as one token, and qualifying the value makes the property name unavoidable again.
    if (
      actual.label === ':' &&
      lastMatched?.label === 'name' &&
      after[right + 1]?.label === 'name' &&
      after[right + 1]?.text === qualifier &&
      after[right + 2]?.label === '.' &&
      after[right + 3]?.text === lastMatched.text
    ) {
      shorthandProperties += 1
      right += 4
      continue
    }
    // `name` -> `<qualifier>.name`, three tokens for one.
    if (isQualified(after, right, expected, qualifier)) {
      qualifiedReferences += 1
      left += 1
      right += 3
      continue
    }
    // `parseInt` -> `Number.parseInt`, the same shape under a different object.
    if (NUMBER_GLOBALS.has(expected.text) && isQualified(after, right, expected, 'Number')) {
      numberProperties += 1
      left += 1
      right += 3
      continue
    }
    // `var name` -> `<qualifier>.name`: the declaration itself moved onto the scope object.
    if (
      expected.label === 'var' &&
      before[left + 1] !== undefined &&
      isQualified(after, right, before[left + 1], qualifier)
    ) {
      scopeFieldDeclarations += 1
      left += 2
      right += 3
      continue
    }
    // `var a = 1, b = 2` where both moved onto the scope: the comma introduces the second
    // declaration, which is written as its own assignment.
    if (
      expected.label === ',' &&
      before[left + 1] !== undefined &&
      isQualified(after, right, before[left + 1], qualifier)
    ) {
      scopeFieldDeclarations += 1
      left += 2
      right += 3
      continue
    }
    if (expected.label === 'var' && isBlockScopedKeyword(actual)) {
      rebindings += 1
      lastMatched = actual
      left += 1
      right += 1
      continue
    }
    // `catch (e) {` -> `catch {`: three baseline tokens the linted form does not carry.
    if (
      lastMatched?.label === 'catch' &&
      expected.label === '(' &&
      before[left + 1]?.label === 'name' &&
      before[left + 2]?.label === ')' &&
      actual.label === '{'
    ) {
      unboundCatches += 1
      left += 3
      continue
    }
    if (actual.label === '{') {
      bracedBodies += 1
      openInsertedBraces += 1
      right += 1
      continue
    }
    if (actual.label === '}' && openInsertedBraces > 0) {
      openInsertedBraces -= 1
      right += 1
      continue
    }
    return {
      equivalent: false,
      reason: `token ${left}: expected ${describeToken(expected)}, generated ${describeToken(actual)}`
    }
  }
  // A body braced at the very end of the script leaves its close after the baseline has run out.
  while (openInsertedBraces > 0 && after[right]?.label === '}') {
    openInsertedBraces -= 1
    right += 1
  }
  if (left !== before.length || right !== after.length) {
    return {
      equivalent: false,
      reason: `length: ${before.length - left} token(s) left in the baseline, ${after.length - right} in the generated script`
    }
  }
  if (openInsertedBraces !== 0) {
    return { equivalent: false, reason: `${openInsertedBraces} inserted brace(s) never closed` }
  }
  return {
    equivalent: true,
    normalisations: {
      qualifiedReferences,
      scopeFieldDeclarations,
      rebindings,
      bracedBodies,
      unboundCatches,
      numberProperties,
      shorthandProperties
    }
  }
}

/**
 * Whether a token is the `const` or `let` a `var` became.
 *
 * `let` is contextual outside strict mode, so acorn reports it as a name rather than as a keyword;
 * matching on the label alone would refuse every `let` the linter introduced.
 */
function isBlockScopedKeyword(token: DocumentToken): boolean {
  return token.label === 'const' || (token.label === 'name' && token.text === 'let')
}

/** Whether the generated stream reads `<qualifier>.<expected>` where the baseline read `expected`. */
function isQualified(
  after: DocumentToken[],
  right: number,
  expected: DocumentToken,
  qualifier: string
): boolean {
  return (
    after[right]?.label === 'name' &&
    after[right]?.text === qualifier &&
    after[right + 1]?.label === '.' &&
    after[right + 2]?.label === expected.label &&
    after[right + 2]?.text === expected.text
  )
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
