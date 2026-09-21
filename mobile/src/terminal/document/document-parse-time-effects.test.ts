import { readdirSync, readFileSync } from 'node:fs'
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'

/**
 * Rulings 20 and 21: no module in the document does work as it is parsed, and none owns state.
 *
 * ES module bodies run once per page. Inside the WebView that was invisible — the script is
 * parsed once per document and the document is the page — but the web component mounts these same
 * modules, and a second mount re-imports nothing. An element read, a listener, or a reporter
 * install left in a module body would therefore keep the *first* mount's elements forever: that is
 * the defect round 1 measured, with zero `.xterm` nodes in the live DOM after a remount.
 *
 * So the rule is structural rather than behavioural, and it is checked structurally. Every
 * emitted module may declare; none may run. What used to run lives in that module's start
 * function, which both hosts call — the generated script once at the foot of the document, the
 * page once per mount.
 *
 * Ruling 21's half of this — no module-level `let`, because a second mount inherited a spent error
 * budget and the first terminal's momentum loop — is not checked any more, and ruling 22 is why. A
 * module's top level is emitted inside the factory, so a `let` there is one binding per call and
 * per document, which is what the scope was being used to achieve. An effect is still refused: it
 * would run at the position its module is emitted rather than in the start sequence, so no stop
 * would undo it and every call would leak another one.
 */
/**
 * Every module of the document, read from the directory.
 *
 * From the directory rather than from a list: the bundler walks imports from the entry, so there is
 * no order to pin any more, and a module that this census cannot see is a module the rule does not
 * cover. The entry itself is the one file allowed a statement at its top level — it is the call.
 */
const ENTRY = 'native-document-entry'

/** The sequence that calls the starts, which is not a module with a start of its own. */
const THE_SEQUENCE = 'create-terminal-document'

const MODULES = readdirSync(new URL('.', import.meta.url))
  .filter((name) => name.endsWith('.ts') && !name.includes('.test'))
  .map((name) => name.replace(/\.ts$/, ''))
  .filter((name) => name !== ENTRY)
  .sort()

/** Statement kinds that only declare. Anything else at the top level is work. */
const DECLARATION_KINDS = new Set([
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportDefaultDeclaration',
  'ExportAllDeclaration',
  'FunctionDeclaration',
  'ClassDeclaration',
  'VariableDeclaration',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSEnumDeclaration',
  'TSModuleDeclaration',
  'TSDeclareFunction',
  'TSImportEqualsDeclaration',
  'EmptyStatement'
])

function moduleSource(name: string): string {
  return readFileSync(new URL(`./${name}.ts`, import.meta.url), 'utf8')
}

/** A node's own properties, or nothing when it is not one. Read rather than asserted. */
function fieldsOf(node: unknown): [string, unknown][] {
  return node !== null && typeof node === 'object' && !Array.isArray(node)
    ? Object.entries(node)
    : []
}

function stringField(node: unknown, key: string): string {
  const found = fieldsOf(node).find(([name]) => name === key)?.[1]
  return typeof found === 'string' ? found : ''
}

function field(node: unknown, key: string): unknown {
  return fieldsOf(node).find(([name]) => name === key)?.[1]
}

const RUNS_NOW = new Set([
  'CallExpression',
  'NewExpression',
  'AwaitExpression',
  'TaggedTemplateExpression'
])
/** What an initialiser *is* rather than what it does: its body runs later, not now. */
const RUNS_LATER = new Set(['FunctionExpression', 'ArrowFunctionExpression', 'ClassExpression'])

function isElementGlobal(node: unknown): boolean {
  const name = stringField(node, 'name')
  return stringField(node, 'type') === 'Identifier' && (name === 'document' || name === 'window')
}

function initialiserRuns(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some(initialiserRuns)
  }
  const type = stringField(node, 'type')
  if (RUNS_NOW.has(type)) {
    return true
  }
  if (RUNS_LATER.has(type)) {
    return false
  }
  if (type === 'MemberExpression' && isElementGlobal(field(node, 'object'))) {
    return true
  }
  return fieldsOf(node).some(([key, value]) => key !== 'type' && initialiserRuns(value))
}

/** Whether anything at a module's top level reaches an element, at any depth. */
function readsTheDocument(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some(readsTheDocument)
  }
  if (isElementGlobal(node)) {
    return true
  }
  return fieldsOf(node).some(([key, value]) => key !== 'type' && readsTheDocument(value))
}

/**
 * The top-level statements that are not declarations, and the initialisers that run something.
 *
 * A declaration counts as work when its initialiser calls, constructs, awaits, or reaches into
 * `document` or `window`: `const scrollIndicator = document.getElementById(...)` is a declaration
 * by shape and a parse-time element read by effect, and it is the exact form that survived a
 * remount still holding the first mount's node. Object and regex literals are not work, which is
 * why this reads the tree rather than the text.
 */
function parseTimeEffects(name: string): string[] {
  return parseTimeEffectsIn(name, moduleSource(name))
}

function parseTimeEffectsIn(name: string, source: string): string[] {
  const { program, errors } = parseSync(`${name}.ts`, source, { lang: 'ts' })
  expect(errors).toEqual([])
  const effects: string[] = []
  for (const statement of program.body) {
    if (!DECLARATION_KINDS.has(statement.type)) {
      effects.push(`${name}: ${statement.type}`)
      continue
    }
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? (statement.declaration ?? statement) : statement
    if (declaration.type !== 'VariableDeclaration') {
      continue
    }
    for (const declarator of declaration.declarations) {
      if (declarator.init && initialiserRuns(declarator.init)) {
        effects.push(`${name}: ${source.slice(declarator.start, declarator.end)}`)
      }
    }
  }
  return effects
}

describe('the document modules at parse time', () => {
  it('do no work: every effect is in a start function the hosts call', () => {
    // Every module, with no exception left: the scope is built by a call now, and the constants the
    // modules own are declarations rather than the substituted literals a generator wrote.
    expect(MODULES.length).toBeGreaterThan(30)
    expect(MODULES.flatMap(parseTimeEffects)).toEqual([])
  })

  it('declare nothing that reaches an element', () => {
    // The stricter half, and the one the remount defect was: a declaration whose initialiser reads
    // an element is work by effect whatever its shape, so the same reader runs over every module.
    for (const name of MODULES) {
      const { program } = parseSync(`${name}.ts`, moduleSource(name), { lang: 'ts' })
      const topLevel = program.body.filter(
        (statement) =>
          statement.type === 'VariableDeclaration' ||
          (statement.type === 'ExportNamedDeclaration' &&
            statement.declaration?.type === 'VariableDeclaration')
      )
      expect({ name, reaches: topLevel.some(readsTheDocument) }).toEqual({ name, reaches: false })
    }
  })

  it('would report a planted element read, which the statement filter cannot see', () => {
    // The second reader has its own precondition. A `const` initialised from the document is a
    // declaration by shape and a parse-time element read by effect — the exact form that survived
    // a remount holding the first mount's node — and the statement-kind filter waves it through.
    const planted =
      "import { scope } from './document-scope'\n" +
      "const indicator = document.getElementById('scroll-indicator')\n" +
      'export function n() {\n  return indicator ?? scope.term\n}\n'
    expect(parseTimeEffectsIn('planted', planted)).toEqual([
      "planted: indicator = document.getElementById('scroll-indicator')"
    ])
    // And the element reader the case above spends on every module: the same plant, seen by it.
    const { program } = parseSync('planted.ts', planted, { lang: 'ts' })
    expect(program.body.some(readsTheDocument)).toBe(true)
    // And the other direction, because a reader that flagged every initialiser would agree with
    // the empty list above only by refusing everything: a plain literal is not work.
    const inert =
      "import { scope } from './document-scope'\n" +
      'const options = { capture: true, passive: false }\n' +
      'export function n() {\n  return options.capture && scope.term !== null\n}\n'
    expect(parseTimeEffectsIn('inert', inert)).toEqual([])
  })

  it('would report one, so the empty list above is a measurement', () => {
    // The precondition. A walk that matched nothing would agree with an empty expectation just as
    // happily, so the same reader is aimed at a module that does have a top-level effect: this
    // test file itself, whose `describe` call is exactly the shape the rule refuses.
    const source = readFileSync(
      new URL('./document-parse-time-effects.test.ts', import.meta.url),
      'utf8'
    )
    const { program } = parseSync('probe.ts', source, { lang: 'ts' })
    const running = program.body.filter((statement) => !DECLARATION_KINDS.has(statement.type))
    expect(running.length).toBeGreaterThan(0)
  })

  it('still start and stop: the functions holding what was moved out are exported', () => {
    // The other half. Moving an effect out is only correct if something calls it, and the caller is
    // `create-terminal-document`, which names every one of them. What this holds is the shape: a
    // start takes the scope and nothing else, so the sequence can call them uniformly.
    const declaring = (keyword: string) =>
      MODULES.filter((name) => name !== THE_SEQUENCE).filter((name) =>
        new RegExp(
          `^export function ${keyword}[A-Za-z]+\\(scope: TerminalDocumentScope\\) \\{$`,
          'm'
        ).test(moduleSource(name))
      )
    expect(declaring('start').length).toBe(10)
    // Ruling 21: a module that schedules a frame, a timer or a retry owes an undo for it.
    expect(declaring('stop').length).toBe(10)
  })
})
