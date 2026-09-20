import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as esbuild from 'esbuild'
import { importTypeScriptModule } from './import-typescript-module.mjs'

/**
 * Turns one module of the in-WebView terminal document back into the script text the document
 * carries.
 *
 * The document is a string the native WebView loads, so its parts cannot be imported by anything;
 * the web page needs exactly those parts and must not re-implement them. So the parts are modules,
 * and this is the other direction: the modules' declarations, with their imports removed and their
 * exports unmarked, spliced into the one function scope the document has always been.
 *
 * Imports are dropped rather than resolved because inside the document every name is already in
 * scope — that is what the single IIFE means. `document-externals.ts` declares the names that have
 * not moved into modules yet, and it emits nothing at all.
 *
 * `esbuild` does the TypeScript, as it already does for the xterm engine beside this file. It is a
 * transform and not a bundle: a bundler would order the output by its dependency graph, and the
 * document's order is part of what the equivalence test holds fixed.
 */
const INDENT = '  '

const constantsPath = path.join(
  import.meta.dirname,
  '..',
  'src',
  'terminal',
  'document',
  'document-constants.ts'
)

let substitutions = null

/**
 * `document-constants.ts` as esbuild `define` entries.
 *
 * Substitution happens after the import lines are dropped, when the names are free again; while the
 * import is still there esbuild sees a bound name and leaves it alone, which is the correct thing
 * for the page and the wrong thing for the document.
 */
async function documentConstantSubstitutions() {
  if (substitutions === null) {
    const module = await importTypeScriptModule(constantsPath)
    substitutions = Object.fromEntries(
      Object.entries(module).map(([name, value]) => [name, JSON.stringify(value)])
    )
  }
  return substitutions
}

/** Whether a line opens an import the document does not need. */
function isImportLine(line) {
  return /^import[\s{'"]/.test(line)
}

/** Whether a statement that started on this line also ended on it. */
function closesOnSameLine(line, closer) {
  return line.includes(closer)
}

/**
 * The emitted text of one module: transpiled, unexported, un-imported and indented into the IIFE.
 *
 * Multi-line imports are handled by dropping through to the line that closes them, which esbuild's
 * output makes safe: it prints one import per line.
 */
export async function emitTerminalDocumentModule(modulePath) {
  const source = await readFile(modulePath, 'utf8')
  const { code } = await esbuild.transform(source, {
    loader: 'ts',
    format: 'esm',
    target: 'chrome74',
    // The document is read by people as well as by a WebView, and the equivalence test compares
    // tokens, so keeping the printer's own layout costs nothing and keeps the diff legible.
    minify: false
  })
  const kept = []
  // esbuild wraps a long import or export list across lines, so both are skipped to their closer
  // rather than by their first line. An export list dropped by its keyword alone would leave a
  // bare block statement in the document, and an import list would leave its names loose.
  let skipUntil = null
  for (const line of code.split('\n')) {
    if (skipUntil !== null) {
      if (closesOnSameLine(line, skipUntil)) {
        skipUntil = null
      }
      continue
    }
    if (isImportLine(line)) {
      skipUntil = closesOnSameLine(line, ' from ') || closesOnSameLine(line, ';') ? null : ' from '
      continue
    }
    if (line.startsWith('export {')) {
      skipUntil = closesOnSameLine(line, '}') ? null : '}'
      continue
    }
    kept.push(line.startsWith('export ') ? line.slice('export '.length) : line)
  }
  const define = await documentConstantSubstitutions()
  const substituted = await esbuild.transform(kept.join('\n'), {
    loader: 'js',
    format: 'esm',
    target: 'chrome74',
    minify: false,
    define
  })
  const body = substituted.code.trim()
  return body
    .split('\n')
    .map((line) => (line.length === 0 ? line : `${INDENT}${line}`))
    .join('\n')
}
