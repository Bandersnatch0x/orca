import { readdirSync, readFileSync } from 'node:fs'

const COMPOSER_FILE = './terminal-webview-html.ts'
const DOCUMENT_DIRECTORY = './document/'
/** The parts of the document that are still markup rather than program. */
const SHELL_FILES = [
  './terminal-webview-html/document-shell.ts',
  './terminal-webview-html/document-close.ts',
  './terminal-webview-html/theme.ts'
]

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

/**
 * Reads the TypeScript source the in-WebView document is built from.
 *
 * Why a directory and not a list: the document's script is generated from every module under
 * `document/`, so a new one cannot join the emitted document while staying invisible to the tests
 * that search this source.
 */
export function readTerminalWebViewHtmlSource(): string {
  const modules = readdirSync(new URL(DOCUMENT_DIRECTORY, import.meta.url))
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .sort()
    .map((name) => readSource(DOCUMENT_DIRECTORY + name))
  if (modules.length < 30) {
    throw new Error(`expected the document's modules, found ${modules.length}`)
  }
  return [readSource(COMPOSER_FILE), ...SHELL_FILES.map(readSource), ...modules].join('\n')
}
